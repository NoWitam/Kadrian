# D41 — Authoring animations and keyframes

- Status: Accepted — by the project owner on 2026-10-01, after the reviews of
  the implementation; the decisions are the owner's of 2026-09-30
- Date: 2026-09-30
- Supersedes: —
- Amends: D30 (D30.8), D38 (D38.1), D39 (D39.4, D39.9), each with an
  `Amended by: PR-20 (D41)` line
- Related: D04, D15, D16, D18, D19, D30, D31, D38, D39, D40,
  [roadmap of phase two](../roadmap/phase-2.md) PR-20

## Context

The editor can add, remove, duplicate, and reorder nodes (D39) and edit their
properties (D38, D40), but it cannot change an animation of a node that exists.
PR-20 adds that, within today's model: no easing, no new animated property, no
change of the schema.

**What schema `0.1` fixes.**

- Every node but a background has a required `animations` array; a group's
  image and text children have their own (D16.4). There is no scene-level list,
  and an animation has no field that names a node: its node is the one that
  holds it.
- An animation is `{ id, property, interpolation, keyframes }`. `property` is
  `opacity`, `position`, or `scale`; the validator selects the animation's shape
  by it. `interpolation` is `linear`, the only value (Q11).
- An animation's `id` shares the one namespace of D16.3. **A keyframe has no
  ID**: it is `{ timeUs, value }`.
- An animation has at least two keyframes (`minItems`), with strictly ascending
  `timeUs` (`keyframes-not-ascending`), so no two keyframes share a time. A time
  is an integer from 0 to 2^53 − 1. It may lie at or after `durationUs`: nothing
  from there on is sampled (D16.5).
- A value is an opacity factor from 0 to 1, a position offset `{ x, y }` of
  integers within ±1 000 000, or a scale factor `{ x, y }` from 0 to 1000 (D16.6,
  D18.4).
- A node animates each property at most once (`duplicate-animation-target`).

The project owner decided on 2026-09-30: a removal that would leave too few
keyframes is refused; command times are integers, never rounded; reading stays
`getDocument()`; six new codes; and the eight commands below with their
defaults.

## Decision

> D41: The bus adds and removes whole animations and inserts, updates, removes, and moves keyframes addressed by their time; typed commands normalise a keyframe's value as its property requires, exact-data commands keep a snapshot byte for byte, and a keyframe removal that would leave too few keyframes is refused.

### D41.1 The commands

| Command               | Arguments                                |
| --------------------- | ---------------------------------------- |
| `AddAnimation`        | `nodeId`, `index`, `animation`           |
| `RemoveAnimation`     | `animationId`                            |
| `SetOpacityKeyframe`  | `animationId`, `timeUs`, `opacity`       |
| `SetPositionKeyframe` | `animationId`, `timeUs`, `offset {x, y}` |
| `SetScaleKeyframe`    | `animationId`, `timeUs`, `factor {x, y}` |
| `AddKeyframe`         | `animationId`, `keyframe`                |
| `RemoveKeyframe`      | `animationId`, `timeUs`                  |
| `MoveKeyframe`        | `animationId`, `timeUs`, `toTimeUs`      |

- `AddAnimation` inserts a complete animation into a node's `animations` at
  `index`, from 0 to the length (required, as in D39.2 and D40.3). The host
  supplies its ID. Its inverse is `RemoveAnimation`.
- `RemoveAnimation` removes one animation. Its inverse is `AddAnimation` with a
  frozen copy of the animation at its node and index.
- `SetOpacityKeyframe`, `SetPositionKeyframe`, and `SetScaleKeyframe` set the
  value of the keyframe at `timeUs`, inserting one when none is there. Each
  applies to an animation of its own property only. The inverse of an insertion
  is `RemoveKeyframe`; the inverse of a replacement is the same command with the
  previous value.
- `AddKeyframe` inserts a keyframe given as exact data at the place its time
  gives it. It is the exact restore path of `RemoveKeyframe`, and a host may use
  it. Its inverse is `RemoveKeyframe`.
