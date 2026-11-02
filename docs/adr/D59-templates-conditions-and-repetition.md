# D59 — Templates: schema 0.9, conditions, and repetition

- Status: Accepted — by the project owner on 2026-11-02, after PR-34b was merged
  (PR #33)
- Date: 2026-11-02
- Supersedes: —
- Extends: D35 (the step from `0.8`), D46 (four tools), and D58 (the template
  section gains `conditions` and `repeats`, two binding kinds, item
  placeholders, and the order of instantiation), each with an
  `Amended by: PR-34b (D59)` line
- Related: D02, D14, D16, D28, D39, D49, D54, D56, D57,
  [roadmap of phase three](../roadmap/phase-3.md) PR-34b

## Context

PR-34a (D58) gave a template typed inputs and bindings of whole properties,
placeholders, and assets. It declared booleans and lists and left every
reading of them to this ADR. The plan for PR-34b asks for:

- a condition on a node or a scene from a closed set of predicates on inputs
  (empty, not empty, equal, true);
- repetition of a node or a scene for each item of a list input, with the
  fields of an item bound like inputs and the times of the copies computed by
  a stated rule;
- every ID of a copy derived injectively from the template ID and the index,
  as D39 does for copies;
- typed errors for a limit on repeats.

Its acceptance:

- `n` items give `n` copies with distinct, predictable IDs and contiguous
  times;
- a false condition removes the element and every reference to it;
- a limit is a typed error.

What the repository has, read on 2026-11-02 at `main` `c69ccee`:

- schema `0.8` with the section `{ inputs, bindings }` (D58);
- scenes with local time and transitions between scenes and between clips
  (D54, D56);
- caption words timed in the time of their scene (D57);
- 58 commands in the closed registry.

## Decision

> D59: Schema `0.9` gives the template section `conditions` and `repeats`; a condition keeps or removes one scene or node by a closed test of one input, and a repeat copies one scene or node once for each item of a list input, back to back, with copy IDs `<id>--<k>`; two binding kinds and `{{list.key}}` placeholders write the fields of the item of each copy; `instantiateTemplate` applies inputs, then conditions, then repeats, then placeholders, and refuses more than 100 000 copied IDs with `repeat-limit`; four commands edit conditions and repeats.

### D59.1 Conditions

A condition is `{ id, test, targetId, inputId }`, plus `value` for the two
equality tests. `targetId` names a scene or a node, at any depth; `inputId`
names an input whose type the test reads:

| `test`                | Input           | Holds when                          |
| --------------------- | --------------- | ----------------------------------- |
| `empty`, `not-empty`  | `text` / `list` | the text or the list is (not) empty |
| `true`, `false`       | `boolean`       | the value is `true` / `false`       |
| `equal-text{value}`   | `text`          | the text is `value`, code for code  |
| `equal-number{value}` | `number`        | the number is `value`               |

- An element is kept only when every condition that names it holds. There is
  no `or` and no expression; a host that needs one adds an input.
- A removed scene or node takes with it everything inside it and every scene
  or clip transition that names it, so nothing refers to it any more. The
  duration of the composition is computed again (D59.4).
- New validation codes: `unresolved-target-reference` (no scene or node has
  the `targetId`) and `condition-type-mismatch` (the test reads another type).
  An unknown `inputId` is D58's `unresolved-input-reference`.

### D59.2 Repeats and the IDs of copies

A repeat is one of two objects, discriminated by `duration`:

- `{ id, duration: "target", targetId, inputId }`: each copy lasts as long as
  its target: a scene its `durationUs`, a node its lifetime.
- `{ id, duration: "field", targetId, inputId, key }`: each copy lasts the
  number of microseconds in the field `key` of its item. The field is a
  `number`; at instantiation its value must be a safe integer of at least 1,
  or the values are refused with `invalid-input-value` at the item's path.

The rules:

- `inputId` names a `list` input (`repeat-type-mismatch` otherwise), and
  `key` one of its fields of type `number` (`unresolved-field-reference` when
  there is no such field, `repeat-type-mismatch` when it is of another type).
- A target is repeated at most once and never inside another repeated target:
  `nested-repeat`. Nested lists are outside this ADR.
- A node that is a side of a clip transition cannot be repeated
  (`repeat-in-transition`), because its copies would not keep the overlap the
  transition needs (D56). A scene that a scene transition names can be.
- **IDs of copies.** Copy `k` (from 0) of every element and asset inside a
  repeated target has the ID `<id>--<k>`. The form is reserved: an ID of the
  document of the form `<id>--<k>`, where `<id>` is an ID a repeat copies, is
  `repeat-id-reserved`. With that rule the derivation is injective over the
  whole instantiated document. An ID inside the copy that refers to a copied
  element or asset (a group's children, a transition's sides, an `assetId`)
  is renamed with it.

### D59.3 Fields of items

Two new binding kinds write the field `key` of the item of each copy:

- `item-property`: `{ id, kind, nodeId, property, inputId, key }`, with
  `property` `text` or `color` as in D58.2;
- `item-asset`: `{ id, kind, assetId, inputId, key }`. At instantiation the
  asset becomes one asset per item, `<assetId>--<k>`, and the original is
  removed.

A placeholder text may also hold `{{list.key}}`, which stands for the field of
the item of its copy, a number written as ECMAScript writes it.

- A target of an item binding or item placeholder must lie inside the target
  of a repeat over that list: `item-outside-repeat` otherwise. An item-bound
  asset must be used only inside such a target.
- An item-bound target is not compared with a default (D58.3 holds only for
  inputs): the list's default items may differ from each other, and the
  template keeps the value it shows.

### D59.4 Instantiation

`instantiateTemplate` (D58.4) works in this order:

1. The values are validated, and so is the duration field of each item.
2. Every binding of an input writes its value.
3. Every element whose conditions do not all hold is removed, with what lies
   inside it and every transition that names it.
4. Every repeat replaces its target by its copies, in the order of the items:
   - **Scenes.** Copies of a scene keep their local time. A scene transition
     into the repeated scene goes to the first copy, and one out of it from
     the last copy. With zero items both transitions are removed.
   - **Nodes.** Copy `k` of a node starts where copy `k − 1` ends. Its
     lifetime, its keyframes, its caption words, and its children move by
     the sum of the durations before it, computed in `BigInt`. A time beyond
     the safe integers is `repeat-limit`.
   - Item bindings and item placeholders write the item of their copy.
5. Every placeholder of an input becomes the text of its value.
6. `durationUs` becomes the sum of the scenes less the sum of the scene
   transitions (D56).
7. The section is emptied, and the result is validated as a composition.

**Limit.** `MAX_REPEAT_IDS = 100 000`. When all the copies together would
hold more IDs than that, the values are refused with `repeat-limit`, the
`inputId` of the list, and the path `/inputId`, before anything is copied. The
limit keeps a host's values from making a document that no render can hold.
The list's own `maxItems` (D58.1) still applies.

The result stays pure and deterministic: the same template and values give
the same document and the same `compositionHash` (D28.7).

### D59.5 The step from `0.8`

`step08To09` sets `schemaVersion` to `0.9` and appends `"conditions": []` and
`"repeats": []` to the template section. No time value moves (D49.7).
The rest of the step:

- The frozen `compositionSchemaV08` reads `0.8`, and a `0.8` document that
  uses an item placeholder is `invalid-placeholder`, as it was.
- The compatibility corpus gains `compatibility/v0-9/` and the repeats
  fixture. Earlier corpora keep their bytes.

### D59.6 Commands and tools

| Command                   | Arguments            | Effect              | Inverse                                         |
| ------------------------- | -------------------- | ------------------- | ----------------------------------------------- |
| `AddTemplateCondition`    | `index`, `condition` | inserts a condition | `RemoveTemplateCondition`                       |
| `RemoveTemplateCondition` | `conditionId`        | removes a condition | `AddTemplateCondition` with its bytes and index |
| `AddTemplateRepeat`       | `index`, `repeat`    | inserts a repeat    | `RemoveTemplateRepeat`                          |
| `RemoveTemplateRepeat`    | `repeatId`           | removes a repeat    | `AddTemplateRepeat` with its bytes and index    |

- They follow D58.6: exact data judged by the document's validation
  (`invalid-result`), `id-in-use`, and `index-out-of-range`. Two new codes:
  `unknown-condition` and `unknown-repeat`.
- `binding-in-use` now covers conditions and repeats. Its details name the
  binding, condition, or repeat that a command would break. Some examples:
  - removing the target of a condition;
  - removing a repeat whose items a binding still reads;
  - adding a clip transition to a repeated node.
- `input-in-use` covers an input that a condition or a repeat reads.
- Four tools come from the metadata of the four commands (D46), so the
  catalogue has 62 tools. `describe_document` shows the whole section.

### D59.7 What this ADR does not decide

- Nested repeats, repeats of clips or transitions, and an `or` of conditions.
- Conditions on items (show a node of a copy only for some items).
- Formatting of numbers, and expressions.

## Alternatives considered

- **Conditions as a field of nodes and scenes.** Every node type would gain a
  field that only templates read. The section keeps the composition model as
  it is, and keeps a template's rules in one place.
- **IDs of copies from a hash of the template ID and the index.** Such IDs
  are injective only up to collisions and cannot be read. `<id>--<k>`, with
  the form reserved, is injective by construction and predictable, as the
  acceptance asks.
- **Copies of nodes on top of each other.** This keeps the times, but then a
  list of credits would show at once and not one after another. The
  acceptance asks for contiguous times.
- **One duration rule only.** Taking only the target's duration cannot give
  copies of different lengths. Taking only a field forces a field on every
  list. Both rules are cheap, and the `duration` discriminator keeps them
  closed.

## Consequences

- `@kadrion/schema`: schema `0.9`, the section's new types and eight new
  validation codes, a shared structure of the template (which repeat holds
  each element), the frozen `0.8` reader, the step, and the new order of
  `instantiateTemplate` with `MAX_REPEAT_IDS` and `repeat-limit`.
- `@kadrion/editor-sdk`: four commands, two codes, and the wider
  `binding-in-use`.
- `@kadrion/ai-sdk`: four tools, and the catalogue's snapshot.
- `@kadrion/test-fixtures`:
  - the repeats template (640×360) and its hand-written instantiation with
    the defaults;
  - the `0.9` corpus, the frozen reference and negative corpus of `0.8`, and
    the migration pair;
  - every fixture at `0.9`.
- The runtime build changes only by the schema it holds. The golden PNGs keep
  their bytes, their manifests are written again, and parity is measured
  again. Q14 is not touched.

## Verification

- Negative fixtures for every new code, and the migration pair `0.8 → 0.9`.
- Instantiation (`packages/schema/test/template-flow.test.ts`):
  - the repeats fixture with its defaults equals its hand-written expectation;
  - `n` items give `n` copies with IDs `--0` to `--n−1` and contiguous times,
    and zero items give none;
  - conditions remove elements and their transitions;
  - field durations, item assets, and `repeat-limit`;
  - the result is deterministic.
- The four commands with exact inverses, and `binding-in-use` from other
  commands (`packages/editor-sdk/test/template-flow.test.ts`).
