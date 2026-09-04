import { useState, type ChangeEvent } from "react";
import type { Project } from "../../domain/project/project";

function stepLabel(step: Project["progression"]["steps"][number], index: number): string {
  return `${index + 1}: ${step.kind === "chord" ? step.harmonicFunction.functionId : "Rest"}`;
}

export function BranchControls({ project, selectedBranchStepIds, onStart, onRejoin, onCommitWhole, onCommitSelected, onDiscard }: {
  readonly project: Project;
  readonly selectedBranchStepIds: readonly string[];
  readonly onStart: (originStepId?: string) => void;
  readonly onRejoin: (rejoinStepId?: string) => void;
  readonly onCommitWhole: () => void;
  readonly onCommitSelected: () => void;
  readonly onDiscard: () => void;
}) {
  const [origin, setOrigin] = useState("end");
  const branch = project.temporaryBranch;
  if (!branch) {
    return (
      <div className="branch-controls">
        <select aria-label="Branch origin" value={origin} onChange={(event: ChangeEvent<HTMLSelectElement>) => setOrigin(event.target.value)}>
          <option value="end">At progression end</option>
          {project.progression.steps.map((step, index) => <option key={step.id} value={step.id}>After {stepLabel(step, index)}</option>)}
        </select>
        <button type="button" onClick={() => onStart(origin === "end" ? undefined : origin)}>Explore Alternative</button>
      </div>
    );
  }
  const originIndex = branch.originAtEnd ? project.progression.steps.length - 1 : project.progression.steps.findIndex((step) => step.id === branch.originStepId);
  const rejoinOptions = project.progression.steps.slice(originIndex + 1);
  return (
    <div className="branch-controls active">
      {!branch.originAtEnd ? <select aria-label="Branch rejoin" value={branch.rejoinStepId ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => onRejoin(event.target.value || undefined)}><option value="">Choose rejoin…</option>{rejoinOptions.map((step, offset) => <option key={step.id} value={step.id}>{stepLabel(step, originIndex + 1 + offset)}</option>)}</select> : <span>Branch from progression end</span>}
      <button type="button" disabled={branch.steps.length === 0 || (!branch.originAtEnd && !branch.rejoinStepId)} onClick={onCommitWhole}>Commit Branch</button>
      <button type="button" disabled={selectedBranchStepIds.length === 0 || (!branch.originAtEnd && !branch.rejoinStepId)} onClick={onCommitSelected}>Commit Selected</button>
      <button type="button" onClick={onDiscard}>Discard</button>
    </div>
  );
}
