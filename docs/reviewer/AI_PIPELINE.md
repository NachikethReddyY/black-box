# Review Service AI pipeline

## Review identity and context

A run is bound to one repository, PR, base SHA, merge-base SHA, head SHA, trusted policy revision, prompt version, index version, profile, and spending authorization. The full merge-base-to-head change and the since-last-covered-head delta are stored separately. A partial or failed run never advances the completed baseline.

The change manifest records additions, deletions, renames, mode changes, binaries, submodules, symlinks, generated/vendor/lock files, API truncation, selected units, omitted units, and reasons. Tests are included by default. Lockfiles may be omitted from prose context only when still passed to dependency analysis.

Context starts with changed symbols, definitions, direct callers, related tests, interfaces, schemas, migrations, trusted rules, and deterministic diagnostics. Purpose-built AST walkers for each supported language produce these facts from the exact snapshot before model calls. TypeScript/JavaScript is first; Python and other languages require their own parser adapter, fixtures, and coverage report. A local lexical index and import/symbol extraction supplement the walkers. Retrieval requests carry a path, SHA, line range, content hash, parser/index version, and reason. Unresolved dynamic edges, parse failures, generated-code boundaries, and unsupported syntax are recorded as gaps. Embeddings and cross-repository retrieval are P2 and opt-in.

The context layer also maintains a versioned knowledge base. It can contain generated module notes, graph summaries, known-risk records, approved custom rules, and links to external service context. Each item records its source revision, author or approving actor, confidence basis, expiry or rebuild trigger, and whether it may affect review selection. Knowledge-base text is context, never authority. A rebuild after a force-push, parser upgrade, rule change, or feedback correction creates a new version rather than mutating evidence from an old run.

Before context selection, a secret scanner inspects all relevant changed and referenced text locally, including configuration, tests, fixtures, documentation, generated reports, lockfiles, and private-key material. It produces findings for the security specialist even when a value is excluded from model context. Redaction replaces high-confidence secrets with typed placeholders while preserving enough surrounding structure for analysis. A detector failure, ambiguous private-key block, or unredactable value blocks cloud publication and is visible as incomplete. Excluding a file from the model packet never excludes it from the local secret scan.

## Work plan and profiles

- `static_only`: no model call; manifest, syntax/lexical checks, policy checks, and export.
- `local`: configured local endpoint; bounded candidate and verification calls.
- `economy_cloud`: one or more configured cloud adapters, manual authorization, strict per-run reservation, and an explicit role-to-model route.
- `deeper_approved`: larger context/call allowance only after explicit owner authorization.
- `coverage` (P2): favor recall and allow more private/agent-triage candidates, with a configured publication threshold.
- `precision` (P2): reserve more verification and publish fewer, higher-confidence human-facing findings.

The default cloud route is explicit rather than inferred:

```yaml
profile: economy_cloud_luna_v1
default: false
max_provider_attempts: 4
specialists: [correctness, security]
verifier: true
final_slot: repair_or_follow_up
routes:
  primary:
    provider: openai
    model_id: gpt-6-luna
    api_format: responses
    reasoning: medium
    structured_output: json_schema
    tool_mode: server_built_packet
  verifier:
    provider: openai
    model_id: gpt-6-luna
    api_format: responses
    reasoning: medium
    structured_output: json_schema
    tool_mode: server_built_packet
```

`static_only` is the safe installation default. `economy_cloud_luna_v1` is the first executable cloud profile and must be manually selected with a budget. It is deliberately conservative: no model tool calls in P1, no automatic escalation, and no cloud request until local secret scanning and redaction complete. A different-family verifier is an evaluation profile, not an inferred production route.

The direct OpenAI route is separate from this optional TokenRouter route:

```yaml
profile: economy_cloud_tokenrouter_luna_v1
default: false
provider: tokenrouter
model_id: openai/gpt-6-luna
api_format: responses
reasoning: medium
structured_output: json_schema
tool_mode: server_built_packet
```

The gateway never chooses TokenRouter because its key happens to exist. Each provider has its own base URL, key reference, capability record, and price revision. The configured endpoint must pass an adapter fixture before admission.

