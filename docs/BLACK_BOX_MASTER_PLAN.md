# Black Box master plan

Status: planning baseline, 30 September 2026

Black Box is a home-first GitHub Actions execution and feedback system. GitHub remains the workflow interface and source of truth for this project. Black Box supplies the runner, local caches, host telemetry, searchable evidence, a CLI for developers and agents, and a dashboard for understanding runs.

The first production host is expected to be an Ubuntu Server machine with an Intel i9 13th-generation H-series CPU, 16 GB RAM, and approximately 750 GB available SSD space. The starting capacity is one concurrent job. A second provider can be enabled later, but no fallback should spend money or consume protected GitHub-hosted minutes unless an explicit policy authorizes it.

## Product promise

A developer should be able to keep an ordinary GitHub Actions workflow and choose Black Box with a small runner change or a controlled dispatch wrapper. The result must:

- test the exact intended commit;
- show a normal GitHub check and run link;
- reuse safe local state when it is valid;
- explain time, cache, and failure evidence;
- let a developer or coding agent run the same checks without opening a throwaway PR;
- recover visibly when the home computer is off, busy, restarted, or disconnected;
- never execute untrusted fork code on the home machine by accident;
- never turn an unknown provider or dispatch result into a green check.

The system is not promised to be a GitHub outage replacement in the first releases. GitHub still owns workflow parsing, job assignment, Actions execution protocol, checks, and most log delivery. Full independence is a later product line.

## Current baseline

The repository already contains these pieces:

- A Cloudflare Worker and D1 request store for signed GitHub events, allowlisted repositories and actors, home-first selection, durable leases, duplicate protection, bounded reconciliation, exact revision checks, and paid fallback disabled by default.
- A private GitHub App installed for `NachikethReddy/AMR-Fan-App`.
- A Linux Actions runner registered as `black-box-linux`, previously hosted in WSL2 on the Windows PC.
- Runner scripts for prerequisites, lifecycle, startup cleanup, telemetry, cache policy, local SQLite history, FTS5 log search, JUnit ingestion, cache events, execution manifests, and a read-only doctor.
- A dashboard served by the Worker with GitHub OAuth scaffolding, run history, logs, runners, host metrics, filters, and the Black Box visual direction.
- An AMR workflow template that passes a provider, exact commit, request ID, source ref, source event, and pull request number to a single authoritative workflow.

These capabilities are code-level foundations. They do not yet prove a live AMR success, deliberate failure, warm cache, Docker/database run, host telemetry run, real-time step timeline, or speed improvement. The acceptance plan must keep those distinctions.

## System shape

```text
                         GitHub
     push / pull request / manual dispatch / workflow events
                            |
                            v
                   Black Box GitHub App
                    checks + webhook events
                            |
                            v
                    Cloudflare Worker + D1
       admission, dedupe, policy, provider choice, request state
                            |
                 signed agent control channel
                            |
                            v
                    Ubuntu Black Box Agent
       runner health, queue, process control, telemetry, local API
                            |
          +-----------------+------------------+
          |                                    |
          v                                    v
  GitHub Actions runner                 Black Box local services
  one job at a time                     SQLite, FTS5, cache manager,
  exact workflow checkout               artifact/log evidence, CLI API
          |                                    |
          +-----------------+------------------+
                            v
                         NVMe SSD
        package stores, BuildKit, image store, git objects, logs

Optional later providers: GitHub-hosted Actions or Blacksmith.
They are selected by policy before dispatch. They are never an implicit
OR hidden in a `runs-on` expression.
```

The Ubuntu agent is the important new boundary after the OS migration. The Worker should not receive source files, raw job logs, secrets, or large cache blobs. The Worker stores compact request state and policy decisions. The agent owns local execution and detailed evidence.

## Integration levels

Black Box should offer three integration levels rather than claiming every feature is transparent:

| Level | Developer change | Capabilities |
| --- | --- | --- |
| Host-managed | Existing workflow commands remain unchanged. | Runner label, admission, cleanup, host telemetry, timing, basic history. |
| Small opt-in | Add a reporter, setup action, or a few inputs. | JUnit, Playwright traces, managed BuildKit, cache explanations, PR summary. |
| Explicit advanced task | Use a Black Box command or task definition. | Agent-triggered runs, reproduction, affected-task selection, output caching, previews. |

The default path stays ordinary GitHub Actions YAML. Advanced features must be removable without changing test correctness.

