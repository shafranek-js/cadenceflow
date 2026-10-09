import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CURRENT_PROJECT_SCHEMA_VERSION } from "../../src/domain/project/migrations";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";
import {
  addRestToProgression,
  enableIndependentBassVoice,
  ensureSelectedProgressionSettingsVisible,
  getLogicalProgressionStepButtons,
  setProgressionView,
  startBranchAlternative,
} from "./test-helpers/progression-settings";

const ACCEPTANCE_PROJECT_NAME = "US8 Acceptance";

type AcceptanceSnapshot = {
  readonly projectName: string;
  readonly activeModule: string;
  readonly tonic: string;
  readonly presentationView: string;
  readonly progression: readonly {
    readonly kind: "chord" | "rest";
    readonly functionId: string;
    readonly visibleSummary: string;
  }[];
  readonly performance: {
    readonly articulation: string;
    readonly voicingMode: string;
    readonly manualVoicingMidi: readonly string[];
    readonly register: string;
    readonly bassNote: string;
    readonly bassOctave: string;
    readonly masterVelocity: string;
    readonly perNoteOverrideSummary: string;
    readonly perNoteOverrides: readonly {
      readonly note: string;
      readonly midi: string;
      readonly velocity: string;
    }[];
  };
  readonly timing: {
    readonly tempo: string;
    readonly meterNumerator: string;
    readonly meterDenominator: string;
    readonly grouping: string;
    readonly groove: string;
    readonly swingAmount: string;
  };
  readonly matrixTemplate: {
    readonly articulation: string;
    readonly register: string;
    readonly masterVelocity: string;
    readonly overrideSummary: string;
  };
  readonly temporaryBranch: {
    readonly mode: "temporary";
    readonly alternative: string;
  };
};

async function openProjectMenu(page: Page) {
  await page.getByTestId("project-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Project actions" })).toBeVisible();
}

async function waitForProductionAutosave(page: Page): Promise<void> {
  await page.waitForFunction((expectedName) => {
    const state = (
      window as unknown as {
        __cadenceflow_persistence__?: {
          lastScheduledProjectSnapshot: string;
          lastCompletedProjectSnapshot: string;
          lastAutosavedProjectName: string;
        };
      }
    ).__cadenceflow_persistence__;
    return Boolean(
      state &&
      state.lastScheduledProjectSnapshot.length > 0 &&
      state.lastCompletedProjectSnapshot === state.lastScheduledProjectSnapshot &&
      state.lastAutosavedProjectName === expectedName,
    );
  }, ACCEPTANCE_PROJECT_NAME);
}

