# Black Box reviewer build report

Date: 2026-09-30
Branch: `t3code/reviewer-project-scope`

## Outcome

The repository now contains a connected P1 reviewer core in `reviewer/`. It captures exact local or GitHub PR snapshots, scans and redacts secrets before model packets, extracts bounded TypeScript context, runs correctness and security specialists, verifies candidates, persists evidence and cost state in SQLite, and can publish one bounded GitHub `COMMENT` review with changed-line anchors.

If `LUNA_API_KEY` is present, the default route is direct Luna with a hard `$0.10` per-PR reservation. `REVIEWER_LOCAL_ONLY=true` selects static-only mode. PR-body mutation, runtime execution, automatic triggers, and generated fixes remain disabled.

## Implemented

- Windows PC and WSL2-oriented local package with SQLite and local evidence storage.
- `working_tree`, `staged`, and exact-ref snapshots with content-derived `snapshot_id` values.
- Local secret detection and redaction before outbound model context.
- TypeScript AST symbols, changed-file context, test selection, path bounds, and omitted-scope reporting.
- Durable reviews, reservations, attempts, lease generation, cost ceilings, and preview outbox records.
- Direct OpenAI Responses route with medium reasoning, strict JSON schema, tools disabled, no SDK retry loop, and a bounded output budget.
- Explicit TokenRouter route as a separately selected adapter. No automatic provider fallback.
- Correctness specialist, security specialist, candidate deduplication, skeptical verifier, causal-change checks, persistent finding IDs, and revision-bound occurrences.
- GitHub metadata, file list, archive capture, safe redirect handling, changed-line filtering, injected transport tests, and PR-only COMMENT publication.
- CLI commands: `doctor`, `review`, `pr-preview`, `pr-review`, `status`, `backup`, `restore`, `export`, and `help`.
- Loopback-only authenticated status service via `serve`, with a WSL2 systemd example.
- Offline clean-control and seeded-bug evaluation reports under `reviewer/evidence/`.

## Exact verification

| Check | Result | Evidence |
|---|---|---|
| Reviewer typecheck | Passed | `cd reviewer && pnpm typecheck` |
| Reviewer tests | Passed, 14 tests | `cd reviewer && pnpm test` |
| CLI lifecycle | Passed: review, status, export, backup, restore | `reviewer` commands with temporary data directories |
| Offline smoke evaluation | Passed: clean control stayed clean and seeded bug was retained after verification | `cd reviewer && pnpm run evaluate` |
| Public PR snapshot | Passed: `psf/requests#7628`, 128 files, exact head captured | `reviewer/evidence/public-pr-preview.json` |
| GitHub publication | Adapter and fake transport passed; live run stopped before publication | `reviewer/evidence/live-pr-review.json` |
| Worker typecheck/tests | Passed, 12 tests | `cd worker && pnpm typecheck && pnpm test` |
| Dashboard typecheck/build | Passed | `cd dashboard && pnpm typecheck && pnpm build` |
| Project validation | Passed | `python3 scripts_validate_project.py` |
| Runner validation | Passed; PowerShell parser check unavailable on this host | `./runner/tests/validate.sh` |
| Git diff whitespace | Passed | `git diff --check` |

## AI and cost status

The configured route is direct Luna. The application reserves at most `$0.10` for one PR review and records returned usage. The bounded live run reached the exact PR snapshot, then the provider returned HTTP 401 `invalid_api_key` before an attempt was admitted. Actual inference spend is `$0`; GitHub reports zero reviews and zero issue comments on the test PR.

The offline evaluation is an engineering smoke test, not a quality benchmark. It has one clean control and one seeded bug fixture. It does not establish precision, recall, latency, or model quality on real pull requests.

## Deployment status

The package is designed for the Windows PC's WSL2 Linux filesystem. The OrbStack probe could not reach the supplied VM. `ubuntu.orb.local` resolved to a different local address and SSH returned `No route to host`; no host or VM mutation was attempted. See `reviewer/evidence/orbstack-connectivity.txt`. WSL2 deployment is `deployment_not_verified`.

## Known limits

- JavaScript parsing currently uses the TypeScript parser path and needs language-specific walkers before broad multi-language claims.
- Context selection is bounded and reports omitted paths. A partial review never claims full repository coverage.
- Provider usage is estimated from returned token counts. A dropped response remains incomplete and is not silently retried.
- Model findings are advisory and require verifier support. Runtime evidence cannot be claimed in P1.
- `pr-review` publishes only the exact PR-head `COMMENT` review. It does not edit PR descriptions, create issue comments, request changes, or merge.
- The supplied key is not accepted by `https://api.openai.com/v1`; a valid Luna/OpenAI-compatible key or its correct base URL is required before live AI review can run.
- T-22, feedback learning, knowledge-base lifecycle, runtime sandbox execution, and scheduled/automatic agents remain P2/P3 work.
- The existing Windows/WSL2 host still needs a direct deployment run when it is available.
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

With `LUNA_API_KEY` in `.env`, `pr-review OWNER REPO NUMBER` runs the bounded cloud review and publishes one PR comment review. `GITHUB_TOKEN` is optional when `gh auth status` is already authenticated. Set `REVIEWER_LOCAL_ONLY=true` for static-only operation. Stop `serve` with `Ctrl-C` or `SIGTERM`. Use `reviewer/reviewer.service.example` only on a WSL2 installation that provides systemd; no host service was changed by this build.

## Checkpoint

The implementation and evidence are ready for review in the requested draft PR. The live run performed no paid model request and no GitHub write. No host restart, firewall change, or external infrastructure purchase was performed.

Generated by GPT-6 Sol through T3 Code.
