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
  onCardView,
  onGlobalView,
  onModuleChange,
  onTonicChange,
  onSettingsOpen,
  onResetCard,
  onResetCurrentModule,
  onResetAllModules,
}: {
  readonly project: Project;
  readonly previewFunctionId?: string;
  readonly recommendations: RecommendationResult | null;
  readonly contextualFunctionIds: readonly HarmonicFunctionIdentity[];
  readonly onPreview: (functionId: string) => void;
  readonly onAdd: (functionId: string) => void;
  readonly onCardView: (functionId: string, view: CardViewId) => void;
  readonly onGlobalView: (view: CardViewId) => void;
  readonly onModuleChange: (moduleId: HarmonicModuleId) => void;
  readonly onTonicChange: (tonic: number) => void;
  readonly onSettingsOpen: (functionId: string) => void;
  readonly onResetCard: (functionId: string) => void;
  readonly onResetCurrentModule: () => void;
  readonly onResetAllModules: () => void;
}) {
  const module = getHarmonicModule(project.activeModule);
  const best = recommendations?.bestMatch?.functionId;
  const alternatives = new Set(recommendations?.alternatives.map((item) => item.functionId) ?? []);
  const contextualByLayer = new Map<string, readonly HarmonicFunctionIdentity[]>();
  if (project.activeModule === "dark-harmony" && contextualFunctionIds.length > 0) {
    contextualByLayer.set("secondary-diminished", contextualFunctionIds);
  }

  const previousHarmonicContext = resolvePreviousHarmonicContext(project);

  const renderCard = (identity: HarmonicFunctionIdentity) => {
    const preview = realizeMatrixCardPreview(project, identity.functionId, previousHarmonicContext);
    const template = project.moduleTemplateStates[project.activeModule].cards[identity.functionId];
    const override = template?.cardViewOverride;
    const view = override ?? project.presentation.globalMatrixCardView;
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
          recommendationStatus:
            best === identity.functionId
              ? "best"
              : alternatives.has(identity.functionId)
                ? "alternative"
                : "none",
          ...(candidate ? { recommendation: candidate } : {}),
        }}
        view={view}
        selected={previewFunctionId === identity.functionId}
        customizedCount={matrixCardOverrideCount(template)}
        onSelect={() => onPreview(identity.functionId)}
        onAdd={() => onAdd(identity.functionId)}
        onViewChange={(next) => onCardView(identity.functionId, next)}
        onSettingsOpen={() => onSettingsOpen(identity.functionId)}
        onReset={() => onResetCard(identity.functionId)}
      />
    );
  };

  return (
    <section className="matrix-panel" aria-label="Harmonic Matrix">
      <header className="matrix-toolbar">
        <ModuleSelector value={project.activeModule} onChange={onModuleChange} />
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
      <div className="matrix-workbench">
        <TonicSelector
          tonic={project.tonic}
          mode={modeForModule(project.activeModule)}
          onChange={onTonicChange}
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
