#!/usr/bin/env python3
"""Post bounded, non-secret WSL host telemetry to Black Box."""

import json
import os
import socket
import subprocess
import time
import urllib.request
from pathlib import Path


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
    docker = subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8).returncode == 0
    payload = {
        "host_id": os.environ.get("BLACKBOX_HOST_ID", "black-box-vbook"),
        "hostname": socket.gethostname(),
        "runner_name": os.environ.get("BLACKBOX_RUNNER_NAME", "black-box-vbook"),
        "cpu_percent": round(cpu_percent, 1),
        "memory_used_bytes": used,
        "memory_total_bytes": total,
        "disk_free_bytes": disk.f_bavail * disk.f_frsize,
        "disk_total_bytes": disk.f_blocks * disk.f_frsize,
        "wsl_memory_limit_bytes": total,
        "docker_ready": docker,
    }
    request = urllib.request.Request(endpoint + "/agent/telemetry", data=json.dumps(payload).encode(), method="POST", headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status != 202:
            raise SystemExit("Black Box rejected telemetry with status " + str(response.status))
    print("Black Box host telemetry accepted")


if __name__ == "__main__":
    main()