## Feature catalogue

### 1. `bb` CLI and agent interface

The CLI is the developer and coding-agent entry point. Every command must support human output and stable `--json` output. JSON should include request IDs, run IDs, URLs, tested SHA, provider, state, conclusion, and error codes. It must never print credentials.

Initial commands:

```text
bb auth status
bb doctor
bb run --repo OWNER/REPO --workflow black-box-ci.yml --ref main
bb run --repo OWNER/REPO --workflow black-box-ci.yml --commit SHA
bb run --file .github/workflows/black-box-ci.yml --ref HEAD
bb watch REQUEST_OR_RUN_ID
bb status REQUEST_OR_RUN_ID
bb logs REQUEST_OR_RUN_ID [--job JOB] [--follow]
bb rerun REQUEST_OR_RUN_ID [--failed-jobs]
bb cancel REQUEST_OR_RUN_ID
bb explain REQUEST_OR_RUN_ID
bb reproduce REQUEST_OR_RUN_ID [--job JOB]
bb compare RUN_A RUN_B
bb cache status
bb cache explain REQUEST_OR_RUN_ID
bb host status
bb provider list
bb config validate
```

CLI rules:

- `bb run` creates a durable request through the Worker, then polls the Worker and GitHub APIs without holding a process open on the home machine.
- `--commit` is immutable and must be a 40-character SHA. `--ref` resolves to a SHA before dispatch and records that resolution.
- A local uncommitted run records a patch digest and is never allowed to approve a different committed revision.
- `bb watch` should use bounded polling and return a useful exit status: zero for a successful required check, nonzero for failure, stale, cancelled, or unresolved state.
- `bb logs` downloads logs through the Worker or agent, redacts them before local indexing, and supports `--since`, `--grep`, `--job`, and `--step` filters.
- `bb rerun` must preserve the first attempt and state why the second attempt was requested. It must not rerun an ambiguous request until the original run is reconciled.
- `bb reproduce` uses a saved execution manifest and a clean workspace. It must say which inputs could not be recreated.
- `bb explain` is read-only by default. A future `bb fix` may produce a patch, but it cannot push or weaken a test without an explicit confirmation.

The CLI is also the agent API. A coding agent should be able to run one exact check, inspect structured results, search related failures, and retrieve a bounded evidence bundle without parsing a web page.

### 2. Workflow compatibility and exact revisions

Black Box must preserve GitHub Actions semantics where it claims compatibility:

- workflow inputs and matrix values remain GitHub-owned;
- `needs`, `if`, permissions, environments, secrets, artifacts, and action versions remain workflow-owned;
- the dispatch wrapper passes `commit_sha`, `head_sha`, `source_ref`, `source_event`, `pr_number`, `provider`, and `request_id`;
- the workflow checks out `commit_sha` explicitly and runs a verification step that records it;
- the Worker stores the workflow file revision, tested SHA, PR head SHA, base SHA, merge SHA when applicable, provider, run ID, run attempt, and check IDs;
- stale PR results cannot update a newer head;
- a queued or unresolved request cannot become `neutral`, `skipped`, or `success`;
- the workflow file must exist on the dispatch ref required by GitHub's `workflow_dispatch` behavior;
- event-specific expressions are audited because a manual dispatch does not recreate the original `pull_request` event payload.

A migration tool should scan workflows for uses of `github.sha`, `github.ref`, `github.event.pull_request`, event-specific `if` conditions, concurrency groups, deployment environments, and fork handling. It should report findings instead of rewriting them silently.

### 3. Provider routing and resilience

Provider choice is a policy decision made before GitHub dispatch. The initial provider states are:

```text
home:        trusted Ubuntu runner, zero hosted-minute charge
waiting:     retain work until home is eligible
github:      optional explicitly enabled fallback
blacksmith:  optional explicitly enabled fallback
```

Routing policy:

- home online and idle: dispatch home;
- home online and busy: queue, unless an explicit cost policy says burst is allowed;
- home offline: select an enabled fallback or retain a waiting request;
- unknown runner inventory: do not spend money and do not dispatch blindly;
- provider credentials missing: provider is unavailable, not eligible;
- dispatch response lost: mark ambiguous and reconcile by request ID, workflow path, ref, and time window;
- home disappears after dispatch: preserve the attempt, mark it stalled, and require controlled recovery until automatic cancellation and redispatch are proven;
- newer PR head: supersede pending work and prevent old results from approving it;
- GitHub delivery failure: inspect delivery history or provide a manual redelivery path.

