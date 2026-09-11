import type { AudioProviderState } from "../../audio/contracts";
import type { MelodyTrackSettings } from "../../domain/melody/types";
import { MELODY_INSTRUMENTS } from "../../domain/melody/types";
import { melodyInstrumentLabel } from "./labels";
import { TrackControls } from "../track/TrackControls";

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
      instrumentOptions={MELODY_INSTRUMENTS.map((instrument) => ({
        value: instrument,
        label: melodyInstrumentLabel(instrument),
      }))}
      providerState={providerState}
      providerError={providerError}
      {...(onRetry ? { onRetry } : {})}
    />
  );
}
