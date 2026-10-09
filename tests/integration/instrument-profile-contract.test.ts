import { describe, expect, it } from "vitest";
import { CURRENT_PROJECT_SCHEMA_VERSION } from "../../src/domain/project/migrations";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
import { realizeChord } from "../../src/domain/harmony/realization";
import { modeForModule } from "../../src/domain/harmony/functions";
import { exactPitch } from "../../src/domain/harmony/pitch";
import { createDefaultProject } from "../../src/domain/project/factory";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import type {
  InstrumentProfile,
  InstrumentRealizationInput,
  ValidationResult,
} from "../../src/instruments/contracts";

const proofOfConceptProfile: InstrumentProfile = Object.freeze<InstrumentProfile>({
  id: "proof-of-concept-strings",
  displayName: "Proof-of-concept Strings",
  realizeChord({ chord }: InstrumentRealizationInput) {
    return Object.freeze({
      pitches: Object.freeze([exactPitch(48 + chord.rootPitchClass, chord.spelling.root)]),
    });
  },
  validateManualVoicing(_pitches): ValidationResult {
    return Object.freeze<ValidationResult>({ valid: true, messages: Object.freeze([]) });
  },
  supportedCardViews() {
    return Object.freeze([{ id: "harmonic", label: "Harmonic" }]);
  },
  supportedArticulations() {
    return Object.freeze([{ id: "sustain", label: "Sustain" }]);
  },
});

describe("SC-016 InstrumentProfile boundary", () => {
  it("realizes a saved progression through a second profile without changing portable semantics", () => {
    const base = createDefaultProject("sc016", "SC-016 profile boundary");
    const steps = Object.freeze([
      createMatrixChordStep(base, "I", "sc016-i"),
      createMatrixChordStep(base, "V", "sc016-v"),
    ]);
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({ ...base.progression, steps }),
    });
    const context = Object.freeze({
      tonic: project.tonic,
      moduleId: project.activeModule,
      mode: modeForModule(project.activeModule),
      spellingContext: Object.freeze({
        tonic: project.tonic,
        mode: modeForModule(project.activeModule),
      }),
    });

    const realizations = steps.map((step) =>
      proofOfConceptProfile.realizeChord({
        context,
        chord: realizeChord(step.harmonicFunction, project.tonic),
        performance: step.performance,
      }),
    );

    expect(realizations.map((realization) => realization.pitches[0]?.midiNumber)).toEqual([48, 55]);

    const encoded = encodePortableProject(project);
    const payload = JSON.parse(encoded) as Record<string, unknown>;
    expect(payload.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(payload).not.toHaveProperty("instrumentProfile");
    expect(decodePortableProject(encoded)).toEqual(project);
  });
});
