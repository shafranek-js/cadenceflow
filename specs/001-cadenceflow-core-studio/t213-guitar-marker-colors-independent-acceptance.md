# T213 independent acceptance — 2026-10-04

Accepted within the scoped guitar marker-color contract. Root inspected the shared fingering palette, marker/legend rendering, mode propagation, presentation command and portable fallback, and the responsive follow-up. Separate T214 scrolling integration was checked in the current combined checkout.

Root verification on the final checkout:

- `pnpm run build`: passed, 465 modules; assets `index-OXTCn27n.js` and `index-Cw88trq3.css`. Existing chunk advisory only.
- `pnpm exec vitest run tests/unit/ui/guitar-card-view.test.ts tests/unit/app/presentation-commands.test.ts tests/unit/persistence/portable-project.test.ts --pool=threads --maxWorkers=1`: 3 files, 45/45 passed. The earlier worker-start timeout did not recur.
- `pnpm exec playwright test tests/e2e/t213-guitar-marker-colors.spec.ts tests/e2e/t214-persistent-status-bar.spec.ts tests/e2e/piano-roll-system-chord-panel.spec.ts tests/e2e/piano-roll-group-note-selection.spec.ts --project=chromium --workers=1 --retries=0`: 18/18 passed, including all five failures from the preceding root review.
- T210 MIDI and T195 print Chromium batch: 20/20 passed.
- Scoped ESLint: zero errors, three existing PianoRollView hook warnings. Scoped Prettier and `git diff --check` passed.

Root reran T213/T214 with output retention (6/6 passed), then actually viewed progression screenshots at 640×360, 1280×720 and 1920×1080 in both themes, plus the narrow fully visible legend scroll state. The ordinary narrow vertical capture requires scrolling to see the entire legend; the supplemental state demonstrates access. Root retained images and diagnostics under `C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4f-d564-7612-8b29-bc59c92804cc/retained-review/`. Developer bottom-of-page captures alone were insufficient for this review.

This is feature acceptance, not full-release acceptance. The T214 handoff records an obsolete window-scroll assertion in the protected portable chord suite and an unchanged T201 duration-adapter assertion; neither is represented as passing here. The shared dirty checkout remains preserved, index empty, protected portable chord diff 62 additions/0 deletions. No commit, push, deployment or cleanup.
