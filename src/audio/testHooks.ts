import { HqSamplePianoProvider } from "./hq-sample-piano/provider";
import { LookAheadScheduler } from "./scheduler";
import { PreviewAuditionController } from "./previewAudition";

/**
 * Diagnostic test hooks strictly guarded for DEV or automated test execution.
 * Does not expose mutable application or progression state.
 */
export function initAudioTestHooks(): void {
  if (
    typeof window !== "undefined" &&
    (import.meta.env.DEV ||
      Boolean(
        (window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean })
          .__CADENCEFLOW_ENABLE_TEST_AUDIO__,
      ))
  ) {
    (window as unknown as { __cadenceflow_audio__?: unknown }).__cadenceflow_audio__ = {
      HqSamplePianoProvider,
      LookAheadScheduler,
      PreviewAuditionController,
    };
  }
}
