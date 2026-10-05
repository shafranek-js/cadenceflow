import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Project } from "../../domain/project/project";
import type { ProgressionMeasure } from "../../domain/timing/measureLayout";
import { rationalToNumber } from "../../domain/timing/rational";
import { realizeProgressionStepChord } from "../../domain/progression/transposition";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import { withEffectiveBass } from "../../domain/progression/effectiveChord";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { PianoCardView } from "../piano/PianoCardView";
import { GuitarCardView } from "../guitar/GuitarCardView";
import { createHarmonicNoteRoleContext } from "../../domain/harmony/noteRoles";
import type { LabelHierarchyMode } from "../progression/labelHierarchy";

import type { ChordCardVisibility } from "./chordCardPreferences";

const systemCardHeights = new WeakMap<
  HTMLElement,
  Map<HTMLElement, { kind: string; height: number }>
>();

function updateSystemRowHeight(system: HTMLElement, kind: string) {
  const cards = systemCardHeights.get(system);
  const height = Math.max(
    0,
    ...Array.from(cards?.values() ?? [])
      .filter((card) => card.kind === kind)
      .map((card) => card.height),
  );
  system.style.setProperty(`--piano-roll-${kind}-row-height`, `${Math.ceil(height) + 10}px`);
  // Continuation arrows and transposition badges also change the harmony strip's
  // intrinsic height. Keep that preceding row aligned before placing the cards.
  const harmonyHeight = Math.max(
    42,
    ...Array.from(system.querySelectorAll<HTMLElement>(".piano-roll-chord")).map((chord) => {
      const style = getComputedStyle(chord);
      const children = Array.from(chord.children);
      return (
        children.reduce((total, child) => total + child.getBoundingClientRect().height, 0) +
        Math.max(0, children.length - 1) * (parseFloat(style.rowGap) || 0) +
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom) +
        3
      );
    }),
  );
  system.style.setProperty("--piano-roll-harmony-row-height", `${Math.ceil(harmonyHeight)}px`);
}

function ScaledCard({ children, kind }: { readonly children: ReactNode; readonly kind: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const host = outer.current;
    const content = inner.current;
    if (!host || !content) return;
    const system = host.closest<HTMLElement>(".score-system-measures-row");
    if (system && !systemCardHeights.has(system)) systemCardHeights.set(system, new Map());
    const update = () => {
      const scale = Math.min(1, host.clientWidth / content.offsetWidth);
      const height = content.offsetHeight * scale;
      setSize({ scale, height });
      if (system) {
        systemCardHeights.get(system)!.set(host, { kind, height });
        updateSystemRowHeight(system, kind);
      }
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    observer.observe(content);
    update();
    return () => {
      observer.disconnect();
      if (system) {
        systemCardHeights.get(system)?.delete(host);
        updateSystemRowHeight(system, kind);
      }
    };
  }, [kind]);
  return (
    <div ref={outer} className="piano-roll-card-scale" style={{ height: size.height }}>
      <div
        ref={inner}
        className="piano-roll-card-content"
        style={{ transform: `translateX(-50%) scale(${size.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

export function PianoRollChordCards({
  project,
  measure,
  visibility,
  labelMode,
  selectedStepIds,
  playingStepId,
  onSelect,
}: {
  readonly project: Project;
  readonly measure: ProgressionMeasure;
  readonly visibility: ChordCardVisibility;
  readonly labelMode: LabelHierarchyMode;
  readonly selectedStepIds: ReadonlySet<string>;
  readonly playingStepId?: string | null | undefined;
  readonly onSelect: (stepId: string, additive: boolean) => void;
}) {
  return (
    <>
      {(["piano", "guitar"] as const)
        .filter((kind) => visibility[kind])
        .map((kind) => (
          <div className="piano-roll-card-row" data-testid={`piano-roll-${kind}-cards`} key={kind}>
            {measure.items.map((item, index) => {
              const flex = `${rationalToNumber(item.durationBeats)} 1 0`;
              if (item.kind === "gap" || item.step.kind === "rest")
                return <div className="piano-roll-card-empty" style={{ flex }} key={index} />;
              const step = item.step;
              const realization = realizeProgressionStepRealization(step, project.tonic);
              const baseChord = realizeProgressionStepChord(step, project.tonic);
              const chord = withEffectiveBass(baseChord, realization.bassPitch);
              const chordLabel = formatChordSymbol(chord);
              const next =
                project.progression.steps[
                  project.progression.steps.findIndex((candidate) => candidate.id === step.id) + 1
                ];
              const nextRealization =
                next?.kind === "chord"
                  ? realizeProgressionStepRealization(next, project.tonic)
                  : undefined;
              const roleContext = createHarmonicNoteRoleContext({
                tonic: project.tonic,
                moduleId: project.activeModule,
                rootPitchClass: baseChord.rootPitchClass,
                chordPitches: [
                  ...realization.pitches,
                  ...(realization.bassPitch ? [realization.bassPitch] : []),
                ],
                nextChordPitches: nextRealization
                  ? [
                      ...nextRealization.pitches,
                      ...(nextRealization.bassPitch ? [nextRealization.bassPitch] : []),
                    ]
                  : [],
              });
              return (
                <button
                  type="button"
                  key={`${step.id}-${item.fragmentIndex}`}
                  style={{ flex }}
                  className={`piano-roll-instrument-card ${selectedStepIds.has(step.id) ? "is-selected" : ""} ${playingStepId === step.id ? "is-playing" : ""}`}
                  data-source-step-id={step.id}
                  aria-label={`${kind === "piano" ? "Piano" : "Guitar"} chord ${chordLabel}, ${step.harmonicFunction.functionId}, measure ${measure.number}`}
                  aria-pressed={selectedStepIds.has(step.id)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(step.id, event.shiftKey);
                  }}
                >
                  <ScaledCard kind={kind}>
                    {kind === "piano" ? (
                      <PianoCardView
                        chordPitches={realization.pitches}
                        bassPitch={
                          realization.bassPitch?.pitchClassIdentity !== baseChord.rootPitchClass
                            ? realization.bassPitch
                            : undefined
                        }
                        chordLabel={chordLabel}
                        labelMode={labelMode}
                        functionLabel={step.harmonicFunction.functionId}
                        noteColorMode={project.presentation.noteColorMode}
                        roleContext={roleContext}
                      />
                    ) : (
                      <GuitarCardView
                        chord={chord}
                        chordLabel={chordLabel}
                        labelMode={labelMode}
                        functionLabel={step.harmonicFunction.functionId}
                        orientation={project.presentation.guitarChordOrientation ?? "horizontal"}
                        colorMode={project.presentation.guitarChordColorMode ?? "chord-roles"}
                      />
                    )}
                  </ScaledCard>
                </button>
              );
            })}
          </div>
        ))}
    </>
  );
}
