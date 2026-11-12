# D83 — A text frame, alignment, and lines measured from the font: schema 0.25

- Status: Accepted — by the project owner on 2026-11-11 (13:37 Europe/Warsaw),
  before any code, with the recommendations of all fourteen questions
- Date: 2026-11-11
- Supersedes: —
- Extends, on acceptance, each with an `Amended by` line written then and in
  force from the pull request it names: D19 (the evaluation takes the metrics
  of the document's fonts, D83.7), D22.6 (a measured text is drawn as lines of
  the runtime, D83.5), D27.1 (the load step reads the metrics, D83.7), D40.1
  (`SetNodeSize` on a text, D83.10), D57.2 and D57.3 (a second way to break
  captions into lines, D83.5), D65.1 and D68.10 (the box of a text, D83.3),
  D69.1 and D69.9 (alignment in the text style; measured wrapping is decided
  here, D83.4, D83.5), and D70 (the outline and the shadow of the spoken word,
  D83.8). D35 (the step from `0.24` to `0.25`) and D46 (the descriptions of
  four tools) get their lines from the pull requests of D83.9 and D83.10, as
  every schema step and tool change before them
- Related: D04, D12, D13, D14, D15, D16, D21, D26, D30, D33, D34, D38, D57,
  D69, D70, D82, [roadmap of phase six](../roadmap/phase-6.md)

## Context

A host's video editor asks for one frame for text and captions: dragging a
corner of the frame changes the frame and never the size of the letters; the
letters keep their own size field; the lines wrap to the frame and lie in it
as the host aligns them, horizontally and vertically; and the spoken word of
captions gets an outline and a shadow of its own. The host numbered its
requirements W1 to W7:

| #   | Requirement                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W1  | A frame of a `text` node, `width` and `height` in composition pixels, set and removed by a command, in one transaction with `SetNodePosition`; a text without a frame behaves as today.                                                                                              |
| W2  | Alignment of a text in its frame, `align` (left, center, right) and `verticalAlign` (top, middle, bottom), with a command.                                                                                                                                                           |
| W3  | Wrapping to the frame's width for `text`, and a line break by width for `captions` beside `maxLineLength`; deterministic (the document and the font's bytes only, the same in the Player and the Producer, a parity test as D82.6); a defined rule for a word longer than the frame. |
| W4  | A defined overflow (the host recommends no clipping) and a helper that returns the lines and whether the text fits, so that no host copies the algorithm.                                                                                                                            |
| W5  | `captionHighlight.stroke` and `.shadow` for the spoken word only, never moving its neighbours, accepted by `SetCaptionHighlight`.                                                                                                                                                    |
| W6  | The descriptions of the tools (`set_node_size`, alignment, `set_caption_style`) grow by at most 800 characters together.                                                                                                                                                             |
| W7  | A new schema version whose step changes the look of no older document.                                                                                                                                                                                                               |

What the repository has, read on 2026-11-11 at `main` `514b9fc` (schema
`0.23`, D82 accepted; its schema `0.24` lands with PR-61):

- **A text node has no box.** `textNodeSchemaValue`
  (`packages/schema/src/composition-schema.ts`) is "One run of text; line
  breaks are preserved": `text`, `fontAssetId`, `fontSize`, `color`, `style`
  (`textStyleSchema`: `stroke`, `shadow`, `box`, D69), and `textAnimations`. The
  renderer draws it as one `div` with `white-space: pre` and a line height of
  1.25 (`mount.ts`, case `'text'`), so the browser never wraps it and its box
  is as large as its widest line and its line feeds make it. Its origin (D68)
  is therefore a fraction of a box measured by the browser.
- **Captions have a box and align in it**, but break lines by characters.
  `captionStyleSchema` holds `align`, `verticalAlign`, `maxLineLength`, and
  `maxLines`; `captionPages` (`packages/runtime/src/captions.ts`) fills lines
  greedily by Unicode code points; `captionsElement` (`mount.ts`) mounts every
  page with the runtime's lines, `white-space: pre`, `text-align`, and a flex
  column for `verticalAlign`. D57.2 chose characters because the runtime knows
  no fonts, and rejected measuring "for a first step; a later ADR may add a
  width bound if a host needs one". This is that ADR.
- **Lines of a text animation** are the line feeds of the text:
  `textLayout` (`packages/runtime/src/graphemes.ts`) splits the text into
  lines, runs of white space, words, and graphemes by the table of D69, and
  `textFragments` (`fragments.ts`) and `fragmentContent` (`mount.ts`) build the
  fragments from it.
- **The spoken word** shows `captionHighlightSchema`: `color`, `scale`,
  `tracks`, `underline`, `box`. `captionsInPieces` draws a node in pieces for
  a scale, tracks, an underline, or a box; `writeCaptions`
  (`packages/renderer-dom/src/render.ts`) colours the spoken word through the
  custom property `HIGHLIGHT_PROPERTY` otherwise. The node's outline and
  shadow are written on the captions box and inherited by every word.
- **Commands.** `SetNodeSize` (`packages/editor-sdk/src/registry.ts`) edits any
  node with numeric `width` and `height` through `numberField`, so a text is
  `unsupported-node`; its tool says "A text has no size; change its font size
  instead" (`packages/editor-sdk/src/tools.ts`). `SetTextStyle`,
  `SetCaptionStyle`, and `SetCaptionHighlight` take the complete object as the
  document stores it, and the result is validated (D38).
- **Evaluation.** `evaluateComposition(composition, timeUs)` is called only by
  the render page (`packages/renderer-dom/src/page.ts`, three places). The page
  holds the font bytes from the load step (D27.1, step 4), where every font a
  text uses becomes a `FontFace`. No code of the repository reads a font
  table; the fixture font (`packages/test-fixtures/src/assets/font.ts`) is
  generated, with one advance of 600 units for every glyph.
