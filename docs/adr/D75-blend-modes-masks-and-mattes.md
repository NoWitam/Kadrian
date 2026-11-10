# D75 — Blend modes, masks, and mattes: schema 0.20

- Status: Accepted — by the project owner on 2026-11-10, after PR-54 was merged
  (PR #80)
- Date: 2026-11-09
- Supersedes: —
- Amends: D35 (the step from `0.19` to `0.20` and the frozen `0.19`
  schema) and D65 (65.1: the rows `mask/geometry` and `mask/feather` are
  animated by the mask's own animations), each with an
  `Amended by: PR-54 (D75)` line
- Related: D15, D16, D18, D22, D42, D49, D56, D59, D65, D67, D71, D72, D73,
  [phase five](../roadmap/phase-5.md) PR-54

## Context

An editor of motion graphics composites: a title that screens over a picture,
a photo shown through a soft ellipse or through the letters of a word, a
picture that a moving shape reveals as a track matte. Kadrion has effects
(D71, D72) and vector shapes (D73), but every node is laid over what lies
below it, whole.

The probes of PR-45 (D65.5) found all sixteen values of CSS `mix-blend-mode`
exact in pinned Chromium, and an SVG `<mask>` on an HTML element exact. D65.6
fixed the order on one node: content, corner radius, effects, **mask, then
matte**, opacity, transform, **blend mode**, which is the order in which CSS
applies `filter`, `mask`, `opacity`, `transform`, and `mix-blend-mode` to one
element.

What the repository has, read on 2026-11-09 at `main` `5015964`: schema
`0.19`, 85 commands, a catalogue of 88 entries, a runtime build of 251 303
bytes.

## Decision

> D75: Schema `0.20` gives every image, video, text, captions node, shape, and group three keys after its `effects`: a `mask` (none, a shape in a box of the node, or an image asset), a `matte` (none, or a sibling shape node drawn into the node's mask as a track matte), and a `blendMode` (one of the sixteen of CSS). Masks and mattes are SVG luminance masks; the blend mode is CSS `mix-blend-mode`, and a scene or group holding a node that blends is isolated. Every document of `0.19` renders byte for byte.

### 75.1 The blend mode

`blendMode` is one of `normal`, `multiply`, `screen`, `overlay`, `darken`,
`lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`,
`difference`, `exclusion`, `hue`, `saturation`, `color`, and `luminosity`
(`BLEND_MODES`). It is written as `mix-blend-mode` on the outermost element of
the node, the one that also carries the frame of a matte or of a clip
transition, so it applies last (D65.6). `normal` writes nothing.

A scene, and a group, that holds a node whose blend mode is not `normal` is
**isolated** (`isolation: isolate`): its nodes blend with each other and with
nothing outside it. A node never blends with another scene during a scene
transition, nor with what lies outside its group. The isolation is static,
written at the mount, since the blend mode is not animated.

### 75.2 A mask

`mask` is one of:

- `{kind: "none"}`;
- `{kind: "shape", x, y, width, height, geometry, inverted, feather,
animations}`: the node is shown inside a geometry of D73 drawn in the box
  `x, y, width, height`, in pixels from the top-left corner of the node's own
  box, before its transform. A `rect` or an `ellipse` fills the box; polygon
  and path points are in pixels of the box, as a shape's are;
- `{kind: "image", assetId, x, y, width, height, mode, inverted, feather,
animations}`: the node is shown through an `image` asset stretched over the
  box, by its opacity (`alpha`) or by its brightness times its opacity
  (`luminance`). Outside the box the mask is empty. An `svg` asset is not a
  mask (`asset-type-mismatch`).

`inverted: true` shows the node where the mask does not cover it, out to the
reach of the effects' filters about the node (4 000 000 pixels, D72).
`feather` is the standard deviation of a Gaussian blur of the mask, from 0 (a
hard edge) to 1000 pixels. A mask moves, scales, and turns with its node: it
lies in the node's box. The mask of a group lies in the group's box, the
canvas at the group's position.

### 75.3 The animations of a mask

A mask holds its own `animations`, as an effect does (D71): at most one of
`geometry` (shape masks only) and one of `feather`, each with keyframes in
scene time and the easing of D67. A geometry is morphed number by number, and
every keyframe has the structure of the mask's geometry, exactly as a shape's
(D73.3, `geometry-mismatch`); the feather is sampled by D18 and held within 0
and 1000 (D67.6). The rows `mask/geometry` and `mask/feather` of D65.1 are
these animations, not paths of the node's own animations, so the types stay
discriminated unions (the same deviation as D71). A template repeat moves the
keyframes of a mask with its copy (D59).

### 75.4 A matte

`matte` is `{kind: "none"}` or `{kind: "node", nodeId, mode}` with `mode`
`alpha`, `alpha-inverted`, `luminance`, or `luminance-inverted`. The node
names a **sibling shape** as its track matte:

- the matte is a node of the same scene or group, not the node itself
  (`matte-not-sibling`), a `shape` (`matte-not-shape`), with no mask, no
  matte, and the normal blend mode itself (`matte-not-plain`), and no side of
  a clip transition (`matte-in-transition`);
- the matte is never drawn by itself; it is drawn into the mask of every node
  that names it, with its own transform, lifetime, opacity, effects, fill,
  and stroke, and its animations;
- it lies in the space of the parent, as an editor's track matte does: moving
  the node moves it under the matte. A mask, by contrast, moves with the
  node. The renderer puts the matted node alone in a frame as large as the
  canvas at the origin of the parent, and the frame carries the matte's mask;
- it follows its **own lifetime**: while it is not active it covers nothing,
  so an `alpha` or `luminance` matte hides its node and an inverted one shows
  it whole;
- a mask applies before the matte (D65.6): a node can have both.

Only a shape may be a matte, because the pinned Chromium paints no
`<foreignObject>` inside an SVG `<mask>` (verified on 2026-11-09): an image, a
text, or a video drawn as HTML would draw nothing there. A shape is drawn
natively as an SVG path, with its gradient, so it is exact. The plan's
question of which node types may be a matte is answered by this finding; an
image or a text that should act as a matte is a mask of kind `image`, or a
shape converted by `svgToShapes` (D74.5).

### 75.5 Templates

A condition that removes the matte of a node sets that node's matte to none,
as the transitions that name a removed node are dropped (D59.1). A repeated
node may not be the matte of a sibling (`repeat-of-matte`), which its copies
would not be; a repeated scene or group renames the `nodeId` of every matte
inside each copy to the copy's ID.

### 75.6 The renderer

Every mask and every matte is an SVG `<mask>` of user space in one hidden
`<svg data-kadrion-masks>` of the stage, after the filters, in document
order: `kadrion-mask-<id>` and `kadrion-matte-<id>`. Its region is the square
of `FILTER_REACH` about the masked element's top-left corner. All are
luminance masks whose content is white where the node shows:

- a shape mask is its path in white, or, inverted, a black path over a white
  square as large as the region;
- an image mask is the image; `brightness(0) invert(1)` makes it white where
  it is opaque (alpha); nothing changes it in luminance mode; inverted,
  `brightness(0)` (alpha) or `invert(1)` (luminance) over a white square;
- a matte is its shape's path in a group with the shape's transform,
  opacity, effects, and visibility, under the filter of its mode, the same
  four as the image mask's;
- a feather is a CSS `blur()` of the content.

The masked element names its mask in CSS `mask`. The mount writes everything
static; `renderState` writes what the instant decides, and clears it for a
node the state does not evaluate, so a tree rendered at a state is that of a
fresh mount rendered at it (D54.3). The element of a matte carries
`data-kadrion-matte` and is always hidden. An image mask is decoded before the
first frame, like every image (D27).

### 75.7 Commands

`SetBlendMode {nodeId, blendMode}`, `SetNodeMask {nodeId, mask}`, and
`SetNodeMatte {nodeId, matte}` replace one field whole, each with its tool
(`set_blend_mode`, `set_node_mask`, `set_node_matte`). Each refuses a
background and Custom HTML with `unsupported-node`; an unknown blend mode is
`invalid-argument`; everything else, the asset of an image mask and the rules
of a matte included, is left to the validation of the result
(`invalid-result`).

Any other command that would break a matte in use (remove the matte, move it
to another parent, give it a mask, a matte, or a blend mode, or make it a side
of a clip transition) is refused with `matte-in-use` and the IDs of the nodes
it mattes, as D56.7 refuses a command that breaks a transition. The host sets
their mattes to none first, in the same transaction. `AddNode` states the
three keys with their neutral values.

### 75.8 Schema `0.20` and the step from `0.19`

`step019To020` gives every image, video, text, captions node, shape, and group
`mask: {kind: "none"}`, `matte: {kind: "none"}`, and `blendMode: "normal"`
after its `effects`, recursing into groups, and changes nothing else. The
frozen `compositionSchemaV019` reads `0.19` (D35); the compatibility corpus
gains `compatibility/v0-20/` with every fixture migrated, the reference, and
the composition of compositing, and the documents of `compatibility/v0-19/`
become frozen inputs of their own entries.

### 75.9 Not included: the adjustment layer

An adjustment layer, an effect on everything below it in a scene as CSS
`backdrop-filter`, was moved here from PR-51a (D71.8) once its backdrop roots
were probed. They were not: a `backdrop-filter` meets groups, clip and scene
transitions, masks, and blend modes, each of which may start a backdrop root,
and none of these combinations is in the probes of D65. It is left to a later
step with its own probes; an effect on a group or a scene covers the same need
meanwhile.

## Alternatives considered

- **A mask as CSS `mask-image` with a gradient or an image URL.** It covers an
  image mask, but not a path with a feather, and a matte that moves on its own
  is not an image. One SVG mask covers all three.
- **A matte of any node type, drawn by `<foreignObject>`.** The pinned
  Chromium paints none inside a mask; the frames would be empty.
- **A matte that follows the masked node's lifetime or transform.** An
  editor's track matte keeps its own; following the node would make the matte
  a mask, which `mask` already is.
- **The mask's animations among the node's own, as paths `mask/geometry`.**
  The node's animations would hold a value whose type depends on another key
  of the node; the mask's own list keeps every type a discriminated union, as
  D71 decided for effects.
- **Isolation of every scene and group.** It would change the frames of
  documents of `0.19`; isolating only a parent that holds a node that blends
  keeps them byte for byte.

## Consequences

- `@kadrion/schema`: schema `0.20`, `BLEND_MODES`, the types `Mask`,
  `MaskAnimation`, `Matte`, and `BlendMode`, the codes `matte-not-sibling`,
  `matte-not-shape`, `matte-not-plain`, `matte-in-transition`, and
  `repeat-of-matte`, the frozen `0.19` reader, and the step.
- `@kadrion/runtime`: `MaskState`, `MatteState`, `CompositingState` on the
  state of every image, video, text, captions node, shape, and group;
  `maskAt`, `compositingAt`, `FEATHER_BOUNDS`.
- `@kadrion/renderer-dom`: the masks `<svg>`, the CSS `mask` of an element,
  the frame of a matte, `mix-blend-mode`, and `isolation`; an image mask among
  the assets a page loads and decodes.
- `@kadrion/editor-sdk`: `SetBlendMode`, `SetNodeMask`, `SetNodeMatte`, and
  `matte-in-use`; 88 commands. `@kadrion/ai-sdk`: their three tools, a
  catalogue of 91 entries.
- The change of the API is additive (new exports, commands, error codes) and
  breaking (schema `0.20` in `SCHEMA_VERSION`; the node types and node states
  gain three keys).
- `@kadrion/test-fixtures`: the composition of compositing (640×360, 2 s:
  the sixteen blend modes over a gradient, an image mask, a feathered and
  animated shape mask, a text with an inverted polygon mask, an alpha matte in
  a group that blends, and a luminance-inverted matte that starts at 0.5 s),
  its 4 golden frames, and the `0.20` corpus.
- The runtime build grows to 273 872 bytes; its hash changes, so the golden
  frames are written again (every existing PNG file byte for byte) and parity
  is measured again.
- Q14 stays open: a new pinned test and its report are added.

## Verification

- Unit tests of the schema: the step 0.19 → 0.20 with its migration pair, the
  corpus, and the invalid corpus of `0.19`; the negative fixtures of every new
  code; the types; mattes in templates (a condition, a repeated scene).
- Unit tests of the runtime (`packages/runtime/test/compositing.test.ts`): the
  compositing of every node of the reference, a morphing shape mask and its
  feather, the bounds of the feather.
- Unit tests of the renderer (`packages/renderer-dom/test/compositing.test.ts`):
  the masks in document order, the CSS mask, the frame of a matte, the hidden
  matte, the inverted mask, `mix-blend-mode` and `isolation`, and the same
  tree whatever was rendered before.
- Unit tests of the commands (`packages/editor-sdk/test/compositing.test.ts`):
  each command and its inverse, the refusals, and `matte-in-use`.
- In pinned Chromium (`tests/pinned/compositing.pinned.test.ts`): a matte that
  is not active draws its node as a node without a matte, and the frames of
  the composition of compositing meet their 4 golden frames. The existing
  golden PNG files stay byte for byte.
- Parity of the Player against the Producer measured again.
