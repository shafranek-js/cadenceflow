import { useEffect, type RefObject } from "react";
import type { TransportStore } from "../transport/transportStore";
import type { PlaybackFollowCoordinator } from "../transport/playbackFollowCoordinator";
import {
  pianoRollIntervalIsSounding,
  pianoRollSoundingBeat,
  pianoRollSystemHorizontalOffsetRatio,
} from "./pianoRollPlayback";

interface TimedElement<T extends HTMLElement> {
  readonly element: T;
  readonly start: number;
  readonly end: number;
  readonly stepIndex?: number;
}

interface PlaybackMarker extends TimedElement<HTMLElement> {
  readonly systemIndex?: number;
  readonly systemMeasurePosition?: number;
  readonly systemMeasureCapacity?: number;
  readonly targetElement?: HTMLElement | null;
  readonly scrollContainer?: HTMLElement | null;
  readonly contentElement?: HTMLElement | null;
}

function parseBeat(value: string | undefined): number {
  const [numerator = 0, denominator = 1] = (value ?? "0/1").split("/").map(Number);
  return numerator / denominator;
}

function setClass(element: Element, className: string, active: boolean): void {
  if (element.classList.contains(className) !== active) {
    element.classList.toggle(className, active);
  }
}

function setPlayingClass(element: Element, playing: boolean): void {
  setClass(element, "is-playing", playing);
}

