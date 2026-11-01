# D49 — The timeline model

- Status: Accepted — by the project owner on 2026-10-31, after PR-27 was merged
  (PR #13)
- Date: 2026-10-31
- Supersedes: —
- Amends: nothing by itself. It decides the model that D50 to D57 implement;
  each of them amends the ADRs its schema step touches (D14, D16, D18, D19,
  D22, D23, D29, D42) with its own `Amended by` lines.
- Numbering note: PR-28b on 2026-10-31 took D51 for video in the Player, so each later ADR
  this record names is one number higher than written (D52 here is D53, D53 is D54, D54 is
  D55, and "D50 to D57" is D50 to D58); the decision is unchanged
- Amended by: PR-29a (D52) on 2026-10-31: 49.7: the step to `0.4` gives a video node `volume: 0`, not `muted: true`; the schema has no boolean (D52.1)
- Amended by: PR-29b (D53) on 2026-11-01: 49.6: the bus checks the source ranges the audio plan hears against audio facts (D53.4)
- Related: D04, D13, D14, D16, D18, D19, D23, D29, D30, D35, D38, D39, D41,
  D42, D47, [roadmap of phase three](../roadmap/phase-3.md) PR-27 to PR-34b

## Context

Phase three adds video, several audio clips, scenes, transitions, captions,
and templates, in seven schema versions from `0.3` to `0.9`, one per pull
request (D35.1). Each version is a breaking change with a forward migration,
and each reopens Q14. If each pull request decided its own piece of the
timeline, the later ones would find the earlier ones in the way: a scene model
that does not know transitions, a clip that cannot be trimmed, a time base that
changes its meaning twice. This ADR decides the model once, before the first
of those changes, and decides nothing that only one pull request needs.

What the repository fixes, as read on 2026-10-31 at `main` `2ce7dd2`:

- **One scene, one time base.** Schema `0.2` has exactly one scene (D16.2), and
  every time of the document is composition time (D16.5): a node's lifetime
  (D42.2), a keyframe's `timeUs` (D18.2), the time a Custom HTML element is
  pushed (D23.4), and the audio clip's `startUs`. The state is
  `{ timeUs, scenes: [{ id, nodes }] }` (D19.4).
- **Nodes are clips already.** Every node has `startUs` and `durationUs` and is
  shown only while active, a half-open interval (D42.2). Array order is the
  z-order (D16.4), and `ReorderNode` changes it (D39).
- **One audio clip**, in the composition's own list `clips`, played from its
  asset's first sample (D29.6). The Producer refuses an asset that does not
  cover the part of the clip that is heard, with that part counted from the
  bytes and never read from the document (D29.6).
- **No media metadata in the document.** An asset is `{ id, type,
contentHash }`; D14 rejected media type and intrinsic metadata in the entry
  because they are "derivable from the bytes, so [they] could only disagree
  with them".
- **The grid is host-side.** `fps` and the frame grid of D13 are sampling; the
  runtime never reads `fps`, and lifetimes and keyframes need not lie on the
  grid (D42.1, D41.2).
- **Rendering is segmented** (D47): the Producer renders whole segments of the
  composition's grid, and the audio is a pass of its own over the whole
  composition.

The host editor's needs 2 to 9 of the roadmap and the owner's answers to its
questions 5 to 10 (2026-10-30) set the direction: no tracks in the schema
(question 6), a sequence of scenes with local times and their own durations
(question 7), one version per schema pull request (question 8), and video
bytes read by path and by `Blob` (question 11).

## Decision

> D49: A composition is a sequence of scenes, each with a stable ID, its own duration, and nodes whose times are local to the scene; a clip is a node with a lifetime and, for media, a source range; layers are the z-order and nothing else; a transition overlaps the two sides of one boundary; facts about media are read from the bytes and never stored in the document; and the versions `0.3` to `0.9` each add one feature by a step that changes no time value.

### D49.1 Clips are nodes

- A visual clip is a node: it has a lifetime (D42.1) and is shown only while
  active (D42.2). An image, a text, a Custom HTML element, a video, and later
  captions are all clips on a host's timeline; nothing in the schema is a
  "clip" apart from a node.
- A node that plays a source — a video (PR-28) — also has
  `sourceStartUs`, an integer from 0 to 2^53 − 1: the source time shown at the
  node's `startUs`. Speed is 1. A node without a source has no such field.
- An audio clip keeps its own list, because sound has no z-order and no box.
  From `0.4` it has the same `sourceStartUs` (PR-29).
- **Trimming** the start of a clip by `d` adds `d` to `startUs` and to
  `sourceStartUs` and subtracts it from `durationUs`, so the frames that remain
  stay where they were. Trimming the end changes `durationUs` only.
- **A split** at `t` makes two clips of the same kind whose lifetimes meet at
  `t` and whose source ranges meet at the matching source time. The second
  clip gets a new ID from the host (D39.3).
- **Keyframes stay in scene time** (D42.2 carried into scenes, D49.3). A
  lifetime neither shifts nor clips an animation, so trimming or splitting a
  node moves no keyframe, and both halves of a split carry the animation
  unchanged: each shows exactly what the unsplit node showed in its part of
  the interval. Which keyframes a split copies, and their IDs, is D53.

### D49.2 Layers are the z-order; there are no tracks

- The visual layer of a node is its index among its siblings, the first at the
  bottom (D16.4); `ReorderNode` is the only way to change it. Two nodes of one
  scene may overlap in time on any layers.
- Audio clips and the sound of video nodes are mixed regardless of their
  order.
- A host's timeline rows are a view the host derives from the z-order and the
  lifetimes, and it may store its own layout of them outside the document. A
  row is not a document fact and has no ID in the schema.
- "The same layer", where a later ADR needs it (transitions between clips,
  D49.4), means the same parent: two siblings of one scene or one group.

### D49.3 Scenes in sequence

- A composition is a non-empty sequence of scenes. Each scene has a stable ID
  (D16.3), a `durationUs` of at least 1, and its nodes. A scene has no
  `startUs`: its start is derived from the order and the durations, so
  reordering or resizing one scene can never leave two starts that disagree.
- **Times inside a scene are local to it.** A node's lifetime, a keyframe's
  `timeUs`, a video's source mapping, and the time a Custom HTML element is
  pushed (D23.4) are scene time, from 0 at the scene's start. A host that maps
  a scene to one of its own shots edits that scene without moving anything in
  another.
- **Placement.** Let scene `k` have duration `Dk`, and let the boundary
  between scene `k` and scene `k + 1` carry a transition of duration `Tk`
  (0 when there is none, D49.4). Then

  ```text
  start(0)     = 0
  start(k + 1) = start(k) + Dk − Tk
  durationUs   = start(last) + D(last)
  ```

  in integer arithmetic; the sum is checked to stay a safe integer.

- **Which scenes are evaluated at `t`.** Scene `k` is evaluated at local time
  `t − start(k)` exactly when `0 ≤ t − start(k) < Dk`. Outside transitions
  that is exactly one scene; inside a transition, exactly two (D49.4). The
  state keeps the shape of D19.4: `scenes` lists the evaluated scenes in their
  order with their local times, so it is still a function of
  `(composition, timeUs)`.
- **A scene renders alone as it does in the sequence**: its state at local
  time `u` is the same whether it is evaluated alone or at
  `t = start(k) + u` in the sequence. Frames coincide only where `start(k)` is
  a time of the frame grid; no rule forces scene durations onto the grid,
  just as none forces lifetimes (D42.1). Commands may offer to snap; the
  schema does not require it.
- **`durationUs` of the composition stays a field**, and a semantic rule
  requires it to equal the derived value. Every reader that uses it today — the
  frame grid (D13), the Player, the segment grid and ranges (D47), the limits
  (D48) — keeps reading one field, and a document whose field disagrees is
  invalid, not interpreted. Every command that changes a scene's duration, the
  order of scenes, or a transition updates it in the same change. The exact
  fields and the commands are D52.
- **A node belongs to one scene**; groups stay inside a scene. Moving a node
  to another scene keeps its scene-local times (D52).
- **Audio has two places.** The composition's `clips` stay where they are, in
  composition time (D16.5), for sound that spans scenes, such as music. A
  scene gets its own list of audio clips in scene time from `0.5` on, for
  sound that belongs to the shot, such as a voice-over; it moves with its
  scene. Both lists have one clip shape and are mixed together.

### D49.4 Transitions live on boundaries

- A transition has a stable ID, a kind from a closed set, and a `durationUs`
  of at least 1 (PR-32, D54). It belongs to one boundary, and a boundary has at
  most one transition.
- **Between two scenes**, the transition is the overlap of D49.3: during its
  `Tk`, scene `k` is evaluated in its last `Tk` and scene `k + 1` in its first
  `Tk`, and the kind combines the two images. Nothing else overlaps: `Tk` is
  at most the duration of either scene, and the two transitions of one scene
  together are at most its duration, so at most two scenes are evaluated at
  any time.
- **Between two clips of one layer** (two siblings of one parent, D49.2), the
  transition names both nodes, and their lifetimes must overlap by exactly its
  duration. The document states both lifetimes as they are; the transition
  adds no time and moves nothing. Outside the overlap each node is shown as it
  would be without the transition.
- **At progress 0 and 1 a transition is invisible**: the frame equals the frame
  without it. Each kind is a pure function of its progress, computed in
  integer or fixed-point arithmetic like D18.
- **No dangling boundary.** A command that removes or reorders a scene or a
  node a transition depends on removes the transition in the same change, and
  its inverse restores it, byte for byte (D30). Where a scene transition is
  stored, and what reordering does with it, is D54.
- **Sound in a transition** plays from both sides at their own gains; a
  transition changes no gain unless D54 decides a kind that does.

### D49.5 The source time and the source frame of a video

- For a video node active at scene time `u`, the source time is
  `s = sourceStartUs + (u − startUs)` in integer microseconds. The runtime
  computes `s` from the document alone and puts it in the state; it does not
  know the frames.
- **Source time 0 is the presentation time of the source's first frame**, so a
  container whose first timestamp is not 0 still starts at 0.
- **The frame shown** is the last frame whose presentation time, counted from
  the first frame, is at or before `s`. With the stream's time base
  `num / den` and presentation timestamps `p0 … pn` in presentation order,
  that is the largest `i` with

  ```text
  (pi − p0) × num × 1 000 000  ≤  s × den
  ```

  in `BigInt`, as D13 does for the frame grid. A variable frame rate needs
  nothing else.

- Both hosts choose the frame by this rule from the container's own
  timestamps, never from rounded microseconds, so the Player and the Producer
  show the same frame index even where their pixels differ (D50, roadmap
  question 5). The rule is a pure function exported where the hosts can share
  it (D13.3's boundary: `@kadrion/schema` may define what a document field
  means).
- **The source duration** is the presentation end of the last frame, counted
  from the first frame. Its exact definition in microseconds is D50; for audio
  it is the sample count of D29.6 over the sample rate (D51).
- Speed changes and reverse playback are outside this model; a later speed
  would be a rational factor in the same integer rule.

### D49.6 Media facts stay out of the document

- Durations, frame timestamps, time bases, sizes, sample rates, and streams of
  a source are **media facts**: a pure function of the bytes, and therefore of
  `contentHash` (D14). They are read from the bytes by a pinned reader, never
  stored in the document. D14 stands.
- **The rule.** The part of a clip that is ever sampled — its lifetime cut to
  its scene, or to the composition for a composition clip (D16.5) — must map
  into `[0, sourceDuration)`. This is D29.6's rule for audio, extended to
  video and to source offsets.
- **Both hosts check it before the first frame**: the Producer from the bytes it
  reads (D29.6), the Player from the bytes the resolver gives it. A clip that
  breaks it, an undecodable source, or a source without the stream it needs is
  a typed error, never a frozen frame or silence ("Missing required assets are
  errors, not silent fallbacks").
- **Commands check it too, from facts supplied by the host.** The command bus
  can be given media facts by `contentHash`; `editor-session` supplies them
  from the bytes its resolver has verified. A command whose result changes the
  sampled source range of a clip — a trim, a split, a move, a new source, a
  scene duration — is checked against them and refused when it would break
  the rule; without facts for that asset it is refused as well, so the bus
  never accepts what the hosts would reject. The result stays a pure function
  of the document, the command, and facts that are themselves a function of
  pinned bytes. The interface and the error codes are D50 (video) and D53
  (timeline commands); D30's guarantees hold unchanged.
- **AI sees the same facts.** `describe_document` (D46) reports the source
  duration of each media asset when the session has its facts, so a model can
  plan a trim without guessing.

### D49.7 The schema versions

Each version adds one feature by one migration step. **No step changes a time
value**: every step only adds fields with the value that renders as before, or
wraps what exists, so the golden frames of the reference composition stay byte
for byte through every step, and `render.schemaVersion`,
`render.compositionHash`, and `render.runtime.contentHash` are the only fields
of the golden manifest that change (D42).

| Version | PR     | Adds                                                                                         | Step from the previous version                                            |
| ------- | ------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `0.3`   | PR-28  | asset type `video`; node `video` with `sourceStartUs` and `fit`; `fit` on images             | every image gets `fit: "fill"`, today's `object-fit: fill` (D22)          |
| `0.4`   | PR-29  | any number of composition clips; `sourceStartUs`, gain, and fades on clips; sound of a video | every clip gets `sourceStartUs: 0`, unity gain, no fades; video sound off |
| `0.5`   | PR-30  | several scenes with `durationUs`; scene audio clips                                          | the one scene gets the composition's `durationUs` and an empty clip list  |
| `0.6`   | PR-32  | transitions on scene and clip boundaries                                                     | empty lists of transitions                                                |
| `0.7`   | PR-33  | node `captions` with words in scene time and a style                                         | none beyond the version                                                   |
| `0.8`   | PR-34a | the template section: inputs and bindings                                                    | none beyond the version                                                   |
| `0.9`   | PR-34b | conditions and repetition                                                                    | none beyond the version                                                   |

- **What validates, renders** (D16.2): a field arrives in the version whose
  pull request renders it. So `muted` and `volume` of a video node arrive in
  `0.4`, not `0.3`; in `0.3` a video node is silent, and the step to `0.4`
  gives every video node the values that keep it silent (`muted: true`). This
  answers the open point of PR-28 in the roadmap; D50 records it.
- With one scene starting at 0, scene time equals composition time, so the step
  to `0.5` moves no node, keyframe, or Custom HTML time.
- The column "Adds" is the model's direction, not a field list; each ADR from
  D50 to D57 decides its fields, names, bounds, and commands.

### D49.8 What this ADR does not decide

- The fields, bounds, error codes, and commands of each version (D50 to D57).
- The parity threshold for video pixels in the Player (D50, measured first).
- The kinds of transitions and how they combine two images (D54); the gain
  unit and the fade shape (D51); line breaking of captions (D55).
- **A composition-level overlay** — nodes in composition time above every
  scene, for a logo or captions that span scenes. It is not part of this
  model: a host splits such content per scene. A later ADR may add it as a
  relaxation without changing anything decided here.
- Nested scenes, speed changes, reverse playback, ripple edits, and snapping.

## Alternatives considered

- **Explicit tracks with a no-overlap rule** — a host's timeline rows would
  become a document fact with IDs, every command would have to keep the rule,
  and a layout choice of one UI would bind every host and the AI. The z-order
  already says what is drawn above what.
- **Clips as a separate list that points at nodes** — two entities per visual
  clip, a reference that can dangle, and a lifetime in two places. D42 made
  nodes clips already.
- **Composition time everywhere, scenes as ranges with `startUs`** — no
  migration of times inside a scene, but moving, resizing, or reordering one
  scene moves every time of every later scene, and a host's mapping from a
  shot to its content breaks with each edit. D16 rejected redundant scene
  starts for the same reason.
- **The composition's duration derived only, without a field** — no redundant
  value, but every reader of `durationUs` (frame grid, Player, segments,
  limits, the CLI) would recompute it, and a change of the derivation would
  change them all. A checked field keeps one value with one meaning.
- **Transitions that add time between scenes** (both sides held still while
  the transition runs) — no overlap, but frozen frames are not what an editor
  shows, and the composition's duration would grow with each transition.
- **Clip transitions that extend the lifetimes implicitly** — the document
  would no longer state when a node is shown.
- **Declaring media facts in the asset entry** (for example `durationUs` of a
  video), verified against the bytes on load — commands could check source
  ranges from the document alone, but D14 rejected exactly this, and the step
  that adds the field to existing audio assets would need their bytes, which a
  migration never has (D35, D14). Facts supplied to the bus by `contentHash`
  give the same checks without either cost.
- **Unchecked source ranges in commands**, with the error only at render — the
  bus would accept documents that both hosts refuse, and an AI edit would fail
  late instead of at the command.
- **A source frame chosen by the nearest timestamp** or from microsecond
  timestamps rounded by a browser decoder — the two hosts could pick
  neighbouring frames, which parity could never tell from a decoding
  difference.

## Consequences

- PR-28 to PR-34b each implement their part of this model and record their own
  ADR; none of them needs to revisit the time base, the layer model, the
  placement of scenes, or where transitions live.
- `@kadrion/runtime` maps composition time to at most two scenes and their
  local times, and computes source times; it never sees media facts.
- `@kadrion/renderer-dom` renders one or two scenes and, from PR-32, combines
  them; from PR-28 it shows a video frame the host supplies.
- `@kadrion/schema` exports the source-frame rule (D49.5) beside the frame grid
  (D13.3), and the semantic rules of D49.3 and D49.4.
- `@kadrion/editor-sdk` gains an optional media-facts input to the bus, used
  only by commands that change a sampled source range; `@kadrion/editor-session`
  supplies it from verified bytes; `@kadrion/ai-sdk` reports the facts in
  `describe_document`.
- `@kadrion/producer` and `@kadrion/player` both read media facts from bytes
  and check D49.6 before the first frame.
- Custom HTML elements receive scene time from `0.5` on; with one scene that is
  the time they receive today.
- A host that wants rows, snapping, or ripple edits builds them from the
  z-order, the lifetimes, and the commands in a transaction (D38).
- Contents that span scenes, other than composition audio clips, must be split
  per scene by the host until an overlay is decided (D49.8).

## Verification

Not mechanically verified by this ADR, which changes no code. Each pull request
from PR-28 on verifies its part: the migration step's pair before and after and
the byte-identical golden frames of the reference composition (D49.7); the
source-frame rule against frames FFmpeg decodes on its own (D49.5); the
placement and the at-most-two-scenes rule by runtime tests over every boundary
(D49.3, D49.4); a scene evaluated alone against the same scene in a sequence
(D49.3); and the refusal of a command that breaks the rule of D49.6, in both
hosts and in the bus.
