# T212 representation decision

Status: implementation decision recorded before product edits. Scope is the
saved progression selected-range operation; this file does not accept T212.

## Decision

Persist an optional, integer `transpositionSemitones` on each ChordStep and
RestStep. The semantic default is zero. Schema v10 migration writes zero for
every existing step in both the saved progression and temporary branch; the
v10 portable schema permits omission only at TypeScript construction seams,
while encoding always emits the integer. Offsets are additive. They change the
concert pitch of material owned by that Step without changing its harmonic
function, variant, Project tonic, stored authored pitch, manual voicing, custom
bass pitch, source recipe, or stable IDs.

The offset applies to effective Harmony, bass, and Melody output for the owner.
Rest Steps therefore carry the field for authored Melody even though they have
no Harmony output. Matrix identities and candidate previews remain global and
are not Step-owned output.

The transposition operation updates only selected stable Step IDs in one
command/Undo entry. The toolbar keeps a draft integer and preview; Cancel and
Escape do not mutate Project. Apply validates the complete proposed state
before returning a changed Project. Every raw stored pitch is checked, including
manual upper voicing, custom bass, and authored notes after the progression end
or otherwise clipped from the effective timeline. Contextual source realizations
and effective Melody are checked as well. Any pitch outside MIDI 0..127 rejects
the whole Apply.

## Pitch frame and spelling

Persisted pitch values stay in their source frame. A concert MIDI note entered
at 0 or 127 may invert through an owner offset below 0 or above 127. To preserve
these legal concert inputs without clamping or rejection, a persisted pitch
keeps a legal MIDI anchor in `0..127` plus optional
`transpositionCompensationSemitones` in `-127..127`. Its source coordinate is
`anchorMidi + compensation`; `exactPitch` remains strict to concert MIDI
`0..127` and never creates a compensation. Effective output is
`anchorMidi + compensation + ownerOffset`, validated back into concert
`0..127`. This keeps the stored Step source context at the legal anchor, so
boundary compensation cannot feed back into unselected automatic voicing.
Offset zero preserves stored spelling for ordinary pitches.
For nonzero offsets, the projected spelling is the canonical major tonic
spelling from `domain/harmony/spelling.ts` for the resulting pitch class
(including its established flat spellings), unless the persisted source pitch
carries a `transpositionSpellingOverride` whose pitch class matches the current
concert result. Concert editors store an explicit noncanonical spelling there
while keeping the source-frame `spelling` valid for its MIDI anchor. A later
Step offset that makes this spelling incompatible falls back to the canonical
spelling; selected-range Apply clears the selected owners' spelling overrides
so the newly transposed result follows the shared canonical policy.
`exactPitch` recomputes the octave from MIDI. This avoids
octave-inconsistent enharmonics in MusicXML. When an editor writes a concert
pitch back to an owner, it subtracts that owner's offset exactly once and
stores the source coordinate as an in-range anchor plus compensation if needed.
Existing note spelling is preserved when the concert MIDI is unchanged for the
same note and owner; new or moved notes preserve their selected concert spelling
through the optional override. The effective timeline's
`sourcePitchMidi` remains in source frame so local transposition does not alter
source-based dynamics. When a generated phrase must be stabilized as authored,
each note retains the generator's source pitch in `AuthoredMelodyNote.sourcePitchMidi`;
portable encoding carries that field so later edits and dynamics keep the same
source identity.

## Resolution boundaries and context

`realizeOrderedPianoProgression` is the canonical ordered realization used by
`effectiveTimeline.ts`, notation and audio. It must realize each chord and its
voice-leading context in the source frame, then project only that Step's
returned upper and bass pitches by the local offset. Later automatic Steps use
the same unshifted contextual realization they used before T212; a selected
Step's shifted output must never feed their `previousPitches` or
`previousBassPitch`. The existing register override already separates local
output from ordered context and is the reference behavior.

