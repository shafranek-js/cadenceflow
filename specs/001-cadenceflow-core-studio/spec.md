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
- Piano and Guitar chord-realization profiles are implemented in the current checkout; the harmonic
  engine and saved progression MUST remain instrument-independent. The 128-program Melody catalog is
  a separate monophonic track concern, not a replacement for chord Instrument Profiles.
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
  implementation. The current checkout includes Harmonic, Piano, Staff, Guitar fretboard/chord-shape,
  and Tablature projections. Card Views can be switched per card or synchronized across all currently
  visible Matrix cards through a global view control.
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
   changes. A contextually relevant additional target appears in its target-aligned column when that slot
   is free; a collision uses a compact, clearly labeled side slot in the same horizontal band. Best Match,
   Alternative, and Contextual states are shown by badges/highlighting rather than by rearranging the
   baseline. The Matrix MUST NOT add full-width `Additional` or `Contextual` strips; remaining valid targets
   stay accessible through Inspector rather than overcrowding the Matrix.
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

---

### User Story 12 - Create a linked melody from chord context (Priority: P2)

As a composer, I want to generate a concise melodic phrase from a selected Chord Step so that I can
quickly add a connected melodic idea without manually entering a piano-roll sequence or losing the
harmonic relationship.

**Independent Test**: Given a progression containing a Chord Step with a contextual upper voicing, the
user can create a recipe-derived Melody Track phrase, edit or remove its recipe, and verify deterministic
pitch order, exact timing, source-step linkage, staff presentation, and playback/export projections.

**Acceptance Scenarios**:

1. **Given** a Chord Step or any of its measure-card fragments is selected, **When** the user opens its
   context menu, **Then** CadenceFlow offers `Create Melody…` when no recipe exists and `Edit Melody…`
   plus `Remove Melody` when one does.
2. **Given** the melody editor, **When** the user applies Pitch Motion, Rhythm, Connection, Grid,
   Octave, and Instrument,
   **Then** the recipe is attached to that independent Chord Step and the operation is undoable as one
   semantic edit.
3. **Given** an attached recipe, **When** CadenceFlow realizes the phrase, **Then** it uses only the
   canonical contextual upper voicing of the source Chord Step, never its independent bass voice, and
   stores the recipe rather than a list of generated notes.
4. **Given** any supported Pitch Motion, Rhythm, Connection, and Grid, **When** the phrase is projected,
   **Then** pitch and rhythm cycles are deterministic, restart for that Chord Step, use exact Rational
   offsets, merge only eligible repeated pitches, and truncate the final event exactly to the remaining
   step duration.
5. **Given** a source Chord Step whose harmony, voicing, register, or duration changes, **When** the
   linked phrase is read or projected, **Then** its pitches and timing are rebuilt from the current
   source realization without stale generated-note state; Repeat copies the recipe independently,
   Extend preserves it, and delete/reorder preserve source-step identity semantics.
6. **Given** duplicate MIDI pitches, octave doublings, a single upper pitch, an empty pitch list, or an
   octave offset outside MIDI range, **When** the pure generator is called, **Then** valid inputs retain
   duplicates/single-pitch cycles and invalid inputs return typed domain validation errors without
   clamping or mutating inputs.
7. **Given** at least one Melody recipe in the project, **When** Staff View renders, **Then** a separate
   Melody staff uses the selected instrument's supported clef, concert pitch, exact rests/tuplets, and
   cross-bar ties while the existing Piano staff and bass visibility semantics remain unchanged.
8. **Given** Melody Track settings, **When** the user changes Mute, Solo, or Volume, **Then** the
   settings apply to playback as specified, Mute and Solo are mutually exclusive, and exports retain
   melody data regardless of playback-only mute/solo/volume settings.
9. **Given** Melody playback or export, **When** the preferred SoundFont is unavailable or a supported
   projection is requested, **Then** piano playback continues with an explicit melody fallback state,
   while MIDI and MusicXML remain available and contain the deterministic melody projection.

---

### User Story 13 - Read My Progression as one coherent score (Priority: P2)

As a composer, I want one global presentation mode for My Progression and professionally grouped Staff
systems so that the same musical timeline remains coherent instead of becoming a mixture of unrelated
per-measure cards.

> Historical acceptance note: T177–T182 established the initial US13 baseline with three Progression
> Views (`Harmonic`, `Piano`, `Staff`) and manual Staff grouping 1–4. The current contract below is the
> compatible expansion delivered by subsequent changes: five views and manual grouping 1–8. The historical
> tasks remain checked as records of that earlier baseline; they do not narrow the current runtime contract.

**Independent Test**: Open legacy uniform and mixed-view projects, switch the global Progression View
between Harmonic, Piano, Staff, Guitar, and Tablature, choose Auto or one to eight measures per system, and verify readable
responsive systems, aligned Melody/Harmony attacks, unchanged musical data, and preserved interactions.

**Acceptance Scenarios**:

1. **Given** My Progression, **When** the user switches its view from any exposed control, **Then** every
   measure uses the same `Harmonic`, `Piano`, `Staff`, `Guitar`, or `Tablature` mode and no `Mixed` state
   is available.
2. **Given** an older project without `presentation.progressionView`, **When** it is loaded, **Then** a
   uniform saved `step.cardView` initializes that global view, while mixed or absent values initialize
   `Harmonic`; subsequent saves persist the explicit presentation value without rewriting the Steps.
3. **Given** Staff mode, **When** several measures fit, **Then** they render as a continuous score system
   with common barlines and attack positions rather than independent staff cards.
4. **Given** a narrow viewport or dense notation, **When** Staff systems are laid out, **Then** Auto or
   the selected one-to-eight measure setting acts as a maximum, reflow reduces the count when needed,
   and a single over-dense measure scrolls internally without widening the page.
5. **Given** at least one Melody recipe, **When** any Staff system renders, **Then** its Melody staff is
   present and empty spans contain rests; Harmony treble is always present and bass depends only on the
   saved `showBassInStaff` setting.
6. **Given** selection, playback, reorder, context-menu, Rest, or trailing-gap actions, **When** the user
   changes Progression View or the Staff system grouping, **Then** those interactions remain available
   and musical, playback, Melody, and export semantics remain unchanged.
7. **Given** Staff mode, **When** the user clicks or keyboard-activates a chord/Rest label or a sounding
   event region, **Then** the corresponding persisted Progression Step becomes the single selected Step
   and the existing Selected Step inspector edits that same Step.
8. **Given** a selected Staff event, **When** the user invokes its pointer or keyboard context menu,
   **Then** the existing Melody create/edit/remove actions operate on that source Step and focus returns
   to the invoking score target after the action or cancellation.
9. **Given** all selection, Melody, reorder, removal, Rest, trailing-gap, continuation, playback, keyboard,
   and pointer interactions are available directly from Staff, **When** Staff mode renders, **Then** no
   duplicate Step-card strip is shown below the score; Harmonic, Piano, Guitar, and Tablature retain their
   independent measure sections and Step cards.
