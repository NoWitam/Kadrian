# D66 — Clip transitions of every kind in the frame of the canvas: schema 0.11

- Status: Accepted — by the project owner on 2026-11-07, after PR-46 was merged
  (PR #60)
- Date: 2026-11-07
- Supersedes: —
- Amends: D35 (the step from `0.10` to `0.11` and the frozen `0.10` schema),
  D46 (a tool that is no command: `add_clip_transition_at_cut`), and D56
  (56.1: a clip transition takes every effect; 56.5: what each effect does to
  an outgoing clip above the incoming one; 56.9: the slide and the wipe of a
  clip are decided), each with an `Amended by: PR-46 (D66)` line
- Related: D04, D16, D17, D18, D19, D22, D30, D38, D49, D55, D65,
  [phase five](../roadmap/phase-5.md) PR-46

## Context

A host whose film is one scene of many clips (the editor of Studio) needs every
transition between two adjacent clips, not only the crossfade D56 allowed. D56.1
kept the slide and the wipe of a clip out because a node's box is not a frame:
the box of an image is not where a slide should start, and two clips of one
layer may have different boxes. D56.9 left the frame to a later ADR. Phase five
also asks for three new kinds, for scenes and clips alike, and for a way to put
a transition on a cut, where two clips meet end to end and have no overlap.

What the repository has, read on 2026-11-07 at `main` `3837211`: schema `0.10`
with D56's four scene effects and the clip crossfade, the clip factor that the
runtime multiplies into a node's opacity, scene transitions written on the
scene elements (D56.5), 63 commands with their tools (D63), the trim commands
of D55, and D65's order of operations, whose step 6 puts the offset or cut of
a transition after a node's own transform.

## Decision

> D66: Schema `0.11` lets a clip transition take every effect of a scene transition, and adds `push`, `zoom`, and `iris` for both. The frame of a clip transition is the canvas, in the space of the clips' parent; each side of a clip transition is mounted in a wrapper of that size, which carries the cut and the colour, while the offset and the scale of the effect come before the node's own transform. An outgoing clip above the incoming one is moved, cut, or faded so that the incoming clip is uncovered. A helper of `@kadrion/editor-sdk` and its tool put a transition on a cut as one transaction.

### 66.1 Schema `0.11`

- One effect schema, `oneOf` by `kind` (D17), serves the composition's
  `transitions` and each scene's: a clip transition takes every effect a scene
  transition takes.
- D56's four kinds keep their fields. Three kinds are new:
  - `{ kind: 'push', direction }`: `direction` as for `slide`;
  - `{ kind: 'zoom', fromScale }`: `fromScale` a number from 0 to 16, the
    scale at which the incoming side starts; a number, like the `scale` of a
    node (D16);
  - `{ kind: 'iris', center: { x, y } }`: the centre of the circle in
    integer per mille of the frame, 0 to 1000 on each axis, like `focus`
    (D63).
- Nothing else changes: the validation rules of D56.3 hold for every kind.

### 66.2 The frame of a clip transition

- The frame of a clip transition is the canvas, `width × height` of the
  composition, at the origin of the space the two clips are placed in: the
  scene for top-level nodes, the group for its children. A slide moves a clip
  by one canvas width or height in that space, and a wipe cuts it to the part
  of the canvas an edge has passed.
- **Chosen over the union of the two boxes.** The canvas is one rectangle a
  host can see, the same for every pair of one layer, and the same as a scene
  transition's frame; the union of two boxes changes with each pair and is
  empty of meaning when one clip is full-frame and the other a small picture.
- A side that the effect moves or scales and does not cut otherwise is cut to
  the frame, so that no part of it shows outside the canvas during the
  transition. A top-level clip is clipped by the stage anyway; a clip in a
  scaled group is not.
- The colour of `fade-through-color` fills the frame directly below the lower
  of the two clips: it covers what lies below the pair inside the frame, as the
  colour of a scene fade covers the stage, and nothing above the pair.

### 66.3 What each effect does

Progress and values follow D56.5: `elapsedUs / durationUs`, D18's linear rule,
exactly the start value at `elapsedUs = 0`. Between scenes the incoming side
always lies above (D16.4); between clips it lies above when it is the later
sibling, and below otherwise.

| Effect               | Incoming side                                         | Outgoing side below                   | Outgoing side above                                                                     |
| -------------------- | ----------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `crossfade`          | opacity 0 → 1                                         | as it is                              | opacity 1 → 0                                                                           |
| `fade-through-color` | as D56.5                                              | as D56.5                              | as D56.5; the colour lies under the incoming side, the lower one                        |
| `slide`              | offset one frame away → 0                             | as it is                              | moves out by one frame in `direction`; the incoming side is cut to the part it has left |
| `wipe`               | cut to the part an edge moving in `direction` passed  | as it is                              | cut to the part the edge has not passed                                                 |
| `push`               | offset one frame away → 0                             | moves out by one frame in `direction` | moves out by one frame in `direction`                                                   |
| `zoom`               | opacity 0 → 1, scale `fromScale` → 1 about the centre | as it is                              | opacity 1 → 0                                                                           |
| `iris`               | cut to a circle about `center`, radius 0 → the reach  | as it is                              | cut to the frame outside that circle                                                    |

- An outgoing scene is always below, so the left two columns are what the
  three new kinds do between scenes.
- The **reach** of an iris is `max(x, W − x) + max(y, H − y)`, in pixels of
  the frame: the sum of the two largest distances along the axes, which is at
  least the distance to every corner, so the circle holds the whole frame at
  the end without a square root.
- **Invisible at progress 0 and 1 (D49.4).** At progress 0 the incoming side is
  transparent, one frame away and cut to the frame, cut away entirely, or a
  circle of radius 0, and an outgoing side carries nothing at all: every effect
  that changes it starts after the first instant, as the colour of D56.5 does.
  At progress 1 the outgoing clip's lifetime and the transition have ended
  (D56.3), so the incoming side carries nothing.

### 66.4 State and rendering

- The state of a scene transition (D19.4) gains `zoom: { factor, center }`
  and `circle: { x, y, radius }`. The state of a node that is a side of a clip
  transition gains `transition: { id, offset?, zoom?, clip?, circle?, hole?,
backdrop? }` with only what the effect does besides its opacity, which
  stays a factor of the node's own (D56.5); `hole` is the frame less a circle.
- The mount wraps each side of each clip transition of a scene in an element
  `data-kadrion-clip-frame="<nodeId>"`, the size of the canvas at the
  parent's origin, with no other style. A render writes its `clip-path`
  (`inset`, `circle`, or an even-odd `path` for a hole) and its
  `background-color` during a transition and removes them otherwise, so the
  tree is that of a fresh mount at the state in any order of renders (D22).
  A node outside a transition is drawn as before: an unstyled wrapper creates
  no stacking context and changes no pixel.
- The offset and the zoom of a transition are written before the node's own
  transform, `translate(offset) translate(c) scale(f) translate(−c)`, so they
  act in the parent's space after the node's own transform, as D65.6 (step 6)
  orders; the cut on the wrapper is in that space too. A scene transition
  writes the same on the scene element.
- The runtime build changes; the existing golden frames stay byte for byte,
  because a node outside a transition renders as before.

### 66.5 A transition at a cut

- `clipTransitionAtCut(document, { transition, alignment })` of
  `@kadrion/editor-sdk` reads the document and returns the commands of one
  transaction: `TrimClipStart` of the incoming clip when it starts earlier,
  `TrimClipEnd` of the outgoing clip when it lasts longer, and
  `AddClipTransition` at the end of the scene's transitions. The host
  dispatches them with `dispatchTransaction`: one step, one undo, and the undo
  leaves the document byte for byte (D30.5, D38).
- `alignment` is `start` (the transition starts at the cut; the outgoing clip
  lasts `durationUs` longer), `end` (it ends at the cut; the incoming clip
  starts `durationUs` earlier), or `center` (the incoming clip starts
  `floor(durationUs / 2)` earlier and the outgoing one lasts the rest longer).
- It is a helper, not a command. A command would need an inverse of its own,
  which the three commands already have; a transaction of them is undone by
  their inverses (the recommendation of the plan).
- Refusals, each changing nothing: `invalid-argument` for arguments other than
  its schema states; `unknown-node` for a clip the document lacks;
  `not-a-cut` (new) when the outgoing clip does not end exactly where the
  incoming one starts in the same scene; `no-room-at-cut` (new) when the
  incoming clip would start before its scene or the outgoing one end past
  `2^53 − 1`. A clip without enough source before or after it is refused by
  the bus with `source-range-exceeded`, whose details name it (D49.6), and
  everything else the bus refuses for the commands, as for each alone.

### 66.6 Tools

- `add_clip_transition_at_cut` runs the helper on the bus's document and
  dispatches its commands as one transaction. Its input schema is the
  helper's, exported as `clipTransitionAtCutArgumentsSchema`. It stands
  between the command tools and `run_transaction`; the catalogue has 66
  entries: `describe_document`, 63 command tools, this tool, and
  `run_transaction`. Amends D46, whose catalogue held only the tools of
  commands besides those two.
- The descriptions of `add_scene_transition`, `add_clip_transition`, and
  `set_transition_effect` state every kind, their fields, and the frame.

### 66.7 The step from `0.10`

`step010To011` sets `schemaVersion` to `0.11` and changes nothing else: every
document of `0.10` is one of `0.11`. The frozen `compositionSchemaV010` reads
`0.10` (D35); the compatibility corpus gains `compatibility/v0-11/`, every
entry is read by `0.11` too, and the earlier corpora keep their bytes.

### 66.8 What this ADR does not decide

- Transitions of audio clips and an effect that changes a gain (D56.9).
- Easing of a transition (PR-47), a blur dissolve (PR-51), custom shaders,
  Canvas, or WebGL (D03).
- A frame other than the canvas.

## Alternatives considered

- **The union of the two boxes as the frame.** See 66.2.
- **Cutting the node element itself.** A `clip-path` on the node is applied
  before its own transform (D65.6), in its own box, so it would cut in the
  node's space, not the frame's; the wrapper puts the cut in the parent's
  space without changing the order.
- **Wrapping every node.** It would change the tree of every document and
  every existing test of it; only the sides of clip transitions need the
  wrapper, and they are known at mount.
- **A command `AddClipTransitionAtCut` with its own inverse.** See 66.5.
- **An iris radius with a square root.** `Math.sqrt` is correctly rounded, but
  the sum of the two distances needs none and only makes the circle grow a
  little faster.

## Consequences

- `@kadrion/schema`: schema `0.11`, the frozen `0.10` reader, the step, and
  the type `TransitionEffect` that both kinds of transition use.
- `@kadrion/runtime`: the effects of both layer orders, the frame cut, the
  backdrop on the lower side, and the new state; the runtime build hash
  changes, so the golden frames are written again and parity is measured
  again.
- `@kadrion/renderer-dom`: the frames of clip transitions and the new
  declarations; the element of a side of a clip transition has its frame as
  its parent.
- `@kadrion/editor-sdk`: the helper, its schema, and two error codes.
- `@kadrion/ai-sdk`: one tool; the catalogue's snapshot.
- `@kadrion/test-fixtures`: the clip transitions composition (640×360, four
  scenes: every kind between clips in both layer orders, a slide in a scaled
  group, and the three new scene kinds), its 18 golden frames, the `0.11`
  corpus, and every fixture at `0.11`.
- Q14 reopens: the pinned transitions test and its reports change.

## Verification

- Unit tests of every kind in both layer orders, the frame cut, the colour on
  the lower side, nothing on the outgoing side at progress 0, and the new
  scene kinds (`packages/runtime/test/clip-transitions.test.ts`); of the frames
  and the declarations in any order of renders
  (`packages/renderer-dom/test/clip-transitions.test.ts`); of the helper, its
  three alignments, its undo byte for byte, and its refusals
  (`packages/editor-sdk/test/cut.test.ts`); and of the tool as one transaction
  (`packages/ai-sdk/test/tools.test.ts`).
- Negative fixtures for the new fields; the step 0.10 → 0.11 has its migration
  pair and the invalid corpus of `0.10`.
- In pinned Chromium (`tests/pinned/transitions.pinned.test.ts`): every clip
  transition at progress 0 equals the frame without its incoming clip, and at
  its end the frame without the transition, in both layer orders and in the
  group; each new scene kind shows the outgoing scene alone at progress 0 and
  the incoming one at its end; and the 18 frames in the middle of each kind
  meet their golden frames. The existing golden PNG files stay byte for byte.
- Parity of the Player against the Producer measured again.
