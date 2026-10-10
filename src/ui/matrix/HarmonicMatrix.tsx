import { useEffect, useRef, useState } from "react";
import { matrixCardOverrideCount, type Project } from "../../domain/project/project";
import type { TransportStore } from "../transport/transportStore";
import type { CardViewId } from "../../domain/progression/step";
import {
  modeForModule,
  type HarmonicFunctionIdentity,
  type HarmonicModuleId,
} from "../../domain/harmony/functions";
import { getHarmonicModule, topologyEntryForFunction } from "../../domain/harmony/moduleRegistry";
import type { MatrixCardTopologyEntry } from "../../domain/harmony/topology";
import { getZoneForLayer } from "../../domain/harmony/tendencyArrows";
import { formatChordSymbol } from "../../domain/harmony/chord";
import type { RecommendationResult } from "../../domain/recommendations/engine";
import { realizeMatrixCardPreview, resolvePreviousHarmonicContext } from "./previewRealization";
import { ChordCard } from "../chord-card/ChordCard";
import { FunctionalLayer } from "./FunctionalLayer";
import { MatrixResolutionArrows } from "./MatrixResolutionArrows";
import { ModuleSelector } from "./ModuleSelector";
import { TonicSelector } from "./TonicSelector";
import { ViewModeToggle } from "../common/ViewModeToggle";
import {
  isFunctionRelevantToGenre,
  type GenreFocusId,
} from "../../domain/harmony/functionSemantics";
import { canShiftPerformanceOctave, type StaffOctaveDirection } from "../staff/staffOctave";
import { isAppShortcutProtectedTarget } from "../studio/focusManagement";
import { createHarmonicNoteRoleContext } from "../../domain/harmony/noteRoles";

function cardKey(identity: HarmonicFunctionIdentity): string {
  return identity.functionId;
}

