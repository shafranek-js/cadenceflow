# Feature Specification: CadenceFlow Core Composition Studio

**Feature Branch**: `not-created` (git extension not enabled)

**Created**: 2026-09-04

**Status**: Implementation in progress — US3 source complete

**Input**: CadenceFlow product concept and `cadenceflow.html` prototype. These are the authoritative
sources for current product requirements. The older ChordLab project is an idea pool only and does
not define v1 scope unless a capability is explicitly selected for CadenceFlow.

## Product Intent

CadenceFlow is a desktop-first harmonic composition studio designed to reduce harmonic writer's block.
It presents harmony as a stable spatial matrix, lets the user audition possible moves, explains
context-sensitive next-chord recommendations, and turns selected ideas into an editable musical
progression with piano-first performance shaping and export.

The core composition loop is:

1. Set harmonic context.
2. Explore the harmonic matrix.
3. Select/preview a chord without changing the saved progression.
4. See contextual Best Match and Alternative recommendations.
5. Hear and understand why a move is suggested.
6. Explicitly add a chord or temporary branch to the progression.
7. Shape that progression step independently.
8. Play, loop, reorder, branch, and refine.
9. Save the project or export it to external music workflows.

The progression is the primary musical object. The harmonic matrix is the navigation and composition
surface used to create and refine it, not a separate static theory reference.

## Product Principles

- Harmony, progression structure, timing, instrument realization, and export are separate model layers.
- Piano is the only fully implemented v1 instrument profile, but the harmonic engine and saved
  progression MUST remain instrument-independent.
- Major and Tonal Minor are equal first-class harmonic contexts in v1.
- v1 MUST expose two first-class harmonic modules built on the same Harmonic Engine: `Progressions`
  and `Dark Harmony`; modules are vocabulary/workflow lenses, not separate musical engines.
- In v1, harmonic module and Mode are coupled: `Progressions` selects Major, while `Dark Harmony`
  selects Tonal Minor. Switching modules therefore switches Mode automatically and applies the same
  safe Major ↔ Tonal Minor functional re-realization rules used elsewhere in the product.
- The Harmonic Matrix is a shared visual/interaction framework, not a fixed three-row data model.
  Each harmonic module defines its own topology: a central functional core plus its own independently
  visible functional layers. `Progressions` launches with Diatonic Core, Secondary Dominants, and
  Modal Interchange. `Dark Harmony` launches in v1 with a deliberately compact three-layer topology:
  Secondary Diminished, Tonal Minor Core, and Neapolitan / Chromatic Colors. The framework MUST allow
  Dark Harmony to expand later with additional layers such as Dominant Tension and Borrowed / Minor
  Colors without redesigning the Matrix. Matrix cards, orthogonal/Manhattan routing, Preview/Add
  semantics, recommendation highlighting, and Inspector behavior remain shared across modules.
- Matrix Chord Cards use an extensible `Card View` model rather than a literal two-sided front/back
  implementation. v1 includes a primary Harmonic view plus Piano and Staff visualization views; future
  Instrument Profiles may contribute additional views such as Guitar fretboard/chord-shape visualization
  without changing the Chord Card or Harmonic Engine model. Card Views can be switched per card or
  synchronized across all currently visible Matrix cards through a global view control.
- Preview/exploration MUST NOT mutate the saved progression unless the user explicitly commits.
- Repeated occurrences of the same chord MUST be independent progression-step objects.
- Harmonic recommendations MUST be explainable and advisory, never hard constraints.
- User expertise modes change explanation depth and information density, not harmonic capability.
- Musical duration is represented in relative musical time, not absolute seconds.
- MIDI, MusicXML, and future rendered audio are separate projections of the same internal semantic
  musical/performance model.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a progression from contextual harmonic guidance (Priority: P1)

As a composer, I want to explore harmonically meaningful next steps in context so that I can continue
writing without leaving the composition flow to consult a separate theory reference.

**Independent Test**: Starting with an empty project, the user can choose a tonic and harmonic module
(which establishes Major or Tonal Minor), preview a starting chord, follow recommendations, explicitly
add chords, and produce a playable four-step progression.

**Acceptance Scenarios**:

1. **Given** a selected tonic and active harmonic module, **When** the user selects a chord card, **Then**
   it is auditioned and becomes the active preview context without being added to My Progression.
2. **Given** an active preview context, **When** recommendations are calculated, **Then** the matrix
   identifies exactly one Best Match and zero to three musically strong Alternatives.
3. **Given** a recommendation, **When** the user inspects it, **Then** the Inspector explains why it is
   suggested at the explanation depth appropriate to Beginner, Composer, or Expert mode.
4. **Given** visible Matrix Chord Cards, **When** the user changes Card View globally, **Then** all visible
   cards switch to the selected supported view without changing harmonic identity, preview state, or
   progression contents; **When** the user changes one card individually afterward, **Then** only that card
   uses the individual override; **When** the same card is viewed as Piano or Staff, **Then** both views
   represent the same current preview realization and therefore the same realized pitches.
5. **Given** a selected chord card, **When** the user activates its explicit `+` action, **Then** a new
   independent Progression Step is created from the card's current/default preview settings.
6. **Given** a non-recommended but valid visible chord, **When** the user chooses it, **Then** CadenceFlow
   permits the choice and continues recommendations from the new context.

---

### User Story 2 - Explore multi-step what-if branches without damaging the progression (Priority: P1)

As a composer, I want to try an alternative harmonic path from any existing progression point so that
I can compare possibilities before committing them.

**Independent Test**: From the middle of an existing progression, the user can create a multi-step
temporary branch, compare Original versus Alternative, choose a rejoin point, and commit the whole
branch or selected branch steps without modifying the original before confirmation.

**Acceptance Scenarios**:

1. **Given** an existing progression, **When** the user starts exploration from any step, **Then** one
   active temporary branch is created without modifying the saved progression.
2. **Given** a temporary branch, **When** additional preview chords are selected, **Then** each preview
   step contributes to subsequent recommendation context.
3. **Given** a branch that starts before the end of the progression, **When** it is displayed, **Then**
   Original and Alternative paths are immediately distinguishable.
4. **Given** a branch with a selected rejoin point, **When** the whole branch is committed, **Then** only
   the intended original interval is replaced and the unchanged remainder is preserved.
5. **Given** a successful whole-branch commit, **When** the commit completes, **Then** the temporary
   branch clears and exploration continues from the new progression endpoint.
6. **Given** a temporary branch, **When** the user commits only selected branch steps, **Then** only
   those confirmed steps modify My Progression.

---

### User Story 3 - Shape repeated chord occurrences independently (Priority: P1)

As a composer, I want each occurrence of a chord to have its own realization and performance settings
so that repeated harmonic functions can play different roles in the phrase.

**Independent Test**: A progression can contain two occurrences of the same harmonic chord, such as
C, where the first is an upward arpeggio with one voicing and the second is a block chord with a
different voicing and dynamics; playback and export preserve the difference.

**Acceptance Scenarios**:

1. **Given** a matrix chord card with preview settings, **When** the user presses `+`, **Then** CadenceFlow
   copies those settings into a new independent Progression Step.
2. **Given** two steps referencing the same harmonic chord, **When** one step's voicing, bass,
   articulation, duration, dynamics, or chord variant changes, **Then** the other remains unchanged.
3. **Given** a step with manual piano voicing, **When** it is played or exported to MIDI, **Then** the
   exact saved pitches are used.
4. **Given** an existing Progression Step is selected, **When** the user ordinary-clicks a different Matrix
   chord, **Then** CadenceFlow previews that chord without modifying the selected step; replacing the
   selected step requires an explicit `Replace Step` action.
5. **Given** multiple Matrix Chord Cards contain explicit Preview/Add Template overrides, **When** the user
   invokes `Reset All Chord Cards to Defaults`, **Then** CadenceFlow MUST offer `Reset Current Module` and
   `Reset All Modules`; the selected scope returns to inherited project/instrument defaults in one undoable
   action without changing any existing Progression Step or cards outside the chosen scope.
6. **Given** a Matrix card for harmonic function `V` has explicit Preview/Add Template settings, **When** the
   project tonic changes from C Major to D Major, **Then** the card is re-realized from G to A while its explicit
   performance-template choices remain attached to `V`; automatic voicing and notation are recalculated for the
   new key.
7. **Given** the project/Piano default articulation or velocity changes, **When** Matrix cards resolve
   their Preview/Add Template settings, **Then** cards without an explicit override use the new default, cards
   with an explicit override keep their own value, and all existing My Progression Steps remain unchanged.
