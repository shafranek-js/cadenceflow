# T213 Guitar chord-diagram marker colors — implementation handoff

## Status

Implementation and scoped verification are complete. Root independent acceptance remains pending, so T213 stays unchecked in `tasks.md`. T214 and the queued Duplicate Measure task are outside this handoff.

## Decision and behavior

The selected mode is stored per project at `Project.presentation.guitarChordColorMode`. It defaults to `chord-roles` for projects without the field, including older portable-project data. The field is optional in schema v10 and the portable-project codec; no schema version bump or musical-data change was introduced.

`View → Guitar view` exposes radio choices for `Chord roles` and `Fingering colors`. The same mode drives Matrix and My Progression guitar diagrams in both orientations. Fingers 1–4 use the shared Tablature/hand-legend palette and retain their numeric labels. Unsupported or absent finger data remains neutral and does not invent a fingering. Open strings remain hollow and neutral in fingering mode; open roots retain the red outline in chord-role mode. Accessible labels name the fingers and chord roles. Voicing resolution, playback, Tablature, exports, and monochrome print rendering remain unchanged.

## Verification

- The latest `pnpm run build` passed with 465 modules; Vite emitted its existing large-chunk advisory. The served build assets are `index-OXTCn27n.js` (SHA-256 `5CC71B105F222AD754CC1ABBF6497B80F86DD163B359880D8A5B3C3BB11E82DB`) and `index-Cw88trq3.css` (SHA-256 `4D2654D7451B56D0BABB0D066165A8B2575A1C0E1FA20E3B0B76E61B2B89BEEF`).
- The final scoped Chromium regression batch passed 18/18 with one worker and no retries across T213, T214, Piano Roll chord-panel, and group-note-selection E2E specs. T213 still exercises its viewport/theme/orientation/mode matrix, print behavior, narrow Matrix reachability, and full legend visibility.
- Focused guitar units passed 38 tests across 7 files (29 selected tests skipped by the filter); the guitar fingering/voicing/card suite passed 24/24. Scoped ESLint completed with zero errors and three existing React-hook dependency warnings in `PianoRollView.tsx`. Scoped Prettier passed. `git diff --check` passed; Git emitted line-ending notices for the shared dirty checkout.

## Visual evidence and remaining observation

The prior `run-2026-10-04` and `review-2026-10-04` evidence remains in place. The latest follow-up folder contains 12 new light/dark captures at 640×360, 1280×720, and 1920×1080, at the top and after scrolling, plus `viewport-metrics.json`. The metrics confirm 18 Matrix guitar cards, two progression cards, and a pinned status bar at each viewport. The older review folder still includes [Matrix reachability at 640×360](../../artifacts/validation/t213-guitar-marker-colors/review-2026-10-04/t213-matrix-scroll-reachability-640x360.json) and [the fully visible progression legend bounds](../../artifacts/validation/t213-guitar-marker-colors/review-2026-10-04/t213-progression-legend-visible-bounds-640x360.json).

Root review initially found `Db7` and `B°` at x=644.703–738.984 while `.app-shell` ended at x=640. The shared T190 `.matrix-spatial-board` horizontal scroller is present in `HEAD`; T213 now overrides only its stable scrollbar gutter at widths ≤760 px so the last column can fit inside the scrollport. The E2E clipping check no longer skips `.app-shell`: it confirms the native scroller's range, scrolls each card, checks the whole card, diagram, and legend against the visible scrollport and every clipping ancestor, and verifies `elementFromPoint` hits the card. Both cards now land at x=526.703–620.984 within the scrollport ending at x=621, with full visibility and hit tests passing.

The previous `640x360-dark-vertical-fingering-progression-viewport.png` remains as the initial page state. A supplemental scroll state now shows the entire legend below the sticky header. The test measures the visible region after intersecting viewport bounds with all clipping ancestors; the final legend bounds are y=182.84–204.84 inside visible y=179–213.25.

Earlier T213 attempts using stale `dist` and the narrow View-menu viewport constraint were corrected. A later regression batch exposed Piano Roll panel geometry and chord visibility failures; the final 18-case batch now passes those panel and group-selection checks alongside T213/T214.

## Git and handoff boundary

The checkout remains on `master` with the shared tracked and untracked work preserved; the index is empty. The existing working-tree diff in protected `tests/e2e/piano-roll-system-chord-portable.spec.ts` was preserved without edits in this follow-up. No commit, push, deploy, cleanup, acceptance-record edit, or ZIP packaging was performed.

Next gate: root independent acceptance of this implementation and its visual evidence. Keep T213 unchecked until that review is recorded.
