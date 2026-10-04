# T215 independent acceptance

Date: 2026-10-03 (Europe/Prague). Reviewer: root orchestrator.

T215 is accepted locally against FR-262, SC-043 and the separate T215 plan. This accepts Measure context menus and exact interval deletion, not a full release or the existing count-in/layout defects described below. No stage, commit, push, deployment, schema change or adjacent task implementation occurred.

## Requirement audit

The reviewer inspected the actual planner, measure layout helper, App command path, menu component, view triggers and focused tests. Menus target the displayed Measure across all six views, independently of selected Step. Pointer, ContextMenu/Shift+F10, Escape/outside closure, navigation, focus return and viewport containment have browser evidence. Staff/TAB expose explicit per-Measure entries in the System header.

Deletion uses the exact authored interval, including partial final bars. The planner retains exact Rational Step/note fragments, raw authored tails and dormant notes, surviving IDs, spelling, instruments and generation recipes. It compares effective generated output after contextual changes and materializes affected owners. Nonrepresentable instrument/owner transfers and active branches refuse without mutation. Sections, selection and loop endpoints reanchor; one progression restore command supplies exact Undo/Redo. The App reads authoritative store.project and stops transport/previews before dispatch. Runtime loop snapshots restore with history. Exact Measure looping is disabled when Step boundaries cannot represent it.

## Reviewer verification

```powershell
pnpm run build
pnpm exec vitest run tests/unit/progression/measure-deletion.test.ts tests/unit/melody/midi-step-input.test.ts --maxWorkers=1
$env:T215_SCREENSHOT_DIR = 'C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4f-d564-7612-8b29-bc59c92804cc/t215-independent'
pnpm exec playwright test tests/e2e/t215-measure-context-menu.spec.ts --project=chromium --workers=1 --retries=0
pnpm exec eslint src/app/App.tsx src/domain/progression/measureDeletion.ts src/domain/timing/measureLayout.ts src/ui/melody/PianoRollView.tsx src/ui/progression/MeasureContextMenu.tsx src/ui/progression/ProgressionTrack.tsx src/ui/staff/ScoreSystemView.tsx tests/e2e/t215-measure-context-menu.spec.ts tests/unit/progression/measure-deletion.test.ts
pnpm exec prettier --check specs/001-cadenceflow-core-studio/t215-measure-context-menu-plan.md specs/001-cadenceflow-core-studio/t215-measure-context-menu-handoff.md src/app/App.tsx src/domain/progression/measureDeletion.ts src/domain/timing/measureLayout.ts src/ui/melody/PianoRollView.tsx src/ui/progression/MeasureContextMenu.tsx src/ui/progression/ProgressionTrack.tsx src/ui/staff/ScoreSystemView.tsx tests/e2e/t215-measure-context-menu.spec.ts tests/unit/progression/measure-deletion.test.ts
git diff --check
```

Results: fresh build passed; 2 unit files/20 tests passed (T215 7, MIDI protocol 13); T215 Chromium 9/9 passed in 20.0 seconds; scoped ESLint 0 errors/7 Hook warnings; Prettier and whitespace checks passed. Build retained the large-chunk warning. The Hook warnings include the loop restoration effect; its Step-change/history behavior was inspected and exercised, but the warnings are not claimed resolved.

The reviewer opened all 18 independently regenerated images directly: three normal sizes (640×360, 1280×720, 1920×1080), light/dark, open/closed menus; compact Staff/TAB in both themes; branch refusal in both themes. Menus and reasons fit the viewport. Captures are durable under the directory above. This is menu-specific visual acceptance, not a claim that all existing studio layout issues are fixed.

## Related regressions and limitations

```powershell
pnpm exec playwright test tests/e2e/t210-web-midi-step-input.spec.ts tests/e2e/piano-roll-system-note-panel.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts tests/e2e/us10-staff-view.spec.ts tests/e2e/us13-staff-direct-interaction.spec.ts tests/e2e/staff-guitar-audio-clock.spec.ts tests/e2e/us9-export.spec.ts --project=chromium --workers=1 --retries=0 --reporter=json > artifacts/validation/t215-baseline/independent-related-chromium.json
```

The complete saved report proves 64 tests: 63 passed, 1 failed, no skips/retries/flaky results. The failure is Staff count-in playhead hiding at `staff-guitar-audio-clock.spec.ts:465`: expected zero visible playheads, received one. An isolated current run failed the same assertion earlier at line 459. The reviewer ran the unchanged test through the exact published f801562 source-substitution harness; it failed at line 465 with the same expected/received values. Reports: `artifacts/validation/t215-baseline/independent-staff-loop-current.json` and `independent-staff-loop-published.json`. This count-in defect predates T215 and remains unresolved; the test was not weakened.

The developer's additional 64-case batch had 62 passes and two chord-panel geometry failures. The reviewer inspected the baseline harness and raw comparison output: both reproduce on f801562 at the same assertions/values (line 279: 25.1953125 rather than <1; line 176: zero visible chords rather than >0). See `artifacts/validation/t215-baseline/baseline-regression-evidence.md`. These are not counted as passing tests.

No full suite or physical MIDI test was performed. MIDI evidence is mocked. All existing dirty/untracked work remains; HEAD is f801562794b39ff3d039b56e0010829aff9a1b2b, index empty. The protected portable-chord file still has its prior 62-line addition. T212/T213/T214 remain open and outside this acceptance.
