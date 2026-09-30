#!/usr/bin/env python3
"""Small, local-first CI history store for logs, tests, timings, and cache events."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

DEFAULT_DB = Path.home() / ".local/share/black-box-runner/history.sqlite3"
MAX_LOG_BYTES = 2 * 1024 * 1024
MAX_MANIFEST_BYTES = 32 * 1024
RUN_OUTCOMES = ("queued", "running", "passed", "failed", "cancelled", "skipped", "unknown")
SECRET_PATTERNS = (
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"(?i)(authorization\s*:\s*bearer\s+)[^\s]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(password|secret|token)\s*[=:]\s*([^\s,]+)"), r"\1=[REDACTED]"),
)


def redact(text: str) -> str:
    for pattern, replacement in SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    return db


def init(db: sqlite3.Connection) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS runs (
          run_id TEXT PRIMARY KEY,
          repository TEXT NOT NULL,
          workflow TEXT NOT NULL,
          job TEXT NOT NULL,
          commit_sha TEXT,
          outcome TEXT NOT NULL,
          duration_ms INTEGER,
          runner TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
          repository TEXT NOT NULL,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(message, repository, run_id, content='logs', content_rowid='id', tokenize='trigram');
        CREATE TABLE IF NOT EXISTS test_results (
          id INTEGER PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
          repository TEXT NOT NULL,
          test_id TEXT NOT NULL,
          file TEXT,
          name TEXT NOT NULL,
          outcome TEXT NOT NULL,
          duration_ms INTEGER,
          attempt INTEGER NOT NULL DEFAULT 1,
          failure_signature TEXT
        );
        CREATE TABLE IF NOT EXISTS cache_events (
          id INTEGER PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          cache_key TEXT NOT NULL,
          outcome TEXT NOT NULL,
          reason TEXT NOT NULL,
          bytes INTEGER,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS execution_manifests (
          run_id TEXT PRIMARY KEY REFERENCES runs(run_id) ON DELETE CASCADE,
          repository TEXT NOT NULL,
          workflow TEXT NOT NULL,
          job TEXT NOT NULL,
          manifest_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS history_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TRIGGER IF NOT EXISTS logs_ai AFTER INSERT ON logs BEGIN
          INSERT INTO logs_fts(rowid, message, repository, run_id)
          VALUES (new.id, new.message, new.repository, new.run_id);
        END;
        CREATE TRIGGER IF NOT EXISTS logs_ad AFTER DELETE ON logs BEGIN
          INSERT INTO logs_fts(logs_fts, rowid, message, repository, run_id)
          VALUES ('delete', old.id, old.message, old.repository, old.run_id);
        END;
        CREATE TRIGGER IF NOT EXISTS logs_au AFTER UPDATE ON logs BEGIN
          INSERT INTO logs_fts(logs_fts, rowid, message, repository, run_id)
          VALUES ('delete', old.id, old.message, old.repository, old.run_id);
          INSERT INTO logs_fts(rowid, message, repository, run_id)
          VALUES (new.id, new.message, new.repository, new.run_id);
        END;
        """
    )
    marker = db.execute("SELECT value FROM history_meta WHERE key='logs_fts_schema'").fetchone()
    if not marker or marker[0] != "1":
        db.execute("INSERT INTO logs_fts(logs_fts) VALUES('rebuild')")
        db.execute("INSERT OR REPLACE INTO history_meta(key, value) VALUES('logs_fts_schema', '1')")
    db.commit()


def require_run(db: sqlite3.Connection, run_id: str, repository: str = "local") -> None:
    db.execute("INSERT OR IGNORE INTO runs(run_id,repository,workflow,job,outcome,created_at) VALUES(?,?,?,?,?,?)", (run_id, repository, "unknown", "unknown", "unknown", int(time.time() * 1000)))


