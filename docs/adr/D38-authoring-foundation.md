# D38 — Authoring foundation: command registry, transactions, events, and history limit

- Status: Accepted — by the project owner on 2026-09-28
- Date: 2026-09-28
- Supersedes: —
- Amends: D30 (D30.1, D30.4, D30.8, D30.9, D30.13), each with an
  `Amended by: PR-18 (D38)` line; D31 receives a note
- Related: D02, D09, D15, D16, D19, D30, D31, D32,
  [roadmap of phase two](../roadmap/phase-2.md) PR-18

## Context

The spike proved one command end to end: `SetNodePosition` on a bus with two
unbounded stacks and no way to observe a change (D30). Phase two starts with
authoring (roadmap, PR-18): an editor has to apply several changes as one, undo
them as one, react to every change, and edit more than a position. Taskio's
priorities name the opacity and the text of a node among the first properties
an editor sets.

Schema `0.1` already holds both: `opacity` is a number from 0 to 1 on image,
text, Custom HTML, and group nodes, and `text` is a string on text nodes only,
at the top level or inside a group. Neither command needs a schema change.

The project owner decided the open points of the plan on 2026-09-28, before
this pull request: an explicit `onListenerError` instead of an error code for
a failing listener, a default history limit of 100, a change without a previous
document or a revision counter, exported argument schemas for both commands, an
opacity range enforced by the parser, no length limit for a text, no change to
the playground, and the failing-undo test moved to PR-19.

## Decision

> D38: The bus of `@kadrion/editor-sdk` knows its commands from a closed registry, adds `SetNodeOpacity` and `SetTextContent`, applies a transaction atomically as one history entry, keeps a bounded history, and delivers one frozen change per committed operation to listeners whose errors go to the host's `onListenerError`.

### D38.1 A closed registry of commands

The commands this build knows live in one internal table. Three things are tied
together, and only the first two are written by hand:

1. **The union.** `Command` is the union of the command types; it is the source.
2. **The table.** Its type maps every member of `Command['type']` to the entry
   of that command, and the table literal is checked against that type
   directly, so a member without an entry, and an entry for a type outside the
   union, both fail compilation.
3. **The list.** `COMMAND_TYPES` is derived from the table: its keys, in the
   order the entries are written, frozen. It cannot omit or add a type the
   table does not have, and its order is deterministic: `SetNodePosition`,
   `SetNodeOpacity`, `SetTextContent`.

Each entry reads the fields of its command (`parse`) and edits one node
(`edit`); `applyCommand` does the rest of D30.4 for every command alike. The
table is deep-frozen and not exported. There is no plugin system and no way to
add, replace, or remove a command from outside the package.

`parseCommand` keeps its checks and its
codes: a payload that is not an object or has no string `type` is
`invalid-argument`, a type the registry does not know is `unknown-command`, and
fields that are not exactly those of that command are `invalid-argument`.

### D38.2 `SetNodeOpacity`

```ts
type SetNodeOpacityCommand = {
  readonly type: 'SetNodeOpacity';
  readonly nodeId: string;
  readonly opacity: number;
};
```

The command sets the node's **base** opacity, absolute and idempotent like
D30.1; an opacity animation multiplies it (D16). `opacity` must be a finite
number from 0 to 1 inclusive. `NaN`, `Infinity`, `-Infinity`, and every value
outside the range are refused as `invalid-argument` by the parser; `-0` is
normalised to `0`, for the reason D30.3 gives. Nothing is rounded and nothing
is clamped. The range is part of the command's public contract, so the argument
schema states it (`minimum: 0`, `maximum: 1`) and the differential test demands
that the schema and `parseCommand` accept and refuse the same values. The full
`validateComposition` of D30.6 stays the final guard.

The command applies to a node that has a numeric `opacity` field. A node
without one — the background in schema `0.1` — is `unsupported-node`. The
inverse is a `SetNodeOpacity` carrying the previous value.

### D38.3 `SetTextContent`

```ts
type SetTextContentCommand = {
  readonly type: 'SetTextContent';
  readonly nodeId: string;
  readonly text: string;
};
```

The command replaces the text of a text node with any string, the empty one
included, exactly as given: nothing is trimmed or normalised, line breaks are
kept, and two texts that differ only in their Unicode normalisation are two
different texts. Schema `0.1` sets no length limit, so neither does the command.
Whether the font covers the glyphs is not checked here. A node without a string
`text` field is `unsupported-node`; the inverse carries the previous text.

### D38.4 Transactions

