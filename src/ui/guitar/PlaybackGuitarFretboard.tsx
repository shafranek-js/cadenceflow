import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { resolveGuitarTabEntry } from "../../domain/instruments/guitar/tablature";
import { GUITAR_STANDARD_TUNING } from "../../domain/instruments/guitar/tuning";
import {
  withGuitarStepBass,
  type GuitarChordVoicing,
} from "../../domain/instruments/guitar/voicings";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import type { ProgressionStep } from "../../domain/progression/step";
import { realizeProgressionStepChord } from "../../domain/progression/transposition";
import type { KeyboardPreviewStore } from "../piano/keyboardPreviewStore";
import type { TransportStore } from "../transport/transportStore";
import { playbackFretboardSvgSize } from "../studio/playbackDockSizing";
import {
  detectPlaybackGuitarReattacks,
  guitarMidiNoteName,
  projectPlaybackGuitarFretboard,
  type PlaybackGuitarFretboardSnapshot,
  type PlaybackGuitarMarker,
} from "./playbackGuitarFretboardModel";

const REATTACK_FLASH_MS = 320;
const SVG_WIDTH = 760;
const SVG_HEIGHT = 132;
const NUT_X = 48;
const FRET_WIDTH = 25;
const STRING_Y = [108, 92, 76, 60, 44, 28] as const;

interface PlaybackGuitarFrame extends PlaybackGuitarFretboardSnapshot {
  readonly repeatedMarkerKeys: readonly string[];
  readonly strikeSequenceByKey: Readonly<Record<string, number>>;
}

const EMPTY_FRAME: PlaybackGuitarFrame = {
  markers: [],
  outsideRange: [],
  repeatedMarkerKeys: [],
  strikeSequenceByKey: {},
};

function fretX(fret: number): number {
  return fret === 0 ? NUT_X - 8 : NUT_X + (fret - 0.5) * FRET_WIDTH;
}

function handleFretboardScrollKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
  const { key, currentTarget } = event;
  if (
    key !== "ArrowLeft" &&
    key !== "ArrowRight" &&
    key !== "ArrowUp" &&
    key !== "ArrowDown" &&
    key !== "Home" &&
    key !== "End" &&
    key !== "PageUp" &&
    key !== "PageDown"
  ) {
    return;
  }

  // Keep fretboard navigation local so Piano Roll editing and app playback shortcuts never see it.
  event.preventDefault();
  event.stopPropagation();
  const maxScrollLeft = Math.max(0, currentTarget.scrollWidth - currentTarget.clientWidth);
  const maxScrollTop = Math.max(0, currentTarget.scrollHeight - currentTarget.clientHeight);
  if (key === "Home") currentTarget.scrollLeft = 0;
  else if (key === "End") currentTarget.scrollLeft = maxScrollLeft;
  else if (key === "PageUp") currentTarget.scrollTop -= currentTarget.clientHeight;
  else if (key === "PageDown") currentTarget.scrollTop += currentTarget.clientHeight;
  else if (key === "ArrowUp") currentTarget.scrollTop = Math.max(0, currentTarget.scrollTop - 48);
  else if (key === "ArrowDown")
    currentTarget.scrollTop = Math.min(maxScrollTop, currentTarget.scrollTop + 48);
  else currentTarget.scrollLeft += key === "ArrowRight" ? 96 : -96;
}

function markerLabel(marker: PlaybackGuitarMarker, repeated: boolean): string {
  const voiceDescription =
    marker.voiceIds.length > 1 ? `, ${marker.voiceIds.length} simultaneous voices` : "";
  const partDescription =
    marker.role === "melody"
      ? "Melody"
      : marker.parts.includes("bass")
        ? marker.parts.includes("upper")
          ? "Chord upper voice and bass"
          : "Chord bass"
        : "Chord upper voice";
  return `String ${marker.stringNumber}, fret ${marker.fret}, ${guitarMidiNoteName(marker.pitch)}, ${partDescription}, sounding${voiceDescription}${repeated ? ", struck again" : ""}`;
}