8. **Given** a Matrix Chord Card has one or more explicit Preview/Add Template overrides, **When** the
   Dashboard renders that card, **Then** the card shows a compact customized-state indicator near its settings
   control; the user can inspect which settings are overridden, see an override count, and invoke `Reset Card to
   Defaults` without opening or comparing every setting manually.
9. **Given** an existing My Progression chord step such as `Dm9` has customized performance settings, **When** the user
   invokes `Reset Step Performance`, **Then** CadenceFlow resets supported performance parameters to the current
   Project/Piano Defaults in one undoable action while preserving the step's harmonic chord/function, harmonic
   variant/extensions/tensions (`Dm9` remains `Dm9`), progression position, and musical duration.

---

### User Story 4 - Work in Major and practical Tonal Minor (Priority: P1)

As a composer, I want both Major and practical tonal Minor to be first-class contexts so that the same
workflow works for common tonal writing in either mode.

**Independent Test**: The user can create, transpose, switch, preview, branch, and export progressions
in Major and Tonal Minor without changing workspace architecture.

**Acceptance Scenarios**:

1. **Given** Major mode, **When** the user changes tonic, **Then** unambiguous progression steps
   transpose by harmonic function while retaining step-local performance settings.
2. **Given** Tonal Minor, **When** functional dominant resources are needed, **Then** typical
   harmonic-minor behaviors such as major/dominant V/V7 and leading-tone vii° to tonic are available.
3. **Given** an existing progression, **When** switching between `Progressions` and `Dark Harmony`
   changes Major ↔ Tonal Minor, **Then** unambiguous functions are re-realized in the new mode while
   order and step settings remain.
4. **Given** a non-diatonic or ambiguous mapping during mode switch, **When** no single safe mapping
   exists, **Then** CadenceFlow flags the step and proposes musically valid alternatives including
   keeping the original rather than silently guessing.

---

### User Story 4A - Switch between Progressions and Dark Harmony modules (Priority: P1)

As a composer, I want distinct harmonic modules for conventional major-centered progression writing
and darker/minor tension workflows so that I can change vocabulary and guidance without leaving the
same composition environment or duplicating the underlying progression model.

**Independent Test**: In the same project, the user can open `Progressions` or `Dark Harmony`, preview
and add chords from the active module, receive contextual recommendations, and return to the other
module without creating a separate project or losing the existing progression.

**Acceptance Scenarios**:

1. **Given** the `Progressions` module, **When** the matrix is shown, **Then** the launch vocabulary
   includes the Diatonic Core, Secondary Dominants, and Modal Interchange layers.
2. **Given** the `Dark Harmony` module, **When** the matrix is shown in v1, **Then** it uses the compact
   launch topology `Secondary Diminished` → `Tonal Minor Core` → `Neapolitan / Chromatic Colors`,
   covering practical Tonal/Harmonic Minor resources, Secondary Diminished relationships/chains, and
   Neapolitan harmony including Neapolitan-sixth realization where musically applicable, plus a small
   curated chromatic-color set consisting of common-tone diminished, chromatic passing diminished,
   and chromatic-mediant relationships suitable for progression writing. Secondary diminished remains
   a separate functional layer because its leading-tone/tonicization role is distinct from these color
   and voice-leading resources. The v1 set MUST remain deliberately bounded; advanced altered dominants
   and augmented-sixth harmony are deferred to later Dark Harmony expansion.
3. **Given** the `Secondary Diminished` layer in Dark Harmony, **When** the Harmonic Engine evaluates
   valid tonicization targets, **Then** it supports secondary diminished relationships for all
   harmonically meaningful target chords in the active Tonal Minor context. The default Matrix MUST
   keep a small stable curated baseline whose card positions do not change as recommendation context
   changes. Contextually relevant additional targets appear in an extra layer zone / expanded strip,
   while Best Match and Alternative states are shown by highlighting rather than by rearranging the
   baseline. Remaining valid targets stay accessible through an expanded layer view or Inspector rather
   than overcrowding the Matrix.
4. **Given** the `Tonal Minor Core` in Dark Harmony, **When** the core is rendered, **Then**
   the stable primary cards use the functional Tonal Minor realizations `i`, `ii°`, `III`, `iv`, `V/V7`,
   `VI`, and `vii°`. Natural-minor alternatives such as `v` and `VII` MUST remain available as secondary
   harmonic variants from the relevant core card and/or Inspector rather than as duplicate always-visible
   core cards, so users can access natural-minor color without overcrowding the stable Matrix topology.
5. **Given** an existing My Progression, **When** the user switches harmonic modules, **Then** the
   saved progression remains the same musical project and is not silently replaced or reset.
6. **Given** either harmonic module, **When** the user previews or adds a chord, **Then** both modules
   use the same Preview/Add, Progression Step, recommendation, timing, playback, voicing, and export
   architecture rather than module-specific duplicates.
7. **Given** `Progressions` is activated, **When** the module switch completes, **Then** the project Mode
   is Major and the matrix/recommendation vocabulary is realized in that Major context.
8. **Given** `Dark Harmony` is activated, **When** the module switch completes, **Then** the project Mode
   is Tonal Minor and the matrix/recommendation vocabulary is realized in that Tonal Minor context.
9. **Given** an existing progression, **When** switching modules changes Major ↔ Tonal Minor, **Then**
   unambiguous functional steps are re-realized automatically, while ambiguous/non-diatonic mappings
   are explicitly flagged with musically valid alternatives including keeping the original realization.
10. **Given** the user switches between `Progressions` and `Dark Harmony`, **When** each module is
   rendered, **Then** the matrix MAY expose a different number and arrangement of functional layers
   while preserving the same central-core-plus-layers interaction model.
11. **Given** any harmonic module, **When** its module-specific topology is rendered, **Then** chord cards,
   orthogonal/Manhattan connection routing, Preview/Add behavior, recommendation highlighting, and
   Inspector interaction remain visually and behaviorally consistent across modules.
12. **Given** the user has customized Matrix Preview/Add Templates in both `Progressions` and
   `Dark Harmony`, **When** the user switches between those modules, **Then** each module MUST restore
   its own previously saved card-template overrides without copying, merging, or remapping those overrides
   into the other module's different harmonic vocabulary.

---

### User Story 5 - Hear contextual piano voicing and control detailed performance (Priority: P1)

As a piano-focused user, I want automatic voice-leading plus optional exact note editing so that I can
work quickly but still control the actual pitches and dynamics when needed.

**Independent Test**: A multi-step progression receives musically reasonable contextual automatic
voicings; a user can manually change exact pitches, bass, register, and note-level velocity on one
step, and playback/visualization/MIDI preserve the result.

**Acceptance Scenarios**:

1. **Given** adjacent progression steps, **When** automatic piano voicing is generated, **Then** the
   engine considers neighboring steps, preserves common tones where appropriate, and avoids
   unnecessary register jumps rather than independently forcing every chord to root position.
2. **Given** a step, **When** the user selects register `Auto`, `-2`, `-1`, `0`, `+1`, or `+2`, **Then**
   the piano realization reflects the chosen register policy without changing harmonic function.
3. **Given** a step, **When** the Piano Voicing Editor is opened, **Then** the user can manually define
   exact pitches/octaves for that step.
4. **Given** a step bass setting, **When** `Auto`, `Root`, `3rd`, `5th`, or `Custom` plus bass octave
   `Auto`, `-1`, or `-2` is chosen, **Then** one independent lower bass voice is realized without
   forcing a restructuring of the upper voicing.
5. **Given** piano articulation, **When** the user chooses a supported articulation, **Then** one of
   `Block`, `Arp Up`, `Arp Down`, `Broken Chord`, or `Humanized` is used. `Strum` is not a piano v1
   articulation.
6. **Given** Master Velocity, **When** the user switches between musical dynamics and MIDI numeric
   representation, **Then** the exact underlying velocity value is preserved.
7. **Given** the Piano Voicing Editor, **When** a note-level override is set, **Then** that note may use
   a velocity different from Master Velocity without requiring every other note to store an override.
8. **Given** the dynamics preset control, **When** the user chooses `Balanced`, `Top Voice Emphasis`,
   `Bass Emphasis`, `Inner Voices Soft`, or `Humanized Dynamics`, **Then** CadenceFlow applies a useful
   starting distribution that remains manually editable per note.

---

### User Story 6 - Build musical timing without becoming a piano roll (Priority: P1)

As a composer, I want bars, beats, subdivisions, rests, meter, groove, and loop playback so that the
progression has useful musical phrasing without requiring full DAW-style note editing.

**Independent Test**: The user can configure global tempo/meter, create chord and Rest Steps with
musical durations including subdivisions, enable swing, use metronome/count-in, loop a selected range,
and hear/export timing consistently.