A later provider adapter interface can support cloud or Blacksmith without changing the Worker domain model:

```text
Provider
  health()
  capacity()
  estimate(request)
  admit(request)
  dispatch(request)
  reconcile(request)
  cancel(request)
  collect(request)
```

The system must track cost authority separately from provider availability. A user can allow Blacksmith but still set a per-run or monthly spend cap of zero.

### 4. Ubuntu host management

The Ubuntu migration is a prerequisite for reliable Docker, systemd, KVM, and later disposable execution. Start with Ubuntu Server LTS, a dedicated CI user, a dedicated filesystem path, and one concurrent job.

Host preparation checklist:

- backup Windows data and verify a restore path before reinstalling;
- record CPU model, physical and logical cores, RAM, SSD model, firmware, and available space;
- enable hardware virtualization in firmware if later KVM is desired;
- use a wired or reliable network path where possible;
- install Git, curl, ca-certificates, Docker Engine and Compose v2, Node/pnpm only if workflows need them outside containers, Tailscale, SQLite, and monitoring tools;
- keep runner, workspaces, package stores, Docker data, BuildKit data, and Black Box evidence on the Linux filesystem, not a mounted Windows path;
- create a non-root `blackbox` service user and a separate operator account;
- use systemd for the agent, runner, telemetry, cleanup, and scheduled reconciliation;
- set journald limits and rotate runner logs;
- reserve free disk space for emergency cleanup;
- configure Tailscale Serve for private dashboard/SSH access. Use Funnel only if a public endpoint becomes necessary;
- configure host sleep, reboot, and update policy so the agent can enter draining mode before maintenance;
- measure idle power, peak power, thermals, and sustained CPU frequency before claiming speed.

Ubuntu's documentation covers QEMU/KVM, libvirt, cloud images, cloud-init, and nested virtualization. Those are future isolation tools, not a reason to delay the first persistent runner. The first runner can execute directly as a dedicated user on Ubuntu, with trusted repositories only.

### 5. Runner lifecycle

Release the lifecycle in increasing isolation:

**Persistent trusted runner:** one named runner, one job at a time, startup cleanup, explicit work directory, and exact repository allowlist.

**Managed persistent runner:** the agent owns start, stop, drain, health, update, and runner labels. It reports assigned, started, completed, cleanup, and stranded states.

**Ephemeral runner:** configure one runner for one job, forward its runner logs, wipe the workspace, and deregister it after completion. This is the recommended long-term model for untrusted or mixed workloads.

**Disposable VM runner:** use KVM/QEMU or Firecracker only after the workload matrix and cache semantics are stable. Keep the cache volumes separate from the job root. Do not implement a VM fleet before the persistent runner has live evidence.

Admission checks:

- runner process online and assigned labels match;
- Docker daemon ready if the workflow uses container actions or service containers;
- required disk headroom;
- required RAM and swap policy;
- cache roots mounted and writable;
- no stale CI-owned containers, volumes, workspaces, or leases;
- Tailscale and outbound GitHub connectivity healthy;
- host not draining or under thermal protection.

Lifecycle controls:

```text
ready -> admitting -> running -> collecting -> cleaning -> ready
ready -> draining -> stopped
running -> interrupted -> reconciling
```

The agent must refuse new work in `draining` mode and finish or reconcile the current job before maintenance.

### 6. Cache system

Black Box should treat cache deletion as a performance event, never a correctness event. Every cache has an owner, type, compatibility key, size, last use, creation time, eviction reason, and trust scope.

Cache layers:

| Cache | First implementation | Later implementation |
| --- | --- | --- |
| Package stores | pnpm/npm/pip/uv/cargo stores on NVMe with explicit paths. | Cross-machine authenticated cache if useful. |
| BuildKit | Stable per-repository or image-lineage builders, cache mounts, configured GC. | Copy-on-write cache snapshots for concurrent jobs. |
| Docker images | Local image store and explicit prewarm list for Postgres, browsers, Node, and common bases. | Registry mirror and shared image service. |
| Git objects | Optional bare mirrors and delta fetch for trusted repositories. | Shared mirror service with retention. |
| Actions cache | Continue GitHub cache first. Record hits and misses. | Transparent local cache proxy only after protocol, auth, scope, and invalidation tests. |
| Task outputs | Explicit task definitions and input hashes only. | Cross-device remote cache. |

