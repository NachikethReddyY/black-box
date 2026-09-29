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
pnpm run status
pnpm run backup -- /home/reviewer/backups/reviewer
pnpm run restore -- /home/reviewer/backups/reviewer/reviewer.sqlite
pnpm test
pnpm typecheck
```

The default profile is `static_only`. It performs snapshot capture, local secret scanning, TypeScript context extraction, and deterministic reports without cloud calls. Cloud review requires an explicit `REVIEWER_PROFILE`, a positive `REVIEWER_CLOUD_BUDGET_USD`, and `REVIEWER_AUTHORIZE_CLOUD=true`. Publication remains preview-only.

Supported profiles are `economy_cloud_luna_v1` for the direct OpenAI Responses API and `economy_cloud_tokenrouter_luna_v1` for an explicitly configured TokenRouter endpoint. Provider keys are read from protected environment configuration. The CLI never prints them.

## Evidence and limits

Every review records a content-derived `snapshot_id`, selected and omitted paths, model attempts, estimated usage, candidate verification, and reports. The P1 pipeline permits at most four provider attempts: two specialists, one verifier, and one repair or follow-up. A fresh claim after verification remains private. Runtime execution, PR-body mutation, automatic review triggers, and GitHub writes are disabled in this build.