```ts
dispatchTransaction(commands: unknown): TransactionResult
type TransactionResult = {
  readonly document: ValidatedComposition;
  readonly commands: readonly Command[];
  readonly inverses: readonly Command[];
};
```

A transaction is a non-empty array of commands, read once. Every command is
parsed before any is applied. The commands are then applied in order to a
candidate document; if any fails, the error is thrown and nothing is published:
the document, both stacks, and the listeners are untouched. The error keeps its
`code` and `details`; its message is prefixed with `Command <i> of the
transaction: `, `i` counting from 0.

A transaction that commits writes **one** history entry and delivers **one**
change. It is not an array of dispatches: undo reverts it as a whole. An empty
array, a value that is not an array, and an array with a hole are
`invalid-argument`. Transactions do not nest: an array is not a command, and no
command type opens a transaction.

`dispatch` and `dispatchTransaction` run through one internal mechanism;
`dispatch` is a transaction of one command that keeps its own signature,
its `CommandResult`, and messages without a prefix.

### D38.5 Every command is validated in full

Each command of a transaction goes through `applyCommand`, and so through the
full `validateComposition` of D30.6, one after the other. Every intermediate
document is therefore a `ValidatedComposition`, and a transaction whose middle
the schema would refuse is refused, even if a later command would have repaired
it. The cost is one validation per command, accepted at this size; a batched
validation would need an ADR of its own.

### D38.6 The inverse of a transaction

`inverses` lists the commands that undo the operation **in the order undo
applies them**: the reverse of `commands`, without the commands that changed
nothing. A transaction that edits the same node twice therefore undoes to the
value before the first edit. The history stores this list as one entry; applying
it yields, in turn, the list that redo applies.

`undo()` and `redo()` return a `TransactionResult` as well: `commands` is the
entry they applied and `inverses` the entry they recorded for the other
direction.

### D38.7 A bounded history

```ts
createCommandBus(document: unknown, options?: CommandBusOptions)
type CommandBusOptions = {
  readonly historyLimit?: number;
  readonly onListenerError?: (error: unknown, change: BusChange) => void;
};
```

- The history keeps at most `historyLimit` entries; a transaction counts as one.
  The default is 100.
- `historyLimit: 0` keeps no history. Commands still execute, changes are still
  delivered, and `canUndo()` stays `false`.
- Only a safe integer from 0 is accepted; anything else, and any unknown option,
  is `invalid-argument` when the bus is created. An option given as `undefined`
  counts as left out.
- The options are read once, when the bus is created. The limit cannot change
  for the life of the bus.
- When a new entry would exceed the limit, the oldest entry is dropped first.
  Redo never exceeds the limit either: it is fed by undo, and each stack is
  trimmed on every push.

A failed undo or redo is atomic, like a failed command: an error it detects
changes neither the document nor either stack and delivers no change. The entry
is spent only after it has been applied in full. With the three commands of
this ADR, an inverse restores values that validated a moment ago, so no
deterministic sequence of operations makes an undo fail; the property test of
this ADR checks that over long seeded sequences. The first command that can
change whether a node exists (PR-19) owns a concrete failing-undo test. The bus
has no test backdoor, and mutating a document the bus returned stays undefined
behaviour (D30.7) rather than a way to produce one.

### D38.8 Changes and listeners

```ts
subscribe(listener: (change: BusChange) => void): () => void
type BusChange = {
  readonly kind: 'dispatch' | 'transaction' | 'undo' | 'redo';
  readonly document: ValidatedComposition;
  readonly commands: readonly Command[];
  readonly inverses: readonly Command[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
};
```

- Every committed operation delivers exactly one change, synchronously, after
  the commit: a listener that reads the bus sees the new state. A no-op and a
  failure deliver nothing.
- The change carries no previous document and no revision number. The change,
  its arrays, and the commands in them are frozen. It carries no time and no
  random identifier: the same operations deliver the same changes.
- Listeners are called in the order of subscription, over a snapshot of the
  list taken when delivery begins: a listener subscribed during delivery waits
  for the next change, and one removed during delivery still receives the
  current one. Subscribing the same function twice subscribes it twice; the
  returned function removes one subscription and may be called any number of
  times.
- `subscribe` needs `onListenerError`: without it, it is `invalid-argument`. A
  bus without `onListenerError` is fully usable otherwise; it only has no
  listeners.
- A listener's error does not stop the other listeners.
  `onListenerError(error, change)` is called once for each error. The error
  does not change the result of the operation, causes no rollback, and never escapes `dispatch`,
  `dispatchTransaction`, `undo`, or `redo`.