**Acceptance Scenarios**:

1. **Given** a project, **When** Tempo changes, **Then** real playback time changes globally while each
   step's musical duration remains unchanged.
2. **Given** an existing progression, **When** Time Signature changes, **Then** CadenceFlow offers
   `Reflow to new meter` or `Preserve beat lengths`; it does not preserve absolute seconds.
3. **Given** a custom meter such as 7/8, **When** the project uses grouping 2+2+3, **Then** metronome and
   count-in accent that grouping without changing bar length.
4. **Given** a Rest Step, **When** playback reaches it, **Then** it consumes its musical duration but
   does not become a new harmonic recommendation center.
5. **Given** a selected contiguous progression range, **When** Loop is enabled for that region, **Then**
   only that region repeats; clearing the region restores whole-progression looping.
6. **Given** Count-in enabled, **When** playback starts, **Then** one full bar in the current meter and
   tempo sounds before progression playback by default.
7. **Given** Swing enabled, **When** subdivisions are played, **Then** the configured groove amount
   modifies performance timing without rewriting the semantic step durations.
8. **Given** a progression with multiple steps, **When** the user presses the primary `Play` control,
   **Then** playback starts from the beginning; **When** the user selects a later Progression Step and
   invokes `Play From Here`, **Then** playback starts from that selected step while preserving all
   downstream timing, loop, metronome, and count-in behavior.
9. **Given** active playback, **When** the user presses `Pause`, **Then** playback stops at the current
   musical position; **When** the user resumes, **Then** playback continues from that paused position.
   **When** the user presses `Stop`, **Then** playback terminates and the playhead resets to the start of
   the full progression or to the start of the active loop region when one is explicitly selected.
10. **Given** a progression containing multi-beat or multi-bar steps, **When** the user wants to start
    playback from another location, **Then** the selectable start positions are Progression Step/Rest Step
    boundaries via step selection and `Play From Here`; v1 does not provide free seek/scrub to an arbitrary
    beat, subdivision, or millisecond inside a step.

---

### User Story 7 - Use functional presets as reusable composition material (Priority: P2)

As a composer, I want presets to represent transferable harmonic templates rather than fixed chord
names so that they work in different keys and modes.

**Independent Test**: A functional preset containing harmonic functions and durations can be applied
in different Key/Mode contexts and can replace, append to, or insert into an existing progression.

**Acceptance Scenarios**:

1. **Given** a preset such as `I → vi → IV → V`, **When** it is applied in a different tonic, **Then**
   the chords are realized from the same functions in the current Key/Mode.
2. **Given** a non-empty progression, **When** a preset is applied, **Then** CadenceFlow explicitly
   offers `Replace Progression`, `Append to End`, or `Insert at Selected Step`.
3. **Given** a preset, **When** it is stored, **Then** it may contain harmonic functions and per-step
   musical durations but not voicing, articulation, bass, dynamics, or note-level velocity.
4. **Given** a current progression, **When** the user saves it as Custom Preset, **Then** the functional
   identities and durations are stored for reuse in another Key/Mode.

---

### User Story 8 - Save and reopen complete work safely (Priority: P2)

As a user, I want named projects, autosave, recovery, and a portable CadenceFlow project file so that
my work survives sessions and can be backed up or moved between computers.

**Independent Test**: The user can create a named project, close and reopen the application, recover
the last autosaved state including an uncommitted temporary branch, and export/open a portable
`.cadenceflow` project without losing supported project data.

**Acceptance Scenarios**:

1. **Given** an edited project, **When** autosave runs, **Then** the current project state is persisted
   without requiring manual export.
2. **Given** a project containing an uncommitted temporary branch, **When** the application restarts,
   **Then** the branch is restored without being silently committed or discarded.
3. **Given** a project, **When** the user chooses `Save Project As` / project export, **Then** a portable
   CadenceFlow project file is produced that can later be opened with the supported project state intact.
4. **Given** a reopened project, **When** editing resumes, **Then** Undo/Redo starts with a fresh
   session-scoped history rather than restoring the previous session's undo stack.

---

### User Story 9 - Transfer the composition to notation and DAW workflows (Priority: P2)

As a composer, I want both MIDI and MusicXML export so that the same CadenceFlow project can continue
in performance-oriented and notation-oriented tools.

**Independent Test**: The same acceptance progression can be exported to MIDI and MusicXML; an
independent MIDI application reproduces supported performance timing/pitches/velocity, while an
independent notation application preserves representable notation semantics.

**Acceptance Scenarios**:

1. **Given** a non-empty progression, **When** MIDI export is requested, **Then** order, exact supported
   pitches, rests, timing, velocity, and supported performance details are preserved consistently with
   CadenceFlow playback.
2. **Given** a non-empty progression, **When** MusicXML export is requested, **Then** representable
   pitches, spelling, durations, harmony, Key/Mode, meter, tempo, dynamics, and rests are represented
   semantically where the format supports them.
3. **Given** a CadenceFlow-specific semantic with no exact MusicXML representation, **When** export is
   generated, **Then** the exporter uses an explicit documented mapping or omits that unsupported
   semantic rather than silently changing harmony.
4. **Given** an empty progression, **When** export is requested, **Then** CadenceFlow explains that
   musical content is required instead of producing an unusable file.

---

### User Story 10 - Work in one focused wide desktop studio (Priority: P2)

As a desktop musician, I want the harmonic map, Inspector, piano/progression console, playback controls,
and project context in one coherent wide workspace so that the composition loop does not fragment into
unrelated screens.

**Independent Test**: At supported desktop sizes, the primary harmonic matrix remains legible and the
user can access progression, Inspector, piano visualization, playback, project controls, and theme/
expertise controls without page-level horizontal scrolling.

## Edge Cases

- A requested harmonic recommendation has fewer than three strong Alternatives.
- A mode switch creates one or more ambiguous functional mappings.
- A temporary branch starts mid-progression and its intended rejoin point is before, at, or after the
  replaced interval boundary.
- The same chord appears multiple times with different manual voicings and velocity overrides.
- A manually defined upper voicing would overlap or cross the independent bass voice.
- A custom meter has a numerator for which multiple groupings are plausible.
- Time Signature changes after steps with bars, beats, dotted values, and tuplets already exist.
- Swing is enabled for material containing both straight and triplet semantic durations.
- A Rest Step occurs between two harmonically related chords.
- A preset uses a function that cannot be realized unambiguously in the current mode.
- A portable project was created by a compatible but different CadenceFlow version.
- MusicXML cannot represent a CadenceFlow-specific performance or recommendation semantic exactly.
- MIDI export encounters a feature that has no direct standard MIDI representation.
- Autosave occurs while a temporary branch is active.
- Undo is requested immediately after a branch commit, key/mode change, preset insertion, or meter
  transformation.

## Requirements *(mandatory)*

### Functional Requirements

#### Harmonic context and matrix

- **FR-001**: The product MUST support chromatic tonic selection.
- **FR-002**: Major and Tonal Minor MUST be equal first-class v1 harmonic contexts; in v1 they are
  exposed through the mode-bound `Progressions` and `Dark Harmony` modules rather than as an independent
  Mode selector.
- **FR-003**: v1 Minor MUST use a unified practical **Tonal Minor** model: natural minor is the baseline,
  while typical functional harmonic-minor resources such as major/dominant V/V7 and leading-tone vii°
  to tonic are available without separate Natural/Harmonic/Melodic minor mode switches.
- **FR-004**: The `Progressions` module Matrix MUST include the stable launch layers `Diatonic Core`,
  `Secondary Dominants`, and `Modal Interchange`.
- **FR-005**: Harmonic-layer architecture MUST allow future functional layers to be added and shown or
  hidden independently without redesigning the matrix or progression model.
- **FR-006**: The matrix MUST preserve stable functional spatial meaning when tonic changes.
- **FR-007**: Connection routing SHOULD use clear orthogonal/Manhattan-style paths and MUST avoid
  unnecessary diagonal visual clutter that obscures chord cards or primary paths.
- **FR-008**: Changing tonic MUST transpose unambiguous saved progression steps by harmonic function
  while preserving their order, durations, and step-local performance settings.
- **FR-009**: Changing Major ↔ Tonal Minor MUST re-realize unambiguous saved functions in the new mode.
- **FR-010**: Ambiguous/non-diatonic mode-switch mappings MUST NOT be silently guessed; CadenceFlow MUST
  flag them and offer musically valid alternatives including keeping the original realization.

#### Enharmonic spelling

