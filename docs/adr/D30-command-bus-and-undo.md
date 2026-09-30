# D30 — The command bus, `SetNodePosition`, and undo/redo

- Status: Accepted — by the project owner on 2026-09-23
- Date: 2026-09-22
- Supersedes: —
- Amended by: PR-09 on 2026-09-23, before acceptance: D30.3 and D30.12 no longer
  let the AI tool call `applyCommand`; it dispatches on the host's bus (D31)
- Amended by: PR-10 on 2026-09-23 at the owner's request, D30.13 (the bus is a
  frozen facade)
- Amended by: PR-18 (D38) on 2026-09-28 at the owner's request, D30.1, D30.4,
  D30.8, D30.9, and D30.13 (a closed registry of three commands, transactions,
  a bounded history, and changes delivered to listeners)
- Amended by: PR-19a (D39) on 2026-09-29 at the owner's request, D30.1, D30.4,
  D30.5, D30.8, D30.9, and D30.13 (structural commands, `createdIds`, and the
  failing-undo obligation replaced)
- Amended by: PR-19b (D40) on 2026-09-29 at the owner's request, D30.8
  (the error codes of the asset commands)
- Related: D02, D09, D12, D15, D16, D17, D19, D24, D25,
  [specification](../spike/vertical-spike.md) §5 P3, §5 P4, §9, and open
  question Q16

## Context

P3 asks for a canvas interaction that changes the JSON "through a typed domain
command": dragging `node-title` dispatches one command on the bus of
`@kadrion/editor-sdk`, the UI "never mutates renderer internals or the DOM
produced by the runtime", the result "validates against the schema", the Player
re-renders from it, and "undo applies one inverse patch and restores a document
identical to the original". §9 adds that a command is "typed, serialisable, and
validated before it is applied", that applying it yields "a new document plus
the inverse patch that undo needs", that commands are "pure with respect to the
document", and that the spike needs "exactly one command end to end".

`AGENTS.md` binds the same boundary from the other side: "UI and AI never mutate
renderer internals directly. Both use the same command bus." P4 (PR-09) then
requires an AI tool call with the same parameters to produce a document "whose
serialised JSON is byte-identical to the P3 result", which means the two entry
points may not normalise their arguments differently.

Two accepted decisions already constrain the shape. D12 allows `editor-sdk` to
depend on `@kadrion/schema` and prohibits every edge to `runtime`,
`renderer-dom`, `player`, and `producer`, because "commands are document
transforms" that "must work without a renderer". D15 assigns one piece of
domain logic explicitly: "Rounding pointer input to integer composition pixels
belongs to `@kadrion/editor-sdk`, not to an application", since applications
"must not become hidden sources of domain rules".

The project owner settled the remaining questions on 2026-09-22, before this
pull request: the command is absolute rather than relative, the inverse is the
full previous field value rather than a JSON Patch or a node snapshot, the
history lives in host memory, and every successful `applyCommand` re-validates
its result with the full `validateComposition`.

## Decision

### D30.1 One command, absolute and idempotent

The command union of schema 0.1 has one member:

```ts
type SetNodePositionCommand = {
  readonly type: 'SetNodePosition';
  readonly nodeId: string;
  readonly position: { readonly x: number; readonly y: number };
};
```

It is a plain JSON value, so it survives the transport between a host, the UI,
and an AI tool call. The position is **absolute**, in composition pixels (D15),
and replaces the node's base `position`. Applying the same command twice leaves
the same document, which makes a retry safe and makes the command predictable
for a model.

A relative `MoveNode { dx, dy }` was rejected: its result depends on the current
document, so a repeated or reordered call silently produces a different
document.

Amended by: PR-18 (D38). The union now has three members, `SetNodePosition`,
`SetNodeOpacity`, and `SetTextContent`, known from a closed registry (D38.1–D38.3).
Each of them is absolute and idempotent in the sense of this section.

