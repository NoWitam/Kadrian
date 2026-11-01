# D55 — Timeline commands: move, trim, split, and join a clip

- Status: Proposed
- Date: 2026-11-01
- Supersedes: —
- Extends: D46 (five tools), D49 (49.1: which keyframes a split copies, and
  their IDs), each with an `Amended by: PR-31 (D55)` line
- Related: D30, D38, D39, D41, D42, D49, D52, D53, D54,
  [roadmap of phase three](../roadmap/phase-3.md) PR-31

## Context

Studio item 2 of the roadmap needs the editing commands of a timeline: move a
clip, trim its start and its end, split it, and move it to another layer or
scene, each exactly undone. D49.1 fixed the model: a visual clip is a node with
a lifetime, a video and an audio clip also have `sourceStartUs`; trimming the
start by `d` adds `d` to `startUs` and `sourceStartUs` and subtracts it from
`durationUs`; trimming the end changes `durationUs` only; a split makes two
clips of one kind whose lifetimes meet at `t` and whose source ranges meet at
the matching source time, the second with a new ID from the host (D39.3); and
keyframes stay in scene time, so a trim or a split moves none. It left to this
ADR which keyframes a split copies and their IDs.

What the repository has, read on 2026-11-01 at `main` `42a9d15`: 40 commands
in the closed registry (D38.1), among them `SetNodeLifetime` (both fields of a
lifetime, no keyframe moves, D42.10), `SetVideoSource`, `SetClipSource`,
`ReorderNode` (the layer, D39), and `MoveNodeToScene` (D54.5). A host can
already build a trim from `SetNodeLifetime` and `SetVideoSource` in a
transaction, but it must compute three fields and keep them consistent, and a
split needs the IDs, the animations, the fades, and the sample grid right. The
plan's two remaining moves exist: the layer is `ReorderNode` (a host's row maps
to an index, D49.2) and the scene is `MoveNodeToScene`. No schema change is
needed: every field these commands write exists in `0.5`.

The inverse of every command is one command (D30.5): the bus records one
inverse per command and an undo applies it. A split's inverse must therefore be
a command that joins the two halves back, byte for byte.

## Decision

> D55: Five commands edit clips on a timeline — `MoveClip`, `TrimClipStart`, `TrimClipEnd`, `SplitClip`, and its inverse `JoinClips` — each addressed by one `clipId` that names a node or an audio clip; a move carries the clip's keyframes along, a trim and a split move none, a split copies every animation to both halves, and a split is refused where its halves would not render exactly as the whole.

### D55.1 One address for both kinds of clip

- Every command takes `clipId`, which names a node (any type, a child of a
  group included) or an audio clip of the composition or of a scene. IDs share
  one namespace (D16.3), so the name is never ambiguous; a node is looked up
  first, then an audio clip.
- An ID that names neither is `unknown-clip` (D52.6), whose message now says
  "no node or audio clip".
- A clip **has a source** when it is a video node or an audio clip: those carry
  `sourceStartUs` (D49.1, D50, D52). Every other node is a clip without one.

### D55.2 The commands

| Command         | Arguments                     | Effect                                                                                                                             | Inverse                           |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `MoveClip`      | `clipId`, `startUs`           | sets `startUs`, keeping `durationUs` and the source; a node's keyframes, and for a group its children and theirs, move by the same | `MoveClip` to the old start       |
| `TrimClipStart` | `clipId`, `startUs`           | moves the start and keeps the end: `startUs`, `durationUs`, and a source's `sourceStartUs` change by the same `d` (D49.1)          | `TrimClipStart` to the old start  |
| `TrimClipEnd`   | `clipId`, `endUs`             | moves the end and keeps the start: `durationUs` becomes `endUs − startUs`                                                          | `TrimClipEnd` to the old end      |
| `SplitClip`     | `clipId`, `atUs`, `newClipId` | cuts the clip at `atUs` into two that meet there; the second is `newClipId`, directly after the first in its list                  | `JoinClips` of the two            |
| `JoinClips`     | `clipId`, `nextClipId`        | joins a clip with the one directly after it, when that one is exactly what a split would have made of the joined clip              | `SplitClip` at the second's start |

- **Times.** `startUs`, `endUs`, and `atUs` are integers of the time bounds of
  a lifetime (D42.1), in the time of the clip's scene, or composition time for
  a composition clip. `newClipId` must be an ID of the document's form, as
  `newNodeId` (D39.3). Nothing is rounded; `-0` becomes 0.
- **No edit.** A move or a trim to the value the clip has returns no inverse
  (D30.9).
