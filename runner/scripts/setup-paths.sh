#!/usr/bin/env bash
# Explicitly create only the runner-owned Linux-side directories.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
require_linux
validate_config

marker_owned=false
[[ ! -L "$OWNER_FILE" ]] || fail "ownership marker is a symlink: $OWNER_FILE"
if [[ -e "$OWNER_FILE" || -e "$RUNNER_DATA_DIR" ]]; then
  [[ -d "$RUNNER_DATA_DIR" ]] || fail "runner data path is not a directory: $RUNNER_DATA_DIR"
  if [[ -e "$OWNER_FILE" ]]; then
    [[ ! -L "$OWNER_FILE" ]] || fail "ownership marker is a symlink: $OWNER_FILE"
    [[ -f "$OWNER_FILE" ]] || fail "ownership marker is not a regular file: $OWNER_FILE"
    [[ "$(cat -- "$OWNER_FILE")" == black-box-runner-v0.1 ]] || fail "invalid ownership marker: $OWNER_FILE"
    marker_owned=true
  else
    [[ -z "$(find "$RUNNER_DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] || fail "refusing nonempty unowned runner data directory: $RUNNER_DATA_DIR"
  fi
fi

mkdir -p -- "$RUNNER_DATA_DIR/state/transient" "$RUNNER_DATA_DIR/cache" "$RUNNER_DATA_DIR/work"
if [[ "$marker_owned" != true ]]; then
  printf '%s\n' black-box-runner-v0.1 >"$OWNER_FILE"
fi
printf 'prepared runner-owned paths under %s\n' "$RUNNER_DATA_DIR"
