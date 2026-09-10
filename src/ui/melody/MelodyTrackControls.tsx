import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { MelodyInstrument, MelodyTrackSettings } from "../../domain/melody/types";
import { MELODY_INSTRUMENTS } from "../../domain/melody/types";
import { melodyInstrumentLabel } from "./labels";

export function MelodyTrackControls({
  settings,
  onChange,
}: {
  readonly settings: MelodyTrackSettings;
  readonly onChange: (patch: Partial<MelodyTrackSettings>) => void;
}) {
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
    <section className="melody-track-controls" aria-label="Melody Track controls">
      <div className="melody-track-title">
        <strong>Melody Track</strong>
        <span>Derived notation</span>
      </div>
      <label className="melody-track-instrument">
        <span>Instrument</span>
        <select
          aria-label="Melody Track Instrument"
          value={settings.instrument}
          onChange={(event) => onChange({ instrument: event.target.value as MelodyInstrument })}
        >
          {MELODY_INSTRUMENTS.map((instrument) => (
            <option key={instrument} value={instrument}>
              {melodyInstrumentLabel(instrument)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="melody-track-toggle"
        aria-label="Mute Melody Track"
        aria-pressed={settings.muted}
        onClick={() => onChange({ muted: !settings.muted })}
      >
        {settings.muted ? "Muted" : "Mute"}
      </button>
      <button
        type="button"
        className="melody-track-toggle"
        aria-label="Solo Melody Track"
        aria-pressed={settings.solo}
        onClick={() => onChange({ solo: !settings.solo })}
      >
        {settings.solo ? "Solo on" : "Solo"}
      </button>
      <label className="melody-track-volume">
        <span>Volume</span>
        <input
          type="range"
          min="0"
          max="127"
          step="1"
          value={volumeDraft}
          aria-label="Melody Track Volume"
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
    </section>
  );
}
