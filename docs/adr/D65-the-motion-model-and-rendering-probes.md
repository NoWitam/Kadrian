# D65 — The motion model and the rendering probes

- Status: Accepted — by the project owner on 2026-11-07, after PR-45 was merged
- Date: 2026-11-07
- Amended by: PR-48 (D68) on 2026-11-07: 65.1: the rows of PR-48 as built: `size` on images and videos only, `color` on backgrounds, texts, and captions, an origin offset from −1000 to 1000 (D68.3)
- Amended by: PR-49 (D69) on 2026-11-08: 65.3: fragments of text as built, letters by a table of Unicode 17.0.0 (D69.2, D69.5)
- Amended by: PR-51a (D71) on 2026-11-09: 65.1: an effect's parameters are animated by the effect's own animations, not by paths `effects/<id>/<parameter>` of its holder; 65.6: a blur spills beyond the box (D71.2, D71.4)
- Amended by: PR-51b (D72) on 2026-11-09: 65.5: the SVG primitives of the kinds of D72 (an arithmetic mix, a matrix and a gamma, light from a point in the units of the box, a key's matte and spill) are added to the probes (D72)
- Amended by: PR-52 (D73) on 2026-11-09: 65.1: the rows of shapes as built; a shape's corner radius lies in its geometry and animates with the `geometry` row, not `cornerRadius`; 65.5: the primitives of shapes (absolute curves and arcs, the even-odd rule, dash patterns with each cap and join, gradients in user space) are added to the probes (D73.4)
- Amended by: PR-54 (D75) on 2026-11-09: 65.1: the rows `mask/geometry` and `mask/feather` are animated by the mask's own animations, not by paths of the node's animations; only a shape may be a matte, since the pinned Chromium paints no `<foreignObject>` inside an SVG mask (D75.3, D75.4)
- Amended by: PR-55a (D76) on 2026-11-10: 65.4: the existing commands work inside a definition by the document IDs of its nodes, clips, and transitions, not by a `definitionId` argument; `ExpandInstance` undoes `ConvertToDefinition` (D76.8)
- Amended by: PR-64 (D83) on 2026-11-11, in force from PR-66: 65.1: the box of a text with a frame is its frame (D83.3)
- Supersedes: —
- Related: D03, D15, D16, D18, D19, D22, D23, D26, D28, D33, D34, D41, D46,
  D49, D56, D57, D58, D59, [phase five](../roadmap/phase-5.md) (PR-45), the
  probe record [`docs/spike/motion-probes.json`](../spike/motion-probes.json)

## Context

Phase five adds eleven schema steps (`0.11` to `0.23`, PR-46 to PR-56) of
motion graphics, effects, and reusable elements. Without a shared model each
step would invent its own kind of animated value, its own place in the order
of drawing, and its own idea of time, and each would find out late whether the
pinned Chromium renders its feature deterministically. The roadmap therefore
starts with this ADR and with probes (PR-45), as PR-27 (D49) did for the
timeline, and it requires that "every visual primitive is probed before it
enters the schema": repeatable byte for byte across two pinned runs, and at
zero difference between the Player and the Producer in the pinned environment.

The repository fixes today (read on 2026-11-07, `main` at `1bcb6a8`): an
animation targets `opacity`, `position`, or `scale` (D16.6) with
`interpolation: 'linear'` and the arithmetic of D18.3; a sampled value meets
its base value by one operation (D18.4); a keyframe is set by one command per
property, and no command but `AddKeyframe` has an argument called `value`
(D41.1); a node is drawn by DOM and CSS (D03, D22) with `transform` and
`opacity` written by `renderState`; captions are broken into lines by counting
code points, without measuring text (D57.2); templates are filled by the pure
`instantiateTemplate` (D58, D59); a Custom HTML element is a sandboxed frame
(D23).

**The probes.** `tests/probes/motion-probes.ts` loads one probe composition
(1920×1080: an image, a text in the fixture font, and a video frame of the
fixture video decoded by the pinned FFmpeg) into the Producer's render session
(D28.1) and into the public Player in the conformance host (D33.2), renders
both at one time, and then, for each of 90 candidate primitives
(`tests/probes/catalogue.ts`), makes the same change to the render page's DOM
in both hosts, waits for every frame of the page (D28.5), and captures both
with the Producer's capture. A whole run is done twice in one container, each
with its own browser process; the script ran in two fresh pinned containers
(D26.2, `--network none`, only `lo`), the second against the record of the
first. Results, all from `docs/spike/motion-probes.json` (241 rows, runtime
build `sha256:2bbc9822…`, Chromium 153.0.8010.12, revision 1243):

1. **Every probe is exact.** All 90 probes, over every subject they apply to,
   gave the same pixels in both runs of both containers, and the Player and
   the Producer differ in 0 pixels: rotation (including about an origin),
   `scale` about the centre, `border-radius` with `overflow: hidden`; the CSS
   filters `blur`, `brightness`, `contrast`, `saturate`, `hue-rotate`,
   `grayscale`, `invert`, `sepia`, `opacity`, `drop-shadow`, and a chain of
   four; the SVG filters `feGaussianBlur` (in `sRGB` and `linearRGB`),
   `feColorMatrix` (saturate and a lift/gain matrix, in both spaces),
   `feComponentTransfer` (tables and gamma), `feMorphology` (dilate and erode),
   a glow (`feFlood`, `feComposite`, `feMerge`), and a key by channel
   difference; all sixteen values of `mix-blend-mode`; `mask-image` in alpha
   mode (linear and radial gradients) and in luminance mode, and an SVG
   `mask`; `clip-path` with a path, a circle, an inset with rounded corners,
   and a polygon; `backdrop-filter` (`blur`, `grayscale`); `-webkit-text-stroke`
   with and without `paint-order: stroke fill`, and `text-shadow`; a text split
   into one element per letter, at rest and in mid-stagger; a stroke drawn on
   by `stroke-dasharray` with `pathLength="1000"`; and SVG and CSS gradients.
2. **A filter at its neutral value is not the absence of a filter.** Every
   neutral CSS filter (`blur(0px)`, `brightness(1)`, …) and an identity SVG
   filter changes 48 pixels of the image (largest channel difference 11) and
   1 787 pixels of the text (difference 1), because an element with a filter is
   rasterised in a pass of its own; the video frame, drawn at its own size,
   does not change.
3. **A rotation by whole turns is no rotation.** `rotate: 720deg` gives the
   pixels of no rotation on every subject.
4. **Splitting a text into fragments changes it.** The text split into one
   inline element per letter, with no style at all, differs from the unsplit
   text in 250 pixels (largest channel difference 57); `inline-block` gives the
   same pixels as `inline`.
5. **A stroke trimmed to nothing still draws its caps.** With
   `stroke-linecap: round`, an offset of the whole length leaves 278 pixels of
   two caps; with `butt` it leaves none.
6. **Time.** One change, presentation, and capture of a 1080p frame took a
   median of 119 ms in the Producer and 117 ms in the Player (largest 165 ms
   and 177 ms), nearly all of it the capture of a PNG (the unchanged frame:
   98–115 ms); no probe at this size cost noticeably more than another. This is
   a cost of capture, not of playback, and it is informative only.

What the probes do not prove: the Player and the Producer agree here because
the same DOM change is made in both embeddings, so the result says that the
two hosts and their capture treat the feature alike, not that a future mapping
of a schema field to it is right; each pull request measures parity again
(D34). The probes sample one instant; that an animated value is the same at
every time follows from the evaluation of `(composition, timeUs)` (D19). A first
version of the script, run outside the container in Chromium 1243 on the
development host, gave other pixels than the container for 230 of its 236 rows
(and the same verdicts); pixels are a fact of the pinned environment only (D26,
D33.9).

## Decision

> D65: Every animated value of phase five is a row of one table of animatable properties, sampled by the arithmetic of D18 as amended by PR-47, set by one generic keyframe command, and drawn in one fixed order of operations; letters, words, and lines are derived from the text without measuring it, nested compositions map their parent's time by the rule of a video's source time, and an effect enters the schema only on the DOM path the probes found exact, everything else waiting for a pixel path of its own ADR.

### 65.1 The table of animatable properties

An animation's `property` becomes a **property path**: a name of the table
(`opacity`, `position`, `scale`, `rotation`, …) or, for a part of the node
that has its own ID, `<collection>/<id>/<parameter>` (for example
`effects/glow-1/radius`). The animations of a node stay unique per path
(D16.6). The table is data of `@kadrion/schema`, read by the validation, the
runtime, the bus, and `describe_document`; a later step adds rows, never a new
kind of animation. A row states:

- the node types that have the property;
- the **value type**: `number` (a JSON number, D15), `integer`, `permille`
  (an integer from 0 to 1000, as the focus of D63), `vector` (`{ x, y }` of
  numbers), or `color` (`#rrggbb`, three integer channels from 0 to 255);
- its bounds and its neutral value;
- **how the sampled value meets the base value**, one of three modes:
  - `offset`: `base + sample` (D18.4, as `position`);
  - `factor`: `base * sample` (as `scale` and `opacity`);
  - `replace`: the sample is the value; the base is the value without an
    animation;
- for `color`, that each channel is interpolated by D18.3 on its own and
  rounded once, by a rule PR-48 states (D68), after the interpolation.
  Amended by: PR-48 (D68): eased, held within 0 and 255, then
  `floor(c + 0.5)` (D68.4).

The rows, with the step that adds each:

| Path                            | Node types                              | Value                  | Mode      | Neutral  | Step   |
| ------------------------------- | --------------------------------------- | ---------------------- | --------- | -------- | ------ |
| `position`                      | every transformable node                | vector, pixels         | `offset`  | `{0,0}`  | D16    |
| `scale`                         | every transformable node                | vector                 | `factor`  | `{1,1}`  | D16    |
| `opacity`                       | every transformable node                | number 0–1             | `factor`  | 1        | D16    |
| `rotation`                      | every transformable node                | number, degrees        | `offset`  | 0        | PR-48  |
| `origin`                        | every transformable node                | vector of permille     | `offset`  | `{0,0}`  | PR-48  |
| `size`                          | image, video, text box, shape, instance | vector, pixels         | `replace` | the base | PR-48¹ |
| `color`                         | background, text, captions              | color                  | `replace` | the base | PR-48  |
| `crop`                          | image, video                            | four permille insets   | `replace` | 0        | PR-48  |
| `cornerRadius`                  | image, video, shape, instance           | number, pixels         | `replace` | 0        | PR-48  |
| `effects/<id>/<parameter>`      | every visual node, group, scene         | per effect kind        | `replace` | per kind | PR-51a |
| `fill`, `stroke/color`          | shape                                   | color                  | `replace` | the base | PR-52  |
| `stroke/width`                  | shape                                   | number, pixels         | `replace` | the base | PR-52  |
| `trim/start`, `trim/end`        | shape                                   | permille of the length | `replace` | 0, 1000  | PR-52  |
| `geometry`                      | shape                                   | the points of its path | `replace` | the base | PR-52  |
| `mask/geometry`, `mask/feather` | every visual node with a mask           | as the shape's         | `replace` | the base | PR-54  |

¹ Amended by: PR-48 (D68): `size` is a row of images and videos only; a text
box, a shape, and an instance take it with their steps, and an origin offset
lies within −1000 and 1000 (D68.3).

Transforms keep the rule of D16.6 that an animation modifies its base value
(`offset`, `factor`); every other row replaces it, because a colour, a crop, or
an effect parameter has no meaningful sum or product with its base. That is an
amendment of D16.6, which said that an animation "never replaces" its base
value; it takes effect, with an `Amended by` line on D16, in the first step
that adds a `replace` row (PR-48). A fragment of text (65.3) has rows of its
own (`fragment/opacity`, `fragment/offset`, `fragment/scale`,
`fragment/rotation`, `fragment/color`) in the fragment's own time, defined by
PR-49 under the same modes.

### 65.2 One keyframe command

`SetKeyframeValue { animationId, timeUs, value }` sets or inserts the keyframe
at `timeUs` of any animation whose path is a row added by phase five. The
parser checks `value` against the row: its type, its bounds, and its
normalisation (integers and permille exact, pixels as D41.3 rounds an offset,
colours lower-case `#rrggbb`); the inverse is `RemoveKeyframe` for an insertion
and the same command with the previous value for a replacement, as D41.1. The
three commands of D41 stay for `opacity`, `position`, and `scale`, so no
existing tool changes; `SetKeyframeValue` refuses those three paths
(`use-typed-command`), so a property has exactly one command.

D41.1 says no command but `AddKeyframe` has an argument called `value`. The
generic command needs one, because its meaning is the row's: the tool's
description and `describe_document` state, per row, what the value is (an
offset, a factor, or the value itself). This is an amendment of D41.1, made in
the step that first adds the command (PR-48). Easing (PR-47) adds an `easing`
argument to the keyframe commands and `SetKeyframeEasing`; nothing here
decides it.

### 65.3 Fragments of text

- **A letter** is an extended grapheme cluster, segmented by a table of
  Kadrion's own in the runtime, pinned to one Unicode version (phase five,
  question 8); `Intl.Segmenter` is not used, because it depends on the
  browser's ICU. **A word** is a maximal run of characters that are not white
  space, white space being the set of D57. **A line** is a line of the text as
  written, split at a line feed: a text node is not wrapped, so nothing is
  measured.