- **FR-011**: Pitch identity MUST be stored separately from notation spelling where necessary.
- **FR-012**: Default note/chord spelling MUST be selected automatically from the current Key/Mode.
- **FR-013**: v1 MUST NOT expose a global `Prefer Sharps / Prefer Flats` project preference.
- **FR-014**: Users MUST be able to apply a targeted manual enharmonic spelling override to a specific
  supported note/chord where musically desired.
- **FR-015**: MusicXML export MUST preserve the selected notation spelling rather than reducing all
  notes to pitch-class-only names.

#### Preview, explicit add, and temporary branches

- **FR-016**: Ordinary chord-card selection MUST preview/audition the chord and establish temporary
  recommendation context without adding it to My Progression.
- **FR-017**: A chord card MUST expose an explicit `+` action for fast Add to My Progression.
- **FR-018**: Preview exploration MUST support a multi-step temporary branch.
- **FR-019**: Each temporary branch step MUST influence recommendation context for the next preview.
- **FR-020**: Only one temporary branch needs to be active at a time in v1.
- **FR-021**: A temporary branch MUST be able to start from the end or from any existing Progression Step.
- **FR-022**: Mid-progression branching MUST show Original versus Alternative without modifying the
  original until explicit confirmation.
- **FR-023**: A temporary branch MUST support an explicit rejoin point in the original progression.
- **FR-024**: Users MUST be able to commit the entire temporary branch or selected branch steps.
- **FR-025**: After successful whole-branch commit, the active temporary branch MUST clear and
  exploration MUST restart from the resulting progression endpoint.

#### Recommendation engine and Composition Intent

- **FR-026**: Recommendations MUST use current Key, Mode, prior progression/path context, and the current
  or preview chord rather than only a stateless current-chord lookup.
- **FR-027**: Recommendation ranking MUST identify exactly one Best Match when at least one valid
  recommendation exists and MUST show at most three Alternatives.
- **FR-028**: The engine MUST NOT fill Alternative slots with weak choices merely to reach three.
- **FR-029**: Recommendations MUST remain advisory; all otherwise valid visible harmonic choices remain
  selectable.
- **FR-030**: Optional Composition Intent MUST support at least the product intents `Resolve`,
  `Build Tension`, `Darken/Emotional`, `Surprise`, and `Smooth Voice Leading`, with a neutral default.
- **FR-031**: Composition Intent MUST apply to the current exploration/temporary branch rather than
  becoming a persistent property of committed Progression Steps.
- **FR-032**: Composition Intent MUST influence recommendation ranking without hiding harmonic options.
- **FR-033**: The matrix MUST show concise visual Best Match/Alternative status while detailed rationale
  appears in the Inspector rather than permanently cluttering chord cards.
- **FR-034**: Recommendation explanations MUST adapt to presentation mode: accessible language in
  Beginner, functional/compositional terminology in Composer, and denser functional/voice-leading
  rationale in Expert.
- **FR-035**: Supported chord variants/tensions MUST contribute secondary contextual evidence to
  recommendation ranking where musically meaningful, while base harmonic function remains primary.
- **FR-036**: Recommendation explanation SHOULD distinguish reasoning caused by base function from
  reasoning caused by a specific extension/tension such as dominant alteration or suspension tendency.

#### Harmonic modules

- **FR-037**: v1 MUST provide two first-class harmonic modules: `Progressions` and `Dark Harmony`.
- **FR-038**: Harmonic modules MUST share the same Harmonic Engine, Harmonic Context, Progression Step
  model, Preview/Add semantics, Smart Recommendation Engine, playback, persistence, and export model.
- **FR-039**: `Progressions` MUST provide the launch major-harmony vocabulary through Diatonic Core,
  Secondary Dominants, and Modal Interchange functional layers.
- **FR-040**: `Dark Harmony` MUST launch in v1 with a compact three-layer topology consisting of
  `Secondary Diminished`, `Tonal Minor Core`, and `Neapolitan / Chromatic Colors`. This vocabulary MUST
  cover practical Tonal/Harmonic Minor resources, Secondary Diminished relationships/chains, and
  Neapolitan harmony including Neapolitan-sixth realization where musically valid, plus a bounded curated
  chromatic-color set consisting of common-tone diminished, chromatic passing diminished, and
  chromatic-mediant relationships. Secondary diminished MUST remain a separate functional layer because
  its leading-tone/tonicization role is distinct from these color and voice-leading resources. The v1 set
  MUST NOT implicitly absorb deferred advanced altered-dominant or augmented-sixth vocabularies.
- **FR-041**: The Dark Harmony Harmonic Engine MUST support secondary diminished relationships for all
  harmonically meaningful target chords in the active Tonal Minor context. The default Matrix MUST keep
  a small stable curated baseline visible consisting of `vii°7/V`, `vii°7/iv`, and `vii°7/VI`. Other supported
  targets such as `vii°7/III`, `vii°7/VII`, and other contextually valid functions MUST remain eligible for
  contextual promotion into the expanded strip. Baseline cards MUST preserve stable positions and MUST NOT be
  displaced, reordered, or spatially shuffled by contextual recommendation changes. Additional supported
  secondary-diminished targets that become especially relevant to the current saved progression, active
  preview, or temporary branch MUST appear in an additional layer zone / expanded strip rather than
  replacing baseline cards. Best Match and Alternative status MUST be expressed through highlighting, not
  by moving the stable baseline cards. The Matrix MUST NOT fabricate weak candidates merely to fill space;
  all remaining supported targets MUST remain discoverable through an expanded layer view or Inspector
  without changing the underlying harmonic model. This behavior MUST preserve user spatial memory and
  orthogonal/Manhattan routing stability.
- **FR-042**: The `Tonal Minor Core` MUST keep a compact stable primary realization of
  `i`, `ii°`, `III`, `iv`, `V/V7`, `VI`, and `vii°`, using the practical Tonal Minor model in which
  harmonic-minor dominant and leading-tone resources are first-class functional defaults. Natural-minor
  alternatives such as `v` and `VII` MUST remain available as secondary variants from the relevant core
  card and/or Inspector rather than occupying duplicate always-visible core cards. Selecting such a
  variant MUST preserve the step's harmonic-function identity where musically valid while changing the
  realized chord color explicitly.
- **FR-043**: Switching between `Progressions` and `Dark Harmony` MUST NOT silently clear, replace, or
  duplicate My Progression.
- **FR-044**: In v1, activating `Progressions` MUST set Mode to Major; activating `Dark Harmony` MUST
  set Mode to Tonal Minor. Module and Mode MUST NOT be independently selectable in v1.
- **FR-045**: When a module switch changes Mode, CadenceFlow MUST preserve progression order and
  step-local performance settings while re-realizing harmonic functions for the destination Mode.
- **FR-046**: Ambiguous or non-diatonic mappings during module-driven Major ↔ Tonal Minor conversion
  MUST NOT be guessed silently; CadenceFlow MUST flag them and offer musically valid alternatives,
  including keeping the original realization.
- **FR-047**: The Harmonic Matrix MUST be modeled as a reusable module-driven topology framework rather
  than as a fixed three-layer grid. Each harmonic module MUST be able to define its own central core,
  number of functional layers, layer ordering, and independently showable/hideable layer set.
- **FR-048**: Module-specific topology MUST NOT fork core interaction behavior: chord-card semantics,
  orthogonal/Manhattan routing, Preview/Add, Best Match/Alternative highlighting, and Inspector behavior
  MUST remain shared and consistent across harmonic modules.
- **FR-049**: `Progressions` MUST retain its launch topology of Diatonic Core, Secondary Dominants, and
  Modal Interchange; `Dark Harmony` MUST use its own compact v1 topology rather than being forced into
  the Progressions rows.
- **FR-050**: The Dark Harmony topology MUST be extensible so future releases can add layers such as
  `Dominant Tension` and `Borrowed / Minor Colors` without redesigning the Matrix, Harmonic Engine,
  saved progression model, or shared module interactions.
- **FR-051**: The module architecture MUST permit future modules such as `Scales` and `Blues` without
  redesigning the Harmonic Engine or instrument-independent saved progression model.
- **FR-052**: `Scales` and `Blues` are NOT implemented v1 modules; they MUST remain deferred while the
  architecture preserves a path for future instrument-aware presentation such as Guitar fretboard
  visualization.

#### Presentation modes

- **FR-053**: v1 MUST provide switchable `Beginner`, `Composer`, and `Expert` presentation modes.
- **FR-054**: Presentation modes MUST change explanation depth, terminology, and information density
  only; they MUST NOT remove harmonic functions or progression capabilities.
- **FR-055**: Switching presentation mode MUST NOT mutate the saved progression.
- **FR-056**: Matrix Chord Cards MUST support an extensible `Card View` abstraction rather than a
  hard-coded two-face front/back implementation.
