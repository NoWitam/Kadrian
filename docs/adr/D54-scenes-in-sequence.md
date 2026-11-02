# D54 — Scenes in sequence: schema 0.5, scene time, and the scene commands

- Status: Accepted — by the project owner on 2026-11-01, after PR-30 was merged
- Date: 2026-11-01
- Supersedes: D16 in its one-scene rule (16.2 "exactly one scene", 16.5 "the
  single scene spans the composition"), with a `Superseded in part by` line
- Extends: D19 (19.4: a scene of the state carries its scene time), D22 (22.4:
  scenes that are not evaluated are hidden), D23 (23.4: a Custom HTML element
  is pushed the time of its scene), D35 (the step from `0.4`), D46 (seven
  tools), D50 (50.3 and 50.5: a video samples what its scene shows), and D52
  (52.4: the clips of scenes in the audio plan), each with an
  `Amended by: PR-30 (D54)` line
- Amended by: PR-32 (D56) on 2026-11-01: 54.2: the composition's `durationUs` is the sum of the scenes' less the scene transitions', computed in `BigInt` (D56.2)
- Related: D04, D13, D16, D17, D30, D38, D39, D42, D43, D47, D49, D53,
  [roadmap of phase three](../roadmap/phase-3.md) PR-30

## Context

D49.3 decided the model: a composition is a non-empty sequence of scenes, a
scene has a stable ID, a `durationUs`, and its nodes, and every time inside a
scene is scene time; a scene has no `startUs`; the composition's `durationUs`
stays a field that must equal the derived sum; a scene gets its own list of
audio clips; a node belongs to one scene. D49.7 gave `0.5` to that change and
its step: the one scene gets the composition's duration and an empty clip
list. It left to this ADR the fields, the rule and its error, how the hosts
evaluate and render several scenes, and the commands.

Schema `0.4` has `scenes` with `maxItems: 1` (D16.2), and every reader assumed
the one scene starts at 0: the runtime evaluated its nodes at composition time,
the renderer mounted one scene, the Producer and the Player chose video frames
at composition time and cut a video's sampled range at the composition's end,
and the audio plan placed only composition clips. Studio item 5 of the roadmap
needs several scenes, each with an ID the host maps to one of its shots.

Transitions are PR-32 (`0.6`); until then scenes meet end to end, `Tk = 0` in
the placement of D49.3.

## Decision

Schema `0.5` allows any number of scenes, at least one, each with a
`durationUs` and its own audio clips in scene time. A scene starts where the
one before it ends; the state at composition time `t` holds the scene that
contains `t` with its scene time; every host derives placements from one pure
module of `@kadrion/schema`; and seven commands edit the sequence.

### D54.1 Schema `0.5`

- `scenes` is an array of at least one scene (`minItems: 1`); `maxItems` is
  gone.
- A scene is the closed object `{ id, durationUs, nodes, clips }`, every field
  required (D16.1):
  - `durationUs` is an integer from 1 to `2^53 − 1`, like a node's.
  - `clips` is an array of audio clips of the one clip shape of D52.1
    (`id`, `type: "audio"`, `assetId`, `startUs`, `durationUs`,
    `sourceStartUs`, `volume`, `fadeInUs`, `fadeOutUs`), whose times are scene
    time. Every rule of a composition clip holds for a scene clip: the asset is
    an audio asset, the fades fit the clip's duration, and the ID lives in the
    one namespace (D16.3).
- The composition keeps `durationUs` and its own `clips` in composition time
  (D49.3), for sound that spans scenes.
- The descriptions of every node time, keyframe time, and source mapping say
  scene time.

### D54.2 The duration rule

- A semantic rule requires the composition's `durationUs` to equal the sum of
  the scenes' `durationUs`. A document that breaks it is refused with the new
  code `composition-duration-mismatch` at `/durationUs` (D17); it is never
  interpreted.
- The sum is computed so that it never leaves the safe integers: once it would
  pass `2^53 − 1`, it is recorded as too large, and the document is refused with
  the same code and a message that says so.
- The rule is checked only for documents whose scenes carry a duration, so the
  frozen readers of `0.1` to `0.4` are unchanged.

### D54.3 Evaluation and rendering in scene time

- **One module of placements.** `@kadrion/schema` exports pure functions every
  host shares, as it does for the frame grid (D13.3) and the source frame
  (D49.5): `scenePlacements` (each scene's index, start, and duration, the start
  being the sum of the durations before it), `scenesAt` (the scenes that
  contain `t`, with `t − start`; a list, which PR-32 will make two inside a
  transition), `placedVideos` (every video node with its scene), and
  `videoSceneTimeUs` (the scene time at which a video shows a frame, or
  `null`).
- **The state** (D19.4): `scenes` lists the evaluated scenes in their order,
  each `{ id, timeUs, nodes }`, where `timeUs` is scene time; the nodes are
  evaluated at it. Outside the composition `scenes` is empty. The state stays a
  function of `(composition, timeUs)`.
- **The renderer** (D22.4) mounts every scene of the document, in order. On
  each render, a scene the state does not evaluate gets `visibility: hidden` on
  its element, and the declarations `renderState` writes on nodes
  (`transform`, `opacity`, `visibility`) are removed from every node inside it,
  so the tree equals that of a fresh mount rendered at the same state,
  whatever came before (D22.4 has no memory). An evaluated scene loses the
  declaration. The structure check finds the state's scenes among the mounted
  ones in their order, and checks the nodes of the evaluated ones, before
  anything is written. A document of one scene, which is always evaluated
  inside the composition, gets no scene declaration, so the reference DOM is
  unchanged byte for byte.
- **Custom HTML** (D23.4): an element of an evaluated scene is pushed the
  scene time, and must acknowledge it, as before; an element of a scene that is
  not evaluated is pushed nothing.
- **Video** (D50.3, D50.5, D51): a video's sampled source range is its lifetime
  cut to the end of its scene, not of the composition; the Producer and the
  Player choose its frame at the scene time of `videoSceneTimeUs`. The bus
  checks the range cut to the scene against the media facts (D49.6).
- **Audio** (D52.4, D53): the audio plan holds the composition's clips, then
  the clips of each scene in scene order, then the sound of videos. A scene's
  clip and a video's sound are placed at the scene's start and cut at the
  scene's end; the fades of a clip still count in its whole lifetime. The
  Producer's mix and the Player's graph read the plan, so neither changes.
- Scene durations are not forced onto the frame grid (D49.3): a frame shows
  the scene that contains its time.

### D54.4 The step from `0.4`

- The step `0.4 → 0.5` gives the one scene `durationUs` equal to the
  composition's, directly after its `id`, and `clips: []` as its last key;
  nothing else changes (D49.7). With one scene starting at 0, scene time is
  composition time, so no time moves.
- The schema of `0.4` is frozen as data with the hash of the last build of
  `0.4` (D35.4); the compatibility corpus gains a `v0-5` set of expectations
  for every saved document, and a saved document of `0.5` with three scenes
  (D43.6).
- The golden frames of both reference compositions stay byte for byte; their
  manifests change in `render.schemaVersion`, `render.compositionHash`, and
  `render.runtime.contentHash` only.

### D54.5 The commands of scenes

Seven commands join the closed registry (D38.1), each with a closed argument
schema, an exact inverse, and AI metadata (D46.5). Every command that changes
the sum of the scene durations changes the composition's `durationUs` by the
same amount in the same change (D49.3).

| Command             | Arguments                    | Effect                                                                                      | Inverse                         |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| `AddScene`          | `index`, `scene`             | inserts the complete scene; its IDs are created                                             | `RemoveScene`                   |
| `RemoveScene`       | `sceneId`                    | removes the scene with its nodes and clips; refuses the only scene (`last-scene`)           | `AddScene` of the same bytes    |
| `DuplicateScene`    | `sceneId`, `newSceneId`      | copies the scene directly after itself                                                      | `RemoveScene` of the copy       |
| `ReorderScene`      | `sceneId`, `index`           | moves the scene; nothing inside it moves                                                    | `ReorderScene` to the old index |
| `SetSceneDuration`  | `sceneId`, `durationUs`      | sets the scene's duration                                                                   | `SetSceneDuration` of the old   |
| `MoveNodeToScene`   | `nodeId`, `sceneId`, `index` | moves a node of a scene's own list to that index of a scene's list, keeping its scene times | `MoveNodeToScene` back          |
| `AddSceneAudioClip` | `sceneId`, `index`, `clip`   | inserts the complete clip into the scene's clips                                            | `RemoveAudioClip`               |

- **IDs of a duplicate** follow D39.3 from `newSceneId` = `S`: the node at
  index `i` is `S-n<i>`, a child at index `j` of that node `S-n<i>-c<j>`, each
  animation its owner's ID followed by `-a-<property>`, and the clip at index
  `k` is `S-k<k>`. Only `id` fields differ from the source. Any ID in use is
  refused with `id-in-use`, listing them.
- **The audio clip commands of D52.6 reach scene clips.** `RemoveAudioClip`,
  `SetClipSource`, `SetClipVolume`, and `SetClipFades` find a clip in the
  composition's list or in any scene's; the inverse of removing a
  scene clip is `AddSceneAudioClip` at its index.
- **Moving a node.** A child of a group moves with its group (`unsupported-node`).
  Moving within the node's own scene is a reorder; the same index is no edit.
- **No edit.** `ReorderScene` to the scene's own index and `SetSceneDuration`
  to the duration it has return no inverse, like every command of D30.
- **Errors.** Two new codes: `unknown-scene` (no scene has that ID) and
  `last-scene`. An index past the end is `index-out-of-range`; an incomplete or
  invalid scene or clip is `invalid-result`, judged by the document's
  validation.
- **Media facts.** A command that changes what a video samples or what a sound
  is heard of — a longer scene, a node moved into a longer scene, a new scene
  clip — is checked against the host's facts (D49.6, D53): `media-facts-missing`
  or `source-range-exceeded`.
- **Composition clips do not follow scenes.** Removing, reordering, or resizing
  a scene leaves the composition's clips in composition time; a composition
  clip past the new end is cut there (D52.4). A host that wants music to follow
  an edit moves it in the same transaction.

### D54.6 Tools and the description of a document

- The catalogue gains the seven tools derived from the metadata (D46.1), so it
  has 40 tools; the snapshot of the catalogue is updated.
- `describe_document` states, for each scene, its derived `startUs` (not
  stored), its `durationUs`, and its clips, so a model can place an edit
  without computing the sum itself.

### D54.7 What this ADR does not decide

Transitions and the overlap of scenes (PR-32), snapping scene durations to the
frame grid, nested scenes, scene templates (PR-34b), and the timeline commands
that move or trim clips (PR-31).

## Alternatives considered

- **A `startUs` on each scene.** Two starts could disagree with the durations
  after a reorder or a resize; D49.3 rejected it, and nothing found here argues
  otherwise.
- **Mounting only the evaluated scene.** A seek across scenes would rebuild the
  tree, reload images and Custom HTML frames, and make the time of a render
  depend on the scene before it. Mounting every scene once and hiding the
  others keeps a render a pure write of the state.
- **Leaving the nodes of a hidden scene as they were.** Nothing of them is
  painted, but the tree would then depend on earlier renders, which D22.4
  forbids; the measured tree differed from a fresh mount when a scene had been
  shown before. Removing the three declarations costs one walk of the hidden
  scenes.
- **Moving composition clips with the scenes they overlap.** There is no
  unique rule for a clip that spans several scenes; the host decides, in a
  transaction.

## Consequences

- `@kadrion/schema`: `0.5`, the frozen `0.4`, the step, the duration rule, the
  module of placements, the sampled range cut to a scene, and the audio plan of
  scene clips.
- `@kadrion/runtime`: evaluation through `scenesAt`; `SceneState.timeUs`.
- `@kadrion/renderer-dom`: every scene mounted, hidden scenes reset, Custom
  HTML time in scene time. The runtime build changes, so the golden manifests
  and the parity records are written again.
- `@kadrion/player`, `@kadrion/producer`: video frames at scene time through
  `placedVideos`.
- `@kadrion/editor-sdk`, `@kadrion/ai-sdk`: the seven commands and tools, scene
  clips in the clip commands, the media-facts check per scene, the description.
- `@kadrion/editor-session`: the clips whose sounds it reads facts for include
  scene clips.
- Fixtures: every composition fixture converted to `0.5` textually, the pair of
  the step, the frozen `0.4` fixtures, and the scenes fixture.

## Verification

- Unit tests: placements, boundaries, and the audio plan of scene clips
  (`packages/schema/test/scenes.test.ts`); the duration rule
  (`invalid-compositions`); the step and the corpus (`migrate.test.ts`, the
  compatibility test); the state of scenes and a scene evaluated alone against
  the same scene in the sequence (`packages/runtime/test/scenes.test.ts`); hidden
  scenes, a render without memory, and Custom HTML in scene time
  (`packages/renderer-dom/test/scenes.test.ts`); every command, its inverse byte
  for byte, the IDs, the errors, and the media-facts checks
  (`packages/editor-sdk/test/scenes.test.ts`).
- Pinned (`tests/pinned/scenes.pinned.test.ts`): in pinned Chromium, each frame
  of the scenes fixture equals, pixel for pixel, the frame of the same scene
  rendered alone at its scene time, at its first, a middle, and its last frame,
  in either order of the frames; and the Custom HTML element of the middle
  scene draws its scene time.
- The golden frames of both reference compositions stay byte for byte, and
  parity stays 0/0.
