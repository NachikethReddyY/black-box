# Review Service evaluation plan

## Competitive scorecard

Compare our reviewer with the selected vendor tools and open-source baselines only on matched tasks, pinned revisions, the same ground-truth policy, and recorded spend. Do not infer a ranking from vendor marketing pages or different benchmark harnesses.

| Dimension | Primary measure | Better result | Required limit |
|---|---|---|---|
| Finding quality | Human-adjudicated supported precision and labelled/seeded recall | More supported bugs with fewer false positives | Report denominators and judge agreement |
| Actionability | Valid changed-line anchor rate, evidence completeness, accepted-fix rate | More findings a developer can act on immediately | Unanchorable findings remain summary/incomplete |
| Context | Cross-file bug recall, resolved graph edges, relevant-context hit rate | More correct findings beyond the diff with fewer context tokens | Dynamic/generated/external gaps stay visible |
| Cost | Total reconciled cost and local resource time per supported finding | Lower cost for the same quality and coverage | No cost win from hidden omissions or unbounded local usage |
| Speed | Time to first useful finding and complete review latency | Faster feedback at the same quality | Include queue, indexing, model, verification, and publishing time |
| Noise | Duplicate, rejected, speculative, and comment-volume rate | Less developer attention spent on invalid output | Do not suppress low-confidence findings without recording them |
| Reliability | Stale-head, duplicate-publication, restart, offline, and unknown-liability outcomes | Correct recovery and explicit incomplete states | No silent fallback, loss, clean verdict, or paid spend |
| Team fit | Rule adherence, feedback precision, learning rollback, and scope correctness | Rules become more useful without suppressing bugs | Learned changes require approval and replay |

The first competitive report must show sample size, task mix, model/profile, context policy, price revision, local hardware, counting method, confidence/uncertainty, and limitations. Vendor percentages and screenshots are research inputs. They are not our targets until reproduced with comparable cases.

## Benchmark-inspired corpus

Use two complementary datasets:

1. **Owner corpus:** historical fixes, seeded regressions, clean changes, intentional unusual code, and cross-file cases relevant to Black Box and the owner's TypeScript/Python work.
2. **Historical-bug replay:** real bug-introducing commits reconstructed as isolated review tasks from public repositories, with the subsequent fix kept hidden during review. Include clean control commits. Record repository, language, base/head SHAs, bug/fix linkage, severity, and source license.

The historical-bug replay must not use the fix description or future PR context in the reviewer input. A separate judge may use the fix to assess recall, but judge access and prompts are recorded. Repeat each model/profile at least three times where budget permits because model output is nondeterministic.

Create an owner-controlled, private corpus of historical fixes, seeded regressions, clean changes, intentional unusual code, and cross-file cases relevant to Black Box and the owner's TypeScript/Python work. Include auth/permissions, data integrity, concurrency, migrations, error handling, tests, dependency updates, renamed/deleted files, small and large PRs. Keep prompt-tuning examples separate from held-out cases.

Each case records base/head SHAs, intended issue, affected files, expected severity, evidence anchor, whether runtime proof is required, and adjudication notes. Ground truth is incomplete for historical code, so report labelled/seeded recall separately and never claim exhaustive recall.

## Baselines and ablations

Compare:

1. static-only/diff-only;
2. model with diff only;
3. model plus lexical/symbol context;
4. plus deterministic signals;
5. plus skeptical verification;
6. plus runtime validation only when independently authorized;
7. each owner-approved local/economical model under the same snapshots and caps;
8. diff/context retrieval with and without purpose-built AST walkers, using the same prompts and budgets.

The first model-selection pilot should contain roughly 100 pinned PR or commit cases when the owner's labelled corpus reaches that size. Treat 100 as an engineering comparison set, not evidence of a universal ranking. Compare each candidate primary hunter, verifier, and conditional escalation under the same case order, snapshot, specialist questions, context cap, output cap, and reservation. Include these ablations:

9. one general review prompt versus correctness/security/concurrency/API/test specialist work units;
10. the same model for all roles versus a different model family for verification;
11. primary candidates with AST and changed-symbol context enabled;
12. verifier disabled, enabled for all candidates, and enabled only for high-impact or disagreement cases;
13. escalation disabled versus conditional escalation with a separate budget reserve.

