# D71 — Effects of CSS filters: schema 0.16

- Status: Accepted — by the project owner on 2026-11-09, after PR-51a was merged
  (PR #71)
- Date: 2026-11-09
- Amended by: PR-51b (D72) on 2026-11-09: five kinds drawn by an SVG filter of their own, written as `url("#kadrion-effect-<id>")` at their place among the CSS functions of 71.4 (D72.1, D72.4)
- Supersedes: —
- Amends: D16 (images, videos, texts, captions, groups, and scenes have
  `effects`), D22 (the `filter` of a node, a group, or a scene), D35 (the step
  from `0.15` to `0.16` and the frozen `0.15` schema), D46 (four tools of
  effects), D56 and D66 (the transition effect `blur-dissolve`), and D65 (65.1:
  the effect rows are animations of the effect itself; 65.6: a blur spills),
  each with an `Amended by: PR-51a (D71)` line
- Related: D04, D17, D18, D33, D39, D54, D59, D67, D68,
  [phase five](../roadmap/phase-5.md) PR-51a

## Context

A host's videos need a stack of effects on a clip, a group, or a whole scene:
a blur that sharpens in, a grade that warms a scene, a shadow under a title,
a hue that turns. D65.5 lists the CSS filters that the probes of PR-45 found
exact in pinned Chromium (`blur`, `brightness`, `contrast`, `saturate`,
`hue-rotate`, `grayscale`, `invert`, `sepia`, `drop-shadow`, and chains of
them, and `backdrop-filter`), and decides that a node writes a filter whenever
it has at least one effect and nothing when it has none (probe 2: a neutral
filter is not the absence of a filter).

What the repository has, read on 2026-11-09 at `main` `0b807ac`: schema
`0.15`, 77 commands, a catalogue of 80 entries, and a runtime build of
189 296 bytes.

## Decision

> D71: Schema `0.16` gives every image, video, text, captions node, group, and scene an ordered list of `effects`, each a CSS filter the probes found exact, with its own parameters and its own animations in scene time. The renderer writes one `filter` of the effects in their order on the element of their holder, and nothing at all for an empty list, so every document of `0.15` renders byte for byte. A transition gains the effect `blur-dissolve`. Four commands edit the effects of a holder.

### 71.1 The kinds and their parameters

An effect is `{ id, kind, …parameters, animations }`. Every number may be a
fraction; every bound is the schema's:

| Kind          | Parameters                                    | Bounds                                                         | CSS                                         |
| ------------- | --------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `blur`        | `radius`                                      | 0 to 1000 composition pixels                                   | `blur(<radius>px)`                          |
| `brightness`  | `amount`                                      | 0 to 10, 1 for none                                            | `brightness(<amount>)`                      |
| `contrast`    | `amount`                                      | 0 to 10, 1 for none                                            | `contrast(<amount>)`                        |
| `saturate`    | `amount`                                      | 0 to 10, 1 for none                                            | `saturate(<amount>)`                        |
| `grayscale`   | `amount`                                      | 0 to 1, 0 for none                                             | `grayscale(<amount>)`                       |
| `invert`      | `amount`                                      | 0 to 1, 0 for none                                             | `invert(<amount>)`                          |
| `sepia`       | `amount`                                      | 0 to 1, 0 for none                                             | `sepia(<amount>)`                           |
| `hue-rotate`  | `angle`                                       | −360 000 to 360 000 degrees                                    | `hue-rotate(<angle>deg)`                    |
| `drop-shadow` | `color`, `opacity`, `offset { x, y }`, `blur` | `#rrggbb`; 0 to 1; −1000 to 1000 pixels each; 0 to 1000 pixels | `drop-shadow(rgba(…) <x>px <y>px <blur>px)` |

The lengths are composition pixels, so they scale with the stage as every
position does. `sepia` is added to the plan's list because the probes found it
exact (D65.5). An `opacity` filter is not a kind: a holder has an opacity of
its own (D16), and a second one would be a second way to say the same.

### 71.2 Animations of an effect

**Deviation from D65.1.** An effect's parameters are not rows
`effects/<id>/<parameter>` among the animations of its holder. Each effect
carries its own `animations`, `{ id, property, keyframes }` with `property`
the name of one of its parameters, at most one per parameter. The schema then
states, per kind, which parameters exist and the bounds of each keyframe value,
and the types stay discriminated unions: a path in a string would leave the
value of a keyframe untyped, and the validator would need a second parser for
paths.

- The keyframes are in **scene time**, as a node's own (D54.1), sampled by the
  arithmetic of D18 with the easing of D67; the sample **replaces** the
  parameter (the `replace` mode of D65.1), held within the bounds of the
  parameter after an overshoot; a colour is interpolated per channel and
  rounded by D68.4; no value is ever `-0`.
- The rules of animations apply per effect: `duplicate-animation-target` and
  `keyframes-not-ascending` (D16.6), at `…/effects/<i>/animations`.
- Every ID is a document ID (D16): an effect ID or an effect animation ID
  taken elsewhere is `duplicate-id`.
- An effect's animation is edited by `SetEffect` with the whole effect;
  `SetKeyframeValue` (D68) does not reach it (`unknown-animation`).

### 71.3 What holds effects

Images, videos, texts, captions, groups, and scenes. A background has none (an
effect on a plain colour is a colour), and neither does Custom HTML, whose
pixels Kadrion does not draw (D05). A group's effects apply to the group as a
whole, after the effects of its children; a scene's apply to the scene as a
whole. The state carries `effects` on those nodes and on every scene, an empty
list where there are none, and no field on a background or Custom HTML.

### 71.4 The renderer

- `cssFilter(effects, transitionBlur)` writes one function per effect in the
  order of the list, then, when a transition blurs its holder (71.5),
  `blur(<radius>px)` last; it returns `null` for no effect and no blur, and
  the renderer then **removes** `filter`, so an empty list renders byte for
  byte as before (D65.5).
- The filter is written on the element of the node, group, or scene, the
  element that carries its opacity and transform, so effects stand where D65.6
  places them: after the content and the corner radius, before opacity and
  the transform.
- **A blur spills beyond the box** of its holder, as CSS draws it; it is not
  clipped. This decides the open point of D65.6.
- Every render writes or removes `filter` on every element it touches, so a
  render after any other render yields the tree of a fresh mount (D54.3).

### 71.5 The blur dissolve

The transition effect `{ kind: "blur-dissolve", radius }`, `radius` from 0 to
1000 pixels, on scenes and on clips: over the eased progress `p` the outgoing
side's blur rises from 0 to `radius`, the incoming side's blur falls from
`radius` to 0 while its opacity rises from 0 to 1; an outgoing clip that lies
above the incoming one also fades from 1 to 0, as a crossfade does (D66). The
blur is written after the holder's own effects (71.4).

### 71.6 Commands and tools

- `AddEffect { ownerId, index, effect }` inserts an effect into the list of a
  node or a scene (`ownerId` either); `RemoveEffect { effectId }` removes it;
  `ReorderEffect { effectId, index }` moves it within its list; `SetEffect
{ effect }` replaces the effect of that ID, its kind, parameters, and
  animations included.
- `unknown-effect` is the one new error code; an owner that takes no effects
  is `unsupported-node`, a taken ID `id-in-use`, an index outside the list
  `index-out-of-range`, the same value no edit, and every other refusal
  `invalid-result` with the validator's errors. Each inverse restores the
  document to its exact text.
- **Derived IDs.** A command that copies a holder (`DuplicateNode`,
  `DuplicateScene`, `SplitClip`) names the effect at index `e` of a copy
  `<owner>-e<e>`, and its animations that ID followed by `-a-<parameter>`, in
  the manner of D39.3. A repeat of a template (D59) gives them the suffix
  `--<k>` as every other ID of the copy.
- **Time.** A command that moves a node in time (`MoveClip`, a repeat's copy)
  moves the keyframes of its effects with it, as its own; a trim moves none.
- The commands are tools (`add_effect`, `remove_effect`, `reorder_effect`,
  `set_effect`, D46); `describe_document` reports the effects of every node and
  scene. The registry has 81 commands and the catalogue 84 entries.

### 71.7 Schema `0.16` and the step from `0.15`

`step015To016` appends `effects: []` as the last key of every image, video,
text, captions node, and group at any depth, and of every scene, and sets
`schemaVersion` to `0.16`. Every other key keeps its place and every value its
bits, and every document of `0.15` renders byte for byte. The frozen
`compositionSchemaV015` reads `0.15` (D35); the compatibility corpus gains
`compatibility/v0-16/` with every fixture migrated and the effects
composition, and the earlier corpora keep their bytes.

### 71.8 What this ADR does not decide

- **The adjustment layer.** **Deviation from the plan:** although the probe
  `backdrop/blur-6` is exact, a `backdrop-filter` reads what lies below it up to
  the nearest backdrop root, and a group with an effect or opacity, a scene
  transition, and a blend mode each make one. Those interactions are not
  probed; an effect on a group or a scene covers the same need now, and the
  adjustment layer moves to compositing (PR-54), which probes them.
- The effects of SVG filters (PR-51b, D72), and anything that reads
  neighbouring frames.

## Alternatives considered

- **Paths `effects/<id>/<parameter>` among the holder's animations,** as D65.1
  planned — see 71.2: an untyped value per path and a second parser.
- **Dropping an effect from the filter at its neutral value** — D65.5: the
  frame would jump by up to 11 levels when an animation crosses it.
- **Clipping a blur to the box** — CSS draws it spilled, and a clip would need
  an element and a `clip-path` of its own; a spilled blur is what a host
  expects of a blur that sharpens in.
- **One command per parameter** — four commands cover every kind; an effect is
  small, and the whole effect is the unit a model writes.

## Consequences

- `@kadrion/schema`: schema `0.16`, the types `Effect` and `EffectAnimation`,
  the `blur-dissolve` transition, the frozen `0.15` reader, and the step.
- `@kadrion/runtime`: `effectsAt`, `EFFECT_BOUNDS`, `EffectState`, and the
  `blur` of a transition state. The runtime build grows to 201 587 bytes; its
  hash changes, so the golden frames are written again and parity is measured
  again.
- `@kadrion/renderer-dom`: `filter` on nodes, groups, and scenes.
- `@kadrion/editor-sdk`: four commands and their tool metadata,
  `unknown-effect`, the effects in `describe_document`; `@kadrion/ai-sdk`: four
  tools and the catalogue's snapshot. The change of the API is additive (new
  exports) and breaking (new required fields of schema `0.16`, the states'
  `effects`).
- `@kadrion/test-fixtures`: the effects composition (640×360, 2.2 s, three
  scenes: every kind over an image, a text, a video, a group, and a scene,
  animated; a blur dissolve between scenes and between clips; and every kind
  at rest over an image, a text, and a video), its 6 golden frames, the `0.16`
  corpus, and every fixture at `0.16`.
- **Player time.** The probes measured a blurred 1080p video at 180 ms per
  frame in the Player and 125 ms in the Producer (`blur-4`), and 199 ms and
  148 ms (`blur-12.5`) (`docs/spike/motion-probes.json`). A heavy blur on a
  1080p video previews below real time; this is a finding, not a failure,
  since the Producer is the reference.
- Q14 stays open: a new pinned test and its report are added.

## Verification

- Unit tests of the runtime (`packages/runtime/test/effects.test.ts`): values
  at rest, linear and eased sampling in scene time, drop-shadow parameters,
  bounds after an overshoot, no `-0`, the bounds of `EFFECT_BOUNDS` against
  the schema, every kind present over an image, a text, and a video, and the
  blur dissolve of scenes and clips.
- Unit tests of the renderer (`packages/renderer-dom/test/effects.test.ts`):
  the filter text of every kind and the transition blur last, no filter for an
  empty list, the filters in the tree, and the same tree after any order of
  renders.
- Unit tests of the commands, their undo byte for byte, their refusals, the
  derived IDs of copies, and the keyframes moved with a clip
  (`packages/editor-sdk/test/effects.test.ts`), of the tools, and of repeats
  of a template.
- Negative fixtures for every new field and rule; the step 0.15 → 0.16 has its
  migration pair and the invalid corpus of `0.15`.
- In pinned Chromium (`tests/pinned/effects.pinned.test.ts`): every kind
  changes the pixels of an image, a text, and a video; a blur spills beyond the
  box; the order of effects matters; a node moved in time with its effects'
  keyframes gives the same frames; and the frames of the effects composition
  meet their 6 golden frames. The existing golden PNG files stay byte for byte.
- Parity of the Player against the Producer measured again.
