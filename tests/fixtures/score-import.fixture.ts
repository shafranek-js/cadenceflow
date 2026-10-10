export function midiFixture(
  tracks: readonly (readonly number[])[],
  ppq = 96,
  format = tracks.length > 1 ? 1 : 0,
): Uint8Array {
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return Uint8Array.from([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    format,
    tracks.length >>> 8,
    tracks.length & 255,
    ppq >>> 8,
    ppq & 255,
    ...tracks.flatMap((track) => [77, 84, 114, 107, ...u32(track.length), ...track]),
  ]);
}
export const simpleMidi = () =>
  midiFixture([[0, 192, 24, 0, 144, 60, 80, 96, 128, 60, 0, 0, 255, 47, 0]]);
export function scoreXml(
  partBody: string,
  secondBody?: string,
  definitions = '<score-part id="P1"><part-name>Guitar</part-name><score-instrument id="I1"><instrument-name>Guitar</instrument-name></score-instrument><midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>25</midi-program></midi-instrument></score-part>',
): string {
  return `<?xml version="1.0"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise version="4.0"><part-list>${definitions}${secondBody === undefined ? "" : '<score-part id="P2"><part-name>Flute</part-name><score-instrument id="I2"><instrument-name>Flute</instrument-name></score-instrument><midi-instrument id="I2"><midi-program>74</midi-program></midi-instrument></score-part>'}</part-list><part id="P1">${partBody}</part>${secondBody === undefined ? "" : `<part id="P2">${secondBody}</part>`}</score-partwise>`;
}
export const attributes =
  "<attributes><divisions>3</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>";
export function xmlNote(step = "C", duration = 3, extra = "", octave = 4): string {
  return `<note>${extra}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration></note>`;
}
export const simpleXml = () =>
  scoreXml(`<measure number="1">${attributes}${xmlNote("C", 12)}</measure>`);
