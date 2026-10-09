# Review Service architecture

This is an AI code reviewer architecture. The vendor products in the research are comparison points for workflows and failure modes. The core system is a self-hosted evidence pipeline that can change models without changing review identity, context, findings, budgets, or GitHub publication.

## Selected topology

```text
CLI or authenticated localhost API
              |
       authorization + policy
              |
       SQLite queue and leases
              |
   GitHub polling adapter <---- optional Black Box Worker relay
              |
exact-SHA snapshot + change manifest
              |
local secret scan + redaction ledger
              |
language AST walkers + lexical/symbol context + safe deterministic signals
              |
       shared budget gateway
              |
 secretless orchestrator -> model gateway process
              |
 local model adapter | approved cloud adapter
              |
 deterministic signals + specialist fan-out
 correctness | security | concurrency | API | tests
              |
candidate review -> skeptical verifier -> optional separately reserved escalation (later profile)
              |
findings reconciliation -> SQLite outbox
              |
 GitHub summary/comments/checks through publisher
```

The automatic reviewer runs on an Ubuntu GitHub Actions self-hosted runner labeled `black-box-reviewer`. GitHub reaches the runner through its outbound HTTPS connection; the reviewer exposes no inbound port and does not use Tailscale or a Cloudflare tunnel for execution. A Windows PC with WSL2 remains a local fallback. Keep SQLite, snapshots, indexes, and evidence on the Linux filesystem. The local CLI can use the same service library without a public endpoint. P1 supports three explicit local snapshot modes: `working_tree` for the current uncommitted diff, `staged` for the index against a named baseline, and `ref` for an exact committed revision. A P1 review records the selected mode and exact content; P2 adds advanced path/object selection and broader incremental reuse. Event triggers re-fetch authoritative PR state and inspect the exact head. AST walkers operate on immutable snapshots and return structured definitions, references, imports/exports, changed objects, and unresolved edges. They never execute repository code.

### Ubuntu Actions deployment contract

The supported automatic deployment is an Ubuntu host with a self-hosted Actions runner. Register it with `self-hosted`, `linux`, and `black-box-reviewer` labels. Keep the database and evidence on the Linux filesystem. The workflow checks out the trusted base SHA, installs reviewer dependencies with scripts disabled, reads the PR through the GitHub API, and does not execute PR-controlled code. Store the model key and App private key as encrypted Actions secrets. Tailscale may be used for owner-controlled administration only; it is never the path by which GitHub reaches the runner.

## Trust boundaries

1. **External GitHub and PR content:** untrusted. Validate repository, actor, revision, paths, comments, issue text, and API responses.
2. **Trusted policy:** loaded from an approved base/default-branch revision. Policy files changed by a PR are review inputs and cannot grant authority.
3. **Repository reader/indexer process:** read-only and secretless, snapshot-rooted, no home-directory access, SSH keys, model keys, GitHub write credentials, Docker socket, or arbitrary network. It owns parser/compiler libraries and deterministic secret scanning.
4. **Model gateway process:** sole owner of model/API keys and cloud spending authority. It receives only redacted evidence packets over a local authenticated IPC channel, cannot read the repository snapshot directly, cannot publish, change policy, or select an unapproved route.
5. **Publisher process:** sole owner of GitHub write credentials. It receives validated revision-bound outbox items over a local authenticated IPC channel and cannot read model keys or arbitrary repository files.
6. **Execution worker:** disabled in P1. If added later, it gets an isolated workspace and bounded resources with no persistent secrets.
7. **Local operator:** only configured owner/admin may authorize cloud spending, change providers, approve learned rules, or expose the API.

## P3 runtime execution boundary

Runtime validation is not part of the persistent WSL2 service. If a later release needs execution evidence, the service may create one short-lived Daytona sandbox, or another backend that passes the same isolation review, for the exact reviewed head. The sandbox receives no model key, GitHub write credential, SSH key, Black Box token, or persistent data. It uses an explicit resource limit, a narrow network allowlist or no network, a wall-clock expiry, and captured logs or traces. The service links returned artifacts to the exact SHA and destroys the sandbox after collection. A startup, network, dependency, quota, or cleanup failure yields `incomplete`; it never falls back to executing the PR on the WSL2 host.

