import type { Project } from "../../domain/project/project";
import type { ProjectCommand } from "./index";
import {
  setTempo,
  setGroove,
  setStepDuration,
  restoreMeterAndSteps,
  type SetTempoCommand,
  type SetGrooveCommand,
  type SetStepDurationCommand,
  type RestoreMeterAndStepsCommand,
} from "./timingCommands";
import {
  restoreProgression,
  removeStep,
  type RestoreProgressionCommand,
  type RemoveStepCommand,
  repeatChordStep,
  type RepeatChordStepCommand,
} from "./progressionCommands";
import {
  addBranchPreview,
  restoreBranchState,
  type AddBranchPreviewCommand,
  type RestoreBranchStateCommand,
} from "./branchCommands";
import { addMatrixPreview, type AddMatrixPreviewCommand } from "./matrixCommands";
import {
  restoreModuleTemplate,
  restoreAllTemplates,
  restoreGlobalMatrixTemplate,
  type RestoreModuleTemplateCommand,
  type RestoreAllTemplateCommand,
  type RestoreGlobalMatrixTemplateCommand,
} from "./matrixTemplateCommands";
import {
  setGlobalCardView,
  setCardViewOverride,
  type SetGlobalCardViewCommand,
  type SetCardViewOverrideCommand,
} from "./matrixViewCommands";
import { setTonic, type SetTonicCommand } from "./harmonyContextCommands";
import {
  applyModesFormula,
  restoreModesFormulaState,
  type ApplyModesFormulaCommand,
  type RestoreModesFormulaStateCommand,
} from "./modesExplorerCommands";
import { restoreCustomPresets, type RestoreCustomPresetsCommand } from "./presetCommands";
import { renameProject, type RenameProjectCommand } from "./projectCommands";
import {
  setTheme,
  setExpertiseMode,
  setStaffBassVisibility,
  setProgressionView,
  setMeasuresPerSystem,
  setNoteColorMode,
  setSuzukiColors,
  setResolutionArrows,
  setGenreFocus,
  setGuitarChordOrientation,
  setSidePanelMode,
  type SetThemeCommand,
  type SetExpertiseModeCommand,
  type SetStaffBassVisibilityCommand,
  type SetProgressionViewCommand,
  type SetMeasuresPerSystemCommand,
  type SetNoteColorModeCommand,
  type SetSuzukiColorsCommand,
  type SetResolutionArrowsCommand,
  type SetGenreFocusCommand,
  type SetGuitarChordOrientationCommand,
  type SetSidePanelModeCommand,
} from "./presentationCommands";
import { restoreMelodyState, type RestoreMelodyStateCommand } from "./melodyCommands";
import { restoreHarmonyState, type RestoreHarmonyStateCommand } from "./harmonyCommands";
import { setSongSections, type SetSongSectionsCommand } from "./sectionCommands";
import { applyAuthoredMelodyTransaction, restoreAuthoredMelodyTransaction, type AuthoredMelodyTransactionCommand, type RestoreAuthoredMelodyCommand } from "./authoredMelodyTransaction";

export function applyInverseCommand(project: Project, command: ProjectCommand): Project {
  switch (command.type) {
    case "timing/restore-meter-and-steps":
      return restoreMeterAndSteps(project, command as RestoreMeterAndStepsCommand).project;
    case "timing/set-tempo":
      return setTempo(project, command as SetTempoCommand).project;
    case "timing/set-groove":
      return setGroove(project, command as SetGrooveCommand).project;
    case "timing/set-step-duration":
      return setStepDuration(project, command as SetStepDurationCommand).project;
    case "progression/restore":
      return restoreProgression(project, command as RestoreProgressionCommand).project;
    case "progression/set-sections":
      return setSongSections(project, command as SetSongSectionsCommand).project;
    case "progression/remove-step":
      return removeStep(project, command as RemoveStepCommand).project;
    case "progression/repeat-chord":
      return repeatChordStep(project, command as RepeatChordStepCommand).project;
    case "presets/restore-custom":
      return restoreCustomPresets(project, command as RestoreCustomPresetsCommand).project;
    case "branch/restore-state":
      return restoreBranchState(project, command as RestoreBranchStateCommand).project;
    case "branch/add-preview":
      return addBranchPreview(project, command as AddBranchPreviewCommand).project;
    case "matrix/add-preview":
      return addMatrixPreview(project, command as AddMatrixPreviewCommand).project;
    case "matrix-template/restore-module":
      return restoreModuleTemplate(project, command as RestoreModuleTemplateCommand).project;
    case "matrix-template/restore-all":
      return restoreAllTemplates(project, command as RestoreAllTemplateCommand).project;
    case "matrix-template/restore-global":
      return restoreGlobalMatrixTemplate(project, command as RestoreGlobalMatrixTemplateCommand)
        .project;
    case "matrix/set-global-card-view":
      return setGlobalCardView(project, command as SetGlobalCardViewCommand).project;
    case "matrix/set-card-view-override":
      return setCardViewOverride(project, command as SetCardViewOverrideCommand).project;
    case "harmony/set-tonic":
      return setTonic(project, command as SetTonicCommand).project;
    case "modes/apply-formula":
      return applyModesFormula(project, command as ApplyModesFormulaCommand).project;
    case "modes/restore-formula-state":
      return restoreModesFormulaState(project, command as RestoreModesFormulaStateCommand).project;
    case "project/rename":
      return renameProject(project, command as RenameProjectCommand).project;
    case "presentation/set-theme":
      return setTheme(project, command as SetThemeCommand).project;
    case "presentation/set-expertise-mode":
      return setExpertiseMode(project, command as SetExpertiseModeCommand).project;
    case "presentation/set-staff-bass-visibility":
      return setStaffBassVisibility(project, command as SetStaffBassVisibilityCommand).project;
    case "presentation/set-progression-view":
      return setProgressionView(project, command as SetProgressionViewCommand).project;
    case "presentation/set-measures-per-system":
      return setMeasuresPerSystem(project, command as SetMeasuresPerSystemCommand).project;
    case "presentation/set-note-color-mode":
      return setNoteColorMode(project, command as SetNoteColorModeCommand).project;
    case "presentation/set-suzuki-colors":
      return setSuzukiColors(project, command as SetSuzukiColorsCommand).project;
    case "presentation/set-resolution-arrows":
      return setResolutionArrows(project, command as SetResolutionArrowsCommand).project;
    case "presentation/set-genre-focus":
      return setGenreFocus(project, command as SetGenreFocusCommand).project;
    case "presentation/set-guitar-chord-orientation":
      return setGuitarChordOrientation(project, command as SetGuitarChordOrientationCommand)
        .project;
    case "presentation/set-side-panel-mode":
      return setSidePanelMode(project, command as SetSidePanelModeCommand).project;
    case "melody/restore-state":
      return restoreMelodyState(project, command as RestoreMelodyStateCommand).project;
    case "melody/restore-authored-transaction":
      return restoreAuthoredMelodyTransaction(project, command as RestoreAuthoredMelodyCommand).project;
    case "melody/apply-authored-transaction":
      return applyAuthoredMelodyTransaction(project, command as AuthoredMelodyTransactionCommand).project;
    case "harmony/restore-state":
      return restoreHarmonyState(project, command as RestoreHarmonyStateCommand).project;
    default:
      return project;
  }
}
