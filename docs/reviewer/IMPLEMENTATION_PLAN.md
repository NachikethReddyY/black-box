# Review Service implementation plan

## Product objective

Build a self-hosted AI code reviewer for Black Box that is cheaper to operate and more useful to the owner than comparable hosted reviewers. Macroscope, Greptile, CodeRabbit, Cursor Bugbot, and other products are competitive research examples. Their feature descriptions help identify user problems and quality questions. They do not define our product scope, justify copying their implementation, or establish acceptance quality.

The product wins through the review system around replaceable models: exact repository context, AST and dependency graphs, focused specialist reviewers, deterministic security and test evidence, independent verification, useful inline comments, controlled learning, and measured cost per supported finding. A model is an interchangeable worker. The reviewer owns the evidence, routing, ranking, budget, lifecycle, and GitHub experience.

“Better” is measured on the owner's held-out corpus, not by comment volume. The target is higher supported-finding quality at the same spend, or the same quality at lower spend, with valid evidence anchors, useful cross-file coverage, fewer false positives, clear incomplete states, and lower time to actionable feedback. “Cheaper” includes cloud inference, local CPU/RAM/disk use, GitHub/API usage, maintenance, and hosting. A silent reduction in coverage does not count as a cost win.

The planning package is self-contained: `ARCHITECTURE.md` defines ownership and trust boundaries, `AI_PIPELINE.md` defines the four-call review contract, `COST_MODEL.md` defines reservations and liability, `OPERATIONS.md` defines the Windows and WSL2 deployment, `LIMITATIONS.md` and `THREAT_MODEL.md` define the operating limits, `FEATURE_TRACEABILITY.md` maps competitive research to decisions, `BACKLOG.md` orders implementation, `EVALUATION_PLAN.md` defines measurement, and `ACCEPTANCE_TESTS.md` expands every T-01 through T-36 scenario.

## Decision

- **Selected hosting model:** the user's Windows PC is the host, and one local TypeScript service runs inside its WSL2 Linux distribution. Keep SQLite, Git worktrees, snapshots, AST indexes, and evidence on the WSL2 Linux filesystem, not a Windows-mounted or network path. Poll GitHub from WSL2. The existing Cloudflare Worker is an optional compact event relay, never a dependency.
- **Selected reuse/custom approach:** build an original `reviewer/` package in this repository. Reuse Black Box's GitHub configuration conventions, exact-SHA/check concepts, dashboard later, and event/audit ideas through narrow adapters. Do not embed reviewer logic in `worker/` and do not adopt PR-Agent wholesale.
- **Exact first-release scope:** an explicitly requested AI review of a GitHub PR; static-only mode as a no-model baseline and safe fallback; local model mode; one or more explicitly configured economical cloud adapters behind one gateway, with a single active role routing policy per run; atomic budget reservations; exact revision snapshots; purpose-built AST context for the first supported languages; focused lexical/symbol context; specialist candidate generation and independent verification; GitHub-native inline review threads anchored to changed lines; a bounded summary and deterministic PR-description preview; durable queue/outbox; coverage, model, cost, and verification status; CLI and JSON/Markdown export.
- **Default spending behavior:** a configured TokenRouter key selects the economical cloud route, and an explicit `review` or `pr-review` command is the run authorization. `REVIEWER_LOCAL_ONLY=true` forces static-only mode. Every cloud call still requires a pre-call reservation. Unknown pricing, exhausted budgets, timeouts with unknown liability, and incomplete model configuration deny or retain the job visibly. Scheduled and webhook-triggered work has no authority by default, and there is no silent provider fallback.
- **Security boundary:** the secretless reader/indexer and orchestrator have read-only repository access and no Black Box runner token, SSH keys, browser state, model keys, or Docker socket. A separate model-gateway process owns model keys and a separate publisher process owns narrowly scoped GitHub write credentials. Repository-controlled analyzers and runtime execution are disabled in P1.
- **Deferred features:** automatic reviews, runtime reproduction, generated fixes, merge/approval, hosted sandboxes, embeddings, cross-repository context, chat/MCP, dashboards beyond a status page, macros/reports, triage, other code hosts, broad analyzer/plugin execution, and authorized PR-description mutation until its concurrency and rollback tests pass. Declarative Check Run Agents are planned as a P2 workflow layer, with a P1 static configuration validator and dry-run renderer. Daytona is a candidate P3 disposable runtime backend, never the P1 host.
- **Major uncertainties requiring a prototype or test:** useful precision from local/economical models; whether language-specific AST walkers improve precision and token use on the owner’s corpus; TypeScript symbol/import extraction quality; Python and later-language parser coverage; GitHub inline-comment anchoring for rename/delete cases; review-thread permissions and resolution behavior; PR-body marker and concurrent-edit behavior; Check Run Agent tool/MCP boundaries; WSL2 CPU/RAM/disk limits and sleep/offline recovery; Git and SQLite performance on Linux ext4 versus Windows-mounted paths; Daytona isolation, startup time, quotas, and per-second cost for P3 runtime checks; GitHub App permission and branch-protection semantics; SQLite lease/outbox recovery; actual endpoint schema/tool support; whether the optional Worker relay fits its free quotas; and whether external benchmark claims reproduce under a comparable corpus and counting method.

