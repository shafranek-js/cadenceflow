import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../src/domain/project/factory";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
import { musicalDuration } from "../../src/domain/timing/duration";
import { meter } from "../../src/domain/timing/meter";
import { rational } from "../../src/domain/timing/rational";
import { projectProjectToMidi } from "../../src/export/midi/eventProjection";
import { writeStandardMidiFile } from "../../src/export/midi/writer";
import { projectProjectToMusicXml } from "../../src/export/musicxml/projection";
import { writeMusicXml } from "../../src/export/musicxml/writer";

function halfChordProject() {
  const base = createDefaultProject("measure-export", "Measure Export");
  const step = createMatrixChordStep(base, "I", "half-chord");
  return Object.freeze({
    ...base,
    globalTiming: Object.freeze({ ...base.globalTiming, meter: meter(4, 4, [4]) }),
    progression: Object.freeze({
      ...base.progression,
      steps: Object.freeze([Object.freeze({ ...step, duration: musicalDuration(rational(2)) })]),
    }),
  });
}

function readTrackEndTick(bytes: Uint8Array): number {
  const trackOffset = bytes.findIndex(
    (value, index) =>
      index + 3 < bytes.length &&
      value === 0x4d &&
      bytes[index + 1] === 0x54 &&
      bytes[index + 2] === 0x72 &&
      bytes[index + 3] === 0x6b,
  );
  if (trackOffset < 0) throw new Error("MTrk chunk missing");
  const length =
    (bytes[trackOffset + 4]! << 24) |
    (bytes[trackOffset + 5]! << 16) |
    (bytes[trackOffset + 6]! << 8) |
    bytes[trackOffset + 7]!;
  let cursor = trackOffset + 8;
  const end = cursor + length;
  let absoluteTick = 0;
  while (cursor < end) {
    let delta = 0;
    let value: number;
    do {
      value = bytes[cursor++]!;
      delta = (delta << 7) | (value & 0x7f);
    } while (value & 0x80);
    absoluteTick += delta;
    const status = bytes[cursor++]!;
    if (status === 0xff) {
      const type = bytes[cursor++]!;
      const size = bytes[cursor++]!;
      cursor += size;
      if (type === 0x2f) return absoluteTick;
    } else if ((status & 0xf0) === 0x80 || (status & 0xf0) === 0x90) {
      cursor += 2;
    } else {
      throw new Error(`Unexpected MIDI status ${status.toString(16)}`);
    }
  }
  throw new Error("MIDI EOT missing");
}

describe("measure-card aligned trailing silence exports", () => {
  it("pads MIDI to the next bar without creating a phantom note", () => {
    const project = halfChordProject();
    const projection = projectProjectToMidi(project);
    expect(projection.totalTicks).toBe(480);
    expect(Math.max(...projection.notes.map((note) => note.endTick))).toBe(228);
    expect(readTrackEndTick(writeStandardMidiFile(projection))).toBe(480);
  });

  it("writes a real MusicXML rest for the final virtual gap", () => {
    const project = halfChordProject();
    const projection = projectProjectToMusicXml(project);
    const finalMeasure = projection.measures.at(-1)!;
    const rest = finalMeasure.events.find((event) => event.kind === "rest");
    expect(rest).toMatchObject({ stepId: "__trailing-measure-gap__", durationBeats: rational(2) });
    expect(finalMeasure.durationBeats).toEqual(rational(4));
    const xml = writeMusicXml(projection);
    expect(xml).toMatch(/<rest\/>\s*<duration>2<\/duration>/);
  });
});
