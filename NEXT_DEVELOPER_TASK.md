# Next Developer Assignment — CadenceFlow US12, Batch D

**Assignment:** T172–T173 only, plus the contextual-realization correction described below.

**Do not implement T174+ in this batch.** MIDI and MusicXML output must remain unchanged.

**Goal:** prepare and verify the licensed offline FluidR3Mono asset, add one lazy Melody SoundFont
provider, and route derived Melody events through a separate playback role/channel. Piano and metronome
must continue when Melody is unavailable. Staff must highlight the exact sounding Melody event.

Authoritative sources:

- `specs/001-cadenceflow-core-studio/spec.md`, US12 and FR-191–FR-207;
- `specs/001-cadenceflow-core-studio/us12-melody-from-chords-plan.md`;
- accepted derived timeline in `src/notation/melodyStaffProjection.ts`;
- existing audio seams in `src/audio/contracts.ts`, `eventRealizer.ts`, `scheduler.ts`,
  `playbackController.ts`, and `soundfont/spessaProvider.ts`.

## Preflight and scope

1. Work on the accepted baseline containing:
   - `21607f8 fix(us12): correct melody staff groups and interactions`;
   - `5fea349 docs(status): accept us12 melody editor and staff`.
2. Use Node `24.14.0` and pnpm `10.12.4`.
3. Report `git status --short` and `git log -5 --oneline` before editing.
4. Preserve every existing untracked QA/visual-polish/source-information item; do not stage it.
5. Do not change `spec.md`, `plan.md`, `tasks.md`, or `PROJECT_STATUS.md`; T172/T173 stay unchecked until
   independent review.
6. Do not push.

## Required T171 follow-up — one canonical contextual upper realization

Before adding sound, remove the current Step-local ambiguity in Melody projection:

- Extract/reuse one pure progression-level Piano realization helper under `src/instruments/piano/` that
  walks authored Steps in order and carries `previousPitches` and `previousBassPitch` through automatic
  voice leading.
- Both the canonical performance/audio projection and `createMelodyTimeline` must consume the same
  ordered realization result. Do not make notation import from `src/audio/`.
- Melody continues to receive upper pitches only. Independent bass is carried solely for contextual Piano
  realization and is never passed into `realizeChordMelody`.
- Manual voicing remains authoritative; RestStep advances musical time but does not invent a realization.
- Prove with an `I → IV` automatic-voicing fixture that Melody Staff pitches equal the contextual upper
  realization used by playback and differ from a deliberately chosen non-contextual candidate where
  applicable.
- Do not change existing Piano card/Staff presentation semantics in this correction.

Commit this correction separately, preferably:
`fix(us12): share contextual melody realization`.

## T172 — licensed offline asset and lazy provider

### Reproducible preparation

- Add an idempotent Node/TypeScript preparation script and package command for exactly
  `fluidr3mono-gm-soundfont_2.315-7_all.deb`.
- Download only from the authoritative Debian archive/package path and verify the package SHA-256 before
  extraction:
  `4098301bf29f4253c2f5799a844f42dd4aa733d91a210071ad16d7757dea51d6`.
- Use a safe temporary directory outside tracked output; remove it on success/failure. Never write an
  unverified package into `public/` and never commit the `.deb`.
- Extract only:
  - `FluidR3Mono_GM.sf3`;
  - the Debian copyright/license source.
- Commit the verified runtime asset under `public/audio/melody/`, the license under `public/licenses/`, and
  a deterministic provenance manifest containing package/version, canonical source URL, package SHA-256,
  extracted filenames, byte sizes, extracted SHA-256 values, license identity, and preparation-script
  version.
- Add an offline `--verify` path that performs no network calls and fails on a missing, renamed, empty, or
  hash-mismatched asset/license/manifest. A second prepare run must be deterministic and must not rewrite
  identical files.
- Update `.gitignore` narrowly so temporary/package artifacts cannot be staged while the intended extracted
  runtime files remain trackable.
- Do not add a new extraction npm dependency unless Node/platform facilities truly cannot handle the Debian
  archive. If an external executable is required, invoke it via `execFile` with fixed arguments and produce
  a clear prerequisite error; never construct a shell command from paths.