- **Conventions.** Every field is required, with no defaults (D16): a thing that
  may be absent is a `{ "kind": "none" }` alternative, as the text style does.
- **Tool descriptions** of the catalogue snapshot
  (`packages/ai-sdk/test/catalogue.snap`), each tool's whole entry as JSON:
  `set_node_size` 1 567 characters, `set_text_style` 2 291,
  `set_caption_style` 3 114, `set_caption_highlight` 3 626.

The difficult part is W3. A line that "fits the frame" needs the width of
text; a width the browser measures differs between the browser of a viewer
(the Player) and the pinned Chromium (the Producer), and would put which words
are on a page of captions, which is state, in the DOM (D57.2). The width must
therefore come from the font's bytes, which the document pins by
`contentHash` (D14), through one function both hosts run.

## Decision

> D83: Schema `0.25` gives a text node a frame, `{ "kind": "none" }` or `{ "kind": "fixed", width, height }`, gives the text style `align` and `verticalAlign`, gives a captions style `lineBreak`, `characters` or `width`, and gives the highlight of the spoken word a `stroke` and a `shadow` in the shapes of D69. The lines of a framed text and of captions broken by width are computed by the runtime from the advance widths of the font, which Kadrion reads from the font's bytes itself (`fontMetrics`), in integers, and the renderer draws exactly those lines with kerning and ligatures off; nothing is clipped, and a word wider than the frame stands alone on its line. The evaluation takes the metrics of the document's fonts as an explicit argument, the render page computes them from the bytes it loads, and hosts call the same helper to learn the lines and whether a text fits. `SetNodeSize` sets and removes a text's frame, and the complete-object commands carry the new fields. The step writes values that draw every older document as before.

### D83.1 Font metrics read by Kadrion (W3)

- **`fontMetrics(bytes)`** of `@kadrion/runtime` reads a font file and
  returns its `unitsPerEm` and the advance width, in font units, of the glyph
  of every code point the font maps. It reads the tables `head`
  (`unitsPerEm`), `hhea` (`numberOfHMetrics`), `maxp` (`numGlyphs`), `hmtx`
  (advances), and `cmap` (subtables of format 4 and 12, platform 3 encodings 1
  and 10, and platform 0); nothing else.
- It is pure: integer arithmetic on a `DataView`, no `FontFace`, no canvas, no
  `Intl`, no platform API (the determinism guardrail of D24). The same bytes
  give the same metrics in Node and in any browser.
- **Formats.** An sfnt file: TrueType outlines (`font/ttf`) or CFF outlines
  (`font/otf`). WOFF and WOFF2 need a decompressor (zlib, Brotli) and a font
  collection holds several fonts; a measured node (D83.3, D83.5) whose font is
  any of these, or whose bytes lack a table above, is the error
  `font-unmeasurable`. A font that only unmeasured nodes use is never read, so
  every document of `0.24` loads as before (question 3).
- **A code point with no glyph** measures the advance of glyph 0 (`.notdef`),
  and the helper of D83.6 lists it. The browser would draw such a character in
  another font; a host keeps its texts within its fonts, as the fixture font
  already requires (D27.5).

### D83.2 The measure

- The width of a run of text, in font units, is the sum of the advances of its
  code points by D83.1. No kerning, no ligatures, no shaping (question 4).
- A run fits a width `w` at a font size `s` when
  `units · s ≤ w · unitsPerEm`, compared in `BigInt` as D13 and D82.1 compare:
  `s` and `w` are integers (D15), so the rule has no rounding and no floating
  point. Heights compare the same way: a text's line is `1.25 · fontSize`
  (D22.6), so `n` lines fit a height `h` when `5 · n · fontSize ≤ 4 · h`; a
  line of captions is `lineHeight`.
- **The renderer draws what was measured.** Every measured line is an element
  of its own with `white-space: pre`, `font-kerning: none`, and
  `font-variant-ligatures: none`, so the browser wraps nothing and the width it
  draws is the sum of the advances, for the scripts that need no shaping.
  Unmeasured text keeps the browser's defaults, so its pixels do not change
  (D83.9).
- Right-to-left, vertical, and shaped scripts (Arabic, the Indic scripts) stay
  outside, as D69.9 left them: their lines are deterministic, but the width
  drawn may differ from the width measured.

### D83.3 The frame of a text (W1)

- A text node gains `frame`, after `fontSize`:
  - `{ "kind": "none" }`: the text as today, its box as large as its lines.
  - `{ "kind": "fixed", "width", "height" }`: integers from 1 to 1 000 000 in
    composition pixels (D15). The node's box is the frame: its `position` is
    the frame's top-left corner, its `origin` (D68) a fraction of the frame,
    so it no longer depends on what the browser measures, and its `scale` and
    `rotation` scale and turn the frame and the letters together. The lines
    wrap to the frame's width by D83.5 and lie in it by D83.4.
- The frame is not animated in `0.25`: no `size` animation targets a text
  (the row "text box" of D65.1 stays planned). A host animates `scale`
  (question 10).
- The text's `box` style (D69) stays behind the block of its lines, as wide as
  its widest line, placed in the frame like the lines; a background of the
  whole frame is not in this step (question 11).

### D83.4 Alignment (W2)

- The text style gains `align` (`left`, `center`, `right`) and
  `verticalAlign` (`top`, `middle`, `bottom`), the enums of the captions style
  (D57.1), after `box`.
- In a frame, each line lies across the frame's width as `align` says, and the
  block of lines along its height as `verticalAlign` says, as captions lie in
  their box.
- Without a frame, `align` places each line within the widest line, which a
  text with line feeds shows; `verticalAlign` has nothing to move, because the
  box is the block of lines.