10. **Given** the global All Steps & Measures inspector and the right-side Inspector, **When** the user
    changes Piano/Guitar engines or SoundFont tones, **Then** only `AudioEnginesInspector` exposes those
    settings; All Steps retains instrument, volume, mute, solo, provider state, and Retry, while the lower
    `PianoAudioStatus` remains a read-only status with Retry only for error/fallback.

### User Story 14 - Realize harmony on Guitar and tablature (Priority: P2)

As a composer, I want to inspect chord shapes, in-position scale tones, and tablature alongside the
harmonic progression so that a guitar-oriented idea remains tied to the same saved chord semantics.

**Independent Test**: Switch My Progression to Guitar or Tablature, inspect a chord shape and its
fingering/scale-tone overlay, change orientation, and audition the progression with either configured
Guitar audio engine without changing the harmonic Step data.

**Acceptance Scenarios**:

1. **Given** a chord Step in My Progression, **When** Guitar view is selected, **Then** CadenceFlow
   renders a deterministic six-string voicing with fret positions, base position, and left-hand
   fingering metadata derived from the Step's harmonic realization.
2. **Given** a Guitar voicing and active scale context, **When** the card is rendered, **Then** the
   in-position `Scale Tones` overlay identifies available non-chord scale pitches without duplicating
   or mutating the chord shape.
3. **Given** a chord Step or melody event with an exact pitch, **When** Tablature view is selected,
   **Then** the projection resolves a playable string/fret/finger position and represents muted/open
   strings explicitly.
4. **Given** Guitar playback, **When** the user selects HQ Samples or SoundFont, **Then** playback
   uses the selected Guitar provider, applies bounded per-string strum timing, and reports provider
   status without changing Piano or Melody channels.

### User Story 15 - Explore scales, modes, blues, and harmonic formulas (Priority: P2)

As a composer, I want a focused Scales & Modes Explorer with scale tones, characteristic chords, and
auditionable cadence formulas so that modal and blues material can be tested before it is applied to the
progression.

**Independent Test**: Open the Explorer, choose a tonic and one of the implemented diatonic, minor,
pentatonic, or Blues scales, inspect Piano/Guitar note projections and characteristic chords, audition a
formula, and apply a selected formula to My Progression with an explicit key-switch choice.

**Acceptance Scenarios**:

1. **Given** the Explorer, **When** the user selects a tonic and scale family, **Then** the UI exposes
   the scale formula, pitch classes, characteristic degree/chords where defined, and the current
   Piano/Guitar visual projection.
2. **Given** a visible modal or Blues formula, **When** the user auditions it, **Then** audition uses
   the current audio path and leaves the saved progression unchanged.
3. **Given** a user chooses Apply, **When** the Explorer asks about key switching, **Then** applying the
   formula is an explicit atomic operation that either preserves the project key or applies the chosen
   tonic and progression replacement together.
4. **Given** the saved presentation toggle for Suzuki colors, **When** it is enabled, **Then** visible
   notation noteheads receive the confirmed pitch-color mapping as a decorative cue only; musical data,
   playback, MIDI, MusicXML, and non-color accessibility text remain unchanged.

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
- A melody recipe is projected from contextual upper voicing containing duplicate MIDI pitches or octave
  doublings, including a one-pitch source.
- A melody grid does not divide the source Chord Step duration exactly, or the source duration is shorter
  than one grid interval.

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
  contextual promotion. Baseline cards MUST preserve stable positions and MUST NOT be displaced, reordered,
  or spatially shuffled by contextual recommendation changes. An additional supported target that becomes
  especially relevant to the current saved progression, active preview, or temporary branch MUST appear in
  its target-aligned column when free, or in a compact labeled side slot in the same horizontal band when
  that column is occupied. Best Match, Alternative, and Contextual status MUST be expressed through badges
  and highlighting, not by moving the stable baseline cards. The Matrix MUST NOT add full-width `Additional`
  or `Contextual` strips or fabricate weak candidates merely to fill space; all remaining supported targets
  MUST remain discoverable through Inspector without changing the underlying harmonic model. This behavior
  MUST preserve user spatial memory and orthogonal/Manhattan routing stability.
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
- **FR-051**: The module architecture MUST permit additional modules beyond the implemented Scales &
  Modes Explorer and Blues scale vocabulary without redesigning the Harmonic Engine or
  instrument-independent saved progression model.
- **FR-052**: The current Explorer MUST remain a non-destructive workflow surface: scale/modal audition
  and formula inspection may be used without changing saved progression state until Apply is explicit.

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
- **FR-064**: Card View availability MUST be capability-driven. Current Guitar fretboard/chord-shape and
  Tablature views register against the shared Chord Card model; future Instrument Profiles MAY register
  additional views without redesigning that model, and unavailable instrument-specific views MUST NOT be
  exposed as functional controls.
- **FR-065**: All non-Harmonic Card Views for the same Chord Card MUST be projections of one shared
  current preview realization. Changing inversion, register, harmonic variant, automatic/manual voicing,
  or another realization-affecting preview setting MUST update every applicable Card View consistently;
  Card Views MUST NOT own separate musical state.
- **FR-066**: Matrix Chord Cards MUST retain the extensible Card View concept with global selection and
  optional per-card overrides. My Progression MUST expose a separate single global Progression View with
  exactly `Harmonic`, `Piano`, `Staff`, `Guitar`, or `Tablature`; it MUST NOT expose per-step view selection.
- **FR-067**: Every My Progression view MUST project each Step's own independent saved realization and
  performance state, including harmonic variant, exact/manual voicing where present, register, bass,
  dynamics, and notation spelling; it MUST NOT read mutable preview settings from the source Matrix card.
- **FR-068**: Changing the global My Progression view MUST be presentational and undoable, MUST update
  all visible measures coherently, and MUST NOT mutate `step.cardView`, Chord Steps, Melody recipes,
  playback semantics, or export output. `Mixed` MUST NOT exist as a runtime or user-interface value.

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
  the harmonic map without obscuring chord identity, independently of the selected Progression Step.
  Transport actions MUST preserve that selection through Play, Pause, Resume, Play From Here, and Stop.
- **FR-126**: v1 MUST provide an independently switchable metronome.
- **FR-127**: v1 MUST provide an optional Count-in before progression playback.
- **FR-128**: Count-in MUST default to one complete bar in the current Time Signature and Tempo.
- **FR-129**: Metronome and Count-in MUST use the project's beat grouping/accent structure.

#### Piano instrument profile, voicing, bass, articulation, and dynamics

- **FR-130**: Piano and Guitar MUST be supported Instrument Profiles in the current v1 implementation;
  the 128-program Melody catalog remains a separate monophonic track instrument layer.
- **FR-131**: Harmonic Engine, Progression, timing, and saved project semantics MUST be separated from
  Instrument Profile implementation.
- **FR-132**: The architecture MUST allow future Ukulele, Melodica, and other Instrument Profiles
  without redefining saved progression harmonic content.
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
  `Humanized`; Guitar realization MUST support bounded `Strum` timing through its audio provider.
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