- **FR-057**: v1 MUST provide at least three Card Views where musically applicable: `Harmonic`, `Piano`,
  and `Staff`.
- **FR-058**: The `Harmonic` Card View MUST present the chord/function identity and the normal Matrix
  navigation/recommendation state.
- **FR-059**: The `Piano` Card View MUST visualize the current preview realization on a keyboard
  representation, including the exact realized pitches and scale-degree context where available; it MUST
  NOT fall back to an unrelated root-position representation when a different preview voicing is active.
- **FR-060**: The `Staff` Card View MUST visualize the same current preview realization shown by the
  `Piano` Card View, using the same exact realized pitches, enharmonic spelling, and pitch semantics used
  by MusicXML export; it MUST NOT maintain an independent contradictory pitch model.
- **FR-061**: The user MUST be able to change Card View for one Matrix card independently.
- **FR-062**: The Matrix MUST provide a global Card View control that switches all currently visible
  cards to one supported view in one action. A subsequent per-card change MAY override the global view
  for that card without changing other cards.
- **FR-063**: Changing Card View MUST be presentational only and MUST NOT mutate harmonic identity,
  recommendation ranking, preview context, Chord Card defaults, Progression Steps, or Temporary Branches.
- **FR-064**: Card View availability MUST be capability-driven. Future Instrument Profiles MAY register
  additional views (for example Guitar fretboard/chord-shape visualization) without redesigning the
  shared Chord Card model; unavailable instrument-specific views MUST NOT be exposed as functional
  controls.
- **FR-065**: All non-Harmonic Card Views for the same Chord Card MUST be projections of one shared
  current preview realization. Changing inversion, register, harmonic variant, automatic/manual voicing,
  or another realization-affecting preview setting MUST update every applicable Card View consistently;
  Card Views MUST NOT own separate musical state.
- **FR-066**: My Progression chord steps MUST support the same extensible Card View concept where
  musically applicable, including `Harmonic`, `Piano`, and `Staff` in v1 and future instrument-specific
  views registered by Instrument Profiles.
- **FR-067**: A Progression Step Card View MUST project that step's own independent saved realization
  and performance state, including its harmonic variant, exact/manual voicing where present, register,
  bass, dynamics, and notation spelling; it MUST NOT read mutable preview settings from the Matrix card
  from which the step was originally added.
- **FR-068**: My Progression MUST support both per-step Card View selection and a progression-level
  Card View control that switches all visible chord steps to one supported view without mutating their
  musical state.

#### Chord variants and progression-step object model

- **FR-069**: A Matrix Chord Card MUST store current/default preview settings used for audition and the
  next explicit Add.
- **FR-070**: Matrix Chord Card settings MUST be modeled as project-local `Preview/Add Template` state,
  separate from immutable Chord Definition data and separate from every Progression Step occurrence.
- **FR-071**: Editing a Matrix card through the card or Inspector MUST affect only that card's Preview/Add
  Template and subsequent audition/explicit Add behavior; it MUST NOT retroactively mutate existing
  Progression Steps.
- **FR-072**: A Matrix Preview/Add Template MAY retain explicit user choices such as harmonic variant,
  duration default, articulation, register preference, bass preference, dynamics, and supported manual
  preview overrides. Context-derived automatic realization (including exact auto-voiced pitches) MUST be
  recalculated from the current harmonic path/context rather than persisted as stale fixed pitches.
- **FR-073**: When a Matrix card has no explicit per-card override for a supported setting, its Preview/Add
  Template MUST inherit the current project/instrument default for that setting.
- **FR-074**: The user MUST be able to reset an individual Matrix card's Preview/Add Template to inherited
  defaults with one explicit `Reset Card to Defaults` action, without manually restoring each setting and
  without affecting Chord Definition data or any existing Progression Step. The reset action MUST be readily
  accessible from the card and/or its Inspector, MUST clearly indicate which card will be reset, and MUST
  restore all explicit per-card overrides (including harmonic variant, duration default, articulation, register,
  bass, dynamics, and supported manual preview overrides) to inherited project/instrument defaults.
- **FR-075**: Matrix card Preview/Add Template overrides MUST persist after pressing `+`; adding a chord to
  My Progression MUST NOT implicitly reset that Matrix card. The retained template remains active for later
  preview/add actions until the user edits it or explicitly resets it.
- **FR-076**: Each Matrix card MUST expose a settings control (gear). A normal activation opens the card
  settings/Inspector, while `Ctrl+Click` on Windows/Linux and `Cmd+Click` on macOS SHOULD provide a
  discoverable power-user shortcut for `Reset Card to Defaults`. The same reset MUST also remain available
  as a visible menu/action so the shortcut is never the only way to discover or invoke it. Tooltips/help text
  SHOULD advertise the shortcut.
- **FR-077**: `Reset Card to Defaults` MUST participate in the normal session-scoped Undo/Redo history so
  an accidental shortcut reset can be immediately undone without a confirmation dialog.
- **FR-078**: The Dashboard/Matrix MUST expose an explicit `Reset All Chord Cards to Defaults` command.
  Before execution, the command MUST offer two explicit scopes: `Reset Current Module`, which clears only
  Preview/Add Template overrides belonging to the currently active harmonic module, and `Reset All Modules`,
  which clears Preview/Add Template overrides across all harmonic modules in the current project. Both scopes
  MUST restore inherited project/instrument defaults without modifying Chord Definition data or any existing
  Progression Step. The command MUST be visible in a global menu/settings surface rather than depending on a
  hidden shortcut, MUST clearly identify the selected scope, and MUST participate in the normal session-scoped
  Undo/Redo history so the bulk reset can be reverted immediately.
- **FR-079**: Matrix Card Preview/Add Template overrides MUST be keyed to harmonic identity/function rather than
  the current absolute chord spelling. When tonic changes within the same module/mode, explicit per-card settings
  such as harmonic variant, duration default, articulation, register preference, bass preference, dynamics, and
  supported manual preview overrides MUST follow the corresponding harmonic function into the new key. The chord
  spelling and context-derived automatic voicing MUST be re-realized for the destination key so no stale prior-key
  labels or fixed auto-voiced pitches are retained.
- **FR-080**: Matrix Preview/Add Template state MUST be stored independently per harmonic module.
  `Progressions` and `Dark Harmony` MUST preserve and restore their own per-card template overrides when the
  user switches modules. CadenceFlow MUST NOT automatically copy, merge, or infer mappings for template
  overrides across modules whose topology and harmonic vocabulary differ. Module-specific template state MUST
  remain part of the project/autosave state and MUST be affected only by the explicit reset scope selected by
  the user (`Reset Current Module` or `Reset All Modules`).
- **FR-081**: Project/Piano Defaults MUST act as inherited values only. When a project/instrument default
  changes, every Matrix Preview/Add Template that does not have an explicit override for that setting MUST
  immediately resolve to the new default, while Matrix cards with an explicit per-card override MUST retain
  that override. Existing My Progression Steps MUST NOT be retroactively changed by later default changes,
  regardless of whether those steps were originally created from inherited defaults or explicit card overrides.
- **FR-082**: A Matrix Chord Card with one or more explicit Preview/Add Template overrides MUST expose a
  compact visible customized-state indicator adjacent to or integrated with its settings control. The indicator
  MUST distinguish customized cards from cards fully inheriting defaults without requiring the settings panel to
  be opened. Hover/focus details SHOULD show a concise status such as `Customized · N overrides`; the Inspector
  MUST identify which supported settings are currently overridden and MUST provide direct access to `Reset Card
  to Defaults`. The indicator is presentational state derived from template overrides and MUST NOT itself mutate
  harmonic or performance data.
- **FR-083**: Each chord-based My Progression Step MUST expose a one-action `Reset Step Performance` command.
  The command MUST reset supported performance parameters such as voicing/manual voicing, bass, articulation,
  dynamics/velocity, register, and other instrument-performance settings to the current Project/Piano Defaults,
  while preserving the step's harmonic chord/function, harmonic variant/extensions/tensions, progression position,
  and musical duration. The reset MUST change only how the chord is performed, not what harmonic object the step
  represents; for example, `Dm9` MUST remain `Dm9` rather than reverting to base `Dm`. The reset MUST NOT delete
  or replace the step, MUST NOT alter neighboring steps, and MUST participate in the normal session-scoped Undo/Redo
  history.
- **FR-084**: Pressing `+` MUST create a new independent Progression Step by copying relevant current
  Chord Card preview/default settings.
- **FR-085**: After insertion, each Progression Step MUST own independent supported chord/performance
  settings, including when multiple steps reference the same base chord.
