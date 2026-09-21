import type { HarmonicModuleId, MatrixMixPolicy } from "./functions";
import { getResolutionTarget } from "./tendencyArrows";

export type HarmonicRouteStatus = "allowed" | "requires-confirmation";

export type HarmonicRouteReasonCode =
  | "directed-tension-target"
  | "directed-tension-route-blocked"
  | "modal-corridor-entry"
  | "modal-corridor-return"
  | "modal-corridor-route-blocked";

export interface HarmonicRouteContext {
  readonly moduleId: HarmonicModuleId;
  readonly currentFunctionId?: string | undefined;
  /** Canonical semantic target from the Matrix topology, when available. */
  readonly currentTargetId?: string | undefined;
  readonly currentMixPolicy?: MatrixMixPolicy | undefined;
}

export interface HarmonicRouteDecision {
  readonly status: HarmonicRouteStatus;
  readonly reasonCode: HarmonicRouteReasonCode;
  readonly message: string;
  readonly currentFunctionId?: string | undefined;
  readonly targetFunctionId: string;
  readonly directedTargetId?: string | undefined;
}

export const MODAL_INTERCHANGE_FUNCTION_IDS = Object.freeze(["bIII", "bVI", "iv", "bVII"]);
export const MODAL_CORRIDOR_GATEWAY_IDS = Object.freeze(["I", "IV", "V"]);

export function isModalInterchangeFunction(
  moduleId: HarmonicModuleId,
  functionId: string,
): boolean {
  return moduleId === "progressions" && MODAL_INTERCHANGE_FUNCTION_IDS.includes(functionId);
}

export function isModalCorridorGateway(functionId: string): boolean {
  return MODAL_CORRIDOR_GATEWAY_IDS.includes(functionId);
}

/**
 * Resolve the canonical directed target. An explicit topology target always
 * wins; the string fallback keeps legacy and imported projects safe when their
 * identity predates the T190 targetId field.
 */
export function directedTensionTarget(
  functionId: string,
  explicitTargetId?: string | undefined,
): string | undefined {
  return explicitTargetId ?? getResolutionTarget(functionId);
}

/** Resolve targets for legacy ids whose topology identity is not available to
 * the stateless recommendation engine. */
export function semanticTargetForFunction(
  moduleId: HarmonicModuleId,
  functionId: string,
  explicitTargetId?: string | undefined,
): string | undefined {
  const parsed = directedTensionTarget(functionId, explicitTargetId);
  if (parsed) return parsed;
  if (functionId === "vii°") return moduleId === "dark-harmony" ? "i" : "I";
  if (functionId === "subV7") return "I";
  if (functionId === "CT°7") return "i";
  if (functionId === "Pass°7") return "V";
  return undefined;
}

export function isDirectedTensionFunction(
  functionId: string,
  explicitTargetId?: string | undefined,
): boolean {
  return Boolean(directedTensionTarget(functionId, explicitTargetId));
}

function requiresConfirmation(
  context: HarmonicRouteContext,
  targetFunctionId: string,
  reasonCode: HarmonicRouteReasonCode,
  message: string,
  directedTargetId?: string,
): HarmonicRouteDecision {
  return Object.freeze({
    status: "requires-confirmation" as const,
    reasonCode,
    message,
    ...(context.currentFunctionId ? { currentFunctionId: context.currentFunctionId } : {}),
    targetFunctionId,
    ...(directedTargetId ? { directedTargetId } : {}),
  });
}

/**
 * Evaluate a single transition without mutating a Project. Ordinary harmonic
 * choices remain allowed; only strict directed-tension and Progressions Modal
 * Corridor violations require the explicit Add anyway confirmation.
 */
export function evaluateHarmonicRoute(
  context: HarmonicRouteContext,
  targetFunctionId: string,
  targetTargetId?: string | undefined,
): HarmonicRouteDecision {
  const currentFunctionId = context.currentFunctionId;
  if (!currentFunctionId || currentFunctionId === targetFunctionId) {
    return Object.freeze({
      status: "allowed",
      reasonCode: "directed-tension-target",
      message: "No strict corridor is active for this transition.",
      targetFunctionId,
    });
  }

  const directedTargetId = directedTensionTarget(currentFunctionId, context.currentTargetId);
  const targetIsDirectedTension = isDirectedTensionFunction(targetFunctionId, targetTargetId);

  if (directedTargetId && targetIsDirectedTension && targetFunctionId !== directedTargetId) {
    return requiresConfirmation(
      context,
      targetFunctionId,
      "directed-tension-route-blocked",
      `Directed tension points to ${directedTargetId}; ${targetFunctionId} is another tension chord.`,
      directedTargetId,
    );
  }

  const currentIsModal = isModalInterchangeFunction(context.moduleId, currentFunctionId);
  const targetIsModal = isModalInterchangeFunction(context.moduleId, targetFunctionId);
  if (context.moduleId === "progressions" && (currentIsModal || targetIsModal)) {
    if (targetIsModal && isModalCorridorGateway(currentFunctionId)) {
      return Object.freeze({
        status: "allowed",
        reasonCode: "modal-corridor-entry",
        message: "Modal interchange enters through I, IV, or V.",
        currentFunctionId,
        targetFunctionId,
      });
    }
    if (currentIsModal && isModalCorridorGateway(targetFunctionId)) {
      return Object.freeze({
        status: "allowed",
        reasonCode: "modal-corridor-return",
        message: "Modal interchange returns through I, IV, or V.",
        currentFunctionId,
        targetFunctionId,
      });
    }

    return requiresConfirmation(
      context,
      targetFunctionId,
      currentIsModal ? "modal-corridor-return" : "modal-corridor-entry",
      currentIsModal
        ? "Return from modal interchange through I, IV, or V, or choose Add anyway to override."
        : "Enter modal interchange through I, IV, or V, or choose Add anyway to override.",
    );
  }

  return Object.freeze({
    status: "allowed",
    reasonCode: directedTargetId ? "directed-tension-target" : "modal-corridor-entry",
    message: directedTargetId
      ? `The directed target is ${directedTargetId}; this visible choice remains manually selectable.`
      : "No strict corridor is active for this transition.",
    currentFunctionId,
    targetFunctionId,
    ...(directedTargetId ? { directedTargetId } : {}),
  });
}
