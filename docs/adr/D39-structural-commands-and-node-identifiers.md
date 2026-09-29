# D39 — Structural commands and node identifiers

- Status: Accepted — by the project owner on 2026-09-29, before the implementation
- Date: 2026-09-29
- Supersedes: —
- Amends: D30 (D30.1, D30.4, D30.5, D30.8, D30.9, D30.13), D38 (D38.1, D38.4,
  D38.6, D38.7, D38.8), each with an `Amended by: PR-19a (D39)` line; D31
  receives a note
- Related: D02, D05, D09, D16, D23, D27, D30, D31, D36, D38,
  [roadmap of phase two](../roadmap/phase-2.md) PR-19a and PR-19b

## Context

The first thing the Taskio editor needs is adding, removing, duplicating, and
reordering elements (roadmap, priority 1). D30 and D38 give the bus commands
that edit one field of one node; none of them changes which nodes exist.

Schema `0.1` shapes these commands. A node owns its animations and a group its
children (D16.4): every node but a background has a required `animations`
array, an animation has no field that points at a node, and D16 rejected a
scene-level animation list with `nodeId` because it allows dangling targets.
So a node's subtree — the node, its animations, and a group's children with
theirs — is one self-contained piece of JSON, and nothing else in the document
refers to it. The only references in schema `0.1` are to assets (an image's
`assetId`, a text's `fontAssetId`, a clip's `assetId`).

IDs are unique across the whole document, whatever the entity, and match
`^[A-Za-z0-9_-]+$` without a length limit (D16.3). `@kadrion/editor-sdk` has no
clock and no random source (D30.11), so a new ID is either given by the caller
or derived from something the command already holds.

The project owner decided on 2026-09-29: PR-19 is split into PR-19a (this ADR)
and PR-19b (properties and assets, later and separately approved);
`DuplicateNode` takes the copy's ID from the host and derives the others by an
injective rule; structural commands handle Custom HTML nodes; `createdIds` is
reported net and everywhere; the concrete failing-undo test that D30.9, D31,
and D38.7 assigned to PR-19 is replaced by what D39.6 states.

## Decision

> D39: The bus adds, removes, duplicates, and reorders whole node subtrees through AddNode, RemoveNode, DuplicateNode, and ReorderNode, whose inverses are plain commands carrying exact frozen snapshots; the host supplies every ID of an added node and the root ID of a copy, whose other IDs derive injectively from it; collisions are refused atomically as id-in-use; every result reports the IDs it created, net.

### D39.1 The four commands

| Command         | Arguments                   | Inverse                                            | No-op      |
| --------------- | --------------------------- | -------------------------------------------------- | ---------- |
| `AddNode`       | `parentId`, `index`, `node` | `RemoveNode` of `node.id`                          | never      |
| `RemoveNode`    | `nodeId`                    | `AddNode` with the parent, the index, the snapshot | never      |
| `DuplicateNode` | `nodeId`, `newNodeId`       | `RemoveNode` of `newNodeId`                        | never      |
| `ReorderNode`   | `nodeId`, `index`           | `ReorderNode` to the previous index                | same index |

- `AddNode` takes the complete node, with every ID of its subtree and its
  animations in its own `animations` arrays. There is no separate list of
  animations: it would restate the required arrays and could only add
  animations to the new subtree anyway. `AddNode` therefore never adds an
  animation to a node that exists already; authoring animations is PR-20.
- `RemoveNode` removes the whole subtree: the node, its animations, and a
  group's children with theirs. It never removes an asset: an asset nothing
  uses any more stays in the document, and the host still resolves it (D27).
  `AddAsset` and `RemoveAsset` belong to PR-19b.
- `DuplicateNode` copies the whole subtree with its animations under the IDs of
  D39.3.
- Every inverse is a public, parseable command. There is no hidden restore
  command and no test backdoor.
- The argument schemas of the four commands are exported next to their parsers
  and checked against them as in D31.9. `AddNode`'s `node` is an object and
  nothing more: its shape is the document's schema, applied by the full
  validation to the result (D30.6), not restated (D31.2). No AI tool wraps
  these commands yet (PR-24).

### D39.2 Parents, indexes, and placement

- A list is the `nodes` of the scene or the `children` of a group. `parentId`
  names the scene or a group; there is no reparenting, and grouping elements
  stays outside the first scope.
