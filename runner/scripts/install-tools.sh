#!/usr/bin/env bash
# Install verified, pinned user-space tools. Does not register or start a runner.
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib.sh"
require_linux
validate_config
machine="$(uname -m)"
case "$machine" in
  x86_64) node_arch=x64; runner_arch=x64 ;;
  aarch64|arm64) node_arch=arm64; runner_arch=arm64 ;;
  *) fail "unsupported Linux architecture: $machine" ;;
esac
command -v curl >/dev/null || fail 'curl is required'
command -v sha256sum >/dev/null || fail 'sha256sum is required'
command -v tar >/dev/null || fail 'tar is required'
node_version=24.20.0
pnpm_version=12.6.0
runner_version=2.337.0
case "$runner_arch" in
  x64) runner_sha=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613 ;;
  arm64) runner_sha=9b1dc70626422526e3c94767cf024896beb15da5342a3f4819bf2feac13e0393 ;;
esac
tool_root="${HOME}/.local/share/black-box-tools"
node_dir="${tool_root}/node-v${node_version}-linux-${node_arch}"
mkdir -p -- "$tool_root" "${HOME}/.local/bin"
reject_symlink_components_inside_home "$tool_root"
stage="$(mktemp -d "${tool_root}/download.XXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
if [[ ! -x "$node_dir/bin/node" ]]; then
  name="node-v${node_version}-linux-${node_arch}.tar.xz"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v${node_version}/${name}" -o "${stage}/${name}"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" -o "${stage}/SHASUMS256.txt"
  awk -v filename="$name" '$2 == filename {print}' "${stage}/SHASUMS256.txt" >"${stage}/node.sha256"
  [[ -s "${stage}/node.sha256" ]] || fail 'Node release checksum is missing'
  (cd "$stage" && sha256sum --check node.sha256)
  tar -xJf "${stage}/${name}" -C "$tool_root"
fi
export PATH="${node_dir}/bin:${HOME}/.local/bin:${PATH}"
pnpm_bin="${tool_root}/pnpm/bin/pnpm"
pnpm_ready=false
if [[ -x "$pnpm_bin" ]] && PATH="${node_dir}/bin:${HOME}/.local/bin:${PATH}" "$pnpm_bin" --version 2>/dev/null | grep -Fxq "$pnpm_version"; then
  pnpm_ready=true
fi
if [[ "$pnpm_ready" != true ]]; then
  # pnpm's pinned package runs its native-binary setup script. It does not
  # replace the system Node or npm, and the exact version is checked below.
  rm -rf -- "${tool_root}/pnpm"
  "$node_dir/bin/npm" install --prefix "${tool_root}/pnpm" --global "pnpm@${pnpm_version}"
fi
for binary in node npm npx; do
  target="${HOME}/.local/bin/${binary}"
  if [[ -e "$target" || -L "$target" ]]; then
    [[ -L "$target" && "$(readlink "$target")" == "${node_dir}/bin/${binary}" ]] || fail "existing ${binary} in ~/.local/bin; preserve it and configure PATH manually"
  else
    ln -s -- "${node_dir}/bin/${binary}" "$target"
  fi
done
for binary in pnpm pnpx; do
  target="${HOME}/.local/bin/${binary}"
  if [[ -e "$target" || -L "$target" ]]; then
    [[ -L "$target" && "$(readlink "$target")" == "${tool_root}/pnpm/bin/${binary}" ]] || fail "existing ${binary} in ~/.local/bin; preserve it and configure PATH manually"
  else
    ln -s -- "${tool_root}/pnpm/bin/${binary}" "$target"
  fi
done
if [[ ! -x "${RUNNER_INSTALL_DIR}/bin/Runner.Listener" ]]; then
  [[ ! -e "$RUNNER_INSTALL_DIR" || -z "$(ls -A "$RUNNER_INSTALL_DIR")" ]] || fail 'runner installation directory is not empty'
  name="actions-runner-linux-${runner_arch}-${runner_version}.tar.gz"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://github.com/actions/runner/releases/download/v${runner_version}/${name}" -o "${stage}/${name}"
  printf '%s  %s\n' "$runner_sha" "$name" >"${stage}/runner.sha256"
  (cd "$stage" && sha256sum --check runner.sha256)
  mkdir -p -- "$RUNNER_INSTALL_DIR"
  tar -xzf "${stage}/${name}" -C "$RUNNER_INSTALL_DIR"
fi
[[ "$(node --version)" == "v${node_version}" ]] || fail "unexpected Node version"
[[ "$(pnpm --version)" == "${pnpm_version}" ]] || fail "unexpected pnpm version"
"${RUNNER_INSTALL_DIR}/bin/Runner.Listener" --version
printf '%s\n' 'Tools installed. No runner was registered or started.' "Use export PATH=\"\$HOME/.local/bin:\$PATH\" in the runner session."
