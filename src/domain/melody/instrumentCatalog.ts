/**
 * Canonical General MIDI Level 1 program catalog for Melody.
 *
 * The catalog is deliberately data-only: the six locally bundled FluidR3_GM
 * programs are marked realtime and every other GM program is export-only.
 */

export type MelodyInstrumentId =
  "flute" | "violin" | "clarinet" | "oboe" | "cello" | "synth-lead" | `gm-${string}`;

export type MelodyInstrumentFamily =
  | "Piano"
  | "Chromatic Percussion"
  | "Organ"
  | "Guitar"
  | "Bass"
  | "Strings"
  | "Ensemble"
  | "Brass"
  | "Reed"
  | "Pipe"
  | "Synth Lead"
  | "Synth Pad"
  | "Synth Effects"
  | "Ethnic"
  | "Percussive"
  | "Sound Effects";

export type MelodyInstrumentClef = "treble" | "bass";
export type MelodyInstrumentAvailability = "available" | "export-only";

export interface MelodyInstrumentCatalogEntry {
  readonly id: MelodyInstrumentId;
  /** General MIDI program number, zero-based. */
  readonly program: number;
  readonly family: MelodyInstrumentFamily;
  readonly label: string;
  readonly clef: MelodyInstrumentClef;
  /** Informational MIDI range; the canonical catalog intentionally does not constrain notes. */
  readonly playableRange: { readonly minMidi: 0; readonly maxMidi: 127 };
  readonly sampleAsset?: string;
  readonly realtimeAvailability: MelodyInstrumentAvailability;
}

const GM_LABELS = [
  "Acoustic Grand Piano",
  "Bright Acoustic Piano",
  "Electric Grand Piano",
  "Honky-tonk Piano",
  "Electric Piano 1",
  "Electric Piano 2",
  "Harpsichord",
  "Clavinet",
  "Celesta",
  "Glockenspiel",
  "Music Box",
  "Vibraphone",
  "Marimba",
  "Xylophone",
  "Tubular Bells",
  "Dulcimer",
  "Drawbar Organ",
  "Percussive Organ",
  "Rock Organ",
  "Church Organ",
  "Reed Organ",
  "Accordion",
  "Harmonica",
  "Tango Accordion",
  "Acoustic Guitar (nylon)",
  "Acoustic Guitar (steel)",
  "Electric Guitar (jazz)",
  "Electric Guitar (clean)",
  "Electric Guitar (muted)",
  "Overdriven Guitar",
  "Distortion Guitar",
  "Guitar harmonics",
  "Acoustic Bass",
  "Electric Bass (finger)",
  "Electric Bass (pick)",
  "Fretless Bass",
  "Slap Bass 1",
  "Slap Bass 2",
  "Synth Bass 1",
  "Synth Bass 2",
  "Violin",
  "Viola",
  "Cello",
  "Contrabass",
  "Tremolo Strings",
  "Pizzicato Strings",
  "Orchestral Harp",
  "Timpani",
  "String Ensemble 1",
  "String Ensemble 2",
  "Synth Strings 1",
  "Synth Strings 2",
  "Choir Aahs",
  "Voice Oohs",
  "Synth Voice",
  "Orchestra Hit",
  "Trumpet",
  "Trombone",
  "Tuba",
  "Muted Trumpet",
  "French Horn",
  "Brass Section",
  "Synth Brass 1",
  "Synth Brass 2",
  "Soprano Sax",
  "Alto Sax",
  "Tenor Sax",
  "Baritone Sax",
  "Oboe",
  "English Horn",
  "Bassoon",
  "Clarinet",
  "Piccolo",
  "Flute",
  "Recorder",
  "Pan Flute",
  "Blown Bottle",
  "Shakuhachi",
  "Whistle",
  "Ocarina",
  "Lead 1 (square)",
  "Lead 2 (sawtooth)",
  "Lead 3 (calliope)",
  "Lead 4 (chiff)",
  "Lead 5 (charang)",
  "Lead 6 (voice)",
  "Lead 7 (fifths)",
  "Lead 8 (bass + lead)",
  "Pad 1 (new age)",
  "Pad 2 (warm)",
  "Pad 3 (polysynth)",
  "Pad 4 (choir)",
  "Pad 5 (bowed)",
  "Pad 6 (metallic)",
  "Pad 7 (halo)",
  "Pad 8 (sweep)",
  "FX 1 (rain)",
  "FX 2 (soundtrack)",
  "FX 3 (crystal)",
  "FX 4 (atmosphere)",
  "FX 5 (brightness)",
  "FX 6 (goblins)",
  "FX 7 (echoes)",
  "FX 8 (sci-fi)",
  "Sitar",
  "Banjo",
  "Shamisen",
  "Koto",
  "Kalimba",
  "Bag pipe",
  "Fiddle",
  "Shanai",
  "Tinkle Bell",
  "Agogo",
  "Steel Drums",
  "Woodblock",
  "Taiko Drum",
  "Melodic Tom",
  "Synth Drum",
  "Reverse Cymbal",
  "Guitar Fret Noise",
  "Breath Noise",
  "Seashore",
  "Bird Tweet",
  "Telephone Ring",
  "Helicopter",
  "Applause",
  "Gunshot",
] as const;

