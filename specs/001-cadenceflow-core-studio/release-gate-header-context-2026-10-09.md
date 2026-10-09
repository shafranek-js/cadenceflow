# Release-gate continuation: Firefox header context — 2026-10-09

This continuation records the event-path diagnosis, the narrow layout correction, and the remaining Firefox validation limit. The local release gate remains open.

## Measured cause and correction

Two Firefox geometry captures show a 15.1 px layout shift after the Piano Roll scope changes from Progression to Measure 2. At pointerdown (`x=576, y=252`), Measure 2's header begins at `y=237`; after focus changes the scope, it begins at `y=252.1`. The score-system header shifts from `y=200` to `y=215.1`, and the progression track height grows from `1305.3` to `1320.5` while its top remains `y=103.6`. Recorded scroll offsets remain zero. The pointer stays at the original coordinate, so Firefox's later hit-test lands on the score-system header; the click event reaches `section.score-system` and bubbles to `handleBackgroundClick`, which clears the Measure scope.

The scope caption is the last flex item in the horizontally scrollable, no-wrap Piano Roll toolbar. Its siblings explicitly do not shrink or wrap, but `.piano-roll-selection-scope` previously had neither constraint. When its current-scope text changes, normal whitespace and flex shrink allow the caption to wrap and add a 15.1 px line to the toolbar. The narrow CSS correction sets `flex: 0 0 auto` and `white-space: nowrap` on that caption. The existing horizontal overflow keeps the long caption in the same single row. This addresses the measured layout shift without changing focus, click handling, selection semantics, or drag behavior.

The external geometry records are `C:/Users/pavel/.codex/visualizations/2026/10/08/cadenceflow-system-dnd-135955-a4f391c2/release-gate-20261008/header-context-observer-20261009/root-geometry-1.json` and `root-geometry-2.json`. The source points are [`PianoRollView.tsx`](../../src/ui/melody/PianoRollView.tsx#L1723), where focus updates the current Measure; [`ProgressionTrack.tsx`](../../src/ui/progression/ProgressionTrack.tsx#L1016), which changes scope; [`ProgressionTrack.tsx`](../../src/ui/progression/ProgressionTrack.tsx#L2711), where the retargeted click clears scope; and [`progression.css`](../../src/styles/progression.css#L2004), where the toolbar is horizontally scrollable, plus the scope-caption rule at line 2068.

## Focused verification

A fresh external build passed in 41.92 seconds. Its preview, `http://127.0.0.1:4188` (Vite PID 56088), served the expected `CadenceFlow` page and JS/CSS whose SHA-256 hashes matched the external `dist` files. The six focused Chromium checks passed with one worker and zero retries (166.85 seconds):

- current Piano Roll Measure/System context without history mutation;
- Measure drag and native-selection suppression in light and dark themes;
- Degrees and Chromatic auto-range edge drags preserving their exact rows and portable note state;
- the Scale Degrees palette layout capture across light/dark layouts.

The exact Playwright JSON is `C:/Users/pavel/.codex/visualizations/2026/10/08/cadenceflow-system-dnd-135955-a4f391c2/release-gate-20261008/header-context-observer-20261009/chromium-header-context-fix-20261009/results.json`; the case summary is `chromium-header-context-fix-20261009.log`. I viewed the 1280×720 palette and light-theme drag captures. Root independently inspected palette captures at 640×360 and 1280×720 in light and dark themes; the caption remains on one line, the responsive toolbar has no overlap, and the colors are preserved. The measure headers stay aligned during the drag, and the exact-row edge-drag assertions pass. Captures are under the same external `chromium-header-context-fix-20261009/` directory.

This is focused Chromium evidence only. The original full Chromium report remains 350 passed / 1 failed; the original full Firefox report remains 338 passed / 12 failed / 1 expected Chromium-only PDF skip. Those reports are immutable and predate this correction. The focused run does not supersede them and does not establish that the Firefox regressions are fixed.

## Firefox validation boundary and next step

The original observer reproduced the header retarget in both Firefox theme cases and the current-object-context setup; Chromium kept Measure 2 scope in those three observer scenarios. The geometry captures later established the page-layout shift and unchanged scroll offsets. A controlled-focus A/B was attempted but never reached its click step: its fixture did not expose the “My Progression” region within 20 seconds, and its 45-second test timeout expired while tearing down Firefox.

A separate fixture-free check launched the bundled Playwright Firefox `153.0` but timed out after 5 seconds on static `page.setContent()` with a plain heading. `browser.close()` also exceeded 5 seconds, so it did not navigate to CadenceFlow or create screenshots. The JSON is `C:/Users/pavel/.codex/visualizations/2026/10/08/cadenceflow-system-dnd-135955-a4f391c2/release-gate-20261008/header-context-observer-20261009/firefox-sanity-app-navigation.json`. A separate timed-out A/B log contains `RenderCompositorSWGL failed mapping default framebuffer` and a Juggler `NS_ERROR_FAILURE`; those messages co-occurred with the failure but do not alone prove the cause. This run could not establish a healthy Firefox baseline and is not evidence of an application mount failure.

The three Firefox context/native-selection cases therefore remain unverified after the CSS correction. First restore a healthy local Playwright Firefox baseline and confirm that a fixture-free page can be set, evaluated, screenshotted, and closed normally. Then rerun the controlled event/layout check and the three affected Firefox cases on a fresh preview. Keep the full-run browser results immutable; do not claim the release gate green until the remaining Firefox cases and the Chromium auto-range failure have evidence-based dispositions and a coherent fresh cross-browser gate passes.
