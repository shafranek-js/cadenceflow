declare module "soundfont-player" {
  interface SampleNode {
    stop(when?: number): void;
  }

  interface Instrument {
    play(
      midiNote: number,
      when?: number,
      options?: { readonly duration?: number; readonly gain?: number },
    ): SampleNode | undefined;
    stop(when?: number): unknown;
  }

  interface InstrumentOptions {
    readonly format?: "mp3" | "ogg";
    readonly destination?: AudioNode;
    readonly nameToUrl?: (name: string, soundfont?: string, format?: string) => string;
  }

  const SoundfontPlayer: {
    instrument(
      context: AudioContext,
      name: string,
      options?: InstrumentOptions,
    ): Promise<Instrument>;
  };

  export default SoundfontPlayer;
}
