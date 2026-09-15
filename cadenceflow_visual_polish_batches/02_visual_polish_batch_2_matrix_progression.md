# CadenceFlow — Visual Polish Batch 2
## Harmonic Matrix & My Progression Visual System

### Goal

Polish the two primary composition surfaces so they read as one coherent workflow:

`Harmonic Matrix → Preview/Recommendation → explicit Add → My Progression`

Focus on visual hierarchy, card design, recommendation states, progression readability, branch presentation, Card Views, and direct manipulation affordances.

## 1. Audit current presentation

Inventory Matrix card components, state classes, Best Match/Alternative rendering, preview/playing states, `+`, Card View, gear/settings, customized indicator, Progression card, Rest card, selected/expanded states, Remove ×, transport, branch UI, and DnD affordances.

## 2. Matrix hierarchy

Matrix remains primary composition surface.
Functional layers must be easy to scan and stable.

## 3. Functional layers

Polish headings, separators, spacing, and visual weight for Progressions and Dark Harmony layers without changing topology.

## 4. Matrix card anatomy

Prioritize:
1. harmonic function/chord identity;
2. realized spelling;
3. recommendation/preview state;
4. secondary controls.

## 5. Add affordance

`+` must clearly mean Add to My Progression.
Keep accessible label, adequate hit target, hover/focus, no duplicate audition.

## 6. Recommendation hierarchy

`Best Match > Alternative > passive`
Use non-color cues too.
Do not change recommendation ranking.

## 7. State collision matrix

Review passive, hover, focus, previewed, Best Match, Alternative, playing, customized, and combinations among them.
Document state priority.

## 8. Stable recommendation badges

Badges must not overlap chord identity, clip, or shift card geometry.

## 9. Progression card anatomy

Recommended hierarchy:
- Step number;
- Remove ×;
- harmonic identity;
- performance summary;
- Card View controls.

## 10. Remove × polish

Consistent top-right placement, subtle default, stronger destructive hover/focus, always discoverable, Rest parity.

## 11. Selection/collapse polish

Same-card toggle, Escape, background deselect, selecting another card, Inspector interaction—all must remain stable and visually obvious.

## 12. Expanded Step visual damage control

Do not yet redesign editor ownership, but make expanded state readable, aligned, non-overflowing, and compatible with multi-line layout.
Record remaining awkwardness for Batch 3.

## 13. Progression transport presentation

Group Play / From Here / Pause / Resume / Stop / state as one transport cluster inside My Progression.
Do not change transport semantics.

## 14. Progression header organization

Organize My Progression title, Presets, Save as Preset, transport, branch controls, Progression View, + Rest into meaningful groups.

## 15. Long progression rhythm

Verify 20–50 Steps remain scannable with stable gaps, numbering, and row-major order.

## 16. Comfortable / Compact density exploration

Explore a presentation-only density concept.
Do not implement without low-risk justification/approval.
Record concrete proposal if deferred.

## 17. Bar-aware progression exploration only

Explore subtle bar separators/bar numbers based on existing meter/duration.
No piano roll, no model changes.
Produce a concrete design note if deferred.

## 18. Rest Step design

Rest must be visually distinct but clearly part of sequence, with numbering, duration, Remove parity.

## 19. Branch visualization

Original vs Alternative, branch origin, rejoin, selected branch steps, commit controls must remain unmistakably temporary and non-color-only.

## 20. Card View controls

Harmonic/Piano/Staff controls should look like view controls, with global/per-card relationship understandable and stable geometry.

## 21. Piano Card View

Verify correct key geometry, exact pitches, readability, no overflow.

## 22. Staff Card View

Verify note/accidental readability, exact pitch/spelling preservation, compact rendering.

## 23. Drag-and-drop polish

Clear drag affordance/drop indicator; no drag from Remove/Card View/editor controls; cross-row index correctness.
If deeper work needed, record follow-up.

## 24. Matrix→Progression visual connection

Consider subtle Add feedback that respects reduced motion.
No flashy animation.

## 25. Empty progression state

Add concise guidance, e.g.:
`Preview a chord in the Matrix, then press + to add it.`

## 26. No-recommendation state

Explain clearly; passive choices remain selectable; never fabricate weak recommendations.

## 27. Microcopy pass

Review labels such as Best Match, Alternative, Reset cards, At progression end, Explore Alternative, Save as Preset, + Rest.
Propose controversial wording before changing.

## 28. Hit targets

Audit `+`, gear, Card View, Remove ×, transport.
Aim for ~32×32 hit areas where feasible.

## 29. Accessibility

Accessible names, visible focus, non-color state cues, keyboard operation, branch controls.

## 30. Out of scope

No Inspector IA redesign, global typography/theme system, top-toolbar overhaul, persistence, recommendation algorithm, harmony changes, bar-aware implementation.

## 31. Visual verification

Capture normal and 20+ Step layouts at 1280 and 1920, selected Step, branch, Dark Harmony, Piano Card View, Staff Card View.

## 32. Tests

Add focused behavior/state tests without brittle pixel-perfect assertions.

## 33. Verification

Run full project checks; zero flaky.

## 34. Spec integrity

No spec changes.

## 35. Return to orchestrator

Return:
1. commit;
2. clean status;
3. pre/post Matrix card hierarchy;
4. recommendation state strategy;
5. state-collision matrix;
6. Progression card anatomy;
7. Remove proof;
8. selection/collapse proof;
9. transport/header organization;
10. long progression screenshots;
11. Rest design;
12. branch design;
13. Piano/Staff results;
14. DnD result;
15. empty states;
16. accessibility;
17. focused tests;
18. full Vitest;
19. full Chromium;
20. build/lint/format;
21. future bar-aware/density notes;
22. spec zero diff;
23. `Spec deviations: none`.

Do not begin Batch 3 until accepted.
