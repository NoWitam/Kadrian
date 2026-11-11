# D69 — Text styles and text animated in fragments: schema 0.14

- Status: Accepted — by the project owner on 2026-11-08, after PR-49 was merged
  (PR #66)
- Date: 2026-11-08
- Amended by: PR-50 (D70) on 2026-11-08: 69.1 and 69.9: the text style on captions, its box behind every line (D70.1)
- Amended by: PR-64 (D83) on 2026-11-11, in force from PR-66: 69.1 and 69.9: alignment lies in the text style, and measured wrapping is decided (D83.4, D83.5)
- Supersedes: —
- Amends: D16 (a text has a `style` and `textAnimations`; the tracks of a text
  animation follow the rules of animations), D22 (the style of a text, its box,
  and its fragments in the tree), D35 (the step from `0.13` to `0.14` and the
  frozen `0.13` schema), D39 (39.3: a copied text animation is renamed
  `<owner>-t<i>`), D46 (four tools), D55 (55.3: a move carries an accent, a
  split hands the second half its entrance as an accent and refuses an exit),
  D57 (57.2: the word of a text animation is the word of captions), and D65
  (65.3: fragments of text as built), each with an `Amended by: PR-49 (D69)`
  line
- Related: D04, D17, D18, D19, D33, D58, D67, D68,
  [phase five](../roadmap/phase-5.md) PR-49 and question 8

## Context

A text node of schema `0.13` is one run of glyphs in one colour, with a
transform, an opacity, and their animations (D68). A host's titles need text
that appears letter by letter, word by word, or line by line, and text with an
outline, a shadow, or a box behind it, in the Player and the Producer alike,
since parity is measured at 0 differing pixels (D33).

D65.3 fixed what a fragment is and that a node with a fragment animation is
rendered in fragments at every instant of its lifetime, because probe 4 showed
that a text split into one element per letter differs from the text in one
piece even at rest. It left to this step the table of letters (question 8),
the timing of a fragment, the orders, how a stroke is drawn, and the commands.

What the repository has, read on 2026-11-08 at `main` `9eb059b`: schema `0.13`
with the rotation, origin, colours, and easing of D67 and D68, 73 tools, a
text drawn as one text node in a `div` with `white-space: pre` (D22), and the
probes of D65.8, in which `-webkit-text-stroke`, `paint-order: stroke fill`,
`text-shadow`, and letters in `inline` and `inline-block` elements at rest and
in mid-stagger are exact.

## Decision

> D69: Schema `0.14` gives every text node a `style` — an outline drawn outside the glyphs, a drop shadow, and a box behind the lines, each of them or none — and a list of `textAnimations`. A text animation animates every letter, word, or line of the text with the same tracks over opacity, offset, scale, rotation, and colour, in the fragment's own time, which starts a stagger after the fragment before it in one of five orders. A letter is an extended grapheme cluster by Kadrion's own table of Unicode 17.0.0. The runtime derives the fragments and their values into the state; the renderer builds one element per fragment at mount and writes their values on every render. Four commands edit styles and text animations.

### 69.1 The style of a text

`style` follows `color` and holds three parts, each a `kind` and its fields,
as every optional part of the closed schema (D16):

- `stroke`: `{ kind: "none" }` or `{ kind: "outside", color, width }`, `width`
  an integer from 1 to 1000 composition pixels. The outline lies **outside**
  every glyph and under its fill, so a thin letter keeps its shape: the
  renderer writes `-webkit-text-stroke` of twice the width and `paint-order:
stroke`, which pinned Chromium reads back for `stroke fill`. Probe
  `text/stroke-6-paint-order` is exact. A centred stroke (the CSS default) eats
  into the fill, and was left out.
- `shadow`: `{ kind: "none" }` or `{ kind: "drop", color, opacity, offset,
blur }`, `opacity` from 0 to 1, `offset` integers from −1000 to 1000, `blur`
  an integer from 0 to 1000. It is `text-shadow`, so it falls from the glyphs
  and their outline.
- `box`: `{ kind: "none" }` or `{ kind: "solid", color, opacity, padding,
cornerRadius }`, integers from 0 to 1000. The box is the box of the lines
  grown by `padding` on every side, with rounded corners, painted under the
  glyphs. It moves nothing: the node's box, and so its origin (D68.2), stays
  the box of its lines.

An opacity is written as `rgba`; pinned Chromium draws it in 256 levels, so
two opacities closer than 1/255 may paint the same pixels. A style is not
animated in this step; captions get the same style in PR-50.

### 69.2 Letters, words, and lines

- **A letter** is an extended grapheme cluster of UAX #29 (rules GB3 to GB999,
  GB9c with `Indic_Conjunct_Break`, GB11, GB12 and GB13) by a table of
  Kadrion's own, pinned to **Unicode 17.0.0**; white space is no letter.
  `Intl.Segmenter` is not used, because it depends on the ICU of the browser
  and of Node, which a Player and a Producer need not share.