Cache key inputs should include repository, task or image lineage, operating system, architecture, tool versions, lockfile hashes, and relevant configuration. A source-only change should reuse dependency layers while rebuilding application layers.

BuildKit policy:

- use `docker buildx` with a stable builder name;
- use cache mounts for package managers and compiler caches;
- configure GC with age, size, and free-space thresholds;
- keep project cache scopes separate enough to avoid unrelated eviction;
- never mount secrets into a persisted cache;
- emit cache events: hit, partial hit, miss, rebuild, downloaded, stored, evicted, unknown;
- record cache fingerprints without storing source or credentials;
- test after reboot, Docker restart, builder recreation, and low disk conditions.

Transparent GitHub Actions cache routing is a separate project. GitHub documents that self-hosted runner dependency caches normally remain in GitHub-owned storage. A local proxy must reproduce GitHub's cache protocol, authorization, scope rules, compression, immutability, branch fallback, and failure behavior. It must be opt-in until correctness is proven.

### 7. Docker and service workloads

Docker support must be a first-class workload profile because AMR uses Docker and PostgreSQL.

The profile should provide:

- Docker Engine readiness and version in the environment fingerprint;
- Compose v2 validation before job admission;
- CI-owned labels on all containers and volumes;
- isolated project names and ports;
- disposable database data directories;
- health checks and bounded startup waits;
- post-job cleanup plus startup orphan cleanup;
- persistent image and BuildKit caches kept outside the disposable workspace;
- no global `docker system prune`;
- bounded log collection for service containers;
- a failure bundle containing Compose config digest, image digests, health status, and recent service logs.

The AMR preflight should remain a separate acceptance gate. A job that passes because a stale database volume survived is a false result.

### 8. Logs, timing, and host telemetry

The dashboard and CLI should present one timeline with these distinct segments:

```text
request accepted
provider selection
waiting for host
GitHub dispatch
GitHub queue
runner preparation
checkout and dependency setup
step execution
cleanup
log collection
result publication
```

Record step timing from GitHub's jobs API where available, and use runner hooks for local markers. Runner hooks are synchronous and have no built-in timeout, so Black Box hooks need their own short timeout and must not perform heavy indexing.

Host telemetry should include:

- CPU utilization and frequency where available;
- load average and per-core pressure;
- total, available, and swap memory;
- disk free space, IO pressure, and cache directory sizes;
- Docker daemon readiness and container statistics;
- runner state and current request ID;
- temperature or thermal throttling when exposed by the hardware;
- network bytes and DNS/registry timing metadata without recording sensitive payloads.

Host-wide measurements must not be presented as exact job attribution. The dashboard should say `host-wide` when multiple processes share the machine.

Logs:

- download job logs after completion through an agent or Worker proxy, not through D1;
- redact bearer tokens, GitHub tokens, common secret assignments, URLs with credentials, and configured secret names;
- store bounded logs and FTS5 indexes locally;
- keep compact summaries and links in GitHub checks;
- retain detailed logs by age and byte budget;
- make local history unavailable state explicit when the PC is offline;
- preserve original evidence separately from normalized search text.

### 9. Structured test intelligence

Prefer machine-readable reports over terminal parsing.

Initial formats and evidence:

- JUnit XML for unit/integration suites;
- Playwright JSON or blob reports, traces, screenshots, video, and network metadata;
- coverage reports as artifacts and summaries;
- Docker/service failure bundles;
- compiler and linter annotations when file and line information is trustworthy.

Store a stable test identity composed of repository, workflow/job, test project, file, full test name, parameters, environment fingerprint, tested SHA, run ID, attempt, result, duration, and normalized failure signature.

Derived features:

- new failure versus known failure;
- failure groups by normalized exception and stack;
- slow-test history;
- suspected flaky behavior when the same revision varies across comparable attempts;
- retry history that never erases the first failure;
- changed-test and affected-project selection when repository tooling provides a graph;
- quarantine proposals with owner, reason, approval, and expiry;
- test partitioning based on measured duration only when concurrency and memory allow it.

A retry is diagnostic evidence. A passing retry does not turn the original required check green unless policy explicitly defines that behavior and preserves both attempts in the summary.

### 10. Reproduction and debugging