def record_run(
    db: sqlite3.Connection,
    run_id: str,
    repository: str,
    workflow: str,
    job: str,
    commit_sha: str | None,
    outcome: str,
    duration_ms: int | None,
    runner: str | None,
) -> None:
    if not run_id or len(run_id) > 200 or "\n" in run_id or "\r" in run_id:
        raise ValueError("run_id must be a bounded single-line value")
    if outcome not in RUN_OUTCOMES:
        raise ValueError(f"outcome must be one of {RUN_OUTCOMES}")
    if commit_sha is not None and not re.fullmatch(r"[0-9a-fA-F]{40}", commit_sha):
        raise ValueError("commit_sha must be a 40-character SHA-1 hex value")
    if duration_ms is not None and (duration_ms < 0 or duration_ms > 31 * 24 * 60 * 60 * 1000):
        raise ValueError("duration_ms is outside the bounded range")
    for value, field, limit in ((repository, "repository", 200), (workflow, "workflow", 200), (job, "job", 200)):
        _manifest_text(value, field, limit)
    if runner:
        _manifest_text(runner, "runner", 200)
    now = int(time.time() * 1000)
    existing = db.execute("SELECT 1 FROM runs WHERE run_id=?", (run_id,)).fetchone()
    if existing:
        db.execute(
            "UPDATE runs SET repository=?,workflow=?,job=?,commit_sha=?,outcome=?,duration_ms=?,runner=? WHERE run_id=?",
            (repository, workflow, job, commit_sha.lower() if commit_sha else None, outcome, duration_ms, runner, run_id),
        )
    else:
        db.execute(
            "INSERT INTO runs(run_id,repository,workflow,job,commit_sha,outcome,duration_ms,runner,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (run_id, repository, workflow, job, commit_sha.lower() if commit_sha else None, outcome, duration_ms, runner, now),
        )
    db.commit()


def parse_level(line: str) -> tuple[str, str]:
    match = re.match(r"^(?:\[)?(INFO|WARN|ERROR|DEBUG)(?:\])?(?:\s*[:|-]\s*|\s+)(.*)$", line, re.I)
    if match:
        return match.group(1).upper(), redact(match.group(2))
    if re.match(r"^warning\b", line, re.I):
        return "WARN", redact(line)
    if re.search(r"\b(error|failed|failure|exception|traceback)\b", line, re.I):
        return "ERROR", redact(line)
    return "INFO", redact(line)


def ingest_log(db: sqlite3.Connection, run_id: str, repository: str, source: Path) -> int:
    raw = source.read_bytes()
    if len(raw) > MAX_LOG_BYTES:
        raw = raw[:MAX_LOG_BYTES]
    require_run(db, run_id, repository)
    rows = []
    now = int(time.time() * 1000)
    for line in raw.decode("utf-8", errors="replace").splitlines():
        level, message = parse_level(line)
        rows.append((run_id, repository, level, message, now))
    db.executemany("INSERT INTO logs(run_id,repository,level,message,created_at) VALUES(?,?,?,?,?)", rows)
    db.commit()
    return len(rows)


def failure_signature(text: str | None) -> str | None:
    if not text:
        return None
    normalized = re.sub(r"\b[0-9a-f]{7,40}\b", "<sha>", text, flags=re.I)
    normalized = re.sub(r"\b\d+\b", "<n>", normalized)
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def ingest_junit(db: sqlite3.Connection, run_id: str, repository: str, source: Path, attempt: int) -> int:
    require_run(db, run_id, repository)
    root = ET.parse(source).getroot()
    rows = []
    for case in root.iter("testcase"):
        classname = case.attrib.get("classname", "")
        name = case.attrib.get("name", "unnamed")
        file_name = case.attrib.get("file")
        test_id = ":".join(part for part in (file_name, classname, name) if part) or name
        failure = case.find("failure")
        error = case.find("error")
        skipped = case.find("skipped")
        outcome = "failed" if failure is not None or error is not None else "skipped" if skipped is not None else "passed"
        evidence = (failure.text if failure is not None else error.text if error is not None else None) or ""
        duration = case.attrib.get("time")
        duration_ms = round(float(duration) * 1000) if duration else None
        rows.append((run_id, repository, test_id, file_name, name, outcome, duration_ms, attempt, failure_signature(redact(evidence))))
    db.executemany("INSERT INTO test_results(run_id,repository,test_id,file,name,outcome,duration_ms,attempt,failure_signature) VALUES(?,?,?,?,?,?,?,?,?)", rows)
    db.commit()
    return len(rows)


def record_cache(db: sqlite3.Connection, run_id: str, kind: str, cache_key: str, outcome: str, reason: str, bytes_used: int | None) -> None:
    require_run(db, run_id)
    db.execute("INSERT INTO cache_events(run_id,kind,cache_key,outcome,reason,bytes,created_at) VALUES(?,?,?,?,?,?,?)", (run_id, kind, cache_key, outcome, reason, bytes_used, int(time.time() * 1000)))
    db.commit()