- `onListenerError` must not throw; a handler that throws violates the host's
  contract. The bus catches that error as well, stays consistent, and continues
  with the remaining listeners.
- While a change is being delivered, `dispatch`, `dispatchTransaction`, `undo`,
  and `redo` fail with `busy` and change nothing. Reading the bus and
  subscribing stay allowed. The guard ends with the delivery, also when a
  listener threw.

### D38.9 No-ops

The same rule holds for every command, in a dispatch and in a transaction: a
command that changes no value creates no history entry. An operation in which no
command changed a value returns the document it started from, the same object,
with `inverse: null` (dispatch) or empty `inverses` (transaction); it writes no
entry, keeps the redo branch, and delivers no change. A transaction whose
commands change values and change them back is **not** a no-op: it is recorded
and delivered, because telling it apart would mean comparing documents.

### D38.10 Errors

`EditorError` gains the code `busy` (D38.8). Two existing codes widen:
`invalid-argument` also covers an invalid transaction and an invalid or unknown
option of the bus, and `unsupported-node` now means that the node lacks the
field the command edits. There is no code for a failing listener; its error goes
to `onListenerError`.

### D38.11 Argument schemas without tools

`editor-sdk` exports `setNodeOpacityArgumentsSchema` and
`setTextContentArgumentsSchema` next to their parsers, as D31.2 does for
`SetNodePosition`: deep-frozen, closed, every property required, and checked
against `parseCommand` by the differential test of D31.9. `ai-sdk` gains no tool
in this ADR; generating tools from the command registry belongs to PR-24.

### D38.12 What this ADR does not decide

- AI tools for the new commands (PR-24) and any UI for them: the playground is
  unchanged and gains no showcase.
- Structural commands, and with them the concrete failing-undo test (PR-19).
- A batched validation of transactions, nested transactions, and an export of
  the history.

## Alternatives considered

- **A `listener-failed` error thrown after delivery** — it would make a committed
  operation look failed to its caller, who might retry it. An explicit handler
  keeps the result truthful.
- **Swallowing listener errors silently** — a silent failure is what `AGENTS.md`
  rules out.
- **Validating a transaction once, at the end** — cheaper, but every command
  would then have to handle a document the schema refuses, and `applyCommand`
  would need a second, unvalidated mode.
- **Treating a round trip as a no-op** — it needs a comparison of whole
  documents per transaction to save one history entry.
- **An open, exported registry** — a plugin system; D38 needs none, and
  `AGENTS.md` requires a manifest, schemas, and tests for every extension point.
- **Clamping or rounding the opacity** — it would silently change what a caller
  sent, and the schema would describe the document rather than the input.
- **An unbounded history** — memory grows with every edit of a long session.

## Consequences

- `@kadrion/editor-sdk` gains `dispatchTransaction`, `subscribe`, the options of
  `createCommandBus`, two commands, two argument schemas, and the types
  `TransactionResult`, `BusChange`, `BusListener`, `CommandBusOptions`, and
  `ListenerErrorHandler`. `undo()` and `redo()` now return a
  `TransactionResult`; `dispatch` is unchanged.
- The package still depends on `@kadrion/schema` only; the purity block of
  D30.11 covers the new module unchanged.
- `ai-sdk`, the playground, the schema, the runtime, the renderer, the Player,
  the Producer, the golden frames, the parity record, and the Q14 evidence are
  unchanged.

## Verification

- `packages/editor-sdk/test/node-commands.test.ts`: both commands, their
  inverses, byte-identical undo, no-ops including `-0`, the refused values, and
  the nodes each command refuses.
- `packages/editor-sdk/test/node-arguments-schema.test.ts`: both schemas are
  deep-frozen, closed, and valid for Ajv; the generated and hand-written corpus
  gets the same verdict from Ajv and from `parseCommand`.
- `packages/editor-sdk/test/schema-coverage.test.ts`: which node types carry an
  opacity and a text is read from `compositionSchema` and compared with what the
  commands accept.
- `packages/editor-sdk/test/transaction.test.ts`: atomicity, the error prefix,
  one entry per transaction, the order of `inverses`, no-ops and round trips,
  the history limit and its options.
- `packages/editor-sdk/test/events.test.ts`: one frozen change per operation,
  order and snapshot of listeners, `onListenerError`, a throwing handler, and
  `busy`.
- `packages/editor-sdk/test/history-property.test.ts`: seeded sequences of every
  operation, valid and failing, against a model of two stacks of snapshots.
- `packages/editor-sdk/test/commands.test.ts`: the registry's `COMMAND_TYPES`.