### Melody provider

- Keep `SpessaSoundFontProvider` generic/backward compatible. Add a small Melody-specific provider or
  adapter rather than embedding Melody policy throughout the generic class.
- Inspect the installed `spessasynth_lib@4.3.14` exports/types before choosing program-change/controller
  calls; do not guess its API and do not add another synthesizer library.
- Load only local `/audio/melody/FluidR3Mono_GM.sf3`; runtime must make no CDN/network request.
- Use the same AudioContext/clock as the HQ Piano provider. Do not create an extra AudioContext when the
  shared context exists.
- Load lazily only when:
  - a project first contains a Melody recipe, or
  - the user requests audible Melody preview.
  Projects without recipes must not fetch/parse/import the SF3 path.
- Deduplicate concurrent `prepare()` calls. State lifecycle must be observable and deterministic:
  `idle → loading → ready`, or `idle/loading → error`; Retry starts a fresh attempt and can reach `ready`.
- Retain the underlying error message/cause for UI diagnostics without persisting it in Project.
- Apply the selected zero-based GM program before scheduling/preview:

  | Instrument | Program |
  |---|---:|
  | Violin | 40 |
  | Cello | 42 |
  | Oboe | 68 |
  | Clarinet | 71 |
  | Flute | 73 |
  | Synth Lead | 80 |

- Apply global Melody Volume as channel gain/GM CC7 (implementation according to the verified installed
  API), not by overwriting each note's inherited velocity.
- `stop`, cancellation, Retry, instrument change, and disposal must prevent stuck notes and stale timers.
- Extend Melody Track UI with concise `Loading`, `Ready`, and identified `Error` state plus a keyboard-
  accessible `Retry`. Add an audible Preview action to the editor now that the real provider exists. Preview
  is isolated from Project/history and does not stop or mutate progression transport.

Recommended commit:
`feat(us12): prepare lazy melody soundfont provider`.

## T173 — separate Melody events, routing, and exact highlighting

### Pure performance projection

- Extend `AudioChannelRole` with `melody`. HQ Piano must never receive that role directly; composite routing
  is responsible for separating it.
- Add a pure immutable Melody performance projection built from the canonical contextual realization and
  accepted recipe generator. Do not use serialized/generated Project notes.
- Every derived playback event retains `eventKey = sourceStepId:eventIndex`, source Step identity, exact
  Rational onset/duration, pitch, and inherited note velocity.
- Velocity comes from the corresponding **source upper pitch** using current master velocity and per-note
  override. When recipe octave offset changes output MIDI, resolve velocity from the pre-offset source pitch;
  do not use bass velocity and do not clamp valid inherited velocity.
- Written `createMelodyTimeline` remains unswung. For live Melody only:
  - straight Grid events follow the current Swing projection;
  - `eighth-triplet` and `sixteenth-triplet` remain unswung;
  - exact semantic duration and Project recipe remain unchanged.
- Full playback, Play From Here, pause/resume, trailing measure silence, and loop must use stable event keys
  and avoid a duplicate attack when resuming inside an active event.
- For Play From Here or a loop slice, first realize against the full preceding progression context, then
  filter/rebase the requested session range. Do not lose prior voice-leading context at the slice boundary.

### Composite playback routing

- Extend `PlaybackController` with an optional Melody provider/settings input; do not create a second
  independent scheduler or transport session.
- Route in one composite provider:
  - `upper` and `bass` → HQ Piano;
  - `melody` → Melody SoundFont provider;
  - `metronome` → Metronome provider.
- Normal state: Piano + Melody + optional metronome.
- `muted=true`: omit Melody scheduling; Piano/metronome unchanged.
- `solo=true`: schedule Melody and metronome, omit Piano upper and bass.
- Volume `0` is silent Melody but does not remove derived data or affect Piano/metronome.
- If Melody is idle/loading/error at session start, continue Piano and metronome without Melody, expose an
  explicit Melody unavailable/error state and Retry, and never put Transport into global error. Do not route
  Melody notes to Piano as a hidden timbre fallback and do not join a Melody provider halfway through an
  already-running session; restart/play again after Ready.
