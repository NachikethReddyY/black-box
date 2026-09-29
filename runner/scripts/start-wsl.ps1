# Run from Windows PowerShell. Opens a visible Ubuntu session; no autostart setup.
param(
  [string]$Distro = "Ubuntu",
  [string]$LinuxProjectRunnerDir
)
$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($LinuxProjectRunnerDir)) {
  throw "Pass -LinuxProjectRunnerDir with the Linux path to this repository's runner directory."
}
# Keep the path shell-safe with a literal whitelist. No backslash-escaped quotes.
if ($LinuxProjectRunnerDir -notmatch '^[A-Za-z0-9_./-]+$' -or -not $LinuxProjectRunnerDir.StartsWith('/')) {
  throw "LinuxProjectRunnerDir must be an absolute Linux path containing only letters, numbers, _, ., /, and -."
}
wsl.exe --distribution $Distro -- bash -lc "set -e; cd -- '$LinuxProjectRunnerDir'; ./scripts/start.sh; ./scripts/status.sh; exec bash -i"
