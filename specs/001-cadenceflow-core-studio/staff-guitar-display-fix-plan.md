# Staff/Guitar display fix — approved separate batch

## Authorization and baseline

Start only after independently accepted Piano Roll batch 3, System NOTE and System CHORD. These gates are now accepted. Implement in the existing GPT-6 Luna developer thread, as a separate batch. Preserve all accepted Piano Roll behavior and all foreign tracked/untracked dirty work. No staging, commit, push, deployment, full suite, adjacent tasks, system voice leading, new Staff/Guitar editing, or Project schema change.

The user's original `C:/Users/pavel/Downloads/first.cadenceflow` is protected. Copy it unchanged into a regression fixture; never modify the original. It decodes as schema 9 with eight measures and 24 notes, including dotted/long cross-bar and simultaneous notes. Audio already sounds correct: the problem is incorrect notation and a jumping visual playhead. Existing 5/2 values appear as quarter glyphs despite exact internal ticks, dots are not explicitly attached, TAB disables stems, the merged Harmony/Melody TAB branch omits beams/tuplets/ties, and Staff playhead interpolation targets the next event and falls back to Harmony in rests.

## 1. Shared exact rhythmic projection

Introduce a derived layer between the common effective Melody timeline and VexFlow, without changing stored source events or Project. Decompose onset and effective duration using meter grouping and bar boundaries into real written note values, dots, rests, triplets and tied fragments. Support ordinary, dotted and composite durations, every standard duration/triplet and all exact Rational values beyond the standard grid. Nonstandard denominators require exact explicit tuplet-ratio groups; never round or display a fake quarter for a custom duration.

Fragment durations must sum exactly to the effective original duration. This is rendering only and must not introduce audio attacks. Each fragment retains owner-scoped source identity, absolute onset, exact duration, rhythmic voice, written value and continuation links. Group pitches with identical onset and rhythm into a chord; independent overlapping rhythms need separate voices and must never serialize polyphony. Integrate the shared projection into `melodyStaffProjection.ts`, `vexflowAdapter.ts` and `ScoreSystemView.tsx`.

## 2. Staff and rhythmic Guitar TAB

Staff must render real attached dots, flags, meter-aware beams, rests and tuplets. Tie fragments of the same source event within a measure, across measures and across systems. Distinct repeated events with the same pitch must not be tied. Harmony, Melody, voices and hit regions share horizontal geometry. Dense measures grow in width rather than colliding glyphs.

Replace the current Guitar TAB rendering with rhythmic TAB: retain six strings and fret numbers, and add stems, flags, beams, dots, rhythmic rests, tuplets and hold ties. Do not add a separate musical staff above it. Use the same exact projection, including the merged Harmony/Melody branch. Tied fragments retain the same fret/string and do not receive new fingering or attacks. Never drop musical events because string placement conflicts; explicitly mark impossible combinations while preserving the original music.

## 3. Continuous audio-clock playhead and sounding highlights

The existing playback controller publishes a shared time snapshot containing session ID, actual audio-clock anchor, musical start, tempo, bounds and state. Derive absolute musical position from the actual audio clock and map it through common measure geometry, never toward the next note destination. Movement stays continuous through rests, holds and chord changes; system transitions and loop resets obey exact time bounds.

Highlight all sounding source notes from their effective intervals independently of selection. Rendered ties/fragments must not restart source-event highlights. Pause freezes position, resume continues, and stop, finish and replacement clear it. Handle count-in, Play From Here, loops and view changes. Preserve the existing audio scheduler, instruments and correct sound; do not introduce per-note visual timers.

## 4. Independent verification and handoff

Use the unchanged copied user project as a real regression fixture: 5/2 G4 in measure 2, dotted 3/2 values, 9/2 G4 across measures 7–8, rests and simultaneous C4/G3 in the last measure. Cover standard durations, all triplets, nonstandard Rational values, independent overlap voices and cross-system continuation. Verify exact sums, onset/duration/source identity, actual dots/flags/beams/tuplets/ties, no extra attacks, and no Project/history/export mutation.

Use controlled audio clocks to verify continuous movement between attacks and through rests, pause/resume, loops, delayed preparation, stop/replacement and view changes. Actually view normal-CSS-scale Staff and Guitar captures at 1280×720, 1920×1080 and 640×360 in both global themes, including active playback and scroll states. Full-page captures are supplementary.

Run focused Vitest with `--maxWorkers=1`, a fresh build, relevant Chromium with `--workers=1 --retries=0`, scoped ESLint/Prettier and `git diff --check`. No full repository suite. Provide baseline/delta/architecture/provenance, requirement-to-code-to-test evidence, changed files, exact checks and protected Git state. Independent reviewer acceptance is required; only after successful final Staff/Guitar acceptance mark this status and pause the existing automation. Do not claim full release regression.

## Status

- [x] Prior Piano Roll / NOTE / CHORD independent gates accepted.
- [x] Separate Staff/Guitar implementation dispatched.
- [ ] Developer implementation and complete handoff.
- [ ] Independent Staff/Guitar acceptance.
- [ ] Existing automation paused after final acceptance.
