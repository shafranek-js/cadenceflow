# Developer Assignment — Close the Local Release Gate

**Updated:** 2026-10-09. Continue in the canonical, heavily dirty checkout `C:\Projects\cadenceflow`. The portable Project is schema v11. The five accepted scope outcomes, including T217, are recorded in [PROJECT_STATUS.md](PROJECT_STATUS.md); the Scale Degrees palette review is complete. This assignment concerns the remaining local release gate only. Do not start T216 or another feature milestone. Preserve all current work: no reset, cleanup, stage, commit, push, deploy, Actions changes, or publication.

## Current release blockers

- The final full Chromium run against fresh external preview `http://127.0.0.1:4187` was 350/351, with one failure in `playback-keyboard.spec.ts`: hidden auto-range expected `[60, 83]` but observed `[60, 95]` after playback began. Preserve the full-run result. A focused exact reproduction passed 3/3 and an external observer run passed 8/8, so inspect the trace/state transition before proposing any product fix. Preserve the intent to recompute after actual Stop or project-session change.
- The final full Firefox run was 338 passed / 12 failed / 1 expected Chromium-only PDF skip, with zero retries and zero flaky tests. Ten cases remain after separating the two T211 fixture-readiness failures: current Piano Roll Measure context; two light/dark native-selection scope checks; two generated-note audition/playhead checks; Degrees and Chromatic edge-drag pitch off by one; Palette toolbar height; altered-note viewport; and group-note movement pitch. Exact test names/assertions and the full-run logs are in the 2026-10-08 release evidence directory recorded in PROJECT_STATUS.md. Diagnose each observed mismatch narrowly; preserve musical-state, viewport, and accessibility assertions.
- Header-context follow-up (2026-10-09) identified a 15.1 px toolbar-wrap layout shift under Firefox pointer coordinates. The scope caption now has a narrow no-shrink/no-wrap CSS correction; six focused Chromium checks passed, including context, light/dark drag, auto-range edge drag, and palette layout. Firefox 153 could not complete a fixture-free static `page.setContent()` or close within 5 seconds, so the three affected Firefox cases remain unverified. See [the dated geometry and validation report](specs/001-cadenceflow-core-studio/release-gate-header-context-2026-10-09.md); do not claim the old full-suite failures resolved.
- T211 fixture readiness was corrected by waiting for the visible project-menu toggle and `My Progression` region before calling `setProgressionView`. Focused Chromium passed 4/4. Focused Firefox was 3/4 on the first run: the 1280×720 light scenario reached its 60-second limit during history-action click after slow startup; that exact case then passed 1/1 in an isolated run at the unchanged timeout. Keep these reports separate and retain the initial timeout in the record.
- The local release gate is not closed until the ten Firefox mismatches and Chromium auto-range issue have evidence-based disposition and a coherent fresh cross-browser suite result. Do not rerun the full 351-case suite merely to turn a failure green; first fix a demonstrated cause and run the affected regression.

## Authorized next work

1. Restore and verify the bundled Firefox diagnostic baseline with a fixture-free static page (`setContent`, evaluate, screenshot, and normal close). Then run the controlled header event check and the three affected context/native-selection cases on a fresh preview. For the remaining browser cases, read the exact failure context and trace, then compare focused Chromium/Firefox reproductions. Fix only causes supported by that evidence. Do not broaden scope to T216 or weaken assertions to accommodate timing, coordinates, or viewport state.
2. For the current-object-context and native-selection cases, preserve the distinction between current Measure/System context, selected chord/notes, and progression-wide selection. For note/audition cases, preserve canonical pitch/timing and audition end semantics. For layout/viewport cases, use the actual rendered geometry and inspect screenshots; do not rely on a full-page capture as a viewport assertion.
3. After a production fix, run its focused unit/E2E regression, make a fresh external build, and run a new full Chromium and full Firefox pass serially with one worker and zero retries. Use unique external output, report, screenshot and CWD roots; audit environment-variable destinations before launch. Do not overwrite existing release-gate reports or repository screenshots.
4. Complete the physical MIDI/audio checklist in PROJECT_STATUS.md on real hardware before claiming device acceptance. Record OS, browser, device, permissions, press/release, focus recovery, unplug/reconnect, audible playback/Stop, and whether project/history remained correct.
5. Keep the HQ Piano sample-source/licensing disposition open. Local hashes/notices prove bytes and bundled attribution only; they do not establish exact sample lineage or redistribution rights. Do not replace or remove user assets without a separately authorized, evidence-backed plan.

## Release-gate evidence and limits

