# Quickstart: CadenceFlow

Run the commands below from the repository root.

## Prerequisites

- Node.js 22 or newer. The current validated checkout uses Node.js 24.14.0.
- pnpm 10.12.4, pinned by `package.json` and the Pages workflow.
- A modern browser for the UI and Chromium checks.
- `ffmpeg` on `PATH` for the full HQ piano-bank file and decode verification.
- The GitHub CLI (`gh`) is optional and is only needed to start or inspect the
  manual Pages workflow.

## Bootstrap

For a fresh checkout:

```bash
git clone https://github.com/shafranek-js/cadenceflow.git
cd cadenceflow
corepack enable
pnpm --version
pnpm install --frozen-lockfile
```

`pnpm --version` should report `10.12.4`. Check the Node.js version with
`node --version` before installing dependencies.

## Local development

Start the Vite development server on the repository's stable local port:

```bash
pnpm run dev -- --host 127.0.0.1 --port 5174 --strictPort --force
```

Open <http://127.0.0.1:5174/> in a supported browser.

To build and preview the production output locally:

```bash
pnpm build
pnpm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

The normal local build uses `/` as its base path. The Pages build below uses
`/cadenceflow/`.

## Tests and verification

Run the complete Vitest suite and Chromium suite with:

```bash
pnpm test
pnpm build
pnpm run test:e2e:chromium
```

The Chromium suite previews the existing `dist/` directory. Rebuild it without
`GITHUB_ACTIONS=true` first so local tests use the `/` base path.

Run the directly relevant HQ piano/Melody tests with one Vitest worker:

```bash
pnpm exec vitest run \
  tests/unit/audio/prepare-piano-bank.test.ts \
  tests/unit/audio/hq-sample-piano/manifest.test.ts \
  tests/unit/audio/hq-sample-piano/sample-cache.test.ts \
  tests/unit/audio/hq-sample-piano/provider.test.ts \
  tests/unit/audio/soundfont/melody-provider.test.ts \
  tests/unit/melody/instrument-catalog.test.ts \
  tests/unit/ui/modes-explorer.test.ts \
  tests/unit/ui/guitar-card-view.test.ts \
  --maxWorkers=1
```

The browser-level HQ decode/cache smoke test is:

```bash
pnpm build
pnpm exec playwright test tests/e2e/us5-audio-playback.spec.ts \
  --project=chromium --workers=1 --retries=0
```

Verify the committed audio assets offline:

```bash
pnpm run verify:melody-assets
pnpm run verify:guitar-asset-provenance
pnpm run verify:piano-bank
```

The Melody manifest and Guitar providers use local repository assets at runtime; no production CDN
dependency is required. The T196 asset audit records the pinned nylon-sample source and canonical byte
hash, Git's exact LF-to-CRLF checkout form, and the user's authorship statement for the Guitar hand
illustration. Its original PSD is unavailable; the notice does not assign a third-party license or make a
legal sufficiency claim. Run `verify:guitar-asset-provenance` to check both nylon copies and both PNG copies.

`verify:melody-assets` checks the 128 manifest-backed local FluidR3 GM assets,
per-file sizes and SHA-256 values, manifest provenance, license, and attribution.
The six legacy stable ids are compatibility identifiers, not the current asset
count. `verify:piano-bank` regenerates the deterministic
480-region manifest and checks every referenced OGG file with `ffmpeg`,
including decode coverage.

Engine ownership is covered by `tests/e2e/progression-global-inspector.spec.ts`: the global All Steps &
Measures surface has no engine/tone selectors, `AudioEnginesInspector` contains them, and the lower
`PianoAudioStatus` is read-only. Piano/Guitar engine and tone settings are persisted in schema v6 and
included in the portable/autosave codec; the schema-v5-to-v6 migration and v6 round-trip tests cover
their compatibility. Session Undo/Redo history remains runtime-only and is not serialized.

## Production build for GitHub Pages

On PowerShell:

```powershell
$env:GITHUB_ACTIONS = "true"
pnpm build
```

On macOS/Linux shells:

```bash
GITHUB_ACTIONS=true pnpm build
```

This build emits `/cadenceflow/`-prefixed HTML asset URLs and copies the
manifest, piano samples, Melody assets, and license files into `dist/`.

## Manual GitHub Pages workflow

The repository workflow is manual-only (`workflow_dispatch`). After the desired
commit is pushed and GitHub CLI authentication is available, start it with:

```bash
gh workflow run deploy.yml \
  --repo shafranek-js/cadenceflow \
  --ref master
gh run list --repo shafranek-js/cadenceflow --workflow deploy.yml --limit 1
gh run watch RUN_ID --repo shafranek-js/cadenceflow --exit-status
```

Replace `RUN_ID` with the run ID returned by `gh run list`. The workflow builds
with `GITHUB_ACTIONS=true`, uploads `dist/`, and deploys through the GitHub
Pages environment. No deployment is started automatically by local commands.