### Measure-card composition layout

- **FR-183**: My Progression MUST present a derived measure-card layout based on the project's global
  Meter while retaining the ordered flat sequence of independent Progression Steps as its canonical
  persisted model.
- **FR-184**: A measure card MUST place each Chord Step or Rest Step at its exact proportional musical
  position and MUST support multiple independent events in one measure.
- **FR-185**: A Step crossing a barline MUST remain one persisted Step; its visual fragments MUST indicate
  continuation without creating a second onset or changing playback semantics.
- **FR-186**: An incomplete final measure MUST expose its remaining duration as an explicit interactive
  gap. CadenceFlow MUST NOT silently duplicate or extend a chord to fill that gap.
- **FR-187**: The final gap MUST offer explicit actions to add a chord, add a Rest Step, extend the final
  chord, or repeat the final chord as a new independent Step.
- **FR-188**: Full-progression playback and file export MUST preserve silence from the final authored event
  to the next barline; MusicXML MUST encode that silence as a rest and MIDI MUST place End-of-Track at
  the aligned bar boundary.
- **FR-189**: `Whole`, `Half`, and other note-value durations MUST remain absolute musical durations. The
  Progression duration editor MUST additionally offer `Full bar`, computed from the current Meter.
- **FR-190**: The derived measure layout, gap actions, and all measure-level controls MUST preserve exact
  Rational timing, Step independence, Undo/Redo behavior, keyboard access, and source-project immutability.

### Melody generation from Chord Steps

- **FR-191**: CadenceFlow MUST allow a user to attach one linked melody recipe to an individual Chord
  Step and MUST expose Create, Edit, and Remove Melody actions without changing the Chord Step's
  harmonic identity.
- **FR-192**: A Chord Melody Recipe MUST contain exactly one supported Pitch Motion (`up`, `down`,
  `up-down`, `down-up`, `outside-in`, `inside-out`, `repeat-root`, `repeat-top`,
  `alternate-root-up`, or `alternate-top-down`), Rhythm (`even`, `dotted`, `reverse-dotted`, or
  `tresillo`), Connection (`retrigger` or `tie-repeated`), Grid (`quarter`, `eighth`, `sixteenth`,
  `eighth-triplet`, or `sixteenth-triplet`), and Octave Offset from -2 through +2; instrument and Melody
  Track settings are separate concerns. Legacy Pattern recipes MUST migrate to the equivalent Pitch
  Motion with `even` and `retrigger`.
- **FR-193**: Melody generation MUST consume the canonical contextual upper voicing already realized for
  the source Chord Step. It MUST NOT consume or infer from the independent bass voice, reimplement
  harmony, or import a piano profile into the pure melody domain.
- **FR-194**: The persisted Chord Step MUST store the melody recipe and MUST NOT store a generated list of
  melody notes. Melody pitches and timing MUST be recomputed from the current source voicing and exact
  Chord Step duration.
- **FR-195**: The pure melody projection MUST sort source upper pitches by MIDI number without mutating
  the input, preserve exact duplicate MIDI pitches and octave doublings, and produce deterministic
  source-step-linked events with sequential indexes and exact Rational offsets/durations.
- **FR-196**: Pitch Motion traversal MUST implement full ascending/descending passes,
  endpoint-nonrepeating Up-Down/Down-Up passes, alternating Outside-In traversal, center-outward
  Inside-Out traversal, repeated lowest/highest chord tones, and root-up/top-down alternation; each Chord
  Step MUST restart its motion cycle from the first event.
- **FR-197**: Grid durations MUST be exactly 1, 1/2, 1/4, 1/3, and 1/6 quarter-note beats for the
  supported grids. Rhythm MUST apply repeating exact weights `[1]`, `[3,1]`, `[1,3]`, or `[3,3,2]` to
  that base pulse. The final event MUST be truncated exactly to the remaining duration, including when
  the source duration is shorter than one weighted interval; musical time MUST NOT use floating point.
- **FR-198**: Octave Offset MUST shift MIDI number and ExactPitch octave by twelve semitones per offset
  while retaining note letter and accidental spelling. Any result outside MIDI 0..127 MUST fail with a
  typed domain validation error and MUST NOT clamp.
- **FR-199**: Empty upper-pitch input and non-positive source duration MUST fail with a typed domain
  validation error. The source Step ID, recipe, pitch input, and duration input MUST remain unchanged.
- **FR-200**: Repeat MUST copy a melody recipe into an independent new Step, Extend MUST preserve the
  recipe, and delete/reorder/replace operations MUST maintain the source-step linkage and recompute the
  projection. Custom chord presets MUST NOT persist melody recipes or Melody Track settings.
- **FR-201**: Melody context-menu and editor interactions MUST be keyboard accessible, expose semantic
  menu/menuitem roles, support Escape/outside-click dismissal and focus return, and apply a recipe edit as
  one undoable operation.
- **FR-202**: Staff View MUST render one concert-pitch Melody staff per unique effective Melody Instrument
  active in that score system, above Piano and on the shared temporal axis. Each staff MUST use its catalog
  clef, contain only that instrument's notes plus rests for its inactive spans, encode tuplets, and split
  cross-bar events with ties without creating repeated attacks. Repeated Steps using the same effective
  instrument MUST reuse one staff; a Step override MUST move its events rather than duplicate them.
- **FR-203**: Melody Track settings MUST support a catalog Instrument default, Mute, Solo, and integer Volume 0..127;
  enabling Mute MUST disable Solo and enabling Solo MUST disable Mute. Solo MUST suppress chord upper
  and bass playback but MUST NOT suppress the metronome.
- **FR-204**: Melody playback MUST use a separate provider/channel role and preserve exact source-note
  velocity semantics with global Volume applied independently. Active-note highlighting MUST identify
  the currently sounding melody event while preserving chord highlighting.
- **FR-205**: The bundled FluidR3_GM SoundFont preparation/provider path MUST be licensed, provenance
  checked, offline-capable, and lazy-loaded. Failure to load it MUST expose an identified melody error
  and Retry state while leaving piano playback, project data, MIDI, and MusicXML available.
- **FR-206**: When melody exists, MIDI format-1 export MUST add one deterministic Melody track per unique
  effective Melody Instrument before the Piano tracks, with that instrument's program, channel, track name,
  and notes. Playback-only Mute/Solo/Volume settings MUST NOT remove melody data from export. Projects
  without melody MUST retain the existing MIDI output.
- **FR-207**: When melody exists, MusicXML export MUST add one single-staff Melody part per unique effective
  Melody Instrument before Piano, with its catalog name/clef, concert-pitch notes, rests, tuplets, and
  cross-bar ties. Every Melody part spans the full score with rests when inactive. Projects without melody
  MUST retain the existing MusicXML output.
- **FR-208**: `PresentationState` MUST persist `progressionView` as `harmonic | piano | staff | guitar |
  tablature` and `measuresPerSystem` as `auto | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8`. Both settings MUST be
  editable by undoable presentation commands that do not change Progression Steps.
