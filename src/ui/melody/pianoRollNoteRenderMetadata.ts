import type { EffectiveMelodyNote } from "../../domain/melody/effectiveTimeline";
import {
  classifyHarmonicNoteRole,
  createHarmonicNoteRoleContext,
  type HarmonicNoteRole,
  type HarmonicNoteRoleContext,
} from "../../domain/harmony/noteRoles";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import { realizeProgressionStepChord } from "../../domain/progression/transposition";
import type { Project } from "../../domain/project/project";
import { isPianoRollNoteAuthored } from "./pianoRollProjection";

export interface PianoRollStepRenderMetadata {
  readonly authored: boolean;
  readonly roleContext?: HarmonicNoteRoleContext;
  readonly rolesByPitchClass: ReadonlyMap<number, HarmonicNoteRole>;
}

export type PianoRollNoteRenderMetadata = ReadonlyMap<string, PianoRollStepRenderMetadata>;

export interface PianoRollNoteRenderMetadataInput {
  readonly progression: { readonly steps: Project["progression"]["steps"] };
  readonly tonic: Project["tonic"];
  readonly activeModule: Project["activeModule"];
}

/**
 * Derives step and harmonic-role lookups once per musical timeline. Selection-only
 * Project snapshots keep the same steps, tonic, module, and effective notes, so
 * rendering each note can use O(1) lookups instead of repeatedly scanning steps and
 * realizing the same chord and next chord.
 */
export function createPianoRollNoteRenderMetadata(
  project: PianoRollNoteRenderMetadataInput,
  notes: readonly EffectiveMelodyNote[],
): PianoRollNoteRenderMetadata {
  const { steps } = project.progression;
  const nextChordByIndex: ((typeof steps)[number] | undefined)[] = new Array(steps.length);
  let nextChord: (typeof steps)[number] | undefined;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    nextChordByIndex[index] = nextChord;
    if (steps[index]?.kind === "chord") nextChord = steps[index];
  }

  const mutable = new Map<
    string,
    {
      authored: boolean;
      roleContext?: HarmonicNoteRoleContext;
      rolesByPitchClass: Map<number, HarmonicNoteRole>;
    }
  >();
  for (const [stepIndex, step] of steps.entries()) {
    if (!step) continue;
    let roleContext: HarmonicNoteRoleContext | undefined;
    if (step.kind === "chord") {
      const next = nextChordByIndex[stepIndex];
      roleContext = createHarmonicNoteRoleContext({
        tonic: project.tonic,
        moduleId: project.activeModule,
        rootPitchClass: realizeProgressionStepChord(step, project.tonic).rootPitchClass,
        chordPitches: realizeProgressionStepRealization(step, project.tonic).pitches,
        ...(next?.kind === "chord"
          ? { nextChordPitches: realizeProgressionStepRealization(next, project.tonic).pitches }
          : {}),
      });
    }
    mutable.set(step.id, {
      authored: isPianoRollNoteAuthored(step),
      ...(roleContext ? { roleContext } : {}),
      rolesByPitchClass: new Map(),
    });
  }

  for (const note of notes) {
    const step = mutable.get(note.sourceStepId);
    if (!step?.roleContext || step.rolesByPitchClass.has(note.pitch.pitchClassIdentity)) continue;
    step.rolesByPitchClass.set(
      note.pitch.pitchClassIdentity,
      classifyHarmonicNoteRole(note.pitch.pitchClassIdentity, step.roleContext),
    );
  }

  return mutable;
}

export class PianoRollNoteRenderMetadataCache {
  #steps: PianoRollNoteRenderMetadataInput["progression"]["steps"] | null = null;
  #tonic: PianoRollNoteRenderMetadataInput["tonic"] | null = null;
  #activeModule: PianoRollNoteRenderMetadataInput["activeModule"] | null = null;
  #notes: readonly EffectiveMelodyNote[] | null = null;
  #metadata: PianoRollNoteRenderMetadata | null = null;

  get(
    project: PianoRollNoteRenderMetadataInput,
    notes: readonly EffectiveMelodyNote[],
  ): PianoRollNoteRenderMetadata {
    const { steps } = project.progression;
    if (
      this.#metadata &&
      this.#steps === steps &&
      this.#tonic === project.tonic &&
      this.#activeModule === project.activeModule &&
      this.#notes === notes
    )
      return this.#metadata;

    this.#steps = steps;
    this.#tonic = project.tonic;
    this.#activeModule = project.activeModule;
    this.#notes = notes;
    this.#metadata = createPianoRollNoteRenderMetadata(project, notes);
    return this.#metadata;
  }
}
