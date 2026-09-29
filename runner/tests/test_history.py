import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "history.py"
SPEC = importlib.util.spec_from_file_location("blackbox_history", SCRIPT)
assert SPEC and SPEC.loader
history = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(history)


class HistoryTests(unittest.TestCase):
    def test_logs_are_redacted_and_searchable(self):
        with tempfile.TemporaryDirectory() as folder:
            db = history.connect(Path(folder) / "history.sqlite3")
            history.init(db)
            log = Path(folder) / "job.log"
            log.write_text("INFO started\nAuthorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz\nERROR Connection refused\n")
            self.assertEqual(history.ingest_log(db, "run-1", "acme/app", log), 3)
            result = history.search(db, "Connection", 10)
            self.assertEqual(result[0]["run_id"], "run-1")
            self.assertEqual(history.search(db, "acme/app", 10)[0]["repository"], "acme/app")
            self.assertEqual(history.search(db, "run-1", 10)[0]["run_id"], "run-1")
            redacted = db.execute("SELECT message FROM logs WHERE message LIKE '%REDACTED%'").fetchone()[0]
            self.assertIn("REDACTED", redacted)

            db.execute("DELETE FROM logs WHERE run_id='run-1'")
            db.commit()
            self.assertEqual(history.search(db, "Connection", 10), [])

    def test_junit_keeps_attempts_and_failure_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            db = history.connect(Path(folder) / "history.sqlite3")
            history.init(db)
            junit = Path(folder) / "results.xml"
            junit.write_text('<testsuite><testcase classname="auth" name="refresh" file="auth.test.ts" time="0.25"><failure>Expected 200, got 500</failure></testcase></testsuite>')
            self.assertEqual(history.ingest_junit(db, "run-2", "acme/app", junit, 2), 1)
            row = db.execute("SELECT test_id,outcome,duration_ms,attempt,failure_signature FROM test_results").fetchone()
            self.assertEqual(tuple(row)[0:4], ("auth.test.ts:auth:refresh", "failed", 250, 2))
            self.assertTrue(row[4])

    def test_cache_evidence_and_retention_are_explicit(self):
        with tempfile.TemporaryDirectory() as folder:
            db = history.connect(Path(folder) / "history.sqlite3")
            history.init(db)
            history.record_cache(db, "run-3", "docker", "amr-api", "reused", "unchanged Dockerfile", 123)
            self.assertEqual(tuple(db.execute("SELECT outcome,reason,bytes FROM cache_events").fetchone()), ("reused", "unchanged Dockerfile", 123))
            log = Path(folder) / "job.log"
            log.write_text("ERROR first\nERROR second\n")
            history.ingest_log(db, "run-3", "acme/app", log)
            self.assertEqual(history.prune(db, max_log_rows=1, max_test_rows=10, max_cache_rows=10)["logs"], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM logs").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM logs_fts").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
