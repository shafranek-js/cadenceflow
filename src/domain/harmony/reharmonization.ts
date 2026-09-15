import type { HarmonicFunctionIdentity, HarmonicModuleId } from "./functions";
import type { HarmonicVariant } from "./chord";
import { realizeChord } from "./realization";
import { formatChordSymbol } from "./chord";
import type { PitchClassIdentity } from "./pitch";
import type { ChordStep } from "../progression/step";
import { getHarmonicModule, recommendationVocabulary } from "./moduleRegistry";

export type SubstitutionKind =
  | "tritone"
  | "modal-swap"
  | "relative"
  | "secondary-dominant"
  | "passing-diminished"
  | "dominant-extension";

export interface ChordSubstitution {
  readonly id: string;
  readonly kind: SubstitutionKind;
  readonly title: string;
  readonly targetFunctionId: string;
  readonly targetModuleId?: HarmonicModuleId;
  readonly harmonicVariant?: HarmonicVariant;
  readonly operation: "replace" | "insert-before";
  readonly chordSymbol: string;
  readonly description: string;
  readonly theoreticalRationale: string;
  readonly tags: readonly string[];
}

interface RawSubstitutionTemplate {
  readonly id: string;
  readonly kind: SubstitutionKind;
  readonly title: string;
  readonly targetFunctionId: string;
  readonly targetModuleId?: HarmonicModuleId;
  readonly harmonicVariant?: HarmonicVariant;
  readonly operation: "replace" | "insert-before";
  readonly description: string;
  readonly theoreticalRationale: string;
  readonly tags: readonly string[];
}

const list = (...items: RawSubstitutionTemplate[]): readonly RawSubstitutionTemplate[] =>
  Object.freeze(items);

