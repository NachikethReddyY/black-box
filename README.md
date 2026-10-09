# Black Box

Black Box runs trusted GitHub Actions jobs on an Ubuntu server. A Cloudflare Worker dispatches the prepared consolidated workflow once it is installed in the target repository.

```text
GitHub webhook
      |
      v
Cloudflare Worker (metadata only)
      |
      v
GitHub workflow dispatch
      |
      v
Ubuntu server official runner
      |
      v
AMR checks, Docker, and database tests
      |
      v
GitHub checks and logs
```

The home path has no GitHub-hosted routing job. Self-hosted execution is free under GitHub's current billing policy. Paid fallback providers are disabled until they are configured explicitly.

## Repository layout

- `worker/`: Cloudflare Worker dispatcher, configuration, tests, and local development instructions.
- `runner/`: Linux prerequisite checks, runner lifecycle scripts, cache paths, and cleanup guidance. The WSL2 access guide remains available for older installations.
- `templates/`: AMR workflow migration template and validation checklist. It does not modify the AMR repository.
- `FORGE_PROJECT_BRIEF.md`: detailed project plan and evidence limits.
- `FORGE_PROJECT_BRIEF.html`: short visual explainer.

## v0.1 target

1. Run one AMR workflow on the WSL2 runner with the `blackbox` label.
2. Accept a signed GitHub event only for an allowlisted repository.
3. Dispatch the intended workflow and exact commit through GitHub's API.
4. Reject duplicate events and unknown providers without starting a job.
5. Keep fallback disabled unless its credentials and spending policy are deliberately added.
6. Verify one successful run, one deliberate failure, one repeat run with a cache hit, and one home-PC-off request.

## Current status

On 30 September 2026, the Ubuntu runner `blackbox-bb-1` was registered for AMR-Fan-App and started as an enabled system service. Docker 29.1.3 and Compose 2.40.3 work as the non-root runner user. Two Backend runs passed on this runner, including service-backed run `36736430611`. AMR `main` now uses the `blackbox` selector for Backend and the consolidated Worker workflow.

The prepared `black-box-ci.yml`, CI database isolation patch, Compose ownership labels, and preflight are live on AMR `main`. The Worker is deployed with `GITHUB_WORKFLOW_FILE=black-box-ci.yml`, `HOME_RUNNER_LABEL=blackbox`, and paid fallback disabled. Worker-triggered run `36748076602` tested commit `e3ad7d5` on `blackbox-bb-1`: `local-checks`, `local-postgres`, and `source-and-dependencies` passed. DAST fixtures passed; the application scan remains blocked by missing CSRF tokens at `/admin/participation/` (ZAP 10202). The Worker returned those exact check outcomes. CI-owned resources were removed after both failed and successful database jobs. Both installed startup hooks ran successfully; reboot and cancellation behavior remain unverified.

The following paragraphs record the original WSL2 setup.

The implementation, local Worker/D1 proof, WSL2 host preparation, private GitHub repository, Cloudflare Worker deployment, GitHub App installation, and home runner registration are complete. The repository will not contain GitHub App keys, webhook secrets, operator tokens, or runner registration tokens.

The App is restricted to AMR-Fan-App, the Worker secrets are stored in Cloudflare, and `black-box-vbook` was originally registered in WSL2. That runner is now offline. The reviewed AMR migration is activated on Ubuntu.

Worker URL: `https://blackbox-worker-dispatcher.ynrdevs.workers.dev`

The Worker now serves the dashboard at the same URL. GitHub OAuth remains gated until the App client secret and a separate dashboard session secret are configured. The dashboard can load live repositories, workflow runs, jobs, and bounded job logs; host CPU, memory, disk, and Docker readiness appear only after the optional WSL telemetry timer is enabled. See `dashboard/README.md` and `runner/SETUP.md`.

The runner also has a local history store for bounded, redacted logs, JUnit test attempts, and cache explanations. It uses SQLite and FTS5, keeps evidence outside the repository, and supports explicit retention with `runner/scripts/history.py`. This is an agent-side foundation; the dashboard does not invent cache hits or detailed history until the WSL agent reports them.

The first agent-facing CLI slice is available at `runner/bin/bb`. It queues an exact commit through the authenticated Worker, watches the durable request, returns structured JSON, and supports controlled retries. It does not yet fetch detailed logs or generate AI fixes.

Start with the relevant guide:

```text
worker/README.md
runner/SETUP.md
templates/README.md
```
