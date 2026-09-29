#!/usr/bin/env bash
# Read-only prerequisite and configuration checks.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
failures=0
check_docker() { docker info >/dev/null 2>&1; }
printf 'BlackBox runner prerequisite check\nconfig: %s\nlabel: %s\n' "$CONFIG_FILE" "$RUNNER_LABEL"
if is_linux; then printf 'ok: Linux kernel detected\n'; else printf 'not ready: Linux kernel required\n'; failures=$((failures + 1)); fi
for command_name in bash curl git docker; do
  if command -v "$command_name" >/dev/null 2>&1; then printf 'ok: command %s (%s)\n' "$command_name" "$(command -v "$command_name")"; else printf 'not ready: command %s is missing\n' "$command_name"; failures=$((failures + 1)); fi
done
if command -v docker >/dev/null 2>&1; then
  if check_docker; then printf 'ok: Docker daemon is reachable\n'; else printf 'not ready: Docker daemon is not reachable\n'; failures=$((failures + 1)); fi
fi
if [[ -x "${RUNNER_INSTALL_DIR}/run.sh" ]]; then printf 'ok: runner executable exists\n'; else printf 'not ready: runner executable missing at %s\n' "$RUNNER_INSTALL_DIR/run.sh"; failures=$((failures + 1)); fi
if validate_config >/dev/null 2>&1; then printf 'ok: config paths and label are valid\n'; else printf 'not ready: config paths or label are invalid\n'; failures=$((failures + 1)); fi
if [[ -f "$OWNER_FILE" ]]; then printf 'ok: runner-owned data marker exists\n'; else printf 'notice: run scripts/setup-paths.sh before lifecycle commands\n'; fi
if (( failures )); then printf 'result: %d prerequisite check(s) need attention\n' "$failures"; exit 1; fi
printf 'result: prerequisites look ready\n'