## Additional evidence from Macroscope articles

The supplied first-party articles reinforce several design choices without changing the hosting or spending decision. Macroscope describes AST “code walking” and a reference graph as the context layer, a local CLI that can review uncommitted work in an isolated Git worktree and stream machine-readable findings, and review profiles that make recall, precision, latency, comment volume, and cost explicit. These are useful patterns to evaluate, not proprietary implementation requirements.

The benchmark articles report internal results, not independent guarantees. The 2025 benchmark used 118 self-contained runtime bugs from 45 open-source repositories across eight languages, isolated PR tasks, default tool settings, and unequal sample sizes caused by availability/rate limits. The newer MacroscopeBench article describes real-bug and control commits, repeated runs, LLM judges, and separate score, precision, recall, cost, and duration measures. Our evaluation will reproduce those controls where feasible and publish sample size, counting method, judge limits, and confidence.

The plan will support two explicit review profiles in P2: `coverage` for agent triage and `precision` for human readers. P1 keeps `static_only`, `local`, and `economy_cloud`, but records comment volume, severity, latency, and cost so the profiles can be tuned from evidence.

Sources: [Introducing Macroscope](https://macroscope.com/blog/introducing-macroscope), [Introducing Macroscope CLI](https://macroscope.com/blog/introducing-macroscope-cli), [Improved Code Review + Detection Mode](https://macroscope.com/blog/new-code-review-pipeline-detection-mode), [Code Review Benchmark](https://macroscope.com/blog/code-review-benchmark), and [MacroscopeBench](https://macroscope.com/blog/macroscopebench).

## Additional evidence from Greptile

Greptile supplies a second product pattern that fits the same architecture. Its public pages describe three connected loops:

1. **Index first:** build a repository graph of files, functions, dependencies, adjacent repositories, and a maintained knowledge base. Our version uses immutable exact-SHA snapshots, AST walkers, changed-symbol edges, callers, tests, schemas, and explicit unresolved edges. Cross-repository context stays opt-in because it increases disclosure and invalidation cost.
2. **Review as a swarm:** run focused agents in parallel and assess impact beyond the changed lines. Our specialist work units cover correctness, security, concurrency/data integrity, API/contracts, and tests. Each has the same finding contract, role budget, evidence ledger, and verifier path. Parallelism is bounded by the shared reservation gateway.
3. **Learn with approval:** use accepted, rejected, duplicate, resolved, and merged outcomes to rank future findings and maintain a review knowledge base. Learning is versioned, scoped, attributable, reversible, exportable, and never allowed to change permissions or suppress a required check by itself.

The plan also adopts these bounded ideas:

- custom repository rules and directory/file scopes, including existing `AGENTS.md`, `CLAUDE.md`, Cursor rules, and a planned `.blackbox/rules/` directory;
- a local CLI with full-fidelity output and an agent mode that emits raw structured findings for Codex, Cursor, Claude Code, or another authorized client;
- an agent-agnostic validation API and read-only MCP surface so coding agents can fetch finding context and status without receiving publisher or spend credentials;
- deterministic security signals such as rule-based scanning and dependency CVE checks before an AI security specialist, with chained or cross-file exploit reasoning left to the specialist and verifier;
- optional partner or service context adapters for named SDKs and APIs, with source links and connector-specific disclosure controls;
- a generated knowledge base containing codebase documentation, graph edges, and past risks, with human edits and explicit rebuild/version operations;
- confidence and severity as review metadata, not a merge guarantee. A confidence score must have a defined denominator and calibration report before it appears in a blocking workflow.

Runtime validation, generated tests, screenshots/traces, and browser agents follow the existing execution boundary. They are deferred until an isolated worker is proven. Greptile's self-hosted and bring-your-own-cloud descriptions reinforce the local-first choice, but self-hosting still leaves patching, storage, inference, connector, and hostile-code isolation responsibilities with us.

Sources: [Greptile Agent](https://www.greptile.com/agent), [Learning and Custom Context](https://www.greptile.com/learning), [TREX](https://www.greptile.com/trex), [Independence](https://www.greptile.com/independence), [Security Check](https://www.greptile.com/security-check), [Greptile CLI](https://www.greptile.com/cli), [Partners](https://www.greptile.com/partners), [Knowledge Base](https://www.greptile.com/knowledge-base), and [Security Practices](https://www.greptile.com/security).

## Where the engineering investment goes

The model is a replaceable worker. The durable product value is the system around it:

1. **Repository understanding:** versioned AST walkers, changed-symbol graphs, definitions, callers, imports, tests, schemas, migrations, history signals, and explicit unresolved edges.
2. **Context selection:** small evidence packets selected for a concrete review question, with hashes, line ranges, reasons, and token/cost limits. The service must be able to show why a file was included or omitted.
3. **Specialist review:** correctness, security, concurrency/data integrity, API/contracts, and test-coverage reviewers use the same typed finding contract with different questions and context. The same model can run several roles, but those outputs are not treated as independent evidence.
4. **Verification and ranking:** deterministic diagnostics and a skeptical verifier challenge candidates, search for counterexamples, deduplicate claims, and decide what is publishable. High-impact findings need stronger evidence than style observations.
5. **Review memory and feedback:** stable fingerprints, accepted/rejected/duplicate outcomes, approved rules with provenance, and replayable history improve ranking without allowing comments to change authority.
6. **Evaluation:** every model or context change is measured on the same held-out cases, including ablations for AST context, graph retrieval, specialist fan-out, and verification. A cheaper model wins only if its supported-finding quality and cost are acceptable on the owner corpus.

This changes the implementation priority. Spend most P0/P1 effort on the context graph, evidence ledger, specialist contracts, verifier, publisher correctness, and benchmark harness. Keep provider adapters thin so Qwen, GLM, DeepSeek, GPT-OSS, Luna, or a future local model can be tested or removed without changing review state or GitHub publishing.

### Initial model experiment, not a permanent default

The first comparison should use role-based routing rather than a single “best model” setting:

| Role | Candidate for the experiment | Required decision rule |
|---|---|---|
| Primary bug hunter | One owner-approved economical cloud model or capable local model | Run correctness and security first; add the other specialist roles only within the reserved call budget |
| Independent verifier | A different model family when available, such as GPT-6 Luna | Reject, request context, or support each candidate; never publish directly |
| Escalation investigator | DeepSeek V4.1 Flash or another approved model | Run only for disagreement or an authorized high-impact case with a separate reservation |
| Deterministic triage/dedupe | AST/static rules, or local GPT-OSS if hardware supports it | Prefer code-owned deterministic behavior; local open-weight inference is optional and has no OpenAI API price |

GLM-5.3 Flash, Qwen3 Coder, and other models from the earlier proposal remain candidates until their endpoint capabilities, current pricing, licensing, and reliability are recorded from an authoritative provider. The plan does not hard-code a price or assume that a model name implies tool calls, structured output, context size, or availability. The registry records those facts at run time.

The smallest useful P1 run is: deterministic analysis, two specialist work units, one independent verifier, then deterministic publication. Conditional escalation is a later P1 experiment or P2 capability after the benchmark shows that the extra call improves supported findings enough to justify its cost and latency. All roles share one reservation gateway, and no model failure silently selects another provider.

## Repository observations

Black Box currently has a Cloudflare Worker in `worker/` that verifies GitHub webhook signatures, stores durable D1 dispatch records, selects the home runner, dispatches exact revisions, reconciles workflow runs, and creates checks. `runner/` contains WSL2 lifecycle scripts. `dashboard/` is a Vite/React shell without the private GitHub OAuth/API layer. `templates/` contains a dispatch-only AMR workflow and validation material. There is no reviewer package, local SQLite service, model gateway, repository index, or review outbox.

The Worker is a good integration boundary for compact event metadata and status links. GitHub’s pull-request review API can group multiple line comments under one review and requires exact commit/path/diff-location data, so the publisher must own a dedicated review-comment adapter rather than treating comments as generic issue comments. Its D1 state and Cloudflare execution limits are unsuitable for cloning repositories, long model requests, indexing, or storing source evidence. The home runner is intended for trusted CI execution and is not a hostile-code isolation boundary for arbitrary PR execution.

## Build versus reuse

| Option | Benefits | Costs and risks | Decision |
|---|---|---|---|
| Adopt PR-Agent as the product core | Existing provider adapters, prompts, CLI and review commands | Python runtime and dependency surface; its lifecycle, cost controls, evidence model, queue/outbox and security boundary do not match this repository; license/advisory review and upgrade ownership remain | Do not adopt wholesale. Re-evaluate selected adapters after P1 |
| Wrap PR-Agent behind a TypeScript service | Faster first provider integration | Two runtimes, opaque failure/cost semantics, difficult exact-SHA and publisher isolation, duplicated persistence | Reject for P1 |
| Build original TypeScript service with narrow adapters | Fits Black Box, strict contracts, SQLite, local/cloud gateway, simple deployment, clear security boundary | More initial implementation work; must write provider and GitHub adapters | **Select** |
| Use reviewdog/analyzers only | Strong deterministic diagnostics | Does not provide repository context, verification, budgets, or model-independent review | Use selectively in P2 after safe execution policy |

The selected design can borrow functional ideas from PR-Agent, reviewdog, Cursor Bugbot, and Alibaba Open Code Review while auditing any code or dependency before reuse. A future adapter may be accepted only if it reduces maintenance and security burden without weakening the contract.

## Components and ownership

| Component | P1 responsibility | Location |
|---|---|---|
| CLI/API | authorize run, dry-run context/cost, status, export, local diff | `reviewer/` |
| GitHub polling adapter | read PR metadata, commits, patches, comments; rate-limit-aware cursors | `reviewer/` |
| Optional Black Box relay adapter | consume compact verified events; fall back to polling | `reviewer/`; existing `worker/` remains owner of relay |
| Policy resolver | trusted base-branch rules and path scopes | `reviewer/` |
| Snapshot/context builder | immutable Git content, diff map, language-specific AST walkers, lexical/symbol/import index, evidence ledger | `reviewer/` |
| Knowledge base and learning | versioned codebase map, risk notes, custom rules, approved feedback, and rebuild/revoke operations | `reviewer/context`, `reviewer/feedback`, local data |
| Check Run Agent registry | protected declarative checks with scopes, prerequisites, tools/MCP allowlists, model/budget policy, and conclusion mapping | `reviewer/` plus repository config |
| PR description composer | marker-owned summary rendering, preview, optimistic concurrency, and update outbox | `reviewer/` |
| Budget gateway | authorization, reservations, usage, unknown liability, concurrency | `reviewer/` |
| Model gateway | local endpoint and one or more approved cloud adapters with capability and price validation | `reviewer/` |
| Candidate/verifier pipeline | structured outputs, schema checks, bounded repair, deduplication | `reviewer/` |
| Publisher/outbox | updateable summary, GitHub-native inline review threads on changed lines, stable finding IDs, reconciliation, and stale-thread lifecycle | `reviewer/` |
| Storage | SQLite migrations, local evidence, retention, backup/export | `reviewer/` |
| Dashboard adapter | later reads reviewer API; no review dependency | `dashboard/` |

## Phases and gates

### P0: planning and controls

Define schemas, SQLite state machine, permission matrix, model capability and price registry, role contracts, AST-walker adapter contract, changed-symbol/evidence graph, Check Run Agent manifest schema, PR-body marker/concurrency contract, cost reservation rules, threat boundaries, and a small labelled evaluation set. Build no model or GitHub mutation yet. Exit when every traceability row has a disposition, each spend/credential path is reviewable, and a model can be swapped in a replay fixture without changing the finding or publishing schemas.

### P1: useful personal reviewer

Implement static/local/cloud profiles, manual authorization, exact-SHA snapshots, local secret scanning and redaction before any cloud request, TypeScript AST plus lexical/symbol context, specialist work units for correctness and security with typed extension points for concurrency, API, and test review, an independent verifier, durable queue, outbox, CLI, per-run JSON/Markdown exports, and advisory GitHub publishing. P1 local snapshots are `working_tree`, `staged`, and exact `ref`; advanced path/object selection waits for P2. Use the four-call schedule in `AI_PIPELINE.md`: correctness specialist, security specialist, verifier after deduplication, then at most one repair or follow-up investigation. Post a small number of high-confidence findings as exact changed-line review threads, render a deterministic summary, and provide a PR-description preview; do not mutate the PR body yet. Unverified candidates stay private and appear publicly only as an aggregate unresolved or coverage status. Exit only when a real PR revision can receive a bounded evidence-backed review, the benchmark can compare context and role ablations, a model can be replaced through the registry, a restart/retry cannot duplicate spending or comments, and the first matched quality/cost scorecard passes its owner-approved gate.

### P2: context and review loop

Add incremental invalidation and automation, richer finding lifecycle, feedback/rules approval, versioned knowledge-base documents and risk notes, selected deterministic analyzers, Check Run Agent execution, idempotent authorized PR-description updates after a proven compare-and-swap mechanism, advanced local path/object selection, simple status dashboard, replay, metrics, issue criteria, CI prerequisites, agent-mode CLI output, archive/migration exports, and optional MCP read-only operations. P1 already has basic persistent finding identity/reconciliation and per-run exports.

### P3: optional platform modules

Evaluate isolated runtime execution and TREX-style evidence through Daytona or another proven disposable backend, generated tests, browser flows, fixes, CI/conflict repair, triage, plans, security sweeps, chat, macros, reports, cross-repository context, partner/API context, additional hosts, and broader administration separately. A runtime sandbox receives the exact reviewed SHA, no model or publisher credentials, bounded resources and network, captured artifacts, and a destroy/expiry action. Each module needs its own permission, budget, and acceptance tests.

## Dependencies and non-goals

P1 depends on a Windows PC with WSL2, enough Linux filesystem disk/RAM for bounded snapshots, a GitHub App or owner token with least-privilege read access and narrowly scoped comment/check write access, and a supported local model endpoint or approved cloud account. The PC may sleep or be offline; the queue resumes after WSL2 restarts. It does not depend on Cloudflare, GitHub Actions, Daytona, a hosted database, vector storage, a GPU rental, or a premium model.

Non-goals are autonomous software development, automatic merge/approval, full vendor parity, unlimited language support, claims of bug-free code, treating vendor benchmark numbers as product guarantees, unrestricted MCP access, unreviewed PR-body overwrites, and execution of untrusted PR code on the existing Black Box runner.

## Recommended first implementation task

After planning approval, implement the inert P1 foundation: `reviewer/` package skeleton, SQLite migrations for reviews/reservations/outbox, configuration validation, provider capability and budget contracts, and a static-only CLI dry-run. Prove T-01, T-03, T-04, T-05, T-06, T-14, T-18, T-30, and T-33 before connecting a model or publishing to GitHub.
