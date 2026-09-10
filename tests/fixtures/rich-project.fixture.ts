import type { Project } from "../../src/domain/project/project";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational } from "../../src/domain/timing/rational";
import { globalTiming, meter } from "../../src/domain/timing/meter";
import { groove } from "../../src/domain/timing/swing";
import { DEFAULT_PIANO_PERFORMANCE } from "../../src/domain/project/factory";
import { EMPTY_HARMONIC_VARIANT } from "../../src/domain/harmony/chord";
import type { ChordStep, RestStep } from "../../src/domain/progression/step";
import type { TemporaryBranch } from "../../src/domain/progression/branch";
import type { FunctionalPreset } from "../../src/domain/progression/presets";
import { snapshotChordMelodyRecipe } from "../../src/domain/melody/types";

/**
 * Rich, canonical Project fixture covering all accepted semantic domains (US1–US12).
 * Used by portable project, autosave recovery, and melody persistence tests.
 */
export function createRichProjectFixture(): Project {
  const step1: ChordStep = Object.freeze({
    id: "step-1",
    kind: "chord",
    harmonicFunction: Object.freeze({
      moduleId: "progressions",
      functionId: "I",
      category: "tonic",
    }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
    performance: DEFAULT_PIANO_PERFORMANCE,
    cardView: "harmonic",
    melody: snapshotChordMelodyRecipe({
      pattern: "outside-in",
      grid: "eighth-triplet",
      octaveOffset: 1,
    }),
  });

  const step2: ChordStep = Object.freeze({
    id: "step-2",
    kind: "chord",
    harmonicFunction: Object.freeze({
      moduleId: "progressions",
      functionId: "I", // Repeated harmonic function
      category: "tonic",
    }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(3, 2), { kind: "beats", label: "3/2 beats" }),
    performance: Object.freeze({
      articulation: "broken-chord",
      register: 1,
      voicingMode: "manual",
      manualVoicing: Object.freeze([
        { midiNumber: 60, pitchClassIdentity: 0, octave: 4, spelling: { step: "C", alter: 0 } },
        { midiNumber: 64, pitchClassIdentity: 4, octave: 4, spelling: { step: "E", alter: 0 } },
        { midiNumber: 67, pitchClassIdentity: 7, octave: 4, spelling: { step: "G", alter: 0 } },
        { midiNumber: 72, pitchClassIdentity: 0, octave: 5, spelling: { step: "C", alter: 0 } },
      ]),
      bass: Object.freeze({
        choice: "custom",
        octaveOffset: -1,
        customPitch: {
          midiNumber: 36,
          pitchClassIdentity: 0,
          octave: 2,
          spelling: { step: "C", alter: 0 },
        },
      }),
      masterVelocity: 95,
      perNoteVelocityOverrides: Object.freeze({
        "60": 110,
        "72": 85,
      }),
      dynamicsViewPreference: "midi",
    }),
    cardView: "piano",
  });

  const step3: RestStep = Object.freeze({
    id: "step-3",
    kind: "rest",
    duration: musicalDuration(rational(2, 3), {
      kind: "triplet",
      baseBeats: rational(1),
    }),
  });

  const step4: ChordStep = Object.freeze({
    id: "step-4",
    kind: "chord",
    harmonicFunction: Object.freeze({
      moduleId: "progressions",
      functionId: "IV",
      category: "subdominant",
    }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(1, 3)),
    performance: Object.freeze({
      ...DEFAULT_PIANO_PERFORMANCE,
      articulation: "arp-up",
    }),
    cardView: "staff",
  });

  const step5: ChordStep = Object.freeze({
    id: "step-5",
    kind: "chord",
    harmonicFunction: Object.freeze({
      moduleId: "progressions",
      functionId: "V",
      category: "dominant",
    }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(7, 2), {
      kind: "dotted",
      baseBeats: rational(2),
    }),
    performance: DEFAULT_PIANO_PERFORMANCE,
    cardView: "harmonic",
  });

  const temporaryBranch: TemporaryBranch = Object.freeze({
    id: "branch-active-whatif-01",
    originStepId: "step-2",
    originAtEnd: false,
    rejoinStepId: "step-4",
    compositionIntent: "surprise",
    steps: Object.freeze([
      Object.freeze({
        id: "branch-step-1",
        kind: "chord",
        harmonicFunction: Object.freeze({
          moduleId: "progressions",
          functionId: "ii",
          category: "predominant",
        }),
        harmonicVariant: EMPTY_HARMONIC_VARIANT,
        duration: musicalDuration(rational(2, 1)),
        performance: DEFAULT_PIANO_PERFORMANCE,
        cardView: "harmonic",
      }),
      Object.freeze({
        id: "branch-step-2",
        kind: "chord",
        harmonicFunction: Object.freeze({
          moduleId: "progressions",
          functionId: "V",
          category: "dominant",
        }),
        harmonicVariant: EMPTY_HARMONIC_VARIANT,
        duration: musicalDuration(rational(2, 1)),
        performance: DEFAULT_PIANO_PERFORMANCE,
        cardView: "harmonic",
      }),
    ]),
  });

  const customPreset: FunctionalPreset = Object.freeze({
    id: "custom-preset-us8-rich",
    name: "Custom I-vi-IV",
    source: "custom",
    description: "Custom functional preset for testing",
    steps: Object.freeze([
      Object.freeze({
        harmonicFunction: Object.freeze({
          moduleId: "progressions",
          functionId: "I",
          category: "tonic",
        }),
        duration: musicalDuration(rational(4, 1)),
      }),
      Object.freeze({
        harmonicFunction: Object.freeze({
          moduleId: "progressions",
          functionId: "vi",
          category: "tonic-substitute",
        }),
        duration: musicalDuration(rational(4, 1)),
      }),
    ]),
  });

  return Object.freeze({
    id: "project-us8-rich-fixture-001",
    schemaVersion: 2,
    name: "Rich US8 Acceptance Project",
    createdAt: "2026-09-05T20:00:00.000Z",
    updatedAt: "2026-09-05T20:30:00.000Z",
    activeModule: "progressions",
    tonic: 0, // C
    globalTiming: globalTiming(132, meter(7, 8, [2, 2, 3])),
    groove: groove("swing", 0.66),
    presentation: Object.freeze({
      expertiseMode: "composer",
      theme: "dark",
      globalMatrixCardView: "harmonic",
      showBassInStaff: false,
    }),
    melodyTrack: Object.freeze({
      instrument: "violin",
      muted: false,
      solo: false,
      volume: 96,
    }),
    defaults: Object.freeze({
      piano: Object.freeze({
        duration: musicalDuration(rational(4, 1)),
        performance: DEFAULT_PIANO_PERFORMANCE,
      }),
    }),
    moduleTemplateStates: Object.freeze({
      progressions: Object.freeze({
        cards: Object.freeze({
          I: Object.freeze({
            harmonicFunctionId: "I",
            explicitOverrides: Object.freeze({
              duration: musicalDuration(rational(2, 1)),
              performance: Object.freeze({ articulation: "broken-chord" }),
            }),
            harmonicVariantOverride: EMPTY_HARMONIC_VARIANT,
            cardViewOverride: "piano",
          }),
        }),
      }),
      "dark-harmony": Object.freeze({
        cards: Object.freeze({}),
      }),
    }),
    progression: Object.freeze({
      steps: Object.freeze([step1, step2, step3, step4, step5]),
      selectedStepId: "step-2",
      loopRegion: Object.freeze({
        startStepId: "step-2",
        endStepId: "step-4",
      }),
    }),
    temporaryBranch,
    customPresets: Object.freeze([customPreset]),
  });
}
