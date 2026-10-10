import { rationalToNumber } from "../../domain/timing/rational";
import type { PlaybackClockSnapshot } from "../transport/transportStore";

/** Sounding transport position; future anchors and paused/stopped audio are silent. */
export function pianoRollSoundingBeat(snapshot: PlaybackClockSnapshot, now: number): number | null {
  if (snapshot.state !== "playing" || now < snapshot.performanceClockAnchorMs) return null;
  const beat =
    snapshot.musicalPositionAnchorBeats +
    ((now - snapshot.performanceClockAnchorMs) * snapshot.tempoBpm) / 60_000;
  const loopStart = snapshot.loopStartBeats ? rationalToNumber(snapshot.loopStartBeats) : null;
  const loopEnd = snapshot.loopEndBeats ? rationalToNumber(snapshot.loopEndBeats) : null;
  if (loopStart !== null && loopEnd !== null && loopEnd > loopStart && beat >= loopEnd) {
    return loopStart + ((beat - loopStart) % (loopEnd - loopStart));
  }
  return beat >= rationalToNumber(snapshot.startBeats) && beat < rationalToNumber(snapshot.endBeats)
    ? beat
    : null;
}

export function pianoRollIntervalIsSounding(
  beat: number | null,
  start: number,
  end: number,
): boolean {
  return beat !== null && beat >= start && beat < end;
}

/** Position within the fixed-width measure slots of a Piano Roll system. */
export function pianoRollSystemHorizontalOffsetRatio(
  measurePosition: number,
  measureFraction: number,
  slotCapacity: number,
): number {
  return (measurePosition + measureFraction) / Math.max(slotCapacity, 1);
}
