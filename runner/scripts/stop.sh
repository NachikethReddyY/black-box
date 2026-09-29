#!/usr/bin/env bash
# Sends SIGTERM, which the official runner shell handles, then waits for exit.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
require_linux; validate_config; require_owned_data
if ! runner_process_is_alive; then printf 'runner is not running\n'; exit 0; fi
pid="$(cat -- "$PID_FILE")"
stop_timeout="${RUNNER_STOP_TIMEOUT_SECONDS:-30}"
[[ "$stop_timeout" =~ ^[0-9]+$ ]] || fail 'RUNNER_STOP_TIMEOUT_SECONDS must be a nonnegative integer'
printf 'stopping runner pid %s\n' "$pid"
kill -TERM "$pid"
for ((second = 0; second < stop_timeout * 10; second++)); do
  if ! runner_process_is_alive; then
    rm -f -- "$PID_FILE"
    printf 'runner stopped (pid %s)\n' "$pid"
    exit 0
  fi
  sleep 0.1
done
printf 'runner still running after %ss (signal sent to pid %s)\n' "$stop_timeout" "$pid" >&2
exit 1
