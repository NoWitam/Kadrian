# D70 — Animated captions and the safe area: schema 0.15

- Status: Proposed
- Date: 2026-11-08
- Supersedes: —
- Amends: D16 (captions have a highlight, a text style, and page animations;
  the composition has a `safeArea`), D22 (captions drawn in pieces in the
  tree), D35 (the step from `0.14` to `0.15` and the frozen `0.14` schema), D46
  (three tools, and the safe area in `describe_document`), D57 (57.1: the
  highlight colour becomes a highlight; 57.6: captions drawn in pieces; 57.9:
  the animated word and the highlight background are decided here), and D69
  (69.1: the text style on captions; 69.9), each with an
  `Amended by: PR-50 (D70)` line
- Related: D04, D17, D18, D19, D33, D55, D65, D67, D68,
  [phase five](../roadmap/phase-5.md) PR-50

## Context

Captions of schema `0.14` (D57) show the page of the word being spoken and
give that word a colour of its own. A host's short videos need more: the
spoken word grows, bounces, is underlined, or sits on a box; each page enters
and leaves with an animation; the words carry the outline, shadow, and box of
a title (D69); and captions are placed clear of the parts of the frame that a
platform covers with its own interface.

D69 built what this needs for text nodes: a style of `kind`s, fragments of
words and lines with tracks over opacity, offset, scale, rotation, and colour
in a fragment's own time, the five orders, and a renderer that writes the
values of every fragment on every render. D57.3 fixed the lines and pages of
captions without measuring text.

What the repository has, read on 2026-11-08 at `main` `d6e73dc`: schema `0.14`
with captions as D57 left them and the text style and fragments of D69, 74
commands, 77 tools, and a runtime build of 176 505 bytes.

## Decision

> D70: Schema `0.15` replaces the highlight colour of captions by a highlight — a colour, a scale, tracks in the word's own time, an underline, and a box — and gives captions the text style of D69 and an entrance and an exit for every page, as fragment animations of the page's words or lines. A transform never moves a neighbour, so the lines and pages stay those of D57.3. The composition gains a `safeArea`, a frame of reference that cuts nothing. Captions with anything that moves or is drawn under a word are drawn in pieces; every other captions node is drawn as D57 draws it. Three commands edit the highlight, the page animations, and the safe area.

### 70.1 The style of captions

The `style` of a captions node is
`{ fontSize, lineHeight, color, highlight, align, verticalAlign,
maxLineLength, maxLines, stroke, shadow, box, pageIn, pageOut }`:

- `highlight` takes the place of `highlightColor`:
  `{ color, scale, tracks, underline, box }`.
  - `color`: `#rrggbb`, the colour of the word being spoken.
  - `scale`: a factor from 0 to 1000 on both axes about the word's centre, `1`
    for none.
  - `tracks`: the fragment tracks of D69.3 (at most one per property, strictly
    ascending keyframes, the bounds of each row), in the word's own time
    `τ = t − startUs` from the word's start. They play while the word is
    spoken, `startUs ≤ t < startUs + durationUs`, and at no other time, so a
    bounce longer than the word is cut at its end.
  - `underline`: `{ kind: "none" }` or `{ kind: "solid", color, thickness,
offset }`: a bar as wide as the word, `thickness` from 1 to 1000 pixels
    tall, its bottom edge `offset` pixels (−1000 to 1000) below the bottom of
    the word's line box.
  - `box`: the box of D69.1, behind the word being spoken.
- `stroke`, `shadow`, `box`: the style of D69.1. The outline and the shadow
  are written on the captions' box; the box lies behind **every line** of the
  page shown, each line's own box grown by `padding`.
- `pageIn` and `pageOut`: `{ kind: "none" }` or `{ kind: "animate", unit,
staggerUs, order, tracks }`, with `unit` `word` or `line` of the page,
  `order` one of the five orders of D69.3, and at least one track.

### 70.2 When a page enters and leaves

The fragment of step `k`, of `S` steps, with stagger `s` and `L` the time of
the latest keyframe of any track, has the own time:

- **entrance:** `τ = t − start − k·s`, `start` the `startUs` of the page's
  first word, so the first step starts when the page is shown;
- **exit:** `τ = t − end + L + (S − 1 − k)·s`, so the last keyframe of the last
  step falls on `end`: the `startUs` of the next page's first word, or, on the
  last page, the end of its last word.

Both are anchored at words, not at the node's start or end. A move of the node
(`MoveClip`) carries the words and with them the pages' animations; a trim
leaves them; a split copies the words to both halves (D57.5), and each half
shows at every instant what the whole showed (tested at an entrance, a spoken
word, an exit, and the pause after the last word), so no `split-not-exact` is
needed as for an exit of D69.7. On the last page the exit ends with the last
word; the page then stays, as faded as its tracks leave it, until the node
ends or another page is shown (D57.4).

