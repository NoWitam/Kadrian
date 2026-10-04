# D43 — Saved compositions: the JSON text, explicit loading, and the compatibility corpus

- Status: Accepted — by the project owner on 2026-10-04, after the reviews of
  the implementation; the decisions are the owner's of the same day
- Date: 2026-10-04
- Supersedes: —
- Amends: D35 (35.3) and D42 (D42.9), each with an `Amended by: PR-22 (D43)`
  line, additively: a second explicit function of the host
- Related: D02, D13, D16, D17, D24, D28, D30, D32, D38,
  [roadmap of phase two](../roadmap/phase-2.md) PR-22

## Context

The roadmap asks that a host can save a document and load it again in a later
version: a saved format, the negotiation of the version, migration on load, and
a corpus of documents of every version that must keep loading.

What the repository fixes already, as read on 2026-10-04:

- Taskio stores project versions, and Kadrion owns the schema (D02).
- `validateComposition` accepts the current version only, and the Player, the
  Producer, the CLI, the render page, and the command bus call it: none of them
  migrates (D17, D42.9).
- `migrateComposition`, behind the entry `@kadrion/schema/migrate`, carries
  parsed data forward explicitly and reports the versions it went through
  (D35.3, D42.8). It is outside the runtime artifact and outside the Player's
  dist tree.
- The identity of a document is `compositionHash`,
  `sha256(canonicalJson(document))` (D28.7): keys sorted, no white space,
  numbers as `JSON.stringify` writes them.
- Nothing states what a saved document is. Text is read by ad-hoc `JSON.parse`
  calls in the CLI, the playground, the Player, and the Producer, and no
  package writes a composition file.
- A command bus is bound to one document for its life; loading a document
  creates a new bus (D32, D38).

The project owner decided the points below on 2026-10-04.

## Decision

> D43: A saved composition is the composition itself as JSON text, without an envelope and without a version of its own beside `schemaVersion`; a host reads it with `parseComposition`, which migrates explicitly, and writes it with `serializeComposition`, which never does, and a frozen corpus of saved documents of every supported version must keep loading.

### D43.1 The saved document

- The saved form of a composition is the JSON text of the composition value.
  There is no envelope, no wrapper object, and no version of a file format: the
  only version is the document's own `schemaVersion`.
- Whatever a host keeps around a document — names, owners, revisions — is the
  host's (D02). Kadrion defines no field for it.

### D43.2 The text

- It is one JSON value, an object. Kadrion's own code reads it with
  `JSON.parse` and writes it with `JSON.stringify`, and adds no rule of its
  own to JSON's.
- White space and the order of the keys carry no meaning: the validator does
  not depend on the order (D17), a changed order needs no version (D35.7), and
  `compositionHash` sorts the keys (D28.7). The identity of a document is its
  `compositionHash`, never its bytes: two texts of one document may differ.
- **Numbers are what `JSON.parse` makes of them.** Every check sees the parsed
  double, not the decimal spelling: `1e7` and `10000000.0` are the integer
  10 000 000; `9007199254740991.4` reads as 2^53 − 1 and is accepted where
  that is; `9007199254740993` reads as 2^53 and is out of range; `1e999` reads
  as `Infinity` and is no JSON number.
- **`-0`** is a valid value in memory and is read from the text `-0` as such.
  `JSON.stringify` writes it as `0`, and so does `canonicalJson`: the hash of a
  document does not see the difference, and a document that is saved and
  loaded again equals the original except that a `-0` has become `0`.
- **A byte order mark is not JSON.** `JSON.parse` refuses it, and so the text
  is refused; it is not stripped.
- **Of two equal keys of one object the last one wins**, as `JSON.parse` has
  it. This is a stated boundary, not a check: a text with a repeated key is
  read as the document its last keys spell. A strict scanner of Kadrion's own
  was not written (Alternatives).
- The encoding of the text as bytes is the host's; where Kadrion reads or
  writes a file it is UTF-8.

### D43.3 `serializeComposition`

```ts
type SerializeCompositionResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };
function serializeComposition(document: unknown): SerializeCompositionResult;
```

- It runs `validateComposition` and, for a valid document of the current
  version, returns `JSON.stringify(document)`: compact, without a trailing
  newline, the keys in the order the document has them. It is the text the
  Player and the Producer hand to the render page.
- **It never migrates.** A document of an earlier version is refused with the
  validator's `unsupported-schema-version`, like every document the validator
  refuses, with all of its errors.
- It neither writes nor freezes the document. The result object and its
  `errors` array are frozen.

### D43.4 `parseComposition`

```ts
interface CompositionTextError {
  readonly code: 'not-a-string' | 'invalid-json';
  readonly message: string;
}
type ParseCompositionResult =
  | {
      readonly ok: true;
      readonly composition: ValidatedComposition;
      readonly versions: readonly SchemaVersion[];
    }
  | { readonly ok: false; readonly stage: 'text'; readonly error: CompositionTextError }
  | {
      readonly ok: false;
      readonly stage: 'document';
      readonly version: SchemaVersion | null;
      readonly versions: readonly SchemaVersion[];
      readonly errors: readonly ValidationError[];
    };
function parseComposition(text: string): ParseCompositionResult;
```