- **An end that is not a time.** A lifetime may reach past `2^53 − 1` (D42.1);
  `TrimClipEnd` of such a clip is refused with `time-outside-clip`, because its
  inverse would have to name that end. `SetNodeLifetime` still edits it.
- **Fades** of an audio clip count from its lifetime (D52.2), so a trim keeps
  `fadeInUs` and `fadeOutUs` at the edges they belong to; a trim that leaves
  less than both fades is `invalid-result`, as the schema's rule says.

### D55.3 Keyframes: a move carries them, a trim and a split do not

- **`MoveClip` is a move of the content**, not of the lifetime alone: every
  keyframe of the node's animations moves by the same `d`, and a group's
  children move with it, their lifetimes and keyframes by the same `d`. So the
  clip looks the same, only later or earlier, which is what a timeline's drag
  means. `SetNodeLifetime` stays the command that changes when a node is shown
  and moves no keyframe (D42.10). A keyframe moved below 0 or past its bound
  is `invalid-result`.
- A Custom HTML element draws from the scene time it is pushed (D23.4, D54.3);
  no document field shifts what it draws, so a moved element shows what it
  would have shown at the new times. This is a limit of the element, not of
  the command.
- **`TrimClipStart` and `TrimClipEnd` move no keyframe** (D49.1, D42.2): the
  frames that remain stay where they were.
