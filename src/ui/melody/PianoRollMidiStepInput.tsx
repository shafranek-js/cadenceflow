import { useEffect, useState, type KeyboardEvent } from "react";
import { compareRational, type Rational } from "../../domain/timing/rational";
import {
  MIDI_STEP_DURATIONS,
  midiStepDuration,
  parseMidiCursor,
  type MidiConnectionStatus,
  type MidiStepDurationId,
  type MidiStepInputSnapshot,
} from "./midiStepInput";

export type MidiStepInsertResult =
  | { readonly ok: true; readonly stepId: string; readonly eventKey: string }
  | { readonly ok: false; readonly message: string };

export interface PianoRollMidiStepInputProps {
  readonly snapshot: MidiStepInputSnapshot;
  readonly cursor: Rational;
  readonly cursorEnd: Rational;
  readonly cursorMeasure: number;
  readonly cursorBeat: Rational;
  readonly durationId: MidiStepDurationId;
  readonly manualPitch: string;
  readonly active: boolean;
  readonly transportStatus: "stopped" | "playing" | "paused";
  readonly auditionEnabled: boolean;
  readonly insertStatus: string | null;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
  readonly onDeviceSelect: (deviceId: string) => void;
  readonly onArm: () => void;
  readonly onDisarm: () => void;
  readonly onDurationChange: (durationId: MidiStepDurationId) => void;
  readonly onManualPitchChange: (pitch: string) => void;
  readonly onManualInsert: (pitch: number) => MidiStepInsertResult;
  readonly onCursorChange: (cursor: Rational) => void;
  readonly onAuditionChange: (enabled: boolean) => void;
}

function rationalText(value: Rational): string {
  return `${value.numerator}/${value.denominator}`;
}

function connectionText(status: MidiConnectionStatus): string {
  switch (status) {
    case "requesting":
      return "Connecting";
    case "unsupported":
      return "MIDI unavailable";
    case "permission-denied":
      return "Permission denied";
    case "no-device":
      return "No device";
    case "choose-device":
      return "Choose device";
    case "connected":
      return "Connected";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "MIDI error";
    default:
      return "Not connected";
  }
}

