# T214 Persistent window-bottom status bar — implementation handoff

## Status

The requested implementation and scoped validation are complete. Independent acceptance remains pending, so T214 stays unchecked in `tasks.md`. The user explicitly authorized work on this previously unscheduled backlog item. T213's separate acceptance status was not changed.

## Behavior

The application shell now uses a four-row, dynamic-viewport layout for the header, transport, Studio work area, and existing status bar. The Studio work area scrolls inside the space above the status bar, which stays visible at the browser-window bottom without covering visible controls or music. The status bar keeps its existing content, live updates, accessible `contentinfo` role, theme tokens, and MIDI/audio status behavior.

The print stylesheet resets the screen shell's fixed viewport height and overflow so the existing printable-progression path remains available. No project data, persistence, audio, or status-message logic changed.

## Verification

- The latest `pnpm run build` passed with 465 modules; Vite emitted its existing large-chunk advisory. The served build assets are `index-OXTCn27n.js` (SHA-256 `5CC71B105F222AD754CC1ABBF6497B80F86DD163B359880D8A5B3C3BB11E82DB`) and `index-Cw88trq3.css` (SHA-256 `4D2654D7451B56D0BABB0D066165A8B2575A1C0E1FA20E3B0B76E61B2B89BEEF`).
- The final scoped Chromium regression batch passed 18/18 across T213, T214, Piano Roll chord-panel, and group-note-selection E2E specs. It includes five T214 tests, including the Piano Roll boundary drag that scrolls `.studio-grid` while the status bar stays pinned and verifies pointer cancellation restores the boundary.
- After the same build, T210 MIDI plus printable A4 passed 20/20 in Chromium. The protected portable chord E2E batch passed 46/47; its sole failure is the old assertion at `piano-roll-system-chord-portable.spec.ts:2023`, which expects `window.scrollY` to increase. The application now scrolls the nested `.studio-grid`; the dedicated T214 gesture test verifies that actual scroll target and passes. That protected spec was not edited in this follow-up.
- A related cross-area unit batch passed 41 tests and failed one unchanged T201 adapter assertion: `tests/unit/progression/t201-direct-duration-resize.test.ts:79` expected endpoint 11 but received 3. The failure is outside the T214 shell and boundary-autoscroll change.
- Scoped ESLint completed with zero errors and three existing React-hook dependency warnings in `PianoRollView.tsx`. Scoped Prettier passed. `git diff --check` passed; Git emitted line-ending notices for the shared dirty checkout.

## Visual evidence

The original eight dark-theme captures remain in [the T214 review folder](../../artifacts/validation/t214-persistent-status-bar/review-2026-10-04/). The follow-up folder has 16 new PNGs and `viewport-metrics.json`: light and dark themes, initial and scrolled states, at 640×360, 1280×720, 1920×1080, and 1024×576 (the 125% zoom-equivalent CSS viewport). All metrics confirm that the status bar bottom matches the viewport bottom and the scrolled Studio region has a positive scroll range.

## Git and acceptance boundary

The implementation and regression follow-up share a dirty checkout with other tracked and untracked work; the index remains empty. The protected portable chord spec already has a working-tree diff and was preserved without edits in this follow-up. Nothing was committed, pushed, deployed, cleaned, or packaged as a ZIP. The T214 checkbox and independent-acceptance records remain unchanged. The next gate is independent review of this handoff and its evidence.