### D83.5 Wrapping (W3)

- **A framed text.** The text is first split at its line feeds, which stay
  breaks (D22.6). Each of those lines is split into words and runs of white
  space by `textLayout` (D69.2). Words fill a line greedily, in order: a word,
  with the run of white space before it, joins the line while the line still
  fits the frame's width by D83.2; otherwise a new line starts with the word.
  The run of white space at which a line breaks is neither drawn nor measured;
  white space at the start of a line of the text is kept.
- **Captions broken by width.** The captions style gains `lineBreak`, after
  `maxLines`: `characters` (D57.3, unchanged) or `width`. With `width`, a word
  joins the line while both bounds hold: the count of D57.3 (`maxLineLength`)
  and the width of the node's box by D83.2, the space between two words
  measured as the advance of U+0020. A host that wants the width alone sets
  `maxLineLength` to 1 000; a host that wants both, as subtitle standards
  count characters, keeps its count (question 8). Pages are made of
  `maxLines` lines as before. The highlight's scale and tracks never take part:
  a word never pushes its neighbours (D70).
- **A word wider than the frame** stands alone on its line and overflows, in
  both cases, as a word longer than `maxLineLength` does (D57.3). It is never
  broken inside: a caption's word is one timed unit, and one rule serves both
  nodes (question 5).
- **Text animations** (D69) whose unit is `line` animate the lines drawn,
  those of the wrap; words and letters do not change.
- **Functions.** `textLines` and `captionPages` of `@kadrion/runtime`, both
  taking the metrics; `captionPages` keeps its result for
  `characters` and needs the metrics only for `width`.

### D83.6 Overflow and the helper for hosts (W4)

- **Nothing is clipped.** A frame never grows and never cuts. A line wider
  than the frame overflows on the side `align` leaves free (right of a
  left-aligned line, both sides of a centred one, left of a right-aligned
  one); a block of lines taller than the frame overflows on the side
  `verticalAlign` leaves free. Effects, masks, and mattes cut as they always
  do (D71, D75).
- **`frameLayout(node, metrics)`** of `@kadrion/runtime`, for a framed text
  and for captions of either mode, returns:
  - `lines`: for each line, its text (for captions, the indices of its words
    and its page), its width in font units and in composition pixels, and
    whether it fits the frame's width;
  - `height` of the block of lines (for captions, of the tallest page);
  - `fits`: every line fits the width and every block the height;
  - `missing`: the code points without a glyph (D83.1).
- A host calls it for its overlay and for a mark "does not fit", with the
  metrics it computed once per font by `fontMetrics`, so it never copies the
  algorithm. The bus does not refuse an overflowing text: overflow is a look,
  not an error.

### D83.7 The evaluation and the hosts (amends D19, D27.1)

- `evaluateComposition(composition, timeUs, fonts?)`: `fonts` maps the ID of
  a font asset to its metrics. It is needed exactly when the document holds a
  measured node (a framed text, or captions with `lineBreak: "width"`), and
  only for the fonts those nodes use; a measured node whose font is not in the
  map is the `EvaluationError` `font-metrics-missing`. A document without a
  measured node evaluates as today, with or without the argument.
- **The state is derived from `(composition, timeUs)` and the bytes of the
  composition's fonts**, which the composition pins by `contentHash` (D14).
  The state keeps its shape: a captions node's `page` indexes the pages of
  D83.5, and the fragments of a text's lines follow the wrap. `AGENTS.md` says
  "Runtime state for a frame is derived from `(composition, timeUs)`"; the
  owner confirms the reading that pinned font bytes belong to the composition
  (question 2).
- **The load step** (D27.1) gains a step after step 4: for every font a
  measured node uses, `fontMetrics` reads the bytes the page already holds,
  inside the runtime build, so the Player and the Producer read them with the
  same code; `font-unmeasurable` is a `RenderError` raised before anything is
  mounted. The page passes the metrics to the mount, which draws the lines,
  and to every `evaluateComposition` of `page.ts`.

### D83.8 The outline and the shadow of the spoken word (W5, amends D70)

- `captionHighlightSchema` gains `stroke` and `shadow`, after `box`, in the
  shapes of the text style (D69): `{ "kind": "none" }` or
  `{ "kind": "outside", color, width }`, and `{ "kind": "none" }` or
  `{ "kind": "drop", color, opacity, offset, blur }`.
- While a word is spoken, and at no other time, an outline or a shadow of the
  highlight replaces the outline or the shadow of the style on that word;
  `none` leaves the word with the style's own (question 9).
- Neither moves a word: an outline drawn outside the glyphs and a shadow
  occupy no layout space, so lines, pages, and the neighbours stay where
  D57.3 and D83.5 put them. A wide outline may reach over a neighbour; the
  word after it is drawn above it, in the order of the page.
- They do not draw a node in pieces (D70): `renderState` writes them on the
  word's element, as it writes the highlight's colour; `captionsInPieces` does
  not change.
- `SetCaptionHighlight` takes them as part of the complete highlight; nothing
  else changes in it.

### D83.9 Schema `0.25` and the step from `0.24` (W7)

- Schema `0.25` adds `frame` to every text node (in scenes, groups, and
  definitions), `align` and `verticalAlign` to the text style, `lineBreak` to
  the captions style, and `stroke` and `shadow` to the highlight. The text's
  description loses "One run of text" for a run that a frame wraps.
- The step writes `frame: { "kind": "none" }`, `align: "left"`,
  `verticalAlign: "top"`, `lineBreak: "characters"`, and
  `stroke: { "kind": "none" }` and `shadow: { "kind": "none" }` in every
  highlight. These are today's looks: a text without a frame is drawn as it
  is, left-aligned (the default of `text-align`), and the renderer writes no
  declaration for the defaults, so the golden PNG files of every reference
  composition stay byte for byte and the golden manifests change only in the
  three fields of D42 (D49.7). The schema of `0.24` is kept as data (D35.4);
  the pair before and after and the compatibility corpus grow by one entry
  each (D43).