export function PianoRollMidiStepInput({
  snapshot,
  cursor,
  cursorEnd,
  cursorMeasure,
  cursorBeat,
  durationId,
  manualPitch,
  active,
  transportStatus,
  auditionEnabled,
  insertStatus,
  onConnect,
  onDisconnect,
  onDeviceSelect,
  onArm,
  onDisarm,
  onDurationChange,
  onManualPitchChange,
  onManualInsert,
  onCursorChange,
  onAuditionChange,
}: PianoRollMidiStepInputProps) {
  const [cursorDraft, setCursorDraft] = useState(() => rationalText(cursor));
  const [localError, setLocalError] = useState<string | null>(null);
  const canInsert = active && transportStatus === "stopped" && !snapshot.focusSuspended;
  const selectedDuration = midiStepDuration(durationId);

  useEffect(() => {
    setCursorDraft(rationalText(cursor));
    setLocalError(null);
  }, [cursor]);

  const insertManualPitch = (): void => {
    const pitch = Number(manualPitch);
    if (!manualPitch.trim() || !Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
      setLocalError("Enter a MIDI pitch from 0 to 127.");
      return;
    }
    const result = onManualInsert(pitch);
    setLocalError(result.ok ? null : result.message);
  };

  const handleManualPitchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter" || !snapshot.effectiveInputEnabled || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    insertManualPitch();
  };

  const applyCursorDraft = (): void => {
    const next = parseMidiCursor(cursorDraft);
    if (!next || compareRational(next, cursorEnd) > 0) {
      setLocalError(`Enter an exact cursor from 0 to ${rationalText(cursorEnd)} beats.`);
      return;
    }
    setLocalError(null);
    onCursorChange(next);
  };

  return (
    <div
      className="piano-roll-midi-step-input"
      role="group"
      aria-label="MIDI step input"
      data-testid="piano-roll-midi-step-input"
      data-midi-status={snapshot.status}
      data-midi-armed={snapshot.armed ? "true" : "false"}
      data-midi-effective={snapshot.effectiveInputEnabled ? "true" : "false"}
      data-midi-suspended={snapshot.focusSuspended ? "true" : "false"}
      data-cursor={`${cursor.numerator}/${cursor.denominator}`}
    >
      <div className="piano-roll-midi-connect-controls" role="group" aria-label="MIDI device">
        <button type="button" onClick={onConnect} disabled={snapshot.status === "requesting"}>
          {snapshot.status === "requesting" ? "Connecting…" : "Connect MIDI"}
        </button>
        {snapshot.inputs.length > 0 ? (
          <label>
            Input{" "}
            <select
              aria-label="MIDI input device"
              value={snapshot.selectedDeviceId ?? ""}
              onChange={(event) => onDeviceSelect(event.target.value)}
            >
              <option value="" disabled>
                Select input
              </option>
              {snapshot.inputs.map((input) => (
                <option key={input.id} value={input.id} disabled={input.state !== "connected"}>
                  {input.manufacturer ? `${input.manufacturer} · ` : ""}
                  {input.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {snapshot.status !== "idle" && snapshot.status !== "requesting" ? (
          <button type="button" onClick={onDisconnect} aria-label="Disconnect MIDI input">
            Reset
          </button>
        ) : null}
        <button
          type="button"
          aria-pressed={snapshot.armed}
          disabled={!snapshot.armed && (!canInsert || !snapshot.selectedDeviceId)}
          onClick={snapshot.armed ? onDisarm : onArm}
        >
          {snapshot.armed ? "Disarm" : "Arm"}
        </button>
      </div>
      <label>
        Step duration{" "}
        <select
          aria-label="MIDI step duration"
          value={durationId}
          onChange={(event) => onDurationChange(event.target.value as MidiStepDurationId)}
        >
          {MIDI_STEP_DURATIONS.map((duration) => (
            <option key={duration.id} value={duration.id}>
              {duration.label}
            </option>
          ))}
        </select>
      </label>
      <label className="piano-roll-midi-cursor-control">
        Cursor beat{" "}
        <input
          aria-label="MIDI insertion cursor beat as a fraction"
          type="text"
          inputMode="text"
          value={cursorDraft}
          onChange={(event) => setCursorDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyCursorDraft();
            }
          }}
          aria-describedby="piano-roll-midi-cursor-position"
        />
        <button type="button" onClick={applyCursorDraft}>
          Set
        </button>
      </label>
      <span id="piano-roll-midi-cursor-position" className="piano-roll-midi-cursor-position">
        Measure {cursorMeasure}, beat {rationalText(cursorBeat)}
      </span>
      <label>
        MIDI pitch{" "}
        <input
          aria-label="Manual MIDI pitch"
          type="number"
          min="0"
          max="127"
          step="1"
          value={manualPitch}
          onChange={(event) => onManualPitchChange(event.target.value)}
          onKeyDown={handleManualPitchKeyDown}
        />
      </label>
      <button
        type="button"
        aria-label={`Insert MIDI pitch ${manualPitch || ""}`}
        disabled={!canInsert}
        onClick={insertManualPitch}
      >
        Insert note
      </button>
      <label className="piano-roll-midi-audition-control">
        <input
          type="checkbox"
          aria-label="Sound on input"
          checked={auditionEnabled}
          onChange={(event) => onAuditionChange(event.target.checked)}
        />
        Sound on input
      </label>
      <span
        className="piano-roll-midi-status"
        role="status"
        aria-live="polite"
        data-testid="piano-roll-midi-status"
      >
        {localError ??
          insertStatus ??
          (snapshot.status !== "connected"
            ? `${connectionText(snapshot.status)}. ${snapshot.message}`
            : "Use positive Note On messages to insert notes. Escape disarms. Cursor and duration are exact beats; Snap only affects grid clicks.")}
      </span>
      <span className="piano-roll-midi-duration-value" aria-hidden="true">
        {rationalText(selectedDuration.beats)} beats
      </span>
    </div>
  );
}
