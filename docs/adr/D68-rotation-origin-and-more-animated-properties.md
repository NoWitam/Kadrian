# D68 — Rotation, the origin point, and more animated properties: schema 0.13

- Status: Proposed
- Date: 2026-11-07
- Supersedes: —
- Amends: D15 (a node turns and scales about its origin point; the corner
  radius and the crop of a picture), D16 (16.6: rotation and origin are
  offsets, and size, colour, crop, and corner radius replace their base
  value), D22 (the transform list, the box of a group, and the CSS of a
  picture), D35 (the step from `0.12` to `0.13` and the frozen `0.12`
  schema), D41 (41.1: `SetKeyframeValue` has an argument called `value`), D46
  (five tools), and D65 (65.1: the rows of PR-48 as built), each with an
  `Amended by: PR-48 (D68)` line
- Related: D17, D18, D19, D33, D38, D50, D54, D56, D63, D67,
  [phase five](../roadmap/phase-5.md) PR-48

## Context

A node of schema `0.12` has a position, a scale about its top-left corner, and
an opacity (D15, D16.6), and only those three properties can be animated. A
host's motion graphics need a picture that spins about its centre, a title
that tilts about its baseline, a background whose colour fades, a picture that
grows, is cropped, or rounds its corners while it moves — in the Player and
the Producer alike, since parity is measured at 0 differing pixels (D33).

D65 fixed the model under these properties: a table of animatable rows with
three modes (`offset`, `factor`, `replace`), one keyframe command for every
new row (`SetKeyframeValue`), and the order of operations on a node (65.6). It
left to this step the unit of rotation and whether it is bounded, the unit of
the origin, whether editing the origin moves a node, and the rounding of
colours.

What the repository has, read on 2026-11-07 at `main` `f092614`: schema
`0.12` with the easing of D67, 68 tools, a renderer that writes
`translate(x, y) scale(sx, sy)` with `transform-origin: 0 0` (D22), a picture
fitted by `object-fit` and `object-position` (D50, D63), and the probes of
D65.8, which measure whether a CSS primitive renders the same pixels in the
Player and the Producer and twice in a row.

## Decision

> D68: Schema `0.13` gives every transformable node a `rotation` in degrees and an `origin` in per mille of its box, the point its scale and rotation are about, and every image and video a `crop` and a `cornerRadius`. Rotation and origin are animated as offsets; size, colour, crop, and corner radius as values that replace the base value. A colour is eased per sRGB channel and rounded once, halves upwards. Editing the origin never moves the position. Five commands set the new values, `SetKeyframeValue` among them.

### 68.1 Rotation

- `rotation` is a JSON number of degrees, positive clockwise in the y-down
  space of D15, from −360 000 to 360 000, right after `scale`.
- It is not reduced modulo 360: a spin of three turns is a rotation animation
  from 0 to 1080, and it must pass through every angle between. The bound is
  a thousand turns either way, enough for any spin and small enough that every
  intermediate value of the arithmetic of D18 and D67 stays exact to far below
  a pixel. A whole number of turns renders as no rotation; the probe
  `rotate-720` gives the pixels of none (68.8).
- Angles are never rounded: a host writes what its handle gives.

### 68.2 The origin point

- `origin` `{ x, y }` holds integers from 0 to 1000, per mille of the width and
  height of the node's box, as the focus of D63: `0, 0` is the top-left corner
  of D15, `500, 500` the centre, `1000, 1000` the bottom-right corner. It is
  the point that scale and rotation are about, as CSS `transform-origin`.
- **The position is unchanged by it.** `position` still places the top-left
  corner of the untransformed box (D15), so a node whose rotation is 0 and
  whose scale is 1 does not move when its origin changes. A host whose handle
  keeps a rotated node in place while its pivot is dragged computes the
  compensating position itself and sends both commands in one transaction:
  the bus never adds an edit the caller did not state (D38), and the
  compensation depends on the size of a text's box, which only a browser
  measures (D57.2).
- The box of each node: an image, a video, and a Custom HTML element have
  their `width` and `height`; a text has the box of its lines; a group has the
  canvas, `width` × `height` of the composition, so a group's origin of
  `500, 500` is the centre of the frame. A group has no size of its own, and
  the canvas is the only box every child of it is guaranteed to lie in.
- Why per mille and not pixels: a picture's box is resized by its own command,
  and a text's box by its font; an origin in pixels would leave the centre as
  the size changes, an origin in per mille stays where the user put it.
  Integers keep it exact and match the focus of D63.

### 68.3 The rows of the table

The rows of D65.1 added by this step, as built:

