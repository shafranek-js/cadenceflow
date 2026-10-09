import type { ChordDefinition } from "../../domain/harmony/chord";
import { getFunctionSemantics } from "../../domain/harmony/functionSemantics";
import { useInspectorDisclosure } from "./useInspectorDisclosure";

const HARMONY_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.preview-harmony-open";

export function HarmonyDetails({ chord }: { readonly chord: ChordDefinition | null }) {
  if (!chord) return null;
  return <HarmonyDetailsContent chord={chord} />;
}

function HarmonyDetailsContent({ chord }: { readonly chord: ChordDefinition }) {
  const disclosure = useInspectorDisclosure(HARMONY_DISCLOSURE_STORAGE_KEY, false);
  const fn = chord.harmonicFunction;
  const target = fn.targetFunctionId;
  const naturalVariant =
    fn.moduleId === "dark-harmony" && fn.functionId === "V"
      ? "Natural-minor variant: v"
      : fn.moduleId === "dark-harmony" && fn.functionId === "vii°"
        ? "Natural-minor variant: VII"
        : null;
  const concept =
    fn.category === "neapolitan"
      ? "Neapolitan color (♭II / N6): a chromatic predominant that strongly points toward V."
      : fn.category === "secondary-diminished"
        ? `Secondary leading-tone diminished chord tonicizing ${target ?? "its target"}.`
        : fn.category === "chromatic-color"
          ? "Chromatic color / voice-leading resource in the Dark Harmony vocabulary."
          : null;

  const semantics = getFunctionSemantics(fn.functionId);

  return (
    <details
      className="harmony-details inspector-disclosure"
      aria-label="Harmony details"
      data-context="preview-harmony"
      open={disclosure.isOpen}
      onToggle={(event) => disclosure.setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>Preview harmony</span>
        <span className="disclosure-status">{fn.functionId}</span>
      </summary>
      <div className="harmony-details-body">
        <h3>Harmony</h3>
        <dl>
          <div>
            <dt>Function</dt>
            <dd>{fn.functionId}</dd>
          </div>
          <div>
            <dt>Chord</dt>
            <dd>{chord.spelling.symbol}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{fn.category.replaceAll("-", " ")}</dd>
          </div>
          {target ? (
            <div>
              <dt>Target</dt>
              <dd>{target}</dd>
            </div>
          ) : null}
        </dl>
        {concept ? <p>{concept}</p> : null}
        {naturalVariant ? <p className="variant-note">{naturalVariant}</p> : null}

        <div className="harmony-semantics-section">
          <h4 className="harmony-semantic-title">{semantics.title}</h4>
          <p className="harmony-semantic-desc">{semantics.description}</p>

          <div className="harmony-semantic-field">
            <span className="harmony-field-label">Характер / Окрас</span>
            <span className="harmony-field-val">{semantics.emotionalColor}</span>
          </div>

          <div className="harmony-semantic-rule" data-tendency-type={semantics.tendencyType}>
            <span className="harmony-rule-icon" aria-hidden="true">
              {semantics.tendencyType === "dominant-resolution" ||
              semantics.tendencyType === "diminished-tension"
                ? "⊘"
                : "∞"}
            </span>
            <span>{semantics.rule}</span>
          </div>

          {semantics.styleHints.length > 0 ? (
            <div className="harmony-style-pills-wrap">
              <span className="harmony-field-label">Стили и жанры</span>
              <div className="harmony-style-pills">
                {semantics.styleHints.map((style) => (
                  <span key={style} className="harmony-style-pill">
                    {style}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}