- **FR-209**: The project schema version MUST remain unchanged for US13. When an older project lacks an
  explicit `presentation.progressionView`, a non-empty uniform set of saved Chord Step `cardView` values
  MUST initialize it; mixed, empty, or absent values MUST initialize `harmonic`. The legacy field remains
  loadable but MUST be hidden, unwritten by Progression UI, and ignored by Progression rendering.
- **FR-210**: Staff View MUST render one SVG per score system. A system MUST contain sequential measures
  on one shared horizontal timeline with coincident barlines and equal x positions for simultaneous
  Melody and Harmony attacks.
- **FR-211**: `measuresPerSystem` MUST apply only to Staff and MUST be a maximum. Manual values `1`–`8`
  remain valid hard maximums. For `auto`, Staff MUST calculate the maximum as
  `clamp(floor(16 / measureDurationQuarterBeats), 2, 6)`, where
  `measureDurationQuarterBeats = numerator × 4 / denominator`. Available width and attack density MAY
  reduce the actual count. A normal measure width MUST be proportional to its musical duration at an
  baseline of `84 px × measureDurationQuarterBeats`; the normal attack budget is two unique attacks
  per quarter-note beat, and each attack beyond that budget adds `44 px`. This gives
  approximately 168 px for 2/4, 252 px for 3/4 or 6/8, 336 px for 4/4, 294 px for 7/8, and allows
  four normally dense 4/4 measures in a 1344 px desktop rail. Measures MUST be greedily packed until
  the maximum count or available width is reached.
- **FR-212**: A single Staff measure whose required width exceeds the available system width MUST retain
  that width inside a local horizontal scroller; it MUST NOT create page-level horizontal overflow.
- **FR-213**: Each Staff system MUST render exactly the Melody instrument staves that have at least one
  sounding Melody event in that system and fill their internal silent spans with rests. A system with no
  Melody event MUST not reserve an empty Melody staff. Harmony treble MUST always render; bass MUST render
  exactly when `showBassInStaff=true` and MUST NOT disappear automatically because of available width.
- **FR-214**: Every Staff system MUST repeat the clef and only the first system MUST show the global time
  signature. Harmonic, Piano, Guitar, and Tablature views MUST ignore `measuresPerSystem` and render
  independent, full-width measure sections in a vertical flow; steps within one measure MUST remain in one
  horizontal row with measure-local adaptation or scrolling when needed. Neighboring measures MUST NOT be
  grouped or dimension-matched as a score system. All five views MUST preserve selection, playback
  highlighting, drag/reorder, context menus, Rest representation, and trailing-gap actions.
- **FR-215**: In Staff View, every visible chord/Rest label and sounding event region MUST expose one
  pointer- and keyboard-operable target associated with its canonical Progression Step. Activating the
  target MUST select that Step and drive the existing Selected Step inspector without creating a second
  selection or musical-data model.
- **FR-216**: Staff targets MUST expose the existing Melody create/edit/remove workflow through pointer
  and keyboard context-menu invocation, with deterministic focus return. Step removal, reorder, Rest,
  trailing-gap, continuation, and playback interactions MUST remain available without requiring a
  duplicate Step-card strip.
- **FR-217**: The duplicate Step-card strip MUST be removed only from Staff after interaction parity is
  demonstrated. Harmonic and Piano MUST retain their independent measure sections and Step cards.
  Removing the Staff strip MUST NOT change Project persistence, Undo/Redo, playback, MIDI, MusicXML, or
  Matrix Card Views.
- **FR-218**: The Melody editor MUST expose a compact optional Pitch Motion browser containing every
  supported motion exactly once in three stable groups: Directional (`up`, `down`, `up-down`, `down-up`),
  Shapes (`outside-in`, `inside-out`), and Pedal & Alternating (`repeat-root`, `repeat-top`,
  `alternate-root-up`, `alternate-top-down`). Each tile MUST show a human-readable label and a lightweight
  contour preview derived from the canonical pitch-order implementation rather than a duplicate motion
  algorithm.
- **FR-219**: Selecting a Pitch Motion tile MUST change only the editor draft's `pitchMotion`, preserve
  Rhythm, Connection, Grid, Octave Offset, and Instrument, synchronize the existing Pitch Motion select,
  and immediately refresh the single authoritative notation preview. Gallery selection MUST NOT play
  audio, mutate the source Step, persist a gallery/preset identifier, or change project schema; Apply and
  Cancel retain their existing commit/rollback behavior.
- **FR-220**: The Pitch Motion browser MUST use disclosure and single-selection semantics with an exposed
  current value, visible focus, pointer and keyboard operation, deterministic Escape/focus return, and
  accessible text for each contour. At 1280×720, 1920×1080, and 200% zoom it MUST remain contained within
  the Melody dialog, use internal scrolling when needed, keep the primary notation preview and footer
  actions reachable, and create no page-level overflow.
- **FR-221**: Melody Instruments MUST come from one immutable canonical catalog containing exactly one
  selectable entry for every General MIDI Level 1 melodic program 0–127. Each entry MUST define a stable
  id, zero-based GM program, GM family, human-readable label, concert-pitch clef, playable MIDI range,
  optional local sample asset, and realtime-audio availability. The existing `flute`, `violin`, `clarinet`,
  `oboe`, `cello`, and `synth-lead` ids MUST remain the canonical ids for their existing programs; the other
  entries MUST use stable `gm-NNN` ids. Range metadata is informational in this batch: use MIDI 0..127 when
  no verified narrower range exists and do not transpose, clamp, or reject generated notes from it. Catalog
  validation MUST reject duplicate ids/programs and gaps.
- **FR-222**: `MelodyTrackSettings.instrument` MUST remain the project-level default. A Chord Step with a
  Melody recipe MAY store `melodyInstrumentOverride`; absence means `Use track instrument`. Effective
  instrument resolution MUST be exactly `step.melodyInstrumentOverride ?? project.melodyTrack.instrument`.
  Changing either level MUST be undoable, MUST NOT copy the global value into inheriting Steps, and MUST
  leave repeated Step instances independent. Repeat copies an explicit override; remove-Melody removes it.
- **FR-223**: Portable projects MUST move to schema v5. The explicit v4→v5 migration MUST preserve the
  existing six track ids, add the optional Step-local Melody instrument override with absence meaning
  inheritance from the Melody Track default, and remain sequential with v1→v2→v3→v4 migration. Autosave,
  recovery, portable encode/decode, Undo/Redo, Temporary Branch Steps, and future-version rejection MUST
  preserve or validate optional Step-local overrides without serializing effective values.
- **FR-224**: Melody Track controls and the Melody editor MUST use one compact, searchable, keyboard-
  accessible picker grouped by GM family. The track picker edits the global default; the Step picker starts
  with `Use track instrument` and edits only the selected Step override. Labels MUST expose GM program and
  current local `Realtime` availability, preserve draft Apply/Cancel behavior, and remain usable at
  1280×720, 1920×1080, light/dark, and 200% zoom without page-level overflow.