14. one reviewer family versus model-inversion routing when authorship signals are available and trusted;
15. a fresh codebase map versus the versioned knowledge base, with generated notes and past-risk records ablated;
16. unapproved feedback versus approved custom rules, including conflicting directory scopes and a false-clean control;
17. deterministic security/SCA signals alone versus those signals plus a security specialist and verifier;
18. agent-mode CLI/API/MCP context retrieval with a credential-free fixture, proving that no client can publish, spend, execute, or edit rules.

Record the model/provider version, capability record, price revision, context and output limits, cache state when available, local hardware, prompt/index/policy versions, and every role call. A model is not promoted because it produces more comments. Promotion requires a better supported-finding result at an acceptable false-positive rate, latency, and cost on held-out cases.

AST evaluation must report parse success, resolved versus unresolved edges, context bytes/tokens, latency, selected-file coverage, evidence-anchor validity, and the effect on precision/recall. A walker that is fast but systematically misses dynamic behavior is not an automatic improvement.

Replay is read-only and does not publish or spend implicitly. Pin prompt, model, policy, index, and repository revisions for every comparison.

## Metrics

Report F1 alongside its components, but never hide them behind one score. Report precision of supported findings, seeded/labelled recall, false-clean rate, duplicate rate, severity agreement, evidence-anchor validity, changed-versus-pre-existing classification, coverage of selected/omitted units, verifier rejection rate, latency, model calls, estimated/actual/unknown cost, comment volume, signal-to-noise, and useful findings per unit cost. For each metric, state the denominator and whether it is judged by a human, deterministic rule, or model. Include sample size, counting method, confidence/uncertainty, and limitations.

## Acceptance matrix

The implementation must preserve the self-contained [T-01 through T-36 fixtures](ACCEPTANCE_TESTS.md). Each fixture's `Owner phase` controls whether it is implemented in P1, denied as a disabled feature, or deferred to P2/P3. T-22, T-28, and T-29 receive P1 authority-denial or disabled-feature coverage only. T-31 tests execution denial in P1. T-33 tests schedule and agent-spend denial plus static validation. T-35 covers P1 run metadata and evidence-reference export; rich feedback history and archive migration remain P2. T-36 requires the comparison harness, while fake-provider results do not establish model quality. Repository-specific tests should cover exact SHA, GitHub diff anchoring, Black Box relay fallback, Windows/WSL2 sleep and filesystem limits, and dashboard status semantics.

Key P1 pass conditions: no cloud call without authorization; local-only cannot reach cloud; reservations are transactional; malformed/invented output cannot publish; stale heads cannot publish; incomplete verification is visible; tests/dependencies are represented; duplicate external operations reconcile; offline/relay quota failure waits without paid infrastructure; unsupported model capabilities reject clearly.

## Human review protocol

Two owner-approved reviewers adjudicate held-out findings where practical, recording supported/rejected/duplicate/intentional and severity. Keep authorship/model order hidden where feasible. Do not use model self-grading as the sole label. Record hints, prompt changes, and any cases used to tune the system.

## Learning and knowledge-base protocol

Keep rule-tuning cases separate from held-out review cases. For every proposed learned rule or knowledge-base note, record the source revision, scope, approving actor, examples, expected effect, expiry/rebuild trigger, and rollback. Compare review results before and after activation. A rule passes only if it improves its stated precision, recall, or noise target without increasing false-clean cases in unrelated paths. Test rejected feedback, conflicting rules, stale generated notes, malicious comments, and a PR that tries to add an authority-granting rule.

The knowledge base is evaluated as retrieval context, not as a truth oracle. Measure note freshness, source coverage, graph-edge resolution, retrieval hit rate, context bytes/tokens, and findings that rely on each note. If a note has no current source or approval, it must be excluded or marked as a coverage gap.

## Agent handoff evaluation

Run the agent-mode CLI and read-only API/MCP fixture with no GitHub write token, model key, shell, or network connector. Verify that a client can read a finding, evidence reference, suggested fix text, and current status, but cannot publish a comment, spend, resolve its own finding, mutate rules, or run a command. Re-review the exact new head after any external agent reports a fix.

## Limits

