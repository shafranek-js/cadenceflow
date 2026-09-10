import type { ThemeMode } from "../../domain/project/project";
import { Icon, type IconName } from "../common/Icon";

const THEMES: readonly {
  readonly value: ThemeMode;
  readonly label: string;
  readonly icon: IconName;
}[] = [
  { value: "dark", label: "Dark theme", icon: "moon" },
  { value: "light", label: "Light theme", icon: "sun" },
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
      <div className="theme-toggle">
        {THEMES.map((theme) => (
          <button
            key={theme.value}
            type="button"
            className={`theme-toggle-option${value === theme.value ? " is-active" : ""}`}
            aria-pressed={value === theme.value}
            aria-label={theme.label}
            title={theme.label}
            onClick={() => onChange(theme.value)}
          >
            <Icon name={theme.icon} className="theme-toggle-icon" />
            <span className="theme-toggle-option-label">{theme.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
