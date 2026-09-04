import type { DerivedMode, HarmonicModuleId } from "../functions";
import type { PitchClassIdentity } from "../pitch";
import type { MatrixTopologyDefinition } from "../topology";

export interface EnharmonicSpellingContext {
  readonly tonic: PitchClassIdentity;
  readonly mode: DerivedMode;
}

export interface HarmonicContext {
  readonly tonic: PitchClassIdentity;
  readonly moduleId: HarmonicModuleId;
  readonly mode: DerivedMode;
  readonly spellingContext: EnharmonicSpellingContext;
}

export interface HarmonicLayerDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: "core" | "functional" | "expanded";
  readonly defaultVisible: boolean;
}

export interface HarmonicModuleDefinition {
  readonly id: HarmonicModuleId;
  readonly mode: DerivedMode;
  readonly coreLayerId: string;
  readonly layers: readonly HarmonicLayerDefinition[];
  readonly topology: MatrixTopologyDefinition;
  readonly rulesetId: string;
}