- The runtime derives the fragments and the values of each fragment at
  `timeUs` into the state; the renderer only writes them (`AGENTS.md`, D22).
- **A node with a fragment animation is rendered in fragments at every instant
  of its lifetime**, one element per fragment of the smallest unit its
  animations use, with or without a value to write. Probe 4 shows why: a text
  split into fragments differs from the unsplit text even at rest, so a node
  that joined its fragments when its animation ended would change its pixels at
  that instant. The price is that kerning and ligatures across fragments are
  lost for the whole lifetime of such a node, and never jump.

### 65.4 Nested time

- A nested composition (a definition, PR-55a) is placed by an instance node
  `{ definitionId, startUs, durationUs, sourceStartUs }`. At scene time `t`
  the instance shows the definition at `sourceStartUs + (t − startUs)`, the
  rule of a video's source time (D49.5), in integer microseconds; the instance
  must fit in the definition (`sourceStartUs + durationUs ≤` the definition's
  `durationUs`, refused otherwise, as D49 refuses a source range).
- Inside a definition the rules of D49 hold as in a scene: clips are nodes,
  order is z-order, lifetimes are in the definition's time, and clip
  transitions (D56, PR-46) join siblings. A definition has no scenes, so no
  scene transitions; its sounds are placed by the same rule of time (D52).
