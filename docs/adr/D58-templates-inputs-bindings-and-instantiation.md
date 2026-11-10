# D58 — Templates: schema 0.8, inputs, bindings, and instantiation

- Status: Accepted — by the project owner on 2026-11-02, after PR-34a was merged
  (PR #31)
- Date: 2026-11-02
- Supersedes: —
- Amended by: PR-34b (D59) on 2026-11-02: the section gains `conditions` and `repeats`, item bindings and `{{list.key}}` placeholders, and instantiation applies conditions and repeats (D59.1–D59.4)
- Amended by: PR-55b (D77) on 2026-11-10: 58.4: the core of instantiation lies in the main entry of `@kadrion/schema`, since an element instance is instantiated wherever it is shown; `@kadrion/schema/template` still exports `instantiateTemplate`; the binding kind `words` (D77.3, D77.4)
- Amended by: PR-56 (D78) on 2026-11-10: the binding kind `parameter`, which fills a parameter of a Custom HTML element (D78.3)
- Extends: D17 (the schema subset gains `type: "boolean"`), D25 (the Player
  refuses a template), D35 (the step from `0.7`), D44 (the session previews a
  template as its instantiation), and D46 (five tools), each with an
  `Amended by: PR-34a (D58)` line
- Related: D02, D09, D14, D16, D28, D30, D38, D39, D49,
  [roadmap of phase three](../roadmap/phase-3.md) PR-34a

## Context

Studio item 9 of the roadmap needs a composition that a host fills in: a
title, a number, a colour, a photo, a list of people. The plan for PR-34a asks
for a template section in the document with typed inputs (text, number,
boolean, colour, image, video, audio, and a list of objects of those types),
each with a stable ID, constraints, and a default; bindings from node
properties to inputs, either a whole property or a text with placeholders,
without an expression language; and a pure, deterministic
`instantiateTemplate(template, values)` that validates the values, applies
them, removes the template section, and validates the result. The template is
edited with the commands of a composition plus commands of its own, and the
Player previews it as its instantiation with the defaults. Conditions and
repetition are PR-34b (D59).

What the repository has, read on 2026-11-02 at `main` `a2a2e58`: schema `0.7`
with scenes, transitions, captions, and nodes `background`, `group`, `image`,
`text`, `video`, `custom-html`, and `captions` (D57); a schema subset (D17)
whose objects are closed with every property required and whose `oneOf` is
discriminated by a `const`, and which has no `boolean` (D52 chose
`volume: 0` over `muted` for that reason); one namespace of IDs for the
document (D16.3); and 53 commands in the closed registry.

## Decision

> D58: Schema `0.8` adds a required `template` section of `inputs` and `bindings`, empty in a composition that is no template; a bound property or asset always holds its input's default, so a template is a valid composition of its defaults; `instantiateTemplate` of `@kadrion/schema/template` makes a composition from a template and values, purely and with typed errors that name the input; the Player and the Producer refuse a template, and the session previews its instantiation with the defaults; five commands edit inputs and bindings.

### D58.1 Inputs, and `boolean` in the schema subset

`template` is the last key of the composition: `{ inputs, bindings }`, both
arrays, both required. An input is one of these objects, discriminated by
`type`; every field is required (D16):

| `type`                    | Constraints                                       | `default`            |
| ------------------------- | ------------------------------------------------- | -------------------- |
| `text`                    | `minLength`, `maxLength`: code points, 0–10⁶      | a string             |
| `number`                  | `minimum`, `maximum`: inclusive, ±(2⁵³ − 1)       | a finite number      |
| `boolean`                 | none                                              | `true` or `false`    |
| `color`                   | none                                              | `#rrggbb`            |
| `image`, `video`, `audio` | none                                              | a content hash (D14) |
| `list`                    | `minItems`, `maxItems` (0–10 000), `fields` (≥ 1) | an array of items    |

- An input's `id` is an ID of the document, unique in its one namespace
  (D16.3), so a command or an error can name it without saying what it is.
- A list's `fields` are `{ key, type, …constraints }` of the six scalar types
  above, keyed by a `key` unique in the list. An item of the default is an
  array of `{ key, type, value }`, one per field in the order of the fields,
  so that the closed, required subset can describe it; a host gives an item as
  a plain object instead (D58.4).
- One rule the schema cannot state, `template-input-invalid`: a minimum above
  its maximum, a key used twice, or a default that breaks its input's
  constraints. A text's length counts Unicode code points, as JavaScript's
  string iterator does, so no engine's grapheme tables are involved.
- **`boolean` in the subset (amends D17).** `type: "boolean"`, with no other
  keyword, joins the validator's keywords and the derived types. Without it a
  template could not offer a switch, and the conditions of D59 need one. A
  boolean is a value a host gives, not a property of a node; D52's `volume`
  stays as it is.
- Booleans and lists are declared and validated here, but no binding reads
  them until D59 (conditions and repetition).

### D58.2 Bindings and placeholders

A binding is one of three objects, discriminated by `kind`; each has an `id`
in the document's namespace:

- `property` — `{ id, kind, nodeId, property, inputId }`: the node's
  `property` takes the input's value whole. `property` is `text` (a text node,
  a text input) or `color` (a text or background node, a colour input).
