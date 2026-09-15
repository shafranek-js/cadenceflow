import { useRef, useState, type ChangeEvent } from "react";
import { matrixCardOverrideCount, type Project } from "../../domain/project/project";
import type { CardViewId } from "../../domain/progression/step";
import {
  modeForModule,
  type HarmonicFunctionIdentity,
  type HarmonicModuleId,
} from "../../domain/harmony/functions";
import { getHarmonicModule } from "../../domain/harmony/moduleRegistry";
import { expandedStripEntries } from "../../domain/harmony/topology";
import { getZoneForLayer, getResolutionTarget } from "../../domain/harmony/tendencyArrows";
import { formatChordSymbol } from "../../domain/harmony/chord";
import type { RecommendationResult } from "../../domain/recommendations/engine";
import { realizeMatrixCardPreview, resolvePreviousHarmonicContext } from "./previewRealization";
import { ChordCard } from "../chord-card/ChordCard";
import { FunctionalLayer } from "./FunctionalLayer";
import { MatrixResolutionArrows } from "./MatrixResolutionArrows";
import { ModuleSelector } from "./ModuleSelector";
import { TonicSelector } from "./TonicSelector";
import { ViewModeToggle } from "../common/ViewModeToggle";
import { isFunctionRelevantToGenre, type GenreFocusId } from "../../domain/harmony/functionSemantics";
import { canShiftPerformanceOctave, type StaffOctaveDirection } from "../staff/staffOctave";
import { isAppShortcutProtectedTarget } from "../studio/focusManagement";

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
  onResetCurrentModule: _onResetCurrentModule,
  onStaffOctaveChange,
  onClearSelection,
  onOpenMatrixMenu,
  onGenreFocusChange,
  onOpenPresets,
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
  readonly onResetCurrentModule?: () => void;
  readonly onResetAllModules?: () => void;
  readonly onStaffOctaveChange: (functionId: string, direction: StaffOctaveDirection) => void;
  readonly onClearSelection?: () => void;
  readonly onOpenMatrixMenu?: (anchor: HTMLElement, position: { x: number; y: number }) => void;
  readonly onGenreFocusChange?: (genre: GenreFocusId) => void;
  readonly onOpenPresets?: () => void;
}) {
  const module = getHarmonicModule(project.activeModule);
  const best = recommendations?.bestMatch?.functionId;
  const alternatives = new Set(recommendations?.alternatives.map((item) => item.functionId) ?? []);
  const contextualByLayer = new Map<string, readonly HarmonicFunctionIdentity[]>();
  if (project.activeModule === "dark-harmony" && contextualFunctionIds.length > 0) {
    contextualByLayer.set("secondary-diminished", contextualFunctionIds);
  }

  const workbenchRef = useRef<HTMLDivElement>(null);
  const [hoveredFunctionId, setHoveredFunctionId] = useState<string | null>(null);

  const previousHarmonicContext = resolvePreviousHarmonicContext(project);
  const hasRecommendation = Boolean(best || alternatives.size > 0);

  const activeSourceFunctionId = hoveredFunctionId ?? previewFunctionId ?? null;
  const targetFunctionId = activeSourceFunctionId
    ? getResolutionTarget(activeSourceFunctionId, project.activeModule)
    : null;

  const targetSymbol = targetFunctionId
    ? (() => {
        try {
          const preview = realizeMatrixCardPreview(project, targetFunctionId, previousHarmonicContext);
          return formatChordSymbol(preview.chord);
        } catch {
          return undefined;
        }
      })()
    : undefined;

  const renderCard = (
    identity: HarmonicFunctionIdentity,
    position?: { readonly column: number; readonly row: number },
  ) => {
    const preview = realizeMatrixCardPreview(project, identity.functionId, previousHarmonicContext);
    const template = project.moduleTemplateStates[project.activeModule].cards[identity.functionId];
    const view = project.presentation.globalMatrixCardView;
    const candidate =
      recommendations?.bestMatch?.functionId === identity.functionId
        ? recommendations.bestMatch
        : recommendations?.alternatives.find((item) => item.functionId === identity.functionId);

    const targetIdForCard = getResolutionTarget(identity.functionId, project.activeModule);
    const cardResolutionTargetSymbol = targetIdForCard
      ? (() => {
          try {
            const targetPreview = realizeMatrixCardPreview(project, targetIdForCard, previousHarmonicContext);
            return formatChordSymbol(targetPreview.chord);
          } catch {
            return undefined;
          }
        })()
      : undefined;

    const activeGenre = project.presentation.genreFocus ?? "all";
    const isGenreFocused =
      activeGenre !== "all" && isFunctionRelevantToGenre(identity.functionId, activeGenre);
    const isGenreDimmed = activeGenre !== "all" && !isGenreFocused;

    return (
      <ChordCard
        key={cardKey(identity)}
        style={
          position
            ? {
                gridColumnStart: position.column + 1,
                gridRowStart: 1,
              }
            : undefined
        }
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
        suzukiColors={project.presentation.suzukiColors ?? false}
        selected={previewFunctionId === identity.functionId}
        customizedCount={matrixCardOverrideCount(template)}
        resolutionTargetSymbol={cardResolutionTargetSymbol}
        isResolutionTarget={Boolean(targetFunctionId && identity.functionId === targetFunctionId)}
        isGenreFocused={isGenreFocused}
        isGenreDimmed={isGenreDimmed}
        onMouseEnter={() => setHoveredFunctionId(identity.functionId)}
        onMouseLeave={() => setHoveredFunctionId((curr) => (curr === identity.functionId ? null : curr))}
        onClickResolutionTarget={
          targetIdForCard
            ? () => {
                onPreview(targetIdForCard);
                onTemplateOpen(targetIdForCard);
              }
            : undefined
        }
        onSelect={() => {
          onPreview(identity.functionId);
          onTemplateOpen(identity.functionId);
        }}
        onCtrlClickAdd={() => {
          onPreview(identity.functionId);
          if (!project.temporaryBranch) onAdd(identity.functionId);
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
    if (
      isAppShortcutProtectedTarget(event.target) ||
      event.key !== "Escape" ||
      !previewFunctionId ||
      !onClearSelection
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    onClearSelection();
  };

  const handleToolbarContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenMatrixMenu?.(event.currentTarget, { x: event.clientX, y: event.clientY });
  };

  return (
    <section
      className="matrix-panel"
      aria-label="Harmonic Matrix"
      data-module={project.activeModule}
      onClick={handleBackgroundClick}
      onKeyDown={handleKeyDown}
    >
      <header className="matrix-toolbar" onContextMenu={handleToolbarContextMenu}>
        <ModuleSelector value={project.activeModule} onChange={onModuleChange} />
        <TonicSelector
          tonic={project.tonic}
          mode={modeForModule(project.activeModule)}
          onChange={onTonicChange}
        />
        <div className="matrix-toolbar-actions">
          {onOpenPresets && (
            <button
              type="button"
              className="matrix-formulas-btn"
              onClick={onOpenPresets}
              data-testid="matrix-formulas-trigger"
              title="Open Presets & Cadence Formulas"
              aria-label="Open Presets and Cadence Formulas"
            >
              <span className="btn-bolt" aria-hidden="true">⚡</span>
              <span className="btn-label">Formulas</span>
            </button>
          )}
          <ViewModeToggle
            currentView={project.presentation.globalMatrixCardView}
            onChangeView={onGlobalView}
            selectAriaLabel="Global Card View"
            testIdPrefix="matrix-view"
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
      <div className="matrix-workbench" ref={workbenchRef}>
        <MatrixResolutionArrows
          containerRef={workbenchRef}
          sourceFunctionId={activeSourceFunctionId}
          targetFunctionId={targetFunctionId}
          targetSymbol={targetSymbol}
          enabled={project.presentation.resolutionArrows !== false}
        />
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
                zone={getZoneForLayer(layer.id)}
                expanded={
                  expandedEntries.length > 0
                    ? expandedEntries.map((entry) => renderCard(entry.identity))
                    : undefined
                }
              >
                {baselineEntries.map((entry) => renderCard(entry.identity, entry.position))}
              </FunctionalLayer>
            );
          })}
        </div>
      </div>
    </section>
  );
}