const MAJOR_SUBSTITUTION_CATALOG: Readonly<Record<string, readonly RawSubstitutionTemplate[]>> =
  Object.freeze({
    I: list(
      {
        id: "I-to-vi",
        kind: "relative",
        title: "Swap to Relative Minor (vi)",
        targetFunctionId: "vi",
        operation: "replace",
        description: "Replaces tonic major with relative minor.",
        theoreticalRationale:
          "The submediant (vi) shares two common tones with the tonic triad (in C: C and E), offering a bittersweet, melancholy variation while preserving tonic stability.",
        tags: ["Relative", "Tonic Family", "Melancholy"],
      },
      {
        id: "I-to-iii",
        kind: "relative",
        title: "Swap to Mediant (iii)",
        targetFunctionId: "iii",
        operation: "replace",
        description: "Replaces tonic major with mediant minor.",
        theoreticalRationale:
          "The mediant (iii) shares common tones (3rd and 5th) with the tonic, providing an airy, introspective tonic expansion without final resolution.",
        tags: ["Relative", "Tonic Family", "Introspective"],
      },
      {
        id: "I-to-bVI",
        kind: "modal-swap",
        title: "Chromatic Mediant swap (♭VI)",
        targetFunctionId: "bVI",
        operation: "replace",
        description: "Replaces tonic with flat submediant from parallel minor.",
        theoreticalRationale:
          "Borrowed from the parallel minor, ♭VI provides a lush, majestic chromatic mediant shift widely used in film scoring and epic anthems.",
        tags: ["Modal Mixture", "Cinematic", "Epic"],
      },
      {
        id: "I-to-bIII",
        kind: "modal-swap",
        title: "Modal Mediant swap (♭III)",
        targetFunctionId: "bIII",
        operation: "replace",
        description: "Replaces tonic with flat mediant from parallel minor.",
        theoreticalRationale:
          "Borrowing the flat third degree from parallel minor injects dramatic optimism and bold rock/gospel color.",
        tags: ["Modal Mixture", "Rock/Gospel", "Bold"],
      },
      {
        id: "I-insert-V7",
        kind: "secondary-dominant",
        title: "Insert dominant cadence (V7)",
        targetFunctionId: "V7",
        operation: "insert-before",
        description: "Inserts primary dominant seventh before tonic.",
        theoreticalRationale:
          "Inserts the primary dominant seventh chord immediately before the tonic to establish an authoritative authentic cadence.",
        tags: ["Cadence", "Dominant", "Resolution"],
      },
      {
        id: "I-insert-subV7",
        kind: "tritone",
        title: "Insert tritone substitute (subV7)",
        targetFunctionId: "subV7",
        operation: "insert-before",
        description: "Inserts ♭II7 chromatic approach before tonic.",
        theoreticalRationale:
          "Inserts the dominant 7th a half-step above the tonic (♭II7), delivering a smooth chromatic bass descent (D♭ → C) while sharing identical tritone guide tones.",
        tags: ["Tritone Sub", "Jazz", "Chromatic Bass"],
      },
    ),

    ii: list(
      {
        id: "ii-to-IV",
        kind: "relative",
        title: "Swap to Subdominant (IV)",
        targetFunctionId: "IV",
        operation: "replace",
        description: "Replaces supertonic minor with subdominant major.",
        theoreticalRationale:
          "Both ii and IV belong to the subdominant family and prepare dominant harmony. Swapping to IV adds warmth, open resonance, and diatonic lift.",
        tags: ["Functional Swap", "Subdominant", "Warm"],
      },
      {
        id: "ii-insert-V7ii",
        kind: "secondary-dominant",
        title: "Insert secondary dominant (V7/ii)",
        targetFunctionId: "V7/ii",
        operation: "insert-before",
        description: "Inserts secondary dominant of ii before supertonic.",
        theoreticalRationale:
          "Inserts VI7 before the supertonic to create a classic circular fifth progression (A7 → Dm) full of soulful momentum.",
        tags: ["Secondary Dominant", "Circle of Fifths", "Soulful"],
      },
    ),

    IV: list(
      {
        id: "IV-to-iv",
        kind: "modal-swap",
        title: "Minor Subdominant swap (iv)",
        targetFunctionId: "iv",
        operation: "replace",
        description: "Borrow minor subdominant from parallel minor.",
        theoreticalRationale:
          "The iconic weeping borrowed iv chord introduces the flat sixth scale degree (A♭ in C), creating the deeply emotional Gospel and romantic minor plagal cadence.",
        tags: ["Modal Mixture", "Gospel", "Emotional"],
      },
      {
        id: "IV-to-ii",
        kind: "relative",
        title: "Swap to Supertonic (ii)",
        targetFunctionId: "ii",
        operation: "replace",
        description: "Replaces major subdominant with minor supertonic.",
        theoreticalRationale:
          "Exchanging the major IV with minor ii tightens voice leading into dominant V while maintaining clear predominant function.",
        tags: ["Functional Swap", "Predominant", "Jazz/Pop"],
      },
      {
        id: "IV-insert-V7IV",
        kind: "secondary-dominant",
        title: "Insert secondary dominant (V7/IV)",
        targetFunctionId: "V7/IV",
        operation: "insert-before",
        description: "Inserts tonic dominant seventh before subdominant.",
        theoreticalRationale:
          "Inserts the tonic dominant seventh (I7) to tonicize the subdominant, adding bluesy forward momentum.",
        tags: ["Secondary Dominant", "Tonicization", "Blues"],
      },
    ),

    V: list(
      {
        id: "V-to-V7",
        kind: "dominant-extension",
        title: "Enrich to Dominant 7th (V7)",
        targetFunctionId: "V7",
        operation: "replace",
        description: "Upgrades dominant triad to dominant 7th.",
        theoreticalRationale:
          "Adds the minor 7th to form the active tritone with the leading tone, drastically increasing harmonic tension and urge to resolve.",
        tags: ["Dominant", "Guide Tones", "Tension"],
      },
      {
        id: "V-to-subV7",
        kind: "tritone",
        title: "Tritone substitution (subV7)",
        targetFunctionId: "subV7",
        operation: "replace",
        description: "Replaces dominant with ♭II7 tritone substitute.",
        theoreticalRationale:
          "Replaces V with the dominant chord a tritone away (♭II7). Shares identical 3rd and 7th guide tones with a chromatic bass slide.",
        tags: ["Tritone Sub", "Bebop", "Chromatic"],
      },
      {
        id: "V-to-bVII",
        kind: "modal-swap",
        title: "Backdoor cadence swap (♭VII)",
        targetFunctionId: "bVII",
        operation: "replace",
        description: "Replaces V with borrowed backdoor ♭VII.",
        theoreticalRationale:
          "Replaces V with borrowed ♭VII for the famous backdoor resolution to I, beloved in jazz, fusion, and neo-soul.",
        tags: ["Backdoor", "Neo-Soul", "Modal"],
      },
      {
        id: "V-to-viio",
        kind: "relative",
        title: "Leading tone swap (vii°)",
        targetFunctionId: "vii°",
        operation: "replace",
        description: "Replaces V with leading-tone diminished triad.",
        theoreticalRationale:
          "The vii° triad functions as a rootless dominant seventh, offering a stark, tense dominant alternative.",
        tags: ["Dominant Group", "Rootless", "High Tension"],
      },
      {
        id: "V-insert-V7V",
        kind: "secondary-dominant",
        title: "Insert secondary dominant (V7/V)",
        targetFunctionId: "V7/V",
        operation: "insert-before",
        description: "Inserts dominant of dominant before V.",
        theoreticalRationale:
          "Inserts II7 before V to build a powerful sequential drive into the dominant (the classic jazz ii-V setup).",
        tags: ["Secondary Dominant", "Drive", "Jazz"],
      },
    ),

    V7: list(
      {
        id: "V7-to-subV7",
        kind: "tritone",
        title: "Tritone substitution (subV7)",
        targetFunctionId: "subV7",
        operation: "replace",
        description: "Replaces V7 with ♭II7 tritone substitute.",
        theoreticalRationale:
          "Replaces V7 with ♭II7. Both chords share the identical tritone interval, resolving smoothly by downward half-step into the tonic.",
        tags: ["Tritone Sub", "Bebop", "Chromatic Bass"],
      },
      {
        id: "V7-to-bVII",
        kind: "modal-swap",
        title: "Backdoor cadence swap (♭VII)",
        targetFunctionId: "bVII",
        operation: "replace",
        description: "Replaces V7 with borrowed backdoor ♭VII.",
        theoreticalRationale:
          "Replaces V7 with borrowed ♭VII for an uplifting, non-traditional resolution back to the tonic.",
        tags: ["Backdoor", "Fusion", "Neo-Soul"],
      },
      {
        id: "V7-insert-V7V",
        kind: "secondary-dominant",
        title: "Insert secondary dominant (V7/V)",
        targetFunctionId: "V7/V",
        operation: "insert-before",
        description: "Chains secondary dominant before V7.",
        theoreticalRationale:
          "Precedes V7 with its own dominant (II7) for an authoritative cadential climax.",
        tags: ["Secondary Dominant", "Cadential", "Climax"],
      },
    ),

    vi: list(
      {
        id: "vi-to-I",
        kind: "relative",
        title: "Swap to Tonic (I)",
        targetFunctionId: "I",
        operation: "replace",
        description: "Brightens relative minor to tonic major.",
        theoreticalRationale:
          "Exchanges the relative minor with the tonic major to brighten the progression and establish resolution.",
        tags: ["Relative", "Tonic", "Bright"],
      },
      {
        id: "vi-to-IV",
        kind: "relative",
        title: "Swap to Subdominant (IV)",
        targetFunctionId: "IV",
        operation: "replace",
        description: "Replaces submediant with subdominant.",
        theoreticalRationale:
          "Exchanges vi with IV (both share scale degrees 1 and 6) to shift from passive rest into active major motion.",
        tags: ["Functional Swap", "Major Lift"],
      },
      {
        id: "vi-insert-V7vi",
        kind: "secondary-dominant",
        title: "Insert secondary dominant (V7/vi)",
        targetFunctionId: "V7/vi",
        operation: "insert-before",
        description: "Inserts secondary dominant III7 before vi.",
        theoreticalRationale:
          "Inserts III7 before vi, introducing the leading tone of the relative minor for a dramatic emotional lift.",
        tags: ["Secondary Dominant", "Dramatic", "Minor Tonicization"],
      },
    ),

    iii: list(
      {
        id: "iii-to-I",
        kind: "relative",
        title: "Swap to Tonic (I)",
        targetFunctionId: "I",
        operation: "replace",
        description: "Exchanges mediant with tonic major.",
        theoreticalRationale:
          "Exchanges mediant with tonic major, trading harmonic ambiguity for grounded resolution.",
        tags: ["Tonic Group", "Resolution"],
      },
      {
        id: "iii-insert-V7iii",
        kind: "secondary-dominant",
        title: "Insert secondary dominant (V7/iii)",
        targetFunctionId: "V7/iii",
        operation: "insert-before",
        description: "Inserts secondary dominant VII7 before iii.",
        theoreticalRationale:
          "Inserts VII7 before iii, sharpening harmonic color with a vivid secondary dominant pulse.",
        tags: ["Secondary Dominant", "Color"],
      },
    ),

    iv: list(
      {
        id: "iv-to-IV",
        kind: "modal-swap",
        title: "Swap to Major Subdominant (IV)",
        targetFunctionId: "IV",
        operation: "replace",
        description: "Restores major diatonic subdominant.",
        theoreticalRationale:
          "Restores the major diatonic subdominant for an open, optimistic sound.",
        tags: ["Diatonic", "Bright"],
      },
      {
        id: "iv-to-bVI",
        kind: "modal-swap",
        title: "Swap to Flat Submediant (♭VI)",
        targetFunctionId: "bVI",
        operation: "replace",
        description: "Swaps to Aeolian flat submediant.",
        theoreticalRationale:
          "Both iv and ♭VI are drawn from parallel Aeolian; ♭VI delivers expansive cinematic majesty.",
        tags: ["Modal Mixture", "Cinematic"],
      },
    ),

    bVI: list(
      {
        id: "bVI-to-IV",
        kind: "modal-swap",
        title: "Swap to Subdominant (IV)",
        targetFunctionId: "IV",
        operation: "replace",
        description: "Returns to diatonic subdominant.",
        theoreticalRationale:
          "Replaces the dark modal borrowing with the pure diatonic fourth degree.",
        tags: ["Diatonic", "Subdominant"],
      },
      {
        id: "bVI-to-iv",
        kind: "modal-swap",
        title: "Swap to Minor Subdominant (iv)",
        targetFunctionId: "iv",
        operation: "replace",
        description: "Swaps to minor subdominant.",
        theoreticalRationale:
          "Keeps parallel minor flavor while shifting to standard subdominant voicing.",
        tags: ["Modal Mixture", "Gospel"],
      },
    ),

    bIII: list(
      {
        id: "bIII-to-I",
        kind: "modal-swap",
        title: "Swap to Tonic Major (I)",
        targetFunctionId: "I",
        operation: "replace",
        description: "Returns to primary tonic.",
        theoreticalRationale:
          "Returns to the primary tonic center from the borrowed minor mediant.",
        tags: ["Tonic", "Resolution"],
      },
      {
        id: "bIII-to-bVI",
        kind: "modal-swap",
        title: "Swap to Flat Submediant (♭VI)",
        targetFunctionId: "bVI",
        operation: "replace",
        description: "Swaps between parallel minor mediants.",
        theoreticalRationale:
          "Swaps between the two major third-related modal borrowing chords for dramatic variety.",
        tags: ["Modal Mixture", "Cinematic"],
      },
    ),

    bVII: list(
      {
        id: "bVII-to-V",
        kind: "modal-swap",
        title: "Swap to Dominant (V)",
        targetFunctionId: "V",
        operation: "replace",
        description: "Replaces backdoor chord with diatonic dominant.",
        theoreticalRationale:
          "Replaces the modal backdoor cadence with the standard diatonic fifth-degree dominant.",
        tags: ["Diatonic", "Dominant"],
      },
      {
        id: "bVII-to-V7",
        kind: "dominant-extension",
        title: "Swap to Dominant 7th (V7)",
        targetFunctionId: "V7",
        operation: "replace",
        description: "Replaces backdoor chord with dominant 7th.",
        theoreticalRationale:
          "Replaces backdoor cadence with the tension of the dominant seventh chord.",
        tags: ["Dominant", "Cadence"],
      },
    ),

    subV7: list(
      {
        id: "subV7-to-V7",
        kind: "tritone",
        title: "Swap back to Primary Dominant (V7)",
        targetFunctionId: "V7",
        operation: "replace",
        description: "Returns from tritone substitute to fifth-degree dominant.",
        theoreticalRationale:
          "Returns from the chromatic tritone substitute to the traditional fifth-degree dominant.",
        tags: ["Dominant", "Traditional"],
      },
    ),
  });

