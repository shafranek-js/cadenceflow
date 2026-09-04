import type { ChordDefinition } from "../../../domain/harmony/chord";
import type { ExactPitch } from "../../../domain/harmony/pitch";
import type { RecommendationCandidate } from "../../../domain/recommendations/engine";

export interface ChordCardViewModel {
  readonly chord: ChordDefinition;
  readonly realizedPitches: readonly ExactPitch[];
  readonly recommendationStatus: "best" | "alternative" | "none";
  readonly recommendation?: RecommendationCandidate;
}
