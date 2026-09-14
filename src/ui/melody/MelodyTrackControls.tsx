import type { AudioProviderState } from "../../audio/contracts";
import type { MelodyTrackSettings } from "../../domain/melody/types";
import { TrackControls } from "../track/TrackControls";
import { MelodyInstrumentPicker } from "./MelodyInstrumentPicker";

export function MelodyTrackControls({
  settings,
  onChange,
  providerState = "idle",
  providerError = null,
  onRetry,
}: {
  readonly settings: MelodyTrackSettings;
  readonly onChange: (patch: Partial<MelodyTrackSettings>) => void;
  readonly providerState?: AudioProviderState;
  readonly providerError?: string | null;
  readonly onRetry?: () => void;
}) {
  return (
    <TrackControls
      trackName="Melody"
      settings={settings}
      onChange={(patch) => onChange(patch as Partial<MelodyTrackSettings>)}
      instrumentControl={
        <MelodyInstrumentPicker
          value={settings.instrument}
          onChange={(instrument) => {
            if (instrument) onChange({ instrument });
          }}
          ariaLabel="Melody Track Instrument"
        />
      }
      providerState={providerState}
      providerError={providerError}
      {...(onRetry ? { onRetry } : {})}
    />
  );
}
