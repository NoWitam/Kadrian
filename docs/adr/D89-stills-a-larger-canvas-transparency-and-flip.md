# D89 — Stills: a canvas up to 8192 pixels, transparency, and a mirror flip of nodes

- Status: Accepted — by the project owner on 2026-11-22 (13:30 Europe/Warsaw),
  before any code, with the recommendations of all seventeen questions
- Date: 2026-11-22
- Supersedes: —
- Extends, on acceptance, each with an `Amended by` line written then and in
  force from the pull request it names:
  - D07: stills up to 8192 pixels a side and with alpha; video output as it
    is (D89.1, D89.2). Its quotation of `AGENTS.md` changes only if the owner
    accepts question 5.
  - D15 (the canvas row of its table) and D70 (70.6), D76 (76.1): sides and
    insets up to 8192 (D89.1); D15 also gains the flip (D89.3).
  - D22 (22.2) and D68 (68.6): the transform list ends with the flip; D75
    (75.6): so does the transform of a matte (D89.3).
  - D22 (22.3), D25 (25.2), and D42 (42.5): the runtime writes the page's
    clear on `html`, outside the root; the page and the frame state
    `color-scheme: normal` (D89.2).
  - D26 (26.3): the viewport may be 8192×8194 (D89.1).
  - D28 (28.1, 28.5): the host document's background, the frame's colour
    scheme, and the override of the default background on a session that
    lives with the page (D89.2).
  - D29 (29.5): a video job refuses a side above 1920 (D89.1).
  - D47 (47.5, 47.6, 47.7) and D88 (88.2): `EXPORT_MANIFEST_VERSION` 7 with
    `clear`, compared by the join; a still up to 8192 and with alpha (D89.2).
  - D48 (48.4): the limit `maxCanvasPixels` (D89.1).
  - D65 (65.8): the probes of D89.2 and D89.3. D46 (46.5): two tools.
  - D35: the steps from `0.26` to `0.29`.
- Amended by: PR-91 on 2026-11-22: D89.1: the bound of `0.29` is 4224
  pixels a side, not 8192: the largest side on a grid of 128 pixels whose
  probe passed the gate in every run in the pinned container; a larger side
  would need tiles, a new Chromium argument, or a raised timeout, which D89.1
  leaves to the owner (implementation notes of PR-91)
- Related: D26, D33, D38, D57, D66, D71, D83, D86

## Context

A host's graphics editor treats an image as a composition of one frame and
renders it with `renderStill`. It needs three things the engine lacks. Read
from `main` at `1ad4ee9` on 2026-11-22; nothing was measured.

- **The canvas stops at 1920.** `canvasLength`
  (`packages/schema/src/composition-schema.ts`) is 1 to 1920 for the
  composition and a definition, and a safe inset stops at 1920. D15: "D07
  stops at 1080p". `presetSize` (`packages/producer/src/encode.ts`) refuses an
  upscale and odd sizes and relies on the schema for the long side: 8192×2160
  at `1080p` would give 4096×1080, past level 4.0 (D29).
- **The need.** Photographs from phones are 4000 to 6000 pixels on the long
  side, and an AI upscale doubles an image of 2048 to 4096. A bound of 4096
  would refuse both; 8192 holds them.
- **Every still is opaque.** The page states `html{background-color:#ffffff}`
  (D42.5); `renderStill` writes the captured PNG, `mjpeg`, or lossy `libwebp`
  (D47.7).
- **No node can be mirrored.** The transform is D68.6's, in CSS
  (`cssTransform`) and, for a matte, in pixels (`svgTransform` in
  `packages/renderer-dom/src/masks.ts`). A scale lies from 0 to 1000 (D15).
- **The capture** is one `Page.captureScreenshot` at scale 1 in a viewport
  of the canvas plus two rows of the mark (D28.5, D86.1), on a CDP session
  opened and detached for each capture (`capture.ts`). The Player's frame is
  never scaled (D25.2).
- `AGENTS.md` lists "4K" outside the scope, and D07 quotes that line.

## Decision

> D89: A composition and its definitions may be up to 8192 pixels a side for a still, and every video job refuses a side above 1920. A document may declare a transparent clear, which a PNG or WebP still and `renderFrames` keep as alpha, while every opaque output renders the document with a white clear. Every transformable node may be mirrored in its own box by `flip`. Each arrives as its own schema step, existing documents render byte for byte, and each edit has a command and a tool.

The steps follow the pull requests: `0.27` the flip, `0.28` the clear, `0.29`
the canvas.

### D89.1 A canvas up to 8192 pixels for stills (schema `0.29`)

- **Schema.** `canvasLength` and the safe inset go up to 8192, for the
  composition and definitions. `step028To029` changes `schemaVersion` only.
- **Video stays as D07 and D29.5 allow.** `exportMp4`, every range job,
  `join`, and the estimate refuse, with `preset-unsupported` and before a page
  opens, a composition **or any definition** with a side above 1920, so no
  video job draws more pixels than today. `renderAudio` accepts it;
  `renderFrames` and `renderStill` accept up to the bound.
