# Piano Card View — Design QA

- Source visual truth: `C:\Users\pavel\AppData\Local\Temp\codex-clipboard-c3430871-ad30-4d43-8a45-01a6f93d054c.png`
- Implementation: `http://127.0.0.1:5174/`, inline Codex in-app Browser capture, tab 10
- Viewport: 1270 × 731 CSS px, device density 1
- State: Light theme, Progressions Major, global Piano card view
- Source pixels: 539 × 403
- Implementation capture: 1270 × 731

## Full-view comparison

The revised black keys are lighter than the previous near-black surface and retain a clearly darker five-pixel lower edge. Pressed notes remain light brown. All black keys stay above the white-key layer and are fully visible. Only pressed notes receive visible pitch labels.

## Focused component comparison

The keyboard keeps seven white keys, complete black-key silhouettes, and the requested volumetric lower edge. Chord symbols are centered above the keybed, with the current upper-voicing octave at the top right. Pressed natural-note names are aligned to their white-key centers; active accidental spellings are aligned beneath their black keys. Unpressed keys have no label.

## Required fidelity surfaces

- Typography: compact labels remain legible without wrapping or truncation.
- Spacing/layout: labels fit inside each card; the keybed is not cropped.
- Colors/tokens: black-key face `#30353c`, lower edge `#171a1f`, pressed key `#d6a174`.
- Image/asset quality: no raster asset is involved; the keyboard remains a semantic, data-driven control visualization.
- Copy/content: chord symbols come from the canonical chord formatter; pitch labels come from the rendered MIDI/spelling data.

## Comparison history

- P2: the original black-key face was too dark for its lower edge to read. Fixed with separate face and edge tokens.
- P2: pressed white keys could cover half of adjacent black keys. Fixed by keeping the entire black-key layer above the white-key layer.
- P2: the Piano view lacked chord, octave, and pressed-key labels. Fixed with canonical chord symbols, the lowest upper-voice octave, and aligned labels shown only for pressed notes.

## Findings

No remaining P0, P1, or P2 mismatch was found in the requested component state.

final result: passed
