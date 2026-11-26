# D91 — Four corners of a node and a number in a text

- Status: Accepted — by the project owner on 2026-11-24 (20:03 Europe/Warsaw),
  before any code; the four questions below accepted with their
  recommendations on 2026-11-26 (10:01 Europe/Warsaw), together with PR-94 to
  PR-97 without a separate approval of each
- Amended by: PR-95 (D91) on 2026-11-26: adapted to D16.1 at the owner's
  decision of that day: `corners` is required on every node that has `flip`,
  four zero vectors are no quadrilateral, and `step029To030` writes them, as
  the step to `0.27` wrote `flip` (D91.1, D91.3); D16 is unchanged. Question 2
  measured: the pinned Chromium draws a perspective `matrix3d` on an SVG
  element inside a `<mask>` as the affine map without its perspective, so a
  matte has no corners (D91.1, question 2)
- Date: 2026-11-24
- Supersedes: —
- Extends, each with an `Amended by` line written in the pull request that
  brings it into force:
  - D65 (65.1): the rows `corners` (PR-95) and `number` (PR-96).
  - D65 (65.6): the corners end step 6, the transform (PR-95).
  - D83 (83.7): a text with a number is a measured node (PR-96).
  - D35: the steps from `0.29` to `0.31`. D46: two tools.
- Related: D15, D22, D38, D66, D67, D68, D69, D71, D75, D76, D83, D84, D89

## Context

A host's editor needs two edits the engine lacks: pinning the four corners
of a layer onto a quadrilateral (a picture placed on a screen or a sign in a
film, a card tilted in perspective), and a number that counts in a text (a
counter, a price, a statistic) without the text jumping as its digits change.
Read from `main` at `20a6798` on 2026-11-26; nothing was measured.

- **The transform is affine.** `cssTransform`
  (`packages/renderer-dom/src/css.ts`) writes `translate`, `rotate`, `scale`,
  and the flip of D89.3, with the origin and the flip in per cent of the
  element's own box; a matte writes the same list in pixels
  (`svgTransform`, `packages/renderer-dom/src/masks.ts`) as the CSS
  `transform` of an SVG element inside a `<mask>`. No `matrix3d` is written
  anywhere in the repository; D81 turns a video in RGB, not in CSS.
- **The box in pixels.** The runtime state holds the size of an image, a
  video, and a shape (`packages/runtime/src/state.ts`); a group's box is the
  canvas, an instance and Custom HTML have `width` and `height`, and a text
  with a fixed frame has its frame (D83.3). A text without a frame is as large
  as its lines as the browser lays them out; Kadrion does not measure it
  (`measuredNodes`, D83.7).
- **A number is a string.** A text's `text` is a plain string; a counter
  needs one keyframe per value, and its box and lines change with the width
  of every digit.
- **Fonts are measured by Kadrion** (D83.1, D84): `fontMetrics` gives the
  advance of the glyph of every code point a font maps, for every measured
  node.

## Decision

> D91: Every transformable node may move the four corners of its box, after its own transform, by offsets in composition pixels; the runtime computes the homography of the box onto that quadrilateral, and the renderer writes it as CSS `matrix3d`. A text node may show a formatted number instead of its text, animated by value keyframes, laid out for the widest value it takes, with digits in equal cells. Each arrives as its own schema step, existing documents render byte for byte, and each edit has a command and a tool.

The steps follow the pull requests: `0.30` the corners, `0.31` the number.

### D91.1 Four corners (schema `0.30`)

- **Schema.** Every transformable node that has `flip` (D89.3), the group
  and the instance included, gains `corners: { topLeft, topRight,
bottomRight, bottomLeft }`, each `{ x, y }` of numbers in composition
  pixels (D15), required like every field of the document (D16.1). Four
  zero vectors are no quadrilateral. `step029To030` writes four zero vectors
  after the `flip` of every such node, in scenes, groups, and definitions
  (amended by PR-95: the text first said optional, which D16.1 does not
  allow).
