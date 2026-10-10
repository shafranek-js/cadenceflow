import { useEffect, useState, useSyncExternalStore } from "react";
import type { TransportStore } from "../transport/transportStore";
import type { PlaybackFollowCoordinator } from "../transport/playbackFollowCoordinator";
import { Icon } from "../common/Icon";

export interface ProgressionTransportControlsProps {
  readonly selectedStepId?: string | undefined;
  readonly transportStore: TransportStore;
  readonly playbackFollowCoordinator: PlaybackFollowCoordinator;
  readonly onPlay: () => void;
  readonly onPlayFromHere: (stepId: string) => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
  readonly canRewind: boolean;
  readonly onStopAndRewind: () => void;
}

/**
 * Playback controls owned by the application header.
 *
 * The callbacks and transport state are still supplied by App, so moving the
 * controls changes their ownership and layout without introducing a second
 * playback state machine.
 */
export function ProgressionTransportControls({
  selectedStepId,
  transportStore,
  playbackFollowCoordinator,
  onPlay,
  onPlayFromHere,
  onPause,
  onResume,
  onStop,
  canRewind,
  onStopAndRewind,
}: ProgressionTransportControlsProps) {
  const [transportState, setTransportState] = useState(() => transportStore.getState());
  useEffect(
    () =>
      transportStore.subscribe(() => {
        const next = transportStore.getState();
        setTransportState((current) => (current === next ? current : next));
      }),
    [transportStore],
  );
  const isPlaying = transportState.status === "playing";
  const isPaused = transportState.status === "paused";
  const isStopped = transportState.status === "stopped";
  const isFollowingPlayback = useSyncExternalStore(
    playbackFollowCoordinator.subscribe,
    playbackFollowCoordinator.getSnapshot,
    playbackFollowCoordinator.getSnapshot,
  );

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
          <Icon name="play" />
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
          <Icon name="from-here" />
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
          <Icon name="pause" />
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
          <Icon name="resume" />
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
          <Icon name="stop" />
        </span>
        <span className="transport-btn-label">Stop</span>
      </button>

      <button
        type="button"
        className="transport-button transport-stop-rewind"
        onClick={onStopAndRewind}
        disabled={!canRewind}
        aria-label="Stop and rewind to start"
        title="Stop and rewind to start"
      >
        <span className="transport-btn-icon transport-stop-rewind-icons" aria-hidden="true">
          <Icon name="stop" />
          <Icon name="move-left" />
        </span>
        <span className="transport-btn-label">Stop and rewind to start</span>
      </button>

      {!isStopped && !isFollowingPlayback ? (
        <button
          type="button"
          className="transport-button transport-follow-resume"
          onClick={() => playbackFollowCoordinator.resume()}
          aria-label="Resume follow"
          title="Center the playback cursor and resume automatic follow"
        >
          <span className="transport-btn-label">Resume follow</span>
        </button>
      ) : null}

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
