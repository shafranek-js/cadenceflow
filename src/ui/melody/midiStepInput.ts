import {
  addRational,
  compareRational,
  divideRational,
  multiplyRational,
  rational,
  type Rational,
} from "../../domain/timing/rational";

export type MidiConnectionStatus =
  | "idle"
  | "requesting"
  | "unsupported"
  | "permission-denied"
  | "no-device"
  | "choose-device"
  | "connected"
  | "disconnected"
  | "error";

export interface MidiMessageLike {
  readonly data: ArrayLike<number> | null;
}

export interface MidiInputLike {
  readonly id: string;
  readonly name?: string;
  readonly manufacturer?: string;
  readonly state?: "connected" | "disconnected";
  addEventListener(type: "midimessage", listener: (event: MidiMessageLike) => void): void;
  removeEventListener(type: "midimessage", listener: (event: MidiMessageLike) => void): void;
}

export interface MidiAccessLike {
  readonly inputs: ReadonlyMap<string, MidiInputLike>;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
}

export interface MidiNavigatorLike {
  permissions?: { query(descriptor: { name: "midi"; sysex: false }): Promise<{ state: string }> };
  requestMIDIAccess?: (options: { readonly sysex: false }) => Promise<MidiAccessLike>;
}

export interface MidiStepInputDevice {
  readonly id: string;
  readonly name: string;
  readonly manufacturer: string;
  readonly state: "connected" | "disconnected";
}

export interface MidiStepInputSnapshot {
  readonly status: MidiConnectionStatus;
  readonly message: string;
  /** Armed intent survives focus suspension; effectiveInputEnabled gates messages. */
  readonly armed: boolean;
  readonly focusSuspended?: boolean;
  readonly effectiveInputEnabled?: boolean;
  readonly selectedDeviceId: string | null;
  readonly inputs: readonly MidiStepInputDevice[];
}

export function parseMidiNoteOn(data: ArrayLike<number> | null | undefined): number | null {
  if (!data || data.length < 3) return null;
  const status = data[0];
  const pitch = data[1];
  const velocity = data[2];
  if (
    !Number.isInteger(status) ||
    status! < 0x80 ||
    status! > 0xff ||
    !Number.isInteger(pitch) ||
    !Number.isInteger(velocity) ||
    pitch! < 0 ||
    pitch! > 127 ||
    velocity! < 0 ||
    velocity! > 127 ||
    (status! & 0xf0) !== 0x90 ||
    velocity === 0
  )
    return null;
  return pitch!;
}

function describeDevice(input: MidiInputLike): MidiStepInputDevice {
  return Object.freeze({
    id: input.id,
    name: input.name?.trim() || `MIDI input ${input.id}`,
    manufacturer: input.manufacturer?.trim() || "",
    state: input.state ?? "connected",
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The browser could not connect to MIDI input.";
}

function isPermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { readonly name?: unknown }).name === "NotAllowedError"
  );
}

export const INITIAL_MIDI_STEP_INPUT_SNAPSHOT: MidiStepInputSnapshot = Object.freeze({
  status: "idle",
  message: "Connect a MIDI input to enable step entry.",
  armed: false,
  effectiveInputEnabled: false,
  focusSuspended: false,
  selectedDeviceId: null,
  inputs: Object.freeze([]),
});

/** Owns only browser MIDI permission/device listeners; it never stores Project data. */
export class MidiStepInputController {
  #snapshot = INITIAL_MIDI_STEP_INPUT_SNAPSHOT;
  #access: MidiAccessLike | null = null;
  #accessListener: (() => void) | null = null;
  #selectedInput: MidiInputLike | null = null;
  #inputListener: ((event: MidiMessageLike) => void) | null = null;
  #listeners = new Set<(snapshot: MidiStepInputSnapshot) => void>();
  #generation = 0;
  #activationEpoch = 0;
  #permissionQueryPending = false;
  #startupAttempted = false;
  #focusSuspended = false;
  #preferredDeviceId: string | null = null;
  #connectedIds = new Set<string>();

  constructor(
    private readonly onNoteOn: (midiPitch: number) => void,
    private readonly canAutoArm: () => boolean = () => false,
    private readonly onInputReset: () => void = () => undefined,
  ) {}

