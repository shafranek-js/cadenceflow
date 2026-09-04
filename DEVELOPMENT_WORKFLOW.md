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

## Git policy for the next stage

The current handoff folder contains no `.git` directory. Before US5 work:

- attach to the intended repository or initialize a repository;
- create a baseline commit representing this handoff;
- use small commits mapped to task batches;
- do not mix toolchain repair, US5 domain realization, and audio assets into one opaque commit.

Recommended commit grouping:

1. `chore: restore reproducible CadenceFlow toolchain`
2. `test(us5): define piano realization and audio contracts`
3. `feat(us5): implement canonical piano realization`
4. `feat(us5): add HQ sample audio providers and scheduler`
5. `test(us5): verify pitch velocity projection consistency`

## Status discipline

`PROJECT_STATUS.md` is the handoff state, not a diary. Keep only information needed to resume development. Replace obsolete limitations once fixed rather than accumulating history.
