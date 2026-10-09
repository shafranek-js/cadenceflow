import {
  defaultSeventhForQuality,
  effectiveChordQuality,
  snapshotHarmonicVariant,
  validateHarmonicVariant,
  withHarmonicVariant,
  type BaseChordQuality,
  type ChordDefinition,
  type ChordExtension,
  type HarmonicVariant,
  type SeventhKind,
  type Suspension,
} from "../harmony/chord";
import { resolveChordTones, type ResolvedChordTone } from "../harmony/chordTones";
import type {
  BorrowedModeId,
  HarmonicFunctionIdentity,
  HarmonicModuleId,
} from "../harmony/functions";
import { realizeChord } from "../harmony/realization";
import { computeModalChords, type DiatonicMode } from "../harmony/modes";
import {
  DARK_HARMONY_CORE_FUNCTIONS,
  supportedSecondaryDiminishedTargets,
} from "../harmony/modules/darkHarmony";
import { PROGRESSIONS_FUNCTIONS } from "../harmony/modules/progressions";
import type {
  BassChoice,
  BassSettings,
  ChordPropertiesFunctionState,
  ChordPropertiesOrigin,
  ChordPropertiesSourceState,
  ChordStep,
  InversionChoice,
  StepPerformance,
} from "./step";
import { snapshotChordPropertiesOrigin } from "./step";

export type ChordType = "triad" | "7" | "9" | "11" | "13";
export type ChordQualityControl = Exclude<BaseChordQuality, "dominant">;
export type SecondaryKind = "dominant" | "diminished";

export type ChordPropertiesEdit =
  | { readonly type: "type"; readonly value: ChordType }
  | { readonly type: "quality"; readonly value: ChordQualityControl }
  | { readonly type: "seventh"; readonly value: SeventhKind }
  | { readonly type: "suspension"; readonly value: Suspension | null }
  | { readonly type: "added-tone"; readonly degree: 9 | 11 | 13; readonly enabled: boolean }
  | {
      readonly type: "alteration";
      readonly degree: 5 | 9 | 11 | 13;
      readonly semitones: -1 | 1 | null;
    }
  | { readonly type: "omission"; readonly degree: 3 | 5; readonly enabled: boolean }
  | {
      readonly type: "secondary";
      readonly kind: SecondaryKind | "none";
      readonly targetFunctionId?: string;
    }
  | { readonly type: "borrow"; readonly mode: BorrowedModeId | null }
  | { readonly type: "inversion"; readonly value: InversionChoice }
  | { readonly type: "bass"; readonly value: BassSettings }
  | { readonly type: "reset" };

export interface SecondaryFunctionChoice {
  readonly kind: SecondaryKind;
  readonly targetFunctionId: string;
  readonly functionId: string;
  readonly label: string;
}

export const SECONDARY_FUNCTION_CHOICES: readonly SecondaryFunctionChoice[] = Object.freeze([
  ...PROGRESSIONS_FUNCTIONS.filter(
    (spec) =>
      spec.category === "secondary-dominant" && (spec.id === "V7" || spec.id.startsWith("V7/")),
  ).map((spec) => ({
    kind: "dominant" as const,
    targetFunctionId: spec.targetFunctionId ?? "I",
    functionId: spec.id,
    label: `V7/${spec.targetFunctionId ?? "I"}`,
  })),
  ...supportedSecondaryDiminishedTargets().map((targetFunctionId) => ({
    kind: "diminished" as const,
    targetFunctionId,
    functionId: `vii°7/${targetFunctionId}`,
    label: `vii°7/${targetFunctionId}`,
  })),
]);

const BORROWED_FUNCTION_ID =
  /^mode-(ionian|dorian|phrygian|lydian|mixolydian|aeolian|locrian)-([1-7])$/;

