#!/usr/bin/env bash
# Read-only status report.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
printf 'BlackBox runner status\nlabel: %s\ninstall: %s (%s)\ndata: %s\ncache: %s\nworkspace: %s\n' "$RUNNER_LABEL" "$RUNNER_INSTALL_DIR" "$( [[ -x "$RUNNER_INSTALL_DIR/run.sh" ]] && printf present || printf missing )" "$RUNNER_DATA_DIR" "$RUNNER_CACHE_DIR" "$RUNNER_WORKSPACE_DIR"
if runner_process_is_alive; then printf 'runner: running (pid %s)\n' "$(cat -- "$PID_FILE")"; else printf 'runner: stopped\n'; fi
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then printf 'docker: reachable\n'; else printf 'docker: unavailable\n'; fi