- `0.25` follows `0.24` of D82 (PR-61). If the owner orders D83 before PR-61,
  the numbers swap and nothing else changes (question 13).

### D83.10 Commands and tools (W1, W2, W6; amends D40.1, D46)

- **`SetNodeSize`** on a text sets its frame to a `fixed` frame of that width and
  height, a text without a frame included; `width` and `height` of `null`,
  both together, set `{ "kind": "none" }`. `null` is refused for any other
  node (`invalid-argument`). The inverse is `SetNodeSize` with the old frame
  (`null` for none). A corner of the frame is `SetNodeSize` and
  `SetNodePosition` in one transaction (D38), as for captions; `SetNodeScale`
  scales frame and letters together; `SetTextFontSize` changes the letters
  alone and the lines wrap again.
- **`SetTextStyle`**, **`SetCaptionStyle`**, and **`SetCaptionHighlight`**
  take the complete object as before (D69, D57.5, D70), now with `align` and
  `verticalAlign`, `lineBreak`, and `stroke` and `shadow`. No new command and
  no new tool: alignment is part of the text style, as it is of the captions
  style.
- **Tools** (D46). Four descriptions change, and their examples carry the new
  fields, since a complete style without them is `invalid-result`:

  | Tool                    | What its description gains                                                        | Characters, about |
  | ----------------------- | --------------------------------------------------------------------------------- | ----------------- |
  | `set_node_size`         | a text gets a frame its lines wrap to; `null` removes it (replaces "has no size") | +180              |
  | `set_text_style`        | `align`, `verticalAlign`, and what they place, in the frame or without one        | +230              |
  | `set_caption_style`     | `lineBreak` `characters` or `width`, both bounds in `width`                       | +170              |
  | `set_caption_highlight` | `stroke` and `shadow` of the spoken word, as `set_text_style`'s, never moving it  | +180              |
  | `add_node`              | its example text node gains `frame`, `align`, `verticalAlign`                     | +70               |

  The budget is measured on the catalogue snapshot as the growth of the
  length of the JSON of every tool's entry, all tools together: at most 800
  characters (question 14). A test of `packages/ai-sdk` holds the length of
  the snapshot of `0.24` and fails above it plus 800.

- `describe_document` shows the new stored fields as it shows every field; it
  states no lines, because the bus does not measure (D12: the editor SDK does
  not depend on the runtime).

### D83.11 Not included

- Breaking a word inside, hyphenation, and the line-break rules of UAX #14
  (only white space breaks a line).
- Kerning, ligatures, and shaping (D83.2); right-to-left and vertical text.
- WOFF, WOFF2, and collections in a measured node (D83.1).
- A frame that grows with its text, a text that shrinks to fit, and clipping.
- An animated frame (`size` of a text), and a background of the whole frame.
- A frame on any other node; captions keep `width` and `height` as they are.
- Lines or fit in `describe_document`, and refusals for overflow at the bus.

## Alternatives considered

- **The browser measures** (canvas `measureText`, or the DOM wraps with
  `white-space: pre-wrap`) — the Player runs in a viewer's browser, not the
  pinned Chromium, so the same document could break into other lines, and
  captions would show other words on a page; the pages would live in the DOM.
  D57.2 rejected it for the same reasons.
- **Line breaks stored in the document**, computed by the bus from facts of the
  font that the host supplies — every edit of a text, a font, a size, or a
  frame would need the facts (`font-facts-missing`), a document edited by hand
  would keep stale breaks that no validation can see without the bytes, and
  the document would hold derived data.
- **Metrics stored in the document**, on the font asset — a table for every
  code point a text might use, written by the host and checkable only against
  the bytes; the document never stores facts (D49.6, D62).
- **An average character width** in the document (pixels per character) — a
  better `maxLineLength`, but no fit: a line of narrow letters would break
  early and one of wide letters overflow, which is what W3 asks to end.
- **Kerning read from `kern` and `GPOS`** — closer to the browser's default
  drawing, but `GPOS` pair kerning, class pairs, and lookups are a large
  reader, and ligatures would still differ; turning both off in the drawing
  makes the measured width the drawn width with a small reader (question 4).
- **A word broken at graphemes** when it is wider than the frame (CSS
  `overflow-wrap: anywhere`) — it would split a timed word of captions in two
  and give the text a second rule; a long word that overflows is visible to
  the host through `frameLayout` (question 5).
- **`width` and `height` on every text**, with no `none` — the step would have
  to invent a frame for every older text from a width only the browser knows
  (W7), and a text that grows with its content is still useful for titles.
- **A new command and tool for alignment** (`SetTextAlign`) — a tool costs
  about 1 000 characters of the catalogue (W6) for what a complete style
  already carries; the captions style holds its alignment the same way.
- **`maxLineLength` replaced by a union** of a `characters` kind holding the
  count and a `width` kind — a cleaner field for width alone, but
  it moves an existing field, changes every host's complete style, and loses
  the count that subtitle standards ask for beside the width (question 8).
- **Clipping at the frame** — it hides text the author wrote, and a host can
  clip with a mask (D75) where it wants to.

## Consequences

- A host gets one frame for text and captions: a corner resizes the frame, the
  font size is a field of its own, lines wrap and align, and the spoken word
  gets an outline and a shadow; the same lines in the preview and the export.
- `@kadrion/schema`: version `0.25`, the step, the frozen `0.24`, the new
  fields, and their descriptions.