- **The value argument has the name of what it is, and no two commands share
  one.** `SetOpacityKeyframe` takes `opacity`, a factor; `SetPositionKeyframe`
  takes `offset: { x, y }`, added to the node's base position;
  `SetScaleKeyframe` takes `factor: { x, y }`, multiplied with the node's base
  scale (D18.4). None of the three has an argument called `value`. `value` is
  the field of a keyframe in the document, and only `AddKeyframe` carries it,
  inside the exact keyframe object `{ timeUs, value }` it is given. The owner
  approved these names with the plan and confirmed them on 2026-10-01.
- `RemoveKeyframe` removes the keyframe at `timeUs`. Its inverse is
  `AddKeyframe` with a frozen copy of the keyframe.
- `MoveKeyframe` gives the keyframe at `timeUs` the time `toTimeUs`. Its inverse
  is `MoveKeyframe` back.
- The ID of an animation is never edited; changing an animation's property is
  `RemoveAnimation` and `AddAnimation` in one transaction. `interpolation` has
  one value and no command. Every command is validated in full afterwards (D30.6,
  D38.5), and every inverse is a public command, parsed and frozen (D39.5).
- `COMMAND_TYPES` continues, after `RemoveAsset`, with the eight commands in the
  order of the table.

### D41.2 Addressing, time, and order

- A keyframe is addressed by `(animationId, timeUs)`: the times of an animation
  ascend strictly, so a time names at most one keyframe, and it stays the same
  when another keyframe is inserted or removed.
- Every time a command takes — `timeUs`, `toTimeUs`, and the `timeUs` of an
  `AddKeyframe` — is a safe integer within the bounds of the schema's keyframe
  time, read from `compositionSchema`. A fraction, a number out of the bounds, or
  anything else is `invalid-argument`; nothing is rounded. -0 becomes 0. A time
  may lie at or after `durationUs` (D16.5) and is not snapped to the frame grid
  (D13).
- The keyframes of an animation stay in the order of their times: an insertion
  and a move place the keyframe before the first keyframe with a later time.
  Their order is derived from their times, which is what lets every inverse
  restore the exact array.
- An animation is looked up in the `animations` of the nodes only — those of the
  scene and of the groups' children. Any other ID, a node's included, is
  `unknown-animation`.

### D41.3 Values and payloads

- **Typed values are normalised by the parser** (D30.3), as the command of the
  same field does: an opacity is a finite number from 0 to 1 (D38.2), a factor a
  finite number from 0 to 1000 (D40.1), both never rounded; an offset is a finite
  number rounded to an integer, halves towards +∞ (D15, D30.3). -0 becomes 0.
  The range of an offset is the document's: a rounded offset outside it is
  `invalid-result`. A no-op is compared after the normalisation (D38.9).
- **Exact-data payloads keep every field until the validation.** `AddAnimation`'s
  `animation` and `AddKeyframe`'s `keyframe` are copied as data (D39.5): every
  field, known or not, and every value, as given — an unknown field is refused by
  the validation as `invalid-result`, never dropped. Only the address is read
  before: `AddKeyframe` needs its `timeUs` to place the keyframe, so the parser
  checks that time as in D41.2 and normalises -0 to 0; `AddAnimation` reads the
  animation's `id` and `property` only where they are strings, and leaves every
  other malformation to the validation, as `AddNode` does (D39.3).
- **Key order survives, inside the keyframe and inside its value.** A command
  that parses an offset or a factor produces `{ x, y }`, but a replacement never
  writes that object: it spreads the keyframe the document holds and, for an
  object value, spreads that value and assigns `x` and `y` to it, so a stored
  `{ y, x }` stays `{ y, x }`. The inverse of a replacement is applied the same
  way, to the value the replacement left, whose order is the stored one; so undo
  gives the same bytes. A new keyframe is written as `{ timeUs, value }` with a
  value `{ x, y }` (D16.1: a command that creates data writes its defaults). The
  inverse of a removal is `AddKeyframe` with the exact keyframe, whatever its
  order. A moved keyframe is a new object with its keys in their order; its value
  keeps its identity.
- The -0 of a document built in JavaScript is not claimed to survive an undo:
  JSON writes it as 0 (D39.5).

### D41.4 Removing below the minimum

