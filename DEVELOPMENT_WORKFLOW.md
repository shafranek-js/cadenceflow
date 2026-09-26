# CadenceFlow — Development Orchestration Workflow

## Roles

### Orchestrator

The orchestrator owns scope control, review, acceptance, and project-status updates. The orchestrator does not treat a developer's self-reported completion as acceptance.

For each batch the orchestrator must:

1. Cite exact `tasks.md` IDs and relevant FR/SC requirements.
2. Define files/architecture boundaries and explicit non-goals.
3. Require tests before marking tasks complete.
4. Review the actual diff/code, not only summaries.
5. Check for regression against already completed user stories.
6. Update `tasks.md` and `PROJECT_STATUS.md` only after acceptance.

### Developer

The developer implements the assigned batch only. If a requirement appears contradictory, stop that part and report the contradiction instead of silently changing the product model.

The developer must not:

- Expand scope into later user stories.
- Change `spec.md` product behavior without an explicit orchestrator decision.
- Couple `src/domain/**` to UI/browser/audio/persistence frameworks.
- Maintain a second pitch/velocity model for UI or audio.
- Add unverified sample assets/licenses.
- Mark tasks complete without test evidence.

## Required developer submission

Each implementation return must contain:

1. **Task IDs completed**.
2. **Git commit/hash or diff**.
3. **Files changed** with one-line purpose for each significant file.
4. **Tests run** with commands and pass/fail output.
5. **Known limitations** remaining inside the assigned scope.
6. **Screenshots/video** for visible UI/audio-state behavior when relevant.
7. Explicit statement of any spec deviation. `None` is acceptable; silence is not.

## Review gates

The orchestrator reviews in this order:

1. Scope/spec compliance.
2. Domain and architecture boundaries.
3. Correctness of canonical model/transforms.
4. Tests for happy path + edge cases.
5. UI accessibility/state consistency.
6. Performance/resource behavior where relevant.
7. Regression against completed stories.

Possible decisions:

- **ACCEPTED** — tasks may be checked off.
- **ACCEPTED WITH FOLLOW-UP** — only if follow-up is non-blocking and receives its own task.
- **CHANGES REQUIRED** — tasks remain open; return exact correction list.

## Git and worktree policy

- Use the existing Git repository; do not initialize a replacement repository or create a synthetic
  baseline commit.
- Start each assigned batch by checking the current branch/HEAD and `git status`; preserve existing or
  user-owned changes.
- Use an isolated worktree for a batch when requested or when concurrent work could overlap. Keep one
  bounded task batch per worktree and report its full path.
- Keep commits small and mapped to accepted task batches. Do not commit, push, or open a pull request
  unless the orchestrator explicitly requests it.
- Do not begin a later product batch until the current batch has been independently reviewed and
  separately assigned.

## Status discipline

`PROJECT_STATUS.md` is the handoff state, not a diary. Keep only information needed to resume development. Replace obsolete limitations once fixed rather than accumulating history.

## CadenceFlow roadmap and transaction rules

T197+T192, T193, T194, T211, and T196 are accepted. T195 is the remaining release batch. Composition UX 1.1 (T198–T205), 1.2 (T206–T208), and 1.3 (T209–T210) are scheduled only after T195 acceptance. Do not infer authorization for the next batch from completion of the previous one; obtain an explicit assignment.

Schema boundaries: v6 is T197 + T192 only, v7 adds Authored Melody (T207), and v8 adds Song Sections (T209). Matrix is for harmonic discovery; My Progression is for temporal editing. Preview/audition cannot mutate Project or history; Apply is one canonical command and one history entry. Any Signal-derived code is limited to adapted MIT interaction gestures behind an adapter, with provenance comments and `THIRD_PARTY_NOTICES.md`. AI, realtime MIDI recording, and literal copying of Hookpad or Signal remain out of scope.