- **One capture** with the arguments of D28.5 and the reference capture of
  D88.1: no tiles, no device scale factor, `CHROMIUM_ARGS` unchanged. A side
  of 8192 asks for a viewport of 8192×8194 (D86.1).
- **A host's bound.** `JobLimits.maxCanvasPixels` (width × height), checked
  before a page opens (D48.4), with no default.
- **The Player** is unchanged (D25.2); the host scales the element around
  the frame, and the host guide shows how.
- **The gate of PR-91, and the bound it sets.** A full-canvas probe at the
  bound: incompressible noise, a blur, an SVG filter (D72), a mask, and a
  blend mode, each over a 1-pixel pattern in every corner, so that a render
  surface Chromium clamps to its texture size, clipping or downscaling it,
  loses a pattern. It renders twice in the pinned container within today's
  timeouts, with every pattern intact. PR-91 measures first; the bound of
  `0.29` is the largest side up to 8192 that passes, written into D89 by an
  amendment with the measurement. Never tiles, a new Chromium argument, or a
  raised timeout without the owner's consent.
- **The bound, as measured (amended by PR-91).** The bound of `0.29` is
  **4224** a side, for the composition, a definition, and a safe inset. The
  gate passed at 4224² in seven runs out of seven and at 8192×1024, and failed at
  4352² and every larger square it tried, up to 8192², within today's
  timeouts and without tiles or a new argument (implementation notes of
  PR-91). Wherever this ADR says 8192 of a still or of the schema, read 4224;
  a viewport is at most 4224×4226.
- **What PR-91 measures** besides: time and peak memory of Chromium and Node
  for PNG, JPEG, and WebP at 2048², 4096², the bound², and 8192×1024; the
  worst-case PNG and its base64 through CDP and in Node; the Player's first
  seek at 4096² and the bound² under a host scale of 1/8.

### D89.2 Transparent stills (schema `0.28`)

- **Schema.** The composition gains `clear`, `'white'` or `'transparent'`,
  after `safeArea`; `step027To028` writes `'white'`. A definition has none.
- **The page.** Its style keeps white (D42.5). For `transparent`, the runtime
  build's `frame` sets the background colour of the page's `html` element to
  `transparent`, and removes it otherwise; both hosts run that build.
- **Colour scheme.** Chromium paints an opaque backdrop behind a frame whose
  colour scheme differs from its document's. `RENDER_PAGE_FRAME_STYLE` and the
  page's root state `color-scheme: normal`, for every document; the golden
  frames prove they change no pixel, and a Player test over a host page of
  dark scheme proves the host shows through.
- **Who keeps alpha.** `renderFrames` and a PNG or WebP still of a
  transparent document. For it, the Producer states a transparent background
  in its host document (D28.1) and sets
  `Emulation.setDefaultBackgroundColorOverride` to `{ r: 0, g: 0, b: 0, a: 0 }`
  on a CDP session opened with the page and kept until it closes, since an
  override may end with its session. A document whose clear is white gets
  neither, and is captured by today's calls.
- **Opaque outputs.** A JPEG still and every video job load a copy of the
  document with `clear: 'white'`, so the page draws over its own white. Their
  output is that of the white document, byte for byte; the manifest keeps the
  `compositionHash` of the document as given. It is not the PNG composited on
  white: a blend mode (D75) over the clear, and rounding at semi-transparent
  edges, differ between a PNG and a JPEG of a transparent document. The host
  guide says so.
- **WebP** stays lossy at quality 90 (D47.7), with libwebp's alpha plane at
  its default, lossless compression. Other arguments, if FFmpeg needs them,
  apply only to a still with alpha and are recorded.
- **Manifests.** Every manifest of D47 that holds pictures (a still, a
  segment, an export) gains `clear`, what its page cleared to; the join
  compares it as it compares `capture` (D88.2). `EXPORT_MANIFEST_VERSION`
  becomes 7. `renderFrames` keeps `MANIFEST_VERSION` 3, so the golden
  manifests keep their bytes; its frames follow the document it hashes, and a
  frame of a transparent document is RGBA (PNG colour type 6), which every
  reader of `renderFrames` accepts. The mark of D86 is opaque, and
  `firstPixel` reads RGBA.
- **Command.** `SetCompositionClear { clear }`, tool `set_composition_clear`;
  the same value is no edit (D38.9).
- **Probes.** A transparent reference still with golden frames; alpha checked
  in every frame of `renderFrames`, not only the first; a node with a blend
  mode over the clear; JPEG and MP4 equal to those of the white document.

### D89.3 A mirror flip of nodes (schema `0.27`)

- **Schema.** Every transformable node (image, video, text, captions, shape,
  group, instance, Custom HTML) gains `flip: { x, y }`, two booleans, after
  `origin`. `step026To027` writes `flip: { x: false, y: false }` in every
  scene and every definition, into groups at any depth, and leaves
  backgrounds untouched.
