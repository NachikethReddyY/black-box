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

## Evidence and limits

Every review records a content-derived `snapshot_id`, selected and omitted paths, model attempts, estimated usage, candidate verification, and reports. The pipeline permits at most four provider attempts: two specialists, one verifier, and one repair or follow-up. Only verified changed-line findings are published. Runtime execution and PR-body mutation remain disabled.