Direct chord-symbol projections use a shared Step-aware chord resolver: shift
root and bass pitch classes/spellings while preserving the harmonic identity,
quality, variant, and voicing intervals. Direct Harmony calls that represent
matrix candidates remain on `realizeChord`.

`createEffectiveMelodyTimeline` projects authored notes once by their owner
offset and keeps `sourcePitchMidi` raw. Generated notes use the owner's shifted
chord output and the next chord's shifted target output. Because changing a
selected next chord can change an unselected generated owner's approach note,
the transpose command compares effective generated phrases before and after.
Any affected unselected generated owner is materialized as authored source-frame
notes, preserving event IDs, sourceRecipe, instrument override, onset and
duration. Selected generated owners remain generated when the shifted recipe
projection is exactly the previous effective phrase shifted by the requested
delta; otherwise they are materialized with sourceRecipe retained. This keeps
all unselected Melody output stable without changing its recipe metadata.

`applyAuthoredMelodyTransaction` is the concert-to-source write boundary for
Piano Roll, Staff, and T210 MIDI insertion. It must expose and manipulate
concert pitches in its absolute edit payload, normalize loaded owner notes to
concert pitch, then subtract the destination offset when saving. Cross-owner
moves therefore use the destination owner's frame. T215 measure deletion has
its own owner-transfer transaction and must use the same conversion helpers
when it moves/materializes notes.

## Alternatives considered

Materializing pitch edits into every raw upper voice, bass, and melody note
would duplicate the same transformation across authored and generated owners,
lose generated context behavior, and make global tonic changes or undo harder
to reason about. Changing the Project tonic would transpose unselected Steps
and alter functional meaning. A Step-local additive source-frame offset has one
reversible conversion and preserves harmonic identity, subject to the context
and migration requirements above.

## Evidence checked

- `domain/progression/step.ts`: ChordStep and RestStep have stable IDs, exact
  authored pitches and no local transposition field.
- `domain/project/migrations.ts`: current schema is v9; migrations are chained
  and explicitly migrate `progression.steps` and `temporaryBranch.steps`.
- `persistence/portableProject.ts` and
  `specs/001-cadenceflow-core-studio/contracts/cadenceflow-project.schema.json`:
  portable encode/decode and the v9 strict schema are the persistence boundary.
- `instruments/piano/progressionRealization.ts`: ordered voice leading carries
  previous upper pitches and bass; local register already separates output
  from later source context.
- `domain/melody/effectiveTimeline.ts` and `domain/melody/projection.ts`:
  authored notes are direct stored pitches, while generated notes consume both
  owner and next-chord realization targets.
- `app/commands/authoredMelodyTransaction.ts`: concert absolute edits,
  generated conversion, and cross-owner writes share one atomic Project
  transaction; current saves need an explicit destination-frame conversion.
- `export/musicxml/projection.ts`: MusicXML validates pitch spelling against
  MIDI and derives MusicXML octave, so projected exact pitch spelling must be
  internally consistent.
- `domain/harmony/pitch.ts` and `domain/melody/types.ts`: the existing exact
  pitch constructor and authored phrase snapshot enforce concert MIDI `0..127`;
  v10 therefore adds an optional bounded source compensation while concert
  editors and event output retain strict bounds.
- `app/App.tsx` T210 MIDI insertion supplies actual concert MIDI pitches to
  the authored transaction, which is the correct inverse-conversion seam.

## Implementation exit criteria

Focused tests must establish v9→v10 migration and portable round-trip, including
concert MIDI 0/127 insertion under offsets that require boundary compensation;
identity-preserving source-frame storage; exact transposition of piano, bass,
authored/generated Melody and Staff/MIDI/MusicXML output; stable unselected
Harmony voicings and performance events after a neighboring selected
transposition; stable unselected generated Melody after next-target changes;
cross-owner edit and T215 measure-deletion frame conversion; atomic range
rejection including dormant notes; one Undo entry; and cancel/no-op behavior.
T212 remains unchecked until independent acceptance.
