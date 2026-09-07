import { describe, expect, it } from "vitest";
import {
  createDefaultProject,
  DEFAULT_PIANO_PERFORMANCE,
} from "../../../src/domain/project/factory";
import {
  EMPTY_HARMONIC_VARIANT,
  type ChordDefinition,
  type HarmonicVariant,
} from "../../../src/domain/harmony/chord";
import { realizeChord } from "../../../src/domain/harmony/realization";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { globalTiming, meter } from "../../../src/domain/timing/meter";
import { rational } from "../../../src/domain/timing/rational";
import { groove } from "../../../src/domain/timing/swing";
import type { ChordStep, RestStep, StepPerformance } from "../../../src/domain/progression/step";
import type { Project } from "../../../src/domain/project/project";
import type { MusicXmlDiagnosticCode } from "../../../src/export/musicxml/mapping";
import {
  mapBaseChordQualityToMusicXmlKind,
  mapChordToMusicXmlHarmony,
  mapMasterVelocityToMusicXmlDynamic,
  mapPianoArticulationToMusicXml,
  mapTonicToMusicXmlKey,
} from "../../../src/export/musicxml/mapping";
import {
  MusicXmlExportError,
  projectProjectToMusicXml,
  type MusicXmlMeasureEvent,
  type MusicXmlNoteEvent,
  type MusicXmlProjection,
} from "../../../src/export/musicxml/projection";
import { writeMusicXml, writeMusicXmlFile } from "../../../src/export/musicxml/writer";

function performance(overrides: Partial<StepPerformance> = {}): StepPerformance {
  return Object.freeze({
    ...DEFAULT_PIANO_PERFORMANCE,
    ...overrides,
    ...(overrides.bass
      ? { bass: Object.freeze({ ...DEFAULT_PIANO_PERFORMANCE.bass, ...overrides.bass }) }
      : {}),
    ...(overrides.perNoteVelocityOverrides
      ? { perNoteVelocityOverrides: Object.freeze({ ...overrides.perNoteVelocityOverrides }) }
      : {}),
    ...(overrides.manualVoicing
      ? { manualVoicing: Object.freeze([...overrides.manualVoicing]) }
      : {}),
  });
}

function chordStep(
  project: Project,
  functionId: string,
  id: string,
  duration: RationalParts,
  variant: HarmonicVariant = EMPTY_HARMONIC_VARIANT,
  performanceOverrides: Partial<StepPerformance> = {},
): ChordStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({
      moduleId: project.activeModule,
      functionId,
      category: "core",
    }),
    harmonicVariant: variant,
    duration: musicalDuration(rational(duration.numerator, duration.denominator)),
    performance: performance(performanceOverrides),
    cardView: "harmonic",
  });
}

interface RationalParts {
  readonly numerator: number;
  readonly denominator: number;
}

function restStep(id: string, duration: RationalParts): RestStep {
  return Object.freeze({
    id,
    kind: "rest",
    duration: musicalDuration(rational(duration.numerator, duration.denominator)),
  });
}

