# CadenceFlow — Visual Polish Batch 1
## Studio Layout Foundation & Responsive Workspace

### Goal

Establish the final structural layout foundation for CadenceFlow before deeper visual styling work.

This batch is about:
- workspace geometry;
- panel ownership;
- responsive sizing;
- eliminating wasted space;
- removing layout-driven horizontal overflow;
- establishing consistent gutters/panel alignment;
- establishing the responsive multi-line My Progression track.

Do not turn this into a typography, color, icon, or component-redesign batch.
Do not change musical/domain behavior.

## 1. Audit current layout

Before modifying CSS/React structure, inspect and report:
- App shell/root layout component;
- top/global toolbar;
- Studio grid/flex container;
- Harmonic Matrix container;
- Inspector sidebar;
- My Progression container;
- width/min-width/max-width rules;
- grid/flex rules;
- overflow-x rules;
- fixed heights;
- viewport assumptions;
- media queries;
- existing workarounds around `.inspector-stack`, `.piano-performance-inspector`, nested overflow, and min-width overrides.

Do not blindly rewrite working layout.

## 2. Required desktop structure

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Global Application / Timing Toolbar                                 │
├───────────────────────────────────────────────┬──────────────────────┤
│ Harmonic Matrix panel                         │ Inspector panel      │
├───────────────────────────────────────────────┤                      │
│ My Progression panel                          │                      │
└───────────────────────────────────────────────┴──────────────────────┘
```

Structure:

```text
Studio workspace
├── Main workspace column
│   ├── Harmonic Matrix panel
│   └── My Progression panel
└── Inspector panel
```

Critical invariant: Inspector height must not determine the vertical position of My Progression.

## 3. Main-column alignment

Harmonic Matrix and My Progression must have:
- same left edge;
- same right edge;
- same available width;
- consistent gap.

My Progression must not extend underneath Inspector.

## 4. Inspector sidebar policy

Inspector remains a bounded right sidebar.
It must not:
- push My Progression down;
- overlap Matrix/Progression;
- cause page horizontal overflow.

Use a sensible responsive width policy such as `minmax()` or `clamp()`.

## 5. No document-level horizontal overflow

Verify at:
- 1280×720
- 1366×768
- 1440×900
- 1600×900
- 1920×1080

For every viewport:
`document.documentElement.scrollWidth <= document.documentElement.clientWidth`

Prefer structural fixes such as `min-width: 0`; do not hide real overflow globally.

## 6. Inspector horizontal scroll

Investigate whether current local `overflow-x:auto` can be removed structurally.
Do not redesign Inspector contents yet.
If deep redesign is required, record it for Batch 3.

## 7. Remove large unused layout holes

Matrix → reasonable gap → My Progression.
Do not artificially stretch Matrix or use fixed heights to fill space.

## 8. Effective 1920×1080 use

Studio must use most of available width.
Matrix/Main Workspace gets the majority of horizontal space.
Inspector remains bounded.

## 9. 1280×720 is fully supported

At 1280×720:
- Matrix accessible;
- Inspector accessible;
- My Progression accessible;
- transport accessible;
- global controls accessible;
- no clipping;
- no page horizontal scroll.

## 10. Layout spacing foundation

Normalize reusable values for:
- outer gutter;
- Matrix↔Inspector gap;
- Matrix↔Progression gap;
- panel padding.

Prefer CSS variables like:
`--studio-gutter`, `--panel-gap`, `--panel-padding`.

## 11. Panel geometry

Keep panel radius/boundaries aligned.
Avoid doubled borders.
Detailed border polish belongs to later batches.

## 12. Toolbar structural check

Do not visually redesign toolbar yet.
Ensure it wraps/contains without overflow.
Playback transport must remain inside My Progression.

## 13. Responsive multi-line My Progression track

Replace the normal single-line horizontal-scrolling track with wrapping:

```text
[1 I] [2 V] [3 vi] [4 IV] [5 ii] [6 V]
[7 I] [8 iii] [9 vi] [10 IV] [11 V]
```

Requirements:
- left→right→next row;
- no masonry;
- panel grows vertically;
- no permanent horizontal scrollbar at supported desktop widths;
- semantic order unchanged.

## 14. Step numbers

Add derived visible Step numbers.
They are presentation only and must not be persisted.
Rest Steps participate in the same numbering sequence.

## 15. Stable card width

Use a stable/preferred card width.
Do not stretch a few cards to fill the row.
Do not shrink cards aggressively as count rises.

## 16. Long progression stress

Test 1, 4, 10, 20, 30 Steps.
For 20–30:
- multi-row;
- no horizontal track scrollbar;
- Remove × reachable;
- Card View reachable;
- selection correct.

## 17. Drag/reorder compatibility

Wrapped layout must not alter semantic order.
If cross-row DnD needs deeper work, preserve behavior and record follow-up rather than inventing a new subsystem here.

## 18. Expanded-step compatibility

Do not redesign expanded Step yet.
Verify:
- wrapped layout survives expansion;
- collapse returns cleanly;
- no page overflow.

Record awkward behavior for Batch 3.

## 19. Preserve recent corrections

Do not regress:
- Progression directly below Matrix;
- matching widths;
- independent Inspector;
- transport inside My Progression;
- direct Remove ×;
- selection/collapse;
- Duration editing;
- Matrix audition;
- `+` Add.

## 20. No product-semantic changes

Do not change harmony, recommendations, progression model, timing, playback, audio, persistence, presets, branching, MIDI/MusicXML.

## 21. Accessibility

Preserve logical DOM/tab order, visible focus, keyboard reachability, accessible names, native button semantics.

## 22. Visual verification

Capture 1280, 1366, 1440, 1600, 1920 widths for:
- ~6 Steps;
- >=20 Steps;
- selected/expanded Step;
- dense Inspector.

Report document/client width, main width, Inspector width, Matrix width, Progression width, local Inspector horizontal scroll, and progression row count.

## 23. Automated layout assertions

At minimum:
1. no page horizontal overflow at 1280;
2. no page horizontal overflow at 1920;
3. Matrix/Progression left edges align;
4. right edges align;
5. Inspector does not overlap;
6. Progression starts below Matrix, not Inspector bottom;
7. 20+ Steps wrap;
8. no track horizontal scroll;
9. semantic order unchanged;
10. Step numbers match semantic order.

## 24. Performance

With 30–50 Step Cards, viewport resize remains responsive.
Wrapping is CSS presentation, not Project mutation.

## 25. Record future follow-ups

Record without implementing:
- bar-aware Progression visualization;
- Comfortable/Compact density;
- expanded Step Card vs dedicated Step Editor;
- Inspector deep redesign;
- remaining Inspector horizontal scrollbar;
- cross-row DnD polish;
- typography hierarchy;
- border/surface cleanup;
- semantic color tokens;
- toolbar visual redesign.

## 26. Out of scope

No final typography, colors, icon replacement, light-theme redesign, Inspector IA redesign, new animation system, bar-aware progression, compact density.

## 27. Verification

Run focused layout tests, then:
```bash
pnpm test
pnpm exec tsc -b
pnpm run build
pnpm run lint
pnpm run format:check
pnpm run test:e2e:chromium
```

No flaky acceptance.

## 28. Spec integrity

Do not modify `spec.md`.
Verify 1077 content lines, 182 unique FRs, 17 unique SCs, zero TODO/TBD/NEEDS CLARIFICATION.

## 29. Return to orchestrator

Return:
1. commit hash(es);
2. clean status;
3. pre-change layout audit;
4. final DOM/layout structure;
5. CSS architecture;
6. main width policy;
7. Inspector width policy;
8. proof Inspector height no longer affects Progression;
9. alignment measurements;
10. overflow measurements at all target widths;
11. Inspector-scroll result;
12. multi-line implementation;
13. Step numbering;
14. 1/4/10/20/30-Step results;
15. row counts at 1280/1920;
16. DnD compatibility;
17. expanded-Step compatibility;
18. accessibility/DOM order;
19. screenshots;
20. focused tests;
21. full Vitest;
22. full Chromium;
23. build/lint/format;
24. recorded follow-ups;
25. spec zero diff;
26. `Spec deviations: none`.

Do not begin Batch 2 until accepted.
