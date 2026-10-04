import { describe, expect, it, vi } from "vitest";
import {
  advanceMidiCursor,
  INITIAL_MIDI_STEP_INPUT_SNAPSHOT,
  MIDI_STEP_DURATIONS,
  MidiStepInputController,
  parseMidiCursor,
  parseMidiNoteOn,
  snapMidiCursor,
  type MidiAccessLike,
  type MidiInputLike,
  type MidiMessageLike,
  type MidiNavigatorLike,
} from "../../../src/ui/melody/midiStepInput";
import { compareRational, rational } from "../../../src/domain/timing/rational";

class FakeInput implements MidiInputLike {
  readonly listeners = new Set<(event: MidiMessageLike) => void>();
  state: "connected" | "disconnected" = "connected";

  constructor(
    readonly id: string,
    readonly name = id,
  ) {}

  addEventListener(_type: "midimessage", listener: (event: MidiMessageLike) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "midimessage", listener: (event: MidiMessageLike) => void): void {
    this.listeners.delete(listener);
  }

  emit(data: readonly number[]): void {
    for (const listener of this.listeners) listener({ data });
  }
}

class FakeAccess implements MidiAccessLike {
  readonly listeners = new Set<() => void>();

  constructor(readonly inputs: ReadonlyMap<string, FakeInput>) {}

  addEventListener(_type: "statechange", listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "statechange", listener: () => void): void {
    this.listeners.delete(listener);
  }

  statechange(): void {
    for (const listener of this.listeners) listener();
  }
}

function navigatorWith(access: FakeAccess): MidiNavigatorLike {
  return { requestMIDIAccess: vi.fn(async () => access) };
}

