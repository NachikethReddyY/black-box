#!/usr/bin/env python3
"""Post bounded, non-secret WSL host telemetry to Black Box."""

import json
import os
import re
import socket
import stat
import subprocess
import time
import urllib.request
from pathlib import Path


SAFE_ENVIRONMENT_KEYS = {
    "NODE_VERSION",
    "PNPM_VERSION",
    "NPM_VERSION",
    "YARN_VERSION",
    "BUN_VERSION",
    "DOCKER_VERSION",
    "RUNNER_VERSION",
}
KNOWN_ENV_KEYS = {
    "BLACKBOX_URL",
    "BLACKBOX_HOST_AGENT_TOKEN",
    "BLACKBOX_HOST_ID",
    "BLACKBOX_RUNNER_NAME",
    "BLACKBOX_STATE_ROOT",
}


def cpu_sample():
    values = Path("/proc/stat").read_text().splitlines()[0].split()[1:]
    fields = [int(value) for value in values]
    return sum(fields), fields[3] + fields[4]


def memory_bytes():
    values = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        name, value = line.split(":", 1)
        values[name] = int(value.strip().split()[0]) * 1024
    total = values["MemTotal"]
    available = values.get("MemAvailable", values.get("MemFree", 0))
    return total - available, total


def load_env_file(path: Path) -> dict[str, str]:
    """Read only the protected Black Box env keys without invoking a shell."""

    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            return {}
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        return {}

    loaded: dict[str, str] = {}
    for line in lines:
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=(.*)", line.strip())
        if not match or match.group(1) not in KNOWN_ENV_KEYS:
            continue
        key, value = match.groups()
        if value.startswith('"') and value.endswith('"') and len(value) >= 2:
            value = value[1:-1]
        elif value.startswith("'") and value.endswith("'") and len(value) >= 2:
            value = value[1:-1]
        # Only expand the one safe local path variable. Never evaluate shell syntax.
        value = value.replace("${HOME}", str(Path.home())).replace("$HOME", str(Path.home()))
        if "$(`" in value or "$((" in value or "$(" in value or "`" in value:
            continue
        loaded[key] = value
    return loaded


def docker_ready() -> bool:
    try:
        result = subprocess.run(
            ["docker", "info", "--format", "{{.ServerVersion}}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=8,
            check=False,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def _safe_environment(environment: dict[str, str] | None) -> dict[str, str]:
    if not environment:
        return {}
    safe: dict[str, str] = {}
    for key, value in environment.items():
        if key in SAFE_ENVIRONMENT_KEYS and isinstance(value, str) and len(value) <= 128:
            safe[key.lower()] = value
    return safe


def build_payload(
    *,
    endpoint: str,
    token: str,
    cpu_percent: float,
    memory_used: int,
    memory_total: int,
    disk_free: int,
    disk_total: int,
    docker: bool,
    environment: dict[str, str] | None = None,
) -> dict[str, object]:
    """Build a telemetry payload without ever including the bearer token."""

    del endpoint, token
    return {
        "cpu_percent": round(max(0.0, min(100.0, cpu_percent)), 1),
        "memory_used_bytes": max(0, memory_used),
        "memory_total_bytes": max(0, memory_total),
        "disk_free_bytes": max(0, disk_free),
        "disk_total_bytes": max(0, disk_total),
        "docker_ready": bool(docker),
    }


def main():
    endpoint = os.environ.get("BLACKBOX_URL", "").rstrip("/")
    token = os.environ.get("BLACKBOX_HOST_AGENT_TOKEN", "")
    if not endpoint.startswith("https://") or not token:
        raise SystemExit("Set BLACKBOX_URL and BLACKBOX_HOST_AGENT_TOKEN in a protected environment file.")
    first_total, first_idle = cpu_sample()
    time.sleep(0.25)
    second_total, second_idle = cpu_sample()
    total_delta = second_total - first_total
    cpu_percent = 0.0 if total_delta <= 0 else max(0, min(100, 100 * (1 - (second_idle - first_idle) / total_delta)))
    used, total = memory_bytes()
    state_root = Path(os.environ.get("BLACKBOX_STATE_ROOT", str(Path.home() / ".local/share/black-box-runner")))
    state_root.mkdir(parents=True, exist_ok=True)
    disk = os.statvfs(state_root)
    docker = docker_ready()
    payload = build_payload(
        endpoint=endpoint,
        token=token,
        cpu_percent=cpu_percent,
        memory_used=used,
        memory_total=total,
        disk_free=disk.f_bavail * disk.f_frsize,
        disk_total=disk.f_blocks * disk.f_frsize,
        docker=docker,
        environment={},
    )
    payload.update({
        "host_id": os.environ.get("BLACKBOX_HOST_ID", "black-box-vbook"),
        "hostname": socket.gethostname(),
        "runner_name": os.environ.get("BLACKBOX_RUNNER_NAME", "black-box-vbook"),
        "wsl_memory_limit_bytes": total,
    })
    request = urllib.request.Request(endpoint + "/agent/telemetry", data=json.dumps(payload).encode(), method="POST", headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status != 202:
            raise SystemExit("Black Box rejected telemetry with status " + str(response.status))
    print("Black Box host telemetry accepted")


if __name__ == "__main__":
    main()
