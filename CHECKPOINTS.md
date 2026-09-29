# Black Box checkpoints

This file records publication checkpoints. It contains no credentials.

## Checkpoint 1: local implementation

- Worker, D1 schema, workflow template, WSL runner lifecycle, and setup guides are in this repository.
- Local Worker tests and D1 runtime proof passed.
- The AMR repository remained unchanged.

## Checkpoint 2: WSL2 host readiness

- Tailscale SSH reached the owner's WSL2 Ubuntu instance as `vbook`.
- Docker, Compose, Node, and pnpm were verified.
- Runner lifecycle validation passed; no GitHub runner registration was performed.

## Checkpoint 3: publication

- The repository is private and the default branch is `main`.
- Cloudflare D1 and the Worker are deployed only after local validation.
- Real webhook acceptance remains disabled until owner-controlled Cloudflare secrets and GitHub App installation are supplied.