- **Meaning.** `x: true` mirrors left to right what the node draws in its own
  box (D68.2), about the box's centre, before scale and rotation. The box,
  `position`, `origin`, and the area a host hit-tests do not move. A group's
  box is the canvas, so it mirrors about the canvas's centre line.
- **Renderer.** `cssTransform` ends with `translate(100%, 0) scale(-1, 1)`
  for `x`, `translate(0, 100%) scale(1, -1)` for `y`, or
  `translate(100%, 100%) scale(-1, -1)` for both, and with nothing without a
  flip, so every document of `0.26` writes the string it wrote before.
  `svgTransform` does the same in pixels for a matte:
  `translate(<width>px, 0) scale(-1, 1)` and its pairs.
- **What it reaches.** Everything the node draws: content, crop, corner
  radius, mask (D75), and its effects, which CSS runs before the transform
  (D65.6), so a drop shadow (D71) and a text's shadow (D83) mirror their
  offsets. A matte is a sibling shape and follows its own flip. The offset or
  zoom of a clip transition (D66) precedes the node's own transform in the
  list, so it applies after the flip, in the parent's space, unchanged.
- **Not animated.** No row of D65.1 is added.
- **In the parent's space.** A host that mirrors across the parent's axis
  through the node's centre sends, in one transaction, `SetNodeFlip`,
  `SetNodeRotation` to `−r`, and `SetNodePosition` to
  `p + (R(r) − R(−r)) · S · (c − o)`, where `R` is the rotation matrix, `S`
  the scale, `c` the box's centre and `o` the origin, in pixels, rounded as
  a position (D15). The shift is 0 when `r` is a multiple of 180° or the
  origin is `500, 500`. The bus adds no edit (D38); the host guide carries
  the formula.
- **Command.** `SetNodeFlip { nodeId, flip }`, tool `set_node_flip`; a
  background is `unsupported-node`, the same value is no edit, the inverse
  sets the old flip. `describeDocument` states it.
- **Probes** (D65.8): `x`, `y`, both; with a rotation of 30° about
  `250, 750`; with a crop, a radius, and a drop shadow; on an image, a text, a
  shape, a group, and a flipped matte; exact in both hosts, twice.

### D89.4 Not included

An export scale (a still at k times its canvas) and still quality knobs (the
JPEG quality, lossless WebP), later; a command that resizes the canvas; alpha
in video; 4K video; a clear colour other than white; a flip animated or
turned in 3D.

## Alternatives considered

- **Canvas: tiles joined in Node.** Every seam needs proof, and the Producer
  would compose pixels itself.
- **Canvas: a device scale factor.** A still would no longer be the canvas at
  scale 1 (D26.3), and the Player could not show it.
- **Canvas: video above 1920 by downscaling.** Up to 32 times the pixels per
  frame, which D07 keeps out.
- **Clear: a field of the request.** The pixels would no longer follow from
  the document, and the Player would need the field too.
- **Clear: opaque outputs composited from the transparent capture.** Not
  equal to drawing over white (blend modes, edge rounding), and the Producer
  would composite pixels itself.
- **Clear: refuse JPEG and video of a transparent document**, or any colour.
  The host would keep two documents; a background node already fills.
- **Flip: a negative scale.** Invalid today (`minimum: 0`); it would mirror
  about the origin, the top-left corner by default, so the node leaves its
  box, and every scale keyframe, handle, and fragment would read signs.
- **Flip: on pictures only.** Texts and shapes are mirrored as often.

## Consequences

- `@kadrion/schema`: three steps, frozen schemas, corpora `v0-27` to `v0-29`.
  `@kadrion/runtime` and `@kadrion/renderer-dom`: `cssTransform`,
  `svgTransform`, the clear in `frame`, the colour scheme. Each step changes
  the runtime build and the Player's dist tree: Q14 reopens and parity is
  measured again three times.
- `@kadrion/producer`: the override, the copy, the manifests (PR-90); the
  refusal and the limit (PR-91). `@kadrion/editor-sdk`, `@kadrion/ai-sdk`:
  two commands and two tools; the pull requests state the counts.
- Every existing golden file keeps its bytes. PR-90 adds a transparent
  reference still with golden frames; PR-91 records its probe by SHA-256
  only, so no large PNG enters Git.
- A host reads manifests of version 7 and draws its own checkerboard.

## Verification

- `packages/schema/test`: each step on a full, a minimal, and a nested
  document (a group in a group in a definition, a background beside it); the
  bound and the bound + 1; the corpora.
- `packages/renderer-dom/test`: both transform strings with and without a
  flip.
- `packages/producer/test`: the refusal above 1920 for each video entry point,
  a definition included; `maxCanvasPixels`; the override only for alpha
  outputs, on the page's session; the copy for opaque outputs; `clear` in the
  manifests and the join refusing a mismatch.
