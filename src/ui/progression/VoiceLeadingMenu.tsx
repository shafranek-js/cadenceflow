import { useState, useRef, useEffect } from "react";
import type { VoiceLeadingStrategy } from "../../domain/progression/voiceLeadingOptimizer";
import { Icon } from "../common/Icon";

export interface VoiceLeadingMenuProps {
  readonly onApplyVoiceLeading: (strategy: VoiceLeadingStrategy) => void;
  readonly disabled?: boolean;
}

const STRATEGIES: readonly {
  readonly id: VoiceLeadingStrategy;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
}[] = [
  {
    id: "smooth-all",
    title: "Smooth Stepwise Bassline",
    description: "Stepwise bass movement (1–2 semitones) with smooth upper voice leading",
    icon: "✨",
  },
  {
    id: "smooth-upper",
    title: "Smooth Upper Voices Only",
    description: "Retains root bass while optimizing upper chord inversions and common tones",
    icon: "🎹",
  },
  {
    id: "pedal-tonic",
    title: "Tonic Pedal Point",
    description: "Anchors bass to tonic root while chords progress above",
    icon: "⚓",
  },
  {
    id: "pedal-dominant",
    title: "Dominant Pedal Point",
    description: "Anchors bass to dominant 5th degree for anticipation and tension",
    icon: "⚡",
  },
  {
    id: "reset-root",
    title: "Reset to Root Position",
    description: "Restores all chords to baseline root position",
    icon: "🔄",
  },
];

export function VoiceLeadingMenu({ onApplyVoiceLeading, disabled = false }: VoiceLeadingMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="voice-leading-menu-container" ref={menuRef}>
      <button
        type="button"
        className={`voice-leading-menu-trigger ${isOpen ? "is-active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Voice Leading and Inversions Actions"
        data-testid="voice-leading-menu-trigger"
        title="Apply voice leading, smooth inversions, or pedal points across progression"
      >
        <span className="vl-trigger-icon" aria-hidden="true">✨</span>
        <span className="vl-trigger-text">Voice Leading</span>
        <span className="vl-trigger-chevron" aria-hidden="true">
          <Icon name={isOpen ? "arrow-up" : "arrow-down"} />
        </span>
      </button>

      {isOpen && (
        <div
          className="voice-leading-dropdown"
          role="menu"
          aria-label="Voice Leading Strategies"
          data-testid="voice-leading-dropdown"
        >
          <div className="vl-dropdown-header">
            <strong>Voice Leading & Inversions</strong>
            <span>Harmonic optimization across progression</span>
          </div>
          <div className="vl-dropdown-items">
            {STRATEGIES.map((strat) => (
              <button
                key={strat.id}
                type="button"
                className="vl-dropdown-item"
                role="menuitem"
                data-testid={`vl-strategy-${strat.id}`}
                onClick={() => {
                  onApplyVoiceLeading(strat.id);
                  setIsOpen(false);
                }}
              >
                <span className="vl-item-icon" aria-hidden="true">{strat.icon}</span>
                <div className="vl-item-content">
                  <span className="vl-item-title">{strat.title}</span>
                  <span className="vl-item-desc">{strat.description}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
