#!/usr/bin/env bash
# Explicitly starts the configured runner in the foreground child process.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
export PATH="${HOME}/.local/bin:${PATH}"
export RUNNER_MANUALLY_TRAP_SIG=1
require_linux; validate_config; require_owned_data
[[ -x "$RUNNER_INSTALL_DIR/run.sh" ]] || fail "missing executable $RUNNER_INSTALL_DIR/run.sh; follow SETUP.md"
if [[ "${BLACK_BOX_RUNNER_TEST_MODE:-false}" != true ]]; then
  [[ -f "$RUNNER_INSTALL_DIR/.runner" && -f "$RUNNER_INSTALL_DIR/.credentials" ]] || fail "runner is not configured; paste GitHub's current registration commands first"
fi
if [[ "$RUNNER_REQUIRE_DOCKER" == true ]]; then
  command -v docker >/dev/null 2>&1 || fail 'Docker CLI is required'
  docker info >/dev/null 2>&1 || fail 'Docker daemon is not reachable'
fi
if runner_process_is_alive; then fail "runner is already running (pid $(cat -- "$PID_FILE"))"; fi
rm -f -- "$PID_FILE"
"${SCRIPT_DIR}/cleanup.sh" --startup
cd -- "$RUNNER_INSTALL_DIR"
nohup ./run.sh >>"$LOG_FILE" 2>&1 &
pid=$!
printf '%s\n' "$pid" >"$PID_FILE"
sleep 1
process_state="$(ps -p "$pid" -o stat= 2>/dev/null || true)"
if ! kill -0 "$pid" 2>/dev/null || [[ "$process_state" == Z* ]]; then
  rm -f -- "$PID_FILE"
  fail "runner exited during startup; inspect $LOG_FILE"
fi
printf 'started runner pid %s; log: %s\n' "$pid" "$LOG_FILE"
