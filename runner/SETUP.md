# BlackBox runner v0.1: Windows 11 + WSL2

This directory is a setup skeleton for a Linux GitHub Actions self-hosted runner inside Ubuntu on WSL2. It does not install packages, download the runner, register a runner, create a Windows service, or configure Docker for you.

GitHub's documentation lists Ubuntu 20.04+ as a supported Linux runner OS and requires Docker on Linux when workflows use Docker container actions or service containers. Read the current official instructions before registration:

- [Adding self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)
- [Self-hosted runner reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [Using labels with self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/apply-labels)

## 1. Prepare Windows and Ubuntu in WSL2

1. Enable WSL2 and install an Ubuntu distribution using Microsoft's current Windows instructions.
2. Open the Ubuntu terminal. Run the commands below there, not in PowerShell.
3. Keep runner files, caches, and job work under the Linux filesystem. The default paths are:
   - runner install: `$HOME/actions-runner`
   - state and logs: `$HOME/.local/share/black-box-runner/state`
   - cache: `$HOME/.local/share/black-box-runner/cache`
   - job workspace: `$HOME/.local/share/black-box-runner/work`
4. Do not change these paths to `/mnt/c/...` or another mounted Windows path for this v0.1 skeleton.

From this directory, copy the example configuration and explicitly create the dedicated paths:

```bash
cp config/runner.env.example runner.env
./scripts/setup-paths.sh
```

Edit `runner.env` only for local, non-secret values. Do not put a GitHub token in it.

## 2. Check prerequisites without changing the machine

```bash
./scripts/prereq.sh
./scripts/status.sh
```

`prereq.sh` is read-only. It reports whether this host looks like WSL2, whether Bash, curl, Git, and Docker are available, whether the Docker daemon responds, and whether the runner executable is present. A non-WSL host may report a failed WSL2 check even when the scripts themselves are valid.

Install or configure Ubuntu, Docker Desktop's WSL integration, and other prerequisites using your organization's approved process. This repository does not automate those changes.

If you own this checkout's pinned tool installer, run it explicitly inside WSL after prerequisites are ready:

```bash
./scripts/install-tools.sh
export PATH="$HOME/.local/bin:$PATH"
node --version
pnpm --version
"$HOME/actions-runner/bin/Runner.Listener" --version
```

The current pinned values are Node 24.20.0, pnpm 12.6.0, and Actions runner 2.337.0. The installer does not register or start a runner. It is owned by the parent setup task; this runner lifecycle skeleton only consumes the resulting files.

Operator-reported WSL validation for `/home/vbook/BlackBox` recorded these versions: Ubuntu 26.04, Docker 29.1.3, Compose 2.40.3, Node 24.20.0, pnpm 12.6.0, and runner 2.337.0. This records installed tool versions only; it does not claim GitHub registration, online/idle state, or a deployed job.

## 3. Install the runner using GitHub's current commands

Open the target repository on GitHub, then go to **Settings → Actions → Runners → New self-hosted runner → Linux → x64** (choose the architecture shown for your machine). GitHub displays versioned download and extraction commands for the current runner release.

Paste and run those official download/extraction commands in Ubuntu, with the extraction directory set to `$HOME/actions-runner`. Do not copy a registration token into this repository or into shell history you intend to share.

## 4. Register the runner and paste the label

On the same GitHub page, copy the **registration/configuration commands GitHub generates for your repository**. Paste them into Ubuntu only at the point marked by GitHub. The token is short-lived and must come from GitHub; this guide intentionally does not contain one.

The generated Linux command should configure the runner with the custom label and the dedicated job workspace required by this skeleton:

```text
./config.sh --url <PASTE_REPOSITORY_URL_FROM_GITHUB> --token <PASTE_SHORT_LIVED_TOKEN_FROM_GITHUB> --labels black-box-linux --work /home/YOUR_USER/.local/share/black-box-runner/work
```

Replace `YOUR_USER` with the Ubuntu username and use the exact URL, token, and any current flags shown by GitHub. If GitHub asks for a runner name, use a local name such as `black-box-wsl2`.

When registration finishes, verify that `$HOME/actions-runner/run.sh` exists. Then run:

```bash
./scripts/status.sh
./scripts/prereq.sh
```

The expected workflow routing value requires all four labels, including the default x64 label:

```yaml
runs-on: [self-hosted, linux, x64, black-box-linux]
```

A runner must be online and carry every requested label to receive a job. Confirm the label and online state in GitHub before using this `runs-on` value.

## 5. Start, stop, and inspect

These commands act only when you invoke them explicitly:

```bash
./scripts/start.sh
./scripts/status.sh
./scripts/stop.sh
```

`start.sh` launches the already-configured `run.sh` process and records its PID and log under `$HOME/.local/share/black-box-runner/state`. It does not register a runner or install a service. `stop.sh` sends SIGTERM to the PID recorded by `start.sh`, prints `stopping`, and waits for process exit. It prints `runner stopped` only after the process exits; otherwise it reports `runner still running` and returns failure. The upstream `run.sh` source installs its process-group trap when `RUNNER_MANUALLY_TRAP_SIG` is set; this wrapper sets that documented mode. The service wrapper also converts SIGTERM to SIGINT, so this wrapper does not claim completion merely because a signal was sent.

This skeleton does not claim Windows service support. If you need automatic startup, follow the current GitHub and WSL2 guidance and test that separately.

## Black Box CLI for agent-triggered runs

The CLI queues the same trusted workflow without opening a pull request. It sends repository metadata and an exact commit SHA to the Worker. The Worker stores a durable manual request, and the existing reconciliation schedule dispatches it to the home runner.

Keep the operator token outside the checkout. In Ubuntu, create `~/.config/black-box/operator.env` with mode `600`:

```bash
install -d -m 700 "$HOME/.config/black-box"
cat >"$HOME/.config/black-box/operator.env" <<'EOF'
export BLACKBOX_URL="https://blackbox-worker-dispatcher.ynrdevs.workers.dev"
export BLACKBOX_OPERATOR_TOKEN="<paste-the-operator-token-here>"
EOF
chmod 600 "$HOME/.config/black-box/operator.env"
source "$HOME/.config/black-box/operator.env"
```

Run it from this checkout:

```bash
runner/bin/bb run --repo NachikethReddy/AMR-Fan-App --workflow black-box-ci.yml --ref main --commit "$(git rev-parse HEAD)" --json
runner/bin/bb status <REQUEST_ID> --json
runner/bin/bb watch <REQUEST_ID> --json
runner/bin/bb rerun <REQUEST_ID> --json
```

`bb run` returns exit code `0` for a completed successful request, `1` for a completed failed request, and `2` for a pending, superseded, refused, or unreachable request. A manually triggered run is diagnostic until its exact commit and required checks are visible in GitHub. It cannot approve another commit.

## 6. Optional host telemetry

The dashboard's Runners and Storage views can show measured WSL values when the telemetry agent is enabled. It sends only CPU, memory, disk, Docker readiness, hostname, and runner identifiers to the Black Box Worker. It does not send source files, logs, environment variables, or credentials.

Create a protected environment file inside Ubuntu:

```bash
install -d -m 700 "$HOME/.config/black-box"
cat >"$HOME/.config/black-box/telemetry.env" <<'EOF'
BLACKBOX_URL=https://blackbox-worker-dispatcher.ynrdevs.workers.dev
BLACKBOX_HOST_AGENT_TOKEN=<paste-the-worker-secret-here>
BLACKBOX_HOST_ID=black-box-vbook
BLACKBOX_RUNNER_NAME=black-box-vbook
BLACKBOX_STATE_ROOT="$HOME/.local/share/black-box-runner"
EOF
chmod 600 "$HOME/.config/black-box/telemetry.env"
```

Run one sample from the repository checkout:

```bash
python3 runner/scripts/telemetry.py
```

For a user-level timer, copy the service and timer files to `~/.config/systemd/user`, change the service's `ExecStart` to the absolute path of this checkout, then run:

```bash
systemctl --user daemon-reload
systemctl --user enable --now black-box-telemetry.timer
systemctl --user status black-box-telemetry.timer
```

If WSL is stopped, telemetry becomes stale. The dashboard reports that state instead of treating the runner as ready.

`start.sh` requires both `$HOME/actions-runner/.runner` and `$HOME/actions-runner/.credentials` after registration. It also exports `$HOME/.local/bin` for the pinned tools, enables the runner's documented manual signal trap for this explicit session, and checks that `run.sh` remains alive briefly before reporting success.

## 7. Clean job-owned transient state

The cleanup script is a dry run unless `--apply` is supplied:

```bash
./scripts/cleanup.sh
./scripts/cleanup.sh --apply
```

It can remove only direct children of `$HOME/.local/share/black-box-runner/state/transient`. `start.sh` runs cleanup before `run.sh` accepts jobs. With Docker required, startup also removes only containers and volumes bearing `com.blackbox.runner.owner=black-box-ci`. The CI job template must apply that exact Docker label when creating temporary containers and volumes. Unlabeled or differently labeled Docker resources remain untouched. It refuses mounted-Windows paths, symlinks, root-like paths, and any other state directory. It refuses cleanup while the runner is live. It does not remove the runner installation, cache, workspace, logs, PID file, GitHub registration, Docker images, or build cache. It never runs a global Docker prune.

## 8. Keep local CI history and cache evidence

The local history tool stores bounded, redacted evidence outside the repository. It uses SQLite with a searchable log index, so it still works when the Worker or the PC is offline. A cache event records an outcome and a reason. It does not claim a cache hit when the runner did not measure one.

Initialize the store, then ingest reports from a completed job:

```bash
python3 runner/scripts/history.py init
python3 runner/scripts/history.py record-run --run-id <run-id> --repo <owner/repo> --workflow CI --job test --commit <40-char-sha> --outcome passed --duration-ms 1250 --runner black-box-vbook
python3 runner/scripts/history.py ingest-log --run-id <run-id> --repo <owner/repo> /path/to/job.log
python3 runner/scripts/history.py ingest-junit --run-id <run-id> --repo <owner/repo> --attempt 1 /path/to/junit.xml
python3 runner/scripts/history.py cache --run-id <run-id> --kind docker --key <image-lineage> --outcome reused --reason 'unchanged Dockerfile'
python3 runner/scripts/history.py manifest --run-id <run-id> --repo <owner/repo> --workflow CI --job test --commit <40-char-sha> --command 'pnpm test' --workdir "$PWD" --environment-fingerprint <64-char-sha256> --lockfile-hash <64-char-sha256> --service 'postgres@sha256:<digest>' --test-selection 'tests/auth.test.ts'
python3 runner/scripts/history.py search 'Connection refused'
python3 runner/scripts/history.py doctor
```

Use `reused`, `rebuilt`, `downloaded`, `evicted`, or `unknown` for cache outcomes. The correctness contract is simple: deleting all cache state may make a job slower, but it must not change whether the code passes. Keep detailed logs and traces on the host only as long as the retention policy allows:

```bash
python3 runner/scripts/history.py prune --max-log-rows 50000 --max-test-rows 50000 --max-cache-rows 50000
```

The importer redacts common GitHub tokens and bearer values, truncates each log at 2 MiB, and keeps test attempts separate. Redaction reduces exposure; it is not proof that arbitrary output contains no secret. Do not copy the SQLite database into the repository or attach it to a public issue.

An execution manifest is a replay description, not a copied runner environment. It records the tested revision, command, workspace, lockfile and environment fingerprints, service-image references, and test selection. It rejects secret-like assignments and never stores environment variables, credentials, or temporary files. A future `bb reproduce` command can use it to create a clean workspace; this version only records the evidence.

## 9. Inspect a managed cache policy

The cache helper gives a trusted repository and Docker image lineage a stable identity. It prepares a named BuildKit `docker-container` builder and records the storage limits that BuildKit should enforce. It does not run Docker, remove cache data, or infer a cache hit from a directory listing unless you explicitly request the operation.

Start from the example and replace `YOUR_USER` with the WSL username:

```bash
cp config/cache-policy.example.json config/cache-policy.json
chmod 600 config/cache-policy.json
python3 scripts/cache.py --config config/cache-policy.json inspect
python3 scripts/cache.py --config config/cache-policy.json prepare
python3 scripts/cache.py --config config/cache-policy.json inventory
python3 scripts/cache.py --config config/cache-policy.json manifest
```

The `prepare` command is a dry run. `prepare --apply` is the explicit operator action that creates the owned cache directory and invokes `docker buildx create`. It refuses mounted-Windows paths, ambiguous ownership markers, unsupported labels, and disabled policies. The cache helper never runs `docker system prune`; BuildKit's configured garbage collection owns its cache budget.

The policy is intentionally scoped to a trusted repository and image lineage. Do not point it at a public or fork-controlled workflow, and do not commit `cache-policy.json` if it contains a private path or local policy. A cold cache may make a job slower, but deleting cache state must not change whether the job passes.

## 10. Diagnose the host before a real run

Run the read-only doctor after WSL starts and before asking GitHub to queue work:

```bash
./scripts/doctor.sh
```

It checks the Linux/WSL marker, runner-owned paths, registration files, Docker reachability, disk headroom, current Linux memory, the cgroup memory limit, and the runner process. It returns a nonzero status for blocking issues. It does not install packages, start the runner, remove containers, change WSL limits, or contact GitHub. A warning is diagnostic evidence, not a performance guarantee.

## Validation on a non-Windows host

From this directory:

```bash
./tests/validate.sh
```

The validation checks shell syntax, executable scripts, the required label, and that configured paths stay off `/mnt`. It does not prove WSL2, Docker Desktop integration, GitHub registration, network access, or real job execution. Run ShellCheck separately when available:

```bash
shellcheck scripts/*.sh tests/*.sh
```

## Optional Windows launcher

From PowerShell, pass the Ubuntu path to this repository's `runner` directory:

```powershell
.\scripts\start-wsl.ps1 -Distro Ubuntu -LinuxProjectRunnerDir /home/YOUR_USER/BlackBox/runner
```

The helper opens a visible WSL session, starts the runner, prints status, and leaves an interactive Ubuntu shell open so WSL remains active until you close it. It does not set up Windows startup.

## Package manager version in jobs

If a repository job uses pnpm, use the version declared by that repository's `packageManager` field in `package.json` through Corepack. This runner skeleton does not pin a global pnpm version or install one on the host.

### PowerShell syntax check

From the Ubuntu WSL shell, parse the helper with the Windows PowerShell executable before running it:

```powershell
& /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command '$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile("\\wsl.localhost\Ubuntu\home\vbook\BlackBox\runner\scripts\start-wsl.ps1", [ref]$tokens, [ref]$errors) > $null; if ($errors.Count) { exit 1 }'
```

Replace `Ubuntu` and the checkout path if the WSL distribution or checkout differs.
