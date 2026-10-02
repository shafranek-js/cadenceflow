# Real MusicXML regression source

These two inputs were copied from `C:\Users\pavel\Downloads` and are preserved unchanged:

- `8.cadenceflow` — portable project, SHA-256 `606F0193B153AE56AAF6CE2B717C21D1C46707EE79E515FC97424C8C9E565E0A`.
- `8.original.musicxml` — the user's original export, SHA-256 `7F0D6BFDE0643FBF0B85B82CE8040EA231E28A5C429384931AD54B586A54D4E0`.

The portable source has 24 effective Melody events (one authored note on a Rest owner plus authored chord phrases of 4, 3, 3, 5, 4, 2, and 2 notes). The original XML has 25 pitched P2 segments, with two joined by a tie into one event. The repaired export has 27 written note segments; those ties reconstruct the same 24 source events.

The focused MusicXML regression decodes the portable project, exports it through the runtime projection and writer, parses both original and repaired XML independently, checks repaired written durations against type/dots/tuplet ratio, joins ties, and compares exact note and Rest timelines with the source project. The original MusicXML file remains an unchanged comparison input.
