import { createDefaultProject } from "../domain/project/factory";
import { normalizeProjectName } from "../domain/project/name";
import type { Project } from "../domain/project/project";
import type { RestStep } from "../domain/progression/step";
import { musicalDuration } from "../domain/timing/duration";
import { globalTiming } from "../domain/timing/meter";
import { rational, subtractRational, addRational, type Rational } from "../domain/timing/rational";
import type { ImportedInstrument, ImportedScore } from "./scoreFile";
import {
  encodePortableProject,
  decodePortableProjectWithDiagnostics,
} from "../persistence/portableProject";
import { createEffectiveMelodyTimeline } from "../domain/melody/effectiveTimeline";
import { compareRational } from "../domain/timing/rational";

export function createImportedProject(
  score: ImportedScore,
  instrument: ImportedInstrument,
  filename: string,
  id: string,
  now = new Date().toISOString(),
): Project {
  if (instrument.unavailableReason) throw new Error(instrument.unavailableReason);
  if (!score.instruments.includes(instrument) || !instrument.notes.length)
    throw new Error("Choose a supported instrument with notes.");
  const name = normalizeProjectName(
    (score.title || filename)
      .replace(/\.(mid|midi|musicxml|xml|mxl)$/i, "")
      .trim()
      .slice(0, 100) || "Imported score",
  );
  const project = createDefaultProject(id, name, now);
  const bar = rational(score.meter.numerator * 4, score.meter.denominator);
  const end = instrument.notes.reduce((maximum, note) => {
    const noteEnd = addRational(note.onset, note.duration);
    return compareRational(noteEnd, maximum) > 0 ? noteEnd : maximum;
  }, instrument.endBeats);
  const quotient = (beat: Rational) => ({
    numerator: BigInt(beat.numerator) * BigInt(bar.denominator),
    denominator: BigInt(beat.denominator) * BigInt(bar.numerator),
  });
  const endRatio = quotient(end);
  const count = Math.max(
    1,
    Number((endRatio.numerator + endRatio.denominator - 1n) / endRatio.denominator),
  );
  if (count > 10_000) throw new Error("The imported instrument exceeds 10000 measures.");
  const buckets = Array.from({ length: count }, () => [] as (typeof instrument.notes)[number][]);
  for (const note of instrument.notes) {
    const ratio = quotient(note.onset);
    buckets[Number(ratio.numerator / ratio.denominator)]!.push(note);
  }
  const steps: RestStep[] = buckets.map((notes, index) => ({
    id: `${id}-measure-${index + 1}`,
    kind: "rest",
    duration: musicalDuration(bar, { kind: "bars", bars: 1 }),
    authoredMelody: {
      notes: notes.map((note, noteIndex) => ({
        id: `${id}-note-${index}-${noteIndex}`,
        pitch: note.pitch,
        onset: subtractRational(note.onset, rational(bar.numerator * index, bar.denominator)),
        duration: note.duration,
      })),
    },
  }));
  const imported: Project = {
    ...project,
    ...(score.tonic === undefined ? {} : { tonic: score.tonic as Project["tonic"] }),
    globalTiming: globalTiming(score.tempoBpm, score.meter),
    defaults: {
      ...project.defaults,
      piano: {
        ...project.defaults.piano,
        duration: musicalDuration(bar, { kind: "bars", bars: 1 }),
      },
    },
    melodyTrack: { ...project.melodyTrack, instrument: instrument.instrument },
    presentation: { ...project.presentation, progressionView: "staff" },
    progression: { ...project.progression, steps },
  };
  const decoded = decodePortableProjectWithDiagnostics(encodePortableProject(imported));
  if (decoded.diagnostics.length) throw new Error("The imported project did not pass validation.");
  const actual = [...createEffectiveMelodyTimeline(decoded.project)].sort(
    (a, b) =>
      compareRational(a.startBeats, b.startBeats) ||
      a.pitch.midiNumber - b.pitch.midiNumber ||
      compareRational(a.durationBeats, b.durationBeats),
  );
  const expected = [...instrument.notes].sort(
    (a, b) =>
      compareRational(a.onset, b.onset) ||
      a.pitch.midiNumber - b.pitch.midiNumber ||
      compareRational(a.duration, b.duration),
  );
  if (
    actual.length !== expected.length ||
    expected.some((note, index) => {
      const event = actual[index]!;
      return (
        event.pitch.midiNumber !== note.pitch.midiNumber ||
        compareRational(event.startBeats, note.onset) !== 0 ||
        compareRational(event.durationBeats, note.duration) !== 0
      );
    })
  )
    throw new Error("The imported project could not preserve all note pitches and durations.");
  return decoded.project;
}