- `RemoveKeyframe` is refused with `too-few-keyframes` when the animation would
  keep fewer keyframes than the schema's minimum. The document, the history, and
  the listeners stay as they were (D38.8, D38.9). Removing the whole animation
  takes an explicit `RemoveAnimation`.
- The minimum is read from `compositionSchema`: the `minItems` of the keyframes
  of the animation's property. It is not written out in `editor-sdk`.
- Neither the minimum nor the bounds of a time (D41.2) is asked by the type of
  the node that holds the animation, so both are read from the animation shapes of
  the scene's nodes and of a group's children alike:
  - the **minimum** from the shapes of the property asked for, and from no other
    shape. It is read when a `RemoveKeyframe` needs it. A shape of that property
    that states no `minItems`, or two that state different ones, are an error;
  - the **bounds** from the shapes of every property. They are read once, when
    `editor-sdk` loads. A shape that states no minimum or no maximum, or two
    that state different bounds, are an error.
- That error is an ordinary `Error`, thrown as it is, and not an `EditorError`:
  it says that the schema's metadata is missing, malformed, or of a form this
  build does not support, not that a command failed, so it has no code of D30.8.
  With schema `0.1` it cannot occur: every shape states its minimum and its
  bounds, all agree, and the minimum is asked only for the property of an
  animation of a `ValidatedComposition`.
- **Insert before remove.** A transaction is validated after every command
  (D38.5), so a sequence that deletes and inserts keyframes and would pass through
  fewer than the minimum must insert first: to replace both keyframes of a
  two-keyframe animation, add the new ones and then remove the old ones. The other
  order is refused at its first removal, atomically. A replacement of a value at
  the same time, and a valid `MoveKeyframe`, keep the number of keyframes and
  have no such requirement.

### D41.5 Errors

`EditorError` keeps its shape: a `code`, a message, and `details`, a list of
strings. The new codes, and what their `details` hold:

| Code                          | Meaning                                                         | `details`                                |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| `unknown-animation`           | No animation of the document has that ID                        | empty                                    |
| `unknown-keyframe`            | The animation has no keyframe at that time                      | empty                                    |
| `keyframe-exists`             | The animation already has a keyframe at the time to fill        | empty                                    |
| `too-few-keyframes`           | The removal would leave fewer keyframes than the schema allows  | the animation's ID                       |
| `animation-property-mismatch` | A typed keyframe command names an animation of another property | empty                                    |
| `duplicate-animation-target`  | The node already animates the property of the added animation   | the ID of the animation that animates it |

`id-in-use` keeps its details, the colliding IDs, each once, sorted (D39.3);
every other existing code keeps its. `duplicate-animation-target` is also a code
of the validator, with the same meaning, in a different vocabulary (D40.6).

### D41.6 The order of checks

The first failure decides the code (D39.8, D40.5):

- `AddAnimation`: the fields (`invalid-argument`), the node (`unknown-node`,
  then `unsupported-node` for a node without `animations`), the index
  (`index-out-of-range`), the ID (`id-in-use`), the property
  (`duplicate-animation-target`), and the full validation (`invalid-result`).
  Its `nodeId` names a node: the ID of the scene, an animation, an asset, or a
  clip is `unknown-node` (D39.8), since the scene holds nodes and no animations
  of its own.
- `RemoveAnimation`: the fields, the animation (`unknown-animation`), and the
  full validation.
- `Set…Keyframe`: the fields, the animation (`unknown-animation`), its property
  (`animation-property-mismatch`), then — unless the value does not change — the
  full validation.
- `AddKeyframe`: the fields, the animation, the time (`keyframe-exists`), and the
  full validation.
- `RemoveKeyframe`: the fields, the animation, the keyframe (`unknown-keyframe`),
  the minimum (`too-few-keyframes`), and the full validation.
- `MoveKeyframe`: the fields, the animation, the keyframe (`unknown-keyframe`),
  then — unless the time does not change — the target time (`keyframe-exists`)
  and the full validation.
- A transaction parses every command before it applies any (D38.4).

Every pair of failures that can hold at once is tested in this order, the fields
against each later check included. The pairs that cannot hold at once, and are
therefore not tested:

- **`AddAnimation`.** `unknown-node` with `unsupported-node` or with
  `duplicate-animation-target`, and `unsupported-node` with
  `duplicate-animation-target`: a node that is missing, or has no `animations`,
  animates no property.