- `tests/pinned`: the probes of D89.2 and D89.3, the gate of D89.1, the
  Player over a dark-scheme host page, and every existing golden file,
  manifest, and parity record unchanged.
- `tests/repo`: the ADR's row in the index.

## Questions for the owner, with recommendations

The canvas (D89.1):

1. **The bound.** Recommendation: 8192 a side, for photographs and upscaled
   images. The other: 4096, cheaper to prove, too small for both.
2. **Video above 1920.** Recommendation: refused, for definitions too. The
   other: downscaled to the preset, at the cost of every large frame.
3. **The bound PR-91 sets.** Recommendation: the largest side up to 8192 that
   passes the gate, by amendment with the measurement; never tiles or a new
   Chromium argument.
4. **`maxCanvasPixels`.** Recommendation: add it, with no default.
5. **"4K" in `AGENTS.md`.** Recommendation: change the line, in PR-88, to
   "CRDT collaboration, public plugins, 4K video output, HDR, and
   desktop/mobile apps.", and D07's quotation to the same words, with an
   `Amended by` line in D07. The other: keep the line, and the larger canvas
   waits for a decision that changes it.

Transparency (D89.2):

6. **Where it is said.** Recommendation: the document (`clear`), so the
   Player shows what the still holds. The other: the render request.
7. **JPEG and video of a transparent document.** Recommendation: rendered
   from a copy with a white clear. The other: refused.
8. **WebP with alpha.** Recommendation: lossy at 90 with a lossless alpha
   plane; lossless WebP later.
9. **Manifest version 7.** Recommendation: yes, `clear` in still, segment,
   and export manifests, compared by the join; `renderFrames` stays 3.
10. **The command.** Recommendation: `SetCompositionClear` with its tool.

The flip (D89.3):

11. **Booleans or a negative scale.** Recommendation: `flip: { x, y }`.
12. **About what.** Recommendation: the box's centre, before scale and
    rotation; the parent-space recipe in the host guide.
13. **Which nodes.** Recommendation: every transformable node. The other:
    images, videos, and shapes.
14. **A group.** Recommendation: about the canvas's centre, as its origin
    (D68.2). The other: its children's box, which only a browser measures.
15. **Animated.** Recommendation: no; a card flip is a later decision.

The plan:

16. **Three schema steps.** Recommendation: one per pull request. The other,
    one step, makes one large pull request.
17. **The release.** Recommendation: one after PR-92, following D88's.

## The pull requests

Each is approved separately, before it starts and again before its commit and
push, and the rules of phase six hold for them. PR-88 applies the wording of
question 5 only if the owner accepts it.

| Order | PR    | Subject                                                | Schema | Runtime build | Player dist | Q14 | Size |
| ----: | ----- | ------------------------------------------------------ | ------ | ------------- | ----------- | --- | ---- |
|     1 | PR-88 | D89 and its roadmap rows (documents only)              | —      | —             | —           | —   | S    |
|     2 | PR-89 | Schema `0.27`: the flip, `SetNodeFlip`, the probes     | `0.27` | yes           | yes         | yes | M    |
|     3 | PR-90 | Schema `0.28`: the clear, transparent stills, manifest | `0.28` | yes           | yes         | yes | M    |
|     4 | PR-91 | Schema `0.29`: a canvas up to 8192, video kept at 1920 | `0.29` | yes           | yes         | yes | M    |
|     5 | PR-92 | The host guide and the release                         | —      | —             | —           | —   | S    |

## Implementation notes (PR-89)

PR-89 brings schema `0.27` and the flip of D89.3; the readings below are
those of the code as built, before the pinned run.

- **The step and the corpus.** `step026To027` writes
  `flip: { x: false, y: false }` directly after the `origin` of every node
  that has one, in scenes, in definitions, and in the children of groups at
  any depth, and leaves backgrounds as they are. The frozen `0.26` is
  `packages/schema/src/v0-26`; the pair `migration-0-26-to-0-27`, the corpus
  `compatibility/v0-27` (every file of `v0-26` stepped, and `flip`, written
  by hand: flips on an image, a text, and a shape of a definition, on an
  instance and a group, a background beside them in a definition, and a group
  in a definition with a flipped child), and six invalid cases (a missing
  flip, on a node and on a child of a group, an axis that is no boolean or is
  missing, an unknown field, and a flip on a background) hold it. Groups do
  not nest in a valid document (D16), so a group in a group in a definition
  is tested on the step alone, which recurses; a valid document with a group
  in a definition goes through `migrateComposition`.
- **The renderer.** `flipParts` (`css.ts`) is the one rule of the CSS
  transform and of the matte's transform (`svgTransform`, `masks.ts`): the
  flipped side as a length and `scale(-1)` along it, nothing without a flip.
  A side that is not flipped is written `0px`, not `0` as D89.3 writes it:
  the CSS Object Model serialises a unitless zero length as `0px` (read back
  in Chrome), and every string the renderer writes is the one the CSSOM
  gives back (D22). The matte's own element, which is hidden, carries the
  flip in per cent as every node does. The flip is not animated: it is read
  from the node as it is stored.
