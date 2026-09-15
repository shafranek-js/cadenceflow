import { describe, expect, it, vi } from "vitest";
import {
  AcousticGuitarProvider,
  generateKarplusStrongBuffer,
} from "../../../../src/audio/guitar/AcousticGuitarProvider";
import type { AudioNoteEvent } from "../../../../src/audio/contracts";

describe("AcousticGuitarProvider", () => {
  it("generates Karplus-Strong physical modeling buffers correctly", () => {
    const sampleRate = 44100;
    const frequency = 440; // A4
    const duration = 1.0;
    const velocity = 80;

    const buffer = generateKarplusStrongBuffer(sampleRate, frequency, duration, velocity);

    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(44100);

    // Initial excitation noise has amplitude
    let nonZero = 0;
    for (let i = 0; i < 100; i++) {
      if (Math.abs(buffer[i]!) > 0.0001) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(50);

    // Decay should cause the end of the buffer to be quieter than the start
    let startRms = 0;
    for (let i = 0; i < 1000; i++) startRms += buffer[i]! * buffer[i]!;
    let endRms = 0;
    for (let i = 40000; i < 41000; i++) endRms += buffer[i]! * buffer[i]!;

    expect(startRms).toBeGreaterThan(endRms);
  });

  it("prepares and manages ready state and playback lifecycle", async () => {
    const stateTransitions: string[] = [];
    const provider = new AcousticGuitarProvider({
      onStateChange: (s) => stateTransitions.push(s),
    });

    expect(provider.state).toBe("idle");
    await provider.prepare();
    expect(provider.state).toBe("ready");
    expect(stateTransitions).toContain("ready");

    const events: AudioNoteEvent[] = [
      { pitch: 40, startSeconds: 0, durationSeconds: 1.0, velocity: 80, channelRole: "upper" },
      { pitch: 47, startSeconds: 0, durationSeconds: 1.0, velocity: 80, channelRole: "upper" },
      { pitch: 52, startSeconds: 0, durationSeconds: 1.0, velocity: 80, channelRole: "upper" },
    ];

    const playback = provider.schedule(events, provider.clock);
    expect(playback.id).toContain("guitar-playback");

    playback.cancel();
    provider.stop();
    await provider.dispose();
    expect(provider.state).toBe("idle");
  });
});