Deterministic AST walkers and risk signals ensure mandatory areas such as auth, permissions, migrations, data loss, and concurrency are not dropped by model triage. The walker output is evidence, not a semantic guarantee, and unresolved edges remain visible. A planner may group units and request focused context but cannot raise budgets or permissions.

## P1 call schedule and admission

P1 does not use an LLM planner. Deterministic planning, risk signals, secret scanning, AST extraction, graph retrieval, and context selection consume no model calls. The initial cloud/local review profile reserves at most four provider attempts per run:

| Slot | Operation | Rule |
|---|---|---|
| 1 | Correctness specialist | One request with a bounded server-built evidence packet. Tool continuations are unavailable in P1. |
| 2 | Security specialist | One request with its own packet, including secret-scan and deterministic security evidence. |
| 3 | Skeptical verifier | One request covering the deduplicated candidate set from both specialists. Empty candidate sets still complete without a model call. |
| 4 | Repair **or** follow-up investigation | At most one additional request, selected by code-owned policy. It is never both. |

Every provider attempt counts against the four slots, including schema repair, retry after a transport response, continuation after a tool result, and a request that ends at an output limit. A specialist may not silently turn one slot into a loop. If a request needs more context, the service uses its local evidence builder first. If one additional model request is still needed, it consumes slot 4 and the run records the omitted work. Conditional escalation is disabled in this initial profile and can be introduced only as an explicitly larger, separately reserved profile. The gateway stores the provider's idempotency guarantee for each attempt; a request ID is not treated as proof that the provider deduplicates it.

Before slot 3, code-owned deduplication merges overlapping candidates by normalized causal claim, affected change reference, and compatible evidence. The verifier sees one candidate with linked specialist observations. Existing findings are reconciled after verification and publication preparation, so historical matching cannot cause duplicate verifier spend.

## Specialist work units

The primary review is a bounded fan-out of focused questions, not one prompt that asks a model to notice everything. Each unit receives the changed symbols and only the evidence needed for its question. All units return the same candidate schema, so aggregation, verification, deduplication, cost accounting, and publishing do not depend on the provider.

| Specialist | Question | Deterministic inputs that should be preferred |
|---|---|---|
| Correctness | What concrete behavior can fail because of this change? | Changed control/data flow, callers, tests, error paths, and relevant history |
| Security | Does the change weaken a trust boundary, validation, auth, permission, secret, or injection rule? | Sources/sinks, auth middleware, schemas, policy rules, dependency diagnostics |
| Concurrency and data integrity | Can ordering, retries, transactions, cancellation, or shared state lose or duplicate work? | Async call graph, transaction boundaries, queues, locks, idempotency keys |
| API and contracts | Can a changed interface, schema, event, or configuration break an existing caller? | Definitions, references, exported types, wire schemas, migrations, compatibility tests |
| Tests | Which changed behavior lacks a meaningful test or has a test that can pass for the wrong reason? | Changed branches, test references, fixtures, coverage/static diagnostics |
| Conventions and style | Does the change violate a trusted, scoped team rule or create a maintainability problem with concrete impact? | `.blackbox/rules/`, imported repository instructions, formatter/linter diagnostics, neighboring patterns |

Correctness and security are the default P1 units. Conventions and style are handled by deterministic rules first, with a model unit only for scoped semantic patterns. Concurrency, API, and test units are typed P1 extension points and become enabled when the language/index has the required evidence and the run reservation allows them. A profile can select units explicitly. It cannot raise the budget or grant tools. Running the same model under several role prompts increases coverage of questions, but it does not create independent confirmation. “Catch them all” is not an acceptance claim; the run reports selected, omitted, unsupported, and unresolved scope.

## Model routing and replacement

The model gateway treats each provider/model/API-format/reasoning combination as a worker route with a versioned capability record. The record includes provider, model ID, API format, reasoning setting, structured-output mode, tool support in that exact API/reasoning combination, context and output limits, tokenizer or estimation method, usage reporting, timeout/cancellation behavior, local/cloud location, licensing, price revision, and evaluation results. The review state stores this identity; it never stores provider-specific assumptions in finding or publisher code.