- **The command and the tool.** `SetNodeFlip` follows `SetNodeOrigin` in the
  registry, so `set_node_flip` follows `set_node_origin` in the catalogue
  (104 tools). A node whose stored flip is missing is `unsupported-node`,
  which is a background; the same value is no edit, and the inverse sets the
  old flip. Its description carries the recipe of D89.3 for a rotated node;
  the formula is the host guide's (PR-92). The catalogue grows by 1 738
  characters over the snapshot of `0.26`; D89 sets no budget for it.
- **The probes.** `tests/pinned/flip.pinned.test.ts`, on the composition of
  compositing at 1 s: the flip on `x`, on `y`, and on both of an image, a
  text, a shape, a group, and the matte `matte-gradient`; the same on `x`
  with a rotation of 30° about `250, 750` of every flipped node but the
  matte; and an image with a crop, a corner radius, and a drop shadow,
  flipped on `x` and on both. Every probe is the same frame rendered alone
  and after another frame, the Player shows the Producer's frame exactly, and
  each host gives it twice. A second test renders the photo at its natural
  size (128 by 128, `fill`): no pixel outside its box changes, and inside it
  every pixel is the source's pixel mirrored, exactly. At the fixture's 150
  pixels the picture is resampled, and the sampling positions, quantised to a
  fraction of a pixel, are not symmetric about the box's centre: a mirrored
  pixel differed by up to 10 levels at the sharp edges of the quadrants,
  which compares the resampler, not the flip. No probe has golden frames.
  Both tests passed twice in the pinned container.
- **A defect of masks found by the probes, outside the flip.** Content turned
  off the axes inside an SVG mask (D75) is painted differently by the first
  frame of a page than by every frame after it, the same time included: the
  unflipped composition of compositing at 1 s differs in 186 pixels, by 1
  level, between a frame rendered alone and one rendered after another, in
  the Producer as in the Player, from the turned star matte (109 pixels) and
  the animated polygon of the text's mask; a mask held still, or turned by a
  multiple of 90° or flipped, shows no difference. The first probes compared
  a Producer frame rendered alone with a Player that had rendered before, so
  they failed on it (163 pixels for `y`); they now hold the composition's
  mask animations still and do not turn the matte, and assert that each
  probe is free of it. The golden frames of compositing are rendered in one
  sequence and keep their bytes. The defect is not fixed here: it needs its
  own change, since every frame of a document with a turned mask is affected.
