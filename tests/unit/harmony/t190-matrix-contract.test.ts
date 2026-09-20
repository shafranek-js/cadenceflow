import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { formatChordSymbol } from "../../../src/domain/harmony/chord";
import { realizeChord } from "../../../src/domain/harmony/realization";
import { resolveGuitarTabEntry } from "../../../src/domain/instruments/guitar/tablature";
import { resolveGuitarChordVoicing } from "../../../src/domain/instruments/guitar/voicings";
import { formatPitchSpelling } from "../../../src/domain/harmony/spelling";
import {
  getHarmonicModule,
  topologyEntryForFunction,
} from "../../../src/domain/harmony/moduleRegistry";
import {
  DARK_HARMONY_MODULE,
  realizeDarkHarmonyChord,
} from "../../../src/domain/harmony/modules/darkHarmony";
import { PROGRESSIONS_MODULE } from "../../../src/domain/harmony/modules/progressions";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { guitarProfile } from "../../../src/instruments/guitar/profile";
import { pianoProfile } from "../../../src/instruments/piano/profile";
import {
  encodePortableProject,
  decodePortableProject,
} from "../../../src/persistence/portableProject";
import { getDiminishedAliasGroup } from "../../../src/domain/harmony/topology";

interface T190Fixture {
  readonly progressions: {
    readonly columnLabels: readonly string[];
    readonly secondaryDominants: readonly string[];
    readonly main: readonly string[];
    readonly modal: readonly string[];
    readonly contextual: readonly string[];
  };
  readonly darkHarmony: {
    readonly columnLabels: readonly string[];
    readonly secondaryDiminished: readonly string[];
    readonly main: readonly string[];
    readonly colors: readonly string[];
  };
  readonly n6: {
    readonly targetId: string;
    readonly bassScaleDegree: number;
    readonly rootPitchClassInA: number;
    readonly bassPitchClassInA: number;
  };
  readonly diminishedAliases: {
    readonly canonicalId: string;
    readonly aliases: readonly string[];
  };
}

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/fixtures/harmony/t190-matrix-contract.json"), "utf8"),
) as T190Fixture;

function ids(moduleId: "progressions" | "dark-harmony", layerId: string, baseline = true) {
  return getHarmonicModule(moduleId)
    .topology.cards.filter((card) => card.layerId === layerId && card.baseline === baseline)
    .sort((a, b) => a.position.column - b.position.column)
    .map((card) => card.identity.functionId);
}

