import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Project } from "../../domain/project/project";
import { normalizeProjectName } from "../../domain/project/name";
import type { PortableProjectExport } from "../../app/projectController";
import { useModalFocus } from "../common/useModalFocus";
import { ExportActions } from "./ExportActions";
import { Icon } from "../common/Icon";

export interface PortableProjectActionsProps {
  readonly project: Project;
  readonly busy?: boolean;
  readonly onSaveProjectAs: (name: string) => void | Promise<void>;
  readonly onExport: () => PortableProjectExport;
  readonly onOpenProjectFile: (text: string) => void | Promise<void>;
}

function downloadPortableProject(exported: PortableProjectExport): void {
  const createObjectUrl = URL.createObjectURL;
  if (typeof createObjectUrl !== "function") {
    throw new Error("This browser cannot download portable project files.");
  }

  const url = createObjectUrl.call(URL, new Blob([exported.text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = exported.filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PortableProjectActions({
  project,
  busy = false,
  onSaveProjectAs,
  onExport,
  onOpenProjectFile,
}: PortableProjectActionsProps) {
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useModalFocus<HTMLElement>({
    isOpen: saveAsOpen,
    onClose: () => setSaveAsOpen(false),
    initialFocusRef: inputRef,
  });

  const submitSaveAs = (event: FormEvent) => {
    event.preventDefault();
    try {
      const normalized = normalizeProjectName(name);
      void Promise.resolve(onSaveProjectAs(normalized))
        .then(() => setSaveAsOpen(false))
        .catch((error: unknown) =>
          setNameError(error instanceof Error ? error.message : "Could not save the project."),
        );
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "Enter a valid project name.");
    }
  };

  const handleExport = () => {
    try {
      downloadPortableProject(onExport());
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not export the project.");
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await onOpenProjectFile(await file.text());
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not open the project file.");
    }
  };

  return (
    <>
      <div className="project-portable-actions" role="group" aria-label="Portable project actions">
        <button
          type="button"
          className="secondary-btn"
          disabled={busy}
          data-testid="project-save-as-btn"
          onClick={() => {
            setName("");
            setNameError(null);
            setSaveAsOpen(true);
          }}
        >
          Save Project As…
        </button>
        <button
          type="button"
          className="secondary-btn"
          disabled={busy}
          data-testid="project-export-btn"
          onClick={handleExport}
        >
          Export Project…
        </button>
        <button
          type="button"
          className="secondary-btn"
          disabled={busy}
          data-testid="project-open-file-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          Open Project File…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".cadenceflow,application/json"
          className="project-file-input"
          aria-label="Choose a CadenceFlow project file"
          data-testid="project-file-input"
          onChange={(event) => void handleFileChange(event)}
        />
        <ExportActions project={project} busy={busy} />
      </div>
      {actionError ? (
        <p className="project-error" role="alert" data-testid="portable-project-error">
          {actionError}
        </p>
      ) : null}

      {saveAsOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            ref={dialogRef}
            className="project-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-project-as-title"
          >
            <header className="dialog-header">
              <h2 id="save-project-as-title">Save Project As</h2>
              <button
                type="button"
                className="dialog-close-btn"
                aria-label="Close Save Project As dialog"
                onClick={() => setSaveAsOpen(false)}
              >
                <Icon name="close" />
              </button>
            </header>
            <form onSubmit={submitSaveAs}>
              <div className="dialog-body">
                <p className="project-dialog-note">
                  Creates a new local project and leaves <strong>{project.name}</strong> unchanged.
                </p>
                <div className="form-group">
                  <label htmlFor="save-project-as-name">New project name</label>
                  <input
                    ref={inputRef}
                    id="save-project-as-name"
                    className={`text-input ${nameError ? "input-error" : ""}`}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameError(null);
                    }}
                    aria-invalid={Boolean(nameError)}
                    aria-describedby={nameError ? "save-project-as-error" : undefined}
                    data-testid="save-project-as-name"
                  />
                  {nameError ? (
                    <p id="save-project-as-error" className="error-text" role="alert">
                      {nameError}
                    </p>
                  ) : null}
                </div>
              </div>
              <footer className="dialog-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setSaveAsOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={busy}>
                  Save Project As
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
