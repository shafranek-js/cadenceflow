import type { ThemeMode } from "../../domain/project/project";

const THEMES: readonly {
  readonly value: ThemeMode;
  readonly label: string;
  readonly icon: string;
}[] = [
  { value: "dark", label: "Dark theme", icon: "◐" },
  { value: "light", label: "Light theme", icon: "☼" },
];

export function ThemeControl({
  value,
  onChange,
}: {
  readonly value: ThemeMode;
  readonly onChange: (theme: ThemeMode) => void;
}) {
  return (
    <div className="presentation-control theme-control" role="group" aria-label="Theme">
      <span className="presentation-control-label">Theme</span>
      <div className="presentation-control-options">
        {THEMES.map((theme) => (
          <button
            key={theme.value}
            type="button"
            className={value === theme.value ? "is-active" : ""}
            aria-pressed={value === theme.value}
            aria-label={theme.label}
            title={theme.label}
            onClick={() => onChange(theme.value)}
          >
            <span aria-hidden="true">{theme.icon}</span>
            <span>{theme.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
