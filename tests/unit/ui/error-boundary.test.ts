// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../../src/ui/common/ErrorBoundary";

/**
 * Error boundary regression tests.
 *
 * Regression context: `src/` contained no `ErrorBoundary`, no `componentDidCatch` and no
 * `getDerivedStateFromError`, while `StrictMode` is enabled and `PianoPerformanceInspector`
 * threw during render on a note-count invariant. A render-time throw therefore unmounted the
 * entire application, leaving a blank page with no way to save the project.
 *
 * Written with `createElement` in a `.ts` file: `vitest.config.ts` includes only `.test.ts`
 * files (not `.test.tsx`), which is also why every other React test in this project does the same.
 */

const el = React.createElement;

/**
 * `createElement` wrapper for components that declare `children` as a required prop.
 *
 * A bare `const el = React.createElement` alias loses the generic arity of the overloads, so
 * passing children as trailing arguments fails with "Property 'children' is missing". The props
 * parameter here omits `children` because the trailing arguments are what supply it.
 */
function createEl<P extends { children?: React.ReactNode }>(
  type: React.ElementType<P>,
  props: Omit<P, "children">,
  ...children: React.ReactNode[]
): React.ReactElement {
  return React.createElement(type, props as P, ...children);
}

function Boom({ message = "kaboom" }: { message?: string }): React.ReactElement {
  throw new Error(message);
}

interface Mounted {
  readonly container: HTMLElement;
  unmount(): void;
}

function mountWithConsoleSilenced(element: React.ReactElement): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  // React logs caught render errors through console.error; silence it so suite output
  // reflects real failures only.
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  act(() => root.render(element));
  return {
    container,
    unmount() {
      consoleError.mockRestore();
      act(() => root.unmount());
      container.remove();
    },
  };
}

function clickByTestId(container: HTMLElement, testId: string): void {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  expect(button, `expected a control with data-testid="${testId}"`).not.toBeNull();
  act(() => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ErrorBoundary", () => {
  it("renders children while nothing throws", () => {
    const mounted = mountWithConsoleSilenced(
      createEl(ErrorBoundary, { label: "Test panel" }, el("p", null, "healthy content")),
    );

    expect(mounted.container.textContent).toContain("healthy content");
    expect(mounted.container.querySelector('[data-testid="error-boundary-fallback"]')).toBeNull();
    mounted.unmount();
  });

  it("contains a render-time throw instead of unmounting the tree", () => {
    const onError = vi.fn();
    const mounted = mountWithConsoleSilenced(
      el(
        "div",
        null,
        createEl(
          ErrorBoundary,
          { label: "Failing panel", onError },
          el(Boom, { message: "render exploded" }),
        ),
        el("p", null, "sibling survives"),
      ),
    );

    // The fallen subtree is replaced by the fallback...
    expect(
      mounted.container.querySelector('[data-testid="error-boundary-fallback"]'),
    ).not.toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="error-boundary-detail"]')?.textContent,
    ).toContain("render exploded");
    // ...while the rest of the studio keeps rendering.
    expect(mounted.container.textContent).toContain("sibling survives");
    expect(onError).toHaveBeenCalledTimes(1);
    mounted.unmount();
  });

  it("does not wrap children in an extra DOM element", () => {
    // The boundary renders directly inside layout containers (`.app-shell`), so an added
    // wrapper element would break their flex layout.
    const mounted = mountWithConsoleSilenced(
      el(
        "main",
        { className: "app-shell" },
        createEl(ErrorBoundary, { label: "Layout panel" }, el("header", null, "header")),
      ),
    );

    const shell = mounted.container.querySelector(".app-shell");
    expect(shell?.firstElementChild?.tagName.toLowerCase()).toBe("header");
    mounted.unmount();
  });

  it("recovers through the retry action once the child stops throwing", () => {
    const mounted = mountFlakyHarness();
    expect(
      mounted.container.querySelector('[data-testid="error-boundary-fallback"]'),
    ).not.toBeNull();

    // Repair the underlying cause through the parent, then retry the panel.
    clickByTestId(mounted.container, "fix-child");
    clickByTestId(mounted.container, "error-boundary-retry");

    expect(mounted.container.textContent).toContain("recovered content");
    expect(mounted.container.querySelector('[data-testid="error-boundary-fallback"]')).toBeNull();
    mounted.unmount();
  });

  it("supports a custom fallback", () => {
    const mounted = mountWithConsoleSilenced(
      createEl(
        ErrorBoundary,
        {
          label: "Custom panel",
          fallback: (error: Error) => el("p", { "data-testid": "custom-fallback" }, error.message),
        },
        el(Boom, { message: "custom message" }),
      ),
    );

    expect(mounted.container.querySelector('[data-testid="custom-fallback"]')?.textContent).toBe(
      "custom message",
    );
    expect(mounted.container.querySelector('[data-testid="error-boundary-fallback"]')).toBeNull();
    mounted.unmount();
  });
});

/** Harness whose child can be made healthy again, so the retry path is exercised. */
function mountFlakyHarness(): Mounted {
  function Flaky({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
    if (shouldThrow) throw new Error("first render fails");
    return el("p", null, "recovered content");
  }

  function Harness(): React.ReactElement {
    const [shouldThrow, setShouldThrow] = React.useState(true);
    return el(
      "div",
      null,
      el(
        "button",
        {
          type: "button",
          "data-testid": "fix-child",
          onClick: () => setShouldThrow(false),
        },
        "fix the child",
      ),
      createEl(ErrorBoundary, { label: "Flaky panel" }, el(Flaky, { shouldThrow })),
    );
  }

  return mountWithConsoleSilenced(el(Harness));
}
