# T201 endpoint scope resolution — 2026-10-05

The accepted generic T201 Step-duration resize remains a multi-Measure operation on the finite Rational timeline. The later Piano Roll CHORD boundary contract applies to Piano Roll, not to the other progression views. The unintended generic chord cap is therefore restricted to `presentation.progressionView === "piano-roll"` in `createDurationResizeSnapshot`. App's duration-resize callback likewise uses the existing generic `changeStepDuration` outside Piano Roll and the existing CHORD resize command inside it. No schema or Piano Roll boundary semantics is changed.

The original three-bar test still expects endpoint 11 and duration 9; its expectation was not weakened. A new paired regression explicitly checks endpoint 3 and upper clamp for the same final chord in Piano Roll, and endpoint 11 in the generic view. Existing chord-command tests cover the separate command constraints.

Current scoped verification completed:

- `pnpm exec vitest run tests/unit/progression/t201-direct-duration-resize.test.ts tests/unit/melody/piano-roll-system-chord-commands.test.ts tests/unit/app/timing-commands.test.ts --maxWorkers=1`: 33/33 across three files.
- `pnpm run build`: passed, 465 modules, `index-BEsZZBge.js` and `index-VlJtNUr4.css`; existing build advisories only.
- `pnpm exec playwright test tests/e2e/t201-direct-duration-resize.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts tests/e2e/piano-roll-system-chord-panel.spec.ts --project=chromium --workers=1 --retries=0`: final 41/41 passed in 2.7 minutes. This includes all 27 portable chord cases, the protected second-Measure shrink/restore regression, autoscroll cancellation, Tie/group, all three CHORD-panel cases and all 11 generic T201 browser cases.
- The intermediate adapter-only build gave 40/41: generic keyboard preview reached 97/24 but Enter retained 4 because App still routed to CHORD. Fixing the callback resolved this real production defect without weakening the E2E assertion.
- Scoped ESLint: zero errors, four existing App hook warnings. Scoped Prettier and `git diff --check` passed.

Changed files: `src/ui/progression/durationResizeAdapter.ts`, `src/app/App.tsx`, `tests/unit/progression/t201-direct-duration-resize.test.ts`, `tasks.md`, `piano-roll-plan.md`, this resolution and a current-status note in the historical release handoff. HEAD remains `e5d2255`; existing untracked artifacts preserved and index empty. No stage, commit, push, deployment, cleanup or Actions changes. The protected portable spec was not edited by root in this resolution.

The documentation/test-debt scope is now closed with current root evidence. The 2026-10-04 handoff remains a historical record of its original results, including the observed Export-menu timeout; the final 27-case portable run here was clean. This is a scoped validation of a root-authored fix, not a second-person code review or complete release acceptance.

Remaining release boundary: complete FR-261 regression and disposition of any observed failures, offline assets/notices and migrated portable projects, representative print/layout, and a decision on physical MIDI hardware verification. This fix is not a full-release acceptance.
