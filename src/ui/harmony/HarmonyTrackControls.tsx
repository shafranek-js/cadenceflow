import type { AudioProviderState } from "../../audio/contracts";
import type { HarmonyTrackSettings } from "../../domain/harmony/track";
import { TrackControls } from "../track/TrackControls";

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
      instrumentOptions={[{ value: "piano", label: "Piano" }]}
      instrumentDisabled
      providerState={providerState}
      providerError={providerError}
      {...(onRetry ? { onRetry } : {})}
    />
  );
}