### 70.3 The state

`CaptionsNodeState.fragments` is `null` for captions drawn as D57 draws them
(70.5). Otherwise it holds `{ lines, words }`, one state of D69.4 per line and
per word of the page shown, in the order of the page; both lists are empty
while no page is shown. A word's state is computed in this order (the rules of
D69.3: opacities and scales multiply, offsets and rotations add, a colour
replaces):

1. at rest in the colour of the captions at that instant (D68);
2. the entrance, then the exit, of its unit — a line's state is computed the
   same way for a line unit;
3. for the word being spoken: the highlight colour, its scale multiplied by
   `highlight.scale`, then the highlight's tracks at `t − startUs`.

`page` and `word` stay as D57.4 evaluates them.

### 70.4 Neighbours are not pushed

A word that grows or moves is transformed: it does not change the width of
its line. The lines and pages of every style are those of `captionPages`
(D57.3), counted in code points; a scaled word may overlap its neighbours, and
the author keeps `maxLineLength` low enough for the words to fit. This keeps
the layout a function of the words alone, and makes a captions node in pieces
at rest paint the pixels of the same node in one piece, which the pinned test
asserts for both units.

### 70.5 The renderer

- **In one piece or in pieces.** `captionsInPieces(style)` is true when the
  style has a box, a highlight scale other than 1, highlight tracks, an
  underline, a highlight box, or a page animation. Otherwise the captions are
  drawn exactly as D57.6 draws them — the highlight colour through
  `--kadrion-caption-highlight` — so every document of `0.14` renders byte for
  byte.
- **Pieces.** At mount every line of every page holds its words in a `span`
  (`data-kadrion-caption-line`, `display: inline-block`, `position:
relative`) whose first child is the style's box; every word is an
  `inline-block` `span` that holds, under its glyphs, the highlight's box and
  underline (`data-kadrion-caption-word-box`, `data-kadrion-caption-underline`,
  `z-index: -1`), hidden. The spaces stay text between the words.
- **Values.** `renderState` writes `opacity` and `transform` on every line and
  `opacity`, `transform`, and `color` on every word of the page shown, at rest
  too; shows the highlight's box and underline (`display: block`) on the word
  being spoken alone; and removes what an earlier call wrote on every line and
  word of every other page. A render after any other render yields the tree of
  a fresh mount (D54.3). A state whose fragments are not the lines and words
  mounted on the page it shows is `state-mismatch`.
- **Style.** The outline and the shadow are written on the captions' box at
  mount, as on a text (D69.5).

### 70.6 The safe area

`safeArea` follows `height` in the composition:
`{ fromTop, fromRight, fromBottom, fromLeft }`, integers from 0 to 1920
composition pixels from each edge of the canvas; all zero is the whole canvas.

- It is **document data**, not a host convention, so that the bus, the tools,
  a template, and a host read the same area, and an AI places captions inside
  it from `describe_document` alone.
- It is a **frame of reference**: nothing is cut, moved, or drawn by it, and
  no frame changes with it.
- `safe-area-empty` at `/safeArea` refuses insets that leave no pixel:
  `fromLeft + fromRight ≥ width` or `fromTop + fromBottom ≥ height`.
- **Deviation from the plan:** there is no captions placement field. A
  captions node is placed with its `position` and size as any node; the tool
  text tells a model to place it inside the safe area that `describe_document`
  reports. A placement that follows the safe area would be a second way to
  say where a node is.

### 70.7 Validation

- Highlight tracks and page tracks follow the rules of animations:
  `duplicate-animation-target` and `keyframes-not-ascending` (D16.6), at
  `…/style/highlight/tracks` and `…/style/pageIn/tracks`, `…/style/pageOut/tracks`.
- `safe-area-empty` (70.6), the only new code; every other rule is the
  schema's.

### 70.8 Commands and tools

- `SetCaptionHighlight { nodeId, highlight }` replaces the highlight in its
  place in the style.
- `SetCaptionPageAnimation { nodeId, phase, animation }` replaces `pageIn`
  (`phase: "in"`) or `pageOut` (`"out"`); any other phase is
  `invalid-argument`.
- `SetSafeArea { safeArea }` replaces the safe area in its place in the
  document.
- A node that is no captions is `unsupported-node`; the same value is no edit;
  every other refusal is `invalid-result` with the validator's errors; each
  inverse restores the document to its exact text. `SetCaptionStyle` replaces
  the whole style, the new fields included.
- The commands are tools (`set_caption_highlight`,
  `set_caption_page_animation`, `set_safe_area`, D46); `describe_document`
  reports `safeArea`. The registry has 77 commands and the catalogue 80
  entries.

