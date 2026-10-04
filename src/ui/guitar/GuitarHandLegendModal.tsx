import { useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import guitarHandImg from "./assets/guitar-hand-fretting.png";
import { Icon } from "../common/Icon";
import {
  GUITAR_FINGER_COLORS,
  GUITAR_FINGER_NAMES,
  type GuitarFingerNumber,
} from "../../domain/instruments/guitar/fingerColors";

export type TabFingeringStyle = "badge" | "dots" | "numbers";

export interface GuitarHandLegendModalProps {
  readonly onClose: () => void;
  readonly fingeringStyle: TabFingeringStyle;
  readonly onSetFingeringStyle: (style: TabFingeringStyle) => void;
}

const FINGERS: readonly GuitarFingerNumber[] = [1, 2, 3, 4];

export function GuitarHandLegendModal({
  onClose,
  fingeringStyle,
  onSetFingeringStyle,
}: GuitarHandLegendModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="dialog-backdrop guitar-hand-legend-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="guitar-hand-legend-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hand-legend-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-header hand-legend-header">
          <div>
            <h2 id="hand-legend-title" className="hand-legend-title">
              🖐 Аппликатура левой руки
            </h2>
            <p className="hand-legend-subtitle">Цветовая схема пальцев на грифе и табулатуре</p>
          </div>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={onClose}
            aria-label="Закрыть схему аппликатуры"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className="hand-legend-content">
          {/* Left Column: Hand Illustration */}
          <div
            className="hand-legend-graphic"
            aria-label="Схема левой руки с цветовой разметкой пальцев"
          >
            <img
              src={guitarHandImg}
              alt="Схема левой руки с нумерацией пальцев: T — большой палец, 1 — указательный, 2 — средний, 3 — безымянный, 4 — мизинец"
              className="guitar-hand-image"
              width="190"
              height="250"
            />
          </div>

          {/* Right Column: Descriptions & Settings */}
          <div className="hand-legend-details">
            <p className="hand-legend-intro">
              Цветные маркеры на табулатуре показывают палец левой руки:
            </p>

            <ul className="hand-legend-finger-list">
              {FINGERS.map((finger) => (
                <li key={finger} className="hand-legend-finger-item">
                  <span
                    className={`hand-legend-pill dot-${finger}`}
                    style={{ "--finger-color": GUITAR_FINGER_COLORS[finger] } as CSSProperties}
                  >
                    {finger}
                  </span>
                  <div className="hand-legend-finger-names">
                    <strong>{GUITAR_FINGER_NAMES[finger].ru}</strong>
                    <span>{GUITAR_FINGER_NAMES[finger].en}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hand-legend-open-string">
              <span className="open-string-dot">⚪</span>
              <span>
                <strong>0</strong> — открытая струна (играется без прижатия пальцами)
              </span>
            </div>

            {/* Display Style Toggle */}
            <div className="hand-legend-style-picker">
              <span className="style-picker-label">Вид на табулатуре:</span>
              <div className="style-picker-options">
                <button
                  type="button"
                  className={`style-option-btn ${fingeringStyle === "badge" ? "active" : ""}`}
                  onClick={() => onSetFingeringStyle("badge")}
                  title="Цветной кружок-подложка под номером лада (рекомендуется)"
                >
                  ● Подложка под ладом
                </button>
                <button
                  type="button"
                  className={`style-option-btn ${fingeringStyle === "dots" ? "active" : ""}`}
                  onClick={() => onSetFingeringStyle("dots")}
                  title="Минималистичные цветные точки рядом с ладом"
                >
                  · Точки рядом
                </button>
                <button
                  type="button"
                  className={`style-option-btn ${fingeringStyle === "numbers" ? "active" : ""}`}
                  onClick={() => onSetFingeringStyle("numbers")}
                  title="Кружки с номерами пальцев 1..4 рядом с ладом"
                >
                  ① С номерами
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
