import { describe, expect, it, vi } from "vitest";
import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../../../src/audio/contracts";
import { LookAheadScheduler } from "../../../src/audio/scheduler";

class FakeAudioClock implements AudioClock {
  private currentTime: number;

  constructor(initial = 0) {
    this.currentTime = initial;
  }

  now(): number {
    return this.currentTime;
  }

  advance(seconds: number): void {
    this.currentTime += seconds;
  }

  setTime(time: number): void {
    this.currentTime = time;
  }
}

interface MockScheduledRecord {
  readonly id: string;
  readonly events: readonly AudioNoteEvent[];
  readonly scheduledAt: number;
  cancelled: boolean;
}

class MockProvider implements InstrumentAudioProvider {
  readonly id = "mock-provider";
  readonly state = "ready" as const;
  scheduledBatches: MockScheduledRecord[] = [];
  stopCallCount = 0;
  failOnSchedule = false;

  async prepare(): Promise<void> {
    // Already ready
  }

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    if (this.failOnSchedule) {
      throw new Error("Simulated provider failure");
    }

    const id = `batch-${this.scheduledBatches.length + 1}`;
    const record: MockScheduledRecord = {
      id,
      events: [...events],
      scheduledAt: clock.now(),
      cancelled: false,
    };
    this.scheduledBatches.push(record);

    return {
      id,
      cancel: () => {
        record.cancelled = true;
      },
    };
  }

  stop(_scope?: PlaybackScope): void {
    this.stopCallCount++;
    for (const batch of this.scheduledBatches) {
      batch.cancelled = true;
    }
  }

  async dispose(): Promise<void> {
    this.stop();
  }
}