  async connectStartup(navigatorLike: MidiNavigatorLike): Promise<void> {
    if (this.#startupAttempted) return;
    this.#startupAttempted = true;
    await this.connectAlreadyGranted(navigatorLike);
  }

  async connectAlreadyGranted(navigatorLike: MidiNavigatorLike): Promise<void> {
    const generation = this.#generation;
    const activationEpoch = this.#activationEpoch;
    this.#permissionQueryPending = true;
    try {
      const permission = await navigatorLike.permissions?.query({ name: "midi", sysex: false });
      if (generation === this.#generation && permission?.state === "granted")
        await this.connect(navigatorLike, activationEpoch === this.#activationEpoch);
    } catch {
      /* Unsupported permission query requires an explicit gesture. */
    } finally {
      if (generation === this.#generation) this.#permissionQueryPending = false;
    }
  }

  suspendFocus(): void {
    this.#focusSuspended = true;
    this.#publish(this.#snapshot);
  }

  resumeFocus(): void {
    this.#focusSuspended = false;
    this.#publish(this.#snapshot);
  }

  invalidateSession(): void {
    this.#generation += 1;
    this.#permissionQueryPending = false;
    if (this.#snapshot.status === "requesting") this.#publish(INITIAL_MIDI_STEP_INPUT_SNAPSHOT);
    this.disarm("Project session changed. MIDI step input is disarmed.");
  }

  get pendingPermission(): boolean {
    return this.#permissionQueryPending || this.#snapshot.status === "requesting";
  }

  get snapshot(): MidiStepInputSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: MidiStepInputSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async connect(navigatorLike: MidiNavigatorLike, allowAutoActivation = true): Promise<void> {
    const generation = ++this.#generation;
    this.#permissionQueryPending = false;
    const activationEpoch = this.#activationEpoch;
    this.#detachSelectedInput();
    this.#detachAccess();
    this.#publish({
      status: "requesting",
      message: "Requesting MIDI input permission…",
      armed: false,
      selectedDeviceId: null,
      inputs: Object.freeze([]),
    });
    if (typeof navigatorLike.requestMIDIAccess !== "function") {
      this.#publish({
        ...this.#snapshot,
        status: "unsupported",
        message: "This browser does not support Web MIDI. Use manual pitch entry.",
      });
      return;
    }
    try {
      const access = await navigatorLike.requestMIDIAccess({ sysex: false });
      if (generation !== this.#generation) return;
      this.#access = access;
      this.#accessListener = () => this.#refreshDevices();
      access.addEventListener("statechange", this.#accessListener);
      this.#refreshDevices(true, allowAutoActivation && activationEpoch === this.#activationEpoch);
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#publish({
        ...this.#snapshot,
        status: isPermissionError(error) ? "permission-denied" : "error",
        message: isPermissionError(error)
          ? "MIDI permission was denied. Use manual pitch entry or allow MIDI in browser settings."
          : errorMessage(error),
      });
    }
  }

  selectDevice(deviceId: string): boolean {
    const input = this.#access?.inputs.get(deviceId);
    if (!input || input.state === "disconnected") {
      this.#detachSelectedInput();
      this.#publish({
        ...this.#snapshot,
        status: "disconnected",
        message: "That MIDI input is no longer connected. Choose an available input.",
        armed: false,
        selectedDeviceId: null,
      });
      return false;
    }
    this.#detachSelectedInput();
    this.#preferredDeviceId = input.id;
    this.#selectedInput = input;
    this.#inputListener = (event) => {
      if (!this.#snapshot.effectiveInputEnabled || this.#selectedInput !== input) return;
      const pitch = parseMidiNoteOn(event.data);
      if (pitch === null) return;
      this.onNoteOn(pitch);
    };
    input.addEventListener("midimessage", this.#inputListener);
    this.#publish({
      ...this.#snapshot,
      status: "connected",
      message: `${describeDevice(input).name} connected. Step input is disarmed.`,
      armed: false,
      selectedDeviceId: input.id,
      inputs: Object.freeze([...this.#access!.inputs.values()].map(describeDevice)),
    });
    return true;
  }

