#!/usr/bin/env bash
# Validation includes syntax, path policy, lifecycle stub, and cleanup boundaries.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
failures=0
pass() { printf 'ok: %s\n' "$*"; }
fail_check() { printf 'fail: %s\n' "$*" >&2; failures=$((failures + 1)); }
for file in "$RUNNER_DIR/SETUP.md" "$RUNNER_DIR/TAILSCALE.md" "$RUNNER_DIR/config/runner.env.example"; do if [[ -f "$file" ]]; then pass "$(basename "$file") exists"; else fail_check "$(basename "$file") missing"; fi; done
for script in "$RUNNER_DIR"/scripts/*.sh "$SCRIPT_DIR/validate.sh"; do if [[ -x "$script" ]]; then pass "$(basename "$script") executable"; else fail_check "$(basename "$script") not executable"; fi; if bash -n "$script"; then pass "$(basename "$script") parses"; else fail_check "$(basename "$script") syntax error"; fi; done
if grep -q '\\"' "$RUNNER_DIR/scripts/start-wsl.ps1" || ! grep -q 'A-Za-z0-9_./-' "$RUNNER_DIR/scripts/start-wsl.ps1"; then
  fail_check 'PowerShell path validation does not use the literal whitelist'
else
  pass 'PowerShell path validation uses a literal whitelist'
fi

# shellcheck disable=SC2016
if grep -Fq 'export PATH="${HOME}/.local/bin:${PATH}"' "$RUNNER_DIR/scripts/start.sh"; then pass 'startup exports ~/.local/bin'; else fail_check 'startup does not export ~/.local/bin'; fi
if grep -Fq 'export RUNNER_MANUALLY_TRAP_SIG=1' "$RUNNER_DIR/scripts/start.sh"; then pass 'startup enables the runner manual signal trap'; else fail_check 'startup does not enable the runner manual signal trap'; fi
if command -v pwsh >/dev/null 2>&1; then
  # shellcheck disable=SC2016
  if pwsh -NoProfile -Command '$tokens=$null;$errors=$null; [System.Management.Automation.Language.Parser]::ParseFile("scripts/start-wsl.ps1",[ref]$tokens,[ref]$errors)>$null; if($errors.Count){exit 1}'; then pass 'PowerShell parser accepted start-wsl.ps1'; else fail_check 'PowerShell parser rejected start-wsl.ps1'; fi
else
  printf '%s\n' 'unverified: pwsh unavailable; run the absolute /mnt/c/... PowerShell parser command from SETUP.md'
fi

stub="$(mktemp -d "${HOME}/.black-box-test.XXXXXX")"
trap 'rm -rf "$stub"' EXIT
mkdir -p "$stub/actions-runner" "$stub/black-box-runner/state/transient" "$stub/black-box-runner/cache" "$stub/black-box-runner/work"
cat > "$stub/actions-runner/run.sh" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$PATH" >"$PATH_PROBE"
trap 'exit 0' TERM INT
while :; do sleep 1; done
STUB
chmod +x "$stub/actions-runner/run.sh"
printf '%s\n' black-box-runner-v0.1 >"$stub/black-box-runner/.black-box-runner-owned"
marker_hash_before="$(shasum "$stub/black-box-runner/.black-box-runner-owned" | awk '{print $1}')"
config="$stub/config.env"
cat > "$config" <<EOF2
RUNNER_INSTALL_DIR="$stub/actions-runner"
RUNNER_DATA_DIR="$stub/black-box-runner"
RUNNER_LABEL="black-box-linux"
RUNNER_REQUIRE_DOCKER="false"
EOF2
printf abandoned >"$stub/black-box-runner/state/transient/abandoned.tmp"
mkdir -p "$stub/bin"
printf '#!/usr/bin/env bash\nprintf "Linux\n"\n' >"$stub/bin/uname"
chmod +x "$stub/bin/uname"
linux_common=(env PATH="$stub/bin:$PATH" BLACK_BOX_RUNNER_TEST_MODE=false BLACK_BOX_RUNNER_CONFIG="$config")
if "${linux_common[@]}" "$RUNNER_DIR/scripts/start.sh" >/dev/null 2>&1; then
  fail_check 'unregistered runner was accepted outside test mode'
else
  pass 'unregistered runner is rejected outside test mode'
fi
if [[ "$(uname -s)" != Linux ]]; then
  if env BLACK_BOX_RUNNER_CONFIG="$config" "$RUNNER_DIR/scripts/setup-paths.sh" >/dev/null 2>&1; then fail_check 'setup accepted a non-Linux host'; else pass 'setup rejects a non-Linux host'; fi
fi
bad_config="$stub/bad-config.env"
sed "s#${stub}/black-box-runner#/mnt/c/black-box-runner#" "$config" >"$bad_config"
if env BLACK_BOX_RUNNER_TEST_MODE=true BLACK_BOX_RUNNER_CONFIG="$bad_config" "$RUNNER_DIR/scripts/setup-paths.sh" >/dev/null 2>&1; then fail_check 'setup accepted a mounted Windows path'; else pass 'setup rejects a mounted Windows path'; fi
owned_probe="$stub/owned-probe"
mkdir -p "$owned_probe/black-box-runner"
printf keep >"$owned_probe/black-box-runner/keep.txt"
owned_config="$stub/owned-config.env"
sed "s#${stub}/black-box-runner#$owned_probe/black-box-runner#" "$config" >"$owned_config"
if env BLACK_BOX_RUNNER_TEST_MODE=true BLACK_BOX_RUNNER_CONFIG="$owned_config" "$RUNNER_DIR/scripts/setup-paths.sh" >/dev/null 2>&1; then fail_check 'setup claimed a nonempty unowned directory'; else pass 'setup rejects a nonempty unowned directory'; fi
if [[ -f "$owned_probe/black-box-runner/keep.txt" ]]; then pass 'unowned directory contents were preserved'; else fail_check 'unowned directory content changed'; fi
mkdir -p "$owned_probe/marked-runner"
printf invalid >"$owned_probe/marked-runner/.black-box-runner-owned"
marker_config="$stub/marker-config.env"
sed "s#${stub}/black-box-runner#$owned_probe/marked-runner#" "$config" >"$marker_config"
if env BLACK_BOX_RUNNER_TEST_MODE=true BLACK_BOX_RUNNER_CONFIG="$marker_config" "$RUNNER_DIR/scripts/setup-paths.sh" >/dev/null 2>&1; then fail_check 'setup accepted an invalid ownership marker'; else pass 'setup rejects an invalid ownership marker'; fi
symlink_marker_dir="$stub/symlink-marker/black-box-runner"
mkdir -p "$symlink_marker_dir"
ln -s "$stub/missing-marker-target" "$symlink_marker_dir/.black-box-runner-owned"
symlink_marker_config="$stub/symlink-marker-config.env"
sed "s#${stub}/black-box-runner#$symlink_marker_dir#" "$config" >"$symlink_marker_config"
if env BLACK_BOX_RUNNER_TEST_MODE=true BLACK_BOX_RUNNER_CONFIG="$symlink_marker_config" "$RUNNER_DIR/scripts/setup-paths.sh" >/dev/null 2>&1; then fail_check 'setup accepted a dangling symlink marker'; else pass 'setup rejects a dangling symlink marker'; fi
if env BLACK_BOX_RUNNER_TEST_MODE=true BLACK_BOX_RUNNER_CONFIG="$config" "$RUNNER_DIR/scripts/setup-paths.sh" >/dev/null 2>&1 && [[ "$marker_hash_before" == "$(shasum "$stub/black-box-runner/.black-box-runner-owned" | awk '{print $1}')" ]]; then pass 'valid ownership marker is preserved'; else fail_check 'valid ownership marker changed'; fi
common=(env PATH="$PATH" PATH_PROBE="$stub/path-probe" BLACK_BOX_RUNNER_TEST_MODE=true BLACK_BOX_RUNNER_CONFIG="$config")
if "${common[@]}" "$RUNNER_DIR/scripts/start.sh" >/dev/null 2>&1 && [[ ! -e "$stub/black-box-runner/state/transient/abandoned.tmp" ]] && grep -Fq "$HOME/.local/bin" "$stub/path-probe"; then pass 'stub runner starts after cleanup with ~/.local/bin'; else fail_check 'stub runner failed startup cleanup or PATH export'; fi
sleep 1
status_output=$("${common[@]}" "$RUNNER_DIR/scripts/status.sh"); if grep -q 'runner: running' <<<"$status_output"; then pass 'stub runner reports running'; else printf '%s\n' "$status_output"; fail_check 'stub runner did not report running'; fi
if "${common[@]}" "$RUNNER_DIR/scripts/cleanup.sh" --apply >/dev/null 2>&1; then fail_check 'cleanup accepted removal while runner was live'; else pass 'cleanup refuses removal while runner is live'; fi
stop_output="$("${common[@]}" "$RUNNER_DIR/scripts/stop.sh")"
if grep -q 'stopping' <<<"$stop_output" && grep -q 'stopped' <<<"$stop_output"; then pass 'stop waits and reports completion'; else printf '%s\n' "$stop_output"; fail_check 'stop did not report stopping then completion'; fi
sleep 1
if ! "${common[@]}" "$RUNNER_DIR/scripts/status.sh" | grep -q 'runner: running'; then pass 'stub runner reports stopped'; else fail_check 'stub runner still reports running'; fi
cp "$stub/actions-runner/run.sh" "$stub/long-run.sh"
printf '#!/usr/bin/env bash\nexit 1\n' >"$stub/actions-runner/run.sh"
chmod +x "$stub/actions-runner/run.sh"
if "${common[@]}" "$RUNNER_DIR/scripts/start.sh" >/dev/null 2>&1 || [[ -e "$stub/black-box-runner/state/runner.pid" ]]; then fail_check 'start accepted a runner that exited immediately'; else pass 'start rejects immediate runner exit'; fi
cp "$stub/long-run.sh" "$stub/actions-runner/run.sh"
printf x >"$stub/black-box-runner/state/transient/job.tmp"
if "${common[@]}" "$RUNNER_DIR/scripts/cleanup.sh" | grep -q 'dry-run'; then pass 'cleanup defaults to dry-run'; else fail_check 'cleanup did not stay dry-run'; fi
printf personal >"$stub/black-box-runner/cache/keep.txt"
printf work >"$stub/black-box-runner/work/keep.txt"
if "${common[@]}" "$RUNNER_DIR/scripts/cleanup.sh" --startup >/dev/null && [[ ! -e "$stub/black-box-runner/state/transient/job.tmp" && -f "$stub/black-box-runner/cache/keep.txt" && -f "$stub/black-box-runner/work/keep.txt" ]]; then pass 'cleanup removes only owned transient entries'; else fail_check 'cleanup crossed the transient boundary'; fi
ln -s "$stub/black-box-runner/state/transient" "$stub/black-box-runner/state/transient-link"
symlink_config="$stub/symlink-config.env"; sed "s#$stub/black-box-runner#$stub/black-box-runner/state/transient-link#" "$config" >"$symlink_config"
if env PATH="$PATH" BLACK_BOX_RUNNER_TEST_MODE=true BLACK_BOX_RUNNER_CONFIG="$symlink_config" "$RUNNER_DIR/scripts/cleanup.sh" >/dev/null 2>&1; then fail_check 'cleanup accepted a symlinked data path'; else pass 'cleanup rejects symlinked data path'; fi
docker_bin="$stub/docker-bin"; mkdir -p "$docker_bin"
docker_log="$stub/docker.log"
cat >"$docker_bin/docker" <<'DOCKER'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$DOCKER_LOG"
case "$1" in
  info) exit 0 ;;
  ps) printf 'ci-container\n' ;;
  volume) printf 'ci-volume\n' ;;
  rm) exit 0 ;;
  *) exit 1 ;;
esac
DOCKER
chmod +x "$docker_bin/docker"
docker_config="$stub/docker-config.env"; sed 's/RUNNER_REQUIRE_DOCKER="false"/RUNNER_REQUIRE_DOCKER="true"/' "$config" >"$docker_config"
if env PATH="$docker_bin:$PATH" DOCKER_LOG="$docker_log" BLACK_BOX_RUNNER_TEST_MODE=true BLACK_BOX_RUNNER_CONFIG="$docker_config" "$RUNNER_DIR/scripts/cleanup.sh" --startup >/dev/null 2>&1 && grep -q 'ps -aq --filter label=com.blackbox.runner.owner=black-box-ci' "$docker_log" && grep -q 'volume ls -q --filter label=com.blackbox.runner.owner=black-box-ci' "$docker_log" && ! grep -q 'prune' "$docker_log"; then pass 'startup Docker cleanup uses only the CI ownership label'; else fail_check 'startup Docker cleanup was not bounded to the CI label'; fi
if command -v shellcheck >/dev/null 2>&1; then if shellcheck "$RUNNER_DIR"/scripts/*.sh "$SCRIPT_DIR/validate.sh"; then pass 'shellcheck passed'; else fail_check 'shellcheck reported issues'; fi; else printf 'unverified: shellcheck unavailable\n'; fi
if command -v python3 >/dev/null 2>&1; then
  if python3 -m unittest "$SCRIPT_DIR/test_history.py"; then pass 'local history tests passed'; else fail_check 'local history tests failed'; fi
  if python3 -m unittest "$SCRIPT_DIR/test_cache.py" "$SCRIPT_DIR/test_telemetry.py"; then pass 'cache and telemetry tests passed'; else fail_check 'cache and telemetry tests failed'; fi
else
  printf '%s\n' 'unverified: python3 unavailable; local history tests not run'
fi
if (( failures )); then printf 'result: %d validation failure(s)\n' "$failures" >&2; exit 1; fi
printf 'result: validation passed\n'
