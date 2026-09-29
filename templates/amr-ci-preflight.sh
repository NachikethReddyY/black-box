#!/usr/bin/env bash
set -euo pipefail
fail() { echo "AMR Black Box CI preflight: $*" >&2; exit 2; }
[[ "${AMR_DB_CI_MODE:-}" == true ]] || fail 'AMR_DB_CI_MODE=true is required'
[[ -n "${AMR_LOCAL_DB_AUTH_DIR:-}" ]] || fail 'AMR_LOCAL_DB_AUTH_DIR is missing'
[[ -n "${AMR_LOCAL_DB_PROJECT:-}" ]] || fail 'AMR_LOCAL_DB_PROJECT is missing'
[[ -n "${AMR_LOCAL_DB_COMPOSE_FILE:-}" ]] || fail 'AMR_LOCAL_DB_COMPOSE_FILE is missing'
[[ -n "${BLACKBOX_REQUEST_ID:-}" ]] || fail 'BLACKBOX_REQUEST_ID is missing'
[[ -n "${BLACKBOX_RUN_ID:-}" ]] || fail 'BLACKBOX_RUN_ID is missing'
[[ -n "${BLACKBOX_RUNNER_ID:-}" ]] || fail 'BLACKBOX_RUNNER_ID is missing'
grep -q 'AMR_LOCAL_DB_AUTH_DIR' scripts/local-db.mjs || fail 'local-db.mjs CI patch is not installed'
grep -q 'AMR_LOCAL_DB_PROJECT' scripts/local-db.mjs || fail 'local-db.mjs project override is not installed'
grep -q 'AMR_LOCAL_DB_COMPOSE_FILE' scripts/local-db.mjs || fail 'local-db.mjs compose override is not installed'
[[ -f "$AMR_LOCAL_DB_COMPOSE_FILE" ]] || fail 'CI compose override is missing'
grep -q 'com.blackbox.runner.owner' "$AMR_LOCAL_DB_COMPOSE_FILE" || fail 'CI runner owner label is missing'
grep -q 'blackbox.owner' "$AMR_LOCAL_DB_COMPOSE_FILE" || fail 'CI compose owner label is missing'
