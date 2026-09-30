# Black Box reviewer

The reviewer is a local TypeScript service for evidence-backed pull-request review. It is designed to run on the Windows PC inside WSL2. Keep its SQLite database, snapshots, and reports on the WSL2 Linux filesystem.

## Commands

```bash
pnpm install --ignore-scripts
pnpm run doctor
pnpm run review -- ref HEAD
pnpm run review -- working_tree
pnpm run review -- staged
pnpm run pr-preview -- OWNER REPO NUMBER
pnpm run pr-review -- OWNER REPO NUMBER
pnpm run poll-once
pnpm run watch
pnpm run status
REVIEWER_STATUS_TOKEN='local-secret' pnpm run serve
pnpm run backup -- /home/reviewer/backups/reviewer
pnpm run restore -- /home/reviewer/backups/reviewer/reviewer.sqlite
pnpm test
pnpm typecheck
```

When `LUNA_API_KEY` or `TOKENROUTER_API_KEY` is present, the CLI selects the TokenRouter Luna route at `https://api.tokenrouter.com/v1` and reserves at most `$0.10` for one PR review. Use `REVIEWER_LOCAL_ONLY=true` for a static-only run. `pr-review OWNER REPO NUMBER` captures the exact PR revision, runs the correctness and security specialists plus the verifier, then submits one GitHub `COMMENT` review containing every validated changed-line finding. It never edits the PR description, creates issue comments, or requests changes. Publication requires a GitHub App ID, installation ID, and mode-600 private key file. The published review is authored by that App installation, not your personal GitHub account.

Run the commands from either the repository root with `pnpm --dir reviewer ...` or from `reviewer/` with `pnpm ...`. The CLI discovers the enclosing Git worktree by default. Set `REVIEWER_ROOT` when the repository is elsewhere and `REVIEWER_ENV_FILE` when credentials live outside the default `.env` locations.

Supported profiles are `economy_cloud_tokenrouter_luna_v1` for the configured TokenRouter Responses API and `economy_cloud_luna_v1` for a separately configured direct OpenAI route. Set `TOKENROUTER_BASE_URL` or `TOKENROUTER_MODEL_ID` only when your TokenRouter account requires a different route. Provider keys are read from protected environment configuration. The CLI never prints them. Public PR metadata and archive reads can run without `GITHUB_TOKEN`; `pr-preview` may use it for private reads, but `pr-review` refuses personal GitHub tokens and requires the installed App identity.

`serve` binds only to `127.0.0.1`. `/healthz` is unauthenticated for local process checks; `/status` requires `Authorization: Bearer $REVIEWER_STATUS_TOKEN` and returns SQLite integrity plus review metadata. Stop it with `Ctrl-C` or `SIGTERM`. It does not authorize reviews, model spending, repository writes, or GitHub publication.

`watch` polls the explicitly configured `REVIEWER_GITHUB_REPOSITORIES` with the GitHub App installation token. It considers open PRs, skips drafts by default, and reviews at most `REVIEWER_MAX_AUTOMATIC_REVIEWS_PER_POLL` new head revisions per cycle. A durable SQLite claim prevents duplicate reviews after normal polling or a restart. Set `REVIEWER_INCLUDE_DRAFTS=true` only when you deliberately want draft PRs reviewed. With `REVIEWER_UPDATE_PR_DESCRIPTION=true`, it updates only the BlackBox marker block in the PR body. With `REVIEWER_AUTO_MERGE=true`, it can squash-merge only a non-draft, clean PR with a clean review, successful completed checks, and the exact reviewed head. It never merges when checks are pending, failed, missing, or the mergeable state is not clean. The watcher polls every `REVIEWER_POLL_INTERVAL_SECONDS` seconds and backs off failed heads for 15 minutes.

Automatic merge also requires the GitHub App's **Repository permissions > Contents > Read and write** setting, represented as `"contents": "write"` by the API, plus `pull_requests: write`. Save the App change, accept the installation's permission update if requested, and use a fresh installation token. Keep repository access limited to the intended repositories. The CI workflow's `permissions: contents: read` applies to a separate token and remains read-only. See [operations](../docs/reviewer/OPERATIONS.md) for the last verified installation state.

## Evidence and limits

Every review records a content-derived `snapshot_id`, selected and omitted paths, model attempts, estimated usage, candidate verification, and reports. The pipeline permits at most four provider attempts: two specialists, one verifier, and one repair or follow-up. Only verified changed-line findings are published. Runtime execution and PR-body mutation remain disabled.
