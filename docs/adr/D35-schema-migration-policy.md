# D35 — How schema `0.x` changes after the spike: versions and forward migrations

- Status: Accepted — by the project owner on 2026-09-23, with the refinements written into 35.1, 35.2, and 35.7
- Amended by: PR-21 (D42) on 2026-10-03 at the owner's request, 35.2–35.5 and 35.8
  (the first step, `0.1 → 0.2`, and the framework built with it)
- Amended by: PR-22 (D43) on 2026-10-04 at the owner's request, 35.3 (a second explicit
  function of the host, `parseComposition`)
- Date: 2026-09-23
- Supersedes: —
- Related: D02, D16, D17, D24,
  [specification](../spike/vertical-spike.md) §11 and open question Q16,
  [spike report](../spike/report.md)

## Context

Q16 asks how later pull requests change schema `0.1` when every new field is a
breaking change. Three facts make the question real:

- D16.1 closes every object and requires every field.
- `AGENTS.md` says: "Breaking schema changes require explicit forward
  migrations."
- PR-01 shipped no migration framework.

The spike answered one part of the question by never needing to change the
schema. PR-02 to PR-10 all stayed within `0.1`. D30 and D31 say so explicitly,
and the reference composition validates unchanged. So the spike produced no
evidence for a particular framework. What it did produce is the list of
constraints that any framework must respect:

- Taskio stores document versions, and Kadrion owns the schema (D02). A document
  that Taskio stored under `0.1` must stay loadable after Kadrion moves on.
- `validateComposition` gates on `schemaVersion` before anything else and
  returns `unsupported-schema-version` for any other version (D17). Every render
  starts from a `ValidatedComposition` of the current version (Q17).
- The composition hash of the render manifest, `sha256(canonicalJson(document))`
  (D28.7), and the parity record of D33 identify a document by its bytes. A
  document that is upgraded silently would change identity without anyone
  seeing it.
- The schema package is under the determinism guardrail (D24).

The project owner decided on 2026-09-23 that Q16 leaves the list of open
questions of the spike. The answer is this policy for the next phase. It was
proposed in PR-10 and accepted on the same day with the owner's refinements
(35.1, 35.2, 35.7).

## Decision

**35.1 Every semantic change of the document contract is a new version.** Any
change to what a document may contain, or to what it means, gets a new
`schemaVersion`:

- adding a field;
- relaxing a constraint, such as allowing a second scene;
- tightening a constraint;
- changing which fields are required;
- changing a default value;
- changing the interpretation of an existing field.

While the schema is `0.x`, versions count `0.1`, `0.2`, `0.3`, and so on. A
build validates exactly one current version.

**35.2 One forward migration per step.** `@kadrion/schema` gains one plain,
pure function per step, for example `0.1 → 0.2`. Such a function:

- accepts only a document that validates under the older version;
- does not mutate its input: it returns a new document;
- returns a document that must pass the full `validateComposition` of the
  newer version;
- is total and deterministic;
- invents no value that the ADR introducing the change does not name;
- fails with a typed error when a document cannot be carried forward, rather
  than dropping data.

A relaxation is a step whose only change is the version string. There are no
backward migrations.

Amended by: PR-21 (D42). "Returns a new document" means that the result shares
no object with the input at any depth, and that every value is carried as it is,
a `-0` included (D42.7). The step `0.1 → 0.2` is total over valid documents, so
the typed error of the last point has no case yet.

**35.3 Migration is explicit, never part of validation.** A new function,
`migrateComposition(input)`, works in this order:

1. It validates the input under the schema of the input's own version.
2. It applies the steps in order.
3. It validates the result under the current version.
4. It reports which versions it went through.

`validateComposition` keeps its gate unchanged, so a stale document is never
upgraded without anyone asking. The composition hash of a migrated document is
the hash of the result, and a host that stores versions (D02) stores the result
as a new version.