- Full Vitest passed 205 files / 1,562 tests (`--maxWorkers=1`) before the later print-only CSS/E2E assertion and T211 readiness-only E2E edit. No application/domain logic changed after that run.
- Fresh external build passed; local preview `127.0.0.1:4187` returned HTTP 200. `verify:fixtures` passed with an inventory of 33 fixture entries (not 33 round-trips), GM Melody verification passed for 128 programs, Guitar provenance passed, copied piano-bank decode passed 480/480, MusicXML 4.0 fixture validation passed, and the Vitest export test validates generated writer output through the offline XSD.
- T195 PDF-generation focused Chromium case passed 1/1 and received independent two-page A4 visual review; its separate keyboard/theme regression passed. The final full browser reports, including the exact 12/1 failures above, remain immutable in the external evidence directory.
- Full `pnpm run format:check` passed. ESLint passed for the three directly affected E2E specs (0 errors/warnings). A broad serial ESLint attempt completed one 35-file batch with 0 errors / 4 existing `App.tsx` warnings; its PowerShell JSON aggregator failed before starting the next batch. Generated `public/audio/*-mp3.js` banks were excluded; do not claim full repository lint passed.
- Latest external inventory and delta are `final-release-manifest-reviewed-20261009-v3.tsv` and `final-release-delta-reviewed-20261009-v3.json`; v2 remains preserved as historical evidence.
- No physical MIDI/audio audition was performed; device availability was not confirmed. No staging, commit, push, deploy or publication occurred.

## Out of scope

T216, feature work, unrelated lint cleanup, asset regeneration, staging/commit/push/deploy, GitHub Actions, and publication.

---

## Historical assignment — T196 Guitar Asset Provenance

**Status:** Accepted by the orchestrator on 2026-09-26 after independent verification. Historical handoff only; current HQ Piano source/redistribution rights remain open as described above.

## Baseline and ownership

- Work in the existing Luna 2 isolated worktree. The main checkout at `C:\Projects\cadenceflow` is canonical and has accepted T197+T192, T193, T194, and T211. Your worktree's task/status documents lag; read the current main checkout.
- Preserve user-owned changes, `pnpm-workspace.yaml`, CodeGraph artifacts, and the running dev server. Do not reset, clean, commit, push, or deploy.
- Read T196 in main `tasks.md`, the asset risk in `PROJECT_STATUS.md`, FR-182 in `spec.md`, the existing `public/licenses/` notices, T188 Melody manifest/audit, and the asset references in `quickstart.md`. This is an evidence task, not a legal opinion.

## Exact audit targets

- `public/audio/soundfont/acoustic_guitar_nylon-mp3.js` and `public/audio/guitar/acoustic_guitar_nylon-mp3.js` are identical today: 1,837,533 bytes, SHA-256 `623C8109BD17D184C43C6578DFC01170F1E85000EE522F2C580D5FBEEB9298CE`.
- `public/images/guitar-hand-fretting.png` and `src/ui/guitar/assets/guitar-hand-fretting.png` are identical today: 458,663 bytes, SHA-256 `1A8BAC5E11ACE981D08B12886CEA81BC571768585D8D77938A8B0328ACB784E2`.
- Git history points to commits `2ef0894` (nylon introduction), `7816ac6` (Guitar hand), and `df8c27f` (local GM catalog), but commit history alone does not establish source ownership or permission. The steel Guitar asset already has T188 manifest evidence; do not reopen it unless an actual inconsistency appears.

## Authorized work

1. Trace each target to an authoritative upstream source or original creation record. Record exact source URL, repository/file path, pinned revision or version, source-file hash/size where possible, applicable license text, attribution requirement, and how the committed bytes were derived. Distinguish verified facts from inference; do not treat filename similarity or a broad project license as proof for specific bytes.
2. If provenance and redistribution terms can be verified for the exact target, add repository-local evidence and attribution/license notices in the established `public/licenses/` and documentation pattern. Keep the two-copy inventory and SHA-256/byte-size audit reproducible. Ensure the distributed app includes required notices and stays offline/local.
3. If exact provenance or permission cannot be established, do not invent a license or silently remove/replace the asset. Report the specific evidence gap and a minimal scoped replacement/removal option with its user-visible impact to the orchestrator; pause that branch for direction. Do not mark T196 accepted on incomplete evidence.
4. Do not alter the canonical Project/schema, Melody recipe, playback timing, or export semantics. Any necessary asset change must preserve relevant Guitar function and receive focused playback/visual regression checks.

## Required evidence

- Exact inventory and hash comparison for all four files; verifiable sources and local notices for every retained target; clear separation of source facts, transformations, and remaining uncertainty.
- If asset bytes or runtime references change: focused tests and Chromium at 1280×720 and 1920×1080 in light/dark, offline asset loading/playback, and no overflow. For documentation-only changes: verify the notice packaging and asset audit with focused checks.
- Run TypeScript, production build, scoped ESLint/Prettier, and `git diff --check`; report exact commands/results and distinguish pre-existing baseline failures.
- Report changed files and any legal/provenance uncertainty without claiming legal sufficiency. Do not mark T196 accepted in `tasks.md` or `PROJECT_STATUS.md`; the orchestrator owns acceptance.

## Out of scope

T195 print/release gate, Composition UX T198–T210, schema v7/v8, authored Melody, AI, real-time MIDI recording, or literal copying of Hookpad/Signal.