Every completed run should have an execution manifest containing:

- repository and tested SHA;
- workflow definition SHA;
- runner profile and environment fingerprint;
- command, arguments, working directory, and test selection;
- lockfile hashes and tool versions;
- service images and digests;
- timezone and random seed where available;
- selected non-secret configuration;
- cache state and relevant cache keys;
- links to logs, traces, artifacts, and reports.

`bb reproduce` should create a clean workspace, prepare disposable services, run the recorded command, and publish a diagnostic attempt. It must not copy an old runner filesystem, credentials, or unrelated state. It must state when exact replay is impossible because an external service, image, secret, or time-dependent input changed.

Later debugging modes:

- authenticated SSH into a running trusted job through Tailscale;
- browser view of Playwright traces and screenshots;
- service-container logs and health timeline;
- network download report;
- one-click reproduction from the dashboard or GitHub check action.

### 11. Dashboard

The dashboard should keep the dense dark visual direction already chosen, with original Black Box branding and `ynrlib/icons`. It should use real GitHub data and clearly distinguish GitHub data, local agent data, and unavailable data.

Primary navigation:

- Run History;
- Workflow and job detail;
- Logs and global search;
- Monitors for slow jobs and repeated failures;
- Runners and provider health;
- Machine definitions and workload profiles;
- Caches and storage;
- Artifacts and evidence bundles;
- Settings, trust policy, provider policy, and retention.

Run History should support filters by repository, workflow, event, branch, actor, provider, runner, result, cache condition, and time range. A detail page should show exact SHA, original event, provider decision, timeline, jobs, steps, logs, cache events, host telemetry, test failures, and reproduction actions.

Dashboard auth:

- GitHub OAuth is for the human dashboard only;
- GitHub App installation tokens stay server-side;
- session cookies are encrypted, short-lived, same-site by default, and revoked on logout;
- dashboard actor allowlist gates host telemetry and sensitive evidence;
- local agent authentication uses a separate token and request signing;
- no raw secrets or installation tokens reach the browser.

### 12. AI and coding-agent integration

AI is an evidence consumer, not the execution authority.

The deterministic pipeline should first:

1. identify the exact failed job and attempt;
2. extract relevant log regions;
3. parse structured test reports;
4. find changed files and related historical failures;
5. compare timings and environment fingerprints;
6. redact and bound the evidence;
7. ask the model for facts, hypotheses, and proposed next actions.

AI actions:

- explain a failure with links to evidence;
- summarize a regression and likely cause;
- suggest a workflow or cache improvement;
- propose a test repair;
- generate a patch in a separate worktree;
- run a bounded validation set;
- present the patch for review.

The model may not:

- approve its own patch;
- weaken or skip tests to make a check green;
- change provider spending policy;
- access secrets or untrusted network destinations without policy;
- push or merge without explicit operator authorization;
- treat logs, PR text, source comments, or test output as tool instructions.

GitHub Check requested actions can expose `Explain`, `Reproduce`, `Rerun`, and later `Propose fix` buttons. A proposed fix must create a separate attempt and keep the original result visible.

### 13. Security and trust model

The home runner is a trusted-code environment, not a universal public CI service.

Trust policy should be explicit at repository, branch, actor, event, and provider levels:

- private allowlisted repositories by default;
- trusted collaborators only;
- fork pull requests denied on the home runner unless manually approved and isolated;
- `pull_request_target` and similar privileged events never run arbitrary fork code on the home host;
- secrets are not written to caches, logs, manifests, traces, or AI prompts;
- package and Docker caches are treated as untrusted input when restored;
- GitHub App permissions are minimal: contents read, checks write, actions read, metadata read, and runner administration only where lifecycle automation requires it;
- operator endpoints require a separate token and audit trail;
- local agent requests are authenticated and replay-protected;
- all external callbacks are signed and deduplicated;
- artifacts and images are identified by digest;
- destructive cleanup requires exact CI ownership labels and safe path checks.

Before public or mixed-trust workloads, use ephemeral runners or disposable VMs. Persistent host execution must remain limited to trusted code.

### 14. Artifacts, provenance, and retention

Separate these data classes:

- cache: reusable inputs or intermediate data that can be regenerated;
- artifact: output to inspect or pass between jobs;
- evidence: logs, traces, test reports, manifests, and host metrics;
- provenance: commit, workflow, toolchain, image digest, and builder identity.

