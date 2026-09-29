# Worker dispatch contract

The Worker is the event adapter for signed push, PR, manual, and scheduled requests. It deduplicates by delivery ID and dispatches `black-box-ci.yml` with normalized inputs:

| Input | Meaning |
| --- | --- |
| `runner` | Enum `home`, `github`, `blacksmith`; never a label. |
| `commit_sha` | Full SHA of the exact revision tested. For a PR, preserve the current merge-context behavior. |
| `head_sha` | Original PR head. For non-PR runs, use the tested SHA. |
| `request_id` | UUID correlated by `run-name: black-box:${{ inputs.request_id }}`. |
| `source_ref` | Original ref for cancellation and audit. |
| `pr_number` | Optional decimal string. |

The Worker queries runner inventory before home dispatch. It requires an online runner with labels `self-hosted`, `linux`, `x64`, and `black-box-linux`. A busy home runner waits; it never falls through to a paid provider. GitHub and Blacksmith outputs require strict enable configuration, credentials, label mapping, and owner cost policy. The workflow maps the enum to labels and has no hosted routing job.

The original Monday 04:23 UTC security schedule runs through the Worker's scheduled path. The Worker resolves the default branch SHA, sets both SHA inputs to it, creates a UUID, and uses the default branch ref. Manual dispatch uses the same contract.

After the run, the Worker republishes exact check names `local-checks`, `local-postgres`, `source-and-dependencies`, `dast-tooling` on `commit_sha`, linking to the Actions run. It records the original PR head, source ref, request ID, and PR number for audit. It must refuse to mark a newer revision green from an older run.
