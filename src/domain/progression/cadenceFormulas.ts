import { rational } from "../timing/rational";
import { musicalDuration } from "../timing/duration";
import { createFunctionalPreset, type FunctionalPreset, type PresetStep } from "./presets";
import type { GenreFocusId } from "../harmony/functionSemantics";

export type CadenceFormulaCategory = "cadence" | "turnaround" | "loop" | "modal-path";

export type CadenceFormulaGenre =
  | GenreFocusId
  | "dark-classical"
  | "flamenco";

export interface CadenceFormula extends FunctionalPreset {
  readonly formulaId: string;
  readonly genre: CadenceFormulaGenre;
  readonly category: CadenceFormulaCategory;
  readonly theoreticalRationale: string;
  readonly recommendedModule: "progressions" | "dark-harmony" | "both";
  readonly tags: readonly string[];
}

function makeFormula(
  id: string,
  name: string,
  genre: CadenceFormulaGenre,
  category: CadenceFormulaCategory,
  recommendedModule: "progressions" | "dark-harmony" | "both",
  description: string,
  theoreticalRationale: string,
  tags: readonly string[],
  steps: readonly PresetStep[],
): CadenceFormula {
  const basePreset = createFunctionalPreset(id, name, "builtIn", steps, description);
  return Object.freeze({
    ...basePreset,
    formulaId: id,
    genre,
    category,
    recommendedModule,
    theoreticalRationale,
    tags: Object.freeze([...tags]),
  });
}

/**
 * Curated Canonical Cadence Formulas & Quick Starters (Phase 4).
 * Rooted in ChordFiles and music theory fundamentals.
 * Strictly adheres to FunctionalPreset contract: harmonic functions + durations only,
 * zero performance, voicing, or variant leakage.
 */