Retention policy should be configurable by class and repository. Detailed logs and traces get a bounded local retention window. Aggregate timing and failure history live longer. Old cache entries are evicted by policy. Artifact attestations and SBOMs are optional for private repositories because GitHub plan availability differs from public repositories.

For container outputs, record image digest, Dockerfile digest, base image digest, build arguments that are safe to disclose, and builder environment. Add signing and attestation only after the normal build and artifact path is stable.

### 15. Resource scheduling

Start with one job. Add admission control before adding concurrency.

A job profile should declare estimated CPU, memory, disk, Docker, browser, network, and trust requirements. The agent records observed values and updates estimates.

Profiles:

```text
small:       1-2 CPU, 2-4 GB, no browser, no Docker
standard:    2-4 CPU, 4-8 GB, Docker optional
integration: 2-4 CPU, 6-10 GB, Docker + database
browser:     2-4 CPU, 6-10 GB, Playwright artifacts
heavy:       explicit opt-in, only when measured safe
```

On a 16 GB machine, reserve memory for Ubuntu, Docker, the agent, and filesystem cache. Do not allocate the full 16 GB to a job. Start with one job and add a second only after stress tests demonstrate acceptable swap, thermal, and disk behavior.

Queue policies:

- supersede old pending PR revisions;
- prevent one repository from starving others;
- preserve FIFO within a priority band;
- prioritize a manually requested diagnostic run only with an explicit reason;
- never treat a busy home machine as authorization to spend money;
- enter draining mode before updates and planned shutdown.

### 16. Agent and tool integrations

The first agent integration is the `bb` CLI with JSON output. A later local HTTP or MCP-style interface can expose read-only tools:

```text
list_recent_runs
get_run
get_job_logs
search_logs
get_test_history
get_cache_explanation
get_host_status
reproduce_failure
```

Mutation tools should be separate and guarded:

```text
request_run
rerun_request
cancel_run
propose_patch
publish_check_summary
```

Every tool must include repository and revision context. The agent should be able to prove which run it inspected before proposing a change.

## Release plan

### Release 0: Ubuntu migration and live baseline

Deliver:

- Ubuntu Server installation and backup confirmation;
- Docker Engine, Compose, Git, Tailscale, systemd, and runner setup;
- one trusted AMR workflow on the persistent runner;
- startup cleanup and drain mode;
- host fingerprint and one baseline run;
- a cold run, warm run, deliberate failure, and Docker/database run;
- evidence saved under `.evidence/ubuntu-baseline/`.

Exit criteria:

- exact commit recorded and verified inside the job;
- runner can be drained and restarted without duplicate work;
- no unrelated Docker resources are removed;
- warm run is measured, not assumed;
- the system remains correct with caches deleted.

### Release 1: `bb` CLI and control API

Deliver:

- Worker `POST /requests` for authenticated operator/CLI requests;
- `bb run`, `watch`, `status`, `logs`, `rerun`, `cancel`, and `doctor`;
- stable JSON schema and exit codes;
- exact SHA resolution and patch digest for local work;
- request-to-run correlation in the dashboard.

Exit criteria:

- an agent can trigger AMR without a PR;
- the same workflow and checks run as the GitHub path;
- ambiguous dispatch does not create duplicate runs;
- the CLI can return structured failure evidence.

### Release 2: Managed Docker and caches

Deliver:

- stable BuildKit builder identity;
- package stores and cache mounts;
- Docker image prewarm and storage budgets;
- cache event instrumentation and explanations;
- GC policy, low-disk admission, and reboot verification;
- cache dashboard.

Exit criteria:

- cold, unchanged warm, and source-only change measurements exist;
- cache hit/miss reasons are evidence-backed;
- cache deletion changes runtime only, not correctness;
- the machine keeps an emergency free-space reserve.

### Release 3: Observability and test history

Deliver:

- step and workflow timing ingestion;
- host telemetry with attribution labels;
- JUnit and Playwright report ingestion;
- local SQLite/FTS5 log search;
- failure grouping, slow tests, and suspected-flake views;
- PR check summaries and annotations.

Exit criteria:

- a deliberately slowed step is identified;
- a known failure links to prior evidence;
- logs are redacted and bounded;
- local history outage is visible in GitHub summaries.

### Release 4: Reproduction and developer workflows

Deliver:

- execution manifests;
- `bb reproduce` with clean workspace and disposable services;
- evidence bundles for Playwright and Docker failures;
- pre-push or agent patch validation with separate status;
- optional affected-project selection and task output caching.

Exit criteria:

- a seeded failure reproduces from its manifest;
- a patch run cannot approve a different commit;
- original failures remain visible after diagnostic retries.

### Release 5: AI assistance

Deliver:

- bounded evidence assembler;
- explain and summarize actions;
- historical failure context;
- proposed workflow/cache/test fixes;
- patch worktree and validation runner;
- human review gate.

Exit criteria:

- AI claims link to observed evidence;
- no secret or raw unbounded log is sent;
- a failed proposed fix stays failed;
- no automatic test weakening, push, merge, or spend.

### Release 6: Provider fallback and higher isolation

Deliver:

- provider adapter interface;
- explicit GitHub-hosted or Blacksmith configuration;
- per-run and monthly cost caps;
- pre-dispatch fallback tests;
- interrupted-run recovery;
- ephemeral runner mode;
- disposable VM or microVM mode for trusted-but-less-trusted workloads.

Exit criteria:

- no provider is used without policy;
- old and new attempts cannot race to publish a result;
- fallback is measured for latency and cost;
- ephemeral runner logs are retained externally;
- the persistent mode remains the default for trusted AMR work.

### Release 7: Transparent cache and advanced performance

Deliver only after the previous releases are stable:

- opt-in GitHub Actions cache protocol proxy;
- local registry mirror;
- copy-on-write BuildKit cache snapshots;
- Git mirror acceleration;
- task output cache;
- test partitioning based on historical duration;
- network bottleneck analysis;
- prepared runner environments.

Exit criteria:

- protocol compatibility tests pass for hit, miss, restore key, branch scope, compression, auth failure, and storage failure;
- disabling the proxy returns to normal GitHub cache behavior;
- cache scope cannot leak data between repositories;
- benchmark results include cold, warm, rebooted, and low-disk cases.

## One-night build order after Ubuntu is ready

The overnight objective should be a safe vertical slice, not the entire platform:

1. Capture host and network facts, install Ubuntu prerequisites, and verify Docker, Tailscale, GitHub connectivity, and disk paths.
2. Run the existing runner doctor and migrate the runner path to Linux.
3. Run the AMR preflight and one known-good workflow at an exact SHA.
4. Add `bb run` against the existing Worker request model or implement the smallest authenticated request endpoint.
5. Add `bb watch --json`, `bb logs`, and structured exit codes.
6. Install runner start, telemetry, cleanup, and drain systemd units.
7. Run cold, warm, deliberate-failure, and restart tests.
8. Record timings, cache events, and evidence under `.evidence/ubuntu-baseline/`.
9. Commit the verified slice and update the dashboard to show the new request/run correlation.

Do not spend the night on Firecracker, a transparent Actions cache proxy, ClickHouse, AI patching, multi-machine scheduling, or a second workflow language. Those depend on evidence from the vertical slice.

## Acceptance and benchmark matrix

| Test | Setup | Required proof |
| --- | --- | --- |
| Exact revision | Dispatch branch and explicit SHA | Job output, manifest, and Worker record agree. |
| Trusted policy | Allowlisted repository and actor | Accepted request; unknown repo, actor, fork, and provider rejected. |
| CLI run | `bb run` with JSON output | Request ID, run URL, exit status, and exact SHA returned. |
| Warm package cache | Same lockfile twice | Second run records package reuse and lower download work. |
| Warm Docker build | Same Dockerfile twice | BuildKit reports reuse; image digest is recorded. |
| Source-only Docker change | Change application source only | Dependency layer reused, application layer rebuilt. |
| Cache deletion | Delete all caches | Build still succeeds, only slower. |
| Docker/database isolation | Two runs with owned resources | No stale data or port collision; unrelated resources remain. |
| Deliberate failure | Known failing test | GitHub check fails, evidence bundle contains original failure. |
| Diagnostic rerun | Rerun selected test | Attempts remain separate; pass does not erase failure. |
| Restart | Reboot or stop agent | Durable request reconciles without duplicate dispatch. |
| Offline | Host unavailable | Request waits or uses explicitly enabled provider; no spend by default. |
| Stale PR | New head before old run completes | Old result cannot approve new head. |
| Low disk | Fill reserved threshold in fixture | Admission blocks and explains why; no destructive global prune. |
| Log search | Multiple repositories and runs | Search is bounded, redacted, and authorization-scoped. |
| Host telemetry | CPU/RAM/disk/Docker | Dashboard labels host-wide measurements correctly. |
| AI explanation | Bounded known failure | Facts link to evidence; no credentials or raw archive sent. |
| Fallback | Paid provider explicitly enabled in test config | Provider choice, cost guard, and no duplicate result are recorded. |

