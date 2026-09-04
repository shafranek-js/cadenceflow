import { compareBranch } from "../../domain/progression/branch";
import type { Project } from "../../domain/project/project";

function label(step: Project["progression"]["steps"][number]): string {
  return step.kind === "chord" ? step.harmonicFunction.functionId : "Rest";
}

export function BranchComparison({
  project,
  selectedStepIds,
  onSelectedStepIdsChange,
}: {
  readonly project: Project;
  readonly selectedStepIds: readonly string[];
  readonly onSelectedStepIdsChange: (stepIds: readonly string[]) => void;
}) {
  if (!project.temporaryBranch) return null;
  const comparison = compareBranch(project.progression, project.temporaryBranch);
  const toggle = (stepId: string) =>
    onSelectedStepIdsChange(
      selectedStepIds.includes(stepId)
        ? selectedStepIds.filter((id) => id !== stepId)
        : [...selectedStepIds, stepId],
    );
  return (
    <section className="branch-comparison" aria-label="Original versus Alternative">
      <div>
        <h3>Original</h3>
        <div className="branch-path">
          {comparison.originalInterval.length ? (
            comparison.originalInterval.map((step) => <span key={step.id}>{label(step)}</span>)
          ) : (
            <em>No replaced steps</em>
          )}
        </div>
      </div>
      <div>
        <h3>Alternative</h3>
        <div className="branch-path">
          {comparison.alternative.length ? (
            comparison.alternative.map((step) => (
              <label key={step.id} className="branch-step">
                <input
                  type="checkbox"
                  checked={selectedStepIds.includes(step.id)}
                  onChange={() => toggle(step.id)}
                />
                {label(step)}
              </label>
            ))
          ) : (
            <em>Preview chords to build the branch</em>
          )}
        </div>
      </div>
    </section>
  );
}