- **`SplitClip` copies every animation of the node, all keyframes, unchanged,
  to the second half** (this answers D49.1's open point). Each half then shows
  exactly what the unsplit node showed in its part of the interval, whatever
  the interpolation or easing, because the animation is the same function of
  scene time. The copies' IDs follow D39.3: `<newClipId>-a-<property>`. A
  pruning of keyframes outside each half is left out: it would have to keep
  the keyframes that bracket each half, and a gain in size is not worth a rule
  that can differ from the whole.

### D55.4 What a split may cut, and when it is exact

- `atUs` must lie strictly inside the lifetime, `startUs < atUs <
startUs + durationUs`, computed by subtraction (D42.2); otherwise
  `time-outside-clip`. The same code refuses a trim that would leave no
  duration: `TrimClipStart` to a time at or after the end, and `TrimClipEnd` to
  a time at or before the start.
- A **group** is not split (`unsupported-node`): its children have their own
  lifetimes, and splitting each would be a different command. A child of a
  group is split inside the group.
- **The halves.** The first keeps its ID, `startUs`, and every field, with
  `durationUs = atUs − startUs`. The second is a copy of the first with
  `id = newClipId`, `startUs = atUs`, `durationUs` the rest, and, for a clip
  with a source, `sourceStartUs` advanced by `atUs − startUs`, so the source
  ranges meet (D49.1). Every key keeps its place (D30.7).
- **Pictures are exact.** A video half chooses its frame from
  `sourceStartUs + (u − startUs)` (D49.5), which equals the unsplit value at
  every scene time `u`; any other node shows the same state at every time.
- **Sound is exact on the sample grid.** A sound is placed on the samples
  of 48 kHz by rounding its start and its source start separately (D52.5,
  D53). The second half reads the same samples as the whole, whatever the
  placement of its scene and whatever the source start, exactly when
  `atUs − startUs` is a multiple of 125 µs, the smallest whole number of
  microseconds that is a whole number of samples (6). Elsewhere it is exact
  only for some phases of the start against the source, which a later edit of
  another scene can change. For an audio clip, and for a video node whose
  volume is above 0, a split elsewhere is refused with `split-not-exact`, and
  the message names the two nearest times that are exact.
- **Fades.** The first half keeps `fadeInUs` and gets `fadeOutUs: 0`, the
  second gets `fadeInUs: 0` and keeps `fadeOutUs`. That is exact only when the
  fade-in ends at or before `atUs` and the fade-out begins at or after it; a
  split inside a fade is `split-not-exact` too.
- **IDs.** `newClipId` and the copied animation IDs are refused with
  `id-in-use` when taken (D39.3). `createdIds` are the second half's node ID,
  then its animation IDs (D39.4).
- **Media facts.** The second half is a new range of its source, and a
  `JoinClips` grows the first, so both are checked against the host's facts
  like any changed range (D49.6, D53): `media-facts-missing` or
  `source-range-exceeded`.

### D55.5 Joining, the inverse of a split

- `JoinClips { clipId, nextClipId }` requires the second clip to be directly
  after the first in the same list (the same scene's or group's nodes, or the
  same list of clips), and to be **exactly what `SplitClip` would make** of the
  joined clip at the second's `startUs` under `nextClipId`: the join is
  computed, split again by the same function, and both halves are compared, as
  JSON text, with the two clips. Anything else is `clips-not-joinable`. So a
  join is allowed exactly when its inverse restores the document byte for
  byte, and a split followed by its inverse is the identity.
- The joined clip is the first with `durationUs` the sum and, for an audio
  clip, the second's `fadeOutUs`; the second is removed with its animations
  (`removedIds`).
- `JoinClips` is a command of its own, with its tool, because the bus records
  one inverse per command (D30.5) and because a host can offer it as an edit.

### D55.6 Source ranges

No command leaves a clip outside its source: a `TrimClipStart` that would make
`sourceStartUs` negative is refused with `source-range-exceeded` before any
facts are read, and every changed range is checked against the facts (D49.6).

### D55.7 Errors and tools

- Three new codes: `time-outside-clip`, `split-not-exact`, and
  `clips-not-joinable`. The others are those of the registry:
  `invalid-argument`, `unknown-clip`, `unsupported-node`, `id-in-use`,
  `invalid-result`, `media-facts-missing`, and `source-range-exceeded`.
- The catalogue gains five tools derived from the metadata (D46.1), so it has
  45; the snapshot of the catalogue is updated.

### D55.8 What this ADR does not decide

Ripple edits, snapping, and multi-select (roadmap PR-31 "Not included"); a
host builds them from these commands in a transaction (D38). Transitions
(PR-32, the next ADR) will add references between clips; the commands here
will then remove or refuse what would dangle, as D49.4 requires.

## Alternatives considered

- **No `MoveClip`, only `SetNodeLifetime`.** It moves no keyframe, so a dragged
  clip would leave its animation behind, and a host would have to move every
  keyframe in a transaction. `MoveClip` is that transaction as one command.
- **`MoveClip` that moves no keyframe**, like `SetNodeLifetime`. Then the two
  commands would differ only for audio clips.
- **Trims by a delta** instead of the new edge. A drag on a timeline gives the
  new edge; a delta would make the host subtract and the AI compute.
- **Splitting keyframes per half** (each half keeps only the keyframes that
  matter to it). Exactness then depends on which keyframes bracket each half;
  copying all is exact by construction.
- **Splitting audio anywhere**, with the second half off by at most one
  sample. A one-sample jump in the source can click, and "a split followed by
  play is the same sound" would hold only approximately; the grid of 125 µs is
  fine enough for any edit a person makes.
- **The inverse of a split as `RemoveNode` plus `SetNodeLifetime`**. The bus
  records one inverse per command; two would need a composite inverse that
  D30.5 does not have.
- **A join that merges any two adjacent clips of one kind.** Its inverse would
  not restore them when their other fields differed; the test "what a split
  would make" is the one rule under which both directions are exact.

## Consequences

- `@kadrion/editor-sdk`: five commands with closed argument schemas, parsers,
  registry entries, exact inverses, AI metadata, and three error codes.
- `@kadrion/ai-sdk`: five tools from the metadata; the catalogue's snapshot.
- The repository's root gains `@kadrion/runtime` as a dev dependency, for the
  test that renders a split clip through the runtime; no package boundary
  changes (D12).
- No schema, runtime, renderer, Player, or Producer change: the runtime build
  hash, Q14, parity, and the golden frames are untouched.

## Verification

- Unit tests (`packages/editor-sdk/test/timeline.test.ts`): every command on a
  node, a group, a child of a group, a video, and an audio clip of the
  composition and of a scene; each inverse restores the exact JSON text; every
  refusal code, each guard by a case that passes only with it.
- A split and its join are the identity; a join that is not a split's is
  refused.
- Rendering a split clip gives the same state as the unsplit one
  (`tests/app/timeline-split.test.ts`): the state of
  `@kadrion/runtime` at every boundary time around the split and a dense grid of
  scene times, with the second half's node read under the first's ID; and the
  audio plan placed on the 48 kHz grid by `audioLayout` hears the same source
  samples at the same output samples, at the same volume and place of each
  fade; and a split written by hand 1 µs off the grid is shown to differ.
- A seeded property test of the history
  (`packages/editor-sdk/test/timeline-history.test.ts`): long sequences of the five commands,
  with undo and redo, through the bus, each undo restoring a byte-identical
  earlier document and every redo the later one.
- `@kadrion/ai-sdk`: each tool equals its command (`tools.test.ts`), and the
  catalogue snapshot.
