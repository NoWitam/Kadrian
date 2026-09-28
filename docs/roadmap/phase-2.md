# Phase two: authoring and the Taskio editor

- Status: Accepted as a direction by the project owner on 2026-09-28 (PR-17).
  Accepting this roadmap approves no pull request: each one below is approved
  separately, with its own plan, review, and decisions.
- Starting point: `main` at `068165d`, the closed vertical spike
  ([report](../spike/report.md), section 10), Q14 closed.
- Authority: `AGENTS.md` and the ADRs in [`docs/adr`](../adr/README.md). This
  document plans; it decides nothing that needs an ADR.

## Goal

Turn the proven vertical path into an engine that the Taskio visual editor can
use: a document that can be authored through typed commands, the same commands
for UI and AI, a document format that survives versions, and a render worker.
Kadrion stays an engine (D01) and owns the schema (D02); no Taskio code enters
this repository.

## What the editor needs first (owner, 2026-09-28)

In product order:

1. adding, removing, and duplicating elements;
2. changing the common visual properties that the schema offers;
3. editing text;
4. choosing or changing the asset of an image, and how it fits its box;
5. changing the order of layers;
6. setting `startUs` and `durationUs`;
7. creating and editing animations and keyframes;
8. applying several changes atomically, undo and redo, and events for the UI;
9. performing the same operations through AI.

Where each priority lands (owner, 2026-09-28). The mapping approves no scope:
PR-19 and PR-21 still need their own plan and decisions.

| Priority                                       | Pull request                                              |
| ---------------------------------------------- | --------------------------------------------------------- |
| 1. add, remove, duplicate                      | PR-19                                                     |
| 2. the other visual properties of schema `0.1` | PR-19 (PR-18 has opacity only)                            |
| 3. text                                        | PR-18                                                     |
| 4. the asset of an image                       | PR-19; its `fit` is a candidate for schema `0.2` in PR-21 |
| 5. layer order                                 | PR-19                                                     |
| 6. `startUs` and `durationUs`                  | PR-21                                                     |
| 7. animations and keyframes                    | PR-20                                                     |
| 8. atomic changes, undo, redo, events          | PR-18                                                     |
| 9. the same through AI                         | PR-24                                                     |

Outside the first scope unless a later decision says otherwise: grouping of
elements, multi-select, several scenes, advanced audio, Canvas/WebGL, and rich
text styles.

## Rules for every pull request of this phase

- The owner approves each pull request before it starts, and again before its
  commit and push.
- No test is skipped and no failed run is repeated without the owner's prior
  consent; no timeout is raised to hide a problem.
- A change of the schema, the runtime, or the DOM renderer changes the runtime
  build and its content hash, so `render.runtime.contentHash` of the golden
  manifest changes, and with it what the Q14 evidence is checked against. Such a
  pull request reopens Q14 by the procedure of
  [docs/ci/first-run.md](../ci/first-run.md) and needs the controlled pinned
  bootstrap of PR-16: regenerate the golden frames in the isolated container,
  stop unless every PNG is byte-identical and only that hash changed (or, for a
  deliberate visual change, stop and present the analysis first), and
  re-measure the parity record in the pinned environment only.
- A change of the Player's dist tree needs a parity record measured again in
  the pinned environment; it does not by itself reopen Q14.
- Changes confined to `editor-sdk`, `ai-sdk`, or documentation touch neither
  the runtime hash, parity, golden frames, nor Q14.

## The pull requests, in order

### PR-18 — Foundation of authoring

- **Goal:** the editor can apply several changes as one, undo them as one, and
  react to every change.
- **Scope:** transactions (one history entry, all or nothing); events or
  subscriptions for every change; a history limit; a registry of commands;
  `SetNodeOpacity`; `SetTextContent`. No schema change, no UI. (Updated by
  PR-18: the failing-undo test that D30.9 deferred moved to PR-19, because no
  command of PR-18 can make an undo fail; PR-18 adds a property test of the
  history instead, D38.7.)
- **Packages and documents:** `@kadrion/editor-sdk`, README. (Updated by
  PR-18: `tests/app` needed no change.)
- **Decisions:** a new ADR extending D30 (transactions, events, registry,
  history limit): D38, accepted on 2026-09-28.
- **Acceptance:** a transaction that fails in the middle leaves the document and
  the history unchanged; undo and redo restore it byte for byte; events are
  deterministic and read no clock; every result is fully validated.
- **Tests:** unit tests of the bus and each command, differential tests against
  hand-edited JSON, mutation tests of every new guard.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames.
- **Not included:** structural commands, schema changes, AI tools, UI.

### PR-19 — Structural commands

- **Goal:** the editor can add, remove, duplicate, and reorder elements.
- **Scope:** `AddNode`, `RemoveNode`, `DuplicateNode`, `ReorderNode`; commands
  for the other visual properties of schema `0.1` and for the asset reference
  of an image (Taskio priorities 2 and 4); a policy
  for node identifiers (stable, unique in the document, never reused within a
  history); exact inverses; checks of every reference (animations, assets);
  the concrete failing-undo test that D30.9 deferred (moved from PR-18, D38.7).
- **Packages and documents:** `@kadrion/editor-sdk`, tests, README.
- **Decisions:** an ADR on node identifiers and structural commands.
- **Acceptance:** the inverse restores the document byte for byte; no command
  leaves a dangling reference; reordering is the only way to change layer
  order.
- **Tests:** unit and differential tests, reference checks, mutation tests.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames.
- **Not included:** new node types, nested groups, multi-select.

### PR-20 — Authoring animations

- **Goal:** the editor can create and edit animations and keyframes in today's
  model.
