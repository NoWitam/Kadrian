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
PR-19 and PR-21 still need their own plan and decisions. (Updated by PR-19a:
the owner split PR-19 into PR-19a and PR-19b on 2026-09-29.)

| Priority                                       | Pull request                                             |
| ---------------------------------------------- | -------------------------------------------------------- |
| 1. add, remove, duplicate                      | PR-19a                                                   |
| 2. the other visual properties of schema `0.1` | PR-19b (PR-18 has opacity only)                          |
| 3. text                                        | PR-18                                                    |
| 4. the asset of an image                       | PR-19b; its `fit` needs a schema change, not yet planned |
| 5. layer order                                 | PR-19a                                                   |
| 6. `startUs` and `durationUs`                  | PR-21                                                    |
| 7. animations and keyframes                    | PR-20                                                    |
| 8. atomic changes, undo, redo, events          | PR-18                                                    |
| 9. the same through AI                         | PR-24                                                    |

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
  Amended by PR-21 (D42, the owner on 2026-10-02): a pull request that changes
  the schema version changes three fields of the golden manifest and no other:
  `render.schemaVersion`, `render.compositionHash`, and
  `render.runtime.contentHash`. The bootstrap then stops unless every PNG is
  byte-identical, the manifest differs in exactly those three fields, and each
  of the three equals the value predicted on the host before the run.
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
  history instead, D38.7. Resolved by PR-19a: D39.6.)
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

### PR-19a — Document structure

- Status: split from PR-19 by the owner on 2026-09-29; decisions in D39
  (accepted on 2026-09-29).
