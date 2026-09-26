import type { DerivedMode, HarmonicModuleId } from "./functions";
import { modeForModule } from "./functions";
import { normalizePitchClass, type PitchClassIdentity } from "./pitch";
import type { ExactPitch } from "./pitch";

export type HarmonicNotePrimaryRole = "root" | "chord-tone" | "scale-tone" | "altered";

/** Derived presentation metadata. Keep this out of persisted MelodyEvent data. */
export interface HarmonicNoteRole {
  readonly primary: HarmonicNotePrimaryRole;
  readonly targetNext: boolean;
}

export interface HarmonicNoteRoleContext {
  readonly rootPitchClass: PitchClassIdentity;
  readonly chordPitchClasses: readonly PitchClassIdentity[];
  readonly scalePitchClasses: readonly PitchClassIdentity[];
  readonly nextChordPitchClasses: readonly PitchClassIdentity[];
}

const SCALE_INTERVALS: Readonly<Record<DerivedMode, readonly number[]>> = Object.freeze({
  major: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  // Tonal minor keeps both the lowered seventh and raised leading tone available.
  "tonal-minor": Object.freeze([0, 2, 3, 5, 7, 8, 10, 11]),
});

export function getScalePitchClasses(
  tonic: PitchClassIdentity,
  mode: DerivedMode,
): readonly PitchClassIdentity[] {
  return Object.freeze(
    SCALE_INTERVALS[mode].map((interval) => normalizePitchClass(tonic + interval)),
  );
}

export function createHarmonicNoteRoleContext(input: {
  readonly tonic: PitchClassIdentity;
  readonly moduleId: HarmonicModuleId;
  readonly rootPitchClass: PitchClassIdentity;
  readonly chordPitches: readonly ExactPitch[];
  readonly nextChordPitches?: readonly ExactPitch[];
}): HarmonicNoteRoleContext {
  const pitchClasses = (pitches: readonly ExactPitch[] | undefined) =>
    Object.freeze([
      ...new Set((pitches ?? []).map((pitch) => normalizePitchClass(pitch.midiNumber))),
    ]);
  return Object.freeze({
    rootPitchClass: normalizePitchClass(input.rootPitchClass),
    chordPitchClasses: Object.freeze([
      ...new Set([
        normalizePitchClass(input.rootPitchClass),
        ...input.chordPitches.map((pitch) => normalizePitchClass(pitch.midiNumber)),
      ]),
    ]),
    scalePitchClasses: getScalePitchClasses(input.tonic, modeForModule(input.moduleId)),
    nextChordPitchClasses: pitchClasses(input.nextChordPitches),
  });
}

export function classifyHarmonicNoteRole(
  pitchClass: PitchClassIdentity,
  context: HarmonicNoteRoleContext,
): HarmonicNoteRole {
  const pc = normalizePitchClass(pitchClass);
  const primary: HarmonicNotePrimaryRole =
    pc === context.rootPitchClass
      ? "root"
      : context.chordPitchClasses.includes(pc)
        ? "chord-tone"
        : context.scalePitchClasses.includes(pc)
          ? "scale-tone"
          : "altered";
  return Object.freeze({
    primary,
    targetNext: context.nextChordPitchClasses.includes(pc),
  });
}