- **FR-225**: Realtime Melody playback and preview MUST lazy-load only the effective instruments that have
  verified local assets. The current catalog marks all 128 programs as locally available; a failed local
  load MUST produce an explicit identified audio-unavailable state and MUST NOT silently substitute another
  timbre, preload the full catalog, stop Harmony playback, corrupt project data, or disable MIDI/MusicXML
  export. Mixed-instrument progressions MUST retain playable Step timbres while visibly reporting a load
  failure.
- **FR-226**: Staff, MIDI, and MusicXML MUST partition Melody events by effective instrument. Each unique
  instrument MUST map to exactly one Staff line per active system, one MIDI track, and one MusicXML part;
  events MUST never be duplicated or merged into another instrument. Instrument ordering MUST be stable by
  first progression occurrence, with GM program then stable id as deterministic tie-breakers. Projects
  without Melody MUST retain their accepted output. Every current catalog program has a manifest-backed
  local asset and remains exportable even if realtime loading fails.

#### Current instrument, exploration, and presentation implementation

- **FR-227**: The global `presentation.progressionView` MUST support exactly `harmonic`, `piano`, `staff`,
  `guitar`, and `tablature`; all five views MUST project the same persisted Steps and MUST NOT introduce
  a second harmonic or timing model. Guitar and Tablature are presentation projections, not alternate
  progression data stores.
- **FR-228**: `presentation.measuresPerSystem` MUST accept `auto` and manual values `1` through `8`.
  The setting applies to Staff system grouping only; current `auto` uses meter duration and attack
  density with a 2–6 measure target/cap, while manual 1–8 values remain valid persisted settings.
  Harmonic, Piano, Guitar, and Tablature views MUST remain independent full-width measure sections.
- **FR-229**: Guitar Card View MUST expose a deterministic standard-tuning fretboard/chord-shape
  projection with six-string fret positions, base fret, open/muted-string state, and optional left-hand
  fingering. Tablature MUST expose the same voicing as string/fret positions and MUST represent muted and
  open strings explicitly.
- **FR-230**: Guitar Card View MUST support in-position `Scale Tones` derived from the active scale and
  chord box. Scale-tone markers MUST be derived UI data and MUST NOT mutate the chord definition,
  harmonic function, or saved Step performance.
- **FR-231**: Guitar playback MUST support separately selectable runtime `hq-samples` and `soundfont`
  engines, lazy local sample loading, provider status, and bounded per-string strum spread. Portable and
  autosave persistence for the engine/tone fields is a separate open gap; Guitar engine changes MUST NOT
  alter Piano or Melody provider/channel settings.
- **FR-232**: Progression editing MUST expose contextual voice-leading/smooth-inversion and bassline
  strategies that update Step-local performance settings through undoable commands while preserving
  harmonic identity and canonical Step IDs.
- **FR-233**: Reharmonization/substitution and modulation workflows MUST present an explicit candidate
  or transition path, audition it when requested, and apply only through an explicit user action; they
  MUST preserve source progression semantics until applied and MUST not silently change the project key.
- **FR-234**: Built-in cadence formulas and Quick Starters MUST remain deterministic functional presets
  with explicit module/genre metadata, rationale, audition, and Apply behavior. Applying one MUST use
  existing progression commands rather than storing generated performance events.
- **FR-235**: The Scales & Modes Explorer MUST expose the implemented diatonic, minor-variant,
  pentatonic, and Blues scale definitions with formula, pitch, characteristic metadata, modal chords,
  Piano/Guitar card projections, and the implemented canonical modal cadence library. The Explorer is a
  presentational/workflow surface and MUST NOT be branded with a third-party reference name.
- **FR-236**: Explorer formula application MUST be explicit and key-aware; until atomic modal apply is
  implemented, the current workflow MUST keep audition separate from Apply and MUST surface the selected
  tonic/key-switch choice rather than silently combining unrelated mutations.
- **FR-237**: Suzuki note colors MUST be a persisted presentation toggle defaulting off. The mapping is
  decorative and MUST NOT change semantic notes, playback, MIDI, MusicXML, or accessible pitch labels.
- **FR-238**: The studio MUST present Matrix, My Progression, Inspector, transport, and project/export
  actions in the current desktop composition shell. Side panels MAY auto-hide/expand, but the active
  surface MUST retain keyboard access, compact measure composition, and no page-level horizontal overflow
  at the accepted desktop sizes.
- **FR-239**: The accepted documentary convergence leaves schema v5 unchanged. The separately authorized
  T197+T192 batch MUST upgrade the portable-project contract atomically from v5 to v6; no partial or
  separate engine/tone schema migration is permitted.
- **FR-240**: The Matrix `AudioEnginesInspector` MUST be the sole user-facing surface that changes Piano or
  Guitar engines and SoundFont tones. All Steps & Measures MUST retain only Harmony instrument, volume,
  mute, solo, provider state, and Retry controls. `PianoAudioStatus` MUST remain a read-only status surface
  with Retry available only for error/fallback states and MUST NOT open an engine-settings popover.
- **FR-241**: Piano/Guitar engine and SoundFont tone fields MUST persist through the Project codec,
  autosave/recovery, portable import/export, and Undo/Redo. These fields and `noteColorMode` MUST enter
  one atomic schema-v5-to-v6 cutover; engine/tone persistence MUST NOT introduce a separate schema version.

#### Canonical Progressions Matrix topology and strict routing

- **FR-242**: The future Progressions Matrix MUST preserve a physical-board spatial mental model with
  three horizontal functional zones in stable semantic order: `Secondary Dominants` above `Main Chords`,
  and `Modal Interchange` below `Main Chords`. The six primary Main Chord columns MUST retain stable
  semantic positions; upper source/target cards MUST align vertically with their related Main Chord
  targets so the relationship remains understandable without opening Inspector. The lower Modal
  Interchange cards MUST retain meaningful alignment with Main Chord columns, but MUST NOT be padded or
  stretched solely to create equal card counts. Auxiliary diminished or legacy-compatible elements MAY
  live outside the six primary columns when that preserves readability and compatibility.
- **FR-243**: Progressions Matrix routing and strict directed-tension states MUST preserve the semantic
  source/target order, visible arrow/highlight relationship, and stable column meaning at accepted desktop
  sizes and under layout pressure. Responsive behavior MAY compress, wrap, or reflow the board, but MUST
  NOT degrade it into an unrelated independent grid or hide the relationship needed to understand a
  source/target pair. This requirement concerns equivalent spatial structure and relationship clarity,
  not pixel-perfect copying, third-party branding, or verbatim reference text.

- **FR-244**: The Composition UX workspace aligns Harmony Steps and Melody on one shared musical-time
  axis; Matrix remains the surface for harmonic discovery and My Progression remains the temporal editing
  surface.
- **FR-245**: Composition interactions use a projection/adapter boundary over canonical Project
  semantics. Preview and audition MUST NOT mutate Project or history; Apply MUST commit through one
  command and create exactly one history entry.
