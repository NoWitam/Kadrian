# D63 — The focus point of images and videos: schema 0.10

- Status: Proposed
- Date: 2026-11-03
- Supersedes: —
- Amends: D35 (the step from `0.9` to `0.10` and the frozen `0.9` schema),
  D46 (one tool more, 63 in all), and D50 (50.1: `contain` and `cover` place
  the picture by its focus, no longer always at the centre), each with an
  `Amended by: PR-39b (D63)` line
- Related: D15, D16, D17, D22, D42, D49, D51, D62,
  [roadmap of phase four](../roadmap/phase-4.md) PR-39b (question 4: yes)

## Context

Since D50 an image or a video meets its box by `fit`: `fill`, `contain`, or
`cover`, mapped to CSS `object-fit`. `contain` and `cover` always centre the
picture, because the renderer sets no `object-position` and its initial value
is `50% 50%`. A host editor that puts a portrait photo into a wide box with
`cover` therefore always crops the top and the bottom alike; the user cannot
keep the face in frame without leaving `cover`. Since D62 the host knows the
size of an image, so it can show the user which part a crop keeps, but it
could not say which part to keep.

The owner answered question 4 of the plan of phase four with yes (2026-11-03):
`focus` comes in schema `0.10`.

## Decision

**63.1 The field.** Schema `0.10` gives every image node and every video node a
required field `focus`, right after `fit`: a closed object `{ x, y }` of
integers from 0 to 1000, in per mille of the width and the height of the
picture (D15: persistent values are integers). `x` is measured from the left
edge, `y` from the top edge; `{ x: 500, y: 500 }` is the centre. There is no
default and no optional form (D16.1): a document states the focus of every
picture, as it states its fit. Per mille gives a step of a tenth of a percent,
finer than one pixel of a picture up to 1000 pixels wide and close to one for
the 1920 pixels of the largest canvas; a finer unit would only add digits no
editor can set by hand.

**63.2 What it means.** The focus point of the picture lies at the same
fraction of the box: the point at `x` per mille of the picture's width lies at
`x` per mille of the box's width, and the same for `y`. The renderer writes it
as `object-position: <x/10>% <y/10>%`, each number as ECMAScript
`Number::toString` like every number of D22.1 (`333` is `33.3%`). That is the
CSS meaning of a percentage of `object-position`, so the browser of the Player
and the pinned Chromium of the Producer place the picture by one rule, and the
video frames, which both hosts give to the same image element (D50.4, D51),
are placed exactly as an image.

The rule keeps the focus point in frame whatever the sizes: under `cover` the
picture is at least as large as the box on both axes, and the point at a
fraction `f` of the picture lands at the fraction `f` of the box, inside it.
`{ x: 0, … }` keeps the left edge, `{ x: 1000, … }` the right edge. A focus
that centred the box on the point and clamped at the edges was considered: it
keeps the point in the middle where it can, but it needs the picture's size in
the renderer, which the document does not hold (D49.6: media facts stay out of
the document), and it is not what CSS draws; the rule of CSS needs neither.

**63.3 Under each fit.** The focus applies to every fit, with no exception in
the schema or the renderer:

- `cover`: it chooses which part of the picture is cropped away;
- `contain`: it chooses where the picture sits in its box, and so where the
  bars are (`{ x: 500, y: 1000 }` puts a wide video at the bottom of a tall
  box);
- `fill`: the picture is the box, so every focus places it the same: no pixel
  changes. The field stays, so that a later change of the fit keeps the
  user's focus.

**63.4 The command.** `SetNodeFocus { nodeId, focus: { x, y } }` sets the focus
of an image or a video and keeps the key in its place; its inverse restores the
focus it replaced, and setting the focus a node has is a no-op. A coordinate
that is not an integer from 0 to 1000 is `invalid-argument`: nothing is rounded
or clamped, and the tool's input schema states the bounds as integers, read
from the composition schema. Another node is `unsupported-node`, an unknown ID
`unknown-node`. The tool `set_node_focus` follows from the command registry
(D46): 63 tools in all.

**63.5 Not animated.** `focus` is no animated property in `0.10`: a pan inside
`cover` would need keyframes of a value object and an interpolation of a field
that is not a transform, and no host has asked for it yet. A later schema can
add it as an animated property without changing the meaning of the static
field.

**63.6 The step and the evidence.** The step from `0.9` to `0.10` gives every
image and video, in a scene or a child of a group, `focus: { x: 500, y: 500 }`
right after its `fit`, and changes the version; nothing else moves, no time
value among them (D49.7). The centre is the `object-position` every picture
had, so every document of `0.9` renders byte for byte after the step: the
twenty-two golden frames of the reference, video, transitions, and captions
compositions were written again in the pinned container and came out byte for
byte as committed, and their manifests changed in `render.schemaVersion`,
`render.compositionHash`, and `render.runtime.contentHash` only. The schema of
`0.9` is frozen in `packages/schema/src/v0-9` with its hash, the reference and
negative corpus of `0.9` beside it, a hand-written pair for the step, and the
compatibility corpus gains `v0-10` with an expectation for every input and a
document of its own with an off-centre focus (D43.6).

A new fixture, the focus composition (640x360, 1 s), places the reference
image under `cover` on its left edge and under `contain` in the top right
corner, and the fixture video under `cover` at 850 per mille of its width and
under `contain` at its bottom edge; its golden frames at 0 and 500 000 µs are
committed. `tests/pinned/focus.pinned.test.ts` shows in pinned Chromium that
the edge a focus names stays in frame under `cover` and the centre crops both,
that each of the four pictures differs from its centred self, that `fill`
ignores the focus, and that the frames meet their golden frames.

## Consequences

- The runtime build changes (the schema it holds), and so does the Player's
  dist tree (the renderer writes `object-position`): the parity records of the
  reference and the video rows were measured again in the pinned container.
  The change of `tests/pinned/` (a new file, a new report) keeps Q14 open; it
  closes by the evidence of a later push run of `main`.
- The public surface changes in a breaking way: `ImageNode` and `VideoNode` of
  `@kadrion/schema` require `focus`, `SCHEMA_VERSION` is `0.10`, and
  `SetNodeFocus` is new in `@kadrion/editor-sdk` (API reports in the same
  diff, D60).
- A host that creates an image or a video writes its focus, normally the
  centre; a host that offers a focus control writes it with `SetNodeFocus` and
  can draw the kept part from the image facts of D62.

## Not included

Free cropping to a rectangle, a zoom beyond `cover`, rotation of the source,
masks, an animated focus, and a focus for Custom HTML.
