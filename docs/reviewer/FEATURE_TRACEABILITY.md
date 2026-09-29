# Feature traceability

Disposition meanings: `implement` is planned in the selected design; `adapt` borrows a bounded function or interface after audit; `defer` remains visible for a later phase; `omit` is intentionally excluded. Product evidence labels from the brief remain research maturity labels, not quality claims. `LOCAL-01` through `LOCAL-07` are plan extensions requested after the original 12 OWN requirements: inline GitHub threads, managed PR-description summaries, Greptile-style graph/swarm/learning, agent handoff, security evidence, and runtime evidence.

| ID | Normalized capability | Disposition | Phase | Reason | Component | Acceptance tests |
|---|---|---|---|---|---|---|
| CR-01 | PR-triggered and post-commit review | adapt | P1 | Black Box polling and explicit manual run authorization; no implicit automation | reviewer/github, reviewer/queue | T-07,T-09 |
| CR-02 | Incremental and full review modes | adapt | P2 | Requires baseline/revision invalidation proven after P1 | reviewer/incremental | T-09,T-10,T-11,T-12 |
| CR-03 | Inline findings with severity and edits | implement | P1 | Core validated finding and publisher contract | reviewer/pipeline, reviewer/publisher | T-13,T-23,T-24 |
| CR-04 | Correctness/security/performance/reliability/maintainability feedback | implement | P1 | Initial categories; depth and broader analyzers later | reviewer/pipeline | T-15,T-17,T-18 |
| CR-05 | Threads/questions/follow-up/feedback | defer | P2 | Conversation adds spend and identity complexity | reviewer/feedback | T-12,T-24 |
| CR-06 | Pause/resume/ignore lifecycle | implement | P1 | Local lifecycle plus durable queue | reviewer/queue | T-07,T-08 |
| CR-07 | PR summary and walkthrough | implement | P1 | Deterministic summary and bounded findings | reviewer/publisher | T-13,T-25 |
| CR-08 | Diagrams and effort indicators | defer | P2 | Avoid false precision; diagram only after evidence | reviewer/modules | T-36 |
| CR-09 | Issue links and requirements | defer | P2 | Issue connectors are P2/P3 | reviewer/modules | T-29 |
| CR-10 | Title/description/docs/custom checks | defer | P2 | Separate module after core quality | reviewer/modules | T-25,T-26 |
| CR-11 | Repository-wide context | implement | P1 | Focused lexical/symbol context | reviewer/context | T-09,T-10,T-14 |
| CR-12 | Analysis/verification/conversation roles | implement | P1 | Core design separation | reviewer/pipeline | T-16,T-17 |
| CR-13 | Persisted learnings | defer | P2 | Needs approved memory/feedback path | reviewer/feedback | T-29,T-35 |
| CR-14 | Instruction and path rules | implement | P1 | Trusted base-branch rules | reviewer/policy | T-20 |
| CR-15 | Related repos/history/external/MCP context | defer | P2 | Cross-repo disclosure and authorization | reviewer/context | T-22,T-27 |
| CR-16 | Analyzer/tool integrations | defer | P2 | Safe selected analyzers only after execution policy | reviewer/analyzers | T-21,T-22 |
| CR-17 | Filters/scoped/inherited configuration | defer | P2 | Configuration validation only in P1 | reviewer/config | T-03,T-20 |
| CR-18 | CI failure/request-changes/AI-change checks | defer | P2 | Needs CI integration and merge semantics | reviewer/modules | T-25,T-26 |
| CR-19 | Issue enrichment/routing/post-merge | defer | P3 | Outside personal P1 | reviewer/modules | T-33 |
| CR-20 | Change Stack semantic groups | defer | P3 | Preview, product-specific workflow | reviewer/modules | T-36 |
| CR-21 | Change Stack readiness/read tracking | defer | P3 | Preview, product-specific workflow | reviewer/modules | T-36 |
| CR-22 | Change Stack ranges/history snapshots | defer | P3 | Preview, product-specific workflow | reviewer/modules | T-36 |
| CR-23 | Change Stack suggestions/actions | defer | P3 | Preview, product-specific workflow | reviewer/modules | T-36 |
| CR-24 | Triage queue/prioritization | defer | P3 | Multi-repo platform scope | reviewer/modules | T-27 |
| CR-25 | Triage stale/duplicate/routing/reminders | defer | P3 | Multi-repo platform scope | reviewer/modules | T-24 |
| CR-26 | Triage repair actions | defer | P3 | Repair needs execution boundary | reviewer/modules | T-32 |
| CR-27 | Finishing Touches fixes/CI/conflicts | defer | P3 | P3 repair and delivery | reviewer/repair | T-31,T-32 |
| CR-28 | Finishing Touches tests/docs/recipes/delivery | defer | P3 | P3 repair and delivery | reviewer/repair | T-32 |
| CR-29 | Context-grounded plans | defer | P3 | P3 planning module | reviewer/modules | T-36 |
| CR-30 | Plan refinement/handoff | defer | P3 | P3 handoff | reviewer/modules | T-32 |
| CR-31 | Repository security analysis | defer | P3 | Full-repo scan needs separate budget | reviewer/modules | T-20,T-21 |
| CR-32 | Security posture/exposure assessment | defer | P3 | Broader posture data needs separate scope | reviewer/modules | T-20,T-21 |
| CR-33 | Local CLI review | implement | P1 | Local CLI is first user surface | reviewer/cli | T-01,T-12 |
| CR-34 | IDE review/fix handoff | defer | P2 | Needs editor integration | reviewer/modules | T-32 |
| CR-35 | Coding-agent tasks and delivery | defer | P3 | Needs repair and branch delivery | reviewer/repair | T-32 |
| CR-36 | Slack agent | defer | P3 | Needs chat permissions | reviewer/modules | T-19 |
| CR-37 | Chat automation/knowledge/skills | defer | P3 | Needs platform integrations | reviewer/modules | T-19,T-33 |
| CR-38 | Review dashboard | defer | P2 | Status page first; dashboard P2 | reviewer/api | T-34,T-36 |
| CR-39 | Activity metrics/export | defer | P2 | P2 analytics | reviewer/evaluation | T-36 |
| CR-40 | Scheduled reports | defer | P3 | Paid/recurring automation disabled | reviewer/modules | T-33 |
| CR-41 | Email/chat report delivery | defer | P3 | External delivery and privacy scope | reviewer/modules | T-33 |
| CR-42 | Multiple code hosts | defer | P3 | Additional hosts are out of scope | reviewer/modules | T-27,T-28 |
| CR-43 | Issue/CI integrations | defer | P3 | External systems are out of scope | reviewer/modules | T-26 |
| CR-44 | Administration/roles/audit/API/self-hosting | adapt | P3 | Minimal local auth/audit in P1 | reviewer/auth | T-26,T-34 |
| GR-01 | Repository symbols/imports/dependencies | implement | P1 | Local index first; dynamic edges remain gaps | reviewer/context | T-09,T-15 |
| GR-02 | Callers and cross-file contracts | implement | P1 graph/P2 expansion | Changed-symbol callers and references are P1; broader cross-file contracts and invalidation expand after first evidence | reviewer/context | T-09,T-10 |
| GR-03 | Summaries/important files/inline fixes | implement | P1 | Core summary and publisher | reviewer/publisher | T-13,T-25 |
| GR-04 | Diagrams and confidence indicator | defer | P2 | No unsupported probability score | reviewer/modules | T-36 |
| GR-05 | Review discussion | defer | P2 | Needs authenticated conversation surface | reviewer/modules | T-19 |
| GR-06 | Adjustable review depth | implement | P1 | Manual profiles first | reviewer/config | T-14,T-18 |
| GR-07 | Low-value comment reduction | implement | P1 | Verifier and bounded comment cap | reviewer/pipeline | T-17,T-24 |
| GR-08 | Feedback and conventions | defer | P2 | Approved feedback only | reviewer/feedback | T-29 |
| GR-09 | Scoped repository/directory rules | implement | P1 | Trusted policy resolver | reviewer/policy | T-20 |
| GR-10 | Dashboard configuration/inherited rules | defer | P2 | Status page then dashboard | dashboard | T-34 |
| GR-11 | Cross-repository context | defer | P2 | Allowlist and pinned revisions | reviewer/context | T-22 |
| GR-12 | Repository clusters | defer | P3 | Multi-repo platform scope | reviewer/modules | T-22 |
| GR-13 | T-Rex runtime validation | defer | P3 | Requires hostile-code isolation | reviewer/execution | T-31 |
| GR-14 | Runtime evidence for findings | defer | P3 | Requires actual execution evidence | reviewer/execution | T-31 |
| GR-15 | Optional approval | defer | P3 | Auto-approval off | reviewer/publisher | T-26 |
| GR-16 | MCP reviews/context/follow-up | defer | P2 | Named read-only operations later | reviewer/api | T-19,T-22 |
| GR-17 | Track addressed findings | implement | P1 basic identity/reconciliation, P2 incremental automation | P1 keeps persistent finding IDs, occurrences, evidence versions, and revision reconciliation; P2 adds broader addressed-finding automation and feedback loops | reviewer/findings | T-12,T-24 |
| GR-18 | Reports on PRs/findings/history | defer | P2 | Analytics P2/P3 | reviewer/evaluation | T-34,T-36 |
| GR-19 | CLI operations | implement | P1 | CLI first, including agent-mode structured output | reviewer/cli | T-01 |
| GR-20 | Coding-agent fix handoff | defer | P3 | Repair P3 | reviewer/repair | T-32 |
| GR-21 | Jira/Confluence/Linear | defer | P3 | External connectors P3 | reviewer/modules | T-19 |
| GR-22 | Strictness/triggers/exclusions/drafts | implement | P1 | Core config first | reviewer/config | T-03,T-14 |
| GR-23 | Other code hosts | defer | P3 | GitHub only P1 | reviewer/github | T-27 |
| GR-24 | Enterprise/private deployment | adapt | P3 | Deployment remains independent | operations | T-26 |
| MC-01 | Correctness PR review | implement | P1 | Core candidates/comments | reviewer/pipeline | T-15,T-17 |
| MC-02 | Replies/reactions/follow-up fixes | defer | P2 | Conversation and repairs later | reviewer/feedback | T-19,T-32 |
| MC-03 | Budget/Balanced/Precise/Ultra modes | implement | P1 | Manual profiles with owner names | reviewer/config | T-02,T-14 |
| MC-04 | Repo/author/label/branch/manual controls | implement | P1 | CLI authorization first | reviewer/auth | T-19,T-20 |
| MC-05 | File exclusions/test treatment | implement | P1 | Tests included by default | reviewer/manifest | T-15 |
| MC-06 | Language-aware navigation | implement | P1 TS/P2 expansion | TypeScript/JavaScript AST navigation first; later languages need separate parser coverage | reviewer/context | T-09,T-10 |
| MC-07 | External context/model choices | defer | P2 | Network disclosure opt-in | reviewer/models | T-22,T-28 |
| MC-08 | Scoped Markdown instructions | implement | P1 | Trusted base rules | reviewer/policy | T-20 |
| MC-09 | CI prerequisites | defer | P2 | Needs CI integration | reviewer/modules | T-25 |
| MC-10 | Approvability check | defer | P2 | Advisory first; no false merge gate | reviewer/modules | T-26 |
| MC-11 | Custom check agents | defer | P2 | P2 safe custom checks | reviewer/analyzers | T-21,T-22 |
| MC-12 | Agent-specific models/tools/scope | defer | P2 | P2 capability registry | reviewer/models | T-03,T-30 |
| MC-13 | Full/incremental/object/metadata inputs | implement | P1 exact local modes and full PR manifest, P2 advanced selection/incremental reuse | P1 supports `working_tree`, `staged`, exact `ref`, and exact PR revisions; advanced path/object selection waits for invalidation proof | reviewer/manifest | T-13,T-14 |
| MC-14 | Prerequisites/limits/spend visibility | implement | P1 | Shared budget gateway | reviewer/budget | T-04,T-05,T-06 |
| MC-15 | Fix issue workflow | defer | P3 | Execution boundary required | reviewer/repair | T-31,T-32 |
| MC-16 | Agent questions | defer | P2 | Read-only API later | reviewer/api | T-19 |
| MC-17 | Agent branch/PR actions | defer | P3 | Repair/delivery later | reviewer/repair | T-32 |
| MC-18 | Chat agent interaction | defer | P3 | Chat adds auth/privacy | reviewer/modules | T-19,T-33 |
| MC-19 | Cross-repo commit feed | defer | P3 | Multi-repo scope | reviewer/modules | T-22 |
| MC-20 | Weekly/trend reports | defer | P3 | Recurring paid work disabled | reviewer/evaluation | T-33,T-36 |
| MC-21 | Effort estimates | defer | P3 | Avoid developer ranking | reviewer/evaluation | T-36 |
| MC-22 | Product areas | defer | P3 | Platform module | reviewer/modules | T-33 |
| MC-23 | Macros | defer | P3 | Recurring spend disabled | reviewer/modules | T-33 |
| MC-24 | Macro filters/delivery | defer | P3 | P3 delivery | reviewer/modules | T-28 |
| MC-25 | External technical integrations | defer | P3 | Connector risk | reviewer/modules | T-22 |
| MC-26 | Usage/token/cost visibility | implement | P1 | Required in P1 | reviewer/budget | T-04,T-05 |
| MC-27 | Murmur isolated orchestration | defer | P3 | Beta analogue needs isolation | reviewer/execution | T-31 |
| ALT-01 | PR-Agent reuse/adapters | adapt | P0/P2 | Audit revision/license/advisories before selected reuse | reviewer/models | T-03,T-30 |
| ALT-02 | Cursor Bugbot context/fix behavior | adapt | P2/P3 | Borrow functional ideas only; no proprietary prompts | reviewer/findings | T-12,T-32 |
| ALT-03 | reviewdog diagnostic conversion | adapt | P2 | Use selected safe analyzers, not whole product | reviewer/analyzers | T-21,T-22 |
| ALT-04 | Alibaba hybrid pipeline | adapt | P0/P2 | Compare pipeline patterns without copying code | reviewer/pipeline | T-16,T-17 |
| OWN-01 | Strict manual-spend mode | implement | P1 | Core safety default | reviewer/budget | T-01,T-02,T-03,T-19,T-33 |
| OWN-02 | Local-only enforced at gateway | implement | P1 | Network enforcement, not prompt trust | reviewer/models | T-02,T-03,T-22 |
| OWN-03 | Model/provider visibility and role routing | implement | P1 | Required in every result | reviewer/models | T-02,T-03,T-36 |
| OWN-04 | Atomic reservations and actual usage | implement | P1 | Shared gateway for every AI feature | reviewer/budget | T-04,T-05,T-06,T-18 |
| OWN-05 | Files/context coverage disclosure | implement | P1 | Coverage is part of verdict | reviewer/manifest | T-09,T-14,T-15,T-25 |
| OWN-06 | Resumable queue/stale cancellation/dedup | implement | P1 | SQLite leases and revision identity | reviewer/queue | T-07,T-08,T-09,T-10 |
| OWN-07 | Proposal/verifier/publisher separation | implement | P1 | Separate credentials and outbox | reviewer/publisher | T-16,T-17,T-23,T-25 |
| OWN-08 | Replay saved review with other models | implement | P2 | Replay after first stable run | reviewer/evaluation | T-36 |
| OWN-09 | Precision/missed bug/cost/latency evaluation | implement | P0/P2 | Held-out corpus and adjudication | reviewer/evaluation | T-34,T-36 |
| OWN-10 | Share Black Box interfaces safely | implement | P1/P2 | Narrow adapter; no runner privilege | reviewer/integration | T-27,T-28 |
| OWN-11 | Open-format export | implement | P1 per-run JSON/Markdown, P2 archive/migration export | P1 exports the declared run and evidence references; P2 adds history/archive/migration workflows | reviewer/api | T-34,T-35 |
| OWN-12 | Local CLI without account/key | implement | P1 | Static-only and local workflows | reviewer/cli | T-01,T-27 |
| LOCAL-01 | GitHub-native inline findings anchored to changed lines with stable thread reconciliation | implement | P1 | The primary actionable output is a review thread on the exact line needing change; invalid or stale anchors become explicit summary states | reviewer/publisher, reviewer/findings | T-13,T-23,T-24,T-25 |
| LOCAL-02 | Managed PR-description summary block with preservation, idempotency, and conflict detection | implement | P1 preview/P2 write | The service may own only a marked block and must fail closed on malformed markers or concurrent edits | reviewer/publisher | T-23,T-25,T-34,T-35 |
| LOCAL-03 | Versioned code graph, knowledge base, custom rules, and approved feedback learning | implement | P1 graph/P2 learning | Generated notes, past risks, and rules carry source revision, scope, approval, freshness, and rollback; they cannot grant authority | reviewer/context, reviewer/feedback | T-09,T-20,T-29,T-35,T-36 |
| LOCAL-04 | Bounded parallel specialist swarm beyond the diff | implement | P1 | Correctness/security default specialists and typed concurrency/API/test roles share evidence, budgets, and verification | reviewer/pipeline, reviewer/context | T-15,T-16,T-17,T-18,T-36 |
| LOCAL-05 | Agent-mode CLI and read-only validation handoff | implement | P1 CLI/P2 API | Coding agents may read validated finding context and status but cannot publish, spend, execute, edit rules, or resolve their own findings | reviewer/cli, reviewer/api | T-19,T-22,T-32 |
| LOCAL-06 | Deterministic security/SCA signals plus contextual security review | adapt | P2 | Rule scans and dependency CVE results feed the AI security specialist and verifier; missing scanners remain incomplete | reviewer/analyzers, reviewer/pipeline | T-20,T-21,T-22,T-25 |
| LOCAL-07 | Isolated runtime validation with attached evidence | defer | P3 | TREX-style execution requires a proven hostile-code boundary, bounded services/requests, captured artifacts, and exact finding linkage | reviewer/execution | T-31,T-32 |

Every catalog row is retained. Overlapping summary, review, chat, and analytics capabilities point to shared components rather than separate implementations.