A small private corpus cannot establish general recall. Vendor benchmark figures are useful replication targets only. Macroscope’s published 2025 study reports 48% detection on 118 bugs, but its tools had unequal sample sizes, default settings, availability/rate-limit exclusions, and LLM-assisted judging. Its newer MacroscopeBench describes 195 commits in one public subset, three independent runs, real-bug and control commits, and LLM judges. These details make a strong evaluation template, not independent ground truth. Historical fixes have selection bias. Model and provider prices/capabilities change. Local hardware performance is machine-specific. Runtime reproduction may be unavailable. Review quality does not prove repository safety or replace human/CI review. Vendor benchmark claims such as “79.5% matched developer changes” versus “69.4%” are external claims until the source, corpus, sampling, definition of match, evaluator, and confidence are verified. They may guide replication, but they are not acceptance targets or product guarantees.

Model diversity reduces correlated failure risk only when the second model receives independently selected evidence and its decision is measured. Different prompts on the same model can repeat the same blind spot. A 100-case pilot can identify a useful direction, but it cannot establish general model superiority. Prices, rate limits, cache behavior, local hardware, and provider model names change, so the model registry and replay manifest must be versioned.

## Profile and cost evaluation

Evaluate `static_only`, `local`, `economy_cloud`, `coverage`, and `precision` on the same pinned cases. Report the Pareto tradeoff among recall, precision, comment volume, latency, and cost. Do not route all PRs to the most expensive profile. Test repository defaults, explicit per-run overrides, and denial when a requested profile exceeds its reservation.

## Competitive baseline protocol

For each baseline, pin the exact tool version, plan/profile, prompt or configuration available to the user, model/provider when known, date, rate-limit or availability exclusions, and all observed usage. Run our service and each baseline on the same isolated case set where access and licensing permit. If a vendor cannot be run under matched conditions, label the result unavailable rather than substituting its published number. Keep vendor feature research separate from measured performance.

The initial smoke evaluation is deliberately smaller than the later approximately 100-case pilot. It must include labelled cross-file bugs, clean controls, a secret-disclosure fixture, a stale-head case, an inline-anchor case, and at least one partial/incomplete case. Compare diff-only versus AST/context and verifier disabled versus verifier enabled before expanding the corpus. Count known bugs found by specialists before verification and the same bugs retained after verification. A verifier that lowers false positives while also dropping real findings must show both effects.

The go/no-go comparison for the first release is narrow: our reviewer must produce valid, evidence-backed inline findings on real changed lines, beat the diff-only baseline on cross-file cases, and show a lower or bounded cost per supported finding than the selected cloud baseline. A failure on quality, anchoring, cost accounting, or incomplete-state correctness blocks expansion even if the feature list looks competitive.

## Greptile-inspired acceptance cases

| ID | Scenario | Required result |
|---|---|---|
| G-01 | Changed function has callers, tests, schema, and history outside the diff | Graph retrieval returns hashed, revision-bound evidence and reports unresolved edges or omitted context |
| G-02 | Five specialist roles run for one PR | Parallelism stays within the shared call/budget limit; each role is attributable; duplicate claims merge before verification |
| G-03 | Root rule conflicts with a deeper directory rule and the PR adds a third rule | Trusted precedence is deterministic; PR-only authority is ignored; the scope decision appears in the run record |
| G-04 | Reviewer rejects a finding and later merges a fix | Feedback is stored as an event; no rule changes until approval and replay; the learned change is reversible and scoped |
| G-05 | Commit trailer or branch prefix identifies a different coding model | Model-inversion routing is applied only when the signal is trusted and configured; ambiguous authorship leaves the default route |
| G-06 | Codex or another agent requests finding context and reports a fix | Read-only API/MCP returns bounded evidence; no client can publish, spend, execute, edit rules, or resolve its own finding; the new head is re-reviewed |
| G-07 | Security scanner reports a CVE and the AI specialist finds a chained exploit | Both deterministic and AI evidence remain visible; stale or unsupported scanner data produces incomplete coverage |
| G-08 | Partner API guidance or an external knowledge connector is unavailable | Review continues with an explicit connector gap and no unsupported clean result; source and freshness are recorded when available |
| G-09 | Runtime validation is requested on an untrusted PR | P1 refuses execution; P3 fixture requires isolation, no secrets, bounded resources, captured artifacts, cleanup, and exact finding linkage |