describe("MIDI step input", () => {
  it("accepts only valid nonzero Note On messages on any channel", () => {
    expect(parseMidiNoteOn([0x90, 60, 96])).toBe(60);
    expect(parseMidiNoteOn([0x9f, 127, 1])).toBe(127);
    for (const data of [
      [0x80, 60, 96],
      [0x90, 60, 0],
      [0xb0, 60, 96],
      [0xe0, 60, 96],
      [0x90, 128, 96],
      [0x90, 60, 128],
      [0x90, 60],
      [0x190, 60, 96],
      [-112, 60, 96],
      [],
    ])
      expect(parseMidiNoteOn(data)).toBeNull();
    expect(parseMidiNoteOn(null)).toBeNull();
  });

  it("requests permission without sysex and auto-selects a single input disarmed", async () => {
    const input = new FakeInput("one", "Keyboard");
    const access = new FakeAccess(new Map([[input.id, input]]));
    const navigatorLike = navigatorWith(access);
    const received: number[] = [];
    const controller = new MidiStepInputController((pitch) => received.push(pitch));

    await controller.connect(navigatorLike);

    expect(navigatorLike.requestMIDIAccess).toHaveBeenCalledWith({ sysex: false });
    expect(controller.snapshot).toMatchObject({
      status: "connected",
      armed: false,
      selectedDeviceId: "one",
    });
    expect(controller.snapshot.inputs.map((candidate) => candidate.id)).toEqual(["one"]);
    expect(input.listeners.size).toBe(1);
    input.emit([0x90, 64, 100]);
    expect(received).toEqual([]);
    expect(controller.arm()).toBe(true);
    input.emit([0x90, 64, 100]);
    input.emit([0x9f, 67, 100]);
    input.emit([0x80, 62, 100]);
    expect(received).toEqual([64, 67]);
    controller.dispose();
    expect(input.listeners.size).toBe(0);
    expect(access.listeners.size).toBe(0);
  });

  it("selects the stable first of multiple inputs and detaches and disarms on switching", async () => {
    const first = new FakeInput("first");
    const second = new FakeInput("second");
    const access = new FakeAccess(
      new Map([
        [first.id, first],
        [second.id, second],
      ]),
    );
    const received: number[] = [];
    const controller = new MidiStepInputController((pitch) => received.push(pitch));
    await controller.connect(navigatorWith(access));

    expect(controller.snapshot).toMatchObject({
      status: "connected",
      armed: false,
      selectedDeviceId: "first",
    });
    expect(controller.snapshot.inputs).toHaveLength(2);
    expect(controller.selectDevice("first")).toBe(true);
    expect(controller.arm()).toBe(true);
    expect(controller.selectDevice("second")).toBe(true);
    expect(controller.snapshot).toMatchObject({
      status: "connected",
      armed: false,
      selectedDeviceId: "second",
    });
    expect(first.listeners.size).toBe(0);
    second.emit([0x90, 70, 1]);
    first.emit([0x90, 71, 1]);
    expect(received).toEqual([]);
    expect(controller.arm()).toBe(true);
    second.emit([0x90, 70, 1]);
    expect(received).toEqual([70]);
    controller.dispose();
  });

  it("reports unsupported, denied, empty, and disconnected device states", async () => {
    const unsupported = new MidiStepInputController(() => undefined);
    await unsupported.connect({});
    expect(unsupported.snapshot.status).toBe("unsupported");
    expect(unsupported.snapshot.message).toContain("manual pitch");

    const denied = new MidiStepInputController(() => undefined);
    await denied.connect({
      requestMIDIAccess: async () => {
        throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      },
    });
    expect(denied.snapshot.status).toBe("permission-denied");

    const emptyAccess = new FakeAccess(new Map());
    const empty = new MidiStepInputController(() => undefined);
    await empty.connect(navigatorWith(emptyAccess));
    expect(empty.snapshot.status).toBe("no-device");

    const input = new FakeInput("gone");
    const access = new FakeAccess(new Map([[input.id, input]]));
    const disconnected = new MidiStepInputController(() => undefined);
    await disconnected.connect(navigatorWith(access));
    expect(disconnected.arm()).toBe(true);
    input.state = "disconnected";
    access.statechange();
    expect(disconnected.snapshot).toMatchObject({ status: "disconnected", armed: false });
    expect(input.listeners.size).toBe(0);
    expect(disconnected.snapshot.message).toContain("manual pitch");
    unsupported.dispose();
    denied.dispose();
    empty.dispose();
    disconnected.dispose();
  });

  it("ignores a stale permission result after reset", async () => {
    let resolveAccess: ((access: MidiAccessLike) => void) | undefined;
    const input = new FakeInput("late");
    const access = new FakeAccess(new Map([[input.id, input]]));
    const controller = new MidiStepInputController(() => undefined);
    const connecting = controller.connect({
      requestMIDIAccess: () =>
        new Promise<MidiAccessLike>((resolve) => {
          resolveAccess = resolve;
        }),
    });
    controller.disconnect();
    resolveAccess?.(access);
    await connecting;
    expect(controller.snapshot).toEqual(INITIAL_MIDI_STEP_INPUT_SNAPSHOT);
    expect(access.listeners.size).toBe(0);
    expect(input.listeners.size).toBe(0);
    controller.dispose();
  });

  it("auto-connects only granted permission, auto-arms on activation, and preserves blur intent", async () => {
    const input = new FakeInput("one");
    const access = new FakeAccess(new Map([[input.id, input]]));
    const received: number[] = [];
    const controller = new MidiStepInputController(
      (pitch) => received.push(pitch),
      () => true,
    );
    const requestMIDIAccess = vi.fn(async () => access);
    for (const state of ["prompt", "denied"]) {
      await controller.connectAlreadyGranted({
        permissions: { query: async () => ({ state }) },
        requestMIDIAccess,
      });
      expect(requestMIDIAccess).not.toHaveBeenCalled();
    }
    await controller.connectAlreadyGranted({
      permissions: { query: async () => ({ state: "granted" }) },
      requestMIDIAccess,
    });
    expect(controller.snapshot.effectiveInputEnabled).toBe(true);
    controller.suspendFocus();
    input.emit([0x90, 70, 90]);
    expect(received).toEqual([]);
    expect(controller.snapshot).toMatchObject({
      armed: true,
      focusSuspended: true,
      effectiveInputEnabled: false,
    });
    controller.resumeFocus();
    input.emit([0x90, 71, 90]);
    expect(received).toEqual([71]);
    controller.suspendFocus();
    controller.disarm();
    controller.resumeFocus();
    input.emit([0x90, 72, 90]);
    expect(received).toEqual([71]);
    access.statechange();
    expect(controller.snapshot.armed).toBe(false);
    controller.dispose();
  });

  it("cancels late granted permission queries on session replacement", async () => {
    let resolve: ((value: { state: string }) => void) | undefined;
    const requestMIDIAccess = vi.fn();
    const controller = new MidiStepInputController(
      () => undefined,
      () => true,
    );
    const pending = controller.connectAlreadyGranted({
      permissions: {
        query: () =>
          new Promise((done) => {
            resolve = done;
          }),
      },
      requestMIDIAccess,
    });
    controller.invalidateSession();
    resolve?.({ state: "granted" });
    await pending;
    expect(requestMIDIAccess).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("arms real hotplug but never rearms ordinary device notifications", async () => {
    const inputs = new Map<string, FakeInput>();
    const access = new FakeAccess(inputs);
    const controller = new MidiStepInputController(
      () => undefined,
      () => true,
    );
    await controller.connect(navigatorWith(access));
    const input = new FakeInput("hotplug");
    inputs.set(input.id, input);
    access.statechange();
    expect(controller.snapshot.armed).toBe(true);
    controller.disarm();
    access.statechange();
    expect(controller.snapshot.armed).toBe(false);
    expect(input.listeners.size).toBe(1);
    input.state = "disconnected";
    access.statechange();
    expect(input.listeners.size).toBe(0);
    input.state = "connected";
    access.statechange();
    expect(controller.snapshot.armed).toBe(true);
    expect(input.listeners.size).toBe(1);
    controller.dispose();
  });

  it("late granted query cannot revive Escape/manual/safety OFF intent", async () => {
    const input = new FakeInput("late-query");
    const access = new FakeAccess(new Map([[input.id, input]]));
    let resolve: ((value: { state: string }) => void) | undefined;
    const controller = new MidiStepInputController(
      () => undefined,
      () => true,
    );
    const requestMIDIAccess = vi.fn(async () => access);
    const pending = controller.connectAlreadyGranted({
      permissions: {
        query: () =>
          new Promise((done) => {
            resolve = done;
          }),
      },
      requestMIDIAccess,
    });
    expect(controller.pendingPermission).toBe(true);
    controller.disarm("Escape pressed");
    resolve?.({ state: "granted" });
    await pending;
    expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: false });
    expect(controller.snapshot).toMatchObject({
      status: "connected",
      armed: false,
      effectiveInputEnabled: false,
    });
    controller.dispose();
  });

  it("late access after manual/safety disarm connects without reviving intent", async () => {
    const input = new FakeInput("late");
    const access = new FakeAccess(new Map([[input.id, input]]));
    let resolve: ((access: MidiAccessLike) => void) | undefined;
    const controller = new MidiStepInputController(
      () => undefined,
      () => true,
    );
    const pending = controller.connect({
      requestMIDIAccess: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    controller.disarm();
    resolve?.(access);
    await pending;
    expect(controller.snapshot).toMatchObject({
      status: "connected",
      armed: false,
      effectiveInputEnabled: false,
    });
    controller.dispose();
  });

  it("replaced device objects detach old listeners and cancel previews before activation", async () => {
    const oldInput = new FakeInput("same-id");
    const inputs = new Map([[oldInput.id, oldInput]]);
    const access = new FakeAccess(inputs);
    const cancelPreview = vi.fn();
    const received: number[] = [];
    const controller = new MidiStepInputController(
      (pitch) => received.push(pitch),
      () => true,
      cancelPreview,
    );
    await controller.connect(navigatorWith(access));
    const replacement = new FakeInput("same-id", "New device object");
    inputs.set(replacement.id, replacement);
    access.statechange();
    expect(oldInput.listeners.size).toBe(0);
    expect(replacement.listeners.size).toBe(1);
    expect(cancelPreview).toHaveBeenCalledOnce();
    oldInput.emit([0x90, 60, 90]);
    replacement.emit([0x90, 61, 90]);
    expect(received).toEqual([61]);
    access.statechange();
    expect(replacement.listeners.size).toBe(1);
    controller.dispose();
  });

  it("keeps all ordinary, dotted, and triplet durations exact", () => {
    expect(MIDI_STEP_DURATIONS).toHaveLength(15);
    const expectedDurations = [
      ["whole", rational(4)],
      ["whole-dotted", rational(6)],
      ["whole-triplet", rational(8, 3)],
      ["half", rational(2)],
      ["half-dotted", rational(3)],
      ["half-triplet", rational(4, 3)],
      ["quarter", rational(1)],
      ["quarter-dotted", rational(3, 2)],
      ["quarter-triplet", rational(2, 3)],
      ["eighth", rational(1, 2)],
      ["eighth-dotted", rational(3, 4)],
      ["eighth-triplet", rational(1, 3)],
      ["sixteenth", rational(1, 4)],
      ["sixteenth-dotted", rational(3, 8)],
      ["sixteenth-triplet", rational(1, 6)],
    ];
    expect(MIDI_STEP_DURATIONS.map(({ id, beats }) => [id, beats])).toEqual(expectedDurations);
    const next = advanceMidiCursor(rational(1, 3), rational(1, 6));
    expect(next).toEqual(rational(1, 2));
    expect(compareRational(next, rational(1, 2))).toBe(0);
  });

  it("snaps pointer placement while keeping typed cursor fractions exact", () => {
    expect(snapMidiCursor(rational(9, 10), rational(1, 2))).toEqual(rational(1));
    expect(snapMidiCursor(rational(1, 10), rational(1, 2))).toEqual(rational(0));
    expect(parseMidiCursor(" 9 / 4 ")).toEqual(rational(9, 4));
    expect(parseMidiCursor("8")).toEqual(rational(8));
    expect(parseMidiCursor("-1/2")).toBeNull();
    expect(parseMidiCursor("1/0")).toBeNull();
    expect(parseMidiCursor("1.5")).toBeNull();
  });
});
