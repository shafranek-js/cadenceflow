import type { PianoArticulation } from "../../domain/progression/step";

const ARTICULATIONS: readonly {
  readonly value: PianoArticulation;
  readonly label: string;
  readonly symbol: string;
}[] = Object.freeze([
  Object.freeze({ value: "block", label: "Block", symbol: "■" }),
  Object.freeze({ value: "arp-up", label: "Arp Up", symbol: "↑" }),
  Object.freeze({ value: "arp-down", label: "Arp Down", symbol: "↓" }),
  Object.freeze({
    value: "broken-chord",
    label: "Broken Chord",
    symbol: "⌁",
  }),
  Object.freeze({ value: "humanized", label: "Humanized", symbol: "✦" }),
]);

export function ArticulationControl({
  value,
  showLabel = true,
  onChange,
}: {
  readonly value: PianoArticulation;
  readonly showLabel?: boolean;
  readonly onChange: (value: PianoArticulation) => void;
}) {
  return (
    <div className="articulation-control" role="group" aria-label="Articulation controls">
      {showLabel ? <span className="articulation-label">Articulation</span> : null}
      <div className="articulation-options" role="group" aria-label="Piano Articulation">
        {ARTICULATIONS.map((articulation) => (
          <button
            key={articulation.value}
            type="button"
            className="articulation-option"
            aria-label={`Articulation: ${articulation.label}`}
            aria-pressed={value === articulation.value}
            data-articulation-value={articulation.value}
            title={articulation.label}
            onClick={() => onChange(articulation.value)}
          >
            <span className="articulation-symbol" aria-hidden="true">
              {articulation.symbol}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
