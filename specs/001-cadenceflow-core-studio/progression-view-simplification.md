# My Progression view simplification — 2026-10-05

User authorized retiring Harmonic View from My Progression without adding old-project migration or compatibility work. My Progression now offers Piano, Staff, Guitar, Tablature and Piano Roll. Harmonic remains available for Matrix. Harmonic roles remains a Piano Roll note-color option; chord editing, duration, quick edit/Inspector, sections, Measure menus and group operations continue through existing paths.

The H choice was removed from the progression toolbar, View menu and progression Inspector. The Inspector gained its missing Piano Roll choice. Newly created projects default to Piano Roll. Shared Harmonic card rendering and existing storage types are not removed because Matrix and other internal projections still use them; no schema change or compatibility adapter was introduced.

Tests that explicitly selected retired H now use Piano or omit H from the progression view matrix. Generic T201 fixtures explicitly choose Piano rather than relying on the old factory default. Import helpers close the project menu explicitly, avoiding Escape's legitimate Piano selection clearing. Musical/history assertions were retained.

Verification: fresh build passed (465 modules, `index-C9veh7XX.js`); focused presentation/T201 units 18/18; new view-selector plus T201/CHORD-panel Chromium 15/15. The related MIDI/group/Measure run initially passed 44/46, with two import-helper selection failures; after correcting the helpers, Duplicate Measure and T215 passed 14/14. The 18 MIDI and nine group-selection cases passed in the related run. All runs use one worker and zero retries. Scoped ESLint had no errors (existing Inspector/App warnings remain), changed TypeScript files passed Prettier and whitespace checks. Older tests edited solely to remove H selection have not all been rerun; the full release gate remains separate.

The dedicated view-selector test confirms five toolbar choices, no H progression entry in View, Matrix Harmonic retained, Piano Roll as default, functional Harmonic roles and return to PR through Inspector. It captures 640×360, 1280×720 and 1920×1080 in both themes under the root visualization directory; root inspected the narrow light and desktop dark captures.

Pre-existing T201 work and untracked artifacts remain preserved. No staging, commit, push, deployment or cleanup.