async function waitForChordAutosave(page: Page): Promise<void> {
  await page.waitForFunction((expectedName) => {
    const state = (
      window as unknown as {
        __cadenceflow_persistence__?: {
          lastScheduledProjectSnapshot: string;
          lastCompletedProjectSnapshot: string;
          lastAutosavedProjectName: string;
        };
      }
    ).__cadenceflow_persistence__;
    if (
      !state ||
      state.lastCompletedProjectSnapshot !== state.lastScheduledProjectSnapshot ||
      state.lastAutosavedProjectName !== expectedName
    )
      return false;
    try {
      const project = JSON.parse(state.lastScheduledProjectSnapshot) as {
        progression?: { steps?: readonly unknown[] };
      };
      return (project.progression?.steps?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }, ACCEPTANCE_PROJECT_NAME);
}

async function seedRecoverableProject(page: Page, makeActive = false) {
  return page.evaluate(async (makeRecoveryActive) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("CadenceFlowDB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<{ id: string; payload: string; activeId: string }>((resolve, reject) => {
      let result: { id: string; payload: string; activeId: string } | null = null;
      const transaction = db.transaction(["metadata", "projects"], "readwrite");
      const activeRequest = transaction.objectStore("metadata").get("lastActiveProjectId");
      activeRequest.onsuccess = () => {
        const activeId = activeRequest.result?.value;
        if (typeof activeId !== "string") {
          reject(new Error("The active project ID is missing."));
          return;
        }
        const projectRequest = transaction.objectStore("projects").get(activeId);
        projectRequest.onsuccess = () => {
          const activeRecord = projectRequest.result;
          if (!activeRecord || typeof activeRecord.payload !== "string") {
            reject(new Error("The active project payload is missing."));
            return;
          }
          const document = JSON.parse(activeRecord.payload) as {
            schemaVersion: number;
            id: string;
            name: string;
            progression: { steps: Array<Record<string, unknown>> };
          };
          if (!document.progression.steps[0]) {
            reject(new Error("The active project has no chord to damage."));
            return;
          }
          const id = "e2e-legacy-recovery";
          document.id = id;
          document.name = "Legacy recovery";
          document.schemaVersion = 6;
          document.progression.steps[0].melody = { pitchMotion: "corrupt" };
          const payload = JSON.stringify(document);
          transaction.objectStore("projects").put({
            ...activeRecord,
            id,
            name: document.name,
            schemaVersion: document.schemaVersion,
            revision: activeRecord.revision + 1,
            payload,
          });
          if (makeRecoveryActive) {
            transaction.objectStore("metadata").put({ key: "lastActiveProjectId", value: id });
          }
          result = { id, payload, activeId };
        };
      };
      transaction.oncomplete = () => {
        if (result) resolve(result);
        else reject(new Error("Could not create the damaged recovery record."));
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }, makeActive);
}

async function readRecoveryDbState(page: Page, id: string) {
  return page.evaluate(async (projectId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("CadenceFlowDB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<{ payload: string | null; activeId: string | null }>((resolve, reject) => {
      const transaction = db.transaction(["metadata", "projects"], "readonly");
      let payload: string | null = null;
      let activeId: string | null = null;
      transaction.objectStore("projects").get(projectId).onsuccess = (event) => {
        payload =
          (event.target as IDBRequest<{ payload?: string } | undefined>).result?.payload ?? null;
      };
      transaction.objectStore("metadata").get("lastActiveProjectId").onsuccess = (event) => {
        const value = (event.target as IDBRequest<{ value?: unknown } | undefined>).result?.value;
        activeId = typeof value === "string" ? value : null;
      };
      transaction.oncomplete = () => {
        if (payload === null) reject(new Error("The recovery payload disappeared."));
        else resolve({ payload, activeId });
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }, id);
}

async function setOpenProjectTabs(page: Page, ids: readonly string[]): Promise<void> {
  await page.evaluate(async (openProjectIds) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("CadenceFlowDB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("metadata", "readwrite");
      transaction.objectStore("metadata").put({
        key: "openProjectTabs.v8",
        value: { ids: openProjectIds, source: "user", updatedAt: Date.now() },
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }, ids);
}

async function readOpenProjectTabs(page: Page): Promise<{ ids: string[] } | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("CadenceFlowDB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<{ ids: string[] } | null>((resolve, reject) => {
      const transaction = db.transaction("metadata", "readonly");
      const request = transaction.objectStore("metadata").get("openProjectTabs.v8");
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

async function countProjectsThroughUi(page: Page): Promise<number> {
  await openProjectMenu(page);
  const count = await page
    .getByTestId("project-open-select")
    .locator("option")
    .evaluateAll(
      (options) =>
        options.filter((option) => option instanceof HTMLOptionElement && option.value).length,
    );
  await page.getByTestId("project-menu-toggle").click();
  return count;
}

async function addChord(page: Page, functionId: string): Promise<void> {
  const card = page.getByTestId(`chord-card-${functionId}`);
  await card.locator(".chord-main").click({ modifiers: ["Control"] });
}

async function captureUs8AcceptanceSnapshot(page: Page): Promise<AcceptanceSnapshot> {
  await ensureHistoryControlsVisible(page);
  await ensureSelectedProgressionSettingsVisible(page);
  const logicalStepButtons = await getLogicalProgressionStepButtons(page);
  const progression = await Promise.all(
    logicalStepButtons.map(async (node) => {
      const label = (await node.getAttribute("aria-label")) ?? "";
      const isRest = label.startsWith("Select Rest:");
      return {
        kind: isRest ? ("rest" as const) : ("chord" as const),
        functionId: isRest ? "Rest" : (label.replace(/^Select /, "").split(":", 1)[0] ?? ""),
        visibleSummary: label,
      };
    }),
  );
  const performanceInspector = page.locator("section.piano-performance-inspector");
  const chordProperties = page.getByTestId("chord-properties-inspector");
  const perNoteOverrides = await performanceInspector
    .locator(".per-note-velocity-row")
    .evaluateAll((rows) =>
      rows.flatMap((row) => {
        const input = row.querySelector<HTMLInputElement>(
          'input[aria-label^="Velocity override for "]',
        );
        if (!input) return [];
        return [
          {
            note: row.querySelector(".note-label")?.textContent?.trim() ?? "",
            midi: row.querySelector(".note-midi")?.textContent?.trim() ?? "",
            velocity: input.value,
          },
        ];
      }),
    );
  await performanceInspector.getByRole("button", { name: "Open Piano Voicing Editor" }).click();
  const voicingModal = page.locator(".piano-voicing-editor-modal");
  await expect(voicingModal).toBeVisible();
  const manualVoicingMidi = await voicingModal
    .locator('input[aria-label^="MIDI note for pitch "]')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  await voicingModal.getByRole("button", { name: "Cancel" }).click();
  await expect(voicingModal).not.toBeVisible();
  const templateCard = page.getByTestId("chord-card-i");
  const progressionCountBeforeTemplatePreview = await page
    .locator(".measure-staff-event-select")
    .count();
  await templateCard.locator(".chord-main").click();
  const templateInspector = page.getByRole("region", { name: "Template settings for i" });
  await expect(templateInspector).toBeVisible();
  // In an active branch, the production card preview path appends to the branch.
  // Undo that transient preview so this read-only snapshot keeps the original branch intact.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".measure-staff-event-select")).toHaveCount(
    progressionCountBeforeTemplatePreview,
  );
  await expect(templateInspector).toBeVisible();
  const branchRegion = page.getByRole("region", { name: "Original versus Alternative" });

  return {
    projectName: (
      await page.getByTestId("project-menu-toggle").locator("strong").innerText()
    ).trim(),
    activeModule:
      (await page.getByRole("button", { name: /^Dark Harmony/ }).getAttribute("aria-pressed")) ===
      "true"
        ? "dark-harmony/tonal-minor"
        : "unexpected",
    tonic: (
      await page
        .getByRole("complementary", { name: "Set The Key" })
        .locator('button[aria-pressed="true"]')
        .innerText()
    ).trim(),
    presentationView: await page.getByLabel("Global Card View").inputValue(),
    progression,
    performance: {
      articulation: await performanceInspector
        .locator('[data-articulation-value][aria-pressed="true"]')
        .getAttribute("data-articulation-value")
        .then((value) => value ?? ""),
      voicingMode: await performanceInspector
        .getByLabel("Voicing Mode", { exact: true })
        .inputValue(),
      manualVoicingMidi,
      register:
        (await performanceInspector
          .locator('[data-testid="register-option"][aria-pressed="true"]')
          .getAttribute("data-register-value")) ?? "",
      bassNote: await chordProperties.getByLabel("Bass Note", { exact: true }).inputValue(),
      bassOctave: await chordProperties.getByLabel("Bass Octave", { exact: true }).inputValue(),
      masterVelocity: await performanceInspector
        .getByLabel("Master Velocity", { exact: true })
        .inputValue(),
      perNoteOverrideSummary: (
        await performanceInspector.locator(".per-note-overrides-summary").innerText()
      ).trim(),
      perNoteOverrides,
    },
    timing: {
      tempo: await page.getByLabel("Tempo in BPM").inputValue(),
      meterNumerator: await page.getByLabel("Meter numerator").inputValue(),
      meterDenominator: await page.getByLabel("Meter denominator").inputValue(),
      grouping: await page.getByLabel("Pulse grouping").inputValue(),
      groove:
        (await page
          .getByRole("button", { name: "Toggle Swing Feel" })
          .getAttribute("aria-pressed")) === "true"
          ? "swing"
          : "straight",
      swingAmount: await page.getByLabel("Swing Amount").inputValue(),
    },
    matrixTemplate: {
      articulation: await templateInspector
        .locator('[data-articulation-value][aria-pressed="true"]')
        .getAttribute("data-articulation-value")
        .then((value) => value ?? ""),
      register: await templateInspector
        .locator('[data-testid="register-option"][aria-pressed="true"]')
        .getAttribute("data-register-value")
        .then((value) => value ?? ""),
      masterVelocity: await templateInspector.getByRole("spinbutton").inputValue(),
      overrideSummary: (await templateInspector.innerText()).replace(/\s+/g, " ").trim(),
    },
    temporaryBranch: {
      mode: "temporary",
      alternative: (await branchRegion.locator(".branch-path").nth(1).innerText())
        .replace(/\s+/g, " ")
        .trim(),
    },
  };
}

async function assertFreshHistory(page: Page): Promise<void> {
  await ensureHistoryControlsVisible(page);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
}

async function assertTemporaryBranch(page: Page, expectedProgressionCount: number): Promise<void> {
  await expect(page.getByText("What-if branch active", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Commit Branch" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Original versus Alternative" })).toBeVisible();
  await expect(await getLogicalProgressionStepButtons(page)).toHaveLength(expectedProgressionCount);
}

test.describe("US8 Batch C — project actions", () => {
  test("creates, renames, switches, and deletes a named project", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();

    await openProjectMenu(page);
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill("Verse idea");
    await page.getByRole("button", { name: "Create Project" }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Verse idea");

    await openProjectMenu(page);
    await page.getByTestId("rename-project-btn").click();
    await page.getByTestId("project-name-input").fill("Chorus idea");
    await page.getByRole("button", { name: "Rename Project", exact: true }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Chorus idea");

    await openProjectMenu(page);
    await page.getByTestId("project-save-as-btn").click();
    await page.getByTestId("save-project-as-name").fill("Saved Copy");
    await page.getByRole("button", { name: "Save Project As", exact: true }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Saved Copy");

    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill("Bridge idea");
    await page.getByRole("button", { name: "Create Project" }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Bridge idea");

    await openProjectMenu(page);
    await expect(
      page.getByTestId("project-open-select").locator("option").filter({ hasText: "Chorus idea" }),
    ).toHaveCount(1);
    await page.getByTestId("project-open-select").selectOption({ label: "Chorus idea" });
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Chorus idea");

    await openProjectMenu(page);
    await page.getByTestId("delete-project-btn").click();
    await expect(page.getByRole("dialog", { name: "Delete Project?" })).toBeVisible();
    await page.getByTestId("confirm-delete-project-btn").click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Bridge idea");
  });

  test("recovers the active named project after reload with a fresh history", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();
    await ensureHistoryControlsVisible(page);

    await openProjectMenu(page);
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill("Recovered Session");
    await page.getByRole("button", { name: "Create Project" }).click();
    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    await page.reload();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Recovered Session");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("named migration recovery stays clickable and cancel preserves the stored payload", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const testWindow = window as unknown as {
        __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean;
      };
      testWindow.__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
    });
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();

    await openProjectMenu(page);
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill(ACCEPTANCE_PROJECT_NAME);
    await page.getByRole("button", { name: "Create Project" }).click();
    await addChord(page, "I");
    await waitForChordAutosave(page);
    const damaged = await seedRecoverableProject(page);

    await page.reload();
    await expect(page.getByTestId("project-menu-toggle")).toContainText(ACCEPTANCE_PROJECT_NAME);
    await openProjectMenu(page);
    await page.getByTestId("project-open-select").selectOption(damaged.id);

    const dialog = page.getByRole("dialog", { name: "Recovered project" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Open recovered project" })).toBeEnabled();
    const beforeCancel = await readRecoveryDbState(page, damaged.id);
    expect(beforeCancel.payload).toBe(damaged.payload);

    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByTestId("project-menu-toggle")).toContainText(ACCEPTANCE_PROJECT_NAME);
    const afterCancel = await readRecoveryDbState(page, damaged.id);
    expect(afterCancel).toEqual(beforeCancel);

    await openProjectMenu(page);
    await page.getByTestId("project-open-select").selectOption(damaged.id);
    const confirmedDialog = page.getByRole("dialog", { name: "Recovered project" });
    await expect(confirmedDialog).toBeVisible();
    await confirmedDialog.getByRole("button", { name: "Open recovered project" }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Legacy recovery");
  });

  test("cancelled recovery while closing the active tab preserves its tab and history", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const testWindow = window as unknown as {
        __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean;
      };
      testWindow.__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
    });
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();
    await ensureHistoryControlsVisible(page);

    await openProjectMenu(page);
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill(ACCEPTANCE_PROJECT_NAME);
    await page.getByRole("button", { name: "Create Project" }).click();
    await addChord(page, "I");
    await waitForChordAutosave(page);
    const damaged = await seedRecoverableProject(page);
    await setOpenProjectTabs(page, [damaged.activeId, damaged.id]);

    await page.reload();
    const activeTab = page.getByTestId(`project-tab-${damaged.activeId}`);
    const recoveryTab = page.getByTestId(`project-tab-${damaged.id}`);
    await expect(activeTab).toHaveAttribute("aria-selected", "true");
    await expect(recoveryTab).toBeVisible();
    await page
      .getByRole("complementary", { name: "Set The Key" })
      .getByRole("button", { name: "Set key D", exact: true })
      .click();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
    const beforeTabs = await readOpenProjectTabs(page);
    const beforeRecovery = await readRecoveryDbState(page, damaged.id);

    await page.getByTestId(`project-tab-close-${damaged.activeId}`).click();
    const dialog = page.getByRole("dialog", { name: "Recovered project" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    await expect(activeTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
    expect((await readOpenProjectTabs(page))?.ids).toEqual(beforeTabs?.ids);
    expect(await readRecoveryDbState(page, damaged.id)).toEqual(beforeRecovery);
    expect((await readRecoveryDbState(page, damaged.id)).activeId).toBe(damaged.activeId);
  });

  test("startup recovery cancel offers review and only confirmed recovery is autosaved", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const testWindow = window as unknown as {
        __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean;
      };
      testWindow.__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
    });
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();

    await openProjectMenu(page);
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill(ACCEPTANCE_PROJECT_NAME);
    await page.getByRole("button", { name: "Create Project" }).click();
    await addChord(page, "I");
    await waitForChordAutosave(page);
    const damaged = await seedRecoverableProject(page, true);

    await page.reload();
    const startupDialog = page.getByRole("dialog", { name: "Recovered project" });
    await expect(startupDialog).toBeVisible();
    await expect(page.getByTestId("project-menu-toggle")).toHaveCount(0);
    await startupDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Choose how to continue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review saved project" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Start a fresh project" })).toBeEnabled();
    expect(await readRecoveryDbState(page, damaged.id)).toEqual({
      payload: damaged.payload,
      activeId: damaged.id,
    });

    await page.getByRole("button", { name: "Review saved project" }).click();
    const reviewedDialog = page.getByRole("dialog", { name: "Recovered project" });
    await expect(reviewedDialog).toBeVisible();
    expect(await readRecoveryDbState(page, damaged.id)).toEqual({
      payload: damaged.payload,
      activeId: damaged.id,
    });
    await reviewedDialog.getByRole("button", { name: "Open recovered project" }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Legacy recovery");

    const persisted = await readRecoveryDbState(page, damaged.id);
    expect(persisted.activeId).toBe(damaged.id);
    expect(persisted.payload).not.toBe(damaged.payload);
    if (persisted.payload === null) throw new Error("The confirmed recovery was not persisted.");
    const savedProject = JSON.parse(persisted.payload) as {
      schemaVersion: number;
      progression: { steps: Array<Record<string, unknown>> };
    };
    expect(savedProject.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(savedProject.progression.steps[0]?.melody).toBeUndefined();
  });

  test("exports canonical project data and opens it through the file chooser with fresh history", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();
    await ensureHistoryControlsVisible(page);

    // Add a real progression step so the exported payload is non-trivial and
    // creates an Undo entry that must disappear after import.
    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    await page.getByTestId("export-menu-toggle").click();
    await expect(page.getByRole("menu", { name: "Export menu" })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("project-export-btn").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("CadenceFlow.cadenceflow");
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();

    await openProjectMenu(page);
    await page.getByTestId("project-open-file-btn").click();
    await page.getByTestId("project-file-input").setInputFiles(downloadPath!);
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Imported Copy");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("US8 round-trips a complete autosaved project through recovery and portable file with fresh history", async ({
    page,
    browser,
  }) => {
    await page.addInitScript(() => {
      const testWindow = window as unknown as {
        __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
        __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean;
      };
      testWindow.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
      testWindow.__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
    });
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();
    await ensureHistoryControlsVisible(page);

    await openProjectMenu(page);
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill(ACCEPTANCE_PROJECT_NAME);
    await page.getByRole("button", { name: "Create Project" }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText(ACCEPTANCE_PROJECT_NAME);
    await setProgressionView(page, "staff");
    // Project context: non-default tonic plus explicit Dark Harmony / Tonal Minor module.
    await page
      .getByRole("complementary", { name: "Set The Key" })
      .getByRole("button", { name: "Set key D", exact: true })
      .click();
    await page.getByRole("button", { name: /^Dark Harmony/ }).click();
    await expect(page.getByRole("button", { name: /^Dark Harmony/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: /^Dark Harmony/ })).toBeVisible();

    // Four persisted progression steps: three sounding chords and one Rest.
    await addChord(page, "i");
    await addChord(page, "V");
    await addChord(page, "VI");
    await addRestToProgression(page);
    const steps = page.locator(".measure-staff-event-select");
    await expect(steps).toHaveCount(4);

    // Step-local performance and timing fixture.
    await steps.nth(0).click();
    await enableIndependentBassVoice(page);
    await page.getByRole("button", { name: "Register offset: +1 Octave" }).click();
    await page.getByRole("button", { name: "Open Piano Voicing Editor" }).click();
    const voicingModal = page.locator(".piano-voicing-editor-modal");
    await expect(voicingModal).toBeVisible();
    const manualVoicingBeforeTranspose = await voicingModal
      .locator('input[aria-label^="MIDI note for pitch "]')
      .evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value)));
    const expectedManualVoicingMidi = manualVoicingBeforeTranspose.map((midi) => String(midi + 12));
    await voicingModal.getByRole("button", { name: "+1 Octave" }).click();
    expect(
      await voicingModal
        .locator('input[aria-label^="MIDI note for pitch "]')
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    ).toEqual(expectedManualVoicingMidi);
    await voicingModal.getByRole("button", { name: "Apply Manual Voicing" }).click();
    await expect(voicingModal).not.toBeVisible();
    await page.getByRole("button", { name: "MIDI velocity view" }).click();
    await page.getByLabel("Master Velocity", { exact: true }).fill("95");
    await page.getByRole("button", { name: "Articulation: Arp Up" }).click();
    await page.getByLabel("Bass Note", { exact: true }).selectOption("root");
    await page.getByLabel("Bass Octave", { exact: true }).selectOption("-1");
    const upperVelocityRow = page.locator(".per-note-velocity-row:has(.role-upper)").first();
    await upperVelocityRow.getByRole("button", { name: /Override/ }).click();
    await upperVelocityRow.getByRole("spinbutton").fill("110");
    await expect(upperVelocityRow.getByRole("spinbutton")).toHaveValue("110");
    await expect(page.locator(".per-note-overrides-summary")).toContainText(
      "1 note velocity override active",
    );
    await page.getByTestId("duration-preset-half").click();

    // Project-owned Matrix template and presentation state.
    await page.getByTestId("chord-card-i").locator(".chord-main").click();
    const templateInspector = page.getByRole("region", { name: "Template settings for i" });
    await expect(templateInspector).toBeVisible();
    await templateInspector.getByRole("button", { name: "Articulation: Humanized" }).click();
    await templateInspector.getByRole("button", { name: "Register offset: +1 Octave" }).click();
    await templateInspector.getByRole("spinbutton").fill("90");
    await expect(templateInspector).toContainText(/Customized/);
    await page.getByLabel("Global Card View").selectOption("piano");

    await ensureSelectedProgressionSettingsVisible(page);

    // Exact timing fixture: tempo, custom 7/8 grouping, and non-default Swing.
    await page.getByLabel("Tempo in BPM").fill("140");
    await page.getByLabel("Meter numerator").fill("7");
    await page.getByLabel("Meter denominator").selectOption("8");
    await page.getByLabel("Pulse grouping").fill("2+2+3");
    await page.locator("label.policy-option").filter({ hasText: "Preserve" }).click();
    await page.getByRole("button", { name: "Apply Meter Change" }).click();
    await expect(page.getByLabel("Meter numerator")).toHaveValue("7");
    await expect(page.getByLabel("Meter denominator")).toHaveValue("8");
    await page.getByRole("button", { name: "Toggle Swing Feel" }).click();
    await page.getByLabel("Swing Amount").fill("0.7");
    await expect(page.locator(".swing-percent")).toContainText("70%");

    // Keep an active, uncommitted temporary branch outside My Progression.
    await startBranchAlternative(page);
    await expect(page.getByRole("button", { name: "Commit Branch" })).toBeVisible();
    await page.getByTestId("chord-card-iv").locator("button.chord-main").click();
    await assertTemporaryBranch(page, 4);
    await expect(page.getByRole("region", { name: "Original versus Alternative" })).toContainText(
      "iv",
    );

    // Exercise transient transport runtime; it must not be resurrected by persistence.
    await expect(page.getByTestId("piano-audio-status")).toBeVisible();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByTestId("transport-status")).toContainText("Playing", { timeout: 10000 });
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");

    await waitForProductionAutosave(page);
    const fixtureSnapshot = await captureUs8AcceptanceSnapshot(page);
    expect(fixtureSnapshot.projectName).toBe(ACCEPTANCE_PROJECT_NAME);
    expect(fixtureSnapshot.performance.manualVoicingMidi).toEqual(expectedManualVoicingMidi);
    expect(fixtureSnapshot.performance.perNoteOverrides).toHaveLength(1);
    expect(fixtureSnapshot.performance.perNoteOverrides[0]?.velocity).toBe("110");
    await assertTemporaryBranch(page, fixtureSnapshot.progression.length);
    const projectCountBeforeReload = await countProjectsThroughUi(page);

    // Same browser storage context: initializeSession must recover this exact autosave.
    await page.reload();
    await expect(page.getByTestId("project-menu-toggle")).toContainText(ACCEPTANCE_PROJECT_NAME);
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");
    await expect(page.locator(".measure-staff-event.is-playing")).toHaveCount(0);
    await assertFreshHistory(page);
    expect(await countProjectsThroughUi(page)).toBe(projectCountBeforeReload);
    await openProjectMenu(page);
    await expect(
      page
        .getByTestId("project-open-select")
        .locator("option")
        .filter({ hasText: ACCEPTANCE_PROJECT_NAME }),
    ).toHaveCount(1);
    await page.getByTestId("project-menu-toggle").click();

    const recoveredSnapshot = await captureUs8AcceptanceSnapshot(page);
    expect(recoveredSnapshot).toEqual(fixtureSnapshot);
    await assertTemporaryBranch(page, fixtureSnapshot.progression.length);

    // Fresh history is functional: one normal edit, Undo, Redo, then restore the fixture value.
    const recoveredVelocity = page
      .locator("section.piano-performance-inspector")
      .getByLabel("Master Velocity", { exact: true });
    await recoveredVelocity.fill("96");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(recoveredVelocity).toHaveValue("95");
    await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(recoveredVelocity).toHaveValue("96");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(recoveredVelocity).toHaveValue("95");
    await assertTemporaryBranch(page, fixtureSnapshot.progression.length);

    // Export must come from the production Export menu path.
    await page.getByTestId("export-menu-toggle").click();
    await expect(page.getByRole("menu", { name: "Export menu" })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("project-export-btn").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.cadenceflow$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const exportedEnvelope = JSON.parse(await readFile(downloadPath!, "utf8")) as {
      schemaVersion: number;
    };
    expect(exportedEnvelope.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    const sourceSnapshotForPortableRoundTrip = await captureUs8AcceptanceSnapshot(page);

    // Fresh browser context: no IndexedDB from the source context can satisfy this import.
    const freshContext = await browser.newContext();
    let freshPage: Page | null = null;
    try {
      freshPage = await freshContext.newPage();
      await freshPage.addInitScript(() => {
        const testWindow = window as unknown as {
          __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
          __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean;
        };
        testWindow.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
        testWindow.__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
      });
      await freshPage.goto("/");
      await expect(freshPage.getByTestId("project-menu-toggle")).toBeVisible();
      await expect(freshPage.getByTestId("project-menu-toggle")).not.toContainText(
        ACCEPTANCE_PROJECT_NAME,
      );
      await assertFreshHistory(freshPage);
      await expect(freshPage.getByTestId("transport-status")).toContainText("Stopped");

      await openProjectMenu(freshPage);
      await freshPage.getByTestId("project-open-file-btn").click();
      await freshPage.getByTestId("project-file-input").setInputFiles(downloadPath!);
      await expect(freshPage.getByTestId("project-menu-toggle")).toContainText(
        ACCEPTANCE_PROJECT_NAME,
      );
      await freshPage.getByTestId("project-menu-toggle").click();
      await assertFreshHistory(freshPage);
      await expect(freshPage.getByTestId("transport-status")).toContainText("Stopped");
      await expect(freshPage.locator(".measure-staff-event.is-playing")).toHaveCount(0);
      await assertTemporaryBranch(freshPage, fixtureSnapshot.progression.length);

      const portableSnapshot = await captureUs8AcceptanceSnapshot(freshPage);
      expect(portableSnapshot).toEqual(sourceSnapshotForPortableRoundTrip);
      expect(portableSnapshot).toEqual(fixtureSnapshot);

      const importedVelocity = freshPage
        .locator("section.piano-performance-inspector")
        .getByLabel("Master Velocity", { exact: true });
      await importedVelocity.fill("96");
      await expect(freshPage.getByRole("button", { name: "Undo" })).toBeEnabled();
      await freshPage.getByRole("button", { name: "Undo" }).click();
      await expect(importedVelocity).toHaveValue("95");
      await expect(freshPage.getByRole("button", { name: "Redo" })).toBeEnabled();
      await freshPage.getByRole("button", { name: "Redo" }).click();
      await expect(importedVelocity).toHaveValue("96");
    } finally {
      await freshPage?.close({ runBeforeUnload: false });
      await freshContext.close();
    }
  });
});