| Path           | Node types                                       | Value                          | Mode      | Keyframe bounds       |
| -------------- | ------------------------------------------------ | ------------------------------ | --------- | --------------------- |
| `rotation`     | group, image, text, video, custom-html, captions | number, degrees                | `offset`  | −360 000 to 360 000   |
| `origin`       | the same                                         | `{ x, y }`, integer per mille  | `offset`  | −1000 to 1000 each    |
| `size`         | image, video                                     | `{ width, height }`, pixels    | `replace` | 1 to 1 000 000 each   |
| `color`        | background, text, captions                       | `#rrggbb`                      | `replace` | each channel 0 to 255 |
| `crop`         | image, video                                     | four insets, integer per mille | `replace` | 0 to 1000 each        |
| `cornerRadius` | image, video                                     | number, pixels                 | `replace` | 0 to 1 000 000        |

- **Offsets.** A sampled rotation or origin is added to the base value in one
  operation, as a position (D16.6, D18.4). An origin offset may be negative,
  so that an animation can move the pivot anywhere from the base value; the
  resulting origin may lie outside the box, which CSS draws as a pivot outside
  it.
- **Replacement.** A sampled size, colour, crop, or corner radius is the value
  while the animation is sampled; the base value is the value of a node
  without that animation. Before the first keyframe the first value holds,
  after the last the last (D16.6).
- **Which types take which rows.** A background has a colour and nothing else
  to animate: it is no longer a node "without animations" and gets an
  `animations` list, which takes `color` only. A Custom HTML element takes the
  five transform rows and not `size`: its viewport is the element's own, and
  resizing it per frame would make its content lay itself out again. A text
  takes `color` and not `size`, since it has no size (D57.2). D65.1 named
  shapes and instances too; they come with their steps. An animation of a row
  the type does not take is refused by the schema, whose animation list is
  per type (`invalid-value` at its `property`), and a forged one is
  `invalid-document` in the runtime (D19).
- **Integers while animated.** The base `cornerRadius`, `origin`, and `crop`
  are integers; a value sampled between two keyframes is not, and it is
  written as it is (68.6), so an animated corner rounds smoothly.

### 68.4 The colour of a sample

- Between two keyframes each of the three sRGB channels is eased on its own by
  the curve of the first keyframe (D67.3), held within 0 and 255 (D67.6, so
  that an overshoot stays a colour), and then rounded once:
  `floor(c + 0.5)`, the nearest integer, halves upwards. The channels are
  never converted to another space, never gamma-decoded, and never premultiplied.
- Why halves upwards and not to even: it is one operation, the same in every
  engine (`Math.floor` and `+` are exact), and it is what a host computing the
  same colour by hand expects; ties occur only at halves, which a linear
  segment reaches at exact fractions of its span. Why sRGB channels and not a
  perceptual space: a schema colour is sRGB (D15), the conversion to a linear
  or perceptual space needs `Math.pow`, which ECMAScript only approximates,
  and a host that wants another path writes intermediate keyframes.
- A sampled colour is a lower-case `#rrggbb`, as a base colour.
- Examples, tested: `#000000` → `#ffffff` at ½ is `#808080`; at ⅓ `#555555`;
  `#ff0000` → `#00ff00` at ¼ is `#bf4000`.

### 68.5 The crop

- `crop` `{ top, right, bottom, left }` holds integers from 0 to 1000, per mille
  of the picture's natural height or width cut away from each edge, right
  after `focus` with `cornerRadius`. The rest of the picture is then fitted
  and focused as if it were the whole picture (D65.6 step 1, D50, D63).
- Two opposite insets add up to at most 999, so at least 1 per mille of the
  picture is left: `crop-empty`, a semantic error, for the crop of a node and
  for every crop keyframe. A crop of nothing is not a picture of zero size,
  which CSS would draw as nothing at all and a later effect would divide by.
- An eased segment can push two opposite insets past 999 between two valid
  keyframes. Both are then reduced in proportion, `a · 999 / (a + b)` and
  `b · 999 / (a + b)`, so that the picture never vanishes and the sides keep
  their ratio. A linear segment never needs it.

### 68.6 The renderer

- **The transform list.** A transformable element has `transform-origin: 0 0`
  as before (D22) and the transform
  `translate(x, y) [translate(ox%, oy%)] [rotate(r deg)] scale(sx, sy) [translate(−ox%, −oy%)]`,
  with `ox = origin.x / 10`. CSS applies the list from the right: the pivot is
  moved to the corner, the node is scaled, then rotated, and the pivot is moved
  back, then the whole is placed. The pivot pair is left out when the origin is
  `0, 0` and `rotate` when the rotation is 0, so every document of `0.12`
  writes exactly the string it wrote before, and its frames stay byte for byte.
  Percentages in a translation are of the element's own border box, which is
  the box of 68.2.
