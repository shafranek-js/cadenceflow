import type { AuthoredMelodyPhrase } from "../../src/domain/melody/types";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
import {
  snapshotAuthoredMelodyPhrase,
  snapshotChordMelody,
  snapshotChordMelodyRecipe,
} from "../../src/domain/melody/types";
import { exactPitch } from "../../src/domain/harmony/pitch";
import { createDefaultProject } from "../../src/domain/project/factory";
import { setBranchRejoin, startTemporaryBranch } from "../../src/domain/progression/branch";
import type { ChordStep, RestStep } from "../../src/domain/progression/step";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational } from "../../src/domain/timing/rational";
import type { Project } from "../../src/domain/project/project";

const FIXTURE_TIME = "2026-10-02T12:00:00.000Z";
const C4 = exactPitch(60, { step: "C", alter: 0 });
const E4 = exactPitch(64, { step: "E", alter: 0 });
const G4 = exactPitch(67, { step: "G", alter: 0 });
const A4 = exactPitch(69, { step: "A", alter: 0 });

function authored(step: ChordStep, notes: AuthoredMelodyPhrase["notes"]): ChordStep {
  return Object.freeze<ChordStep>({
    ...step,
    melodyInstrumentOverride: "flute",
    melody: snapshotChordMelody({
      mode: "authored" as const,
      phrase: snapshotAuthoredMelodyPhrase({ notes }),
    }),
  });
}

function chord(
  project: Project,
  id: string,
  functionId: string,
  notes?: AuthoredMelodyPhrase["notes"],
): ChordStep {
  const base = createMatrixChordStep(project, functionId, id);
  const step = Object.freeze({ ...base, duration: musicalDuration(rational(4)) });
  return notes ? authored(step, notes) : step;
}

export function createPianoRollSystemChordFixture(
  projectId = "piano-roll-system-chord-fixture",
): Project {
  const base = createDefaultProject(projectId, "Piano Roll CHORD fixture", FIXTURE_TIME);
  const stepA = chord(base, "chord-a", "I", [
    { id: "owner-local-collision", pitch: C4, onset: rational(0), duration: rational(1, 2) },
    { id: "cross-system-carry", pitch: E4, onset: rational(7, 2), duration: rational(3, 2) },
  ]);
  const stepB = chord(base, "chord-b", "I", [
    { id: "owner-local-collision", pitch: G4, onset: rational(0), duration: rational(1, 2) },
    { id: "exact-owner-boundary", pitch: A4, onset: rational(0), duration: rational(1) },
  ]);
  const stepC = chord(base, "chord-c", "I", [
    { id: "section-note", pitch: E4, onset: rational(1), duration: rational(1, 2) },
  ]);
  const rest: RestStep = Object.freeze<RestStep>({
    id: "rest-d",
    kind: "rest",
    duration: musicalDuration(rational(4)),
    melodyInstrumentOverride: "flute",
    authoredMelody: snapshotAuthoredMelodyPhrase({
      notes: [
        { id: "owner-local-collision", pitch: C4, onset: rational(0), duration: rational(1) },
        { id: "rest-polyphony", pitch: G4, onset: rational(0), duration: rational(1, 2) },
      ],
    }),
  });
  const generatedBase = createMatrixChordStep(base, "vi", "generated-e");
  const generated: ChordStep = Object.freeze<ChordStep>({
    ...generatedBase,
    duration: musicalDuration(rational(4)),
    melodyInstrumentOverride: "flute",
    melody: Object.freeze({
      mode: "generated" as const,
      recipe: snapshotChordMelodyRecipe({
        pitchMotion: "outside-in",
        grid: "eighth-triplet",
        octaveOffset: 1,
        rhythm: "even",
        connection: "retrigger",
      }),
    }),
  });
  const stepF = Object.freeze({
    ...chord(base, "chord-f", "IV", [
      { id: "following-note", pitch: C4, onset: rational(1, 2), duration: rational(1, 2) },
    ]),
    explicitSpellingOverrides: Object.freeze({ "upper:67": { step: "F" as const, alter: 1 } }),
  });
  const steps = Object.freeze([stepA, stepB, stepC, rest, generated, stepF]);
  const progression = Object.freeze({
    ...base.progression,
    steps,
    selectedStepId: stepA.id,
    loopRegion: Object.freeze({ startStepId: stepA.id, endStepId: stepB.id }),
    sections: Object.freeze([
      Object.freeze({ id: "verse", name: "Verse", startStepId: stepA.id }),
      Object.freeze({ id: "chorus", name: "Chorus", startStepId: stepC.id }),
      Object.freeze({ id: "bridge", name: "Bridge", startStepId: generated.id }),
    ]),
  });
  const branch = setBranchRejoin(
    progression,
    startTemporaryBranch(progression, "active-branch", stepA.id, "surprise"),
    stepB.id,
  );
  const branchStep = createMatrixChordStep(base, "ii", "branch-step");
  const temporaryBranch = Object.freeze({
    ...branch,
    steps: Object.freeze([branchStep]),
  });

  return Object.freeze<Project>({
    ...base,
    updatedAt: FIXTURE_TIME,
    presentation: Object.freeze({
      ...base.presentation,
      progressionView: "piano-roll",
      measuresPerSystem: 2,
    }),
    progression,
    temporaryBranch,
  });
}
