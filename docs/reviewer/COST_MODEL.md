# Review Service cost model

## Policy

Static analysis and local inference can run without cloud spend. When a TokenRouter key is configured, an explicit `review`, `pr-review`, or configured automatic watcher authorizes one bounded cloud run after the provider, model, pricing registry, key reference, profile, and reservation are valid. `REVIEWER_LOCAL_ONLY=true` disables cloud calls. Automatic escalation, embeddings, scheduled reports, macros, webhook triggers, and retries have no authority by default. A PR comment cannot grant spend.

The cost objective is lower cost per supported, actionable finding than the chosen comparison baseline. The system must report the full cost surface: provider usage, cache and retry liability, GitHub/API requests, indexing and analyzer time, local CPU/RAM/disk, knowledge-base maintenance, and operator time where measurable. Never optimize by hiding omitted files, skipping verification, or publishing fewer comments without showing the resulting recall and coverage.

## Accounting categories

Record input tokens, output tokens, cached input if the provider reports it, request count, model/provider, pricing revision, currency, duration, and status. Also record local CPU time, wall time, disk bytes, GitHub API requests, relay rows, and analyzer time for operational cost visibility. Separate estimated, reported, unknown, and reconciled usage.

The price registry is data, not code. Each entry includes provider/model, effective time, input/output/cache unit prices, currency, minimum billable unit, context/output limits, usage-reporting behavior, and source. Stale or missing prices follow the configured `unknown_pricing: deny` policy.

## Model-role economics

The useful unit is cost per supported finding at an accepted precision level, not cost per token. A review can spend a few cents and still be wasteful if it publishes noise, while a second cheap verifier can reduce human triage enough to be worth its call. Record specialist, verifier, escalation, and deterministic work separately so the benchmark can compare quality and cost together. P1 has no model planner call and no hidden SDK retry budget.

For scale only, the official GPT-6 Luna entry currently lists $0.10 per million input tokens and $0.50 per million output tokens. A 20,000-input/10,000-output call therefore estimates $0.007 before provider minimums, cache writes, long-context multipliers, or other billable units. The initial four-call schedule uses two specialists plus one verifier, so the three-call path estimates $0.021. A fourth repair or follow-up call would make the illustrative total $0.028. These are planning examples, not acceptance criteria or promises about an invoice. Reasoning tokens already reported as output must be counted once, and an output-limit termination remains incomplete even when it has incurred billable reasoning. See [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-6-luna) and [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/).

The earlier proposal's “under a cent” ensemble claim is plausible for small packets and selected prices, but it is not a general guarantee. Context retrieval, specialist fan-out, output length, retries, minimum billable units, cache misses, peak windows, and the escalation path can multiply the total. The cost report must show both the pre-run reservation and the reconciled per-role result.

## Reservation algorithm

1. Begin a SQLite transaction for the run and role.
2. Verify actor, profile, model capability, current head, remaining per-call/run/PR/day/month limits, and known pricing.
3. Reserve a conservative maximum liability for the requested input/output cap and any provider minimum.
4. Reject if the reservation would cross any limit or if the run lacks verification reserve.
5. Call the provider with a request ID and timeout.
6. Record reported usage or retain the reserved unknown liability.
7. Release the unused amount only after usage is reconciled. A timeout after possible acceptance is never treated as zero cost.

Reservations cover generation, verification, schema repair, summaries, Check Run Agents, fixes, and scheduled work through one gateway. A deterministic AST walk or static Check Run Agent can be zero-model-cost, but it still consumes CPU, disk, and API/tool quotas. Parallel calls use serializable transactions or a single-writer queue so two calls cannot spend the same remainder.

## Limits

P1 defaults: zero cloud dollars until explicitly configured, one concurrent review, four provider attempts per run, two specialist calls plus one verifier plus at most one repair or follow-up call, five inline comments, per-run/per-PR/per-day/per-month ceilings, bounded context and output, and a reserved verification allowance. There is no hidden retry allowance outside those four attempts. P2 profiles may trade a larger reservation for coverage or precision, but the profile, ceiling, and expected tradeoff must be visible before admission. Manual commands cannot bypass limits. Local calls are subject to memory/time limits even when dollar cost is zero.

## Example workloads

- Static-only PR: zero model calls and zero cloud cost.
- Local review: local provider usage recorded; no cloud reservation exists.
- Economy cloud review: planner/candidate/verifier calls reserve separately; deterministic summary costs zero model calls.
- Large PR over context or budget: decline before any paid call or run a clearly labelled partial review only when the owner authorizes that profile.
- Unknown cloud response: retain the maximum reserved liability and require reconciliation before new spend.

P3 runtime validation has a separate resource cost. A disposable Daytona job is billed for its reserved CPU, memory, disk, and elapsed time under the selected provider account. It is created only for a run that needs runtime evidence, receives no persistent credentials, and is destroyed or allowed to expire after artifact collection. The plan does not treat promotional credits or a current price sheet as a product guarantee. An always-on Daytona reviewer would add a recurring hosting bill and is explicitly out of scope.

For P1, reserve in this order: correctness specialist, security specialist, verifier, then the single repair or follow-up slot. If the verifier reserve cannot be held, the run is `awaiting_budget` or incomplete and cannot publish a clean verdict. A later escalation profile must reserve its own larger ceiling before admission. A model adapter may be swapped after a replay comparison, but the replacement must use the same per-run ceiling and report its own pricing revision.

Per-agent budgets must be included in the shared reservation ceiling; five configured Check Run Agents do not mean five unbounded cloud calls. A deterministic agent should run without a model reservation.

The UI/export must show the configured model, role, pricing revision, estimated and actual usage, reservation status, and any unknown liability. A local model has no provider invoice but still reports CPU time, memory, latency, and disk cost signals.

## Invoice limits

The service can enforce its own configured ceilings, but cannot guarantee a provider invoice of exactly zero when a provider accepts a request and reports usage late, applies minimums, retries internally, charges cached/tool usage differently, or has a pricing change. The product should prevent dispatch under unknown pricing, reserve conservatively, reconcile provider usage, and state this residual limitation.