- **The golden manifests** change in the three fields of D42 (the schema
  version, the composition hash, and the runtime's content hash), as in
  PR-76: the step changes every fixture, so its hash. No golden PNG file
  changes.
- **Builds.** The runtime build is
  `sha256:b7f9b46fa735aff4b5eab5dc21cb178a629182ab86f49b839733e833b3acb97b`
  (506 099 bytes), and the Player's dist tree
  `sha256:93c12b4b7dc0178711970adcc1f4cd3b3a41585f4e014be900fbb7ae744fddbf`
  (83 files).
- **The pinned run** (four processors): `goldens:update` twice in fresh
  containers gave the same bytes, and no golden PNG file changed; the whole
  pinned suite passes (35 files, 352 tests); the parity records of
  `docs/spike` are measured again with zero differing pixels, and the
  hashes of `docs/spike/report.md` follow them. Q14 reopens with the runtime
  build and the golden manifests.

## Implementation notes (PR-90)

PR-90 brings schema `0.28` and the clear of D89.2; the readings below are
those of the code as built and of the pinned run.

- **The step and the corpus.** `step027To028` writes `clear: 'white'`
  directly after the composition's `safeArea` and nowhere else; definitions
  have no clear. The frozen `0.27` is `packages/schema/src/v0-27`; the pair
  `migration-0-27-to-0-28`, the corpus `compatibility/v0-28` (every file of
  `v0-27` stepped, and `clear`, written by hand: a transparent clear, a disc
  at half opacity, a shape of blend mode `multiply`, and an instance of blend
  mode `screen` of a definition), and four invalid cases (a missing clear, the
  value `black`, a clear that is no string, and a clear on a definition) hold
  it.
- **The page.** `frame` sets the background colour of the page's `html` to
  `transparent` for a transparent document right after the document is
  validated, and removes it otherwise. The page's style is
  `html{background-color:#ffffff;color-scheme:normal}` and
  `RENDER_PAGE_FRAME_STYLE` gains `color-scheme: normal`; no golden PNG file
  changed with them.
- **The override, as built: on the session of each capture.** D89.2 sets the
  override once, on a session kept with the page. Measured in the pinned
  Chromium, that does not hold: an override ends when any CDP session of the
  page detaches, and the sessions of the presentation (D28.5) and of the mark
  (D86.2) attach and detach before every capture, so every frame came out
  opaque white (PNG colour type 2), even when the override was sent again on
  the kept session. A capture of a frame of a transparent document therefore
  sends `Emulation.setDefaultBackgroundColorOverride` with transparent black
  on its own session, immediately before `Page.captureScreenshot` with the
  arguments of D28.5, as Playwright does for a screenshot without a
  background. The host document states `html{background-color:transparent}`
  for it. A white document gets neither and is captured by the calls it was
  before.
- **Opaque outputs.** `withWhiteClear` makes the copy with a white clear and
  validates it (Q17). A JPEG still renders it; an export and every range job
  load it for their segments. The manifest of a still names the clear its page
  drew (`white` for a JPEG); those of segments and of an export always name
  `white`, and the join compares it as it compares `capture`.
  `EXPORT_MANIFEST_VERSION` is 7. Every manifest keeps the `compositionHash`
  of the document as given.
- **WebP.** The arguments of D47.7 stay: the PNG enters FFmpeg as BGRA, and
  libwebp keeps its alpha. The WebP of a transparent document has a `VP8X`
  header with the alpha flag, and that of the white document has none. No
  argument is added.
- **The command and the tool.** `SetCompositionClear` follows `SetSafeArea`
  in the registry, so `set_composition_clear` follows `set_safe_area` in the
  catalogue (105 tools). `describeDocument` and `describe_document` state the
  clear. The catalogue grows by 1 357 characters over the snapshot of `0.27`,
  and D89 sets no budget for it.
- **The transparent reference still.** `compositions/clear.json` is 640x360
  for 1 s at 30 fps with no background and no assets: an opaque square, a disc
  whose opacity grows from 0.25 to 0.75 as it moves, a gradient from
  transparent to opaque red, and an orange square of blend mode `multiply`,
  half over the square and half over the clear. It has no mask or matte. Its
  golden frames are at 0, 0.5, and 0.966 666 s.
- **The probes.** `tests/pinned/clear.pinned.test.ts` checks every one of the
  30 frames of `renderFrames`: colour type 6; transparent black where no node
  is; the square opaque and exact; the multiply over the square within 2
  levels of the product; the multiply over the clear the orange itself,
  opaque; the disc's alpha within 2 levels of its opacity; and the gradient's
  alpha rising. It also covers the golden frames, and a PNG still equal to
  the frame. The WebP keeps alpha; the JPEG still and an MP4 at 1280x720
  (`720p` refuses to upscale 640x360) are byte for byte those of the white
  document. In the Player over a host page of dark scheme, the host shows
  through a transparent document and a white document stays white. That test
  seeks without the preflight of the conformance host, which refuses a host
  page with a style of its own (D33.2).
- **The golden manifests** change in the three fields of D42 only. No golden
  PNG file changes; the three of the clear composition are added.
- **Builds.** The runtime build is
  `sha256:e3df8346dfdb1d674d8975d4e8150d02a1783510a0143add006e18c081e1c907`
  (506 805 bytes), and the Player's dist tree
  `sha256:dadc1a9b200d27e5a76820d2994d1449548189992eecf666445b03149eb08417`
  (83 files).
- **The pinned run** (four processors): `goldens:update` twice in fresh
  containers gave the same bytes, and no earlier golden PNG file changed. The
  whole pinned suite passes (36 files, 356 tests). The parity records of
  `docs/spike` were measured again with zero differing pixels, and the hashes
  of `docs/spike/report.md` follow them. Q14 reopens with the runtime build
  and the golden manifests.

## Implementation notes (PR-91)

PR-91 measured the gate of D89.1 first, then brings schema `0.29` with the
bound the gate set; the readings below are those of the pinned container
(the image of D26.2, four processors, 15 GB of memory for the whole host)
and of the code as built.

- **The probe.** `tests/pinned/canvas-probe.ts` builds it at a side `n`: an
  image of noise of `n`×`n` from a fixed seed (xorshift32), a palette PNG of
  256 colours stored without compression, so that its capture does not
  compress and is as large as a PNG of the canvas is; a 16-pixel square of
  1-pixel checkers in every corner; and five frames: the noise, the noise
  under a black rectangle 64 pixels beyond every edge at half opacity under
  a blur of 8, the noise under a `curves` filter (D72) that inverts red, the
  noise under a still mask of the whole box (D75), and the noise under a
  white rectangle beyond every edge of blend mode `difference`. A pattern is
  intact when every pixel of every corner is what its frame makes of it. The
  noise frame must equal the image, pixel for pixel. An RGB image of noise
  (201 MB at 8192²) closed the page in `load`, the assets travelling as one
  message of the protocol, so the image is a palette one (67 MB at 8192²).
- **The gate**, `tests/pinned/canvas.pinned.test.ts`: the probe at the bound,
  rendered twice by `renderFrames` with the Producer's own timeouts, each on
  a fresh page. Each side was measured with the gate as it is now, its side
  taken from the run; the runs at 4224² include that of the pinned run below:

  | Side      | Runs that passed | What failed                                                                                                                 |
  | --------- | ---------------: | --------------------------------------------------------------------------------------------------------------------------- |
  | 8192²     |           0 of 1 | Both passes within the timeouts, but corners white and 6 603 003 pixels of the noise frame not the image; the passes differ |
  | 6144²     |           0 of 1 | `The mark of frame 2 did not reach the surface within 5000 ms`                                                              |
  | 5120²     |           0 of 2 | White bands at the top and bottom of the blur and the blend, the same in both passes, and an incomplete noise frame         |
  | 4608²     |           0 of 1 | The noise frame of the second pass incomplete                                                                               |
  | 4352²     |           2 of 4 | `The mark of frame 0 did not reach the surface within 5000 ms` in two runs                                                  |
  | **4224²** |       **7 of 7** | —                                                                                                                           |
  | 4096²     |           7 of 7 | —                                                                                                                           |
  | 8192×1024 |           1 of 1 | —                                                                                                                           |

  No side failed by a clamp to a texture size: what fails is a surface
  captured before every tile of it is drawn, or a mark that does not reach
  the surface in time, which is area and time, not the length of a side.
  The bound of `0.29` is therefore **4224**, the largest side on a grid of
  128 pixels at which every run passed; a side of 8192 needs tiles, a new
  argument of Chromium, or a longer timeout, which D89.1 leaves to the
  owner. 8192×1024 passes, but `0.29` bounds each side, not the area, so it
  is no valid document: an area bound is a decision of its own.

- **The probe's record at 4224.** Every one of the fourteen renders, in the
  seven runs, gave the same bytes. The image of noise is
  `sha256:fe2bf477d4188101dd1323ec8385adaede1409faefea5ef215055b17d127ddb3`
  (17 849 963 bytes), and the frames, PNG files of 50.7 to 53.6 MB that do
  not enter Git, are:
  - noise:
    `sha256:d3c4a483e3eab649d7b582b7c582e415a7a4100432617fe6f44acaddf9844e60`;
  - blur:
    `sha256:2994236898393100c979155cc3b7708c0a6addb9699c83fab60c6c27b64ce32d`;
  - filter:
    `sha256:a04fd68250624ae9dbe6a103c5eb833331d2180756ab9f05068b167d08e5eb10`;
  - mask: the noise's own bytes, since a still mask of the whole box changes
    nothing;
  - blend:
    `sha256:f953a936448f7d62f725f0357765045d68c0a8af657d6b6c1f2750ac8efc694b`.
- **What D89.1 lists, measured** (one run each, in the container above; peak
  Chromium is the sum of the proportional set size of its processes, about
  200 MB before the job; peak Node is the maximum resident set of the test
  process, 380 to 440 MB before it, the image of noise and the test runner
  included). The times are those of four processors shared with Docker and
  vary by tens of per cent from run to run; the JPEG at 2048² was the first
  FFmpeg of its container. Every side above 4224, 8192×1024 among them, was
  measured with a provisional schema whose bound was 8192, before the gate
  set it; `0.29` refuses those canvases.

  | Still, `renderStill` | Format | Time (ms) |      Bytes | Peak Chromium (MB) | Peak Node (MB) |
  | -------------------- | ------ | --------: | ---------: | -----------------: | -------------: |
  | 2048²                | PNG    |     2 113 | 12 613 404 |                724 |            496 |
  | 2048²                | JPEG   |     9 487 |  7 805 376 |                720 |            468 |
  | 2048²                | WebP   |     3 721 |  3 494 412 |                721 |            468 |
  | 4096²                | PNG    |     8 165 | 50 437 726 |              1 854 |            753 |
  | 4096²                | JPEG   |     9 853 | 31 223 736 |              1 781 |            816 |
  | 4096²                | WebP   |    11 904 | 13 980 606 |              1 798 |            752 |
  | 4224²                | PNG    |     8 378 | 53 640 278 |              1 832 |            816 |
  | 4224²                | JPEG   |    10 222 | 33 211 959 |              1 859 |            848 |
  | 4224²                | WebP   |    12 263 | 14 868 804 |              1 829 |            780 |
  | 8192×1024            | PNG    |     3 815 | 25 216 033 |              1 088 |            561 |
  | 8192×1024            | JPEG   |     5 222 | 15 613 963 |              1 105 |            564 |
  | 8192×1024            | WebP   |     6 216 |  6 989 482 |              1 092 |            570 |

  The worst-case PNG, the noise frame captured again by
  `Page.captureScreenshot` with the arguments of D28.5 after the frame was
  presented: at 4096², 2.1 to 2.2 s a capture, base64 of 67 250 304
  characters, decoded in Node in about 25 ms, the bytes those of the frame;
  at 4224², 2.3 to 2.4 s, 71 520 372 characters, about 30 ms; at 8192×1024,
  1.1 to 1.2 s, 33 621 380 characters, about 6 ms. Peak Chromium 1 808 and
  1 848 MB, peak Node 899 and 938 MB (4096² and 4224²). At 4352² the capture
  taken again differed from the frame: the frame had been captured before it
  was drawn whole, with no error.

  The Player's first seek, under a host scale of 1/8 (the stage scaled by
  CSS in a viewport of 512 or 528 pixels, the frame itself not scaled,
  D25.2), the noise loaded as base64 by the conformance host: at 4096², load
  4.0 to 4.6 s, the first seek presented in 256 to 763 ms, the second in 27
  to 87 ms, peak Chromium 1 501 to 1 543 MB, peak Node about 634 MB; at
  4224², load 3.7 to 4.7 s, the first seek presented in 403 to 708 ms, the
  second in 33 to 52 ms, peak Chromium 1 582 to 1 589 MB, peak Node 617 to
  628 MB (three runs).