Daytona's default idle stop is a lifecycle setting, not a security guarantee. A process running in the background does not keep a sandbox active, and disabling idle stop does not remove a separate wall-clock TTL. Runtime jobs therefore use a bounded TTL and explicit completion signal. Current provider pricing, quotas, and lifecycle behavior are inputs to the P3 cost registry, not reasons to make Daytona a persistent host.

## AST and deterministic context layer

Each supported language has a versioned walker adapter. The first adapter targets TypeScript/JavaScript using parser/compiler libraries pinned, installed, and owned by the review service. The service never loads parser packages, plugins, or executables from the repository under review. A walker emits changed declarations, definitions, callers/references where resolvable, imports/exports, types/interfaces, test links, schemas/migrations, and parse diagnostics. Every edge carries source SHA, path, range, parser version, and `resolved` or `unresolved` status. Missing dependency types become a coverage limitation; they never trigger installation.

Walkers improve recall, token use, and reproducibility compared with asking a model to search blindly. They do not solve reflection, generated code, dynamic imports, macros, runtime configuration, or external services. Parse failures and unsupported syntax become visible coverage gaps. The LLM can ask for bounded additional context, but it cannot silently replace a missing AST fact with an invented one.

The context layer also owns a versioned knowledge base. It may contain generated module notes, graph summaries, known-risk records, approved custom rules, and links to external service context. Each item is tied to a source revision and approval record. Knowledge-base text is evidence to inspect, never policy authority. Rebuilds after a force-push, parser upgrade, rule change, or feedback correction create a new version and invalidate affected retrievals.

## Replaceable model workers

The graph and evidence ledger are upstream of every model. A role receives a bounded packet selected for its question and returns the provider-neutral candidate schema. Correctness, security, concurrency/data integrity, API/contracts, and test reviewers are separate work units; they may share a model endpoint but remain separate in the run record, budget, and evaluation. The verifier receives independently selected evidence and cannot publish. P1's fourth slot is a repair or follow-up investigation. A conditional escalation worker is a later, separately reserved profile and runs only after a code-owned disagreement or high-impact rule.

Provider adapters expose capability, usage, pricing, and failure contracts. The registry can compare an economical cloud model, a local model, a different-family verifier, or a local open-weight classifier without changing AST, finding, lifecycle, or GitHub publisher code. Model names are configuration candidates. Promotion requires a replay comparison on pinned cases, and provider failure never silently selects a replacement.

## Learning and custom rules

Rules can be written in plain language and scoped to repositories, directories, file types, or review roles. The resolver may index existing `AGENTS.md`, `CLAUDE.md`, Cursor rules, and `.blackbox/rules/` from the trusted base revision. Feedback from comments, reactions, resolutions, accepted fixes, dismissals, duplicates, and merged changes is stored as attributable events. A proposed learned rule remains inactive until an owner-approved threshold, replay check, and rollback record exist. Learned context can rank or expand evidence, but cannot suppress a required check, raise a budget, or alter credentials.

The same finding context is available through agent-mode CLI output and a narrow read-only MCP/API surface. This lets Codex, Cursor, Claude Code, or another client fetch status and evidence or request a suggested fix without becoming a second publisher. The client receives no GitHub write token, model key, shell, or rule-edit capability.

## Check Run Agent registry

Repository definitions live under a planned `.blackbox/check-run-agents/` directory and are trusted only from the protected base/default revision. Each agent declares an ID, display name, purpose, input mode, path/label/author/branch filters, prerequisites, allowed tools/MCP operations, model/profile, call and spend limits, output schema, conclusion mapping, and publication mode. Examples are Security Review, Web Event Tracking, Ticket Requirements, Accessibility Audit, and Production Errors.