Amended by: PR-19a (D39). The union also holds `AddNode`, `RemoveNode`,
`DuplicateNode`, and `ReorderNode`, which change which nodes exist and their
order (D39.1). `ReorderNode` is absolute and idempotent in the sense of this
section; `AddNode` and `DuplicateNode` fail the second time with `id-in-use`,
and `RemoveNode` with `unknown-node`, which is what a retry must see.

### D30.2 The command sets the base position, not the rendered one

`position` is the node's base value; a `position` animation adds offsets on top
of it (D16). For a node that owns a position animation, the rendered location at
a time is therefore **not** the base position, and moving such a node by a
screen delta is not a single `SetNodePosition`. `node-title` owns an opacity
animation only, which is why the spike drags that node.

### D30.3 Parsing is the single normalisation point

`parseCommand(value: unknown): Command` is the only way a command comes into
existence. It rejects anything that is not a closed object of exactly the fields
above, a `type` it does not know, a `nodeId` that is not a string, and an `x` or
`y` that is not a finite number — `NaN`, `Infinity`, and `-Infinity` are
refused. It then **normalises**: coordinates are rounded to integer composition
pixels with `Math.round`, which rounds halves towards `+∞` (so `-2.5` becomes
`-2`), and a resulting `-0` is normalised to `0`, because `-0` and `0` are
indistinguishable after `JSON.stringify` but not under `Object.is`, which would
otherwise produce a history entry whose undo changes nothing.

The returned command is frozen, so a caller that keeps a reference and mutates
it cannot reach into the history afterwards. Parsing is idempotent: parsing an
already-parsed command returns an equal command.

`applyCommand` parses its argument as well, even though the argument is typed.
`Command` is a structural type, so a caller can write a literal with a
fractional or negative-zero coordinate, and `applyCommand` is a public export in
its own right (D30.12): a stateless host that calls it gets the same
normalisation as the bus. The bus parses too, because it turns an `unknown`
payload into a `Command` without a type assertion. The UI and the AI tool
(D31) both enter through `dispatch`, so both parses lie on their path, and
the one normalisation of this section is what makes their documents
byte-identical (P4).

Rounding is not clamping. A position outside the canvas stays legal if the
schema allows it; nothing is silently pulled back into the frame.

### D30.4 Applying a command

```ts
applyCommand(document: ValidatedComposition, command: Command): CommandResult
type CommandResult = {
  readonly document: ValidatedComposition;
  readonly inverse: Command | null;
};
```

The order is fixed:

1. parse the command (D30.3);
2. find `nodeId` in the document;
3. read the previous position **from the input document** and build the inverse;
4. build the result document immutably;
5. run the full `validateComposition` on the result;
6. only then return the document and the inverse.

If any step fails, an `EditorError` is thrown, the input document is unchanged,
the inverse is not published, and no history stack is touched.

There is one short circuit, and it is the whole of D30.9's rule 7: when step 3
finds that the node already holds the position the command asks for, the
function returns after step 3 with `inverse: null` and **the document it was
given**, unchanged and not revalidated. Nothing was built, so there is nothing
to validate.

Amended by: PR-18 (D38). The order and the short circuit hold for every command
of the registry: step 3 reads the previous value of the field the command edits
— a position, an opacity, or a text — from the entry of that command (D38.1). A
transaction applies this function to each of its commands in turn, so every
intermediate document is validated in full as well (D38.4, D38.5).

Amended by: PR-19a (D39). A command now edits the document through its entry of
the registry, which finds what it needs — a node, a parent list — itself
(D39.9). The order stays: parse, edit, validate in full, and only then return
the result. The inverse is read from the concrete document the command was
applied to; an entry may prepare it while building the candidate, but it is
not returned or recorded before the validation succeeded, and it is discarded
with the candidate when the validation fails (D39.5).
`CommandResult` gains `createdIds` (D39.4) and is frozen.

### D30.5 The inverse is a command, not a patch

The inverse is a ready `SetNodePosition` carrying the node's previous position.
The history stores commands — never documents, never patches. Because the
previous value is read from a validated document it is already an integer, so
rounding is the identity on it and undo restores the original document byte for
byte, including the order of its keys (D30.7).

