# Macroscope code-review article excerpts

- **Publisher:** Macroscope
- **Source type:** first-party product and research articles
- **Requested URLs:**
  - https://macroscope.com/blog/introducing-macroscope-cli
  - https://macroscope.com/blog/new-code-review-pipeline-detection-mode
  - https://macroscope.com/blog/beyond-tokenmaxxing
  - https://macroscope.com/blog/opus-4.5-code-review
  - https://macroscope.com/blog/free-for-open-source
  - https://macroscope.com/blog/introducing-macroscope
  - https://macroscope.com/blog/code-review-benchmark
- **Retrieved:** 2026-09-29
- **Retrieval:** direct HTTPS retrieval plus the web reader. The web reader could not open the first and second requested slugs; direct HTTPS retrieval succeeded for both. The second URL returned the article titled “Improved Code Review + Detection Mode.” The note preserves relevant source-backed excerpts and paraphrases, not the full articles and not a claim that the vendor's implementation is available for reuse.

## Introducing Macroscope CLI

Canonical URL: https://macroscope.com/blog/introducing-macroscope-cli

The article describes a local CLI that reviews a branch before push, can be invoked from supported coding agents, streams findings, and runs in an isolated Git worktree by default. It describes an optional autoloop that repeats review, validation, and fixing for up to five cycles. The article positions the CLI as a complement to GitHub review because local use is opt-in and cannot guarantee team-wide coverage or block a merge.

## Improved Code Review + Detection Mode

Supplied URL: https://macroscope.com/blog/new-code-review-pipeline-detection-mode

Retrieved title: “Improved Code Review + Detection Mode.” The article says a newer pipeline increased detection across critical, high, and medium severity categories, with a modest false-positive and latency tradeoff. It presents two controls: Prefer Coverage, which favors bug detection and accepts more false positives, and Prefer Precision, which favors high-confidence findings and accepts more missed bugs. It says settings can be chosen at repository or individual-developer level.

## Beyond Tokenmaxxing

Canonical URL: https://macroscope.com/blog/beyond-tokenmaxxing

The article argues that token volume is not an adequate engineering outcome measure. It distinguishes code that is pushed from code that lands on the default branch, and presents landed share as a more meaningful signal than raw generated output. It reports customer-sample statistics and explicitly says no single metric captures the full value of engineering work.

## Opus 4.5 on Code Review

Canonical URL: https://macroscope.com/blog/opus-4.5-code-review

The article reports Macroscope's internal comparison of a new Opus 4.5 pipeline with its prior production pipeline. It defines recall as known bugs detected, precision as surfaced issues judged valid, and F1 as the harmonic mean. It reports higher recall, fewer false positives, a higher F1 score, and higher average latency for the new pipeline. These are internal, version-specific claims and are not independent acceptance evidence for this project.

## Macroscope for Open Source

Canonical URL: https://macroscope.com/blog/free-for-open-source

The article describes no-cost access for qualifying non-commercial open-source projects. It also describes automatic PR summaries, summary placement in a PR description or comment, updates after new commits, inline bug comments, suggested fixes, and comment-based follow-up. Eligibility and reasonable-use limits are vendor-controlled and do not change this project's self-hosted cost assumptions.

## Introducing Macroscope

Canonical URL: https://macroscope.com/blog/introducing-macroscope

The article describes a codebase “code walking” layer that traverses ASTs and builds a graph used to retrieve relevant references for model context. It connects this to summaries, bug detection, and codebase understanding. It also reports an internal benchmark based on real runtime bugs from open-source repositories and measures detection rate, comment volume, and price.

## Code Review Benchmark

Canonical URL: https://macroscope.com/blog/code-review-benchmark

The article reports an internal benchmark published 2025-09-17. It assembled 118 self-contained runtime bugs from 45 open-source repositories across eight languages. Bug-fix commits were found from history; an LLM classified and described candidates, git blame was used to identify the introducing commit, and a subset was manually reviewed. Each tool reviewed an isolated PR containing the suspected introducing change. The article reports detection rates of 48% for Macroscope, 46% for CodeRabbit, 42% for Cursor Bugbot, 24% for Greptile on 72 bugs, and 18% for Graphite Diamond. It also reports comment volume and plan prices.

The article states several limits: only self-contained runtime bugs were evaluated; tools used default settings and minimum enabling plans; sample sizes differed because of availability/rate limits; invisible rate limits were possible; a subset of false results was manually checked rather than every result; language distribution was uneven; and the benchmark was run in August-September 2025 while tools change.

## What this changes in the plan

1. Make AST walkers a measured context layer, not a vague “repository understanding” feature. Compare with and without walkers under the same prompts and budgets.
2. Add explicit review profiles that trade recall, precision, latency, comment volume, and cost. Do not call one profile universally better.
3. Treat local CLI review as a first-class P1 workflow with exact baseline capture, optional isolated worktrees, streaming machine-readable events, and a separate GitHub review that protects team coverage.
4. Measure landed outcomes and useful findings per cost. Do not use token count, generated lines, or raw comment count as quality by themselves.
5. Replicate the benchmark shape with real historical bugs, clean controls, isolated tasks, repeated runs, held-out cases, and explicit judge limitations. Do not present vendor percentages as goals or independent truth.
6. Keep autonomous fix loops deferred until execution isolation, spend admission, patch verification, and rollback are proven.

## Supplemental source discovered while resolving the supplied links