Performance reporting must include sample size, hardware and software fingerprint, cache condition, job matrix, queue time, runner preparation, execution, cleanup, and result publication. Do not use commercial claims such as `10x` or `40x` without a paired benchmark against the same workflow and equivalent cache state.

## Data model additions

The existing D1 request record should be extended carefully rather than overloaded:

```text
requests
  request_id, event_id, repository, actor, source_event
  source_ref, commit_sha, head_sha, base_sha, merge_sha
  workflow_file, workflow_sha, provider, state
  attempt_count, workflow_run_id, workflow_run_attempt
  created_at, updated_at, expires_at, last_error

attempts
  attempt_id, request_id, provider, runner_id, state
  queued_at, started_at, finished_at, conclusion, run_url
  environment_fingerprint, manifest_path

jobs
  attempt_id, github_job_id, name, state, conclusion
  started_at, completed_at, runner_name, runner_labels

steps
  job_id, name, number, state, conclusion, started_at, completed_at

cache_events
  attempt_id, cache_type, scope, key_digest, outcome, bytes
  duration_ms, reason, created_at

artifacts
  attempt_id, name, digest, size, local_path, github_url, retention

test_results
  attempt_id, stable_test_id, outcome, duration_ms
  failure_signature, report_path, retry_number
```

D1 should hold compact control data. Detailed logs, traces, manifests, and cache blobs belong on the Ubuntu host. Any future remote storage must preserve the same authorization and retention rules.

## Cost and capacity policy

The expected infrastructure bill for home execution is electricity, storage wear, and maintenance. GitHub documents self-hosted runner execution as free, but GitHub-hosted minutes, artifact storage, cache storage, larger runners, and optional external providers have separate limits or charges. Review the active account plan before enabling fallback.

Black Box should display:

- home runtime and estimated electricity cost if configured;
- GitHub-hosted minutes used only when the provider runs there;
- Blacksmith/cloud estimated cost from provider data;
- local cache and artifact disk usage;
- retained log and trace bytes;
- provider spend caps and current month usage.

Never claim `zero cost` if a paid fallback, storage overage, AI call, public tunnel, or power cost is active.

## Deliberate non-goals

Do not build these in the first releases:

- Kubernetes or Actions Runner Controller for one machine;
- a new workflow language;
- a full GitHub Actions parser;
- a multi-tenant public CI service;
- ClickHouse, Kafka, Ceph, or object storage before SQLite and filesystem limits are measured;
- Firecracker before persistent runner correctness is proven;
- transparent cache replacement without protocol tests;
- automatic AI commits, merges, test skips, or provider spending;
- global Docker pruning;
- public exposure of the runner or SSH daemon.

## Evidence sources

- [GitHub self-hosted runner reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners): supported hosts, labels, queued-run behavior, ephemeral runners, runner scale set client, webhook signals, and network requirements.
- [GitHub REST Actions API](https://docs.github.com/en/rest/actions): workflow runs, jobs, logs, artifacts, caches, dispatch, reruns, cancellation, and runner APIs.
- [GitHub workflow dispatch and event semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): `workflow_dispatch` ref and payload behavior.
- [GitHub Checks API](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks): check runs, annotations, requested actions, rerequests, and retention.
- [GitHub dependency caching](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching): cache scope, immutability, and the fact that self-hosted caches normally use GitHub-owned storage.
- [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions): self-hosted execution, hosted minutes, artifacts, and cache storage.
- [Docker BuildKit garbage collection](https://docs.docker.com/build/cache/garbage-collection/): size, age, and cache-record policies.
- [Ubuntu Server virtualization](https://ubuntu.com/server/docs/how-to/virtualisation/): KVM, QEMU, libvirt, cloud images, and VM tooling.
- [Tailscale Serve and Funnel](https://tailscale.com/docs/reference/tailscale-cli/serve): private tailnet access versus public exposure.
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Free-plan request, CPU, D1, and Cron constraints.

