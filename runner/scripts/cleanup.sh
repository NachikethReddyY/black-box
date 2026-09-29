#!/usr/bin/env bash
# Dry-run by default. Startup mode removes only explicitly CI-owned state.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
apply=false
docker_cleanup=false
case "${1:-}" in
  '') ;;
  --apply) apply=true ;;
  --startup) apply=true; docker_cleanup=true ;;
  -h|--help) printf 'Usage: %s [--apply|--startup]\n' "$0"; printf '%s\n' 'Default lists transient files only; --apply removes those files; --startup also removes labeled CI Docker resources.'; exit 0 ;;
  *) fail "unknown option: $1" ;;
esac
require_linux; validate_config; require_owned_data
if [[ "$apply" == true ]] && runner_process_is_alive; then fail 'stop the runner before removing transient state'; fi
reject_symlink_components_inside_home "$TRANSIENT_DIR"
if [[ -d "$TRANSIENT_DIR" ]]; then
  mapfile -t entries < <(find "$TRANSIENT_DIR" -mindepth 1 -maxdepth 1 -print)
else
  entries=()
fi
if ((${#entries[@]} > 0)); then
  printf '%s\n' "${entries[@]}"
  if [[ "$apply" == true ]]; then
    find "$TRANSIENT_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    printf 'removed %d transient entr%s\n' "${#entries[@]}" "$([[ ${#entries[@]} -eq 1 ]] && printf y || printf ies)"
  else
    printf 'dry-run: pass --apply to remove these entries\n'
  fi
else
  printf 'transient directory is empty or absent: %s\n' "$TRANSIENT_DIR"
fi

if [[ "$docker_cleanup" != true ]]; then exit 0; fi
if [[ "$RUNNER_REQUIRE_DOCKER" != true ]]; then printf 'Docker cleanup skipped: RUNNER_REQUIRE_DOCKER is not true\n'; exit 0; fi
command -v docker >/dev/null 2>&1 || fail 'Docker CLI is required for startup cleanup'
docker info >/dev/null 2>&1 || fail 'Docker daemon is not reachable for startup cleanup'

# Every resource query is filtered by the exact CI ownership label. There is no
# system prune, volume prune, image prune, cache prune, or unfiltered deletion.
container_ids="$(docker ps -aq --filter "label=${RUNNER_DOCKER_OWNER_LABEL}")" || fail "could not list labeled CI containers"
containers=()
if [[ -n "$container_ids" ]]; then mapfile -t containers <<<"$container_ids"; fi
if ((${#containers[@]} > 0)); then
  docker rm -f "${containers[@]}" >/dev/null
  printf 'removed %d labeled CI container(s)\n' "${#containers[@]}"
else
  printf 'no labeled CI containers to remove\n'
fi
volume_ids="$(docker volume ls -q --filter "label=${RUNNER_DOCKER_OWNER_LABEL}")" || fail "could not list labeled CI volumes"
volumes=()
if [[ -n "$volume_ids" ]]; then mapfile -t volumes <<<"$volume_ids"; fi
if ((${#volumes[@]} > 0)); then
  docker volume rm "${volumes[@]}" >/dev/null
  printf 'removed %d labeled CI volume(s)\n' "${#volumes[@]}"
else
  printf 'no labeled CI volumes to remove\n'
fi
