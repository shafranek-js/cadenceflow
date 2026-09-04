import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { HqSamplePianoProvider } from "./audio/hq-sample-piano/provider";
import { LookAheadScheduler } from "./audio/scheduler";
import "./styles/tokens.css";
import "./styles/studio.css";

// Expose audio runtime strictly for browser-level diagnostics and E2E verification
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
  };
}

const root = document.getElementById("root");
if (!root) throw new Error("CadenceFlow root element is missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
