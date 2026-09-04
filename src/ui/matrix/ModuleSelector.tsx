import type { HarmonicModuleId } from "../../domain/harmony/functions";

const MODULES: readonly {
  readonly id: HarmonicModuleId;
  readonly label: string;
  readonly subtitle: string;
}[] = [
  { id: "progressions", label: "Progressions", subtitle: "Major" },
  { id: "dark-harmony", label: "Dark Harmony", subtitle: "Tonal Minor" },
];

export function ModuleSelector({
  value,
  onChange,
}: {
  readonly value: HarmonicModuleId;
  readonly onChange: (moduleId: HarmonicModuleId) => void;
}) {
  return (
    <div className="module-selector" role="group" aria-label="Harmonic module">
      {MODULES.map((module) => (
        <button
          key={module.id}
          type="button"
          className={module.id === value ? "is-active" : ""}
          aria-pressed={module.id === value}
          onClick={() => onChange(module.id)}
        >
          <strong>{module.label}</strong>
          <span>{module.subtitle}</span>
        </button>
      ))}
    </div>
  );
}
