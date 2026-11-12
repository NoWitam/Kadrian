# D32 — Playground showcases and documents of the user's own

- Status: Accepted — by the project owner on 2026-09-28, with the amendment D32.9
- Date: 2026-09-23
- Supersedes: — (widens D25.9)
- Amended by: PR-17 on 2026-09-28, before acceptance, D32.9 (the page's Custom HTML
  policy of D36; it qualifies the last paragraph of D32.2 and the one Player of D32.3)
- Amended by: PR-25a on 2026-10-31, D32.3 and D32.7 (the page runs on the host
  facade of D44)
- Amended by: PR-42 on 2026-11-04, D32.1, D32.2, D32.5, D32.7, D32.8, and the
  new D32.10 (showcases of phase three, their media, any tool of the catalogue,
  template values, and the check in Chromium that replaces the manual one)
- Amended by: PR-57 on 2026-11-10, D32.8 and the new D32.11 (showcases of
  phase five, the SVG drawing among the page's assets)
- Amended by: PR-63 and PR-68 on 2026-11-12, D32.8 and the new D32.12
  (showcases of phase six, the proportional font among the page's assets)
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

(Amended by: PR-42. The example tool call is a call of any tool of the
catalogue of D46, and a template's entry also carries values to instantiate it
with, other than its defaults; `null` for a document that is not a template.)

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

(Amended by: PR-42. The assets also include the video of the fixtures, which
the page serves under `/media/` once it has been made (D32.10); a document can
use it by its ID and hash. The page gives every Player an audio context of
48 kHz (D53), so a document with sound is heard; the browser starts it
suspended, and the Player resumes it on Play, which is a click.)

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

(Amended by: PR-42. The panel runs any tool of `TOOL_CATALOGUE` through
`executeTool` of `@kadrion/ai-sdk` (D46), with a frozen object that has the
bus's `getDocument`, `dispatch`, `dispatchTransaction`, and `mediaFactsOf`
alone, the capabilities the tools need; it lists the tools' names. A
description, a command, or a transaction is shown as the tool returns it.)

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

(Amended by: PR-25a. The playground also depends on `@kadrion/editor-session`
and serves it under `/pkg/editor-session/`. Each document opens a new Player and
a new session of D44; the editor and the AI panel act on the session's bus, and
an edit reaches the preview through `Player.update` at the time it shows, so
D32.3's "one Player" now holds for the life of a document. Changing the Custom
HTML policy (D32.9) opens a new session over the same document, and the undo
history of the old one is gone. The stage takes no pointer input: the session
mounts the render frame before the grip appears, and Chromium then sends the
pointer over the grip to that out-of-process frame, which the pinned editor
test measured.)

(Amended by: PR-42. The page also imports `@kadrion/schema/template`, to
instantiate a template with values (D58.4), and the server gains the route
`/media/` to `.kadrion-cache/playground-media/`, for files of the type
`video/mp4` only.)

### D32.8 Showcases are kept current by a test

`tests/repo/showcases.test.ts` fails when a showcase stops being a valid
composition, uses an asset the page does not generate or a glyph the generated
font lacks, names a node the grip may not drag, carries a tool call that the
tool refuses, or when a JSON file and the manifest disagree. A schema change
therefore forces the showcases to follow it, and a feature that is visible to a
user lands with a showcase or an update of one.

(Amended by: PR-42. The test also fails when a showcase reads a medium outside
its source, uses a glyph the font lacks in a caption or in the document a
template makes with its defaults or its values, carries a tool call of a tool
outside the catalogue or one that changes nothing, carries template values
without being a template (or the reverse), or when the showcases stop showing
a feature of phase three: a video in each fit, audio clips with fades, scenes
with scene and clip transitions, captions, and a template with a condition
and a repeat.)

(Amended by: PR-57. The test also fails when the showcases stop showing a
feature of phase five, D32.11, or stop calling a tool of each of its steps.)

(Amended by: PR-63 and PR-68. The test also fails when the showcases stop
showing a feature of phase six, D32.12, or stop calling `set_clip_speed` and
`set_node_size` on a text; a video node or a clip is checked against its
source through its time map, and a text against the glyphs of its own font.)

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

### D32.10 Showcases of phase three and their check in Chromium (amendment of PR-42)

- **The showcases.** `video` (three clips of the fixture video in `fill`,
  `contain`, and `cover` with a focus point), `audio` (two clips of the
  generated tone with fades and volumes), `scenes` (four scenes with a
  crossfade, a fade through a colour, a slide, and a clip transition),
  `captions` (timed words), and `template` (inputs, bindings, a condition, and a
  repeat, previewed with its defaults and instantiated with the values of its
  entry). Each carries a tool call of its feature: `set_node_fit`,
  `set_clip_fades`, `set_transition_effect`, `set_caption_word`, and
  `set_template_input`.
- **Their media are the fixtures' own.** The page needs no medium the tests do
  not already make: the image, the tone, and the font are generated in
  TypeScript (D27.5), and the video is made by the pinned FFmpeg with the
  committed recipe `videoFixtureArguments` and kept only with the committed
  SHA-256 of `VIDEO_FIXTURE` (D50.8). `apps/playground/scripts/media.ts`
  (`node --run playground:media`, FFmpeg from `KADRION_FFMPEG` or `--ffmpeg`)
  writes it to `.kadrion-cache/playground-media/`, which Git ignores; a file
  with other bytes is removed, never served. A second set of recipes would be a
  second thing to keep reproducible for no gain. Until the video is made, the
  video showcase reports `asset-missing`, and the page says how to make it.
- **A template on the page.** The session previews a template with its defaults
  (D58.4). Next to it the page shows the entry's values as JSON; "Instantiate
  with these values" runs `instantiateTemplate` and opens the result as a new
  document, through the path of D32.2, with a new history. The template's
  errors are listed with their codes.
- **The check in Chromium.** `tests/pinned/showcases.pinned.test.ts` serves the
  page with the playground's own server and media script, opens every showcase
  in the pinned Chromium, waits for `ready`, plays it to `ended` with a click on
  Play, runs its tool call and undoes it, instantiates a template with its values
  and plays the result, and requires that the page, its console, and its
  uncaught exceptions report no error. It also loads a document whose asset has
  another hash and an invalid document, and requires their codes. It is a
  pinned test file, not a test of `tests/app`, because the browser tests of the
  repository run there (D26), and adding it reopened Q14. Without
  `KADRION_FFMPEG` it is skipped, and where the run is pinned it is required.

### D32.11 Showcases of phase five (amendment of PR-57)

- **The showcases.** `clip-transitions` (a push, a zoom, an iris, and a blur
  dissolve between clips of one layer, eased), `motion` (every easing,
  rotation about an origin, an animated crop and corner radius), `text-motion`
  (text styles and text animated by letter and by word, in and as an accent),
  `animated-captions` (a highlight that grows, bounces, and sits on a box, pages
  that enter and leave, and a safe area), `effects` (CSS filters and SVG
  filters on nodes and on the scene), `shapes` (every geometry and fill, a
  stroke drawn on, a morph, and an SVG asset), `compositing` (a blend mode, a
  shape mask and an image mask, and a track matte), `elements` (a definition
  placed three times and an Element with values), and `custom-html-clock`
  (Custom HTML of plain CSS on the managed clock, with parameters). Each
  carries a tool call of its feature: `set_transition_easing`,
  `set_keyframe_easing`, `add_text_animation`, `set_caption_highlight`,
  `add_effect`, `set_shape_fill`, `set_blend_mode`, `set_instance_input`, and
  `set_custom_html`.
- **Their sources are generated once and committed.** They are 1280×720 at 30
  fps, 5 to 6.4 seconds long, and use only the assets the page already
  generates, the glyphs of the generated font, and, new, the SVG drawing of the
  fixtures (`generateSvgAsset`, D74), which the page resolves and lists with
  the hash `svgComposition` declares. The green screen video of D72 is not
  made by the media script, so chroma keying is shown by its pinned test only.
- **Their check** is the one of D32.10: `tests/pinned/showcases.pinned.test.ts`
  opens, plays, and edits every entry of the manifest, so the new showcases
  need no change of a pinned file and do not reopen Q14.
- **What a model is expected to call.** `tests/app/fixtures/model-requests.json`
  holds ten common requests, each with the showcase it is made on, the tool
  calls a model is expected to send, and the changes those calls make, as
  JSON Patch operations; `tests/app/model-requests.test.ts` runs every call
  through `executeTool`, compares the document with the showcase changed by
  the operations, and undoes the calls back to the showcase. It checks the
  catalogue, not a model.

### D32.12 Showcases of phase six (amendment of PR-63 and PR-68)

- **The showcases.** `speed` (the fixture video at `x0.5` and `x1/3`, at `x2`
  followed by a freeze frame of its last frame, and at `x0.75` reversed, with
  a sound at `x1.5` and a sound reversed; D82) and `framed-text` (texts in
  fixed frames aligned left and top, in the centre and the middle, and right
  and bottom, a text whose lines enter one by one, a word wider than its
  frame, and captions broken by width whose spoken word has an outline and a
  shadow; D83). Their tool calls are `set_clip_speed` with the multiplier
  `"x0.25"` and `set_node_size` on a text, whose lines wrap again.
- **Their sources are generated once and committed,** 1280×720 at 30 fps and
  4 seconds long, from the assets the page already generates and, new, the
  proportional font of the fixtures (`generateProportionalFontAsset`, D83),
  which the page resolves and lists with the hash `framedTextComposition`
  declares, so that its frames measure lines of differing advances. Their
  labels and texts use only the glyphs of that font.
- **Their check** is the one of D32.10: `tests/pinned/showcases.pinned.test.ts`
  opens, plays, and edits every entry of the manifest, so the new showcases
  need no change of a pinned file and do not reopen Q14; neither the runtime
  build nor the Player's dist tree changes.

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
  font with the glyphs ` DKabcdegimnorsty`, one audio track, and, since PR-42,
  the fixture video, made by the pinned FFmpeg.

## Verification

- `tests/repo/showcases.test.ts` as in D32.8.
- `tests/repo/playground.test.ts` pins the dependencies, the imports, and the
  routes of D32.7.
- A manual check in Chromium loads every showcase, a document with a missing
  asset, and an invalid document, drags, runs a tool call, and undoes it.
  (Amended by: PR-42. Replaced by `tests/pinned/showcases.pinned.test.ts`,
  D32.10, except the drag, which `tests/pinned/editor.pinned.test.ts` measures
  in Chromium.)
- `tests/repo/playground.test.ts`, "the Custom HTML policy of the playground
  (D36)", for D32.9.

Known limits at acceptance (2026-09-28), recorded as debt of phase two
(`docs/roadmap/phase-2.md`), not blockers of this decision:

- Loading a user's own JSON and showing its errors (D32.2) is checked by hand
  only; no automated test drives that path of the page.
- No test forbids time arithmetic in the page (D32.6); the rule is kept by
  review and by the page importing the frame grid of `@kadrion/schema`.
- No record of the manual Chromium check exists in the repository. (Closed by
  PR-42: the pinned run records the test of D32.10.)