- The sequence: the type of the argument is checked; `JSON.parse` reads the
  text; `migrateComposition` judges and carries what it holds (D42.8). Nothing
  else happens.
- **A success** is the success of the migration: a new, validated composition of
  the current version, and `versions` — `['0.1', '0.2']` for a migrated
  document, `['0.2']` for one that was current.
- **`stage: 'text'`**: no document was reached. `not-a-string` when the argument
  is no string, which the signature forbids and a JavaScript host can still
  send; `invalid-json` when `JSON.parse` throws. The message is a fixed text of
  Kadrion, because the engine's own differs between runtimes.
- **`stage: 'document'`**: the text is JSON, and the migration refused what it
  holds. `version`, `versions`, and `errors` are exactly those of
  `migrateComposition`: an unknown version is one `unsupported-schema-version`
  with `version: null`; an invalid document carries every error of its
  validation, which may be several.
- Only what `JSON.parse` throws becomes `invalid-json`. The migration runs
  outside that `try`: nothing it reports is ever relabelled as a fault of the
  text.
- **Ownership.** The composition is a new tree that belongs to the caller and
  is not frozen. The result object, its `versions` and `errors` arrays, and the
  `CompositionTextError` are frozen.
- **No exceptions for a string.** For any string the result is a value. This
  holds for very deeply nested text too, which is tested; whether such a text
  is refused as JSON or as a document is the engine's affair.
- The error codes of the text live in this module. `ValidationErrorCode` gains
  none, because its module is part of the runtime artifact.

### D43.5 The versions a build supports

- `SUPPORTED_SCHEMA_VERSIONS` is the frozen list of the versions this build can
  carry forward, oldest first; the last one is the current version. It is read
  from the table the migration runs, not kept beside it.
- This is the whole negotiation: a host that holds a document of a listed
  version may send it, and a version that is not listed is refused with
  `unsupported-schema-version` — never read as the nearest known one.
- **Supported for migration is not accepted by the validator.** The list says
  what `parseComposition` and `migrateComposition` can carry forward. Only its
  last version is accepted by `validateComposition`, and so by
  `serializeComposition`, the Player, the Producer, the CLI, and the command
  bus (D43.7). The validator's own message for an earlier document — that this
  build supports `"0.2"` — speaks of that narrower sense, and is unchanged;
  the message of the migration entry names every listed version.

### D43.6 The compatibility corpus

- `packages/test-fixtures/src/compatibility/` holds the corpus and its
  `manifest.json`. An entry names a saved document, the versions loading must
  report, and the document of the current version it must load as, which is
  **written by hand** (D35.5), never produced by a migration.
- **The boundary.** The directory is the corpus, whole and alone. Every file of
  it other than the manifest is the input or the expected document of an entry,
  and no entry names a file outside it. A file lies in the directory of the
  version it names: `v0-1/` holds documents of `0.1`.
- **Copies, with their provenance.** The corpus began with five fixtures of
  `compositions/` — the reference composition in both versions, the migration
  pair, the lifetime fixture. It holds **copies of their bytes**, not the files:
  the next schema version will rewrite those fixtures, and what must keep
  loading may not change with them. The manifest records for every file where
  its bytes come from: the fixture and the commit of a copy, or the change that
  wrote the file for the corpus.
- **A frozen input and an expectation are two roles.** The input of an entry is
  frozen: once committed its bytes never change, formatting included. The
  expected document of an entry is the expectation for the **current migration
  target**, and every frozen input keeps one. Entries share an expectation
  where what they must load as is identical, the tested order of keys
  included: one hand-written document serves them all.
- **A later schema version** adds a directory of its own with the hand-written
  expectations for the new target, one document for every distinct result, and
  re-points every entry at its expectation there. The entries are **not
  duplicated** for the new version: it gets entries of its own, at least one,
  for saved documents of that version, each a frozen input of its directory.
  No file of an earlier directory changes or is removed: the expectations of
  today stay as inputs. The cost grows with the distinct documents times the
  versions, so the corpus stays small.
- **The paths of the manifest are of two kinds.** `file`, `input`, and
  `expected` are relative to `packages/test-fixtures/src` and lie in the
  corpus directory. The `of` of a provenance record is relative to the
  repository and names the fixture outside the corpus whose bytes were copied.
- **Formatting.** The documents of the version directories are outside
  Prettier (`.prettierignore`): their bytes are pinned, and a formatter must
  not be able to ask for other ones. The manifest, the loader, and the tests
  are formatted like any source.
- **Two kinds of hash.** `inputSha256` and `expectedSha256` are hashes of the
  bytes of a file and freeze it: a change of its formatting alone fails the
  test. `expectedCompositionHash` is the composition hash of the expected
  document, which loading must reproduce whatever the text.
- A document of the current version is expected to load as itself, and every
  supported version has at least one entry.
- **Bounds the corpus holds.** The `extremes` documents put node lifetimes and
  keyframes at the largest safe integer. Their audio clip ends there too —
  `startUs` 2^53 − 2, `durationUs` 1 — so that no saved document that must keep
  loading has a clip whose end is no safe integer; whether the schema should
  refuse such a clip is not decided here (D43.8).