- **Meaning.** The corners of the node's box are first moved by its own
  transform (position, scale, rotation about the origin, flip; D68, D89.3)
  into its parent's space; each is then moved by its offset. The node draws
  its box onto that quadrilateral by the projective map (homography) that
  takes the four corners of the box to the four moved corners.
- **Runtime.** The homography is computed in `@kadrion/runtime` from the box
  in pixels, the transform, and the offsets, by the closed form of a square
  onto a quadrilateral, with `+ − × /` alone (no `Math` function past those,
  no platform API; D24). The state carries the sixteen numbers of the matrix,
  or nothing without corners.
- **Renderer.** With corners, the node's own transform is written as one
  `matrix3d(…)` in the numbers of D22 (`Number::toString`), in place of the
  affine list; the offset or zoom of a clip transition (D66) still precedes
  it in the list, so it applies in the parent's space as before. Without
  corners, that is with four zero vectors, nothing changes, so every
  document of `0.29` writes the string it wrote before. The probe of question
  2 did not pass (PR-95): a matte has no corners, and `svgTransform` is
  unchanged.
- **What it reaches.** Everything the node draws: content, crop, corner
  radius, effects, and mask (D65.6, D75), which CSS applies before the
  transform. A group carries its children, an instance its definition.
- **Validation.** In the document, the four moved corners at the base
  values must form a convex quadrilateral with a non-zero area, in this
  order; anything else (concave, self-intersecting, three corners on one line,
  two corners at one point) is `invalid-corners`. While animated, an instant
  whose quadrilateral is not convex and non-degenerate draws nothing of the
  node in that frame (its state says so), and `inspect` lists a warning with
  the node and the first such instant.
- **Animation.** A row `corners` of D65.1: every transformable node, four
  vectors in pixels, mode `offset` (base + sample, per corner), neutral four
  zero vectors; keyframes edited by `SetKeyframeValue` (D65.2), with the
  curves of D67.
- **Command.** `SetNodeCorners { nodeId, corners }`, tool `set_node_corners`;
  a background is `unsupported-node`, the same value is no edit (D38.9), the
  inverse sets the old corners, `null` removes them (four zero vectors); a quadrilateral the
  validation refuses is refused by the bus. `describeDocument` states it.
- **Probes** (D65.8): the four corners of an image, a text with a frame, a
  shape, a group, and an instance; with a rotation of 30° about `250, 750`
  and a flip; with a crop, a radius, a mask, and a drop shadow; an animated
  quadrilateral that turns concave; exact in both hosts, twice.

### D91.2 A number in a text (schema `0.31`)

- **Schema.** A text node gains optional `number: { value, decimals,
decimalSeparator, groupSeparator, prefix, suffix }`: `value` a finite
  number (D15); `decimals` an integer from 0 to 6; `decimalSeparator` one of
  `.` and `,`; `groupSeparator` one of none, a space, U+00A0, U+202F, `.`,
  `,`, and `'`, never equal to the decimal separator; `prefix` and `suffix`
  strings. With `number`, `text` is `''`, which the validation checks.
  `step030To031` changes `schemaVersion` only.
- **The text.** The node's text is `prefix + format(value) + suffix`.
  `format` rounds half away from zero to `decimals`, writes the integer part
  in groups of three with the group separator, and the fraction with the
  decimal separator and exactly `decimals` digits; a negative value starts
  with `-` (U+002D), and a value that rounds to zero has no sign. It is a pure
  function of `@kadrion/runtime` on decimal digits, without `Intl`,
  `toLocaleString`, or `toFixed`, so both hosts write the same characters.
- **Animation.** A row `number` of D65.1: text, a number, mode `replace`,
  neutral the base `value`; value keyframes with the curves of D67, edited by
  `SetKeyframeValue`. The value is rounded after the interpolation.
