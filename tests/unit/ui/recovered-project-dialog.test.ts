// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { RecoveredProjectDialog } from "../../../src/ui/projects/RecoveredProjectDialog";
import { createDefaultProject } from "../../../src/domain/project/factory";
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("recovered import confirmation", () => {
  it.each(["confirm", "cancel", "escape", "close", "backdrop"])(
    "handles %s and explains losses accessibly",
    (action) => {
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      const decision = vi.fn();
      act(() =>
        root.render(
          React.createElement(RecoveredProjectDialog, {
            result: {
              project: createDefaultProject("recovered"),
              diagnostics: [
                { path: "progression.steps[1]", field: "melody", reason: "Invalid melody recipe" },
              ],
            },
            onDecision: decision,
          }),
        ),
      );
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog?.getAttribute("aria-modal")).toBe("true");
      expect(dialog?.textContent).toContain("progression.steps[1].melody");
      expect(dialog?.textContent).toContain("Invalid melody recipe");
      expect(dialog?.textContent).toContain(
        "saved version stays unchanged until you open this recovery",
      );
      act(() => {
        if (action === "escape")
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        else if (action === "backdrop")
          (container.querySelector(".dialog-backdrop") as HTMLElement).click();
        else {
          const text =
            action === "confirm" ? "Open recovered project" : action === "cancel" ? "Cancel" : "X";
          Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent === text)
            ?.click();
        }
      });
      expect(decision).toHaveBeenCalledWith(action === "confirm");
      act(() => root.unmount());
      container.remove();
    },
  );
});
