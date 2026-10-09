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
import { useInspectorDisclosure } from "./useInspectorDisclosure";
import { IndependentBassVoiceControl } from "./IndependentBassVoiceControl";

const STORAGE_KEY = "cadenceflow.ui.selected-step.progression-settings-disclosure-open";

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
  readonly independentBassEnabled?: boolean | undefined;
  readonly onSetIndependentBassEnabled?: ((enabled: boolean) => void) | undefined;
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
  independentBassEnabled,
  onSetIndependentBassEnabled,
  dragHandle,
}: InspectorProgressionSettingsProps) {
  const disclosure = useInspectorDisclosure(STORAGE_KEY, false);

  return (
    <details
      className="inspector-disclosure selected-progression-settings"
      open={disclosure.isOpen}
      data-testid="selected-progression-settings"
      onToggle={(event) => disclosure.setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          {dragHandle}
          Progression settings
        </span>
        <span className="disclosure-status">Global</span>
      </summary>
      <div className="inspector-disclosure-body">
        {independentBassEnabled !== undefined && onSetIndependentBassEnabled ? (
          <IndependentBassVoiceControl
            enabled={independentBassEnabled}
            onChange={onSetIndependentBassEnabled}
          />
        ) : null}
        {hasMelodyRecipe && melodyTrack && onMelodyTrackSettingsChange ? (
          <MelodyTrackControls
            settings={melodyTrack}
            onChange={onMelodyTrackSettingsChange}
            {...(melodyAudioState ? { providerState: melodyAudioState } : {})}
            {...(melodyAudioError !== undefined ? { providerError: melodyAudioError } : {})}
            {...(onRetryMelodyAudio ? { onRetry: onRetryMelodyAudio } : {})}
          />
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
