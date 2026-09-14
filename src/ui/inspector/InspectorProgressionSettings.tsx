import { useState } from "react";
import type { AudioProviderState } from "../../audio/contracts";
import type { MelodyTrackSettings } from "../../domain/melody/types";
import type { ProgressionStep } from "../../domain/progression/step";
import type { Meter, MeterChangePolicy } from "../../domain/timing/meter";
import type { GrooveSettings } from "../../domain/timing/swing";
import type { LoopMode, LoopState } from "../transport/loopState";
import { MelodyTrackControls } from "../melody/MelodyTrackControls";
import { InspectorGrooveSection } from "./InspectorGrooveSection";
import { InspectorLoopSection } from "./InspectorLoopSection";
import { InspectorMeterSection } from "./InspectorMeterSection";

const STORAGE_KEY = "cadenceflow.ui.selected-step.progression-settings-disclosure-open";

function readDisclosureState(fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

export interface InspectorProgressionSettingsProps {
  readonly meter?: Meter | undefined;
  readonly onSetMeter?: ((meter: Meter, policy: MeterChangePolicy) => void) | undefined;
  readonly groove?: GrooveSettings | undefined;
  readonly onSetGroove?: ((groove: GrooveSettings) => void) | undefined;
  readonly loopState?: LoopState | undefined;
  readonly steps?: readonly ProgressionStep[] | undefined;
  readonly onSetLoopMode?: ((mode: LoopMode) => void) | undefined;
  readonly onSetLoopRange?: ((startStepId: string, endStepId: string) => void) | undefined;
  readonly melodyTrack?: MelodyTrackSettings | undefined;
  readonly onMelodyTrackSettingsChange?:
    ((patch: Partial<MelodyTrackSettings>) => void) | undefined;
  readonly melodyAudioState?: AudioProviderState | undefined;
  readonly melodyAudioError?: string | null | undefined;
  readonly onRetryMelodyAudio?: (() => void) | undefined;
  readonly hasMelodyRecipe?: boolean | undefined;
  readonly dragHandle?: React.ReactNode | undefined;
}

export function InspectorProgressionSettings({
  meter,
  onSetMeter,
  groove,
  onSetGroove,
  loopState,
  steps,
  onSetLoopMode,
  onSetLoopRange,
  melodyTrack,
  onMelodyTrackSettingsChange,
  melodyAudioState,
  melodyAudioError,
  onRetryMelodyAudio,
  hasMelodyRecipe = false,
  dragHandle,
}: InspectorProgressionSettingsProps) {
  const [isOpen, setIsOpen] = useState(() => readDisclosureState(false));

  return (
    <details
      className="inspector-disclosure selected-progression-settings"
      open={isOpen}
      data-testid="selected-progression-settings"
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setIsOpen(nextOpen);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(STORAGE_KEY, String(nextOpen));
          } catch {
            // Disclosure preference persistence is best-effort.
          }
        }
      }}
    >
      <summary>
        <span>
          {dragHandle}
          Progression settings
        </span>
        <span className="disclosure-status">Global</span>
      </summary>
      <div className="inspector-disclosure-body">
        {hasMelodyRecipe && melodyTrack && onMelodyTrackSettingsChange ? (
          <details className="inspector-disclosure global-tracks-disclosure" open>
            <summary>
              <span>Melody Track</span>
            </summary>
            <div className="inspector-disclosure-body">
              <MelodyTrackControls
                settings={melodyTrack}
                onChange={onMelodyTrackSettingsChange}
                {...(melodyAudioState ? { providerState: melodyAudioState } : {})}
                {...(melodyAudioError !== undefined ? { providerError: melodyAudioError } : {})}
                {...(onRetryMelodyAudio ? { onRetry: onRetryMelodyAudio } : {})}
              />
            </div>
          </details>
        ) : null}

        {meter && onSetMeter ? (
          <InspectorMeterSection
            currentMeter={meter}
            onSetMeter={onSetMeter}
            defaultOpen={true}
            storageKey="cadenceflow.inspector.selected_step.meter"
          />
        ) : null}

        {groove && onSetGroove ? (
          <InspectorGrooveSection
            groove={groove}
            onSetGroove={onSetGroove}
            defaultOpen={true}
            storageKey="cadenceflow.inspector.selected_step.groove"
          />
        ) : null}

        {loopState && onSetLoopMode && steps ? (
          <InspectorLoopSection
            loopState={loopState}
            steps={steps}
            onSetLoopMode={onSetLoopMode}
            onSetLoopRange={onSetLoopRange}
            defaultOpen={true}
            storageKey="cadenceflow.inspector.selected_step.loop"
          />
        ) : null}
      </div>
    </details>
  );
}
