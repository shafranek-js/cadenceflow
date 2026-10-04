# Piano Roll stable Measure width

User-authorized small layout task after independently accepted T212. No separate large design plan is needed.

For a fixed viewport, horizontal zoom and configured Measures per System, every Measure retains the same width in every System. A final System containing one Measure with capacity four occupies one quarter of the usable music width, matching the complete System; leave unused space on the right. Generalize to other user-configured capacities. Account consistently for the shared pitch-label gutter. Do not create empty authored Measures, stretch the remaining content, mutate timing, or change Project schema.

Reuse the existing Piano Roll layout and coordinate calculations. Preserve notes, Harmony, guides, cursor and hit targets at the same musical scale; ensure clicks, drag/move, resize, Snap and horizontal scrolling use actual geometry. Preserve T210 MIDI, accepted T212 offsets/history and protected chord regression. Do not start group selection, T213 or T214 in this batch.

Developer must inspect the current dirty checkout, implement only this small task, and run meaningful focused Chromium geometry/interaction checks with workers=1/retries=0, fresh build, scoped lint/format and diff check. Check at least capacities 2/4/8, full plus partial Systems, zoom and scrolling, normal compact/desktop viewports and both themes. Actually view captures of full and partial Systems. Return exact command totals, changed files, Git state and limitations; independent root acceptance remains separate. No stage, commit, push, deployment, cleanup, Actions enablement or full suite. Preserve all dirty/untracked work.