- An instance does not loop its definition in phase five; a host places
  several instances instead.
- Nesting is limited to a depth of 8 instances, and a definition that contains
  itself, directly or not, is refused (`definition-cycle`). An ID inside an
  instance is addressed by the path of instance IDs to it, so every ID stays
  stable (D16).
- An instance is composited as one layer, as a group is (D15): its effects,
  mask, opacity, and blend mode apply to the composited result.

### 65.5 The classification of effects

From the probe record, every effect is in one of three classes:

| Class                     | Effects                                                                                                                                                                                         | Steps         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| CSS filters, exact        | `blur`, `brightness`, `contrast`, `saturate`, `hue-rotate`, `grayscale`, `invert`, `sepia`, `opacity`, `drop-shadow`, and chains of them; `backdrop-filter`, so an adjustment layer is possible | PR-51a        |
| SVG filters, exact        | Gaussian blur, colour matrix (lift, gain, saturation, white balance), component transfer (curves as tables, gamma), morphology, glow, vignette as a gradient mask, a key by channel difference  | PR-51b        |
| Not on the DOM path (D03) | a 3D colour table (LUT), a key by distance from a colour, anything that reads neighbouring frames (motion blur, echo, optical flow)                                                             | a later phase |

Probe 2 decides how an effect at rest is written: **a node writes a filter
whenever it has at least one effect, whatever its values, and writes nothing
when it has none.** An empty list renders byte for byte as today, so the golden
frames of earlier steps stay; an animated effect that passes its neutral value
never jumps by the up to 11 levels that dropping the declaration would cost.
The acceptance of PR-51a, "an effect at its neutral value renders as no
effect, byte for byte", is therefore replaced by "an empty list of effects
renders as no effect, byte for byte"; an effect at its neutral value is stated
to differ by at most what the probes measured.