- `@kadrion/runtime`: `fontMetrics`, the measure, `textLines`, `captionPages`
  with the `width` mode, `frameLayout`, and the argument `fonts` of
  `evaluateComposition`. The runtime build changes, so Q14 reopens and the
  parity records are measured again (D34).
- `@kadrion/renderer-dom`: the load step reads metrics; the mount draws a
  framed text as lines in its frame, with the alignment; measured lines without
  kerning and ligatures; the highlight's outline and shadow in `renderState`.
- `@kadrion/player` and `@kadrion/producer`: nothing of their own beyond the
  new runtime build and the error codes they pass on; the Player's dist tree
  changes with the build.
- `@kadrion/editor-sdk` and `@kadrion/ai-sdk`: `SetNodeSize` on texts, four
  descriptions and one example, the budget test.
- `@kadrion/test-fixtures`: a generated proportional fixture font (advances
  that differ by glyph, so that a measured wrap differs from a count), a
  composition with framed texts in every alignment, a long word, an overflow,
  and captions broken by width with an outlined spoken word, and its golden
  frames.
- Package boundaries (D12) do not change: the metrics and the layout live in
  the runtime, which hosts already import; the bus measures nothing. Nothing
  names a host (D01, D02).
- Known costs: a measured node costs a read of its font at load (tables, not
  outlines) and a layout per mount; a host must ship sfnt fonts for measured
  nodes; a shaped script may draw wider or narrower than measured.

## Verification

- `packages/runtime/test`: `fontMetrics` on the generated fixture fonts against
  the advances the generators wrote, on fonts with format 4 and format 12
  subtables, and every refusal of `font-unmeasurable` (WOFF and WOFF2
  signatures, a collection, a missing table, a truncated table); the measure
  against an independent rational reference; `textLines` and the `width` mode
  of `captionPages` on seeded texts, with line feeds, runs of spaces, words
  wider than the frame, and missing glyphs; `characters` unchanged byte for
  byte; `frameLayout` for every alignment and overflow.
- `packages/schema/test`: the step's pair and the corpus; every refusal of the
  new fields.
- `packages/editor-sdk/test` and `packages/ai-sdk/test`: `SetNodeSize` on a
  text with and without a frame, `null` on a text and on another node, undone
  byte for byte; the complete-object commands with the new fields; the
  catalogue snapshot; the budget of 800 characters (D83.10).
- `tests/pinned` (pinned Chromium): the layout of a fixed set of cases gives
  the same SHA-256 in Node and in Chromium (as D82.6); every measured line of
  the new composition is drawn as wide as `frameLayout` says, within half a
  pixel, read from the DOM; the golden frames of the new composition, the
  parity of D34 at zero for it, and every earlier golden PNG file byte for
  byte.

## Implementation plan

The pull requests follow phase six's order (D82, PR-58 to PR-63), numbered
after it; each is approved on its own, before it starts and again before its
commit and push, and the rules of phase six hold for them. Sizes are those of
the phase six roadmap: S under 500 changed lines, M 800 to 1 500, L 2 000 to
3 000, tests included.

| Order | PR    | Subject                                                     | Schema | Runtime build | Player dist | Q14 | Size |
| ----: | ----- | ----------------------------------------------------------- | ------ | ------------- | ----------- | --- | ---- |
|     1 | PR-64 | D83 (documents only)                                        | —      | —             | —           | —   | S    |
|     2 | PR-65 | Font metrics and measured lines (library only)              | —      | no (checked)  | —           | —   | M    |
|     3 | PR-66 | Schema `0.25`: the frame, alignment, the width mode, W5     | `0.25` | yes           | yes         | yes | L    |
|     4 | PR-67 | `SetNodeSize` on a text, the descriptions, the budget of W6 | —      | —             | —           | —   | S    |
|     5 | PR-68 | The host guide and a showcase (with PR-63, or after it)     | —      | —             | —           | —   | S    |

- **PR-64.** This document and its row in the index. Acceptance: the owner
  answers the questions below; `node --run format:check` and
  `tests/repo/adr.test.ts` pass.
- **PR-65.** `fontMetrics`, the measure, `textLines`, the `width` mode, and
  `frameLayout` as functions over explicit arguments, in an entry of their own
  (`@kadrion/runtime/text-frame`) so that the runtime build and the Player's
  dist tree keep their bytes, as PR-59 did; the proportional fixture font; the
  pinned comparison of Node and Chromium and, by the owner's decision of
  2026-11-11, the width probe (a pinned test file added while Q14 is open).
  No field, no host change.

  - Status: in review. The functions, the fixture font, the readings the
    owner accepted on 2026-11-11 (15:38 Europe/Warsaw), and the width probe
    are recorded in the implementation notes below (PR-65). The runtime
    build keeps its bytes
    (`sha256:c4b856ed6f5abb5810c45559b105f63ca51d9709a59fa833b9990a37dd3d8c13`)
    and so does the Player's dist tree
    (`sha256:a7b583cc9d2a65085acf1c4b9a31230ef2ddd03d7269ec725ab78429a77a2452`).
    Open: the pinned comparison of Node and Chromium and the width probe
    run in the pinned container (a pinned test file added while Q14 is
    open).

- **PR-66.** The step from `0.24`, the frozen `0.24`, the fields, the load
  step, the mount and `renderState`, `evaluateComposition(…, fonts)`, the
  descriptions and examples of the complete-object tools (so that a model
  sends complete objects of `0.25`), the new composition, its golden frames,
  and its pinned tests; parity measured again. D19, D22, D27, D57, D65, D68,
  D69, and D70 get their lines; D35 its step.

  - Status: in review. The step, the fields, the load step, the mount,
    `renderState`, the evaluation with the metrics, the descriptions and
    examples of the four tools, the framed-text composition, and its pinned
    test are recorded in the implementation notes below (PR-66). The runtime
    build is now
    `sha256:2d9240d75d0b3dd8b837101394dd91573ba1cf5f6db574d78a556b6916c3ea8c`
    and the Player's dist tree
    `sha256:daa8a3081805559021629af6cac0c752f3a766895f505b3da245673c8f98b856`
    (71 files). The golden manifests of the earlier compositions change in
    the three fields of D42 alone. Open: the golden frames of the framed-text
    composition and the parity records, written in the pinned container.

