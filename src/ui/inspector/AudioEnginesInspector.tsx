import { useState } from "react";
import type { HarmonyTrackSettings } from "../../domain/harmony/track";
import type { MelodyInstrumentId } from "../../domain/melody/instrumentCatalog";
import type { CardViewId } from "../../domain/progression/step";
import type { ProgressionView } from "../../domain/project/project";
import { Icon } from "../common/Icon";
import { GUITAR_SOUNDFONT_OPTIONS } from "../harmony/HarmonyTrackControls";

export const AUDIO_ENGINES_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.audio-engines-disclosure-open";

function readDisclosureState(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

function persistDisclosureState(key: string, open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(open));
  } catch {
    // Disclosure preferences are best-effort when storage is unavailable.
  }
}

export interface AudioEnginesInspectorProps {
  readonly settings: HarmonyTrackSettings;
  readonly onChange: (patch: Partial<HarmonyTrackSettings>) => void;
  readonly globalMatrixCardView?: CardViewId | undefined;
  readonly progressionView?: ProgressionView | undefined;
}

export function AudioEnginesInspector({
  settings,
  onChange,
  globalMatrixCardView = "harmonic",
  progressionView = "harmonic",
}: AudioEnginesInspectorProps) {
  const [isOpen, setIsOpen] = useState(() =>
    readDisclosureState(AUDIO_ENGINES_DISCLOSURE_STORAGE_KEY, true),
  );

  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      persistDisclosureState(AUDIO_ENGINES_DISCLOSURE_STORAGE_KEY, next);
      return next;
    });
  };

  const pianoEngine = settings.pianoEngine ?? "hq-samples";
  const guitarEngine = settings.guitarEngine ?? "hq-samples";
  const guitarSoundfontInstrument = settings.guitarSoundfontInstrument ?? "gm-025";
  const isGuitarActive =
    globalMatrixCardView === "guitar" || progressionView === "guitar";

  const selectedGuitarOption =
    GUITAR_SOUNDFONT_OPTIONS.find((opt) => opt.id === guitarSoundfontInstrument) ??
    GUITAR_SOUNDFONT_OPTIONS[1]!;

  const activeBadgeLabel = isGuitarActive
    ? guitarEngine === "soundfont"
      ? `Guitar: SoundFont (${selectedGuitarOption.label.replace(/^GM \d+ · /, "")})`
      : "Guitar: HQ Acoustic"
    : pianoEngine === "soundfont"
      ? "Piano: SoundFont"
      : "Piano: HQ Grand";

  const compactActiveBadgeLabel = isGuitarActive
    ? guitarEngine === "soundfont"
      ? "Guitar: SoundFont"
      : "Guitar: HQ Acoustic"
    : pianoEngine === "soundfont"
      ? "Piano: SoundFont"
      : "Piano: HQ Grand";

  return (
    <section
      className="inspector-panel audio-engines-inspector"
      aria-label="Sound Engines"
      data-testid="audio-engines-inspector"
    >
      <header className="inspector-panel-header audio-engines-header">
        <button
          type="button"
          className="inspector-disclosure-toggle"
          onClick={toggleOpen}
          aria-expanded={isOpen}
          aria-controls="audio-engines-content"
          data-testid="audio-engines-disclosure-btn"
        >
          <Icon name="disclosure" className={isOpen ? "is-rotated" : ""} />
          <span className="inspector-panel-title">Sound Engines</span>
        </button>
        <span
          className="style-active-badge audio-engine-active-badge"
          data-testid="audio-engine-active-badge"
          title={`Active timbre: ${activeBadgeLabel}`}
        >
          {compactActiveBadgeLabel}
        </span>
      </header>

      {isOpen ? (
        <div id="audio-engines-content" className="audio-engines-body">
          {/* Piano Row */}
          <div
            className={`audio-engine-row ${!isGuitarActive ? "is-active-source" : ""}`}
            data-testid="piano-engine-block"
          >
            <div className="audio-engine-meta">
              <span className="audio-engine-name">Piano</span>
              {!isGuitarActive ? (
                <span className="audio-engine-dot" title="Active in Matrix" />
              ) : null}
            </div>
            <div
              className="view-preference-toggle audio-engine-toggle"
              role="radiogroup"
              aria-label="Piano Sound Engine"
            >
              <button
                type="button"
                role="radio"
                aria-checked={pianoEngine === "hq-samples"}
                className={pianoEngine === "hq-samples" ? "is-active" : ""}
                onClick={() => onChange({ pianoEngine: "hq-samples" })}
                data-testid="inspector-piano-engine-hq-btn"
                title="Salamander Grand Piano multi-velocity acoustic samples"
              >
                HQ Grand
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={pianoEngine === "soundfont"}
                className={pianoEngine === "soundfont" ? "is-active" : ""}
                onClick={() => onChange({ pianoEngine: "soundfont" })}
                data-testid="inspector-piano-engine-soundfont-btn"
                title="FluidR3_GM classic SoundFont piano"
              >
                SoundFont
              </button>
            </div>
          </div>

          {/* Guitar Row */}
          <div
            className={`audio-engine-row ${isGuitarActive ? "is-active-source" : ""}`}
            data-testid="guitar-engine-block"
          >
            <div className="audio-engine-meta">
              <span className="audio-engine-name">Guitar</span>
              {isGuitarActive ? (
                <span className="audio-engine-dot is-guitar" title="Active in Matrix" />
              ) : null}
            </div>
            <div
              className="view-preference-toggle audio-engine-toggle"
              role="radiogroup"
              aria-label="Guitar View Engine"
            >
              <button
                type="button"
                role="radio"
                aria-checked={guitarEngine === "hq-samples"}
                className={guitarEngine === "hq-samples" ? "is-active" : ""}
                onClick={() => onChange({ guitarEngine: "hq-samples" })}
                data-testid="inspector-guitar-engine-hq-btn"
                title="Acoustic steel-string samples with natural strum simulation"
              >
                HQ Acoustic
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={guitarEngine === "soundfont"}
                className={guitarEngine === "soundfont" ? "is-active" : ""}
                onClick={() => onChange({ guitarEngine: "soundfont" })}
                data-testid="inspector-guitar-engine-soundfont-btn"
                title="SoundFont guitar collection"
              >
                SoundFont
              </button>
            </div>
          </div>

          {/* Guitar Tone select if guitar is SoundFont */}
          {guitarEngine === "soundfont" ? (
            <div className="audio-engine-tone-row">
              <label
                className="audio-engine-tone-label"
                htmlFor="inspector-guitar-soundfont-select"
              >
                Tone
              </label>
              <select
                id="inspector-guitar-soundfont-select"
                aria-label="Guitar Tone"
                data-testid="inspector-guitar-soundfont-select"
                value={guitarSoundfontInstrument}
                onChange={(e) =>
                  onChange({
                    guitarSoundfontInstrument: e.target.value as MelodyInstrumentId,
                  })
                }
                className="audio-engine-select"
              >
                {GUITAR_SOUNDFONT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label.replace(/^GM \d+ · /, "")}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