The initial routing experiment is:

```text
exact snapshot
    -> AST, graph, static diagnostics, tests and history evidence
    -> correctness + security specialist workers
    -> independent verifier from a different model family when configured
    -> dedupe, ranking, anchor validation and deterministic summary
    -> grouped GitHub review and export

disagreement or authorized high-impact candidate
    -> separately reserved escalation investigator
```

An economical cloud model or capable local model can be the primary hunter. GPT-6 Luna is a candidate verifier when its current official capabilities and price entry are configured. DeepSeek V4.1 Flash is a candidate escalation worker when its provider is configured and the run accepts the peak/off-peak price policy. GPT-OSS is a local-only candidate for classification or dedupe if the machine can run it; it has no OpenAI API price. GLM-5.3 Flash, Qwen3 Coder, and other candidates require an authoritative provider entry before use. These names are experiment inputs, not permanent defaults.

When trustworthy authorship signals exist, a run may route a PR to a different model family than the one that authored it. Signals can include verified commit trailers, branch prefixes, or an explicit agent marker. Missing or ambiguous authorship never changes routing. This is an evaluation strategy for correlated blind spots, not a claim that one model is always better.

The verifier receives the candidate and independently selected evidence, not the primary model's reasoning trace. It can support, reject, request more context, or mark a runtime proof requirement. Only supported findings with valid evidence may reach the publisher. A provider timeout, schema failure, or unavailable capability becomes a visible run state and does not trigger a silent fallback.

## Rules, learning, and custom context

Trusted base-branch configuration may define plain-language rules, severity thresholds, path/file scopes, required checks, and review triggers. The resolver can import existing `AGENTS.md`, `CLAUDE.md`, Cursor rule files, and a planned `.blackbox/rules/` directory, but it records the source path and revision and rejects a PR-only rule as authority. A rule can narrow a specialist's question or add evidence to retrieve. It cannot grant spend, tools, network access, merge authority, or permission to suppress a finding.

Feedback is an event, not an instruction. Reactions, replies, resolution state, accepted fixes, dismissals, duplicates, and merged outcomes may update a proposed rule or ranking feature only after a configured approval threshold. The service stores the examples, decision, actor, scope, model/index version, and rollback link. It must support preview, approve, reject, disable, export, delete, and replay. Until approved, feedback affects evaluation reports only. A learned rule that reduces comments must be tested against false-clean cases before activation.

The agent-agnostic API and MCP surface expose read-only operations such as `review.status`, `review.finding`, `review.context`, and `review.export`. A coding agent may request a finding's evidence, suggested fix text, or current status. It cannot use that surface to spend, publish, edit repository rules, resolve a conversation, or run shell commands. Agent-mode CLI output uses the same schema and does not create a second review authority.

## Role contracts

All roles treat repository files, comments, issues, logs, tool output, and web content as untrusted data. They cannot authorize spending, change tools, request secrets, or override policy.

### Planner

Input: immutable manifest, trusted rules, language metadata, deterministic signals, and remaining budget. In P1 this is a deterministic scheduler, not a model call. It outputs the fixed work units above, concrete questions, local context requests, priority, expected output, and coverage gaps. A future model planner remains P2 and must fit inside an explicitly expanded profile. No planner produces public findings.

### Candidate reviewer

Input: change packet, evidence ledger, trusted requirements, bounded read-only retrieval. Output: candidates with an application-assigned temporary candidate ID, category, severity, trigger, expected/actual behavior, impact, exact evidence, counterevidence, change relevance, causal change reference, baseline evidence when needed, and confidence status. Empty output is valid. Style preferences and unrelated defects are excluded.

### Skeptical verifier

Input: deduplicated candidates plus independently retrieved evidence. Output for every candidate: `supported`, `rejected`, `needs_more_context`, or `requires_runtime_validation`, with evidence chain, causal-link check, counterexample search, verification kind, and uncertainty. It cannot publish or spend further. `supported` means the evidence supports a concrete claim within the review scope. It does not mean the service reproduced the failure.

### Summary