const FAMILIES: readonly MelodyInstrumentFamily[] = Object.freeze([
  "Piano",
  "Chromatic Percussion",
  "Organ",
  "Guitar",
  "Bass",
  "Strings",
  "Ensemble",
  "Brass",
  "Reed",
  "Pipe",
  "Synth Lead",
  "Synth Pad",
  "Synth Effects",
  "Ethnic",
  "Percussive",
  "Sound Effects",
]);

const STABLE_IDS: Readonly<Record<number, MelodyInstrumentId>> = Object.freeze({
  40: "violin",
  42: "cello",
  68: "oboe",
  71: "clarinet",
  73: "flute",
  80: "synth-lead",
});

const SAMPLE_ASSETS: Readonly<Record<number, string>> = Object.freeze({
  40: "violin-mp3.js",
  42: "cello-mp3.js",
  68: "oboe-mp3.js",
  71: "clarinet-mp3.js",
  73: "flute-mp3.js",
  80: "lead_1_square-mp3.js",
});

function clefForProgram(program: number): MelodyInstrumentClef {
  return [32, 33, 34, 35, 36, 37, 38, 39, 42, 43, 58, 67, 70].includes(program) ? "bass" : "treble";
}

function buildCatalog(): readonly MelodyInstrumentCatalogEntry[] {
  return Object.freeze(
    GM_LABELS.map((label, program) =>
      Object.freeze({
        id: STABLE_IDS[program] ?? (`gm-${String(program).padStart(3, "0")}` as MelodyInstrumentId),
        program,
        family: FAMILIES[Math.floor(program / 8)]!,
        label,
        clef: clefForProgram(program),
        playableRange: Object.freeze({ minMidi: 0, maxMidi: 127 }),
        ...(SAMPLE_ASSETS[program] ? { sampleAsset: SAMPLE_ASSETS[program] } : {}),
        realtimeAvailability: SAMPLE_ASSETS[program] ? "available" : "export-only",
      }),
    ),
  );
}

export const MELODY_INSTRUMENT_CATALOG = buildCatalog();

export const MELODY_INSTRUMENTS: readonly MelodyInstrumentId[] = Object.freeze(
  MELODY_INSTRUMENT_CATALOG.map((entry) => entry.id),
);

export const MELODY_INSTRUMENT_BY_ID: ReadonlyMap<
  MelodyInstrumentId,
  MelodyInstrumentCatalogEntry
> = new Map(MELODY_INSTRUMENT_CATALOG.map((entry) => [entry.id, entry]));

export class MelodyInstrumentCatalogError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "MelodyInstrumentCatalogError";
  }
}

export function validateMelodyInstrumentCatalog(
  catalog: readonly MelodyInstrumentCatalogEntry[] = MELODY_INSTRUMENT_CATALOG,
): readonly MelodyInstrumentCatalogEntry[] {
  if (catalog.length !== 128) {
    throw new MelodyInstrumentCatalogError(
      "Melody instrument catalog must contain exactly 128 programs",
    );
  }
  const ids = new Set<MelodyInstrumentId>();
  const programs = new Set<number>();
  for (const entry of catalog) {
    if (ids.has(entry.id))
      throw new MelodyInstrumentCatalogError(`Duplicate Melody instrument id: ${entry.id}`);
    if (programs.has(entry.program))
      throw new MelodyInstrumentCatalogError(`Duplicate GM program: ${entry.program}`);
    ids.add(entry.id);
    programs.add(entry.program);
    if (!Number.isInteger(entry.program) || entry.program < 0 || entry.program > 127) {
      throw new MelodyInstrumentCatalogError(`Invalid GM program: ${entry.program}`);
    }
    if (!entry.label || !FAMILIES.includes(entry.family)) {
      throw new MelodyInstrumentCatalogError(`Invalid catalog metadata for ${entry.id}`);
    }
    if (entry.playableRange.minMidi !== 0 || entry.playableRange.maxMidi !== 127) {
      throw new MelodyInstrumentCatalogError(`Invalid informational range for ${entry.id}`);
    }
  }
  for (let program = 0; program < 128; program += 1) {
    if (!programs.has(program))
      throw new MelodyInstrumentCatalogError(`Missing GM program: ${program}`);
  }
  return catalog;
}

validateMelodyInstrumentCatalog();

export function getMelodyInstrument(id: MelodyInstrumentId): MelodyInstrumentCatalogEntry {
  const entry = MELODY_INSTRUMENT_BY_ID.get(id);
  if (!entry) throw new MelodyInstrumentCatalogError(`Unknown Melody instrument: ${id}`);
  return entry;
}

export function isRealtimeMelodyInstrument(id: MelodyInstrumentId): boolean {
  return getMelodyInstrument(id).realtimeAvailability === "available";
}

export function validateMelodyInstrumentId(value: unknown): MelodyInstrumentId {
  if (typeof value !== "string" || !MELODY_INSTRUMENT_BY_ID.has(value as MelodyInstrumentId)) {
    throw new MelodyInstrumentCatalogError(`Unknown Melody instrument: ${String(value)}`);
  }
  return value as MelodyInstrumentId;
}

export function resolveEffectiveMelodyInstrument(
  stepOverride: MelodyInstrumentId | undefined,
  trackInstrument: MelodyInstrumentId,
): MelodyInstrumentCatalogEntry {
  return getMelodyInstrument(stepOverride ?? trackInstrument);
}
