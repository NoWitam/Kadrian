# D57 — Captions: schema 0.7, timed words in a style, lines and pages from the runtime, and their commands

- Status: Accepted — by the project owner on 2026-11-02, after PR-33 was merged
  (PR #29)
- Date: 2026-11-02
- Amended by: PR-49 (D69) on 2026-11-08: 57.2: the word of a text animation is the word of captions, a run without white space (D69.2)
- Amended by: PR-50 (D70) on 2026-11-08: 57.1: `highlightColor` becomes `highlight`, with the text style and page animations; 57.6: captions drawn in pieces; 57.9: the animated word and the highlight background are decided (D70)
- Amended by: PR-64 (D83) on 2026-11-11, in force from PR-66: 57.2 and 57.3: captions may also break into lines by width (`lineBreak: width`), keeping both bounds (D83.5)
- Supersedes: —
- Extends: D19 (19.4: a captions node of the state carries the page it shows
  and the word being spoken), D22 (the mount of a captions node and what a
  render writes on it), D35 (the step from `0.6`), D46 (three tools), and D55
  (55.3: a move carries a captions node's words like its keyframes), each with
  an `Amended by: PR-33 (D57)` line
- Related: D04, D14, D15, D16, D17, D18, D21, D27, D30, D38, D39, D42, D49,
  D56, [roadmap of phase three](../roadmap/phase-3.md) PR-33

## Context

Studio item 7 of the roadmap needs captions from a transcription: words with
their timings, shown in a style, with the word being spoken highlighted. The
plan for PR-33 asks for a node `captions` with a font asset, a style (size,
colours, position, the highlight of the current word, lines and their
breaking), and a list of words with `startUs` and `durationUs`; grouping of
words into lines and pages a pure function of the document; commands to
replace the words, edit one word, and change the style. It left one question
to this ADR: whether line breaking is computed by the runtime, deterministic
and without measuring text, or by the browser, with measured text and the
pinned fonts of D27.

What the repository has, read on 2026-11-02 at `main` `62f0329`: schema `0.6`
with scenes, transitions, and nodes `background`, `group`, `image`, `text`,
`video`, and `custom-html` (D56); a text node is one run of text in a font
asset, which the renderer shows with `white-space: pre`, so the browser never
wraps it; a runtime that knows no fonts and no layout (D19); keyframes in
scene time, which a move carries and a trim and a split leave (D55.3); and 50
commands in the closed registry.

## Decision

> D57: Schema `0.7` adds the node `captions`: a box with a font asset, a style, and a list of timed words in scene time; the runtime breaks the words into lines by a count of characters and the lines into pages, without measuring text, and evaluates the page shown and the word spoken from the timings alone; the renderer mounts every page and shows one; three commands replace the words, one word, and the style.

### D57.1 Schema `0.7`

- A new node type `captions`, a member of a scene's `nodes` (not of a
  group's `children`), with, after its lifetime and transform like every
  visual node: `fontAssetId`, `width`, `height`, `style`, and `words`.
- `style` is `{ fontSize, lineHeight, color, highlightColor, align,
verticalAlign, maxLineLength, maxLines }`: `fontSize` and `lineHeight`
  lengths in composition pixels, the two colours `#rrggbb` as elsewhere,
  `align` one of `left`, `center`, `right`, `verticalAlign` one of `top`,
  `middle`, `bottom`, `maxLineLength` an integer from 1 to 1000, and
  `maxLines` an integer from 1 to 100. No field is optional (D16).
- A word is `{ text, startUs, durationUs }`: `text` matches `^\S+$` — at
  least one character and no white space, because the runtime joins words
  with one space — `startUs` a time and `durationUs` a duration (D04).
- Words are in **scene time**, like keyframes (D55.3), not in the time of
  their node: a transcription of a video placed in a scene is mapped once by
  the host, and the timeline commands treat words as they treat keyframes
  (D57.5).
- A word has **no ID**. A transcription has thousands of words; IDs would
  share the one namespace of the document (D16.3) and add nothing a command
  needs: a word is addressed by its index, as a keyframe is by its time. The
  schema test that requires an ID of every array item now exempts `words`
  beside `keyframes`.
- `fontAssetId` names a font asset, checked like a text node's
  (`unresolved-asset-reference`, `asset-type-mismatch`, D14).
- One new semantic rule, `caption-words-overlap`: a word starts no earlier
  than the word before it ends, compared as `start(k) − start(k−1) <
duration(k−1)` so that no end is formed past `2^53 − 1`. Words are
  therefore in order and never overlap; gaps are allowed. An empty list is
  valid and shows nothing.

### D57.2 Line breaking: the runtime, without measuring text

The runtime decides which words make a line and which lines make a page.

- **Why the runtime.** The page shown and the word highlighted are state, and
  state is derived from `(composition, timeUs)` alone (D19). If the browser
  wrapped the words, the pages — and so which words are on screen at a given
  time — would depend on font metrics that only a browser measures; the
  runtime would have to measure text (it knows no fonts, D19), or the pages
  would exist only in the DOM, where meaningful state must not hide
  (`AGENTS.md`). The host's timeline, the AI's description, and a test can
  compute the pages from the document without a browser.
- **The cost.** A line is bounded by characters, not by pixels. A host that
  wants lines to fit the box chooses `maxLineLength` for its font and size;
  a line that is wider than the box overflows it and is not cut. With the
  monospace fixture font the count is exact; with a proportional font it is
  an approximation the host tunes, as subtitle standards do with their
  character limits.

### D57.3 The layout: `captionPages`

`captionPages(words, style)` of `@kadrion/runtime` is pure and total:

1. Words fill lines greedily, in order. The length of a word is its number of
   Unicode code points; a line's length is the sum of its words' lengths plus
   one per space between two words. A word joins the current line while the
   line stays at most `maxLineLength` long; otherwise it starts a new line. A
   word longer than `maxLineLength` stands alone on its line.
2. Every `maxLines` consecutive lines make a page; the last page may hold
   fewer. No words, no pages.

A page lists its lines, each the indices of its words, and the index of its
first word.

### D57.4 Evaluation: the page shown and the word spoken

At scene time `t` an active captions node shows:

- the **page** whose first word started last at or before `t`: a page stays
  until the next page's first word starts, through any pause, and the last
  page until the node ends; before the first word, no page (`null`);
- the **word** whose interval `[startUs, startUs + durationUs)` holds `t`,
  compared as a difference; between two words, none (`null`). The word is on
  the page shown, because words do not overlap and pages are consecutive.

The state of a captions node (D19) is a leaf with its transform and
`page` and `word`, both indices; both are `null` while the node is not
active. Both are found by binary search over the start times, which ascend
by D57.1. Nothing reads a clock or remembers an earlier frame.

### D57.5 The commands

| Command           | Arguments                 | Effect                                       | Inverse                                     |
| ----------------- | ------------------------- | -------------------------------------------- | ------------------------------------------- |
| `SetCaptionWords` | `nodeId`, `words`         | replaces every word: a new transcription     | `SetCaptionWords` with the old words' bytes |
| `SetCaptionWord`  | `nodeId`, `index`, `word` | replaces the word at `index`: text or timing | `SetCaptionWord` with the old word's bytes  |
| `SetCaptionStyle` | `nodeId`, `style`         | replaces the style; no word and no time      | `SetCaptionStyle` with the old style        |

- Words and styles are exact data judged by the document's validation, like a
  node of `AddNode` (D39); a failure is `invalid-result` with the validation's
  messages. A node that is not `captions` is `unsupported-node`; an index
  outside the words is `index-out-of-range`. An edit that changes nothing is
  no edit (D30.9).
- A captions node is created by `AddNode`, removed by `RemoveNode`, and edited
  by the commands every visual node has: position, scale, opacity, size
  (`SetNodeSize`, its box), lifetime, animations, and `SetTextFont`, which now
  takes a captions node as well as a text. Its colours and font size are its
  style's, so `SetNodeColor` and `SetTextFontSize` refuse it with
  `unsupported-node`.
- **Timeline commands (amends D55.3).** Words are content of the clip, like
  keyframes: `MoveClip` moves every word by the same amount; `TrimClipStart`
  and `TrimClipEnd` move none, so a trim hides the words outside the lifetime;
  `SplitClip` copies every word to both halves, each of which shows the words
  of its own interval exactly as the whole did, and `JoinClips` takes the
  copy back. `DuplicateNode` copies the words.

### D57.6 Rendering

- The mount (D22) builds the box of a captions node — `width` and `height`,
  the font of D22.6, `font-size`, `line-height` in pixels, `white-space: pre`,
  `text-align`, the colour — and the highlight colour as the custom property
  `--kadrion-caption-highlight` on the box. Inside it, one element per page of
  `captionPages` (`data-kadrion-caption-page`, its index), filling the box as
  a column whose lines lie as `verticalAlign` says; in a page, one element per
  line; in a line, one element per word (`data-kadrion-caption-word`, its
  index), the words joined by one space as text. Every page is mounted with
  `display: none`. The words are text nodes, never markup.
- A render writes, for a captions node, `display: flex` on the page the state
  names and `display: none` on every other one, and
  `color: var(--kadrion-caption-highlight)` on the word being spoken; every
  other word loses its own colour, and with it a `style` attribute left
  empty. Everything is written on every render, so the tree is that of a fresh
  mount at the state, in any order of renders, and a scene that is not
  evaluated resets its captions to the mount.
- A page the state names that the mount did not build is `state-mismatch`.
- The fonts of captions nodes are loaded like a text node's (D27.1).

### D57.7 The step from `0.6`

`step06To07` sets `schemaVersion` to `0.7` and changes nothing else: no
document of `0.6` has a captions node, and no time value moves (D49.7). The
frozen `compositionSchemaV06` reads `0.6` (D35); the compatibility corpus
gains `compatibility/v0-7/`, every entry is read by `0.7` too, the files of
`v0-6/` that were only expectations become inputs of their own, and the
earlier corpora keep their bytes.

### D57.8 Tools and the description of a document

- Three tools from the metadata of the three commands (D46); the catalogue has
  53 tools. Their descriptions state how words become lines and pages, that
  words are in scene time, and that a word is addressed by its index.
- `describe_document` shows a captions node's `style` and `words` among its
  stored fields, as for every node; the pages are not described, because
  `editor-sdk` does not depend on the runtime (D12) — a host that needs them
  calls `captionPages`.

### D57.9 What this ADR does not decide

- Transcription and translation, which are the host's.
- Animated word effects beyond the highlight: a word that grows, bounces, or
  appears letter by letter; a highlight background.
- Line breaking by measured width, right-to-left and vertical text, and
  hyphenation.
- Captions inside a group, and a word that spans lines.

## Alternatives considered

- **Line breaking by the browser (measured text, pinned fonts).** It wraps
  naturally at the box's width, but which words are on screen at a time would
  exist only in the DOM, a browser would be needed to know it, and the
  runtime state would stop describing what is shown; see D57.2.
- **Measuring text in the runtime from the font's advance widths.** The
  runtime would need to parse font files and implement shaping and kerning to
  agree with the browser, a large and fragile surface for a first step; a
  later ADR may add a width bound if a host needs one.
- **Word times relative to the node.** A trim of the start would then have
  to move every word, and a split would have to rewrite the second half's
  words; scene time keeps both exact and matches keyframes.
- **Words with IDs.** See D57.1: the namespace cost is large and an index is
  enough for a command and its inverse.
- **A page shown only while its words are spoken.** Captions would flicker
  off in every pause between words; holding a page until the next one starts
  is the usual reading of subtitles, and a host that wants a gap sets a
  shorter node or splits it.

## Consequences

- `@kadrion/schema`: schema `0.7`, the node and its types, the frozen `0.6`
  reader, the step, and the code `caption-words-overlap`.
- `@kadrion/runtime`: `captionPages`, `captionAt`, and the captions state;
  the runtime build hash changes, so the golden frames are written again and
  parity is measured again.
- `@kadrion/renderer-dom`: the captions mount and render, and the font of a
  captions node in the load step.
- `@kadrion/editor-sdk`: three commands, `MoveClip`'s words, and
  `SetTextFont` for captions.
- `@kadrion/ai-sdk`: three tools; the catalogue's snapshot.
- `@kadrion/test-fixtures`: the captions composition (640×360, 3 s, ten words
  in two pages of two lines, with a pause), its golden frames, the `0.7`
  corpus, the frozen reference and negative corpus of `0.6`, and every
  fixture at `0.7`.
- The Producer and the Player need no change beyond the runtime build; Q14 is
  not touched.

## Verification

- Unit tests of the layout — greedy lines, one space counted, a long word
  alone, code points, no words — and of the page and word at the boundaries
  of every word and in a pause (`packages/runtime/test/captions.test.ts`); of
  the mount and every render in any order of renders
  (`packages/renderer-dom/test/captions.test.ts`); and of the three commands,
  their exact inverses, their refusals, and the timeline commands on captions
  (`packages/editor-sdk/test/captions.test.ts`).
- Six negative fixtures cover the code and the new fields; the step 0.6 → 0.7
  has its migration pair and the invalid corpus of `0.6`.
- Golden frames of the captions composition before the first word, at a word
  of each line and page, in the pause, and at the last word; and a pinned
  check that moving the words and the time together gives the same frames and
  that the highlight is the only difference between a spoken word and the
  pause of its page (`tests/pinned/captions.pinned.test.ts`).
- Parity of the Player against the Producer measured again.
