# AMR migration checklist

- [ ] Owner reviews the single `black-box-ci.yml` workflow against AMR's current `checks.yml` and `security.yml`: four named jobs, pinned action SHAs, `pnpm` commands, DAST conditions and seven-day artifact, 15/20 minute timeouts, `contents: read`, and cancellation.
- [ ] Owner approves the Worker to replace push/PR/schedule adaptation. The workflow has only manual `workflow_dispatch`; the Worker handles the original Monday 04:23 UTC security schedule and manual input contract.
- [ ] Worker dispatches one request for an exact `commit_sha`, records original `head_sha`, `source_ref`, optional `pr_number`, and UUID `request_id`; `run-name` links to that UUID.
- [ ] For PRs, test the same merge revision required by AMR today. Republish checks `local-checks`, `local-postgres`, `source-and-dependencies`, and `dast-tooling` against that tested revision; a stale run cannot satisfy a newer commit.
- [ ] Worker queries live runner inventory. Home requires `self-hosted`, `linux`, `x64`, `black-box-linux`. Busy/offline home stays waiting. GitHub/Blacksmith require explicit enable config and spending approval.
- [ ] Apply and review the opt-in local-db patch. CI auth lives in the runner's `state/transient/<run>-<attempt>/auth` path; Compose project is unique per run. Defaults remain unchanged outside CI mode.
- [ ] Install the CI Compose override with `com.blackbox.runner.owner=black-box-ci` on container and volume. Confirm runner startup cleanup filters exactly that label and never prunes unrelated volumes.
- [ ] Run successful, failed, and cancelled `local-postgres` jobs. Verify only job-owned container, volume, port, temp auth, report-parser image, and storage are removed. Keep useful caches.
- [ ] Prove duplicate webhook delivery starts one request; unknown provider/label, malformed SHA/UUID, and unavailable runner start none.
- [ ] Run all four jobs for a known revision and verify their four returned checks, links, permissions, and retention in GitHub. Obtain owner approval before enabling AMR required-check changes.
