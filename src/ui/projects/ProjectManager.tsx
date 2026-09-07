import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Project } from "../../domain/project/project";
import { MAX_PROJECT_NAME_LENGTH, normalizeProjectName } from "../../domain/project/name";
import type { ProjectMetadata } from "../../persistence/projectRepository";
import { useModalFocus } from "../common/useModalFocus";

export interface ProjectManagerProps {
  readonly project: Pick<Project, "id" | "name">;
  readonly projects: readonly ProjectMetadata[];
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly onNewProject: (name: string) => void | Promise<void>;
  readonly onOpenProject: (id: string) => void | Promise<void>;
  readonly onRenameProject: (name: string) => void | Promise<void>;
  readonly onDeleteProject: (id: string) => void | Promise<void>;
  readonly children?: ReactNode;
}

type NameDialogMode = "new" | "rename" | null;

export function ProjectManager({
  project,
  projects,
  busy = false,
  error = null,
  onNewProject,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  children,
}: ProjectManagerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [nameDialogMode, setNameDialogMode] = useState<NameDialogMode>(null);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectMetadata | null>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const nameDialogRef = useModalFocus<HTMLElement>({
    isOpen: nameDialogMode !== null,
    onClose: () => setNameDialogMode(null),
    initialFocusRef: nameInputRef,
    restoreFocusRef: menuToggleRef,
  });
  const deleteDialogRef = useModalFocus<HTMLElement>({
    isOpen: deleteTarget !== null,
    onClose: () => setDeleteTarget(null),
    restoreFocusRef: menuToggleRef,
  });

  useEffect(() => {
    if (nameDialogMode) {
      setName(nameDialogMode === "rename" ? project.name : "");
      setNameTouched(false);
      setSubmissionError(null);
    }
  }, [nameDialogMode, project.name]);

  const nameError = (() => {
    if (submissionError) return submissionError;
    if (!nameTouched) return null;
    try {
      normalizeProjectName(name);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Enter a valid project name.";
    }
  })();

  const submitName = (event: FormEvent) => {
    event.preventDefault();
    setNameTouched(true);
    let normalized: string;
    try {
      normalized = normalizeProjectName(name);
    } catch {
      return;
    }

    const action = nameDialogMode === "new" ? onNewProject : onRenameProject;
    void Promise.resolve(action(normalized))
      .then(() => setNameDialogMode(null))
      .catch((error: unknown) => {
        setNameTouched(true);
        setSubmissionError(
          error instanceof Error ? error.message : "Could not update the project.",
        );
      });
  };

  const openProject = (id: string) => {
    setMenuOpen(false);
    void Promise.resolve(onOpenProject(id)).catch(() => setMenuOpen(true));
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setMenuOpen(false);
    void Promise.resolve(onDeleteProject(id)).catch(() => {
      // The application-level error is rendered below the project selector.
    });
  };

  return (
    <section className="project-manager" aria-label="Project">
      <button
        ref={menuToggleRef}
        type="button"
        className="project-selector-button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Project: ${project.name}`}
        data-testid="project-menu-toggle"
        disabled={busy}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span>Project:</span> <strong>{project.name}</strong> <span aria-hidden="true">▾</span>
      </button>

      {menuOpen && (
        <div className="project-menu" role="menu" aria-label="Project actions">
          <div className="project-menu-current" data-testid="active-project-name">
            Active project: <strong>{project.name}</strong>
          </div>
          <label className="project-open-select-label" htmlFor="project-open-select">
            Open named project
          </label>
          <select
            id="project-open-select"
            className="text-input project-open-select"
            value=""
            disabled={busy || projects.length === 0}
            onChange={(event) => {
              if (event.target.value) openProject(event.target.value);
            }}
            data-testid="project-open-select"
          >
            <option value="">
              {projects.length === 0 ? "No saved projects" : "Choose a project…"}
            </option>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.id === project.id ? " (active)" : ""}
              </option>
            ))}
          </select>
          <div className="project-menu-actions">
            <button
              type="button"
              className="secondary-btn"
              role="menuitem"
              data-testid="new-project-btn"
              disabled={busy}
              onClick={() => {
                setMenuOpen(false);
                setNameDialogMode("new");
              }}
            >
              New Project
            </button>
            <button
              type="button"
              className="secondary-btn"
              role="menuitem"
              data-testid="rename-project-btn"
              disabled={busy}
              onClick={() => {
                setMenuOpen(false);
                setNameDialogMode("rename");
              }}
            >
              Rename Project…
            </button>
            <button
              type="button"
              className="danger-btn"
              role="menuitem"
              data-testid="delete-project-btn"
              disabled={busy}
              onClick={() => {
                const metadata =
                  projects.find((item) => item.id === project.id) ??
                  ({
                    id: project.id,
                    name: project.name,
                    createdAt: "",
                    updatedAt: "",
                    schemaVersion: 1,
                  } satisfies ProjectMetadata);
                setDeleteTarget(metadata);
              }}
            >
              Delete Project…
            </button>
          </div>
          {children}
        </div>
      )}

      {error ? (
        <p className="project-error" role="alert" data-testid="project-error">
          {error}
        </p>
      ) : null}

      {nameDialogMode !== null && (
        <div className="dialog-backdrop" role="presentation">
          <section
            ref={nameDialogRef}
            className="project-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-name-dialog-title"
          >
            <header className="dialog-header">
              <h2 id="project-name-dialog-title">
                {nameDialogMode === "new" ? "New Project" : "Rename Project"}
              </h2>
              <button
                type="button"
                className="dialog-close-btn"
                aria-label="Close project name dialog"
                onClick={() => setNameDialogMode(null)}
              >
                ×
              </button>
            </header>
            <form onSubmit={submitName}>
              <div className="dialog-body">
                <div className="form-group">
                  <label htmlFor="project-name-input">Project name</label>
                  <input
                    ref={nameInputRef}
                    id="project-name-input"
                    className={`text-input ${nameError ? "input-error" : ""}`}
                    value={name}
                    maxLength={MAX_PROJECT_NAME_LENGTH}
                    autoFocus
                    aria-invalid={Boolean(nameError)}
                    aria-describedby={nameError ? "project-name-error" : undefined}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameTouched(true);
                      setSubmissionError(null);
                    }}
                    onBlur={() => setNameTouched(true)}
                    data-testid="project-name-input"
                  />
                  {nameError ? (
                    <p id="project-name-error" className="error-text" role="alert">
                      {nameError}
                    </p>
                  ) : null}
                </div>
              </div>
              <footer className="dialog-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setNameDialogMode(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={busy}>
                  {nameDialogMode === "new" ? "Create Project" : "Rename Project"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {deleteTarget !== null && (
        <div className="dialog-backdrop" role="presentation">
          <section
            ref={deleteDialogRef}
            className="project-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-dialog-title"
          >
            <header className="dialog-header">
              <h2 id="delete-project-dialog-title">Delete Project?</h2>
              <button
                type="button"
                className="dialog-close-btn"
                aria-label="Close delete project dialog"
                onClick={() => setDeleteTarget(null)}
              >
                ×
              </button>
            </header>
            <div className="dialog-body">
              <p>
                Delete <strong>{deleteTarget.name}</strong>? This removes the saved project and
                cannot be undone from the session history.
              </p>
            </div>
            <footer className="dialog-actions">
              <button type="button" className="secondary-btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger-btn"
                disabled={busy}
                data-testid="confirm-delete-project-btn"
                onClick={confirmDelete}
              >
                Delete Project
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
