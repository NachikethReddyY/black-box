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

Live acceptance gates, not yet performed:

- [x] Install/reach Windows WSL2 over the owner's Tailscale access path.
- [ ] Run AMR success, deliberate failure, repeat cache, and Docker/database checks on the PC.
- [ ] Deploy Workers Free, measure cold/warm authentication CPU and D1 use.
- [ ] Verify webhook, PR revision association, duplicate and failed-delivery recovery in GitHub.
- [ ] Verify PC-off and restart behavior without spending protected minutes or paid fallback.

External publication is authorized for this thread: create a private GitHub repository, push checkpoint commits to `main`, and deploy the Cloudflare Worker/D1 shell. AMR workflow installation, runner registration, secret configuration, real webhook acceptance, and paid fallback remain owner-controlled gates.
