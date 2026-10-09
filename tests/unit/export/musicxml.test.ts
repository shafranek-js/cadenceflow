import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
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
import {
  addRational,
  compareRational,
  multiplyRational,
  type Rational,
} from "../../../src/domain/timing/rational";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import { decodePortableProject } from "../../../src/persistence/portableProject";
import { groove } from "../../../src/domain/timing/swing";
import { snapshotChordMelody } from "../../../src/domain/melody/types";
import type { ChordMelodyRecipe } from "../../../src/domain/melody/types";
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
  MUSICXML_MAX_DIVISIONS,
  MusicXmlExportError,
  projectProjectToMusicXml,
  type MusicXmlMelodyNoteEvent,
  type MusicXmlMelodyRestEvent,
  type MusicXmlMeasureEvent,
  type MusicXmlNoteEvent,
  type MusicXmlProjection,
} from "../../../src/export/musicxml/projection";
import {
  MusicXmlWriterError,
  writeMusicXml,
  writeMusicXmlFile,
} from "../../../src/export/musicxml/writer";

function performance(overrides: Partial<StepPerformance> = {}): StepPerformance {
  return Object.freeze<StepPerformance>({
    ...DEFAULT_PIANO_PERFORMANCE,
    articulation: "block",
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
  return Object.freeze<ChordStep>({
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
  return Object.freeze<RestStep>({
    id,
    kind: "rest",
    duration: musicalDuration(rational(duration.numerator, duration.denominator)),
  });
}

function acceptanceProject(): Project {
  const base = createDefaultProject("musicxml-acceptance", "Cadence & Flow <US9>");
  const project = Object.freeze({
    ...base,
    independentBassEnabled: true,
    activeModule: "dark-harmony" as const,
    tonic: 2,
    globalTiming: globalTiming(140, meter(7, 8, [2, 2, 3])),
    groove: groove("swing", 0.55),
  });
  const variant: HarmonicVariant = Object.freeze<HarmonicVariant>({
    seventh: "minor7",
    extensions: Object.freeze([9]),
    suspensions: Object.freeze([]),
    alterations: Object.freeze([{ degree: 5, semitones: 1 }]),
  });
  return Object.freeze<Project>({
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
  return Object.freeze<Project>({
    ...base,
    independentBassEnabled: true,
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

function pitchMidi(note: {
  readonly pitch: { readonly step: string; readonly alter: number; readonly octave: number };
}): number {
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (note.pitch.octave + 1) * 12 + natural[note.pitch.step]! + note.pitch.alter;
}

function melodyChordStep(
  project: Project,
  functionId: string,
  id: string,
  duration: RationalParts,
  melody: ChordMelodyRecipe,
): ChordStep {
  return Object.freeze<ChordStep>({
    ...chordStep(project, functionId, id, duration),
    melody: { mode: "generated", recipe: Object.freeze({ ...melody }) },
  });
}

function melodyProject(): Project {
  const base = createDefaultProject("musicxml-melody", "Melody MusicXML");
  const first = melodyChordStep(
    base,
    "I",
    "melody-triplet",
    { numerator: 7, denominator: 2 },
    {
      pitchMotion: "up",
      grid: "eighth-triplet",
      octaveOffset: 1,
      rhythm: "even",
      connection: "retrigger",
    },
  );
  const second = melodyChordStep(
    base,
    "V",
    "melody-quarter",
    { numerator: 1, denominator: 1 },
    {
      pitchMotion: "down",
      grid: "quarter",
      octaveOffset: 0,
      rhythm: "even",
      connection: "retrigger",
    },
  );
  const noRecipe = chordStep(base, "vi", "melody-no-recipe", { numerator: 1, denominator: 2 });
  return Object.freeze<Project>({
    ...base,
    melodyTrack: Object.freeze({ ...base.melodyTrack, instrument: "violin" }),
    progression: Object.freeze({
      steps: Object.freeze([
        first,
        second,
        restStep("melody-rest", { numerator: 1, denominator: 2 }),
        noRecipe,
      ]),
    }),
    temporaryBranch: Object.freeze({
      id: "melody-temporary-branch",
      originStepId: "melody-triplet",
      originAtEnd: false,
      rejoinStepId: "melody-no-recipe",
      compositionIntent: "neutral",
      steps: Object.freeze([
        melodyChordStep(
          base,
          "iv",
          "melody-branch-only",
          { numerator: 1, denominator: 1 },
          {
            pitchMotion: "inside-out",
            grid: "sixteenth-triplet",
            octaveOffset: 0,
            rhythm: "even",
            connection: "retrigger",
          },
        ),
      ]),
    }),
  });
}

function melodyNotes(projection: MusicXmlProjection): MusicXmlMelodyNoteEvent[] {
  return (
    projection.melody?.measures.flatMap((measure) =>
      measure.events.filter((event): event is MusicXmlMelodyNoteEvent => event.kind === "note"),
    ) ?? []
  );
}

function melodyRests(projection: MusicXmlProjection): MusicXmlMelodyRestEvent[] {
  return (
    projection.melody?.measures.flatMap((measure) =>
      measure.events.filter((event): event is MusicXmlMelodyRestEvent => event.kind === "rest"),
    ) ?? []
  );
}

function extractPartIds(xml: string): { readonly partList: string[]; readonly score: string[] } {
  const partList = xml.slice(xml.indexOf("<part-list>"), xml.indexOf("</part-list>"));
  return {
    partList: [...partList.matchAll(/<score-part id="([^"]+)">/g)].map((match) => match[1]!),
    score: [...xml.matchAll(/<part id="([^"]+)">/g)].map((match) => match[1]!),
  };
}

async function parsePartIds(
  xml: string,
): Promise<{ readonly partList: string[]; readonly score: string[] }> {
  const libxml = await import("libxmljs2");
  const document = libxml.parseXml(xml) as unknown as {
    find(path: string): readonly {
      attr(name: string): { value(): string } | null;
    }[];
  };
  const ids = (path: string) =>
    document.find(path).map((part) => {
      const id = part.attr("id")?.value();
      if (!id) throw new Error(`Missing MusicXML part id for ${path}`);
      return id;
    });
  return { partList: ids("//part-list/score-part"), score: ids("//part") };
}

interface MusicXmlTestNode {
  type(): string;
}

interface MusicXmlTestElement extends MusicXmlTestNode {
  name(): string;
  text(): string;
  attr(name: string): { value(): string } | null;
  childNodes(): MusicXmlTestNode[];
  find<T extends MusicXmlTestElement = MusicXmlTestElement>(path: string): T[];
}

interface MusicXmlTestDocument {
  find<T extends MusicXmlTestElement = MusicXmlTestElement>(path: string): T[];
  get<T extends MusicXmlTestElement = MusicXmlTestElement>(path: string): T | null;
}

function xmlText(node: MusicXmlTestElement, path: string): string {
  const value = node.find(path)[0]?.text();
  if (value === undefined) throw new Error(`Missing MusicXML element at ${path}`);
  return value;
}

const MUSIC_XML_TYPE_BEATS: Readonly<Record<string, Rational>> = Object.freeze<
  Readonly<Record<string, Rational>>
>({
  whole: rational(4),
  half: rational(2),
  quarter: rational(1),
  eighth: rational(1, 2),
  "16th": rational(1, 4),
  "32nd": rational(1, 8),
  "64th": rational(1, 16),
});

function writtenDurationFromXml(event: MusicXmlTestElement): Rational {
  const noteType = xmlText(event, "./type");
  let duration = MUSIC_XML_TYPE_BEATS[noteType];
  if (!duration) throw new Error(`Unsupported MusicXML written type ${noteType}`);
  for (const _dot of event.find("./dot")) duration = multiplyRational(duration, rational(3, 2));
  const timeModification = event.find<MusicXmlTestElement>("./time-modification")[0];
  if (timeModification) {
    duration = multiplyRational(
      duration,
      rational(
        Number(xmlText(timeModification, "./normal-notes")),
        Number(xmlText(timeModification, "./actual-notes")),
      ),
    );
  }
  return duration;
}

interface ParsedMelodySegment {
  readonly onsetBeats: Rational;
  readonly durationBeats: Rational;
  readonly midi: number;
  readonly voice: string;
  readonly instrumentId: string;
  readonly ties: readonly string[];
  readonly type: string;
  readonly dots: number;
  readonly timeModification?: {
    readonly actualNotes: number;
    readonly normalNotes: number;
    readonly normalType: string;
  };
}

interface ParsedMelodyRest {
  readonly onsetBeats: Rational;
  readonly durationBeats: Rational;
  readonly type: string;
  readonly dots: number;
  readonly timeModification?: {
    readonly actualNotes: number;
    readonly normalNotes: number;
    readonly normalType: string;
  };
}

async function parseWrittenMelody(
  xml: string,
  beatsPerMeasure: Rational,
  divisions: number,
  validateWrittenDurations = true,
) {
  const libxml = await import("libxmljs2");
  const document = libxml.parseXml(xml) as unknown as MusicXmlTestDocument;
  const measures = document.find("/score-partwise/part[@id='P2']/measure");
  const segments: ParsedMelodySegment[] = [];
  const rests: ParsedMelodyRest[] = [];
  const stepSemitones: Readonly<Record<string, number>> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  for (const measure of measures) {
    const measureNumber = Number(measure.attr("number")?.value());
    let cursorUnits = 0;
    const measureStart = multiplyRational(beatsPerMeasure, rational(measureNumber - 1));
    const children = measure
      .childNodes()
      .filter((node) => node.type() === "element") as MusicXmlTestElement[];
    for (const child of children) {
      if (child.name() === "backup") {
        cursorUnits -= Number(xmlText(child, "./duration"));
        continue;
      }
      if (child.name() === "forward") {
        cursorUnits += Number(xmlText(child, "./duration"));
        continue;
      }
      if (child.name() !== "note") continue;

      const durationUnits = Number(xmlText(child, "./duration"));
      const onsetBeats = addRational(measureStart, rational(cursorUnits, divisions));
      const durationBeats = rational(durationUnits, divisions);
      if (validateWrittenDurations) expect(writtenDurationFromXml(child)).toEqual(durationBeats);
      const rest = child.find("./rest").length > 0;
      if (rest) {
        const timeModification = child.find<MusicXmlTestElement>("./time-modification")[0];
        rests.push({
          onsetBeats,
          durationBeats,
          type: child.find("./type")[0]?.text() ?? "",
          dots: child.find("./dot").length,
          ...(timeModification
            ? {
                timeModification: {
                  actualNotes: Number(xmlText(timeModification, "./actual-notes")),
                  normalNotes: Number(xmlText(timeModification, "./normal-notes")),
                  normalType: xmlText(timeModification, "./normal-type"),
                },
              }
            : {}),
        });
      } else {
        const step = xmlText(child, "./pitch/step");
        const alter = Number(child.find("./pitch/alter")[0]?.text() ?? "0");
        const octave = Number(xmlText(child, "./pitch/octave"));
        const instrumentId = child.find("./instrument")[0]?.attr("id")?.value();
        if (!instrumentId) throw new Error("MusicXML Melody note is missing its instrument id");
        const timeModification = child.find<MusicXmlTestElement>("./time-modification")[0];
        segments.push({
          onsetBeats,
          durationBeats,
          midi: (octave + 1) * 12 + stepSemitones[step]! + alter,
          voice: xmlText(child, "./voice"),
          instrumentId,
          ties: child.find("./tie").map((tie) => tie.attr("type")?.value() ?? ""),
          type: child.find("./type")[0]?.text() ?? "",
          dots: child.find("./dot").length,
          ...(timeModification
            ? {
                timeModification: {
                  actualNotes: Number(xmlText(timeModification, "./actual-notes")),
                  normalNotes: Number(xmlText(timeModification, "./normal-notes")),
                  normalType: xmlText(timeModification, "./normal-type"),
                },
              }
            : {}),
        });
      }
      cursorUnits += durationUnits;
    }
  }

  const completed: {
    readonly onsetBeats: Rational;
    readonly durationBeats: Rational;
    readonly midi: number;
    readonly instrumentId: string;
  }[] = [];
  const open: {
    readonly onsetBeats: Rational;
    durationBeats: Rational;
    readonly midi: number;
    readonly voice: string;
    readonly instrumentId: string;
  }[] = [];
  for (const segment of segments) {
    const startsTie = segment.ties.includes("start");
    const stopsTie = segment.ties.includes("stop");
    if (stopsTie) {
      const previousIndex = open.findLastIndex(
        (candidate) =>
          candidate.midi === segment.midi &&
          candidate.voice === segment.voice &&
          candidate.instrumentId === segment.instrumentId &&
          compareRational(
            addRational(candidate.onsetBeats, candidate.durationBeats),
            segment.onsetBeats,
          ) === 0,
      );
      if (previousIndex < 0) throw new Error("MusicXML tie stop has no contiguous source note");
      const previous = open[previousIndex]!;
      previous.durationBeats = addRational(previous.durationBeats, segment.durationBeats);
      if (!startsTie) {
        completed.push({
          onsetBeats: previous.onsetBeats,
          durationBeats: previous.durationBeats,
          midi: previous.midi,
          instrumentId: previous.instrumentId,
        });
        open.splice(previousIndex, 1);
      }
    } else if (startsTie) {
      open.push({ ...segment });
    } else {
      completed.push({
        onsetBeats: segment.onsetBeats,
        durationBeats: segment.durationBeats,
        midi: segment.midi,
        instrumentId: segment.instrumentId,
      });
    }
  }
  if (open.length > 0) throw new Error("MusicXML Melody contains an unclosed tie");
  return { notes: completed, segments, rests };
}

const PRE_T175_NO_MELODY_GOLDEN_BASE64 =
  "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHNjb3JlLXBhcnR3aXNlIHZlcnNpb249IjQuMCI+CiAgPHdvcms+CiAgICA8d29yay10aXRsZT5UMTc1IEdvbGRlbjwvd29yay10aXRsZT4KICA8L3dvcms+CiAgPHBhcnQtbGlzdD4KICAgIDxzY29yZS1wYXJ0IGlkPSJQMSI+CiAgICAgIDxwYXJ0LW5hbWU+UGlhbm88L3BhcnQtbmFtZT4KICAgIDwvc2NvcmUtcGFydD4KICA8L3BhcnQtbGlzdD4KICA8cGFydCBpZD0iUDEiPgogICAgPG1lYXN1cmUgbnVtYmVyPSIxIj4KICAgICAgPGF0dHJpYnV0ZXM+CiAgICAgICAgPGRpdmlzaW9ucz4xPC9kaXZpc2lvbnM+CiAgICAgICAgPGtleT4KICAgICAgICAgIDxmaWZ0aHM+MDwvZmlmdGhzPgogICAgICAgICAgPG1vZGU+bWFqb3I8L21vZGU+CiAgICAgICAgPC9rZXk+CiAgICAgICAgPHRpbWU+CiAgICAgICAgICA8YmVhdHM+NDwvYmVhdHM+CiAgICAgICAgICA8YmVhdC10eXBlPjQ8L2JlYXQtdHlwZT4KICAgICAgICA8L3RpbWU+CiAgICAgICAgPHN0YXZlcz4yPC9zdGF2ZXM+CiAgICAgICAgPHBhcnQtc3ltYm9sIHRvcC1zdGFmZj0iMSIgYm90dG9tLXN0YWZmPSIyIj5icmFjZTwvcGFydC1zeW1ib2w+CiAgICAgICAgPGNsZWYgbnVtYmVyPSIxIj4KICAgICAgICAgIDxzaWduPkc8L3NpZ24+CiAgICAgICAgICA8bGluZT4yPC9saW5lPgogICAgICAgIDwvY2xlZj4KICAgICAgICA8Y2xlZiBudW1iZXI9IjIiPgogICAgICAgICAgPHNpZ24+Rjwvc2lnbj4KICAgICAgICAgIDxsaW5lPjQ8L2xpbmU+CiAgICAgICAgPC9jbGVmPgogICAgICA8L2F0dHJpYnV0ZXM+CiAgICAgIDxkaXJlY3Rpb24gcGxhY2VtZW50PSJhYm92ZSI+CiAgICAgICAgPGRpcmVjdGlvbi10eXBlPgogICAgICAgICAgPG1ldHJvbm9tZT4KICAgICAgICAgICAgPGJlYXQtdW5pdD5xdWFydGVyPC9iZWF0LXVuaXQ+CiAgICAgICAgICAgIDxwZXItbWludXRlPjEwMDwvcGVyLW1pbnV0ZT4KICAgICAgICAgIDwvbWV0cm9ub21lPgogICAgICAgIDwvZGlyZWN0aW9uLXR5cGU+CiAgICAgICAgPHN0YWZmPjE8L3N0YWZmPgogICAgICAgIDxzb3VuZCB0ZW1wbz0iMTAwIi8+CiAgICAgIDwvZGlyZWN0aW9uPgogICAgICA8ZGlyZWN0aW9uIHBsYWNlbWVudD0iYmVsb3ciPgogICAgICAgIDxkaXJlY3Rpb24tdHlwZT4KICAgICAgICAgIDxkeW5hbWljcz4KICAgICAgICAgICAgPG1mLz4KICAgICAgICAgIDwvZHluYW1pY3M+CiAgICAgICAgPC9kaXJlY3Rpb24tdHlwZT4KICAgICAgICA8c3RhZmY+MTwvc3RhZmY+CiAgICAgIDwvZGlyZWN0aW9uPgogICAgICA8aGFybW9ueT4KICAgICAgICA8cm9vdD4KICAgICAgICAgIDxyb290LXN0ZXA+Qzwvcm9vdC1zdGVwPgogICAgICAgIDwvcm9vdD4KICAgICAgICA8a2luZD5tYWpvcjwva2luZD4KICAgICAgPC9oYXJtb255PgogICAgICA8bm90ZT4KICAgICAgICA8cGl0Y2g+CiAgICAgICAgICA8c3RlcD5DPC9zdGVwPgogICAgICAgICAgPG9jdGF2ZT40PC9vY3RhdmU+CiAgICAgICAgPC9waXRjaD4KICAgICAgICA8ZHVyYXRpb24+NDwvZHVyYXRpb24+CiAgICAgICAgPHZvaWNlPjE8L3ZvaWNlPgogICAgICAgIDx0eXBlPndob2xlPC90eXBlPgogICAgICAgIDxzdGFmZj4xPC9zdGFmZj4KICAgICAgPC9ub3RlPgogICAgICA8bm90ZT4KICAgICAgICA8Y2hvcmQvPgogICAgICAgIDxwaXRjaD4KICAgICAgICAgIDxzdGVwPkU8L3N0ZXA+CiAgICAgICAgICA8b2N0YXZlPjQ8L29jdGF2ZT4KICAgICAgICA8L3BpdGNoPgogICAgICAgIDxkdXJhdGlvbj40PC9kdXJhdGlvbj4KICAgICAgICA8dm9pY2U+MTwvdm9pY2U+CiAgICAgICAgPHR5cGU+d2hvbGU8L3R5cGU+CiAgICAgICAgPHN0YWZmPjE8L3N0YWZmPgogICAgICA8L25vdGU+CiAgICAgIDxub3RlPgogICAgICAgIDxjaG9yZC8+CiAgICAgICAgPHBpdGNoPgogICAgICAgICAgPHN0ZXA+Rzwvc3RlcD4KICAgICAgICAgIDxvY3RhdmU+NDwvb2N0YXZlPgogICAgICAgIDwvcGl0Y2g+CiAgICAgICAgPGR1cmF0aW9uPjQ8L2R1cmF0aW9uPgogICAgICAgIDx2b2ljZT4xPC92b2ljZT4KICAgICAgICA8dHlwZT53aG9sZTwvdHlwZT4KICAgICAgICA8c3RhZmY+MTwvc3RhZmY+CiAgICAgIDwvbm90ZT4KICAgICAgPGJhY2t1cD4KICAgICAgICA8ZHVyYXRpb24+NDwvZHVyYXRpb24+CiAgICAgIDwvYmFja3VwPgogICAgICA8bm90ZT4KICAgICAgICA8cGl0Y2g+CiAgICAgICAgICA8c3RlcD5DPC9zdGVwPgogICAgICAgICAgPG9jdGF2ZT4zPC9vY3RhdmU+CiAgICAgICAgPC9waXRjaD4KICAgICAgICA8ZHVyYXRpb24+NDwvZHVyYXRpb24+CiAgICAgICAgPHZvaWNlPjI8L3ZvaWNlPgogICAgICAgIDx0eXBlPndob2xlPC90eXBlPgogICAgICAgIDxzdGFmZj4yPC9zdGFmZj4KICAgICAgPC9ub3RlPgogICAgPC9tZWFzdXJlPgogIDwvcGFydD4KPC9zY29yZS1wYXJ0d2lzZT4K";

describe("US9 MusicXML mapping policy", () => {
  it("preserves the canonical key spelling for every tonic in both modes", () => {
    expect(
      Array.from({ length: 12 }, (_, tonic) => mapTonicToMusicXmlKey(tonic, "major").fifths),
    ).toEqual([0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5]);
    expect(
      Array.from({ length: 12 }, (_, tonic) => mapTonicToMusicXmlKey(tonic, "tonal-minor").fifths),
    ).toEqual([-3, 4, -1, -6, 1, -4, 3, -2, 5, 0, -5, 2]);
  });
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
      degrees: [
        { value: 9, alter: 0, type: "add" },
        { value: 11, alter: 0, type: "add" },
        { value: 5, alter: 1, type: "alter" },
      ],
    });
  });

  it("exports add11/add13 and independent no3/no5 degree changes", () => {
    const chord: ChordDefinition = {
      ...realizeChord({ moduleId: "progressions", functionId: "I", category: "core" }, 0),
      variant: {
        baseQualityOverride: "minor",
        seventh: "minor7",
        extensions: [9],
        suspensions: [],
        alterations: [{ degree: 9, semitones: -1 }],
        add11: true,
        add13: true,
        no3: true,
        no5: true,
      },
    };

    expect(mapChordToMusicXmlHarmony(chord).value).toEqual({
      root: { step: "C", alter: 0 },
      kind: "minor-seventh",
      degrees: [
        { value: 9, alter: -1, type: "add" },
        { value: 11, alter: 0, type: "add" },
        { value: 13, alter: 0, type: "add" },
        { value: 3, alter: 0, type: "subtract" },
        { value: 5, alter: 0, type: "subtract" },
      ],
    });
  });

  it("maps altered fifths relative to the base MusicXML harmony kind", () => {
    const base = realizeChord({ moduleId: "progressions", functionId: "I", category: "core" }, 0);
    const variant = (baseQuality: ChordDefinition["baseQuality"], semitones: -1 | 1) =>
      mapChordToMusicXmlHarmony({
        ...base,
        baseQuality,
        variant: { ...EMPTY_HARMONIC_VARIANT, alterations: [{ degree: 5, semitones }] },
      }).value;

    expect(variant("major", -1)?.degrees).toEqual([{ value: 5, alter: -1, type: "alter" }]);
    // The quality kind already supplies these same fifths, so do not emit a duplicate change.
    expect(variant("diminished", -1)?.degrees).toEqual([]);
    expect(variant("augmented", 1)?.degrees).toEqual([]);
    // A change away from the kind's fifth is measured against its actual base interval.
    expect(variant("diminished", 1)?.degrees).toEqual([{ value: 5, alter: 2, type: "alter" }]);
    expect(variant("augmented", -1)?.degrees).toEqual([{ value: 5, alter: -2, type: "alter" }]);
  });

  it("diagnoses suspensions combined with every authored extension or omission", () => {
    const chord: ChordDefinition = {
      ...realizeChord({ moduleId: "progressions", functionId: "I", category: "core" }, 0),
      variant: {
        ...EMPTY_HARMONIC_VARIANT,
        suspensions: ["sus4"],
        add11: true,
        add13: true,
        no3: true,
        no5: true,
      },
    };

    const mapped = mapChordToMusicXmlHarmony(chord);
    expect(mapped.diagnostics.map(({ message }) => message)).toContain(
      "Suspension combined with additional extensions, alterations, or omissions may not be represented exactly.",
    );
    expect(mapped.value?.degrees).toEqual([
      { value: 11, alter: 0, type: "add" },
      { value: 13, alter: 0, type: "add" },
      { value: 3, alter: 0, type: "subtract" },
      { value: 5, alter: 0, type: "subtract" },
    ]);
  });

  it("maps current seventh kinds, suspensions, and add9 as structured harmony", () => {
    const variant = (seventh: HarmonicVariant["seventh"]): HarmonicVariant => ({
      ...(seventh === undefined ? {} : { seventh }),
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
      staves: 2,
      clefs: [
        { number: 1, sign: "G", line: 2 },
        { number: 2, sign: "F", line: 4 },
      ],
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
        .filter((event) => event.staff === 1)
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
    ).toEqual(["f", "mf"]);
  });

  it("splits cross-barline chords into exact fragments and uses one harmony with ties", () => {
    const projection = projectProjectToMusicXml(crossingProject());
    expect(projection.attributes.divisions).toBe(2);
    expect(projection.measures).toHaveLength(2);
    const chordNotes = notes(projection).filter((note) => note.stepId === "crossing-chord");
    expect([...new Set(chordNotes.map((note) => note.duration))]).toEqual([8, 2]);
    expect(
      chordNotes
        .filter((note) => note.staff === 1 && note.chord === false)
        .map((note) => note.ties),
    ).toEqual([["start"], ["stop"]]);
    expect(
      chordNotes
        .filter((note) => note.staff === 2 && note.chord === false)
        .map((note) => note.ties),
    ).toEqual([["start"], ["stop"]]);
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
    ).toBe(8);
  });
});

describe("US9 MusicXML writer and safety contract", () => {
  it("validates fresh writer output and rejects invalid XML through the offline CLI", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadenceflow-musicxml-review-"));
    const validate = (path: string) =>
      spawnSync(
        process.execPath,
        [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/validate-musicxml.ts"), path],
        { encoding: "utf8", timeout: 20000 },
      );
    try {
      const generated = writeMusicXml(projectProjectToMusicXml(acceptanceProject()));
      const path = join(directory, "fresh acceptance.musicxml");
      await writeFile(path, generated, "utf8");
      const valid = validate(path);
      expect(valid.error).toBeUndefined();
      expect(valid.status, valid.stderr).toBe(0);
      expect(generated).toBe(
        await readFile(
          resolve("tests/fixtures/exports/musicxml/valid/cadenceflow-acceptance.musicxml"),
          "utf8",
        ).then((text) => text.replaceAll("\r\n", "\n")),
      );
      const invalid = validate(
        resolve("tests/fixtures/exports/musicxml/invalid/missing-required-score-part.musicxml"),
      );
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toContain("XSD validation failed");
      await writeFile(path, generated.replace("<step>D</step>", "<step>H</step>"), "utf8");
      const corrupted = validate(path);
      expect(corrupted.status).toBe(1);
      expect(corrupted.stderr).toContain("XSD validation failed");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30000);

  it.each(["arp-up", "arp-down"] as const)(
    "marks every upper voice for %s, excluding bass and tied continuations",
    (articulation) => {
      const base = crossingProject();
      const first = base.progression.steps[0] as ChordStep;
      const project = {
        ...base,
        progression: { steps: [{ ...first, performance: { ...first.performance, articulation } }] },
      };
      const projection = projectProjectToMusicXml(project);
      const firstNotes = projection.measures[0]!.events.filter(
        (event): event is MusicXmlNoteEvent => event.kind === "note",
      );
      expect(
        firstNotes.filter((note) => note.role === "upper").map((note) => note.arpeggiate),
      ).toEqual(Array(3).fill(articulation === "arp-up" ? "arpeggiate-up" : "arpeggiate-down"));
      expect(
        firstNotes
          .filter((note) => note.role === "bass")
          .every((note) => note.arpeggiate === undefined),
      ).toBe(true);
      expect(
        notes(projection)
          .filter((note) => note.ties.includes("stop"))
          .every((note) => note.arpeggiate === undefined),
      ).toBe(true);
      expect(writeMusicXml(projection).match(/<arpeggiate /g)).toHaveLength(3);
    },
  );
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
    expect(xml).toContain("<staves>2</staves>");
    expect(xml).toContain('<part-symbol top-staff="1" bottom-staff="2">brace</part-symbol>');
    expect(xml).toContain('<clef number="1">');
    expect(xml).toMatch(/<clef number="2">[\s\S]*?<sign>F<\/sign>[\s\S]*?<line>4<\/line>/);
    expect(xml).toContain("<backup>");
    expect(xml).toContain("<staff>1</staff>");
    expect(xml).toContain("<staff>2</staff>");
    expect(xml).toContain("<per-minute>140</per-minute>");
    expect(xml).toContain('<sound tempo="140"/>');
    expect(xml).toContain("<kind>dominant</kind>");
    expect(xml).not.toContain("<kind text=");
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

    // Raised ceiling: a denominator below `MUSICXML_MAX_DIVISIONS` is now representable, so the
    // overflow path needs one that genuinely cannot be. (1_000_003 used to exceed the old limit of
    // 1_000_000 and no longer does.)
    const overflowing = Object.freeze({
      ...crossingProject(),
      progression: Object.freeze({
        steps: Object.freeze([
          chordStep(crossingProject(), "I", "huge", {
            numerator: 1,
            denominator: MUSICXML_MAX_DIVISIONS + 3,
          }),
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

  it("exports realistic tuplet combinations that exceed the former divisions ceiling", () => {
    // `divisions` must be a multiple of every duration denominator, so it tracks the LCM of the
    // subdivision grid in use. Mixing tuplet families multiplies quickly: 5·7·9·25 = 1575, adding a
    // 32nd-note grid gives 50400, and adding an 11-tuplet reaches 554400. The former ceiling of
    // 1_000_000 admitted that last combination but refused anything beyond, so a score mixing
    // 11- and 13-tuplets could not be exported at all despite being perfectly notatable.
    const wideGrid = Object.freeze({
      ...crossingProject(),
      progression: Object.freeze({
        steps: Object.freeze(
          [3, 5, 7, 9, 11, 13].map((denominator) =>
            chordStep(crossingProject(), "I", `tuplet-${denominator}`, {
              numerator: 1,
              denominator,
            }),
          ),
        ),
      }),
    });

    const projection = projectProjectToMusicXml(wideGrid);
    // LCM(3, 5, 7, 9, 11, 13) = 45045: an exact, comfortably safe value. Before the ceiling was
    // raised this combination was refused; now it exports and every tuplet is notated exactly.
    expect(projection.attributes.divisions).toBe(45045);
    expect(Number.isSafeInteger(projection.attributes.divisions)).toBe(true);
    expect(projection.attributes.divisions).toBeLessThanOrEqual(MUSICXML_MAX_DIVISIONS);
  });

  it("names the offending step when divisions genuinely cannot be represented", () => {
    // The message must be actionable: a limit error that does not identify the step leaves the
    // user unable to find it in a long progression.
    const beyond = Object.freeze({
      ...crossingProject(),
      progression: Object.freeze({
        steps: Object.freeze([
          chordStep(crossingProject(), "I", "offending-step", {
            numerator: 1,
            denominator: 200_000_003,
          }),
        ]),
      }),
    });

    try {
      projectProjectToMusicXml(beyond);
      throw new Error("expected the projection to reject an unrepresentable denominator");
    } catch (error) {
      expect(error).toBeInstanceOf(MusicXmlExportError);
      const exportError = error as MusicXmlExportError;
      expect(exportError.code).toBe("duration-divisions-overflow");
      expect(exportError.message).toContain("offending-step");
      expect(exportError.message).toContain("200000003");
      expect(exportError.message).toContain(String(MUSICXML_MAX_DIVISIONS));
    }
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

describe("T175 Melody MusicXML part", () => {
  it("keeps the no-Melody bytes stable up to the Piano written values", () => {
    // The golden was refreshed when the Piano part started stating its written note values: a bar is
    // not necessarily one writable value, and without `<type>` notation software cannot size it. The
    // only change was four added `<type>whole</type>` lines (one per Piano note), nothing removed.
    const base = createDefaultProject("golden-t175", "T175 Golden", "2026-09-10T00:00:00.000Z");
    const step = chordStep(base, "I", "golden-step", { numerator: 4, denominator: 1 });
    const project = Object.freeze({
      ...base,
      independentBassEnabled: true,
      progression: Object.freeze({ steps: Object.freeze([step]) }),
    });
    const bytes = writeMusicXmlFile(projectProjectToMusicXml(project));
    expect(Buffer.from(bytes).toString("base64")).toBe(PRE_T175_NO_MELODY_GOLDEN_BASE64);
    expect(projectProjectToMusicXml(project).melody).toBeUndefined();
  });

  it("notates a 5/4 Piano bar as tied written values so notation software can size it", () => {
    const base = createDefaultProject("meter-5-4-piano", "Meter 5/4 Piano");
    const project = Object.freeze({
      ...base,
      independentBassEnabled: true,
      globalTiming: Object.freeze({ ...base.globalTiming, meter: meter(5, 4) }),
      progression: Object.freeze({
        steps: Object.freeze([chordStep(base, "I", "five-four", { numerator: 5, denominator: 1 })]),
      }),
    });

    const projection = projectProjectToMusicXml(project);
    const notes = (projection.measures[0]?.events ?? []).filter((event) => event.kind === "note");
    const beatsOf = (note: (typeof notes)[number]) =>
      note.durationBeats.numerator / note.durationBeats.denominator;

    // Five quarter beats are neither a whole (4) nor a dotted whole (6), so the bar must be written
    // as a whole tied to a quarter. Writing it as one note left the bar unmeasurable: MuseScore
    // reported "Incomplete measure ... Found: 3/2. Expected: 5/4".
    const upper = notes.filter((note) => note.staff === 1);
    expect(upper.map((note) => note.type)).toEqual([
      "whole",
      "whole",
      "whole",
      "quarter",
      "quarter",
      "quarter",
    ]);
    expect(upper.map(beatsOf)).toEqual([4, 4, 4, 1, 1, 1]);
    expect(upper[0]?.ties).toEqual(["start"]);
    expect(upper[3]?.ties).toEqual(["stop"]);
    // Only the first pitch of each written part is an attack; the rest sustain it.
    expect(upper.map((note) => note.chord)).toEqual([false, true, true, false, true, true]);
    expect(notes.filter((note) => note.staff === 2).map((note) => note.type)).toEqual([
      "whole",
      "quarter",
    ]);

    // Every note states its written value. That is exactly what MuseScore needs to size the bar.
    const xml = writeMusicXml(projection);
    const writtenNotes = xml.match(/<note>[\s\S]*?<\/note>/g) ?? [];
    expect(writtenNotes.length).toBeGreaterThan(0);
    expect(writtenNotes.filter((note) => !note.includes("<type>"))).toEqual([]);
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tied type="start"/>');
  });

  it("preserves accepted Piano spelling/octave semantics without Melody", () => {
    const base = createDefaultProject("legacy-spelling", "Legacy Spelling");
    const step = Object.freeze({
      ...chordStep(base, "I", "legacy-step", { numerator: 4, denominator: 1 }),
      explicitSpellingOverrides: Object.freeze({ "upper:60": { step: "B" as const, alter: 1 } }),
    });
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({ steps: Object.freeze([step]) }),
    });
    const xml = writeMusicXml(projectProjectToMusicXml(project));
    expect(xml).toMatch(/<step>B<\/step>[\s\S]*?<alter>1<\/alter>[\s\S]*?<octave>4<\/octave>/);
  });

  it("writes Melody as P2 before the stable Piano P1 with instrument metadata", () => {
    const projection = projectProjectToMusicXml(melodyProject());
    const xml = writeMusicXml(projection);
    expect(extractPartIds(xml)).toEqual({ partList: ["P2", "P1"], score: ["P2", "P1"] });
    expect(xml).toContain("<part-name>Violin</part-name>");
    expect(xml).toContain("<instrument-name>Violin</instrument-name>");
    expect(xml).toContain("<midi-channel>3</midi-channel>");
    expect(xml).toContain("<midi-program>41</midi-program>");
    expect(xml).toMatch(
      /<part id="P2">[\s\S]*?<clef>[\s\S]*?<sign>G<\/sign>[\s\S]*?<line>2<\/line>/,
    );
    expect(xml).toContain('<part id="P1">');
    expect(xml.indexOf('<part id="P2">')).toBeLessThan(xml.indexOf('<part id="P1">'));
  });

  it("confirms Melody/Piano part order and IDs with an independently parsed document", async () => {
    const parsed = await parsePartIds(writeMusicXml(projectProjectToMusicXml(melodyProject())));
    expect(parsed).toEqual({ partList: ["P2", "P1"], score: ["P2", "P1"] });
  });

  it("exports the real eight-measure project with exact notes, rests, ties, and dotted rhythms", async () => {
    const projectUrl = new URL(
      "../../fixtures/exports/musicxml/real-project-8/8.cadenceflow",
      import.meta.url,
    );
    const originalMusicXmlUrl = new URL(
      "../../fixtures/exports/musicxml/real-project-8/8.original.musicxml",
      import.meta.url,
    );
    const portableText = await readFile(projectUrl, "utf8");
    const originalMusicXml = await readFile(originalMusicXmlUrl, "utf8");
    const sha256 = (value: string) =>
      createHash("sha256").update(value).digest("hex").toUpperCase();
    expect(sha256(portableText)).toBe(
      "606F0193B153AE56AAF6CE2B717C21D1C46707EE79E515FC97424C8C9E565E0A",
    );
    expect(sha256(originalMusicXml)).toBe(
      "7F0D6BFDE0643FBF0B85B82CE8040EA231E28A5C429384931AD54B586A54D4E0",
    );

    const project = decodePortableProject(portableText);
    const projection = projectProjectToMusicXml(project);
    const melody = projection.melody;
    expect(melody).toBeDefined();
    const xml = writeMusicXml(projection);
    const parsed = await parseWrittenMelody(
      xml,
      rational(projection.attributes.time.numerator * 4, projection.attributes.time.denominator),
      projection.attributes.divisions,
    );
    const exactEvents = (
      events: readonly { onsetBeats: Rational; durationBeats: Rational; midi: number }[],
    ) =>
      [...events]
        .sort(
          (left, right) =>
            compareRational(left.onsetBeats, right.onsetBeats) ||
            left.midi - right.midi ||
            compareRational(left.durationBeats, right.durationBeats),
        )
        .map((event) => ({
          onsetBeats: event.onsetBeats,
          durationBeats: event.durationBeats,
          midi: event.midi,
        }));
    const sourceTimeline = createEffectiveMelodyTimeline(project);
    const libxml = await import("libxmljs2");
    const originalDocument = libxml.parseXml(originalMusicXml) as unknown as MusicXmlTestDocument;
    const originalDivisions = Number(
      originalDocument
        .find("/score-partwise/part[@id='P2']/measure[1]/attributes/divisions")[0]
        ?.text(),
    );
    const originalTimeline = await parseWrittenMelody(
      originalMusicXml,
      rational(projection.attributes.time.numerator * 4, projection.attributes.time.denominator),
      originalDivisions,
      false,
    );
    expect(sourceTimeline).toHaveLength(24);
    expect(originalTimeline.segments).toHaveLength(25);
    expect(originalTimeline.notes).toHaveLength(24);
    expect(parsed.segments).toHaveLength(27);
    expect(exactEvents(parsed.notes)).toEqual(
      exactEvents(
        sourceTimeline.map((event) => ({
          onsetBeats: event.startBeats,
          durationBeats: event.durationBeats,
          midi: event.sourcePitchMidi,
        })),
      ),
    );
    expect(exactEvents(originalTimeline.notes)).toEqual(
      exactEvents(
        sourceTimeline.map((event) => ({
          onsetBeats: event.startBeats,
          durationBeats: event.durationBeats,
          midi: event.sourcePitchMidi,
        })),
      ),
    );

    const projectedNotes = melody!.measures.flatMap((measure) =>
      measure.events
        .filter((event): event is MusicXmlMelodyNoteEvent => event.kind === "note")
        .map((event) => ({
          ...event,
          onsetBeats: addRational(measure.startBeats, event.onsetBeats),
        })),
    );
    const writtenNoteEvents = [...parsed.segments]
      .sort(
        (left, right) =>
          compareRational(left.onsetBeats, right.onsetBeats) ||
          left.voice.localeCompare(right.voice) ||
          left.midi - right.midi,
      )
      .map((event) => ({
        onsetBeats: event.onsetBeats,
        durationBeats: event.durationBeats,
        midi: event.midi,
        voice: event.voice,
        instrumentId: event.instrumentId,
        ties: event.ties,
      }));
    const projectedNoteEvents = [...projectedNotes]
      .sort(
        (left, right) =>
          compareRational(left.onsetBeats, right.onsetBeats) ||
          left.voice.localeCompare(right.voice) ||
          left.sourceMidi - right.sourceMidi,
      )
      .map((event) => ({
        onsetBeats: event.onsetBeats,
        durationBeats: event.durationBeats,
        midi: event.sourceMidi,
        voice: event.voice,
        instrumentId: event.instrumentId,
        ties: event.ties,
      }));
    expect(writtenNoteEvents).toEqual(projectedNoteEvents);

    const projectedRests = melody!.measures.flatMap((measure) =>
      measure.events
        .filter((event) => event.kind === "rest")
        .map((event) => ({
          ...event,
          onsetBeats: addRational(measure.startBeats, event.onsetBeats),
        })),
    );
    expect(
      parsed.rests
        .sort(
          (left, right) =>
            compareRational(left.onsetBeats, right.onsetBeats) ||
            compareRational(left.durationBeats, right.durationBeats),
        )
        .map(({ onsetBeats, durationBeats }) => ({ onsetBeats, durationBeats })),
    ).toEqual(
      [...projectedRests]
        .sort(
          (left, right) =>
            compareRational(left.onsetBeats, right.onsetBeats) ||
            compareRational(left.durationBeats, right.durationBeats),
        )
        .map(({ onsetBeats, durationBeats }) => ({ onsetBeats, durationBeats })),
    );

    expect(parsed.notes).toContainEqual({
      onsetBeats: rational(4),
      durationBeats: rational(5, 2),
      midi: 67,
      instrumentId: expect.any(String),
    });
    expect(parsed.notes).toContainEqual({
      onsetBeats: rational(51, 2),
      durationBeats: rational(9, 2),
      midi: 67,
      instrumentId: expect.any(String),
    });
    expect(parsed.segments.some((event) => event.ties.includes("start"))).toBe(true);
    expect(parsed.segments.some((event) => event.dots > 0)).toBe(true);
  });

  it("projects contextual exact pitches, written types, rests, tuplets, ties, and complete bars", () => {
    const projection = projectProjectToMusicXml(melodyProject());
    const melody = projection.melody!;
    expect(projection.attributes.divisions).toBe(6);
    expect(melody.measures.map((measure) => measure.capacity)).toEqual([24, 24]);
    expect(melodyNotes(projection).every((note) => pitchMidi(note) === note.sourceMidi)).toBe(true);
    expect(
      melodyNotes(projection).filter((note) => note.stepId === "melody-triplet")[0],
    ).toMatchObject({
      pitch: { step: "C", alter: 0, octave: 5 },
      type: "eighth",
      timeModification: { actualNotes: 3, normalNotes: 2, normalType: "eighth" },
      voice: "1",
      staff: 1,
      chord: false,
    });
    expect(melodyRests(projection).map((event) => event.stepId)).toEqual([
      "melody-rest",
      "melody-no-recipe",
      "__trailing-measure-gap__",
      "__trailing-measure-gap__",
    ]);
    expect(
      melodyRests(projection)
        .filter((event) => event.stepId === "__trailing-measure-gap__")
        .map((event) => event.durationBeats),
    ).toEqual([rational(2), rational(1, 2)]);
    expect(
      melodyNotes(projection)
        .filter((note) => note.stepId === "melody-quarter")
        .map((note) => note.ties),
    ).toEqual([["start"], ["stop"]]);
    expect(
      melody.measures.every(
        (measure) =>
          measure.events.reduce((sum, event) => sum + event.duration, 0) === measure.capacity,
      ),
    ).toBe(true);
    expect(writeMusicXml(projection)).not.toContain("melody-branch-only");
  });

  it("carries authored Melody pitch spelling through the contextual projection", () => {
    const source = melodyProject();
    const first = source.progression.steps[0] as ChordStep;
    const spelledFirst = Object.freeze({
      ...first,
      explicitSpellingOverrides: Object.freeze({ "upper:60": { step: "B" as const, alter: 1 } }),
    });
    const project = Object.freeze({
      ...source,
      progression: Object.freeze({
        steps: Object.freeze([spelledFirst, ...source.progression.steps.slice(1)]),
      }),
    });
    const firstNote = melodyNotes(projectProjectToMusicXml(project)).find(
      (note) => note.stepId === "melody-triplet",
    );
    expect(firstNote?.pitch).toEqual({ step: "B", alter: 1, octave: 4 });
    expect(firstNote && pitchMidi(firstNote)).toBe(firstNote?.sourceMidi);
  });

  it.each([
    ["flute", "Flute", 74, "G", 2],
    ["violin", "Violin", 41, "G", 2],
    ["clarinet", "Clarinet", 72, "G", 2],
    ["oboe", "Oboe", 69, "G", 2],
    ["cello", "Cello", 43, "F", 4],
    ["synth-lead", "Synth Lead", 81, "G", 2],
  ] as const)(
    "maps %s to its deterministic MusicXML identity",
    (instrument, name, program, sign, line) => {
      const project = Object.freeze({
        ...melodyProject(),
        melodyTrack: Object.freeze({ ...melodyProject().melodyTrack, instrument }),
      });
      const projection = projectProjectToMusicXml(project);
      expect(projection.melody).toMatchObject({
        id: "P2",
        name,
        instrumentName: name,
        instrument,
        midiChannel: 3,
        midiProgram: program,
        clef: { sign, line },
      });
    },
  );

  it("writes both supported triplet grids with time-modification and deterministic tuplet boundaries", () => {
    for (const [grid, type, normalType] of [
      ["eighth-triplet", "eighth", "eighth"],
      ["sixteenth-triplet", "16th", "16th"],
    ] as const) {
      const base = createDefaultProject(`triplet-${grid}`, `Triplet ${grid}`);
      const step = melodyChordStep(
        base,
        "I",
        "triplet-step",
        { numerator: 1, denominator: 1 },
        {
          pitchMotion: "up",
          // A recipe needs all five axes: the canonical shape requires rhythm and connection, and
          // `validateChordMelodyRecipe` rejects a partial one.
          rhythm: "even",
          connection: "retrigger",
          grid,
          octaveOffset: 0,
        },
      );
      const project = Object.freeze({
        ...base,
        progression: Object.freeze({ steps: Object.freeze([step]) }),
      });
      const projection = projectProjectToMusicXml(project);
      const events = melodyNotes(projection);
      expect(events.every((event) => event.type === type)).toBe(true);
      expect(events.every((event) => event.timeModification?.normalType === normalType)).toBe(true);
      expect(events[0]?.tupletMarks).toEqual(["start"]);
      expect(events.at(-1)?.tupletMarks).toEqual(["stop"]);
      expect(writeMusicXml(projection)).toContain(`<normal-type>${normalType}</normal-type>`);
    }
  });

  it("keeps tuplet brackets on the written notes that carry the tuplet ratio", () => {
    // A Melody authored on a sixteenth-triplet grid holds notes of 5/6 and 1/6 of a quarter. The 5/6
    // note is written as a dotted eighth tied to a 64th and a 3:1 64th, so the tuplet's first written
    // part is a plain note. The bracket used to open on that plain note and leave the time-modified
    // notes outside it — the bar then had no measurable length (MuseScore: "Found: 585/384.
    // Expected: 6/4") even though every duration summed exactly.
    const base = createDefaultProject("tuplet-brackets", "Tuplet Brackets");
    const spellings = ["C", "D", "E", "F", "G", "A", "B"] as const;
    const semitones = [0, 2, 4, 5, 7, 9, 11];
    const notes = Array.from({ length: 12 }, (_, index) => {
      const pitchIndex = index % 7;
      return {
        id: `n${index}`,
        pitch: exactPitch(60 + semitones[pitchIndex]!, {
          step: spellings[pitchIndex]!,
          alter: 0,
        }),
        sourcePitchMidi: 60 + semitones[pitchIndex]!,
        onset: rational(Math.floor(index / 2) * 6 + (index % 2 === 1 ? 5 : 0), 6),
        duration: rational(index % 2 === 0 ? 5 : 1, 6),
      };
    });
    const step = Object.freeze({
      ...chordStep(base, "I", "authored-tuplet", { numerator: 6, denominator: 1 }),
      melody: snapshotChordMelody({ mode: "authored" as const, phrase: { notes } }),
    });
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({ steps: Object.freeze([step]) }),
    });

    const projection = projectProjectToMusicXml(project);
    const events = melodyNotes(projection);
    const bracketed = events.filter((event) => event.tupletMarks.length > 0);

    // A bracket may only sit on a note that states its own ratio.
    expect(bracketed.length).toBeGreaterThan(0);
    expect(bracketed.every((event) => event.timeModification !== undefined)).toBe(true);
    // The plain written values never open or close a bracket.
    const plainValues = events.filter((event) => event.timeModification === undefined);
    expect(plainValues.every((event) => event.tupletMarks.length === 0)).toBe(true);
    // The 3:1 64th opens the tuplet and the 3:2 16th closes it.
    const opens = bracketed.filter((event) => event.tupletMarks.includes("start"));
    const closes = bracketed.filter((event) => event.tupletMarks.includes("stop"));
    expect(opens.length).toBeGreaterThan(0);
    expect(
      opens.every(
        (event) =>
          event.timeModification?.actualNotes === 3 && event.timeModification.normalNotes === 1,
      ),
    ).toBe(true);
    expect(
      closes.every(
        (event) =>
          event.timeModification?.actualNotes === 3 && event.timeModification.normalNotes === 2,
      ),
    ).toBe(true);
    expect(writeMusicXml(projection)).toContain('<tuplet type="start"');
  });

  it("keeps non-even triplet rhythm and a clipped final attack semantically notated", () => {
    const base = createDefaultProject("dotted-triplet", "Dotted Triplet");
    const step = melodyChordStep(
      base,
      "I",
      "dotted-triplet-step",
      { numerator: 5, denominator: 2 },
      {
        pitchMotion: "up",
        rhythm: "dotted",
        connection: "retrigger",
        grid: "eighth-triplet",
        octaveOffset: 0,
      },
    );
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({ steps: Object.freeze([step]) }),
    });
    const projection = projectProjectToMusicXml(project);
    const events = melodyNotes(projection).filter(
      (event) => event.stepId === "dotted-triplet-step",
    );

    expect(events.map((event) => event.durationBeats)).toEqual([
      rational(1),
      rational(1, 3),
      rational(1),
      rational(1, 6),
    ]);
    expect(events.map((event) => event.type)).toEqual(["quarter", "eighth", "quarter", "16th"]);
    expect(events[1]?.timeModification).toEqual({
      actualNotes: 3,
      normalNotes: 2,
      normalType: "eighth",
    });
    expect(events[3]?.timeModification).toEqual({
      actualNotes: 3,
      normalNotes: 2,
      normalType: "16th",
    });
    expect(events.every((event) => event.tupletMarks.length === 0)).toBe(true);
    expect(writeMusicXml(projection)).toContain("<type>16th</type>");
    expect(writeMusicXml(projection)).toContain("<normal-type>16th</normal-type>");
  });

  it.each([
    [3, 4, [3], 3],
    [7, 8, [2, 2, 3], 3.5],
  ] as const)(
    "keeps %s/%s measure capacity exact with grouping %s",
    (numerator, denominator, grouping, barLength) => {
      const base = createDefaultProject(`meter-${numerator}-${denominator}`, "Meter Melody");
      const step = melodyChordStep(
        base,
        "I",
        "meter-melody",
        { numerator: 5, denominator: 2 },
        {
          pitchMotion: "up-down",
          grid: "eighth",
          octaveOffset: 0,
          rhythm: "even",
          connection: "retrigger",
        },
      );
      const project = Object.freeze({
        ...base,
        globalTiming: globalTiming(100, meter(numerator, denominator, grouping)),
        progression: Object.freeze({ steps: Object.freeze([step]) }),
      });
      const projection = projectProjectToMusicXml(project);
      expect(projection.attributes.time).toMatchObject({ numerator, denominator, grouping });
      expect(projection.melody!.measures.length).toBeGreaterThan(0);
      expect(
        projection.melody!.measures.every(
          (measure) =>
            measure.capacityBeats.numerator / measure.capacityBeats.denominator === barLength &&
            measure.events.reduce((sum, event) => sum + event.duration, 0) === measure.capacity,
        ),
      ).toBe(true);
    },
  );

  it("does not let notation depend on Melody mute/solo/volume or swing", () => {
    const source = melodyProject();
    const straightXml = writeMusicXml(projectProjectToMusicXml(source));
    const variants = [
      { muted: true, solo: false, volume: 100 },
      { muted: false, solo: true, volume: 100 },
      { muted: false, solo: false, volume: 7 },
    ];
    for (const track of variants) {
      const variant = Object.freeze({
        ...source,
        melodyTrack: Object.freeze({ ...source.melodyTrack, ...track }),
      });
      expect(writeMusicXml(projectProjectToMusicXml(variant))).toBe(straightXml);
    }
    const swing = Object.freeze({ ...source, groove: groove("swing", 0.75) });
    expect(writeMusicXml(projectProjectToMusicXml(swing))).toBe(straightXml);
  });

  it("is deterministic and deeply immutable without mutating the source Project", () => {
    const project = melodyProject();
    const before = structuredClone(project);
    const first = projectProjectToMusicXml(project);
    const second = projectProjectToMusicXml(project);
    expect(second).toEqual(first);
    expect(writeMusicXml(second)).toBe(writeMusicXml(first));
    expect(structuredClone(project)).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.melody)).toBe(true);
    expect(Object.isFrozen(first.melody?.measures)).toBe(true);
    expect(Object.isFrozen(first.melody?.measures[0])).toBe(true);
    expect(Object.isFrozen(first.melody?.measures[0]?.events)).toBe(true);
    expect(Object.isFrozen(first.melody?.measures[0]?.events[0])).toBe(true);
  });

  it("rejects malformed Melody projection data with a stable typed writer error", () => {
    const projection = projectProjectToMusicXml(melodyProject());
    const invalid = {
      ...projection,
      melody: {
        ...projection.melody!,
        measures: [
          {
            ...projection.melody!.measures[0]!,
            capacity: projection.melody!.measures[0]!.capacity + 1,
          },
          ...projection.melody!.measures.slice(1),
        ],
      },
    } as unknown as MusicXmlProjection;
    expect(() => writeMusicXml(invalid)).toThrowError(MusicXmlWriterError);
    expect(() => writeMusicXml(invalid)).toThrowError(/duration .* does not equal capacity/);

    const invalidClef = {
      ...projection,
      melody: { ...projection.melody!, clef: undefined },
    } as unknown as MusicXmlProjection;
    expect(() => writeMusicXml(invalidClef)).toThrowError(MusicXmlWriterError);

    const malformed = melodyProject();
    const malformedStep = malformed.progression.steps[0] as ChordStep;
    const malformedProject = Object.freeze({
      ...malformed,
      progression: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            ...malformedStep,
            melody: { ...malformedStep.melody!, grid: "invalid" },
          }),
        ]),
      }),
    }) as unknown as Project;
    expect(() => projectProjectToMusicXml(malformedProject)).toThrowError(MusicXmlExportError);
  });

  it("validates a fresh valid Melody fixture and rejects a deliberate invalid fixture offline", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cadenceflow-t175-musicxml-"));
    const validPath = join(directory, "fresh-melody.musicxml");
    const invalidPath = join(directory, "invalid-melody.musicxml");
    const validate = (path: string) =>
      spawnSync(
        process.execPath,
        [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/validate-musicxml.ts"), path],
        { encoding: "utf8", timeout: 20000 },
      );
    try {
      const xml = writeMusicXml(projectProjectToMusicXml(melodyProject()));
      await writeFile(validPath, xml, "utf8");
      const valid = validate(validPath);
      expect(valid.error).toBeUndefined();
      expect(valid.status, valid.stderr).toBe(0);
      await writeFile(
        invalidPath,
        xml.replace("<midi-channel>3</midi-channel>", "<midi-channel>17</midi-channel>"),
        "utf8",
      );
      const invalid = validate(invalidPath);
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toContain("XSD validation failed");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
