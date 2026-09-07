import type {
  Alteration,
  BaseChordQuality,
  ChordDefinition,
  HarmonicVariant,
  SeventhKind,
  Suspension,
} from "../../domain/harmony/chord";
import type { DerivedMode } from "../../domain/harmony/functions";
import type { DiatonicStep, PitchSpelling, PitchClassIdentity } from "../../domain/harmony/pitch";
import type { PianoArticulation } from "../../domain/progression/step";
import type { GrooveFeel } from "../../domain/timing/swing";
import { velocityToMusicalDynamic } from "../../instruments/piano/dynamics";

export type MusicXmlDiagnosticSeverity = "info" | "warning" | "error";

export type MusicXmlDiagnosticCode =
  | "groove-omitted"
  | "humanized-timing-omitted"
  | "broken-chord-timing-omitted"
  | "per-note-velocity-omitted"
  | "temporary-branch-omitted"
  | "presentation-state-omitted"
  | "recommendation-metadata-omitted"
  | "runtime-state-omitted"
  | "unsupported-harmony-variant"
  | "unsupported-articulation"
  | "invalid-tempo"
  | "empty-progression"
  | "duration-divisions-overflow"
  | "invalid-projection";

export interface MusicXmlDiagnostic {
  readonly code: MusicXmlDiagnosticCode;
  readonly severity: MusicXmlDiagnosticSeverity;
  readonly message: string;
  readonly stepId?: string;
}

export type MusicXmlMappingStatus = "exact" | "mapped" | "omitted" | "error";

export interface MusicXmlMappingResult<T> {
  readonly status: MusicXmlMappingStatus;
  readonly value?: T;
  readonly diagnostics: readonly MusicXmlDiagnostic[];
}

export interface MusicXmlKeySignature {
  readonly fifths: number;
  readonly mode: "major" | "minor";
}

export interface MusicXmlPitchSpelling {
  readonly step: DiatonicStep;
  readonly alter: number;
}

export type MusicXmlHarmonyKind =
  | "major"
  | "minor"
  | "diminished"
  | "augmented"
  | "dominant"
  | "major-seventh"
  | "minor-seventh"
  | "major-minor"
  | "diminished-seventh"
  | "half-diminished"
  | "augmented-seventh"
  | "suspended-second"
  | "suspended-fourth";

export type MusicXmlDegreeType = "add" | "alter" | "subtract";

export interface MusicXmlHarmonyDegree {
  readonly value: 2 | 4 | 5 | 9 | 11 | 13;
  readonly alter: number;
  readonly type: MusicXmlDegreeType;
}

export interface MusicXmlHarmonyMapping {
  readonly root: MusicXmlPitchSpelling;
  readonly kind: MusicXmlHarmonyKind;
  readonly degrees: readonly MusicXmlHarmonyDegree[];
}

export interface MusicXmlDynamicMapping {
  readonly label: "pp" | "p" | "mp" | "mf" | "f" | "ff";
  readonly sourceVelocity: number;
}

export type MusicXmlArticulation = "arpeggiate-up" | "arpeggiate-down";

// Matches defaultTonicSpelling: Db major, Eb minor and Bb minor use flats.
const MAJOR_KEY_FIFTHS: readonly number[] = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
const MINOR_KEY_FIFTHS: readonly number[] = [-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2];

function freezeDiagnostics(
  diagnostics: readonly MusicXmlDiagnostic[],
): readonly MusicXmlDiagnostic[] {
  return Object.freeze(diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic })));
}

export function musicXmlDiagnostic(
  code: MusicXmlDiagnosticCode,
  message: string,
  severity: MusicXmlDiagnosticSeverity = "warning",
  stepId?: string,
): MusicXmlDiagnostic {
  return Object.freeze({
    code,
    severity,
    message,
    ...(stepId === undefined ? {} : { stepId }),
  });
}

export function mapCadenceFlowModeToMusicXmlMode(mode: DerivedMode): "major" | "minor" {
  return mode === "major" ? "major" : "minor";
}

