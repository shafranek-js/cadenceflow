# T157 implementation readiness

Date: 2026-09-14  
Scope: release-candidate gate only; no product schema, UI, audio-bank, deployment, or workflow changes.

## Gate evidence

| Gate | Result | Direct evidence |
| --- | --- | --- |
| Vitest | PASS | `pnpm test -- --maxWorkers=1` → 93 files passed, 737 tests passed; independent rerun 54.12s. Expected jsdom/VexFlow canvas warnings were non-failing. |
| Fixture inventory | PASS | `pnpm verify:fixtures` → 25 files. |
| Melody assets | PASS | `pnpm verify:melody-assets` → 6 local files, manifest, license, and attribution verified offline. |
| HQ piano bank | PASS | `pnpm verify:piano-bank` → 480/480 present and non-empty, 0 missing/empty/path-escaped, 79,497,836 bytes, 480/480 decoded, 0 failures. |
| Focused Chromium | PASS | 32/32, single worker, no retries; included the corrected inspector-owner and US8 portable-round-trip coverage. |
| Full Chromium | PASS | `pnpm exec playwright test --project=chromium --workers=1 --retries=0` → 136/136 passed in 2.7m. |
| Production build | PASS with known warning | `pnpm build` passed with Vite 8.2.2; 383 modules; largest JS chunk 2,001.04 kB minified / 931.33 kB gzip. The chunk-size warning remains a tracked optimization item; no performance claim is made here. |
| MusicXML schema validation | PASS | `pnpm validate:musicxml -- <fresh export>` → valid MusicXML 4.0; the MusicXML re-export produced by MuseScore from the MIDI artifact also passed. |
| Formatting/static hygiene | PASS | Scoped ESLint and Prettier passed for the T157 acceptance-test files; `git diff --check` passed. |

## SC-001–SC-020 disposition

Status meanings: PASS means direct current evidence is green, including independent-application evidence where the criterion requires it.

| ID | Status | Direct evidence and boundary |
| --- | --- | --- |
| SC-001 | PASS | `tests/e2e/us1-build-progression.spec.ts`; full Chromium. The automated journey is green; this is not a human usability study. |
| SC-002 | PASS | Recommendation explanation coverage in `tests/unit/app/presentation-commands.test.ts` and inspector acceptance in `tests/e2e/us10-inspector-step-editor.spec.ts`. |
| SC-003 | PASS | `tests/unit/recommendations/engine.test.ts` asserts one Best Match and at most three strong Alternatives; full Chromium recommendation surfaces are green. |
| SC-004 | PASS | `tests/e2e/us3-step-independence.spec.ts`, `tests/e2e/us5-piano-performance.spec.ts`, `tests/e2e/us8-project-actions.spec.ts`, and MIDI export/integration tests cover repeated-step independence through persistence and export projection. |
| SC-005 | PASS | `tests/e2e/us4-major-minor.spec.ts`, `tests/integration/key-mode-rerealization.test.ts`, and current full Chromium. |
| SC-006 | PASS | Ambiguous mapping protection in `tests/e2e/us4-major-minor.spec.ts` and `tests/unit/harmony/module-conversion.test.ts`. |
| SC-007 | PASS | `tests/e2e/us5-piano-performance.spec.ts` plus `tests/integration/pitch-projection-consistency.test.ts` and MIDI export tests verify manual pitch identity across Piano/Staff/audio/MIDI projections. |
| SC-008 | PASS | Timing, rest, subdivision, dotted/triplet, loop, MIDI, and MusicXML evidence in `tests/e2e/us6-timing-transport.spec.ts`, `tests/integration/timing-audio-projection.test.ts`, `tests/integration/measure-card-export-alignment.test.ts`, and export unit tests. |
| SC-009 | PASS | `tests/e2e/us6-timing-transport.spec.ts` Scenario 3 and MIDI timing/export tests verify Swing as performance timing separate from semantic duration. |
| SC-010 | PASS | UI loop-range acceptance in `tests/e2e/us6-timing-transport.spec.ts`; virtual-clock long-loop evidence in `tests/unit/audio/playback-controller.test.ts` and `tests/integration/transport-soak.test.ts` (240 iterations, zero cumulative drift assertion). |
| SC-011 | PASS | `tests/e2e/us8-project-actions.spec.ts` round-trips named project, temporary branch, manual voicing, per-note velocity, custom meter, swing, and fresh history after reload. |
| SC-012 | PASS | `tests/e2e/us8-project-actions.spec.ts` portable `.cadenceflow` import in a fresh browser context plus `tests/unit/persistence/portable-project.test.ts`. |
| SC-013 | PASS | MuseScore 4.7.4 independently imported the fresh MIDI, rendered it, and re-exported it as MusicXML/MSCX. The render shows tempo 132, 7/8, separate Violin/Chords/Bass parts, supported pitches, rests, ties, and timing; MSCX inspection preserves distinct note velocities including 80, 85, 95, and 110. |
| SC-014 | PASS | MuseScore 4.7.4 independently imported and rendered the fresh rich-project MusicXML and the current chromatic acceptance fixture. The renders preserve key/mode, grouped meter, tempo, harmony, durations/rests, ties/tuplets, dynamics, and accidental spelling including sharps and flats. |
| SC-015 | PASS | Full Chromium includes 1280×720 and 1920×1080 layout/accessibility/zoom coverage with no page-level horizontal overflow. |
| SC-016 | PASS | `tests/integration/instrument-profile-contract.test.ts` and full Vitest verify a second instrument profile against the same stored harmonic progression contract. |
| SC-017 | PASS | `tests/e2e/us5-audio-playback.spec.ts`, `tests/e2e/us5-piano-performance.spec.ts`, `tests/integration/pitch-projection-consistency.test.ts`, and the 480-region bank/decode gate. |
| SC-018 | PASS | `tests/e2e/us12-final-acceptance.spec.ts`, `tests/e2e/us12-melody-editor-staff.spec.ts`, `tests/integration/us12-melody-acceptance.test.ts`, and melody projection/export tests. |
| SC-019 | PASS | `tests/e2e/progression-score-systems.spec.ts`, `tests/e2e/us13-staff-direct-interaction.spec.ts`, and full Chromium across desktop sizes, themes, zoom, and Staff/Melody alignment. |
| SC-020 | PASS | `tests/e2e/us13-staff-direct-interaction.spec.ts` covers Chord/Rest selection, inspection, reorder/remove, playback reachability, pointer/keyboard Melody actions, and retained Harmonic/Piano interactions. |

