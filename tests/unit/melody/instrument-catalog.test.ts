import { describe, expect, it } from "vitest";
import {
  MELODY_INSTRUMENT_CATALOG,
  MELODY_INSTRUMENT_BY_ID,
  getMelodyInstrument,
  resolveEffectiveMelodyInstrument,
  validateMelodyInstrumentCatalog,
} from "../../../src/domain/melody/instrumentCatalog";

describe("T188 canonical Melody instrument catalog", () => {
  it("contains every General MIDI program exactly once and freezes its metadata", () => {
    expect(MELODY_INSTRUMENT_CATALOG).toHaveLength(128);
    expect(new Set(MELODY_INSTRUMENT_CATALOG.map((entry) => entry.program)).size).toBe(128);
    expect(MELODY_INSTRUMENT_CATALOG.map((entry) => entry.program)).toEqual(
      Array.from({ length: 128 }, (_, program) => program),
    );
    expect(
      MELODY_INSTRUMENT_CATALOG.filter((entry) => entry.realtimeAvailability === "available").map(
        (entry) => entry.id,
      ),
    ).toEqual(["violin", "cello", "oboe", "clarinet", "flute", "synth-lead"]);
    expect(MELODY_INSTRUMENT_CATALOG.every((entry) => Object.isFrozen(entry))).toBe(true);
    expect(validateMelodyInstrumentCatalog()).toBe(MELODY_INSTRUMENT_CATALOG);
  });

  it("resolves a Step override without changing the global default", () => {
    expect(resolveEffectiveMelodyInstrument(undefined, "flute").id).toBe("flute");
    expect(resolveEffectiveMelodyInstrument("gm-081", "flute")).toMatchObject({
      id: "gm-081",
      program: 81,
      realtimeAvailability: "export-only",
      family: "Synth Lead",
    });
    expect(getMelodyInstrument("cello").clef).toBe("bass");
    expect(MELODY_INSTRUMENT_BY_ID.size).toBe(128);
  });
});
