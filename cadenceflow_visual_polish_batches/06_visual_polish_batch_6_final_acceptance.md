# CadenceFlow — Visual Polish Batch 6
## Final UX Cohesion, Workflow Review & Visual Acceptance

### Goal

Perform the final visual/UX acceptance pass across the complete CadenceFlow v1 composition workflow.

This is not a place for uncontrolled redesign. Validate all prior batches together, close remaining visual defects, confirm workflow coherence, finalize first-use guidance, run stress/performance/accessibility checks, and capture final reference screenshots.

## 1. Full workflow review

Walk:
1. New Project
2. choose tonic/module
3. Matrix click → audition
4. inspect recommendation
5. `+` Add
6. build progression
7. edit Duration
8. edit performance
9. remove
10. reorder
11. branch
12. playback
13. preset
14. save/reopen
15. portable project export/import
16. MIDI/MusicXML if implemented by then

At each step check discoverability, feedback, current context, reversibility, and visual noise.

## 2. Main hierarchy

Final hierarchy:
`Harmonic Matrix → My Progression → Inspector`
with toolbar as global/project/timing surface.

## 3. Matrix→Progression connection

Ensure click = preview/audition and `+` = commit is visually obvious.

## 4. Progression→Inspector connection

Selected Step and Inspector must correlate; deselection/delete/project switch clears stale context.

## 5. First-use guidance

Communicate:
`Choose key → explore Matrix → click to hear → + to add`
without a heavy tutorial.

## 6. Empty states

Finalize empty progression, neutral Inspector, no recommendation, empty project, no exportable content.

## 7. Project UX polish

Review current project name and New/Open/Rename/Delete/Save As/Export/Open File organization.

## 8. Export UX polish

If MIDI/MusicXML implemented, organize export options coherently and keep formats distinct.

## 9. Audio status / preview feedback

Finalize HQ Piano Loading/Ready/Fallback/Error and audition/playback feedback.

## 10. Long progression final stress

Test 1/4/10/20/30/50 Steps:
wrap, numbering, Remove, selection, Rest, Card Views, DnD, transport, overflow, performance.

## 11. Bar-aware progression final decision

Revisit subtle bar separators/bar numbers/meter-aware cues.
Implement only if low-risk and model-neutral; otherwise produce concrete future design note.
Do not forget/defer silently.

## 12. Comfortable/Compact density final decision

Implement if already safe/presentation-only, otherwise explicitly defer with concrete specification.

## 13. Expanded Step Card final decision

Revisit inline expanded card vs dedicated Step Editor vs Inspector-primary editing.
Fix if current approach remains visibly awkward.

## 14. Top toolbar final review

Grouped, not prototype-like, wraps at 1280, transport absent, global timing/project/status clear.

## 15. Microcopy final pass

Review recommendation explanations, progression/project/reset/export/audio wording.
No debug terminology in normal Beginner/Composer modes.

## 16. Icon final pass

One coherent icon style; every icon-only control accessible.

## 17. Performance

With 50 Steps and Inspector open: responsive interaction, resize, theme switch, recommendation update.

## 18. Audio asset loading performance

Large piano assets must not block UI interaction.

## 19. Resize matrix

Verify 1280, 1366, 1440, 1600, 1920.
No page horizontal scroll or clipped essential controls.

## 20. Zoom matrix

100%, 125%, 150%.

## 21. Theme matrix

Dark + Light for normal, selected, recommendation, playing, branch, error, disabled.

## 22. Expertise matrix

Beginner/Composer/Expert same capability, different density/explanation, no layout break.

## 23. Temporary branch UX

Temporary appearance, Original/Alternative, rejoin, commit selected/all, Undo after commit, long progression compatibility.

## 24. Preset UX

Presets, Save as Preset, Replace/Append/Insert, custom preset management remain coherent.

## 25. Scroll final audit

No document horizontal scroll, no My Progression horizontal scroll, no normal Inspector horizontal scroll, no unjustified nested scrolling, no scroll jumps.

## 26. Status hierarchy

Audio Ready, transport, Best Match, Alternative, Selected, Customized, Branch, autosave status do not create visual chaos.

## 27. Error/loading audit

Trigger representative audio error, invalid project, future version, invalid duration, export error if possible.

## 28. Accessibility final walkthrough

Keyboard-only composition workflow, focus visibility, Escape, dialogs, labels, non-color states, 150% zoom.

## 29. Final reference screenshots

Capture:
- Dark 1280 empty/normal/20+ Steps/selected/branch
- Dark 1920 normal/20+ Steps/Expert Inspector/Dark Harmony
- Light 1280 normal/selected
- Light 1920 normal/branch
- Piano Card View
- Staff Card View
- error state
- project dialog
- export UI

## 30. Manual visual review report

For each screenshot note:
- layout issue;
- overflow;
- clipped control;
- unreadable text;
- state ambiguity;
- excessive empty space;
- excessive border/noise.

Resolve all severity-high issues.

## 31. Final automated gates

```bash
pnpm test
pnpm exec tsc -b
pnpm run build
pnpm run lint
pnpm run format:check
pnpm run test:e2e:chromium
```

No flaky.

## 32. SC-015 explicit acceptance

At 1280×720 through 1920×1080:
Matrix, Progression, Inspector, playback controls accessible; no page horizontal scroll.

## 33. FR-171–FR-175 explicit acceptance

Review each requirement explicitly, not merely "UI looks good."

## 34. Final deferred design register

Explicitly record remaining future items such as bar-aware progression/density if deferred, future Guitar views, mobile, and non-v1 polish.

## 35. Final design standard

CadenceFlow should look like a deliberate music composition studio, not a debug console, admin dashboard, HTML form collection, or prototype.

## 36. Return to orchestrator

Return:
1. final commits;
2. clean status;
3. workflow findings;
4. hierarchy result;
5. first-use guidance;
6. project/export polish;
7. long progression result;
8. bar-aware decision;
9. density decision;
10. Step editor decision;
11. resize matrix;
12. zoom matrix;
13. theme matrix;
14. expertise matrix;
15. branch result;
16. scroll audit;
17. accessibility walkthrough;
18. screenshot artifact set;
19. manual visual review;
20. SC-015 proof;
21. FR-171–FR-175 proof;
22. full Vitest;
23. full Chromium;
24. build/lint/format;
25. deferred design register;
26. spec zero diff;
27. `Spec deviations: none`.