Probe 5 decides that a trimmed stroke whose visible length is 0 is not drawn
(the renderer hides it), so that round or square caps leave nothing (PR-52).
Probe 3 lets a rotation by whole turns stay a plain number: several turns are
valid and render exactly.

The colour space of SVG filters (`sRGB` or `linearRGB`) is PR-51b's decision
(D72): both are exact, and they give different pixels.

### 65.6 The order of operations on a node

A node is drawn in this order, each step taking the result of the one before;
a later step fills in its part and never moves another:

1. **Content** in the node's own box: an image or video by its `crop`, then
   `fit` and `focus` (D50, D63); a text, in fragments where 65.3 says so; a
   shape; an instance (65.4).
2. **Corner radius**, which clips the box.
3. **Effects**, in the order of the list, in the node's own space (a blur
   spills beyond the box unless D71 decides otherwise).
4. **Mask**, then **matte** (PR-54).
5. **Opacity**.
6. **Transform**: position, scale, and rotation about the origin, then the
   offset or clip of a transition (D56).
7. **Blend mode** with what lies below it, isolated by its scene or group.

This is the order in which CSS applies `filter`, `clip-path` and `mask`,
`opacity`, `transform`, and `mix-blend-mode` to one element, so the renderer
can write a node as one element and its wrapper; where CSS orders two steps
otherwise, the renderer adds an element rather than changing the order.

