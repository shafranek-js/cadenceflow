import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

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

async function countProjectsThroughUi(page: Page): Promise<number> {
  await openProjectMenu(page);
  const count = await page
    .getByTestId("project-open-select")
    .locator("option")
    .evaluateAll((options) => options.filter((option) => option.value).length);
  await page.getByTestId("project-menu-toggle").click();
  return count;
}

async function addChord(page: Page, functionId: string): Promise<void> {
  const card = page.getByTestId(`chord-card-${functionId}`);
  await card
    .getByRole("button", { name: new RegExp(`Add ${functionId} to progression`, "i") })
    .click();
}

async function captureUs8AcceptanceSnapshot(page: Page): Promise<AcceptanceSnapshot> {
  const progression = await page.locator('[data-testid="progression-step"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const isRest = node.classList.contains("progression-rest-card");
      return {
        kind: isRest ? ("rest" as const) : ("chord" as const),
        functionId:
          node.querySelector('[data-testid="step-function"]')?.textContent?.trim() ?? "Rest",
        visibleSummary:
          node.querySelector(".step-view")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      };
    }),
  );
  const performanceInspector = page.locator("section.piano-performance-inspector");
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
  await templateCard.getByRole("button", { name: "Settings for i" }).click();
  const templateInspector = page.getByRole("region", { name: "Template settings for i" });
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
        .getByLabel("Piano Articulation", { exact: true })
        .inputValue(),
      voicingMode: await performanceInspector
        .getByLabel("Voicing Mode", { exact: true })
        .inputValue(),
      manualVoicingMidi,
      register: await performanceInspector.getByLabel("Register offset").inputValue(),
      bassNote: await performanceInspector.getByLabel("Bass Note", { exact: true }).inputValue(),
      bassOctave: await performanceInspector
        .getByLabel("Bass Octave", { exact: true })
        .inputValue(),
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
      articulation: await templateInspector.locator("select").nth(0).inputValue(),
      register: await templateInspector.locator("select").nth(1).inputValue(),
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
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
}

async function assertTemporaryBranch(page: Page, expectedProgressionCount: number): Promise<void> {
  await expect(page.getByText("What-if branch active", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Commit Branch" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Original versus Alternative" })).toBeVisible();
  await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(
    expectedProgressionCount,
  );
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

    await openProjectMenu(page);
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill("Recovered Session");
    await page.getByRole("button", { name: "Create Project" }).click();
    await page.getByTestId("chord-card-I").getByRole("button", { name: /Add I/ }).click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    await page.reload();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Recovered Session");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("exports canonical project data and opens it through the file chooser with fresh history", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();

    // Add a real progression step so the exported payload is non-trivial and
    // creates an Undo entry that must disappear after import.
    await page.getByTestId("chord-card-I").getByRole("button", { name: /Add I/ }).click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    await openProjectMenu(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("project-export-btn").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("CadenceFlow.cadenceflow");
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();

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

    await openProjectMenu(page);
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill(ACCEPTANCE_PROJECT_NAME);
    await page.getByRole("button", { name: "Create Project" }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText(ACCEPTANCE_PROJECT_NAME);
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
    await expect(page.getByText("Dark Harmony · Tonal Minor", { exact: true })).toBeVisible();

    // Four persisted progression steps: three sounding chords and one Rest.
    await addChord(page, "i");
    await addChord(page, "V");
    await addChord(page, "VI");
    await page.getByRole("button", { name: "Add Rest to progression" }).click();
    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(4);

    // Step-local performance and timing fixture.
    await steps.nth(0).click();
    await page.getByLabel("Register offset").selectOption("1");
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
    await page.getByLabel("Piano Articulation", { exact: true }).selectOption("arp-up");
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
    await page.getByTestId("chord-card-i").getByRole("button", { name: "Settings for i" }).click();
    const templateInspector = page.getByRole("region", { name: "Template settings for i" });
    await expect(templateInspector).toBeVisible();
    await templateInspector.locator("select").nth(0).selectOption("humanized");
    await templateInspector.locator("select").nth(1).selectOption("1");
    await templateInspector.getByRole("spinbutton").fill("90");
    await expect(templateInspector).toContainText(/Customized/);
    await page.getByLabel("Global Card View").selectOption("piano");

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
    await page.getByRole("button", { name: "Explore Alternative" }).click();
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
    await expect(page.locator('[data-testid="progression-step"][data-playing="true"]')).toHaveCount(
      0,
    );
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

    // Export must come from the production Project menu path.
    await openProjectMenu(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("project-export-btn").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.cadenceflow$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const exportedEnvelope = JSON.parse(await readFile(downloadPath!, "utf8")) as {
      schemaVersion: number;
    };
    expect(exportedEnvelope.schemaVersion).toBe(1);
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
      await expect(
        freshPage.locator('[data-testid="progression-step"][data-playing="true"]'),
      ).toHaveCount(0);
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
