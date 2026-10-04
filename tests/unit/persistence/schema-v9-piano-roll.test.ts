import { describe, expect, it } from "vitest";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";

const pitch = {
  midiNumber: 64,
  pitchClassIdentity: 4,
  octave: 4,
  spelling: { step: "E", alter: 0 },
};
const authoredNote = {
  id: "legacy-authored-1",
  pitch,
  onset: { numerator: 1, denominator: 3 },
  duration: { numerator: 7, denominator: 6 },
};

type RawFixture = {
  schemaVersion: number;
  presentation: { progressionView: string };
  progression: {
    steps: Array<Record<string, unknown>>;
    sections: unknown;
  };
  temporaryBranch?: { id?: unknown; steps?: Array<Record<string, unknown>> };
  customPresets: Array<Record<string, unknown>>;
};

describe("schema v8 to v9 Piano Roll cutover", () => {
  it("preserves old authored chord semantics, sections, branch, and adds authored Melody to Rest", () => {
    const raw = JSON.parse(encodePortableProject(createRichProjectFixture())) as RawFixture;
    raw.schemaVersion = 8;
    raw.presentation.progressionView = "piano-roll";
    const chord = raw.progression.steps[1];
    chord.melody = {
      mode: "authored",
      phrase: { notes: [authoredNote] },
      sourceRecipe: {
        pitchMotion: "up",
        rhythm: "even",
        connection: "retrigger",
        grid: "eighth-triplet",
        octaveOffset: 1,
      },
    };
    const rest = {
      id: "rest-authored",
      kind: "rest",
      duration: { beats: { numerator: 1, denominator: 2 } },
      authoredMelody: {
        notes: [{ ...authoredNote, id: "rest-note", onset: { numerator: 1, denominator: 6 } }],
      },
      melodyInstrumentOverride: "cello",
    };
    raw.progression.steps.splice(1, 0, rest);
    const beforeSections = structuredClone(raw.progression.sections);
    const beforeBranchId = raw.temporaryBranch?.id;
    const beforeBranchStepIds = raw.temporaryBranch?.steps?.map((step) => step["id"]);
    const beforePresetIds = raw.customPresets.map((preset) => preset["id"]);
    const restored = decodePortableProject(JSON.stringify(raw));
    expect(restored.schemaVersion).toBe(10);
    expect(restored.presentation.progressionView).toBe("piano-roll");
    expect(restored.progression.sections).toEqual(beforeSections);
    expect(restored.temporaryBranch?.id).toBe(beforeBranchId);
    expect(restored.temporaryBranch?.steps.map((step) => step.id)).toEqual(beforeBranchStepIds);
    expect(restored.customPresets.map((preset) => preset.id)).toEqual(beforePresetIds);
    expect(restored.progression.steps[1]).toMatchObject({
      kind: "rest",
      authoredMelody: {
        notes: [
          {
            id: "rest-note",
            pitch,
            onset: { numerator: 1, denominator: 6 },
            duration: { numerator: 7, denominator: 6 },
          },
        ],
      },
      melodyInstrumentOverride: "cello",
    });
    expect(restored.progression.steps[2]).toMatchObject({
      kind: "chord",
      melody: {
        mode: "authored",
        phrase: { notes: [authoredNote] },
        sourceRecipe: { grid: "eighth-triplet" },
      },
    });
    expect(restored.progression.steps[0]).toMatchObject({
      kind: "chord",
      melody: { mode: "generated", recipe: { grid: "eighth-triplet" } },
    });
    const exported = decodePortableProject(encodePortableProject(restored));
    expect(exported.schemaVersion).toBe(10);
    expect(exported.presentation.progressionView).toBe("piano-roll");
    expect(exported.progression.steps[1]).toMatchObject({
      authoredMelody: { notes: [{ duration: authoredNote.duration }] },
    });
  });
});