export function mapTonicToMusicXmlKey(
  tonic: PitchClassIdentity,
  mode: DerivedMode,
): MusicXmlKeySignature {
  if (!Number.isInteger(tonic) || tonic < 0 || tonic > 11) {
    throw new RangeError("tonic must be a pitch class in 0..11");
  }
  const musicXmlMode = mapCadenceFlowModeToMusicXmlMode(mode);
  const fifths = (musicXmlMode === "major" ? MAJOR_KEY_FIFTHS : MINOR_KEY_FIFTHS)[tonic];
  if (fifths === undefined) throw new RangeError(`unsupported tonic pitch class: ${tonic}`);
  return Object.freeze({ fifths, mode: musicXmlMode });
}

export function mapPitchSpellingToMusicXml(spelling: PitchSpelling): MusicXmlPitchSpelling {
  if (!/^[A-G]$/.test(spelling.step) || !Number.isInteger(spelling.alter)) {
    throw new RangeError("invalid pitch spelling");
  }
  return Object.freeze({ step: spelling.step, alter: spelling.alter });
}

export function mapBaseChordQualityToMusicXmlKind(quality: BaseChordQuality): MusicXmlHarmonyKind {
  switch (quality) {
    case "major":
      return "major";
    case "minor":
      return "minor";
    case "diminished":
      return "diminished";
    case "augmented":
      return "augmented";
    case "dominant":
      return "dominant";
  }
}

function mapSeventhKind(
  quality: BaseChordQuality,
  seventh: SeventhKind,
): MusicXmlHarmonyKind | undefined {
  switch (seventh) {
    case "minor7":
      if (quality === "major" || quality === "dominant") return "dominant";
      if (quality === "minor") return "minor-seventh";
      if (quality === "diminished") return "half-diminished";
      if (quality === "augmented") return "augmented-seventh";
      return undefined;
    case "major7":
      if (quality === "major") return "major-seventh";
      if (quality === "minor") return "major-minor";
      return undefined;
    case "diminished7":
      return quality === "diminished" ? "diminished-seventh" : undefined;
    case "half-diminished7":
      return quality === "diminished" ? "half-diminished" : undefined;
  }
}

function mapSuspension(suspension: Suspension): MusicXmlHarmonyKind {
  return suspension === "sus2" ? "suspended-second" : "suspended-fourth";
}

function extensionDegree(value: 9 | 11 | 13): MusicXmlHarmonyDegree {
  return Object.freeze({ value, alter: 0, type: "add" });
}

function alterationDegree(alteration: Alteration): MusicXmlHarmonyDegree {
  return Object.freeze({
    value: alteration.degree,
    alter: alteration.semitones,
    type: "alter",
  });
}

function add9Degree(): MusicXmlHarmonyDegree {
  return Object.freeze({ value: 9, alter: 0, type: "add" });
}

function degreesForVariant(variant: HarmonicVariant): readonly MusicXmlHarmonyDegree[] {
  const degrees = [
    ...variant.extensions.map(extensionDegree),
    ...(variant.add9 && !variant.extensions.includes(9) ? [add9Degree()] : []),
    ...[...variant.alterations]
      .sort((a, b) => a.degree - b.degree || a.semitones - b.semitones)
      .map(alterationDegree),
  ];
  return Object.freeze(degrees);
}