- `placeholders` — `{ id, kind, nodeId }`: the text of the text node is a
  pattern. Every `{{inputId}}`, with an ID of the document's form, stands for
  the value of a text or number input; a number is written as ECMAScript
  writes it. There is no escape and no expression: a `{{` that does not begin
  such a placeholder is `invalid-placeholder`, so a pattern is never
  ambiguous, and the text of a value is never read as a pattern again.
- `asset` — `{ id, kind, assetId, inputId }`: the asset's `contentHash` takes
  the value; the input's type is the asset's type.

New validation codes: `unresolved-input-reference` (a binding or placeholder
names no input), `binding-type-mismatch` (an input of another type, or a
target that takes no binding), and `duplicate-binding-target` (two bindings
write one property, one text, or one asset). A binding to a node or an asset
that does not exist is the existing `unresolved-node-reference` or
`unresolved-asset-reference`.

### D58.3 A bound target holds its input's default

A property or an asset bound to an input holds that input's default:
`binding-value-mismatch` otherwise. A placeholder text holds its pattern.

- So a template is a valid composition as it stands, every asset it names is
  one the host can resolve, and a reader of the document — a host, the AI,
  `describe_document` — sees the defaults where they are shown.
- The price is that a default lives in two places; the commands keep them
  together (D58.6), and the validation refuses a document where they differ.

### D58.4 Instantiation

`@kadrion/schema/template` is an entry point of its own, like
`@kadrion/schema/migrate`, so the render page carries none of it (D21). It
exports:

- `instantiateTemplate(template: ValidatedComposition, values: unknown)`,
  which returns `{ ok: true, composition }` or `{ ok: false, errors }`:
  1. `values` must be a plain object (`invalid-values`). Every own key must be
     an input (`unknown-input`). Every value must have its input's type and
     constraints (`invalid-input-value`); a list's value is an array of plain
     objects with exactly the fields' keys. An input left out takes its
     default. Every error has a `code`, the `inputId` it is about, the `path`
     of the value (`/team/0/name`), and a message; all errors are reported at
     once.
  2. Every binding writes its value: a property whole, an asset as its
     content hash, a placeholder as text.
  3. The template section is emptied, and the result is validated as a
     composition; a failure there is `invalid-composition` with the
     validation's paths.

  It is pure and deterministic: no clock, no randomness, no input written;
  the same template and values give the same document, key order included,
  and so the same `compositionHash` (D28.7). A template without inputs gives
  itself without the section.

- `templateDefaults(template)`: the defaults, keyed by input ID, as a host
  gives values; and `isTemplate(composition)`, true when either list of the
  section is non-empty, which the main entry exports too.

**The Player and the Producer refuse a template (amends D25).** Rendering a
template as it stands would show its patterns (`{{name}}`). Both refuse a
document for which `isTemplate` holds with `invalid-document` and a message
that names instantiation; the host renders `instantiateTemplate`'s result.

**The session previews a template (amends D44).** `@kadrion/editor-session`
keeps the template on its bus, so every command edits the template, and
sends the Player `instantiateTemplate(document, {})`, the template with its
defaults. By D58.3 the preview differs from the document only in the text of
its placeholders.

### D58.5 The step from `0.7`

`step07To08` sets `schemaVersion` to `0.8` and appends
`"template": { "inputs": [], "bindings": [] }` as the last key: a composition
that is no template. No time value moves (D49.7). The frozen
`compositionSchemaV07` reads `0.7` (D35); the compatibility corpus gains
`compatibility/v0-8/`, every entry is read by `0.8` too, and the earlier
corpora keep their bytes.

### D58.6 Commands and tools