- **A word** is a maximal run of characters that are not white space, white
  space being the `WhiteSpace` and `LineTerminator` code points of ECMAScript,
  which D57 uses for captions. A run is cut into letters as a whole, so a
  letter never spans two words.
- **A line** is a line of the text as written, split at a line feed, that holds
  at least one word. A text node is not wrapped, so nothing is measured.
- The table is generated from the files of the Unicode Character Database by
  `tests/unicode/grapheme-table.ts` into
  `packages/runtime/src/grapheme-table.ts`: 4 531 characters, each run of code
  points with one class as its length in base 36 and its class as one capital
  letter, decoded once when the module loads. The generator refuses another
  version and a combination of properties the rules do not expect. A newer
  Unicode version is a new table and a new decision, since it can change which
  letters a text has.

### 69.3 A text animation

`textAnimations` follows `style`; each item is
`{ id, unit, phase, staggerUs, order, tracks }`:

- `unit`: `letter`, `word`, or `line`.
- `phase`, which places the fragment's own time `τ` at the scene time `t` for
  the fragment of step `k`, with stagger `s`:
  - `{ kind: "in" }`: `τ = t − startUs − k·s`, step 0 starts at the node's
    start;
  - `{ kind: "accent", startUs }`: `τ = t − startUs − k·s`, `startUs` a scene
    time from 0;
  - `{ kind: "out" }`: `τ = (t − startUs) − (durationUs − L − (S − 1 − k)·s)`,
    so the last keyframe of the last step falls on the node's end, where `L`
    is the time of the latest keyframe of any track and `S` the number of
    steps.
- `staggerUs`: an integer of microseconds between two steps (D04).
- `order`, which gives each of the `n` fragments, in the order of the text,
  its step:
  - `forward`: fragment `i` has step `i`; `backward`: `n − 1 − i`;
  - `center`: `⌊|2i − (n − 1)| / 2⌋`, the middle first, two fragments as far
    from it in one step; `edges`: `⌊(n − 1) / 2⌋` less that, both ends first;
  - `random` with a `seed`, an integer from 0 to 4 294 967 295: a
    Fisher–Yates shuffle from the last position down, the position swapped
    with `j = v mod (last + 1)`, `v` the next 32-bit output of `mulberry32`
    from the seed (integer operations only: `Math.imul`, `>>>`, `^`, `|`);
    the fragment at position `p` of the result has step `p`. The same seed
    gives the same order on every engine; the generator is part of the
    document's meaning and cannot change without a new version.
- `tracks`: at least one, at most one per property, each
  `{ property, keyframes }` with at least two keyframes `{ timeUs, value,
easing }` in strictly ascending `timeUs` of the fragment's own time, from 0,
  and the easing of D67:
  - `opacity`: a factor from 0 to 1;
  - `offset`: `{ x, y }` integer pixels from the fragment's place;
  - `scale`: `{ x, y }` factors from 0 to 1000 about the fragment's centre;
  - `rotation`: degrees from −360 000 to 360 000 about its centre, clockwise;
  - `color`: `#rrggbb`, which replaces the text's colour, per channel as D68.4.

A track is sampled as an animation (D18, D67): before its first keyframe a
fragment holds the first value, after its last the last, so an entrance
starts at opacity 0 before its turn comes. The eased value is held within the
bounds of its row (D67.6). Several text animations of one node combine in
their order: opacities and scales multiply, offsets and rotations add, and the
last colour track wins. Each unit is animated on its own; a letter inside an
animated word moves with the word's element (69.5). The arithmetic is that of
IEEE 754 doubles, the same on every engine, and exact while every product and
difference is a safe integer, as it is for every stagger below a day and every
text of fewer than 100 000 fragments.

