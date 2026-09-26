# CadenceFlow — project handoff

**Updated:** 2026-09-26
**Main checkout:** C:\Projects\cadenceflow (master; stage base 3c8436f — inspect current HEAD)
**Developer checkout:** C:\Users\pavel\.codex\worktrees\2622\cadenceflow (Luna 2)
**Task ledger:** 211 entries; 197 checked, 14 open (T195 and T198–T210).
**Current portable Project schema:** v6.

The accepted stage is committed to master for GitHub Pages deployment. The local checkout may still contain unrelated changes and untracked graphify-out artifacts; inspect git status and preserve them. Do not bulk-stage, reset, or clean them. NEXT_DEVELOPER_TASK.md is the historical, accepted T196 assignment; no T195 assignment has been issued.

## Current goal and development boundary

The next release batch is **T195 — Printable A4 and release gate**. It depends on accepted T196 and T197/T192. The Composition UX Program (T198–T210) starts only after T195 acceptance. Continue with one bounded Luna 2 batch at a time; the orchestrator reviews its diff, tests, and acceptance criteria before marking tasks complete or opening another batch.

The approved product boundary is Matrix for harmonic discovery and My Progression for temporal editing. Preview/audition must not mutate Project or history; one Apply creates at most one history entry. Screen coordinates may be floating-point, but composition commands receive exact Rational timing. Hookpad is a UX reference and Signal may supply only selectively adapted MIT gesture mechanics; CadenceFlow keeps its own domain, history, playback, and export. AI, real-time MIDI recording, and literal interface copying are out of scope.

Source order: spec.md and tasks.md under specs/001-cadenceflow-core-studio, then plan.md/data-model.md/contracts, then executable code and tests. cadenceflow_hookpad_signal_full_implementation_plan.html is a design input, not an overriding specification.

## Accepted work in this stage

- **T197 + T192:** One schema v5→v6 migration persists Piano/Guitar engines, SoundFont tones, and noteColorMode. Harmonic note roles are derived from harmony rather than stored on Melody events; targetNext is a separate marker. Scale Tones, Melody Roles, and Target Notes use Suggest → Preview → Apply, with non-color cues.
- **T193:** Scales & Modes Apply is key-aware and atomic. Preview/cancel is transient; Apply and Undo/Redo preserve the intended Project transaction and Step identities.
- **T194:** Matrix Focus Mode and capability-gated Guitar Card Flip are transient presentation state, not schema/history mutations.
- **T211:** The selected visible Matrix chord can be added with + or NumPadAdd. This goes through the existing harmony route guard; the related inverse command paths support Undo/Redo.
- **T196:** Nylon Guitar sample provenance is pinned to the FluidR3_GM source revision and canonical SHA-256. A shared byte-level verifier accepts only exact LF or full CRLF checkout forms for the 128 local sample maps. Both nylon copies and both Guitar-hand PNG copies are audited. The hand illustration is documented from the user's first-party authorship statement as shafranek-js; its PSD is unavailable. Notices are packaged, but this is not a legal-sufficiency opinion. No audited binary asset or runtime reference changed.

The established T188–T191 foundation remains accepted: offline 128-program GM catalog, canonical Matrix topology, directed-tension route guard, Melody/instrument projections, and no production CDN fallback.

## Technical contracts to preserve

