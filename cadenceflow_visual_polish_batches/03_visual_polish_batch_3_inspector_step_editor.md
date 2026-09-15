# CadenceFlow — Visual Polish Batch 3
## Inspector, Step Editor & Advanced Control Architecture

### Goal

Turn the right-hand Inspector and Step editing experience from a dense prototype/debug form into a coherent contextual editing surface.

Focus on Inspector information architecture, Step editor ownership, progressive disclosure, form layout, Per-Note Velocity Overrides, removal of horizontal scrolling, and contextual correctness.

## 1. Audit Inspector ownership

Inventory every Inspector section and identify whether it belongs to Matrix preview context, selected Progression Step, project defaults, or transient recommendation context.

## 2. Never edit the wrong object

Matrix preview → edits Preview/Add Template where appropriate.
Progression Step selected → edits that independent Step.
Deselection/delete/project switch → stale Step bindings disappear.

## 3. Inspector hierarchy

Preferred conceptual order:
1. Current context / identity
2. Recommendation explanation
3. Composition Intent
4. Harmony / variant
5. Step or Preview Performance
6. Voicing
7. Bass
8. Articulation
9. Dynamics
10. Per-note overrides
11. Advanced/rare controls

## 4. Progressive disclosure

Use collapsible/disclosure sections for dense advanced areas.
Important context remains visible.
Disclosure state must not mutate music.

## 5. Expertise density

Beginner: human-readable, less numeric noise.
Composer: balanced.
Expert: denser functional/evidence detail.
Capabilities remain the same.

## 6. Recommendation explanation

Stop showing scoring evidence like debug logs in Beginner/Composer.
Keep scoring semantics unchanged.

## 7. Step editor ownership decision

Evaluate:
- compact inline editor;
- Inspector-primary editor;
- hybrid.

Implement one coherent v1 ownership approach.
Do not remove easy Duration/quick editing without equivalent access.

## 8. Duplicate-control audit

Identify intentional mirrored convenience controls versus redundant duplicates.
Never create independent semantic implementations.

## 9. Form layout system

Consistent section title, label, control, helper/error, vertical rhythm, select/input/button heights.

## 10. Eliminate Inspector horizontal scroll

At 1280 and normal Inspector width there should be no permanent horizontal scrollbar.
Reflow/stack instead of clipping.

## 11. Per-Note Velocity redesign

Use responsive rows/cards containing note, MIDI where appropriate, role, inherited/override value, Override/Reset action.
Preserve exact velocity semantics.

## 12. Piano Voicing controls

Clarify Auto/Manual, Customize Exact Voicing, register, exact pitches.
Preserve exact manual pitch authority.

## 13. Independent Bass

Group Bass Note, Bass Octave, Custom Bass coherently.

## 14. Articulation

Present supported Piano articulations clearly; no Strum.

## 15. Dynamics & Velocity

Clarify Musical/MIDI view, exact Master Velocity, label, preset, per-note overrides.
Exact MIDI velocity remains source of truth.

## 16. Dynamics preset UI

Make Apply Dynamics Preset look intentional, while preserving editability after preset application.

## 17. Matrix Preview/Add Template Inspector

Clearly label that user is editing template, not an existing Step.
Show inherited/customized/override count and Reset Card to Defaults.

## 18. Reset hierarchy

Differentiate Reset Card, Reset Step Performance, Reset All, and Remove/Delete.
Not all are destructive.

## 19. Customized / Inherited status

Show `Inherited` vs `Customized · N overrides`; list overridden settings.

## 20. Scroll behavior

One predictable Inspector vertical scroll container where needed.
Avoid nested vertical scrollers.
No horizontal scroll.

## 21. Focus / Escape / disclosure

Keyboard accessible disclosures, correct Escape priority, no focus trapped in vanished controls.

## 22. Neutral Inspector state

When nothing contextual selected, show deliberate neutral state, no stale Step controls.

## 23. Long-content stress

Test manual voicing, independent bass, all per-note overrides, Expert mode, long explanation, customized template.

## 24. Hit targets

Override/Reset/disclosure/mode toggles/exact voicing action must be usable.

## 25. Accessibility

Labels, groups, error announcements, disclosure state, non-color inherited/override status, logical tab order.

## 26. Out of scope

No final global typography/theme, Matrix redesign, project/export redesign, persistence/model changes, new performance features.

## 27. Visual verification

Capture Matrix preview selected, Step selected, no selection, Beginner/Composer/Expert, max overrides at 1280 and 1920.

## 28. Tests

Cover ownership switching, stale cleanup, disclosure non-mutation, inherited/customized state, per-note exactness, reset invariants, no Inspector horizontal overflow, keyboard behavior.

## 29. Verification

Run full project checks; zero flaky.

## 30. Spec integrity

No spec changes.

## 31. Return to orchestrator

Return:
1. commit;
2. clean status;
3. ownership audit;
4. final Inspector hierarchy;
5. Step editor ownership decision;
6. duplicate-control audit;
7. disclosure strategy;
8. per-note redesign;
9. no-horizontal-scroll proof;
10. Matrix-template vs Step distinction;
11. Expertise results;
12. neutral state;
13. accessibility;
14. screenshots;
15. focused tests;
16. full Vitest;
17. full Chromium;
18. build/lint/format;
19. spec zero diff;
20. `Spec deviations: none`.

Do not begin Batch 4 until accepted.
