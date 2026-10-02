# Review Service limitations and decision boundaries

The service can make review work more repeatable and evidence-based. It cannot establish that a change is correct, secure, or safe to merge in every environment.

The competitive goal is a measured quality/cost advantage on the owner's work, not universal superiority over every vendor or model. Hosted products may have larger datasets, more languages, faster infrastructure, proprietary runtime sandboxes, or enterprise support. A smaller self-hosted reviewer can still win on privacy, controllable spending, evidence quality, and cost per useful finding, but those claims need matched experiments.

## Evidence and model limits

- A model can miss real defects, misunderstand dynamic dispatch, hallucinate a requirement, or repeat a false candidate during verification. A second role prompt is not independent proof.
- Specialist fan-out can make reviews more complete, but it can also multiply correlated false positives, latency, and spend. Running several roles on one model does not make their errors independent. A different model family only reduces correlated risk when it receives independently selected evidence and is measured on held-out cases.
- “Cheap” model economics depend on context size, output length, cache hits, peak/off-peak windows, minimum billable units, retries, and provider reporting. A quoted per-million-token price cannot establish the cost of a full review or a provider invoice.
- A lower comment count, shorter prompt, or lower invoice does not prove a better reviewer. Cost comparisons must include supported findings, false positives, omitted scope, local resource use, and maintenance. A reviewer that stays quiet can appear cheap while missing bugs.
- Model names and endpoint features are unstable product inputs. A candidate may lose access, change behavior, change price, lack strict schemas or tools, or be unavailable in the owner's region. The capability and price registry must be refreshed and a failed candidate must not silently fall back.
- Model-inversion routing depends on authorship signals that can be missing or spoofed in a PR. Branch names, titles, and unsigned trailers are hints, not authority. Automatic inversion should require trusted metadata and otherwise use the configured default route.
- Historical PRs are incomplete ground truth. Precision and seeded recall are meaningful only for the labelled sample and its adjudication rules.
- A clean result means no supported finding in the declared scope. It does not mean bug-free code.
- Context retrieval can miss generated code, reflection, runtime configuration, external services, unpinned dependencies, or behavior encoded outside the indexed repository.
- Language support is intentionally uneven. TypeScript/JavaScript is the first target; Python and other languages require separate extraction and evaluation.
- Static analyzers can have false positives and can load repository-controlled configuration or plugins. They are not safe merely because they are called linters.
- AST walkers improve deterministic context, but they cannot fully resolve reflection, dynamic imports, generated code, macros, runtime configuration, or external services. Parser version drift and syntax extensions can create silent-looking gaps unless diagnostics are recorded.
- AST coverage is not semantic correctness. A complete tree and import graph can still support the wrong business interpretation.

## Revision, GitHub, and API limits

- GitHub patches can be truncated or omit enough context to anchor a comment. The service must use local immutable content and fall back to a summary reference when an inline position is invalid. A finding is only inline when its path, side, line, commit, and diff membership are proven.
- Force-pushes, rebases, changed merge bases, and concurrent commits can invalidate a review while it is running. The service may cancel or supersede work and may leave a visible incomplete state.
- Polling is delayed and consumes GitHub API requests. Rate limits, secondary throttling, permission scope, outages, and API changes can postpone work.
- GitHub branch protection and required-check behavior depends on the account plan and repository settings. Self-hosting does not unlock unavailable host features.
- Exactly-once external calls are not guaranteed. A provider or GitHub may accept a request before the response is lost. Reconciliation reduces duplicates but cannot remove all uncertainty.
- PR description editing has a separate failure mode from comment publishing. Marker deletion, malformed nesting, body edits by a human, GitHub version conflicts, and Markdown rendering can make an update unsafe. The service must preview first and fail closed rather than overwrite.
- The optional Cloudflare relay has quotas and can be unavailable. Polling remains the recovery path. The reviewer must not assume the relay is the source of truth.

## Local machine and WSL2 limits

