# Piano Roll group note selection — independent acceptance

Accepted by root reviewer on 2026-10-03 for the scope in `piano-roll-group-note-selection-task.md`, including subsequent human requests for contextual Ctrl/Cmd+A, independent selection buttons, infotip help, Delete, Cut/Paste, automatic paste extension, progression-heading scope, and restored ordinary note-click audition. This accepts the implementation in the local checkout; it does not publish or deploy it.

## Independent evidence

Developer 01a0fd4e-8080-70e0-8a2f-b623afcdc62b completed follow-up turn 01a1037e-29d0-7800-b4c1-c7143fd61c05 and was idle before final review. Root inspected actual code, transaction/history wiring, the final test diffs and developer handoff, rather than accepting developer pass claims.

Initial independent review and exact commands are recorded in `C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4f-d564-7612-8b29-bc59c92804cc/group-independent/independent-review-pending.md`. That document describes the earlier acceptance refusal; this document supersedes its pending status.

- Fresh `pnpm run build` passed again: 462 modules, `index-FG_AOSom.js` and `index-CmfQUVJe.css`, identical emitted application filenames to the prior independent build. Follow-up changes were confined to the two regression test files and handoff. Existing large-chunk advisory remains.
- Prior independent focused Vitest run: 10 relevant files, 67/67 passed with `--maxWorkers=1` (group planning, audio, MIDI, measure insertion/deletion, transposition, consumers/schema, and Piano Roll acceptance). Runtime code was not changed by the follow-up.
- Prior independent Chromium feature and related batch: 72/72 passed with one worker and no retries (8 group scenarios, 64 related scenarios covering Measure insert/close, T210, T212, T215, stable Measure width and protected chord portable regressions).
- Final independent command: `pnpm exec playwright test tests/e2e/piano-roll-group-note-selection.spec.ts tests/e2e/piano-roll-system-note-panel.spec.ts tests/e2e/piano-roll-batch3-editor.spec.ts --config C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4f-d564-7612-8b29-bc59c92804cc/group-independent/playwright-independent.config.mjs --project=chromium --workers=1 --retries=0` — 17/17 passed in 1.9 minutes. Configuration uses a fresh isolated production preview at 127.0.0.1:4180 with reuseExistingServer=false. Together the independent browser batches cover 81 distinct scenarios; eight group scenarios were repeated.
- Scoped ESLint of implementation and initial tests: 0 errors, 7 existing Hook warnings. Final ESLint of both changed regression files: passed with no output. Final Prettier check of those two files: passed. Earlier six-file scoped Prettier check passed; shared inherited dirty UI files were not reformatted wholesale.
- Normal repository `git diff --check` passed. A diagnostic override disabling autocrlf reported CRLF as whitespace and was discarded as inappropriate for this Windows checkout; the configured repository check returned 0.

## Four review failures and resolution

1. Empty-grid dblclick test assumed a row DOM class. It now checks the actual grid target while preserving insertion, transaction, Undo/Redo and portable assertions. Clipboard paste explicitly chooses an empty destination cell, matching the new insertion-cursor contract.
2. Audition playhead test attempted a contextual header editor control absent when a chord Step was selected. It now uses the supported note `E` action, retaining duration editing, cross-System playhead and exact audio-clock-end checks.
3. Degrees auto-range second drag calculated expected pitch from geometry before the cancelled first gesture. It now derives expected pitch from its own reset grid coordinates/unit count. Both Degrees and Chromatic tests retain exact pitch, onset/duration, cancellation, jitter stability and portable owner/recipe assertions.
4. Owner-collision panel test exported its baseline through a helper pressing Escape, which now intentionally clears transient selection. The helper can close Export by its toggle without incidental Escape. Exact pitches, untouched Rest companion, project context, silence and Undo/Redo assertions remain and pass.

These were test interaction/geometry assumptions, not a justified weakening of behavior checks. No product source was changed for this follow-up. All four initially failed in root's additional 9-case run (5 passed, 4 failed), then passed in root's final complete 17-case run.

## Visual and behavior acceptance

Root actually viewed all 12 normal viewport captures during the independent review: 640x360, 1280x720, 1920x1080 × light/dark × Degrees/Chromatic. Closed-help snapshots show selected music, readable note outlines and stable Measure layout; narrower toolbars use local horizontal scrolling. Browser assertions independently verify selection-button/scope reachability, infotip association, viewport bounds and dismissal. Final repeated visual scenario regenerates the same 12 combinations. Earlier open-help captures were supplementary.

Accepted behavior includes owner-scoped marquee across Measures/Systems, contextual Ctrl/Cmd+A, independent named selection buttons, progression scope through the common heading, global selection Delete, atomic Cut/Paste and duplication, exact Rational timing, automatic full-bar paste growth and Undo/Redo including extension, portable reopen, generated/Rest owners, source ID collisions, and concert pitch across transposition offsets.

Independent extension probe confirmed atomic refusal if appending would expose or lengthen previously ineffective raw Melody beyond the old end. Normal paste extension passes. Ordinary completed pointer click schedules one effective Melody preview at the current instrument/volume; Shift-additive selection, cancelled drags and group operations do not add preview. Late prepare after view change is cancelled. Audio scheduling and MIDI are mocked; physical MIDI and listening through physical audio hardware were not tested.

## Repository boundary and limitations

HEAD remains `f801562794b39ff3d039b56e0010829aff9a1b2b`; index empty. Protected `tests/e2e/piano-roll-system-chord-portable.spec.ts` remains 62 additions / 0 deletions. All tracked/untracked inherited work remains preserved. Root only adds this acceptance record. No stage, commit, push, deployment, Actions changes, cleanup, full-suite run or adjacent implementation.

Two unrelated chord-panel failures have separate published-baseline evidence in `artifacts/validation/t215-baseline/baseline-regression-evidence.md`; they are neither fixed nor counted as passes here. Acceptance applies to this Piano Roll editing task and the focused verified regressions, not an assertion that every application test is green.