- Which node types a list takes is the schema's rule — a group takes image and
  text nodes — checked by the full validation (`invalid-result`), not restated.
- `AddNode.index` is the node's index after the insertion, from 0 (the bottom
  layer) to the list's length (the top). `ReorderNode.index` is the node's final
  index in the resulting list, from 0 to the length minus 1; the same index is a
  no-op (D38.9).
- An index is a safe integer from 0, never rounded; anything else is
  `invalid-argument`, and -0 becomes 0 (D30.3). Whether it fits the list depends
  on the document, so an index past the list is `index-out-of-range`.
- A duplicate goes directly after its source in the source's list (index + 1):
  the layer right above it.
- In a transaction every index refers to the document the earlier commands left.
- `ReorderNode` is the only command that moves an existing node within a list.

### D39.3 Identifiers

- **`AddNode`:** the host supplies every ID of the subtree. The engine generates
  none.
- **`DuplicateNode`:** the host supplies `newNodeId`, which the parser checks
  against the document's ID pattern, read from `compositionSchema` rather than
  written out again (`invalid-argument`). Every other ID derives from it
  (`N` = `newNodeId`, `i` the child's index in the source):

  | ID of the copy           | Derived as            |
  | ------------------------ | --------------------- |
  | the node                 | `N`                   |
  | a child                  | `N-c<i>`              |
  | an animation of the node | `N-a-<property>`      |
  | an animation of a child  | `N-c<i>-a-<property>` |

- **No internal collision is possible.** Every derived ID but `N` is `N-`
  followed by a suffix of one of three forms: `c<i>`, `a-<p>`, or `c<i>-a-<p>`.
  The first letter separates `a` from `c`; among the `c` forms, only the third
  continues after the digits, with `-a-`; distinct children have distinct
  indexes written without leading zeros; the animations of one node have
  distinct properties (D16.6); and `N` is shorter than every other. The proof
  concerns only the newly generated set: its IDs never collide with one
  another. A subtree can be duplicated under an `N` for which `N` and every ID
  derived from it are free in the current document; otherwise the command is
  refused as `id-in-use`, and another `N` may succeed.
- **The format holds without a separate check.** `N` matches
  `^[A-Za-z0-9_-]+$`, and every suffix consists of `-`, `a`, `c`, digits, and a
  property name (`opacity`, `position`, `scale`). The full validation remains
  the final guard.
- **Collisions with the document** are checked before anything changes: every
  ID a command would add is compared with every ID of the document, whatever
  the entity, and with the others it would add. Any collision refuses the whole
  command with `id-in-use`; the details list the colliding IDs, sorted.
  `id-in-use` takes precedence over `invalid-result`. For `AddNode`, IDs are
  read only where they are well formed — a string `id` of the node, of the
  items of `children`, and of the items of `animations` when those are arrays of
  objects — and every other malformation is left to the full validation.
- **No clock, randomness, or counter:** IDs are a pure function of the document
  and the command.
- **Reuse across the history is the host's responsibility.** Kadrion guarantees
  uniqueness in the current document and a deterministic detection of every
  collision. Redo restores the IDs an entry recorded, so undoing and redoing a
  duplicate brings back the same IDs.

### D39.4 `createdIds`

`CommandResult`, `TransactionResult`, and `BusChange` gain `createdIds`, always
present and frozen, empty when nothing was created.

- For one command, the order is: the node IDs in preorder (the root, then its
  children in array order), then the animation IDs grouped by owner in that
  same preorder, each owner's in array order.
- For an operation — a dispatch, a transaction, an undo, or a redo — the list is
  net: the IDs created during the operation that still exist in the resulting
  document, each once, in the order they were last created. A deterministic
  accumulator follows each command: the IDs a command removes leave the list, and
  the IDs it creates move to its end. `[Add X, Remove X]` reports nothing,
  `[Remove X, Add X]` reports `X`, and `[Add X, Remove X, Add X]` reports `X`
  once. No documents are compared.
- An undo or a redo reports what it created itself: undoing a `RemoveNode`
  reports the restored subtree, undoing an `AddNode` reports nothing.

### D39.5 Snapshots and inverses

- An inverse is read from the concrete document the command is applied to, not
  produced by the parser. An entry may prepare it while it builds the candidate
  document (`RemoveNode` takes its snapshot then) or when `executeCommand` —
  which the public `applyCommand` wraps, and which the bus calls directly — asks
  for it through `invert` (`AddNode`, whose `id` is known to be well formed only
  after the validation). Either way it is not returned, recorded in the history, or
  otherwise observable before the full validation of the result succeeded; when
  the validation fails, the candidate and any prepared inverse are discarded.
  It is built by the parser of its own command type — `parseAddNode`,
  `parseRemoveNode`, or `parseReorderNode`, the parsers `parseCommand`
  dispatches to — so it is normalised and frozen.
- A snapshot is an exact copy of composition data, not of JavaScript object
  details: no promise is made about prototypes, getters, or property
  descriptors. The copy keeps every value as it is — strings, numbers,
  booleans, null, arrays by index, objects by their own enumerable keys in their
  order — and refuses a cycle and anything the validator would not read as data
  (`invalid-argument`); there is no JSON round trip, so nothing changes through
  a `toJSON`. It accepts no object the validator does not.
- The host's objects are never frozen: the parser copies an `AddNode` payload,
  and `RemoveNode` copies the subtree from the current document, which may be
  the host's own object when the bus was created from it (`validateComposition`
  returns its input).