function acceptanceProject(): Project {
  const base = createDefaultProject("musicxml-acceptance", "Cadence & Flow <US9>");
  const project = Object.freeze({
    ...base,
    activeModule: "dark-harmony" as const,
    tonic: 2,
    globalTiming: globalTiming(140, meter(7, 8, [2, 2, 3])),
    groove: groove("swing", 0.55),
  });
  const variant: HarmonicVariant = Object.freeze({
    seventh: "minor7",
    extensions: Object.freeze([9]),
    suspensions: Object.freeze([]),
    alterations: Object.freeze([{ degree: 5, semitones: 1 }]),
  });
  return Object.freeze({
    ...project,
    progression: Object.freeze({
      steps: Object.freeze([
        chordStep(
          project,
          "i",
          "i-manual",
          { numerator: 3, denominator: 2 },
          EMPTY_HARMONIC_VARIANT,
          {
            articulation: "arp-up",
            voicingMode: "manual",
            manualVoicing: Object.freeze([
              exactPitch(62, { step: "D", alter: 0 }),
              exactPitch(65, { step: "F", alter: 0 }),
              exactPitch(69, { step: "A", alter: 0 }),
            ]),
            bass: {
              choice: "custom",
              octaveOffset: "auto",
              customPitch: exactPitch(38, { step: "D", alter: 0 }),
            },
            masterVelocity: 95,
            perNoteVelocityOverrides: { "65": 110 },
          },
        ),
        chordStep(project, "V", "V-variant", { numerator: 2, denominator: 3 }, variant),
        restStep("rest-triplet", { numerator: 1, denominator: 3 }),
        chordStep(project, "VI", "VI-final", { numerator: 1, denominator: 1 }),
      ]),
    }),
    temporaryBranch: Object.freeze({
      id: "temporary-branch",
      originStepId: "i-manual",
      originAtEnd: false,
      rejoinStepId: "VI-final",
      compositionIntent: "surprise",
      steps: Object.freeze([
        chordStep(project, "iv", "branch-only", { numerator: 4, denominator: 1 }),
      ]),
    }),
  });
}

function crossingProject(): Project {
  const base = createDefaultProject("musicxml-crossing", "Crossing Fixture");
  const step = chordStep(base, "I", "crossing-chord", { numerator: 5, denominator: 1 });
  return Object.freeze({
    ...base,
    globalTiming: globalTiming(120, meter(4, 4, [4])),
    progression: Object.freeze({
      steps: Object.freeze([step, restStep("after-crossing", { numerator: 1, denominator: 2 })]),
    }),
  });
}

function notes(projection: MusicXmlProjection): MusicXmlNoteEvent[] {
  return projection.measures.flatMap((measure) =>
    measure.events.filter((event): event is MusicXmlNoteEvent => event.kind === "note"),
  );
}

function eventCodes(projection: MusicXmlProjection): MusicXmlDiagnosticCode[] {
  return projection.diagnostics.map((diagnostic) => diagnostic.code);
}

function pitchMidi(note: MusicXmlNoteEvent): number {
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (note.pitch.octave + 1) * 12 + natural[note.pitch.step]! + note.pitch.alter;
}

