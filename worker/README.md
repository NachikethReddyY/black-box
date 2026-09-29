# BlackBox dispatcher Worker v0.1

This Worker accepts signed GitHub `pull_request` and `push` webhooks and stores metadata in D1. It reconciles the official GitHub Actions run after dispatch. It also serves the Black Box dashboard: GitHub OAuth sessions are encrypted in D1, and the browser receives normalized repositories, workflow runs, jobs, and bounded job logs. It does not proxy builds, artifacts, or runner traffic.

## Lifecycle

1. Verify the raw request body with `X-Hub-Signature-256`.
2. Require a trusted repository and trusted actor. Pull requests must be from the same repository as the base, so public fork heads are rejected.
3. Persist the request in D1 with a UUID and unique delivery ID before returning `202`.
4. Select a configured runner. Defaults are `home,waiting`; paid `github` and `blacksmith` runners require both explicit configuration and `ENABLE_PAID_FALLBACKS=true`. If HOME is unavailable, the request remains on `waiting` and does not spend paid capacity. The production config keeps paid fallback disabled.
5. Cron claims due rows and dispatches the exact `commit_sha`/`head_sha` with `request_id`, `source_ref`, and optional `pr_number`. A 200 response records `workflow_run_id`; a 204 response remains `ambiguous` until reconciliation finds the run. A timeout never causes an automatic duplicate dispatch.
6. Workflow completion updates one Check Run per required job on the original PR head. Waiting checks stay queued or in progress; the Worker never marks them neutral or skipped.

`pending`, `claimed`, `dispatched`, `ambiguous`, `completed`, and `superseded` are durable D1 states. Newer PR heads supersede older unfinished requests. Manual retry is the only way to retry a dispatched or ambiguous request.

## Local setup

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

Create or select the D1 database and apply the migration with Wrangler. The production `database_id` is committed because it identifies the D1 binding and is not a credential.

```sh
pnpm exec wrangler d1 migrations apply blackbox-dispatcher --local
```

Required local secrets and vars:

- `WEBHOOK_SECRET`: GitHub webhook secret.
- `TRUSTED_REPOSITORIES`: comma-separated `owner/repository` names.
- `TRUSTED_ACTORS`: comma-separated GitHub login names allowed to enqueue work.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`: GitHub App credentials. Keep the private key in Wrangler secrets; do not commit it.
- `DISPATCH_RUNNERS`: `home`, `github`, `blacksmith`, and/or `waiting`, in fallback order.
- `ENABLE_PAID_FALLBACKS`: defaults to false.
- `GITHUB_WORKFLOW_FILE`, `GITHUB_WORKFLOW_REF`: workflow file and dispatch ref.
- `HOME_RUNNER_LABEL`: optional self-hosted runner label, default `black-box-linux`. Availability comes from GitHub's repository self-hosted runner API and requires an online, idle runner with `self-hosted`, `linux`, `x64`, and `black-box-linux` labels. An offline or busy HOME runner fails closed to `waiting`; paid fallbacks are only considered when explicitly enabled.
- `GITHUB_OAUTH_CLIENT_ID`: the GitHub App OAuth client ID. The current App client ID is public metadata and is documented in `dashboard/README.md`.
- `GITHUB_OAUTH_CLIENT_SECRET`: the GitHub App OAuth client secret. Store it with `wrangler secret put`; do not commit it.
- `DASHBOARD_SESSION_SECRET`: a separate random secret used to encrypt OAuth tokens in D1.
- `DASHBOARD_ORIGIN`: the exact dashboard origin allowed for credentialed API requests. Leave it unset when the dashboard is served by this Worker; set it to the local dashboard origin only for a deliberate local integration.
- `HOST_AGENT_TOKEN`: a separate bearer secret for the WSL telemetry agent. Keep it out of the runner config committed to Git; place it in the protected `~/.config/black-box/telemetry.env` file described in `runner/SETUP.md`.

GitHub returns the built-in `Linux` and `X64` labels with capital letters. The dispatcher compares labels case-insensitively, so the configured label can remain lowercase.

The workflow must declare these `workflow_dispatch` inputs: `runner` (`home|github|blacksmith`, a provider key), `commit_sha`, `head_sha`, `request_id`, `source_ref`, and optional `pr_number`. Requests that remain on `waiting` stay pending and do not dispatch a `waiting` runner input. PR requests use the fresh GitHub `merge_commit_sha` as `commit_sha`; if GitHub has not produced one yet, Cron refreshes the PR and waits. Include `request_id` in the workflow run name so ambiguous dispatch reconciliation can find it.

Manual retry is deliberately guarded. An operator must inspect the GitHub run list and confirm that no matching run exists:

```sh
BLACKBOX_URL=https://<worker-host> BLACKBOX_OPERATOR_TOKEN=<local-secret> \
  pnpm retry <request-uuid> --confirm-no-run
```

GitHub does not automatically redeliver missed webhooks. Redeliver the event from GitHub's webhook delivery UI when needed. Cron revisits durable pending rows, but it cannot recover an event that was never acknowledged. Secrets are supplied with `wrangler secret put`; no secret values belong in this repository.

## Workflow triggers

The consolidated `black-box-ci.yml` is intentionally dispatch-only. The Worker receives the original GitHub event, decides whether home capacity is available, and calls `workflow_dispatch` with the exact tested revision. This keeps one authoritative workflow while avoiding a second hosted routing job. The Worker owns push/PR acceptance and the weekly schedule.

## Production activation checklist

The Worker and D1 shell can be deployed without credentials, but it will not accept real events until these values are set as Cloudflare secrets:

```text
WEBHOOK_SECRET
OPERATOR_TOKEN
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY
GITHUB_APP_INSTALLATION_ID
GITHUB_OAUTH_CLIENT_SECRET
DASHBOARD_SESSION_SECRET
HOST_AGENT_TOKEN
```

Then install the GitHub App on the allowlisted repository, configure the webhook URL as `/webhook`, and review the template before copying it into that repository. Runner registration remains a separate owner action because it requires a short-lived GitHub registration token.
