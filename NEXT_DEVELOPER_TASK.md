# Developer Assignment — T196 Guitar Asset Provenance

**Status:** Accepted by the orchestrator on 2026-09-26 after independent verification. Historical handoff only; T195 has not been assigned.

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