describe("US9 MusicXML mapping policy", () => {
  it("maps Major and Tonal Minor keys without leaking CadenceFlow mode names", () => {
    expect(mapTonicToMusicXmlKey(0, "major")).toEqual({ fifths: 0, mode: "major" });
    expect(mapTonicToMusicXmlKey(2, "tonal-minor")).toEqual({ fifths: -1, mode: "minor" });
  });

  it("maps every current base quality and structured seventh/degree features", () => {
    expect(mapBaseChordQualityToMusicXmlKind("major")).toBe("major");
    expect(mapBaseChordQualityToMusicXmlKind("minor")).toBe("minor");
    expect(mapBaseChordQualityToMusicXmlKind("diminished")).toBe("diminished");
    expect(mapBaseChordQualityToMusicXmlKind("augmented")).toBe("augmented");
    expect(mapBaseChordQualityToMusicXmlKind("dominant")).toBe("dominant");

    const chord: ChordDefinition = {
      ...realizeChord({ moduleId: "dark-harmony", functionId: "V", category: "core" }, 2),
      variant: {
        seventh: "minor7",
        extensions: [9, 11],
        suspensions: [],
        alterations: [{ degree: 5, semitones: 1 }],
        add9: false,
      },
    };
    const mapped = mapChordToMusicXmlHarmony(chord);
    expect(mapped.value).toEqual({
      root: { step: "A", alter: 0 },
      kind: "dominant",
      text: "A",
      degrees: [
        { value: 9, alter: 0, type: "add" },
        { value: 11, alter: 0, type: "add" },
        { value: 5, alter: 1, type: "alter" },
      ],
    });
  });

  it("maps current seventh kinds, suspensions, and add9 as structured harmony", () => {
    const variant = (seventh: HarmonicVariant["seventh"]): HarmonicVariant => ({
      seventh,
      extensions: [],
      suspensions: [],
      alterations: [],
    });
    const chord = (functionId: string, chordVariant: HarmonicVariant): ChordDefinition => ({
      ...realizeChord({ moduleId: "progressions", functionId, category: "core" }, 0),
      variant: chordVariant,
    });

    expect(mapChordToMusicXmlHarmony(chord("I", variant("major7"))).value?.kind).toBe(
      "major-seventh",
    );
    expect(mapChordToMusicXmlHarmony(chord("vi", variant("major7"))).value?.kind).toBe(
      "major-minor",
    );
    expect(mapChordToMusicXmlHarmony(chord("ii", variant("minor7"))).value?.kind).toBe(
      "minor-seventh",
    );
    expect(mapChordToMusicXmlHarmony(chord("V", variant("minor7"))).value?.kind).toBe("dominant");
    expect(
      mapChordToMusicXmlHarmony({
        ...chord("vii°", variant("minor7")),
        baseQuality: "diminished",
      }).value?.kind,
    ).toBe("half-diminished");
    expect(
      mapChordToMusicXmlHarmony({
        ...chord("vii°", variant("diminished7")),
        baseQuality: "diminished",
      }).value?.kind,
    ).toBe("diminished-seventh");
    expect(
      mapChordToMusicXmlHarmony({
        ...chord("vii°", variant("half-diminished7")),
        baseQuality: "diminished",
      }).value?.kind,
    ).toBe("half-diminished");
    expect(
      mapChordToMusicXmlHarmony({
        ...chord("I", variant("minor7")),
        baseQuality: "augmented",
      }).value?.kind,
    ).toBe("augmented-seventh");
    expect(
      mapChordToMusicXmlHarmony(
        chord("I", { extensions: [], suspensions: ["sus2"], alterations: [] }),
      ).value?.kind,
    ).toBe("suspended-second");
    expect(
      mapChordToMusicXmlHarmony(
        chord("I", { extensions: [], suspensions: ["sus4"], alterations: [] }),
      ).value?.kind,
    ).toBe("suspended-fourth");
    expect(
      mapChordToMusicXmlHarmony(
        chord("I", { extensions: [], suspensions: [], alterations: [], add9: true }),
      ).value,
    ).toEqual({
      root: { step: "C", alter: 0 },
      kind: "major",
      text: "C",
      degrees: [{ value: 9, alter: 0, type: "add" }],
    });
  });

  it("diagnoses unsupported combinations instead of replacing their harmony", () => {
    const mapped = mapChordToMusicXmlHarmony({
      ...realizeChord({ moduleId: "progressions", functionId: "I", category: "core" }, 0),
      variant: {
        seventh: "diminished7",
        extensions: [],
        suspensions: [],
        alterations: [],
      },
    });
    expect(mapped.status).toBe("error");
    expect(mapped.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "unsupported-harmony-variant",
    );
  });

  it("uses the canonical velocity-to-dynamic boundaries", () => {
    expect(
      [1, 32, 80, 95, 112, 127].map(
        (velocity) => mapMasterVelocityToMusicXmlDynamic(velocity).value,
      ),
    ).toEqual([
      { label: "pp", sourceVelocity: 1 },
      { label: "pp", sourceVelocity: 32 },
      { label: "mf", sourceVelocity: 80 },
      { label: "f", sourceVelocity: 95 },
      { label: "ff", sourceVelocity: 112 },
      { label: "ff", sourceVelocity: 127 },
    ]);
    expect(mapPianoArticulationToMusicXml("block").value).toBeUndefined();
    expect(mapPianoArticulationToMusicXml("arp-up").value).toBe("arpeggiate-up");
    expect(mapPianoArticulationToMusicXml("arp-down").value).toBe("arpeggiate-down");
    expect(mapPianoArticulationToMusicXml("broken-chord").diagnostics[0]?.code).toBe(
      "broken-chord-timing-omitted",
    );
    expect(mapPianoArticulationToMusicXml("humanized").diagnostics[0]?.code).toBe(
      "humanized-timing-omitted",
    );
  });
});

