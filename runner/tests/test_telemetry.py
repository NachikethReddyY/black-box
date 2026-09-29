import importlib.util
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).parents[1] / "scripts" / "telemetry.py"
SPEC = importlib.util.spec_from_file_location("blackbox_telemetry", SCRIPT)
assert SPEC and SPEC.loader
telemetry = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(telemetry)


class TelemetryTests(unittest.TestCase):
    def test_docker_missing_or_timed_out_is_false(self):
        with mock.patch.object(telemetry.subprocess, "run", side_effect=FileNotFoundError):
            self.assertFalse(telemetry.docker_ready())
        with mock.patch.object(telemetry.subprocess, "run", side_effect=telemetry.subprocess.TimeoutExpired(["docker"], 4)):
            self.assertFalse(telemetry.docker_ready())

    def test_protected_env_file_parses_without_shell_expansion(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "telemetry.env"
            path.write_text(
                'BLACKBOX_URL="https://example.test"\n'
                'BLACKBOX_STATE_ROOT="$HOME/.local/share/black-box-runner"\n'
                'BLACKBOX_HOST_AGENT_TOKEN=token\n'
                'IGNORED=$(cat /etc/passwd)\n'
            )
            path.chmod(stat.S_IRUSR | stat.S_IWUSR)
            loaded = telemetry.load_env_file(path)
            self.assertEqual(loaded["BLACKBOX_URL"], "https://example.test")
            self.assertEqual(loaded["BLACKBOX_STATE_ROOT"], str(Path.home() / ".local/share/black-box-runner"))
            self.assertNotIn("IGNORED", loaded)

    def test_unprotected_env_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "telemetry.env"
            path.write_text("BLACKBOX_URL=https://example.test\n")
            path.chmod(0o644)
            self.assertEqual(telemetry.load_env_file(path), {})

    def test_version_payload_does_not_include_environment(self):
        payload = telemetry.build_payload(
            endpoint="https://example.test",
            token="secret",
            cpu_percent=1.0,
            memory_used=2,
            memory_total=3,
            disk_free=4,
            disk_total=5,
            docker=False,
            environment={"SECRET_TOKEN": "secret", "NODE_VERSION": "v24"},
        )
        self.assertNotIn("SECRET_TOKEN", payload)
        self.assertNotIn("environment", payload)
        self.assertNotIn("secret", str(payload))


if __name__ == "__main__":
    unittest.main()
