# Phase five: motion graphics, effects, and reusable elements

- Status: Accepted as a direction by the project owner on 2026-11-04 (PR-44,
  merged as PR #56), with every recommendation of the questions at the end.
  Accepting this roadmap approves no pull request: each one below is approved
  separately, before it starts and again before its commit and push, with its
  own plan, review, and decisions.
- Starting point: `main` at `5e718fa`. Phase four is complete (PR-37 to
  PR-43, D60 to D64), schema `0.10`, 63 AI tools, released as `v0.2.0`. The
  owner chose on 2026-11-04 that this phase starts only after phase four
  (question 2).
- Authority: `AGENTS.md` and the ADRs in [`docs/adr`](../adr/README.md). This
  document plans; it decides nothing that needs an ADR. Every decision it names
  is a proposal for an ADR from D65 upwards (D60 to D64 belong to phase four),
  which only the owner accepts.
- Predecessor: [phase four](phase-4.md).

## Goal

Give the engine the motion-graphics primitives a host's video editor builds on:
transitions between any two adjacent clips without splitting the film into
scenes, eased keyframes over more properties, rotation about an origin, text
animated by letters, words, or lines, captions whose spoken word is animated,
a stack of effects, vector shapes and imported SVG, blend modes, masks and
mattes, nested compositions with their own time, reusable elements with
inputs, and a Custom HTML element that an AI agent can write reliably, every
one of them edited through the command bus and offered as an AI tool.

Kadrion stays an engine (D01) and owns the schema (D02). The first host is the
Studio module of Taskio; nothing in this repository names it, depends on it,
or knows its tracks, its library of elements, or its domain objects. Where this
document says "the host", it means any application that embeds Kadrion. Ready
made moves (push in, pull out, Ken Burns, fly in) are the host's: they are sets
of keyframes over the primitives this phase adds, not engine features.

## What the host editor needs (owner, 2026-11-03)

The owner's input, in the owner's numbering, and where each item lands. The
mapping approves no scope.

| #   | Need                                                                                    | Pull request            |
| --- | --------------------------------------------------------------------------------------- | ----------------------- |
| 1   | Transitions between adjacent clips of one track, every kind of D56 and new ones         | PR-46                   |
| 2   | Rotation and origin, easing curves, more animated properties (colour, size, crop, …)    | PR-47, PR-48            |
| 3   | Text animated in fragments (letters, words, lines) with a stagger                       | PR-49                   |
| 4   | Captions: an animated spoken word, page entry and exit, outline, shadow, box, safe area | PR-49 (style), PR-50    |
| 5   | Vector graphics: shapes and paths, stroke drawing, imported SVG assets, morphing        | PR-52, PR-53            |
| 6   | Effects on nodes and layers, with animated parameters                                   | PR-51a, PR-51b          |
| 7   | Compositing: blend modes, masks, track mattes, nested compositions with their own time  | PR-54, PR-55a           |
| 8   | A reusable element: a nested template with inputs as a node, its definition swapped     | PR-55b                  |
| 9   | Custom HTML that an AI agent can write reliably                                         | PR-56                   |
| 10  | AI tools for every new command, with descriptions a model understands                   | every command PR, PR-57 |

Outside this phase, as the owner stated: a timeline UI, the host application,
queues or a REST service, 3D scenes (the host renders them outside Kadrion),
choosing AI models, storing versions of projects, and the library of elements.
The host does all of that.

## What the current repository fixes (read on 2026-11-03)

The plan starts from these facts; each is a constraint on a pull request below.

- **Animation.** An animation targets one of three properties, `opacity`,
  `position`, and `scale` (D16.6), with `interpolation: 'linear'` only; values
  between keyframes follow the one rule of D18.3,
  `a + ((b − a) · (t − ti)) / (ti+1 − ti)`, using nothing but `+ − · /`.
  Keyframe values are set by one command per property (`SetOpacityKeyframe`,
  `SetPositionKeyframe`, `SetScaleKeyframe`, D41).
- **Transform.** A node has `position`, `scale`, and `opacity`; scale is about
  the node's own origin, its top-left corner (D15). There is no rotation and
  no anchor. Groups do not nest (D16).
- **Transitions.** A scene transition has four effects; a clip transition
  between two sibling nodes has `crossfade` only, because "a node's box is not
  the frame" (D56.1). The two clips must overlap by exactly the transition's
  duration (D56.3, `transition-overlap-mismatch`); there are no tracks, a
  layer is the z-order (D49.2).
- **Text.** A text node is one run of text with its line breaks; captions are
  broken into lines and pages by the runtime by counting code points, without
  measuring text (D57.2). The highlight of the spoken word is a colour only;
  growing, bouncing, letter-by-letter, and a highlight background were left
  out (D57.9).
- **Templates.** A template is a composition with a `template` section, filled
  by the pure `instantiateTemplate` (D58, D59); the Player and the Producer
  refuse a template. A template cannot be placed inside another document.
- **Custom HTML.** One sandboxed `iframe` per node with `allow-scripts` only
  and a policy `default-src 'none'` (D23.1, D23.2): no fonts, no images, no
  network. Its time is the `kadrion:time` message, acknowledged once the frame
  is drawn (D23.3); CSS animations and `requestAnimationFrame` inside it run
  on the wall clock unless its author drives them from `timeUs`.
- **Rendering.** DOM and CSS in the pinned Chromium (D03, D22, D26); a video
  frame is shown as an image (D51), so CSS and SVG filters apply to it as to
  any element. The Producer is the reference; parity is gated at zero (D34,
  D51.6). Canvas and WebGL are later extensions (D03).
- **Scope lines of `AGENTS.md`.** "Full timeline UI, advanced trimming, color
  grading, or filters" are outside the current scope. Effects (item 6) are
  filters, and curves are colour grading, so they need the owner to change
  `AGENTS.md` first (question 1).

## Rules for every pull request of this phase

The rules of [phase four](phase-4.md#rules-for-every-pull-request-of-this-phase)
hold, with one change the owner made for this phase (2026-11-03):

- **The owner approves each pull request before it starts, and again before
  its commit and push.** This replaces, for this phase, the rule of
  2026-10-31 by which pull requests were started and pushed without asking.
- No test is skipped, no failed run is repeated, and no timeout is raised
  without the owner's prior consent.
- A change of the schema, the runtime, or the DOM renderer changes the runtime
  build, reopens Q14 by the procedure of [the first CI run](../ci/first-run.md),
  and needs the controlled pinned bootstrap of phase three; a change of the
  schema version changes exactly the three fields of the golden manifest of
  D42, each predicted on the host before the run.
- A change of the Player's dist tree needs a parity record measured again in
  the pinned environment; a change of an exported type needs its API report
  (D60) and the words additive or breaking in the description.
- Every new command carries its tool (D46); every new node or asset type
  carries the full extension set of `AGENTS.md`; generated media stay out of
  Git; one schema version per schema change (D35.1), with its step, its pair
  before and after, and its corpus entries (D43).
- Nothing for the host's domain: no field, name, or command refers to a
  Studio, a track of the host, a library, or a project.

Added for this phase:

- **Every visual primitive is probed before it enters the schema.** A CSS or
  SVG feature that a pull request maps a field to must appear in the probe
  record of PR-45 as repeatable byte for byte across two pinned runs and at
  zero difference between the Player and the Producer in the pinned
  environment. A feature that fails the probe does not enter the schema
  without an ADR that states another rendering path or a threshold (D34).
- **Animated values keep one rule.** Every new animatable value, eased or not,
  is sampled by the arithmetic of D18 as amended by PR-47, and every random
  choice comes from a seed stated in the document.
- **Nothing hides in the DOM.** A fragment of text, a mask, or a nested
  composition is derived from the document by the runtime; the renderer only
  writes it (D22, `AGENTS.md`).
- **The release before code.** The owner pushes the tag `v0.1.0` (phase four,
  question 6) before the first pull request of this phase that changes code;
  this phase ends with a release of its own (question 12).

## The pull requests, in order

The owner proposed: clip transitions → animation and easing → text and
captions → effects → compositing → SVG → elements → Custom HTML, with AI tools
growing alongside. The order below keeps that sequence with three changes,
each explained where it happens:

1. A design ADR with rendering probes (PR-45) comes first, as PR-27 did for the
   timeline: eleven schema steps should share one model of animated values,
   fragments, effects, and nested time, and the probes decide which effects
   the DOM path can render deterministically (item 6) before any schema
   names them.
2. Vector shapes (PR-52, PR-53) move before compositing (PR-54), because a
   shape or path mask reuses the geometry of a shape node.
3. Nested compositions (PR-55a) and elements (PR-55b) are one model in two
   steps: an element is a nested composition that is also a template, so
   precomposition of item 7 is the first half of item 8.

| Order | PR     | Subject                                              | Schema | Runtime build | Player dist | Q14 |
| ----: | ------ | ---------------------------------------------------- | ------ | ------------- | ----------- | --- |
|     1 | PR-45  | The motion model and the rendering probes (ADR only) | —      | —             | —           | —   |
|     2 | PR-46  | Clip transitions of every kind                       | `0.11` | yes           | yes         | yes |
|     3 | PR-47  | Easing curves                                        | `0.12` | yes           | yes         | yes |
|     4 | PR-48  | Rotation, origin, and more animated properties       | `0.13` | yes           | yes         | yes |
|     5 | PR-49  | Text styles and text animated in fragments           | `0.14` | yes           | yes         | yes |
|     6 | PR-50  | Animated captions                                    | `0.15` | yes           | yes         | yes |
|     7 | PR-51a | Effects of CSS filters                               | `0.16` | yes           | yes         | yes |
|     8 | PR-51b | Effects of SVG filters                               | `0.17` | yes           | yes         | yes |
|     9 | PR-52  | Vector shapes and paths                              | `0.18` | yes           | yes         | yes |
|    10 | PR-53  | SVG assets                                           | `0.19` | yes           | yes         | yes |
|    11 | PR-54  | Blend modes, masks, and mattes                       | `0.20` | yes           | yes         | yes |
|    12 | PR-55a | Nested compositions                                  | `0.21` | yes           | yes         | yes |
|    13 | PR-55b | Elements: nested templates with inputs               | `0.22` | yes           | yes         | yes |
|    14 | PR-56  | Custom HTML for AI authors                           | `0.23` | yes           | yes         | yes |
|    15 | PR-57  | Showcases, the catalogue, and the release            | —      | —             | —           | —   |

PR-44 is this document. Question 4 asks whether some
steps should be merged.

### PR-45 — The motion model and the rendering probes (ADR only)

- Status: done (PR #58, merged 2026-11-07), with its ADR D65 (accepted by the owner on 2026-11-07). The probes of `tests/probes` ran twice in fresh pinned containers: all 90 candidate primitives are exact (241 rows in `docs/spike/motion-probes.json`). Findings that bind later steps: a filter is written whenever a node has an effect, since a neutral filter is not the absence of one (the acceptance of PR-51a changes as D65.5 states); a text with a fragment animation is always rendered in fragments; a stroke trimmed to nothing is hidden. D16.6 and D41.1 are amended in PR-48.
- **Goal:** one model under the eleven schema steps, and evidence of which
  visual primitives the DOM path renders deterministically, before any schema
  changes.
- **Scope (D65), a design ADR:**
  - **the table of animatable properties:** per node type, which properties
    may be animated, the type of each value, its channels, and how a sampled
    value meets the base value (D16.6, D18.4); a property path names effect
    parameters as well (`effects/<id>/<parameter>`), so later steps add rows
    instead of new kinds of animation;
  - **one keyframe command:** `SetKeyframeValue` with a value checked against
    the table, replacing the per-property commands of D41 for every new
    property (the existing three stay, so no tool changes);
  - **fragments of text:** what a letter, a word, and a line are without
    measuring text (D57.2), and that a node with a fragment animation is
    always rendered in fragments, so that it does not change its shape when
    the animation ends;
  - **nested time:** how a nested composition maps the time of its parent to
    its own, which D49 rules apply inside it, and how deep nesting may go;
  - **the classification of effects:** which effects map to CSS filters,
    which to SVG filters, and which need a rendering path D03 does not have
    yet (for example a 3D colour table), from the probe record;
  - **the order of operations on a node:** transform, crop, effects, mask,
    blend mode, and opacity, written once so that every later step only fills
    in its part.
- **Probes:** a script in `tests/probes`, run in the pinned container by hand
  and outside the pinned suite, renders one small page per candidate
  primitive (rotation, `transform-origin`, each CSS filter, SVG
  `feGaussianBlur`, `feColorMatrix`, `feComponentTransfer`, `feMorphology`,
  `mix-blend-mode`, `mask-image` in alpha and luminance mode, `clip-path` with
  a path, `backdrop-filter`, `paint-order` and `-webkit-text-stroke` on HTML
  text, `text-shadow`, `stroke-dasharray` with `pathLength`), each over an
  image, a text, and a video frame, and records whether two runs give the
  same bytes, whether the Player and the Producer agree to the pixel, and the
  time per frame at 1080p. The record is committed as
  `docs/spike/motion-probes.json`; no media enter Git.
- **Packages and documents:** D65, the probe script and its record; no
  package changes.
- **Acceptance:** every later pull request of this plan names the rows of the
  table and the probe results it relies on; the ADR states, for each item of
  the owner's input, the path that renders it.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames: the
  probes are not part of the pinned suite and change no bound report.
- **Not included:** any schema, runtime, or renderer change.

### PR-46 — Clip transitions of every kind

- Status: done (PR #60, merged 2026-11-07), with its ADR D66 (accepted by the owner on 2026-11-07). Q14 is open until a green push run of main after it. The frame of a clip transition is the canvas in the space of the clips' parent; the colour of `fade-through-color` covers the frame below the lower clip; `zoom` takes `fromScale` (0 to 16) and `iris` a `center` in per mille; the transition at a cut is a helper and a tool that build one transaction. The second reference composition of the acceptance is the clip transitions composition of `@kadrion/test-fixtures`.
- **Goal:** a host whose film is one scene with many clips puts any transition
  of D56 between two adjacent clips of the same layer, and adds it at a cut in
  one undoable step.
- **Scope (D66):**
  - schema `0.11`: a clip transition takes every scene effect (`crossfade`,
    `fade-through-color`, `slide`, `wipe`) and the new kinds of this step;
  - **the frame of a clip transition** is the canvas, which D56.1 lacked: a
    slide moves the incoming node by one canvas width or height, a wipe cuts
    it to the part of the canvas an edge has passed, and the colour of
    `fade-through-color` is drawn over the canvas directly below the lower of
    the two nodes, so that layers under the pair stay visible outside it and
    covered inside it (the ADR decides between the canvas and the union of
    the two boxes);
  - **new kinds for scenes and clips alike:** `push` (both sides move),
    `zoom` (the incoming side scales from a stated factor), and `iris` (a
    circle opens from a stated point); each is a pure function of progress in
    the arithmetic of D18 that leaves the frame of either side alone at
    progress 0 and 1 (D49.4);
  - **a transition at a cut:** two clips that meet end to end have no
    overlap, which D56.3 requires. A helper of `@kadrion/editor-sdk` and its
    tool build one transaction that trims the incoming clip's start earlier
    (or the outgoing clip's end later, or both by half: `alignment` `start`,
    `center`, or `end`) and adds the transition; a clip without enough source
    before or after it is refused with a typed error naming it. One
    transaction, so one undo (D38).
- **Decisions (D66):** the frame of a clip transition; whether
  `fade-through-color` of a clip may cover layers below the pair; the
  parameters of the new kinds; whether the helper is a command with its own
  inverse or a transaction (the recommendation is a transaction, D30.5).
- **Packages and documents:** schema (`0.11`), runtime, renderer-dom,
  editor-sdk, ai-sdk, fixtures, D66; D56.1 amended where it said a clip has
  `crossfade` only.
- **Acceptance:** at progress 0 and 1 every new transition gives the frames
  without it; golden frames in the middle of each kind between two clips of
  the second reference composition; the helper and its undo leave the
  document byte for byte.
- **Impact:** a schema step: the runtime build changes, goldens and parity are
  measured again, Q14 reopens and closes by the evidence of its commit; the
  existing golden PNG files stay byte for byte.
- **Not included:** transitions of audio clips (D56.9), custom shaders, a
  transition that uses an effect of PR-51 (a blur dissolve is added there, as
  a new kind, if question 7 is yes).

### PR-47 — Easing curves

- Status: done (PR #62, merged 2026-11-07), with its ADR D67 (accepted by the owner on 2026-11-07). Q14 is open until a green push run of main after it. The easing belongs to the keyframe the segment starts at; a Bézier is solved by 64 bisection steps; `steps` take `start` and `end`; D18 is amended by a new 18.7, and 18.3 stays the arithmetic of a linear segment. Two deviations from this plan: the typed keyframe commands take no easing argument (a new keyframe inherits the easing before it, and `SetKeyframeEasing` sets one), and the independent table is met within 2^-51 of the progress for the named curves, not within one unit in the last place of the result, which no arithmetic of the parameter reaches near the flat ends of a curve (D67.4).

- **Goal:** keyframes and transitions move with ease, hold, or steps, the
  same in the Player and the Producer.
- **Scope (D67):** schema `0.12` replaces `interpolation: 'linear'` of an
  animation by an `easing` on each keyframe, for the segment that starts at
  it: `linear`, `hold`, `ease-in`, `ease-out`, `ease-in-out`,
  `cubic-bezier { x1, y1, x2, y2 }`, and `steps { count, position }`; a
  transition gains an `easing` of the same set. The step writes `linear` on
  every keyframe, so every document renders byte for byte.
- **Arithmetic:** linear keeps D18.3 exactly. An eased segment computes the
  progress `p = (t − ti) / (ti+1 − ti)`, its eased value `e(p)`, and then
  `a + (b − a) · e(p)`; a cubic Bézier is solved for its parameter by a fixed
  number of bisection steps (for example 40) using `+ − · /` and comparisons
  only, never `Math.pow` or an iteration that stops on a tolerance, so that
  every engine computes the same doubles. The named curves are the cubic
  Béziers of CSS.
- **Decisions (D67):** whether easing belongs to the keyframe or to the
  animation; the number of bisection steps and the proof that the result is
  monotone; `steps` positions (`start`, `end`); whether D18 is amended or
  superseded for eased segments.
- **Packages and documents:** schema (`0.12`), runtime, editor-sdk (an easing
  argument on keyframe commands, `SetKeyframeEasing`), ai-sdk, fixtures, D67;
  D18 amended.
- **Acceptance:** for each curve, the runtime's values at a fixed set of
  progress points equal a table computed independently in `BigInt`-backed
  rationals to within one unit in the last place, and are identical in Node
  and in the pinned Chromium; linear documents keep their state byte for
  byte.
- **Impact:** as PR-46, with new golden frames of eased motion.
- **Not included:** spring and elastic curves (a host can bake them into
  keyframes), expressions.

### PR-48 — Rotation, origin, and more animated properties

- Status: done (PR #64, merged 2026-11-08), with its ADR D68 (accepted by the owner on 2026-11-08). Q14 is open until a green push run of main after it. Rotation is in degrees, bounded by a thousand turns either way and never reduced; the origin is in per mille of the box, a group's box is the canvas, and editing it never moves the position; a colour is eased per sRGB channel and rounded once, halves upwards. Deviations from this plan: `size` is animated on images and videos only (a text has no size, and a Custom HTML element would lay itself out again on every frame), a background gets an `animations` list for its colour, and the probes add two groups (`transform-list`, `picture`), all exact, every neutral row giving the pixels of none.
- **Goal:** a node rotates and scales about a point the user chose, and the
  host animates colour, size, crop, and corner radius as it animates position.
- **Scope (D68):** schema `0.13`:
  - `rotation` (degrees, a JSON number, positive clockwise) and `origin`
    `{ x, y }` (the point of the node's box that position, scale, and
    rotation refer to, in per mille of the box, as the focus of D63) on every
    transformable node; the step writes `rotation: 0` and `origin: { x: 0,
y: 0 }`, the top-left corner of D15, so nothing moves;
  - new rows of the table of D65: `rotation`, `origin`, `size` (`width` and
    `height`), `color` (fill of a background, colour of a text), `crop`
    (an inset of the source of an image or a video, in per mille), and
    `cornerRadius`; colours are interpolated per channel in sRGB and rounded
    to the nearest integer by a stated rule (D15 has `#rrggbb` only);
  - commands `SetNodeRotation`, `SetNodeOrigin`, `SetNodeCrop`,
    `SetNodeCornerRadius`, and `SetKeyframeValue` for the new rows, each with
    its tool.
- **Decisions (D68):** the unit of rotation and whether it is bounded
  (several turns are needed for a spin); the unit of `origin`; whether
  `origin` moves the node when it is edited (a host's handles usually keep
  the node in place, which means a compensating position in the same
  command); the rounding rule of colours.
- **Packages and documents:** schema (`0.13`), runtime, renderer-dom,
  editor-sdk, ai-sdk, fixtures, D68; D15 and D22 amended.
- **Acceptance:** the reference compositions render byte for byte after the
  step; golden frames of a rotation about the centre, a colour animation, an
  animated crop, and a rounded corner.
- **Impact:** as PR-46.
- **Not included:** skew, 3D rotation and perspective (3D is the host's),
  free-form deformation.

### PR-49 — Text styles and text animated in fragments

- Status: done (PR #66, merged 2026-11-08), with its ADR D69 (accepted by the owner on 2026-11-08). Q14 is open until a green push run of main after it. A letter is an extended grapheme cluster by Kadrion's own table of Unicode 17.0.0 (4 531 characters in the runtime build); the outline is drawn outside the glyphs; the random order is a Fisher–Yates shuffle with `mulberry32` from the seed; an accent moves with the node and a split hands the second half its entrance as an accent. Deviations from this plan: the style is on text nodes only, captions get it in PR-50; each part of the style is a `kind` or `none`, as the closed schema has no optional field; a text with an `out` animation cannot be split (`split-not-exact`); the probes gain no group, since the pinned test renders fragments at rest, nested, against the text in one piece, and the box, and `repeat` renders the golden frames twice.
- **Goal:** a title appears letter by letter, word by word, or line by line,
  with a stagger, and text has an outline, a shadow, and a box.
- **Scope (D69):** schema `0.14`:
  - **a text style** shared by text nodes and captions: `stroke`
    `{ color, width }`, `shadow` `{ color, offset, blur }`, and `box`
    `{ color, padding, cornerRadius }`, each optional;
  - **fragment animations** on a text node: `unit` (`letter`, `word`, or
    `line`), `phase` (`in` from the node's start, `out` before its end, or
    `accent` from a stated time), `staggerUs`, `order` (`forward`, `backward`,
    `center`, `edges`, or `random` with a `seed` in the document), and
    keyframes in the fragment's own time over opacity, offset, scale,
    rotation, and colour, with the easing of PR-47;
  - a letter is an extended grapheme cluster by a table of Kadrion's own,
    pinned to one Unicode version (question 8), a word is a run without white
    space as in D57, and a line is a line of the text as written (a text node
    is not wrapped), so nothing is measured;
  - commands `SetTextStyle`, `AddTextAnimation`, `RemoveTextAnimation`, and
    `SetTextAnimation`, each with its tool.
- **Decisions (D69):** the unit of a letter (question 8); that a node with a
  fragment animation is rendered in fragments at every instant, so that
  kerning and ligatures across fragments are lost for the whole lifetime
  rather than jumping when the animation ends; how stroke is drawn (centred
  or outside, from the probes); the pseudo-random order's generator.
- **Packages and documents:** schema (`0.14`), runtime (the fragment table in
  the state), renderer-dom, editor-sdk, ai-sdk, fixtures, D69; D57 amended.
- **Acceptance:** the fragments and each fragment's values at every time
  follow from the document alone and are equal in Node and the pinned
  Chromium; golden frames of each unit and order in mid-stagger.
- **Impact:** as PR-46. The grapheme table enters the runtime build, so its
  size is reported in the review.
- **Not included:** text on a path, measured wrapping, right-to-left and
  vertical text (D57.9).

### PR-50 — Animated captions

- Status: done (PR #69, merged 2026-11-09), with its ADR D70 (accepted by the owner on 2026-11-09). Q14 is open until a green push run of main after it. Deviations from this plan: the bounce is the fragment tracks of D69 in the word's own time, so any property can move; there is no captions placement field — a captions node is placed by its position and size inside the safe area that `describe_document` reports; captions are drawn in pieces only when their style moves a word or draws under one, so every document of `0.14` keeps its pixels.
- **Goal:** the spoken word grows, bounces, is underlined, or gets a box, and
  each page of captions enters and leaves with an animation.
- **Scope (D70):** schema `0.15`:
  - the highlight of D57 becomes a set: `color`, `scale`, `bounce` (keyframes
    in the word's own time, from its `startUs`), `underline`, and `box`;
  - page entry and exit reuse the fragment animations of PR-49 with the unit
    `word` or `line` of the page, anchored at the page's first word and at the
    start of the next page;
  - the text style of PR-49 on captions;
  - **the safe area:** a `safeArea` inset of the composition, which the bus
    and `describe_document` report, and a captions placement inside it; it
    is a frame of reference, not a clip, so nothing outside it is cut;
  - `SetCaptionHighlight`, `SetCaptionPageAnimation`, and `SetSafeArea`, each
    with its tool.
- **Decisions (D70):** whether a scaled or bouncing word may push its
  neighbours (the recommendation is no: a transform does not change the line
  layout of D57.3, so lines and pages stay as they are); whether the safe area
  is document data or a host convention.
- **Packages and documents:** schema (`0.15`), runtime, renderer-dom,
  editor-sdk, ai-sdk, fixtures, D70; D57 amended.
- **Acceptance:** lines and pages are those of D57 for every style; golden
  frames of each highlight and of a page entering.
- **Impact:** as PR-46.
- **Not included:** emoji or images inside captions, karaoke fill across a
  word (a later kind of highlight), transcription (the host's).

### PR-51a — Effects of CSS filters

- Status: done (PR #71, merged 2026-11-09), with its ADR D71 (accepted by the owner on 2026-11-09). Q14 is open until a green push run of main after it. Deviations from this plan: `sepia` is a kind too, since the probes found it exact; an effect's parameters are animated by the effect's own animations (`property` the parameter's name) rather than by paths `effects/<id>/<parameter>` of its holder, so the types stay discriminated unions; a blur spills beyond the box; the adjustment layer moves to PR-54, because a `backdrop-filter` meets groups, transitions, and blend modes as backdrop roots that were not probed; the acceptance is that an empty list of effects renders byte for byte (D65.5). A blurred 1080p video previews at 180 to 199 ms per frame in the Player (125 to 148 ms in the Producer), a finding of the probes, not a failure.
- **Goal:** a node, a group, or a scene carries a stack of effects whose
  parameters are animated.
- **Scope (D71):** schema `0.16`: `effects`, an ordered list of
  `{ id, kind, … }` on every visual node, every group, and every scene, with
  the kinds the probes of PR-45 found exact as CSS filters: `blur`,
  `brightness`, `contrast`, `saturate`, `hue-rotate`, `grayscale`, `invert`,
  and `drop-shadow`; their parameters are rows of the table of D65
  (`effects/<id>/<parameter>`); commands `AddEffect`, `RemoveEffect`,
  `ReorderEffect`, and `SetEffect`, each with its tool.
- **An adjustment layer** (an effect on everything below it in a scene, as
  `backdrop-filter`) is included only if the probes show it exact; otherwise
  an effect on a group or a scene covers the same need.
- **Decisions (D71):** the units and bounds of each parameter; how a blur
  meets the edge of the node's box (clipped or spilled); where effects stand
  in the order of operations of D65.
- **Packages and documents:** schema (`0.16`), runtime, renderer-dom,
  editor-sdk, ai-sdk, fixtures, `AGENTS.md` (question 1), D71.
- **Acceptance:** an effect at its neutral value renders as no effect, byte
  for byte; golden frames of each kind over an image, a text, and a video.
- **Impact:** as PR-46. The time per frame of a blurred 1080p video in the
  Player is reported; a slow effect in the preview is a finding, not a
  failure, because the Producer is the reference.
- **Not included:** effects whose probe failed.

### PR-51b — Effects of SVG filters

- Status: done (PR #74, merged 2026-11-09), with its ADR D72 (accepted by the owner on 2026-11-09). Q14 is open until a green push run of main after it. Deviations from this plan: the kind of lift, gamma, gain, and white balance is `color-grade`, since a matrix is how it is drawn, not what a host writes; the vignette is light from a point over the box (`feDiffuseLighting` in the units of the box) rather than a radial gradient, which a filter cannot hold without an image of its own; only the `amount` of curves animates, the tables are lists. Every filter works in sRGB; the chroma key is a difference of channels, green or blue. The primitives the probes of PR-45 had not covered are added to `tests/probes/catalogue.ts` and measured exact (294 rows in `docs/spike/motion-probes.json`).
- **Goal:** colour correction, glow, vignette, and a basic chroma key, as
  deterministic as the CSS filters.
- **Scope (D72):** schema `0.17`: new kinds rendered as SVG filters inside the
  page: `curves` (a table per channel, `feComponentTransfer`), `color-matrix`
  (lift, gamma, gain, and white balance as one matrix), `glow` (a blurred,
  tinted copy merged under the node), `vignette` (a radial gradient over the
  node), and `chroma-key` (`feColorMatrix` and `feComponentTransfer` with a key
  colour, tolerance, softness, and spill suppression); each in the probe
  record before it enters the schema.
- **Decisions (D72):** the colour space of filters (`sRGB` or `linearRGB`);
  the limit of the chroma key a matrix can express (a key by distance from a
  colour in three dimensions does not fit, a key by channel difference does);
  what is deferred: a 3D colour table (LUT) cannot be expressed by SVG
  filters and needs a pixel path that D03 places later (question 6).
- **Packages and documents:** as PR-51a, D72.
- **Acceptance:** as PR-51a; for the chroma key, golden frames of a generated
  green-screen fixture, produced by the pinned FFmpeg from a committed recipe.
- **Impact:** as PR-46.
- **Not included:** 3D LUTs, keying by machine learning, motion tracking.

### PR-52 — Vector shapes and paths

- Status: done (PR #76, merged 2026-11-09), with its ADR D73 (accepted by the owner on 2026-11-09). Q14 is open until a green push run of main after it. Deviations from this plan: the corner radius of a rectangle lies in its geometry and animates with the `geometry` row, not with `cornerRadius`; a gradient is a fill of shapes only and does not animate (question 9 for shapes; backgrounds later); path commands are absolute only. Every geometry is drawn as one `<path>`, trim and dashes as one dash array over `pathLength="1000"`; a stroke that draws nothing is not written. The primitives the probes of PR-45 had not covered are added to `tests/probes/catalogue.ts` and measured exact (299 rows in `docs/spike/motion-probes.json`).
- **Goal:** rectangles, ellipses, polygons, and paths, filled and stroked,
  drawn on by their stroke, and morphed between compatible paths.
- **Scope (D73):** schema `0.18`: a node `shape` with `geometry` (`rect`,
  `ellipse`, `polygon` with points, or `path` with the commands of SVG path
  data in a closed, parsed form, not a string), `fill`, `stroke`
  `{ color, width, dash, cap, join }`, and `trim` `{ start, end }` in per mille
  of the length, drawn with `pathLength` so that no length is measured;
  rows of the table for fill, stroke, trim, and the points of a geometry;
  morphing interpolates the points of two paths with the same commands in
  the same order, and refuses others with a typed error; commands
  `SetShapeGeometry`, `SetShapeFill`, `SetShapeStroke`, and `SetShapeTrim`,
  each with its tool, and `AddNode` for the new type.
- **Decisions (D73):** the closed form of path data (absolute commands only,
  or relative too); the coordinate space (the node's box, in composition
  pixels); whether morphing between different structures is ever done by the
  engine (the recommendation is no: a host or an AI normalises paths first).
- **Packages and documents:** schema (`0.18`), runtime, renderer-dom (inline
  SVG, D03), editor-sdk, ai-sdk, fixtures, D73.
- **Acceptance:** the full extension set of `AGENTS.md`; golden frames of each
  geometry, a stroke drawn half way, and a morph.
- **Impact:** as PR-46.
- **Not included:** boolean operations on paths, text converted to paths,
  gradients beyond what question 9 decides.

### PR-53 — SVG assets

- Status: done (PR #78, merged 2026-11-09), with its ADR D74 (accepted by the owner on 2026-11-09). Q14 is open until a green push run of main after it. Decisions: the sanitiser refuses and never strips; `svgToShapes` is a pure helper whose nodes `AddNode` inserts in one transaction, not a command, since the bus holds no bytes. Deviations from this plan: the sanitiser is used by the renderer (so the Player and the Producer alike) and the session, not by the bus, which never sees bytes; an `image` asset of media type `image/svg+xml` keeps working, so no document of `0.18` changes meaning; a template input has no `svg` type. What a shape cannot state (dashes in the units of the drawing, a miter limit other than 4, a gradient stroke, a gradient or stroke under a skew, gradients in the units of their bounding box) is refused by `svgToShapes` with `svg-not-convertible`. The pinned reference run and its repeat passed (221 of 221 pinned tests in three passes, the golden frames identical), parity is 0 differing pixels, and the shapes of the badge differ from its image in 1 pixel of their box by more than 48 in a channel.
- **Goal:** the host imports an SVG file, verified by its `contentHash`, shown
  safely, and optionally converted into shape nodes to animate its parts.
- **Scope (D74):** schema `0.19`: an asset type `svg` (D14); a sanitiser of
  Kadrion's own, a pure function in `@kadrion/schema` used by the bus, the
  Player, and the Producer alike, that accepts a closed subset of elements and
  attributes and refuses scripts, event attributes, `foreignObject`, external
  references, and CSS beyond presentation attributes with typed errors naming
  the offence; an image node may show an `svg` asset, rendered as an image
  (an SVG shown as an image runs no script and loads nothing); a pure
  `svgToShapes` of `@kadrion/editor-sdk` turns the subset into `shape` nodes
  of PR-52 in one transaction, so its parts can be animated.
- **Decisions (D74):** refuse or strip what the sanitiser does not accept (the
  recommendation is refuse: a document must not render something other than
  what its bytes say); the subset; whether `svgToShapes` is a command or a
  helper.
- **Packages and documents:** schema (`0.19`), renderer-dom, producer,
  editor-session (facts: the view box), editor-sdk, ai-sdk, fixtures, D74;
  D14 amended.
- **Acceptance:** a hostile corpus (scripts, `xlink:href` to the network,
  `foreignObject`, CSS `url()`) is refused, each with its code; golden frames
  of an SVG asset and of its converted shapes.
- **Impact:** as PR-46.
- **Not included:** SMIL animation inside an SVG asset, fonts inside SVG.

### PR-54 — Blend modes, masks, and mattes

- Status: in review, with its ADR D75 (Proposed). Decisions: a scene or group that holds a node that blends is isolated, and only then, so every document of `0.19` renders byte for byte; a matte follows its own lifetime and transform and lies in the space of its parent, while a mask moves with its node. Deviations from this plan: only a `shape` may be a matte, since the pinned Chromium paints no `<foreignObject>` inside an SVG mask (an image or a text is a mask of kind `image`, or shapes by `svgToShapes`); the animations of a mask are its own list, as an effect's (D71), not rows of the node's animations; the adjustment layer is not included, because its backdrop roots (groups, transitions, masks, blend modes) are still not probed, and it is left to a later step with its own probes.
- **Goal:** a node blends with what lies below it, is masked by a shape, a
  path, or an image, or takes its alpha or luminance from another node.
- **Scope (D75):** schema `0.20`:
  - `blendMode` on every visual node, a closed set of CSS `mix-blend-mode`
    values the probes found exact;
  - `mask` on a node: a shape geometry of PR-52 or an image asset, `mode`
    `alpha` or `luminance`, `inverted`, and `feather`, with animatable
    geometry;
  - **a matte:** a node names a sibling as its matte (`alpha`, `alpha
inverted`, `luminance`, `luminance inverted`); the matte is not drawn by
    itself, as in an editor's track matte. Which node types may be a matte
    is decided by the probes: shapes, images, and text render inside an SVG
    mask; a video or a Custom HTML matte may need another path;
  - commands `SetBlendMode`, `SetNodeMask`, and `SetNodeMatte`, each with its
    tool; a command that would remove a node used as a matte is refused, as
    D56.7 refuses one that breaks a transition.
  - **an adjustment layer** (moved here from PR-51a, D71.8): an effect on
    everything below it in a scene, as `backdrop-filter`, once its backdrop
    roots (groups, transitions, blend modes) are probed.
- **Decisions (D75):** how a blend mode is isolated (a scene, a group); which
  node types may be a matte; whether a matte follows its own lifetime or the
  masked node's.
- **Packages and documents:** schema (`0.20`), runtime, renderer-dom,
  editor-sdk, ai-sdk, fixtures, D75.
- **Acceptance:** `normal` blending and no mask render byte for byte as
  before; golden frames of each blend mode, a feathered mask, and an alpha and
  a luminance matte.
- **Impact:** as PR-46.

### PR-55a — Nested compositions

- Status: in review, with its ADR D76 (Proposed). Decisions: definitions are embedded in the document, not delivered as assets; the depth limit is 8 instances counted from a scene; an instance does not loop; its effects, mask, matte, opacity, and blend mode apply to the definition composited as one layer, and it has a box of its own with a `fit`. Deviations from this plan: the existing commands work inside a definition by its document IDs instead of a `definitionId` argument, since IDs are unique across the document; `ExpandInstance` is added as the inverse of `ConvertToDefinition`, which converts a contiguous run of siblings; a definition holds no video and no Custom HTML.
- **Goal:** a part of a film is built once as its own composition, with its
  own time, and placed as one node, as a precomposition.
- **Scope (D76):** schema `0.21`:
  - a `definitions` section of the document: compositions without assets of
    their own, each with an `id`, a canvas size, a duration, nodes, clips, and
    transitions;
  - a node `instance` `{ definitionId, startUs, durationUs, sourceStartUs,
width, height, fit }`, whose content at scene time `t` is the definition
    evaluated at `sourceStartUs + (t − startUs)`, the rule of a video's source
    time (D49.5); sounds of a definition are placed by the same rule;
  - the evaluation of D19 recurses into instances, with a depth limit and a
    cycle check (`definition-cycle`), and every ID inside an instance is
    addressed by the path of instance IDs, so IDs stay stable (D16);
  - commands `AddDefinition`, `RemoveDefinition`, `ConvertToDefinition`
    (nodes into a definition and an instance in one transaction), and the
    existing commands inside a definition by a `definitionId` argument.
- **Decisions (D76):** definitions embedded in the document or delivered as
  assets (question 10); the depth limit; whether an instance may loop its
  definition; whether effects and masks of an instance apply to it as one
  layer (the recommendation is yes, as a group composites first, D15).
- **Packages and documents:** schema (`0.21`), runtime, renderer-dom,
  editor-sdk, ai-sdk, producer (sounds), fixtures, D76; D16 (groups do not
  nest) and D49 amended.
- **Acceptance:** an instance of a definition renders the same pixels as the
  definition's nodes placed directly, at every golden time; an edit inside a
  definition changes every instance and is undone as one command.
- **Impact:** as PR-46.

### PR-55b — Elements: nested templates with inputs

- **Goal:** a reusable element, for example captions from speech with the
  timed words and the style as inputs, is a node of the document with the
  values of its inputs, and the host swaps its definition in the versions it
  chooses.
- **Scope (D77):** schema `0.22`:
  - a definition may carry a `template` section (D58, D59); an instance then
    carries `inputs`, values checked against the definition's inputs;
  - the instance is evaluated as `instantiateTemplate(definition, inputs)`
    (pure, D58.4), so templates, conditions, and repeats of D59 hold inside an
    element without a second engine;
  - a binding kind for timed words, so that a list input of
    `{ text, startUs, durationUs }` fills the words of a captions node (D57),
    which is what an element "captions from speech" needs;
  - `ReplaceDefinition` gives a definition new bytes and reports every
    instance whose inputs no longer validate; the definition carries the
    `contentHash` the host gave it, so the host knows which version a
    document holds;
  - commands `SetInstanceInput` and `ReplaceDefinition`, each with its tool.
- **Decisions (D77):** what happens to an instance whose inputs no longer fit
  a replaced definition (refuse the replacement, or keep the old values and
  report); whether a document may hold two versions of one element.
- **Packages and documents:** schema (`0.22`), editor-sdk, ai-sdk,
  editor-session (the preview of an element), fixtures, D77; D58 amended.
- **Acceptance:** an element with values renders as `instantiateTemplate` of
  its definition placed directly; replacing a definition and undoing it
  leaves the document byte for byte.
- **Impact:** as PR-46.
- **Not included:** the library of elements, their storage, and their
  versions (the host's, D02).

### PR-56 — Custom HTML for AI authors

- **Goal:** an AI agent writes an HTML/CSS/JS animation that renders the same
  frame at the same time in the Player and the Producer, without knowing the
  internals of the sandbox.
- **Scope (D78):** schema `0.23` if parameters enter the document:
  - **a managed clock** in the shell of D23.2: on `kadrion:time` the shell
    sets the current time of every animation of
    `document.getAnimations()` (CSS animations and transitions, and the Web
    Animations API) to `timeUs`, runs the callbacks of
    `requestAnimationFrame` once with that time, and answers `Date.now`,
    `performance.now`, and `Math.random` from the composition time and a seed
    of the node, so that CSS written for a browser is deterministic without a
    line of protocol code;
  - **fonts:** the font assets the node names enter the sandbox as `data:`
    URLs from verified bytes (D27), which needs `font-src data:` in the
    policy, and nothing else;
  - **parameters:** a closed JSON object on the node, given to the element in
    the time message, so that a template or an element can bind it;
  - **a check tool:** `check_custom_html` renders the element in the sandbox
    at sampled times twice and reports missing acknowledgements, time-outs,
    and frames that differ between the two runs, with a static check for
    network calls, and the catalogue states the time contract with a short,
    tested example.
- **Decisions (D78):** protocol version 2 or a change of the shell only; what
  the managed clock does with `setTimeout` (the recommendation is to refuse
  it in the check, since a timer has no composition time); the size limit of
  `html`; how parameters are typed.
- **Packages and documents:** schema (`0.23` if needed), renderer-dom (the
  shell), editor-sdk, ai-sdk, D78; D23 amended.
- **Acceptance:** a CSS keyframe animation without any script renders the same
  frame at the five golden times in the Player and the Producer; the check
  tool finds a `Date.now` animation that ignores the clock.
- **Impact:** as PR-46; the custom-html parity row is measured again.
- **Not included:** network, storage, or host APIs in the sandbox (D05);
  isolation beyond Chromium (D36, option E).

### PR-57 — Showcases, the catalogue, and the release

- **Goal:** every feature of this phase can be seen in the playground, the
  catalogue of tools reads well to a model as a whole, and the host receives
  a release.
- **Scope:** showcases of each feature, tested by the automated check of
  PR-42; a review of every tool description added in this phase, with a
  fixture of tool calls a model is expected to make for ten common requests
  ("animate this title letter by letter", "put a push between these clips"),
  each checked by `executeTool` against the expected document; the release
  (question 12).
- **Packages and documents:** `apps/playground`, `tests/app`, ai-sdk
  (descriptions only), README, the host guide of PR-43.
- **Acceptance:** every showcase loads without an error; every fixture call
  gives its expected document.
- **Impact:** none on Q14 unless a pinned file changes; no schema change.
- **Not included:** an evaluation of a real model (choosing models is the
  host's).

## Impact on Q14, parity, and golden frames

- **Thirteen pull requests reopen Q14** (PR-46 to PR-56), each by the
  procedure of [the first CI run](../ci/first-run.md) and each closed again by
  the evidence of a green run of its commit. PR-45 and PR-57 do not.
- **The golden PNG files of the earlier pull requests stay byte for byte**
  through every schema step: each step writes its neutral values (`rotation:
0`, no easing but `linear`, no effects, no mask), and the manifest changes
  only in the three fields of D42.
- **New golden frames** come from small fixtures of their own (640×360, as
  `transitions.json`), each with its pinned test file, so `REQUIRED_PINNED_FILES`
  and the Q14 artifact list grow in the same diff.
- **Parity** is measured again in every pull request that changes the Player's
  dist tree. The gate of D34 (zero) holds for every new primitive: a primitive
  that cannot meet it stays out (rules above).
- **The runtime build** changes in every schema step; PR-49 adds a Unicode
  table to it.

## Debts carried into this phase

- From phase four: none; it is complete (question 2).
- Recorded by this plan as deferred: 3D colour tables and keying beyond a
  matrix (question 6), skew and 3D transforms, text on a path, measured text
  wrapping, boolean operations on paths, SMIL in SVG assets, playback rate
  other than 1, and Custom HTML isolation beyond Chromium (D36, option E).

## Questions for the owner, with recommendations

Answered by the owner on 2026-11-04: every question as recommended. Question
1 is carried out with the acceptance of this plan (`AGENTS.md` names phase
five as current and excludes "Full timeline UI, advanced trimming, or 3D
scenes", and D03, which quotes that line, carries an `Amended by` line);
question 2 was answered first (phase four in full first). The other answers
are directions for the ADRs named in them; each ADR is still accepted on its
own.

1. **`AGENTS.md` for this phase.** It excludes "color grading, or filters",
   which effects and curves are. Recommendation: on acceptance of this plan,
   "Current phase" names phase five once phase four is done, and the excluded
   line becomes "Full timeline UI, advanced trimming, or 3D scenes"; D03
   carries an `Amended by` line as in phase three. The rest of the excluded
   list stays.
2. **Phase four and phase five.** Answered by the owner on 2026-11-04: phase
   four is finished in full first, PR-45 included. Phase four was completed
   the same day (`v0.2.0`), so this phase may start on acceptance of this
   plan.
3. **The order.** Recommendation: as in the table, with the design ADR first,
   shapes before compositing, and nested compositions before elements; clip
   transitions stay the first schema step, as the owner asked.
4. **Schema versions.** Thirteen steps from `0.11` to `0.23`, each with its own
   bootstrap and Q14 cycle. Recommendation: keep one step per pull request
   (D35.1), as phase three did; merging pairs (PR-47 with PR-48, PR-51a with
   PR-51b) saves two cycles and makes each review larger.
5. **Easing arithmetic.** Recommendation: easing on the keyframe, solved by a
   fixed number of bisection steps, linear unchanged, so D18 is amended and
   not superseded.
6. **Effects beyond the DOM path.** A 3D LUT and a keyer by colour distance
   need pixel access, which D03 leaves for later. Recommendation: not in this
   phase; curves and the colour matrix cover common corrections, and a
   later phase decides a pixel path (WebGL or a pinned shader in the
   Producer) by its own ADR.
7. **A blur dissolve.** Recommendation: yes, added in PR-51a as a transition
   kind once the blur is probed, so that PR-46 needs no effect.
8. **What a letter is.** Recommendation: an extended grapheme cluster by a
   table pinned in the runtime to one Unicode version, so that an emoji or an
   accented letter animates as one letter and the Player and the Producer
   split it the same way; `Intl.Segmenter` depends on the browser's ICU and is
   not used.
9. **Gradients.** Recommendation: linear and radial gradients as fills of
   shapes and backgrounds, added in PR-52 if the probes are exact, because
   motion graphics use them constantly; otherwise a later step.
10. **Where definitions live.** The owner suggested that Kadrion receives an
    element's resolved definition like an asset. Recommendation: embed
    definitions in the document, each with the `contentHash` the host gave it.
    The document stays the only source of rendering truth and validates
    without a resolver, the Player and the Producer need no new asset path,
    and the host still swaps a definition by one command in the versions it
    chooses. The cost is a larger document when an element is large.
11. **Custom HTML's managed clock.** Recommendation: yes, the shell drives CSS
    and Web Animations from `timeUs`, so that an AI writes ordinary CSS; the
    protocol of D23 stays for authors who need more.
12. **The release of the phase.** Recommendation: `v0.5.0` after PR-57,
    pushed by the owner, as `v0.2.0` after PR-43. The owner approved an
    intermediate `v0.3.0` on 2026-11-08, from `main` after PR-49 (rotation,
    origin, crop, text styles), so that the host can pin them before the
    phase ends; every package is version `0.3.0`. The owner approved a
    second intermediate `v0.4.0` on 2026-11-09, from `main` after PR-51a
    (animated captions and the safe area of PR-50, effects of CSS filters of
    PR-51a, schema `0.16`); every package is version `0.4.0`.
