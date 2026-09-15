# Graph Report - .  (2026-09-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2448 nodes · 7009 edges · 155 communities (137 shown, 18 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `43dab8fb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 109
- Community 110
- Community 112
- Community 114
- Community 115
- Community 119
- Community 121
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 134

## God Nodes (most connected - your core abstractions)
1. `Rational` - 178 edges
2. `MusicalDuration` - 125 edges
3. `Project` - 93 edges
4. `ExactPitch` - 88 edges
5. `App()` - 74 edges
6. `createDefaultProject()` - 59 edges
7. `ChordStep` - 58 edges
8. `Meter` - 52 edges
9. `AudioNoteEvent` - 50 edges
10. `AudioClock` - 45 edges

## Surprising Connections (you probably didn't know these)
- `clearSelection()` --indirect_call--> `selectStep()`  [INFERRED]
  tests/unit/progression/selection-dismissal.test.ts → src/app/commands/progressionCommands.ts
- `contextFor()` --calls--> `getHarmonicModule()`  [EXTRACTED]
  tests/integration/us12-melody-acceptance.test.ts → src/domain/harmony/moduleRegistry.ts
- `DualSurfaceView()` --indirect_call--> `ProgressionStepCard()`  [INFERRED]
  tests/unit/progression/step-duration-editing.test.ts → src/ui/progression/ProgressionStepCard.tsx
- `Harness` --references--> `AppStore`  [EXTRACTED]
  tests/unit/progression/selection-dismissal.test.ts → src/app/appStore.ts
- `add()` --calls--> `addMatrixPreview()`  [EXTRACTED]
  tests/integration/branch-undo.test.ts → src/app/commands/matrixCommands.ts

## Import Cycles
- 3-file cycle: `src/domain/progression/presets.ts -> src/domain/project/factory.ts -> src/domain/project/project.ts -> src/domain/progression/presets.ts`
- 3-file cycle: `src/domain/progression/step.ts -> src/domain/timing/duration.ts -> src/domain/timing/meter.ts -> src/domain/progression/step.ts`

## Communities (155 total, 18 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (42): SetGroovePayload, EffectiveStepTiming, millisecondsToBeats(), minRational(), numberToRational(), PERFORMANCE_GATE_RATIO, PerformanceBeatNoteEvent, performanceEventComparator() (+34 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (42): MidiProjection, MidiProjectionMelodyNote, MidiProjectionNote, projectProgressionToMidi, assertUInt(), buildTrackEvents(), compareEvents(), encodeTextMeta() (+34 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (48): MusicXmlArticulation, MusicXmlDiagnostic, MusicXmlHarmonyMapping, MusicXmlKeySignature, MusicXmlPitchSpelling, addFragment(), addMelodyRawEvent(), buildMelodyPart() (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (15): HqPianoManifest, resolveSampleRegion(), validatePianoManifest(), ActiveNodeEntry, ActivePlaybackRecord, HqSamplePianoProvider, HqSamplePianoProviderOptions, calculateAudioBufferBytes() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (32): AddBranchPreviewCommand, DiscardBranchCommand, SetBranchIntentCommand, StartBranchCommand, DeleteCustomPresetCommand, OpenProjectTabsSource, OpenProjectTabsState, IconName (+24 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (10): PlaybackController, ProgressionTransportControls(), ProgressionTransportControlsProps, generateTransportSessionId(), PlayFromHereOptions, PlayOptions, TransportPlayMode, TransportState (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (40): dark-harmony, progressions, enum, type, format, type, items, type (+32 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (34): addBranchPreview(), AddBranchPreviewPayload, applyBranchCommand(), BranchCommand, BranchStateSnapshot, CommitBranchCommand, CommitBranchPayload, discardBranch() (+26 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (12): ActivePlayback, assertMelodyEvents(), clampMidi(), InstrumentLoader, MELODY_SAMPLE_FILES, MelodySamplePlayer, MelodySoundFontProvider, MelodySoundFontProviderOptions (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (18): ChordExtension, EMPTY_HARMONIC_VARIANT, HarmonicVariant, HarmonicVariantValidation, emptyProgression(), LoopRegion, Progression, ChordStep (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (17): check-prerequisites.sh script, check_dir(), check_file(), get_feature_paths(), get_repo_root(), has_jq(), _persist_feature_json(), resolve_specify_init_dir() (+9 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (18): AppStoreChange, MatrixSessionState, SetTonicCommand, SetTonicPayload, switchModule(), SwitchModuleCommand, SwitchModulePayload, AppliedCommand (+10 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (16): AudioChannelRole, AudioNoteEvent, InstrumentAudioProvider, PlaybackScope, RealizedStepEvents, MelodyPerformanceEvent, PlaybackControllerOptions, LookAheadSchedulerOptions (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (34): Alteration, SeventhKind, Suspension, GrooveFeel, add9Degree(), alterationDegree(), degreesForVariant(), extensionDegree() (+26 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (24): realizeChord(), formatMusicalDuration(), ProgressionMeasureItem, realizeProgressionStepPitches(), realizeProgressionStepRealization(), Icon(), PATHS, MelodyContextMenu() (+16 more)

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (33): App(), deleteCustomPreset(), AddRestStepCommand, AddRestStepPayload, editStepPerformance(), EditStepPerformanceCommand, EditStepPerformancePayload, removeStep() (+25 more)

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (33): assertInteger(), closeElement(), element(), emptyElement(), escapeXml(), selfClosingElement(), validateMelodyNote(), validateMelodyPart() (+25 more)

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (26): createMatrixChordStep(), createDefaultProject(), halfChordProject(), canonicalProject(), freezeChordWithMelody(), ascii(), chord(), makeManualProject() (+18 more)

