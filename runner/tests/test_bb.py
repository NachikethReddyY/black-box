import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).parents[1] / "scripts" / "bb.py"
SPEC = importlib.util.spec_from_file_location("blackbox_bb", SCRIPT)
assert SPEC and SPEC.loader
bb = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bb)


class CliTests(unittest.TestCase):
    def test_requires_protected_configuration(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(bb.CliError, "BLACKBOX_URL"):
                bb.require_config()

    def test_commit_can_be_read_from_git(self):
        with tempfile.TemporaryDirectory() as folder:
            with mock.patch("subprocess.check_output", return_value="a" * 40 + "\n") as check:
                self.assertEqual(bb.commit_from_git(), "a" * 40)
                check.assert_called_once()

    def test_final_exit_only_success_is_zero(self):
        self.assertEqual(bb.final_exit({"request": {"state": "completed", "conclusion": "success"}}), 0)
        self.assertEqual(bb.final_exit({"request": {"state": "completed", "conclusion": "failure"}}), 1)
        self.assertEqual(bb.final_exit({"request": {"state": "pending"}}), 2)


if __name__ == "__main__":
    unittest.main()
