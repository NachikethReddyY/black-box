# AMR v0.1 migration candidate

These files do not edit AMR. They are **not ready to copy without AMR owner review**.

`black-box-ci.yml` is the one authoritative workflow with all four AMR jobs and their original test commands and pinned actions. The only trigger is `workflow_dispatch`. The Worker owns push, PR, and Monday 04:23 UTC security schedule adaptation. It publishes the matching per-job checks for the tested PR merge revision. See `WORKER_DISPATCH_CONTRACT.md`.

To install after review, add `black-box-ci.yml` to AMR's `.github/workflows/`, apply `amr-local-db-ci.patch` to AMR, and add `amr-ci-compose.override.yaml` plus `amr-ci-preflight.sh` under AMR's `.github/blackbox/` (rename the helper to `ci-preflight.sh`). The database job fails before startup if the opt-in patch or ownership labels are missing. The patch leaves the existing local defaults in place when CI mode is off. The runner cleanup contract is `com.blackbox.runner.owner=black-box-ci` on CI containers and volumes; it must never prune unrelated volumes.

`dispatch-amr.py` is a runnable operator/Worker adapter example. It accepts the normalized inputs and uses the reviewed workflow definition ref. A busy/offline home runner returns waiting without paid fallback. Paid providers require explicit enable configuration and owner cost approval.

Run the static source comparison:

```sh
python3 templates/validate_template.py templates/black-box-ci.yml --source-dir /Users/nr/Developer/AMR-Fan-App/.github/workflows
python3 templates/tests/test_validate_template.py
```

The checks do not prove GitHub check association, runner registration, Docker lifecycle, or AMR execution. A controlled owner-approved integration run is still required.
