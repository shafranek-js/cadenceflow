import { useEffect, useRef, useState } from "react";
import type { HarmonicModuleId } from "../../domain/harmony/functions";
import type { GenreFocusId } from "../../domain/harmony/functionSemantics";
import { BUILT_IN_PRESETS } from "../../domain/progression/builtInPresets";
import { getQuickStartersForModule } from "../../domain/progression/cadenceFormulas";
import type { FunctionalPreset, PresetApplyMode } from "../../domain/progression/presets";

export interface GuidedStartProps {
  readonly activeModule: HarmonicModuleId;
  readonly genreFocus?: GenreFocusId | undefined;
  readonly onApplyPreset?: ((preset: FunctionalPreset, mode: PresetApplyMode) => void) | undefined;
  readonly onOpenPresets?: (() => void) | undefined;
  readonly onFocusMatrix?: ((measureNumber: number) => void) | undefined;
  readonly onFocusMatrixKey?: (() => void) | undefined;
  readonly onDismiss: () => void;
}

type GuidedStartMode = "choices" | "guided";

function exampleForModule(activeModule: HarmonicModuleId): FunctionalPreset {
  return (
    BUILT_IN_PRESETS.find((preset) =>
      preset.steps.every((step) => step.harmonicFunction.moduleId === activeModule),
    ) ?? BUILT_IN_PRESETS[0]!
  );
}

export function GuidedStart({
  activeModule,
  genreFocus,
  onApplyPreset,
  onOpenPresets,
  onFocusMatrix,
  onFocusMatrixKey,
  onDismiss,
}: GuidedStartProps) {
  const [mode, setMode] = useState<GuidedStartMode>("choices");
  const flowRef = useRef<HTMLDivElement>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const quickStarter = getQuickStartersForModule(activeModule, genreFocus)[0];
  const example = exampleForModule(activeModule);

  useEffect(() => {
    if (mode === "guided") flowRef.current?.focus();
    else choicesRef.current?.focus();
  }, [mode]);

  const applyStartPreset = (preset: FunctionalPreset) => {
    onApplyPreset?.(preset, "replace");
  };

  return (
    <section
      className="guided-start"
      data-testid="guided-start"
      aria-labelledby="guided-start-title"
    >
      <div className="guided-start-heading">
        <span className="guided-start-kicker">Start here</span>
        <h3 id="guided-start-title">How would you like to begin?</h3>
        <p>
          Pick one starting point. Previewing is safe; only an explicit Add or Apply changes your
          progression.
        </p>
      </div>

      {mode === "choices" ? (
        <div
          ref={choicesRef}
          className="guided-start-paths"
          data-testid="guided-start-paths"
          tabIndex={-1}
        >
          <article className="guided-start-path" data-testid="guided-start-path-blank">
            <div className="guided-start-path-heading">
              <span className="guided-start-path-icon" aria-hidden="true">
                □
              </span>
              <h4>Blank project</h4>
            </div>
            <p>Keep this project empty and explore the Matrix at your own pace.</p>
            <button
              type="button"
              className="secondary-btn"
              data-testid="guided-start-blank"
              onClick={onDismiss}
            >
              Continue with blank project
            </button>
          </article>

          <article className="guided-start-path" data-testid="guided-start-path-guided">
            <div className="guided-start-path-heading">
              <span className="guided-start-path-icon" aria-hidden="true">
                1→2→3
              </span>
              <h4>Guided progression</h4>
            </div>
            <p>Choose a key, preview a chord in Matrix, then make the first Add yourself.</p>
            <button
              type="button"
              className="secondary-btn"
              data-testid="guided-start-guided"
              onClick={() => setMode("guided")}
            >
              Show the guided steps
            </button>
          </article>

          <article className="guided-start-path" data-testid="guided-start-path-quick-starter">
            <div className="guided-start-path-heading">
              <span className="guided-start-path-icon" aria-hidden="true">
                ⚡
              </span>
              <h4>Quick starter</h4>
            </div>
            <p>Apply a short canonical formula in the current key as one undoable action.</p>
            <div className="quick-starters-container" data-testid="quick-starters-container">
              <span className="quick-starters-label">⚡ Quick Starters:</span>
              <div className="quick-starters-pills">
                {getQuickStartersForModule(activeModule, genreFocus)
                  .slice(0, 5)
                  .map((formula) => (
                    <button
                      key={formula.id}
                      type="button"
                      className="quick-starter-pill"
                      data-testid={`quick-starter-${formula.id}`}
                      data-guided-start-quick-starter={
                        formula.id === quickStarter?.id ? "true" : undefined
                      }
                      disabled={!onApplyPreset}
                      onClick={() => applyStartPreset(formula)}
                      title={`${formula.name}: ${formula.description}`}
                    >
                      <span className="pill-bolt" aria-hidden="true">
                        ⚡
                      </span>
                      <span className="pill-title">{formula.name}</span>
                    </button>
                  ))}
                {onOpenPresets ? (
                  <button
                    type="button"
                    className="quick-starter-pill quick-starter-more-btn"
                    onClick={onOpenPresets}
                    data-testid="quick-starter-more-btn"
                  >
                    More...
                  </button>
                ) : null}
              </div>
            </div>
          </article>

          <article className="guided-start-path" data-testid="guided-start-path-example">
            <div className="guided-start-path-heading">
              <span className="guided-start-path-icon" aria-hidden="true">
                ♫
              </span>
              <h4>Example</h4>
            </div>
            <p>Load a curated example progression; it is also a single undoable preset action.</p>
            <button
              type="button"
              className="primary-btn"
              data-testid="guided-start-example"
              disabled={!onApplyPreset}
              onClick={() => applyStartPreset(example)}
            >
              Use {example.name}
            </button>
            {onOpenPresets ? (
              <button
                type="button"
                className="guided-start-browse"
                data-testid="guided-start-browse-presets"
                onClick={onOpenPresets}
              >
                Browse more starters and examples
              </button>
            ) : null}
          </article>
        </div>
      ) : null}

      {mode === "guided" ? (
        <div
          ref={flowRef}
          className="guided-start-flow"
          data-testid="guided-start-flow"
          tabIndex={-1}
        >
          <div>
            <h4>Guided progression steps</h4>
            <p>Nothing is added while you preview. Use the existing Matrix Add route when ready.</p>
          </div>
          <ol>
            <li>
              <strong>Choose a key</strong>
              <span>Set the key in the Harmonic Matrix.</span>
              <button
                type="button"
                className="secondary-btn"
                data-testid="guided-start-focus-key"
                onClick={() => {
                  onFocusMatrixKey?.();
                  if (!onFocusMatrixKey) onFocusMatrix?.(1);
                }}
              >
                Focus key selector
              </button>
            </li>
            <li>
              <strong>Preview a chord</strong>
              <span>Click a Matrix card to hear and preview its harmonic meaning.</span>
            </li>
            <li>
              <strong>Add the first Step</strong>
              <span>With the card selected, press +, Ctrl-click, or Ctrl+Enter to add it.</span>
            </li>
          </ol>
          <div className="guided-start-flow-actions">
            <button
              type="button"
              className="secondary-btn"
              data-testid="guided-start-guided-back"
              onClick={() => setMode("choices")}
            >
              Back to choices
            </button>
            <button
              type="button"
              className="guided-start-dismiss"
              data-testid="guided-start-dismiss"
              onClick={onDismiss}
            >
              Dismiss guidance
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