- **An entry point of its own.** The corpus is exported by
  `@kadrion/test-fixtures/compatibility`. The main entry of the fixtures, which
  many suites import and the playground loads unbundled in a browser, reaches
  neither the loader, nor the manifest, nor a document of the corpus.

### D43.7 Loading in a host, and what stays as it is

- The explicit APIs change no boundary. The Player, the Producer, the runtime,
  the CLI, and the command bus still validate the current version only and
  still refuse an earlier one (D42.9). No package or application source of this
  repository imports the migration entry.
- A host loads in this order: `parseComposition(text)`; on a success, a **new**
  command bus for `result.composition`, with a fresh history (D32); then it
  publishes that bus in place of the old one; if `versions` holds more than one
  version, it stores the document as a new version (D02, D35.3).
- **The guarantee, precisely.** `parseComposition` is a pure function of its
  text. It sees no bus and no shared state, so a refused text cannot change a
  document, a history, or a listener. Replacing the open document atomically is
  the host's own code: one assignment after a success. The README shows such a
  host, and a test runs that example; it is evidence for the example, not for a
  host written otherwise.
- The command bus is unchanged: it has no way to replace its document.

### D43.8 What this ADR does not decide

Metadata around a document, and any envelope for it; a `migrate` command of the
CLI; replacing the document of a living bus (PR-23); a public `canonicalJson`;
image `fit`, the public `NodeData` name, playground showcases, and the repair of
`audioPlan` in the Producer, with any tighter bound on an audio clip that it
may need. No historical schema is changed by this ADR.

## Alternatives considered

- **An envelope with a format version** — room for metadata, at the price of a
  second version to negotiate and a second closed schema, with no consumer.
- **No function at all, only the documented `JSON.parse` + `migrateComposition`**
  — the smallest change; the owner chose explicit APIs, which give the text
  failures a typed result and make saving validate.
- **A third entry point** — `parseComposition` needs the whole migration anyway,
  so a separate entry would only add a path to guard.
- **A strict JSON scanner** (refusing repeated keys, stripping a byte order
  mark) — a hand-written tokenizer under the guardrail of D24 for inputs no
  writer of Kadrion produces.
- **A trailing newline in the saved text** — friendlier to files, but then the
  text would differ from the one the Player and the Producer already use.
- **Migrating in `serializeComposition`** — a document would change its identity
  on the way out without the host asking (D35.3).
- **A `replaceDocument` on the command bus** — it would amend D38 and belongs to
  the integration contract of the editor (PR-23).

## Consequences

- `@kadrion/schema/migrate` gains two functions and one constant. The main
  entry of `@kadrion/schema`, the runtime artifact, and the Player's dist tree
  do not change, and no file of the golden frames, the parity record, the Q14
  evidence, or the reference composition is touched.
- `@kadrion/test-fixtures` gains the corpus behind a second entry point,
  `@kadrion/test-fixtures/compatibility`. Its main entry is unchanged: what the
  playground loads in a browser is what it loaded before.
- The corpus pins the bytes of its own files only. The fixtures of
  `compositions/` stay free to change with a later schema version; the copies
  in the corpus do not follow them.
- A host has one call for each direction and one list to negotiate with.

## Verification

- `packages/schema/test/saved-text.test.ts`: every corpus entry loads as its
  hand-written document, key for key, with the expected versions and
  composition hash, whatever the white space; round trips; the supported
  versions and the refusal of every other; text failures with their fixed
  messages and frozen results; the migration's failures carried unchanged,
  several errors included; repeated keys, a byte order mark, the spelling of
  numbers, `-0`; deeply nested text, groups nested in the `children` of groups
  included; ownership and freezing on the migrated path and on the current
  one, and the independence of separately returned compositions; and
  `serializeComposition`, which refuses earlier versions and invalid documents
  with the validator's errors.
- `tests/repo/compatibility-corpus.test.ts`: the boundary of the corpus
  directory, that no entry names a file outside it, the agreement of every
  document with the directory of its version, the provenance records, the
  bytes of every file, the composition hash of every expected document, an
  entry for every supported version, and the export against the files.
- `tests/repo/fixtures-entry.test.ts`: the main entry of the fixtures reaches
  no file of the corpus and does not export it; the corpus entry reaches its
  manifest and the documents it names, and nothing else; no package or
  application source imports it.
- `tests/repo/migration-entry.test.ts`: the modules of the main entry, named one
  by one; the host APIs exported by the migration entry and by no other.
- `tests/repo/readme-host-example.test.ts`: the host example of the README, run
  as the module whose code the README prints character for character (D43.7).
- `tests/repo/parity-record.test.ts`, in `check`, verifies that the committed
  parity record is current with the runtime artifact and with the Player's dist
  tree of this build. That the golden frames, the parity record, the Q14
  evidence, and the reference composition are unchanged is not a claim `check`
  makes: their files are untouched by this change, which a comparison of their
  SHA-256 with the previous commit shows.
