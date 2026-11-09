# D73 — Vector shapes and paths: schema 0.18

- Status: Accepted — by the project owner on 2026-11-09, after PR-52 was merged
  (PR #76)
- Date: 2026-11-09
- Supersedes: —
- Amends: D65 (65.1: the rows of shapes as built; the corner radius of a
  shape lies in its geometry; 65.5: the primitives of shapes are in the probe
  record), D22 (a shape's box holds an inline `<svg>` that `renderState`
  writes), and D35 (the step from `0.17` to `0.18` and the frozen `0.17`
  schema), each with an `Amended by: PR-52 (D73)` line
- Related: D03, D04, D15, D16, D18, D26, D33, D46, D54, D67, D68, D71,
  [phase five](../roadmap/phase-5.md) PR-52 and question 9

## Context

A host's motion graphics need what an image cannot give: a badge whose
corners round as it grows, a line that draws itself, a star that fills with
colour, a blob that turns into another blob. SVG draws all of them, and the
probes of PR-45 measured what this needs (D65.5): a stroke trimmed by
`stroke-dasharray` over `pathLength="1000"` at four offsets and two caps, and
linear and radial gradients in the units of the box, all exact in pinned
Chromium; a stroke trimmed to nothing still showed its round caps, so such a
stroke must not be written at all. This PR adds the primitives those did not
cover to `tests/probes/catalogue.ts` (absolute cubic, quadratic, and arc
commands under the even-odd rule with a bevel join, dash patterns over a path
length with each cap and join, and gradients in user space with stop opacity)
and runs the probes again twice in fresh pinned containers, the second
against the first: all 116 probes are exact (299 rows in
`docs/spike/motion-probes.json`), and every earlier row has the pixels it had.

What the repository has, read on 2026-11-09 at `main` `6a4c2b6`: schema
`0.17`, 81 commands, a catalogue of 84 entries.

## Decision

> D73: Schema `0.18` adds a node `shape`: a geometry (`rect`, `ellipse`, `polygon`, or `path` of absolute commands) in the pixels of its box, a fill (`none`, `solid`, `linear-gradient`, or `radial-gradient`), a stroke `{color, width, dash, cap, join}`, and a trim `{start, end}` in per mille of the outline. Every geometry is drawn as one SVG `<path>`; trim and dashes are one dash array over `pathLength="1000"`, so nothing is measured. A geometry morphs number by number between keyframes of one structure, and any other pair is refused. Four commands and their tools edit the fields; every document of `0.17` renders byte for byte.

### 73.1 The node and its geometry

A shape is a leaf node with the transform of every node (position, scale,
rotation, origin, opacity), a lifetime, a box `width × height`, effects
(D71), and these fields:

| Field      | Value                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `geometry` | `{kind: "rect", cornerRadius}`, `{kind: "ellipse"}`, `{kind: "polygon", points}`, `{kind: "path", fillRule, commands}`                         |
| `fill`     | `{kind: "none"}`, `{kind: "solid", color}`, `{kind: "linear-gradient", start, end, stops}`, `{kind: "radial-gradient", center, radius, stops}` |
| `stroke`   | `{color, width, dash, cap, join}`; `width` 0 to 1000 pixels, 0 for none; `cap` butt, round, square; `join` miter, round, bevel                 |
| `trim`     | `{start, end}`, integers 0 to 1000 per mille of the outline                                                                                    |

- **Coordinates** are those of the box, in composition pixels, from its
  top-left corner: JSON numbers from −1 000 000 to 1 000 000, not integers,
  since a curve needs fractions. A drawing may leave the box; the `<svg>`
  shows what lies outside it, and the box clips nothing.
- **A rectangle and an ellipse fill the box** and follow its size and its
  `size` animation. A rectangle starts on its top edge after the rounding of
  its top-left corner and runs clockwise, its corners arcs of
  `cornerRadius` reduced to half its shorter side; without a radius it is
  four lines from the top-left corner. An ellipse is two half arcs, clockwise
  from its rightmost point. Where a trim starts and ends follows from these
  starting points.
- **A polygon** is closed through 3 to 1000 points.
- **A path** is 1 to 1000 commands, the first a `move`: `move` and `line`
  `{x, y}`, `cubic` `{x1, y1, x2, y2, x, y}`, `quadratic` `{x1, y1, x, y}`,
  `arc` `{rx, ry, rotation, largeArc, sweep, x, y}` as SVG's `A`, and
  `close`. **Absolute commands only:** relative and shorthand commands make
  the meaning of a command depend on the ones before it, so a morph or an
  edit of one command would move the rest. A host or a model converts SVG
  path data to this form first (PR-53 does it for SVG assets). `fillRule` is
  `nonzero` or `evenodd`.
- **No stable IDs** are given to points, commands, gradient stops, or
  dashes: they are values addressed by their index and replaced whole, like
  the levels of a curve (D72).

### 73.2 Fill and stroke

- **Gradients answer question 9 for shapes.** A linear gradient runs from
  `start` to `end`, a radial one from `center` out to `radius`, both in the
  pixels of the box (`gradientUnits="userSpaceOnUse"`), through 2 to 16 stops
  `{offset, color, opacity}` with `offset` in per mille, ascending. The
  gradient is static: a `fill` animation is allowed on a solid fill only,
  and a gradient of a background is left for a later step.
- **A stroke** is drawn on the outline, half inside and half outside, under
  a miter limit of 4. `dash` lists dashes and gaps in turn, in per mille of
  the outline, an even number of them from 1 to 1000 each, `[]` for a solid
  stroke.

### 73.3 Trim and dashes, without measuring

The renderer writes `pathLength="1000"`, so every length along the outline is
in per mille of it and the browser, not the runtime, measures the curve. The
runtime cuts the dash pattern, repeated from the start of the outline, to
`[trim.start, trim.end]` and lists the visible parts as one dash array: each
part and the gap to the next, the last gap 1000 so the pattern never repeats;
`stroke-dashoffset` moves the first part to where it starts. A stroke that is
neither trimmed nor dashed has no dash array. **A stroke that draws nothing**
— a width of 0, or a trim or dashes that leave no part — is written as
`stroke="none"`, because a dash of length 0 still shows its caps (D65.5).

### 73.4 The rows of the table and morphing

The rows of D65.1 for shapes, as built:

| Path                     | Value                                    | Mode      | Bounds            |
| ------------------------ | ---------------------------------------- | --------- | ----------------- |
| `size`                   | `{width, height}`, pixels                | `replace` | as D68            |
| `fill`                   | colour, on a solid fill only             | `replace` | 0–255 per channel |
| `stroke/color`           | colour                                   | `replace` | 0–255 per channel |
| `stroke/width`           | number, pixels                           | `replace` | 0–1000            |
| `trim/start`, `trim/end` | integer, per mille of the outline        | `replace` | 0–1000            |
| `geometry`               | a geometry of the structure of the shape | `replace` | per number        |

**Deviation from D65.1:** the `cornerRadius` row is not a row of shapes. The
radius of a rectangle is a number of its geometry and animates with the
`geometry` row; a second row for one number would let two animations
disagree.

**Morphing.** A geometry's structure is its kind, its number of points, its
commands in order with their kinds and arc flags, and its fill rule. Every
keyframe of a `geometry` animation must have the structure of the shape's own
geometry, or validation answers `geometry-mismatch`; between two keyframes
every number moves on its own by the rule of D18 under the easing of the
earlier keyframe (D67), held within its bounds (a length and a radius at 0, a
coordinate within ±1 000 000, the turn of an arc within ±360). **The engine
never normalises paths:** turning a square into a circle with another number
of commands is a choice of where points go, which a host or a model makes
and states as two paths of one structure.

### 73.5 The shape in the page

- The mount builds, in the node's box, one
  `<svg data-kadrion-shape width="100%" height="100%">` at its top-left
  corner with `overflow: visible`, holding the gradient of a gradient fill in
  `<defs>` (its ID `kadrion-shape-<node id>-fill`, unique as node IDs are)
  and one `<path>` with the static `fill-rule`.
- `renderState` writes on every call the size of the box, the path data (every
  number by `Number::toString`, D22), the fill (`none`, `#rrggbb`, or the
  gradient's `url(#…)`), and the stroke of the instant, after removing every
  attribute it writes, so a tree rendered at a state is that of a fresh mount
  rendered at it (D54.3).

### 73.6 Validation, commands, and tools

- New errors: `path-start-not-move`, `gradient-stops-not-ascending`,
  `stroke-dash-odd`, `fill-not-solid` (a `fill` animation over a gradient or
  no fill), and `geometry-mismatch`.
- `SetShapeGeometry`, `SetShapeFill`, `SetShapeStroke`, and `SetShapeTrim`
  replace one field whole and refuse any node but a shape with
  `unsupported-node`; the result is validated in full, so a geometry that
  leaves the structure of its animation is `invalid-result`. `AddNode` takes a
  shape, at the top level or in a group; `AddAnimation`, `SetKeyframeValue`,
  and the effect commands take the rows and the effects of shapes.
- The registry has 85 commands and the catalogue 88 entries; each new
  command has its tool with a description and an example.

### 73.7 Schema `0.18` and the step from `0.17`

`step017To018` sets `schemaVersion` to `0.18` and changes nothing else: no
document of `0.17` holds a shape. The frozen `compositionSchemaV017` reads
`0.17` (D35); the compatibility corpus gains `compatibility/v0-18/` with every
fixture migrated and the composition of shapes, the documents of
`compatibility/v0-17/` that were expectations become frozen inputs of their
own entries, and the earlier corpora keep their bytes.

### 73.8 What this ADR does not decide

- Boolean operations on paths, text converted to paths, and normalising two
  paths for a morph.
- Gradients of backgrounds and animated gradients.
- SVG assets and their conversion to shapes (PR-53), and a shape as a mask
  (PR-54).

## Alternatives considered

- **Path data as a string.** It is what SVG stores, but a string cannot be
  validated number by number, morphed, or edited by one command without a
  parser in every reader; the closed form is that parser's result.
- **Relative commands.** They halve nothing that matters for a model and make
  every command depend on all before it.
- **`<rect>` and `<ellipse>` elements.** They would make the trim of a
  rectangle start where Chromium chooses and need a second element kind in
  the renderer; one path for every geometry fixes the start and the
  direction.
- **Measuring the outline in the runtime.** A length of a cubic or an arc
  needs numerical integration, which the runtime would compute differently
  from the browser; `pathLength` lets the browser scale its own measure.
- **Morphing between any two paths.** It needs a choice of corresponding
  points that the engine cannot make well for every pair, and a choice made
  silently would differ from what the author meant.

## Consequences

- `@kadrion/schema`: schema `0.18`, the node `shape` and its types, five
  error codes, the frozen `0.17` reader, and the step.
- `@kadrion/runtime`: `ShapeNodeState` with its path, fill, stroke, and trim;
  the bounds of the new rows. The runtime build grows to 248 253 bytes; its
  hash changes, so the golden frames are written again and parity is
  measured again.
- `@kadrion/renderer-dom`: the inline SVG of a shape (`shapes.ts`).
- `@kadrion/editor-sdk` and `@kadrion/ai-sdk`: four commands and their tools,
  the descriptions of `AddNode`, `AddAnimation`, and `SetKeyframeValue`, and
  the catalogue's snapshot. The change of the API is additive (new exports,
  commands, and a node type) and breaking (schema `0.18` in
  `SCHEMA_VERSION`; `NodeState` and the children of a group gain a member).
- `@kadrion/test-fixtures`: the composition of shapes (640×360, 1.6 s: a
  rounded rectangle with a linear gradient and dashes that grows and rounds
  further, an ellipse with a radial gradient whose stroke thickens and
  changes colour, a star whose stroke draws itself while its fill changes
  colour, a path with a hole that morphs, and in a turning group a curve
  drawn between moving ends and a dashed badge with a drop shadow), its 4
  golden frames, the `0.18` corpus, and every fixture at `0.18`.
- Q14 stays open: a new pinned test and its report are added.

## Verification

- Unit tests of the runtime (`packages/runtime/test/shapes.test.ts`): the
  path of every geometry, the radius reduced, fills and strokes sampled, no
  dash array without trim and dashes, no stroke for a trim to nothing, dash
  arrays of trims and patterns, a morph at its middle, and bounds after an
  overshoot.
- Unit tests of the renderer (`packages/renderer-dom/test/shapes.test.ts`):
  the path data, the mount with its gradients, the attributes of an instant,
  and the same tree after any order of renders.
- Unit tests of the commands (`packages/editor-sdk/test/shapes.test.ts`) and
  of the schema's reading of shapes (`schema-coverage.test.ts`); negative
  fixtures for every new rule; the step 0.17 → 0.18 with its migration pair
  and the invalid corpus of `0.17`.
- In pinned Chromium (`tests/pinned/shapes.pinned.test.ts`): a stroke trimmed
  to nothing leaves the frame as a stroke of width 0 does; a stroke on the
  edge leaves the box; the even-odd rule leaves a hole the non-zero rule
  fills; and the frames of the composition meet their 4 golden frames. The
  existing golden PNG files stay byte for byte.
- Parity of the Player against the Producer measured again.
