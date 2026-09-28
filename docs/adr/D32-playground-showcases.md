# D32 — Playground showcases and documents of the user's own

- Status: Accepted — by the project owner on 2026-09-28, with the amendment D32.9
- Date: 2026-09-23
- Supersedes: — (widens D25.9)
- Amended by: PR-17 on 2026-09-28, before acceptance, D32.9 (the page's Custom HTML
  policy of D36; it qualifies the last paragraph of D32.2 and the one Player of D32.3)
- Related: D13, D14, D23, D25, D27, D30, D31, D36,
  [specification](../spike/vertical-spike.md) §5 P1, P3, P4

## Context

D25.9 describes the playground as "a page with play, pause, and the five golden
seeks over the reference composition" whose server "serves only the built files
it names". PR-08 added the drag of D30.10 and a dependency on
`@kadrion/editor-sdk`. After PR-09 the project owner asked for showcases: several
demo compositions, each showing the JSON it loads, the possibility to run the
playground from a JSON of the user's own, and showcases that are kept current as
features land. That widens D25.9 in four ways — any valid document instead of
the reference one, two more dependencies, an AI tool-call panel, and more built
files served — which is why it is written down rather than done quietly.

## Decision

### D32.1 Showcases are data, next to the page

Each showcase is a composition JSON under `apps/playground/src/showcases/` plus
one entry of the manifest `apps/playground/src/showcases.ts`: an ID, a title, a
description, display-only feature labels, the URL of its built JSON, the repository
path of its source, the node the grip drags (or none), and an example tool call
`{ name, arguments }`. The reference showcase points at the fixture the Player
tests already use (`packages/test-fixtures/src/compositions/reference.json`)
instead of a copy. The JSON files are emitted into the playground's `dist` by
`tsc`, so the server keeps serving built files only; the page fetches the built
text and shows it as the source it loads.

The feature labels are text for a reader. They are not a capability registry,
and nothing in the page branches on them.

### D32.2 Any valid document can be loaded; nothing falls back

The page loads a pasted or uploaded JSON through the same path as a showcase:
`JSON.parse`, then `createCommandBus` (the full `validateComposition`, whose
`invalid-document` details the page lists), then `player.load`. Loading replaces
the document and starts a new history; it is not an edit, and the page says so.

Assets are those the page generates (`generateReferenceAssets`, D27.5). The
resolver is a lookup by ID that returns `null` for any other ID; the Player
reports `asset-missing` or `asset-hash-mismatch`, and the page shows the error.
The page checks no hash itself, so it copies no rule of the Player. It lists the
asset IDs, types, and hashes, and the glyphs of the generated font, so an author
knows what a document can use.

A Custom HTML element of a user's document runs user code, inside the same
`allow-scripts`-only sandbox as every other (D23, D25.2); the page says that too.
(Amended by PR-17, D32.9: only when the page trusts Custom HTML; by default it
runs none.)

### D32.3 One Player; a new bus and editor per document

The page keeps one Player (amended by PR-17, D32.9: one at a time; a change of
the Custom HTML policy replaces it). Before each `load` it sizes the canvas boxes for the
new document (the stage must have its height when the frame is laid out,
D30.10). The bus and the drag editor are created anew for every document,
because the editor fixes the composition width and the node it drags when it is
made.

### D32.4 The grip drags a top-level node without a position animation

A group child's `position` is relative to its group, and a node with a position
animation is not moved by one `SetNodePosition` (D30.2), so the grip offers only
top-level nodes that carry a `position` and no `position` animation. A showcase
names its node; for a user's document the page offers the eligible nodes. The AI
panel may target any node.

### D32.5 The AI panel is the tool of D31 on the page's bus

The panel parses a tool call `{ name, arguments }`, refuses a name other than
`set_node_position`, and runs `executeSetNodePosition` with a frozen object that
has the bus's `dispatch` alone (D31.5). The edit lands in the same history as the
drag, so Undo and Redo cover it. The page shows the inverse or the typed error.