- Schema v6 belongs only to T197+T192. Keep runtime Project types, JSON Schema, migrations, portable codec, autosave, fixtures, and Undo/Redo compatible. Schema v7 is reserved for Authored Melody (T207); v8 is reserved for Song Sections (T209).
- Domain code in src/domain stays independent of React, VexFlow, WebAudio, and persistence frameworks. Staff, playback, MIDI, MusicXML, and audio project the same canonical Project state; do not create a second pitch/timing model.
- Matrix cards are Preview/Add templates; progression Steps are independent snapshots. All Add routes, including keyboard +, use the same strict route guard based on the committed progression or branch endpoint, never the preview card.
- Piano/Guitar engine and tone selection belongs to AudioEnginesInspector. Track-local instrument, volume, Mute/Solo, status, and retry remain separate. Staff Melody partitioning follows each Step's effective instrument.
- GM samples stay local and manifest-backed. The manifest stores canonical LF size/hash; the verifier rejects altered or mixed line endings. Keep the pinned source, CC BY 3.0 attribution, and first-party PNG notice with the distributed build.
- T195 print output must remain accessible in light/dark modes and at 1280×720 and 1920×1080. Chromium checks use one worker and no retries; color meaning needs text/shape/symbol equivalents.

## Main files to inspect

- **Contracts and schema:** specs/001-cadenceflow-core-studio/{spec.md,plan.md,tasks.md,data-model.md,contracts/cadenceflow-project.schema.json}; src/domain/project/{project.ts,migrations.ts,factory.ts}; src/persistence/portableProject.ts.
- **Harmony, Melody, and notation:** src/domain/harmony/noteRoles.ts; src/domain/melody/{types.ts,projection.ts}; src/notation/melodyStaffProjection.ts; src/audio/{eventRealizer.ts,melodyPerformance.ts}; src/export/musicxml/projection.ts.
- **Commands and UI:** src/app/{App.tsx,commands/dispatcher.ts,commands/presentationCommands.ts,commands/modesExplorerCommands.ts}; src/ui/{matrix/HarmonicMatrix.tsx,modes/ModesExplorerModal.tsx,chord-card/ChordCard.tsx,inspector/ProgressionGlobalInspector.tsx,piano/PianoCardView.tsx,staff/ScoreSystemView.tsx}; src/styles/{studio.css,progression.css}.
- **Asset evidence:** public/audio/melody/manifest.json; public/licenses/{FluidR3_GM-attribution.txt,FluidR3_GM-CC-BY-3.0.txt,guitar-hand-fretting-attribution.txt}; scripts/{generate-melody-manifest.ts,verify-melody-assets.ts,verify-guitar-asset-provenance.ts,lib/canonicalSampleMapBytes.ts}.
- **Focused tests:** tests/e2e/t197-t192-schema-v6.spec.ts, t193-modes-explorer-atomic-apply.spec.ts, t194-focus-mode-card-flip.spec.ts, and t211-matrix-plus-shortcut.spec.ts; tests/integration/{modes-explorer-apply,matrix-focus-mode-card-flip,matrix-plus-shortcut}.test.ts; tests/unit/persistence/schema-v6-cutover.test.ts; tests/unit/scripts/canonical-sample-map-bytes.test.ts.

## Verification snapshot

- **Fresh on 2026-09-26:** five focused Vitest files passed, 21/21 tests, using --maxWorkers=1 --no-file-parallelism. An initial combined run had a fork-worker startup timeout after 19 tests passed; the affected file then passed 2/2 alone, and the complete sequential rerun passed 21/21.
- **Fresh build:** corepack pnpm run build passed (TypeScript plus Vite). Vite reports the existing >500 kB JS chunk advisory. The current dist/ totals 409,719,668 bytes; FluidR3_GM and Guitar-hand notices are present there.
- **T196 independent acceptance in main:** offline Melody manifest verifier passed 128/128; Guitar provenance verifier passed both nylon and both PNG copies; byte-normalizer unit tests passed 5/5; scoped ESLint, Prettier, and git diff --check passed. Manifest generation was reproducible. T193/T194/T211 browser acceptance previously passed 4/4 each across 1280×720 and 1920×1080 in light/dark; no new browser run was needed for T196's documentation-only/runtime-neutral changes.
- **Not green:** a fresh full corepack pnpm run lint exits with 64 errors and 16 warnings. Two confirmed errors in changed files are unused HarmonicNoteRoleContext in src/notation/melodyStaffProjection.ts and unused GLOBAL_LOOP_DISCLOSURE_STORAGE_KEY in src/ui/inspector/ProgressionGlobalInspector.tsx. Do not describe the full lint gate as passing; classify and resolve these before T195 release acceptance.
- **Tooling:** package.json pins pnpm 10.12.4; corepack pnpm --version resolves to 10.12.4. The fallback bare pnpm is 11.19.0 and pnpm build currently stops during its dependency preflight on ignored esbuild/libxmljs2 build scripts, before project compilation. Use Corepack for project commands; do not alter pnpm-workspace.yaml approval policy incidentally.
- **Last full Vitest evidence:** 1006/1011 passed during T197/T192 acceptance; four libxmljs2 native-binding/validator failures and one reharmonization Bb versus Bb/D expectation were then outstanding. That full suite was not rerun for this handoff. Dev server at http://127.0.0.1:5173/ returned HTTP 200 on 2026-09-26; recheck before relying on it.

