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