- **FR-086**: Harmonic chord identity MUST be represented separately from its concrete step occurrence.
- **FR-087**: Supported chord extensions/tensions MUST use structured configuration rather than only a
  fixed list of precomposed chord labels or an unrestricted arbitrary pitch-set builder.
- **FR-088**: The structured chord-variant model SHOULD support musically relevant controls such as
  7th, maj7, 9th, 11th, 13th, add9, sus2, and sus4 where valid for the chord/ruleset.
- **FR-089**: The system MUST reject or explain incompatible harmonic-variant combinations rather than
  silently generating an invalid/contradictory chord label.
- **FR-090**: Adding a supported extension/tension MUST preserve base harmonic function when the
  modification does not materially change that function.
- **FR-091**: My Progression MUST support drag-and-drop reordering.
- **FR-092**: Reordering MUST move the complete Progression Step object with all step-local settings and
  MUST immediately recalculate playback path and contextual recommendations.
- **FR-093**: Users MUST be able to add, remove, select, and edit Progression Steps without mutating
  unrelated steps.
- **FR-094**: When an existing Progression Step is selected, ordinary Matrix chord selection MUST remain
  non-destructive Preview. Replacing that step with another chord MUST require a distinct explicit
  `Replace Step` command.

#### Timing, Rest Steps, meter, and groove

- **FR-095**: Each project MUST have one global Tempo (BPM) in v1.
- **FR-096**: v1 MUST NOT contain tempo-change events or per-step tempo overrides.
- **FR-097**: Tempo changes MUST alter real playback time globally while preserving each step's musical
  duration.
- **FR-098**: Each project MUST have one global Time Signature in v1.
- **FR-099**: v1 MUST NOT contain meter-change events inside the progression.
- **FR-100**: Common Time Signature presets MUST include at least `4/4`, `3/4`, `2/4`, and `6/8`, and
  the project MUST support valid custom meters such as `5/4`, `7/8`, or `9/8`.
- **FR-101**: Meter representation MUST support beat grouping for asymmetric/compound meters, for
  example `7/8 = 2+2+3`, with a reasonable suggested default and user-editable grouping.
- **FR-102**: Beat grouping MUST affect metronome/count-in accent structure but MUST NOT change the
  semantic length of the bar.
- **FR-103**: A Progression Step duration MUST use relative musical time (bars/beats/subdivisions), not
  the prototype's mixed fraction/meter semantics and not absolute seconds.
- **FR-104**: v1 duration representation MUST support bars, beats, fractional beat subdivisions,
  dotted values, and triplet subdivisions.
- **FR-105**: Playback, loop, presets, MIDI export, and MusicXML export MUST consume the same exact
  semantic duration model.
- **FR-106**: When Time Signature changes after progression content exists, CadenceFlow MUST offer:
  `Reflow to new meter` (default; one bar remains one bar) and `Preserve beat lengths` (existing beat
  counts remain constant). It MUST NOT preserve absolute seconds as the meter-change strategy.
- **FR-107**: v1 MUST support a dedicated `Rest Step` with musical duration.
- **FR-108**: A Rest Step MUST consume playback/export time but MUST NOT become a new harmonic center;
  recommendation context after the rest continues from the last sounding harmonic step.
- **FR-109**: Project Groove Feel MUST support at least `Straight` and `Swing`.
- **FR-110**: Swing MUST expose a user-adjustable amount/intensity.
- **FR-111**: Swing MUST be modeled as a performance-timing transformation and MUST NOT rewrite the
  stored semantic durations of Progression Steps.
- **FR-112**: MIDI export MUST be capable of reflecting the actual supported swung playback timing.
- **FR-113**: MusicXML export MUST represent swing/groove only where a correct supported notation
  mapping exists; unsupported groove semantics MUST NOT silently alter written durations.

#### Playback, loop, metronome, and count-in

- **FR-114**: Users MUST be able to preview an individual chord or configured step.
- **FR-115**: v1 MUST provide distinct `Play/Pause` and `Stop` transport behavior for progression
  playback.
- **FR-116**: The primary `Play` action MUST start playback from the beginning of the progression when
  playback is stopped.
- **FR-117**: When a Progression Step is selected, users MUST be able to invoke `Play From Here`;
  playback MUST begin at that selected step without modifying the progression itself.
- **FR-118**: `Pause` MUST suspend playback at the current musical position without resetting the
  playhead; `Resume` MUST continue from that paused position.
- **FR-119**: `Stop` MUST terminate playback and reset the playhead to the beginning of the progression,
  or to the beginning of the active loop region when an explicit loop region is selected.
- **FR-120**: User-directed playback positioning in v1 MUST be step-based: users may select a
  Progression Step or Rest Step and start from that step boundary, but the UI MUST NOT expose free
  seek/scrub to arbitrary positions inside a step. Internal playback MAY track sub-step musical position
  as required for Pause/Resume and accurate timing.
- **FR-121**: Sequential playback MUST honor step-local pitch realization, articulation, bass,
  dynamics, Rest Steps, duration, and project timing/groove settings.
- **FR-122**: Loop MUST default to the whole progression when no explicit loop region is selected.
- **FR-123**: Users MUST be able to select one contiguous range of Progression Steps as the active loop
  region and visually identify that region.
- **FR-124**: Clearing the explicit loop region MUST restore whole-progression loop behavior.
- **FR-125**: During playback, the product MUST visually identify the current step and traversal through
  the harmonic map without obscuring chord identity.
- **FR-126**: v1 MUST provide an independently switchable metronome.
- **FR-127**: v1 MUST provide an optional Count-in before progression playback.
- **FR-128**: Count-in MUST default to one complete bar in the current Time Signature and Tempo.
- **FR-129**: Metronome and Count-in MUST use the project's beat grouping/accent structure.

#### Piano instrument profile, voicing, bass, articulation, and dynamics

- **FR-130**: Piano MUST be the only fully implemented v1 instrument profile.
- **FR-131**: Harmonic Engine, Progression, timing, and saved project semantics MUST be separated from
  Instrument Profile implementation.
- **FR-132**: The architecture MUST allow future Guitar, Ukulele, Melodica, and other Instrument
  Profiles without redefining saved progression harmonic content.
- **FR-133**: Piano automatic voicing MUST be contextual and voice-leading aware, considering adjacent
  steps, preserving common tones where appropriate, and avoiding unnecessary jumps.
- **FR-134**: Each piano Progression Step MUST support register control `Auto`, `-2`, `-1`, `0`, `+1`,
  `+2` octaves.
- **FR-135**: `Auto` register MUST allow the voice-leading engine to choose a musically suitable register;
  a numeric offset MUST shift the realization without changing harmonic function.
- **FR-136**: The Piano Voicing Editor MUST allow manual editing of exact pitches/octaves for a specific
  Progression Step.
- **FR-137**: Manual voicing MUST remain step-local and MUST be used consistently by playback, piano
  visualization, and MIDI export.
- **FR-138**: Piano bass control MUST support `Auto`, `Root`, `3rd`, `5th`, and `Custom` plus bass octave
  `Auto`, `-1`, and `-2`.
- **FR-139**: v1 bass MUST be one independent lower voice/anchor per Progression Step rather than an
  intra-step bass pattern.
- **FR-140**: Bass configuration MUST NOT change harmonic function, step duration, articulation, or
  progression position.
- **FR-141**: Piano articulation MUST support `Block`, `Arp Up`, `Arp Down`, `Broken Chord`, and
  `Humanized`; `Strum` MUST be reserved for appropriate future string-instrument profiles.
- **FR-142**: Dynamics MUST have one exact numeric MIDI velocity source of truth in the supported range
  1–127 while allowing both musical labels (`pp`, `p`, `mp`, `mf`, `f`, `ff`) and numeric UI views.
- **FR-143**: Switching between musical and numeric dynamics views MUST NOT discard the exact numeric
  velocity value.
- **FR-144**: Each Progression Step MUST have Master Velocity plus optional per-note velocity overrides
  in the Piano Voicing Editor.
- **FR-145**: Notes without an override MUST inherit Master Velocity.
- **FR-146**: Piano dynamics presets MUST include `Balanced`, `Top Voice Emphasis`, `Bass Emphasis`,
  `Inner Voices Soft`, and `Humanized Dynamics`.
- **FR-147**: Applying a dynamics preset MUST create editable starting values; subsequent per-note
  manual edits MUST remain possible.

#### Presets

- **FR-148**: Presets MUST be functional harmonic templates rather than fixed absolute chord-name lists.
- **FR-149**: Presets MUST realize their functions through the current Key/Mode rules, including Tonal
  Minor and current enharmonic spelling.