| Command                 | Arguments          | Effect                                                                | Inverse                                       |
| ----------------------- | ------------------ | --------------------------------------------------------------------- | --------------------------------------------- |
| `AddTemplateInput`      | `index`, `input`   | inserts an input                                                      | `RemoveTemplateInput`                         |
| `RemoveTemplateInput`   | `inputId`          | removes an input that nothing binds                                   | `AddTemplateInput` with its bytes and index   |
| `SetTemplateInput`      | `inputId`, `input` | replaces an input, and writes its new default into every bound target | `SetTemplateInput` with the old input         |
| `AddTemplateBinding`    | `index`, `binding` | inserts a binding; its target must already hold the default           | `RemoveTemplateBinding`                       |
| `RemoveTemplateBinding` | `bindingId`        | removes a binding; its target keeps its value                         | `AddTemplateBinding` with its bytes and index |

- Inputs and bindings are exact data judged by the document's validation, as
  a node of `AddNode` is (D39); a failure is `invalid-result`. A taken ID is
  `id-in-use`; an index past the end `index-out-of-range`. `SetTemplateInput`
  keeps an input's ID: another `input.id` is `invalid-result`. An edit that
  changes nothing is no edit (D30.9).
- New editor codes: `unknown-input`, `unknown-binding`, `input-in-use` (the
  removed input is still bound; the details are the binding IDs), and
  `binding-in-use`: any other command that would break a binding — remove its
  node or asset, change a bound property or asset away from the default, make
  a placeholder text no pattern — is refused with the binding IDs. The host
  changes the value with `SetTemplateInput`, or removes the binding first, in
  the same transaction.
- Five tools from the metadata of the five commands (D46); the catalogue has
  58 tools. `describe_document` shows the template section.

### D58.7 What this ADR does not decide

- Conditions and repetition, and so any binding of a boolean or a list: D59.
- Bindings of other properties (position, size, a font, a video's source
  range), formatting of numbers, and expressions.
- Where a host stores templates and their values (D02).

## Alternatives considered

- **Bound targets that hold anything, filled only at instantiation.** The
  template would then not be a valid composition of its defaults: the
  Player could not preview it without instantiating, an asset the template
  names might be none the host has, and a reader would see stale values.
- **Placeholders everywhere, with an escape for `{{`.** One kind of binding
  would do, but a placeholder in a colour or a hash would leave the property
  invalid until instantiation, and an escape adds a second grammar to every
  text. A whole-property binding keeps every target typed.
- **Inputs outside the document, in the host.** The host would have to keep
  them in step with the nodes they write; the plan puts them in the document
  so that one version holds both (D02).
- **List defaults as plain objects.** The schema subset has no open maps
  (D17); an item as an array of `{ key, type, value }` is closed and
  discriminated like every other value.
- **A `muted`-style boolean on nodes.** Not needed: booleans are values a
  host gives, read by conditions in D59.

## Consequences

- `@kadrion/schema`: schema `0.8`, `boolean` in the subset, the section and
  its types, the six validation codes, the frozen `0.7` reader, the step, and
  the entry point `@kadrion/schema/template`.
- `@kadrion/player` and `@kadrion/producer`: the refusal of a template.
- `@kadrion/editor-session`: the preview of a template.
- `@kadrion/editor-sdk`: five commands, four codes, and `binding-in-use` for
  every other command.
- `@kadrion/ai-sdk`: five tools; the catalogue's snapshot.
- `@kadrion/test-fixtures`: the template composition (640×360, 2 s, every
  input type, every binding kind), the `0.8` corpus with an input of every
  type, the frozen reference and negative corpus of `0.7`, and every fixture
  at `0.8`.
- The runtime build changes only by the schema it holds, so the golden PNGs
  keep their bytes while their manifests are written again, and parity is
  measured again. Q14 is not touched.

## Verification

- Negative fixtures for every new code and field; the migration pair
  `0.7 → 0.8` and the invalid corpus of `0.7`.
- Instantiation: defaults, values through every binding kind, numbers as
  text, a value that looks like a placeholder kept verbatim, every refusal
  with its input and path, determinism, and a composition without inputs
  given back unchanged (`packages/schema/test/template.test.ts`).
- The five commands, their exact inverses, `SetTemplateInput` writing
  defaults, `input-in-use`, and `binding-in-use` from other commands
  (`packages/editor-sdk/test/templates.test.ts`).
- The Player and the Producer refusing a template; the session sending the
  Player the instantiation while its bus holds the template.
