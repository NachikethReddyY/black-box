#!/usr/bin/env python3
"""Black Box CLI for trusted, exact-revision workflow runs.

The CLI keeps credentials outside the repository. Set BLACKBOX_URL and
BLACKBOX_OPERATOR_TOKEN in the shell or a protected operator environment.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Any


class CliError(RuntimeError):
    pass


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="bb", description="Run and inspect Black Box CI requests")
    root.add_argument("--json", action="store_true", help="emit machine-readable output")
    sub = root.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="queue one trusted workflow revision")
    run.add_argument("--repo", required=True, help="OWNER/REPOSITORY")
    run.add_argument("--workflow", default="black-box-ci.yml")
    run.add_argument("--ref", default="main")
    run.add_argument("--workflow-ref", default="main", help="branch containing the workflow definition")
    run.add_argument("--commit", help="40-character commit SHA; defaults to local git HEAD")
    run.add_argument("--source-ref", help="ref recorded for the run; defaults to --ref")
    run.add_argument("--idempotency-key", help="stable key used to avoid duplicate requests")
    run.add_argument("--no-wait", action="store_true", help="return after the request is accepted")
    run.add_argument("--interval", type=float, default=5.0, help="poll interval in seconds")
    run.add_argument("--timeout", type=float, default=900.0, help="maximum wait in seconds")

    for name in ("status", "watch", "rerun"):
        command = sub.add_parser(name, help=f"{name} a request")
        command.add_argument("request_id")
        command.add_argument("--json", action="store_true", help="emit machine-readable output")
    run.add_argument("--json", action="store_true", help="emit machine-readable output")
    return root


def output(value: Any, machine: bool) -> None:
    if machine:
        print(json.dumps(value, sort_keys=True, separators=(",", ":")))
    elif isinstance(value, dict):
        for key, item in value.items():
            if item is not None:
                print(f"{key}: {item}")
    else:
        print(value)


def commit_from_git() -> str:
    try:
        value = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise CliError("--commit is required outside a Git checkout") from exc
    if len(value) != 40:
        raise CliError("git HEAD is not a full commit SHA")
    return value


def request(url: str, token: str, method: str = "GET", body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise CliError(f"Black Box HTTP {exc.code}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise CliError(f"Black Box request failed: {exc}") from exc
    if not isinstance(payload, dict):
        raise CliError("Black Box returned an invalid response")
    return payload


def require_config() -> tuple[str, str]:
    base = os.environ.get("BLACKBOX_URL", "").rstrip("/")
    token = os.environ.get("BLACKBOX_OPERATOR_TOKEN", "")
    if not base or not base.startswith("https://"):
        raise CliError("BLACKBOX_URL must be an https URL")
    if not token or "\n" in token or "\r" in token:
        raise CliError("BLACKBOX_OPERATOR_TOKEN is required in the protected environment")
    return base, token


def request_id_from(payload: dict[str, Any]) -> str:
    value = payload.get("request_id")
    if not isinstance(value, str) or len(value) != 36:
        raise CliError("Black Box did not return a request id")
    return value


def final_exit(row: dict[str, Any]) -> int:
    request_row = row.get("request") if isinstance(row.get("request"), dict) else row
    state = request_row.get("state")
    conclusion = request_row.get("conclusion")
    if state != "completed":
        return 2
    return 0 if conclusion == "success" else 1


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    machine = bool(args.json)
    try:
        base, token = require_config()
        if args.command == "run":
            commit = args.commit or commit_from_git()
            if len(commit) != 40 or any(character not in "0123456789abcdefABCDEF" for character in commit):
                raise CliError("--commit must be a 40-character hexadecimal SHA")
            body: dict[str, Any] = {
                "repository": args.repo,
                "workflow_file": args.workflow,
                "workflow_ref": args.workflow_ref,
                "source_ref": args.source_ref or args.ref,
                "commit_sha": commit,
            }
            if args.idempotency_key:
                body["idempotency_key"] = args.idempotency_key
            accepted = request(f"{base}/requests", token, "POST", body)
            request_id = request_id_from(accepted)
            if args.no_wait:
                output({**accepted, "request_id": request_id}, machine)
                return 0
            deadline = time.monotonic() + max(0.0, args.timeout)
            while True:
                row = request(f"{base}/requests/{request_id}", token)
                output(row if machine else {"request_id": request_id, **(row.get("request") or {})}, machine)
                request_row = row.get("request") if isinstance(row.get("request"), dict) else {}
                if request_row.get("state") in {"completed", "superseded"}:
                    return final_exit(row)
                if time.monotonic() >= deadline:
                    raise CliError(f"timed out waiting for request {request_id}")
                time.sleep(max(0.25, args.interval))

        if args.command == "status":
            output(request(f"{base}/requests/{args.request_id}", token), machine)
            return 0
        if args.command == "watch":
            deadline = time.monotonic() + 900
            while True:
                row = request(f"{base}/requests/{args.request_id}", token)
                output(row, machine)
                request_row = row.get("request") if isinstance(row.get("request"), dict) else {}
                if request_row.get("state") in {"completed", "superseded"}:
                    return final_exit(row)
                if time.monotonic() >= deadline:
                    raise CliError(f"timed out waiting for request {args.request_id}")
                time.sleep(5)
        if args.command == "rerun":
            payload = request(f"{base}/requests/{args.request_id}/retry", token, "POST", {})
            output(payload, machine)
            return 0
        raise CliError(f"unsupported command: {args.command}")
    except CliError as exc:
        if machine:
            print(json.dumps({"error": str(exc)}), file=sys.stderr)
        else:
            print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
