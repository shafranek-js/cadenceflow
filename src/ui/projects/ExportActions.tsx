import { useState } from "react";
import type { Project } from "../../domain/project/project";
import {
  EMPTY_PROGRESSION_EXPORT_MESSAGE,
  createMidiExportFile,
  createMusicXmlExportFile,
  downloadBrowserExport,
  formatExportError,
  summarizeMusicXmlDiagnostics,
} from "./exportActionSupport";

interface ExportStatus {
  readonly format: "MIDI" | "MusicXML";
  readonly tone: "success" | "error";
  readonly message: string;
}

export interface ExportActionsProps {
  readonly project: Project;
  readonly busy?: boolean;
}

export function ExportActions({ project, busy = false }: ExportActionsProps) {
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const hasProgression = project.progression.steps.length > 0;

  const exportMidi = () => {
    try {
      downloadBrowserExport(createMidiExportFile(project));
      setStatus({ format: "MIDI", tone: "success", message: "MIDI exported." });
    } catch (error) {
      setStatus({ format: "MIDI", tone: "error", message: formatExportError("MIDI", error) });
    }
  };

  const exportMusicXml = () => {
    try {
      const file = createMusicXmlExportFile(project);
      downloadBrowserExport(file);
      setStatus({
        format: "MusicXML",
        tone: "success",
        message: summarizeMusicXmlDiagnostics(file.diagnostics) ?? "MusicXML exported.",
      });
    } catch (error) {
      setStatus({
        format: "MusicXML",
        tone: "error",
        message: formatExportError("MusicXML", error),
      });
    }
  };

  return (
    <section className="project-export-actions" aria-label="Musical export actions">
      <p className="project-export-heading">Export musical file</p>
      <button
        type="button"
        className="secondary-btn"
        disabled={busy || !hasProgression}
        data-testid="export-midi-btn"
        onClick={exportMidi}
      >
        Export MIDI
      </button>
      <button
        type="button"
        className="secondary-btn"
        disabled={busy || !hasProgression}
        data-testid="export-musicxml-btn"
        onClick={exportMusicXml}
      >
        Export MusicXML
      </button>
      {!hasProgression ? (
        <p className="project-export-empty" role="status" data-testid="export-empty-message">
          {EMPTY_PROGRESSION_EXPORT_MESSAGE}
        </p>
      ) : null}
      {status ? (
        <p
          className={`project-export-status project-export-status-${status.tone}`}
          role={status.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          data-testid={`export-${status.format.toLowerCase()}-status`}
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
