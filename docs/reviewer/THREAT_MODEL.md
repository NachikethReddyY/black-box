# Review Service threat model

## Assets

Source code and history, private repository metadata, GitHub credentials, model/API keys, spending authority, review findings, local snapshots, feedback/rules, logs, SQLite state, outbox identifiers, and the integrity of published checks/comments.

## Actors and untrusted inputs

The owner and explicitly authorized maintainers are trusted for configured actions. PR authors, fork contributors, commenters, issue text, repository files, generated logs, dependencies, analyzer configuration, model output, relay payloads, and external context are untrusted. A compromised local account or dependency is in scope.

## Required controls

| Threat | Control |
|---|---|
| PR edits rules to suppress review | Load trusted rules from approved base/default revision; treat PR rule changes as data |
| Prompt injection in source/comments/logs | Capability checks in code, bounded tools, no secret access, untrusted-data policy |
| Stranger triggers paid review | Actor authorization, explicit run grant, command rate limit, shared reservations |
| Invented line/evidence or malformed output | Runtime schemas, evidence hashes, diff-anchor validation, bounded repair through gateway |
| Specialist or verifier output tries to widen authority or suppress another role | Treat every model result as untrusted data; aggregate through code-owned thresholds and trusted policy; no role can grant tools, budget, clean status, or publication |
| Several specialist prompts repeat one model's blind spot | Prefer independently selected evidence and a different model family for verification when configured; measure correlated misses in replay; never call fan-out a proof |
| PR author spoofs a commit trailer, branch prefix, or agent marker to force model-inversion routing | Treat PR-controlled authorship signals as hints only; require signed/owner-provided metadata for automatic routing and record the route reason |
| Agent manifest grants itself tools/budget or required status | Load manifest from trusted base, validate allowlists/prerequisites/conclusion mapping, deny PR-controlled authority |
| Custom rule, knowledge-base note, or learned feedback suppresses a real finding | Store source revision, scope, actor, approval, evidence, expiry, and rollback; keep proposed learning inactive; replay false-clean controls before activation |
| Agent/MCP client turns review context into a write or execution path | Expose read-only named operations; issue no publisher/model/shell credentials; validate repository, revision, finding ID, and path on every request |
| Partner or external service context leaks source or becomes stale authority | Connector-specific allowlist, disclosure policy, source/revision/expiry metadata, and fail-closed behavior when unavailable or stale |
| PR summary overwrites author text or loses concurrent edit | Marker-owned block, body hash/ETag check, outbox reconciliation, fail closed on one/malformed marker |
| Inline finding points to the wrong line or old commit | Validate exact `commit_id`, path, side, line, diff membership, and current head before publishing |
| Duplicate or stale inline threads | Stable finding fingerprint, outbox external ID, grouped-review reconciliation, and explicit not-rechecked/superseded states |
| Hostile plugin/dependency execution | Disable in P1; later run only in a verified isolation boundary |
| Path traversal/symlink/submodule escape | Snapshot-rooted canonical paths, controlled Git config/transports, allowlists |
| Unauthorized network endpoint | Explicit destination allowlist; local model endpoint only when configured |
| Cross-repository leakage | Repository-scoped authorization on every retrieval and partitioned indexes |
| Stale publish after force-push | Re-fetch head before publication, revision-bound outbox, supersede stale runs |
| Duplicate spend/comment after lost response | Stable request/external IDs, provider usage reconciliation, outbox reconciliation |
| Memory poisoning | Approved, scoped, attributable rules with rollback/delete/export |
| Resource exhaustion | Limits for queue, calls, bytes, disk, logs, model time, API rate |
| Credential leakage | Separate secretless reader, model gateway, and publisher processes; server-side protected storage, redaction, minimal retention, no model/browser exposure |
| Exposed local API | Bind localhost; if exposed, authentication, CSRF/origin controls, TLS and explicit policy |
| Compromised dependency | Pin and audit dependencies, review upgrades, backups and rotation plan |
| Self-hosted deployment is mistaken for isolation or compliance | Keep a local threat model, patch/backup/credential rotation procedure, evidence retention policy, and separate hostile-code execution gate; vendor self-hosting claims are not our audit evidence |

## Credential boundaries

The polling adapter receives the least-privilege GitHub read credential. The publisher receives only the required check/comment write permissions. Model keys are available only to the gateway process and are never included in prompts, logs, repository environment, or execution workers. Black Box App private keys, Worker secrets, runner registration tokens, SSH credentials, and browser state are outside the reviewer process.

The persistent service runs inside WSL2 on the Windows PC. Windows host compromise, administrator access, or a process that can read the WSL virtual disk is outside the application trust boundary. Keep active data on the Linux filesystem, bind the API to localhost, and do not treat Windows-mounted paths as an isolation boundary. The model gateway and publisher communicate with the secretless reader through authenticated local IPC and reject requests without the run, revision, policy, and lease-generation checks.

## Code execution policy

P1 does not install repository dependencies, invoke project builds, run repository-controlled plugins, execute generated fixes, mount the Docker socket, or run arbitrary PR code. AST parsing uses bounded parser libraries against immutable files and does not execute source. Runtime validation is P3 only after proving a hostile-code isolation design on the actual machine. WSL2 and ordinary Docker containers alone do not establish that boundary.

If P3 uses Daytona, treat the sandbox as an untrusted external worker. Do not send it persistent credentials or unrestricted network access. Verify the exact SHA before execution, cap CPU, memory, disk, and time, collect only declared artifacts, destroy the sandbox, and mark missing or late evidence as incomplete. A Daytona sandbox must never become the always-on reviewer host.

## Residual risks

A local machine compromise can expose source and configured credentials. A model can miss a real bug or produce persuasive false evidence. GitHub API semantics and rate limits can change. A provider may accept a request before a timeout. Dynamic language resolution and generated code can leave coverage gaps. These are shown in review status and evaluation metrics; they are not hidden behind a clean verdict.
