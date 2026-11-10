# D77 — Elements: nested templates with inputs, schema 0.22

- Status: Accepted — by the project owner on 2026-11-10, after PR-55b was merged
  (PR #86)
- Date: 2026-11-10
- Supersedes: —
- Amends: D21 and D58 (58.4: the core of instantiation lies in the main entry
  of `@kadrion/schema`, since an element is instantiated wherever its
  instance is shown; `@kadrion/schema/template` still exports
  `instantiateTemplate`), D35 (the step from `0.21` to `0.22` and the frozen
  `0.21` schema), and D76 (76.6: a definition may carry a template of its own;
  76.8: `ExpandInstance` refuses an element), each with an
  `Amended by: PR-55b (D77)` line
- Related: D16, D30, D39, D46, D57, D58, D59, D76,
  [phase five](../roadmap/phase-5.md) PR-55b

## Context

PR-55a made a part of a film a definition that instances place (D76). A
reusable element is more: a lower third with a title and a colour, captions
from speech with the timed words and a style. The host fills in values per
placement and replaces the element with a newer version of its source when it
chooses. Templates already say what a host fills in and where it goes (D58,
D59), and instantiation is pure; an element is a definition that is also a
template.

What the repository has, read on 2026-11-10 at `main` `1cc64a7`: schema
`0.21`, 92 commands, a catalogue of 95 entries, a runtime build of 288 424
bytes.

## Decision

> D77: Schema `0.22` gives a definition a `sourceHash` and a `template` of its own, and an instance node `inputs`, the values of the definition's inputs. A definition with a template is an element: every instance shows it instantiated with its own values, exactly as `instantiateTemplate` instantiates a template, by the same pure function. A binding `words` fills the words of a captions node from a list. `SetInstanceInput`, `ClearInstanceInput`, and `ReplaceDefinition` are new commands. Every document of `0.21` renders byte for byte.

### 77.1 The definition

A definition is `{id, sourceHash, width, height, durationUs, nodes, clips,
transitions, template}`:

- `sourceHash` is `""` or `sha256:` and 64 lowercase hex digits: the label of
  the source the host made the definition from, so that the host knows which
  version of an element a document holds. The engine never checks it against
  anything, and an edit inside the definition leaves it as it is: it names
  where the definition came from, not what it is now. The plan called it
  `contentHash`; that name means verified bytes everywhere else (D14), so it
  is not used for a label nobody verifies.
- `template` is the section of D58 and D59, with the same schema as the
  document's. Empty, the definition is a plain nested composition (D76).
  Non-empty, it is an element.

An element's template binds, conditions, and repeats the nodes of its own
definition only, and its conditions and repeats never target the definition
itself (`unresolved-target-reference`). Its inputs hold no assets, and it has
no `asset` or `item-asset` binding (`element-asset-input`): the assets of a
document are one list that a host resolves before rendering (D14), and an
asset per placement would make the set of assets depend on the values of the
instances. A host that needs an image per placement declares the images as
assets of the document and binds them by a condition or by separate
definitions.

Every rule of D58.3 holds inside a definition: a bound property holds its
input's default, so a definition is also valid as it stands.

### 77.2 The values of an instance

An instance node gains `inputs` after `definitionId`: an array of
`{inputId, type, value}` with `type` one of `text`, `number`, `boolean`,
`color`, and `list`. A list value is an array of items, each an array of
`{key, type, value}` in the order of the list's fields. The entries are sorted
by `inputId` in UTF-16 order, each input at most once, so that two instances
with the same values have the same bytes. An input the instance gives no value
takes its default. A value is checked against its input exactly as
instantiation checks a host's value (D58.4): an unknown input is
`unresolved-input-reference`, a value of the wrong type, outside its
constraints, or out of order is `instance-input-invalid`.

The values are stored as `{key, type, value}` lists rather than as an object
keyed by input ID because the schema subset has no maps (D17): every object of
a document has fixed keys.

### 77.3 What an instance shows

An instance of an element shows its definition instantiated with its values:
the definition, seen as a composition of one scene, goes through the steps of
D58.4 and D59.4 — values, bindings, conditions, repeats, placeholders — and
the result, with an empty template, is what D76 places. It is the same pure
function as `instantiateTemplate`, in the main entry of `@kadrion/schema`
(`template-fill.ts`), which `instanceDefinition` calls; the runtime, the
renderer, and the audio plan already read every definition through
`instanceDefinition`, so none of them needs a second path. No cache is kept:
a module holds no state (D20, D24.4), and the instantiation of a definition
is small.

Validation instantiates every element instance of a document it accepts and
validates the instantiation as a definition of the document, so an accepted
document never shows a broken element. Its copies of repeats count towards
one budget of `MAX_REPEAT_IDS` (100 000) for all instances together, refused
with `instance-input-invalid` at `/definitions`.

### 77.4 Timed words

A binding `{id, kind: "words", nodeId, inputId}` writes a list input into the
`words` of a captions node (D57): one word per item, `{text, startUs,
durationUs}` from the item's fields of the same keys. The list's fields must
be exactly `text` (text), `startUs` (number), and `durationUs` (number), in
any order, and the node must be a captions node (`binding-type-mismatch`). As
every binding, the bound words hold the default (D58.3). The words of an
instance are then checked as any captions node's are (D57): an item that
overlaps the one before it fails the instantiation's validation. It works in a
document's template as in an element's.

### 77.5 Commands

- `SetInstanceInput {instanceId, input}` gives an instance a value of one
  input, `input` exactly as the instance stores it: it replaces the old value,
  or inserts the new one where its ID falls. Its inverse is
  `SetInstanceInput` with the old value, or `ClearInstanceInput`.
- `ClearInstanceInput {instanceId, inputId}` removes a value, which then
  takes its default; its inverse is `SetInstanceInput`. The plan named two
  commands; without this third one, setting a value an instance did not give
  could not be undone to the same bytes (D30.5).
- `ReplaceDefinition {definitionId, definition}` replaces a definition whole,
  with the same ID, at its index: the one way to edit an element's template,
  and how a host brings an element to a new version of its source. Its
  inverse is `ReplaceDefinition` with the old definition, so replacing and
  undoing leaves the document byte for byte. It reports the IDs it adds and
  removes, and refuses an added ID the document uses (`id-in-use`).
- Every command but `SetInstanceInput` and `ClearInstanceInput` that would
  leave an instance whose values no longer fit its definition is refused with
  `instance-inputs-mismatch` and the instances' IDs (the first decision of the
  plan): the host clears or sets their values in the same transaction, as it
  removes a transition before its node (D56.7). Keeping the old values and
  reporting would leave a document the validator refuses.
