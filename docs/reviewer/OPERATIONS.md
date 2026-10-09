# Review Service operations plan

## Local setup

Run the automatic reviewer on the owner's Ubuntu server as a GitHub Actions self-hosted runner labeled `black-box-reviewer`. GitHub connects to the runner over its outbound HTTPS session, so the reviewer does not need an inbound port, a public IP, Cloudflare tunnel, or Tailscale. Use a Windows PC with WSL2 only as a local fallback. Store SQLite, snapshots, indexes, and evidence on the Linux filesystem, not a mounted Windows path, OneDrive, or network share. Store model and App credentials in GitHub Actions encrypted secrets for the workflow or protected Linux-side storage for manual runs. Start with the bounded TokenRouter profile and a $0.10 per-PR ceiling.

### Ubuntu runner lifecycle

Register the Ubuntu Actions runner with the `black-box-reviewer` label and keep its process managed by systemd or another tested service supervisor. GitHub sends jobs only while the runner is online and idle. If the host is offline, jobs remain queued or skipped and resume on a later PR event. Do not keep the service alive by opening a public port or by routing GitHub through Tailscale. A WSL2 fallback must tolerate WSL shutdown and Windows sleep, but it is not the production trigger.

The automatic cloud workflow is currently limited to PRs authored by the repository owner. This preserves automatic reviews for the owner's PRs while preventing another same-repository contributor from consuming the cloud budget without an explicit policy change. Expand the trusted-author rule only after adding an approved per-PR authorization mechanism.

The current runner assets support native Ubuntu and WSL2. Existing notes report Ubuntu 26.04, Docker 29.1.3, Compose 2.40.3, Node 24.20.0, pnpm 12.6.0, and Actions runner 2.337.0 for an older WSL path; treat those as observed versions, not fixed requirements. Before enabling the reviewer, record `uname -m`, `free -h`, filesystem placement, available disk, and the actual cgroup limits on the Ubuntu host.

Required configuration includes an explicit repository allowlist, GitHub credential reference, data directory, polling interval/backoff, retention and disk quotas, profile defaults, supported-language/parser versions, local endpoint/model if enabled, cloud provider/model/pricing registry if enabled, Check Run Agent directory and connector allowlists, and publisher permissions. An empty allowlist permits nothing. Partial cloud configuration is an error.

Custom rules and knowledge-base files are versioned operational data. On startup and before a run, show which trusted revision supplied each rule or note, its scope, approval state, freshness/expiry, and whether it can affect retrieval or thresholds. Rebuild the codebase map after a parser/index change, force-push, major dependency change, or approved feedback update. Keep generated documentation and past-risk notes separate from raw source evidence so they can be disabled or deleted without rewriting a review record.

The agent-mode CLI and read-only API/MCP contract should expose only finding status, evidence references, validated context, export, and suggested-fix text. Test each client integration against a credential-free fixture. Do not give an agent the publisher token, model key, shell, arbitrary URL fetch, rule-write path, or ability to resolve its own finding.

The `BB CoPilot Bot` GitHub App needs `metadata: read`, `contents: write`, and `pull_requests: write` for automatic squash merging. GitHub calls the repository permission **Contents: Read and write**; its API representation is `"contents": "write"`. The current reviewer publishes review bodies and inline comments. PR-description updates remain deferred until a proven atomic compare-and-swap mechanism exists.

The App permission is configured and verified for the current installation: `contents: write` and `pull_requests: write`. Keep the selected repository scope and refresh the installation token after changing App permissions. Automatic merge still requires the exact-head review, complete coverage, successful CI, and clean mergeability gates.

The reviewer CI workflow's `permissions: contents: read` controls its separate `GITHUB_TOKEN` and should remain read-only. Changing that workflow setting does not grant the App merge access. The App permission change does not bypass the exact-head review, complete coverage, successful CI, or clean mergeability gates.

The model registry is operational configuration, not prompt text. For each candidate record the provider/model identity, version, role eligibility, context/output limits, structured-output and tool support, usage-reporting behavior, licensing, price source/effective time, local hardware requirements, and last replay result. A model replacement is admitted only after a held-out comparison and a review of its disclosure and provider terms. Keep primary, verifier, and escalation reservations visible by role; a provider outage or stale price disables that role and leaves the run incomplete or awaiting budget.

## Check Run Agent operations