Neither JSON Patch nor a snapshot of the node was chosen: the first adds
stringly-typed paths and a second, weaker contract next to the typed command;
the second stores more than the command changed and hides the edit's scope.

Amended by: PR-19a (D39). The inverse of `RemoveNode` is an `AddNode` that
carries a frozen snapshot of the removed subtree. The rejection above holds for
field edits, where a snapshot would store more than the command changed; for a
structural command the subtree is exactly what the command changed, and the
inverse is still a typed command (D39.5).

### D30.6 The result is validated in full

Every successful `applyCommand` returns a `ValidatedComposition` produced by
`validateComposition`. No command asserts the brand; the ESLint rule of
specification Q17 keeps it that way. A result the schema rejects surfaces as
`invalid-result` with the validation errors as details — this is where a
coordinate that is fractional or outside ±1 000 000 is caught, so `editor-sdk`
does not restate any of the schema's own rules.

The cost is O(size of the document) per command, which is accepted at this size.
Should a future editor need a command per `pointermove`, the answer is an
explicit transaction or batching API, never a quietly weakened `applyCommand`.

### D30.7 Documents are values

`applyCommand` never mutates its input. It rebuilds only the path from the
document root to the edited node and shares every untouched subtree by
reference, and it rebuilds objects by spreading the original, so the key order
of the input survives into the result.

The guarantee is structural, not enforced at run time: `validateComposition`
returns the very object it was given, without cloning or freezing it. Mutating a
document returned by the bus is therefore undefined behaviour that can reach
back into the input. The document types are deeply read-only, which is what
makes this a compile-time error rather than a convention.

### D30.8 Typed errors

`EditorError` carries a `code` and, for a rejected result, `details` in the
Player's idiom — callers check `code`, not `instanceof`, which fails across
realms:

| Code               | Meaning                                                    |
| ------------------ | ---------------------------------------------------------- |
| `invalid-document` | The document the bus was created from is not a composition |
| `unknown-command`  | No command of that `type` exists                           |
| `invalid-argument` | The payload is not a well-formed command of that type      |
| `unknown-node`     | No node of the document has that ID                        |
| `unsupported-node` | The node has no position (a background node, D16)          |
| `invalid-result`   | The edited document does not validate; `details` say why   |
| `nothing-to-undo`  | The undo stack is empty                                    |
| `nothing-to-redo`  | The redo stack is empty                                    |

Whether a node supports a position is decided by looking for a `position` field
on the node, not from a list of node types written out again in `editor-sdk`. A
node type the schema gains later therefore becomes editable on its own, instead
of silently reporting `unsupported-node`. The same code reports
`unsupported-node` when a node has a `position` whose `x` or `y` is not a finite
number; schema 0.1 makes that unreachable, and it is reported rather than
assumed away because `ValidatedComposition` is a static brand (D19).

Searching for a node looks at a scene's nodes and at one level of children,
which is exactly as deep as schema 0.1 goes: groups do not nest (D16), and a
test derives that from `compositionSchema` rather than trusting it. Two nodes
sharing an ID would make the search order observable; `validateComposition`
refuses such a document, which is what makes `ValidatedComposition` enough.

Amended by: PR-18 (D38). The table gains `busy`: a listener called a mutating
method while a change was being delivered (D38.8). `invalid-argument` also
covers an invalid transaction and an invalid or unknown option of the bus, and
`unsupported-node` means that the node lacks the field the command edits: a
position or an opacity (the background) or a text (every node but a text node).
The rule of field presence above applies to every command (D38.10).

Amended by: PR-19a (D39). The table gains `unknown-parent` (a `parentId` that is
neither the scene nor a node), `index-out-of-range` (an index outside the list
in this document), and `id-in-use` (an ID the command would add is used or
added twice; the details list them, sorted). `unknown-node` also covers an ID
that names an animation, the scene, an asset, or a clip, and `unsupported-node`
a parent without `children`, read from the node (D39.8).