- **PR-67.** `SetNodeSize` on a text with `null`, its tool's description, the
  budget test, and a fixture of model requests ("make the title box 800 by
  300", "centre the text in its box", "break the captions by width", "give the
  spoken word a black outline"), each checked by `executeTool`. D40 and D46 get
  their lines.

  - Status: in review. `SetNodeSize` on a text, its argument schema, the
    description of `set_node_size`, the budget test, and the fixture of
    model requests are recorded in the implementation notes below (PR-67).
    The catalogue grows by 797 characters over the snapshot of `0.24`. No
    schema change; the runtime build
    (`sha256:cc74d99ce99b8010eacd6a39b28f89e8ff0e81615e43dcd5319ddb58c0d73aef`)
    and the Player's dist tree
    (`sha256:36dccdc3c7bea7c33a34b9b7202d6bc168b82e393b1b88d15531ff2a89b58c44`,
    71 files) keep their bytes, the same before and after the change. The
    line of D40 was written by PR-64 and is in force from here; D46 has its
    line.

- **PR-68.** The host guide: frames, alignment, `frameLayout` for an overlay,
  sfnt fonts, and the costs; a showcase in the playground. It joins PR-63 when
  both are ready, so that one release carries `0.24` and `0.25`.

## Implementation notes (PR-65)

PR-65 adds the functions over explicit arguments, before any field uses them;
nothing in this section is in force for a document before PR-66.

- **One entry until PR-66.** `packages/runtime/src/text-frame.ts` is the entry
  `@kadrion/runtime/text-frame`, which the main entry, the render page, and
  the Player do not reach, so the runtime build and the Player's dist tree
  keep their bytes (the hashes in the status of PR-65 above, the same before
  and after the change). It exports `fontMetrics` and `FontMetricsError`
  (code `font-unmeasurable`; the load step of PR-66 reports it as the
  `RenderError` of D83.7), the measure (`advanceOf`, `measureText`,
  `fitsWidth`, `unitsToPixels`, `textLinesHeight`, `textLinesFitHeight`),
  `textLines`, `captionPagesByWidth`, and `frameLayout`.
- **`fontMetrics`** reads one `cmap` subtable, the first of the best kind in
  the order format 12 of platform 3 (encoding 10), format 12 of platform 0,
  format 4 of platform 3 (encoding 1), format 4 of platform 0, as browsers
  choose one; it does not merge subtables. A code point that maps to glyph 0
  or to a glyph past `numGlyphs` has no glyph. `font-unmeasurable` also
  covers a `unitsPerEm` outside 16 to 16 384, a `numberOfHMetrics` of 0 or
  past `numGlyphs`, and segments or groups that do not ascend, which also
  bounds the work of a hostile file to one pass over the code points.
- **The fixture font.** `generateProportionalFont` of
  `@kadrion/test-fixtures` builds the proportional font with the code of the
  monospaced one (whose bytes do not change), so no font file enters the
  repository and its licence is the repository's own (D10, D27.5). Its glyphs
  advance from 200 to 800 units (`PROPORTIONAL_FONT_ADVANCES`; its digits,
  added for the width probe below, from 400 to 600), it writes
  the advance of its last glyphs once (`numberOfHMetrics` below
  `numGlyphs`), and it maps U+1F642 only through format 12; its variants
  `format-4`, `format-12`, and `both` (the default) differ in `cmap` only.
- **Readings the owner accepted.** The owner accepted all four on 2026-11-11
  (15:38 Europe/Warsaw).
  1. The `width` mode is `captionPagesByWidth` beside the unchanged
     `captionPages`, because `captions.ts` is part of the runtime build;
     PR-66 gives `captionPages` the mode and the metrics, reading
     `captionPagesByWidth`, as PR-59 put `sourceTimeOfScene` beside
     `sourceTimeUs`.
  2. `frameLayout` reads the fields of `0.25` by their names
     (`TextFrameInput`, `CaptionsFrameInput`), so the nodes of PR-66 pass as
     they are. Beside what D83.6 lists, each line has `x` and `y`, its
     corner in the node's box as the alignment places it, so that an overlay
     does not copy the alignment either (W4); it also serves a text without a
     frame, whose lines always fit.
  3. White space at the end of a line of the text, which D83.5 does not
     name, is kept and measured while the line still fits with it, and is
     otherwise the run at which the line breaks. The first word of a line
     joins it even after white space at its start, so no line holds white
     space alone unless the text does.
  4. `missing` leaves out the line feed, a break and not a glyph, and counts
     U+0020 for captions of more than one word, since the space between two
     words is measured.
- **Node and Chromium.** `tests/pinned/text-frame.pinned.test.ts` compares
  the SHA-256 of the metrics of the four fixture fonts and of 33 layouts
  (framed texts in every alignment at two sizes, texts without a frame, and
  captions in both modes in both fonts) between the pinned Chromium and
  Node, and writes `text-frame/node-vs-chromium.json`; it is a pinned test
  file added while Q14 is open.
- **The width probe.** By the owner's decision of 2026-11-11 (15:38
  Europe/Warsaw), PR-65 already checks in the pinned Chromium that a measured
  line is drawn as wide as `measureText` and `unitsToPixels` say, so that the
  premise of D83.2 holds before the step to `0.25`: headless Chromium on
  Linux could round the advances of glyphs to whole pixels. The same test
  file loads the proportional font and the monospaced one as faces from their
  bytes, as the load step does (D27.1), and draws 30 single lines (Latin of
  mixed advances, digits, runs of spaces at the start, inside, and at the
  end, and U+1F642 through format 12, in the proportional font; Latin and
  spaces in the monospaced one) as D83.2 draws a measured line, at 13.5, 17,
  37, 50, and 96 px. Each width is read from a `Range` over the line's text,
  which keeps sub-pixel layout (`offsetWidth` rounds). The tolerance is the
  half pixel of the Verification above, per line, which D83 states; the
  1/64 px of a LayoutUnit is not asserted, but every case records its text,
  size, measured and drawn widths, difference, and whether it is within
  1/64 px in `text-frame/node-vs-chromium.json`. The texts are long enough
  that advances rounded to whole pixels would miss by more than half a pixel
  at every fractional size, which the test asserts too, so the tolerance
  cannot hide that rounding. PR-66 still checks every measured line of the
  new composition with the mount.

