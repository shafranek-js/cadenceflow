import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { AudioProviderState } from "../../audio/contracts";
import { InspectorDisclosureToggle } from "../inspector/InspectorDisclosure";
import { useInspectorDisclosure } from "../inspector/useInspectorDisclosure";

export interface TrackControlSettings {
  readonly instrument: string;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly volume: number;
}

export interface TrackInstrumentOption {
  readonly value: string;
  readonly label: string;
}

export function TrackControls({
  trackName,
  settings,
  onChange,
  instrumentOptions,
  instrumentControl,
  instrumentDisabled = false,
  providerState = "idle",
  providerError = null,
  onRetry,
  children,
}: {
  readonly trackName: string;
  readonly settings: TrackControlSettings;
  readonly onChange: (patch: Partial<TrackControlSettings>) => void;
  readonly instrumentOptions?: readonly TrackInstrumentOption[];
  readonly instrumentControl?: ReactNode;
  readonly instrumentDisabled?: boolean;
  readonly providerState?: AudioProviderState;
  readonly providerError?: string | null;
  readonly onRetry?: () => void;
  readonly children?: ReactNode;
}) {
  const legacyClassPrefix = trackName.toLowerCase();
  const providerIssueIsFatal = providerState === "error";
  const bodyId = useId();
  const disclosure = useInspectorDisclosure(
    `cadenceflow.ui.track-controls-${legacyClassPrefix}-disclosure-open`,
    true,
  );
  const [volumeDraft, setVolumeDraft] = useState(settings.volume);
  const volumeDraftRef = useRef(settings.volume);
  const pointerEditingRef = useRef(false);
  const lastCommittedVolumeRef = useRef(settings.volume);

  useEffect(() => {
    if (pointerEditingRef.current) return;
    setVolumeDraft(settings.volume);
    volumeDraftRef.current = settings.volume;
    lastCommittedVolumeRef.current = settings.volume;
  }, [settings.volume]);

  const commitVolume = (value: number) => {
    const next = Math.max(0, Math.min(127, Math.round(value)));
    setVolumeDraft(next);
    volumeDraftRef.current = next;
    if (next === lastCommittedVolumeRef.current) return;
    lastCommittedVolumeRef.current = next;
    onChange({ volume: next });
  };

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    setVolumeDraft(next);
    volumeDraftRef.current = next;
    if (!pointerEditingRef.current) commitVolume(next);
  };

  return (
    <section
      className={`track-controls ${legacyClassPrefix}-track-controls`}
      aria-label={`${trackName} Track controls`}
    >
      <div className={`track-controls-title ${legacyClassPrefix}-track-title`}>
        <InspectorDisclosureToggle
          isOpen={disclosure.isOpen}
          onToggle={disclosure.toggle}
          ariaLabel={`Toggle ${trackName} Track section`}
          controlsId={bodyId}
          testId={`${legacyClassPrefix}-track-disclosure-btn`}
        />
        <strong>{trackName} Track</strong>
        <span>{trackName === "Melody" ? "Derived notation" : "Chord realization"}</span>
      </div>
      {disclosure.isOpen ? (
        <div id={bodyId} className={`track-controls-body ${legacyClassPrefix}-track-body`}>
          <div
            className={`track-controls-audio-status ${legacyClassPrefix}-track-audio-status`}
            role={providerError && providerIssueIsFatal ? "alert" : "status"}
          >
            {providerError
              ? `${trackName} audio ${providerIssueIsFatal ? "error" : "warning"}: ${providerError}`
              : providerState === "loading"
                ? `${trackName} audio loading…`
                : providerState === "ready"
                  ? `${trackName} audio ready`
                  : providerState === "fallback"
                    ? `${trackName} audio fallback`
                    : `${trackName} audio unavailable`}
            {providerError && onRetry ? (
              <button
                type="button"
                className={`track-controls-retry ${legacyClassPrefix}-track-retry`}
                onClick={onRetry}
              >
                Retry
              </button>
            ) : null}
          </div>
          {instrumentControl ? (
            <label className={`track-controls-instrument ${legacyClassPrefix}-track-instrument`}>
              <span>Instrument</span>
              {instrumentControl}
            </label>
          ) : (
            <label className={`track-controls-instrument ${legacyClassPrefix}-track-instrument`}>
              <span>Instrument</span>
              <select
                aria-label={`${trackName} Track Instrument`}
                value={settings.instrument}
                disabled={instrumentDisabled}
                onChange={(event) => onChange({ instrument: event.target.value })}
              >
                {(instrumentOptions ?? []).map((instrument) => (
                  <option key={instrument.value} value={instrument.value}>
                    {instrument.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className={`track-controls-toggle ${legacyClassPrefix}-track-toggle`}
            aria-label={`Mute ${trackName} Track`}
            aria-pressed={settings.muted}
            onClick={() => onChange({ muted: !settings.muted })}
          >
            {settings.muted ? "Muted" : "Mute"}
          </button>
          <button
            type="button"
            className={`track-controls-toggle ${legacyClassPrefix}-track-toggle`}
            aria-label={`Solo ${trackName} Track`}
            aria-pressed={settings.solo}
            onClick={() => onChange({ solo: !settings.solo })}
          >
            {settings.solo ? "Solo on" : "Solo"}
          </button>
          <label className={`track-controls-volume ${legacyClassPrefix}-track-volume`}>
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="127"
              step="1"
              value={volumeDraft}
              aria-label={`${trackName} Track Volume`}
              aria-valuetext={`${volumeDraft} of 127`}
              onPointerDown={() => {
                pointerEditingRef.current = true;
              }}
              onChange={handleVolumeChange}
              onPointerUp={() => {
                pointerEditingRef.current = false;
                commitVolume(volumeDraftRef.current);
              }}
              onPointerCancel={() => {
                pointerEditingRef.current = false;
                commitVolume(volumeDraftRef.current);
              }}
              onBlur={() => {
                pointerEditingRef.current = false;
                commitVolume(volumeDraftRef.current);
              }}
            />
            <output>{volumeDraft}</output>
          </label>
          {children}
        </div>
      ) : null}
    </section>
  );
}
