# Black Box: project plan and pipeline

Updated 29 September 2026. This repository contains the v0.1 implementation and planning artifacts. The WSL2 host is prepared but the GitHub runner is not registered. The Worker/D1 shell is deployed, but it does not activate real AMR execution until owner-controlled secrets and workflow installation are complete.

## The agreed outcome

Run trusted GitHub Actions jobs on the existing Windows 11 PC, with Ubuntu inside WSL2. Use Cloudflare Workers Free to select a runner automatically without a GitHub-hosted routing job. Keep GitHub's workflow steps, logs, and pull-request checks. Aim for zero additional infrastructure spend on the home path and a modest, measured speed improvement.

The machine is reported as a 13th-generation i9-H with 16 GB RAM, about 750 GB free storage, Windows 11, and WSL2 installed. The precise processor, Linux distribution, Docker setup, SSD type, and available RAM need checking on that PC. Start with one concurrent job.

Electricity, SSD wear, routine maintenance, and occasional cold caches are accepted tradeoffs. The PC need not run continuously. There is no requirement to beat Blacksmith's advertised speed multipliers or reinstall Windows.

First target: AMR Fan App. Tomorrow, 30 September 2026, is the desired v0.1 deadline. The six-day AI-credit window makes a small working system the priority. This is a delivery target, not a guarantee that every planned feature fits in one day.

## Evidence before commitments

Sources: official GitHub, Microsoft, Docker, Firecracker, and Cloudflare documentation; read-only GitHub repository metadata; AMR's two local workflow files. No CI runs or PC benchmarks were performed. Counts below come from named files and one repository metadata query, not a wider repository audit.

| Dimension | Status | Evidence / sample | Confidence and limit |
| --- | --- | --- | --- |
| Home execution cost | Self-hosted compute is free under current GitHub policy | Official billing documentation; 0 billing experiments | High for policy; storage and other providers are separate |
| Routing cost | Workers Free selected | Official limits; 0 deployed Worker requests | High for published allowance; real CPU use and request volume unmeasured |
| Repository access | AMR is private; current account has admin permission | 1 read-only repository metadata query | High at time checked; no App installed |
| Workflow fit | Candidate for a Linux runner in WSL2 | 2 workflow files, 4 job definitions; 0 runs | Medium from source; environment and cleanup need real testing |
| Speed | Unmeasured | 0 paired GitHub/home runs | No speed ranking or claimed multiplier |
| Automatic dispatch | Architecture selected, integration unverified | GitHub dispatch API and input support | Must prove exact commit, PR checks, retries, and offline behavior |

## What is free, and what is separate

