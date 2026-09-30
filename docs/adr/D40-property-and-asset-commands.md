# D40 — Property and asset commands

- Status: Accepted — by the project owner on 2026-09-29, before the implementation
- Date: 2026-09-29
- Supersedes: —
- Amends: D30 (D30.8), D38 (D38.1), D39 (D39.4, D39.9), each with an
  `Amended by: PR-19b (D40)` line
- Related: D14, D15, D16, D27, D30, D31, D38, D39,
  [roadmap of phase two](../roadmap/phase-2.md) PR-19b

## Context

After D38 and D39 the bus edits a node's position, opacity, and text, and the
structure of the document. The Taskio editor also needs the other visual
properties of schema `0.1` and the assets of images and texts (roadmap,
priorities 2 and 4).

**The fields.**

| Field             | Nodes that carry it             | Schema                      |
| ----------------- | ------------------------------- | --------------------------- |
| `scale {x, y}`    | image, text, Custom HTML, group | number from 0 to 1000 each  |
| `width`, `height` | image, Custom HTML              | integer from 1 to 1 000 000 |
| `color`           | text, background                | `^#[0-9a-f]{6}$`            |
| `fontSize`        | text                            | integer from 1 to 1 000 000 |
| `fontAssetId`     | text                            | an asset of type `font`     |
| `assetId`         | image                           | an asset of type `image`    |

**The asset references.** An asset is `{ id, type, contentHash }` in the
document's `assets`, with `type` one of `image`, `audio`, and `font`; asset IDs
share the one namespace of D16.3. Exactly three fields refer to an asset: an
image's `assetId` (image), a text's `fontAssetId` (font) — both in the scene and
in groups — and the audio clip's `assetId` (audio). Nothing else does: Custom
HTML is an inline string in its own frame whose policy forbids every load, and
animations, keyframes, the scene, and the root hold no asset reference. The
validator reports a broken reference as `unresolved-asset-reference` and a
wrong type as `asset-type-mismatch`.

**What the host must supply.** The resolver of D27.3, which the Player, the
Producer, and the CLI share, asks for the bytes of every declared asset, used
or not, and checks each hash; a missing one is an error. The renderer refuses a
URL for an ID the document does not declare (`asset-url-unknown`) and needs a
URL for every image and font a node uses. The order of `assets` is observable:
it is the order of the resolver's requests, of font registration, and of the
render manifest, and it enters the hash of the document.

The project owner decided on 2026-09-29: explicit codes for the three asset
failures; `width`, `height`, and `fontSize` rounded like a position; colours
normalised to lower case; and `asset-in-use` derived from the full validation
instead of a list of reference fields kept in `editor-sdk`.

## Decision

> D40: The bus sets the base scale, the size, the colour, the font size, the font, and the image of a node, and adds and removes assets; a value is normalised as its field requires, a referenced asset must exist and be of the type the field expects, and an asset in use is refused with the IDs of what uses it, found by the validator rather than by a list of fields.

### D40.1 The property commands

| Command           | Arguments                   | Nodes (field presence, D30.8)   |
| ----------------- | --------------------------- | ------------------------------- |
| `SetNodeScale`    | `nodeId`, `scale {x, y}`    | those with `scale`              |
| `SetNodeSize`     | `nodeId`, `width`, `height` | those with `width` and `height` |
| `SetNodeColor`    | `nodeId`, `color`           | those with `color`              |
| `SetTextFontSize` | `nodeId`, `fontSize`        | those with `fontSize`           |

- Each sets the node's base value, absolute and idempotent (D30.1); a scale
  animation multiplies the base scale (D16.6). A node without the field is
  `unsupported-node`; the inverse carries the previous value; a command that
  changes no value is a no-op (D38.9).
- **Scale** is two finite numbers from 0 to 1000 inclusive, checked by the
  parser like an opacity (D38.2): anything else is `invalid-argument`, -0
  becomes 0, and nothing is rounded or clamped.
