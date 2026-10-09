# PR 71 Black Box check diagnosis

Observed 2026-10-03 UTC for `NachikethReddyY/AMR-Fan-App#71`:

- The four Black Box Check Runs existed on head `2da50ef4ab02f3856f90ad7ca4d9ebfba0ab5529` and remained queued.
- The durable Worker request was `b4f31c6f-48e9-49db-8a7a-63edfde282d2`, state `pending`, runner `waiting`, and `lastError` `waiting_for_merge_revision`.
- GitHub REST API `2026-03-10` returned `mergeable: true` but omitted `merge_commit_sha`.
- GitHub REST API `2022-11-28` returned merge SHA `f83e578c8df1cb00839a8b7df08d03ce72973eb6`.
- GitHub runner `blackbox-bb-1` (id 22) was offline. Its Tailscale host and SSH endpoints timed out.

The fix pins only `getPullRequest` to API version `2022-11-28`, adds a regression test, and preserves the newer API version for other calls. It was deployed as Worker version `2c0bc880-0002-4e8b-9903-0911f86dd1bf`. The request dispatched run `37128518483` on `blackbox-bb-1` using merge SHA `f83e578c8df1cb00839a8b7df08d03ce72973eb6`. `local-checks`, `local-postgres`, and `dast-tooling` passed; `source-and-dependencies` failed because `pnpm audit --audit-level high` found one moderate and two high vulnerabilities in the PR dependency tree.