function sourceState(step: ChordStep): ChordPropertiesSourceState {
  return Object.freeze({
    harmonicFunction: Object.freeze({ ...step.harmonicFunction }),
    harmonicVariant: snapshotHarmonicVariant(step.harmonicVariant),
    ...(step.performance.inversion !== undefined ? { inversion: step.performance.inversion } : {}),
    bass: Object.freeze({
      ...step.performance.bass,
      ...(step.performance.bass.customPitch
        ? { customPitch: Object.freeze({ ...step.performance.bass.customPitch }) }
        : {}),
    }),
  });
}

function withOriginalSource(step: ChordStep): ChordPropertiesOrigin {
  return step.chordPropertiesOrigin ?? snapshotChordPropertiesOrigin({ source: sourceState(step) });
}

function isSecondary(identity: HarmonicFunctionIdentity): boolean {
  return (
    identity.category === "secondary-dominant" ||
    identity.category === "secondary-diminished" ||
    identity.functionId.startsWith("V7/") ||
    identity.functionId === "V7" ||
    identity.functionId.startsWith("vii°7/")
  );
}

export function borrowedModeForFunction(
  identity: HarmonicFunctionIdentity,
): BorrowedModeId | undefined {
  if (identity.borrowedFromMode) return identity.borrowedFromMode;
  return identity.functionId.match(BORROWED_FUNCTION_ID)?.[1] as BorrowedModeId | undefined;
}

function borrowedDegreeForFunction(identity: HarmonicFunctionIdentity): number | undefined {
  if (identity.borrowedDegree !== undefined) return identity.borrowedDegree;
  const encoded = identity.functionId.match(BORROWED_FUNCTION_ID)?.[2];
  return encoded ? Number(encoded) : undefined;
}

export function isBorrowedFunction(identity: HarmonicFunctionIdentity): boolean {
  return borrowedModeForFunction(identity) !== undefined;
}

export function chordDegreeForFunction(identity: HarmonicFunctionIdentity): number | undefined {
  if (isSecondary(identity)) return undefined;
  const borrowedDegree = borrowedDegreeForFunction(identity);
  if (borrowedDegree !== undefined) return borrowedDegree;
  if (identity.moduleId === "progressions") {
    return PROGRESSIONS_FUNCTIONS.find((spec) => spec.id === identity.functionId)?.degree;
  }
  return DARK_HARMONY_CORE_FUNCTIONS.find((spec) => spec.id === identity.functionId)?.degree;
}

export function chordTypeForDefinition(chord: ChordDefinition): ChordType {
  if (chord.variant.extensions.includes(13)) return "13";
  if (chord.variant.extensions.includes(11)) return "11";
  if (chord.variant.extensions.includes(9)) return "9";
  if (chord.variant.seventh !== undefined || effectiveChordQuality(chord) === "dominant")
    return "7";
  return "triad";
}

export function seventhForDefinition(chord: ChordDefinition): SeventhKind | undefined {
  if (chord.variant.seventh) return chord.variant.seventh;
  const quality = effectiveChordQuality(chord);
  if (quality === "dominant") return "minor7";
  return chord.variant.extensions.length > 0 ? defaultSeventhForQuality(quality) : undefined;
}

export function chordQualityForControl(chord: ChordDefinition): ChordQualityControl {
  const quality = effectiveChordQuality(chord);
  return quality === "dominant" ? "major" : quality;
}

function normalizeVariant(variant: HarmonicVariant): HarmonicVariant {
  const normalized: HarmonicVariant = {
    ...(variant.baseQualityOverride !== undefined
      ? { baseQualityOverride: variant.baseQualityOverride }
      : {}),
    ...(variant.seventh !== undefined ? { seventh: variant.seventh } : {}),
    extensions: Object.freeze([...new Set(variant.extensions)].sort((a, b) => a - b)),
    suspensions: Object.freeze([...new Set(variant.suspensions)]),
    alterations: Object.freeze(
      [...variant.alterations]
        .sort((a, b) => a.degree - b.degree)
        .map((alteration) => Object.freeze({ ...alteration })),
    ),
    ...(variant.add9 ? { add9: true } : {}),
    ...(variant.add11 ? { add11: true } : {}),
    ...(variant.add13 ? { add13: true } : {}),
    ...(variant.no3 ? { no3: true } : {}),
    ...(variant.no5 ? { no5: true } : {}),
  };
  return Object.freeze(normalized);
}