## Known release risks and documentation debt

1. T195 is unimplemented: printable A4 measures, chord symbols, arrows, compact Guitar diagrams, clipping/long-progression behavior, and final release evidence still need acceptance.
2. Full ESLint is red as above. The older status claim of only three App.tsx warnings was based on scoped checks, not the current full-project lint result.
3. specs/001-cadenceflow-core-studio/quickstart.md still says engine/tone settings are runtime/session-only. That sentence is stale after schema v6 and should be corrected during T195 documentation review.
4. HQ Piano has attribution/provenance but no separate full piano-bank license text in the repository; decide the release disposition explicitly. T196's PNG attestation has no preserved PSD and is not a legal opinion.
5. The local asset bundle is large (~409.7 MB), and the JS chunk advisory remains. Do not reintroduce a CDN fallback to hide package size.
6. The last full Vitest failures above and headless Windows Firefox/SWGL instability are not resolved by this stage. Chromium is the deterministic browser gate unless a fresh Firefox run succeeds.

## Approaches already rejected or corrected

- CDN-backed GM playback and an SF3/stb-vorbis path were abandoned in favor of verified offline FluidR3_GM MP3 sample maps.
- Duplicate engine/tone settings surfaces were removed; AudioEnginesInspector owns them. Full-width/collapsible auxiliary Matrix rows were replaced by visible same-band side slots to preserve topology.
- Using preview state as a route origin allowed a guard bypass; route evaluation now uses committed progression/branch state.
- Raw Windows file-size checks against LF manifest data failed on Git CRLF checkouts. UTF-8 decode/re-encode normalization was also rejected because it can hide byte changes. The shared byte-level LF/CRLF normalizer and exact hashes are the accepted solution.
- A multi-file Vitest worker-startup timeout was resolved in this handoff by a sequential rerun; do not misreport that initial run as a code assertion failure.

## Next sequence

1. On a new explicit assignment, give Luna 2 one bounded T195 batch in the existing worktree. First inspect Git status and the exact FR-237–FR-239/T195 acceptance criteria; preserve all uncommitted and untracked user data.
2. Implement Printable A4 and release checks; fix or formally triage full-lint and documentation discrepancies, confirm HQ Piano licensing disposition, offline assets, schema/codec round trips, long-progression print layout, accessibility, focused/full regression, and production packaging. Review diff and tests independently before checking T195.
3. After T195 acceptance, proceed in bounded batches: UX 1.1 T198–T205, UX 1.2 T206–T208 (authored Melody/schema v7), then UX 1.3 T209–T210 (sections/schema v8 and monodic Web MIDI step input). Do not start T198 before the release gate.

The next worker should read this file, NEXT_DEVELOPER_TASK.md as historical context, current tasks.md/spec.md/plan.md, then inspect git status --short --branch and the relevant tests. Preserve the dirty checkout and report exact commands/results; do not mark a task complete from a developer summary alone.
