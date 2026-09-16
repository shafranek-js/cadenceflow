import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PianoAudioStatus } from "../../../src/ui/header/PianoAudioStatus";

const el = React.createElement;

describe("PianoAudioStatus component", () => {
  it("renders piano audio status labels correctly by default", () => {
    const htmlReady = renderToString(el(PianoAudioStatus, { state: "ready" }));
    expect(htmlReady).toContain("Piano Audio: HQ Piano Ready");
    expect(htmlReady).toContain("data-status=\"ready\"");
    expect(htmlReady).toContain("data-instrument=\"piano\"");

    const htmlLoading = renderToString(el(PianoAudioStatus, { state: "loading" }));
    expect(htmlLoading).toContain("Piano Audio: Loading HQ Piano...");

    const htmlError = renderToString(el(PianoAudioStatus, { state: "error" }));
    expect(htmlError).toContain("Piano Audio: Audio Unavailable");
  });

  it("renders guitar audio status labels when instrument='guitar'", () => {
    const htmlReady = renderToString(
      el(PianoAudioStatus, { state: "ready", instrument: "guitar" }),
    );
    expect(htmlReady).toContain("Guitar Audio: HQ Guitar Ready");
    expect(htmlReady).toContain("data-status=\"ready\"");
    expect(htmlReady).toContain("data-instrument=\"guitar\"");

    const htmlLoading = renderToString(
      el(PianoAudioStatus, { state: "loading", instrument: "guitar" }),
    );
    expect(htmlLoading).toContain("Guitar Audio: Loading HQ Guitar...");

    const htmlError = renderToString(
      el(PianoAudioStatus, { state: "error", instrument: "guitar" }),
    );
    expect(htmlError).toContain("Guitar Audio: Guitar Unavailable");

    const htmlFallback = renderToString(
      el(PianoAudioStatus, { state: "fallback", instrument: "guitar" }),
    );
    expect(htmlFallback).toContain("Guitar Audio: Guitar Fallback");
  });

  it("renders soundfont audio status labels when engine='soundfont'", () => {
    const htmlPiano = renderToString(
      el(PianoAudioStatus, { state: "ready", instrument: "piano", engine: "soundfont" }),
    );
    expect(htmlPiano).toContain("Piano Audio: SoundFont Piano Ready");
    expect(htmlPiano).toContain("data-engine=\"soundfont\"");

    const htmlGuitar = renderToString(
      el(PianoAudioStatus, { state: "ready", instrument: "guitar", engine: "soundfont" }),
    );
    expect(htmlGuitar).toContain("Guitar Audio: SoundFont Guitar Ready");
    expect(htmlGuitar).toContain("data-engine=\"soundfont\"");
  });
});