Amended by: PR-19b (D40). The table gains `unknown-asset` (the ID is not an
asset of the document), `asset-type-mismatch` (the asset is not of the type the
field expects), and `asset-in-use` (an asset that is still used cannot be
removed; the details name its users). `unsupported-node` also covers a node
without the scale, size, colour, font size, font, or image asset a command of
D40 edits (D40.1, D40.2).

### D30.9 The history belongs to the host, not to the document

`createCommandBus(document)` keeps an undo and a redo stack in memory. The
history is not part of the composition, not part of the schema, never reaches
`@kadrion/runtime` or the Producer, and may be empty after a reload — Taskio
stores document versions (D02), which is a different thing from an operational
undo stack. Exporting the history is out of scope for the spike.

The mechanics are symmetric:

1. a dispatched command pushes the returned inverse on the undo stack;
2. `undo` applies the top inverse;
3. the inverse that `undo` itself returns goes on the redo stack;
4. `redo` works the same way in the other direction;
5. dispatching a new command after an undo clears the redo stack, unless that
   command changed nothing: a no-op is not a new branch;
6. a failed command changes neither stack;
7. a command that changes no value creates no history entry — `applyCommand`
   returns `inverse: null` together with the document it was given.

`dispatch` takes `unknown` and parses it. That is the seam PR-09 builds on: the
AI tool contract hands its arguments to the same bus and cannot acquire a second
path into the document.

Rule 6 is written into the order of the code — a stack entry is spent only after
the command it carries has succeeded — but it cannot be falsified while
`SetNodePosition` is the only command: an inverse restores a position that
validated a moment ago, on a node that no command can remove, so an undo cannot
fail. The order is kept for the command that can fail, not for the one that
exists, and the test grows a failing-undo case in the pull request that adds a
command which changes whether a node exists or what a value may be.

Amended by: PR-18 (D38). A history entry is now a **list** of inverse commands,
one list per operation, a transaction counting as one entry (D38.4, D38.6). Read
rules 1–4 with lists: a dispatch or a transaction pushes its list of inverses,
in the order undo applies them; `undo` applies the top list in order; the list
of inverses that `undo` returns (`inverses` of its `TransactionResult`) goes on
the redo stack; `redo` works the same way in the other direction. The history
keeps at most `historyLimit` entries, 100 by default, the oldest dropped
first (D38.7). Rules 1–7 hold for transactions, and rule 6 holds for undo and
redo too: a failed undo or redo changes neither the document nor either stack
and delivers no change. `SetNodeOpacity` and `SetTextContent` restore values that
validated a moment ago as well, so the failing-undo case above still has no
natural path; PR-18 adds a property test over seeded sequences instead, and the
concrete failing-undo test moves to PR-19, whose commands change whether a node
exists (D38.7).

Amended by: PR-19a (D39). The failing-undo case this section expected from "the
pull request that adds a command which changes whether a node exists" has no
natural path with the structural commands either: the history is linear and
owned by the bus, every inverse was built from and validated with the document
it undoes, and the structural commands are symmetric. The obligation is
replaced by a property test with the structural commands and full undo and
redo, a stateless test of an inverse applied to a diverged document, and the
`busy` test of an undo during delivery (D39.6). No test of a production failure
of `bus.undo()` exists, because no such path exists; the code order of rule 6
stays.

### D30.12 `applyCommand` is public, and a host that keeps a bus uses `dispatch`

`applyCommand` is exported: a stateless host may apply a command to a document
it holds and keep the result, with no history at all. The AI tool contract does
not: it dispatches on the host's bus (D31). A host that does keep a bus must route **every** edit through
`dispatch`, because the bus's stacks describe the document the bus holds; an
edit applied beside it leaves a history that undoes into a document nobody is
showing. `getDocument()` returns the live document, not a copy, which D30.7
already makes read-only.

### D30.10 The application never touches the renderer's DOM

The render page is a sandboxed frame without `allow-same-origin` (D25), so the
host page cannot reach the DOM the runtime produces even if it tried — the
boundary of `AGENTS.md` is enforced by the sandbox, not by discipline. A drag
affordance is therefore an overlay that the application owns, positioned from
the **document** and the preview scale, and the pointer gesture may update only
that overlay. The lasting position comes from the document the bus returns,
which the application hands back to `player.load`.

