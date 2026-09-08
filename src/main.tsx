import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { initAudioTestHooks } from "./audio/testHooks";
import "./styles/tokens.css";
import "./styles/studio.css";
import "./styles/matrix.css";
import "./styles/progression.css";

// Initialize test audio hooks strictly when in DEV or explicit test mode
initAudioTestHooks();

const root = document.getElementById("root");
if (!root) throw new Error("CadenceFlow root element is missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