Prefer deterministic rendering from validated results. If a model is used, it may summarize only validated structured findings, scope, exclusions, revision, tests, verification, model, and cost. It cannot add findings or claim safety.

### Patch generator, deferred

Separate authorization and budget. It proposes a minimal patch for specified verified findings. It cannot push, merge, weaken tests, install dependencies, or execute commands without separately granted tools.

## Structured contracts

Candidate:

```json
{"candidate_id":"application-assigned-temporary-id","category":"correctness|security|performance|reliability|tests|policy","severity":"low|medium|high|critical","title":"...","trigger":"...","expected":"...","actual":"...","impact":"...","change_relevance":"introduced|worsened|pre_existing|uncertain","causal_change_ref":[{"path":"...","sha":"...","start":1,"end":2,"side":"RIGHT|LEFT","reason":"..."}],"baseline_evidence":[{"path":"...","sha":"...","start":1,"end":2,"side":"RIGHT|LEFT","reason":"..."}],"evidence":[{"path":"...","sha":"...","start":1,"end":2,"side":"RIGHT|LEFT","reason":"..."}],"counterevidence":["..."],"verification_kind":"model_assessment|deterministic_analysis|runtime_evidence","status":"candidate"}
```

Verification:

```json
{"candidate_id":"...","decision":"supported|rejected|needs_more_context|requires_runtime_validation","evidence_checked":["..."],"causal_link":"introduced|worsened|pre_existing|uncertain","verification_kind":"model_assessment|deterministic_analysis|runtime_evidence","reason":"...","uncertainty":"..."}
```

Every field is runtime-validated. Schema failure is rejected; one bounded repair attempt may be admitted through the same budget gateway. Unsupported tool calls become explicit capability errors.

## Deduplication and lifecycle

The application assigns a persistent `finding_id` and a per-observation `occurrence_id`. Each occurrence stores an `evidence_version` containing repository, head/base SHA, paths, ranges, content hashes, causal references, and verification kind. A fingerprint over category, normalized claim, affected symbol, and evidence is a matching signal only. It can match a new occurrence to an existing finding, but it cannot create the durable identity by itself. Reconcile against prior bot findings and existing threads after verification. States are `open`, `corrected`, `dismissed`, `duplicate`, `superseded`, `not_rechecked`, and `rejected`. A new commit touching unrelated files cannot silently clear an unresolved finding. A changed head revalidates affected findings and blocks stale publication.

## Check Run Agents

A Check Run Agent is a declarative review job, not a new unconstrained agent identity. Its manifest is loaded from the trusted base revision and validated before scheduling. It declares:

```yaml
id: security-review
name: Security Review
input: full_diff
triggers:
  labels: [security]
  manual: true
prerequisites: [static-analysis]
tools: [repo.read, diff.read]
mcp: []
profile: local
max_calls: 2
max_budget: 0.00
conclusion: advisory
```

The same schema supports Web Event Tracking, Ticket Requirements, Accessibility Audit, and Production Errors, but their tools and prerequisites differ. A production-error check may require an explicit Sentry connector and a separate disclosure policy. An accessibility audit may remain static in P1 and defer browser execution. A ticket-requirements check may read only an allowlisted issue. No agent may use a tool or MCP operation absent from its manifest, and no manifest changed by the PR can grant itself a tool, budget, provider, or required-check status.

## PR description composer

The summary is generated from the validated review record. The renderer should produce a concise block such as:

```md
<!-- BlackBox pull request summary starts here -->
> [!NOTE]
> ## What changed
> - Adds ...
> - Preserves ...
>
> ## Risk and limitations
> - High risk: ...
> - Review scope: ...
>
> ## Review coverage
> - Revision: `abc1234`
> - AST/context coverage: ...
> - Checks: ...
>
> ## Validated findings
> - ...
>
> <!-- BlackBox pull request summary ends here -->
```

The actual renderer should omit empty sections, avoid repetitive praise, preserve the author’s existing description, and escape untrusted titles/paths. “Review fixes” is included only when the run has verified follow-up changes. The first release previews this block; an authorized updater is P2 after marker/concurrency/reconciliation tests.

## Publishing