- **FR-150**: A Preset MUST store harmonic functions plus per-step musical durations.
- **FR-151**: A Preset MUST NOT store step voicing, articulation, bass, dynamics, or note-level velocity;
  those are supplied from current defaults/Instrument Profile when instantiated.
- **FR-152**: Applying a Preset to a non-empty progression MUST explicitly offer `Replace Progression`,
  `Append to End`, and `Insert at Selected Step`.
- **FR-153**: Users MUST be able to save the current progression as a Custom Preset using functional
  identities and durations for later reuse in another Key/Mode.

#### Project persistence and portable project files

- **FR-154**: v1 MUST support multiple named projects.
- **FR-155**: Project persistence MUST save the musical/harmonic context, global timing/groove settings,
  progression, Rest Steps, step-local realization/performance settings, active temporary branch,
  relevant project UI state, and supported user presentation preferences needed to resume work.
- **FR-156**: CadenceFlow MUST autosave project changes and restore the most recent supported state after
  reopening the application/project.
- **FR-157**: An active uncommitted temporary branch MUST be restored as temporary; recovery MUST NOT
  silently commit or discard it.
- **FR-158**: v1 MUST support a portable CadenceFlow project file (working extension `.cadenceflow`) for
  Save Project As/Open/backup/transfer workflows.
- **FR-159**: Opening a supported portable project file MUST restore the complete supported project
  semantics without requiring reconstruction from MIDI or MusicXML.

#### Undo / Redo

- **FR-160**: v1 MUST provide Undo and Redo for project-mutating editing actions, including progression
  add/remove/reorder, branch commit, voicing, bass, articulation, dynamics, harmonic variants,
  Key/Mode, Tempo, Time Signature, meter grouping, groove, and relevant preset operations.
- **FR-161**: Undo/Redo history MUST be session-scoped.
- **FR-162**: Undo/Redo history MUST NOT be persisted in autosave or portable `.cadenceflow` files; a
  reopened project begins with a fresh undo stack from the loaded saved state.

#### Export

- **FR-163**: v1 MUST support standard MIDI export for a non-empty progression.
- **FR-164**: MIDI export MUST preserve supported progression order, exact saved pitches/manual voicing,
  semantic-to-performance timing, Rest Steps, bass realization, articulation timing where applicable,
  and exact velocity/per-note velocity behavior consistently with playback.
- **FR-165**: v1 MUST support MusicXML export as a separate semantic notation interchange path.
- **FR-166**: MusicXML export MUST preserve representable pitches and enharmonic spelling, durations,
  rests, chord/harmony information, Key/Mode, Time Signature, Tempo, and dynamics where correctly
  supported by the target representation.
- **FR-167**: MusicXML MUST be generated from the saved semantic musical model and MUST NOT be reverse-
  engineered from MIDI or rendered audio.
- **FR-168**: CadenceFlow-specific semantics lacking an exact MusicXML representation MUST use an
  explicit supported mapping or be omitted/documented; export MUST NOT silently substitute materially
  different harmony.
- **FR-169**: Export requests on an empty progression MUST be prevented or clearly explained.
- **FR-170**: Architecture MUST support future rendered-audio export (WAV/MP3) as another independent
  projection without requiring redesign of the semantic progression model; WAV/MP3 implementation is
  deferred beyond v1.

#### Workspace and appearance

- **FR-171**: The launch experience MUST be optimized for a wide desktop composition workspace using
  available horizontal space effectively.
- **FR-172**: The central workspace MUST preserve the harmonic matrix as the primary navigation surface
  while Inspector, piano visualization, progression, playback, project, and timing controls remain
  readily accessible in the same composition flow.
- **FR-173**: v1 MUST support dark and high-contrast light appearances.
- **FR-174**: Theme changes MUST NOT alter semantic distinction among selected, previewed, Best Match,
  Alternative, playing, completed, branch, and passive states.
- **FR-175**: Semantic state MUST NOT rely on color alone.

### Audio Rendering and Piano Sound Quality

- **FR-176**: v1 Piano playback MUST use a high-quality sample-based acoustic piano instrument as the
  primary audible realization; an oscillator-only or simple synthetic placeholder MUST NOT be the
  production default.
- **FR-177**: The piano audio renderer MUST consume the same exact realized pitches, note-on timing,
  note-off timing, Master Velocity, and per-note velocity overrides used by playback visualization and
  MIDI export.
- **FR-178**: The v1 piano sound source MUST provide multiple velocity layers or an equivalent
  sample-selection mechanism so that note velocity produces a musically meaningful timbral/dynamic
  response rather than only a volume multiplier.
- **FR-179**: Audio rendering MUST be implemented behind an Instrument Audio Provider boundary so a
  piano sample bank or SoundFont backend can be replaced or extended without changing Harmonic Engine,
  Progression Step, timing, voicing, or export semantics.
- **FR-180**: Large piano sample assets MUST load and cache without blocking harmonic navigation or
  progression editing; the UI MUST communicate when the high-quality instrument is still loading.
- **FR-181**: If the preferred high-quality piano bank cannot be loaded, CadenceFlow MUST fail
  gracefully with a clearly identified fallback audio state rather than silently changing musical
  pitches, timing, or saved project semantics.
- **FR-182**: Any bundled third-party piano sample bank or SoundFont MUST retain required licensing and
  attribution metadata in the distributed application.

### Scope Boundaries

#### Explicitly in v1

- Wide desktop composition studio.
- Chromatic tonic selection.
- Major and practical Tonal Minor as first-class harmonic contexts, exposed through the mode-bound
  `Progressions` and `Dark Harmony` modules.
- Two first-class v1 harmonic modules: `Progressions` and `Dark Harmony`.
- `Progressions`: Diatonic Core, Secondary Dominants, and Modal Interchange.
- `Dark Harmony`: compact v1 topology of Secondary Diminished, Tonal Minor Core, and
  Neapolitan / Chromatic Colors, where the chromatic layer includes Neapolitan harmony, common-tone
  diminished, chromatic passing diminished, and chromatic mediants; Secondary Diminished remains a
  separate functional layer. Its engine supports all harmonically meaningful secondary-diminished
  targets, while the default Matrix exposes only a curated subset and keeps additional targets available
  through expansion/Inspector. Tonal Minor Core uses stable functional defaults `i`, `ii°`, `III`, `iv`,
  `V/V7`, `VI`, and `vii°`, while natural-minor alternatives such as `v` and `VII` remain accessible as
  secondary variants without duplicating the always-visible core.
- Extensible independently visible harmonic-layer and module architecture.
- Preview/select separated from explicit Add.
- Contextual Smart Next-Chord Engine with Composition Intent.
- One Best Match plus up to three strong Alternatives.
- Beginner / Composer / Expert presentation modes.
- Extensible Matrix Card Views with per-card and global switching; v1 includes Harmonic, Piano, and
  Staff views, while future Instrument Profiles can contribute views such as Guitar visualization.
- Multi-step what-if branch from any progression point, Original vs Alternative comparison, rejoin,
  selective or whole-branch commit.
- Independent Progression Step objects and drag/drop reordering.
- Structured chord extensions/tensions and harmonic validation.
- Global Tempo and global Time Signature with custom meter and beat grouping.
- Bars/beats/subdivisions, dotted values, triplets, Rest Steps.
- Straight/Swing groove with adjustable swing amount.
- Whole or selected-range loop, metronome, and count-in.
- Piano-first contextual auto voicing plus exact manual Piano Voicing Editor.
- High-quality sample-based acoustic piano playback with velocity-sensitive timbral response and an
  replaceable Instrument Audio Provider boundary.
- Independent bass voice, piano-specific articulation, master and per-note velocity, dynamics presets.
- Functional built-in and Custom Presets with durations.
- Named projects, autosave/session recovery, portable `.cadenceflow` project file.
- Session-scoped comprehensive Undo/Redo.
- Automatic Key/Mode-based enharmonic spelling plus targeted manual override.
- MIDI export.
- MusicXML export.
- Dark/light theme.
- Instrument-profile architecture for future instruments.

#### Explicitly deferred / future

- Guitar Instrument Profile and Guitar-specific Card View (fretboard/chord-shape visualization).
- Practice curriculum and scored exercises.
- Dedicated Analyze workspace.
- Improvisation trainer/scoring.
- Live MIDI capture/controller workflow.
- Full saved-progression catalog/library beyond project and Custom Preset persistence.
- Large genre/harmony-mode selector system.
- `Scales` module (future melodic/scale navigation, including instrument-specific visualizations).
- `Blues` module (future genre-focused harmony, blues scales/notes, riffs, and solo vocabulary).
- Additional tonal/modal systems beyond Major and Tonal Minor.
- Dark Harmony expansion with additional layers such as Dominant Tension and Borrowed / Minor Colors,
  including advanced altered-dominant and augmented-sixth vocabularies.