export const CADENCE_FORMULAS: readonly CadenceFormula[] = Object.freeze([
  // 1. Gospel Lift
  makeFormula(
    "formula-gospel-lift",
    "Gospel Lift",
    "gospel",
    "cadence",
    "progressions",
    "Subdominant tonicization weeping into minor iv modal mixture (I – V7/IV – IV – iv – I).",
    "Creates characteristic gospel pathos and emotional lift: tonicizes the subdominant via V7/IV, immediately introduces chromatic tears via the borrowed minor subdominant (iv), and resolves warmly to I.",
    ["gospel", "modal-mixture", "secondary-dominant", "subdominant-minor", "uplift"],
    [
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: {
          moduleId: "progressions",
          functionId: "V7/IV",
          category: "secondary-dominant",
          targetFunctionId: "IV",
        },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "iv", category: "modal-interchange" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
  ),

  // 2. Neo-Soul Turnaround
  makeFormula(
    "formula-neosoul-turnaround",
    "Neo-Soul Turnaround",
    "neo-soul",
    "turnaround",
    "progressions",
    "Secondary dominant leading into supertonic and dominant turnaround (I – V7/ii – ii – V7 – I).",
    "Classic neo-soul and jazz circular turnaround: tonicizes the supertonic minor with V7/ii (VI7), followed by standard ii–V7 resolution back to the tonic for infinite, smooth groove repetition.",
    ["neo-soul", "jazz", "secondary-dominant", "turnaround", "circle-of-fifths"],
    [
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: {
          moduleId: "progressions",
          functionId: "V7/ii",
          category: "secondary-dominant",
          targetFunctionId: "ii",
        },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "ii", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: {
          moduleId: "progressions",
          functionId: "V7",
          category: "secondary-dominant",
          targetFunctionId: "I",
        },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
  ),

  // 3. Backdoor Cadence
  makeFormula(
    "formula-backdoor-cadence",
    "Backdoor Cadence",
    "jazz",
    "cadence",
    "progressions",
    "Subdominant minor substitute resolving step-wise into major tonic (ii – bVII – I).",
    "The backdoor dominant resolution: bVII acts as a smooth modal substitute for V7, sharing chromatic tendency tones with the minor subdominant iv and resolving gently up to the major tonic.",
    ["jazz", "neo-soul", "modal-mixture", "backdoor", "subdominant-minor"],
    [
      {
        harmonicFunction: { moduleId: "progressions", functionId: "ii", category: "core" },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "bVII", category: "modal-interchange" },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
  ),

  // 4. Deceptive Cadence
  makeFormula(
    "formula-deceptive-drama",
    "Deceptive Cadence",
    "pop-ballad",
    "cadence",
    "progressions",
    "Postpones expected tonic resolution by diverting dominant to submediant (I – IV – V7 – vi).",
    "Classical interrupted / deceptive cadence: the dominant V7 builds intense tension toward I, but dramatically detours to the relative minor vi, creating longing, surprise, and renewed forward motion.",
    ["pop-ballad", "classical", "interrupted-cadence", "deceptive", "drama"],
    [
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: {
          moduleId: "progressions",
          functionId: "V7",
          category: "secondary-dominant",
          targetFunctionId: "I",
        },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "vi", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
  ),

  // 5. Cinematic Hero (Epic Mediant Loop)
  makeFormula(
    "formula-cinematic-hero",
    "Cinematic Hero",
    "cinematic",
    "loop",
    "progressions",
    "Epic chromatic mediant loop powered by modal borrowing (I – bVI – bIII – bVII).",
    "The definitive Hollywood hero progression: departs tonic into flat submediant bVI, shifts via chromatic mediant to bIII, and passes through bVII for monumental emotional weight.",
    ["cinematic", "chromatic-mediant", "modal-mixture", "epic", "hero-loop"],
    [
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "bVI", category: "modal-interchange" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "bIII", category: "modal-interchange" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "bVII", category: "modal-interchange" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
  ),

  // 6. Neapolitan Path
  makeFormula(
    "formula-neapolitan-path",
    "Neapolitan Path",
    "dark-classical",
    "cadence",
    "dark-harmony",
    "Lowered supertonic pre-dominant leading into authentic minor cadence (i – N6 – V – i).",
    "The legendary Neapolitan chord (N6): flat-supertonic major triad introduces stark chromatic tragedy, resolving with powerful voice leading into the major dominant V and home to i.",
    ["dark-classical", "neapolitan", "chromatic", "tragedy", "authentic-cadence"],
    [
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "N6", category: "neapolitan" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "V", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
  ),

  // 7. Flamenco Descent
  makeFormula(
    "formula-flamenco-descent",
    "Flamenco Descent",
    "flamenco",
    "modal-path",
    "dark-harmony",
    "Iconic descending step-wise tetrachord cadence into dominant (i – VII – VI – V).",
    "Flamenco and Spanish descending cadence: step-wise bass descent (1 – b7 – b6 – 5) creates ancient, tragic gravitational pull resolving on the Phrygian dominant V.",
    ["flamenco", "rock", "descending-tetrachord", "phrygian", "modal-path"],
    [
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "VII", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "VI", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "V", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
  ),

  // 8. Dark Passing Drama
  makeFormula(
    "formula-dark-passing-drama",
    "Dark Passing Drama",
    "cinematic",
    "cadence",
    "dark-harmony",
    "Chromatic passing diminished connector between tonic and dominant (i – Pass°7 – V – i).",
    "Sharpened-fourth passing diminished 7th chord (Pass°7 = #iv°7) introduces chilling suspense, acting as a razor-sharp chromatic wedge into dominant V.",
    ["cinematic", "dark-harmony", "diminished-passing", "suspense", "chromatic"],
    [
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "Pass°7", category: "chromatic-color" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "V", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
  ),

  // 9. Secondary Diminished Subdominant
  makeFormula(
    "formula-secondary-dim-subdominant",
    "Subdominant Drama",
    "dark-classical",
    "cadence",
    "dark-harmony",
    "Leading-tone diminished tonicization into subdominant minor (i – vii°7/iv – iv – V – i).",
    "Tonicizes the subdominant minor (iv) with its leading-tone diminished seventh chord (vii°7/iv), intensifying minor melancholy before resolving through authentic cadence.",
    ["dark-classical", "secondary-diminished", "subdominant", "melancholy"],
    [
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: {
          moduleId: "dark-harmony",
          functionId: "vii°7/iv",
          category: "secondary-diminished",
          targetFunctionId: "iv",
        },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "iv", category: "core" },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "V", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
  ),

  // 10. Pop Ballad Axis
  makeFormula(
    "formula-pop-ballad-axis",
    "Pop Ballad Axis",
    "pop-ballad",
    "loop",
    "progressions",
    "The universal emotive four-chord songwriting loop (I – V – vi – IV).",
    "The foundation of modern pop songwriting: provides perfect emotional balance between bright tonic stability, dominant motion, relative minor vulnerability, and subdominant uplift.",
    ["pop-ballad", "four-chords", "songwriting", "uplift", "loop"],
    [
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "vi", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
  ),
]);

export const CADENCE_FORMULAS_BY_ID: ReadonlyMap<string, CadenceFormula> = new Map(
  CADENCE_FORMULAS.map((formula) => [formula.id, formula]),
);

export function getCadenceFormulas(): readonly CadenceFormula[] {
  return CADENCE_FORMULAS;
}

export function getCadenceFormulaById(id: string): CadenceFormula | undefined {
  return CADENCE_FORMULAS_BY_ID.get(id);
}

export function getFormulasForModule(moduleId: "progressions" | "dark-harmony"): readonly CadenceFormula[] {
  return CADENCE_FORMULAS.filter(
    (formula) => formula.recommendedModule === moduleId || formula.recommendedModule === "both",
  );
}

export function getFormulasForGenre(
  genre: GenreFocusId | "all",
  moduleId?: "progressions" | "dark-harmony",
): readonly CadenceFormula[] {
  let list = CADENCE_FORMULAS;
  if (moduleId) {
    list = list.filter((f) => f.recommendedModule === moduleId || f.recommendedModule === "both");
  }
  if (genre === "all") return list;
  return list.filter((f) => f.genre === genre || f.tags.includes(genre));
}

export function getQuickStartersForModule(
  moduleId: "progressions" | "dark-harmony",
  genreFocus?: GenreFocusId,
): readonly CadenceFormula[] {
  const moduleFormulas = getFormulasForModule(moduleId);
  if (genreFocus && genreFocus !== "all") {
    const genreMatched = moduleFormulas.filter(
      (f) => f.genre === genreFocus || f.tags.includes(genreFocus),
    );
    if (genreMatched.length > 0) {
      const rest = moduleFormulas.filter((f) => !genreMatched.includes(f));
      return [...genreMatched, ...rest];
    }
  }
  return moduleFormulas;
}
