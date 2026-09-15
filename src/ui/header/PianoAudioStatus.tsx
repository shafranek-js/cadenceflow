import type { AudioProviderState } from "../../audio/contracts";

export interface PianoAudioStatusProps {
  readonly state: AudioProviderState;
  readonly instrument?: "piano" | "guitar";
}

export function PianoAudioStatus({ state, instrument = "piano" }: PianoAudioStatusProps) {
  const isGuitar = instrument === "guitar";

  const getLabel = (s: AudioProviderState): string => {
    if (isGuitar) {
      switch (s) {
        case "loading":
          return "Loading HQ Guitar...";
        case "ready":
          return "HQ Guitar Ready";
        case "fallback":
          return "Guitar Fallback";
        case "error":
          return "Guitar Unavailable";
        case "idle":
        default:
          return "Guitar Audio Idle";
      }
    }

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

  const titlePrefix = isGuitar ? "Guitar Audio" : "Piano Audio";

  return (
    <div
      className={`piano-audio-status is-${state}`}
      data-testid="piano-audio-status"
      data-status={state}
      data-instrument={instrument}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${titlePrefix}: ${getLabel(state)}`}
    >
      <span className={`audio-status-dot dot-${state}`} aria-hidden="true" />
      <span className="audio-status-label">
        {titlePrefix}: {getLabel(state)}
      </span>
    </div>
  );
}
