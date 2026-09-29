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
- [x] Added seven passing unit/fixture tests and a static CLI run against this checkout.

## Remaining in this build

- [ ] Add doctor/status, backup/restore, export, and cleanup commands.
- [ ] Add GitHub adapter and publication-preview fixture coverage.
- [ ] Add fault-injection and acceptance fixture report generation.
- [ ] Add a small labelled offline evaluation corpus and demo reports.
- [ ] Run the existing Worker and dashboard regression suites.
- [ ] Verify OrbStack connectivity if available without host changes.
- [ ] Run live model or GitHub publication checks only if an existing numeric authorization is present; otherwise record `live_not_run`.
- [ ] Write `BUILD_REPORT.md` and create the requested draft PR after the implementation is verified.