export function mapChordToMusicXmlHarmony(
  chord: ChordDefinition,
  stepId?: string,
): MusicXmlMappingResult<MusicXmlHarmonyMapping> {
  const diagnostics: MusicXmlDiagnostic[] = [];
  const variant = chord.variant;
  let kind: MusicXmlHarmonyKind | undefined;

  if (variant.suspensions.length > 0) {
    kind = mapSuspension(variant.suspensions[0]!);
    if (
      variant.seventh ||
      variant.extensions.length > 0 ||
      variant.alterations.length > 0 ||
      variant.add9
    ) {
      diagnostics.push(
        musicXmlDiagnostic(
          "unsupported-harmony-variant",
          "Suspension combined with additional chord extensions is not represented exactly.",
          "warning",
          stepId,
        ),
      );
    }
  } else if (variant.seventh) {
    kind = mapSeventhKind(chord.baseQuality, variant.seventh);
    if (!kind) {
      diagnostics.push(
        musicXmlDiagnostic(
          "unsupported-harmony-variant",
          `The ${chord.baseQuality}/${variant.seventh} combination has no exact MusicXML kind.`,
          "error",
          stepId,
        ),
      );
      kind = mapBaseChordQualityToMusicXmlKind(chord.baseQuality);
    }
  } else {
    kind = mapBaseChordQualityToMusicXmlKind(chord.baseQuality);
  }

  if (variant.add9 && variant.extensions.includes(9)) {
    diagnostics.push(
      musicXmlDiagnostic(
        "unsupported-harmony-variant",
        "add9 and extension 9 are mutually exclusive in CadenceFlow; one degree was not duplicated.",
        "warning",
        stepId,
      ),
    );
  }

  const mapping: MusicXmlHarmonyMapping = Object.freeze({
    root: mapPitchSpellingToMusicXml(chord.spelling.root),
    kind,
    degrees: degreesForVariant(variant),
  });

  return Object.freeze({
    status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "error" : "exact",
    value: mapping,
    diagnostics: freezeDiagnostics(diagnostics),
  });
}

export function mapMasterVelocityToMusicXmlDynamic(
  velocity: number,
): MusicXmlMappingResult<MusicXmlDynamicMapping> {
  if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) {
    return Object.freeze({
      status: "error",
      diagnostics: freezeDiagnostics([
        musicXmlDiagnostic(
          "invalid-projection",
          "Master Velocity must be an integer in 1..127.",
          "error",
        ),
      ]),
    });
  }
  return Object.freeze({
    status: "mapped",
    value: Object.freeze({ label: velocityToMusicalDynamic(velocity), sourceVelocity: velocity }),
    diagnostics: Object.freeze([]),
  });
}

export function mapPianoArticulationToMusicXml(
  articulation: PianoArticulation,
  stepId?: string,
): MusicXmlMappingResult<MusicXmlArticulation> {
  switch (articulation) {
    case "block":
      return Object.freeze({ status: "exact", diagnostics: Object.freeze([]) });
    case "arp-up":
      return Object.freeze({
        status: "exact",
        value: "arpeggiate-up",
        diagnostics: Object.freeze([]),
      });
    case "arp-down":
      return Object.freeze({
        status: "exact",
        value: "arpeggiate-down",
        diagnostics: Object.freeze([]),
      });
    case "broken-chord":
      return Object.freeze({
        status: "omitted",
        diagnostics: freezeDiagnostics([
          musicXmlDiagnostic(
            "broken-chord-timing-omitted",
            "Broken Chord playback timing is omitted; written chord duration is retained.",
            "warning",
            stepId,
          ),
        ]),
      });
    case "humanized":
      return Object.freeze({
        status: "omitted",
        diagnostics: freezeDiagnostics([
          musicXmlDiagnostic(
            "humanized-timing-omitted",
            "Humanized playback timing is omitted; written chord duration is retained.",
            "warning",
            stepId,
          ),
        ]),
      });
  }
}

export function mapGrooveToMusicXml(
  feel: GrooveFeel,
  stepId?: string,
): MusicXmlMappingResult<"straight"> {
  if (feel === "straight")
    return Object.freeze({ status: "exact", value: "straight", diagnostics: Object.freeze([]) });
  return Object.freeze({
    status: "omitted",
    value: "straight",
    diagnostics: freezeDiagnostics([
      musicXmlDiagnostic(
        "groove-omitted",
        "Swing is not encoded in written durations in this MusicXML batch.",
        "warning",
        stepId,
      ),
    ]),
  });
}

export function mapPitchToMusicXml(spelling: PitchSpelling): MusicXmlPitchSpelling {
  return mapPitchSpellingToMusicXml(spelling);
}

export function keySignatureForProject(
  tonic: PitchClassIdentity,
  mode: DerivedMode,
): MusicXmlKeySignature {
  return mapTonicToMusicXmlKey(tonic, mode);
}