- **Memory.** A still at the bound takes about 1.9 GB of Chromium and up to
  about 0.9 GB of Node a job, the image of noise included, on a host of
  15 GB: a host that runs jobs at the bound side by side counts about 2.8 GB
  each. `maxCanvasPixels` is the host's lever; it has no default.
- **A heavier document at the bound.** The gate proves the probe, not every
  document. Full-canvas images of noise stacked at half opacity at 4096²:
  two, three, and four passed; five failed once with the mark's timeout; six
  once gave a first frame captured before it was drawn whole, with no error,
  and once passed. 28 layers at 1920² and 40 at 1080×1920 passed. The
  capture does not wait for every tile to be drawn, and D89.1 adds no wait
  without the owner's consent; a host that renders large and heavy stills
  checks them, or bounds their pixels.
- **The schema.** `canvasLength` and the safe inset are 1 to 4224
  (`MAX_CANVAS_LENGTH`) for the composition and a definition;
  `step028To029` changes `schemaVersion` alone. The frozen `0.28` is
  `packages/schema/src/v0-28`; the pair `migration-0-28-to-0-29`, the corpus
  `compatibility/v0-29` (every file of `v0-28` stepped, and `canvas`, written
  by hand: 4224×2376 and transparent, a safe inset of 4223, and an instance of
  a definition of 4224² holding a flipped disc), and three new invalid cases
  (a height and a safe inset of 4225, and a definition 4225 tall) with the
  width of 4225 hold it.
