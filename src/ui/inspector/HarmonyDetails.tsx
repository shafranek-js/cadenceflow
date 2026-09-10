import { useState } from "react";
import type { ChordDefinition } from "../../domain/harmony/chord";

const HARMONY_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.preview-harmony-open";

function readDisclosureState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(HARMONY_DISCLOSURE_STORAGE_KEY);
    return stored === null ? false : stored === "true";
  } catch {
    return false;
  }
}

export function HarmonyDetails({ chord }: { readonly chord: ChordDefinition | null }) {
  if (!chord) return null;
  return <HarmonyDetailsContent chord={chord} />;
}

function HarmonyDetailsContent({ chord }: { readonly chord: ChordDefinition }) {
  const [open, setOpen] = useState(readDisclosureState);
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

  const persistDisclosureState = (nextOpen: boolean) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(HARMONY_DISCLOSURE_STORAGE_KEY, String(nextOpen));
    } catch {
      // Disclosure preferences are best-effort when storage is unavailable.
    }
  };

  return (
    <details
      className="harmony-details inspector-disclosure"
      aria-label="Harmony details"
      data-context="preview-harmony"
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        persistDisclosureState(nextOpen);
      }}
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
      </div>
    </details>
  );
}
