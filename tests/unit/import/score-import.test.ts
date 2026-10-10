import { beforeAll, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { zipSync, strToU8 } from "fflate";
import { parseMidi, parseMusicXml, parseSafeXml } from "../../../src/import/scoreFile";
import { parseMxl } from "../../../src/import/mxl";
import { createImportedProject } from "../../../src/import/importedProject";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import { rational } from "../../../src/domain/timing/rational";
import { projectProjectToMusicXml } from "../../../src/export/musicxml/projection";
import { writeMusicXml } from "../../../src/export/musicxml/writer";
import { projectProjectToMidi } from "../../../src/export/midi/eventProjection";
import { writeMidiFile } from "../../../src/export/midi/writer";
import {
  scoreXml,
  xmlNote,
  attributes,
  simpleXml,
  midiFixture,
  simpleMidi,
} from "../../fixtures/score-import.fixture";
beforeAll(() => {
  globalThis.DOMParser = new JSDOM().window.DOMParser;
});
const eot = [0, 255, 47, 0];
describe("MIDI score import", () => {
  it("imports one instrument with exact PPQ duration and original trailing rest", () => {
    const score = parseMidi(
      midiFixture([[0, 192, 24, 0, 144, 60, 80, 32, 128, 60, 0, 64, 255, 47, 0]]),
    );
    expect(score.instruments).toHaveLength(1);
    expect(score.instruments[0]!.notes[0]!.duration).toEqual(rational(1, 3));
    expect(score.instruments[0]!.endBeats).toEqual(rational(1));
    expect(score.instruments[0]!.instrument).toBe("gm-024");
  });
  it("handles running status, zero-velocity note-off and same-pitch FIFO overlaps", () => {
    const score = parseMidi(
      midiFixture([[0, 144, 60, 80, 32, 60, 80, 32, 60, 0, 32, 60, 0, ...eot]]),
    );
    expect(score.instruments[0]!.notes.map((note) => [note.onset, note.duration])).toEqual([
      [rational(0), rational(2, 3)],
      [rational(1, 3), rational(2, 3)],
    ]);
  });
  it("splits format 0 by channel and program, including same-tick program order", () => {
    const score = parseMidi(
      midiFixture([
        [
          0,
          144,
          60,
          80,
          0,
          192,
          40,
          0,
          144,
          64,
          80,
          0,
          193,
          73,
          0,
          145,
          67,
          80,
          96,
          128,
          60,
          0,
          0,
          128,
          64,
          0,
          0,
          129,
          67,
          0,
          ...eot,
        ],
      ]),
    );
    expect(score.instruments.map((part) => part.notes[0]!.pitch.midiNumber)).toEqual([60, 64, 67]);
    expect(score.instruments.map((part) => part.instrument)).toEqual(["gm-000", "violin", "flute"]);
  });
  it("reads conductor metadata and cross-track programs without listing metadata-only tracks", () => {
    const score = parseMidi(
      midiFixture([
        [0, 255, 81, 3, 7, 161, 32, 0, 255, 88, 4, 3, 2, 24, 8, 0, 192, 24, ...eot],
        [0, 144, 60, 80, 96, 128, 60, 0, ...eot],
      ]),
    );
    expect(score.tempoBpm).toBe(120);
    expect(score.meter.numerator).toBe(3);
    expect(score.instruments).toHaveLength(1);
    expect(score.instruments[0]!.instrument).toBe("gm-024");
  });
  it("lists percussion as unavailable while preserving a pitched candidate", () => {
    const score = parseMidi(
      midiFixture([[0, 153, 35, 80, 0, 144, 60, 80, 96, 137, 35, 0, 0, 128, 60, 0, ...eot]]),
    );
    expect(score.instruments).toHaveLength(2);
    expect(score.instruments[1]!.unavailableReason).toMatch(/percussion/);
  });
  it.each([
    ["truncated", Uint8Array.from([77, 84])],
    ["dangling", midiFixture([[0, 144, 60, 80, ...eot]])],
    ["orphan off", midiFixture([[0, 128, 60, 0, ...eot]])],
    ["zero duration", midiFixture([[0, 144, 60, 80, 0, 128, 60, 0, ...eot]])],
    ["format2", midiFixture([[...eot]], 96, 2)],
    ["SMPTE", midiFixture([[...eot]], 0x8019)],
    [
      "variable tempo",
      midiFixture([[0, 255, 81, 3, 7, 161, 32, 96, 255, 81, 3, 6, 26, 128, ...eot]]),
    ],
  ])("rejects %s without creating a project", (_label, bytes) =>
    expect(() => parseMidi(bytes as Uint8Array)).toThrow(),
  );
});
describe("MusicXML score import", () => {
  it("preserves polyphony, backup/forward, exact uncommon tuplets and pitch spelling", () => {
    const xml = scoreXml(
      `<measure number="1"><attributes><divisions>65537</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${xmlNote("C", 1)}${xmlNote("E", 1, "<chord/>")}<forward><duration>262147</duration></forward><backup><duration>262148</duration></backup>${xmlNote("G", 262148, "<voice>2</voice>")}</measure>`,
    );
    const score = parseMusicXml(xml),
      notes = score.instruments[0]!.notes;
    expect(notes).toHaveLength(3);
    expect(notes[0]!.duration).toEqual(rational(1, 65537));
    expect(notes[1]!.onset).toEqual(rational(0));
    expect(notes[2]!.duration).toEqual(rational(4));
  });
  it("merges tied notes across measures and normalizes default staff/voice", () => {
    const score = parseMusicXml(
      scoreXml(
        `<measure>${attributes}${xmlNote("C", 12, '<tie type="start"/>')}</measure><measure>${xmlNote("C", 12, '<tie type="stop"/><staff>1</staff><voice>1</voice>')}</measure>`,
      ),
    );
    expect(score.instruments[0]!.notes).toHaveLength(1);
    expect(score.instruments[0]!.notes[0]!.duration).toEqual(rational(8));
    expect(score.instruments[0]!.endBeats).toEqual(rational(8));
  });
  it("uses concert transposition but ignores display-only octave clefs", () => {
    const score = parseMusicXml(
      scoreXml(
        `<measure>${attributes.replace("</attributes>", "<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef><transpose><chromatic>-2</chromatic><octave-change>-1</octave-change></transpose></attributes>")}${xmlNote("C", 12)}</measure>`,
      ),
    );
    expect(score.instruments[0]!.notes[0]!.pitch.midiNumber).toBe(46);
  });
  it("has selectable named parts and disabled unsupported parts", () => {
    const body = `<measure>${attributes}${xmlNote("C", 12)}</measure>`;
    const score = parseMusicXml(
      scoreXml(
        body,
        `<measure>${attributes}<note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>${xmlNote("C", 12)}</measure>`,
      ),
    );
    expect(score.instruments.map((part) => part.name)).toEqual(["Guitar", "Flute"]);
    expect(score.instruments[1]!.unavailableReason).toMatch(/Grace/);
  });
  it("warns about repeats and expression before activation", () => {
    const score = parseMusicXml(
      scoreXml(
        `<measure>${attributes}<direction><direction-type><dynamics><f/></dynamics></direction-type></direction>${xmlNote("C", 12)}<barline><repeat direction="backward"/></barline></measure>`,
      ),
    );
    expect(score.warnings).toHaveLength(2);
  });
  it.each([
    ["entities", '<!DOCTYPE x [<!ENTITY attack "oops">]><score-partwise/>'],
    ["malformed", "<score-partwise>"],
    ["timewise", "<score-timewise/>"],
    [
      "unfinished tie",
      scoreXml(`<measure>${attributes}${xmlNote("C", 12, '<tie type="start"/>')}</measure>`),
    ],
    [
      "late initial tempo",
      scoreXml(
        `<measure>${attributes}${xmlNote("C", 3)}<direction><sound tempo="99"/></direction>${xmlNote("D", 9)}</measure>`,
      ),
    ],
  ])("rejects %s", (_label, xml) => expect(() => parseMusicXml(xml)).toThrow());
  it("rejects excessively deep XML before traversing music", () =>
    expect(() => parseSafeXml(`${"<x>".repeat(129)}${"</x>".repeat(129)}`)).toThrow(/limits/));
  it("preserves pickup timing without padding before the next measure", () => {
    const score = parseMusicXml(
      scoreXml(
        `<measure implicit="yes">${attributes}${xmlNote("C", 3)}</measure><measure>${xmlNote("D", 12)}</measure>`,
      ),
    );
    expect(score.instruments[0]!.notes[1]!.onset).toEqual(rational(1));
    expect(score.instruments[0]!.endBeats).toEqual(rational(5));
    expect(score.warnings?.join(" ")).toMatch(/Pickup/);
  });
});
describe("compressed MusicXML", () => {
  const archive = (path = "scores/main.musicxml", level: 0 | 6 = 6) =>
    zipSync(
      {
        "META-INF/container.xml": strToU8(
          `<container><rootfiles><rootfile full-path="${path}" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`,
        ),
        [path]: strToU8(simpleXml()),
      },
      { level },
    );
  it.each([0, 6] as const)(
    "imports stored/deflated ZIP method %i through the container rootfile",
    (level) =>
      expect(parseMxl(archive(undefined, level)).instruments[0]!.notes[0]!.pitch.midiNumber).toBe(
        60,
      ),
  );
  it("rejects traversal paths", () =>
    expect(() => parseMxl(archive("../score.xml"))).toThrow(/unsafe/));
  it("rejects CRC corruption", () => {
    const bytes = archive(undefined, 0);
    const directory = bytes.findIndex(
      (byte, index) =>
        byte === 80 && bytes[index + 1] === 75 && bytes[index + 2] === 1 && bytes[index + 3] === 2,
    );
    bytes[directory + 16] = bytes[directory + 16]! ^ 1;
    expect(() => parseMxl(bytes)).toThrow(/checksum/);
  });
  it("enforces actual inflated size even when the ZIP header lies", () => {
    const bytes = zipSync({
      "META-INF/container.xml": strToU8(`<container>${" ".repeat(300_000)}</container>`),
    });
    const directory = bytes.findIndex(
      (byte, index) =>
        byte === 80 && bytes[index + 1] === 75 && bytes[index + 2] === 1 && bytes[index + 3] === 2,
    );
    new DataView(bytes.buffer).setUint32(directory + 24, 1, true);
    expect(() => parseMxl(bytes)).toThrow(/output exceeds/);
  });
  it("rejects encrypted ZIP flags and excessive entry counts", () => {
    const bytes = archive(),
      directory = bytes.findIndex(
        (byte, index) =>
          byte === 80 &&
          bytes[index + 1] === 75 &&
          bytes[index + 2] === 1 &&
          bytes[index + 3] === 2,
      );
    bytes[directory + 8] = bytes[directory + 8]! | 1;
    expect(() => parseMxl(bytes)).toThrow(/encrypted/);
    const many = Object.fromEntries(
      Array.from({ length: 257 }, (_, index) => [`${index}.xml`, strToU8("<x/>")]),
    );
    expect(() => parseMxl(zipSync(many))).toThrow(/directory size/);
  });
  it("rejects missing container", () =>
    expect(() => parseMxl(zipSync({ "score.xml": strToU8(simpleXml()) }))).toThrow(/container/));
});
describe("new imported project", () => {
  it("round-trips the authored timeline through the app's own MIDI and MusicXML exports", () => {
    const source = parseMusicXml(
      scoreXml(
        `<measure>${attributes}${xmlNote("C", 12, '<tie type="start"/>')}</measure><measure>${xmlNote("C", 12, '<tie type="stop"/>')}</measure>`,
      ),
    );
    const project = createImportedProject(
      source,
      source.instruments[0]!,
      "source.xml",
      "roundtrip",
    );
    for (const score of [
      parseMusicXml(writeMusicXml(projectProjectToMusicXml(project))),
      parseMidi(writeMidiFile(projectProjectToMidi(project))),
    ]) {
      const part = score.instruments.find((item) => item.notes.length)!;
      expect(part.notes).toHaveLength(1);
      expect(part.notes[0]!.pitch.midiNumber).toBe(60);
      expect(part.notes[0]!.onset).toEqual(rational(0));
      expect(part.notes[0]!.duration).toEqual(rational(8));
    }
  });
  it("preserves authored melody on RestSteps and creates no chords", () => {
    const score = parseMidi(simpleMidi());
    const project = createImportedProject(score, score.instruments[0]!, "new.mid", "fresh");
    expect(project.name).toBe("new");
    expect(project.presentation.progressionView).toBe("staff");
    expect(project.progression.steps.every((step) => step.kind === "rest")).toBe(true);
    expect(createEffectiveMelodyTimeline(project)).toHaveLength(1);
  });
  it("keeps sustained cross-measure notes as one sounding attack after codec validation", () => {
    const score = parseMusicXml(
      scoreXml(
        `<measure>${attributes}${xmlNote("C", 12, '<tie type="start"/>')}</measure><measure>${xmlNote("C", 12, '<tie type="stop"/>')}</measure>`,
      ),
    );
    const project = createImportedProject(score, score.instruments[0]!, "tied.xml", "fresh");
    expect(project.progression.steps).toHaveLength(2);
    expect(createEffectiveMelodyTimeline(project)[0]!.durationBeats).toEqual(rational(8));
  });
});