function currentChord(step: ChordStep, tonic: number): ChordDefinition {
  return withHarmonicVariant(realizeChord(step.harmonicFunction, tonic), step.harmonicVariant);
}

function defaultVariantForType(chord: ChordDefinition, type: ChordType): HarmonicVariant {
  const old = chord.variant;
  const quality = effectiveChordQuality(chord);
  const extensionDegrees: readonly ChordExtension[] =
    type === "13" ? [9, 11, 13] : type === "11" ? [9, 11] : type === "9" ? [9] : [];
  const extensionSet = new Set(extensionDegrees);
  const seventh =
    type === "triad"
      ? undefined
      : (seventhForDefinition(chord) ?? defaultSeventhForQuality(quality));
  return normalizeVariant({
    ...(type === "triad" && quality === "dominant"
      ? { baseQualityOverride: "major" }
      : old.baseQualityOverride !== undefined
        ? { baseQualityOverride: old.baseQualityOverride }
        : {}),
    ...(seventh !== undefined ? { seventh } : {}),
    extensions: extensionDegrees,
    suspensions: old.suspensions,
    alterations: old.alterations,
    ...(old.add9 && !extensionSet.has(9) ? { add9: true } : {}),
    ...(old.add11 && !extensionSet.has(11) ? { add11: true } : {}),
    ...(old.add13 && !extensionSet.has(13) ? { add13: true } : {}),
    ...(old.no3 ? { no3: true } : {}),
    ...(old.no5 ? { no5: true } : {}),
  });
}

function functionState(
  identity: HarmonicFunctionIdentity,
  variant: HarmonicVariant,
): ChordPropertiesFunctionState {
  return Object.freeze({
    harmonicFunction: Object.freeze({ ...identity }),
    harmonicVariant: snapshotHarmonicVariant(variant),
  });
}

function secondaryFunction(
  kind: SecondaryKind,
  targetFunctionId: string,
  tonic: number,
): ChordDefinition {
  const choice = SECONDARY_FUNCTION_CHOICES.find(
    (item) => item.kind === kind && item.targetFunctionId === targetFunctionId,
  );
  if (!choice) throw new RangeError(`Unsupported ${kind} secondary target: ${targetFunctionId}`);
  return realizeChord(
    {
      moduleId: kind === "dominant" ? "progressions" : "dark-harmony",
      functionId: choice.functionId,
      category: kind === "dominant" ? "secondary-dominant" : "secondary-diminished",
      targetFunctionId,
      targetId: targetFunctionId,
      mixPolicy: "must-resolve",
    },
    tonic,
  );
}

function targetChordForSecondary(
  identity: HarmonicFunctionIdentity,
  tonic: number,
): ChordDefinition | undefined {
  const target = identity.targetId ?? identity.targetFunctionId;
  if (!target) return undefined;
  const moduleId: HarmonicModuleId = identity.moduleId;
  try {
    return realizeChord({ moduleId, functionId: target, category: "core" }, tonic);
  } catch {
    return undefined;
  }
}

function diatonicFunctionForDegree(
  moduleId: HarmonicModuleId,
  degree: number,
  tonic: number,
): ChordDefinition | undefined {
  const spec =
    moduleId === "progressions"
      ? PROGRESSIONS_FUNCTIONS.find((item) => item.category === "core" && item.degree === degree)
      : DARK_HARMONY_CORE_FUNCTIONS.find((item) => item.degree === degree);
  if (!spec) return undefined;
  return realizeChord({ moduleId, functionId: spec.id, category: spec.category }, tonic);
}

