# Next Developer Assignment — proposed Phase 14 assets and documentation batch

**Status:** Proposed only. Do not start until the user explicitly approves this batch.

**Assignment:** T154 + T155 + T158 — audit the committed HQ piano bank and attribution, verify production
build/deployment behavior, and update Quickstart from current repository evidence; then stop for independent
review.

## Accepted baseline

- T151–T153 are accepted: performance limits are asserted, transport soak is virtual-clock based, and
  durable v1/v2/v3 migration fixtures cover legacy presentation normalization.
- The complete 480-region HQ piano bank is present in the repository, but final attribution, manifest,
  decode, bundle, cache/lazy-load, base-path, and deployment evidence remains the scope of this batch.
- Treat current application behavior and all accepted US10–US13 tests as protected baseline.
- Preserve all existing dirty/untracked Graphify, QA, source, screenshot, and documentation materials.

## Scope

1. T154: audit the committed 480-region HQ piano manifest, referenced files, deterministic decode checks,
   attribution files, upstream revision, and license packaging. Use authoritative repository evidence and
   identify any mismatch explicitly; do not make unsupported licensing claims.
2. T155: run the production build and record exact bundle/asset-size evidence. Verify from code/tests that
   piano samples load/decode/cache lazily, confirm the `/cadenceflow/` production base path, inspect the
   manual-only GitHub Pages workflow, and perform read-only checks of representative published assets when
   available. Do not trigger a deployment or workflow run.
3. T158: update `specs/001-cadenceflow-core-studio/quickstart.md` with the verified Node/pnpm bootstrap,
   local run, focused/full test, piano/Melody asset verification, production build, and manual Pages commands.
   Keep commands reproducible and avoid static test totals that will immediately become stale.

## Boundaries

- Do not start T150, T156, T157, or product backlog T186–T188.
- Do not redesign UI, change musical/domain/schema semantics, download or replace the piano bank, trigger
  remote workflows/deployments, update task/status checkboxes, commit, or push.
- Keep small deterministic review fixes in this task and preserve unrelated worktree changes.

## Verification

- Run the repository's focused piano-bank and Melody-asset verification commands plus only directly relevant
  unit tests with `--maxWorkers=1`.
- Run `pnpm build`, scoped ESLint/Prettier, and `git diff --check`; use read-only HTTP/Pages checks only where
  they directly verify T155.
- Report manifest/file/decode counts, attribution evidence, bundle and asset sizes, lazy-load/cache evidence,
  base-path/workflow/Pages findings, exact changed files and commands, residual gaps, and final Git status;
  then stop for independent acceptance.