describe("US9 MusicXML semantic projection", () => {
  it("projects literal metadata, key, additive meter, tempo, order, and exact divisions", () => {
    const projection = projectProjectToMusicXml(acceptanceProject());
    expect(projection.version).toBe("4.0");
    expect(projection.title).toBe("Cadence & Flow <US9>");
    expect(projection.part).toEqual({ id: "P1", name: "Piano" });
    expect(projection.attributes).toMatchObject({
      divisions: 6,
      key: { fifths: -1, mode: "minor" },
      time: { numerator: 7, denominator: 8, beats: "2+2+3", grouping: [2, 2, 3] },
      clef: { sign: "G", line: 2 },
    });
    expect(projection.tempoBpm).toBe(140);
    expect(projection.measures).toHaveLength(1);
    expect(projection.measures[0]?.capacity).toBe(21);
    expect(
      projection.measures[0]?.events
        .filter(
          (event): event is MusicXmlMeasureEvent & { kind: "harmony" } => event.kind === "harmony",
        )
        .map((event) => event.stepId),
    ).toEqual(["i-manual", "V-variant", "VI-final"]);
    expect(
      projection.measures.flatMap((measure) => measure.events).map((event) => event.stepId),
    ).not.toContain("branch-only");
    expect(
      projection.measures[0]?.events
        .filter((event): event is MusicXmlMeasureEvent & { kind: "rest" } => event.kind === "rest")
        .map((event) => [event.stepId, event.duration]),
    ).toEqual([["rest-triplet", 2]]);
    expect(projection.measures[0]?.durationBeats).toEqual(rational(7, 2));
    expect(
      projection.measures[0]?.events.filter((event) => event.kind === "note").length,
    ).toBeGreaterThan(0);
  });

  it("preserves manual and automatic pitch spelling and MIDI identity", () => {
    const projection = projectProjectToMusicXml(acceptanceProject());
    const projectedNotes = notes(projection);
    expect(
      projectedNotes
        .filter((note) => note.stepId === "i-manual")
        .map((note) => [note.pitch.step, note.pitch.alter, note.pitch.octave]),
    ).toEqual([
      ["D", 0, 2],
      ["D", 0, 4],
      ["F", 0, 4],
      ["A", 0, 4],
    ]);
    expect(
      projectedNotes.some(
        (note) => note.stepId === "V-variant" && note.pitch.step === "C" && note.pitch.alter === 1,
      ),
    ).toBe(true);
    expect(projectedNotes.every((note) => pitchMidi(note) === note.sourceMidi)).toBe(true);
  });

  it("keeps written durations straight under swing and reports omitted performance details", () => {
    const projection = projectProjectToMusicXml(acceptanceProject());
    expect(eventCodes(projection)).toEqual([
      "presentation-state-omitted",
      "recommendation-metadata-omitted",
      "runtime-state-omitted",
      "groove-omitted",
      "temporary-branch-omitted",
      "per-note-velocity-omitted",
    ]);
    expect(
      projection.measures[0]?.events
        .filter((event) => event.kind === "note")
        .map((event) => event.duration),
    ).toContain(9);
    expect(
      projection.measures[0]?.events
        .filter((event) => event.kind === "note")
        .map((event) => event.duration),
    ).toContain(4);
    expect(
      projection.measures[0]?.events
        .filter((event) => event.kind === "note")
        .map((event) => event.duration),
    ).toContain(6);
    expect(
      projection.measures[0]?.events
        .filter((event) => event.kind === "direction")
        .map((event) => event.dynamicLabel),
    ).toEqual(["f", "mf", "mf"]);
  });

  it("splits cross-barline chords into exact fragments and uses one harmony with ties", () => {
    const projection = projectProjectToMusicXml(crossingProject());
    expect(projection.attributes.divisions).toBe(2);
    expect(projection.measures).toHaveLength(2);
    const chordNotes = notes(projection).filter((note) => note.stepId === "crossing-chord");
    expect([...new Set(chordNotes.map((note) => note.duration))]).toEqual([8, 2]);
    expect(chordNotes.filter((note) => note.chord === false).map((note) => note.ties)).toEqual([
      ["start"],
      ["stop"],
    ]);
    expect(
      projection.measures
        .flatMap((measure) => measure.events)
        .filter((event) => event.kind === "harmony"),
    ).toHaveLength(1);
    expect(projection.measures[1]?.events.some((event) => event.kind === "rest")).toBe(true);
    expect(
      projection.measures.reduce(
        (sum, measure) => sum + measure.durationBeats.numerator / measure.durationBeats.denominator,
        0,
      ),
    ).toBe(11 / 2);
  });
});

