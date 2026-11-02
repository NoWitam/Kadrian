# D56 — Transitions: schema 0.6, four scene effects, the clip crossfade, and their commands

- Status: Proposed
- Date: 2026-11-01
- Supersedes: —
- Extends: D19 (19.4: a scene of the state carries its transition, the state a
  backdrop), D22 (the scene elements and the stage carry what a transition
  writes), D35 (the step from `0.5`), D46 (five tools), D49 (49.4: a command
  that would break a transition is refused, and what "invisible at progress 0"
  means for each side), and D54 (54.2: the duration rule subtracts the scene
  transitions), each with an `Amended by: PR-32 (D56)` line
- Related: D04, D13, D16, D17, D18, D30, D38, D39, D42, D52, D53, D55,
  [roadmap of phase three](../roadmap/phase-3.md) PR-32

## Context

Studio item 6 of the roadmap needs transitions between scenes and between two
clips of one layer. D49.4 fixed their place: a transition belongs to one
boundary; between two scenes it is the overlap of D49.3, the incoming scene
starting `Tk` earlier; between two clips it names two siblings whose
lifetimes overlap by exactly its duration and adds no time; at progress 0 and
1 it is invisible; no command may leave a dangling boundary; sound plays from
both sides at their own gains. It left to PR-32 the kinds, the fields, where a
scene transition is stored, and the commands.

What the repository has, read on 2026-11-01 at `main` `2959915`: schema
`0.5` with scenes in sequence (D54), whose start is derived from the order
and the durations by `scenePlacements`, already written with a `Tk` of 0
(D49.3); a runtime that evaluates every scene whose interval holds `t` and a
renderer that mounts every scene, hides those not evaluated, and stacks them in
document order (D54.3); a Producer and a Player that place videos and sounds
by the same placements (D50, D52, D53); and 45 commands in the closed registry
(D55).

## Decision

> D56: Schema `0.6` adds transitions: the composition's `transitions` between adjacent scenes, with one of four effects (`crossfade`, `fade-through-color`, `slide`, `wipe`), and each scene's `transitions` between two sibling nodes, with the one effect `crossfade`; each effect is a pure linear function of its progress that leaves the outgoing side alone at progress 0; five commands add, remove, resize, and change them; and every other command that would break one is refused.

### D56.1 Schema `0.6`

- The composition gains `transitions`, after `clips`, the last key: a list of
  **scene transitions** `{ id, fromSceneId, toSceneId, durationUs, effect }`.