- **Video.** `checkVideoCanvas` (`encode.ts`) refuses with
  `preset-unsupported` a composition or any definition, placed or not, with
  a side above 1920 (`MAX_VIDEO_SIDE`); `presetSize` calls it, so
  `exportMp4` and every range job refuse before a page opens or FFmpeg
  starts, and `estimatePlan` calls it after validation. A join reads no
  document: it refuses a segments manifest whose `preset.sourceWidth` or
  `sourceHeight` is above 1920, and a definition is the range job's to
  refuse. `renderAudio` accepts any canvas.
- **The limit.** `JobLimits.maxCanvasPixels` (`--max-canvas-pixels`) is
  width × height, of the composition and of each definition, placed or not,
  checked with the other limits of the document before a page opens; a
  definition over it is named in the message.
- **The capture** is unchanged: one `Page.captureScreenshot` of the canvas at
  scale 1 in a window of the canvas and two rows (D28.5, D86.1), no tiles, no
  device scale factor, `CHROMIUM_ARGS` and every timeout as they were.
- **The golden manifests** change in the three fields of D42 only. No golden
  PNG file changes and none is added.
- **Builds.** The runtime build is
  `sha256:890ab89b338d9ccae52452365a1faf7ddd6bfcd7857af32091d4d1837de73c34`
  (507 010 bytes), and the Player's dist tree
  `sha256:8716f624a87f3686347801fa15b4f8dbf5dee44cc127e1237f3ac6f3fcfcace2`
  (83 files).
- **The pinned run** (four processors): `goldens:update` twice in fresh
  containers gave the same bytes, and no golden PNG file changed. The whole
  pinned suite passes (37 files, 357 tests), the
  gate of D89.1 at 4224 among them. The parity records of `docs/spike` were
  measured again with zero differing pixels, and the hashes of
  `docs/spike/report.md` follow them. Q14 reopens with the runtime build and
  the golden manifests.

## Implementation notes (PR-92)

- **The host guide** carries what D89 leaves to it: a large canvas scaled by
  the host around the Player's container and the host's own checkerboard
  behind a transparent document (section 3); `SetNodeFlip`,
  `SetCompositionClear`, and the formula of a flip in the parent's space
  (section 5); manifest version 7 with `clear`, compared by the join, and
  the refusal of a video canvas above 1920 (section 13); the bound of 4224,
  the memory of a still at it, `maxCanvasPixels`, and why a JPEG is not the
  PNG composited on white (section 15). The README states the same in short.
- **The release.** Every package is `0.12.0` for `v0.12.0`, after `v0.11.0`
  of D88. No code, runtime build, Player dist tree, golden file, or parity
  record changes.
