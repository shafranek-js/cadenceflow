import type { ExactPitch } from "../../domain/harmony/pitch";

export function PianoCardView({ pitches }: { readonly pitches: readonly ExactPitch[] }) {
  const active = new Set(pitches.map((pitch) => pitch.midiNumber));
  const keys = Array.from({ length: 24 }, (_, index) => 48 + index);
  return (
    <div className="mini-piano" aria-label={`Piano realization: ${pitches.map((p) => p.midiNumber).join(", ")}`}>
      {keys.map((midi) => <span key={midi} className={`mini-key ${active.has(midi) ? "is-active" : ""}`} data-midi={midi} />)}
    </div>
  );
}