### D32.6 Time comes from the frame grid

The time slider selects a frame index and turns it into microseconds with the
frame-grid functions of `@kadrion/schema` (D13), so the page restates no
arithmetic of the grid.

### D32.7 Dependencies and routes

`apps/playground` depends on `@kadrion/ai-sdk`, `@kadrion/editor-sdk`,
`@kadrion/player`, `@kadrion/renderer-dom`, `@kadrion/schema`, and
`@kadrion/test-fixtures`. The server gains the route `/pkg/ai-sdk/`; the
showcases are served under the existing `/app/` route. No package depends on the
playground.

### D32.8 Showcases are kept current by a test

`tests/repo/showcases.test.ts` fails when a showcase stops being a valid
composition, uses an asset the page does not generate or a glyph the generated
font lacks, names a node the grip may not drag, carries a tool call that the
tool refuses, or when a JSON file and the manifest disagree. A schema change
therefore forces the showcases to follow it, and a feature that is visible to a
user lands with a showcase or an update of one.

### D32.9 The page's Custom HTML policy (amendment of PR-17, implementing D36)

Recorded at the project owner's request on 2026-09-28, describing what PR-16
built.

- Whether Custom HTML runs is the page's decision, never a document's (D25.10,
  D36): nothing in a document can turn it on. The page starts with it disabled:
  the checkbox "Run Custom HTML" is unchecked and has `autocomplete="off"`, so a
  reload never restores it. Unchecked, every Player the page makes has
  `{ mode: 'disabled' }`, and a Custom HTML element is an empty placeholder with
  no frame (D23.10).
- Checking it is the page's decision to run the code of every document it
  loads, a showcase or a user's own. Only then does the last paragraph of D32.2
  apply. Next to the checkbox the page says that the sandbox is not network
  isolation (D36).
- The policy holds for a Player's lifetime (D25.10), so changing it replaces the
  Player in a controlled way: the page makes the new one first; if that fails it
  keeps the old one and the old choice; otherwise it destroys the old one and
  loads the same bus's document at the time shown, with its undo history and the
  node the grip drags. "One Player" in D32.3 means one active instance at a
  time; opening a document still reuses it.
- A showcase whose document has Custom HTML says in its description that the
  element runs only when "Run Custom HTML" is on.
- Verification: `tests/repo/playground.test.ts`, "the Custom HTML policy of the
  playground (D36)".

## Alternatives considered

- **A `/showcases/` route to the source directory** — simpler, but it serves
  source files, which D25.9 excludes.
- **A new Player per document** — also works, but it needs `destroy()` of the old
  one and costs a runtime load per document; resizing before `load` suffices.
- **Frame arithmetic in the page** — `1e6 / fps` is not an integer at 30 fps; the
  grid belongs to the schema (D13).

## Consequences

- The playground stays free of domain rules: it parses JSON, hands it to the bus
  and the Player, and shows what they report.
- A showcase is only as varied as the generated assets allow: one image, one
  font with the glyphs ` DKabcdegimnorsty`, and one audio track.

## Verification

- `tests/repo/showcases.test.ts` as in D32.8.
- `tests/repo/playground.test.ts` pins the dependencies, the imports, and the
  routes of D32.7.
- A manual check in Chromium loads every showcase, a document with a missing
  asset, and an invalid document, drags, runs a tool call, and undoes it.
- `tests/repo/playground.test.ts`, "the Custom HTML policy of the playground
  (D36)", for D32.9.

Known limits at acceptance (2026-09-28), recorded as debt of phase two
(`docs/roadmap/phase-2.md`), not blockers of this decision:

- Loading a user's own JSON and showing its errors (D32.2) is checked by hand
  only; no automated test drives that path of the page.
- No test forbids time arithmetic in the page (D32.6); the rule is kept by
  review and by the page importing the frame grid of `@kadrion/schema`.
- No record of the manual Chromium check exists in the repository.
