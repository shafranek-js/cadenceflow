<!--
Sync Impact Report
- Version change: template -> 1.0.0
- Added principles:
  - I. Composition First
  - II. Harmonic Correctness and Explainability
  - III. Piano First, Instrument-Agnostic Product Model
  - IV. Direct Manipulation with Immediate Musical Feedback
  - V. Progression Steps Are First-Class Objects
  - VI. One Coherent Studio Workspace
  - VII. Spec-Driven, Regression-Protected Evolution
- Added sections:
  - Product Boundaries
  - Development Workflow and Quality Gates
- Removed sections: none (template placeholders replaced with project-specific governance)
- Deferred TODOs: none
-->

# CadenceFlow Constitution

## Core Principles

### I. Composition First
CadenceFlow MUST optimize for one primary outcome: helping a musician move from a harmonic idea to
an intentional, playable chord progression. New features MUST demonstrate how they improve harmonic
exploration, progression construction, auditioning, arrangement of chord performance, or transfer to
a composition workflow. Educational, analytical, library, MIDI-capture, and other adjacent features
MUST NOT enter the core product merely because they existed in an earlier prototype.

**Rationale:** The predecessor project accumulated multiple partially overlapping activities. Product
clarity takes precedence over feature count.

### II. Harmonic Correctness and Explainability
Every displayed chord, relationship, recommendation, sounding note, progression step, and exported
musical event MUST derive from a consistent harmonic model. Ranked next-chord recommendations MUST
be explainable in musical terms; the product MUST be able to state why a recommendation is offered.
Musical shortcuts MAY simplify presentation, but they MUST NOT silently contradict the underlying
harmony.

**Rationale:** CadenceFlow is useful only if users can trust both what they hear and the harmonic
reasoning shown on screen.

### III. Piano First, Instrument-Agnostic Product Model
The first complete product experience MUST be designed and validated for piano. Core harmonic
concepts, progression content, recommendation logic, and chord identity MUST remain independent of
a specific instrument. Adding a future supported instrument such as guitar, ukulele, or melodica
MUST NOT require redefining the harmonic map or converting existing progressions into a different
musical data model.

**Rationale:** Piano is the launch instrument, not the permanent boundary of the product.

### IV. Direct Manipulation with Immediate Musical Feedback
Primary composition actions MUST produce immediate and unambiguous visual feedback and, where the
action represents musical material, an easy way to hear the result. Users MUST be able to distinguish
the selected chord, recommended next steps, the current playback step, completed playback steps, and
the contents of their progression. Destructive actions MUST be explicit and reversible where
reasonable.

**Rationale:** The product is an interactive musical workspace, not a static theory reference.

### V. Progression Steps Are First-Class Objects
A progression MUST be an ordered sequence of independent step instances. Each step MUST preserve its
own harmonic variant and performance settings, even when the same base chord appears more than once.
Editing one occurrence MUST NOT unintentionally alter another occurrence unless the user explicitly
requests a shared change.

**Rationale:** Composition requires repetition with variation; a global per-chord configuration model
cannot represent that reliably.

### VI. One Coherent Studio Workspace
The desktop experience MUST present a coherent composition flow rather than a collection of loosely
connected modes. The harmonic map MUST remain the primary orientation surface, with progression,
auditioning, chord inspection, and contextual guidance supporting that flow. Full desktop width SHOULD
be used productively, and controls SHOULD avoid duplicated selectors or competing sources of state.

**Rationale:** Spatial continuity is a core part of the CadenceFlow concept and a direct response to the
mode and navigation sprawl of the earlier prototype.

### VII. Spec-Driven, Regression-Protected Evolution
Approved specifications and acceptance criteria are the source of product intent. Implementation MUST
trace back to approved requirements. Changes to harmonic behavior MUST have deterministic musical
fixtures; changes to core interaction flows MUST have repeatable acceptance checks. A feature MUST NOT
be considered complete when code exists but the relevant acceptance criteria are not demonstrably met.

**Rationale:** The product will evolve quickly, but rapid iteration must not recreate the accumulated
behavioral ambiguity of the predecessor.

## Product Boundaries

- The first production scope MUST deliver a complete piano composition workflow before additional
  instruments are declared supported.
- The product MUST remain capable of adding instrument-specific visualization and playback behavior
  without changing progression semantics or harmonic relationships.
- Practice curricula, ear-training games, progression analysis, live MIDI capture, cloud accounts,
  collaboration, and large preset libraries are separate product decisions. They are not inherited
  requirements from ChordLab.
- Desktop keyboard/mouse interaction is the primary launch environment. Responsive safety MAY be
  supported, but mobile-first redesign MUST NOT compromise the desktop studio workflow unless a later
  specification explicitly changes this boundary.
- Visual effects MUST communicate musical state or interaction state; decoration MUST NOT reduce map
  legibility, recommendation clarity, or editing precision.

## Development Workflow and Quality Gates

1. Every substantial capability starts with a Spec Kit specification describing WHAT and WHY before
   implementation details are chosen.
2. Ambiguous scope decisions with materially different user outcomes MUST be resolved before planning.
3. The technical plan MUST explicitly show how harmonic domain logic remains independent of instrument
   presentation/playback concerns.
4. Task generation MUST map implementation work to user stories and acceptance scenarios.
5. Cross-artifact analysis SHOULD run before implementation for substantial features.
6. Implementation MUST preserve deterministic musical fixtures for theory, recommendations, playback
   pitch content, progression ordering, and export semantics where applicable.
7. Convergence MUST be run after implementation; unresolved gaps return to tasks rather than being
   accepted as undocumented behavior.
8. Legacy ChordLab or prototype code MAY be reused only after its behavior is mapped to an approved
   CadenceFlow requirement.

## Governance

This constitution governs all CadenceFlow specifications, plans, and implementation work. When an
artifact conflicts with a MUST principle, the artifact MUST be corrected or the constitution MUST be
explicitly amended first.

Amendments require a documented rationale, an impact statement covering affected specifications and
implementation, and a semantic version update. MAJOR changes remove or redefine a governing principle;
MINOR changes add a principle or materially expand governance; PATCH changes clarify wording without
changing obligations.

Specification and implementation reviews MUST verify constitutional compliance. Complexity or legacy
behavior that conflicts with these principles requires explicit justification; historical presence is
not sufficient justification.

**Version**: 1.0.0 | **Ratified**: 2026-09-04 | **Last Amended**: 2026-09-04