- Removing a node and undoing it gives an identical serialised document for
  every valid schema `0.1` document. JSON writes -0 as 0, so -0 is not claimed
  to survive.
- Object identity follows D30.7: everything outside the edited path keeps its
  identity — assets, clips, untouched nodes and subtrees. Every ancestor on the
  path is a new object: the root, `scenes`, the scene, its `nodes`, and for an
  edit inside a group the group and its `children`. A reordered node and the
  source of a duplicate keep their identity. An undo restores a new, deeply
  frozen copy whose data is identical to the snapshot; the same object is not
  promised.
- D30.5 rejected a snapshot of the edited node as the inverse of a field edit,
  because it stores more than the command changed. For a structural command the
  subtree is exactly what the command changed, so the inverse carries it.

### D39.6 A natural failure of `bus.undo()` is unreachable

D30.9 kept the order "a stack entry is spent only after the command it carries
has succeeded", and D30.9, D31, and D38.7 assigned a concrete test of a failing
undo to the command that changes whether a node exists. With the commands of
this ADR such a failure is still unreachable, and the obligation is replaced:

- The history is linear and owned by the bus: every commit clears the redo
  branch, trimming drops only the oldest entries, and the document an entry is
  undone on is exactly the document its operation produced.
- Every inverse was built from that document, validated with it, and frozen; the
  structural commands are symmetric: an `AddNode` restores exactly what a
  `RemoveNode` took, at the same place, and nothing refers to a node from outside
  its subtree.
- So no sequence of dispatches, transactions, undos, and redos makes an undo or
  a redo fail. What replaces the concrete test:
  1. a property test over seeded sequences of every command, structural ones
     included, with full undo and redo, against an independent model;
  2. a stateless test: an inverse applied with `applyCommand` to a document that
     diverged — a restored ID in use again, a removed node already gone, a
     shorter list, a parent removed — fails atomically and leaves the input as it
     was;
  3. the test of D38.8: an undo during the delivery of a change fails with
     `busy` and changes nothing.
- No document claims a test of a production failure of `bus.undo()`, because no
  such path exists. The code order of D30.9 stays.

### D39.7 Custom HTML

Structural commands add, remove, restore, and duplicate a Custom HTML node like
any other, when the result validates. There is no `SetHtml`. The document still
does not decide whether the code runs: the host's policy does (D36). Adding a
node while the policy is `disabled` mounts an empty placeholder and no frame.

### D39.8 Errors

| Code                 | Meaning                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `unknown-node`       | The ID is not a node: missing, or an animation, scene, asset, or clip    |
| `unknown-parent`     | `parentId` names neither the scene nor a node (new)                      |
| `unsupported-node`   | `parentId` names a node without `children`                               |
| `index-out-of-range` | The index lies outside the list in this document (new)                   |
| `invalid-argument`   | A malformed index or `newNodeId`, or a node that is not plain data       |
| `id-in-use`          | An ID the command would add is used or added twice; details sorted (new) |
| `invalid-result`     | The schema refuses the result, such as a group inside a group            |