- **Goal:** the editor can add, remove, duplicate, and reorder elements.
- **Scope:** `AddNode`, `RemoveNode`, `DuplicateNode`, `ReorderNode`; the node
  identifier policy (the host supplies every ID of an added node and the ID of
  a copy; the other IDs of a copy derive injectively from it; Kadrion
  guarantees uniqueness in the current document and detects every collision,
  and reuse across the history is the host's responsibility); the animations
  and subtrees that removal, duplication, and undo carry; `createdIds` on every
  result; property tests with the structural commands; the failing-undo
  obligation that D30.9 deferred, resolved by D39.6; the PR-18 review nits.
- **Packages and documents:** `@kadrion/editor-sdk`, `tests/app`, README, D39.
- **Acceptance:** the inverse restores the document byte for byte; no command
  leaves a dangling reference; `ReorderNode` is the only command that moves an
  existing node within a list.
- **Tests:** unit and differential tests, reference checks, a property test,
  mutation tests.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames.
- **Not included:** new node types, nested groups, reparenting, multi-select,
  the commands of PR-19b.

### PR-19b — Properties and assets

- Status: planned and approved by the owner on 2026-09-29; decisions in D40
  (accepted on 2026-09-29).
- **Goal:** the editor can change the remaining visual properties of schema
  `0.1` and the assets of images and texts (Taskio priorities 2 and 4).
- **Scope:** `SetNodeScale`, `SetNodeSize`, `SetNodeColor`, `SetTextFontSize`,
  `SetTextFont`, `SetImageAsset`, `AddAsset`, `RemoveAsset`. `SetImageAsset` and
  `SetTextFont` point only at an existing asset of the matching type.
  `RemoveAsset` refuses, atomically, an asset referenced anywhere in the
  document, not only by images; its plan first inventories every asset
  reference of schema `0.1` (D40, Context), and the uses are found by the
  validator rather than by a list of fields (D40.4).
- **Not included:** `fit` of an image (it needs a schema change; PR-21 does
  not include it, and no pull request is planned for it yet).

### PR-20 — Authoring animations

- Status: planned and approved by the owner on 2026-09-30; decisions in D41
  (accepted on 2026-10-01).
- **Goal:** the editor can create and edit animations and keyframes in today's
  model.
- **Scope:** create, read, update, and delete animations and keyframes within the
  current model (linear interpolation, the animated properties of schema
  `0.1`); an explicit behaviour for every removal of a keyframe, including one
  that would leave fewer keyframes than the validator allows; every invariant
  of the validator kept.
- **Packages and documents:** `@kadrion/editor-sdk`, its tests, `tests/repo`,
  README, D41.
- **Decisions:** an ADR on authoring animations.
- **Acceptance:** exact inverses; no command produces a document that the
  validator refuses.
- **Tests:** unit and differential tests, mutation tests.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames.
- **Not included:** easing, new animated properties (they need the schema).

### PR-21 — Schema `0.2` and migration

- Status: planned and approved by the owner on 2026-10-01 and 2026-10-02;
  decisions in D42, accepted by the owner on 2026-10-03. Implemented, and
  measured in the controlled pinned bootstrap of 2026-10-03; run 37151313481
  of its commit supplied the validated CI evidence, and the documentation
  commit that follows it closed Q14 again on 2026-10-03. Its
  scope is the lifetime of a node and the first migration; the `fit` of an
  image is not part of it.
- **Goal:** elements have a lifetime on the timeline, and a document of schema
  `0.1` can be carried forward by an explicit migration that the host calls.
  No entry point loads an old document by itself (D42.9).
- **Scope:** the migration framework that D35.6 requires with the first schema
  change; `startUs` and `durationUs` as the lifetime of an element, and no
  further field. No `fit` of an image, no several scenes, no Canvas/WebGL, no
  set of speculative properties.
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
- **Bootstrap (2026-10-03, locally, in the pinned image):** `goldens:update`
  in the isolated container left the five PNG files byte-identical and changed
  exactly `render.schemaVersion`, `render.compositionHash`, and
  `render.runtime.contentHash`, each to the value predicted on the host. The
  first reference run had `tests/repo/parity-record.test.ts` and
  `tests/repo/q14.test.ts` held aside in the Docker volume only, because both
  read the parity record that this run first had to measure. The second run,
  from a fresh volume with nothing held aside, and its repeat passed in full:
  78 test files in `check`, and 104 pinned tests in seven files in every pass,
  the rows of D42.6 and the Player's clear colour among them. Three earlier
  attempts of the first run stopped at `check`, before any pinned test: one
  because `q14.test.ts` had not been held aside, and two on the 5 s timeout of
  a unit test of the Player while the development machine was under other
  load. Each further attempt had the owner's consent, and no source, test, or
  timeout was changed between them.
- **CI and Q14:** run 37151313481 of the commit `8b2b18e` passed every step
  on a GitHub runner and supplied the validated evidence,
  `docs/ci/q14-evidence.json`. The documentation commit that follows it adds
  that evidence, updates the documents that state the status of Q14, and closed
  Q14 again on 2026-10-03 by the procedure of
  [the first CI run](../ci/first-run.md).
- **Not included:** saving and loading old files in a host (PR-22); the `fit`
  of an image.

### PR-22 — Saving and compatibility

- Status: planned and approved by the owner on 2026-10-04; decisions in D43,
  accepted by the owner on 2026-10-04. Implemented. The saved format
  is the composition as JSON text, without an envelope; the explicit host APIs
  `parseComposition` and `serializeComposition` live behind
  `@kadrion/schema/migrate`; the command bus is unchanged, and a `migrate`
  command of the CLI is deferred.
- **Goal:** a host can save a document and load it again in a later version.
- **Scope:** the saved format; negotiating the version; migration on load; a
  corpus of documents of every version that must keep loading.
- **Packages and documents:** `@kadrion/schema`, tests, an ADR.
- **Decisions:** an ADR on the saved format and version negotiation.
- **Acceptance:** every document of the corpus loads and validates; an unknown
  future version is a clear error, never a guess.
- **Tests:** the compatibility corpus and its mutation tests.
- **Impact:** none on the runtime hash unless the schema package changes; then
  as in PR-21. As implemented, the change stays behind the migration entry of
  the schema and behind a corpus entry of the fixtures. Two kinds of evidence,
  which are not the same: `check` validates compatibility — every corpus
  document loads as its expected one, and the committed parity record is
  current with the runtime artifact and the Player's dist tree of the build;
  that the golden frames, the parity record, the Q14 evidence, and the
  reference composition are unchanged is shown by comparing the SHA-256 of
  their files with the previous commit, not by `check`.
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
- **D30.9:** closed by PR-19a: no natural failure of `bus.undo()` exists, and
  D39.6 states what replaces the concrete test.
- **Player:** each `load` remounts the page and seeks to 0; the Player has no
  events and plays no audio (PR-23, later).
- **Producer and export:** no job model or cancellation; FFmpeg runs with
  `-threads 1` (PR-25).
- **Producer, audio plan:** `audioPlan` in `packages/producer/src/encode.ts`
  adds a clip's `startUs` and `durationUs` before it converts the sum to
  samples, and `samplesAt` throws an untyped `RangeError` for a number that is
  no safe integer; a valid document whose sum exceeds 2^53 − 1 would therefore
  fail the export with an untyped error. Identified by reading the code during
  PR-21, not reproduced at run time; its repair is outside PR-21.
- **Schema:** one scene; no `fit` of an image. (The lifetime of elements and
  the migration framework are PR-21, D42.)
- **Custom HTML:** the Player provides no network isolation in a user's
  browser; only Chromium was measured (D36).
- **CI evidence:** the artifact of a run is downloaded by hand for the Q14
  evidence.
