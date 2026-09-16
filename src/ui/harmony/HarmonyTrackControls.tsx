import type { AudioProviderState } from "../../audio/contracts";
import type { HarmonyTrackSettings } from "../../domain/harmony/track";
import type { MelodyInstrumentId } from "../../domain/melody/instrumentCatalog";
import { TrackControls } from "../track/TrackControls";
import { MelodyInstrumentPicker } from "../melody/MelodyInstrumentPicker";

const GUITAR_SOUNDFONT_OPTIONS: readonly { readonly id: MelodyInstrumentId; readonly label: string }[] = [
  { id: "gm-024", label: "GM 024 · Acoustic Guitar (nylon)" },
  { id: "gm-025", label: "GM 025 · Acoustic Guitar (steel)" },
  { id: "gm-026", label: "GM 026 · Electric Guitar (jazz)" },
  { id: "gm-027", label: "GM 027 · Electric Guitar (clean)" },
  { id: "gm-028", label: "GM 028 · Electric Guitar (muted)" },
  { id: "gm-029", label: "GM 029 · Overdriven Guitar" },
  { id: "gm-030", label: "GM 030 · Distortion Guitar" },
  { id: "gm-031", label: "GM 031 · Guitar Harmonics" },
];

export function HarmonyTrackControls({
  settings,
  onChange,
  providerState = "idle",
  providerError = null,
  onRetry,
}: {
  readonly settings: HarmonyTrackSettings;
  readonly onChange: (patch: Partial<HarmonyTrackSettings>) => void;
  readonly providerState?: AudioProviderState;
  readonly providerError?: string | null;
  readonly onRetry?: () => void;
}) {
  const pianoEngine = settings.pianoEngine ?? "hq-samples";
  const guitarEngine = settings.guitarEngine ?? "hq-samples";
  const guitarSoundfontInstrument = settings.guitarSoundfontInstrument ?? "gm-025";

  return (
    <TrackControls
      trackName="Harmony"
      settings={settings}
      onChange={(patch) => onChange(patch as Partial<HarmonyTrackSettings>)}
      instrumentControl={
        <MelodyInstrumentPicker
          value={settings.instrument}
          onChange={(instrument) => {
            if (instrument) onChange({ instrument });
          }}
          ariaLabel="Harmony Track Instrument"
        />
      }
      providerState={providerState}
      providerError={providerError}
      {...(onRetry ? { onRetry } : {})}
    >
      <div
        className="harmony-engines-group"
        style={{
          display: "grid",
          gap: "8px",
          marginTop: "10px",
          paddingTop: "8px",
          borderTop: "1px solid var(--border-color, #333)",
        }}
      >
        <div className="harmony-engine-row" style={{ display: "grid", gap: "4px" }}>
          <span style={{ fontSize: "0.75rem", opacity: 0.8, fontWeight: 500 }}>
            Piano Sound Engine
          </span>
          <div
            className="view-preference-toggle"
            role="radiogroup"
            aria-label="Piano Sound Engine"
          >
            <button
              type="button"
              className={pianoEngine === "hq-samples" ? "is-active" : ""}
              onClick={() => onChange({ pianoEngine: "hq-samples" })}
              aria-label="HQ Samples (Salamander Grand)"
              data-testid="piano-engine-hq-btn"
            >
              HQ Samples
            </button>
            <button
              type="button"
              className={pianoEngine === "soundfont" ? "is-active" : ""}
              onClick={() => onChange({ pianoEngine: "soundfont" })}
              aria-label="SoundFont (FluidR3_GM)"
              data-testid="piano-engine-soundfont-btn"
            >
              SoundFont
            </button>
          </div>
        </div>

        <div className="harmony-engine-row" style={{ display: "grid", gap: "4px" }}>
          <span style={{ fontSize: "0.75rem", opacity: 0.8, fontWeight: 500 }}>
            Guitar View Engine
          </span>
          <div
            className="view-preference-toggle"
            role="radiogroup"
            aria-label="Guitar View Engine"
          >
            <button
              type="button"
              className={guitarEngine === "hq-samples" ? "is-active" : ""}
              onClick={() => onChange({ guitarEngine: "hq-samples" })}
              aria-label="HQ Acoustic Guitar"
              data-testid="guitar-engine-hq-btn"
            >
              HQ Acoustic
            </button>
            <button
              type="button"
              className={guitarEngine === "soundfont" ? "is-active" : ""}
              onClick={() => onChange({ guitarEngine: "soundfont" })}
              aria-label="SoundFont Guitar"
              data-testid="guitar-engine-soundfont-btn"
            >
              SoundFont
            </button>
          </div>
          {guitarEngine === "soundfont" ? (
            <label
              style={{
                display: "grid",
                gap: "2px",
                marginTop: "2px",
              }}
            >
              <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>Guitar SoundFont Tone</span>
              <select
                aria-label="Guitar SoundFont Tone"
                data-testid="guitar-soundfont-instrument-select"
                value={guitarSoundfontInstrument}
                onChange={(e) =>
                  onChange({
                    guitarSoundfontInstrument: e.target.value as MelodyInstrumentId,
                  })
                }
                style={{
                  fontSize: "0.8rem",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  border: "1px solid var(--border-color, #444)",
                  background: "var(--surface-color, #1e1e1e)",
                  color: "inherit",
                }}
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
    </TrackControls>
  );
}
