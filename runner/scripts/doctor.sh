#!/usr/bin/env bash
# Read-only Black Box host diagnosis. It never installs, removes, or starts anything.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"

failures=0
warn() { printf 'warning: %s\n' "$*"; }
blocker() { printf 'blocked: %s\n' "$*"; failures=$((failures + 1)); }
ok() { printf 'ok: %s\n' "$*"; }

printf 'BlackBox runner doctor\nconfig: %s\nlabel: %s\n' "$CONFIG_FILE" "$RUNNER_LABEL"

if is_linux; then ok "Linux kernel detected ($(uname -r))"; else blocker 'Linux is required'; fi

if grep -qi microsoft /proc/version 2>/dev/null; then ok 'WSL kernel marker detected (local fallback)'; else ok 'native Linux host detected'; fi

if validate_config >/dev/null 2>&1; then ok 'runner paths and ownership policy are valid'; else blocker 'runner paths or ownership policy are invalid'; fi
if [[ -f "$OWNER_FILE" ]]; then ok 'runner data ownership marker exists'; else blocker 'runner paths are not initialized'; fi
if [[ -f "$RUNNER_INSTALL_DIR/.runner" && -f "$RUNNER_INSTALL_DIR/.credentials" ]]; then ok 'GitHub runner registration files exist'; else blocker 'GitHub runner is not registered'; fi

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then ok 'Docker daemon is reachable'; elif [[ "$RUNNER_REQUIRE_DOCKER" == true ]]; then blocker 'Docker daemon is required but unreachable'; else warn 'Docker daemon is unreachable and not required'; fi
elif [[ "$RUNNER_REQUIRE_DOCKER" == true ]]; then
  blocker 'Docker command is missing';
else
  warn 'Docker command is missing and not required'
fi

if [[ -d "$RUNNER_DATA_DIR" ]]; then
  disk_line="$(df -Pk -- "$RUNNER_DATA_DIR" | awk 'NR==2 {print $4 " KB free"}')"
  printf 'disk: %s\n' "${disk_line:-unknown}"
  free_kb="$(df -Pk -- "$RUNNER_DATA_DIR" | awk 'NR==2 {print $4}')"
  if [[ "$free_kb" =~ ^[0-9]+$ ]] && (( free_kb < 2097152 )); then warn 'less than 2 GiB is free on the runner filesystem'; else ok 'runner filesystem has at least 2 GiB free'; fi
else
  warn 'runner data directory is absent; disk and cache checks are deferred'
fi

if [[ -r /proc/meminfo ]]; then
  mem_total_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  mem_available_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  printf 'memory: %s MiB total, %s MiB available\n' "$((mem_total_kb / 1024))" "$((mem_available_kb / 1024))"
  if (( mem_available_kb < 1024 * 1024 )); then warn 'less than 1 GiB is currently available to Linux'; else ok 'at least 1 GiB is currently available to Linux'; fi
fi

if [[ -r /sys/fs/cgroup/memory.max ]]; then
  memory_max="$(cat /sys/fs/cgroup/memory.max)"
  if [[ "$memory_max" == max ]]; then
    printf 'WSL/cgroup memory limit: unlimited\n'
  elif [[ "$memory_max" =~ ^[0-9]+$ ]]; then
    printf 'WSL/cgroup memory limit: %s MiB\n' "$((memory_max / 1024 / 1024))"
  else
    warn 'WSL/cgroup memory limit could not be parsed'
  fi
else
  warn 'WSL/cgroup memory limit is not readable'
fi

if runner_process_is_alive; then ok "runner process is active (pid $(cat -- "$PID_FILE"))"; else warn 'runner process is stopped'; fi
if (( failures )); then printf 'result: %d blocking issue(s)\n' "$failures"; exit 1; fi
printf 'result: no blocking host issues found\n'