def _manifest_text(value: str, field: str, limit: int = 512) -> str:
    if not isinstance(value, str) or not value or len(value) > limit or "\n" in value or "\r" in value:
        raise ValueError(f"{field} must be a bounded single-line value")
    if re.search(r"(?i)(authorization|bearer|password|secret|token|api[_-]?key)\s*[:=]", value):
        raise ValueError(f"{field} contains a secret-like assignment")
    return redact(value)


def _manifest_hash(value: str, field: str) -> str:
    if not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        raise ValueError(f"{field} must be a SHA-256 hex digest")
    return value.lower()


def record_manifest(
    db: sqlite3.Connection,
    *,
    run_id: str,
    repository: str,
    workflow: str,
    job: str,
    commit_sha: str,
    command: str,
    workdir: str,
    environment_fingerprint: str,
    lockfile_hash: str,
    services: tuple[str, ...],
    test_selection: str,
) -> None:
    """Store a bounded replay description, never a runner environment or secret."""

    if not re.fullmatch(r"[0-9a-fA-F]{40}", commit_sha):
        raise ValueError("commit_sha must be a 40-character SHA-1 hex value")
    if len(services) > 32 or any(not isinstance(service, str) or not service or len(service) > 256 or "\n" in service or "\r" in service for service in services):
        raise ValueError("services must be a bounded list of single-line image references")
    payload = {
        "repository": _manifest_text(repository, "repository", 200),
        "workflow": _manifest_text(workflow, "workflow", 200),
        "job": _manifest_text(job, "job", 200),
        "commit_sha": commit_sha.lower(),
        "command": _manifest_text(command, "command", 2000),
        "workdir": _manifest_text(workdir, "workdir", 512),
        "environment_fingerprint": _manifest_hash(environment_fingerprint, "environment_fingerprint"),
        "lockfile_hash": _manifest_hash(lockfile_hash, "lockfile_hash"),
        "services": [redact(service) for service in services],
        "test_selection": "" if not test_selection else _manifest_text(test_selection, "test_selection", 1000),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_MANIFEST_BYTES:
        raise ValueError("manifest exceeds the bounded size")
    require_run(db, run_id, repository)
    db.execute(
        "INSERT OR REPLACE INTO execution_manifests(run_id,repository,workflow,job,manifest_json,created_at) VALUES(?,?,?,?,?,?)",
        (run_id, repository, workflow, job, encoded, int(time.time() * 1000)),
    )
    db.commit()


def search(db: sqlite3.Connection, query: str, limit: int) -> list[dict[str, object]]:
    cleaned = query.strip()[:200]
    if not cleaned:
        return []
    terms = re.findall(r"[A-Za-z0-9_]{3,}", cleaned)
    fts_query = " AND ".join(f'"{term.replace(chr(34), chr(34) * 2)}"' for term in terms)
    rows: list[sqlite3.Row] = []
    if fts_query:
        try:
            rows = db.execute("SELECT logs.run_id, logs.repository, logs.level, logs.message, logs.created_at FROM logs_fts JOIN logs ON logs.id=logs_fts.rowid WHERE logs_fts MATCH ? ORDER BY logs.created_at DESC LIMIT ?", (fts_query, limit)).fetchall()
        except sqlite3.OperationalError:
            rows = []
    if not rows:
        needle = f"%{cleaned}%"
        rows = db.execute("SELECT run_id, repository, level, message, created_at FROM logs WHERE message LIKE ? OR repository LIKE ? OR run_id LIKE ? ORDER BY created_at DESC LIMIT ?", (needle, needle, needle, limit)).fetchall()
    return [dict(row) for row in rows]


def prune(db: sqlite3.Connection, max_log_rows: int, max_test_rows: int, max_cache_rows: int) -> dict[str, int]:
    deleted = {"logs": 0, "test_results": 0, "cache_events": 0}
    for table, limit in (("logs", max_log_rows), ("test_results", max_test_rows), ("cache_events", max_cache_rows)):
        if limit < 1:
            raise ValueError("retention limits must be positive")
        count = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        excess = max(0, count - limit)
        if excess:
            db.execute(f"DELETE FROM {table} WHERE id IN (SELECT id FROM {table} ORDER BY id ASC LIMIT ?)", (excess,))
            deleted[table] = excess
    db.commit()
    return deleted


def doctor(db: sqlite3.Connection) -> dict[str, object]:
    init(db)
    integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
    fts = db.execute("SELECT COUNT(*) FROM logs_fts").fetchone()[0]
    return {"integrity": integrity, "fts_rows": fts, "db": str(db.execute("PRAGMA database_list").fetchone()[2])}


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("--db", type=Path, default=DEFAULT_DB)
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("init")
    run = commands.add_parser("record-run"); run.add_argument("--run-id", required=True); run.add_argument("--repo", required=True); run.add_argument("--workflow", required=True); run.add_argument("--job", required=True); run.add_argument("--commit"); run.add_argument("--outcome", choices=RUN_OUTCOMES, required=True); run.add_argument("--duration-ms", type=int); run.add_argument("--runner")
    log = commands.add_parser("ingest-log"); log.add_argument("--run-id", required=True); log.add_argument("--repo", required=True); log.add_argument("file", type=Path)
    junit = commands.add_parser("ingest-junit"); junit.add_argument("--run-id", required=True); junit.add_argument("--repo", required=True); junit.add_argument("--attempt", type=int, default=1); junit.add_argument("file", type=Path)
    cache = commands.add_parser("cache"); cache.add_argument("--run-id", required=True); cache.add_argument("--kind", required=True); cache.add_argument("--key", required=True); cache.add_argument("--outcome", choices=("reused", "rebuilt", "downloaded", "evicted", "unknown"), required=True); cache.add_argument("--reason", required=True); cache.add_argument("--bytes", type=int)
    manifest = commands.add_parser("manifest"); manifest.add_argument("--run-id", required=True); manifest.add_argument("--repo", required=True); manifest.add_argument("--workflow", required=True); manifest.add_argument("--job", required=True); manifest.add_argument("--command", dest="replay_command", required=True); manifest.add_argument("--commit", required=True); manifest.add_argument("--workdir", required=True); manifest.add_argument("--environment-fingerprint", required=True); manifest.add_argument("--lockfile-hash", required=True); manifest.add_argument("--service", action="append", default=[]); manifest.add_argument("--test-selection", default="")
    find = commands.add_parser("search"); find.add_argument("query"); find.add_argument("--limit", type=int, default=50)
    prune_command = commands.add_parser("prune"); prune_command.add_argument("--max-log-rows", type=int, default=50000); prune_command.add_argument("--max-test-rows", type=int, default=50000); prune_command.add_argument("--max-cache-rows", type=int, default=50000)
    commands.add_parser("doctor")
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    db = connect(args.db)
    init(db)
    if args.command == "init":
        print(json.dumps({"status": "initialized", "db": str(args.db)}))
    elif args.command == "record-run":
        record_run(db, args.run_id, args.repo, args.workflow, args.job, args.commit, args.outcome, args.duration_ms, args.runner)
        print(json.dumps({"status": "recorded", "run_id": args.run_id}))
    elif args.command == "ingest-log":
        print(json.dumps({"ingested_lines": ingest_log(db, args.run_id, args.repo, args.file)}))
    elif args.command == "ingest-junit":
        print(json.dumps({"ingested_tests": ingest_junit(db, args.run_id, args.repo, args.file, args.attempt)}))
    elif args.command == "cache":
        record_cache(db, args.run_id, args.kind, args.key, args.outcome, args.reason, args.bytes); print(json.dumps({"status": "recorded"}))
    elif args.command == "manifest":
        record_manifest(db, run_id=args.run_id, repository=args.repo, workflow=args.workflow, job=args.job, commit_sha=args.commit, command=args.replay_command, workdir=args.workdir, environment_fingerprint=args.environment_fingerprint, lockfile_hash=args.lockfile_hash, services=tuple(args.service), test_selection=args.test_selection)
        print(json.dumps({"status": "recorded", "run_id": args.run_id}))
    elif args.command == "search":
        print(json.dumps(search(db, args.query, max(1, min(args.limit, 500)))))
    elif args.command == "prune":
        print(json.dumps({"deleted": prune(db, args.max_log_rows, args.max_test_rows, args.max_cache_rows)}))
    elif args.command == "doctor":
        print(json.dumps(doctor(db)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
