import type { ChangeEvent } from "react";
import type { CompositionIntent } from "../../domain/progression/branch";

const INTENTS: readonly { readonly id: CompositionIntent; readonly label: string }[] = [
  { id: "neutral", label: "Neutral" },
  { id: "resolve", label: "Resolve" },
  { id: "build-tension", label: "Build Tension" },
  { id: "darken-emotional", label: "Darken / Emotional" },
  { id: "surprise", label: "Surprise" },
  { id: "smooth-voice-leading", label: "Smooth Voice Leading" },
];

export function CompositionIntentControl({
  value,
  onChange,
}: {
  readonly value: CompositionIntent;
  readonly onChange: (intent: CompositionIntent) => void;
}) {
  return (
    <label className="composition-intent" data-context="composition-intent">
      <span>Composition Intent</span>
      <select
        aria-label="Composition Intent"
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value as CompositionIntent)
        }
      >
        {INTENTS.map((intent) => (
          <option key={intent.id} value={intent.id}>
            {intent.label}
          </option>
        ))}
      </select>
    </label>
  );
}