### Community 18 - "Community 18"
Cohesion: 0.07
Nodes (30): src/app/appStore.ts, src/app/commands/**/*.ts, src/app/history/**/*.ts, compilerOptions, exactOptionalPropertyTypes, lib, module, moduleResolution (+22 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (25): buildManifest(), checkFfmpeg(), decodeAudioFile(), downloadAndEncodeSample(), execFileAsync, main(), PianoRootDefinition, PINNED_SALAMANDER_REVISION (+17 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (26): assertSafeInteger(), divideRational(), gcd(), Rational, createProgressionTimeline(), lookupStepBoundary(), LoopRegion, ProgressionTimeline (+18 more)

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (28): appliedWithSnapshots(), applyMelodyCommand(), applyMelodyRecipe, createPatchMelodyTrackSettingsCommand(), createRemoveMelodyRecipeCommand(), createSetMelodyRecipeCommand(), findChordStep(), findStep() (+20 more)

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (30): cello, clarinet, flute, instrument, muted, oboe, solo, synth-lead (+22 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (25): applyInverseCommand(), setTonic(), restoreAllTemplates(), setCardViewOverride(), setGlobalCardView(), setExpertiseMode(), SetExpertiseModeCommand, setStaffBassVisibility() (+17 more)

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (25): PatchMatrixTemplatePayload, SetCardViewOverrideCommand, SetCardViewOverridePayload, SetGlobalCardViewCommand, SetGlobalCardViewPayload, BassSettings, CardViewId, countStepCreationOverrides() (+17 more)

### Community 25 - "Community 25"
Cohesion: 0.10
Nodes (8): ProjectControllerOptions, Project, AutosaveEngine, AutosaveOptions, DebouncedAutosaveEngine, NOTE: Does NOT cancel pending saves, mutate Project payloads, or delete any…, NOTE: Call `flush()` prior to `dispose()` if pending state must be guaranteed…, ProjectRepository

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (28): assets, cello-mp3.js, clarinet-mp3.js, flute-mp3.js, lead_1_square-mp3.js, oboe-mp3.js, violin-mp3.js, attributionFile (+20 more)

### Community 27 - "Community 27"
Cohesion: 0.13
Nodes (25): createSetStepDurationCommand(), RestoreMeterAndStepsCommand, RestoreMeterAndStepsPayload, SetGrooveCommand, setMeter(), SetMeterCommand, SetMeterPayload, SetStepDurationCommand (+17 more)

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (19): barsToBeats(), beatsToBars(), durationBars(), durationDotted(), durationTriplet(), parseMusicalDuration(), DURATION_PRESETS, DurationPreset (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.07
Nodes (27): down, down-up, eighth, eighth-triplet, grid, inside-out, octaveOffset, outside-in (+19 more)

### Community 30 - "Community 30"
Cohesion: 0.08
Nodes (27): harmonic, piano, staff, enum, properties, restStep, $ref, type (+19 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (24): SetStepDurationPayload, StepPerformance, StepCreationDefaults, MusicalDuration, fullBarDurationBeats(), measureLengthBeats(), PianoPerformanceInspectorProps, createStep() (+16 more)

### Community 32 - "Community 32"
Cohesion: 0.10
Nodes (23): MelodyGrid, MelodyPattern, melodyTupletMarks(), MusicXmlMelodyMeasureEvent, CANONICAL_MATRIX, CanonicalCase, contextFor(), DURATIONS (+15 more)

### Community 33 - "Community 33"
Cohesion: 0.14
Nodes (26): StaffProjectionDto, accidentalToken(), configureSvg(), createGapNote(), createRestNote(), createSequenceTuplets(), createStaffNote(), exactDurationFraction() (+18 more)

### Community 34 - "Community 34"
Cohesion: 0.19
Nodes (18): ApplyPresetPayload, BUILT_IN_PRESETS, getBuiltInPresetById(), getBuiltInPresets(), FunctionalPreset, PresetApplyMode, realizePresetSteps(), resolveTonicNumber() (+10 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (9): AudioProviderState, addSoundBank(), midiChannelForRole(), ScheduledNoteTimer, SPESSA_CHANNELS, SpessaSoundFontProvider, SpessaSoundFontProviderOptions, PianoAudioStatus() (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.14
Nodes (21): assertVelocity(), DynamicsViewPreference, PianoArticulation, DEFAULT_MUSICAL_DYNAMIC_VELOCITIES, DynamicsPresetDescriptor, DynamicsPresetId, MusicalDynamicLabel, PIANO_DYNAMICS_PRESETS (+13 more)

### Community 37 - "Community 37"
Cohesion: 0.14
Nodes (21): snapshotStepPerformance(), ajv, decodeDuration(), decodeDurationDisplayHint(), decodeMelodyRecipe(), decodeMelodyTrackSettings(), decodePortableProject(), decodeStep() (+13 more)

### Community 38 - "Community 38"
Cohesion: 0.08
Nodes (24): DOM, DOM.Iterable, src, compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, exactOptionalPropertyTypes (+16 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (10): useStore(), AppStore, ProjectCommandHandler, setTempo(), SetTempoCommand, addHistory(), controllers, databases (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (24): denominator, grouping, numerator, rational, enum, minimum, type, items (+16 more)

### Community 41 - "Community 41"
Cohesion: 0.09
Nodes (23): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, libxmljs2, devDependencies, eslint (+15 more)

### Community 42 - "Community 42"
Cohesion: 0.16
Nodes (18): ApplyPresetCommand, saveCustomPreset(), SaveCustomPresetCommand, createFunctionalPreset(), deserializePreset(), PresetRealizationResult, PresetSource, PresetStep (+10 more)

### Community 43 - "Community 43"
Cohesion: 0.14
Nodes (16): renameProject(), PortableProjectExport, InvalidProjectNameError, MAX_PROJECT_NAME_LENGTH, normalizeProjectName(), ProjectMetadata, downloadPortableProject(), PortableProjectActions() (+8 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (13): RenameProjectCommand, formatProjectOperationError(), ProjectNotFoundError, ProjectOperationError, createAutosaveEngine(), sanitizePortableProjectFilename(), createProjectRepository(), PersistenceTestState (+5 more)

### Community 45 - "Community 45"
Cohesion: 0.15
Nodes (16): HarmonicModuleId, baseScore(), recommend(), RecommendationContext, RecommendationFactor, IntentAdjustment, TONICS, DARK_HARMONY_RULES (+8 more)

### Community 46 - "Community 46"
Cohesion: 0.13
Nodes (19): MelodyStateSnapshot, SetMelodyRecipePayload, SetMelodyTrackSettingsPayload, MelodyProjectionInput, ChordMelodyRecipe, MelodyOctaveOffset, MelodyTrackSettings, MELODY_GRID_LABELS (+11 more)

### Community 47 - "Community 47"
Cohesion: 0.11
Nodes (4): AudioClock, ISpessaSynth, FakeAudioClock, FakeClock

### Community 48 - "Community 48"
Cohesion: 0.18
Nodes (16): identityForMatrixFunction(), realizeStepAudioEvents(), modeForModule(), getHarmonicModule(), expandedStripEntries(), MatrixPosition, MatrixRoute, RecommendationResult (+8 more)

### Community 49 - "Community 49"
Cohesion: 0.17
Nodes (18): ChordSpelling, DiatonicStep, normalizePitchClass(), PitchSpelling, ValidationResult, resolveBassPitch(), computeVoiceLeadingDistance(), scoreVoicingCandidate() (+10 more)

### Community 50 - "Community 50"
Cohesion: 0.14
Nodes (20): MelodyEvent, OrderedPianoRealization, addStepSpan(), barIndexForPosition(), contextForProject(), createMelodyEvent(), createMelodyTimeline(), endOfSpan() (+12 more)

### Community 51 - "Community 51"
Cohesion: 0.19
Nodes (11): RestStep, equalRational(), ONE, groove(), quantizeSwingAmount(), SWING_QUANTIZATION_BASE, createRichProjectFixture(), baseInput (+3 more)

### Community 52 - "Community 52"
Cohesion: 0.15
Nodes (20): ZERO, createContext(), freezeMeter(), hasAuthoredMelody(), MELODY_MIDI_METADATA, MIDI_PPQ, MidiProjectedNote, MidiProjectionMelody (+12 more)

### Community 53 - "Community 53"
Cohesion: 0.15
Nodes (7): ScheduledPlayback, PreviewAuditionController, PreviewAuditionControllerOptions, PreviewCapableProvider, initAudioTestHooks(), root, MockProviderOptions

### Community 54 - "Community 54"
Cohesion: 0.21
Nodes (15): baselineFunctionIdentities(), recommendationVocabulary(), BASELINE_SECONDARY_TARGETS, baselineSecondaryDiminishedFunctions(), DARK_HARMONY_COLOR_FUNCTIONS, DARK_HARMONY_CORE_FUNCTIONS, DARK_HARMONY_MODULE, DARK_HARMONY_NATURAL_VARIANTS (+7 more)

### Community 55 - "Community 55"
Cohesion: 0.19
Nodes (14): ascendingIndexes(), MELODY_GRID_DURATIONS, melodyGridDuration(), orderMelodyPitches(), patternIndexes(), offsetPitches(), realizeChordMelody(), validateInput() (+6 more)

### Community 56 - "Community 56"
Cohesion: 0.14
Nodes (6): createDefaultMelodyTrackSettings(), CURRENT_PROJECT_SCHEMA_VERSION, InvalidProjectDataError, migrateProjectData(), migrateV1ToV2(), UnsupportedProjectVersionError

### Community 57 - "Community 57"
Cohesion: 0.18
Nodes (14): MelodyStaffEntry, MelodyStaffMeasure, MelodyTimeline, projectPitchesToStaff(), StaffNoteDto, StaffSequenceEntry, StaffSequencePosition, exact() (+6 more)

### Community 58 - "Community 58"
Cohesion: 0.15
Nodes (8): CadenceFlowDatabase, CadenceFlowDexie, createCadenceFlowDb(), getActiveDb(), MetadataRecord, ProjectRecord, DexieProjectRepository, normalizeOpenProjectIds()

### Community 59 - "Community 59"
Cohesion: 0.11
Nodes (17): node, playwright.config.ts, scripts/**/*.ts, vite.config.ts, vitest.config.ts, compilerOptions, lib, module (+9 more)

### Community 60 - "Community 60"
Cohesion: 0.16
Nodes (16): emptyCard(), patchMatrixTemplate(), PatchMatrixTemplateCommand, resetCardTemplate(), ResetCardTemplateCommand, ResetCardTemplatePayload, resetMatrixScope(), ResetMatrixScopeCommand (+8 more)

### Community 61 - "Community 61"
Cohesion: 0.25
Nodes (3): copyProjectWithIdentity(), importedCopyName(), ProjectController

### Community 62 - "Community 62"
Cohesion: 0.18
Nodes (10): GlobalTiming, MusicXmlMelodyRestEvent, acceptanceProject(), chordStep(), crossingProject(), melodyChordStep(), melodyProject(), performance() (+2 more)

### Community 63 - "Community 63"
Cohesion: 0.12
Nodes (17): build-tension, darken-emotional, neutral, resolve, smooth-voice-leading, surprise, enum, type (+9 more)

### Community 64 - "Community 64"
Cohesion: 0.18
Nodes (12): null, object, string, $ref, type, properties, loopRegion, selectedStepId (+4 more)

### Community 65 - "Community 65"
Cohesion: 0.20
Nodes (14): addChordAndCheck(), addStepsUntil(), exerciseDesktopStudio(), expectMatrixAndInspectorAdjacent(), expectNoPageHorizontalScroll(), expectProgressionBelowMatrix(), expectVisibleControlsFit(), expectWrappedProgressionFlow() (+6 more)

### Community 66 - "Community 66"
Cohesion: 0.12
Nodes (16): scripts, build, dev, format:check, lint, prepare:piano-bank, prepare:test-fixtures, preview (+8 more)

### Community 67 - "Community 67"
Cohesion: 0.21
Nodes (9): DEFAULT_METRONOME_PITCHES, DEFAULT_METRONOME_VELOCITIES, generateCountInEvents(), generateMetronomeBarEvents(), getBarDurationSeconds(), getBarLengthBeats(), MetronomeClickPitches, MetronomeClickProvider (+1 more)

### Community 68 - "Community 68"
Cohesion: 0.17
Nodes (4): ensureHistoryControlsVisible(), ensurePreviewHarmonyVisible(), ensureRecommendationContextVisible(), assertFreshHistory()

### Community 69 - "Community 69"
Cohesion: 0.13
Nodes (15): ajv, ajv-formats, dexie, dependencies, ajv, ajv-formats, dexie, react (+7 more)

### Community 70 - "Community 70"
Cohesion: 0.19
Nodes (9): addRestStep(), replaceStep(), resetStepPerformance(), setStepDuration(), resetChordStepPerformance(), TransportBar(), createChordProject(), recipe (+1 more)

### Community 71 - "Community 71"
Cohesion: 0.20
Nodes (12): MusicXmlNoteEvent, ascii(), canonicalProject(), chordStep(), ParsedMidi, ParsedMidiEvent, parseSmf(), performance() (+4 more)

### Community 72 - "Community 72"
Cohesion: 0.20
Nodes (10): ascii(), assertNoHorizontalScroll(), assertThemesAndLayout(), exportFiles(), parseMelodyMidi(), parseMelodyMusicXml(), readU16(), readU32() (+2 more)

### Community 73 - "Community 73"
Cohesion: 0.10
Nodes (22): activeModule, createdAt, customPresets, defaults, duration, globalTiming, groove, harmonicFunction (+14 more)

### Community 75 - "Community 75"
Cohesion: 0.20
Nodes (13): assertManifest(), assertRecord(), expectedAssets, manifestPath, MelodyAssetRecord, MelodyManifest, publicFilePath(), publicRoot (+5 more)

### Community 76 - "Community 76"
Cohesion: 0.29
Nodes (10): PerformanceStepRealization, assertMidiNumber(), ExactPitch, midiToOctave(), midiToPitchClass(), ArticulationOptions, NoteTimingIntent, resolveArticulationTiming() (+2 more)

### Community 78 - "Community 78"
Cohesion: 0.26
Nodes (12): BaseChordQuality, HarmonicFunctionCategory, DarkFunctionSpec, targetRoot(), FunctionSpec, getProgressionsFunction(), identity(), PROGRESSIONS_FUNCTIONS (+4 more)

### Community 79 - "Community 79"
Cohesion: 0.23
Nodes (12): HarmonicFunctionIdentity, categoryFor(), curatedAlternatives(), identity(), MAJOR_TO_MINOR, mapFunctionAcrossModules(), MINOR_TO_MAJOR, ModuleSwitchPlan (+4 more)

### Community 80 - "Community 80"
Cohesion: 0.15
Nodes (12): displayName, instrumentId, metadata, encoding, sourceInstrument, sourceLicense, sourceRepository, sourceRevision (+4 more)

### Community 81 - "Community 81"
Cohesion: 0.15
Nodes (13): feel, straight, swing, swingAmount, groove, enum, additionalProperties, properties (+5 more)

### Community 82 - "Community 82"
Cohesion: 0.19
Nodes (10): BassChoice, BassOctaveOffset, PIANO_RANGE_MAX_MIDI, PIANO_RANGE_MIN_MIDI, validateManualVoicing(), formatPitchName(), PC_TO_DEFAULT_SPELLING, PianoVoicingEditor() (+2 more)

### Community 83 - "Community 83"
Cohesion: 0.33
Nodes (10): formatChordPitch(), keyClassName(), NATURAL_KEY_LABELS, PianoCardView(), BLACK_PITCH_CLASSES, buildPianoKeyboardLayout(), normalizeChordPitches(), PianoKeyboardKey (+2 more)

### Community 84 - "Community 84"
Cohesion: 0.09
Nodes (22): compositionIntent, originAtEnd, steps, additionalProperties, additionalProperties, type, $defs, chordStep (+14 more)

### Community 85 - "Community 85"
Cohesion: 0.33
Nodes (7): formatChordSymbol(), formatPitchSpelling(), ChordCard(), CustomizedIndicator(), formatPitch(), StaffCardView(), StaffOctaveDirection

### Community 86 - "Community 86"
Cohesion: 0.20
Nodes (9): defaultTonicSpelling(), MAJOR_INTERVALS, MAJOR_TONICS, MINOR_TONICS, NATURAL_MINOR_INTERVALS, NATURAL_PC, STEPS, PITCH_CLASSES (+1 more)

### Community 87 - "Community 87"
Cohesion: 0.26
Nodes (11): barCountForDuration(), barIndexForPosition(), createProgressionMeasureLayout(), freezeFragment(), freezeGap(), freezeMeasure(), MutableMeasure, ProgressionMeasure (+3 more)

### Community 88 - "Community 88"
Cohesion: 0.18
Nodes (11): ArticulationDescriptor, CardViewDescriptor, InstrumentRealization, NATURAL_PC, PIANO_ARTICULATIONS, PIANO_CARD_VIEWS, PreviewPianoRealization, QUALITY_INTERVALS (+3 more)

### Community 89 - "Community 89"
Cohesion: 0.18
Nodes (3): MockAudioClock, MockAudioProvider, playProgression()

### Community 90 - "Community 90"
Cohesion: 0.31
Nodes (10): DEFAULT_MELODY_TRACK_SETTINGS, hasOnlyKeys(), isRecord(), MELODY_GRIDS, MELODY_INSTRUMENTS, MELODY_PATTERNS, MelodyPhrase, MelodyValidationReason (+2 more)

### Community 91 - "Community 91"
Cohesion: 0.20
Nodes (10): beats, $ref, duration, type, additionalProperties, properties, required, type (+2 more)

### Community 92 - "Community 92"
Cohesion: 0.20
Nodes (10): meter, tempoBpm, globalTiming, additionalProperties, properties, required, type, tempoBpm (+2 more)

### Community 93 - "Community 93"
Cohesion: 0.20
Nodes (10): semitone, pitchClass, additionalProperties, properties, required, type, semitone, maximum (+2 more)

### Community 95 - "Community 95"
Cohesion: 0.33
Nodes (7): SetExpertiseModePayload, PresentationMode, BEGINNER, explainRecommendation(), RecommendationExplanation, readDisclosureState(), RecommendationInspector()

### Community 96 - "Community 96"
Cohesion: 0.36
Nodes (8): formatPitch(), MeasureStaffChordItem, MeasureStaffGapItem, MeasureStaffItem, MeasureStaffItemBase, MeasureStaffRestItem, MeasureStaffView(), positionRecord()

### Community 97 - "Community 97"
Cohesion: 0.25
Nodes (5): AcceptanceSnapshot, assertFreshHistory(), captureUs8AcceptanceSnapshot(), countProjectsThroughUi(), openProjectMenu()

### Community 99 - "Community 99"
Cohesion: 0.33
Nodes (4): pitchFromXml(), XmlNode, xmlNotes(), xmlText()

### Community 101 - "Community 101"
Cohesion: 0.25
Nodes (7): engines, node, name, packageManager, private, type, version

### Community 102 - "Community 102"
Cohesion: 0.25
Nodes (4): Instrument, InstrumentOptions, SampleNode, soundfont-player

### Community 103 - "Community 103"
Cohesion: 0.36
Nodes (5): useModalFocus(), UseModalFocusOptions, SavePresetDialog(), SavePresetDialogProps, FOCUSABLE_SELECTOR

### Community 104 - "Community 104"
Cohesion: 0.29
Nodes (4): catalogPath, inputPaths, schemaDir, schemaPath

### Community 105 - "Community 105"
Cohesion: 0.33
Nodes (4): half, result, route, manhattanRoute()

### Community 106 - "Community 106"
Cohesion: 0.47
Nodes (5): ChordDefinition, RecommendationCandidate, InstrumentRealizationInput, ChordCardViewModel, MatrixCardPreviewRealization

### Community 107 - "Community 107"
Cohesion: 0.53
Nodes (5): DerivedMode, EnharmonicSpellingContext, HarmonicLayerDefinition, HarmonicModuleDefinition, MatrixTopologyDefinition

### Community 109 - "Community 109"
Cohesion: 0.50
Nodes (4): RegisterOffset, REGISTER_OPTIONS, RegisterControl(), RegisterControlProps

### Community 112 - "Community 112"
Cohesion: 0.70
Nodes (4): exerciseStaffView(), expectNoPageHorizontalScroll(), expectStaffGeometry(), waitForStudio()

## Knowledge Gaps
- **540 isolated node(s):** `common.sh script`, `name`, `version`, `private`, `type` (+535 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `$defs` connect `Community 84` to `Community 40`, `Community 81`, `Community 93`, `Community 22`, `Community 91`, `Community 92`, `Community 29`, `Community 30`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Why does `Rational` connect `Community 20` to `Community 0`, `Community 1`, `Community 2`, `Community 9`, `Community 12`, `Community 15`, `Community 17`, `Community 27`, `Community 28`, `Community 31`, `Community 32`, `Community 33`, `Community 34`, `Community 37`, `Community 42`, `Community 46`, `Community 50`, `Community 51`, `Community 52`, `Community 55`, `Community 56`, `Community 57`, `Community 62`, `Community 67`, `Community 70`, `Community 71`, `Community 76`, `Community 82`, `Community 87`, `Community 90`, `Community 96`, `Community 105`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `properties` connect `Community 6` to `Community 84`, `Community 30`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Are the 31 inferred relationships involving `App()` (e.g. with `addBranchPreview()` and `discardBranch()`) actually correct?**
  _`App()` has 31 INFERRED edges - model-reasoned connections that need verification._
- **What connects `common.sh script`, `name`, `version` to the rest of the system?**
  _540 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11020408163265306 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08673469387755102 - nodes in this community are weakly interconnected._