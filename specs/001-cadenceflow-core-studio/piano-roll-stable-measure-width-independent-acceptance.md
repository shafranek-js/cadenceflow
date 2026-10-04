# Stable Measure width independent acceptance

Accepted by root reviewer on 2026-10-03 for this small layout task only.

Reviewed actual ScoreSystemView/ProgressionTrack/CSS slot geometry: configured capacity determines shared column widths; 34px pitch gutter and borders are excluded, zoom provides a minimum column width, incomplete Systems leave unused slots blank without changing Project music.

Independent fresh `pnpm run build`: PASS, 461 modules, Vite 19.33s, existing large-chunk warning. `pnpm exec playwright test tests/e2e/piano-roll-stable-measure-width.spec.ts --project=chromium --workers=1 --retries=0`: 1/1 PASS, covering capacities 2/4/8, full/partial Systems, both themes, compact/desktop, zoom/scroll and Snap cursor geometry. `pnpm exec playwright test tests/e2e/piano-roll-system-gutter.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts --grep 'aligned pitch scale|Harmony strip grid lines' --project=chromium --workers=1 --retries=0`: 2/2 PASS. `git diff --check`: PASS.

Actually opened all four newly regenerated dark/light full/partial 1920x1080 System captures in artifacts/validation/piano-roll-stable-measure-width. Final single Measure matches the full System column, with blank space to the right. Compact geometry is covered by the test; no claim of a separate root compact screenshot review.

Developer additionally reports 7 focused Piano Roll regressions, 18 T210 and 4 T212 tests passing. These are developer evidence, not additional independently rerun totals. Shared ScoreSystemView retains an unused realizeChord import from prior work and legacy whole-file formatting differences; no claim of clean whole-file lint/format. No full suite or publication. Existing dirty/untracked work preserved; no staging or commits by root.

Insertion and the Measure close button are a separate next task and were not part of this acceptance.