Converting client pixels to composition pixels is the application's own
arithmetic — `getBoundingClientRect()` of its overlay divided by the
composition's width — and the result goes through `parseCommand`, which owns the
rounding (D15). A surface with no measurable box (a hidden panel, a detached
element) yields no scale and therefore no command: a guessed factor would write
a wrong but perfectly valid position into the document, and a silent fallback is
what `AGENTS.md` rules out.

Two consequences of the sandbox are not preferences but requirements, and both
were found by the browser test rather than reasoned out:

- **The gesture listens on the document, and the overlay shields the frame.**
  The render frame is cross-origin and Chromium runs it out of process (D26),
  so a pointer over it is routed to that process; neither a listener on the grip
  nor a pointer capture taken in this document sees the rest of the gesture. For
  the length of a gesture the overlay therefore takes pointer events, so that
  the hit target stays in this document, and the moves and the release are
  listened for on the grip's document.
- **The canvas boxes are sized before the Player is created.** The stage has to
  have its height when the render frame is laid out in it; sized afterwards, the
  Custom HTML element inside that frame does not paint.

### D30.11 A purity guardrail for `editor-sdk`, separate from D24

The sources of `@kadrion/editor-sdk` may not reach a clock, a timer, a frame
callback, a random source, the DOM, the network, module state, or a weak
collection, and inline ESLint configuration cannot switch that off. §9 requires
it: "the same document and command always give the same result".

This does **not** extend D24. D24 binds the three packages of the runtime build
(D21) because they compute frames; this rule binds a package that computes
documents, and it has its own list and its own reason. PR-09 gives
`@kadrion/ai-sdk` the same block.

The block repeats the brand rule of Q17, because a later `no-restricted-syntax`
replaces an earlier one; without that repetition `editor-sdk` could assert
`as ValidatedComposition` and skip step 5 of D30.4 unnoticed.

Rules on names close names. A clock reached by import — `node:perf_hooks` — and
the rest of the world — `node:fs` — walk straight past them, so the block also
refuses every Node built-in, by specifier and by bare name. The package imports
`@kadrion/schema` and its own files, which D12 already fixes, so the ban costs
nothing and the guardrail no longer depends on a list of global names being
complete.

### D30.13 The bus is a frozen facade (amendment of PR-10)

Decided by the project owner on 2026-09-23, after D31 was accepted.

- `createCommandBus()` returns its public object shallowly frozen with
  `Object.freeze`. None of its methods can be replaced, added, or deleted. In
  strict mode such an attempt throws a `TypeError`.
- The closure is not frozen. It holds the current document and the undo and redo
  stacks, and `dispatch`, `undo`, and `redo` change them as before. No behaviour
  and no signature changes.
- The documents stay the frozen values D30.7 describes. This amendment neither
  adds nor requires a deep freeze of the bus's internal, mutable state.

The reason is the seam of D30.9 and D31: the UI and the AI tool share one bus. A
caller that replaced `dispatch` on the shared object would give the other caller
a second path into the document.

This amendment narrows D30 without reversing any part of it. It follows the
precedent of D23.9 and D28.9, which were also amendments requested by the owner
and carry an "Amended by" line. The `CommandBus` interface keeps its members as
they are, not `readonly`: the owner ruled out signature changes. So TypeScript
still accepts `bus.dispatch = …`, and the freeze refuses it at run time.

Amended by: PR-18 (D38). The facade gains `dispatchTransaction` and `subscribe`,
and `undo` and `redo` return a `TransactionResult`, by the owner's decision of
2026-09-28; `dispatch` keeps its signature. The facade stays frozen, and its
members stay non-`readonly`. The closure also holds the list of subscriptions and
the guard of D38.8, both mutable on purpose, like the stacks.

Amended by: PR-19a (D39). The results the facade returns are frozen:
`dispatch` returns a frozen `CommandResult` with `createdIds` (D39.4, D39.9).
No member of the facade changes.