- **Layout.** A text with a number is a measured node (D83.7), so the host
  loads its font's metrics. Its box (without a frame) and its lines (with
  one, D83.5) are those of the widest text it takes over its lifetime: the
  formatted base value and every keyframe value, and the formatted extremes
  between them, which a monotone curve (D67.4) bounds by the keyframes. Every
  digit 0–9 is set in a cell as wide as the widest digit of its font
  (`fontMetrics`, D83.1, D84), aligned as the style says (D83.4); the other
  characters keep their advance. The text does not jump as its value changes.
- **Fragments.** The animations of letters, words, and lines (D69) apply to
  the formatted text; a digit is a letter, and a run without white space is a
  word.
- **Command.** `SetTextNumber { nodeId, number }`, tool `set_text_number`;
  any node but a text is `unsupported-node`, the same value is no edit,
  `null` removes the number and leaves `text` empty; the inverse restores
  the old state. `describeDocument` states it.
- **Probes.** A count from 0 to 1 234 567,89 with spaces and a comma, a
  negative value through zero, `decimals` 0 and 6, a prefix and a suffix, in
  a frame and without one, with a letter animation; the box of every frame
  equal; exact in both hosts, twice.

### D91.3 The release

A document of `0.29` migrates by two steps (`0.29` → `0.30`, which writes
four zero corners, amended by PR-95; → `0.31`) and renders byte for byte. Each step has its frozen schema, its pair
of migration fixtures, and its compatibility corpus. Golden frames of both
features in the Producer, the parity of the Player measured again, the host
guide, and a showcase; one release, `v0.13.0`, after PR-97.

### D91.4 Not included

Tracking a picture in the engine (a host supplies the corners frame by
frame), a mask from a segmentation frame by frame, number formats from
`Intl`, a number in captions, a 3D scene or a camera, and corners on a
background.

## Questions for the owner, with recommendations (all accepted on 2026-11-26)

1. **Corners on a text without a frame.** Its box is the browser's, not
   measured. Recommendation: `invalid-corners` unless the text has a fixed
   frame (D83.3) or a number (D91.2, measured); a host gives it a frame first.
2. **Corners on a matte.** A matte is an SVG element in a `<mask>`, and a
   perspective `matrix3d` there is not proven. Recommendation: PR-95 probes
   first; if the probe is not exact in both hosts, a shape that is the matte
   of a sibling may not have corners (`invalid-corners`), and D91 is amended
   with the measurement. Measured in PR-95, in the pinned container: the same
   perspective `matrix3d` on an HTML element and on a `<rect>` in a `<mask>`
   differ in 3 064 pixels of a 200 by 200 panel, while the `<rect>` and an
   HTML element with the matrix without its perspective (`m3 = m7 = 0`)
   differ in none, inside a mask and outside one: Chromium drops the
   perspective of an SVG element. So a node that is the matte of a sibling
   has no corners, neither in its base nor in an animation
   (`invalid-corners`), and the probe stays in
   `tests/pinned/corners.pinned.test.ts`.
3. **A number makes a measured node.** Recommendation: as written in D91.2,
   an amendment of D83.7; `measuredNodes` and `measuredFontIds` list it.
4. **The mode of `number`.** Recommendation: `replace`, as above.

## Alternatives considered

- **Corners as a free 4×4 matrix in the document.** Opaque to a person and
  to an AI author, and it admits matrices no quadrilateral names.
- **A homography in the renderer.** The renderer would compute state; the
  runtime owns every value of a frame (D19).
- **Skew instead of corners.** It cannot put a picture onto a screen seen in
  perspective.
- **A number formatted with `Intl.NumberFormat`.** Its output depends on the
  ICU data of each browser and Node; both hosts must write the same text.
- **A number as text keyframes, one per value.** Thousands of keyframes for
  one count, and a box that changes with each digit.
