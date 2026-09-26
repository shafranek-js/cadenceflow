import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import {
  setNoteColorMode,
  type SetNoteColorModeCommand,
} from "../../../src/app/commands/presentationCommands";
import { setHarmonyTrackSettings } from "../../../src/app/commands/harmonyCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";

describe("note color mode command", () => {
  it("applies one reversible presentation command without changing musical state", () => {
    const initial = createDefaultProject("note-color-mode");
    const store = new AppStore(initial);
    const command: SetNoteColorModeCommand = {
      type: "presentation/set-note-color-mode",
      payload: { mode: "harmonic-role", nowIso: "2026-09-22T10:00:00.000Z" },
    };

    store.dispatch(command, setNoteColorMode);

    expect(store.project.presentation.noteColorMode).toBe("harmonic-role");
    expect(store.history.undoDepth).toBe(1);
    expect(store.project.progression).toBe(initial.progression);
    expect(store.undo()).toBe(true);
    expect(store.project.presentation.noteColorMode).toBe("standard");
    expect(store.redo()).toBe(true);
    expect(store.project.presentation.noteColorMode).toBe("harmonic-role");
  });

  it("keeps the four engine and tone fields together in one undoable settings command", () => {
    const initial = createDefaultProject("audio-engines-command");
    const store = new AppStore(initial);

    store.dispatch(
      {
        type: "harmony/set-track-settings",
        payload: {
          patch: {
            pianoEngine: "soundfont",
            pianoSoundfontInstrument: "gm-004",
            guitarEngine: "soundfont",
            guitarSoundfontInstrument: "gm-026",
          },
          nowIso: "2026-09-22T10:00:00.000Z",
        },
      },
      setHarmonyTrackSettings,
    );

    expect(store.history.undoDepth).toBe(1);
    expect(store.project.harmonyTrack).toMatchObject({
      pianoEngine: "soundfont",
      pianoSoundfontInstrument: "gm-004",
      guitarEngine: "soundfont",
      guitarSoundfontInstrument: "gm-026",
    });
    expect(store.undo()).toBe(true);
    expect(store.project.harmonyTrack).toEqual(initial.harmonyTrack);
    expect(store.redo()).toBe(true);
    expect(store.project.harmonyTrack.pianoSoundfontInstrument).toBe("gm-004");
    expect(store.project.harmonyTrack.guitarSoundfontInstrument).toBe("gm-026");
  });
});
