import { describe, expect, it } from "vitest";
import { applyInverseCommand } from "../../../src/app/commands/dispatcher";
import {
  HarmonyCommandError,
  setHarmonyTrackSettings,
  type SetHarmonyTrackSettingsCommand,
} from "../../../src/app/commands/harmonyCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { HarmonyTrackValidationError } from "../../../src/domain/harmony/track";

const T0 = "2026-09-11T12:00:00.000Z";
const T1 = "2026-09-11T12:01:00.000Z";

describe("Harmony Track commands", () => {
  it("updates volume and restores the exact previous state through undo", () => {
    const initial = createDefaultProject("harmony-command", "Harmony Commands", T0);
    const command: SetHarmonyTrackSettingsCommand = {
      type: "harmony/set-track-settings",
      payload: { patch: { volume: 64 }, nowIso: T1 },
    };

    const applied = setHarmonyTrackSettings(initial, command);

    expect(applied.project.harmonyTrack).toEqual({
      instrument: "piano",
      muted: false,
      solo: false,
      volume: 64,
    });
    expect(applied.project.updatedAt).toBe(T1);
    expect(applyInverseCommand(applied.project, applied.inverse)).toEqual(initial);
  });

  it("keeps Mute and Solo mutually exclusive for interactive patches", () => {
    const initial = createDefaultProject("harmony-command", "Harmony Commands", T0);
    const muted = setHarmonyTrackSettings(initial, {
      type: "harmony/set-track-settings",
      payload: { patch: { muted: true }, nowIso: T1 },
    }).project;
    const soloed = setHarmonyTrackSettings(muted, {
      type: "harmony/set-track-settings",
      payload: { patch: { solo: true }, nowIso: T1 },
    }).project;

    expect(soloed.harmonyTrack).toEqual({
      instrument: "piano",
      muted: false,
      solo: true,
      volume: 100,
    });
  });

  it("updates instrument to any GM instrument and restores through undo", () => {
    const initial = createDefaultProject("harmony-command", "Harmony Commands", T0);
    const command: SetHarmonyTrackSettingsCommand = {
      type: "harmony/set-track-settings",
      payload: { patch: { instrument: "gm-024" }, nowIso: T1 },
    };

    const applied = setHarmonyTrackSettings(initial, command);

    expect(applied.project.harmonyTrack).toEqual({
      instrument: "gm-024",
      muted: false,
      solo: false,
      volume: 100,
    });
    expect(applyInverseCommand(applied.project, applied.inverse)).toEqual(initial);
  });

  it("updates audio engine settings and restores through undo", () => {
    const initial = createDefaultProject("harmony-command", "Harmony Commands", T0);
    const command: SetHarmonyTrackSettingsCommand = {
      type: "harmony/set-track-settings",
      payload: {
        patch: {
          pianoEngine: "soundfont",
          guitarEngine: "soundfont",
          guitarSoundfontInstrument: "gm-026",
        },
        nowIso: T1,
      },
    };

    const applied = setHarmonyTrackSettings(initial, command);

    expect(applied.project.harmonyTrack).toEqual({
      instrument: "piano",
      muted: false,
      solo: false,
      volume: 100,
      pianoEngine: "soundfont",
      guitarEngine: "soundfont",
      guitarSoundfontInstrument: "gm-026",
    });
    expect(applyInverseCommand(applied.project, applied.inverse)).toEqual(initial);
  });

  it("rejects unsupported instruments and contradictory settings", () => {
    const initial = createDefaultProject("harmony-command", "Harmony Commands", T0);

    expect(() =>
      setHarmonyTrackSettings(initial, {
        type: "harmony/set-track-settings",
        payload: { patch: { instrument: "unsupported-instrument" as never }, nowIso: T1 },
      }),
    ).toThrow(HarmonyTrackValidationError);

    expect(() =>
      setHarmonyTrackSettings(initial, {
        type: "harmony/set-track-settings",
        payload: { patch: { pianoEngine: "invalid-engine" as never }, nowIso: T1 },
      }),
    ).toThrow(HarmonyTrackValidationError);

    expect(() =>
      setHarmonyTrackSettings(initial, {
        type: "harmony/set-track-settings",
        payload: { patch: { guitarSoundfontInstrument: "not-gm" as never }, nowIso: T1 },
      }),
    ).toThrow(HarmonyTrackValidationError);

    expect(() =>
      setHarmonyTrackSettings(initial, {
        type: "harmony/set-track-settings",
        payload: { patch: { muted: true, solo: true }, nowIso: T1 },
      }),
    ).toThrow(HarmonyCommandError);
  });
});
