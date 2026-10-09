import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

/**
 * Error boundary for the studio surfaces.
 *
 * Regression context: `src/` contained no `ErrorBoundary`, no `componentDidCatch` and no
 * `getDerivedStateFromError`, while `StrictMode` is enabled and at least one component throws
 * during render (`PianoPerformanceInspector` asserts a note-count invariant with
 * `throw new Error(...)`). A throw during render therefore unmounted the entire application and
 * left a blank page, with no way for the user to save the project they were working on.
 *
 * The fallback is deliberately recoverable: it offers a retry that re-renders the subtree
 * without discarding the rest of the studio state, plus the diagnostic text so a report is
 * actionable.
 */

export interface ErrorBoundaryProps {
  /** Identifies the failing surface in the fallback text and in the diagnostic dump. */
  readonly label: string;
  readonly children: ReactNode;
  /** Rendered instead of the built-in fallback when provided. */
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Notified once per caught error, e.g. to log or to surface a status message. */
  readonly onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
  /** Incremented by `reset`, so a retry remounts the subtree instead of reusing its state. */
  readonly attempt: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState((previous) => ({ error: null, attempt: previous.attempt + 1 }));
  };

  override render(): ReactNode {
    const { error, attempt } = this.state;
    if (!error) {
      // A keyed Fragment, not a wrapping element: this subtree is rendered directly inside
      // layout containers (`.app-shell`), so adding a DOM node would break their flex layout.
      // Changing the key on retry forces children to remount with fresh state.
      return <Fragment key={attempt}>{this.props.children}</Fragment>;
    }

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <section
        className="error-boundary-fallback"
        role="alert"
        aria-live="assertive"
        data-testid="error-boundary-fallback"
      >
        <h2>{this.props.label} could not be displayed</h2>
        <p>
          The rest of the studio is still available. Your project has not been changed by this
          error; retry the panel, or export the project before reloading if the problem continues.
        </p>
        <p className="error-boundary-detail" data-testid="error-boundary-detail">
          {error.message}
        </p>
        <div className="error-boundary-actions">
          <button type="button" onClick={this.reset} data-testid="error-boundary-retry">
            Retry panel
          </button>
        </div>
      </section>
    );
  }
}