describe("T090 — LookAheadScheduler", () => {
  it("schedules events within look-ahead horizon on tick without duplicate scheduling", () => {
    const clock = new FakeAudioClock(10.0);
    const provider = new MockProvider();

    const scheduledEvents: AudioNoteEvent[] = [];
    const scheduler = new LookAheadScheduler({
      clock,
      provider,
      lookAheadHorizonSeconds: 0.15, // 150ms horizon
      tickIntervalMs: 1000, // manual ticks for deterministic test
      onEventScheduled: (evt) => scheduledEvents.push(evt),
    });

    const events: AudioNoteEvent[] = [
      {
        pitch: 60,
        startSeconds: 0.0,
        durationSeconds: 0.5,
        velocity: 80,
        channelRole: "upper",
      },
      {
        pitch: 64,
        startSeconds: 0.1,
        durationSeconds: 0.5,
        velocity: 80,
        channelRole: "upper",
      },
      {
        pitch: 67,
        startSeconds: 0.3,
        durationSeconds: 0.5,
        velocity: 80,
        channelRole: "upper",
      },
      {
        pitch: 72,
        startSeconds: 0.8,
        durationSeconds: 0.5,
        velocity: 80,
        channelRole: "upper",
      },
    ];

    // Start at clock time 10.0
    scheduler.start(events);

    // Initial tick at t=10.0:
    // Window is [10.0, 10.15].
    // evt0 (start 0.0 => target 10.0) and evt1 (start 0.1 => target 10.1) should be scheduled.
    expect(scheduledEvents).toHaveLength(2);
    expect(scheduledEvents[0]!.pitch).toBe(60);
    expect(scheduledEvents[1]!.pitch).toBe(64);
    expect(provider.scheduledBatches).toHaveLength(1);
    expect(provider.scheduledBatches[0]!.events).toHaveLength(2);

    // Relative startSeconds in scheduled batch must match target - currentAudioTime
    expect(provider.scheduledBatches[0]!.events[0]!.startSeconds).toBeCloseTo(0.0, 4);
    expect(provider.scheduledBatches[0]!.events[1]!.startSeconds).toBeCloseTo(0.1, 4);

    // Calling tick() again at the same time must NOT schedule duplicates
    scheduler.tick();
    expect(scheduledEvents).toHaveLength(2);
    expect(provider.scheduledBatches).toHaveLength(1);

    // Advance clock to 10.10: window is [10.10, 10.25]
    clock.advance(0.1);
    scheduler.tick();
    // evt2 starts at 0.3 (target 10.3) which is > 10.25, so not yet scheduled
    expect(scheduledEvents).toHaveLength(2);
    expect(provider.scheduledBatches).toHaveLength(1);

    // Advance clock to 10.20: window is [10.20, 10.35]
    clock.advance(0.1);
    scheduler.tick();
    // evt2 (target 10.30) is now in window [10.20, 10.35]
    expect(scheduledEvents).toHaveLength(3);
    expect(scheduledEvents[2]!.pitch).toBe(67);
    expect(provider.scheduledBatches).toHaveLength(2);
    // Relative startSeconds: target 10.30 - current 10.20 = 0.10
    expect(provider.scheduledBatches[1]!.events[0]!.startSeconds).toBeCloseTo(0.1, 4);

    // Advance clock to 10.70: window is [10.70, 10.85]
    clock.advance(0.5);
    scheduler.tick();
    // evt3 (target 10.80) is scheduled
    expect(scheduledEvents).toHaveLength(4);
    expect(scheduledEvents[3]!.pitch).toBe(72);
    expect(provider.scheduledBatches).toHaveLength(3);

    // No duplicates ever scheduled
    expect(scheduler.scheduledCount).toBe(4);
    scheduler.stop();
  });

  it("handles pause and resume with accurate musical offset tracking", () => {
    const clock = new FakeAudioClock(0.0);
    const provider = new MockProvider();

    const scheduler = new LookAheadScheduler({
      clock,
      provider,
      lookAheadHorizonSeconds: 0.1,
      tickIntervalMs: 1000,
    });

    const events: AudioNoteEvent[] = [
      {
        pitch: 60,
        startSeconds: 0.0,
        durationSeconds: 1.0,
        velocity: 80,
        channelRole: "upper",
      },
      {
        pitch: 64,
        startSeconds: 2.0,
        durationSeconds: 1.0,
        velocity: 80,
        channelRole: "upper",
      },
    ];

    scheduler.start(events);
    expect(scheduler.scheduledCount).toBe(1); // pitch 60

    // Advance to 1.5 seconds and pause
    clock.advance(1.5);
    const pausedPos = scheduler.pause();
    expect(pausedPos).toBe(1.5);
    expect(scheduler.currentState).toBe("paused");
    expect(provider.stopCallCount).toBe(1);

    // Advance clock further while paused (wall clock passes)
    clock.advance(5.0); // clock is now 6.5s

    // Resume from paused position (1.5s)
    scheduler.resume();
    expect(scheduler.currentState).toBe("running");

    // Advance to 6.9s (musical time 1.9s, horizon reaches 2.0s)
    clock.advance(0.4); // clock is now 6.9s. Resumed elapsed = 1.5 + 0.4 = 1.9s. Horizon = 1.9 + 0.1 = 2.0s
    scheduler.tick();

    // Event at 2.0s should now be scheduled!
    expect(scheduler.scheduledCount).toBe(2);
    scheduler.stop();
  });

  it("stop() cancels all active batches and is idempotent", () => {
    const clock = new FakeAudioClock(0.0);
    const provider = new MockProvider();

    const scheduler = new LookAheadScheduler({
      clock,
      provider,
      lookAheadHorizonSeconds: 0.5,
    });

    scheduler.start([
      {
        pitch: 60,
        startSeconds: 0.0,
        durationSeconds: 1.0,
        velocity: 80,
        channelRole: "upper",
      },
    ]);

    expect(provider.scheduledBatches[0]!.cancelled).toBe(false);

    // Stop cancels batches and calls provider.stop()
    scheduler.stop();
    expect(scheduler.currentState).toBe("idle");
    expect(provider.scheduledBatches[0]!.cancelled).toBe(true);
    expect(provider.stopCallCount).toBe(1);

    // Calling stop again does not throw
    expect(() => scheduler.stop()).not.toThrow();
    expect(() => scheduler.stop({ sessionId: "test" })).not.toThrow();
    expect(scheduler.currentState).toBe("idle");
  });

  it("dispose() stops cleanly and prevents further starts", () => {
    const clock = new FakeAudioClock(0.0);
    const provider = new MockProvider();

    const scheduler = new LookAheadScheduler({ clock, provider });
    scheduler.dispose();
    expect(scheduler.currentState).toBe("disposed");

    expect(() => scheduler.start([])).toThrow("Cannot start a disposed LookAheadScheduler");
    expect(() => scheduler.resume()).toThrow("Cannot resume a disposed LookAheadScheduler");
  });

  it("handles provider schedule error without uncaught crash", () => {
    const clock = new FakeAudioClock(0.0);
    const provider = new MockProvider();
    provider.failOnSchedule = true;

    const onError = vi.fn();
    const scheduler = new LookAheadScheduler({
      clock,
      provider,
      onError,
    });

    // Starting scheduling will trigger tick() with provider failure
    expect(() => {
      scheduler.start([
        {
          pitch: 60,
          startSeconds: 0.0,
          durationSeconds: 1.0,
          velocity: 80,
          channelRole: "upper",
        },
      ]);
    }).not.toThrow();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(scheduler.currentState).toBe("idle");
  });

  it("calls onPlaybackEnded when all events have played through to completion", () => {
    const clock = new FakeAudioClock(0.0);
    const provider = new MockProvider();
    const onEnded = vi.fn();

    const scheduler = new LookAheadScheduler({
      clock,
      provider,
      lookAheadHorizonSeconds: 0.2,
      tickIntervalMs: 1000,
      onPlaybackEnded: onEnded,
    });

    scheduler.start([
      {
        pitch: 60,
        startSeconds: 0.0,
        durationSeconds: 1.0,
        velocity: 80,
        channelRole: "upper",
      },
    ]);

    expect(onEnded).not.toHaveBeenCalled();

    // Advance clock past note end time (0.0 + 1.0 = 1.0s)
    clock.advance(1.1);
    scheduler.tick();

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(scheduler.currentState).toBe("idle");
  });

  it("ticks automatically using timer without manual tick calls", () => {
    vi.useFakeTimers();
    try {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockProvider();

      const scheduler = new LookAheadScheduler({
        clock,
        provider,
        lookAheadHorizonSeconds: 0.1,
        tickIntervalMs: 25,
      });

      scheduler.start([
        {
          pitch: 60,
          startSeconds: 0.0,
          durationSeconds: 0.5,
          velocity: 80,
          channelRole: "upper",
        },
        {
          pitch: 64,
          startSeconds: 0.2,
          durationSeconds: 0.5,
          velocity: 80,
          channelRole: "upper",
        },
      ]);

      expect(scheduler.scheduledCount).toBe(1);

      // Advance clock by 0.15s and trigger timers by 150ms
      clock.advance(0.15);
      vi.advanceTimersByTime(150);

      // Look-ahead window is now [0.15, 0.25], so note at 0.2s is scheduled!
      expect(scheduler.scheduledCount).toBe(2);
      scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