## Fresh representative export

Generated outside the repository from `tests/fixtures/rich-project.fixture.ts` using the current export semantics:

- [MIDI artifact](C:/Users/pavel/.codex/visualizations/2026/09/13/01a09cc5-4cf8-73d1-9332-24e8bdb8c4f0/t157-exports/cadenceflow-t157-rich-project.mid) — 492 bytes; SHA-256 `A895F93318D4822C72EAE8AB05328B26B81F3B62DFF1EBDAD3CF07CD434A3E54`.
- [MusicXML artifact](C:/Users/pavel/.codex/visualizations/2026/09/13/01a09cc5-4cf8-73d1-9332-24e8bdb8c4f0/t157-exports/cadenceflow-t157-rich-project.musicxml) — 17,649 bytes; SHA-256 `E096572FB95782369BFB9031E6E6A8A6369F3F82EDE2287AC14AF1FBE55D6D3E`.

Internal projection evidence for the same fixture:

- MIDI format 1, PPQ 120, four tracks, tempo 132 BPM, 7/8 meter, total 1,260 ticks; separate Melody, Chords, Bass, and conductor tracks.
- Chords include the repeated I step, manual C4/E4/G4/C5 voicing with C2 bass and velocity overrides 110/85, the Rest step, IV arpeggiation, and V spelling B3/D4/G4.
- MusicXML 4.0 contains 7/8 grouping 2+2+3, C-major key, two staves, C/F/G harmony, rests, dotted/triplet durations, and representable `mf`/`f` dynamics.

Independent interoperability was verified with `MuseScore: Music Score Editor; Version 4.7.4; Build 7688c00`. MuseScore imported the artifacts and generated its own renders plus round-trip files under `C:\Users\pavel\.codex\visualizations\2026\09\14\t157-independent-musescore`:

- `midi-import-1.png`, `midi-import.mscx`, and `midi-roundtrip.musicxml` from the fresh MIDI artifact;
- `musicxml-import-1.png` from the fresh rich-project MusicXML artifact;
- `enharmonic-acceptance-1.png` from the current chromatic acceptance fixture, whose freshness is asserted byte-for-byte against writer output by `tests/unit/export/musicxml.test.ts`.

The MuseScore-produced round-trip MusicXML passed the repository's offline MusicXML 4.0 validator. These artifacts are evidence outputs outside the repository, not product files.

## Attribution and scope notes

The committed HQ-piano attribution identifies Salamander Grand Piano V3, Alexander Holm, the pinned upstream revision `370497372ece1603d1ca7b9892c82c1da566565e`, and CC BY 3.0 in `public/licenses/piano-hq-attribution.txt`. Melody assets have the corresponding local FluidR3_GM attribution and CC BY 3.0 license files. This records repository evidence; it is not a legal-sufficiency opinion.

T157 changed only acceptance-test expectations/helpers and this checklist. Existing dirty/untracked Graphify, QA, source, screenshot, and documentation material was preserved. No product behavior, schema, deployment, workflow, commit, or push was performed.
