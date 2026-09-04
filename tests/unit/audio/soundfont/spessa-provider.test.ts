import { describe, expect, it, vi } from "vitest";
import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  ScheduledPlayback,
} from "../../../../src/audio/contracts";
import { HqSamplePianoProvider } from "../../../../src/audio/hq-sample-piano/provider";
import type { ISpessaSynth } from "../../../../src/audio/soundfont/spessaProvider";
import { SpessaSoundFontProvider } from "../../../../src/audio/soundfont/spessaProvider";

function createMockSynth(): ISpessaSynth {
  return {
    isReady: Promise.resolve(),
    soundBankManager: {
      addSoundBank: vi.fn(async () => undefined),
    },
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    stopAll: vi.fn(),
    destroy: vi.fn(),
  };
}

describe("T093 — SpessaSoundFontProvider & Contract Interchangeability", () => {
  it("transitions lifecycle states cleanly: idle -> loading -> ready", async () => {
    const synth = createMockSynth();
    const provider = new SpessaSoundFontProvider({
      audioContext: {} as BaseAudioContext,
      synthFactory: () => synth,
    });

    expect(provider.state).toBe("idle");
    const preparePromise = provider.prepare();
    expect(provider.state).toBe("loading");

    await preparePromise;
    expect(provider.state).toBe("ready");
    expect(provider.underlyingSynth).toBe(synth);
  });

  it("handles soundfont prepare failure by transitioning to error state", async () => {
    const provider = new SpessaSoundFontProvider({
      audioContext: {} as BaseAudioContext,
      synthFactory: () => {
        throw new Error("SoundFont init failed");
      },
    });

    await expect(provider.prepare()).rejects.toThrow("SoundFont init failed");
    expect(provider.state).toBe("error");
  });

  it("schedules canonical AudioNoteEvent[] into synthesizer noteOn and noteOff", async () => {
    vi.useFakeTimers();
    try {
      const synth = createMockSynth();
      const provider = new SpessaSoundFontProvider({
        audioContext: {} as BaseAudioContext,
        synthFactory: () => synth,
      });

      await provider.prepare();

      const clock: AudioClock = { now: () => 0 };
      const events: AudioNoteEvent[] = [
        {
          pitch: 60,
          startSeconds: 0.0,
          durationSeconds: 0.5,
          velocity: 85,
          channelRole: "upper",
        },
        {
          pitch: 36,
          startSeconds: 0.2,
          durationSeconds: 0.5,
          velocity: 95,
          channelRole: "bass",
        },
      ];

      const playback = provider.schedule(events, clock);
      expect(playback.id).toBeDefined();

      // Immediate noteOn for event at startSeconds: 0.0
      vi.advanceTimersByTime(1);
      expect(synth.noteOn).toHaveBeenCalledWith(0, 60, 85); // channel 0 (upper)

      // At t = 200ms: noteOn for event at startSeconds: 0.2 (bass)
      vi.advanceTimersByTime(200);
      expect(synth.noteOn).toHaveBeenCalledWith(1, 36, 95); // channel 1 (bass)

      // At t = 500ms: noteOff for pitch 60
      vi.advanceTimersByTime(300);
      expect(synth.noteOff).toHaveBeenCalledWith(0, 60);

      // At t = 700ms: noteOff for pitch 36
      vi.advanceTimersByTime(200);
      expect(synth.noteOff).toHaveBeenCalledWith(1, 36);

      provider.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("proves strict contract interchangeability between HqSamplePianoProvider and SpessaSoundFontProvider", async () => {
    // Both providers implement InstrumentAudioProvider contract
    const hqProvider: InstrumentAudioProvider = new HqSamplePianoProvider({
      manifestData: {
        schemaVersion: 1,
        instrumentId: "test-piano",
        displayName: "Test Piano",
        sampleFormat: "ogg",
        sampleRate: 48000,
        regions: [
          {
            id: "C4v10",
            rootPitch: 60,
            keyRange: { min: 60, max: 60 },
            velocityRange: { min: 70, max: 90 },
            velocityLayer: 10,
            assetPath: "samples/C4v10.ogg",
          },
        ],
      },
    });

    const sfProvider: InstrumentAudioProvider = new SpessaSoundFontProvider({
      audioContext: {} as BaseAudioContext,
      synthFactory: () => createMockSynth(),
    });

    // Client function that interacts only with the abstract InstrumentAudioProvider contract
    async function playComposition(
      provider: InstrumentAudioProvider,
      events: readonly AudioNoteEvent[],
      clock: AudioClock,
    ): Promise<ScheduledPlayback> {
      await provider.prepare();
      return provider.schedule(events, clock);
    }

    const testEvents: readonly AudioNoteEvent[] = [
      {
        pitch: 60,
        startSeconds: 0,
        durationSeconds: 1,
        velocity: 80,
        channelRole: "upper",
      },
    ];
    const clock: AudioClock = { now: () => 0 };

    const playback1 = await playComposition(hqProvider, testEvents, clock);
    const playback2 = await playComposition(sfProvider, testEvents, clock);

    expect(playback1.id).toBeDefined();
    expect(playback2.id).toBeDefined();

    expect(() => hqProvider.stop()).not.toThrow();
    expect(() => sfProvider.stop()).not.toThrow();

    await expect(hqProvider.dispose()).resolves.toBeUndefined();
    await expect(sfProvider.dispose()).resolves.toBeUndefined();
  });
});
