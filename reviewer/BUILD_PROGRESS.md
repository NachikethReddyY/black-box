# Reviewer build progress

## Completed

- [x] Read the eleven reviewer plans and autonomous build directive.
- [x] Added explicit model, snapshot, provenance, hidden-retry, phase, and evidence decisions to the planning docs.
- [x] Created a typed reviewer package with static-only default behavior.
- [x] Implemented local working-tree, staged, and exact-ref snapshot capture with content-derived IDs.
- [x] Implemented secret scanning and redaction before model packet creation.
- [x] Implemented TypeScript/JavaScript AST symbol extraction and bounded context packets.
- [x] Implemented SQLite reviews, reservations, attempts, and preview outbox state.
- [x] Implemented direct Responses and TokenRouter route contracts with strict response validation.
- [x] Implemented two-specialist, verifier, dedupe, finding identity, and cost accounting pipeline.
- [x] Implemented GitHub PR metadata/file/archive reads and preview-only review rendering.
- [x] Added eleven passing unit/fixture tests and a static CLI run against this checkout.
- [x] Added doctor, status, backup/restore, export, and help commands.
- [x] Added injected GitHub transport coverage and changed-line publication-preview coverage.
- [x] Added an offline labelled smoke evaluation with clean and seeded-bug controls.
- [x] Ran Worker, dashboard, project, and runner regression checks.
- [x] Ran one public pull-request preview against `psf/requests#7628` without a model call or GitHub write.

## Verification limits recorded

- [x] Recorded that live model calls were not run because the supplied keys are not a numeric spending authorization.
- [x] Recorded that GitHub publication was not run; the adapter remains preview-only.
- [x] Recorded that OrbStack/WSL2 deployment could not be verified from this host because the advertised VM address was unreachable.
- [x] Wrote `BUILD_REPORT.md` with exact commands, results, and remaining limitations.
- [ ] Create and link the requested draft PR after the final checkpoint commit.
