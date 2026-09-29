# Reviewer specification decisions

Date: 2026-09-29

1. The persistent service runs on the Windows PC through WSL2. Active SQLite and snapshot data stays on the Linux filesystem.
2. `economy_cloud_luna_v1` uses Responses API with medium reasoning, JSON schema output, and server-built packets. Tools remain disabled in P1.
3. TokenRouter is a separate selectable route. A present TokenRouter key never causes automatic provider selection.
4. The API key in `.env` does not grant an unlimited spend or publication permission. The default cloud budget remains zero.
5. A working-tree or staged snapshot gets a content-derived `snapshot_id`; Git HEAD alone is insufficient.
6. Application code owns finding IDs and provenance. A model cannot claim runtime evidence, deterministic proof, or publication authority.
7. The fourth provider attempt is repair or follow-up. A new claim from that attempt must pass the existing verification gate or remain private.
8. Hidden SDK retries are disabled. Each provider attempt is admitted and recorded by the reviewer gateway.
9. P1 publication is preview-only. PR-body edits, runtime execution, automatic review triggers, and merge decisions remain disabled.
10. P1 tests use fake HTTP/provider transports and controlled repositories. Live AI quality, WSL2 isolation, and GitHub publication are labelled separately when not run.
