import type { AudioProviderState } from "../../audio/contracts";
import type { HarmonyTrackSettings } from "../../domain/harmony/track";
import { TrackControls } from "../track/TrackControls";
import { MelodyInstrumentPicker } from "../melody/MelodyInstrumentPicker";

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
    />
  );
}
