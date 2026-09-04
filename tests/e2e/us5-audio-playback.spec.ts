import { expect, test } from "@playwright/test";

test.describe("T092/T094 — Real Browser Audio Smoke Test with Prepared Salamander Samples", () => {
  test("loads real Salamander manifest and decodes velocity-sensitive Ogg samples in real Chromium WebAudio", async ({
    page,
  }) => {
    await page.goto("/");

    // Execute real browser WebAudio playback test using actual prepared Salamander assets
    const result = await page.evaluate(async () => {
      // Access provider modules exposed on window
      const audioRuntime = (
        window as unknown as {
          __cadenceflow_audio__: {
            HqSamplePianoProvider: typeof import("../../src/audio/hq-sample-piano/provider").HqSamplePianoProvider;
          };
        }
      ).__cadenceflow_audio__;
      const { HqSamplePianoProvider } = audioRuntime;

      const audioCtx = new AudioContext();
      // Resume audio context if suspended by browser autoplay policy
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const provider = new HqSamplePianoProvider({
        manifestUrl: "/audio/piano-hq/manifest.json",
        audioContext: audioCtx,
      });

      const initialStatus = provider.state;
      await provider.prepare();
      const readyStatus = provider.state;

      // Schedule low, medium, and high velocity C4 notes
      const clock = { now: () => audioCtx.currentTime };
      const playback = provider.schedule(
        [
          {
            pitch: 60, // C4
            startSeconds: 0.0,
            durationSeconds: 0.5,
            velocity: 30, // Layer 4
            channelRole: "upper",
          },
          {
            pitch: 60, // C4
            startSeconds: 0.6,
            durationSeconds: 0.5,
            velocity: 78, // Layer 10
            channelRole: "upper",
          },
          {
            pitch: 60, // C4
            startSeconds: 1.2,
            durationSeconds: 0.5,
            velocity: 110, // Layer 14
            channelRole: "upper",
          },
        ],
        clock,
      );

      // Await all buffers loaded and decoded
      await (playback as { ready?: Promise<void> }).ready;

      // Inspect cache stats and decoded buffer metadata
      const cache = provider.cache;
      const cacheStats = cache ? cache.stats : null;

      const hasLayer4 = cache ? cache.has("samples/C4v4.ogg") : false;
      const hasLayer10 = cache ? cache.has("samples/C4v10.ogg") : false;
      const hasLayer14 = cache ? cache.has("samples/C4v14.ogg") : false;

      let layer4SampleRate = 0;
      let layer4Duration = 0;
      if (cache && hasLayer4) {
        const buf = await cache.get("samples/C4v4.ogg");
        layer4SampleRate = buf.sampleRate;
        layer4Duration = buf.duration;
      }

      // Diagnostic mappings for evidence
      const lowMapping = provider.inspectEventMapping(60, 30);
      const medMapping = provider.inspectEventMapping(60, 78);
      const highMapping = provider.inspectEventMapping(60, 110);

      provider.stop();
      await provider.dispose();

      return {
        initialStatus,
        readyStatus,
        cacheStats,
        hasLayer4,
        hasLayer10,
        hasLayer14,
        layer4SampleRate,
        layer4Duration,
        lowMapping,
        medMapping,
        highMapping,
        finalStatus: provider.state,
      };
    });

    expect(result.initialStatus).toBe("idle");
    expect(result.readyStatus).toBe("ready");

    // Proves distinct velocity layers for low / medium / high
    expect(result.lowMapping.velocityLayer).toBe(4);
    expect(result.lowMapping.assetPath).toBe("samples/C4v4.ogg");

    expect(result.medMapping.velocityLayer).toBe(10);
    expect(result.medMapping.assetPath).toBe("samples/C4v10.ogg");

    expect(result.highMapping.velocityLayer).toBe(14);
    expect(result.highMapping.assetPath).toBe("samples/C4v14.ogg");

    // Proves actual browser WebAudio decoding of 48kHz Ogg samples
    expect(result.hasLayer4).toBe(true);
    expect(result.hasLayer10).toBe(true);
    expect(result.hasLayer14).toBe(true);

    expect(result.layer4SampleRate).toBe(48000);
    expect(result.layer4Duration).toBeGreaterThan(5.0); // full acoustic decay preserved!

    expect(result.cacheStats?.size).toBe(3);
    expect(result.finalStatus).toBe("idle");
  });
});
