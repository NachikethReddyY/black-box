# Black Box reviewer build report

Date: 2026-10-01
Branch: `t3code/reviewer-project-scope`

## Outcome

The repository now contains a connected P1 reviewer core in `reviewer/`. It captures exact local or GitHub PR snapshots, scans and redacts secrets before model packets, extracts bounded TypeScript context, runs correctness and security specialists, verifies candidates, persists evidence and cost state in SQLite, publishes one bounded GitHub `COMMENT` review with changed-line anchors, and watches configured repositories for new open PR heads.

If `LUNA_API_KEY` is present, the default route is TokenRouter's OpenAI-compatible Luna endpoint with a bounded per-review reservation. `REVIEWER_LOCAL_ONLY=true` selects static-only mode. Automatic PR polling is opt-in. The BB AI summary is included in the review body; PR-description mutation remains deferred until a proven atomic compare-and-swap mechanism exists. Runtime execution and generated fixes remain disabled. The GitHub workflow enables squash merging only after a complete clean review, passing required CI checks, a non-draft open PR, exact head equality, and GitHub clean mergeability.

## Implemented

- Ubuntu self-hosted GitHub Actions runner path with a Windows/WSL2 local fallback, SQLite, and local evidence storage.
- `working_tree`, `staged`, and exact-ref snapshots with content-derived `snapshot_id` values.
- Local secret detection and redaction before outbound model context.
- TypeScript AST symbols, changed-file context, test selection, path bounds, and omitted-scope reporting.
- Durable reviews, reservations, attempts, lease generation, cost ceilings, and preview outbox records.
- Direct OpenAI Responses route with medium reasoning, strict JSON schema, tools disabled, no SDK retry loop, and a bounded output budget.
- Explicit TokenRouter route as a separately selected adapter. No automatic provider fallback.
- Correctness specialist, security specialist, candidate deduplication, skeptical verifier, causal-change checks, persistent finding IDs, and revision-bound occurrences.
- GitHub metadata, file list, archive capture, safe redirect handling, changed-line filtering, injected transport tests, and PR-only COMMENT publication.
- CLI commands: `doctor`, `review`, `pr-preview`, `pr-review`, `status`, `backup`, `restore`, `export`, and `help`.
- Automatic commands: `poll-once` and `watch`, using the GitHub App installation identity, durable per-head claims, PR summary markers, and fail-closed CI-gated squash merging.
- Loopback-only authenticated status service via `serve`, with a WSL2 systemd example.
- Offline clean-control and seeded-bug evaluation reports under `reviewer/evidence/`.

## Exact verification

| Check | Result | Evidence |
|---|---|---|
| Reviewer typecheck | Passed | `cd reviewer && pnpm typecheck` |
| Reviewer tests | Passed, 28 tests | `cd reviewer && pnpm test` |
| CLI lifecycle | Passed: review, status, export, backup, restore | `reviewer` commands with temporary data directories |
| Offline smoke evaluation | Passed: clean control stayed clean and seeded bug was retained after verification | `cd reviewer && pnpm run evaluate` |
| Public PR snapshot | Passed: `psf/requests#7628`, 128 files, exact head captured | `reviewer/evidence/public-pr-preview.json` |
| GitHub publication | Passed on owned PR #1 as `bb-copilot-bot[bot]`, with exact-head COMMENT reviews, changed-line findings, and marker-owned PR summary updates. | GitHub PR #1 reviews and comments |
| Worker typecheck/tests | Passed, 12 tests | `cd worker && pnpm typecheck && pnpm test` |
| Dashboard typecheck/build | Passed | `cd dashboard && pnpm typecheck && pnpm build` |
| Project validation | Passed | `python3 scripts_validate_project.py` |
| Runner validation | Passed; PowerShell parser check unavailable on this host | `./runner/tests/validate.sh` |
| Git diff whitespace | Passed | `git diff --check` |

## AI status

The configured route is TokenRouter at `https://api.tokenrouter.com/v1` using `openai/gpt-5.6-luna`. One bounded live review on PR #1 was published by `bb-copilot-bot[bot]` with two changed-line findings and a marker-owned summary. Spending limits remain enforced internally, and the workflow uses the GitHub App installation token rather than a personal GitHub token.

The offline evaluation is an engineering smoke test, not a quality benchmark. It has one clean control and one seeded bug fixture. It does not establish precision, recall, latency, or model quality on real pull requests.

## Deployment status

The automatic workflow is designed for the owner's Ubuntu host and requires an online `black-box-reviewer` self-hosted runner. The current repository inventory reports zero registered runners, so Ubuntu deployment and GitHub job execution remain `deployment_not_verified`. A prior OrbStack probe could not reach the supplied VM; no host mutation was attempted. See `reviewer/evidence/orbstack-connectivity.txt`.

## Known limits

- JavaScript parsing currently uses the TypeScript parser path and needs language-specific walkers before broad multi-language claims.
- Context selection is bounded and reports omitted paths. A partial review never claims full repository coverage.
- Provider usage is estimated from returned token counts. A dropped response remains incomplete and is not silently retried.
- Model findings are advisory and require verifier support. Runtime evidence cannot be claimed in P1.
- `pr-review` and the automatic watcher publish only exact PR-head `COMMENT` reviews. The watcher edits only its marker block in the PR description, never human text. It does not create issue comments or request changes.
- The reviewer depends on the configured TokenRouter account, model catalog, and returned usage fields. A missing or invalid route makes the run incomplete without publication.
- T-22, feedback learning, knowledge-base lifecycle, runtime sandbox execution, and scheduled agent profiles remain P2/P3 work. The owner-authored GitHub Actions PR trigger is now implemented.
- The watcher was installed and observed active in WSL2 at `VBook`; the host later went offline, so long-term restart persistence remains unverified until the PC is online again.
- Invoking the CLI from `reviewer/` discovers the enclosing Git worktree; `REVIEWER_ROOT` remains the explicit override.

## Start and first review

From the repository root:

```bash
pnpm --dir reviewer install --ignore-scripts
pnpm --dir reviewer run doctor
pnpm --dir reviewer run review -- working_tree
pnpm --dir reviewer run pr-preview -- OWNER REPO NUMBER
pnpm --dir reviewer run pr-review -- OWNER REPO NUMBER
REVIEWER_STATUS_TOKEN="$(openssl rand -hex 32)" pnpm --dir reviewer run serve
```

With `LUNA_API_KEY` in `.env` and `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, and the in-memory `GITHUB_APP_PRIVATE_KEY` configured, `pr-review OWNER REPO NUMBER` runs the bounded cloud review and publishes one PR review as the installed GitHub App. `poll-once` runs the same flow for configured repositories, while `watch` repeats it at the configured interval. A personal `GITHUB_TOKEN` is not accepted for publication. Set `REVIEWER_LOCAL_ONLY=true` for static-only operation. Stop `serve` with `Ctrl-C` or `SIGTERM`. Use `reviewer/reviewer-watch.service.example` on the WSL2 installation that provides systemd.

## Checkpoint

The implementation and evidence are ready in PR #1. Bounded live head reviews were exercised after the bot workflow was wired: `bb-copilot-bot[bot]` posted changed-line findings and updated the marker-owned summary. The latest code commit has a pending-review marker because no Ubuntu runner is registered for the automatic workflow. CI passes on the current head. Automatic squash merge is enabled in the workflow but remains fail-closed until a fresh complete clean review, green CI, and an online runner exist. No host restart, firewall change, or external infrastructure purchase was performed.

Generated by GPT-6 Sol through T3 Code.
