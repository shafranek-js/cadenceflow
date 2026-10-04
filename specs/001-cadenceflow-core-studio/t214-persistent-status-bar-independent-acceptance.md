# T214 independent acceptance — 2026-10-04

Accepted within the requested persistent status-bar presentation scope. Root reviewed the viewport grid shell, reserved footer row, nested Studio scrolling and print reset. The follow-up correctly routes Piano Roll edge autoscroll to the Studio container; the dedicated boundary cancellation and cross-System selection regressions pass.

Independent current-checkout evidence: fresh build passed (465 modules, `index-OXTCn27n.js`/`index-Cw88trq3.css`); focused presentation/guitar/portable units 45/45; T213/T214/chord-panel/group-selection Chromium 18/18; T210 MIDI plus print Chromium 20/20. All Chromium runs used one worker and zero retries. A retained-image rerun of T213/T214 passed 6/6. Scoped ESLint had no errors and three existing hook warnings; scoped Prettier and diff whitespace checks passed.

Root viewed actual light/dark captures at 640×360, 1280×720 and 1920×1080, including music-visible progression states and the narrow legend scroll state, not only empty page bottoms. Footer clearance, keyboard focus and scrolling are asserted by the focused tests. The additional reduced CSS viewport models 125% zoom; actual browser zoom and independent Firefox were not rerun by root. Developer Firefox evidence is not counted as root evidence.

Known test debt: the protected portable chord test at line 2023 still expects `window.scrollY`; the shell now scrolls `.studio-grid`. It was preserved (62 additions/0 deletions) and its assertion was not declared green. T201's failing endpoint expectation is in an unchanged test and unchanged `durationResizeAdapter.ts`; its contract requires a separate reconciliation, not a T214 production modification. These limitations remain visible and prevent any full-suite/release claim.

HEAD remains master `f801562794b39ff3d039b56e0010829aff9a1b2b`; shared dirty files preserved, index empty. No stage, commit, push, deploy, Actions change or cleanup. Duplicate Measure is the next separately authorized implementation.

### Follow-up status — 2026-10-04

The protected portable autoscroll assertion was subsequently changed to measure `.studio-grid.scrollTop`, with its 27-test file passing on repeat. Duplicate Measure has its own independent acceptance record. T201 remains a contract conflict for root disposition; the updated HEAD, scoped totals and current release gates are in the [release handoff](release-gate-handoff-2026-10-04.md). The full release remains open.
