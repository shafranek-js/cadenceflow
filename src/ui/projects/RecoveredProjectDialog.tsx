import type { PortableProjectDecodeResult } from "../../persistence/portableProject";
import { useModalFocus } from "../common/useModalFocus";

export interface RecoveredProjectDialogProps {
  readonly result: PortableProjectDecodeResult;
  readonly onDecision: (open: boolean) => void;
}

export function RecoveredProjectDialog({ result, onDecision }: RecoveredProjectDialogProps) {
  const close = () => onDecision(false);
  const dialogRef = useModalFocus<HTMLElement>({ isOpen: true, onClose: close });
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className="project-dialog"
        style={{ maxHeight: "calc(100dvh - 24px)", display: "flex", flexDirection: "column" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovered-project-title"
        aria-describedby="recovered-project-description"
      >
        <header className="dialog-header">
          <h2 id="recovered-project-title">Recovered project</h2>
          <button
            type="button"
            className="dialog-close-btn"
            aria-label="Cancel recovered project"
            onClick={close}
          >
            X
          </button>
        </header>
        <div
          className="dialog-body"
          style={{ minHeight: 0, overflowY: "auto", overflowWrap: "anywhere" }}
        >
          <p id="recovered-project-description">
            Some fields in {result.project.name} could not be read and were removed. The saved
            version stays unchanged until you open this recovery. Review the losses before
            continuing.
          </p>
          <ul>
            {result.diagnostics.map((diagnostic, index) => (
              <li key={index}>
                <strong>
                  {diagnostic.path}.{diagnostic.field}
                </strong>
                : {diagnostic.reason}
              </li>
            ))}
          </ul>
        </div>
        <footer className="dialog-actions">
          <button type="button" className="secondary-btn" onClick={close}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={() => onDecision(true)}>
            Open recovered project
          </button>
        </footer>
      </section>
    </div>
  );
}
