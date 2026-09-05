import type { AudioProviderState } from "../../audio/contracts";

export interface PianoAudioStatusProps {
  readonly state: AudioProviderState;
}

export function PianoAudioStatus({ state }: PianoAudioStatusProps) {
  const getLabel = (s: AudioProviderState): string => {
    switch (s) {
      case "loading":
        return "Loading HQ Piano...";
      case "ready":
        return "HQ Piano Ready";
      case "fallback":
        return "Audio Fallback";
      case "error":
        return "Audio Unavailable";
      case "idle":
      default:
        return "Piano Audio Idle";
    }
  };

  return (
    <div
      className={`piano-audio-status is-${state}`}
      data-testid="piano-audio-status"
      data-status={state}
      aria-label={`Piano Audio: ${getLabel(state)}`}
    >
      <span className={`audio-status-dot dot-${state}`} aria-hidden="true" />
      <span className="audio-status-label">Piano Audio: {getLabel(state)}</span>
    </div>
  );
}
