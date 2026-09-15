# CadenceFlow — Visual Polish Batch 4
## Global UI System: Typography, Spacing, Surfaces, Toolbar & Iconography

### Goal

Create a coherent visual language across CadenceFlow after layout and editing structure are stable.

Focus on typography, spacing, surfaces, borders/radii, toolbar organization, icons, hit targets, microcopy consistency, and density foundation.

## 1. Visual-system audit

Inventory font sizes/weights/line heights, uppercase labels, spacing values, panel/card padding, borders, radii, control heights, icon sources, toolbar groups, CSS tokens.

## 2. Typographic scale

Define hierarchy for product title, panel titles, section titles, card identity, secondary spelling, body text, labels, metadata, status/help.
Avoid excessive micro-text.

## 3. Reduce tiny all-caps noise

Audit TEMPO/METER/GROOVE/LOOP/STEP DURATION.
Use uppercase only where hierarchy benefits.

## 4. Spacing scale

Normalize around a small scale (e.g. 4/8/12/16/24) for panels, cards, toolbar groups, forms.

## 5. Surface hierarchy

Define app background, panel, raised card/control group, selected/active surface, modal/popover levels.

## 6. Border-noise reduction

Avoid equally strong borders everywhere.
Keep hierarchy and structural boundaries clear.

## 7. Radius consistency

Normalize panel/card/button/input/badge/dialog radii.

## 8. Global toolbar organization

Group:
- Application: Project, Theme, Expertise
- History: Undo, Redo
- Timing: Tempo, Meter, Step Duration, Groove
- Playback support: Loop, Metronome, Count-in
- Status: Piano Audio

Transport stays in My Progression.

## 9. Toolbar visual grouping

Use spacing/separators/group containers.
At 1280 wrapping must be coherent.
Do not hide essential timing controls without approval.

## 10. Project control presentation

Keep current project name visible and concise.
Polish New/Open/Rename/Delete/Save As/Export/Open Project File organization.
Do not change persistence semantics.

## 11. Export organization

Prepare coherent presentation for Project/MIDI/MusicXML export without prematurely implementing unavailable export features.

## 12. Icon system

Normalize Play/Pause/Resume/Stop/Undo/Redo/Add/Remove/Settings/Reset/Metronome/disclosure arrows.
Avoid chaotic Unicode/emoji/SVG mixtures.

## 13. Icon-only button rules

Accessible name, tooltip where needed, hover/focus, adequate hit area.

## 14. Hit target standard

Aim for roughly 32×32 hit areas for frequent desktop actions where feasible.

## 15. Form-control consistency

Normalize select/numeric input/segmented control/button heights, borders, radii, focus.

## 16. Status pills/badges

Differentiate runtime status, recommendation status, configuration status by shape/weight/hierarchy.

## 17. Microcopy consistency

Review From Here, At progression end, Explore Alternative, Reset cards, Save as Preset, Customized, Inherited, project actions.
Propose controversial changes before applying.

## 18. Comfortable / Compact density foundation

Implement only if presentation-only and low risk.
If persistence implications are non-trivial, defer with concrete spec.

## 19. Hover/focus/pressed geometry

No interaction state should move layout.

## 20. Cursor behavior

Normalize pointer/grab/grabbing/disabled/text cursors.

## 21. Tooltip policy

Use for ambiguous icons/shortcuts, not critical hidden information.

## 22. Empty-state typography/spacing

Polish empty progression and neutral Inspector messages.

## 23. Zoom stress

Verify 100%, 125%, 150%.

## 24. Windows scaling

Check typical 125% display scaling behavior.

## 25. Out of scope

Do not finalize dark/light semantic colors, animation system, Inspector architecture, Matrix semantics, persistence/harmony.

## 26. Visual verification

Capture 1280 and 1920 normal Studio, long progression, selected Step, Expert Inspector, Project menu, wrapped toolbar.

## 27. Tests

Stable tests for toolbar grouping/no duplicate transport, accessible names, density if implemented, no toolbar overflow.

## 28. Verification

Run full project checks.

## 29. Spec integrity

No spec changes.

## 30. Return to orchestrator

Return:
1. commit;
2. clean status;
3. typography scale;
4. spacing scale;
5. surface/border/radius system;
6. toolbar grouping;
7. icon strategy;
8. hit-target audit;
9. microcopy changes/proposals;
10. density result;
11. zoom results;
12. screenshots;
13. focused tests;
14. full Vitest;
15. full Chromium;
16. build/lint/format;
17. spec zero diff;
18. `Spec deviations: none`.

Do not begin Batch 5 until accepted.
