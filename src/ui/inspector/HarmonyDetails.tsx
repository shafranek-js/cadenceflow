import type { ChordDefinition } from "../../domain/harmony/chord";

export function HarmonyDetails({ chord }: { readonly chord: ChordDefinition | null }) {
  if (!chord) return null;
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

  return (
    <section
      className="harmony-details"
      aria-label="Harmony details"
      data-context="preview-harmony"
    >
      <span className="inspector-context-kicker">Preview harmony</span>
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
    </section>
  );
}
