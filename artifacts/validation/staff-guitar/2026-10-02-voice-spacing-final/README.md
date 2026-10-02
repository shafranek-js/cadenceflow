# Staff/Guitar actual-browser captures — 2026-10-02

Captured by the passing Chromium run of `tests/e2e/staff-guitar-audio-clock.spec.ts` from the unchanged `tests/fixtures/staff-guitar-first.cadenceflow` regression fixture. Playback was active during the viewport captures.

The 12 viewport captures cover Staff and rhythmic TAB at 640×360, 1280×720, and 1920×1080 in dark and light themes. `staff-guitar-active-melody-1280x720.png` records a sounding Melody note and the continuous audio-clock playhead.

The run checks that the long G4 continuation at the start of measure 8 is separated from the Melody Rest at beat 2. The note and Rest occupy different horizontal positions, with the full two-beat interval preserved.

These are implementation validation captures; independent Staff/Guitar acceptance remains pending.