- A Piano provider error retains existing fail-closed Transport behavior. A Melody error is isolated.
- Stop/pause/project switch/unmount cancels all participating providers exactly once and leaves no stuck
  Melody notes. Preview and progression scopes must not cancel each other.

### Exact active-note state

- Extend the runtime/Transport presentation state with `activeMelodyEventKey: string | null` (or an equally
  explicit event identity), guarded by session ID like `currentStepIndex`.
- Track Melody event half-open intervals `[start, end)` against scheduler elapsed session time, including
  count-in offset and loop rebasing.
- During count-in, rests, no-recipe Steps, trailing silence, Mute, provider-unavailable fallback, pause,
  stop, and natural end, active Melody key is `null`.
- On resume within a Melody note, reschedule only its remaining duration and restore its highlight; at an
  exact adjacent boundary highlight only the next event.
- Wire this state through `App → ProgressionTrack → MelodyStaffView`. Only the matching note is highlighted;
  existing source Chord Step highlighting remains simultaneous and unchanged.
- Runtime position/highlight is transient and must never enter Project, autosave, portable files, Undo/Redo,
  presets, or export.

Recommended commit:
`feat(us12): route live melody playback and highlighting`.

## Required focused tests

### Preparation/provider

- pinned package URL/name/SHA and hash mismatch fail-closed before extraction;
- path traversal/extra archive members cannot escape or enter public output;
- deterministic manifest, extracted-file hashes, idempotent prepare, offline verify with network disabled;
- lazy zero-fetch project-without-melody case and concurrent prepare deduplication;
- all six GM mappings, CC7/gain Volume, shared AudioContext, state transitions, Retry recovery;
- schedule/cancel/stop/dispose and no stuck notes/timers;
- no runtime remote URL.

### Projection/controller

- contextual `I → IV`, manual voicing, octave offset with pre-offset velocity override, bass exclusion;
- straight vs triplet Swing, exact truncation, Rest/no-recipe spans, Play From Here context rebasing;
- normal, Mute, Solo, Volume 0, provider loading/error fallback, and Piano-error behavior;
- count-in, pause/resume inside a note, exact adjacent boundary, loop, trailing silence, stale session callback,
  stop/natural end/project switch cleanup;
- one scheduler/session only and correct provider batches by role;
- exact active key plus simultaneous unchanged source-Step highlight;
- Project immutability and no generated/runtime state persistence.

### Focused Chromium

- Create a Melody, observe lazy Loading → Ready using the real local asset path, preview it, and play Piano +
  Melody.
- Verify exact note highlight advances within one Chord Step.
- Verify Mute, Solo, Volume, pause/resume, loop, Stop, instrument change, and keyboard Retry after an
  intentionally intercepted SF3 failure.
- Assert Piano transport continues during Melody failure and no remote asset request occurs.
- Use one focused spec, Chromium `workers=1`, `retries=0`, at a supported desktop viewport.

## Verification policy

Run only:

1. new preparation/provider/projection/playback tests;
2. existing focused SoundFont, audio contract, scheduler, playback-controller, event-realizer, melody Staff,
   transport-store, and Melody UI tests directly affected;
3. offline asset verification;
4. one focused Chromium spec with `--workers=1 --retries=0`;
5. TypeScript;
6. Prettier check for changed files only;
7. `git diff --check`.

Do not run full Vitest, full Chromium, lint, or unrelated export tests. Build only once if required by the
focused preview-based Chromium configuration. Restore dev server HTTP 200 at
`http://127.0.0.1:5174/` afterward.

## Report

Return commit hashes and exact file lists; downloaded package URL/hash and extracted asset/license hashes;
offline verify result; inspected Spessa API/program/volume method; lazy-load request evidence; routing table;
velocity and Swing evidence; pause/resume/loop/highlight evidence; failure/Retry evidence; exact focused
commands/results with Chromium retries `0`; final Git/ahead state; dev-server HTTP status; and
`Spec deviations: none` or the complete list.

**Acceptance condition:** CadenceFlow reproducibly bundles a verified open-source FluidR3Mono asset, loads
it only when Melody needs it, plays derived Melody through an isolated instrument channel with correct
settings and graceful failure, and highlights the exact sounding Melody note without changing Project or
export semantics.