- **Size and font size** are rounded like a position (D15, D30.3): the input
  must be a finite number, `Math.round` makes it an integer (halves towards
  +∞), and -0 becomes 0. Nothing is clamped: the range is the document's, and a
  rounded value outside it — 0.4, which rounds to 0, for example — is
  `invalid-result`. Both `width` and `height` are given; keeping an aspect ratio
  is the caller's affair.
- **Colour** is exactly six hexadecimal digits after `#`, in either case, and is
  normalised to lower case: `#RRGGBB` becomes `#rrggbb`, and `#rrggbb` stays as
  it is. `#rgb`, colour names, alpha, and every other form are
  `invalid-argument`. The document always stores lower case. `SetNodeColor` is
  the only command that edits a property of a background; the structural
  commands of D39 can still add, remove, and reorder a background as a node.
- Every comparison for a no-op is made after the normalisation, so a command
  that only changes the case of a colour, or a size that rounds to the current
  value, writes no history.

### D40.2 The asset of an image and the font of a text

`SetImageAsset (nodeId, assetId)` and `SetTextFont (nodeId, fontAssetId)`
change one reference.

- The node must carry the field (`assetId` or `fontAssetId`), read from the
  node (D30.8); each command requires one asset type, `image` or `font`.
- The asset is looked up in `assets` only. An ID that is not an asset's — a
  node's, even an image node's, a clip's, the scene's — is `unknown-asset`; an
  asset of another type is `asset-type-mismatch`.
- Only the reference changes: the size of the node stays, and the previous asset
  stays in the document. How an image fits its box is PR-21.

### D40.3 Adding and removing an asset

- `AddAsset (asset, index)` inserts `{ id, type, contentHash }` at `index` of
  `assets`, from 0 to the length; the index is required, because the order of
  assets is observable and an inverse must restore it exactly. The parser
  refuses an ID, a type, or a hash of another form than the schema's, read from
  `compositionSchema` (`invalid-argument`). An ID the document uses already,
  whatever the entity, is `id-in-use` (D39.3). Two assets may declare the same
  hash: the schema allows it, and refusing it would be a new rule. The parser
  copies the asset and freezes the copy; `createdIds` is the asset's ID.
- `RemoveAsset (assetId)` removes an asset that nothing uses. Its inverse is an
  `AddAsset` with a frozen copy of the asset at its original index, so undo
  restores the document byte for byte. An ID that is not an asset's is
  `unknown-asset`. The asset's ID counts as removed for the net `createdIds` of
  D39.4.
- Every asset that is not added or removed keeps its place and its object
  identity (D30.7).

### D40.4 An asset in use is found by the validator

`RemoveAsset` keeps no list of the fields that refer to an asset. It builds the
document without the asset, and the full validation that follows every command
(D30.6) reports every reference that no longer resolves:

- Every error of the code `unresolved-asset-reference` whose path, in the
  candidate document, holds the removed asset's ID is a use of that asset. The
  path is followed through the document; the object that holds the field names
  the user with its `id`. Only the structured data of the error — its code and
  its path — is read, never its message.
- When every error of the validation is such a use, the command is refused with
  `asset-in-use`; the details are the IDs of the nodes and the clip that use the
  asset, each once, sorted by code units. Any other error keeps the result
  `invalid-result`, with all the errors as details. So does a use that cannot be
  mapped to a user: a path that does not resolve in the candidate document, a
  field that holds another value, or a holder without a string `id` — the
  command then reports what the validator found rather than a user it cannot
  name. In schema `0.1` every holder of a reference has an `id`.
- A reference field that a future schema adds, and that the validator checks, is
  found without a change to `editor-sdk`.
- Inside a transaction the check is made against the document the earlier
  commands left, like every other check (D38.4).

### D40.5 The order of checks

As in D39.8, the first failure decides the code:

- the property commands: the fields (`invalid-argument`), the node
  (`unknown-node`, `unsupported-node`), then — unless the value does not change
  — the full validation (`invalid-result`);
- `SetImageAsset` and `SetTextFont`: the fields, the node (`unknown-node`,
  `unsupported-node`), the asset (`unknown-asset`, `asset-type-mismatch`), then
  — unless the reference does not change — the full validation;
- `AddAsset`: the fields, the index (`index-out-of-range`), the ID
  (`id-in-use`), and the full validation;
- `RemoveAsset`: the fields, the asset (`unknown-asset`), and the full
  validation, whose uses of the asset are `asset-in-use` (D40.4) and whose other
  errors are `invalid-result`.

### D40.6 Errors, schemas, and what this ADR does not decide

- `EditorError` gains `unknown-asset`, `asset-type-mismatch`, and
  `asset-in-use`. `asset-type-mismatch` is also a code of the validator; the two
  belong to different vocabularies — an `EditorError` and a `ValidationError` —
  and mean the same thing.
- Every command has an exported argument schema, checked against its parser as
  in D31.9. Size and font size are `number` in their schemas, as a position is,
  because the parser rounds; a colour's pattern accepts both cases, because the
  parser normalises.
- `COMMAND_TYPES` ends with `SetNodeScale`, `SetNodeSize`, `SetNodeColor`,
  `SetTextFontSize`, `SetTextFont`, `SetImageAsset`, `AddAsset`, `RemoveAsset`.
- Not decided here: `fit` of an image (PR-21), editing Custom HTML (no
  `SetHtml`, D39.7), the clip's asset (PR-21), AI tools (PR-24), and any change
  to the playground.

## Alternatives considered

- **A list of reference fields in `editor-sdk`** — a third copy of what the
  validator and the renderer already know, which a new field in schema `0.2`
  could leave behind.
- **`invalid-result` for a missing or mistyped asset, or for an asset in use** —
  these are expected situations a host and an AI caller must act on; an explicit
  code names them.
- **Refusing fractional sizes** — sizes come from a pointer as positions do, and
  D15 puts rounding in `editor-sdk`.
- **Refusing upper-case colours** — the case carries no information, and the
  parser is the one normalisation point (D30.3).
- **An `AddAsset` that always appends** — the inverse of removing an asset in the
  middle could not restore the document byte for byte.

## Consequences

- `@kadrion/editor-sdk` gains eight commands, eight argument schemas, and three
  error codes; it still depends on `@kadrion/schema` only.
- A host that adds an asset must supply its bytes on the next load, even while
  nothing uses it; a host that passes asset URLs must stop passing the URL of a
  removed asset.
- The schema, the runtime, the renderer, the Player, the Producer, the
  playground, the golden frames, the parity record, and the Q14 evidence are
  unchanged.

## Verification

- `packages/editor-sdk/test/properties.test.ts`: each property command, its
  normalisation, its no-ops, and the nodes it refuses.
- `packages/editor-sdk/test/assets.test.ts`: `SetImageAsset`, `SetTextFont`,
  `AddAsset`, and `RemoveAsset`; every user of an asset — an image and a text in
  the scene and in a group, and the clip — as the only one; the order of assets
  after an undo; IDs of every kind of entity; and, in isolation, the mapping of
  D40.4 from validation errors to users, on a reference field that schema `0.1`
  does not have. The mapping is tested alone because no validator can report such
  a field yet; its use through `RemoveAsset` is covered by the five end-to-end
  cases of the users of schema `0.1`.
- `packages/editor-sdk/test/schema-coverage.test.ts`: which node types carry each
  field, read from `compositionSchema`.
- `packages/editor-sdk/test/property-arguments-schema.test.ts`: the argument
  schemas against `parseCommand`.
- `packages/editor-sdk/test/history-property.test.ts`: the new commands in the
  seeded sequences, their codes and `createdIds` predicted by the model.