function secondaryFunctionKind(identity: HarmonicFunctionIdentity): SecondaryKind | undefined {
  if (
    identity.category === "secondary-dominant" ||
    identity.functionId === "V7" ||
    identity.functionId.startsWith("V7/")
  )
    return "dominant";
  if (identity.category === "secondary-diminished" || identity.functionId.startsWith("vii°7/"))
    return "diminished";
  return undefined;
}

export function secondaryChoiceForFunction(
  identity: HarmonicFunctionIdentity,
): SecondaryFunctionChoice | undefined {
  const kind = secondaryFunctionKind(identity);
  if (!kind) return undefined;
  const choice = SECONDARY_FUNCTION_CHOICES.find(
    (candidate) => candidate.kind === kind && candidate.functionId === identity.functionId,
  );
  if (!choice) return undefined;
  if (
    (identity.targetId !== undefined && identity.targetId !== choice.targetFunctionId) ||
    (identity.targetFunctionId !== undefined &&
      identity.targetFunctionId !== choice.targetFunctionId)
  )
    return undefined;
  return choice;
}

function baseChordForEdit(
  identity: HarmonicFunctionIdentity,
  variant: HarmonicVariant,
  tonic: number,
): ChordDefinition {
  return withHarmonicVariant(realizeChord(identity, tonic), variant);
}

function optionsOnly(
  source: HarmonicVariant,
  base: HarmonicVariant,
  baseQuality: BaseChordQuality,
): HarmonicVariant {
  const suspensions = source.suspensions.filter(() => baseQuality !== "diminished");
  const alterations = source.alterations.filter(
    (alteration) => !(source.no5 && alteration.degree === 5),
  );
  return normalizeVariant({
    ...(base.baseQualityOverride !== undefined
      ? { baseQualityOverride: base.baseQualityOverride }
      : {}),
    ...(base.seventh !== undefined ? { seventh: base.seventh } : {}),
    extensions: base.extensions,
    suspensions: source.no3 ? [] : suspensions,
    alterations,
    ...(source.add9 && !base.extensions.includes(9) ? { add9: true } : {}),
    ...(source.add11 && !base.extensions.includes(11) ? { add11: true } : {}),
    ...(source.add13 && !base.extensions.includes(13) ? { add13: true } : {}),
    ...(source.no3 ? { no3: true } : {}),
    ...(source.no5 ? { no5: true } : {}),
  });
}

function bassChoiceForTone(tone: ResolvedChordTone): BassChoice {
  switch (tone.diatonicDegree) {
    case 1:
      return "root";
    case 2:
      return "second";
    case 3:
      return "third";
    case 4:
      return "fourth";
    case 5:
      return "fifth";
    case 7:
      return "seventh";
    case 9:
      return "ninth";
    case 11:
      return "eleventh";
    case 13:
      return "thirteenth";
    default:
      throw new RangeError(`Unsupported inversion chord degree: ${tone.diatonicDegree}`);
  }
}

function bassDegree(choice: BassChoice): number | undefined {
  switch (choice) {
    case "root":
      return 1;
    case "second":
      return 2;
    case "third":
      return 3;
    case "fourth":
      return 4;
    case "fifth":
      return 5;
    case "seventh":
      return 7;
    case "ninth":
      return 9;
    case "eleventh":
      return 11;
    case "thirteenth":
      return 13;
    default:
      return undefined;
  }
}

function performanceForChordChange(
  step: ChordStep,
  nextChord: ChordDefinition,
  previousChord: ChordDefinition,
): StepPerformance {
  const current = step.performance;
  const tones = resolveChordTones(nextChord);
  let inversion = current.inversion ?? "auto";
  let bass = current.bass;
  if (current.voicingMode !== "manual" && inversion !== "auto") {
    const previousTone = resolveChordTones(previousChord)[inversion];
    const nextTone = tones[inversion];
    if (!nextTone) {
      inversion = "auto";
      if (bass.choice !== "custom") bass = { ...bass, choice: "auto" };
    } else if (
      previousTone &&
      bass.choice !== "custom" &&
      bass.choice === bassChoiceForTone(previousTone)
    ) {
      bass = { ...bass, choice: bassChoiceForTone(nextTone) };
    }
  }
  const selectedBassDegree = bassDegree(bass.choice);
  if (
    selectedBassDegree !== undefined &&
    !tones.some((tone) => tone.diatonicDegree === selectedBassDegree)
  ) {
    bass = { ...bass, choice: "auto" };
  }
  if (inversion === (current.inversion ?? "auto") && bass === current.bass) return current;
  return Object.freeze({ ...current, inversion, bass: Object.freeze({ ...bass }) });
}

