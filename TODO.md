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
- [x] Add private GitHub OAuth session endpoints without exposing tokens to the browser.
- [x] Add repository, workflow, run, job, and bounded log views backed by GitHub APIs.
- [ ] Add authenticated WSL host metrics ingestion and resource view.
- [x] Verify the dashboard shell, Run History, Logs, Runners, search, responsive layout, and production build in a browser.
- [x] Document and implement the OAuth credential gate.
- [ ] Set the GitHub App OAuth client secret and dashboard session secret in Cloudflare.

### CI intelligence backlog

- [x] Add an agent-owned SQLite history for structured test reports, cache events, and bounded searchable logs. Job timeline wiring still needs live runner events.
- [x] Add cache explanations with explicit `reused`, `rebuilt`, `downloaded`, `evicted`, or `unknown` reasons and bounded retention.
- [x] Add a bounded managed-cache policy with stable builder identities, BuildKit storage limits, package-store inventory, and redacted environment fingerprints. Live BuildKit preparation remains a WSL acceptance gate.
- [x] Add JUnit ingestion with stable test identities, attempts, durations, and failure signatures.
- [x] Add bounded execution manifests that exclude secrets. A future `bb reproduce` command still depends on a clean-workspace boundary.
- [x] Add a read-only runner doctor and retain startup cleanup checks. WSL resource admission and draining mode still need live runner integration.
- [x] Add bounded run timing records for future step and workflow comparisons. Live runner event ingestion remains pending.
- [ ] Add evidence-backed PR summaries and diagnostic actions before AI suggestions.
- [ ] Add reviewed AI explanations and patches only after logs, diffs, and test reports are redacted and bounded.
