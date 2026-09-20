import type { AudioProviderState } from "../../audio/contracts";
import type { HarmonyTrackSettings } from "../../domain/harmony/track";
import type { MelodyInstrumentId } from "../../domain/melody/instrumentCatalog";
import { TrackControls } from "../track/TrackControls";
import { MelodyInstrumentPicker } from "../melody/MelodyInstrumentPicker";

export const PIANO_SOUNDFONT_OPTIONS: readonly {
  readonly id: MelodyInstrumentId;
  readonly label: string;
}[] = [
  { id: "gm-000", label: "GM 000 · Acoustic Grand Piano" },
  { id: "gm-001", label: "GM 001 · Bright Acoustic Piano" },
  { id: "gm-002", label: "GM 002 · Electric Grand Piano" },
  { id: "gm-003", label: "GM 003 · Honky-tonk Piano" },
  { id: "gm-004", label: "GM 004 · Electric Piano 1" },
  { id: "gm-005", label: "GM 005 · Electric Piano 2" },
  { id: "gm-006", label: "GM 006 · Harpsichord" },
  { id: "gm-007", label: "GM 007 · Clavinet" },
];

export const GUITAR_SOUNDFONT_OPTIONS: readonly {
  readonly id: MelodyInstrumentId;
  readonly label: string;
}[] = [
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
