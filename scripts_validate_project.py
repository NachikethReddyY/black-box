#!/usr/bin/env python3
"""Small offline preflight for the Black Box source tree."""
from pathlib import Path

ROOT = Path(__file__).parent
required = [
    ROOT / "README.md",
    ROOT / "FORGE_PROJECT_BRIEF.md",
    ROOT / "FORGE_PROJECT_BRIEF.html",
    ROOT / "worker",
    ROOT / "runner",
    ROOT / "templates",
]
missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
if missing:
    raise SystemExit("Missing: " + ", ".join(missing))

for name in ("worker", "runner", "templates"):
    if not any((ROOT / name).iterdir()):
        raise SystemExit(f"Empty implementation directory: {name}")

print("Black Box project preflight passed")
