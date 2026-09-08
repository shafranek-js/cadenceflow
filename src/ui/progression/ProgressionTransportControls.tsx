import type { TransportState } from "../transport/transportStore";

export interface ProgressionTransportControlsProps {
  readonly selectedStepId?: string | undefined;
  readonly transportState: TransportState;
  readonly onPlay: () => void;
  readonly onPlayFromHere: (stepId: string) => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
}

/**
 * Playback controls owned by My Progression.
 *
 * The callbacks and transport state are still supplied by App, so moving the
 * controls changes their ownership and layout without introducing a second
 * playback state machine.
 */
export function ProgressionTransportControls({
  selectedStepId,
  transportState,
  onPlay,
  onPlayFromHere,
  onPause,
  onResume,
  onStop,
}: ProgressionTransportControlsProps) {
  const isPlaying = transportState.status === "playing";
  const isPaused = transportState.status === "paused";
  const isStopped = transportState.status === "stopped";

  return (
    <div
      className="progression-transport-controls"
      role="group"
      aria-label="Progression playback controls"
    >
      <button
        type="button"
        className="transport-button transport-play"
        onClick={onPlay}
        disabled={isPlaying}
        aria-label="Play"
        title="Play progression"
      >
        <span className="transport-btn-icon" aria-hidden="true">
          ▶
        </span>
        <span className="transport-btn-label">Play</span>
      </button>

      <button
        type="button"
        className="transport-button transport-play-from-here"
        onClick={() => selectedStepId && onPlayFromHere(selectedStepId)}
        disabled={isPlaying || !selectedStepId}
        aria-label="Play From Here"
        title={selectedStepId ? "Play from selected step" : "Select a step to play from here"}
      >
        <span className="transport-btn-icon" aria-hidden="true">
          ⏩
        </span>
        <span className="transport-btn-label">From Here</span>
      </button>

      <button
        type="button"
        className="transport-button transport-pause"
        onClick={onPause}
        disabled={!isPlaying}
        aria-label="Pause"
        title="Pause playback"
      >
        <span className="transport-btn-icon" aria-hidden="true">
          ⏸
        </span>
        <span className="transport-btn-label">Pause</span>
      </button>

      <button
        type="button"
        className="transport-button transport-resume"
        onClick={onResume}
        disabled={!isPaused}
        aria-label="Resume"
        title="Resume playback"
      >
        <span className="transport-btn-icon" aria-hidden="true">
          ⏯
        </span>
        <span className="transport-btn-label">Resume</span>
      </button>

      <button
        type="button"
        className="transport-button transport-stop"
        onClick={onStop}
        disabled={isStopped}
        aria-label="Stop"
        title="Stop playback"
      >
        <span className="transport-btn-icon" aria-hidden="true">
          ⏹
        </span>
        <span className="transport-btn-label">Stop</span>
      </button>

      <div
        role="status"
        aria-live="polite"
        className={`transport-status-badge status-${transportState.status}`}
        data-testid="transport-status"
      >
        <span className="status-dot" aria-hidden="true" />
        <span className="status-text">
          {transportState.status === "playing"
            ? `Playing${transportState.currentStepIndex !== null ? ` (Step ${transportState.currentStepIndex + 1})` : ""}`
            : transportState.status === "paused"
              ? "Paused"
              : "Stopped"}
        </span>
      </div>

      {transportState.error && (
        <div role="alert" className="transport-error-badge" data-testid="transport-error">
          {transportState.error}
        </div>
      )}
    </div>
  );
}