- **FR-246**: Harmonic note role metadata MUST use the derived shape
  `{ primary: "root" | "chord-tone" | "scale-tone" | "altered"; targetNext: boolean }` and MUST NOT be
  serialized in `MelodyEvent`.
- **FR-247**: Chord-linked Melody supports a generated/authored union. Generated content retains its
  recipe; authored content stores stable note IDs, exact pitch, and Rational onset and duration.
  Accepted Piano Roll editing can modify selected notes from generated Melody; the first committed
  edit materializes the effective phrase atomically while retaining its recipe, and Undo restores
  generated content.
- **FR-248**: Composition UX 1.1 provides a label hierarchy and compact quick edit, direct duration
  resizing, range selection, a deterministic Alternatives tray, a Quick Chord/Command Palette, and a
  guided start.
- **FR-249**: Duration resizing uses one explicit Rational snap policy and commits one command
  transaction; it MUST NOT expose multiple implicit resize modes.
- **FR-250**: Range selection operates over the shared timeline and supports contiguous selection and
  the approved keyboard/pointer extension semantics, without changing unrelated Steps.
- **FR-251**: Alternatives are deterministic and explainable. Candidate preview is non-mutating; Apply
  creates one undoable transaction.
- **FR-252**: Quick Chord MUST use the same strict route guard as Matrix card Add. After T207, keyboard-first
  authored-Melody editing MUST support scale-degree entry `1–7`, arrow-key movement/selection, `Alt`+arrow
  semitone movement, `Delete`, and `Enter` insert/edit; pointer workflows remain available.
- **FR-253**: Guided Start offers blank project, guided progression, quick starter, and example entry
  points, then yields to the normal workspace after successful use without persistent tutorial overlays.
- **FR-254**: The inline Melody Lane is initially read-only and shares the Harmony timeline; direct
  authored-note editing is introduced only by the subsequent authored-Melody task.
- **FR-255**: Song Sections are canonical records with `id`, `name`, and `startStepId`; the initial model
  represents named boundaries only and excludes repeat graphs and arrangement instances.
- **FR-256**: Piano Roll Web MIDI step input MUST put all controls in one dedicated **Midi Settings**
  responsive sidebar with an accessible settings entry, keyboard close and focus return. The main
  music toolbar MUST have no permanent MIDI controls. The existing status bar announces the actual
  device name, connection and Armed/Disarmed/temporarily paused/error state without stealing focus.
  When permission queries are supported, already granted access automatically connects, selects
  the prior available or stable first connected input, and arms only with Piano Roll active and
  transport stopped. Prompt/denied permission requires explicit **Connect MIDI** using
  `requestMIDIAccess({sysex:false})`; automatic startup MUST NOT prompt. Real hotplug may auto-arm;
  ordinary renders, note updatedAt and repeated device notifications MUST NOT rearm manual/safety OFF.
  Separate armed intent, effective input and focus suspension. Window blur suspends effective input,
  ignores background Note On without replay and cancels previews/late preparation. Focus resumes
  only for preserved intent in the same Project session, same connected device, active Piano Roll
  and stopped transport. Escape/manual OFF clears intent even during suspension. Playback/pause,
  view/session replacement and device disconnect permanently disarm; within-window focus does not.
  Each positive Note On on any channel inserts one exact authored note and one Undo at the shared
  absolute insertion cursor, then advances by exact duration without resnapping. Process bursts
  synchronously against authoritative store.project. Ignore Note Off, velocity zero, CC/pitch bend
  and malformed input; never store velocity or coerce pitch 0..127 to scale degrees. Offer all 15
  ordinary/dotted/triplet whole/half/quarter/eighth/sixteenth durations, default quarter, independent
  of Snap. Initial cursor is selected Step start; empty-grid click snaps explicitly; exact fraction
  controls are available. Cursor is independent of selection/playback/UndoRedo. Armed Enter and
  manual pitch plus Insert note share insertion; unarmed Enter retains existing behavior. Existing
  Melody and generated recipe/effective notes/IDs/ownership/instruments are preserved through the
  atomic authoredMelodyTransaction, including exact UndoRedo and authored Rest. Cross-Step/bar/System
  notes are valid within composition end; overflow rejects the whole note without mutation/history/
  cursor advancement or automatic bars/truncation. Configuration/cursor are transient, outside v9.
  Sidebar-only **Sound on input**, default ON, previews only a successfully committed note for 250 ms
  using current Melody instrument/volume; session/disarm/pause/change cancels late completions. No
  harmony or existing-note reattacks, chord aggregation, real-time recording or adjacent T214 redesign.
- **FR-257**: Signal may contribute selectively adapted MIT-licensed interaction gestures through an
  adapter. Any adapted code MUST carry provenance comments and the repository MUST include
  `THIRD_PARTY_NOTICES.md`; do not import Signal domain/store/audio/history models. AI, real-time MIDI
  recording, and literal copying of Hookpad or Signal are out of scope.
- **FR-258**: When a chord card is selected in the active Harmonic Matrix, pressing `+` (including
  the numeric keypad Add key) while keyboard focus is in the Matrix MUST add that chord to My
  Progression through the same guarded action as Ctrl+click/Ctrl+Enter. The shortcut MUST NOT fire
  from editable controls, dialogs, or an auto-repeated key event; without a selected visible card it
  MUST do nothing. It MUST NOT change preview-only behavior, route confirmation, or the existing
  mouse/keyboard add methods. The shortcut MUST be discoverable in the card's accessible help.

#### Printable score and release gate

- **FR-259**: The studio MUST provide a separate print presentation of My Progression for A4 paper
  using HTML print CSS and the browser's Save as PDF flow. It MUST include ordered measures, chord
  symbols, harmonic direction arrows where applicable, and compact Guitar diagrams where a Guitar
  realization exists. Printing MUST NOT mutate Project, history, selection, or playback state.
- **FR-260**: The print presentation MUST paginate long progressions without clipping measures,
  notation, chord labels, or diagrams. Essential harmonic meaning MUST remain legible in grayscale;
  Suzuki colors MUST NOT be required to understand the printed score. The screen workspace must
  remain usable at 1280×720 and 1920×1080 in light and dark themes.
- **FR-261**: Release acceptance MUST verify offline asset availability and notices, current and
  migrated project round-trips, print layout at A4 and representative long progressions, focused
  and full regression results, production build, and any unresolved licensing or test failures.
  The current release-gate disposition is tracked in
  [the 2026-10-04 release handoff](release-gate-handoff-2026-10-04.md); feature checkboxes alone do
  not complete this gate.