export function PlaybackGuitarFretboard({
  transport,
  previewStore,
  steps,
  tonic,
  onClose,
}: {
  readonly transport: TransportStore;
  readonly previewStore: KeyboardPreviewStore;
  readonly steps: readonly ProgressionStep[];
  readonly tonic: PitchClassIdentity;
  readonly onClose: () => void;
}) {
  const [frame, setFrame] = useState<PlaybackGuitarFrame>(EMPTY_FRAME);
  const lastSignature = useRef("");
  const subscribeToTransport = useCallback(
    (listener: () => void) => transport.subscribe(listener),
    [transport],
  );
  const getPlayingStepIndex = useCallback(() => {
    const state = transport.getState();
    return state.status === "playing" ? state.currentStepIndex : null;
  }, [transport]);
  const playingStepIndex = useSyncExternalStore(
    subscribeToTransport,
    getPlayingStepIndex,
    () => null,
  );
  const contextVoicing = useMemo(() => {
    if (playingStepIndex === null) return undefined;
    const step = steps[playingStepIndex];
    if (step?.kind !== "chord") return undefined;
    const chord = withGuitarStepBass(realizeProgressionStepChord(step, tonic), step, "concert");
    return resolveGuitarTabEntry(chord).voicing;
  }, [playingStepIndex, steps, tonic]);
  const fretboardScrollRef = useRef<HTMLDivElement>(null);
  const fretboardSvgRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const scroll = fretboardScrollRef.current;
    const svg = fretboardSvgRef.current;
    const controls = scroll
      ?.closest<HTMLElement>(".playback-guitar-fretboard")
      ?.querySelector<HTMLElement>(".playback-guitar-controls");
    if (!scroll || !svg || !controls) return;
    const updateSvgSize = () => {
      const size = playbackFretboardSvgSize(scroll.clientHeight);
      if (!size) return;
      svg.setAttribute("width", `${size.width}`);
      svg.setAttribute("height", `${size.height}`);
      svg.dataset.scale = `${size.scale}`;
    };
    const observer = new ResizeObserver(updateSvgSize);
    observer.observe(scroll);
    observer.observe(controls);
    updateSvgSize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let rafId = 0;
    let previousStatus = transport.getState().status;
    let previousSessionId = transport.getState().sessionId;
    let attackMemory = new Map<string, readonly string[]>();
    const strikeUntil = new Map<string, number>();
    const strikeSequence = new Map<string, number>();

    const tick = () => {
      const state = transport.getState();
      if (state.status !== previousStatus || state.sessionId !== previousSessionId) {
        // A pause/stop or a replaced transport session starts a fresh strike history.
        attackMemory = new Map();
        strikeUntil.clear();
        strikeSequence.clear();
        previousStatus = state.status;
        previousSessionId = state.sessionId;
      }

      const sources = [
        {
          id: `transport:${state.sessionId ?? "stopped"}`,
          notes: transport.getKeyboardNotes(),
          now: transport.getKeyboardAudioTime(),
        },
        ...previewStore.getSessions().map((session) => ({
          id: `preview:${session.owner}:${session.order}`,
          notes: session.notes,
          now: session.clock.now(),
        })),
      ];
      const snapshot = projectPlaybackGuitarFretboard(sources);
      const attacks = detectPlaybackGuitarReattacks(snapshot.markers, attackMemory);
      attackMemory = new Map(attacks.memory);
      const now = performance.now();
      for (const key of attacks.repeatedMarkerKeys) {
        strikeUntil.set(key, now + REATTACK_FLASH_MS);
        strikeSequence.set(key, (strikeSequence.get(key) ?? 0) + 1);
      }
      const currentKeys = new Set(snapshot.markers.map((marker) => marker.key));
      for (const [key, endAt] of strikeUntil) {
        if (endAt <= now || !currentKeys.has(key)) strikeUntil.delete(key);
      }
      const repeatedMarkerKeys = [...strikeUntil.keys()].sort();
      const strikeSequenceByKey = Object.fromEntries(
        repeatedMarkerKeys.map((key) => [key, strikeSequence.get(key) ?? 0]),
      );
      const signature = JSON.stringify({
        markers: snapshot.markers,
        outsideRange: snapshot.outsideRange,
        strikeSequenceByKey,
      });
      if (signature !== lastSignature.current) {
        lastSignature.current = signature;
        setFrame({ ...snapshot, repeatedMarkerKeys, strikeSequenceByKey });
      }
      rafId = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(rafId);
  }, [transport, previewStore]);

  const splitByRole = new Map<string, Set<string>>();
  for (const marker of frame.markers) {
    const cell = `${marker.stringIndex}:${marker.fret}`;
    const roles = splitByRole.get(cell) ?? new Set<string>();
    roles.add(marker.role);
    splitByRole.set(cell, roles);
  }
  const repeated = new Set(frame.repeatedMarkerKeys);
  const contextDots = (
    contextVoicing?.unsupportedReason ? [] : (contextVoicing?.items ?? [])
  ).filter((item) => item.fret >= 0 && item.fret <= 24);

  return (
    <section
      className="playback-guitar-fretboard"
      aria-label="Playback guitar fretboard"
      data-testid="playback-guitar-fretboard"
    >
      <header className="playback-guitar-controls">
        <strong>Guitar</strong>
        <span className="playback-guitar-tuning">Standard tuning · E2 A2 D3 G3 B3 E4</span>
        <div className="playback-guitar-legend" role="group" aria-label="Fretboard legend">
          <span className="playback-guitar-legend-item">
            <i className="playback-guitar-swatch is-chord" aria-hidden="true" />
            Chord tones &amp; bass
          </span>
          <span className="playback-guitar-legend-item">
            <i className="playback-guitar-swatch is-melody" aria-hidden="true" />
            Melody
          </span>
          <span className="playback-guitar-context-legend">
            Faint dots show the current chord shape as context, not a sounding note.
          </span>
        </div>
        {contextVoicing ? (
          <span className="playback-guitar-context-label">
            {contextVoicing.chordSymbol} · chord-shape context
          </span>
        ) : null}
        <button
          type="button"
          className="playback-guitar-close"
          aria-label="Close playback guitar fretboard"
          title="Close playback guitar fretboard"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div
        ref={fretboardScrollRef}
        className="playback-guitar-scroll"
        role="group"
        aria-label="Guitar fretboard, frets zero through twenty-four. Use Left and Right or Home and End to scroll frets; Up and Down or Page keys to scroll vertically."
        tabIndex={0}
        data-playback-follow-ignore="true"
        onKeyDown={handleFretboardScrollKeyDown}
      >
        <svg
          ref={fretboardSvgRef}
          className="playback-guitar-svg"
          width="100%"
          height="100%"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          aria-hidden="true"
          focusable="false"
          data-testid="playback-guitar-svg"
        >
          <rect
            x={NUT_X}
            y="18"
            width={FRET_WIDTH * 24}
            height="96"
            rx="4"
            className="playback-guitar-neck"
          />
          <rect x={NUT_X - 3} y="18" width="5" height="96" className="playback-guitar-nut" />
          {Array.from({ length: 25 }, (_, fret) => {
            const x = fret === 0 ? NUT_X : NUT_X + fret * FRET_WIDTH;
            return (
              <g key={`fret-${fret}`}>
                {fret > 0 ? (
                  <line x1={x} y1="20" x2={x} y2="112" className="playback-guitar-fret-line" />
                ) : null}
                {fret > 0 && (fret <= 9 || fret % 3 === 0) ? (
                  <text x={NUT_X + (fret - 0.5) * FRET_WIDTH} y="12" textAnchor="middle">
                    {fret}
                  </text>
                ) : null}
              </g>
            );
          })}
          {[3, 5, 7, 9, 15, 17, 19, 21].map((fret) => (
            <circle
              key={`inlay-${fret}`}
              cx={NUT_X + (fret - 0.5) * FRET_WIDTH}
              cy="66"
              r="2.5"
              className="playback-guitar-inlay"
            />
          ))}
          {[12, 24].map((fret) => (
            <g key={`double-inlay-${fret}`} className="playback-guitar-inlay">
              <circle cx={NUT_X + (fret - 0.5) * FRET_WIDTH} cy="55" r="2.5" />
              <circle cx={NUT_X + (fret - 0.5) * FRET_WIDTH} cy="77" r="2.5" />
            </g>
          ))}
          {STRING_Y.map((y, stringIndex) => {
            const string = GUITAR_STANDARD_TUNING[stringIndex]!;
            return (
              <g key={`string-${string.stringNumber}`}>
                <text x="4" y={y + 4} className="playback-guitar-string-label">
                  {string.stringNumber} {string.name}
                </text>
                <line
                  x1={NUT_X}
                  y1={y}
                  x2={NUT_X + FRET_WIDTH * 24}
                  y2={y}
                  className={`playback-guitar-string is-string-${stringIndex}`}
                />
              </g>
            );
          })}
          <g className="playback-guitar-context-dots" data-testid="playback-guitar-context">
            {contextDots.map((item) => (
              <circle
                key={`${item.stringIndex}:${item.fret}`}
                cx={fretX(item.fret)}
                cy={STRING_Y[item.stringIndex]!}
                r="3.5"
                className={item.role === "root" ? "is-context-root" : "is-context-tone"}
              />
            ))}
          </g>
          <g className="playback-guitar-live-markers" data-testid="playback-guitar-live-markers">
            {frame.markers.map((marker) => {
              const roles = splitByRole.get(`${marker.stringIndex}:${marker.fret}`);
              const split = roles?.size === 2;
              const x = fretX(marker.fret) + (split ? (marker.role === "chord" ? -5 : 5) : 0);
              const y = STRING_Y[marker.stringIndex]!;
              const isRepeated = repeated.has(marker.key);
              return (
                <g
                  key={`${marker.key}:${frame.strikeSequenceByKey[marker.key] ?? 0}`}
                  data-marker-key={marker.key}
                  data-role={marker.role}
                  data-pitch={marker.pitch}
                  data-string={marker.stringNumber}
                  data-fret={marker.fret}
                  data-voice-ids={marker.voiceIds.join(" ")}
                  data-struck-again={isRepeated || undefined}
                  data-strike-sequence={frame.strikeSequenceByKey[marker.key]}
                  className={`playback-guitar-marker is-${marker.role}${isRepeated ? " is-struck-again" : ""}`}
                >
                  <circle cx={x} cy={y} r="7" />
                  {marker.voiceIds.length > 1 ? (
                    <text x={x} y={y + 2.5} textAnchor="middle">
                      {marker.voiceIds.length}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      {frame.outsideRange.length > 0 ? (
        <p
          className="playback-guitar-outside-range"
          role="status"
          data-testid="playback-guitar-outside-range"
        >
          Outside guitar range:{" "}
          {frame.outsideRange
            .map(
              (note) =>
                `${guitarMidiNoteName(note.pitch)} ${note.role === "melody" ? "Melody" : "chord"}`,
            )
            .join(", ")}
        </p>
      ) : null}
      <ul className="playback-guitar-a11y-notes" aria-label="Currently sounding guitar notes">
        {frame.markers.map((marker) => (
          <li key={marker.key}>{markerLabel(marker, repeated.has(marker.key))}</li>
        ))}
        {frame.outsideRange.map((note) => (
          <li key={note.key}>
            {guitarMidiNoteName(note.pitch)}, {note.role === "melody" ? "Melody" : "chord voice"},
            outside guitar range; no fret position shown
          </li>
        ))}
      </ul>
    </section>
  );
}
