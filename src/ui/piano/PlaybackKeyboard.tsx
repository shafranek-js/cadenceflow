import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TransportStore } from "../transport/transportStore";
import type { KeyboardPreviewStore } from "./keyboardPreviewStore";
import {
  activeKeyboardKeysAcrossSources,
  detectRearticulations,
  keyboardNoteName,
  type ActiveKeyboardKey,
  type KeyboardHand,
  type KeyboardPreferences,
  type KeyboardStrikeMemory,
} from "./playbackKeyboardModel";

/**
 * How long a re-struck key keeps its "played again" marker.
 *
 * Long enough to read as a deliberate second strike, short enough that a fast repeated passage does
 * not leave every key marked at once.
 */
const REARTICULATION_FLASH_MS = 320;

export function PlaybackKeyboard({
  transport,
  previewStore,
  autoRange,
  preferences,
  onChange,
  onAudition,
  onStopPreview,
}: {
  readonly transport: TransportStore;
  readonly previewStore: KeyboardPreviewStore;
  readonly autoRange: readonly [number, number];
  readonly preferences: KeyboardPreferences;
  readonly onChange: (value: KeyboardPreferences) => void;
  readonly onAudition: (midi: number) => void;
  readonly onStopPreview: () => void;
}) {
  const [active, setActive] = useState<readonly ActiveKeyboardKey[]>([]);
  const [rearticulated, setRearticulated] = useState<readonly number[]>([]);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [focused, setFocused] = useState(60);
  const scroller = useRef<HTMLDivElement>(null);
  // Last strike seen per pitch, so a repeat can be told apart from a held note. Kept in a ref
  // because it is animation-frame bookkeeping, not render state.
  const strikeMemory = useRef<KeyboardStrikeMemory>(new Map());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const status = transport.getState().status;
  const [start, end] = preferences.range === "88" ? [21, 108] : autoRange;
  const keys = useMemo(() => {
    let whites = 0;
    return Array.from({ length: end - start + 1 }, (_, index) => {
      const midi = start + index;
      const black = [1, 3, 6, 8, 10].includes(midi % 12);
      const position = black ? whites : whites++;
      return { midi, black, position };
    });
  }, [start, end]);
  const whiteCount = keys.filter((key) => !key.black).length;
  const focusMidi = Math.max(start, Math.min(end, focused));
  useEffect(() => {
    let frame = 0;
    let previous: string | null = null;
    const tick = () => {
      const sources = [
        {
          order: 0,
          notes: transport.getKeyboardNotes(),
          now: transport.getKeyboardAudioTime(),
        },
        ...previewStore.getSessions().map((session) => ({
          order: session.order,
          notes: session.notes,
          now: session.clock.now(),
        })),
      ];
      const notes = activeKeyboardKeysAcrossSources(sources, preferences.parts);
      const signature = notes
        .map(
          (note) =>
            `${note.pitch}@${note.onsetSeconds}:${note.hand}:${note.attackIds?.join("|") ?? ""}`,
        )
        .join(",");
      if (signature !== previous) {
        previous = signature;
        setActive(notes);

        const detected = detectRearticulations({ current: notes, memory: strikeMemory.current });
        strikeMemory.current = detected.memory;
        if (detected.pitches.length > 0) {
          // Clear the marker first so a repeat that follows quickly restarts the animation rather
          // than being ignored as "already marked".
          if (flashTimer.current !== null) clearTimeout(flashTimer.current);
          setRearticulated([]);
          flashTimer.current = setTimeout(() => {
            flashTimer.current = null;
            setRearticulated([]);
          }, REARTICULATION_FLASH_MS);
          setRearticulated(detected.pitches);
        }
      }
      const host = scroller.current;
      if (host) {
        const width = Math.max(host.clientWidth, whiteCount * 28) / whiteCount;
        const sounding = keys.filter((key) => notes.some((note) => note.pitch === key.midi));
        const next = {
          left: sounding.some((key) => key.position * width < host.scrollLeft),
          right: sounding.some(
            (key) => (key.position + 1) * width > host.scrollLeft + host.clientWidth,
          ),
        };
        setEdges((old) => (old.left === next.left && old.right === next.right ? old : next));
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      if (flashTimer.current !== null) {
        clearTimeout(flashTimer.current);
        flashTimer.current = null;
      }
    };
  }, [transport, previewStore, preferences.parts, keys, whiteCount]);
  useEffect(() => {
    return transport.subscribe(() => {
      if (transport.getState().status === "playing") onStopPreview();
    });
  }, [transport, onStopPreview]);
  useEffect(() => {
    const stop = () => onStopPreview();
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("blur", stop);
      onStopPreview();
    };
  }, [onStopPreview]);
  useLayoutEffect(() => {
    const host = scroller.current;
    const key = host?.querySelector<HTMLElement>(`[data-midi="${focusMidi}"]`);
    if (host && key) host.scrollLeft = Math.max(0, key.offsetLeft - host.clientWidth / 2);
  }, [start, end, focusMidi]);
  const outside = active.some((key) => key.pitch < start || key.pitch > end);
  const handByMidi = useMemo(() => {
    const map = new Map<number, KeyboardHand>();
    for (const key of active) map.set(key.pitch, key.hand);
    return map;
  }, [active]);
  const leftHandCount = active.filter((key) => key.hand === "left").length;
  const rightHandCount = active.length - leftHandCount;
  return (
    <section
      className="playback-keyboard"
      aria-label="Playback piano keyboard"
      // A concise announcement of what is sounding, so the two-colour cue is not sight-only and a
      // separately struck repeated note is reported rather than silently merged.
      aria-live="off"
      data-left-hand-active={leftHandCount > 0}
      data-right-hand-active={rightHandCount > 0}
    >
      <div className="playback-keyboard-controls">
        <strong>Keyboard</strong>
        {/* Names the two highlight colours, so the cue is discoverable rather than learned by
            trial and error. */}
        <span className="playback-keyboard-legend" aria-hidden="true">
          <span className="playback-keyboard-legend-item">
            <i className="playback-keyboard-swatch is-left-hand" />
            Left · chords &amp; bass
          </span>
          <span className="playback-keyboard-legend-item">
            <i className="playback-keyboard-swatch is-right-hand" />
            Right · melody
          </span>
          <span className="playback-keyboard-legend-item">
            <i className="playback-keyboard-swatch is-rearticulated" />
            Struck again
          </span>
        </span>
        <label>
          Range{" "}
          <select
            aria-label="Keyboard range"
            value={preferences.range}
            onChange={(event) =>
              onChange({
                ...preferences,
                range: event.target.value as KeyboardPreferences["range"],
              })
            }
          >
            <option value="auto">Auto</option>
            <option value="88">88 keys</option>
          </select>
        </label>
        <label>
          Notes{" "}
          <select
            aria-label="Keyboard notes"
            value={preferences.parts}
            onChange={(event) =>
              onChange({
                ...preferences,
                parts: event.target.value as KeyboardPreferences["parts"],
              })
            }
          >
            <option value="all">All parts</option>
            <option value="melody">Melody</option>
          </select>
        </label>
        <span>
          {keyboardNoteName(start)}–{keyboardNoteName(end)}
        </span>
        {edges.left ? <span aria-label="Playing notes to the left">◀</span> : null}
        {edges.right ? <span aria-label="Playing notes to the right">▶</span> : null}
        {outside ? (
          <button type="button" onClick={() => onChange({ ...preferences, range: "auto" })}>
            Notes outside range · Auto
          </button>
        ) : null}
        <button
          type="button"
          className="playback-keyboard-close"
          aria-label="Close keyboard"
          onClick={() => onChange({ ...preferences, visible: false })}
        >
          ×
        </button>
      </div>
      <div className="playback-keyboard-scroll" ref={scroller}>
        <div className="playback-keyboard-keys" style={{ minWidth: whiteCount * 28 }}>
          {keys.map((key) => {
            const hand = handByMidi.get(key.midi);
            const pressed = hand !== undefined;
            const repeated = pressed && rearticulated.includes(key.midi);
            return (
              <button
                type="button"
                key={key.midi}
                data-midi={key.midi}
                data-active={pressed}
                data-hand={hand ?? undefined}
                data-rearticulated={repeated || undefined}
                className={[
                  "mini-key",
                  key.black ? "mini-black-key" : "mini-white-key",
                  "playback-key",
                  pressed ? "is-active is-pressed" : "",
                  hand === "left" ? "is-left-hand" : "",
                  hand === "right" ? "is-right-hand" : "",
                  repeated ? "is-rearticulated" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  left: `${(key.position / whiteCount) * 100}%`,
                  width: `${((key.black ? 0.62 : 1) / whiteCount) * 100}%`,
                }}
                aria-label={
                  pressed
                    ? `Piano key ${keyboardNoteName(key.midi)}, playing, ${hand === "right" ? "melody (right hand)" : "chord or bass (left hand)"}${repeated ? ", struck again" : ""}`
                    : `Piano key ${keyboardNoteName(key.midi)}`
                }
                aria-disabled={status === "playing"}
                tabIndex={key.midi === focusMidi ? 0 : -1}
                onFocus={() => setFocused(key.midi)}
                onClick={() => {
                  if (transport.getState().status !== "playing") onAudition(key.midi);
                }}
                onKeyDown={(event) => {
                  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                    event.preventDefault();
                    event.stopPropagation();
                    const next =
                      event.key === "Home"
                        ? start
                        : event.key === "End"
                          ? end
                          : Math.max(
                              start,
                              Math.min(end, key.midi + (event.key === "ArrowRight" ? 1 : -1)),
                            );
                    setFocused(next);
                    scroller.current?.querySelector<HTMLElement>(`[data-midi="${next}"]`)?.focus();
                  }
                  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                }}
              >
                {key.midi % 12 === 0 || key.midi === start || key.midi === end ? (
                  <span>{keyboardNoteName(key.midi)}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