function sameState(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function commitChordState(
  step: ChordStep,
  tonic: number,
  harmonicFunction: HarmonicFunctionIdentity,
  harmonicVariant: HarmonicVariant,
  origin: ChordPropertiesOrigin,
  inversion?: InversionChoice,
  performanceOverride?: StepPerformance,
): ChordStep {
  const nextVariant = normalizeVariant(harmonicVariant);
  const nextBase = baseChordForEdit(harmonicFunction, nextVariant, tonic);
  const oldBase = currentChord(step, tonic);
  const performance =
    performanceOverride ??
    (inversion === undefined
      ? performanceForChordChange(step, nextBase, oldBase)
      : (() => {
          const { customPitch: _customPitch, ...bassWithoutCustomPitch } = step.performance.bass;
          return Object.freeze({
            ...step.performance,
            inversion,
            bass: Object.freeze(
              inversion === "auto"
                ? { ...bassWithoutCustomPitch, choice: "auto" as const }
                : {
                    ...bassWithoutCustomPitch,
                    choice: bassChoiceForTone(resolveChordTones(nextBase)[inversion]!),
                  },
            ),
          });
        })());
  const nextOrigin = snapshotChordPropertiesOrigin(origin);
  const { chordPropertiesOrigin: _oldOrigin, ...oldStep } = step;
  const updated = Object.freeze({
    ...oldStep,
    harmonicFunction: Object.freeze({ ...harmonicFunction }),
    harmonicVariant: nextVariant,
    performance,
    chordPropertiesOrigin: nextOrigin,
  });
  return sameState(updated, step) ? step : updated;
}

function withNextFunctionState(
  step: ChordStep,
  tonic: number,
  origin: ChordPropertiesOrigin,
  harmonicFunction: HarmonicFunctionIdentity,
  baseVariant: HarmonicVariant,
  keepIndependentOptions = true,
): ChordStep {
  const targetChord = withHarmonicVariant(realizeChord(harmonicFunction, tonic), baseVariant);
  const harmonicVariant = keepIndependentOptions
    ? optionsOnly(step.harmonicVariant, baseVariant, effectiveChordQuality(targetChord))
    : snapshotHarmonicVariant(baseVariant);
  const validation = validateHarmonicVariant(targetChord.baseQuality, harmonicVariant);
  if (!validation.valid) throw new RangeError(validation.errors.join("; "));
  return commitChordState(step, tonic, harmonicFunction, harmonicVariant, origin);
}

function normalizeVariantForCurrentChord(
  step: ChordStep,
  tonic: number,
  variant: HarmonicVariant,
): ChordStep {
  const chord = realizeChord(step.harmonicFunction, tonic);
  const normalized = normalizeVariant(variant);
  const validation = validateHarmonicVariant(chord.baseQuality, normalized);
  if (!validation.valid) throw new RangeError(validation.errors.join("; "));
  if (sameState(normalized, step.harmonicVariant)) return step;
  return commitChordState(step, tonic, step.harmonicFunction, normalized, withOriginalSource(step));
}

export function resetChordProperties(step: ChordStep): ChordStep {
  const origin = step.chordPropertiesOrigin;
  if (!origin) return step;
  const source = origin.source;
  const { chordPropertiesOrigin: _oldOrigin, ...withoutOrigin } = step;
  const { inversion: _oldInversion, ...performanceWithoutInversion } = step.performance;
  const performance: StepPerformance = Object.freeze({
    ...performanceWithoutInversion,
    ...(source.inversion !== undefined ? { inversion: source.inversion } : {}),
    bass: Object.freeze({
      ...source.bass,
      ...(source.bass.customPitch
        ? { customPitch: Object.freeze({ ...source.bass.customPitch }) }
        : {}),
    }),
  });
  return Object.freeze({
    ...withoutOrigin,
    harmonicFunction: Object.freeze({ ...source.harmonicFunction }),
    harmonicVariant: snapshotHarmonicVariant(source.harmonicVariant),
    performance,
  });
}

export function applyChordPropertiesEdit(
  step: ChordStep,
  tonic: number,
  activeModule: HarmonicModuleId,
  edit: ChordPropertiesEdit,
): ChordStep {
  if (edit.type === "reset") return resetChordProperties(step);

  // Manual voicing stores the exact sounding pitches. Tone-set and harmonic-function edits would
  // only change the symbol while leaving those pitches untouched, so keep the authoritative
  // manual realization intact until the user switches back to Auto Voicing.
  if (step.performance.voicingMode === "manual" && edit.type !== "bass") return step;

  if (edit.type === "secondary") {
    if (edit.kind === "diminished" && step.harmonicVariant.suspensions.length > 0) return step;
    const currentKind = secondaryFunctionKind(step.harmonicFunction);
    const origin = withOriginalSource(step);
    if (edit.kind === "none") {
      if (!currentKind) return step;
      if (origin.secondaryBase) {
        const restored = origin.secondaryBase;
        const nextOrigin = { ...origin };
        delete (nextOrigin as { secondaryBase?: ChordPropertiesFunctionState }).secondaryBase;
        return commitChordState(
          step,
          tonic,
          restored.harmonicFunction,
          restored.harmonicVariant,
          snapshotChordPropertiesOrigin(nextOrigin),
        );
      }
      const target = targetChordForSecondary(step.harmonicFunction, tonic);
      if (!target) return step;
      const nextOrigin = { ...origin };
      delete (nextOrigin as { secondaryBase?: ChordPropertiesFunctionState }).secondaryBase;
      return withNextFunctionState(
        step,
        tonic,
        snapshotChordPropertiesOrigin(nextOrigin),
        target.harmonicFunction,
        target.variant,
      );
    }
    const existingChoice = secondaryChoiceForFunction(step.harmonicFunction);
    if (
      existingChoice?.kind === edit.kind &&
      existingChoice.targetFunctionId === edit.targetFunctionId
    )
      return step;
    if (isBorrowedFunction(step.harmonicFunction)) {
      throw new RangeError("Secondary functions cannot be combined with Borrow From");
    }
    const choice = SECONDARY_FUNCTION_CHOICES.find(
      (item) => item.kind === edit.kind && item.targetFunctionId === edit.targetFunctionId,
    );
    if (!choice)
      throw new RangeError(`Unsupported secondary target: ${String(edit.targetFunctionId)}`);
    const nextChord = secondaryFunction(edit.kind, choice.targetFunctionId, tonic);
    const nextOrigin: ChordPropertiesOrigin = {
      ...origin,
      ...(!currentKind && !origin.secondaryBase
        ? { secondaryBase: functionState(step.harmonicFunction, step.harmonicVariant) }
        : {}),
    };
    return withNextFunctionState(
      step,
      tonic,
      nextOrigin,
      nextChord.harmonicFunction,
      nextChord.variant,
    );
  }

  if (edit.type === "borrow") {
    const currentMode = borrowedModeForFunction(step.harmonicFunction);
    if (edit.mode === null) {
      if (!currentMode) return step;
      const origin = withOriginalSource(step);
      if (origin.borrowBase) {
        const restored = origin.borrowBase;
        const nextOrigin = { ...origin };
        delete (nextOrigin as { borrowBase?: ChordPropertiesFunctionState }).borrowBase;
        return commitChordState(
          step,
          tonic,
          restored.harmonicFunction,
          restored.harmonicVariant,
          snapshotChordPropertiesOrigin(nextOrigin),
        );
      }
      const degree = borrowedDegreeForFunction(step.harmonicFunction);
      const target = degree ? diatonicFunctionForDegree(activeModule, degree, tonic) : undefined;
      if (!target) return step;
      const nextOrigin = { ...origin };
      delete (nextOrigin as { borrowBase?: ChordPropertiesFunctionState }).borrowBase;
      return withNextFunctionState(
        step,
        tonic,
        snapshotChordPropertiesOrigin(nextOrigin),
        target.harmonicFunction,
        target.variant,
      );
    }
    if (currentMode === edit.mode) return step;
    if (isSecondary(step.harmonicFunction)) {
      throw new RangeError("Borrow From cannot be combined with a Secondary function");
    }
    const origin = withOriginalSource(step);
    const baseState =
      origin.borrowBase ?? functionState(step.harmonicFunction, step.harmonicVariant);
    const degree = chordDegreeForFunction(baseState.harmonicFunction);
    if (!degree || degree < 1 || degree > 7) {
      throw new RangeError(
        "Borrow From is unavailable because this chord has no supported diatonic degree",
      );
    }
    const modeChord = computeModalChords(tonic, edit.mode).find((item) => item.degree === degree);
    if (!modeChord) throw new RangeError(`No degree ${degree} chord exists in ${edit.mode}`);
    if (
      step.harmonicVariant.suspensions.length > 0 &&
      effectiveChordQuality(modeChord.chord) === "diminished"
    )
      return step;
    const identity: HarmonicFunctionIdentity = Object.freeze({
      ...modeChord.chord.harmonicFunction,
      category: "modal-interchange",
      borrowedFromMode: edit.mode as DiatonicMode,
      borrowedDegree: degree as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      mixPolicy: "mix-freely",
    });
    const nextOrigin: ChordPropertiesOrigin = {
      ...origin,
      ...(!origin.borrowBase
        ? { borrowBase: functionState(step.harmonicFunction, step.harmonicVariant) }
        : {}),
    };
    return withNextFunctionState(step, tonic, nextOrigin, identity, modeChord.chord.variant);
  }

  const chord = currentChord(step, tonic);
  const variant = step.harmonicVariant;
  if (edit.type === "type") {
    const next = defaultVariantForType(chord, edit.value);
    const quality = effectiveChordQuality(chord);
    const validation = validateHarmonicVariant(next.baseQualityOverride ?? quality, next);
    if (!validation.valid) throw new RangeError(validation.errors.join("; "));
    return normalizeVariantForCurrentChord(step, tonic, next);
  }
  if (edit.type === "quality") {
    if (chordQualityForControl(chord) === edit.value) return step;
    if (edit.value === "diminished" && variant.suspensions.length > 0) return step;
    const hasSeventh = chordTypeForDefinition(chord) !== "triad";
    const currentSeventh = seventhForDefinition(chord);
    const nextSeventh = !hasSeventh
      ? undefined
      : (currentSeventh === "half-diminished7" || currentSeventh === "diminished7") &&
          edit.value !== "diminished"
        ? "minor7"
        : (currentSeventh ?? defaultSeventhForQuality(edit.value));
    const next = normalizeVariant({
      ...variant,
      baseQualityOverride: edit.value,
      ...(hasSeventh && nextSeventh !== undefined ? { seventh: nextSeventh } : {}),
    });
    return normalizeVariantForCurrentChord(step, tonic, next);
  }
  if (edit.type === "seventh") {
    const quality = effectiveChordQuality(chord);
    if (
      quality !== "diminished" &&
      (edit.value === "half-diminished7" || edit.value === "diminished7")
    ) {
      throw new RangeError("That seventh is unavailable for the selected base quality");
    }
    return normalizeVariantForCurrentChord(
      step,
      tonic,
      normalizeVariant({ ...variant, seventh: edit.value }),
    );
  }
  if (edit.type === "suspension") {
    if (edit.value && variant.no3) throw new RangeError("Clear no3 before adding a suspension");
    const suspensions = edit.value ? [edit.value] : [];
    return normalizeVariantForCurrentChord(
      step,
      tonic,
      normalizeVariant({ ...variant, suspensions }),
    );
  }
  if (edit.type === "added-tone") {
    const extension = edit.degree as ChordExtension;
    if (edit.enabled && variant.extensions.includes(extension)) {
      throw new RangeError(`Extension ${edit.degree} already includes this tone`);
    }
    const key = edit.degree === 9 ? "add9" : edit.degree === 11 ? "add11" : "add13";
    return normalizeVariantForCurrentChord(
      step,
      tonic,
      normalizeVariant({ ...variant, [key]: edit.enabled ? true : undefined }),
    );
  }
  if (edit.type === "alteration") {
    const alterations = variant.alterations.filter((item) => item.degree !== edit.degree);
    if (edit.semitones !== null)
      alterations.push({ degree: edit.degree, semitones: edit.semitones });
    return normalizeVariantForCurrentChord(
      step,
      tonic,
      normalizeVariant({ ...variant, alterations }),
    );
  }
  if (edit.type === "omission") {
    if (edit.enabled && edit.degree === 3 && variant.suspensions.length > 0) {
      throw new RangeError("Clear sus2/sus4 before omitting the third");
    }
    if (
      edit.enabled &&
      edit.degree === 5 &&
      variant.alterations.some((item) => item.degree === 5)
    ) {
      throw new RangeError("Clear the fifth alteration before omitting the fifth");
    }
    return normalizeVariantForCurrentChord(
      step,
      tonic,
      normalizeVariant({
        ...variant,
        [edit.degree === 3 ? "no3" : "no5"]: edit.enabled || undefined,
      }),
    );
  }
  if (edit.type === "inversion") {
    if (step.performance.voicingMode === "manual") {
      throw new RangeError("Automatic inversion is unavailable while Manual voicing is active");
    }
    if (edit.value !== "auto" && step.performance.bass.choice === "custom") {
      throw new RangeError("Choose Auto or a chord-tone bass before selecting an inversion");
    }
    if (edit.value !== "auto" && edit.value >= resolveChordTones(chord).length) {
      throw new RangeError("This inversion is unavailable for the current chord tones");
    }
    const expectedBass =
      edit.value === "auto" ? "auto" : bassChoiceForTone(resolveChordTones(chord)[edit.value]!);
    if (
      (step.performance.inversion ?? "auto") === edit.value &&
      step.performance.bass.choice === expectedBass &&
      step.performance.bass.customPitch === undefined
    )
      return step;
    return commitChordState(
      step,
      tonic,
      step.harmonicFunction,
      step.harmonicVariant,
      withOriginalSource(step),
      edit.value,
    );
  }
  if (edit.type === "bass") {
    const degree = bassDegree(edit.value.choice);
    if (
      degree !== undefined &&
      !resolveChordTones(chord).some((tone) => tone.diatonicDegree === degree)
    ) {
      throw new RangeError(
        `Bass ${edit.value.choice} is unavailable because the chord does not contain that tone`,
      );
    }
    if (edit.value.choice === "custom" && !edit.value.customPitch) {
      throw new RangeError("A custom bass pitch is required");
    }
    if (sameState(step.performance.bass, edit.value)) return step;
    const performance: StepPerformance = Object.freeze({
      ...step.performance,
      bass: Object.freeze({ ...edit.value }),
    });
    return commitChordState(
      step,
      tonic,
      step.harmonicFunction,
      variant,
      withOriginalSource(step),
      undefined,
      performance,
    );
  }
  return step;
}

export function chordTonesForStep(step: ChordStep, tonic: number): readonly ResolvedChordTone[] {
  return resolveChordTones(currentChord(step, tonic));
}