Validate `.blackbox/check-run-agents/` from the trusted base revision before scheduling. Dry-run each manifest to show triggers, selected files, prerequisites, tools/MCP, model, budget, and conclusion mapping. Keep AI checks manual until their fixtures and spend behavior pass. Disable an agent when its connector is unavailable; report `incomplete` or `action_required` instead of treating it as clean.

## Startup and shutdown

On startup: validate config and migrations, check database integrity, reclaim expired leases with fencing, reconcile unknown reservations and outbox items, check disk quotas, refresh GitHub cursors, and show machine availability. On clean shutdown: stop polling, finish or lease jobs safely, flush audit records, and leave external calls reconcilable. A crash resumes through leases and reconciliation. Every worker write must include the current lease generation.

## Backups and retention

Back up SQLite with a consistent SQLite backup operation, plus manifests for local evidence and configuration versions. Test restore before relying on it. Retain review metadata and audit links according to owner policy; remove source blobs/logs after bounded retention. Export reviews, findings, feedback, prompts, rules, and audit records in JSON/Markdown. Deletion must remove or anonymize supported records and leave an audit event without secrets.

## Disk and resource cleanup

Enforce checkout, evidence, log, and cache quotas. Remove expired snapshots only after no active review references them. Never delete unrelated Docker objects or Black Box caches. If disk or memory is exhausted, stop admitting new reviews and report the oldest waiting job and cleanup action.

## Offline and quota behavior

A powered-off or sleeping PC leaves jobs queued. GitHub rate limits and optional relay outage cause backoff and polling recovery. Cloudflare free-quota exhaustion disables relay use and keeps polling; it never activates a paid plan. No hosted runner, Daytona sandbox, cloud GPU, or premium model starts automatically. The status output shows last sync, oldest waiting job, WSL2 availability, and reason.

### P3 runtime sandbox procedure

Runtime execution is disabled in the persistent WSL2 service. A later P3 worker may create an ephemeral Daytona sandbox only after an owner-authorized runtime request. Pin the exact reviewed SHA, copy no model or publisher credentials, apply resource and network limits, set a bounded wall-clock expiry, stream declared artifacts back to the reviewer, and destroy the sandbox after collection. A background process does not count as sandbox activity, so completion and TTL handling must be explicit. If startup, execution, transfer, or cleanup fails, record `incomplete` and keep the finding unpublished as runtime-proven evidence.

## Upgrade strategy

Pin runtime and dependency versions. Review dependency licenses and advisories before upgrades. Apply SQLite migrations with a backup and reversible recovery plan. Upgrade one provider adapter or analyzer at a time, replaying the held-out corpus and P1 acceptance tests. Prompt, policy, index, and model contract changes invalidate affected incremental reuse.

Rotate GitHub/model credentials through protected local storage; revoke old credentials after verifying the publisher and poller. Never write secrets into logs, evidence, prompts, browser state, or committed files.

## Troubleshooting

- **No work appears:** check allowlist, credential scope, cursor, GitHub rate limit, and optional relay mailbox; run a static local diff.
- **Review waits for budget:** inspect reservation/unknown-liability records and configured ceilings; do not retry blindly.
- **Model unavailable:** use static-only or local profile; provider capability errors are visible and do not trigger cloud fallback.
- **Model quality or price changed:** pin the capability/price revision in the run, stop automatic escalation, replay the held-out comparison, and promote a replacement only after its supported-finding, false-positive, latency, and cost results are recorded.
- **Comments duplicate or are missing:** inspect outbox external ID/fingerprint and reconcile GitHub before retrying.
- **Stale result:** inspect head SHA and supersession state; a new authorized run is required.
- **Inline comment rejected:** export the evidence and publish as summary reference after validating the current diff.
- **PR summary did not update:** check both markers, body hash/ETag conflict, outbox state, and whether the update was only a preview; never paste over the body manually without reviewing the diff.
- **Worker relay unavailable:** confirm polling still reaches authoritative GitHub state.
- **Database problem:** stop writes, restore verified backup, run integrity checks, reconcile reservations/outbox, then resume.

## Operational definition of done

The owner can start without cloud credentials, request a static or explicitly local review, see exact scope and coverage, recover from Ubuntu runner restart or offline periods, export data, and prove no paid call or public mutation happened without authorization. The automatic workflow requires the configured TokenRouter and App secrets and is capped at $0.10 per PR. Runtime execution and automatic squash merge remain disabled. A later merge policy may run only after the exact-head review is clean, completed CI is successful, the PR is open and non-draft, and GitHub reports a clean mergeable state.