### 69.4 The state

`TextNodeState.fragments` is `null` for a text without text animations, which
is drawn in one piece as before. Otherwise it lists, per unit, one state per
fragment in the order of the text — `{ opacity, offset, scale, rotation,
color }` — and none for a unit no animation uses. A fragment at rest has
opacity 1, no offset, scale 1, rotation 0, and the text's colour at that
instant. The node's own transform, opacity, and colour stay as D68 evaluates
them.

### 69.5 The renderer

- **The style** is written at mount, since it is not animated: the stroke and
  the shadow on the text's element; the box as an element of its own, the
  first child of the text's element, `position: absolute` with every inset at
  minus the padding and `z-index: -1` inside the stacking context of the
  transformed text, so it paints under the glyphs and moves nothing.
- **Fragments.** A text with text animations is built at mount in nested
  `span` elements with `display: inline-block` and `data-kadrion-fragment` set
  to the unit — line, then word, then letter — for every unit its animations
  use; white space and line feeds stay text between them, so the text reads
  as written. Its letters are those of 69.2, by the same table.
- **Values.** `renderState` writes `opacity`, `transform`
  `translate(x px, y px) rotate(r deg) scale(sx, sy)` about the fragment's
  centre (the initial `transform-origin`), and `color` on every fragment on
  every call, at rest too, so a render after any other render yields the tree
  of a fresh mount (D54.3). A state whose fragments are not those mounted is
  `state-mismatch`. A scene that is not active loses these values with what
  else a render wrote.
- **Always in fragments** (D65.3): a text with a text animation is split for
  its whole lifetime. With a font that kerns, it differs from the text in one
  piece (probe 4) for its whole lifetime and never jumps; the fixture's font
  does not kern, so its fragments at rest give the pixels of the whole text,
  which the pinned test asserts.

### 69.6 Validation

- The tracks of a text animation follow the rules of animations:
  `duplicate-animation-target` for a second track of one property and
  `keyframes-not-ascending` (D16.6).
- A text animation's ID is an ID of the document (`duplicate-id`).
- A colour bound to an input (D58) of a text with a colour track is
  `bound-property-animated`, as with an animation of its colour (D68.7).
- No new code: every other rule is the schema's.

### 69.7 Commands and tools

- `SetTextStyle { nodeId, style }` replaces the style; `unsupported-node` for a
  node that is no text; the same style is no edit.
- `AddTextAnimation { nodeId, index, animation }` inserts a text animation;
  `index-out-of-range`, `id-in-use`, `unsupported-node`; its ID is created.
- `RemoveTextAnimation { textAnimationId }` removes one; its inverse adds it
  back at its index; `unknown-animation`.
- `SetTextAnimation { animation }` replaces the text animation with the
  animation's `id`; `unknown-animation` for an `id` no text animation has (or
  none); the same animation is no edit.
- Every other refusal is `invalid-result` with the validator's errors.
- **Other commands.** `MoveClip` moves an accent's `startUs` with the node, as a
  keyframe (D55.3); a trim moves none. `SplitClip` of a text copies its text
  animations to the second half as `<newClipId>-t<i>`, an `in` one as an
  `accent` at the start of the whole, so both halves look exactly like the
  whole and `JoinClips` takes it back; a text with an `out` animation is
  refused with `split-not-exact`, since the first half would end it at the
  cut and its start depends on how many letters the text has, which the bus
  does not count. `DuplicateNode` and `DuplicateScene` rename a copied text
  animation `<owner>-t<i>` (D39.3); a removed node takes its text animations
  with it.
- The commands are tools (`set_text_style`, `add_text_animation`,
  `remove_text_animation`, `set_text_animation`, D46); the registry has 74
  commands and the catalogue 77 entries.

### 69.8 Schema `0.14` and the step from `0.13`

`step013To014` writes `style` with no stroke, no shadow, and no box, and an
empty `textAnimations` list after the `color` of every text node, and sets
`schemaVersion` to `0.14`. Every key keeps its place and every value its bits,
and every document of `0.13` renders byte for byte. The frozen
`compositionSchemaV013` reads `0.13` (D35); the compatibility corpus gains
`compatibility/v0-14/` with the text composition, and the earlier corpora keep
their bytes.