The summary and check outcome use `completed_clean`, `completed_findings`, `incomplete`, `errored`, `cancelled`, `superseded`, `unauthorized`, and `awaiting_budget`. When supported findings remain, the summary says `Review completed with findings` and lists the reasons. That wording is advisory and does not grant merge authority. A separate configured check policy may use `REQUEST_CHANGES` for verified findings only after the owner enables it.

The publisher emits one updateable summary and at most the configured number of high-value inline review threads. It may group them into one GitHub review for the exact head, with `event: COMMENT` by default. A separate owner-enabled policy may use `REQUEST_CHANGES` for verified findings. It validates current head, diff-side anchors, path permissions, external IDs, and policy. A comment must point to a changed line on the reviewed commit. It uses the GitHub review-comment fields `commit_id`, `path`, `side`, and `line`; multi-line comments use `start_line` and `start_side` only when the range is valid. When an endpoint requires hunk-relative `position`, the adapter derives it from the exact patch and stores both representations. Deleted-line findings use a valid base-side anchor or summary reference. The service never invents a line to make a finding look actionable.

Each published finding has a persistent application-assigned `finding_id`, a revision-bound `occurrence_id`, and an evidence version. On a later head, the service fetches existing threads, uses fingerprints only as matching signals, and chooses among `open`, `not_rechecked`, `superseded`, `corrected`, `duplicate`, or `dismissed`. A changed line is revalidated before the bot edits or adds a thread. GitHub may display the thread as outdated or resolved; those host states are evidence, not assumptions made by the model. A lost response is reconciled before retrying.

Only `supported` findings with a valid causal link and current changed-line evidence can become human-facing inline threads. `rejected`, `needs_more_context`, `requires_runtime_validation`, `pre_existing`, and `uncertain` candidates remain private. The public summary may report their aggregate unresolved count and coverage gap without publishing the unsupported claim.

The inline body states severity, title, path/range, concrete evidence, expected versus actual behavior, impact, suggested fix when safe, and verification status. A suggestion block is used only for a validated minimal edit; otherwise the renderer uses text or a unified diff. The body includes a stable hidden finding marker for reconciliation. It omits generic praise and unsupported certainty. The summary states reviewed revision, model/provider, files and context covered, omissions/truncation, deterministic checks, verifier status, cost/usage, and incomplete conditions.

## CLI workflow

The local CLI is the fastest feedback path for uncommitted or committed changes. It captures a baseline against an explicit branch/ref, records the exact snapshot, and may create an isolated Git worktree so the developer can continue working while the review reads a fixed state. It streams structured `issue_event` records for agent integrations and renders a human-readable terminal view separately. The CLI review and GitHub PR review share the same pipeline and finding schema, but the GitHub review remains necessary for team-wide coverage and merge policy.

An unattended review/fix loop is P3. Until execution isolation and repair authorization exist, the CLI can stream findings and export them but cannot run arbitrary repository commands or silently edit the worktree.

## Provider compatibility

The gateway normalizes request ID, provider/model/API-format/reasoning identity, context/output caps, timeout, cancellation, usage, pricing revision, schema/tool capabilities, and typed errors across multiple adapters. A local OpenAI-compatible endpoint is tested for the exact features used. Each cloud adapter is configured by the owner with current pricing and schema support, and every role-to-model route is recorded in the run. Models without tool calls receive a server-built packet. Models without strict JSON schema use local validation plus one bounded repair. No endpoint is selected implicitly, and a role cannot switch to another adapter after failure unless that route was explicitly authorized and reserved before the run. For each route, a fixture must prove the exact API format, reasoning setting, structured-output mode, usage accounting, output-limit behavior, timeout handling, and any tool/continuation behavior. A model-level `supports_tools` flag is insufficient.

## Incremental invalidation

Reuse is allowed only when the prior head is an ancestor, merge base and trusted policy are unchanged, prompt/model/index versions are compatible, and cached evidence hashes still match. Force-pushes, rebases, policy changes, changed model contracts, missing history, and affected imports/callers invalidate relevant context. A narrow delta review never produces a full clean verdict without declared full-PR coverage.