## Test coverage index

| IDs | Coverage |
|---|---|
| T-01..T-06 | Startup, local-only routing, incomplete configuration, reservations, unknown pricing, timeout liability |
| T-07..T-12 | Deduplication, lease recovery, stale heads, force-push/base invalidation, partial failure, unresolved findings |
| T-13..T-18 | Diff edge cases, capacity refusal/partial scope, tests/dependencies, malformed output, verifier rejection, budget before verification |
| T-19..T-24 | Unauthorized commands, policy injection, hostile tools/paths, lost publication response, duplicate discussion |
| T-25..T-30 | Incomplete required review, branch protection limits, offline/relay quota, approved memory, model capability fallback |
| T-31..T-36 | Runtime evidence, generated-fix controls, scheduled spend controls, backup/restore, export/delete, model comparison |

Each range expands to the individual scenario and required result in [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md). The implementation must turn those definitions into executable fixtures before claiming a phase exit; this index prevents a summary test from being mistaken for coverage of every case.

## Check Run Agent evaluation

Use fixtures for Security Review, Web Event Tracking, Ticket Requirements, Accessibility Audit, and Production Errors. Test trigger filters, path scopes, prerequisites, empty results, unsupported connectors, tool/MCP denial, per-agent budgets, required-check conclusions, and concurrent runs. A deterministic agent must be compared with its AI-enabled version so extra spend is justified by useful findings or coverage.

For security checks, compare rule-based scanning and dependency SCA with the AI security specialist. Include chained exploit cases that need cross-file evidence, stale dependency data, unsupported ecosystems, and a missing scanner. A missing scanner or connector is incomplete, never clean.

Runtime validation remains a P3 experiment. Its fixture must prove isolated checkout, dependency and service setup, bounded requests, captured logs/traces/screenshots/API output, artifact retention, cleanup, secret denial, and a finding that can be traced to the exact code and runtime input. TREX-style “more bugs at runtime” claims are replication targets only; they do not authorize running arbitrary PR code on the Black Box runner.

## PR-description evaluation

Test rendering against a body with both markers, no markers, one marker, malformed nested markers, existing author content, untrusted Markdown, concurrent edits, deleted findings, and a lost GitHub response. The pass condition is preservation of all author-owned text, exactly one owned block, idempotent output, and no overwrite after a body hash/version conflict.

## Inline review-thread evaluation

Add repository-specific cases R-01 through R-11:

| ID | Scenario | Required result |
|---|---|---|
| R-01 | Supported finding on an added line | Posts one grouped/advisory `COMMENT` review with one thread carrying the reviewed `commit_id`, path, side, and line in the current diff |
| R-02 | Supported finding on a deleted line | Uses a valid base-side anchor or summary reference; never invents a right-side line |
| R-03 | Finding on unchanged context | Publishes a summary reference or asks for a valid changed-line anchor |
| R-04 | Multi-line finding | Uses a valid start/end range in one file or falls back to a single anchor; never treats hunk-relative position as a file line |
| R-05 | Provider timeout after GitHub accepts a review | Reconciles by stable external ID/fingerprint before retrying |
| R-06 | New commit moves or fixes the finding | Revalidates it; marks stale/superseded/corrected and does not claim it is still current |
| R-07 | Same finding appears in two review passes | One active thread remains; later output updates or links the existing thread |
| R-08 | Inline body contains unsupported certainty or invented evidence | Schema/policy validation rejects publication and retains the reason |
| R-09 | Valid minimal fix applies to the anchored range | Emits a GitHub suggestion block only when the patch applies cleanly; otherwise emits text/unified diff |
| R-10 | Supported high-severity finding remains after verification | Summary shows “Review completed with findings” and the finding thread; it does not auto-merge |
| R-11 | Review is incomplete or budget-exhausted under a required-check policy | Outcome remains incomplete/awaiting budget and cannot accidentally pass through neutral/skipped semantics |

The screenshot's collapsed files, “outdated” labels, resolved state, and author replies are GitHub presentation states. The service can create and reconcile the underlying review threads; it must measure which resolution operations the configured GitHub credential actually supports rather than promising to control every visual state.