  arm(): boolean {
    if (!this.#selectedInput || this.#selectedInput.state === "disconnected") return false;
    this.#publish({
      ...this.#snapshot,
      status: "connected",
      message: `${describeDevice(this.#selectedInput).name} is armed for Note On step input.`,
      armed: true,
    });
    return true;
  }

  disarm(message?: string): void {
    this.#activationEpoch += 1;
    if (!this.#snapshot.armed && !message) return;
    const nextMessage =
      message ??
      (this.#selectedInput
        ? `${describeDevice(this.#selectedInput).name} connected. Step input is disarmed.`
        : this.#snapshot.message);
    this.#publish({ ...this.#snapshot, armed: false, message: nextMessage });
  }

  disconnect(): void {
    this.#generation += 1;
    this.#permissionQueryPending = false;
    this.#connectedIds.clear();
    this.#detachSelectedInput();
    this.#detachAccess();
    this.#publish(INITIAL_MIDI_STEP_INPUT_SNAPSHOT);
  }

  dispose(): void {
    this.disconnect();
    this.#listeners.clear();
  }

  #refreshDevices(initial = false, allowAutoArm = true): void {
    const access = this.#access;
    if (!access) return;
    const inputs = [...access.inputs.values()].map(describeDevice);
    const newlyConnected = inputs.some(
      (input) => input.state === "connected" && !this.#connectedIds.has(input.id),
    );
    this.#connectedIds = new Set(
      inputs.filter((input) => input.state === "connected").map((input) => input.id),
    );
    const selectedId = this.#snapshot.selectedDeviceId;
    if (selectedId) {
      const stillConnected = access.inputs.get(selectedId);
      if (!stillConnected || stillConnected.state === "disconnected") {
        this.#detachSelectedInput();
        const remaining = inputs.filter((input) => input.state === "connected");
        this.#publish({
          status: "disconnected",
          message: remaining.length
            ? "The selected MIDI input disconnected. Choose another input; step input is disarmed."
            : "The selected MIDI input disconnected. Use manual pitch entry or reconnect an input.",
          armed: false,
          selectedDeviceId: null,
          inputs: Object.freeze(inputs),
        });
        return;
      }
      if (stillConnected !== this.#selectedInput) {
        this.selectDevice(selectedId);
        if (allowAutoArm && !this.#focusSuspended && this.canAutoArm()) this.arm();
        return;
      }
      this.#publish({ ...this.#snapshot, inputs: Object.freeze(inputs) });
      return;
    }
    const connected = inputs.filter((input) => input.state === "connected");
    if (connected.length > 0 && (initial || newlyConnected)) {
      this.selectDevice(
        connected.find((input) => input.id === this.#preferredDeviceId)?.id ?? connected[0]!.id,
      );
      if (allowAutoArm && !this.#focusSuspended && this.canAutoArm()) this.arm();
      return;
    }
    this.#publish({
      status: connected.length === 0 ? "no-device" : "choose-device",
      message:
        connected.length === 0
          ? "No MIDI inputs are connected. Use manual pitch entry or connect a device."
          : connected.length === 1
            ? "Choose the available MIDI input to continue."
            : "Choose which MIDI input to use.",
      armed: false,
      selectedDeviceId: null,
      inputs: Object.freeze(inputs),
    });
  }

  #detachSelectedInput(): void {
    if (this.#selectedInput && this.#inputListener) {
      this.onInputReset();
      this.#selectedInput.removeEventListener("midimessage", this.#inputListener);
    }
    this.#selectedInput = null;
    this.#inputListener = null;
  }

  #detachAccess(): void {
    if (this.#access && this.#accessListener)
      this.#access.removeEventListener("statechange", this.#accessListener);
    this.#access = null;
    this.#accessListener = null;
  }

  #publish(snapshot: MidiStepInputSnapshot): void {
    this.#snapshot = Object.freeze({
      ...snapshot,
      focusSuspended: this.#focusSuspended,
      effectiveInputEnabled: snapshot.armed && !this.#focusSuspended,
    });
    for (const listener of this.#listeners) listener(this.#snapshot);
  }
}

export type MidiStepDurationId =
  | "whole"
  | "whole-dotted"
  | "whole-triplet"
  | "half"
  | "half-dotted"
  | "half-triplet"
  | "quarter"
  | "quarter-dotted"
  | "quarter-triplet"
  | "eighth"
  | "eighth-dotted"
  | "eighth-triplet"
  | "sixteenth"
  | "sixteenth-dotted"
  | "sixteenth-triplet";

export interface MidiStepDuration {
  readonly id: MidiStepDurationId;
  readonly label: string;
  readonly beats: Rational;
}

const DURATION_BASES = [
  { id: "whole", label: "Whole", beats: rational(4) },
  { id: "half", label: "Half", beats: rational(2) },
  { id: "quarter", label: "Quarter", beats: rational(1) },
  { id: "eighth", label: "Eighth", beats: rational(1, 2) },
  { id: "sixteenth", label: "Sixteenth", beats: rational(1, 4) },
] as const;

export const MIDI_STEP_DURATIONS: readonly MidiStepDuration[] = Object.freeze(
  DURATION_BASES.flatMap((base) => [
    Object.freeze({ id: base.id, label: base.label, beats: base.beats }),
    Object.freeze({
      id: `${base.id}-dotted` as const,
      label: `Dotted ${base.label.toLowerCase()}`,
      beats: multiplyRational(base.beats, rational(3, 2)),
    }),
    Object.freeze({
      id: `${base.id}-triplet` as const,
      label: `${base.label} triplet`,
      beats: multiplyRational(base.beats, rational(2, 3)),
    }),
  ]),
);

export function midiStepDuration(id: MidiStepDurationId): MidiStepDuration {
  const duration = MIDI_STEP_DURATIONS.find((candidate) => candidate.id === id);
  if (!duration) throw new RangeError(`Unknown MIDI step duration: ${id}`);
  return duration;
}

export function advanceMidiCursor(cursor: Rational, duration: Rational): Rational {
  return addRational(cursor, duration);
}

export function snapMidiCursor(cursor: Rational, quantum: Rational): Rational {
  if (compareRational(quantum, rational(0)) <= 0) throw new RangeError("Snap must be positive.");
  const quotient = divideRational(cursor, quantum);
  const nearestIndex = Math.floor(quotient.numerator / quotient.denominator + 0.5);
  return multiplyRational(quantum, rational(nearestIndex));
}

export function parseMidiCursor(value: string): Rational | null {
  const match = /^\s*(\d+)\s*(?:\/\s*(\d+)\s*)?$/.exec(value);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = match[2] === undefined ? 1 : Number(match[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0)
    return null;
  return rational(numerator, denominator);
}