const MINOR_SUBSTITUTION_CATALOG: Readonly<Record<string, readonly RawSubstitutionTemplate[]>> =
  Object.freeze({
    i: list(
      {
        id: "i-to-III",
        kind: "relative",
        title: "Swap to Relative Major (III)",
        targetFunctionId: "III",
        operation: "replace",
        description: "Opens minor tonic to relative major.",
        theoreticalRationale:
          "Swapping minor tonic to relative major opens the mood from brooding tension to sunlit warmth.",
        tags: ["Relative Major", "Uplifting"],
      },
      {
        id: "i-to-VI",
        kind: "relative",
        title: "Swap to Submediant (VI)",
        targetFunctionId: "VI",
        operation: "replace",
        description: "Replaces tonic with deceptive submediant.",
        theoreticalRationale:
          "The VI degree shares the tonic third and fifth, producing the quintessential deceptive cadence rest.",
        tags: ["Deceptive", "Submediant", "Cinematic"],
      },
      {
        id: "i-insert-V",
        kind: "secondary-dominant",
        title: "Insert dominant cadence (V)",
        targetFunctionId: "V",
        operation: "insert-before",
        description: "Inserts harmonic minor dominant triad before tonic.",
        theoreticalRationale:
          "Inserts the harmonic minor dominant triad to produce a conclusive authentic cadence.",
        tags: ["Authentic Cadence", "Harmonic Minor"],
      },
    ),

    iv: list(
      {
        id: "iv-to-N6",
        kind: "modal-swap",
        title: "Neapolitan swap (N6)",
        targetFunctionId: "N6",
        operation: "replace",
        description: "Substitutes minor subdominant with Neapolitan major chord.",
        theoreticalRationale:
          "The Neapolitan chord (♭II) substitutes for iv with breathtaking drama, resolving chromatically down to V.",
        tags: ["Neapolitan", "Dramatic", "Chromatic"],
      },
      {
        id: "iv-to-iio",
        kind: "relative",
        title: "Swap to Diminished Supertonic (ii°)",
        targetFunctionId: "ii°",
        operation: "replace",
        description: "Replaces subdominant with diminished supertonic.",
        theoreticalRationale:
          "ii° shares notes with iv and tightens voice leading into dominant V.",
        tags: ["Subdominant Group", "Voice Leading"],
      },
      {
        id: "iv-insert-vii-iv",
        kind: "passing-diminished",
        title: "Insert secondary diminished (vii°7/iv)",
        targetFunctionId: "vii°7/iv",
        operation: "insert-before",
        description: "Inserts leading tone diminished seventh before iv.",
        theoreticalRationale:
          "Inserts the fully diminished leading-tone seventh chord to tonicize the subdominant.",
        tags: ["Secondary Diminished", "Chromatic Approach"],
      },
    ),

    V: list(
      {
        id: "V-insert-Pass",
        kind: "passing-diminished",
        title: "Insert passing diminished (Pass°7)",
        targetFunctionId: "Pass°7",
        operation: "insert-before",
        description: "Inserts chromatic passing diminished before dominant.",
        theoreticalRationale:
          "Inserts the raised fourth degree diminished seventh (♯iv°7) that slides chromatically up into the dominant.",
        tags: ["Passing Diminished", "Chromatic Rise", "Classical"],
      },
      {
        id: "V-to-v",
        kind: "modal-swap",
        title: "Modal natural minor swap (v)",
        targetFunctionId: "v",
        operation: "replace",
        description: "Softens major dominant to Aeolian minor v.",
        theoreticalRationale:
          "Softens the sharp leading tone to a modal Aeolian v chord for a darker, medieval or folk atmosphere.",
        tags: ["Natural Minor", "Aeolian", "Dark Folk"],
      },
      {
        id: "V-to-viio",
        kind: "relative",
        title: "Leading tone swap (vii°)",
        targetFunctionId: "vii°",
        operation: "replace",
        description: "Replaces V with rootless leading tone diminished triad.",
        theoreticalRationale:
          "Replaces V with the rootless dominant leading-tone diminished triad for maximum instability.",
        tags: ["Leading Tone", "Instability"],
      },
    ),

    VI: list(
      {
        id: "VI-to-i",
        kind: "relative",
        title: "Swap to Tonic (i)",
        targetFunctionId: "i",
        operation: "replace",
        description: "Returns to root minor tonic.",
        theoreticalRationale:
          "Restores the root minor tonic from the submediant.",
        tags: ["Tonic Group", "Dark"],
      },
      {
        id: "VI-insert-vii-VI",
        kind: "passing-diminished",
        title: "Insert secondary diminished (vii°7/VI)",
        targetFunctionId: "vii°7/VI",
        operation: "insert-before",
        description: "Inserts secondary diminished before VI.",
        theoreticalRationale:
          "Applies chromatic leading-tone tension directly resolving into the VI degree.",
        tags: ["Secondary Diminished", "Smooth Resolution"],
      },
    ),

    "ii°": list(
      {
        id: "iio-to-iv",
        kind: "relative",
        title: "Swap to Subdominant (iv)",
        targetFunctionId: "iv",
        operation: "replace",
        description: "Replaces diminished supertonic with stable subdominant.",
        theoreticalRationale:
          "Replaces the fragile diminished supertonic with the stable minor subdominant.",
        tags: ["Stability", "Predominant"],
      },
      {
        id: "iio-to-N6",
        kind: "modal-swap",
        title: "Neapolitan swap (N6)",
        targetFunctionId: "N6",
        operation: "replace",
        description: "Replaces supertonic with Neapolitan ♭II.",
        theoreticalRationale:
          "Substitutes the standard supertonic with the striking flat second degree.",
        tags: ["Neapolitan", "Chromatic"],
      },
    ),

    III: list(
      {
        id: "III-to-i",
        kind: "relative",
        title: "Swap to Minor Tonic (i)",
        targetFunctionId: "i",
        operation: "replace",
        description: "Returns to minor tonic center.",
        theoreticalRationale:
          "Returns to the minor tonic center.",
        tags: ["Tonic", "Minor"],
      },
      {
        id: "III-to-VI",
        kind: "relative",
        title: "Swap to Submediant (VI)",
        targetFunctionId: "VI",
        operation: "replace",
        description: "Exchanges relative major with flat submediant.",
        theoreticalRationale:
          "Exchanges relative major with the flat submediant for deep emotional weight.",
        tags: ["Submediant", "Cinematic"],
      },
    ),
  });

