# Black Box

Black Box runs trusted GitHub Actions jobs on a Windows 11 computer through WSL2, while a small Cloudflare Worker chooses the provider before GitHub queues the real workflow.

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
Windows 11 + WSL2 official runner
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
- `runner/`: Windows/WSL2 prerequisite checks, runner lifecycle scripts, cache paths, and cleanup guidance.
- `templates/`: AMR workflow migration template and validation checklist. It does not modify the AMR repository.
- `FORGE_PROJECT_BRIEF.md`: detailed project plan and evidence limits.
- `FORGE_PROJECT_BRIEF.html`: short visual explainer.

## v0.1 target

1. Run one AMR workflow on the WSL2 runner with the `black-box-linux` label.
2. Accept a signed GitHub event only for an allowlisted repository.
3. Dispatch the intended workflow and exact commit through GitHub's API.
4. Reject duplicate events and unknown providers without starting a job.
5. Keep fallback disabled unless its credentials and spending policy are deliberately added.
6. Verify one successful run, one deliberate failure, one repeat run with a cache hit, and one home-PC-off request.

## Current status

The implementation, local Worker/D1 proof, and WSL2 host preparation are complete. The private GitHub repository and Cloudflare Worker/D1 deployment are publication checkpoints. The repository will not contain GitHub App keys, webhook secrets, operator tokens, or runner registration tokens.

The deployed shell still needs owner-controlled secrets and GitHub App installation before it can accept a real AMR webhook. The AMR repository remains unchanged until its workflow template is reviewed and copied deliberately.

Start with the relevant guide:

```text
worker/README.md
runner/SETUP.md
templates/README.md
```
