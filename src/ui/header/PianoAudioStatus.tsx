import type { AudioProviderState } from "../../audio/contracts";
import type { AudioEngineType } from "../../domain/harmony/track";

export interface PianoAudioStatusProps {
  readonly state: AudioProviderState;
  readonly instrument?: "piano" | "guitar";
  readonly engine?: AudioEngineType;
}

export function PianoAudioStatus({
  state,
  instrument = "piano",
  engine = "hq-samples",
}: PianoAudioStatusProps) {
  const isGuitar = instrument === "guitar";
  const isSoundFont = engine === "soundfont";

  const getLabel = (s: AudioProviderState): string => {
    if (isGuitar) {
      const typeStr = isSoundFont ? "SoundFont Guitar" : "HQ Guitar";
      switch (s) {
        case "loading":
          return `Loading ${typeStr}...`;
        case "ready":
          return `${typeStr} Ready`;
        case "fallback":
          return "Guitar Fallback";
        case "error":
          return "Guitar Unavailable";
        case "idle":
        default:
          return "Guitar Audio Idle";
      }
    }

    const typeStr = isSoundFont ? "SoundFont Piano" : "HQ Piano";
    switch (s) {
      case "loading":
        return `Loading ${typeStr}...`;
      case "ready":
        return `${typeStr} Ready`;
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
      data-engine={engine}
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