- **Tabular figures of the font (`font-variant-numeric`).** Not every font
  has them, and Kadrion does not read `GSUB`; the cells of D91.2 come from
  `hmtx`, which every measured font has.

## Consequences

- `@kadrion/schema`: two steps, two frozen schemas, the rows of D65.1, the
  validation of the quadrilateral and of `text` with a number.
- `@kadrion/runtime`: the homography, the format of a number, the widest text
  and the cells of digits, `measuredNodes`.
- `@kadrion/renderer-dom`: `matrix3d` in `cssTransform` (and `svgTransform`
  if question 2 allows it), digits in cells.
- `@kadrion/editor-sdk` and `@kadrion/ai-sdk`: two commands and two tools
  (D46).
- `@kadrion/cli`: the warning of a quadrilateral that turns concave in
  `inspect`.
- Q14 reopens in PR-95 and PR-96; parity is measured again in each.
- A host gives a text a frame before its corners (question 1), and loads the
  font of a text with a number.

## Verification

- Unit tests of the homography (corners at zero give the affine transform;
  each corner lands where it is sent), of `format` (rounding, separators,
  signs, `decimals` 0 to 6), and of the widest text.
- Schema tests: the steps, the pairs of migration fixtures, the corpora
  `compatibility/v0-30` and `v0-31`, and invalid cases (concave,
  degenerate, `text` not empty with a number, equal separators).
- Commands and tools: every refused case, the same value as no edit, the
  inverse, the tool catalogue (D46).
- Pinned: `tests/pinned/corners.pinned.test.ts` and
  `tests/pinned/number.pinned.test.ts` with golden frames, so
  `REQUIRED_PINNED_FILES` and the Q14 artifact list grow; every existing
  golden PNG file keeps its bytes.

## Implementation notes (PR-95)

PR-95 brings schema `0.30` and the corners of D91.1.

- **The step and the corpus.** `step029To030` writes `corners` of four zero
  vectors directly after the `flip` of every node that has one, in scenes,
  in definitions, and in the children of groups at any depth, and leaves
  backgrounds as they are. The frozen `0.29` is `packages/schema/src/v0-29`;
  the pair `migration-0-29-to-0-30`, the corpus `compatibility/v0-30` (every
  file of `v0-29` stepped, and `corners.json`, the fixture of corners), and
  five invalid cases (concave, crossed, three corners on one line, two at one
  point, a text without a frame) hold it.
- **The geometry.** `movedCorners`, `isConvexQuadrilateral`, and
  `cosSinOfDegrees` live in `@kadrion/schema` (`corners.ts`), so the
  validation and the runtime share them. The cosine and the sine are Taylor
  series in Horner form on an angle reduced by comparisons to an eighth of a
  turn, so a whole number of quarter turns is exact; the homography
  (`homography.ts` of `@kadrion/runtime`) is the closed form of the unit
  square onto a quadrilateral, scaled to the box. Both use `+ − × /` alone.
- **The box.** An image, a video, and a shape: their size at the instant
  (a `size` animation included); captions, an instance, and Custom HTML:
  their `width` and `height`; a text: its fixed frame (question 1); a group:
  the canvas of the scene's composition or of its definition.
- **The state and the renderer.** A node with corners (non-zero offsets or a
  `corners` animation) has `homography`: sixteen numbers, or `null` at an
  instant where the quadrilateral is not convex, when its element is hidden;
  a node without has no such field, and `cssTransform` writes the list it
  wrote before. `cornersWarnings` (re-exported by `@kadrion/producer`) lists
  the first such instant of every node on the frame grid, and
  `kadrion inspect` prints it for a file whose text starts with `{`.
- **The command and the tool.** `SetNodeCorners` follows `SetNodeFlip`, so
  `set_node_corners` follows `set_node_flip` (106 tools). `null` is parsed to
  four zero vectors; the row `corners` is edited by `AddAnimation`,
  `AddKeyframe`, and `SetKeyframeValue`, whose values are never rounded.