- **Every command that names an animation.** `unknown-animation` with
  `animation-property-mismatch`, `unknown-keyframe`, `keyframe-exists`,
  `too-few-keyframes`, or a no-op: each needs the animation to exist.
- **`Set…Keyframe` and `MoveKeyframe`.** A no-op with `invalid-result`: a no-op
  returns before the validation, and the value it keeps validated already.
- **`RemoveAnimation`.** `invalid-result` with anything: nothing in a document
  refers to an animation, so a document without one of its animations stays
  valid, and the validation cannot fail.
- **`RemoveKeyframe`.** `invalid-result` with anything, `too-few-keyframes`
  included: the minimum is checked first, and above it the remaining keyframes
  keep their order and their values, so the validation cannot fail.
- **`MoveKeyframe`.** A no-op with `keyframe-exists` (the occupied time is then
  the keyframe's own), and `invalid-result` with anything: a time within the
  bounds that no other keyframe has leaves the times strictly ascending once the
  keyframe is placed, so the validation cannot fail.

For the three commands whose validation cannot fail, the full validation still
runs (D30.6); the property test's model predicts no `invalid-result` for them,
and the bus agrees on every seeded sequence.

### D41.7 IDs and reading

- `AddAnimation` creates its animation's ID (`createdIds`), and `RemoveAnimation`
  removes it, for the net rule of D39.4. Keyframes have no IDs: the keyframe
  commands create none.
- Reading is unchanged: a host reads animations from `getDocument()`, typed by
  `NodeAnimation` of `@kadrion/schema`. PR-20 adds no query function.

### D41.8 Inverses, the history, and a diverged document

Two situations are kept apart, as D39.6 keeps them. This ADR changes neither the
history nor D39.6, and claims no more than it does.

**Undo and redo through the bus.** D39.6 holds with the commands of this ADR: the
history is linear and owned by the bus, every inverse was read from the document
its operation was applied to (D39.5), and it is undone on exactly the document
that operation produced. Each inverse of D41.1 takes that document back to the
one before it, which was valid:

- the `RemoveKeyframe` that undoes an insertion leaves the number of keyframes
  the earlier document had, which was at least the minimum;
- the `AddKeyframe` that undoes a removal, and the `MoveKeyframe` back, fill the
  time the operation freed;
- the `AddAnimation` that undoes a removal finds its node, its index, its ID,
  and its property as the removal left them free;
- a typed command with the previous value finds the keyframe it replaces.

So no sequence of dispatches, transactions, undos, and redos makes an undo or a
redo of these commands fail, `too-few-keyframes` and `keyframe-exists`
included. The premise is that the minimum and the bounds the bus enforces are
the validator's own, which holds because both are read from the one
`compositionSchema` (D41.2, D41.4); the tests that hand the SDK other metadata
than the validator has (Verification) step outside it on purpose. The property
test of D39.6 point 1 covers the new commands.

**An inverse applied directly to a diverged document.** A stateless host may
apply an old inverse with `applyCommand` to a document that changed since. The
inverse is then an ordinary command, judged against the document it is given
(D41.6), and whatever it does is atomic: the input stays as it was.

- The inverses that are `AddAnimation`, `RemoveAnimation`, `AddKeyframe`,
  `RemoveKeyframe`, and `MoveKeyframe` fail atomically on the divergences that
  contradict them — the animation gone, or its ID in use again; its node gone;
  its property taken; its index past the list; the keyframe gone; its time taken
  again; too few keyframes left — in the manner of D39.6 point 2.
- **The inverse of a value replacement is an upsert, and it does not fail when
  its keyframe is gone.** It is the same typed command with the previous value
  (D41.1). Applied to a document in which that keyframe was removed since, it
  inserts a keyframe at that time with the previous value; applied to a document
  that already holds that value there, it changes nothing. It fails only as any
  typed command does: for a missing animation or one of another property. D39.6
  point 2 states the atomic failure for the divergences it lists; it does not
  say that every inverse fails on every diverged document, and this one does
  not. A host that needs a failure there checks the keyframe itself.

### D41.9 What this ADR does not decide

Easing and other interpolations, new animated properties, and the timing of
elements (PR-21); AI tools for these commands (PR-24); any change to the
playground, the runtime, the renderer, the Player, or the Producer.

## Alternatives considered

- **Removing the animation with its last removable keyframe** — the command
  would do more than its name, its inverse would depend on the document, and it
  would contradict D40.4, where a use is refused rather than cascaded.
- **Leaving a removal below the minimum to the validation** — an expected
  situation would get no code of its own (D40.6).
- **Addressing keyframes by index** — an index shifts when another keyframe is
  inserted, and the inverses of the upserts would break with it.
- **One generic `SetKeyframe`** — the parser has no document, so it could not
  normalise a value whose property only the animation knows (D30.3), and its
  argument schema could not describe the value.
- **Replacing an occupied time on a move** — its inverse would need two
  commands, and an inverse is one command (D30.4).
- **Rounding command times** — a time is an exact integer (D04); an index is not
  rounded either (D39.2).

## Consequences

- `@kadrion/editor-sdk` gains eight commands, eight argument schemas, and six
  error codes, and still depends on `@kadrion/schema` only.
- The schema, the runtime, the renderer, the Player, the Producer, the
  playground, the golden frames, the parity record, and the Q14 evidence are
  unchanged.

## Verification

- `packages/editor-sdk/test/animations.test.ts` and `keyframes.test.ts`: the
  commands on top-level animations and on animations of group children — the
  fixture's scale animation, and an opacity and a position animation added to
  group children for these tests, each replaced, inserted, moved, and removed
  with its inverse; placement by time; byte-for-byte undo on a document whose
  keyframes are `{ value, timeUs }` and whose values are `{ y, x }`; every
  feasible pair of failures in the order of D41.6; the scene's ID refused as
  `unknown-node` with the document, the history, and the listeners unchanged;
  no-ops after normalisation; payloads kept until the validation; the host's
  objects neither frozen nor reachable; object identity; insert-before-remove in
  both orders; inverses on a diverged document, the upsert that reinserts
  included (D41.8); the error contract of D41.5.
- `packages/editor-sdk/test/animation-arguments-schema.test.ts`: the argument
  schemas against the parsers (D31.9).
- `packages/editor-sdk/test/schema-coverage.test.ts`: the minimum and the time
  bounds read from `compositionSchema`; the refusal exactly at the schema's
  minimum; the node types that take an animation; and, through the internal
  functions of `animations.ts` given other metadata, that they return what the
  metadata states rather than a number of their own, read the shapes of group
  children too, and refuse a shape that states no minimum, no lower bound, or no
  upper bound, and shapes that disagree.
- `packages/editor-sdk/test/keyframe-time-bounds.test.ts`: the seam of the time
  bounds at the parsers. With metadata that states times from 5 to 20 000 000,
  every time-bearing argument — `timeUs` of the three typed commands and of
  `RemoveKeyframe`, the `timeUs` of an `AddKeyframe`'s keyframe, and both times
  of `MoveKeyframe` — refuses a safe integer above that maximum and a
  non-negative one below that minimum, and the argument schemas state the same
  bounds. The mock is set up for one block and taken down after it; a last block
  shows the bounds of schema `0.1` back.
- `packages/editor-sdk/test/keyframe-minimum.test.ts`: the same seam at the
  bus. Schema `0.1` states 2 for every property, so a bus that wrote out 2
  would pass every other test. This file hands `editor-sdk` a
  `compositionSchema` whose opacity keyframes take three, while the validator
  stays the real one, and expects `too-few-keyframes` for a removal that leaves
  two. The mock is local to the file; neither schema `0.1` nor the public API
  changes.
- `packages/editor-sdk/test/history-property.test.ts`: the new commands in the
  seeded sequences, with an independent model of their codes, details, and IDs,
  and two further seeded runs focused on them; over all runs, and over the
  focused runs alone, each of the eight commands changes the document and each
  of the six codes occurs. The commands and codes of D40 are counted over the
  seeds 1 to 6 alone, as before. The premises of every run keep their thresholds.
- `tests/repo/readme-example.test.ts`: the calls to the bus in the command-bus
  example of the README, the animation commands included, run in the order
  written against the document the README names.