- **Scope:** create, read, update, and delete animations and keyframes within the
  current model (linear interpolation, the animated properties of schema
  `0.1`); an explicit behaviour for every removal of a keyframe, including one
  that would leave fewer keyframes than the validator allows; every invariant
  of the validator kept.
- **Packages and documents:** `@kadrion/editor-sdk`, tests.
- **Decisions:** an ADR on authoring animations.
- **Acceptance:** exact inverses; no command produces a document that the
  validator refuses.
- **Tests:** unit and differential tests, mutation tests.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames.
- **Not included:** easing, new animated properties (they need the schema).

### PR-21 — Schema `0.2` and migration

- **Goal:** elements have a lifetime on the timeline, and old documents still
  load.
- **Scope:** the migration framework that D35.6 requires with the first schema
  change; `startUs` and `durationUs` as the lifetime of an element; only the
  further fields that the first editor really needs (a candidate: the `fit` of
  an image). No several scenes, no
  Canvas/WebGL, no set of speculative properties.
- **Packages and documents:** `@kadrion/schema`, `@kadrion/runtime`,
  `@kadrion/renderer-dom`, `@kadrion/editor-sdk`, fixtures, D35 and a new ADR.
- **Decisions:** an ADR on schema `0.2` under D35.
- **Acceptance:** fixtures before and after the migration, written first; a
  migration step that is pure and forward only; the reference fixture renders as
  before unless the owner approves a visual change.
- **Tests:** schema, migration, evaluation, and rendering tests; the pinned
  prepare/reference/repeat.
- **Impact:** the runtime hash changes, so Q14 reopens and the controlled
  bootstrap applies; golden frames change only through `goldens:update` in the
  pinned container, with the owner's consent.
- **Not included:** saving and loading old files in a host (PR-22).

### PR-22 — Saving and compatibility

- **Goal:** a host can save a document and load it again in a later version.
- **Scope:** the saved format; negotiating the version; migration on load; a
  corpus of documents of every version that must keep loading.
- **Packages and documents:** `@kadrion/schema`, tests, an ADR.
- **Decisions:** an ADR on the saved format and version negotiation.
- **Acceptance:** every document of the corpus loads and validates; an unknown
  future version is a clear error, never a guess.
- **Tests:** the compatibility corpus and its mutation tests.
- **Impact:** none on the runtime hash unless the schema package changes; then
  as in PR-21.
- **Not included:** storage in Taskio; Taskio stores project versions (D02).

### PR-23 — The integration contract of the Taskio editor

- **Goal:** a host editor drives Kadrion through one facade.
- **Scope:** a facade that joins the document, the command bus, the Player, and
  the asset resolver; synchronisation of changes with the preview (today every
  `load` remounts the page and seeks to 0); an explicit table of events. No
  Taskio code in this repository.
- **Packages and documents:** `@kadrion/player`, `@kadrion/editor-sdk`,
  possibly a new package by D12, README, ADRs (including an amendment of D25 if
  the protocol changes).
- **Decisions:** an ADR on the host integration contract.
- **Acceptance:** an edit reaches the preview without a full reload where the
  contract allows it; the same edit through the facade and through the bus
  gives the same document.
- **Tests:** unit and pinned Player tests; parity.
- **Impact:** the Player's dist tree changes, so the parity record is measured
  again in the pinned environment; if the runtime changes too, as in PR-21.
- **Not included:** a timeline UI, the Taskio application.

### PR-24 — AI tools

- **Goal:** AI performs the same operations as the UI.
- **Scope:** tools generated or derived from the registry of commands, on
  exactly the same bus and with the same semantics as the UI (D09, D31).
- **Packages and documents:** `@kadrion/ai-sdk`, tests, an ADR extending D31.
- **Decisions:** an ADR on the tool catalogue.
- **Acceptance:** every tool equals its command byte for byte; no tool reaches
  the document except through the bus.
- **Tests:** differential tests between tool and command, mutation tests.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames.
- **Not included:** a concrete language model or conversational agent.

### PR-25 — The render worker

- **Goal:** a server renders and exports documents as jobs.
- **Scope:** a job model; cancellation; progress; limits of resources (document
  size, duration, asset sizes, time); logs and metrics; a minimal hosting
  application that carries no rule of the engine.
- **Packages and documents:** `@kadrion/producer`, a new application
  (`apps/worker`), ADRs on jobs and on the security of server rendering.
- **Decisions:** ADRs on the job model and on limits.
- **Acceptance:** a cancelled job stops and leaves no output; every limit is a
  typed error; the Producer keeps `--network none` (D28.9).
- **Tests:** unit tests, pinned export tests.
- **Impact:** a change of the pinned test files or of the workflow reopens Q14;
  otherwise none on the runtime hash.
- **Not included:** a production REST service, a render farm, Taskio queues.

## Later, as design decisions only

Canvas/WebGL (D03), several scenes, audio in the Player and mixing, and the
measurement of D36's Player policy in browsers other than Chromium (D36,
option E) get an ADR when a need appears; nothing here implements them.

## Debts the spike leaves

- **D32:** loading a user's own JSON and showing its errors is checked by hand
  only; no test forbids time arithmetic in the playground; no record of the
  manual Chromium check exists (D32, Verification).
- **D30.9:** the failing-undo test waits for the first structural command
  (PR-19; moved from PR-18 by D38.7).
- **Player:** each `load` remounts the page and seeks to 0; the Player has no
  events and plays no audio (PR-23, later).
- **Producer and export:** no job model or cancellation; FFmpeg runs with
  `-threads 1` (PR-25).
- **Schema:** one scene, no lifetime of elements, no migration framework yet
  (PR-21).
- **Custom HTML:** the Player provides no network isolation in a user's
  browser; only Chromium was measured (D36).
- **CI evidence:** the artifact of a run is downloaded by hand for the Q14
  evidence.
