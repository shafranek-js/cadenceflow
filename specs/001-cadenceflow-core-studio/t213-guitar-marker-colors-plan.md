# T213 Guitar chord-diagram marker colors

## Decision and scope

Store the choice per project in `Project.presentation.guitarChordColorMode`. This matches the existing project-scoped `guitarChordOrientation`, `noteColorMode`, Matrix view, and Progression view preferences, while keeping one choice synchronized across Matrix and My Progression. Default absent/older-project values to `chord-roles` so diagrams retain their current appearance. Add the field as an optional presentation property to the current schema v10 and portable-project codec; this is an additive view preference and does not change the schema version or musical data.

The View menu will expose a radio choice between `Chord roles` and `Fingering colors`. In fingering mode, fretted markers use the existing Tablature/hand-legend palette for fingers 1–4 and show the finger number. Missing or unsupported finger data stays neutral and is never inferred. Open strings remain hollow and neutral in fingering mode; in chord-role mode, root open strings keep their red outline. Both Matrix and My Progression diagrams use the same preference in vertical and horizontal orientations. The compact legend and accessible diagram labels name the fingers/roles as well as showing color.

Keep voicing resolution, pitch assignment, playback, Tablature rendering, exports, and monochrome print behavior unchanged. Do not expand the change into general Tablature palette cleanup or T207.

## Verification

- Unit coverage for both marker modes, fingers 1–4, missing fingering, open-root styling, accessible descriptions, and unchanged resolved voicings.
- Portable-project round-trip and legacy-absence fallback coverage for the optional project preference.
- Focused Chromium coverage for the View radio controls, Matrix/My Progression parity, both orientations, light/dark themes, and a narrow viewport.
- Confirm the print stylesheet remains monochrome, run a fresh production build, focused Vitest, scoped Chromium, lint/format checks, and `git diff --check`.
- Preserve every inherited dirty/untracked file and the protected `piano-roll-system-chord-portable.spec.ts` diff. Do not stage, commit, push, deploy, clean up, run the full suite, or mark T213 independently accepted.

## Acceptance boundary

The implementation handoff records exact validation, visual evidence, and Git state. Root independent acceptance remains separate; leave T213 unchecked until that review is recorded. T214 remains out of scope.
