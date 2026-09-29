# Black Box v0.1 acceptance contract

The first release must test the intended revision, report its actual result, recover visibly, and never spend money without a configured policy. Local simulations establish code behavior. They do not establish live GitHub behavior, WSL compatibility, speed, or Workers Free CPU fit.

## Working home execution

- One official Linux runner runs inside WSL2. Windows remains installed.
- Record actual WSL memory, filesystem placement, Docker availability and required tool versions. Windows having 16 GB does not imply WSL can use all of it.
- Run AMR `local-checks` at a known SHA; intentionally fail a test; run the same SHA again and observe cache reuse.
- Run the PostgreSQL/report-parser checks with CI-owned state. Cleanup runs on startup and normal completion; interrupted runs cannot leave old database data in the next test.
- Cache files survive ordinary restart. Cleanup never deletes unrelated Docker objects or persistent caches.

## Correct PR automation

- Verify the raw-body webhook signature and a repository/actor policy before accepting executable code. Reject fork code by default.
- Store accepted work durably before returning success. A database error must not acknowledge and lose a job.
- Record request ID, repository/workflow, original event/ref, PR number, head SHA, tested merge SHA, provider, GitHub run ID/attempt and conclusion.
- One authoritative workflow defines test commands for every provider. Dispatch inputs select the provider and exact checkout; they do not restore the original event context.
- Audit every use of `github.sha`, `github.ref`, PR context, conditional and concurrency group against the original AMR workflow.
- A passing old run cannot approve a newer head. A queued request is never completed as neutral, skipped or success.
- A failed test reports failure. It does not switch provider until something passes.

## Safe offline behavior

| Condition | Required behavior |
| --- | --- |
| Home online and idle | Dispatch to home |
| Home busy | Retain waiting work, regardless of enabled fallback |
| Home offline before dispatch | Use explicitly configured fallback, otherwise wait |
| Dispatch API response lost | Reconcile by request ID/run ID; do not blindly resend |
| Home disconnects after dispatch | Report the stalled attempt and require controlled recovery |
| PR has a new head | Supersede pending old work and never publish its result to the new head |
| Webhook never accepted | Inspect/redeliver through GitHub's delivery history |
| Free-plan/database limit reached | Fail visibly, retain durable work when available, no automatic paid upgrade |

Cron reconciliation must revisit durable waiting requests. Retry counts and retention are bounded. Manual recovery must identify the affected request and reconcile existing runs before creating new work.

## Evidence before release

Save focused test output under `.evidence/v0.1/`. Keep credentials, raw private webhook payloads, source code and tailnet inventories out of it. Record live tests separately from local tests. Worker CPU measurements must include both cached credentials and a fresh App authentication path on the actual Free service.