- Additional functional harmonic layers beyond the v1 module vocabularies.
- Guitar, Ukulele, Melodica, and other fully implemented instrument profiles.
- Intra-step bass patterns.
- Tempo maps/tempo automation inside progression.
- Meter maps/time-signature changes inside progression.
- Persistent cross-session Undo history / full project version history.
- Mobile-first UI.
- Cloud sync, accounts, collaboration, and sharing services.
- Rendered-audio export to WAV/MP3 (architecture prepared in v1; implementation deferred).
- User-facing import/management of arbitrary external SF2/SF3/SFZ sound banks; the v1 audio architecture
  is prepared for alternate providers, but the launch experience ships with a curated piano sound source.

### Key Entities

- **Project**: Named persisted CadenceFlow work containing harmonic context, timing/groove, progression,
  temporary exploration state, supported UI/presentation state, and exportable musical semantics.
- **Harmonic Context**: Current tonic, Mode, tonal ruleset, and enharmonic spelling context used to
  interpret harmonic functions.
- **Harmonic Module**: A named composition lens that selects and organizes a harmonic vocabulary and
  guidance presentation while reusing the same Harmonic Engine and saved progression model. v1
  modules are `Progressions` and `Dark Harmony`; in v1 they are Mode-bound (`Progressions` = Major,
  `Dark Harmony` = Tonal Minor) rather than independently combinable with Mode.
- **Harmonic Layer**: Independently displayable functional vocabulary family in the matrix.
- **Card View**: Presentational projection of a Matrix Chord Card over the same harmonic/preview state,
  such as Harmonic, Piano, Staff, or a future instrument-specific view. It can be selected globally for
  visible cards or overridden per card without creating a new musical object.
- **Chord Definition**: Base harmonic identity/function available in a Harmonic Context, separate from
  any specific progression occurrence.
- **Chord Card Preview/Add Template**: Project-local editable audition/add-template state on a Matrix
  Chord Card. Explicit overrides are retained per card; unspecified values inherit project/instrument
  defaults; context-derived automatic realization is recomputed rather than stored as stale pitches.
  Relevant template values are copied on the next explicit Add, after which the Progression Step is
  independent.
- **Harmonic Variant**: Structured supported extension/tension/suspension data applied without losing
  the underlying base function when musically valid.
- **Recommendation**: Context-dependent Best Match or Alternative candidate with ranking evidence and
  explanation.
- **Composition Intent**: Transient exploration/branch-level ranking preference such as Resolve,
  Build Tension, Darken/Emotional, Surprise, or Smooth Voice Leading.
- **Progression**: Ordered sequence of Progression Steps and Rest Steps.
- **Progression Step**: One independent chord occurrence with its own harmonic variant, duration,
  instrument realization, voicing, bass, articulation, dynamics, and notation overrides where relevant.
- **Rest Step**: Timed non-harmonic progression event that preserves prior harmonic context.
- **Temporary Branch**: One active non-destructive sequence of preview steps with origin, optional
  rejoin point, and commit state.
- **Instrument Profile**: Instrument-specific realization, playable range, visualization, articulation,
  and future constraints applied to shared harmonic/progression semantics.
- **Piano Voicing**: Automatic or manual exact pitch realization for a Piano Progression Step.
- **Bass Voice**: Independent lower piano voice/anchor for a step.
- **Master Velocity**: Exact per-step MIDI velocity source of truth inherited by notes unless overridden.
- **Per-note Velocity Override**: Optional exact velocity override for one note of a step realization.
- **Meter**: Project Time Signature plus beat-grouping/accent semantics.
- **Groove Feel**: Project performance-timing model, initially Straight or Swing with adjustable amount.
- **Functional Preset**: Reusable sequence of harmonic functions and musical durations independent of
  absolute tonic and performance realization.
- **Playback Session**: Transient current playback state including stopped/playing/paused transport
  state, current musical position, current step, loop region, metronome/count-in state, and visual
  traversal.
- **Portable Project File**: Serialized CadenceFlow project representation independent of MIDI/MusicXML.
- **Undo/Redo History**: Session-scoped editing history not persisted with the project.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A target user can start from an empty project and create a four-step playable progression
  using the matrix and recommendations in under 3 minutes after a short first-use orientation.
- **SC-002**: In the supported harmonic acceptance set, 100% of displayed Best Match recommendations
  have an Inspector explanation and no recommendation requires the user to infer its category from
  color alone.
- **SC-003**: The recommendation surface never displays more than one Best Match or more than three
  Alternatives for one active context.
- **SC-004**: A progression containing two occurrences of the same base chord can preserve different
  voicing, bass, articulation, duration, harmonic variant, and velocity configuration through repeated
  playback, save/reopen, and MIDI export without one occurrence overwriting the other.
- **SC-005**: For the acceptance set of Major and Tonal Minor contexts, tonic transposition preserves
  unambiguous harmonic functions and step-local performance settings with no stale prior-key labels.
- **SC-006**: Ambiguous Major↔Minor mappings in the acceptance set are surfaced to the user rather than
  silently auto-converted.
- **SC-007**: In the piano acceptance set, highlighted keyboard pitches match audible playback pitches
  and MIDI-exported pitches for 100% of manually saved voicings.
- **SC-008**: Rest Steps, bars/beats, supported subdivisions, dotted values, and triplets reproduce the
  same semantic ordering/duration relationships in playback, loop, MIDI, and MusicXML acceptance tests.
- **SC-009**: Swing modifies supported playback/MIDI performance timing without changing stored semantic
  step durations when toggled back to Straight.
- **SC-010**: Whole-progression loop and a selected contiguous loop region can each run for at least five
  cycles without step-order drift or stale active-step indicators after Stop.
- **SC-011**: A named project containing a temporary branch, manual voicing, per-note velocity overrides,
  custom meter grouping, swing, and Custom Preset-relevant progression data can be autosaved/reopened
  with all supported persisted semantics intact.
- **SC-012**: A portable `.cadenceflow` project round-trip preserves the same supported semantic project
  state without relying on MIDI or MusicXML reconstruction.
- **SC-013**: Exported MIDI reproduces the acceptance progression's supported pitch, bass, velocity,
  Rest Step, and timing behavior when opened in an independent MIDI-capable application.
- **SC-014**: Exported MusicXML opens in an independent notation-capable application with supported
  Key/Mode, meter, tempo, enharmonic spelling, harmony, durations/rests, and representable dynamics
  preserved for the acceptance progression set.
- **SC-015**: At desktop sizes from 1280×720 through 1920×1080, the harmonic matrix, progression,
  Inspector entry point, and playback controls remain accessible without page-level horizontal
  scrolling.
- **SC-016**: A proof-of-concept second Instrument Profile can realize the same saved harmonic
  progression without changing progression harmonic identities or storage format.
- **SC-017**: In the piano audio acceptance set, audible notes match the realized Piano/Staff pitches and
  MIDI-exported pitches for 100% of tested manual and automatic voicings; at least three distinct
  velocity regions produce audibly and measurably different sample/timbre responses without changing
  stored note identity.

## Assumptions

- CadenceFlow v1 is a single-user desktop-first composition application.
- Accounts, cloud synchronization, collaboration, and social sharing are outside v1.
- Recommendation ranking is deterministic/explainable from the user's perspective; v1 does not
  require machine learning or generative AI.
- Sensible defaults may be supplied for tempo, meter, chord duration, voicing, articulation, dynamics,
  and swing amount so a new project is immediately audible.
- Musical dynamics labels are presentation aliases around an exact numeric velocity source of truth;
  final default label-to-velocity mappings may be tuned during design/implementation without changing
  this requirement.
- Swing amount range and exact timing curve are implementation/design details still to be specified;
  the semantic requirement is adjustable Swing as non-destructive performance timing.
- Automatic voicing quality is contextual and musical, but the specification does not require one
  globally optimal voicing algorithm.
- The exact bundled piano bank and audio-file encoding are technical/design choices; v1 requires a
  convincingly acoustic, velocity-sensitive sample-based piano experience rather than a specific container
  format such as SF2.
- Chord variant availability and compatibility are determined by the supported harmonic ruleset rather
  than unrestricted arbitrary pitch-set construction.
- The older ChordLab project may supply implementation ideas for theory, voicing, audio, MIDI, or future
  instruments, but it is not a current requirements source unless an idea is explicitly approved for
  CadenceFlow.