### 65.7 The owner's input, and the path that renders it

| #   | Need                                                 | Path                                                                                      |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Transitions between adjacent clips                   | CSS `opacity`, `transform`, `clip-path` (inset, circle) on the clip's element (PR-46)     |
| 2   | Rotation, origin, easing, more animated properties   | `rotate` and `transform-origin`; rows of 65.1; the arithmetic of D18 and PR-47 (PR-47/48) |
| 3   | Text in fragments                                    | one element per fragment, values from the runtime (65.3, PR-49)                           |
| 4   | Captions: animated word, pages, outline, shadow, box | the fragments of 65.3; `-webkit-text-stroke`, `paint-order`, `text-shadow` (PR-49/50)     |
| 5   | Vector graphics                                      | inline SVG, `pathLength` trim, gradients; SVG assets as images (PR-52/53)                 |
| 6   | Effects                                              | CSS and SVG filters of 65.5 (PR-51a/b); the third class waits                             |
| 7   | Compositing and nested compositions                  | `mix-blend-mode`, `mask-image`, SVG `mask`, `clip-path`; instances of 65.4 (PR-54/55a)    |
| 8   | A reusable element                                   | an instance of a definition with a template (PR-55b)                                      |
| 9   | Custom HTML for AI authors                           | the sandbox of D23 with a managed clock (PR-56); not probed here                          |
| 10  | AI tools for every new command                       | `SetKeyframeValue` and every command of the steps, each with its tool (D46)               |

### 65.8 The probes as a tool

`tests/probes` is outside the pinned suite and outside `check`; it binds no
report, changes no golden frame, and does not touch Q14. A later step that
needs a primitive the record does not hold adds it to `catalogue.ts`, runs the
probes twice in fresh pinned containers, and commits the new record with that
step; the rule of the roadmap holds that a primitive not in the record does
not enter the schema.

## Alternatives considered

- **One animation kind per new property, with its own command** (as D41) —
  thirteen more commands and tools for the same operation, and a new kind of
  animation in every step.
- **Every new row in `offset` or `factor` mode, as D16.6** — a colour, a crop,
  or an effect parameter has no meaningful sum or product with its base; a
  host would have to compute differences to animate them.
- **Splitting a text into fragments only while its animation runs** — probe 4
  shows that the text would change its pixels when the animation ends.
- **Dropping an effect from the filter at its neutral value** — the frame
  would jump by up to 11 levels where an animation crosses the neutral value
  (probe 2).
- **Measuring text to find words and lines** — depends on fonts and layout,
  which D57.2 already avoided for captions.
- **Canvas or WebGL for effects now** — D03 places them later; every effect the
  roadmap needs in this phase is exact on the DOM path.

## Consequences

- No package changes in PR-45; the runtime build, parity, the golden frames,
  and Q14 are untouched.
- Every later pull request of phase five names the rows of 65.1, the place in
  65.6, and the probe rows it relies on; a primitive outside the record is
  probed first.
- D16.6 and D41.1 are amended in the steps that first need it (PR-48), each
  with an `Amended by` line, on the owner's acceptance of this ADR.
- The acceptance of PR-51a in the roadmap changes as 65.5 states.
- A host must not expect a node to render byte for byte the same with an
  effect at its neutral value as without the effect.

## Verification

- The probe record `docs/spike/motion-probes.json`, from two runs in fresh
  pinned containers, the second against the first (`earlierRecord` holds the
  SHA-256 of the first record, and every row has `sameAsEarlierRecord: true`).
- Each later step's tests: the rows of the table by the schema's tests and the
  bus's, the order of operations by golden frames, the parity gate of D34.
- Not mechanically verified: that a later pull request names the rows and
  probes it relies on (review checklist of phase five).
