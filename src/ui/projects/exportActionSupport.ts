import type { Project } from "../../domain/project/project";
import { projectProgressionToMidi } from "../../export/midi/eventProjection";
import { writeStandardMidiFile } from "../../export/midi/writer";
import {
  MusicXmlExportError,
  projectProjectToMusicXml,
  type MusicXmlProjection,
} from "../../export/musicxml/projection";
import { writeMusicXmlFile, MusicXmlWriterError } from "../../export/musicxml/writer";

export const EMPTY_PROGRESSION_EXPORT_MESSAGE =
  "Add musical content to My Progression before exporting.";

const MIDI_MIME_TYPE = "audio/midi";
const MUSICXML_MIME_TYPE = "application/vnd.recordare.musicxml+xml";
const WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const DOWNLOAD_URL_REVOKE_DELAY_MS = 1_000;

export interface BrowserExportFile {
  readonly filename: string;
  readonly mimeType: string;
  readonly data: Uint8Array;
}

export interface MusicXmlBrowserExportFile extends BrowserExportFile {
  readonly diagnostics: MusicXmlProjection["diagnostics"];
}

export type ExportErrorCode =
  | "empty-progression"
  | "invalid-tempo"
  | "duration-divisions-overflow"
  | "invalid-projection"
  | "download-unavailable";

export class ExportActionError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = "ExportActionError";
    this.code = code;
  }
}

export function sanitizeExportBaseName(rawName: string): string {
  const withoutControls = [...rawName]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");
  const sanitized = withoutControls
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  const meaningful = sanitized.replace(/[. -]/g, "");
  if (!meaningful || sanitized === "." || sanitized === "..") return "CadenceFlow";
  const windowsDeviceStem = (sanitized.split(".", 1)[0] ?? "").trimEnd();
  if (WINDOWS_RESERVED_BASENAME.test(windowsDeviceStem)) return `CadenceFlow-${sanitized}`;
  return sanitized;
}

function filenameForProject(projectName: string, extension: "mid" | "musicxml"): string {
  return `${sanitizeExportBaseName(projectName)}.${extension}`;
}

function requireExportableProgression(project: Project): void {
  if (project.progression.steps.length === 0) {
    throw new ExportActionError("empty-progression", EMPTY_PROGRESSION_EXPORT_MESSAGE);
  }
}

export function createMidiExportFile(project: Project): BrowserExportFile {
  requireExportableProgression(project);
  return Object.freeze({
    filename: filenameForProject(project.name, "mid"),
    mimeType: MIDI_MIME_TYPE,
    data: writeStandardMidiFile(projectProgressionToMidi(project)),
  });
}

export function createMusicXmlExportFile(project: Project): MusicXmlBrowserExportFile {
  requireExportableProgression(project);
  const projection = projectProjectToMusicXml(project);
  return Object.freeze({
    filename: filenameForProject(project.name, "musicxml"),
    mimeType: MUSICXML_MIME_TYPE,
    data: writeMusicXmlFile(projection),
    diagnostics: projection.diagnostics,
  });
}

export function downloadBrowserExport(file: BrowserExportFile): void {
  if (typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") {
    throw new ExportActionError(
      "download-unavailable",
      "This browser cannot download exported musical files.",
    );
  }

  const url = URL.createObjectURL(
    new Blob([file.data as unknown as BlobPart], { type: file.mimeType }),
  );
  const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.setAttribute("aria-hidden", "true");
  link.style.display = "none";
  document.body.appendChild(link);
  let downloadStarted = false;
  try {
    link.click();
    downloadStarted = true;
  } finally {
    link.remove();
    if (downloadStarted) {
      globalThis.setTimeout(() => revokeObjectUrl(url), DOWNLOAD_URL_REVOKE_DELAY_MS);
    } else {
      revokeObjectUrl(url);
    }
  }
}

const DIAGNOSTIC_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  "groove-omitted": "Swing is written as straight durations",
  "humanized-timing-omitted": "humanized timing is not written",
  "broken-chord-timing-omitted": "broken-chord timing is not written",
  "per-note-velocity-omitted": "per-note velocity differences are omitted",
  "temporary-branch-omitted": "the temporary branch is excluded",
  "unsupported-harmony-variant": "some harmony detail is omitted",
  "unsupported-articulation": "some articulation detail is omitted",
});

export function summarizeMusicXmlDiagnostics(
  diagnostics: MusicXmlProjection["diagnostics"],
): string | null {
  const messages = [
    ...new Set(
      diagnostics
        .filter((diagnostic) => diagnostic.severity !== "info")
        .map((diagnostic) => DIAGNOSTIC_MESSAGES[diagnostic.code] ?? diagnostic.message),
    ),
  ];
  return messages.length > 0 ? `Notation omissions: ${messages.join("; ")}.` : null;
}

function errorCode(error: unknown): ExportErrorCode | undefined {
  if (error instanceof ExportActionError) return error.code;
  if (error instanceof MusicXmlExportError) return error.code;
  if (error instanceof MusicXmlWriterError) return error.code;
  return undefined;
}

export function formatExportError(format: "MIDI" | "MusicXML", error: unknown): string {
  const code = errorCode(error);
  if (code === "empty-progression") return EMPTY_PROGRESSION_EXPORT_MESSAGE;
  if (code === "invalid-tempo") return `${format} export needs a positive project tempo.`;
  if (code === "duration-divisions-overflow") {
    return "MusicXML export cannot represent one of the saved durations exactly.";
  }
  if (code === "download-unavailable")
    return "This browser cannot download exported musical files.";
  if (code === "invalid-projection")
    return `${format} export could not create a valid musical file.`;
  return `Could not export ${format}. Please correct the project and try again.`;
}
