# D76 — Nested compositions: schema 0.21

- Status: Accepted — by the project owner on 2026-11-10, after PR-55a was merged
  (PR #82)
- Date: 2026-11-10
- Supersedes: —
- Amends: D16 (an instance places a definition's nodes; groups still do not
  nest), D35 (the step from `0.20` to `0.21` and the frozen `0.20` schema),
  D49 (an instance's time follows the rule of a video's source time) and D65
  (65.4: the commands inside a definition are addressed by document IDs, not
  by a `definitionId` argument), each with an `Amended by: PR-55a (D76)` line
- Related: D15, D19, D30, D39, D46, D49, D52, D54, D56, D58, D65, D71, D75,
  [phase five](../roadmap/phase-5.md) PR-55a

## Context

An editor builds a part of a film once and uses it again: a lower third, a
card with a photo and a title, a badge that turns. Today the only way is to
copy the nodes, and an edit has to be made in every copy. A precomposition,
a composition placed as one layer with its own time, is how motion-graphics
tools solve it, and it is the first half of an element with inputs (PR-55b).

D65.4 fixed the rule of nested time: at scene time `t` an instance shows its
definition at `sourceStartUs + (t − startUs)`, the rule of a video's source
time (D49.5), it does not loop, nesting is limited, a cycle is refused, an ID
inside an instance is addressed by the path of instance IDs to it, and an
instance composites as one layer.

What the repository has, read on 2026-11-10 at `main` `29a3ff3`: schema
`0.20`, 88 commands, a catalogue of 91 entries, a runtime build of 273 872
bytes.

## Decision

> D76: Schema `0.21` adds a `definitions` section of the document, compositions built once with their own canvas, duration, nodes, clips, and clip transitions, and a node `instance` that places one as a single layer at `sourceStartUs + (t − startUs)`, fitted to its box. Inside an instance every ID is its path of instance IDs, nesting is at most 8 deep, and a cycle is refused. The existing commands work inside a definition by its document IDs; `AddDefinition`, `RemoveDefinition`, `ConvertToDefinition`, and its inverse `ExpandInstance` are new. Every document of `0.20` renders byte for byte.

### 76.1 Definitions

`definitions` is an array of the document, after `transitions` and before
`template`. A definition is `{id, width, height, durationUs, nodes, clips,
transitions}`:

- `width` and `height` are its canvas, in its own pixels, within the bounds of
  the composition's canvas; `durationUs` is how long it lasts, at least 1.
- `nodes` are the nodes of a scene less `video` and `custom-html`: a video
  needs the frame plan of the Producer per placed source (D51), and a Custom
  HTML element is one isolated frame per node (D23), neither of which this
  step multiplies. Array order is the z-order, every time is definition time
  from 0.
- `clips` are audio clips in definition time (76.5); `transitions` are clip
  transitions between siblings of the definition (D56, D66), whose frame is the
  definition's canvas. A definition has no scenes, so no scene transitions, and
  no effects of its own: an instance carries them (76.2).
- A definition holds no assets; its nodes name the assets of the document.

Definitions are embedded in the document (question 10 of the plan): an asset
is bytes the engine verifies (D14), and a definition is structure the
validator, the commands, and the AI tools must read. A host that shares one
across documents copies it, as it copies a scene.

### 76.2 The instance node

`instance` is `{id, type, startUs, durationUs, position, scale, rotation,
origin, opacity, animations, definitionId, sourceStartUs, width, height, fit,
effects, mask, matte, blendMode}`:

- At time `t` of what holds it, it shows its definition at
  `sourceStartUs + (t − startUs)`; outside its lifetime it is not active and
  is evaluated at the nearest instant of it, as any node is (D42.3).
  `sourceStartUs + durationUs` is at most the definition's `durationUs`
  (`instance-exceeds-definition`, compared as a difference). It does not loop;
  a host places several instances instead (D65.4).
- `width` and `height` are its box. `fit` places the definition's canvas in
  it: `fill` stretches it, `contain` shows all of it and `cover` fills the box,
  both keeping the aspect ratio and centred. The box cuts what lies outside it.
- It is a transformed node: its position, scale, rotation, origin, opacity,
  and their animations are those of every node (D15, D68).
- It composites as one layer, as a group does (D15, D65.4): its effects, mask,
  matte, opacity, and blend mode apply to the definition composited as one
  picture, and a node inside that blends blends with the definition only.
- An instance lies in a scene or in a definition, never in a group: groups do
  not nest (D16), and an instance is itself a group of its definition's nodes.

### 76.3 IDs inside an instance

Inside an instance every ID of its definition — of a node, an animation, an
effect, a clip, and a transition — and every reference to a node of it — a
matte's `nodeId`, a transition's `fromNodeId` and `toNodeId` — is the path of
instance IDs to it, joined by `/`: `card-left/card-title`, or
`card-left/card-badge/badge-square` through an instance inside another. The
definition keeps its own ID, and assets are named as the document names them.

An ID of the document never holds a `/` (D16.3), so a path names one placed
entity and never collides with an ID of the document, and it is stable: it
changes only when an ID on the path changes. The runtime's state, the
renderer's elements, its masks and SVG filters, and the audio plan's entries
use these paths. The document itself stores plain IDs, unique across the
document, scenes and definitions alike; `instanceDefinition` gives the
definition an instance places with its paths.

### 76.4 Depth and cycles

A definition that places itself, directly or through other definitions, is
refused with `definition-cycle` at each definition on the cycle; a definition
that only reaches one is not named. Counted from a scene, at most 8 instances
hold each other (`MAX_INSTANCE_DEPTH`); a definition that would nest deeper
when placed is refused with `definition-too-deep`. An instance of a
definition the document does not have is refused with
`unresolved-definition-reference`. A depth of 8 is far beyond what an editor
nests and bounds the work of a frame.

### 76.5 Sounds

An audio clip of a definition is heard wherever an instance shows it, once per
instance, by the same rule of time: definition time `d` is heard at
`startUs + (d − sourceStartUs)` of what holds the instance. A clip is cut to
the part the instance shows. A clip the instance starts inside drops its
fade-in, and its source start and lifetime move on by the part cut away; a
clip cut at its end keeps its fade-out within what remains, as a clip at the
end of a scene does (D52, D54). An entry of the audio plan carries the clip's
path (76.3) as its ID.

### 76.6 Templates

A template binds, conditions, and repeats the nodes of scenes only (D58,
D59): a binding into a definition's node would change every instance at once,
which is what PR-55b decides for elements with inputs. The lookups that
resolve a binding read scenes only, so a binding that names a node of a
definition is refused with `unresolved-node-reference`, and the assets a
definition uses are counted as used by no input.

### 76.7 The renderer

An instance is a box of its size with `overflow: hidden` that holds one canvas
of the definition's size, marked with `data-kadrion-instance-content`, fitted
by a transform for `contain` and `cover`, and isolated when a node of the
definition blends (D75.1). The definition's nodes are mounted inside the canvas
as a scene's are, under their paths; their masks and SVG filters are named by
the path, once per instance. The render walks into an instance with the
definition time of its state. A definition's clip transitions are drawn in
frames of the definition's canvas.

### 76.8 Commands

The node, clip, and transition commands find their target among the scenes
and the definitions, by its document ID: an edit inside a definition changes
every instance of it and is undone as one command. A definition's ID is a
`parentId` of `AddNode` and a `sceneId` of `AddSceneAudioClip` and
`AddClipTransition`; `MoveNodeToScene` refuses a node of a definition. This
replaces the `definitionId` argument the plan named: IDs are unique across the
document, so a second address would add nothing but a way to disagree.

- `AddDefinition {index, definition}` inserts a complete definition;
  `RemoveDefinition {definitionId}` removes one, refused with
  `definition-in-use` and the instances' IDs while an instance places it.
- `ConvertToDefinition {fromNodeId, toNodeId, definitionId, instanceId,
index}` moves a run of sibling nodes of a scene or a definition, from the
  lower to the higher layer, into a new definition with the canvas and the
  duration of their holder, and puts one instance of it in their place, which
  shows them as before: from time 0 over the whole holder, filling the canvas,
  untransformed. The nodes keep their IDs and times. A run is contiguous, so
  the z-order of the nodes around it stays. A transition or a matte that would
  join a moved and a staying node is refused (`transition-in-use`,
  `matte-in-use`), as when a node is removed (D56.7, D75).
- `ExpandInstance {instanceId}` is its inverse: it puts the definition's nodes
  in the instance's place and removes the definition, refused with
  `instance-not-expandable` unless the instance shows its definition exactly
  as its nodes placed directly would and no other instance places it. Without
  it the conversion could not be undone as one command.
- `SetNodeFit` takes an instance; `SetBlendMode`, `SetNodeMask`,
  `SetNodeMatte`, and `AddEffect` take an instance as they take a group.
- `describe_document` lists every definition with its canvas, duration,
  nodes, clips, transitions, and the IDs of the instances that place it.
- New codes of the bus: `unknown-definition`, `definition-in-use`, and
  `instance-not-expandable`. 92 commands and a catalogue of 95 entries.

### 76.9 Schema `0.21` and the step from `0.20`

The step from `0.20` inserts `definitions: []` before `template` and changes
nothing else: every document of `0.20` is a document of `0.21` without a
nested composition, and renders byte for byte. The frozen `0.20` schema reads
the old documents, as D35 requires.

### 76.10 Not included

- **Looping an instance**, or playing it at another speed: a host places
  several instances (D65.4).
- **Definitions delivered as assets**: 76.1.
- **Video and Custom HTML inside a definition**: 76.1.
- **Inputs of a definition**: elements, PR-55b.

## Alternatives considered

- **A `definitionId` argument on every existing command.** It doubles the
  address of a node; IDs are already unique across the document (D16.3).
- **IDs of a placed definition renamed with a suffix or a counter.** A counter
  depends on the order of placement and changes when an instance is added; a
  path changes only with the IDs on it.
- **An instance as a kind of group with a `definitionId`.** Groups would nest
  through it, and the group's children would not be its own; a node type of
  its own keeps D16 and states the time rule in one place.
- **No box: the definition's canvas placed at its size.** A host fits a card
  into a slot of another size; the box and `fit` are what an image and a video
  already do (D50, D63).
- **A conversion that is undone by a transaction.** An inverse is one command
  (D30.5); `ExpandInstance` is that command, and also useful on its own.

## Consequences

- `@kadrion/schema`: schema `0.21`, the types `Definition`, `DefinitionNode`,
  and `InstanceNode`, `instanceDefinition`, `definitionTimeUs`,
  `MAX_INSTANCE_DEPTH`, `INSTANCE_PATH_SEPARATOR`, the codes
  `unresolved-definition-reference`, `instance-exceeds-definition`,
  `definition-cycle`, and `definition-too-deep`, the frozen `0.20` reader, and
  the step. The audio plan places the clips of definitions.
- `@kadrion/runtime`: `InstanceNodeState` with its `definitionTimeUs` and its
  evaluated `nodes`.
- `@kadrion/renderer-dom`: the box and canvas of an instance, its nodes, masks,
  and filters under their paths.
- `@kadrion/editor-sdk`: the four commands and three codes, lookups across
  scenes and definitions, `definitions` in `describeDocument`; 92 commands.
  `@kadrion/ai-sdk`: four tools, a catalogue of 95 entries.
- The change of the API is additive (new exports, commands, codes, the
  `definitions` of a description) and breaking (schema `0.21` in
  `SCHEMA_VERSION`; `Command`, `NodeState`, and the node types gain a member;
  a composition gains a key).
- `@kadrion/test-fixtures`: the nested composition (640×360, 2 s: a card of
  320×180 with a background, a photo under a feathered ellipse mask, a title
  with a glow, two bars joined by a crossfade, a turning badge placed inside
  it, and a sound, placed three times — filled, later, and covered, turned,
  faded, and masked — beside a blurred instance of the badge), its 4 golden
  frames, and the `0.21` corpus.
- The runtime build grows to 288 424 bytes; its hash changes, so the golden
  frames are written again (every existing PNG file byte for byte) and parity
  is measured again.
- Q14 stays open: a new pinned test and its report are added.

## Verification

- Unit tests of the schema: the step 0.20 → 0.21 with its migration pair, the
  corpus, and the invalid corpus of `0.20`; the negative fixtures of every new
  code; the types; the paths of `instanceDefinition`; a cycle, a depth of 8
  and of 9; the sounds of definitions placed and cut
  (`packages/schema/test/definitions.test.ts`).
- Unit tests of the runtime (`packages/runtime/test/instances.test.ts`): the
  definition time, the paths, the lifetimes inside, and the same state
  whatever was evaluated before.
- Unit tests of the renderer (`packages/renderer-dom/test/instances.test.ts`):
  the box, the canvas and its fit, the paths, the masks per instance, and the
  same tree whatever was rendered before.
- Unit tests of the commands (`packages/editor-sdk/test/definitions.test.ts`):
  the existing commands inside a definition, each new command and its
  inverse, and the refusals.
- In pinned Chromium (`tests/pinned/nested.pinned.test.ts`): an instance that
  fills its definition's canvas renders the pixels of the definition's nodes
  placed directly, at five times, and the frames of the nested composition
  meet their 4 golden frames. The existing golden PNG files stay byte for
  byte.
- Parity of the Player against the Producer measured again.