export function HarmonicMatrix({
  project,
  previewFunctionId,
  playingFunctionId,
  transportStore,
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
  onOpenPresets,
  onOpenModesExplorer,
  onOpenQuickChord,
  onOpenAlternatives,
  canOpenAlternatives = false,
}: {
  readonly project: Project;
  readonly previewFunctionId?: string;
  readonly playingFunctionId?: string | undefined;
  readonly transportStore?: TransportStore;
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
  readonly onOpenModesExplorer?: () => void;
  readonly onOpenQuickChord?: () => void;
  readonly onOpenAlternatives?: () => void;
  readonly canOpenAlternatives?: boolean;
}) {
  const module = getHarmonicModule(project.activeModule);
  const best = recommendations?.bestMatch?.functionId;
  const alternatives = new Set(recommendations?.alternatives.map((item) => item.functionId) ?? []);
  const blocked = new Map(
    recommendations?.blockedCandidates.map((item) => [item.functionId, item]) ?? [],
  );
  const workbenchRef = useRef<HTMLDivElement>(null);
  const focusModeToggleRef = useRef<HTMLButtonElement>(null);
  const [hoveredFunctionId, setHoveredFunctionId] = useState<string | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [transportStepIndex, setTransportStepIndex] = useState(
    () => transportStore?.getState().currentStepIndex ?? null,
  );

  useEffect(() => {
    if (!transportStore) return;
    setTransportStepIndex(transportStore.getState().currentStepIndex);
    return transportStore.subscribe(() => {
      const nextIndex = transportStore.getState().currentStepIndex;
      setTransportStepIndex((current) => (current === nextIndex ? current : nextIndex));
    });
  }, [transportStore]);

  const previousHarmonicContext = resolvePreviousHarmonicContext(project);
  const transportStep =
    transportStepIndex === null ? undefined : project.progression.steps[transportStepIndex];
  const activePlayingFunctionId =
    transportStep?.kind === "chord"
      ? transportStep.harmonicFunction.functionId
      : (playingFunctionId ?? undefined);

  const addCardThroughExistingRoute = (functionId: string) => {
    onPreview(functionId);
    if (!project.temporaryBranch) onAdd(functionId);
  };

  const activeSourceFunctionId = hoveredFunctionId ?? previewFunctionId ?? null;
  const activeSourceEntry = activeSourceFunctionId
    ? topologyEntryForFunction(project.activeModule, activeSourceFunctionId)
    : undefined;
  const targetFunctionId = activeSourceEntry?.targetId ?? null;

  const targetSymbol = targetFunctionId
    ? (() => {
        try {
          const preview = realizeMatrixCardPreview(
            project,
            targetFunctionId,
            previousHarmonicContext,
          );
          return formatChordSymbol(preview.chord);
        } catch {
          return undefined;
        }
      })()
    : undefined;

  const renderCard = (
    identity: HarmonicFunctionIdentity,
    position?: { readonly column: number; readonly row: number },
    topologyEntry?: MatrixCardTopologyEntry,
    options?: { readonly contextual?: boolean; readonly accessibleDescription?: string },
  ) => {
    const semanticEntry =
      topologyEntry ?? topologyEntryForFunction(project.activeModule, identity.functionId);
    const preview = realizeMatrixCardPreview(project, identity.functionId, previousHarmonicContext);
    const template = project.moduleTemplateStates[project.activeModule].cards[identity.functionId];
    const view = project.presentation.globalMatrixCardView;
    const candidate =
      recommendations?.bestMatch?.functionId === identity.functionId
        ? recommendations.bestMatch
        : (recommendations?.alternatives.find((item) => item.functionId === identity.functionId) ??
          blocked.get(identity.functionId));

    const targetIdForCard =
      semanticEntry?.targetId ?? identity.targetId ?? identity.targetFunctionId;
    const cardResolutionTargetSymbol = targetIdForCard
      ? (() => {
          try {
            const targetPreview = realizeMatrixCardPreview(
              project,
              targetIdForCard,
              previousHarmonicContext,
            );
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
    const accessibleDescription = options?.accessibleDescription;

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
                : blocked.has(identity.functionId)
                  ? "blocked"
                  : "none",
          ...(candidate ? { recommendation: candidate } : {}),
        }}
        view={view}
        isFocusMode={isFocusMode}
        showBassInStaff={project.presentation.showBassInStaff}
        noteColorMode={project.presentation.noteColorMode}
        roleContext={createHarmonicNoteRoleContext({
          tonic: project.tonic,
          moduleId: project.activeModule,
          rootPitchClass: preview.chord.rootPitchClass,
          chordPitches: preview.upperPitches,
        })}
        guitarChordOrientation={project.presentation.guitarChordOrientation ?? "horizontal"}
        guitarChordColorMode={project.presentation.guitarChordColorMode ?? "chord-roles"}
        selected={previewFunctionId === identity.functionId}
        playing={activePlayingFunctionId === identity.functionId}
        contextual={options?.contextual}
        {...(accessibleDescription ? { accessibleDescription } : {})}
        customizedCount={matrixCardOverrideCount(template)}
        resolutionTargetSymbol={cardResolutionTargetSymbol}
        isResolutionTarget={Boolean(targetFunctionId && identity.functionId === targetFunctionId)}
        isGenreFocused={isGenreFocused}
        isGenreDimmed={isGenreDimmed}
        topologyEntry={semanticEntry}
        onMouseEnter={() => setHoveredFunctionId(identity.functionId)}
        onMouseLeave={() =>
          setHoveredFunctionId((curr) => (curr === identity.functionId ? null : curr))
        }
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
          addCardThroughExistingRoute(identity.functionId);
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
    const isAddShortcut = event.key === "+" || event.code === "NumpadAdd";
    if (
      isAddShortcut &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.defaultPrevented &&
      !isAppShortcutProtectedTarget(event.target) &&
      previewFunctionId
    ) {
      const selectedCard = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(".chord-card"),
      ).find(
        (card) =>
          card.getAttribute("data-testid") === `chord-card-${previewFunctionId}` &&
          !card.closest('[hidden], [aria-hidden="true"]') &&
          getComputedStyle(card).display !== "none" &&
          getComputedStyle(card).visibility !== "hidden",
      );
      if (selectedCard) {
        event.preventDefault();
        event.stopPropagation();
        addCardThroughExistingRoute(previewFunctionId);
      }
      return;
    }

    if (event.key === "Escape" && isFocusMode) {
      event.preventDefault();
      event.stopPropagation();
      setIsFocusMode(false);
      focusModeToggleRef.current?.focus();
      return;
    }

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
      data-topology-columns={String(module.topology.columnCount)}
      data-focus-mode={isFocusMode ? "true" : undefined}
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
              <span className="btn-bolt" aria-hidden="true">
                ⚡
              </span>
              <span className="btn-label">Formulas</span>
            </button>
          )}
          {onOpenModesExplorer && (
            <button
              type="button"
              className="matrix-formulas-btn matrix-modes-btn"
              onClick={onOpenModesExplorer}
              data-testid="matrix-modes-trigger"
              title="Open Scales & Modes Explorer"
              aria-label="Open Scales and Modes Explorer"
            >
              <span className="btn-icon" aria-hidden="true">
                🎼
              </span>
              <span className="btn-label">Modes</span>
            </button>
          )}
          {onOpenQuickChord ? (
            <button
              type="button"
              className="matrix-formulas-btn matrix-quick-chord-btn"
              onClick={onOpenQuickChord}
              data-testid="matrix-quick-chord-trigger"
              title="Open Quick Chord / Command Palette (Ctrl/Cmd+K)"
              aria-label="Open Quick Chord and Command Palette"
            >
              <span className="btn-icon" aria-hidden="true">
                ⌘
              </span>
              <span className="btn-label">Quick Chord</span>
            </button>
          ) : null}
          {onOpenAlternatives ? (
            <button
              type="button"
              className="matrix-formulas-btn matrix-alternatives-btn"
              onClick={onOpenAlternatives}
              disabled={!canOpenAlternatives}
              data-testid="matrix-explore-alternative"
              title={
                canOpenAlternatives
                  ? "Explore deterministic alternatives for the selected Step"
                  : "Select a chord Step to explore alternatives"
              }
              aria-label="Explore alternatives for selected Step"
            >
              <span className="btn-icon" aria-hidden="true">
                ✦
              </span>
              <span className="btn-label">Alternatives</span>
            </button>
          ) : null}
          <button
            ref={focusModeToggleRef}
            type="button"
            className="matrix-focus-toggle"
            data-testid="matrix-focus-toggle"
            aria-label={isFocusMode ? "Exit Matrix Focus Mode" : "Enter Matrix Focus Mode"}
            aria-pressed={isFocusMode}
            title={isFocusMode ? "Exit Focus Mode (Escape)" : "Focus on the Harmonic Matrix"}
            onClick={() => setIsFocusMode((current) => !current)}
          >
            {isFocusMode ? "Exit Focus" : "Focus"}
          </button>
          <ViewModeToggle
            currentView={project.presentation.globalMatrixCardView}
            onChangeView={(view) => {
              if (view !== "piano-roll") onGlobalView(view);
            }}
            selectAriaLabel="Global Card View"
            testIdPrefix="matrix-view"
            availableViews={["harmonic", "piano", "staff", "guitar"]}
          />
        </div>
      </header>
      <div className="matrix-workbench" ref={workbenchRef}>
        <MatrixResolutionArrows
          containerRef={workbenchRef}
          sourceFunctionId={activeSourceFunctionId}
          targetFunctionId={targetFunctionId}
          targetSymbol={targetSymbol}
          enabled={project.presentation.resolutionArrows !== false}
        />
        <div className="matrix-grid matrix-spatial-board">
          {module.layers.map((layer) => {
            const baselineEntries = module.topology.cards.filter(
              (entry) => entry.layerId === layer.id && entry.baseline,
            );
            const nonBaselineEntries = module.topology.cards.filter(
              (entry) => entry.layerId === layer.id && !entry.baseline,
            );
            const isProgressionsSecondaryDominants =
              project.activeModule === "progressions" && layer.id === "secondary-dominants";
            const isDarkSecondaryDiminished =
              project.activeModule === "dark-harmony" && layer.id === "secondary-diminished";
            const contextualEntries = isDarkSecondaryDiminished
              ? contextualFunctionIds
                  .map((identity) =>
                    topologyEntryForFunction(project.activeModule, identity.functionId),
                  )
                  .filter((entry): entry is MatrixCardTopologyEntry => entry !== undefined)
              : [];
            const occupiedColumns = new Set(baselineEntries.map((entry) => entry.position.column));
            const inlineContextualEntries = contextualEntries.filter(
              (entry) => !occupiedColumns.has(entry.position.column),
            );
            const contextualSidecarEntries = contextualEntries.filter((entry) =>
              occupiedColumns.has(entry.position.column),
            );
            const sidecarEntries = isProgressionsSecondaryDominants
              ? nonBaselineEntries
              : contextualSidecarEntries;
            const sidecarLabel = isProgressionsSecondaryDominants
              ? "Tritone substitution"
              : "Contextual diminished";
            return (
              <FunctionalLayer
                key={layer.id}
                label={layer.label}
                zone={getZoneForLayer(layer.id)}
                {...(layer.zoneLabel ? { zoneLabel: layer.zoneLabel } : {})}
                {...(sidecarEntries.length > 0
                  ? {
                      sidecar: {
                        label: sidecarLabel,
                        testId: isProgressionsSecondaryDominants
                          ? "matrix-sidecar-subV7"
                          : "matrix-sidecar-contextual-diminished",
                        children: sidecarEntries.map((entry) =>
                          renderCard(entry.identity, undefined, entry, {
                            contextual: isDarkSecondaryDiminished,
                            ...(isProgressionsSecondaryDominants
                              ? { accessibleDescription: "Tritone substitute resolving to I" }
                              : {
                                  accessibleDescription: `Contextual diminished resolving to ${entry.targetId ?? entry.identity.targetId ?? entry.identity.targetFunctionId ?? "target"}`,
                                }),
                          }),
                        ),
                      },
                    }
                  : {})}
              >
                {baselineEntries.map((entry) => renderCard(entry.identity, entry.position, entry))}
                {inlineContextualEntries.map((entry) =>
                  renderCard(entry.identity, entry.position, entry, {
                    contextual: true,
                    accessibleDescription: `Contextual diminished resolving to ${entry.targetId ?? entry.identity.targetId ?? entry.identity.targetFunctionId ?? "target"}`,
                  }),
                )}
              </FunctionalLayer>
            );
          })}
        </div>
      </div>
    </section>
  );
}
