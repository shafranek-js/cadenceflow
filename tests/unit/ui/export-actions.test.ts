// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import type { RestStep } from "../../../src/domain/progression/step";
import {
  EMPTY_PROGRESSION_EXPORT_MESSAGE,
  ExportActionError,
  createMidiExportFile,
  createMusicXmlExportFile,
  downloadBrowserExport,
  formatExportError,
  sanitizeExportBaseName,
  summarizeMusicXmlDiagnostics,
} from "../../../src/ui/projects/exportActionSupport";

function restOnlyProject() {
  const base = createDefaultProject("rest-only", "Rest Only");
  const rest: RestStep = {
    id: "rest-1",
    kind: "rest",
    duration: musicalDuration(rational(1, 2)),
  };
  return Object.freeze({
    ...base,
    progression: Object.freeze({ ...base.progression, steps: Object.freeze([rest]) }),
  });
}

describe("T138 — export actions", () => {
  it("sanitizes Windows filename characters and uses a fallback for empty names", () => {
    expect(sanitizeExportBaseName("Session: / take?*")).toBe("Session- - take--");
    expect(sanitizeExportBaseName("...   ")).toBe("CadenceFlow");
    expect(sanitizeExportBaseName("CON")).toBe("CadenceFlow-CON");
  });

  it("keeps Rest-only progression exportable while blocking an empty progression", () => {
    const restOnly = restOnlyProject();
    expect(createMidiExportFile(restOnly)).toMatchObject({
      filename: "Rest Only.mid",
      mimeType: "audio/midi",
    });
    expect(createMusicXmlExportFile(restOnly)).toMatchObject({
      filename: "Rest Only.musicxml",
      mimeType: "application/vnd.recordare.musicxml+xml",
    });

    const empty = createDefaultProject("empty", "Empty");
    expect(() => createMidiExportFile(empty)).toThrow(ExportActionError);
    expect(() => createMusicXmlExportFile(empty)).toThrow(ExportActionError);
    expect(formatExportError("MIDI", new ExportActionError("empty-progression", "internal"))).toBe(
      EMPTY_PROGRESSION_EXPORT_MESSAGE,
    );
  });

  it("downloads bytes with the format MIME and always releases the Blob URL", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    try {
      downloadBrowserExport({
        filename: "Take.mid",
        mimeType: "audio/midi",
        data: Uint8Array.from([0x4d, 0x54]),
      });
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      click.mockRestore();
    }
  });

  it("shows only actionable MusicXML omissions, excluding informational UI state", () => {
    expect(
      summarizeMusicXmlDiagnostics([
        { code: "presentation-state-omitted", severity: "info", message: "hidden" },
        { code: "groove-omitted", severity: "warning", message: "swing" },
        { code: "per-note-velocity-omitted", severity: "warning", message: "velocity" },
        { code: "groove-omitted", severity: "warning", message: "duplicate" },
      ]),
    ).toBe(
      "Notation omissions: Swing is written as straight durations; per-note velocity differences are omitted.",
    );
  });
});