describe("US9 MusicXML writer and safety contract", () => {
  it("writes deterministic, escaped, structured MusicXML with tempo, harmony, chord, rests, ties, and dynamics", () => {
    const projection = projectProjectToMusicXml(acceptanceProject());
    const xml = writeMusicXml(projection);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<score-partwise version="4.0">');
    expect(xml).toContain("Cadence &amp; Flow &lt;US9&gt;");
    expect(xml).not.toContain("branch-only");
    expect(xml).not.toContain("<creation-date>");
    expect(xml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(xml).toContain("<beats>2+2+3</beats>");
    expect(xml).toContain("<per-minute>140</per-minute>");
    expect(xml).toContain('<sound tempo="140"/>');
    expect(xml).toContain('<kind text="A">dominant</kind>');
    expect(xml).toContain("<degree-value>9</degree-value>");
    expect(xml).toContain("<chord/>");
    expect(xml).toContain("<rest/>");
    expect(xml).toContain('<arpeggiate direction="up"/>');
    expect(xml).toContain("<mf/>");
    expect(Array.from(writeMusicXmlFile(projection))).toEqual(
      Array.from(new TextEncoder().encode(xml)),
    );
    expect(writeMusicXml(projection)).toBe(xml);
  });

  it("fails clearly for empty, invalid-tempo, overflow, and invalid internal projections", () => {
    const empty = createDefaultProject("empty-musicxml", "Empty");
    expect(() => projectProjectToMusicXml(empty)).toThrowError(MusicXmlExportError);
    try {
      projectProjectToMusicXml(empty);
    } catch (error) {
      expect((error as MusicXmlExportError).code).toBe("empty-progression");
    }

    const invalidTempo = Object.freeze({
      ...crossingProject(),
      globalTiming: Object.freeze({ ...crossingProject().globalTiming, tempoBpm: 0 }),
    });
    expect(() => projectProjectToMusicXml(invalidTempo)).toThrowError(/positive finite tempo/);

    const overflowing = Object.freeze({
      ...crossingProject(),
      progression: Object.freeze({
        steps: Object.freeze([
          chordStep(crossingProject(), "I", "huge", { numerator: 1, denominator: 1_000_003 }),
        ]),
      }),
    });
    expect(() => projectProjectToMusicXml(overflowing)).toThrowError(/divisions/);

    const invalidProjection = {
      ...projectProjectToMusicXml(crossingProject()),
      version: "3.1",
    } as unknown as MusicXmlProjection;
    expect(() => writeMusicXml(invalidProjection)).toThrowError(/version must be 4.0/);
  });

  it("is deterministic, deeply immutable in its DTO, and leaves the source Project unchanged", () => {
    const project = acceptanceProject();
    const before = structuredClone(project);
    const first = projectProjectToMusicXml(project);
    const second = projectProjectToMusicXml(project);
    expect(second).toEqual(first);
    expect(writeMusicXml(second)).toBe(writeMusicXml(first));
    expect(structuredClone(project)).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.attributes)).toBe(true);
    expect(Object.isFrozen(first.measures)).toBe(true);
    expect(Object.isFrozen(first.measures[0])).toBe(true);
    expect(Object.isFrozen(first.measures[0]?.events)).toBe(true);
  });
});