- **A group's box.** The element of a group is given the canvas's `width` and
  `height` when it is mounted, so that its percentages are those of 68.2. It
  has no background, so the box draws nothing; it is not a clip.
- **A picture.** An image and a video element get, on every render, `width` and
  `height` from the evaluated size, `object-view-box: inset(t% r% b% l%)` from
  the crop (per mille / 10, in the shortest form the CSS Object Model
  serialises, so `inset(0%)` for no crop and `inset(0% 25%)` for equal sides,
  since pinned Chromium reads the style back so), and `border-radius` in pixels from the corner
  radius; `object-fit` and `object-position` stay as D50 and D63 write them.
  `object-view-box` is what CSS fits and focuses as the whole picture, so the
  order of D65.6 holds without another element. Values are written as
  `cssNumber` writes any number (D22). A radius above half a side is reduced
  as CSS reduces it.
- **Colours.** The colour of a text, of a captions node, and of a background is
  written by `renderState` on every call, from the evaluated colour.
- **What the mount writes.** Nothing of a property an animation can reach: the
  mount writes no `width`, `height`, `object-view-box`, `border-radius`, or
  colour of a picture, a text, or a background, so a render after any other
  render yields the tree of a fresh mount (D54.3). A scene that is not active
  loses these properties of its pictures with what else a render wrote.

### 68.7 Commands and tools

- `SetNodeRotation { nodeId, rotation }`, `SetNodeOrigin { nodeId, origin }`,
  `SetNodeCrop { nodeId, crop }`, and `SetNodeCornerRadius { nodeId,
cornerRadius }` set the base value. A rotation is never rounded; a corner
  radius is rounded as a position (D15); an origin and a crop must be integers
  from 0 to 1000 (`invalid-argument`); a crop that leaves nothing and a radius
  outside its range after rounding are `invalid-result`; a node that has no
  such property is `unsupported-node`. The same value is no edit (D38.9);
  the inverse sets the old value back.
- `SetKeyframeValue { animationId, timeUs, value }` sets or inserts a keyframe
  of an animation of any row of this step, as D65.2 decided: the value is
  judged by the animation's property (its form `invalid-argument`, its range
  `invalid-result`), normalised as the base value is (colours in lower case,
  pixels rounded), and an inserted keyframe takes the easing of the keyframe
  before it (D67.7). An animation of `opacity`, `position`, or `scale` is
  `use-typed-command`, so a property has exactly one command. Its tool's
  `value` is a number, a string, or an object, and nothing else.
- `AddAnimation` accepts the new rows with the same checks, and refuses a row
  the node's type does not take.
- The commands are tools (`set_node_rotation`, `set_node_origin`,
  `set_node_crop`, `set_node_corner_radius`, `set_keyframe_value`, D46); the
  registry has 70 commands and the catalogue 73 entries.
- **Templates.** A bound colour (D58) of a node that animates its colour is
  `bound-property-animated`: the animation replaces the colour at every
  instant, so the bound value would never be seen.

### 68.8 The probes

The probes of D65.8 gain two groups, run twice in fresh pinned containers
without a network, on an image, a text, and a video where they apply:

- `transform-list`: the pivot and the rotation in five combinations (a centre
  pivot with 45°, a pivot of `250, 750` with 12.5° and a scale of 1.37, a pivot
  of `0, 1000` with −8°, 33.3° alone, 720° alone) and two neutral rows (a pivot
  without a rotation, `rotate(0deg)`);
- `picture`: `object-view-box` neutral, cropped, fractional, with `cover` and
  a focus, and with `contain`; `border-radius` of 0, 48 px, 12.5 px, and with a
  crop; and a fractional size.

Every candidate is exact: the same pixels in the Player and the Producer and
twice in a row, and the second run equals the first. Every neutral row gives
the pixels of none (0 differing pixels), so the renderer may write
`object-view-box: inset(0%)` and `border-radius: 0px` on every
picture, and needs no special case for a zero crop or radius. The record is
`docs/spike/motion-probes.json`.

### 68.9 Schema `0.13` and the step from `0.12`

`step012To013` writes `rotation: 0` and `origin: { x: 0, y: 0 }` after the
`scale` of every transformable node, `crop` with four insets of 0 and
`cornerRadius: 0` after the `focus` of every image and video, and an empty
`animations` list after the `color` of every background, and sets
`schemaVersion` to `0.13`. Every key keeps its place and every value its
bits; the new values are the neutral ones, and with the renderer of 68.6 every
document of `0.12` renders byte for byte. The frozen `compositionSchemaV012`
reads `0.12` (D35); the compatibility corpus gains `compatibility/v0-13/` with
a document of every new property, and the earlier corpora keep their bytes.