An agent may consult only its declared tools. “Connected tools” is a configured allowlist, not a blanket shell or MCP capability. Deterministic checks can run with zero model cost; AI checks require the same run-scoped authorization and reservation gateway. A prerequisite failure produces `incomplete` or `action_required` according to policy and cannot become a passing required check. The registry validator supports static validation and a dry-run before any agent runs.

## Durable state

Core tables are `reviews`, `review_revisions`, `jobs`, `reservations`, `usage_events`, `findings`, `outbox`, `policies`, `feedback`, and `audit_events`. Source blobs and logs live under a configured local data directory with quotas. SQLite is local-only; the database must not live on a network share.

A review is keyed by repository, PR, head SHA, profile, and authorization. A force rerun receives a new review ID. Every record stores base/head/merge-base SHAs, policy and prompt versions, index version, selected/omitted files, model identity, coverage, and publication IDs.

## Queue state machine

```text
requested -> authorized -> queued -> leased -> snapshotting -> planning
      |         |            |          |             |
   denied   awaiting_budget  cancelled  lease_expired failed
                                             |
                                     queued with bounded retry

planning -> generating -> verifying -> reconciling -> publish_pending
                                               |                  |
                                           incomplete          published
                                               |                  |
                                           errored           publish_unknown
```

Leases have an expiry, owner, and monotonically increasing `lease_generation`. Every worker write checks the generation, so an old worker that resumes after expiry cannot overwrite a newer owner. Recovery reclaims expired local leases, but an external model or GitHub call is never assumed to have failed just because the process crashed. Each external call has an idempotency/request key and a recorded provider guarantee, then is reconciled against stored usage or outbox state before retrying.

A review can also become `superseded` when the PR head changes. It may retain private evidence for evaluation, but cannot publish a verdict for a newer head.

## Review outcome and approvability

Every run has a machine-readable outcome: `completed_clean`, `completed_findings`, `incomplete`, `errored`, `cancelled`, `superseded`, `unauthorized`, or `awaiting_budget`. `completed_findings` renders an advisory “Review completed with findings” summary when supported findings remain. It does not approve, merge, or block a branch by itself.

A later approvability or required-check agent can map these outcomes to GitHub check conclusions only after the owner configures the policy and confirms the repository plan supports enforcement. The automatic merge gate remains separate: it requires a clean review, completed successful checks, a clean mergeable state, a non-draft open PR, and an unchanged exact head. Incomplete, errored, unavailable, and budget-exhausted mandatory work must never become a passing or neutral merge-satisfying result by accident.

## GitHub inline review threads

The publisher posts only validated findings that have a current diff anchor. It groups the bounded findings for one head into a GitHub pull-request review when the API and permissions support that operation, so the PR timeline shows one review with line-level conversations. Each comment includes `commit_id` equal to the reviewed head, a repository-relative `path`, `side`, and `line`; multi-line comments also include a valid start line and side. The adapter can compute the diff `position` when an endpoint requires it, but it never confuses that hunk-relative position with a file line number. A finding on an unchanged line, an unavailable patch, a binary file, or a line that cannot be proven to be part of the current diff becomes a summary item instead of an invented inline location.

The comment body is generated from structured data, with a stable hidden fingerprint for reconciliation and a readable shape. A GitHub suggestion block is optional and only emitted when the proposed patch is minimal, applies to the exact anchored range, and passes local validation; otherwise the comment contains a plain explanation or a unified diff that a human can apply.

```md
> [!WARNING]
> **High: provider status can be reported ready after RPC failure**
>
> `apps/server/src/provider/Layers/PiAgentProvider.ts:355-360`
>
> **Evidence:** `requestOptional` converts every RPC failure into `undefined`, so catalog discovery can return an empty success value.
>
> **Impact:** the provider may be shown as ready even though it cannot start a session.
>
> **Suggested fix:** preserve the RPC error for the status path and add a regression test for a failed catalog request.
>
> **Verification:** supported by the pinned head; no runtime reproduction was required.
>
> <!-- BlackBox finding: <stable-id> -->
```

