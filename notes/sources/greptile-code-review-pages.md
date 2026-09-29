# Greptile code-review product pages

- **Publisher:** Greptile / Tabnam, Inc.
- **Source type:** first-party product, security, workflow, and research pages
- **Requested URLs:**
  - https://www.greptile.com/examples
  - https://www.greptile.com/blog
  - https://www.greptile.com/learning
  - https://www.greptile.com/trex
  - https://www.greptile.com/agent
  - https://www.greptile.com/independence
  - https://www.greptile.com/security-check
  - https://www.greptile.com/cli
  - https://www.greptile.com/partners
  - https://www.greptile.com/knowledge-base
  - https://www.greptile.com/trex
- **Retrieved:** 2026-09-29
- **Retrieval:** direct HTTPS retrieval plus the web reader. Some pages were too large for the web reader, so the relevant visible page text was retrieved directly and normalized. These notes preserve relevant claims and caveats, not a claim that Greptile's implementation is available for reuse.

## Product workflow

The [Greptile blog](https://www.greptile.com/blog) is the index for the supplied product and engineering articles. It lists posts on the agent, TREX runtime execution, model inversion, code validation, sandboxing, and model evaluations. Individual article claims are kept separate from the product-page descriptions below.

The [Greptile Agent](https://www.greptile.com/agent) page describes three steps: index the codebase into a graph of files, functions, and dependencies; run parallel agents that review the PR and its impact beyond the diff; and learn from team comments and merged changes. The page also describes custom rules, style-guide links, directory-scoped rules, severity thresholds, review triggers, summaries, test generation, confidence scores, diagrams, and handoff to coding agents.

The plan adopts the graph, bounded specialist fan-out, custom rule scopes, and agent handoff patterns. It does not treat confidence scores as merge authority, and it requires the same evidence, budget, and verifier controls for every specialist.

## Learning and custom context

The [Learning and Custom Context](https://www.greptile.com/learning) page describes repository and adjacent-repository graphs, `greptile.json`, `.greptile/rules`, and indexing existing `AGENTS.md`, `CLAUDE.md`, and Cursor rule files. It says reactions, tags, and merged changes can update later reviews.

The plan maps this to a versioned knowledge base. Generated module notes, graph summaries, past risks, and rules store source revision, scope, actor, approval, freshness, and rollback. Feedback remains inactive until approval and replay show that it improves the chosen metric without increasing false-clean cases.

## Runtime validation

The [TREX](https://www.greptile.com/trex) page describes understanding the PR and stack, installing dependencies, starting touched services in a sandbox, running targeted tests and browser flows, and attaching logs, screenshots, traces, scripts, videos, or API output to a PR comment. It claims roughly 20% more bugs than review alone.

The plan defers this to P3. The actual service would need a proven hostile-code boundary, dependency/network policy, resource limits, secret denial, cleanup, artifact retention, and exact linkage from runtime input to code and finding. The percentage is a replication target, not an acceptance claim.

## Agent independence and handoff

The [Independence](https://www.greptile.com/independence) page describes a vendor-agnostic validation layer, one-click launch of Claude Code, Cursor, Codex, and Devin with review context, MCP access, a Claude Code plugin, and an iterative loop until comments are resolved. The [Greptile CLI](https://www.greptile.com/cli) page describes local branch review, parity with hosted review, an agent mode with raw output and suggested fixes, severity findings, summaries, and test generation.

The plan uses a local CLI and a narrow read-only API/MCP contract. External coding agents can read finding context, evidence references, suggested fix text, and status. They cannot publish, spend, execute, edit rules, or resolve their own finding. A new exact-head review is required after a reported fix.

## Security and external context

The [Security Check](https://www.greptile.com/security-check) page describes deterministic rule scanning, dependency SCA for CVEs, and AI analysis for contextual or chained exploits. The plan runs selected deterministic signals first and treats missing scanners, unsupported ecosystems, and stale vulnerability data as explicit coverage gaps.

The [Partners](https://www.greptile.com/partners) page describes detecting partner APIs, SDKs, configuration, and integration changes, then applying partner-maintained guidance with source links. The plan makes partner context optional and connector-scoped, with disclosure, freshness, and prompt-injection controls.

The [Knowledge Base](https://www.greptile.com/knowledge-base) page describes generated codebase documentation, a codebase map, potential risks, MCP access, real-time updates, manual edits, custom rules, and context from tools such as Notion, Jira, Linear, and Datadog. The plan keeps the knowledge base local by default and treats every external connector as separately authorized context.

The [Security Practices](https://www.greptile.com/security) page describes hosted and bring-your-own-cloud/on-prem options, customer-selected LLM endpoints for self-hosted use, code and log storage practices, and compliance claims. These claims inform deployment questions. They do not establish the security of this service, its local machine, its connectors, or its future runtime worker.

## Model diversity research

The [Models are worse at reviewing their own code](https://www.greptile.com/blog/model-inversion) article reports two 500-PR datasets, three runs per PR, and LLM-as-a-judge recall measurements for high-severity bugs. It describes cross-model review, different bug-category blind spots, and a scope-versus-investigation tradeoff. The plan uses this as a hypothesis for model-inversion routing and independent verification. It is a vendor study, not general proof of model superiority.

## Examples and limits

The [Examples](https://www.greptile.com/examples) page shows vendor-selected findings across security, correctness, concurrency, data loss, resource limits, and validation in popular open-source repositories. These examples illustrate useful issue categories and evidence style. They are not a representative sample, an independent benchmark, or proof that the same findings will be caught by this service.
