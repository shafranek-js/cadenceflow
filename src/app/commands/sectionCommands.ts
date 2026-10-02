import type { Project } from "../../domain/project/project";
import type { Progression, SongSection } from "../../domain/progression/progression";
import { normalizeSongSections } from "../../domain/progression/sections";
import type { AppliedCommand, ProjectCommand } from ".";

function applySections(project: Project, progression: Progression, nowIso: string): AppliedCommand {
  const next = normalizeSongSections(progression);
  return {
    project: Object.freeze({ ...project, progression: next, updatedAt: nowIso }),
    forward: { type: "progression/restore", payload: { progression: next, nowIso } },
    inverse: {
      type: "progression/restore",
      payload: { progression: project.progression, nowIso },
    },
  };
}

export interface SetSongSectionsPayload {
  readonly sections: readonly SongSection[];
  readonly nowIso: string;
}
export type SetSongSectionsCommand = ProjectCommand<SetSongSectionsPayload> & {
  readonly type: "progression/set-sections";
};

export function setSongSections(project: Project, command: SetSongSectionsCommand): AppliedCommand {
  const ids = new Set(command.payload.sections.map((section) => section.id));
  if (ids.size !== command.payload.sections.length)
    throw new RangeError("Song Section IDs must be unique");
  const stepIds = new Set(project.progression.steps.map((step) => step.id));
  for (const section of command.payload.sections) {
    if (!section.id.trim() || !section.name.trim())
      throw new RangeError("Song Sections need an ID and name");
    if (!stepIds.has(section.startStepId))
      throw new RangeError(`Unknown section boundary Step: ${section.startStepId}`);
  }
  return applySections(
    project,
    Object.freeze({
      ...project.progression,
      sections: Object.freeze(
        command.payload.sections.map((s) => Object.freeze({ ...s, name: s.name.trim() })),
      ),
    }),
    command.payload.nowIso,
  );
}

export interface DeleteStepsWithSectionsPayload {
  readonly stepIds: readonly string[];
  readonly nowIso: string;
}

/** One undoable delete: transfer each removed boundary forward, then backward at the end. */
export function deleteStepsAndReanchorSections(
  project: Project,
  stepIds: readonly string[],
  nowIso: string,
): AppliedCommand {
  const removed = new Set(stepIds);
  const steps = project.progression.steps;
  const nextSteps = steps.filter((step) => !removed.has(step.id));
  const remainingIds = new Set(nextSteps.map((step) => step.id));
  const sections = (project.progression.sections ?? []).flatMap((section) => {
    if (remainingIds.has(section.startStepId)) return [section];
    const oldIndex = steps.findIndex((step) => step.id === section.startStepId);
    const next = steps.slice(oldIndex + 1).find((step) => remainingIds.has(step.id));
    const previous = steps
      .slice(0, oldIndex)
      .reverse()
      .find((step) => remainingIds.has(step.id));
    const target = next ?? previous;
    return target ? [{ ...section, startStepId: target.id }] : [];
  });
  const { selectedStepId, ...rest } = project.progression;
  const progression = Object.freeze({
    ...rest,
    steps: Object.freeze(nextSteps),
    sections: Object.freeze(sections),
    ...(selectedStepId && !removed.has(selectedStepId) ? { selectedStepId } : {}),
  });
  return applySections(project, progression, nowIso);
}