### 68.10 What this ADR does not decide

- Skew, 3D rotation, and perspective (3D is the host's), free-form deformation.
- An anchor that moves with the origin, or a command that keeps a node in
  place while its origin changes (68.2).
- A size for a text box, shapes, and instances (PR-49, PR-52, PR-55b).
- Interpolation of colours in another space than sRGB.

## Alternatives considered

- **Rotation modulo 360.** A spin would need a keyframe per turn and an
  animation from 350 to 10 would turn the long way back; see 68.1.
- **Radians or turns.** Degrees are what every editor shows and what CSS
  writes without a conversion, so the value in the document is the value in
  the style.
- **An origin in pixels**, or as a fraction from 0 to 1. See 68.2; a fraction
  is a number with no exact decimal halves for most values, per mille is an
  integer, as the focus.
- **Editing the origin moves the position, so the node stays in place.** It
  makes one command edit two properties, needs a text's measured box in the
  bus, and differs from CSS, where `transform-origin` moves nothing on its own
  only while there is no transform; see 68.2.
- **Colour interpolated in linear light or OKLab.** See 68.4.
- **Rounding a colour to even, or truncating it.** Truncation makes a fade
  reach its last colour only at its last instant; to-even needs a branch for a
  rule a host must then reproduce.
- **A crop as `clip-path` on the element.** It cuts the box, not the picture,
  so `fit` and `focus` would see the uncropped picture, against D65.6.
- **A wrapper element for the corner radius.** `border-radius` on the picture
  clips it, and its replaced content with it, in one element.

## Consequences

- `@kadrion/schema`: schema `0.13`, the types `Origin` and `Crop`, the new
  animation types, two validation codes (`crop-empty`,
  `bound-property-animated`), the frozen `0.12` reader, and the step.
- `@kadrion/runtime`: the new rows in the evaluated state (`rotation`,
  `origin`, `size`, `crop` as `fromTop` … `fromLeft`, `cornerRadius`, `color`),
  the colour rule, and the proportional crop. The runtime build hash changes,
  so the golden frames are written again and parity is measured again.
- `@kadrion/renderer-dom`: the transform list, the box of a group, the CSS of
  a picture, and colours written on every render.
- `@kadrion/editor-sdk`: five commands and their tool metadata;
  `@kadrion/ai-sdk`: five tools and the catalogue's snapshot. The change of
  the API is breaking (a background has `animations`, the state has new
  fields).
- `@kadrion/test-fixtures`: the motion composition (640×360, 2 s: a picture
  spinning about its centre with an eased rotation, an animated crop, a corner
  radius that grows with its size, a text and a background whose colours fade,
  a rotating group, and a cropped, rounded video), its 4 golden frames, the
  `0.13` corpus, and every fixture at `0.13`.
- Q14 stays open: a new pinned test and its report are added.

## Verification

- Unit tests (`packages/runtime/test/motion.test.ts`): offsets for rotation and
  origin, replacement for size, corner radius, and crop, the proportional crop
  of an overshoot, the colour rule with written-out cases, the background's
  colour, the base values where nothing is animated, and the motion fixture in
  its bounds and independent of what was evaluated before.
- Unit tests of the renderer (`packages/renderer-dom/test/motion.test.ts`):
  the strings of the transform list and the view box, the group's box, that
  the mount writes none of these properties, and that any order of renders
  yields the tree of a fresh mount.
- Unit tests of the commands, their undo byte for byte, their no-ops, and
  their refusals (`packages/editor-sdk/test/motion.test.ts`), of which type
  takes which row, and of the tools (`packages/ai-sdk/test/tools.test.ts`).
- The hand-derived expected state and render of the reference composition
  gain the new values, checked by independent code in `tests/repo`.
- Negative fixtures for every new field and code; the step 0.12 → 0.13 has its
  migration pair and the invalid corpus of `0.12`.
- The probes of 68.8, twice.
- In pinned Chromium (`tests/pinned/motion.pinned.test.ts`): a quarter turn
  about the corner leaves the box and about the centre stays in it; the origin
  alone moves nothing; a crop changes the pixels; a radius of half the side
  shows the background at the corner; and the frames of the motion
  composition meet their 4 golden frames. The existing golden PNG files stay
  byte for byte.
- Parity of the Player against the Producer measured again.