- Home jobs: no GitHub runner-minute charge. Cloudflare routing does not consume GitHub Actions minutes.
- A GitHub-hosted job in private AMR does use the owner's allowance. That includes a tiny hosted routing job, so this design has none. Standard public-repository jobs have different billing.
- GitHub artifact/cache storage can remain chargeable beyond allowances. Self-hosting does not make all GitHub storage local. [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- Workers Free currently allows 100,000 requests per account per day and 10 ms CPU time per invocation. Network waiting is not CPU time. Requests and CPU usage still need measurement. Stay on Free; limit errors must not trigger a paid upgrade. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [limits](https://developers.cloudflare.com/workers/platform/limits/)
- A small D1 Free request table is proposed for pending jobs and duplicate detection. It has separate limits; exceeding them produces errors. Keep build logs, artifacts, and caches out of it. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- Blacksmith remains an optional paid fallback. Its installation, account eligibility, runner label, and budget are unverified. GitHub-hosted fallback requires separately allowing minute use. Neither is part of the zero-cost home path.

There is no assumed 24/7 free cloud builder. If the home PC is unavailable and no cost-allowed fallback exists, record a waiting request and retry later. Do not report a successful check or silently start paid compute.

## Drawn pipeline

```text
You push code or update a pull request
                 |
                 v
GitHub sends an event to the Black Box GitHub App
                 |
                 v
Cloudflare Worker on the Free plan
  - checks the webhook signature and trusted repository
  - records the requested commit and checks runner availability
  - chooses home, an enabled fallback, or waiting
                 |
                 | authenticated GitHub API request
                 v
GitHub starts the workflow with a selected runner input
                 |
       +---------+-----------------------------+
       |                                       |
       v                                       v
HOME: Windows 11 + WSL2                 OPTIONAL FALLBACK
Official Linux Actions runner          Blacksmith: provider cost
collects the job from GitHub            GitHub-hosted: private minutes
       |
       v
Existing AMR install, test, Docker and database commands
       |
       +---- reads/writes local disk caches
       |
       v
Runner sends logs and results directly to GitHub
       |
       v
Actions run is visible; App links the result to the original PR commit
```

The Windows PC initiates outbound HTTPS connections to GitHub. Worker does not SSH into the PC, wake a powered-off computer, or stream commands through a home port. Windows, WSL2, the runner, and Docker when needed must be running. No home port forwarding or tunnel is required for this design. [Runner communication](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)

Only event and routing metadata passes through Worker. Source checkout, dependency downloads, Docker layers, logs, and artifacts travel directly between the runner and their normal services. Cloudflare will process private repository/commit metadata and hold the App credential securely; the webhook endpoint must verify signatures and expose no public logs or job history.

The recommended implementation is one small TypeScript Worker, the official GitHub runner, a minimal request table, and setup/start/status scripts. A dashboard, custom scheduler fleet, and analytics database are unnecessary for the first working run.

## Where the workflow fits

The workflows stay in each repository's `.github/workflows/` directory. Worker calls the [workflow-dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event) with an allowlisted provider, a request identifier, and the exact commit to test. A workflow input selects the runner before the job is queued. GitHub supports `inputs` in [`runs-on` expressions](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts).

The illustrative home-only fragment below shows the connection. It is not a complete installable workflow. Checkout, existing steps, dispatch authentication, and commit validation still have to be connected.

```yaml
on:
  workflow_dispatch:
    inputs:
      runner:
        type: choice
        options: [black-box-linux]
        default: black-box-linux
        required: true
      commit:
        type: string
        required: true

jobs:
  local-checks:
    runs-on: ${{ inputs.runner }}
    # Checkout the validated commit, then preserve existing steps.
```

`black-box-linux` is a proposed custom label, not an existing registered runner. Fallback choices enter the allowlist only after setup and an explicit cost policy. No script may accept an arbitrary runner label from untrusted input.

This automatic version needs more than a one-line migration. A small launcher can call reusable CI jobs, or existing jobs can accept the dispatch inputs directly. Choose the smaller change after tracing the current triggers. A reusable-workflow call does not itself require an extra hosted routing job.

Preserve these behaviors during migration:

1. Keep AMR's test commands, pinned Actions, limited token permissions, job timeouts, manual entry point, scheduled security checks, and cancellation behavior.
2. Avoid duplicate runs from the original push/PR trigger and the new Worker dispatch. Move triggers only when their replacements are verified; do not leave hosted jobs consuming minutes unnoticed.
3. Dispatch a trusted workflow definition and explicitly checkout the intended revision. Pull-request checks currently test a merge context; preserve that behavior or obtain a separate decision before changing it. Record both the PR head and tested merge revision.
4. A dispatched run is not automatically equivalent to a native PR-triggered run. A GitHub App must associate status with the correct PR commit and preserve required-check meaning. Never attach results from an old commit to a new one.
5. Validate the webhook, repository, actor policy, provider, and commit. The dispatch API needs Actions write permission; runner-status queries and PR checks need their own permissions. A normal workflow token should not be assumed to grant runner administration.
6. Deduplicate webhook deliveries, retain pending requests, and reconcile an ambiguous API timeout before retrying. An online runner is not a capacity reservation; it can disconnect after selection. Report a waiting/failed run honestly and bound retries.

## Start with the real AMR workload

The local checkout has four Ubuntu jobs across two workflow files:

| File | Job | Work observed in source |
| --- | --- | --- |
| `.github/workflows/checks.yml` | `local-checks` | Frozen pnpm install, `pnpm check`, Expo bundle export |
| `.github/workflows/checks.yml` | `local-postgres` | Local PostgreSQL, database checks, Docker report-parser build and tests |
| `.github/workflows/security.yml` | `source-and-dependencies` | Tooling tests and security checks |
| `.github/workflows/security.yml` | `dast-tooling` | Synthetic scanner checks and a 7-day evidence artifact |

Start with `local-checks`, then prove the Docker/database job on the same runner. The existing database workflow assumes its runner is disposable and stops its database without deleting its volume. A persistent WSL2 runner therefore needs CI-owned workspace, database-volume, port, and temporary-file cleanup. Preserve caches, remove only job-owned transient data, and test cancellation cleanup. Do not remove test coverage or touch personal databases to make it pass.

These were source observations only. No workflow was executed, changed, or deployed in AMR.

## Windows, caching, and the unfamiliar terms

Keep Windows 11. Run the Linux version of the GitHub runner inside a supported Ubuntu distribution in WSL2, with the project's Node and pnpm versions. WSL2 provides a Linux environment on Windows; actual runner compatibility is an acceptance test, not yet a proven result. [Microsoft WSL](https://learn.microsoft.com/en-us/windows/wsl/about)

Use the machine's existing compatible Docker setup if present. Docker Desktop supports WSL2 integration. Check it before installing a second Docker engine, since competing installations can conflict. Keep the Linux workspace and package caches in the WSL Linux filesystem. [Docker WSL guidance](https://docs.docker.com/desktop/features/wsl/)

| Term | Plain meaning | Needed now? |
| --- | --- | --- |
| Runner | GitHub's program on the PC that executes a job | Yes |
| Controller / dispatcher | The small program that chooses where a job runs | Yes, the Worker |
| Runner image | A prepared Linux environment with tools already installed | A tool-version checklist is enough for v0.1 |
| Image drift | GitHub has one tool version and the home machine has another | Handle by documenting and testing required versions |
| KVM | Linux's facility for running virtual machines | No |
| Firecracker | A program that uses KVM to create small virtual machines | No; optional future job isolation |
| Image building | Preparing and updating a reusable runner environment | No custom image factory for v0.1 |

Firecracker uses Linux KVM; it is a later option, not a requirement to use self-hosted Actions. [Firecracker project](https://github.com/firecracker-microvm/firecracker)

Disk caches survive a normal shutdown. RAM does not. A cache is cold when the data is absent, invalid for the current inputs, or evicted. Dependencies are downloaded on a miss; the PC does not need to keep rewriting caches while idle.

Start with local pnpm storage and the existing Docker builder's cache. Persistence does not guarantee every build command reuses it, so inspect actual hits. `actions/cache` still uses GitHub storage by default on self-hosted runners. A transparent local replacement is separate work and is not promised for tomorrow. [GitHub dependency caching](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching)

Local does not automatically mean safe. Use a dedicated CI environment for explicitly trusted code and preserve personal files outside its work areas. A persistent WSL environment is not a fresh security boundary per job. Public fork code and AI patches must not inherit trust merely because the repository is allowlisted.

## Pros and cons after your corrections

| Benefit | Remaining tradeoff |
| --- | --- |
| Home execution and free-plan routing preserve GitHub runner minutes | Free-plan limits and GitHub API failures must be visible |
| Windows stays usable; no OS migration | Sleep, reboot, WSL shutdown, and the 16 GB RAM budget affect availability |
| Disk caches survive downtime and can improve repeated builds | Actual cache reuse and speed must be measured; cold runs are acceptable |
| Existing CI commands remain familiar | Automatic dispatch needs workflow integration and correct PR reporting |
| Provider selection is automatic | Offline execution still needs an enabled provider with its separate cost policy |
| AI can implement scripts, Worker code, tests, and docs | Account setup, real machine access, credentials, and verification remain necessary |

Electricity, wear, maintenance, and the lack of record-breaking speed are accepted, not reasons to reject the project.

## A focused v0.1 target for tomorrow

| Unit | Deliverable | Pass condition |
| --- | --- | --- |
| Host preparation | WSL prerequisites check, setup/start/stop/status guide, one runner slot | Runner appears online, stops cleanly, reconnects after restart |
| AMR execution | Existing checks on the proposed home label | Same revision passes; a second run shows cache reuse; job-owned state is cleaned |
| Free dispatcher | Signed webhook handling, App auth, durable request record, allowlisted dispatch | No hosted route job; duplicate event does not start duplicate work; unknown repo is rejected |
| PR integration | Request/run correlation and correctly associated checks | A failing test is visible on the correct PR; superseded results cannot mark new code green |
| Offline policy | Home-first selection and visible waiting or approved fallback | PC-off test has no unauthorized provider or quota use |
| Handoff | Setup, recovery, cache cleanup, retention, uninstall and provider-policy docs | Another setup attempt can follow the commands and verify each stage |

Benchmark against an existing comparable hosted run where available, rather than starting a new hosted run that would consume protected minutes. Record commit, runner, cold/warm state, queue time, wall time, install/build/test time, and peak memory. Several paired runs are needed before claiming a speed advantage.

Before marking v0.1 complete, check Worker CPU use, request-table quotas, GitHub rate limits, and the billing usage attributable to the home path. A successful local simulation is not proof of a working webhook-to-PR integration.

The deadline depends on access to the Windows PC, a Cloudflare account on Free, and a GitHub App installation. AI can write and test the implementation in stages. It cannot honestly guarantee a complete Blacksmith-class platform from one prompt or prove hardware behavior without access to it.

## Keep the larger vision, but defer it

After v0.1 works: slow-step history, a small searchable log store, explicit test-report ingestion for flaky-test analysis, a GitHub App comment/annotation summary, and optional AI failure explanations. AI-generated fixes must be proposed and verified, not automatically trusted or committed.

Later still: a transparent Actions-cache service, persistent isolated Docker builders, private runner debugging, network metadata, disposable per-job environments, and capacity-aware scheduling. Use Firecracker or a larger analytics database only when a measured need justifies them.

Test reports may require reporter configuration or artifact collection. Plain logs do not reliably identify every test or prove flakiness. Retention is bounded by storage and privacy needs, not "all logs forever."

No real AMR workflow has been connected or run. The next owner-controlled steps are Worker secrets, GitHub App installation, reviewed template installation, and runner registration, followed by the v0.1 acceptance checks above.