function resolveSubstitutionIdentity(
  targetFunctionId: string,
  targetModuleId: HarmonicModuleId,
): HarmonicFunctionIdentity {
  const vocabulary = recommendationVocabulary(targetModuleId);
  const found = vocabulary.find((candidate) => candidate.functionId === targetFunctionId);
  if (found) return found;
  const card = getHarmonicModule(targetModuleId).topology.cards.find(
    (c) => c.identity.functionId === targetFunctionId,
  );
  if (card) return card.identity;
  return {
    moduleId: targetModuleId,
    functionId: targetFunctionId,
    category: "core",
  };
}

/**
 * Computes the realized chord symbol for a substitution candidate in the given tonic key.
 */
export function realizeSubstitutionChordSymbol(
  targetFunctionId: string,
  targetModuleId: HarmonicModuleId,
  tonic: PitchClassIdentity,
  harmonicVariant?: HarmonicVariant,
): string {
  try {
    const identity = resolveSubstitutionIdentity(targetFunctionId, targetModuleId);
    const chord = realizeChord(identity, tonic);
    return formatChordSymbol({
      ...chord,
      ...(harmonicVariant ? { variant: harmonicVariant } : {}),
    });
  } catch {
    return targetFunctionId;
  }
}

/**
 * Returns human-readable UI metadata for a substitution kind.
 */