### 70.9 Schema `0.15` and the step from `0.14`

`step014To015` replaces `highlightColor` by `{ color: highlightColor,
scale: 1, tracks: [], underline: { kind: "none" }, box: { kind: "none" } }` in
its place, appends `stroke`, `shadow`, `box`, `pageIn`, and `pageOut`, each
`none`, after `maxLines`, writes a safe area of zeros after `height`, and sets
`schemaVersion` to `0.15`. Every other key keeps its place and every value its
bits, and every document of `0.14` renders byte for byte. The frozen
`compositionSchemaV014` reads `0.14` (D35); the compatibility corpus gains
`compatibility/v0-15/` with every fixture of `0.14` migrated and the animated
captions composition, and the earlier corpora keep their bytes.

### 70.10 What this ADR does not decide

- A karaoke fill across a word, a highlight that moves from word to word,
  emoji or images inside captions, and transcription (the host's).
- A placement of captions that follows the safe area, or a safe area that
  clips.
- A neighbour pushed by a grown word; measured line breaking (D57.9).

## Alternatives considered

- **A `bounce` keyframe list of its own,** as the plan named it. The tracks of
  D69 already animate offset, scale, rotation, and colour with easing, and a
  bounce is one offset track; a second kind of keyframes would need its own
  bounds, validation, and tool text.
- **Pushing neighbours.** A grown word would change the width of its line,
  which depends on the font, and so the lines and pages, which D57.3 keeps a
  function of the words; the layout would differ between fonts that a Player
  and a Producer share by hash but the runtime never measures.
- **Always in pieces.** Every captions node of `0.14` would change its pixels,
  since inline-block words round to device pixels on their own; drawing in
  pieces only when a style needs it keeps the golden frames of D57.
- **Page animations in the node's time,** as D69 phases. A page is shown from
  its first word, which a move carries; anchoring at the node would make a
  split of captions inexact.
- **The safe area as a host convention.** A model, a template, and a host
  would each keep their own copy; see 70.6.

## Consequences

- `@kadrion/schema`: schema `0.15`, the types `CaptionHighlight`,
  `CaptionPageAnimation`, and `SafeArea`, the code `safe-area-empty`, the
  frozen `0.14` reader, and the step.
- `@kadrion/runtime`: `captionFragments`, `captionsInPieces`, and the type
  `CaptionFragmentsState`; `CaptionsNodeState.fragments`. The runtime build
  grows to 189 296 bytes; its hash changes, so the golden frames are written
  again and parity is measured again.
- `@kadrion/renderer-dom`: the text style on captions and captions in pieces.
- `@kadrion/editor-sdk`: three commands and their tool metadata, the safe area
  in `describe_document`; `@kadrion/ai-sdk`: three tools and the catalogue's
  snapshot. The change of the API is breaking (the captions style and the
  composition have new fields, the captions state `fragments`).
- `@kadrion/test-fixtures`: the animated captions composition (640×360, 2 s,
  with a safe area: words entering forward with a rise and leaving from the
  edges under a highlight that grows and is underlined; lines entering
  backward, growing and turning green to grey, behind a box, with a shadow,
  under a highlight that bounces and turns on a red box), its 4 golden frames,
  the `0.15` corpus, and every fixture at `0.15`.
- Q14 stays open: a new pinned test and its reports are added.

## Verification

- Unit tests of the runtime (`packages/runtime/test/caption-fragments.test.ts`):
  which styles are drawn in pieces, the pages of the fixture, the own time of
  an entrance and an exit at every step and order, the end of the last page,
  the highlight on top of an entrance and its tracks while the word is spoken
  only, and the fragments in the evaluated state.
- Unit tests of the renderer (`packages/renderer-dom/test/captions-motion.test.ts`):
  the line and word pieces, the box behind every line, the hidden pieces of
  the highlight, the values written from the state at every golden time, the
  pieces shown on the spoken word alone, the same tree after any order of
  renders, and `state-mismatch`.
- Unit tests of the commands, their undo byte for byte, their no-ops and
  refusals (`packages/editor-sdk/test/captions-motion.test.ts`), of the tools,
  and of a split of animated captions at every kind of instant
  (`tests/app/timeline-split.test.ts`).
- Negative fixtures for every new field and rule; the step 0.14 → 0.15 has its
  migration pair and the invalid corpus of `0.14`.
- In pinned Chromium (`tests/pinned/captions-motion.pinned.test.ts`): captions
  in pieces at rest, by word and by line, give the pixels of the same captions
  in one piece; the same words moved in time with the times rendered give the
  same frames; the highlight's box and underline change the pixels while a word
  is spoken and not in a pause; and the frames of the animated captions
  composition meet their 4 golden frames. The existing golden PNG files stay
  byte for byte.
- Parity of the Player against the Producer measured again.
