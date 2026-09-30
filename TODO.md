# Work log

## Black Box v0.1 implementation (thread 33c33e5f, 29 September 2026)

- [x] Inspect the workspace. It contained only two briefs and was not a Git repository.
- [x] Create three owned child tasks: Worker, WSL runner, AMR templates.
- [x] Confirm the v0.1 scope and acceptance criteria with the user's reliability corrections.
- [x] Build signed webhook handling, GitHub App auth, and a durable request record.
- [x] Implement home-first selection: busy waits; paid fallback disabled unless configured.
- [x] Reconcile waiting and ambiguous requests with bounded retries; never blindly redispatch.
- [x] Report checks against the correct head with the tested revision and run attempt recorded.
- [x] Prepare runner lifecycle, prerequisite, resource, startup cleanup, and Tailscale guides.
- [x] Prepare one AMR job definition with dispatch inputs, exact checkout and CI-owned cleanup.
- [x] Verify Worker behavior with mocked GitHub boundaries and a real local database/runtime.
- [x] Verify shell lifecycle/cleanup, workflow consistency, and source-command preservation.
- [x] Integrate root setup guide, recovery guide, configuration examples, and local demo.
- [x] Record final evidence, limitations and remaining live installation steps.

Production setup completed on 29 September 2026:

- [x] Create and install the private `Black Box CI` GitHub App on `NachikethReddyY`.
- [x] Restrict the App installation to `NachikethReddyY/AMR-Fan-App`.
- [x] Configure the App webhook at the deployed Worker endpoint with SSL verification enabled.
- [x] Store `WEBHOOK_SECRET`, `OPERATOR_TOKEN`, App ID, installation ID, and private key as Cloudflare Worker secrets.
- [x] Register and start `black-box-vbook` in WSL2 with the `black-box-linux` label.
- [x] Verify the App installation token can read the AMR runner inventory and the runner is online and idle.

Live acceptance gates, not yet performed:

- [x] Install/reach Windows WSL2 over the owner's Tailscale access path.
- [ ] Run AMR success, deliberate failure, repeat cache, and Docker/database checks on the PC.
- [ ] Deploy Workers Free, measure cold/warm authentication CPU and D1 use.
- [ ] Verify webhook, PR revision association, duplicate and failed-delivery recovery in GitHub.
- [ ] Verify PC-off and restart behavior without spending protected minutes or paid fallback.

External publication is authorized for this thread: create a private GitHub repository, push checkpoint commits to `main`, and deploy the Cloudflare Worker/D1 shell. The deliberate AMR workflow test, fallback enablement, and PC-off recovery test remain owner-controlled gates.

Publication evidence: private repository `https://github.com/NachikethReddyY/black-box-ci`; Worker `https://blackbox-worker-dispatcher.ynrdevs.workers.dev`; D1 migration applied. Production credentials remain in Cloudflare secrets and local protected files only. No secret value is committed.

## Dashboard surface (thread 33c33e5f, 29 September 2026)

- [x] Choose a dashboard information hierarchy from static mocks and the supplied Blacksmith reference.
- [x] Build the selected frontend shell and responsive navigation.
- [x] Generate and wire an original Black Box mark.
- [x] Use `ynrlib/icons` for the dashboard icon family.
- [ ] Add private GitHub OAuth session endpoints without exposing tokens to the browser.
- [ ] Add repository, workflow, run, job, log, and usage views backed by GitHub APIs.
- [ ] Add authenticated WSL host metrics ingestion and resource view.
- [x] Verify the dashboard shell, Run History, Logs, Runners, search, responsive layout, and production build in a browser.
- [ ] Document and implement the OAuth credential gate.

## Self-hosted AI reviewer planning (thread current, 29 September 2026)

- [x] Inspect Black Box hosting, Worker, runner, dashboard, and existing reviewer integration points.
- [x] Produce implementation, architecture, AI pipeline, cost, threat, evaluation, backlog, operations, limitation, and feature traceability documents.
- [x] Add GitHub inline review-thread anchoring, PR-description marker rules, and Check Run Agent boundaries.
- [x] Add replaceable cheap-model ensemble design, specialist roles, evidence verification, model registry, per-role reservations, and ablation pilot.
- [x] Add Greptile-inspired graph indexing, bounded swarm review, custom rules, approved learning, agent handoff, security/SCA evidence, partner context, and deferred runtime validation.
- [x] Recenter the plan on the AI code-review product goal, with matched quality/cost/reliability scorecards instead of vendor feature parity.
- [x] Reconcile the four-call schedule, route capability fixtures, causal finding evidence, persistent finding identity, lease fencing, and P1 secret scan/redaction boundary.
- [x] Configure the persistent reviewer for the Windows PC plus WSL2 Linux filesystem and reserve Daytona for disposable P3 runtime validation only.
- [x] Add the complete self-contained T-01..T-36 acceptance definitions and align P1/P2/P3 phase ownership.
- [x] Validate source notes, traceability IDs, acceptance IDs, required documents, and whitespace.
- [x] Implement the connected reviewer foundation, bounded Luna route, PR-only COMMENT publisher, and local status service.
- [x] Run reviewer typecheck, 15 focused tests, offline evaluation, public PR snapshot, and fake GitHub publication tests.
- [x] Configure the supplied TokenRouter key at `https://api.tokenrouter.com/v1` with `openai/gpt-5.6-luna` and run a bounded live review against `NachikethReddyY/black-box#1`.
- [x] Verify live GitHub `COMMENT` publication with changed-line filtering and record the model usage and exact reviewed head.
- [ ] Run the same reviewer on an independent seeded-bug PR to measure detection quality without relying on this documentation-heavy clean control.

## GitHub App publication identity (thread current, 30 September 2026)

- [x] Remove personal-account publication from the reviewer CLI. `pr-review` now requires a GitHub App installation token.
- [x] Add Node GitHub App JWT signing, installation-token exchange, private-key permission checks, and fixture coverage.
- [x] Document App-only publication and keep `GITHUB_TOKEN` limited to optional private PR preview reads.
- [ ] Configure the existing App ID and target-repository installation ID in the local reviewer environment before the first bot-authenticated PR review.
- [ ] Run one bounded bot-authenticated review only on an owned repository after the App installation is confirmed.
