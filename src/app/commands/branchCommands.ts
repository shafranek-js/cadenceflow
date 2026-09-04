import type { CompositionIntent, TemporaryBranch } from "../../domain/progression/branch";
import { appendBranchStep, commitBranch, setBranchRejoin, startTemporaryBranch } from "../../domain/progression/branch";
import type { Progression } from "../../domain/progression/progression";
import type { Project } from "../../domain/project/project";
import { createMatrixChordStep } from "./matrixCommands";
import type { AppliedCommand, ProjectCommand } from ".";

interface BranchStateSnapshot {
  readonly progression: Progression;
  readonly temporaryBranch?: TemporaryBranch;
}

function snapshot(project: Project): BranchStateSnapshot {
  return project.temporaryBranch
    ? Object.freeze({ progression: project.progression, temporaryBranch: project.temporaryBranch })
    : Object.freeze({ progression: project.progression });
}

function withBranch(project: Project, branch: TemporaryBranch | undefined, progression: Progression, nowIso: string): Project {
  const { temporaryBranch: _old, ...rest } = project;
  return Object.freeze({ ...rest, progression, updatedAt: nowIso, ...(branch ? { temporaryBranch: branch } : {}) });
}

export interface RestoreBranchStatePayload extends BranchStateSnapshot { readonly nowIso: string; }
export type RestoreBranchStateCommand = ProjectCommand<RestoreBranchStatePayload> & { readonly type: "branch/restore-state" };

export function restoreBranchState(project: Project, command: RestoreBranchStateCommand): AppliedCommand {
  const previous = snapshot(project);
  return {
    project: withBranch(project, command.payload.temporaryBranch, command.payload.progression, command.payload.nowIso),
    inverse: { type: "branch/restore-state", payload: { ...previous, nowIso: command.payload.nowIso } },
  };
}

export interface StartBranchPayload { readonly branchId: string; readonly originStepId?: string; readonly compositionIntent?: CompositionIntent; readonly nowIso: string; }
export type StartBranchCommand = ProjectCommand<StartBranchPayload> & { readonly type: "branch/start" };
export function startBranch(project: Project, command: StartBranchCommand): AppliedCommand {
  if (project.temporaryBranch) throw new Error("Only one temporary branch may be active in v1");
  const previous = snapshot(project);
  const branch = startTemporaryBranch(project.progression, command.payload.branchId, command.payload.originStepId, command.payload.compositionIntent ?? "neutral");
  return {
    project: withBranch(project, branch, project.progression, command.payload.nowIso),
    inverse: { type: "branch/restore-state", payload: { ...previous, nowIso: command.payload.nowIso } },
  };
}

export interface AddBranchPreviewPayload { readonly functionId: string; readonly stepId: string; readonly nowIso: string; }
export type AddBranchPreviewCommand = ProjectCommand<AddBranchPreviewPayload> & { readonly type: "branch/add-preview" };
export function addBranchPreview(project: Project, command: AddBranchPreviewCommand): AppliedCommand {
  if (!project.temporaryBranch) throw new Error("No active temporary branch");
  const previous = snapshot(project);
  const step = createMatrixChordStep(project, command.payload.functionId, command.payload.stepId);
  const branch = appendBranchStep(project.temporaryBranch, step);
  return {
    project: withBranch(project, branch, project.progression, command.payload.nowIso),
    inverse: { type: "branch/restore-state", payload: { ...previous, nowIso: command.payload.nowIso } },
  };
}

export interface SetBranchRejoinPayload { readonly rejoinStepId?: string; readonly nowIso: string; }
export type SetBranchRejoinCommand = ProjectCommand<SetBranchRejoinPayload> & { readonly type: "branch/set-rejoin" };
export function setBranchRejoinCommand(project: Project, command: SetBranchRejoinCommand): AppliedCommand {
  if (!project.temporaryBranch) throw new Error("No active temporary branch");
  const previous = snapshot(project);
  const branch = setBranchRejoin(project.progression, project.temporaryBranch, command.payload.rejoinStepId);
  return {
    project: withBranch(project, branch, project.progression, command.payload.nowIso),
    inverse: { type: "branch/restore-state", payload: { ...previous, nowIso: command.payload.nowIso } },
  };
}

export interface SetBranchIntentPayload { readonly compositionIntent: CompositionIntent; readonly nowIso: string; }
export type SetBranchIntentCommand = ProjectCommand<SetBranchIntentPayload> & { readonly type: "branch/set-intent" };
export function setBranchIntent(project: Project, command: SetBranchIntentCommand): AppliedCommand {
  if (!project.temporaryBranch) throw new Error("No active temporary branch");
  const previous = snapshot(project);
  const branch = Object.freeze({ ...project.temporaryBranch, compositionIntent: command.payload.compositionIntent });
  return {
    project: withBranch(project, branch, project.progression, command.payload.nowIso),
    inverse: { type: "branch/restore-state", payload: { ...previous, nowIso: command.payload.nowIso } },
  };
}

export interface CommitBranchPayload { readonly selectedBranchStepIds?: readonly string[]; readonly nowIso: string; }
export type CommitBranchCommand = ProjectCommand<CommitBranchPayload> & { readonly type: "branch/commit" };
export function commitBranchCommand(project: Project, command: CommitBranchCommand): AppliedCommand {
  if (!project.temporaryBranch) throw new Error("No active temporary branch");
  const previous = snapshot(project);
  const progression = commitBranch(project.progression, project.temporaryBranch, command.payload.selectedBranchStepIds);
  return {
    project: withBranch(project, undefined, progression, command.payload.nowIso),
    inverse: { type: "branch/restore-state", payload: { ...previous, nowIso: command.payload.nowIso } },
  };
}

export interface DiscardBranchPayload { readonly nowIso: string; }
export type DiscardBranchCommand = ProjectCommand<DiscardBranchPayload> & { readonly type: "branch/discard" };
export function discardBranch(project: Project, command: DiscardBranchCommand): AppliedCommand {
  if (!project.temporaryBranch) return { project, inverse: command };
  const previous = snapshot(project);
  return {
    project: withBranch(project, undefined, project.progression, command.payload.nowIso),
    inverse: { type: "branch/restore-state", payload: { ...previous, nowIso: command.payload.nowIso } },
  };
}

export type BranchCommand = StartBranchCommand | AddBranchPreviewCommand | SetBranchRejoinCommand | SetBranchIntentCommand | CommitBranchCommand | DiscardBranchCommand | RestoreBranchStateCommand;
export function applyBranchCommand(project: Project, command: BranchCommand): AppliedCommand {
  switch (command.type) {
    case "branch/start": return startBranch(project, command);
    case "branch/add-preview": return addBranchPreview(project, command);
    case "branch/set-rejoin": return setBranchRejoinCommand(project, command);
    case "branch/set-intent": return setBranchIntent(project, command);
    case "branch/commit": return commitBranchCommand(project, command);
    case "branch/discard": return discardBranch(project, command);
    case "branch/restore-state": return restoreBranchState(project, command);
  }
}
