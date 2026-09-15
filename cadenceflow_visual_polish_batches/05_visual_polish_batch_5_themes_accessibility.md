# CadenceFlow — Visual Polish Batch 5
## Themes, Semantic States, Accessibility & Interaction Polish

### Goal

Finalize semantic visual states and make CadenceFlow production-ready across dark/light appearances, keyboard use, focus, dialogs, reduced motion, loading/error states, and accessibility.

## 1. Semantic state audit

Inventory passive, hover, focus, selected, previewed, Best Match, Alternative, playing, completed, branch, customized, inherited, disabled, destructive, warning, error, loading, ready.

## 2. Semantic color tokens

Normalize tokens for backgrounds, surfaces, borders, text, focus, selected, preview, Best Match, Alternative, playing, completed, branch, customized, destructive, warning, error, ready, disabled.

## 3. Color is not the only signal

Use badges/icons/labels/shape/border treatment for critical semantic states.

## 4. State collision matrix

Test selected+Best Match, previewed+Alternative, playing+selected, customized+Alternative, focus+selected, branch+selected, etc.
Define style priority.

## 5. Dark theme polish

Deliberate surface hierarchy, readable secondary text, disabled controls, input backgrounds, focus ring, non-neon semantic highlights.

## 6. High-contrast light theme

Design independently, not by naive inversion.
All semantic distinctions survive.

## 7. Theme switching

Immediate, non-semantic, preserves focus/selection where appropriate.

## 8. Keyboard navigation

Walk full Studio without mouse: toolbar, Matrix, `+`, Card Views, Inspector, Progression, transport, Remove, project menus/dialogs.

## 9. Native button semantics

Recheck one physical Enter/Space activation = one action.

## 10. Escape priority

Modal → popover/menu → selected/expanded Step → no-op.
One Escape must not close multiple layers.

## 11. Focus restoration

Restore focus sensibly after modal/popover/Step collapse/cancel.

## 12. Focus visibility

Visible in both themes; not clipped by overflow.

## 13. ARIA/native semantics audit

Use native HTML first; correct misuse of aria-pressed/selected/current/expanded/dialog/status.

## 14. Icon button accessibility

All icon-only controls need accessible names.

## 15. Dialogs/modals

Audit Project dialogs, Reset scope, exact voicing/settings:
title, initial focus, trap, Escape, focus restoration, backdrop, no background activation.

## 16. Popovers/menus

Keyboard operation, outside click, Escape, focus return, no clipping.

## 17. Error states

Polish invalid duration, invalid project, future schema, export failure, audio failure, save/delete error.
No raw stack traces.

## 18. Loading states

HQ Piano, project open/import/export, prevent duplicate action, avoid full-screen blocking unless necessary.

## 19. Audio status

Loading/Ready/Fallback/Error as status, not primary action, with non-color cues.

## 20. Transport status

Stopped/Playing/Paused accessible and stable.

## 21. Tooltip accessibility

Keyboard focus exposes equivalent help.

## 22. Reduced motion

Respect `prefers-reduced-motion`.

## 23. Scrollbar polish

Dark/light readable scrollbars, no horizontal page scroll, no unnecessary nested horizontal scroll.

## 24. 150% zoom stress

Essential controls reachable, dialogs usable, no catastrophic overlap.

## 25. Contrast check

Verify text, controls, focus, badges, disabled states.

## 26. Expertise accessibility

Beginner/Composer/Expert change density/explanation only, not access/capability.

## 27. Destructive actions

Remove Step undoable/no confirmation; Delete Project confirmed; Reset scope clear.
Visual severity must match semantics.

## 28. Test matrix

Keyboard single-fire, Escape priority, focus restoration, accessible names, dialogs, invalid-input announcements, theme/state presence.

## 29. Screenshot matrix

Dark and Light at 1280/1920 for normal, selected, recommendation, playing, branch, error, dialog, Expert Inspector.

## 30. Verification

Run full suite; zero flaky.

## 31. Spec integrity

No spec changes.

## 32. Return to orchestrator

Return:
1. commit;
2. clean status;
3. semantic token map;
4. state-collision strategy;
5. dark results;
6. light results;
7. keyboard audit;
8. Escape priority;
9. focus restoration;
10. ARIA/native audit;
11. dialog audit;
12. error/loading states;
13. contrast results;
14. reduced-motion result;
15. screenshots;
16. focused tests;
17. full Vitest;
18. full Chromium;
19. build/lint/format;
20. spec zero diff;
21. `Spec deviations: none`.

Do not begin Batch 6 until accepted.