- **FR-262**: Every displayed Measure heading MUST expose the commands for that exact Measure by
  pointer context menu, ContextMenu/Shift+F10 and a discoverable accessible menu button. Deleting a
  Measure removes its authored time interval and Harmony, shifts later music earlier by that exact
  interval, and retains all musical content outside it. Crossing Steps and authored/generated
  effective Melody MUST be clipped, split, rebased and reassigned with exact Rational timing;
  generated Melody context changes MUST NOT silently rewrite retained notes. Preserve stable Step
  ownership where it survives, instruments, recipes, section boundaries, selection, loops, and exact
  one-entry Undo/Redo. An empty progression and an incomplete final Measure are valid. Active branch
  constraints and any model case that cannot preserve content MUST be explained and leave the
  Project/history unchanged. Measure targets are independent of the selected Step and consistent in
  Harmonic, Piano, Staff, Guitar, Tablature and Piano Roll views. Context menus MUST close on Escape
  or outside click, return focus to their invoking heading/button, clamp to the viewport, and remain
  usable in light/dark themes at 640×360, 1280×720 and 1920×1080.
  A failure may be documented and triaged, but the release gate MUST NOT be marked complete while
  a required check is failing or its disposition is undecided.

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
- Extensible Matrix Card Views with per-card and global switching; the current implementation includes
  Harmonic, Piano, Staff, Guitar fretboard/chord-shape, and Tablature views.
- One global My Progression View (`Harmonic`, `Piano`, `Staff`, `Guitar`, or `Tablature`) with no
  per-step or `Mixed` mode. Harmonic/Piano/Guitar/Tablature use independent vertical measure sections;
  Staff uses responsive continuous score systems, with Auto targeting two to six measures by meter and
  manual layout accepting one through eight.
- Multi-step what-if branch from any progression point, Original vs Alternative comparison, rejoin,
  selective or whole-branch commit.
- Independent Progression Step objects and drag/drop reordering.
- One recipe-derived Melody Track linked to Chord Steps, using contextual upper voicing only, with
  deterministic exact-time pattern/grid projection and supported instrument settings.
- Structured chord extensions/tensions and harmonic validation.
- Global Tempo and global Time Signature with custom meter and beat grouping.
- Bars/beats/subdivisions, dotted values, triplets, Rest Steps.
- Straight/Swing groove with adjustable swing amount.
- Whole or selected-range loop, metronome, and count-in.
- Piano-first contextual auto voicing plus exact manual Piano Voicing Editor.
- High-quality sample-based acoustic piano playback with velocity-sensitive timbral response and an
  replaceable Instrument Audio Provider boundary.
- Guitar chord realization with standard-tuning fretboard, chord shapes, in-position Scale Tones,
  tablature/fingering projections, and selectable HQ Samples/SoundFont audio engines with strum spread.
- Independent bass voice, piano-specific articulation, master and per-note velocity, dynamics presets.
- Functional built-in and Custom Presets with durations.
- Named projects, autosave/session recovery, portable `.cadenceflow` project file.
- Session-scoped comprehensive Undo/Redo.
- Automatic Key/Mode-based enharmonic spelling plus targeted manual override.
- MIDI export.
- MusicXML export.
- Scales & Modes Explorer for the implemented diatonic, minor-variant, pentatonic, and Blues scales,
  characteristic chords, modal cadence formulas, and Piano/Guitar visualization.
- Persisted Suzuki note-color presentation toggle.
- Dark/light theme.
- Instrument-profile architecture for future instruments beyond the current Piano and Guitar profiles.

#### Explicitly deferred / future

- Practice curriculum and scored exercises.
- Dedicated Analyze workspace.
- Improvisation trainer/scoring.
- Real-time MIDI recording/capture and configurable controller mappings. The FR-256 Web MIDI step
  input workflow is already implemented and independently accepted; it is not real-time recording.
- Full saved-progression catalog/library beyond project and Custom Preset persistence.
- Larger genre/harmony-mode selector systems beyond the current Scales & Modes Explorer.
- Additional tonal/modal systems beyond Major and Tonal Minor.
- Dark Harmony expansion with additional layers such as Dominant Tension and Borrowed / Minor Colors,
  including advanced altered-dominant and augmented-sixth vocabularies.
- Additional functional harmonic layers beyond the v1 module vocabularies.
- Ukulele, Melodica, and other additional fully implemented instrument profiles.
- Intra-step bass patterns.
- Tempo maps/tempo automation inside progression.
- Meter maps/time-signature changes inside progression.
- Persistent cross-session Undo history / full project version history.
- Multiple independent Melody Tracks or arbitrary per-step melody layering beyond the single v1 track.
- Mobile-first UI.
- Cloud sync, accounts, collaboration, and sharing services.
- Rendered-audio export to WAV/MP3 (architecture prepared in v1; implementation deferred).
- User-facing import/management of arbitrary external SF2/SF3/SFZ sound banks; the v1 audio architecture
  is prepared for alternate providers, but the launch experience uses the bundled HQ Piano, Guitar, and
  FluidR3_GM-derived local providers.

The future list records scope only; each implementation still requires its own explicit authorization
and task plan.

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
- **Progression View**: The single project presentation mode used by every measure in My Progression.
  Harmonic, Piano, Guitar, and Tablature use independent full-width vertical measure sections with one
  horizontal step row per measure; Staff groups sequential measures into continuous systems. The five
  values are `Harmonic`, `Piano`, `Staff`, `Guitar`, and `Tablature`.
- **Score System**: A responsive Staff projection containing one or more consecutive measures and all
  visible Melody/Harmony staves on a shared temporal x-axis.
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
- **Chord Melody Recipe**: Step-local Pitch Motion, Rhythm, Connection, Grid, and Octave Offset settings
  from which CadenceFlow deterministically derives a monophonic phrase using the Chord Step's current
  contextual upper voicing.
- **Melody Track**: The single project-level presentation, playback, and export lane for all derived
  Chord Melody phrases, with one default instrument assignment and saved Mute, Solo, and Volume settings.
- **Melody Instrument**: One canonical General MIDI catalog entry containing stable identity, program,
  family, label, clef, range, and optional local realtime sample metadata for already-derived monophonic
  notes; it is not a full chord-realization Instrument Profile.
- **Effective Melody Instrument**: The selected Chord Step's explicit Melody instrument override when
  present, otherwise the Melody Track's project-level default.
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
- **SC-018**: For every supported Melody Pitch Motion, Rhythm, Connection, and Grid in the US12 acceptance fixture, 100% of
  generated events use only the source Chord Step's contextual upper pitches, retain exact Rational
  ordering and duration through Staff, playback, MIDI, MusicXML, save/reopen, and Undo/Redo, and never
  serialize a generated-note list.
- **SC-019**: Across 1280×720, 1920×1080, light/dark themes, and 200% zoom, My Progression exposes no
  `Mixed` state, Staff systems retain aligned Melody/Harmony attacks and readable reflow without
  page-level horizontal overflow, and all progression interactions remain operable by mouse and keyboard.
- **SC-020**: In Staff View, 100% of acceptance-fixture Chord and Rest Steps can be selected, inspected,
  reordered, removed, and reached during playback without a duplicate Step-card strip; Melody actions
  can be opened by pointer and keyboard, and Harmonic/Piano retain their existing Step-card interactions.
- **SC-021**: All ten supported Pitch Motions are reachable and distinguishable in the grouped Melody
  browser by pointer and keyboard; selection updates the existing draft and notation preview without
  changing unrelated axes, and the dialog remains usable without page-level overflow at both supported
  desktop sizes and 200% zoom.
