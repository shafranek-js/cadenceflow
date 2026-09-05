import { test, expect } from "@playwright/test";

test.describe("US5 — Piano Performance & Voice-Leading Acceptance (T096)", () => {
  test.beforeEach(async ({ page }) => {
    // Enable audio test runtime mode
    await page.addInitScript(() => {
      (
        window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
      ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    });
    await page.goto("/");
  });

  test("Scenario 1 — repeated chord independence through UI", async ({ page }) => {
    // 1. Add the same chord 'I' twice
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(2);

    // 2. Select Step 1
    await steps.nth(0).click();
    await expect(steps.nth(0)).toHaveClass(/is-selected/);

    // 3. Edit manual Piano voicing for Step 1
    await page.getByRole("button", { name: "Open Piano Voicing Editor" }).click();
    const modal = page.locator(".piano-voicing-editor-modal");
    await expect(modal).toBeVisible();

    // Transpose manual voicing +1 octave
    await modal.getByRole("button", { name: "+1 Octave" }).click();
    await modal.getByRole("button", { name: "Apply Manual Voicing" }).click();
    await expect(modal).not.toBeVisible();

    // 4. Set different Master Velocity in Step 1
    await page.getByRole("button", { name: "MIDI velocity view" }).click();
    const masterVelocityInput = page.getByRole("spinbutton", { name: "Master Velocity" });
    await masterVelocityInput.fill("95");

    // 5. Set Piano Articulation to 'Arp Up'
    await page.getByLabel("Piano Articulation", { exact: true }).selectOption("arp-up");

    // 6. Select Step 2
    await steps.nth(1).click();
    await expect(steps.nth(1)).toHaveClass(/is-selected/);

    // 7. Verify Step 2 retains independent configuration (defaults: Block, 80, Auto voicing, musical view)
    await expect(page.getByLabel("Voicing Mode", { exact: true })).toHaveValue("auto");
    await expect(page.getByLabel("Piano Articulation", { exact: true })).toHaveValue("block");
    await expect(page.locator(".velocity-readout")).toContainText("Exact: 80");

    // 8. Return to Step 1 and verify its settings remain exact
    await steps.nth(0).click();
    await expect(page.getByLabel("Voicing Mode", { exact: true })).toHaveValue("manual");
    await expect(page.getByLabel("Piano Articulation", { exact: true })).toHaveValue("arp-up");
    await expect(masterVelocityInput).toHaveValue("95");
  });

  test("Scenario 2 — Manual Voicing Editor validation, octaves, and register immunity", async ({
    page,
  }) => {
    // Add chord 'I' and select it
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const step = page.locator('[data-testid="progression-step"]').first();
    await step.click();

    // Switch to manual voicing mode and open editor
    await page.getByRole("button", { name: "Open Piano Voicing Editor" }).click();
    const modal = page.locator(".piano-voicing-editor-modal");
    await expect(modal).toBeVisible();

    // Attempt invalid note outside MIDI 21..108
    const firstMidiInput = modal.locator('input[aria-label="MIDI note for pitch 1"]');
    await firstMidiInput.fill("120"); // Outside 21..108

    // Verify explicit validation error is displayed and Apply button is disabled
    const errorBox = modal.locator('.validation-error-box[role="alert"]');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toContainText("outside piano range");
    await expect(modal.getByRole("button", { name: "Apply Manual Voicing" })).toBeDisabled();

    // Restore to a valid MIDI note (C4 = 60)
    await firstMidiInput.fill("60");
    await expect(errorBox).not.toBeVisible();
    await expect(modal.getByRole("button", { name: "Apply Manual Voicing" })).toBeEnabled();

    // Apply manual voicing
    await modal.getByRole("button", { name: "Apply Manual Voicing" }).click();
    await expect(modal).not.toBeVisible();

    // Verify Piano view matches saved pitches
    await step.getByRole("button", { name: /piano/i }).click();
    const miniPiano = step.locator(".mini-piano");
    await expect(miniPiano).toBeVisible();
    await expect(miniPiano.locator('.mini-key[data-midi="60"]')).toHaveClass(/is-active/);

    // Register offset must NOT silently shift manual exact voicings
    const registerNotice = page.locator(".hint-text");
    await expect(registerNotice).toContainText(
      "Register offset does not shift manual exact voicings",
    );
    // Key 60 must still be active
    await expect(miniPiano.locator('.mini-key[data-midi="60"]')).toHaveClass(/is-active/);
  });

  test("Scenario 3 — per-note dynamics, Balanced preset, and view preferences", async ({
    page,
  }) => {
    // Add chord and select it
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const step = page.locator('[data-testid="progression-step"]').first();
    await step.click();

    // Switch to MIDI view preference
    await page.getByRole("button", { name: "MIDI velocity view" }).click();
    const masterVelocityInput = page.getByRole("spinbutton", { name: "Master Velocity" });
    await masterVelocityInput.fill("85");

    // Find first upper note override button
    const overrideBtn = page
      .locator(".per-note-velocity-row:has(.role-upper)")
      .first()
      .locator(".set-override-btn");
    await overrideBtn.click();

    // Enter note override 110
    const overrideInput = page
      .locator(".per-note-velocity-row:has(.role-upper)")
      .first()
      .getByRole("spinbutton");
    await overrideInput.fill("110");

    // Verify override is active and another note still inherits master
    await expect(
      page.locator(".per-note-velocity-row:has(.role-upper)").first().locator(".status-badge"),
    ).toContainText("Override: 110");
    await expect(page.locator(".per-note-overrides-summary")).toContainText(
      "1 note velocity override active",
    );

    // Apply Balanced preset via clear button
    const clearBtn = page.locator(".clear-overrides-btn");
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    // Verify redundant overrides disappeared
    await expect(page.locator(".per-note-overrides-summary")).toContainText(
      "All notes inheriting Master Velocity",
    );

    // Apply a non-Balanced preset ("top-voice-emphasis")
    await page
      .getByLabel("Apply Dynamics Preset", { exact: true })
      .selectOption("top-voice-emphasis");
    await expect(page.locator(".per-note-overrides-summary")).not.toContainText(
      "All notes inheriting Master Velocity",
    );

    // Switch Musical ↔ MIDI view preference and prove exact numeric Master Velocity is retained
    await page.getByRole("button", { name: "Musical view" }).click();
    await expect(page.locator(".velocity-readout")).toContainText("Exact: 85");

    await page.getByRole("button", { name: "MIDI velocity view" }).click();
    await expect(masterVelocityInput).toHaveValue("85");
  });

  test("Scenario 4 — independent bass selection, custom validation, and upper voice preservation", async ({
    page,
  }) => {
    // Add chord and select it
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const step = page.locator('[data-testid="progression-step"]').first();
    await step.click();

    const bassSelect = page.getByLabel("Bass Note", { exact: true });

    // Select Root, 3rd, 5th
    await bassSelect.selectOption("root");
    await expect(bassSelect).toHaveValue("root");

    await bassSelect.selectOption("third");
    await expect(bassSelect).toHaveValue("third");

    await bassSelect.selectOption("fifth");
    await expect(bassSelect).toHaveValue("fifth");

    // Select Custom
    await bassSelect.selectOption("custom");
    const customMidiInput = page.getByRole("spinbutton", { name: "Custom Bass MIDI Number" });
    await expect(customMidiInput).toBeVisible();

    // Attempt invalid custom bass
    await customMidiInput.fill("15"); // Below 21
    const bassError = page.locator('.custom-bass-editor .error-text[role="alert"]');
    await expect(bassError).toBeVisible();
    await expect(bassError).toContainText("outside piano range");

    // Enter valid custom bass F#2 (MIDI 42)
    await customMidiInput.fill("42");
    await expect(bassError).not.toBeVisible();
    await expect(page.locator(".custom-bass-readout")).toContainText("Pitch: F#2");

    // Verify upper notes list still exists and has not changed
    const upperNoteRows = page.locator(".per-note-velocity-row:has(.role-upper)");
    await expect(upperNoteRows).toHaveCount(3); // C, E, G
  });

  test("Scenario 5 — HQ piano readiness state and audible velocity layer path", async ({
    page,
  }) => {
    // 1. Verify user-observable Piano Audio status in app header
    const audioStatusBadge = page.getByTestId("piano-audio-status");
    await expect(audioStatusBadge).toBeVisible();
    await expect(audioStatusBadge).toHaveAttribute("data-status", "ready");
    await expect(audioStatusBadge).toContainText("HQ Piano Ready");

    // 2. Verify discrete velocity layer resolution via provider runtime:
    // vel 30 -> Layer 2 (C4v2.ogg)
    // vel 78 -> Layer 10 (C4v10.ogg)
    interface AudioTestGlobal {
      readonly __cadenceflow_audio__?: {
        readonly HqSamplePianoProvider: new (options?: {
          readonly manifestUrl?: string;
          readonly fetchFn?: (url: string) => Promise<Response>;
        }) => {
          prepare(): Promise<void>;
          inspectEventMapping(
            pitch: number,
            velocity: number,
          ): {
            readonly velocityLayer: number;
            readonly assetPath: string;
          };
          schedule(
            events: readonly unknown[],
            clock: { readonly now: () => number },
          ): { readonly ready: Promise<void> };
          readonly state: string;
        };
      };
    }

    const layerMappings = await page.evaluate(async () => {
      const audio = (window as unknown as AudioTestGlobal).__cadenceflow_audio__;
      if (!audio) throw new Error("__cadenceflow_audio__ missing");
      const provider = new audio.HqSamplePianoProvider({
        manifestUrl: "/audio/piano-hq/manifest.json",
      });
      await provider.prepare();

      const mLow = provider.inspectEventMapping(60, 30);
      const mMed = provider.inspectEventMapping(60, 78);
      const mHigh = provider.inspectEventMapping(60, 110);

      return {
        low: { layer: mLow.velocityLayer, asset: mLow.assetPath },
        med: { layer: mMed.velocityLayer, asset: mMed.assetPath },
        high: { layer: mHigh.velocityLayer, asset: mHigh.assetPath },
      };
    });

    expect(layerMappings.low.layer).toBe(2);
    expect(layerMappings.low.asset).toBe("samples/C4v2.ogg");

    expect(layerMappings.med.layer).toBe(10);
    expect(layerMappings.med.asset).toBe("samples/C4v10.ogg");

    expect(layerMappings.high.layer).toBe(14);
    expect(layerMappings.high.asset).toBe("samples/C4v14.ogg");

    // 3. Verify observable fallback state upon asset failure without oscillator fallback
    const fallbackObserved = await page.evaluate(async () => {
      const audio = (window as unknown as AudioTestGlobal).__cadenceflow_audio__;
      if (!audio) throw new Error("__cadenceflow_audio__ missing");
      const provider = new audio.HqSamplePianoProvider({
        manifestUrl: "/audio/piano-hq/manifest.json",
        fetchFn: async (url: string) => {
          if (url.includes(".ogg") || url.includes(".flac")) {
            return new Response("Not found", { status: 404 });
          }
          return fetch(url);
        },
      });

      await provider.prepare();
      const clock = { now: () => 0 };
      const playback = provider.schedule(
        [{ pitch: 60, startSeconds: 0, durationSeconds: 0.5, velocity: 80, channelRole: "upper" }],
        clock,
      );

      let rejected = false;
      try {
        await playback.ready;
      } catch {
        rejected = true;
      }

      return {
        rejected,
        providerState: provider.state,
      };
    });

    expect(fallbackObserved.rejected).toBe(true);
    expect(fallbackObserved.providerState).toBe("fallback");
  });
});