- Each scene gains `transitions`, after `clips`, its last key: a list of
  **clip transitions** `{ id, fromNodeId, toNodeId, durationUs, effect }`.
  Two clips are two nodes (D49.1), so a clip transition names nodes; an audio
  clip has no transition (its fades are D52's).
- `durationUs` is an integer from 1 to `2^53 − 1` (D04). Both lists may be
  empty. IDs share the namespace of every other ID (D16.3).
- A scene effect is one of, by `kind` (D17's `oneOf` with a tag):
  - `{ kind: 'crossfade' }`;
  - `{ kind: 'fade-through-color', color }`, `color` a `#rrggbb` as
    elsewhere;
  - `{ kind: 'slide', direction }` and `{ kind: 'wipe', direction }`,
    `direction` one of `left`, `right`, `up`, `down`: the way the incoming
    scene, or the edge that uncovers it, moves.
- A clip effect is `{ kind: 'crossfade' }` only. A node's box is not the
  frame, so a slide or a wipe of a clip would need a frame the document does
  not state; a later ADR may add one.
- Transitions are listed in the document's order of insertion; the order has
  no meaning beyond the place an inverse restores (D56.6).

### D56.2 Placement and the duration rule

- Placement is D49.3's with `Tk` the `durationUs` of the scene transition
  whose `fromSceneId` and `toSceneId` are scenes `k` and `k + 1`, or 0:
  `start(k + 1) = start(k) + Dk − Tk`. `scenePlacements`, `scenesAt`, and the
  new `sceneTransitionAt` of `@kadrion/schema` take the scenes and the
  transitions, so the runtime, the Producer, the Player, and the bus place
  scenes, videos, and sounds by one function.
- The duration rule of D54.2 becomes `durationUs = ΣD − ΣT`, computed in
  `BigInt` so that no intermediate sum leaves the safe integers; a mismatch is
  still `composition-duration-mismatch` at `/durationUs`.
- A clip transition adds no time and moves nothing (D49.4): the two lifetimes
  are stated as they are.

### D56.3 Validation

New semantic rules, each with its own code (D17), checked in this order for
each transition:

| Code                          | When                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `unresolved-scene-reference`  | `fromSceneId` or `toSceneId` names no scene                                                                                          |
| `unresolved-node-reference`   | `fromNodeId` or `toNodeId` names no node of the transition's own scene                                                               |
| `transition-not-adjacent`     | the incoming scene does not directly follow the outgoing one                                                                         |
| `transition-node-type`        | a side is a `background`, which has no opacity                                                                                       |
| `transition-not-siblings`     | the two nodes are one node, or children of different parents (D49.2)                                                                 |
| `transition-too-long`         | the transition is longer than either side, or the transitions into and out of one side together are longer than it (D49.4)           |
| `transition-overlap-mismatch` | the outgoing clip does not end exactly `durationUs` after the incoming one starts: `from.durationUs − T ≠ to.startUs − from.startUs` |
| `duplicate-transition`        | a side already has a transition at that end, so a boundary would have two (D49.4)                                                    |

Every comparison is made on differences of safe integers, so no end is formed
past `2^53 − 1`.

### D56.4 The step from `0.5`

`step05To06` appends an empty `transitions` to every scene and to the
composition and sets `schemaVersion` to `0.6`. Without a transition the
scenes meet end to end as before, so no time value moves (D49.7). The frozen
`compositionSchemaV05` reads `0.5` (D35); the compatibility corpus gains
`compatibility/v0-6/`, every entry is read by `0.6` too, and the earlier
corpora keep their bytes.

### D56.5 Evaluation and rendering

Progress is `elapsedUs / durationUs`, where `elapsedUs` is the time since the
incoming side started; each value is D18's linear rule
`start + ((end − start) · elapsed) / span`, and exactly `start` at
`elapsedUs = 0`. The incoming scene lies above the outgoing one (D16.4).

| Effect               | Outgoing scene                            | Incoming scene                                                              | Under both                                      |
| -------------------- | ----------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| `crossfade`          | as it is                                  | opacity 0 → 1                                                               | —                                               |
| `fade-through-color` | opacity 1 → 0 over the first half, then 0 | opacity 0, then 0 → 1 over the second half                                  | `color`, from the first instant after the start |
| `slide`              | as it is                                  | offset from one frame width (`left`, `right`) or height (`up`, `down`) to 0 | —                                               |
| `wipe`               | as it is                                  | cut to the part of the frame an edge moving in `direction` has passed       | —                                               |

- The runtime puts the result in the state (D19.4): a scene changed by a
  transition carries `transition: { id, opacity?, offset?, clip? }`, with only
  what the effect changes; the state carries `backdrop` while a
  `fade-through-color` shows its colour. A scene outside a transition, and a
  side the effect leaves as it is, carries no `transition`.
- The renderer writes them on the scene element (D22): `opacity`, a
  `transform: translate(x, y)` in composition pixels, and
  `clip-path: inset(…)`; the stage's `background-color` is the backdrop. A
  scene is composited as one layer, so its opacity fades the scene, not each
  node. Every render removes what a transition wrote before, so the tree is
  that of a fresh mount at the state, in any order of renders.
- **Clip crossfade.** During the overlap the incoming node's opacity is
  multiplied by a factor rising from 0 to 1; the outgoing node's by one
  falling from 1 to 0 only when it lies above the incoming node (a later
  sibling), so that it does not hide it. One below keeps its opacity: the
  incoming node covers it as its opacity rises. Outside the overlap a node has
  no factor.
- **Invisible at progress 0 and 1 (D49.4).** At progress 0 the incoming side
  is fully transparent, entirely off the frame, or cut away entirely, and
  `fade-through-color` shows the outgoing scene whole with no colour: the
  frame is that of the outgoing side alone. At progress 1 the outgoing side is
  no longer evaluated (its interval has ended), and the incoming side carries
  no transition: the frame is that of the incoming side alone.
- **Sound.** No transition changes a gain (D49.4): during a scene transition
  the clips and videos of both scenes play, each at its own volume.

### D56.6 The commands

| Command                 | Arguments                        | Effect                                                                                                                                                   | Inverse                                                     |
| ----------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `AddSceneTransition`    | `index`, `transition`            | inserts it into the composition's list; `durationUs` of the composition falls by its duration                                                            | `RemoveTransition`                                          |
| `AddClipTransition`     | `sceneId`, `index`, `transition` | inserts it into the scene's list; nothing moves                                                                                                          | `RemoveTransition`                                          |
| `RemoveTransition`      | `transitionId`                   | removes a scene or clip transition; a scene transition's duration is given back to the composition                                                       | the matching `Add…Transition` with the same bytes and index |
| `SetTransitionDuration` | `transitionId`, `durationUs`     | a scene transition: the composition changes by the opposite; a clip transition: the outgoing node's `durationUs` by the same, so the overlap stays exact | `SetTransitionDuration` to the old duration                 |
| `SetTransitionEffect`   | `transitionId`, `effect`         | replaces the effect                                                                                                                                      | `SetTransitionEffect` with the old effect's bytes           |

- A transition and an effect are judged by the document's validation, like a
  node of `AddNode` (D39); a failure of these five commands is
  `invalid-result` with the validation's messages. An ID that names no
  transition is `unknown-transition`.
- `DuplicateScene` (D54.5) copies a scene's clip transitions under
  `<newSceneId>-t<i>`, naming the copied nodes; it copies no scene
  transition.
- An edit that changes nothing (the same duration, the same effect bytes) is
  no edit (D30.9).

### D56.7 A command that would break a transition is refused

- Any other command whose result fails one of the rules of D56.3 is refused
  with `transition-in-use`, whose `details` list the IDs of the transitions
  in its way, sorted: removing or reordering a scene or a node a transition
  names, resizing a scene below its transitions, or moving, trimming, or
  splitting a clip so that its overlap is no longer exact.
- **Amends D49.4**, which said such a command removes the transition in the
  same change. The bus records one inverse per command (D30.5), and an inverse
  that restores a removed transition as well would be two commands. A host
  removes the transition first, in the same transaction; its undo restores
  both. This is the rule of D40.4 for an asset in use, applied to
  transitions.

### D56.8 Tools and the description of a document

- Five tools from the metadata of the five commands (D46); the catalogue has
  50 tools. Their descriptions state the effects, the placement rule, and that
  a transition must be removed before what it names.
- `describe_document` shows each scene's `transitions` and the composition's,
  and the derived start of each scene now subtracts the transitions (D54.6).

### D56.9 What this ADR does not decide

- Slide and wipe of a clip, transitions of audio clips, and an effect that
  changes a gain.
- Easing: every effect is linear, like every keyframe (D18).
- Custom shaders, Canvas, or WebGL (D03).

## Alternatives considered

- **Storing a scene transition on its outgoing scene.** It would make a
  transition move with its scene on `ReorderScene`, but then it would name a
  scene it does not own, and the composition's own list states the boundary
  once. D49.4 left this to PR-32; the composition's list is the shape a host's
  timeline reads.
- **Removing a broken transition in the same change (D49.4 as written).** It
  needs an inverse of two commands; see D56.7.
- **A crossfade that fades the outgoing scene too.** Two half-transparent
  layers over each other let the stage show through in the middle, which is
  visible as a dip; fading only the upper layer is the usual crossfade and
  keeps the frame opaque.
- **Showing the backdrop at progress 0.** It would be invisible under an
  opaque outgoing scene but not under one with transparent areas; showing it
  only after the start keeps the frame at progress 0 exactly that of the
  outgoing scene.
- **Effects in fixed-point arithmetic.** D18's rule in binary64 is the one
  every keyframe uses, its start value is exact, and the Player and the
  Producer run the same runtime build; a second arithmetic would gain nothing.

## Consequences

- `@kadrion/schema`: schema `0.6`, the frozen `0.5` reader, the step,
  eight validation codes, `sceneTransitionAt`, and the placements over
  transitions.
- `@kadrion/runtime`: the effects and the clip factors in the state; the
  runtime build hash changes, so the golden frames are written again and
  parity is measured again.
- `@kadrion/renderer-dom`: the scene declarations and the stage's backdrop.
- `@kadrion/editor-sdk`: five commands, two error codes, the refusal of
  D56.7, and `DuplicateScene`'s renaming.
- `@kadrion/ai-sdk`: five tools; the catalogue's snapshot.
- `@kadrion/test-fixtures`: the transitions composition (a 640×360 sequence of
  five scenes with all four scene effects and one clip crossfade), its golden
  frames, the `0.6` corpus, and every fixture at `0.6`.
- The Producer and the Player place videos and sounds by the new placements
  without other change; Q14 is not touched.

## Verification

- Unit tests of placements and of the transition at each instant
  (`packages/schema/test/transitions.test.ts`), of the state of each effect at
  progress 0, in the middle, and after the end, and of the clip factors in both
  orders of the siblings (`packages/runtime/test/transitions.test.ts`), of the
  rendered declarations in any order of renders
  (`packages/renderer-dom/test/transitions.test.ts`), and of the five commands,
  their exact inverses, the refusals, and `DuplicateScene`
  (`packages/editor-sdk/test/transitions.test.ts`).
- Sixteen negative fixtures cover the eight codes; the step 0.5 → 0.6 has its
  migration pair and the invalid corpus of `0.5`.
- Golden frames of the transitions composition in the middle of each effect
  and of the clip crossfade (`tests/pinned/goldens.pinned.test.ts`), and a
  pinned check that the frame at progress 0 equals the outgoing scene alone
  and the frame at the end equals the incoming scene alone
  (`tests/pinned/transitions.pinned.test.ts`).
- Parity of the Player against the Producer measured again.