## Implementation notes (PR-66)

- **The metrics live in the DOM between calls.** The load step reads the
  metrics of the fonts of measured nodes (`measuredFontIds`) from the bytes it
  already holds, after it registers the fonts and before it mounts
  (`measureFonts`; bytes `fontMetrics` cannot read are the `RenderError`
  `font-unmeasurable`). The render page keeps no module state (D20, D24), so
  the mount writes them as JSON on the stage (`data-kadrion-font-metrics`, only
  when a measured node exists), and `render`, `synchronize`, and `frame` read
  them back for `evaluateComposition`. The signature of `mountComposition`
  and of the page's `mount` and `load` stay as `tests/repo/adr-signatures.test.ts`
  pins them; the mount with metrics is the internal `mountMeasured`, and
  `mountComposition` of a document with a measured node throws
  `font-metrics-missing`, as the evaluation does.
- **One runtime entry.** The main entry of `@kadrion/runtime` now exports the
  functions of PR-65 and `measuredFontIds`; `@kadrion/runtime/text-frame`
  stays as the same functions under their own entry. The lines of captions
  that both `captions.ts` and `text-frame.ts` need (`codePoints`, the pages of
  lines, the breaking by characters) moved to `caption-lines.ts`, so that
  neither imports the other.
- **`captionPages(words, style, width?, metrics?)`** dispatches on
  `style.lineBreak`: `characters`, or a style without the field, breaks as
  D57.3 always did; `width` needs the width of the box and the metrics, and
  without them is the `EvaluationError` `font-metrics-missing`.
- **`evaluateComposition(composition, timeUs, fonts?)`** checks the time
  first, then that every measured node's font has metrics, whatever the time,
  so that a host that forgets them fails at once and not at the first frame a
  measured node shows. Fonts of nodes that are not measured are ignored.
- **The mount.** A framed text is a `div` as large as its frame holding one
  `div` per line of `frameLayout`, absolutely placed at its `x` and `y`, with
  `white-space: pre` and kerning and ligatures off (D83.2); a text animated
  by line puts the fragments of each line in its line's element, and the
  runtime counts the lines of the frame that hold a word. The box of a framed
  text lies behind the block of lines, from the leftmost line and as wide as
  the widest (D83.3). A text without a frame writes `text-align` only for
  `center` and `right`, and captions broken by characters write nothing new,
  so a document migrated from `0.24` mounts as before (D83.9). A line of
  captions broken by width keeps the box's flex column for the vertical
  placement and takes its `x` from `frameLayout` as a left margin. Every
  measured line carries `data-kadrion-text-line` with its index in the lines
  of `frameLayout`, which the pinned test reads.
- **The spoken word (W5).** The mount writes the highlight's outline and
  shadow as custom properties on the captions box, only when they are not
  `none`; `renderState` sets `-webkit-text-stroke`, `paint-order: stroke`,
  and `text-shadow` from them on the spoken word and removes them from every
  other word on every call, so nothing depends on an earlier call (D20) and
  `captionsInPieces` does not change.
- **Tabs.** A tab in a measured text is measured as the advance of its glyph,
  or of `.notdef` when the font maps none, which `frameLayout` lists in
  `missing`, while the browser draws a tab stop: a host keeps tabs out of
  measured texts, and `frameLayout` tells it when one is there. A refusal of
  tabs was not added, because it would be a schema rule D83 does not state.
- **The title of the schema.** The JSON Schema of `0.24` carried the title
  `Kadrion composition 0.23` (left so by PR-61), which the frozen `0.24` keeps
  as data; the current schema is titled `Kadrion composition 0.25`.
- **The tools.** The catalogue grows by 644 characters against the snapshot
  of `0.24` (`set_text_style` 189, `set_caption_style` 190,
  `set_caption_highlight` 190, `add_node` 75), measured as D83.10 says; the
  arguments' descriptions of the three commands list the new keys, and the
  tools' descriptions say what they do. PR-67 adds `set_node_size` and the
  test of the budget.
- **The framed-text composition** (`framedTextComposition`, 640x360, two
  scenes) uses the proportional font (`generateProportionalFontAsset`) and
  only characters it maps: nine framed texts in every alignment with a box,
  a word wider than its frame, a block taller than its frame, a framed text
  with a line feed, two spaces, an outline, a shadow, and an entrance by line,
  a text without a frame aligned to the centre, and captions broken by width
  whose spoken word has an outline and a shadow. It is also a document of
  `0.25` in the compatibility corpus. `tests/pinned/framed-text.pinned.test.ts`
  reads every measured line from the Player's render page with a `Range` and
  holds it to `frameLayout` within half a pixel, compares the Player with the
  Producer pixel for pixel, checks that the spoken word's outline and shadow
  change only the spoken word, and compares the golden frames.

