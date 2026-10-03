# D42 — Schema `0.2`: element lifetime and the first forward migration

- Status: Accepted — by the project owner on 2026-10-03, after the reviews of
  the implementation and the pinned measurements of D42.5 and D42.6, taken
  locally on that day; the decisions are the owner's of 2026-10-01 and
  2026-10-02. The CI run of the commit, run 37151313481, passed on 2026-10-03
  and supplied the validated evidence; the documentation commit that follows it
  closes Q14 again ([the first CI run](../ci/first-run.md))
- Date: 2026-10-03
- Supersedes: —
- Amends: D16 (16.2, 16.5), D18 (new 18.6), D19 (19.4), D22 (22.2, 22.4), D24
  (24.2), D25 (25.2), D35 (35.2–35.5, 35.8), D38 (D38.1), D39 (D39.9), each
  with an `Amended by: PR-21 (D42)` line, and the phase rule of the
  [roadmap of phase two](../roadmap/phase-2.md)
- Related: D02, D04, D13, D15, D17, D21, D23, D28, D33, D34, D36, D40, D41,
  [roadmap of phase two](../roadmap/phase-2.md) PR-21,
  [the first CI run](../ci/first-run.md)

## Context

The editor needs elements that appear and disappear on the timeline (the
owner's priority 6, `startUs` and `durationUs`). Schema `0.1` has no such
field: every node is shown for the whole composition (D16.5). Under D16.1 a new
field is a breaking change, and D35 says how such a change is made: a new
version, one forward migration step, the old schema kept as data, and evidence
before code. D35.6 says that the first schema change builds that framework
together with its own step. This is that change.

What schema `0.1` and the code fix, as read on 2026-10-02:

- Every time of a document is composition time (D16.5); `evaluateComposition`
  takes an integer `0 <= timeUs < durationUs` (D18.1) and never reads `fps`.
- The audio clip already has `startUs` and `durationUs`, and whatever lies past
  the composition's end is cut (D16.5, D29.6).
- The state mirrors the document, node by node, with local values (D19.4,
  D18.5); `renderState` checks IDs, order, and hierarchy and then writes
  `transform` and `opacity` (D22.4).
- The golden manifest carries `render.schemaVersion`, `render.compositionHash`
  (`sha256(canonicalJson(document))`, D28.7), and `render.runtime.contentHash`;
  the Q14 evidence and the parity record are checked against it.
- **No clear colour was a contract.** The render page set only
  `html,body{margin:0;padding:0;overflow:hidden}`, the stage has no background
  (D22.3), and both hosts embed the page in a frame styled `display: block;
border-style: none` (D25.2, D28.1). Pixels no node covers therefore showed
  whatever lay behind the frame: in the Producer's host document nothing, which
  Chromium paints white — read from the code, not measured — and in the Player
  the host's own page.

The project owner decided the points below on 2026-10-01 (the plan) and
2026-10-02 (its addendum).

## Decision

> D42: Schema `0.2` gives every node a required lifetime, `startUs` and `durationUs` in composition time; a node outside its lifetime is evaluated as inactive and rendered hidden, a document of schema `0.1` is carried forward only by an explicit, pure migration that makes every node live for the whole composition, and the render page clears to white.

### D42.1 The fields

- Every node has two more required fields, directly after `type`:
  `startUs`, an integer from 0 to 2^53 − 1, and `durationUs`, an integer from 1
  to 2^53 − 1 (the existing time and duration types, D04). That is every node
  type — `background`, `group`, `image`, `text`, `custom-html` — and every
  child of a group. A duration of zero does not exist.
- A scene gets none: the single scene spans the composition (D16.5). The audio
  clip keeps its `startUs` and `durationUs` unchanged.
- No rule relates the two fields to each other, to `durationUs` of the
  composition, to the frame grid (D13), or to the lifetime of a group: each is
  valid on its own. Their sum need not be a safe integer.
- Image `fit`, easing, further animated properties, and several scenes are not
  part of schema `0.2`.

### D42.2 One time base, and when a node is active

- A lifetime is in composition time, for a child of a group as for any other
  node. There is no parent-relative time.
- A node is **active** at `t` exactly when

  ```text
  t >= startUs  and  t - startUs < durationUs
  ```

  a half-open interval. `t` and `startUs` are non-negative safe integers, so
  the difference is exact.

- **How it is computed is a rule of the implementation, not an observable
  behaviour.** The code forms this subtraction and never the sum
  `startUs + durationUs`, which need not be a safe integer (D42.1). On the
  supported domain — both fields within their bounds and a valid `t` — the
  comparison `t < startUs + durationUs` in double arithmetic gives the same
  verdict for every input: a sum up to 2^53 is exact, and a larger one rounds
  to a number above every valid `t`. A variant of the code that adds is
  therefore equivalent, and no black-box test tells the two apart. The tests
  fix what is observable, which times are active; that the code subtracts is
  kept by review of `isActive` in `packages/runtime/src/evaluate.ts`.

- A lifetime may reach past the composition's end and is cut there, and it may
  begin at or after the end, in which case the node is never active; both follow
  D16.5 and the clip. A lifetime shorter than a frame may fall between two
  frames of the grid and then never be rendered (D13.3).
- The domain of `evaluateComposition` is unchanged (D18.1): every time that was
  valid stays valid.
- **The clocks stay global.** A keyframe's `timeUs` is composition time as
  before (D16.6, D18.2), and a Custom HTML element is pushed composition time as
  before (D23.4). A lifetime neither shifts nor clips an animation. Changing a
  lifetime changes when a node is shown and moves no keyframe.

### D42.3 The state

- Every node state gains `active: boolean`, directly after `type`: for a
  background, for every transformed node, and for every child of a group
  (amends D19.4). `@kadrion/runtime` exports the type of that one field as
  `LifetimeState`, `{ readonly active: boolean }`, which every node state
  type extends.
- `active` is local, like every value of the state (D18.5): a child's `active`
  says whether the child's own lifetime contains `t`, whatever the group's does.
  Whether a node is shown is a matter of rendering (D42.4).
- The transform of an inactive node is evaluated as before; nothing is omitted
  from the state, so the state still mirrors the document.

### D42.4 Rendering

- `renderState` writes, for every node of the state — the background included
  — `visibility: hidden` when the node is inactive and removes the `visibility`
  declaration when it is active, on every call (amends D22.2, D22.4). It never
  writes `visibility: visible`.
- The structure check of D22.4 comes first, for the whole state, the children
  of every group included: a state that fails it throws `state-mismatch` and
  changes no element and no style, a `visibility` no more than a `transform`.
- `visibility` inherits, so an inactive group hides its descendants even where
  their own `active` is true, and an inactive background, a leaf beside the
  other nodes of its scene, hides nothing but itself. Every element is
  absolutely positioned, so hiding one moves nothing.
- A document whose nodes are all active gets exactly the tree it got before:
  no declaration is added to it.
- An inactive node keeps everything else: its assets are still required,
  verified, and decoded, its font is still registered, and a Custom HTML element
  is still mounted, still receives every time, and must still acknowledge it
  (D23.4 unchanged).
- **What a hidden Custom HTML frame must still do.** While the frame of a
  Custom HTML element is hidden, two things must still complete, each within
  the Producer's unchanged timeout: the element acknowledges the pushed time
  (D23.4), and the presentation barrier completes in that frame (D28.5), which
  needs the hidden frame to keep servicing animation frames. And the first
  frame the element is shown on must paint the time of that frame. This was an
  assumption until it was **measured in the pinned environment (D42.6)**: all
  three held in every pinned pass of the bootstrap of 2026-10-03, in Chromium
  153.0.8010.12 of the pinned image. Nothing is known about another browser
  or version; one that stops servicing a hidden cross-origin frame would break
  the barrier. If a later measurement fails, this point needs a new decision;
  no timeout is raised, no barrier is bypassed, and no browser option is
  changed to make it pass.

### D42.5 The clear colour of the render page

- The render page states its background: `html{background-color:#ffffff}`
  beside its existing rule (amends D25.2). The intent is that a pixel no active
  node covers is opaque white in the Player and in the Producer alike.
- The reason for white: it is what the Producer, the reference output, is read
  to produce today. For the Player this is a change the owner approved: such a
  pixel used to show the host's page behind the frame.
- Intent and evidence are kept apart. What the code states is the declaration,
  in the one page both hosts load; a host test pins that text. That the pixels
  are exactly `(255, 255, 255, 255)` is a measurement of D42.6, for the
  Producer and for the Player separately. **Both were measured** in the pinned
  bootstrap of 2026-10-03 and hold there. For the Producer, white is what the
  code was read to produce already; for the Player it is a change of
  behaviour. Outside the pinned environment this ADR claims the declaration
  for both hosts, not the pixels.
- The Producer's white frame alone does not show that the declaration works:
  the Producer's host document states no background, and Chromium's default
  canvas is white, so the frame would most likely be white without it. The
  check that tells the two apart is the Player's, over a host page in magenta:
  there, white can only come from the page's own background.
- What is claimed, and what is not: the five golden frames of the reference
  composition must stay byte-identical, because its background covers the
  canvas. That any other document keeps its pixels is **not** claimed; it would
  need evidence this pull request does not have.
- The declaration lives on the page, outside the root of D22, so the mounted
  tree of D22.3 is unchanged.

### D42.6 What is measured in the pinned environment

These are rows of the pinned suites. They ran in the controlled bootstrap of
2026-10-03, after the owner's approval: locally, in the pinned image of D26.2
(`linux/amd64`, Chromium 153.0.8010.12, without a network), in the first
reference run and in the full second run with its repeat. That is five complete
passes of the pinned suite, 104 tests in seven files each, and every row below
passed in each of them. It is a local measurement in one environment, not the
CI evidence of Q14: that is the run of the commit on a GitHub runner, in which
the same rows passed. None of the rows writes a report file: the list of files
of the CI artifact is unchanged.

In `tests/pinned/producer.pinned.test.ts`:

- an inactive background beside active nodes, in a scene whose title has a
  colour that shows on white: the frame equals the frame of the same document
  without the background; a band of the canvas that no node covers is opaque
  white in every pixel, and is the background's colour when the background is
  shown; the Custom HTML element, which stays shown, draws the bar of its
  time, the boxes of the image and the title are not white, and hiding the
  group, the image, the caption, or the title as well changes the frame;
- an inactive group with active children: equal to the document without the
  group; an active group with an inactive child: equal to the document without
  the child;
- the boundaries of the interval. The Producer renders times of the frame grid
  only, so the rendered time `T` stays fixed and the lifetime is placed around
  it, which makes `T` each of `startUs − 1`, `startUs`,
  `startUs + durationUs − 1`, and `startUs + durationUs` in turn: outside, the
  frame equals the document without the node; inside, the node always active.
  **Which layer proves what:** the arithmetic of every microsecond is proven by
  the runtime tests (`packages/runtime/test/lifetime.test.ts`), on the state;
  these rows prove that the renderer shows and hides by that state, at one
  sampled time per boundary;
- nothing active, in a document without a Custom HTML element: every pixel is
  `(255, 255, 255, 255)`. By itself this does not tell the declaration from
  Chromium's default canvas (D42.5);
- a Custom HTML element with time-dependent content, rendered outside and then
  inside its lifetime in one page, the other way round, and in and out: each
  frame equals a fresh render of that time alone. These three rows are the only
  ones that hide a Custom HTML frame, and they carry the whole
  requirement of D42.4: the acknowledgement and the presentation barrier both
  complete while the frame is hidden, with the Producer's normal timeouts;
- a migrated reference composition of `0.1`: its frames equal the frames of the
  reference composition, and its `compositionHash` is the same;
- each differential row also checks its premise, that the two documents it
  compares do render differently where the node is shown.

In `tests/pinned/player.pinned.test.ts`:

- the clear colour in the Player (D42.5): a document with no active node and
  no Custom HTML element, in the real Player over a host page in magenta, is
  opaque white in every pixel; the premise is that the host's colour shows once
  the page's background is overridden. This is the check that attributes the
  white to the declaration.

### D42.7 The migration step `0.1 → 0.2`

- The step sets `schemaVersion` to `0.2` and gives every node and every child of
  a group `startUs: 0` and `durationUs` equal to the composition's `durationUs`,
  inserted directly after `type`. Every other key and its order, every array and
  its order, every ID, and every value — a `-0` included — stay as they are.
- With these values every node is active at every valid time, so the state is
  the state of `0.1` plus `active: true`, and the mounted and rendered tree is
  the tree of `0.1`. The page around that tree has a stated background since
  this ADR, so what is claimed for the pixels is what D42.5 claims and no more.
- A consequence the host must know: lengthening the composition afterwards does
  not lengthen these lifetimes; they are ordinary values from then on.
- The step is pure, total over valid `0.1` documents, and deterministic. It
  never writes its input, and its result shares no object with it.

### D42.8 `migrateComposition`

It is exported from `@kadrion/schema/migrate`, an entry point of its own, so
that the historical schema and the step are outside what the render page
imports and outside the runtime artifact (D21); a test checks the artifact.

```ts
type SchemaVersion = '0.1' | '0.2';
type MigrationResult =
  | {
      readonly ok: true;
      readonly composition: ValidatedComposition;
      readonly versions: readonly SchemaVersion[];
    }
  | {
      readonly ok: false;
      readonly version: SchemaVersion | null;
      readonly versions: readonly SchemaVersion[];
      readonly errors: readonly ValidationError[];
    };
function migrateComposition(input: unknown): MigrationResult;
```

| Input                                                | Result                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| a valid `0.1` document                               | `ok`, `versions: ['0.1', '0.2']`                                                      |
| a valid `0.2` document                               | `ok`, `versions: ['0.2']`                                                             |
| a document that is invalid under its own version     | `version` and `versions` of that one version, its validation errors                   |
| a step's result that fails the validation of `0.2`   | `version: '0.2'`, `versions: ['0.1', '0.2']`, the validation errors                   |
| no own `schemaVersion`, not a string, or not a known | `version: null`, `versions: []`, one `unsupported-schema-version` at `/schemaVersion` |

- The order is that of D35.3: the input is validated under its own version —
  the frozen schema of that version and its semantic rules — then the steps run,
  then the result is validated in full by `validateComposition`, always, also
  when the input was current already.
- **Between two steps.** A step accepts only a valid document of its own
  version (D35.2), so the output of a step is validated as a document of the
  version it reaches before another step reads it; a failure there is the
  failure of the table above, with that version as `version` and the versions
  reached so far as `versions`. The last version is judged by the full
  validation alone. With the two versions of today there is no intermediate
  one, so this is exercised through the internal step table in the tests, and
  no further public version exists for it.
- The version is the input's own `schemaVersion`, read only when it is an own
  property and a string, and then searched for among the entries of the step
  table by equality; no object is indexed by it. So `"constructor"`,
  `"__proto__"`, `"0.3"`, `""`, the number `0.1`, a missing field, and a value
  that is no object all give the last row. `validateComposition` reports a
  missing `schemaVersion` as a structural error; `migrateComposition` cannot,
  because without a version there is no schema to validate against.
- **No exceptions, for passive data.** The input boundary is that of
  `validateComposition`: plain objects, arrays, and primitives, read through
  data properties. Within it every outcome is a result, a malformed document
  included, and nothing throws. An accessor or a Proxy that throws, or that
  answers differently each time it is read, is outside the guarantee; a test
  pins that boundary for both functions. No sanitising layer is added for it.
- **Ownership.** `migrateComposition` never writes or freezes its input. The
  composition it returns is a new tree that shares no object with the input, on
  both successful paths. It is not frozen and belongs to the caller alone, as
  the result of `validateComposition` does. The result object and its
  `versions` and `errors` arrays are frozen.
- The validation of `0.1` never yields a `ValidatedComposition`: only a document
  of the current version carries the brand (D19.2).

### D42.9 Public entry points

- `validateComposition` validates schema `0.2` and nothing else; a `0.1`
  document gets `unsupported-schema-version` (D17, D35.3).
- The Player, the Producer, the CLI, the render page, `createCommandBus`, and
  `applyCommand` call `validateComposition` and therefore require a `0.2`
  document. None of them migrates. A host that holds historical documents
  calls `migrateComposition` first and stores the result as a new version (D02,
  D35.3). Nothing loads a legacy document automatically.
- The refusal has two layers at the editor bus, and neither is new. The
  validator's verdict is one error, `unsupported-schema-version` at
  `/schemaVersion`. The bus reports any document it cannot accept as an
  `EditorError` with the code `invalid-document` (D30), and carries that
  verdict, with its path, in the error's details. This ADR adds no error code
  and changes none: a host that wants to tell an old document from a broken
  one reads the details, or calls `migrateComposition`, whose result names the
  version.
- The playground's showcases are `0.2` documents; a `0.1` document a user loads
  there is refused like any other invalid document.

### D42.10 `SetNodeLifetime`

`SetNodeLifetime { nodeId, startUs, durationUs }` sets both fields of one node.
`COMMAND_TYPES` continues with it after `MoveKeyframe`.

- **Arguments.** A closed object; all three fields are required. `startUs` and
  `durationUs` are safe integers within the bounds the schema states for a
  node's two fields, read from `compositionSchema` over every node shape, which
  must agree (D41.4's manner). A fraction, a value out of the bounds, or another
  type is `invalid-argument`; nothing is rounded; a `-0` `startUs` becomes 0. No
  rule concerns the sum.
- **Order of checks.** The fields (`invalid-argument`), the node
  (`unknown-node`, also for the ID of the scene, an animation, an asset, or a
  clip), then — unless neither value changes — the full validation.
  `unsupported-node` cannot occur, because every node of schema `0.2` has both
  fields, and `invalid-result` cannot occur, because values within the bounds
  cannot break the schema; the validation still runs (D30.6).
- **No-op.** Both values equal after normalisation: no change, no history, no
  event (D38.9).
- **Inverse.** The same command with the previous two values, parsed and frozen.
- **What it changes.** The two fields of that node and nothing else: the node's
  other keys keep their places and their values their identity, `children` and
  `animations` included. It creates no ID. It moves no keyframe: an animation
  keeps its composition times (D42.2). This ADR does not promise that a sequence
  of `MoveKeyframe` commands can always retime a whole animation: a time on the
  way may be taken (D41.2).
- It applies to a background and to a child of a group like to any node; for a
  child, whether it is shown is still the intersection with its group (D42.4).

### D42.11 What this ADR does not decide

Image `fit`; a neutral name for the public `NodeData` type; a playground
showcase of lifetimes; saving and loading historical files in a host (PR-22);
and the repair of `audioPlan` in the Producer, which adds a clip's `startUs` and
`durationUs` and so can leave the safe-integer range for a valid document — a
debt recorded in the roadmap, found by reading the code.

## Alternatives considered

- **A node-local animation clock** — an animation would move with its node, but
  an existing field would change its meaning (D35.1), D16.5 would get a second
  time base, and a group's children would need a rule for nesting.
- **`display: none`** — it removes the box, fights the `display: block` that the
  mount writes on images, and may stop a frame's document.
- **Leaving an inactive node out of the state** — the state would no longer
  mirror the document (D19.4), and the structure check of D22.4 would lose its
  meaning.
- **No lifetime for the background** — one node type could not be timed, and
  `SetNodeLifetime` would need `unsupported-node`.
- **A maximal default duration** — "for ever" is not a value a timeline shows;
  the composition's own duration is.
- **Migrating inside `validateComposition` or in the hosts** — rejected by
  D35.3 already.
- **Keeping the frozen schema in the main entry point** — it would become part
  of the runtime artifact, and every later change of a migration would change
  the runtime hash and reopen Q14.
- **A black clear colour** — the convention of video, but a visible change for
  every document that leaves pixels uncovered in the Producer.

## Consequences

- `@kadrion/schema`, `@kadrion/runtime`, and `@kadrion/renderer-dom` change, so
  the runtime build and its hash change, the Player's dist tree changes, and Q14
  reopens in the commit of this pull request (roadmap, phase rule).
- The golden manifest changes in exactly three fields — `render.schemaVersion`,
  `render.compositionHash`, and `render.runtime.contentHash` — and in no frame:
  the five PNG files must stay byte-identical. The parity record is measured
  again in the pinned environment.
- Every document of schema `0.1` needs `migrateComposition` before any entry
  point accepts it.
- `@kadrion/editor-sdk` gains one command and still depends on
  `@kadrion/schema` only.

## Verification

- The evidence of D35.5: the hash of schema `0.1` as
  `JSON.stringify(compositionSchema)` of the last build of `0.1`; the frozen
  reference composition of `0.1` and its frozen negative corpus, byte for byte,
  whose canonical hash is the `compositionHash` the golden manifest held; a
  hand-written pair of small documents; the reference composition of `0.2`; and
  a lifetime fixture with hand-derived activity and shown nodes at its
  boundaries. No expected document is produced by the step under test.
- **What establishes what.** The repository establishes the contents: the
  frozen files, and tests that pin the hash of the frozen schema and compare
  the frozen documents. It does not establish an order of writing, and a hash
  proves no chronology. That the fixtures were written, and their SHA-256
  values recorded, before the implementation is a statement of the working
  record of PR-21, reported to the owner with the full values; no commit was
  made after the fact to make it look otherwise.
- `packages/schema/test/migrate.test.ts`: the step on both pairs, compared as
  JSON text with the order of the keys; the lifetime directly after `type`; IDs
  and their places; no shared object at any depth, and an input that is neither
  written nor frozen in any of its objects; `-0` kept on both paths; a current
  document returned as a detached copy; the frozen result, on every path, and
  the unfrozen composition; the frozen negative corpus of `0.1` and the corpus
  of `0.2`, each refused under its own version; a `0.1` document that carries a
  field of `0.2`; the version lookup, names of `Object.prototype` included;
  malformed passive data answered with a result, and the boundary at an
  accessor that throws; and, through the internal step table, a step whose
  result does not validate, an intermediate document that is validated under
  its own version before the next step, a target validation that runs for a
  current document too, and the order of the steps.
- `packages/schema/test/historical-schema.test.ts`: the hash of the frozen
  schema, its deep freeze (D24.2), its keyword subset, and its agreement with a
  reference implementation of JSON Schema on the frozen corpus (D17.4).
- `packages/runtime/test/lifetime.test.ts`: the lifetime fixture at every
  boundary, to the microsecond; the half-open interval; lifetimes near
  2^53 − 1, valid although their sum is no safe integer, with the activity the
  interval gives (they do not tell a subtraction from a sum, D42.2); local
  `active`; an inactive node evaluated on composition time; a migrated
  reference composition evaluated to the hand-derived states.
- `packages/renderer-dom/test/lifetime.test.ts`: `visibility: hidden` on
  exactly the inactive nodes and what CSS inheritance then shows; an inactive
  background hidden alone; `visible` never written; no memory across orders; no
  declaration in a tree whose nodes are all active; nothing written on a
  mismatch, also when the mismatch is a child of a group that comes after nodes
  whose `visibility` would change; an inactive Custom HTML element that still
  receives and must acknowledge the time. `render-page.test.ts` pins the page with its
  background, and `runtime-build.test.ts` shows that the artifact holds the
  current schema and neither the schema of `0.1` nor a migration.
- `tests/repo/migration-entry.test.ts`: the main entry of `@kadrion/schema`
  reaches no historical schema and no step, by a static or a dynamic import;
  the migration entry does; and no package or application source imports the
  migration entry.
- `packages/editor-sdk/test/lifetime.test.ts`,
  `lifetime-arguments-schema.test.ts`, and `lifetime-bounds.test.ts`: the
  contract of D42.10 for every node type, the argument schema against the
  parser, the bounds read from every node shape of the schema, and the parser
  loaded against a schema module with other bounds. `history-property.test.ts`
  has `SetNodeLifetime` in its model and a seeded run focused on it, which
  counts for this command alone a real change, a no-op, and each of its two
  reachable errors; the seeds, the premises, and the coverage of the earlier
  commands are unchanged. `bus.test.ts`: the bus refuses a complete, valid
  document of `0.1` with `invalid-document`, whose one detail is the
  validator's `unsupported-schema-version` at `/schemaVersion`, and accepts
  the same document once it is migrated explicitly.
- `tests/repo/readme-example.test.ts`: the README's example, a `0.2` document,
  runs with `SetNodeLifetime` as its last call.
- `tests/pinned/producer.pinned.test.ts` and
  `tests/pinned/player.pinned.test.ts`: the rows of D42.6. They are written in
  this pull request and ran in the controlled bootstrap of 2026-10-03, in the
  pinned environment, after the owner's approval. In that bootstrap the five
  golden PNG files stayed byte-identical, the golden manifest changed in exactly
  the three fields of the Consequences, each to the value predicted on the
  host, and the parity record was measured again (D33.6): zero differing pixels
  at every golden timestamp.
