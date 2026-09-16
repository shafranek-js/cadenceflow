/**
 * Canonical General MIDI Level 1 program catalog for Melody.
 *
 * All 128 GM programs are realtime-capable. The six locally bundled instruments
 * (violin, cello, oboe, clarinet, flute, synth-lead) are served from the local
 * asset bundle for best performance. All remaining 122 programs are loaded
 * on-demand from the gleitz/midi-js-soundfonts CDN (FluidR3_GM).
 */

export type MelodyInstrumentId =
  | "flute"
  | "violin"
  | "clarinet"
  | "oboe"
  | "cello"
  | "synth-lead"
  | `gm-${string}`;

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
export type MelodyInstrumentAvailability = "available";

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

/**
 * Program-ordered FluidR3_GM instrument slugs from gleitz/midi-js-soundfonts.
 * Index == GM program number (0-based). Used to construct CDN URLs for the
 * 122 programs that are not locally bundled.
 */
export const FLUID_R3_NAMES: readonly string[] = Object.freeze([
  "acoustic_grand_piano",    // 0
  "bright_acoustic_piano",   // 1
  "electric_grand_piano",    // 2
  "honkytonk_piano",         // 3
  "electric_piano_1",        // 4
  "electric_piano_2",        // 5
  "harpsichord",             // 6
  "clavinet",                // 7
  "celesta",                 // 8
  "glockenspiel",            // 9
  "music_box",               // 10
  "vibraphone",              // 11
  "marimba",                 // 12
  "xylophone",               // 13
  "tubular_bells",           // 14
  "dulcimer",                // 15
  "drawbar_organ",           // 16
  "percussive_organ",        // 17
  "rock_organ",              // 18
  "church_organ",            // 19
  "reed_organ",              // 20
  "accordion",               // 21
  "harmonica",               // 22
  "tango_accordion",         // 23
  "acoustic_guitar_nylon",   // 24
  "acoustic_guitar_steel",   // 25
  "electric_guitar_jazz",    // 26
  "electric_guitar_clean",   // 27
  "electric_guitar_muted",   // 28
  "overdriven_guitar",       // 29
  "distortion_guitar",       // 30
  "guitar_harmonics",        // 31
  "acoustic_bass",           // 32
  "electric_bass_finger",    // 33
  "electric_bass_pick",      // 34
  "fretless_bass",           // 35
  "slap_bass_1",             // 36
  "slap_bass_2",             // 37
  "synth_bass_1",            // 38
  "synth_bass_2",            // 39
  "violin",                  // 40
  "viola",                   // 41
  "cello",                   // 42
  "contrabass",              // 43
  "tremolo_strings",         // 44
  "pizzicato_strings",       // 45
  "orchestral_harp",         // 46
  "timpani",                 // 47
  "string_ensemble_1",       // 48
  "string_ensemble_2",       // 49
  "synth_strings_1",         // 50
  "synth_strings_2",         // 51
  "choir_aahs",              // 52
  "voice_oohs",              // 53
  "synth_voice",             // 54
  "orchestra_hit",           // 55
  "trumpet",                 // 56
  "trombone",                // 57
  "tuba",                    // 58
  "muted_trumpet",           // 59
  "french_horn",             // 60
  "brass_section",           // 61
  "synth_brass_1",           // 62
  "synth_brass_2",           // 63
  "soprano_sax",             // 64
  "alto_sax",                // 65
  "tenor_sax",               // 66
  "baritone_sax",            // 67
  "oboe",                    // 68
  "english_horn",            // 69
  "bassoon",                 // 70
  "clarinet",                // 71
  "piccolo",                 // 72
  "flute",                   // 73
  "recorder",                // 74
  "pan_flute",               // 75
  "blown_bottle",            // 76
  "shakuhachi",              // 77
  "whistle",                 // 78
  "ocarina",                 // 79
  "lead_1_square",           // 80
  "lead_2_sawtooth",         // 81
  "lead_3_calliope",         // 82
  "lead_4_chiff",            // 83
  "lead_5_charang",          // 84
  "lead_6_voice",            // 85
  "lead_7_fifths",           // 86
  "lead_8_bass_lead",        // 87
  "pad_1_new_age",           // 88
  "pad_2_warm",              // 89
  "pad_3_polysynth",         // 90
  "pad_4_choir",             // 91
  "pad_5_bowed",             // 92
  "pad_6_metallic",          // 93
  "pad_7_halo",              // 94
  "pad_8_sweep",             // 95
  "fx_1_rain",               // 96
  "fx_2_soundtrack",         // 97
  "fx_3_crystal",            // 98
  "fx_4_atmosphere",         // 99
  "fx_5_brightness",         // 100
  "fx_6_goblins",            // 101
  "fx_7_echoes",             // 102
  "fx_8_scifi",              // 103
  "sitar",                   // 104
  "banjo",                   // 105
  "shamisen",                // 106
  "koto",                    // 107
  "kalimba",                 // 108
  "bagpipe",                 // 109
  "fiddle",                  // 110
  "shanai",                  // 111
  "tinkle_bell",             // 112
  "agogo",                   // 113
  "steel_drums",             // 114
  "woodblock",               // 115
  "taiko_drum",              // 116
  "melodic_tom",             // 117
  "synth_drum",              // 118
  "reverse_cymbal",          // 119
  "guitar_fret_noise",       // 120
  "breath_noise",            // 121
  "seashore",                // 122
  "bird_tweet",              // 123
  "telephone_ring",          // 124
  "helicopter",              // 125
  "applause",                // 126
  "gunshot",                 // 127
]);

/** CDN base URL for FluidR3_GM MP3 soundfonts (gleitz/midi-js-soundfonts). */
export const FLUID_R3_CDN_BASE =
  "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/";

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
        realtimeAvailability: "available" as const,
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

export function getMelodyInstrument(id: MelodyInstrumentId | "piano"): MelodyInstrumentCatalogEntry {
  const effectiveId = id === "piano" ? "gm-000" : id;
  const entry = MELODY_INSTRUMENT_BY_ID.get(effectiveId as MelodyInstrumentId);
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