/** One clock-driven DOM update for every rendered Piano Roll measure. */
export function PianoRollPlaybackDriver({
  containerRef,
  transportStore,
  transportStatus,
  enabled,
  playbackFollowCoordinator,
}: {
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly transportStore: TransportStore;
  readonly transportStatus: "stopped" | "playing" | "paused";
  readonly enabled: boolean;
  readonly playbackFollowCoordinator?: PlaybackFollowCoordinator | undefined;
}) {
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || transportStatus !== "playing" || !container) return;

    let notes: TimedElement<HTMLButtonElement>[] = [];
    let svgs: (Element | null)[] = [];
    let chords: TimedElement<HTMLButtonElement>[] = [];
    let cards: TimedElement<HTMLButtonElement>[] = [];
    let melodyLaneNotes: HTMLElement[] = [];
    let markers: PlaybackMarker[] = [];
    let cacheDirty = true;

    const refreshElements = () => {
      notes = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.piano-roll-note"),
      ).map((element) => {
        const start = parseBeat(element.dataset.fragmentStartBeats);
        return {
          element,
          start,
          end: start + parseBeat(element.dataset.fragmentDurationBeats),
        };
      });
      svgs = notes.map(({ element }) => element.previousElementSibling);
      chords = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.piano-roll-chord"),
      ).map((element) => ({
        element,
        start: parseBeat(element.dataset.stepStartBeats),
        end: parseBeat(element.dataset.stepEndBeats),
        stepIndex: Number(element.dataset.sourceStepIndex),
      }));
      cards = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button.piano-roll-instrument-card"),
      ).map((element) => ({
        element,
        start: 0,
        end: 0,
        stepIndex: Number(element.dataset.sourceStepIndex),
      }));
      melodyLaneNotes = Array.from(
        container.querySelectorAll<HTMLElement>("[data-melody-event-key]"),
      );
      markers = Array.from(
        container.querySelectorAll<HTMLElement>("[data-piano-roll-playhead-marker]"),
      ).map((element) => {
        const measure = element.closest<HTMLElement>(".piano-roll-measure");
        const system = measure?.closest<HTMLElement>(".score-system");
        const scrollContainer = measure?.closest<HTMLElement>(".score-system-scroll");
        const contentElement = scrollContainer?.firstElementChild;
        const systemRow = system?.querySelector<HTMLElement>(
          ".score-system-measures-row.piano-roll-system-measures-row",
        );
        const systemMeasures = systemRow
          ? Array.from(systemRow.querySelectorAll<HTMLElement>(".piano-roll-measure"))
          : [];
        const systemMeasureCapacity = Number(systemRow?.dataset.systemMeasureCapacity);
        return {
          element,
          start: parseBeat(element.dataset.measureStartBeats),
          end: parseBeat(element.dataset.measureEndBeats),
          ...(measure && Number.isInteger(Number(measure.dataset.systemIndex))
            ? { systemIndex: Number(measure.dataset.systemIndex) }
            : {}),
          ...(measure && systemMeasures.includes(measure)
            ? {
                systemMeasurePosition: systemMeasures.indexOf(measure),
                systemMeasureCapacity:
                  Number.isInteger(systemMeasureCapacity) && systemMeasureCapacity > 0
                    ? systemMeasureCapacity
                    : systemMeasures.length,
              }
            : {}),
          targetElement: system ?? null,
          scrollContainer: scrollContainer ?? null,
          contentElement: contentElement instanceof HTMLElement ? contentElement : null,
        };
      });
      cacheDirty = false;
    };

    let frame: number | null = null;
    const clear = () => {
      notes.forEach(({ element }, index) => {
        setPlayingClass(element, false);
        const svg = svgs[index];
        if (svg) setPlayingClass(svg, false);
      });
      chords.forEach(({ element }) => setPlayingClass(element, false));
      cards.forEach(({ element }) => setPlayingClass(element, false));
      melodyLaneNotes.forEach((element) => {
        setClass(element, "is-active", false);
        element.removeAttribute("aria-current");
      });
      markers.forEach(({ element }) => {
        element.style.display = "none";
        element.removeAttribute("data-testid");
        element.removeAttribute("data-current-beat");
      });
    };
    const tick = () => {
      frame = null;
      if (cacheDirty) refreshElements();
      const state = transportStore.getState();
      const snapshot = state.playbackClockSnapshot;
      if (state.status !== "playing" || !snapshot || snapshot.state !== "playing") {
        clear();
        return;
      }

      const beat = pianoRollSoundingBeat(snapshot, performance.now());
      if (beat === null) {
        clear();
      } else {
        notes.forEach(({ element, start, end }, index) => {
          const sounding = pianoRollIntervalIsSounding(beat, start, end);
          setPlayingClass(element, sounding);
          const svg = svgs[index];
          if (svg) setPlayingClass(svg, sounding);
        });
        chords.forEach(({ element, start, end }) => {
          setPlayingClass(element, pianoRollIntervalIsSounding(beat, start, end));
        });
        const soundingStepIndices = new Set(
          chords
            .filter(({ start, end }) => pianoRollIntervalIsSounding(beat, start, end))
            .map(({ stepIndex }) => stepIndex)
            .filter((stepIndex): stepIndex is number => Number.isInteger(stepIndex)),
        );
        cards.forEach(({ element, stepIndex }) => {
          setPlayingClass(element, stepIndex !== undefined && soundingStepIndices.has(stepIndex));
        });
        const activeEventKey = state.activeMelodyEventKey;
        melodyLaneNotes.forEach((element) => {
          const active = element.dataset.melodyEventKey === activeEventKey;
          setClass(element, "is-active", active);
          if (active) element.setAttribute("aria-current", "step");
          else element.removeAttribute("aria-current");
        });
        let activeMarker: PlaybackMarker | undefined;
        markers.forEach((marker) => {
          const { element, start, end } = marker;
          const active = beat >= start && beat < end;
          element.style.display = active ? "block" : "none";
          if (active) {
            activeMarker = marker;
            element.style.left = `${((beat - start) / (end - start)) * 100}%`;
            element.dataset.currentBeat = beat.toFixed(4);
            element.dataset.testid = "piano-roll-playhead";
          } else {
            element.removeAttribute("data-testid");
            element.removeAttribute("data-current-beat");
          }
        });
        if (
          playbackFollowCoordinator &&
          activeMarker?.systemIndex !== undefined &&
          activeMarker.targetElement &&
          activeMarker.scrollContainer &&
          activeMarker.contentElement &&
          activeMarker.systemMeasurePosition !== undefined &&
          activeMarker.systemMeasureCapacity !== undefined
        ) {
          playbackFollowCoordinator.reportPosition({
            systemIndex: activeMarker.systemIndex,
            viewKey: "piano-roll",
            targetElement: activeMarker.targetElement,
            scrollContainer: activeMarker.scrollContainer,
            contentElement: activeMarker.contentElement,
            horizontalOffsetRatio: pianoRollSystemHorizontalOffsetRatio(
              activeMarker.systemMeasurePosition,
              (beat - activeMarker.start) / Math.max(activeMarker.end - activeMarker.start, 1e-9),
              activeMarker.systemMeasureCapacity,
            ),
          });
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) => record.type === "childList" || record.attributeName !== "class")
      ) {
        cacheDirty = true;
      }
    });
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-fragment-start-beats",
        "data-fragment-duration-beats",
        "data-step-start-beats",
        "data-step-end-beats",
        "data-source-step-index",
        "data-measure-start-beats",
        "data-measure-end-beats",
      ],
    });
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            cacheDirty = true;
          });
    resizeObserver?.observe(container);
    container.querySelectorAll<HTMLElement>(".score-system-scroll").forEach((element) => {
      resizeObserver?.observe(element);
    });
    const unsubscribe = transportStore.subscribe(() => {
      if (transportStore.getState().status === "playing") {
        if (frame === null) frame = requestAnimationFrame(tick);
      } else if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
        clear();
      }
    });
    tick();

    return () => {
      unsubscribe();
      observer.disconnect();
      resizeObserver?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      clear();
    };
  }, [containerRef, enabled, playbackFollowCoordinator, transportStatus, transportStore]);

  return null;
}