## Alternatives considered

- **`MoveNode { dx, dy }`** — see D30.1.
- **JSON Patch (RFC 6902) as the inverse** — see D30.5.
- **A snapshot of the edited node as the inverse** — see D30.5.
- **The history inside the document** — it would make undo portable between
  sessions, at the price of the invariant that "the versioned composition
  document is the only source of rendering truth", and it would grow the schema
  (D02, D16).
- **Validating only the touched fields** — cheaper per command, but it moves the
  schema's rules into `editor-sdk`, where they would drift, and it lets a bug
  elsewhere in the transform publish a document the runtime must then refuse.
- **Rounding in the application** — rejected by D15, and it would let the UI and
  an AI tool round differently and break P4.
- **Listening for pointer events on the rendered node** — impossible across the
  sandbox, and it is exactly the coupling D09 forbids.

## Consequences

- `@kadrion/editor-sdk` gains a dependency on `@kadrion/schema`, which D12
  already allows. It gains no other dependency and imports no DOM type.
- `apps/playground` gains a dependency on `@kadrion/editor-sdk`, an overlay, and
  Undo/Redo buttons. It stays free of domain rules: it converts pixels and
  dispatches. Its editing behaviour lives in one exported function, so that the
  tests drive what the page runs instead of a copy of it; `main.ts` is left with
  the bootstrap that needs a real Player.
- A drag stops playback: the command reloads the document and seeks back to the
  time that was showing, and the Player is paused after a `load`.
- Reloading the Player after each command restarts the preview at `timeUs = 0`
  (`player.load` seeks to 0), so the application remembers the time it was
  showing and seeks back to it. That is presentation, not a domain rule.
- `parseCommand` is the one place that can silently change a caller's numbers.
  Any future command must go through it for P4 to keep holding.
- Schema 0.1 is untouched: no new field, no limit, no migration, no version
  bump. Open question Q16 stays open, and this pull request is not its owner.

## Verification

- `packages/editor-sdk/test/` covers the command and its inverse, undo restoring
  the document under a raw `JSON.stringify` comparison, redo, the rejection of
  an unknown node, of a node without a position, and of every malformed
  argument, the absence of mutation of a deep-frozen input, identity (`toBe`) of
  untouched subtrees, idempotence, the no-op that writes no history, and the
  fact that a frozen parsed command cannot be mutated after a dispatch.
- `packages/editor-sdk/test/bus.test.ts` (D30.13): the bus is frozen; replacing
  `dispatch`, adding a property, and deleting a method each throw a `TypeError`;
  `dispatch`, `undo`, and `redo` still change the document the closure holds.
- The set of node types that accept a position is derived from
  `compositionSchema` in a test and compared with what the bus accepts, so the
  two cannot drift (D30.8).
- `tests/repo/lint-guardrails.test.ts` feeds each banned construct to the real
  configuration under an `editor-sdk` path and asserts the rejection, including
  the brand rule of D30.11 and the refusal of inline configuration.
- Key order is pinned twice: once against the fixture, and once against a
  variant whose `position` serialises `y` before `x`, where a rebuild that
  writes a fresh `{ x, y }` changes bytes forward and does not change them back.
- `tests/app/playground-drag.test.ts` drives the playground's own `wireEditor`
  in jsdom, with only the Player stubbed: one command per drag, the exact
  payload, the converted coordinates, the document the Player receives, the time
  restored across the reload, the shield raised and lowered, and the refusal to
  guess when the canvas cannot be measured. jsdom has no layout, so it proves
  the protocol and the arithmetic, not the conversion factor.
- `tests/pinned/editor.pinned.test.ts` proves the conversion factor and the
  pixels in the pinned Chromium of D26, against the same built modules: a drag
  of a known number of client pixels, at two preview scales, changes the
  document by that delta divided by the scale; the document matches a direct
  JSON edit byte for byte; the frame after the command differs from the frame
  before it, and undo brings the first frame back. It found the two sandbox
  consequences of D30.10 on its first run, neither of which any unit test could
  have shown.
