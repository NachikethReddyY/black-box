# Reviewer specification decisions

Date: 2026-09-29

1. The persistent service runs on the Windows PC through WSL2. Active SQLite and snapshot data stays on the Linux filesystem.
2. `economy_cloud_luna_v1` uses Responses API with medium reasoning, JSON schema output, and server-built packets. Tools remain disabled in P1.
3. TokenRouter is the default route for a present `LUNA_API_KEY` or `TOKENROUTER_API_KEY`; `TOKENROUTER_BASE_URL` and `TOKENROUTER_MODEL_ID` can select the account's exact gateway/model. Automatic polling is enabled only for explicitly configured repositories and uses the installed GitHub App identity.
4. A present `LUNA_API_KEY` selects the Luna route automatically. Each PR review reserves at most $0.10. No larger budget is accepted without an explicit override.
5. A working-tree or staged snapshot gets a content-derived `snapshot_id`; Git HEAD alone is insufficient.
6. Application code owns finding IDs and provenance. A model cannot claim runtime evidence, deterministic proof, or publication authority.
7. The fourth provider attempt is repair or follow-up. A new claim from that attempt must pass the existing verification gate or remain private.
8. Hidden SDK retries are disabled. Each provider attempt is admitted and recorded by the reviewer gateway.
9. `pr-review` and the automatic watcher may publish one GitHub `COMMENT` review containing validated inline findings and the BB AI summary for the exact PR head. PR-description mutation is deferred until a proven atomic compare-and-swap mechanism exists. Automatic squash merge is opt-in and requires a clean review, successful completed required CI checks, clean mergeability, a non-draft open PR, and an unchanged exact head.
10. P1 tests use fake HTTP/provider transports and controlled repositories. Live AI quality, WSL2 isolation, and GitHub publication are labelled separately when not run.