### 69.9 What this ADR does not decide

- A style of captions, animated captions, and pages that enter and leave
  (PR-50).
- An animated style, text on a path, measured wrapping, right-to-left and
  vertical text (D57.9).
- A stroke centred on the outline or inside it; a gradient fill.

## Alternatives considered

- **`Intl.Segmenter`.** It gives the letters of the engine's ICU, which differ
  between versions of Chromium and of Node; a document would have another
  number of fragments in the Player and the Producer. See 69.2.
- **Code points as letters**, as D57 counts them for line breaking. An emoji
  sequence, a flag, or an accent written as a combining mark would fly apart.
- **Fragments only while an animation runs.** Probe 4; see 69.5.
- **A centred stroke**, the CSS default. It thins the fill by half the width.
- **Phases in the node's own time only.** An accent at a stated scene time is
  what a host needs to stress one word in the middle of a title, and it moves
  with the node as a keyframe does.
- **`Math.random` or a hash of the ID for `random`.** Neither is in the
  document; the seed is, and a host can change it to try another order.
- **Splitting a text with an exit by moving its exit to an accent.** Its start
  depends on the number of steps, which the bus would have to count with the
  runtime's table, against D12.

## Consequences

- `@kadrion/schema`: schema `0.14`, the types `TextStyle`, `TextAnimation`,
  `FragmentTrack`, and `FragmentUnit`, the frozen `0.13` reader, and the step.
- `@kadrion/runtime`: the grapheme table and segmentation (`graphemes`,
  `textLayout`, `UNICODE_VERSION`), the fragments in the state
  (`textFragments`, `fragmentSteps`). The runtime build grows by the table
  (4 604 bytes), the segmentation (4 578 bytes), and the fragments (4 892
  bytes), to 176 505 bytes; its hash changes, so the golden frames are written
  again and parity is measured again.
- `@kadrion/renderer-dom`: the style, the box, and the fragments of a text.
- `@kadrion/editor-sdk`: four commands and their tool metadata;
  `@kadrion/ai-sdk`: four tools and the catalogue's snapshot. The change of
  the API is breaking (a text has new fields, its state `fragments`).
- `@kadrion/test-fixtures`: the text composition (640×360, 2 s: letters rising
  in order under an outline, words growing from the centre with a shadow, lines
  leaving backwards over a box, and an accent of letters in random order with
  words turning from the edges), its 4 golden frames in mid-stagger, the `0.14`
  corpus, and every fixture at `0.14`.
- Q14 stays open: a new pinned test and its reports are added.

## Verification

- The segmentation passes every case of `GraphemeBreakTest-17.0.0.txt` and
  agrees with the ICU of Node where it has Unicode 17.0 on long runs of every
  code point beside partners of every rule; the table covers every code point
  once (`packages/runtime/test/graphemes.test.ts`).
- Unit tests of the fragments (`packages/runtime/test/fragments.test.ts`): the
  steps of every order, the shuffle against `mulberry32` as published, the
  own time of each phase, the combination of animations, and the bounds of
  every track against the schema.
- Unit tests of the renderer (`packages/renderer-dom/test/text.test.ts`): the
  CSS of each style, the nested fragments, nothing written at mount, every
  value written from the state at every golden time, and `state-mismatch`.
- Unit tests of the commands, their undo byte for byte, their no-ops and
  refusals, and of move, trim, split, join, and copy
  (`packages/editor-sdk/test/text-animations.test.ts`), and of the tools.
- Negative fixtures for every new field and rule; the step 0.13 → 0.14 has its
  migration pair and the invalid corpus of `0.13`.
- In pinned Chromium (`tests/pinned/text.pinned.test.ts`): the letters of every
  conformance case and the state of the text composition at every frame are
  the same as in Node; a text in fragments at rest gives the pixels of the
  text in one piece for every unit and for all three nested; the stroke, the
  shadow, and the box each change the pixels, and the box lies its padding
  beyond the lines; and the frames of the text composition meet their 4
  golden frames. The existing golden PNG files stay byte for byte.
- Parity of the Player against the Producer measured again.