## Implementation notes (PR-67)

- **`SetNodeSize` on a text.** The edit of a text reads its `frame` instead
  of `width` and `height`: two numbers set `{ "kind": "fixed", width, height }`
  in the place the frame already holds, after `fontSize`; `null` for both sets
  `{ "kind": "none" }`; the frame the text already has, `none` included, is a
  no-op; the inverse states the old frame, `null` for none. The sides are
  rounded as any size, and their range is the document's, so a side that
  rounds outside 1 to 1 000 000 is `invalid-result` (D40.1). `null` on one side
  alone is `invalid-argument` at the parser, for every node; `null` for both on
  a node that is not a text is `invalid-argument` at the edit, after
  `unknown-node`. `SetNodeSizeArguments` takes `number | null` on each side.
- **The argument schema.** `width` and `height` are each `["number", "null"]`,
  and a root `anyOf` holds them both numbers or both `null`, so that the
  schema and the parser give the same verdict on every row (D40.6, D31.9), the
  rows of one `null` included. `ArgumentSchema` gains the nullable number,
  and `SetNodeSizeArgumentsSchema` is an interface of its own, as
  `SetClipSpeedArgumentsSchema` is. The schema names the nodes that have a
  size no longer: the tool's description lists them once.
- **The tool.** `set_node_size` says that on a text it sets the frame its
  lines wrap to and that `null` for both removes it, in place of "A text has
  no size; change its font size instead", and names its refusals: one `null`
  or `null` on another node as `invalid-argument`, and a rounded size outside
  the range as `invalid-result`, which the earlier text called
  `invalid-argument` although the bus has always answered `invalid-result`.
  Its example stays an image's.
- **The budget of W6.** Measured as D83.10 says, the sum over all tools of the
  length of `JSON.stringify` of each entry: the snapshot of `0.24` (PR-62) is
  232 035 characters and the catalogue 232 832, a growth of 797
  (`set_text_style` 189, `set_caption_style` 190, `set_caption_highlight`
  190, `add_node` 75, `set_node_size` 153). Of the 153, the description takes 64
  and the schema 89: the `anyOf` and the nullable sides cost 162, and the
  schema's shorter descriptions give back 73.
  `packages/ai-sdk/test/catalogue.test.ts` holds the length of `0.24` and fails
  above it plus 800.
- **The fixture of model requests.** `packages/ai-sdk/test/frame-requests.test.ts`
  carries out "make the title box 800 by 300", "centre the text in its box"
  (after `describe_document`, a complete style), "break the captions by
  width", "give the spoken word a black outline", taking a title out of its
  box, and a frame and its alignment in one transaction, each through
  `executeTool` alone, against a document written out by hand and undone in
  one step; one `null` and `null` on an image are refused.
- **The model of the history.** The property test of D38 models
  `SetNodeSize` on a text as its frame and draws the title among the nodes
  that have a size.

## Questions for the owner, with recommendations

1. **How a width is measured.** Recommendation: by Kadrion's own reading of the
   font's advance widths (`fontMetrics`, D83.1), not by the browser, not by
   breaks or metrics stored in the document, and not by an average character
   width.
2. **The invariant of the state.** Recommendation: read "derived from
   `(composition, timeUs)`" as including the bytes of the composition's fonts,
   which `contentHash` pins (D14); the evaluation takes their metrics as an
   explicit argument, needed only by measured nodes (D83.7). If the owner
   prefers, `AGENTS.md` says so in the same pull request as the schema step.
3. **Font formats.** Recommendation: sfnt only (TrueType or CFF, not WOFF,
   WOFF2, or collections) for measured nodes, refused as `font-unmeasurable`
   at load; a host converts its fonts before it stores them. Unmeasured nodes
   keep every font they use today.
4. **Kerning and ligatures.** Recommendation: off in measured lines, so that
   the width drawn is the width measured; reading `kern` and `GPOS` is a later
   ADR if a host's typography needs it.
5. **A word wider than the frame.** Recommendation: it stands alone on its
   line and overflows, in texts and in captions, never broken inside;
   `frameLayout` reports it.
6. **Overflow.** Recommendation: no clipping, a frame that never grows, the
   overflow placed by the alignment (D83.6), and `fits` from the helper; the
   bus refuses nothing for it.
7. **Where the fields live.** Recommendation: `frame` on the text node, `none`
   or `fixed`; `align` and `verticalAlign` in the text style, as in the
   captions style; `SetNodeSize` sets the frame and `null` removes it, so that
   no tool is added.
8. **Captions by width.** Recommendation: `lineBreak: "characters" | "width"`
   beside `maxLineLength`, with both bounds in `width`, rather than a union
   that replaces `maxLineLength`.
9. **The spoken word's outline and shadow.** Recommendation: the shapes of
   D69; `none` keeps the style's own on the word, so a host cannot remove the
   outline from the spoken word alone (no host asked for it).
10. **An animated frame.** Recommendation: not in `0.25`; a host animates
    `scale`, and a `size` animation of a text is a later step.
11. **The box behind a framed text.** Recommendation: behind the block of
    lines, as today; a background of the whole frame later.
12. **Lines of a text animation.** Recommendation: the lines drawn, after the
    wrap, so that a line enters as the viewer sees it.
13. **The order and the release.** Recommendation: PR-65 to PR-67 after PR-62
    and before PR-63, so that `v0.7.0` carries `0.24` and `0.25` and the host
    pins once; phase six's roadmap names them when the owner accepts this ADR.
14. **The budget of W6.** Recommendation: measured as the growth of the
    catalogue snapshot's JSON over all tools, at most 800 characters, held by a
    test.