The checks run in a fixed order, which is part of this contract, so the first
failure decides the code:

- `AddNode`: the fields (`invalid-argument`), then the parent (`unknown-parent`,
  then `unsupported-node`), the index (`index-out-of-range`), the IDs
  (`id-in-use`), and last the full validation (`invalid-result`).
- `RemoveNode`: the fields, then the node (`unknown-node`), and last the full
  validation (`invalid-result`), which schema `0.1` gives no reason to refuse a
  removal.
- `DuplicateNode`: the fields, including the form of `newNodeId`, then the
  node (`unknown-node`), the IDs (`id-in-use`), and last the full validation
  (`invalid-result`).
- `ReorderNode`: the fields, then the node (`unknown-node`), the index
  (`index-out-of-range`), and last — unless the index does not change, which is
  a no-op — the full validation (`invalid-result`), which schema `0.1` gives no
  reason to refuse an order.
- A transaction parses every command before it applies any (D38.4), so a
  malformed command decides the code before an earlier command could fail.

### D39.9 The registry, the results, and the options

- A registry entry now edits the document, not one node: it returns the edited
  document, a function that builds the inverse, and the IDs it created and
  removed. The three commands of D38 keep their behaviour through a helper that
  edits one node. `applyCommand` keeps the order of D30.4: parse, edit, validate
  in full, and only then return the result with its inverse (D39.5).
- `COMMAND_TYPES` lists, in this order: `SetNodePosition`, `SetNodeOpacity`,
  `SetTextContent`, `AddNode`, `RemoveNode`, `DuplicateNode`, `ReorderNode`.
- `CommandResult` is frozen like `TransactionResult`.
- An option of the bus is an own property. An option that only an ancestor
  supplies is refused as `invalid-argument` instead of being read silently.

### D39.10 What this ADR does not decide

- PR-19b, approved separately: `SetNodeScale`, `SetNodeSize`, `SetNodeColor`,
  `SetTextFontSize`, `SetTextFont`, `SetImageAsset`, `AddAsset`, `RemoveAsset`.
- `fit` of an image, a candidate for schema `0.2` (PR-21).
- Reparenting, grouping, and multi-select.
- Replacing `unshift` and `splice` in the bus with another structure: at the
  default history limit of 100 it is not justified; deliberately deferred.

## Alternatives considered

- **A separate `animations` argument for `AddNode`** — possible as an envelope,
  but it restates the required arrays, raises questions of precedence, and
  makes the inverse of `RemoveNode` split what the snapshot keeps together.
- **Derived IDs from the source's child IDs** (`N-<childId>`) — readable, but
  not injective: some valid subtrees could never be duplicated under any `N`.
- **IDs generated by the bus**, from a counter or a list of retired IDs — the
  first needs state that `applyCommand` does not have (D30.12), the second
  grows without limit and is lost on reload.
- **A hidden `RestoreNode` or a test hook to force a failing undo** — a second
  path into the document, which D30.9 and D31 rule out.
- **Keeping the concrete failing-undo test deferred again** — it would promise a
  test that no natural sequence can produce.

## Consequences

- `@kadrion/editor-sdk` gains four commands, four argument schemas, three error
  codes, and `createdIds` on every result and change. It still depends on
  `@kadrion/schema` only.
- The schema, the runtime, the renderer, the Player, the Producer, the
  playground, the golden frames, the parity record, and the Q14 evidence are
  unchanged.

## Verification

- `packages/editor-sdk/test/structure.test.ts`: each command at the top level
  and in a group; every move of `ReorderNode` in lists of four; remove and undo
  of every node of the reference composition to identical bytes; the snapshot
  independent of later edits by the host; the derivation, its injectivity, and
  collisions with every kind of entity; the net `createdIds`; object identity;
  inverses applied to a diverged document; Custom HTML; options.
- `packages/editor-sdk/test/structure-arguments-schema.test.ts`: the four
  argument schemas against `parseCommand`, as in D31.9.
- `packages/editor-sdk/test/history-property.test.ts`: seeded sequences of every
  command, with undo and redo, against an independent model that predicts
  failures, no-ops, changes, and `createdIds` itself.
- `tests/app/structural-custom-html.test.ts`: Custom HTML nodes produced by the
  commands mount no frame under the `disabled` policy.
