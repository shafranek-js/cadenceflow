import type { CardViewId } from "../../domain/progression/step";
import { CardViewSwitcher } from "../chord-card/CardViewSwitcher";

export function StepCardViewSwitcher({ value, stepId, onChange }: { readonly value: CardViewId; readonly stepId: string; readonly onChange: (view: CardViewId) => void }) {
  return <CardViewSwitcher value={value} onChange={onChange} label={`View for progression step ${stepId}`} />;
}