- [MacroscopeBench: Benchmarking Code Review](https://macroscope.com/blog/macroscopebench), retrieved 2026-09-29. The article describes a proprietary benchmark built from real bugs and clean control commits. It reports a public subset of 195 commits, three independent runs, precision/recall/score, cost, duration, and LLM judging. It explicitly lists limits: LLM judges, severity distribution chosen to distinguish systems rather than represent production, a common prompt/harness that omits model-specific tuning, and penalties for subjective or non-correctness reports. This is a useful benchmark design reference, not neutral ground truth.
- [AI Code Review Precision vs Recall](https://macroscope.com/content/ai-code-review-precision-vs-recall), retrieved 2026-09-29. The article frames “Prefer Coverage” and “Prefer Precision” as audience-dependent choices: agent-triaged comments can tolerate more noise, while human-read reviews should publish fewer higher-confidence findings. The plan adopts this as a configurable tradeoff, with shared budget controls.
- [AI Code Review CLI: Local Command Line Code Review in Your Terminal](https://macroscope.com/content/ai-code-review-cli-local-terminal-reviews), retrieved 2026-09-29. This official content page supplements the inaccessible web-reader rendering of the supplied CLI slug. It describes exact-base capture, isolated worktrees, streaming findings, raw machine-readable events, and the rule that local CLI review does not replace team-wide GitHub review.

## Model-candidate verification used by the plan

- [OpenAI GPT-6 Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna), retrieved 2026-09-29. The official page lists the model's current context/capability information and $0.10 per million input tokens, $0.50 per million output tokens, with separate cached-input pricing. The plan treats this as a time-stamped registry entry, not a permanent price.
- [DeepSeek API pricing](https://api-docs.deepseek.com/quick_start/pricing/), retrieved 2026-09-29. The official pricing page lists the `deepseek-flash` V4.1 Flash route, context and structured/tool-call support, and separate cache-hit, cache-miss, output, and peak/off-peak prices. The plan requires the current entry and billing window to be checked before reservation.
- [OpenAI open-weight models](https://help.openai.com/en/articles/11870455-openai-open-weight-models-gpt-oss), retrieved 2026-09-29. GPT-OSS is described as an open-weight model for local deployment rather than an OpenAI API model. The plan therefore treats it as a local candidate with machine-resource cost, not an OpenAI cloud-price assumption.

GLM-5.3 Flash, Qwen3 Coder, and other names in the owner's proposal remain experiment candidates. They are not assigned a price or capability in the plan until an authoritative provider entry is available.

## Greptile sources supplied later

- [Greptile Agent](https://www.greptile.com/agent), retrieved 2026-09-29. The page describes a graph/indexing step, parallel review agents that inspect impact beyond the diff, and learning from team comments and merged code. It also shows custom rules, scoped rules, review triggers, severity thresholds, PR summaries, agent handoff, and test generation. These are product claims and workflow references, not independent quality evidence.
- [Learning and Custom Context](https://www.greptile.com/learning), retrieved 2026-09-29. The page describes a graph of the repository and adjacent repositories, custom context in `greptile.json` and `.greptile/rules`, indexing of `AGENTS.md`, `CLAUDE.md`, and Cursor files, and learning from reactions, tags, and merged changes. The plan adopts the scope and provenance pattern while keeping learned rules inactive until approval and replay.
- [TREX](https://www.greptile.com/trex), retrieved 2026-09-29. The page describes runtime validation that starts services, sends requests, runs targeted tests/browser flows in a sandbox, and attaches logs, screenshots, traces, scripts, videos, or API output to a PR. It reports a vendor claim of roughly 20% more bugs than review alone. The plan defers this to a separate hostile-code isolation gate and treats the percentage as a replication target only.
- [Independence](https://www.greptile.com/independence), retrieved 2026-09-29. The page describes an agent-agnostic validation layer, handoff to Claude Code, Cursor, Codex, and Devin, MCP access to review context, and an iterative “greploop.” The plan adopts a narrow read-only API/MCP and agent-mode CLI, with no external agent authority to publish, spend, execute, or resolve its own findings.
- [Security Check](https://www.greptile.com/security-check), retrieved 2026-09-29. The page describes rule-based scanning, software-composition analysis for CVEs, and an AI security agent for contextual or chained exploit analysis. The plan uses deterministic signals as evidence before the AI security specialist and verifier.
- [Greptile CLI](https://www.greptile.com/cli), retrieved 2026-09-29. The page describes local branch review, parity with hosted reviews, agent mode, raw output, severity findings, suggested fixes, summaries, and test generation. The plan keeps the CLI local-first and shares the GitHub pipeline schema.
- [Partners](https://www.greptile.com/partners), retrieved 2026-09-29. The page describes detecting partner APIs/SDKs/configuration and reviewing against partner-maintained guidance with attached source links. The plan makes these optional, connector-scoped context adapters with freshness and disclosure controls.
- [Knowledge Base](https://www.greptile.com/knowledge-base), retrieved 2026-09-29. The page describes generated codebase documentation, a codebase map, past risks, MCP access, real-time updates, manual edits, custom rules, and context from Notion, Jira, Linear, or Datadog. The plan uses a versioned, source-linked knowledge base and treats it as context rather than authority.
- [Security Practices](https://www.greptile.com/security), retrieved 2026-09-29. The page describes cloud and bring-your-own-cloud/on-prem deployment options, customer-controlled LLM endpoints for self-hosted use, code/log storage practices, and security/compliance claims. These claims inform deployment questions but do not establish our own isolation, patching, retention, or audit controls.
- [Models are worse at reviewing their own code](https://www.greptile.com/blog/model-inversion), retrieved 2026-09-29. The page reports a vendor study of two 500-PR datasets, three runs per PR, and LLM-as-judge recall of high-severity bugs. It describes cross-model review, different bug-category blind spots, and scope-versus-verification behavior. The plan uses this as motivation to test model diversity and model-inversion routing, not as a universal ranking.