export function getSubstitutionKindBadge(kind: SubstitutionKind): {
  readonly label: string;
  readonly badgeClass: string;
} {
  switch (kind) {
    case "tritone":
      return { label: "Tritone Sub", badgeClass: "sub-badge-tritone" };
    case "modal-swap":
      return { label: "Modal Mixture", badgeClass: "sub-badge-modal" };
    case "relative":
      return { label: "Relative / Functional", badgeClass: "sub-badge-relative" };
    case "secondary-dominant":
      return { label: "Secondary Dominant", badgeClass: "sub-badge-secondary" };
    case "passing-diminished":
      return { label: "Passing Diminished", badgeClass: "sub-badge-diminished" };
    case "dominant-extension":
      return { label: "Extension", badgeClass: "sub-badge-extension" };
  }
}

/**
 * Returns available chord substitution recommendations for a given chord step,
 * active harmonic module, and key tonic.
 */
export function getAvailableSubstitutions(
  step: ChordStep,
  activeModuleId: HarmonicModuleId,
  tonic: PitchClassIdentity,
): readonly ChordSubstitution[] {
  const funcId = step.harmonicFunction.functionId;
  const catalog =
    activeModuleId === "progressions" ? MAJOR_SUBSTITUTION_CATALOG : MINOR_SUBSTITUTION_CATALOG;

  const templates = catalog[funcId] ?? [];
  const results: ChordSubstitution[] = [];

  for (const t of templates) {
    const targetModule = t.targetModuleId ?? activeModuleId;
    const chordSymbol = realizeSubstitutionChordSymbol(
      t.targetFunctionId,
      targetModule,
      tonic,
      t.harmonicVariant,
    );
    results.push({
      id: t.id,
      kind: t.kind,
      title: t.title,
      targetFunctionId: t.targetFunctionId,
      ...(t.targetModuleId ? { targetModuleId: t.targetModuleId } : {}),
      ...(t.harmonicVariant ? { harmonicVariant: t.harmonicVariant } : {}),
      operation: t.operation,
      chordSymbol,
      description: t.description,
      theoreticalRationale: t.theoreticalRationale,
      tags: t.tags,
    });
  }

  // If the step is a secondary dominant like V7/X and not specifically cataloged, offer Tritone Sub
  if (
    results.length === 0 &&
    (step.harmonicFunction.category === "secondary-dominant" || funcId.startsWith("V7/"))
  ) {
    const targetModule = activeModuleId;
    const chordSymbol = realizeSubstitutionChordSymbol("subV7", targetModule, tonic);
    results.push({
      id: `${funcId}-to-subV7`,
      kind: "tritone",
      title: "Tritone substitution (subV7)",
      targetFunctionId: "subV7",
      operation: "replace",
      chordSymbol,
      description: "Replaces dominant with ♭II7 tritone substitute.",
      theoreticalRationale:
        "Replaces the dominant seventh with the chord a tritone away (♭II7), introducing chromatic bass motion while maintaining harmonic function.",
      tags: ["Tritone Sub", "Bebop", "Chromatic"],
    });
  }

  return Object.freeze(results);
}
