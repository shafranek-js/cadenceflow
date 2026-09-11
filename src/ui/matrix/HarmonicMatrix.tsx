import type { ChangeEvent } from "react";
import { matrixCardOverrideCount, type Project } from "../../domain/project/project";
import type { CardViewId } from "../../domain/progression/step";
import {
  modeForModule,
  type HarmonicFunctionIdentity,
  type HarmonicModuleId,
} from "../../domain/harmony/functions";
import { getHarmonicModule } from "../../domain/harmony/moduleRegistry";
import { expandedStripEntries } from "../../domain/harmony/topology";
import type { RecommendationResult } from "../../domain/recommendations/engine";
import { realizeMatrixCardPreview, resolvePreviousHarmonicContext } from "./previewRealization";
import { ChordCard } from "../chord-card/ChordCard";
import { FunctionalLayer } from "./FunctionalLayer";
import { ModuleSelector } from "./ModuleSelector";
import { TonicSelector } from "./TonicSelector";
import { MatrixResetMenu } from "../settings/MatrixResetMenu";
import { canShiftPerformanceOctave, type StaffOctaveDirection } from "../staff/staffOctave";

function cardKey(identity: HarmonicFunctionIdentity): string {
  return identity.functionId;
}

export function HarmonicMatrix({
  project,
  previewFunctionId,
  recommendations,
  contextualFunctionIds,
  onPreview,
  onAdd,
  onGlobalView,
  onModuleChange,
  onTonicChange,
  onTemplateOpen,
  onTemplateReset,
  onResetCurrentModule,
  onResetAllModules,
  onStaffOctaveChange,
  onClearSelection,
}: {
  readonly project: Project;
  readonly previewFunctionId?: string;
  readonly recommendations: RecommendationResult | null;
  readonly contextualFunctionIds: readonly HarmonicFunctionIdentity[];
  readonly onPreview: (functionId: string) => void;
  readonly onAdd: (functionId: string) => void;
  readonly onGlobalView: (view: CardViewId) => void;
  readonly onModuleChange: (moduleId: HarmonicModuleId) => void;
  readonly onTonicChange: (tonic: number) => void;
  readonly onTemplateOpen: (functionId: string) => void;
  readonly onTemplateReset: (functionId: string) => void;
  readonly onResetCurrentModule: () => void;
  readonly onResetAllModules: () => void;
  readonly onStaffOctaveChange: (functionId: string, direction: StaffOctaveDirection) => void;
  readonly onClearSelection?: () => void;
}) {
  const module = getHarmonicModule(project.activeModule);
  const best = recommendations?.bestMatch?.functionId;
  const alternatives = new Set(recommendations?.alternatives.map((item) => item.functionId) ?? []);
  const contextualByLayer = new Map<string, readonly HarmonicFunctionIdentity[]>();
  if (project.activeModule === "dark-harmony" && contextualFunctionIds.length > 0) {
    contextualByLayer.set("secondary-diminished", contextualFunctionIds);
  }

  const previousHarmonicContext = resolvePreviousHarmonicContext(project);
  const hasRecommendation = Boolean(best || alternatives.size > 0);

  const renderCard = (identity: HarmonicFunctionIdentity) => {
    const preview = realizeMatrixCardPreview(project, identity.functionId, previousHarmonicContext);
    const template = project.moduleTemplateStates[project.activeModule].cards[identity.functionId];
    const view = project.presentation.globalMatrixCardView;
    const candidate =
      recommendations?.bestMatch?.functionId === identity.functionId
        ? recommendations.bestMatch
        : recommendations?.alternatives.find((item) => item.functionId === identity.functionId);
    return (
      <ChordCard
        key={cardKey(identity)}
        model={{
          chord: preview.chord,
          realizedPitches: preview.pitches,
          pianoPitches: preview.upperPitches,
          duration: preview.step.duration,
          canRaiseStaffOctave: canShiftPerformanceOctave(preview.step.performance, 1),
          canLowerStaffOctave: canShiftPerformanceOctave(preview.step.performance, -1),
          recommendationStatus:
            best === identity.functionId
              ? "best"
              : alternatives.has(identity.functionId)
                ? "alternative"
                : "none",
          ...(candidate ? { recommendation: candidate } : {}),
        }}
        view={view}
        showBassInStaff={project.presentation.showBassInStaff}
        selected={previewFunctionId === identity.functionId}
        customizedCount={matrixCardOverrideCount(template)}
        onSelect={() => {
          onPreview(identity.functionId);
          onTemplateOpen(identity.functionId);
        }}
        onCtrlClickAdd={() => {
          onPreview(identity.functionId);
          if (!project.temporaryBranch) onAdd(identity.functionId);
          onTemplateOpen(identity.functionId);
        }}
        onAltClickReset={() => {
          onTemplateReset(identity.functionId);
          onTemplateOpen(identity.functionId);
        }}
        onStaffOctaveChange={(direction) => onStaffOctaveChange(identity.functionId, direction)}
      />
    );
  };

  const handleBackgroundClick = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const clickedInteractive = target.closest(
      ".chord-card, .matrix-toolbar, button, select, input, textarea, label, a, [role='button'], [role='menu']",
    );
    if (clickedInteractive) return;
    onClearSelection?.();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !previewFunctionId || !onClearSelection) return;
    event.preventDefault();
    event.stopPropagation();
    onClearSelection();
  };

  return (
    <section
      className="matrix-panel"
      aria-label="Harmonic Matrix"
      onClick={handleBackgroundClick}
      onKeyDown={handleKeyDown}
    >
      <header className="matrix-toolbar">
        <ModuleSelector value={project.activeModule} onChange={onModuleChange} />
        <TonicSelector
          tonic={project.tonic}
          mode={modeForModule(project.activeModule)}
          onChange={onTonicChange}
        />
        <div className="matrix-toolbar-actions">
          <select
            value={project.presentation.globalMatrixCardView}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onGlobalView(event.target.value as CardViewId)
            }
            aria-label="Global Card View"
          >
            <option value="harmonic">Harmonic</option>
            <option value="piano">Piano</option>
            <option value="staff">Staff</option>
          </select>
          <MatrixResetMenu
            onResetCurrentModule={onResetCurrentModule}
            onResetAllModules={onResetAllModules}
          />
        </div>
      </header>
      {recommendations && !hasRecommendation ? (
        <p
          className="matrix-no-recommendation"
          role="status"
          data-testid="matrix-no-recommendation"
        >
          No strong recommendation for this context. Passive choices remain available.
        </p>
      ) : null}
      <div className="matrix-workbench">
        <div className="matrix-grid">
          {module.layers.map((layer) => {
            const baselineEntries = module.topology.cards.filter(
              (entry) => entry.layerId === layer.id && entry.baseline,
            );
            const contextual = contextualByLayer.get(layer.id) ?? [];
            const expandedEntries = expandedStripEntries(contextual, layer.id, 3, 0);
            return (
              <FunctionalLayer
                key={layer.id}
                label={layer.label}
                expanded={
                  expandedEntries.length > 0
                    ? expandedEntries.map((entry) => renderCard(entry.identity))
                    : undefined
                }
              >
                {baselineEntries.map((entry) => renderCard(entry.identity))}
              </FunctionalLayer>
            );
          })}
        </div>
      </div>
    </section>
  );
}