describe("T190 canonical Matrix topology and harmonic semantic contract", () => {
  it("keeps six stable primary columns and three ordered spatial zones", () => {
    expect(PROGRESSIONS_MODULE.topology.columnCount).toBe(6);
    expect(PROGRESSIONS_MODULE.topology.columnLabels).toEqual(fixture.progressions.columnLabels);
    expect(ids("progressions", "secondary-dominants")).toEqual(
      fixture.progressions.secondaryDominants,
    );
    expect(ids("progressions", "diatonic-core")).toEqual(fixture.progressions.main);
    expect(ids("progressions", "modal-interchange")).toEqual(fixture.progressions.modal);

    const progressionsCards = new Map(
      PROGRESSIONS_MODULE.topology.cards.map((card) => [card.identity.functionId, card]),
    );
    for (const sourceId of fixture.progressions.secondaryDominants) {
      const source = progressionsCards.get(sourceId)!;
      const target = progressionsCards.get(source.targetId!)!;
      expect(source.position.column).toBe(target.position.column);
      expect(source.position.row).toBe(0);
      expect(target.position.row).toBe(1);
      expect(source.mixPolicy).toBe("must-resolve");
    }

    expect(
      PROGRESSIONS_MODULE.topology.cards
        .filter((card) => !card.baseline)
        .map((card) => card.identity.functionId),
    ).toEqual(fixture.progressions.contextual);
    const viiCard = PROGRESSIONS_MODULE.topology.cards.find(
      (card) => card.identity.functionId === "vii°",
    );
    expect(viiCard).toMatchObject({ baseline: true, position: { column: 6, row: 1 } });
    expect(viiCard?.auxiliary).toBeUndefined();
  });

  it("keeps Dark Harmony's V and iv/VI poles in explicit columns without duplicated diminished entities", () => {
    expect(DARK_HARMONY_MODULE.topology.columnCount).toBe(6);
    expect(DARK_HARMONY_MODULE.topology.columnLabels).toEqual(fixture.darkHarmony.columnLabels);
    expect(ids("dark-harmony", "secondary-diminished")).toEqual(
      [...fixture.darkHarmony.secondaryDiminished].sort(
        (a, b) =>
          ["vii°7/iv", "vii°7/V", "vii°7/VI"].indexOf(a) -
          ["vii°7/iv", "vii°7/V", "vii°7/VI"].indexOf(b),
      ),
    );
    expect(ids("dark-harmony", "tonal-minor-core")).toEqual(fixture.darkHarmony.main);
    expect(ids("dark-harmony", "chromatic-colors")).toEqual(
      [...fixture.darkHarmony.colors].sort((a, b) => {
        const order = ["CT°7", "ChrMed+M3", "Pass°7", "N6", "ChrMed-m3↓"];
        return order.indexOf(a) - order.indexOf(b);
      }),
    );

    const cards = new Map(
      DARK_HARMONY_MODULE.topology.cards.map((card) => [card.identity.functionId, card]),
    );
    expect(cards.get("vii°7/V")?.position.column).toBe(cards.get("V")?.position.column);
    expect(cards.get("vii°7/iv")?.position.column).toBe(cards.get("iv")?.position.column);
    expect(cards.get("vii°7/VI")?.position.column).toBe(cards.get("VI")?.position.column);
    expect(cards.get("vii°7/V")?.pole).toBe("dominant");
    expect(cards.get("vii°7/iv")?.pole).toBe("subdominant");
    expect(cards.get("vii°7/VI")?.pole).toBe("subdominant");
    expect(cards.get("N6")?.targetId).toBe(fixture.n6.targetId);
    expect(cards.get("N6")?.bassScaleDegree).toBe(fixture.n6.bassScaleDegree);
    expect(cards.get("N6")?.position.column).toBe(cards.get("V")?.position.column);
    expect(cards.get("N6")?.pole).toBe("dominant");
    expect(cards.get("vii°")?.baseline).toBe(true);
    expect(cards.get("vii°")?.auxiliary).toBeUndefined();
    expect(cards.get("vii°")?.position.column).toBe(6);
  });

  it("normalizes diminished inversion/spelling aliases to one canonical entity", () => {
    const aliases = getDiminishedAliasGroup("viio/V")!;
    expect(aliases.canonicalId).toBe(fixture.diminishedAliases.canonicalId);
    expect(aliases.aliases).toEqual(fixture.diminishedAliases.aliases);
    expect(topologyEntryForFunction("dark-harmony", "viio7/V")?.identity.functionId).toBe(
      "vii°7/V",
    );
    expect(
      new Set(DARK_HARMONY_MODULE.topology.cards.map((card) => card.identity.functionId)).size,
    ).toBe(DARK_HARMONY_MODULE.topology.cards.length);

    const canonical = realizeDarkHarmonyChord("vii°7/V", 9);
    const alias = realizeDarkHarmonyChord("viio7/V", 9);
    expect(alias.harmonicFunction.functionId).toBe(canonical.harmonicFunction.functionId);
    expect(alias.rootPitchClass).toBe(canonical.rootPitchClass);
  });

  it("realizes N6 as first inversion in every projection input", () => {
    const chord = realizeDarkHarmonyChord("N6", 9);
    expect(chord.harmonicFunction.targetId).toBe(fixture.n6.targetId);
    expect(chord.harmonicFunction.bassScaleDegree).toBe(fixture.n6.bassScaleDegree);
    expect(chord.bassScaleDegree).toBe(fixture.n6.bassScaleDegree);
    expect(chord.rootPitchClass).toBe(fixture.n6.rootPitchClassInA);
    expect(chord.bassPitchClass).toBe(fixture.n6.bassPitchClassInA);

    for (let tonic = 0; tonic < 12; tonic += 1) {
      const transposed = realizeDarkHarmonyChord("N6", tonic);
      const shift = (tonic - 9 + 12) % 12;
      expect((transposed.rootPitchClass - chord.rootPitchClass + 12) % 12).toBe(shift);
      expect(transposed.bassScaleDegree).toBe(4);
      expect(transposed.bassPitchClass).toBe((chord.bassPitchClass! + shift) % 12);
    }
  });

  it("keeps N6's actual bass in piano, guitar, and tab projections across all keys", () => {
    const base = createDefaultProject(
      "t190-projection",
      "T190 Projection",
      "2026-09-20T00:00:00.000Z",
    );
    const project = Object.freeze({ ...base, activeModule: "dark-harmony" as const });

    for (let tonic = 0; tonic < 12; tonic += 1) {
      const keyProject = Object.freeze({ ...project, tonic });
      const step = createMatrixChordStep(keyProject, "N6", `n6-projection-${tonic}`);
      const chord = realizeDarkHarmonyChord("N6", tonic);
      const context = {
        tonic,
        mode: "tonal-minor" as const,
        moduleId: "dark-harmony" as const,
        spellingContext: { tonic, mode: "tonal-minor" as const },
      };
      const expectedBass = chord.bassPitchClass!;

      const piano = pianoProfile.realizeChord({ context, chord, performance: step.performance });
      const guitar = guitarProfile.realizeChord({ context, chord, performance: step.performance });
      const guitarVoicing = resolveGuitarChordVoicing(chord);
      const tab = resolveGuitarTabEntry(chord);

      expect(piano.bassPitch?.pitchClassIdentity).toBe(expectedBass);
      expect(Math.min(...guitar.pitches.map((pitch) => pitch.midiNumber)) % 12).toBe(expectedBass);
      expect(Math.min(...guitarVoicing.pitches.map((pitch) => pitch.midiNumber)) % 12).toBe(
        expectedBass,
      );
      expect(Math.min(...tab.voicing.pitches.map((pitch) => pitch.midiNumber)) % 12).toBe(
        expectedBass,
      );
      expect(formatChordSymbol(chord)).toContain(`/${formatPitchSpelling(chord.bassSpelling!)}`);
    }
  });

  it("transposes every stable semantic card by key without moving its column", () => {
    for (const moduleId of ["progressions", "dark-harmony"] as const) {
      const module = getHarmonicModule(moduleId);
      for (const card of module.topology.cards.filter((entry) => entry.baseline)) {
        const atC = realizeChord(card.identity, 0);
        for (let tonic = 1; tonic < 12; tonic += 1) {
          const atKey = realizeChord(card.identity, tonic);
          expect((atKey.rootPitchClass - atC.rootPitchClass + 12) % 12).toBe(tonic);
          expect(card.position.column).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it("opens a v5 project whose old harmonic identities lack new semantic fields", () => {
    const base = createDefaultProject("legacy-t190", "Legacy T190", "2026-09-20T00:00:00.000Z");
    const darkProject = Object.freeze({ ...base, activeModule: "dark-harmony" as const, tonic: 9 });
    const step = createMatrixChordStep(darkProject, "N6", "legacy-n6");
    const legacyStep = Object.freeze({
      ...step,
      harmonicFunction: Object.freeze({
        moduleId: "dark-harmony" as const,
        functionId: "N6",
        category: "neapolitan" as const,
      }),
    });
    const legacyProject = Object.freeze({
      ...darkProject,
      progression: Object.freeze({
        ...darkProject.progression,
        steps: Object.freeze([legacyStep]),
      }),
    });
    const reopened = decodePortableProject(encodePortableProject(legacyProject));
    expect(reopened.progression.steps.map((item) => item.id)).toEqual(["legacy-n6"]);
    const reopenedChord = realizeChord(
      reopened.progression.steps[0]!.kind === "chord"
        ? reopened.progression.steps[0]!.harmonicFunction
        : { moduleId: "dark-harmony", functionId: "N6", category: "neapolitan" },
      reopened.tonic,
    );
    expect(reopenedChord.bassScaleDegree).toBe(4);
    expect(reopened.progression.steps[0]!.kind).toBe("chord");
  });
});
