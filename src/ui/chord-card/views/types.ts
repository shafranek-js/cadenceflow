import type { ChordDefinition } from "../../../domain/harmony/chord";
import type { ExactPitch } from "../../../domain/harmony/pitch";
import type { RecommendationCandidate } from "../../../domain/recommendations/engine";
import type { MusicalDuration } from "../../../domain/timing/duration";

export interface ChordCardViewModel {
  readonly chord: ChordDefinition;
  /** Full realization used by Staff and audition-adjacent consumers. */
  readonly realizedPitches: readonly ExactPitch[];
  /** Upper chord voices only; independent bass is intentionally excluded. */
  readonly pianoPitches: readonly ExactPitch[];
  readonly duration: MusicalDuration;
  readonly canRaiseStaffOctave: boolean;
  readonly canLowerStaffOctave: boolean;
  readonly recommendationStatus: "best" | "alternative" | "none";
  readonly recommendation?: RecommendationCandidate;
}
