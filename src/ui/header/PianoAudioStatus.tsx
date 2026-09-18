import { useState, useRef, useEffect } from "react";
import type { AudioProviderState } from "../../audio/contracts";
import type { AudioEngineType, HarmonyTrackSettings } from "../../domain/harmony/track";
import type { MelodyInstrumentId } from "../../domain/melody/instrumentCatalog";
import { GUITAR_SOUNDFONT_OPTIONS, PIANO_SOUNDFONT_OPTIONS } from "../harmony/HarmonyTrackControls";
import { Icon } from "../common/Icon";

export interface PianoAudioStatusProps {
  readonly state: AudioProviderState;
  readonly instrument?: "piano" | "guitar";
  readonly engine?: AudioEngineType;
  readonly guitarSoundfontInstrument?: MelodyInstrumentId;
  readonly pianoSoundfontInstrument?: MelodyInstrumentId;
  readonly onSettingsChange?: (patch: Partial<HarmonyTrackSettings>) => void;
  readonly onRetry?: () => void;
  readonly hasActiveMelody?: boolean;
  readonly melodyState?: AudioProviderState;
  readonly melodyNotice?: string | null;
}

export function PianoAudioStatus({
  state,
  instrument = "piano",
  engine = "hq-samples",
  guitarSoundfontInstrument = "gm-025",
  pianoSoundfontInstrument = "gm-000",
  onSettingsChange,
  onRetry,
}: PianoAudioStatusProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isGuitar = instrument === "guitar";
  const isSoundFont = engine === "soundfont";

  // Close popover on click outside or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

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
  const isInteractive = Boolean(onSettingsChange);

  return (
    <div
      ref={containerRef}
      className={`piano-audio-status-container ${isInteractive ? "is-interactive" : ""}`}
    >
      <div
        className={`piano-audio-status is-${state} ${isInteractive ? "is-clickable" : ""}`}
        data-testid="piano-audio-status"
        data-status={state}
        data-instrument={instrument}
        data-engine={engine}
        role={isInteractive ? "button" : "status"}
        tabIndex={isInteractive ? 0 : undefined}
        aria-haspopup={isInteractive ? "dialog" : undefined}
        aria-expanded={isInteractive ? isOpen : undefined}
        aria-live="polite"
        aria-atomic="true"
        aria-label={`${titlePrefix}: ${getLabel(state)}${isInteractive ? " (click to switch audio engines)" : ""}`}
        onClick={isInteractive ? () => setIsOpen((prev) => !prev) : undefined}
        onKeyDown={
          isInteractive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsOpen((prev) => !prev);
                }
              }
            : undefined
        }
      >
        <span className={`audio-status-dot dot-${state}`} aria-hidden="true" />
        <span className="audio-status-label">
          {titlePrefix}: {getLabel(state)}
        </span>
        {isInteractive ? (
          <span className="audio-status-chevron" aria-hidden="true">
            <Icon name="disclosure" className={isOpen ? "is-rotated" : ""} />
          </span>
        ) : null}
      </div>

      {isInteractive && isOpen ? (
        <div
          className="audio-status-popover"
          role="dialog"
          aria-label="Audio Engine Quick Switch"
          data-testid="audio-status-popover"
        >
          <div className="audio-status-popover-header">
            <span className="audio-status-popover-title">Sound Engines</span>
            <button
              type="button"
              className="audio-status-popover-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close audio engine settings"
              data-testid="audio-status-popover-close-btn"
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="audio-status-popover-body">
            {/* Status indicator row */}
            <div className="audio-status-popover-status-row">
              <span className={`audio-status-dot dot-${state}`} aria-hidden="true" />
              <span className="audio-status-popover-status-text">
                {titlePrefix}: {getLabel(state)}
              </span>
              {(state === "error" || state === "fallback") && onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="audio-status-retry-btn"
                  data-testid="audio-status-retry-btn"
                >
                  Retry
                </button>
              ) : null}
            </div>

            {/* Piano Sound Engine */}
            <div className="audio-status-popover-section" data-testid="popover-piano-engine-section">
              <span className="audio-status-popover-section-label">Piano Sound Engine</span>
              <div
                className="view-preference-toggle audio-status-popover-toggle"
                role="radiogroup"
                aria-label="Piano Engine"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isGuitar ? !isSoundFont : undefined}
                  className={(!isGuitar && !isSoundFont) || (isGuitar && engine !== "soundfont") ? "is-active" : ""}
                  onClick={() => onSettingsChange?.({ pianoEngine: "hq-samples" })}
                  data-testid="popover-piano-hq-btn"
                >
                  HQ Samples
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isGuitar ? isSoundFont : undefined}
                  className={!isGuitar && isSoundFont ? "is-active" : ""}
                  onClick={() => onSettingsChange?.({ pianoEngine: "soundfont" })}
                  data-testid="popover-piano-soundfont-btn"
                >
                  SoundFont
                </button>
              </div>

              {!isGuitar && isSoundFont ? (
                <label className="audio-status-popover-select-label">
                  <span className="audio-status-popover-sublabel">Piano Tone</span>
                  <select
                    aria-label="Piano Tone"
                    data-testid="popover-piano-tone-select"
                    value={pianoSoundfontInstrument}
                    onChange={(e) =>
                      onSettingsChange?.({
                        pianoSoundfontInstrument: e.target.value as MelodyInstrumentId,
                      })
                    }
                    className="audio-status-popover-select"
                  >
                    {PIANO_SOUNDFONT_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            {/* Guitar View Engine */}
            <div className="audio-status-popover-section" data-testid="popover-guitar-engine-section">
              <span className="audio-status-popover-section-label">Guitar View Engine</span>
              <div
                className="view-preference-toggle audio-status-popover-toggle"
                role="radiogroup"
                aria-label="Guitar View Engine"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={isGuitar ? !isSoundFont : undefined}
                  className={isGuitar && !isSoundFont ? "is-active" : ""}
                  onClick={() => onSettingsChange?.({ guitarEngine: "hq-samples" })}
                  data-testid="popover-guitar-hq-btn"
                >
                  HQ Acoustic
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isGuitar ? isSoundFont : undefined}
                  className={isGuitar && isSoundFont ? "is-active" : ""}
                  onClick={() => onSettingsChange?.({ guitarEngine: "soundfont" })}
                  data-testid="popover-guitar-soundfont-btn"
                >
                  SoundFont
                </button>
              </div>

              {isGuitar && isSoundFont ? (
                <label className="audio-status-popover-select-label">
                  <span className="audio-status-popover-sublabel">Guitar Tone</span>
                  <select
                    aria-label="Guitar Tone"
                    data-testid="popover-guitar-tone-select"
                    value={guitarSoundfontInstrument}
                    onChange={(e) =>
                      onSettingsChange?.({
                        guitarSoundfontInstrument: e.target.value as MelodyInstrumentId,
                      })
                    }
                    className="audio-status-popover-select"
                  >
                    {GUITAR_SOUNDFONT_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
