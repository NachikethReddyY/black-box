#!/usr/bin/env bash
# Shared configuration and path checks for the BlackBox runner.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${BLACK_BOX_RUNNER_CONFIG:-${RUNNER_DIR}/runner.env}"

RUNNER_INSTALL_DIR="${RUNNER_INSTALL_DIR:-${HOME}/actions-runner}"
RUNNER_DATA_DIR="${RUNNER_DATA_DIR:-${HOME}/.local/share/black-box-runner}"
RUNNER_LABEL="${RUNNER_LABEL:-black-box-reviewer}"
RUNNER_REQUIRE_DOCKER="${RUNNER_REQUIRE_DOCKER:-true}"
RUNNER_DOCKER_OWNER_LABEL="${RUNNER_DOCKER_OWNER_LABEL:-com.blackbox.runner.owner=black-box-ci}"
if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

RUNNER_STATE_DIR="${RUNNER_DATA_DIR}/state"
 # shellcheck disable=SC2034
RUNNER_CACHE_DIR="${RUNNER_DATA_DIR}/cache"
 # shellcheck disable=SC2034
RUNNER_WORKSPACE_DIR="${RUNNER_DATA_DIR}/work"
 # shellcheck disable=SC2034
TRANSIENT_DIR="${RUNNER_STATE_DIR}/transient"
PID_FILE="${RUNNER_STATE_DIR}/runner.pid"
 # shellcheck disable=SC2034
LOG_FILE="${RUNNER_STATE_DIR}/runner.log"
OWNER_FILE="${RUNNER_DATA_DIR}/.black-box-runner-owned"

fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

is_linux() { [[ "$(uname -s)" == Linux ]]; }

reject_symlink_components_inside_home() {
  local path="$1" rest part current="$HOME"
  rest="${path#"${HOME}/"}"
  while [[ -n "$rest" ]]; do
    part="${rest%%/*}"
    current="${current}/${part}"
    [[ ! -L "$current" ]] || fail "symlinked path component is unsupported: $current"
    if [[ "$rest" == */* ]]; then rest="${rest#*/}"; else rest=""; fi
  done
}

validate_config() {
  local path
  [[ "$RUNNER_LABEL" == black-box-reviewer ]] || fail "RUNNER_LABEL must be black-box-reviewer"
  [[ "$RUNNER_REQUIRE_DOCKER" == true || "$RUNNER_REQUIRE_DOCKER" == false ]] || fail "RUNNER_REQUIRE_DOCKER must be true or false"
  [[ "$RUNNER_DOCKER_OWNER_LABEL" == com.blackbox.runner.owner=black-box-ci ]] || fail "RUNNER_DOCKER_OWNER_LABEL must be com.blackbox.runner.owner=black-box-ci"
  [[ "$HOME" == /* && "$HOME" != / ]] || fail "HOME must be an absolute non-root path"
  [[ "$RUNNER_DATA_DIR" == "${HOME}/"* ]] || fail "RUNNER_DATA_DIR must be inside HOME"
  [[ "$RUNNER_DATA_DIR" == */black-box-runner ]] || fail "RUNNER_DATA_DIR must end in /black-box-runner"
  [[ "$RUNNER_INSTALL_DIR" == "${HOME}/"* ]] || fail "RUNNER_INSTALL_DIR must be inside HOME"
  for path in "$RUNNER_DATA_DIR" "$RUNNER_INSTALL_DIR"; do
    [[ "$path" != *'/../'* && "$path" != *'/./'* && "$path" != */.. && "$path" != */. && "$path" != *'//' ]] || fail "non-canonical path is unsupported: $path"
    [[ "$path" != /mnt/* && "$path" != /media/* && "$path" != /run/media/* ]] || fail "mounted path is unsupported: $path"
    reject_symlink_components_inside_home "$path"
  done
  [[ "$RUNNER_INSTALL_DIR" != "$RUNNER_DATA_DIR"/* && "$RUNNER_DATA_DIR" != "$RUNNER_INSTALL_DIR"/* ]] || fail "install and data paths must not overlap"
}

require_linux() { [[ "${BLACK_BOX_RUNNER_TEST_MODE:-false}" == true ]] || is_linux || fail "this command requires Linux"; }
require_owned_data() {
  [[ -f "$OWNER_FILE" && ! -L "$OWNER_FILE" ]] || fail "runner data is not initialized; run scripts/setup-paths.sh"
  [[ "$(cat -- "$OWNER_FILE")" == black-box-runner-v0.1 ]] || fail "runner data ownership marker is invalid"
}

runner_process_is_alive() {
  [[ -s "$PID_FILE" && ! -L "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat -- "$PID_FILE")"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  local process_state
  process_state="$(ps -p "$pid" -o stat= 2>/dev/null || true)"
  [[ "$process_state" != Z* ]] || return 1
  if [[ "${BLACK_BOX_RUNNER_TEST_MODE:-false}" == true ]]; then return 0; fi
  [[ -r "/proc/${pid}/cmdline" ]] || return 1
  [[ "$(readlink -f -- "/proc/${pid}/cwd")" == "$RUNNER_INSTALL_DIR" ]] || return 1
  tr '\0' ' ' <"/proc/${pid}/cmdline" | grep -q -- 'run.sh'

}
