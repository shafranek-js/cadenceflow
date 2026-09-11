import type { AppliedCommand, ProjectCommand } from ".";
import type { Project } from "../../domain/project/project";
import {
  snapshotHarmonyTrackSettings,
  validateHarmonyTrackSettings,
  type HarmonyTrackSettings,
} from "../../domain/harmony/track";

export type HarmonyCommandErrorReason = "invalid-settings-patch";

export class HarmonyCommandError extends RangeError {
  readonly reason: HarmonyCommandErrorReason;

  constructor(message: string, reason: HarmonyCommandErrorReason) {
    super(message);
    this.name = "HarmonyCommandError";
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface HarmonyStateSnapshot {
  readonly harmonyTrack: HarmonyTrackSettings;
  readonly updatedAt: string;
}

export type RestoreHarmonyStatePayload = HarmonyStateSnapshot;
export type RestoreHarmonyStateCommand = ProjectCommand<RestoreHarmonyStatePayload> & {
  readonly type: "harmony/restore-state";
};

export interface SetHarmonyTrackSettingsPayload {
  readonly settings?: HarmonyTrackSettings;
  readonly patch?: Partial<HarmonyTrackSettings>;
  readonly nowIso: string;
}

export type SetHarmonyTrackSettingsCommand = ProjectCommand<SetHarmonyTrackSettingsPayload> & {
  readonly type: "harmony/set-track-settings";
};

export function createPatchHarmonyTrackSettingsCommand(
  patch: Partial<HarmonyTrackSettings>,
  nowIso: string,
): SetHarmonyTrackSettingsCommand {
  return {
    type: "harmony/set-track-settings",
    payload: { patch, nowIso },
  };
}

function snapshotState(project: Project): HarmonyStateSnapshot {
  return {
    harmonyTrack: snapshotHarmonyTrackSettings(project.harmonyTrack),
    updatedAt: project.updatedAt,
  };
}

function withHarmonyState(project: Project, snapshot: HarmonyStateSnapshot): Project {
  return Object.freeze({
    ...project,
    harmonyTrack: snapshotHarmonyTrackSettings(snapshot.harmonyTrack),
    updatedAt: snapshot.updatedAt,
  });
}

function resolveTrackSettings(
  project: Project,
  payload: SetHarmonyTrackSettingsPayload,
): HarmonyTrackSettings {
  if (payload.settings !== undefined && payload.patch !== undefined) {
    throw new HarmonyCommandError(
      "Harmony Track settings command accepts either settings or patch, not both",
      "invalid-settings-patch",
    );
  }
  if (payload.settings !== undefined) return snapshotHarmonyTrackSettings(payload.settings);
  if (payload.patch === undefined) {
    throw new HarmonyCommandError(
      "Harmony Track settings command requires settings or patch",
      "invalid-settings-patch",
    );
  }

  const patch = payload.patch;
  if (patch.muted === true && patch.solo === true) {
    throw new HarmonyCommandError(
      "Harmony Track cannot be muted and solo at the same time",
      "invalid-settings-patch",
    );
  }
  const next = {
    ...project.harmonyTrack,
    ...patch,
    ...(patch.muted === true && patch.solo === undefined ? { solo: false } : {}),
    ...(patch.solo === true && patch.muted === undefined ? { muted: false } : {}),
  };
  return validateHarmonyTrackSettings(next);
}

export function restoreHarmonyState(
  project: Project,
  command: RestoreHarmonyStateCommand,
): AppliedCommand {
  const previous = snapshotState(project);
  return {
    project: withHarmonyState(project, command.payload),
    inverse: { type: "harmony/restore-state", payload: previous },
  };
}

export function setHarmonyTrackSettings(
  project: Project,
  command: SetHarmonyTrackSettingsCommand,
): AppliedCommand {
  const previous = snapshotState(project);
  const settings = resolveTrackSettings(project, command.payload);
  const next: HarmonyStateSnapshot = {
    harmonyTrack: settings,
    updatedAt: command.payload.nowIso,
  };
  return {
    project: withHarmonyState(project, next),
    forward: { type: "harmony/restore-state", payload: next },
    inverse: { type: "harmony/restore-state", payload: previous },
  };
}