- **SC-022**: All 128 GM melodic programs appear exactly once in the shared grouped/searchable picker and
  export with their canonical program/name metadata. Global inheritance and explicit Step overrides survive
  save/reopen and Undo/Redo, repeated Steps remain independent, and all 128 manifest-backed local timbres
  load on demand without eager loading. A mixed-instrument fixture maps every unique effective instrument
  to exactly one separate Staff line, MIDI track, and MusicXML part, with no missing or duplicated Melody
  event; a failed local load is reported without fallback or blocking export.
- **SC-023**: In the Guitar acceptance fixture, Guitar and Tablature views render the same canonical chord
  shapes, six-string fret positions, mute/open state, and fingering; Scale Tones remain in-position and
  do not mutate saved harmonic or performance data.
- **SC-024**: Guitar playback uses the selected HQ Samples or SoundFont provider, applies the configured
  bounded strum spread, and leaves Piano/Melody audio state unchanged when the active view changes.
- **SC-025**: Voice-leading, reharmonization, modulation, and cadence-formula actions expose their
  candidate rationale before explicit apply; applied results are undoable and preserve canonical Step
  identity and exact timing semantics.
- **SC-026**: The Scales & Modes Explorer exposes every current scale definition and canonical formula,
  provides Piano/Guitar projections and audition without implicit mutation, and contains the modal
  surface at accepted desktop sizes without page-level overflow.
- **SC-027**: Enabling Suzuki colors changes only visible notehead styling; saved semantic notes, playback,
  MIDI, MusicXML, and non-color accessibility labels remain byte/behavior compatible.
- **SC-028**: Schema v6 is the current codec and JSON Schema contract; v5 projects migrate through the
  single v5-to-v6 cutover, and unsupported future schema versions are rejected.
- **SC-029**: In the global All Steps & Measures Inspector, engine/tone selectors are absent while
  instrument, volume, mute, solo, provider state, and Retry remain available; `AudioEnginesInspector`
  contains the Piano/Guitar engine and tone selectors; and clicking `PianoAudioStatus` does not open a
  settings surface. Error/fallback status exposes Retry without becoming a settings control.
- **SC-030**: Schema v6 migrates v5 fixtures with defaults for absent Piano/Guitar engine and SoundFont
  tone settings, persists all four fields plus `noteColorMode` through codec, IndexedDB autosave/recovery,
  portable import/export, and Undo/Redo, and rejects future schema versions. The migration is one atomic
  v5-to-v6 cutover with no separate engine/tone version.
- **SC-031**: In a deterministic Progressions Matrix fixture, desktop acceptance shows three horizontal
  zones (`Secondary Dominants`, `Main Chords`, `Modal Interchange`) and six stable primary columns;
  secondary-dominant source cards and their Main Chord targets read as vertically related, while Modal
  Interchange remains meaningfully aligned without artificial equalization. Auxiliary diminished/legacy
  cards remain readable outside the primary columns when present, and the source/target relationship is
  understandable without Inspector.
- **SC-032**: Under deterministic desktop layout pressure, the Progressions Matrix preserves semantic
  column order, zone order, visible directed-tension arrows/highlights, and source/target relationships
  through compression or wrapping without becoming an unrelated independent grid. Acceptance verifies
  this at the supported desktop sizes and a constrained layout-pressure fixture; pixel-perfect reference
  reproduction, third-party branding, and verbatim reference text are not required.

- **SC-033**: Matrix is used for harmonic discovery and My Progression for temporal editing; both expose consistent canonical chord meaning, while edits and playback remain associated with the correct Steps.
- **SC-034**: Across preview, audition, cancel, and apply flows, preview/cancel produce zero Project/history mutations and each Apply produces exactly one command/history entry with correct Undo/Redo.
- **SC-035**: Harmonic-role classifications are derived and accessible without color alone; no role is written into serialized `MelodyEvent`, and T197+T192 remains the only schema-v6 scope.
- **SC-036**: Shared timeline selection and Rational duration resize preserve exact timing, selection boundaries, and Step identity; one completed resize produces one command transaction.
- **SC-037**: Alternatives and quick-command candidates are deterministic for fixed project inputs, expose rationale, and cannot mutate the Project before Apply.
- **SC-038**: Generated and authored Melody resolve through one effective-phrase contract; authored note IDs, exact pitch, and Rational onset/duration survive v7 save/load and Undo/Redo, while schema v6 remains compatible.
- **SC-039**: Song Sections preserve stable IDs, names, and valid start-Step boundaries through v8 migration and round-trip; no repeat graph or arrangement-instance semantics are implied.
- **SC-040**: Normal-scale captures verify Midi Settings open/closed, all three viewports, both themes and pitch grids, no header/music overlap, keyboard focus return, exact cursor controls and actual-name status bar with full title/polite announcements. Mocked Web MIDI verifies granted startup automatic connection/selection/arming without prompts, delayed-query/access OFF cancellation, blur input rejection and safe focus resume, manual/safety OFF during suspension without revival, explicit permission with `sysex:false`, unsupported/denied/no-device/multiple-device states, device selection/disconnect, and Note On filtering across channels. One accepted Note On inserts one exact-pitch authored note and one Undo entry at the absolute cursor, then advances by the chosen ordinary/dotted/triplet Rational duration without grid re-quantization; Note Off/velocity-zero/CC/pitchbend insert nothing. Manual MIDI `0` and `127`, grid Snap placement, cross-Step/bar/System insertion, generated Melody materialization and exact Undo/Redo pass. Overflow and stale/late callbacks preserve Project/history/cursor and do not audition. Arming, 250 ms audio preview, cancellation, and preservation of unarmed Enter behavior are verified. Physical MIDI hardware availability is reported separately from mocked-browser coverage.
- **SC-041**: With one selected visible Matrix chord, one `+` or keypad Add press adds exactly one
  Step and one history entry, matching Ctrl+click and Undo/Redo; held-key repetition, editable
  focus, dialogs, and no-selection states add zero Steps. Existing route guards remain effective.
- **SC-042**: A4 print preview and Save as PDF preserve ordered measures, chord symbols, direction
  arrows, and available compact Guitar diagrams across short and long progressions without
  clipping; grayscale remains understandable, and opening/printing produces zero Project/history
  mutations. Release evidence records the exact status of offline assets, schema compatibility,
  regression tests, build, and licensing disposition.
- **SC-043**: Measure context actions always target the displayed Measure rather than selected Step,
  open by pointer and keyboard, and close with focus return. Deleting first, middle, last, and partial
  final Measures removes exactly their authored interval, shifts subsequent Steps and sections,
  preserves Harmony and effective authored/generated Melody outside the interval (including notes
  crossing both boundaries and same note IDs in different owners), instruments and recipes where
  applicable, and produces exact single-entry Undo/Redo. Empty progression, loop/selection
  reanchoring, active branch explanations, all five Progression views and Piano Roll, viewport
  clamping at three sizes in both themes, and portable save/load/history behavior are verified.

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