- A node command that breaks a binding inside a definition is refused with
  `binding-in-use` and the binding's ID, as in a document's template (D58.6);
  `ReplaceDefinition` is the template command of a definition.
- `ExpandInstance` refuses an element, a definition with a source hash, and an
  instance with values (`instance-not-expandable`): the nodes placed directly
  would lose the template. `ConvertToDefinition` makes a definition with
  `sourceHash: ""` and an empty template.
- `SetTemplateInput` writes the new default of a list into the words of the
  captions nodes bound to it.
- `describe_document` shows each definition's `sourceHash` and `template`;
  an instance's values are among its fields.
- New code of the bus: `instance-inputs-mismatch`. 95 commands and a
  catalogue of 98 entries.

A document may hold two versions of one element (the plan's second decision):
two definitions with their own IDs, the same or different source hashes. The
engine does not know what a version is; the host names it.

### 77.6 The preview

`@kadrion/editor-session` needs no change: the Player renders an element
through `instanceDefinition`, and `isTemplate` reads the document's own
template only, so a document with elements is not a template and is shown as
it is.

### 77.7 Schema `0.22` and the step from `0.21`

The step from `0.21` gives every instance `inputs: []` after `definitionId`,
and every definition `sourceHash: ""` after `id` and an empty `template` as
its last key: no element, as it always had. The frozen `0.21` schema reads the
old documents (D35).

### 77.8 Not included

- **A binding of a document's input into an instance's values**: a template
  that fills an element would need a second kind of binding target; a host
  instantiates the template and sets the values.
- **Inputs of an asset type in an element**: 77.1.
- **The library of elements, their storage, and their versions**: the host's
  (D02).

## Alternatives considered

- **Keep the old values of instances after a replacement and report them.**
  The document would fail validation, which the bus never returns (D30.6).
- **An object of values keyed by input ID.** The schema subset has no maps
  (D17).
- **Instantiate on the host and store the result.** The document would hold
  each instantiation and lose the element; the preview and the render would
  need the host.
- **A cache of instantiations.** A module-level cache is state the lint rules
  of D20 and D24.4 forbid; the instantiation is cheap.
- **Edit an element's template by the nine template commands with a
  `definitionId`.** It doubles the template commands; a definition is
  replaced whole, as the host replaces a version.

## Consequences

- `@kadrion/schema`: schema `0.22`, the type `InstanceInput`, the binding
  `words`, `sourceHash` and `template` of a definition, `inputs` of an
  instance, the codes `element-asset-input` and `instance-input-invalid`, the
  core of instantiation in the main entry, the frozen `0.21` reader, and the
  step.
- `@kadrion/editor-sdk`: three commands and one code, 95 commands;
  `describeDocument` shows `sourceHash` and `template` of a definition.
  `@kadrion/ai-sdk`: three tools, a catalogue of 98 entries.
- The change of the API is additive (new exports, commands, a code, fields of
  a description) and breaking (schema `0.22` in `SCHEMA_VERSION`; `Command`
  gains members; a definition and an instance gain keys; the template binding
  gains a kind).
- `@kadrion/test-fixtures`: the elements composition (640×360, 2 s: a lower
  third with a title, an accent colour, and a badge shown on a condition,
  placed twice with other values, and captions from speech with the timed
  words and a style choosing one of two captions nodes), its 4 golden frames,
  the `0.22` corpus, and the negative cases of every new rule.
- The runtime build grows to 320 490 bytes; its hash changes, so the golden
  frames are written again and parity is measured again.
- Q14 stays open.

## Verification

- Unit tests of the schema (`packages/schema/test/elements.test.ts`, the
  migration and invalid corpora): the step 0.21 → 0.22, values checked and
  sorted, the words binding, element rules, the budget of copies, and the
  same instantiation whatever was instantiated before.
- Unit tests of the runtime (`packages/runtime/test/elements.test.ts`): every
  instance of the fixture at every golden time has exactly the state of its
  definition instantiated by `instantiateTemplate` and placed directly.
- Unit tests of the renderer (`packages/renderer-dom/test/elements.test.ts`):
  the nodes of each instantiation, the values written, and the same tree
  whatever was rendered before.
- Unit tests of the commands (`packages/editor-sdk/test/elements.test.ts`):
  each command and its inverse to the same bytes, the refusals, and a
  replacement in one transaction with the values it needs, undone byte for
  byte.
- In pinned Chromium (`tests/pinned/nested.pinned.test.ts`): an element
  instance renders the pixels of its definition instantiated and placed
  directly at four times, and the elements composition meets its 4 golden
  frames. The existing golden PNG files stay byte for byte.
- Parity of the Player against the Producer measured again.