Severity is `critical`, `high`, `medium`, or `low`. P1 publishes only supported high/critical findings and a configured number of medium findings. It submits them as advisory `COMMENT` review content by default. A separate owner-enabled policy may map a verified high/critical finding to `REQUEST_CHANGES`, but a finding never blocks a merge merely because the model used a severe label. Low-confidence or unverified candidates remain private or appear in the summary with their status. The service does not copy vendor branding or claim that a comment is resolved unless the host reports that state.

GitHub owns the visual thread presentation, including collapsed files, “outdated” labels, and resolved conversations. The service stores its own finding lifecycle and re-fetches review threads after each new head. An affected finding is revalidated; an unchanged finding remains open; a stale thread is marked `not_rechecked` or superseded locally. If thread resolution is unavailable for the configured credential, the service reports that limitation rather than pretending to resolve it.

## PR description and publication outbox

The summary composer renders the BB AI summary in the GitHub review body and supports a local preview. Automatic PR-description mutation remains deferred because GitHub's REST update endpoint does not provide a proven atomic compare-and-swap for this operation. The planned markers remain available for a future guarded update:

```html
<!-- BlackBox pull request summary starts here -->
<!-- generated content -->
<!-- BlackBox pull request summary ends here -->
```

Only content between both markers is service-owned. If both markers are absent, the service requires an explicit initialize/append action. If exactly one marker exists, it fails closed and leaves the body unchanged. It never rewrites the author's text outside the block. Before updating, it reads the current body and version/ETag when available, compares the stored base body hash, and refuses the write on a concurrent edit. Updates are idempotent and carry an outbox key. A lost response is reconciled by fetching the body and checking the marker block and hash before retrying.

The generated block uses a stable, readable structure: a short `NOTE` callout, **What changed**, **Why / overview**, **Risk and limitations**, **Review coverage**, **Validated findings or required actions**, and **Review fixes** when applicable. It links only to validated GitHub files/lines or published check results. It does not claim “no issues” outside the declared scope. This output is a controlled renderer over structured findings, not unrestricted model-authored Markdown.

The publisher writes an outbox item before calling GitHub. Items carry a stable `finding_id`, revision-specific `occurrence_id`, `evidence_version`, matching fingerprint, exact head SHA, comment fingerprint, target path/side/line, payload hash, review event (`COMMENT` or owner-enabled `REQUEST_CHANGES`), and attempt state. A finding may have at most one active inline thread for a reviewed head. If a grouped review call partially succeeds or times out, reconciliation lists the review and its comments before creating anything else. On restart, the service queries existing comments/checks by external key or fingerprint before retrying. A timeout produces `unknown`, requiring reconciliation, never an unconditional second post.

Before publication the service re-fetches the PR head, verifies authorization and policy version, validates every line anchor against the current diff, and limits inline comments. Invalid anchors become summary references or private findings.

## Resource limits

Initial defaults are one concurrent review, four model calls per run, five inline comments, bounded context bytes, bounded checkout size, bounded model output, bounded logs, bounded evidence retention, and exponential polling backoff. Profile selection must expose the tradeoff between recall, precision, latency, comment volume, and cost; it cannot be presented as a universal quality ladder. All are configurable but cannot be raised by PR content. A queue exposes waiting reason, oldest job, disk usage, and last synchronization.

## Optional relay behavior

The existing Worker may persist signed event metadata in D1 and expose an authenticated mailbox. It must not clone, index, call models, or proxy long requests. If the relay is unavailable or its quota is exhausted, polling continues. No paid Cloudflare plan is activated automatically. Relay event IDs are deduplicated locally and reconciled with GitHub state.

## Recovery cases

- PC offline: queued work remains durable and resumes on startup.
- GitHub rate limit: back off, retain cursor, and show delayed status.
- Force-push/base change: invalidate incremental context and require a fresh snapshot.
- Model timeout: retain reservation until usage liability is resolved; retry only after a new admission decision.
- Publisher response lost: reconcile external IDs/fingerprints before retry.
- SQLite corruption: stop writes, restore the latest verified backup, and reconcile in-flight reservations/outbox items.
- Disk quota reached: stop new reviews, retain metadata, and report cleanup action.