Amended by: PR-21 (D42). `migrateComposition` is exported from
`@kadrion/schema/migrate`, an entry point of its own, so that no historical
schema and no step is part of the runtime build. For passive data, the input
boundary of `validateComposition`, it never throws; an accessor or a Proxy that
throws is outside that guarantee. D42.8 states its result, which reports the
version each error belongs to and the versions the document went through. The
output of a step is validated under the version it reaches before another step
reads it, since a step accepts only a valid document of its own version (35.2). A document without an own `schemaVersion` that is a
known string has no version to be validated under and gets
`unsupported-schema-version`. The validation of step 3 always runs, also for a
document that was current already, whose result is a detached copy like any
other.

Amended by: PR-22 (D43). The same entry point exports a second function a host
calls itself, `parseComposition(text)`: it reads a saved text as JSON and hands
what it holds to `migrateComposition`, whose verdict it carries unchanged. It is
as explicit as the first: `validateComposition` still never migrates, and
`serializeComposition`, the function that writes the text, refuses a document
of an earlier version instead of upgrading it (D43.3, D43.4).

**35.4 Old schemas are kept as data.** Each earlier version's JSON Schema stays
in `@kadrion/schema` as frozen data under D24. Version N's migration validates
against it, not against a reconstruction.

Amended by: PR-21 (D42). What is kept is the whole validation of the version:
its frozen schema and its semantic rules. While a later version has the same
semantic rules, the code is shared, and the frozen negative corpus of the
earlier version pins what they were; a version that changes a rule gets its own
function. The validation of an earlier version never yields a
`ValidatedComposition`.

**35.5 Evidence before code.** Each step brings the following, and they land
before the migration they test:

- a hand-written pair of documents, one before the step and one after it;
- the reference composition carried through the step.

The golden frames and the parity record of D33 are expected to stay
pixel-identical unless the ADR for that change says pixels change. In that case
they are regenerated and reviewed like code.

Amended by: PR-21 (D42). A new version changes the golden manifest even when no
pixel changes: `render.schemaVersion`, and `render.compositionHash`, since the
reference composition is a document of the new version, beside
`render.runtime.contentHash`. "Pixel-identical" is about the frame files, which
must stay byte for byte; the manifest may differ in exactly those fields. The
parity record of the Player and the Producer names the runtime build and the
reference document too, so it is measured again in the pinned environment for
the new version; it is never edited by hand. An expected document of a step is
written by hand, never produced by the step.

**35.6 Nothing speculative.** The first pull request of the next phase that
changes the schema implements 35.2–35.5 together with its own first step.
Nothing is built before that.

**35.7 What needs no version.** A change that affects neither the data a
document may contain nor its meaning needs no bump. Examples:

- editorial changes to descriptions or documentation;
- the order of properties;
- a refactoring of the validator that accepts and refuses exactly the same
  documents.

**35.8 In force.** The project owner accepted this policy on 2026-09-23. It
applies from then on. The migration framework is still built only with the
first real schema change (35.6).

Amended by: PR-21 (D42). PR-21 is that change: it builds 35.2–35.5 together with
the step `0.1 → 0.2`.

## Alternatives considered

- **Optional, additive fields without a version bump.** This would reopen
  D16.1, and a document written by a newer build would validate under an older
  one with its meaning silently dropped.
- **Migrations in the host (Taskio).** Kadrion owns the schema (D02), so every
  host would reimplement the same steps.
- **Upgrading inside `validateComposition`.** A document's identity (D28.7,
  D33) would change without the host noticing, and the gate of D17 would lose
  its meaning.
- **A migration framework now.** The spike never needed one, so there is no
  evidence for its shape (`AGENTS.md`: "Avoid speculative abstractions").

## Consequences

- Schema `0.1` does not change in PR-10 or PR-11, and neither does any schema
  code.
- A semantic change to the document contract without a version bump and a
  migration step contradicts this policy (35.1).
- Hosts must treat `unsupported-schema-version` as "migrate or refuse", never as
  "try anyway".

## Verification

Not mechanically verified until the first schema change. That pull request adds:

- tests of each step on its fixture pair;
- a test that `validateComposition` still refuses an older version;
- a test that carries the reference composition forward.