- The primary host is an owner's Ubuntu server with an online GitHub Actions runner. An offline, disconnected, or resource-starved host delays reviews. A Windows PC with WSL2 is a fallback, not the GitHub ingress. There is no automatic hosted runner, Daytona host, or cloud GPU fallback.
- WSL2 memory, CPU, filesystem performance, Docker availability, and process limits are machine-specific. Windows RAM does not equal the review process's usable budget.
- Automatic review requires the Ubuntu runner to remain online. If the host loses network or stops, no review or merge happens until a later event queues work again. A PR with no check runs is deliberately never auto-merged.
- As verified on 1 October 2026, the App installation has `contents: write` and `pull_requests: write`. The CI workflow's read-only `GITHUB_TOKEN` is a separate credential. Automatic squash merging still depends on the exact-head review, complete coverage, successful CI, and clean mergeability gates.
- SQLite, Git worktrees, snapshots, and indexes should remain on the WSL2 Linux filesystem. Windows-mounted paths, OneDrive, and network shares can add locking, latency, and file-notification failures and are not supported for the active data directory.
- SQLite is a single-machine store. It must not be placed on a network share or treated as a distributed queue.
- Local models can be slow, unavailable, memory hungry, or incapable of strict schemas/tool calls. The gateway may reject a profile or use a server-built packet; it must not silently switch providers.
- Disk, checkout size, logs, evidence, and cache retention need quotas. A full disk stops new work until cleanup or retention runs.

## Security limits

- The reviewer reads private source and holds credentials. A compromised host, account, dependency, or local process can defeat application-level isolation.
- Prompt instructions cannot enforce security. Capability checks, path/network allowlists, credential separation, and publisher validation must enforce it in code.
- WSL2 and an ordinary container do not prove hostile-code isolation. Repository tests, package installation, plugins, and generated fixes remain disabled until a stronger boundary is verified.
- A cloud provider receives selected source context under its disclosure policy. Local-only mode is the only supported mode that prevents cloud source transfer.
- The automatic cloud workflow currently reviews only PRs authored by the repository owner. Collaborator reviews need an explicit authorization policy before they can consume the configured budget.
- Daytona, if adopted for P3 runtime checks, is an external execution dependency with its own lifecycle, network, quota, pricing, and isolation limits. A sandbox can stop while a background process is still running, and cleanup or artifact transfer can fail. Runtime evidence may therefore remain incomplete.
- Memory and feedback can be poisoned if approval, scope, provenance, rollback, and deletion are weak. Learned rules never become authority merely because a comment suggested them.
- A self-updating knowledge base can preserve an outdated design assumption, encode one engineer's preference as a team rule, or make stale context look authoritative. Every generated note needs a source revision, owner, review state, rebuild trigger, expiry or freshness check, and a way to compare a run with and without it.
- Custom rules improve team fit but can overfit one directory, conflict across scopes, lower recall, or suppress issues when thresholds are too high. Rules must be treated as inputs to evaluation and policy, not as truth.
- Partner, issue, observability, and documentation connectors add useful context but increase privacy, availability, schema-drift, and prompt-injection risk. A missing connector must produce an explicit coverage gap, not a clean result.
- Exposing the localhost API to a network adds authentication, transport, origin, and CSRF requirements. The default bind is localhost.

## Cost and privacy limits

- The service can enforce configured reservations and ceilings. It cannot promise an exact provider invoice when billing units, minimums, retries, cached tokens, delayed usage, or pricing change outside its control.
- Unknown usage remains reserved and blocks new paid work according to policy. A timeout is not proof that a provider charged zero.
- “Free infrastructure” excludes electricity, hardware wear, maintenance, GitHub storage/API limits, local model resource use, and development time.
- Source, prompts, findings, logs, and evidence need retention and deletion controls. Exporting or publishing a review can disclose private code and should be treated as an external action.

## Product and workflow limits

- P1 is advisory. It does not merge, approve, assign reviewers, edit branches, or repair CI.
- Automatic review, scheduled reports, macros, chat, MCP, cross-repository context, additional code hosts, runtime reproduction, fixes, and autonomous agents are separate modules with separate budgets and permissions.
- Agent-mode CLI and read-only MCP integrations improve handoff but do not prove that an external coding agent applied a fix correctly. The reviewer must re-run against the new exact head; a client cannot mark its own finding resolved.
- A partial review is useful only when its selected and omitted scope is visible. It cannot satisfy a required full-review policy by implication.
- A reviewer cannot replace human judgement, deterministic CI, dependency/security scanning, incident response, or repository ownership. GitHub’s UI may show threads as outdated or resolved based on later commits and user actions; the service cannot promise to control those visual states on every credential or API path.
- Check Run Agents can organize specialized checks, but their names do not prove expertise. A “Security Review” without the right deterministic tools, context, or verifier is only an advisory workflow. Connected MCPs also widen disclosure and outage risk.
