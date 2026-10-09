export interface IndependentBassVoiceControlProps {
  readonly enabled: boolean;
  readonly onChange: (enabled: boolean) => void;
}

export function IndependentBassVoiceControl({
  enabled,
  onChange,
}: IndependentBassVoiceControlProps) {
  return (
    <label className="independent-bass-setting">
      <input
        type="checkbox"
        data-testid="independent-bass-toggle"
        aria-label="Independent bass voice"
        checked={enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <strong>Independent bass voice</strong>
        <small>
          Adds a separate lower voice to playback and exports. Chord tones and inversions remain
          part of the chord when off.
        </small>
      </span>
    </label>
  );
}
