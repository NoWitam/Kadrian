# D85 — Fades of a video's sound and volume keyframes in decibels: schema 0.26

- Status: Proposed
- Date: 2026-11-14
- Supersedes: —
- Extends, on acceptance, each with an `Amended by` line written then and in
  force from the pull request it names: D52 (52.1 and 52.2: a video node has
  fades; 52.4 and 52.5: the plan and the mix carry a volume curve, D85.1 to
  D85.5), D53 (53.2: the Player plays the curve, D85.6), D55 (55.2 to 55.5:
  the fades of a video and the animations of an audio clip in moves, trims,
  splits, and joins, D85.8), D65.1 (the row `volume`, D85.2), and D41 (an
  animation of an audio clip, D85.8). D35 (the step from `0.25` to `0.26`) and
  D46 (the descriptions of six tools) get their lines from the pull requests
  of D85.7 and D85.8, as every schema step and tool change before them
- Related: D04, D12, D13, D16, D18, D24, D29, D33, D34, D38, D47, D49, D54,
  D56, D66, D67, D76, D82, D83,
  [roadmap of phase six](../roadmap/phase-6.md) PR-74 to PR-78

## Context

A host's video editor asks for the sound of its film what its own audio
editor already has: a video clip's sound that fades in and out, and a volume
that changes over a clip's time, so that music can be lowered under speech
without cutting the clip. The host numbered its requirements R1 to R4:

| #   | Requirement                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `fadeInUs` and `fadeOutUs` on a `video` node with the meaning of D52.2 (linear, in the node's lifetime, multiplied by `volume`); a step that writes 0 and 0; a command (working name `SetVideoFades`); the Player and the Producer. |
| R2  | `volume` as an animated property (D65.1) of an audio clip and of a `video` node, linear in decibels between two values above 0, the same in the Player and the Producer to the sample, set by the generic keyframe command.         |
| R3  | A short description in the AI tool catalogue; the host's own chat instructions have a fixed limit of 60 000 characters and are almost full.                                                                                         |
| R4  | One release with the schema step, which the host pins once.                                                                                                                                                                         |

The host also asks whether the engine offers ducking (music lowered while
someone speaks) or whether the host computes it as volume keyframes of R2.
Its own audio editor already computes a ducking envelope on its server; in the
film, the envelope would have to reach the Producer's mix and the Player.

What the repository has, read on 2026-11-14 at `main` `727f91b` (`v0.8.0`,
schema `0.25`, after D84):

- **Fades exist on audio clips only.** `audioClipSchema`
  (`packages/schema/src/composition-schema.ts`) holds `volume`, `fadeInUs`,
  and `fadeOutUs`; the semantic rule `clip-fades-exceed-duration`
  (`validate-semantics.ts`) refuses fades longer than the clip.
  `videoNodeSchema` holds `volume` and no fade: "A video node has no fades in
  `0.4`" (D52.2). `SetClipFades` edits a clip found by `onClip`
  (`packages/editor-sdk/src/registry.ts`), so it never reaches a video node.
- **An audio clip has no animations.** Animations live on nodes, in an
  `animations` list whose rows a node type allows (D65.1; `pictureTransform`
  for images and videos). `AddAnimation` finds its target with `locateNode`,
  so an audio clip, which is not a node, is `unknown-node`. Keyframe times are
  in the time of the holder (scene time, or composition time for a clip of the
  composition), never relative to a clip (D49.1, D82.7); `MoveClip` carries a
  node's keyframes, a trim moves none, and a split copies every animation to
  the second half as `<newClipId>-a-<property>` (D55.3).
- **The plan and the grid.** `audioPlan` (`packages/schema/src/audio-plan.ts`)
  gives each heard sound one constant `volume`, a `lifetimeUs`, and its fades;
  a video's entry has `fadeInUs: 0`, `fadeOutUs: 0`, and `lifetimeUs` equal to
  the part heard. `audioLayout` (`packages/runtime/src/audio.ts`) puts them on
  the 48 kHz grid.
- **The Producer** mixes the layout in one FFmpeg graph (`audioPassGraph`,
  `packages/producer/src/segments.ts`): per sound `aresample`, `aformat`,
  `atrim`, `volume=…:precision=float` (left out at 1), `afade` in and out with
  `curve=tri`, `adelay`, `apad`, `atrim`, then `amix` with `normalize=0`. The
  pinned FFmpeg is `n8.1.3-20260921` (`packages/producer/src/ffmpeg.ts`). A
  sound at another speed is first computed by `stretchSound` into a 32-bit
  float WAV (D82.6). Nothing in this graph depends on the signal: every
  position is a sample count from the plan.
- **The Player** plays the same layout with Web Audio
  (`packages/player/src/audio.ts`): one `AudioBufferSourceNode` per sound, a
  `GainNode` for the volume, and one per fade whose automation is
  `setValueAtTime` and `linearRampToValueAtTime` (`fadeGain`), started from the
  middle of a fade after a seek. Parity with the Producer's intermediate is
  gated at 1e-4 per sample and measured at 1.0e-5, "the error of 32-bit float
  gain automation" (D53.5).
- **No golden audio.** The golden files are frames and manifests; sound is
  checked by the pinned mix test against an independent sum (D52.7) and by
  the parity of D53.5.
- **The catalogue** (`packages/ai-sdk/test/catalogue.snap`) has 103 tools.
  The entries this ADR touches, as JSON: `set_clip_fades` 1 982 characters,
  `add_animation` 3 681, `set_keyframe_value` 4 388, `set_keyframe_easing`
  3 391, `add_audio_clip` 2 718, `add_scene_audio_clip` 2 348, `move_clip`
  2 250. A new tool costs about 1 000 to 1 600 characters (D83, alternatives).

Ducking driven by the signal (a compressor keyed by the speech) would be the
first part of the mix that depends on sample values. The Player would need
Web Audio's `DynamicsCompressorNode`, whose algorithm the specification does
not fix and which no FFmpeg filter reproduces, so the parity of D53.5 could
not hold. Ducking driven by declared intervals needs to know which clips are
speech, which is the host's knowledge (D01, D02), and gives exactly a volume
curve, which R2 already is.

## Decision

> D85: Schema `0.26` gives every video node `fadeInUs` and `fadeOutUs` with the meaning of D52.2, and makes `volume` a row of the table of D65.1 for video nodes and audio clips: keyframes of linear factors from 0 to 1, multiplied with the stored volume and the fades, in the time of the holder like every animation, eased `linear` (linear in decibels between two values above 0, linear in amplitude where one of them is 0) or `hold`. The plan carries the curve, `audioLayout` places its keyframes on the sample grid, the Player follows it with exponential and linear ramps of a gain, and the Producer multiplies each such sound by an envelope that one function of `@kadrion/runtime` computes; a sound without a volume animation is mixed byte for byte as before. `SetClipFades` reaches video nodes, the animation commands reach audio clips, and no tool is added. Ducking is not an engine feature: a host computes it as volume keyframes.

### D85.1 The fades of a video (R1; amends D52.1, D52.2)

- **Fields.** A video node gains `fadeInUs` and `fadeOutUs`, written after
  `volume`, of the form of a clip's (integers from 0 to 2^53 − 1).
- **Meaning.** That of D52.2, counted in the node's lifetime
  `[startUs, startUs + durationUs)`: the gain rises linearly from 0 to 1 over
  the first `fadeInUs` and falls from 1 to 0 over the last `fadeOutUs`, also
  where the scene or the group cuts the node; 0 is no fade. Fades multiply the
  volume and the volume curve (D85.2). A fade is of the sound only: the
  picture does not fade (a host animates `opacity` for that), and no
  transition changes a gain (D56.9).
- **Rule.** `clip-fades-exceed-duration` refuses a video node whose
  `fadeInUs + fadeOutUs` exceeds its `durationUs`, reported at
  `/scenes/<s>/nodes/<n>/fadeOutUs` (or the path of a group's child). No new
  code.
- **Not heard, still stored.** A video at volume 0 or a freeze frame (D82.3)
  is not heard; its fades stay, as its volume does.
- **A cut at the start.** A video whose group starts after it is heard from
  the group's start with no fade-in, as a clip of a definition cut by its
  instance is today (D76, `definitionEntries`); its fade-out keeps its place
  in the lifetime. A fade heard from its middle at a cut is not included
  (question 10).

### D85.2 Volume keyframes (R2; amends D65.1)

A row joins the table of D65.1:

| Path     | Node types                | Value      | Mode     | Neutral | Step  |
| -------- | ------------------------- | ---------- | -------- | ------- | ----- |
| `volume` | video, audio clip (D85.8) | number 0–1 | `factor` | 1       | PR-76 |

- **Value.** A keyframe's value is a linear factor of the amplitude from 0
  to 1, the unit of `volume` (D52.1 chose it over decibels and millibels).
  It never amplifies: the sound heard is `volume × curve × fades ≤ 1`.
- **Mode `factor`.** The curve multiplies the stored `volume`, as an opacity
  animation multiplies the opacity. `SetClipVolume` and `SetVideoVolume` keep
  their meaning (the level of the whole clip), and a curve shapes it.
- **Interpolation.** Between keyframes `(t0, g0)` and `(t1, g1)`, at progress
  `p = (t − t0) / (t1 − t0)`:
  - `linear` with `g0 > 0` and `g1 > 0`: linear in decibels,
    `g = g0 · (g1 / g0)^p`, which is a straight line of `20·log10(g)`;
  - `linear` with `g0 = 0` or `g1 = 0`: linear in amplitude,
    `g = g0 + (g1 − g0) · p`, as a fade is (silence has no decibel value);
  - `hold`: `g0` until `t1`, then `g1`.

  Before the first keyframe and after the last the nearest value holds (D16).

- **Easing.** A keyframe of `volume` takes `{"kind":"linear"}` or
  `{"kind":"hold"}` only; the schema says so in the row's keyframe, so any
  other easing is a structural error of the schema and `invalid-result`
  at the bus. Both curves are the ones Web Audio defines exactly
  (`exponentialRampToValueAtTime`, `linearRampToValueAtTime`,
  `setValueAtTime`), so the Player computes no curve of its own (D85.6), and
  the product of two curves linear in decibels is linear in decibels between
  the union of their keyframe times, which a host's ducking relies on
  (D85.9; question 4).
- **Time.** Keyframe times are in the time of the holder, like every
  animation (D49.1, D82.7): scene time for a scene's clip and for a video
  node, composition time for a clip of the composition, definition time for a
  clip of a definition. A host that keeps its curve relative to the clip
  converts it when it writes the document. `MoveClip` carries them; a trim, a
  speed, and a reverse move none; a split copies them (D85.8; question 6).
- **Count.** The schema keeps no maximum on keyframes. The mix is linear in
  the number of keyframes plus the number of samples.

### D85.3 The plan (amends D52.4)

- An `AudioPlanEntry` gains an optional `volumeKeys`: the keyframes of the
  sound's `volume` animation moved into composition time by the holder's
  offset (scene start, instance offset), each `{ timeUs, value, easing }`.
  It is absent when the sound has no volume animation, so such an entry is
  that of `0.25` byte for byte.
- A video's entry carries its fades, and its `lifetimeUs` becomes the rest of
  its node's lifetime from the first instant heard, as a clip's is, so a
  fade-out cut by the scene or the group keeps its place (D85.1). No sample
  changes for a video without fades.
- A sound at volume 0 stays out of the plan, as before. A sound whose curve is
  0 everywhere stays in it: a keyframe edit never changes which sources are
  read, so it never asks the host for media facts (D53.4).
- The plan stays pure, knows no sample rate, and lives in `@kadrion/schema`
  (D53.1).

### D85.4 The curve on the sample grid (amends D52.5 and D53.1)

- `audioLayout` places each keyframe of `volumeKeys` on the 48 kHz grid by
  `sampleAt`, an exact half up, relative to the sound's first sample, and
  keeps those that shape the samples heard (the last at or before sample 0,
  every one inside, the first at or after the end). Two keyframes on one
  sample: the later is kept, a jump. A `SoundLayout` gains `volumeKeys` of
  `{ sample, value, easing }`, absent otherwise.
- The gain at sample `n` of the sound is the curve of D85.2 with
  `p = (n − s0) / (s1 − s0)` over the placed samples `s0 < s1`. Both hosts
  read the same placed samples, so a keyframe is at the same sample in both.
- `volumeEnvelope(sound, fromSample, count)` of `@kadrion/runtime`, in an
  entry of its own (`@kadrion/runtime/volume`) that the render page does not
  import, so it does not enter the runtime build (D21), gives those gains as
  32-bit floats. It computes `(g1 / g0)^p` with `+ − · /` and comparisons
  only, by an exponent and a logarithm in base 2 of its own (exact range
  reduction by powers of two, fixed polynomials, a relative error below
  1e-9), as D67.3 and D82.6 require of the runtime, so its output is the same
  in Node and in the pinned Chromium (question 9).
- **Split exactness.** The gain at a sample depends on the composition time of
  that sample and the keyframes only, never on the sound's start, so the two
  halves of a split hear the curve of the whole (D55.4 holds with no new
  refusal).

### D85.5 The Producer (amends D52.5)

- **Without a curve, nothing changes.** A sound with no `volumeKeys` keeps its
  chain, its inputs, and its manifest entry byte for byte; a render of a
  document without a volume animation writes the same audio and manifests as
  `main`, which every pull request that touches the pass shows in the pinned
  container.
- **With a curve.** The sound's chain gains, after its `afade` steps and
  before `adelay`, a multiplication by its envelope:
  `[s<k>pre][e<k>]amultiply[s<k>post]`, where input `e<k>` is the envelope of
  its heard samples, raw `f32le`, stereo with both channels equal (so no
  rematrix scales it), 48 kHz, written by the Producer from
  `volumeEnvelope` in chunks on an extra pipe of the FFmpeg process, held
  neither in memory nor on disk whole (question 8). The order of volume,
  fades, and curve is a product, so it is not heard beyond float rounding.
- **Speed.** A mapped sound (D82.6) is stretched first; its curve multiplies
  the stretched samples, since keyframes are in the holder's time.
- **Ranges and segments.** The audio pass computes the whole mix and cuts the
  range (D47.4), so a range hears the curve of the whole.
- **Manifests.** A sound with a curve gains an additive `volumeKeys` (the
  placed keyframes) and `envelopeSha256` (the SHA-256 of its envelope's
  bytes); the arguments name the pipe `<envelope-k>`.
  `EXPORT_MANIFEST_VERSION` stays 5 and `MANIFEST_VERSION` stays 3, as D82.6
  did for `stretch`.

### D85.6 The Player (amends D53.2)

- A sound with a curve gains one `GainNode` after its fades, whose automation
  follows the placed keyframes: `setValueAtTime` at the first sample heard
  with the gain of D85.4 there, then per segment
  `exponentialRampToValueAtTime` (both values above 0),
  `linearRampToValueAtTime` (one value 0), or `setValueAtTime` at the next
  keyframe (`hold`). A seek starts the automation from the gain at the new
  sample, as `fadeGain` does for a fade. No buffer is copied and no curve is
  computed by the Player beyond that one starting value.
- A sound without a curve keeps its graph node for node.
- **Parity.** The gate of D53.5 holds unchanged: the Player's graph rendered in
  an `OfflineAudioContext` equals the Producer's intermediate within 1e-4 per
  sample, now for a document with faded videos and curves (with a 0 keyframe,
  a `hold`, and a seek inside a ramp in decibels). The two hosts compute the
  curve by different code (the browser's ramp, the runtime's envelope), as
  they already do for fades (`afade` and `linearRampToValueAtTime`); the
  expected difference is that of 32-bit float automation, about 1e-5.

### D85.7 Schema `0.26` and the step from `0.25` (R4)

- Schema `0.26` adds `fadeInUs` and `fadeOutUs` after `volume` to every video
  node (in scenes and groups), the row `volume` to a video node's animations,
  and `animations` as the last field of every audio clip (of the
  composition, of scenes, and of definitions), a list whose only row is
  `volume`, at most one animation per property (`duplicate-animation-target`,
  D16.6). The descriptions of a video node and of a clip name the curve.
- The step writes `fadeInUs: 0` and `fadeOutUs: 0` after each video's `volume`
  and `animations: []` after each clip's `fadeOutUs`, then the version. These
  are today's sounds and today's pictures: no PNG of any golden composition
  changes, and the golden manifests change only in the three fields of D42
  (`render.schemaVersion`, `render.compositionHash`,
  `render.runtime.contentHash`, D49.7). The schema of `0.25` is kept as data
  (D35.4); the pair before and after and the compatibility corpus grow by one
  entry each (D43).
- A host's documents of `0.25` load through `migrate` and `kadrion migrate`
  as every older version does; a document of `0.26` is refused by a reader of
  `0.25` (`unsupported-schema-version`).

### D85.8 Commands and tools (R1, R3; amends D41, D46, D55)

- **`SetClipFades`** takes a `clipId` that names an audio clip or a video
  node, as the timeline commands do (D55.1, a node looked up first); any other
  node is `unsupported-node`. The arguments, the inverse, and the refusals
  (`invalid-argument`, `unknown-clip`, `invalid-result` with
  `clip-fades-exceed-duration`) are those of D52.6. No `SetVideoFades` is
  added: one command per property, and no tool (question 1).
- **Animations of an audio clip.** `AddAnimation` takes, under the same
  argument `nodeId`, the ID of an audio clip as well (IDs share one
  namespace, D16.3); a clip accepts the row `volume` only, anything else is
  `invalid-result`. `RemoveAnimation`, `AddKeyframe`, `RemoveKeyframe`,
  `MoveKeyframe`, `SetKeyframeEasing`, and `SetKeyframeValue` find an
  animation of a clip by its `animationId`. `SetKeyframeValue` accepts
  `volume` (`GENERIC_KEYFRAME_PROPERTIES`), its value a number from 0 to 1;
  an easing other than `linear` or `hold` is `invalid-result`. No new error
  code.
- **Timeline commands** (D55):
  - `MoveClip` of an audio clip moves its keyframes by the same `d`, as a
    node's (D55.3);
  - `TrimClipStart` and `TrimClipEnd` move no keyframe and keep a video's
    fades at their edges, as a clip's (D55.2); a trim that leaves less than
    both fades is `invalid-result`;
  - `SplitClip` of a video gives the first half `fadeOutUs: 0` and the second
    `fadeInUs: 0`, and refuses a split inside a fade with `split-not-exact`
    (D55.4, now for a video above volume 0 as for a clip); the second half of
    an audio clip gets copies of its animations as `<newClipId>-a-volume`;
  - `JoinClips` keeps the second's `fadeOutUs` for a video too, and compares
    the halves as before (D55.5);
  - `SetClipSpeed` moves no keyframe (D82.7) and is `invalid-result` when the
    new duration is shorter than both fades; the cut helper of D66.5 trims
    through the same rules.
- **Tools** (D46). No tool is added; the catalogue keeps 103 tools. The
  descriptions that change, and their growth as JSON of the entry, about:

  | Tool                                     | What its description gains                                                                     | Characters, about |
  | ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
  | `set_clip_fades`                         | "an audio clip or a video node's sound"; `unsupported-node`; the argument descriptions         | +150              |
  | `add_animation`                          | `volume` on a video or an audio clip: a factor 0–1 times its volume, in dB, `linear` or `hold` | +170              |
  | `set_keyframe_value`                     | `volume` in its list and its value                                                             | +130              |
  | `set_keyframe_easing`                    | "a volume keyframe takes linear or hold"                                                       | +40               |
  | `add_audio_clip`, `add_scene_audio_clip` | `animations` in the complete clip and in the examples                                          | +100              |
  | `move_clip`                              | "an audio clip's keyframes" move with it                                                       | +25               |

  The budget is measured as in D83.10: the growth of the length of the JSON
  of every tool's entry of the catalogue snapshot, all tools together, over
  the snapshot of `0.25`: at most 700 characters, held by a test of
  `packages/ai-sdk` (question 11). Every new sentence is short; the examples
  of the complete clips gain `"animations":[]` and nothing else.

- `describe_document` shows a video's fades and a clip's animations as stored
  fields; its description changes by a word at most.
- **The assistant can do what the user can** (owner, 2026-11-11): a video's
  fades through `set_clip_fades`, a curve through `add_animation`,
  `set_keyframe_value`, `move_keyframe`, `remove_keyframe`, and
  `set_keyframe_easing`.

### D85.9 Ducking is the host's, as volume keyframes

Kadrion offers no ducking. A host that lowers music under speech computes the
intervals and the envelope itself and writes them as `volume` keyframes of
the clips and video nodes concerned, in the document it renders or previews:

- **Exact composition with a user's curve.** Both curves are linear in
  decibels per segment, so their product is linear in decibels between the
  union of their keyframe times. A host writes one curve: at each time of the
  union, the product of the two values, eased `linear` (or `hold` where either
  holds). A segment that reaches 0 is linear in amplitude in both curves and
  their product is not; a host keeps the depth of ducking finite (a factor
  above 0) so that only the user's own zeros meet that case.
- **Attack and release** are the segments between the keyframe at full level
  and the keyframe at the ducked level.
- **Why not in the engine.** A compressor keyed by the signal breaks the parity
  of D53.5 (no exact `DynamicsCompressorNode`, no FFmpeg equivalent of it)
  and would make the mix depend on sample values for the first time; a
  declarative ducking needs roles of tracks the engine does not know (D01,
  D02); both would add a schema concept, commands, and tool text for what R2
  already expresses. The host's audio editor keeps one algorithm for both
  editors (question 7).
- The host guide (PR-78) shows the computation with a worked example; no
  helper is exported for it.

### D85.10 Not included

- Ducking by the engine, a compressor, a limiter, or any processing that reads
  sample values.
- Amplification: a factor above 1 in `volume` or in a keyframe (question 14).
- Easings other than `linear` and `hold` on `volume`, and a curve linear in
  amplitude between two values above 0.
- A fade of a video's sound heard from its middle where its group cuts it,
  and fades of an instance or a scene.
- Volume curves of a scene, of an instance as a whole, or of the master mix;
  pan and other parameters of sound.
- Fades of a video's picture tied to its sound's fades.
- Template bindings of fades or of a curve (D58).

## Alternatives considered

- **A command and tool `SetVideoFades`** (the host's working name) — the same
  fields under a second name, and about 1 000 characters of catalogue where
  widening `SetClipFades` costs about 150; the timeline commands and
  `SetClipSpeed` already address a video node and an audio clip by `clipId`
  (D55.1, D82.9). It stays the fallback if the owner prefers one command per
  node type, as `SetVideoVolume` and `SetClipVolume` are (question 1).
- **Keyframe values in decibels** — natural for a curve, but the document
  would hold two units of one quantity, silence would need a sentinel, and
  D52.1 rejected logarithmic units for `volume`; interpolating in decibels
  gives the curve without storing them (question 2).
- **Linear interpolation in amplitude** for every segment — simpler, but a
  ramp from 1 to 0.1 sounds like a drop at its end, not a steady fade, and the
  host asked for decibels; amplitude stays only where silence makes decibels
  meaningless (question 3).
- **Every easing of D67** — the Player would have to compute curves of its
  own, either a buffer of gains per sound (a copy of every sample of a long
  music clip, 192 KB per second per channel) or `setValueCurveAtTime`, which
  interpolates linearly between its points and errs by far more than 1e-4 on
  a ramp in decibels unless given every sample (question 4).
- **Mode `replace`** (the keyframe is the volume) — the stored `volume` would
  stop meaning anything while a curve exists, and `SetClipVolume` would no
  longer lower the whole clip (question 5).
- **Keyframes relative to the clip's start** — every other animation is in the
  holder's time (D49.1, D82.7), a split and a move would follow other rules
  for one row, and a curve under a scene's speech would move when its clip is
  trimmed (question 6).
- **Ducking in the engine** — see D85.9 (question 7).
- **The envelope as a temporary file** — 384 KB per second of a curved sound
  on disk (an hour of music is about 1.4 GB); a pipe costs nothing at rest.
  **An `aeval` expression** of the keyframes — no file, but an expression
  that grows with the keyframes and is evaluated per sample with FFmpeg's
  own `pow`. **The Producer multiplies decoded samples itself**, as for a
  stretch — the whole heard range in memory for a long clip (question 8).
- **`Math.pow` in the envelope** — shorter, but implementation-approximated
  (D67.3), so the envelope's SHA-256 could change with the Node version of a
  host's render machine (question 9).
- **A new tool for volume keyframes** (`set_volume_keyframe`) — the generic
  keyframe command exists for every row (D65.2); a tool costs more than the
  whole budget of D85.8.

## Consequences

- A host's film gets faded video sound and volume curves, the same in the
  preview and the export, and ducks music by writing keyframes it already
  computes; it pins one release.
- `@kadrion/schema`: version `0.26`, the step, the frozen `0.25`, the fields,
  the row, the clip's `animations`, the rule for a video's fades, and the plan
  with `volumeKeys`.
- `@kadrion/runtime`: `audioLayout` with placed keyframes, and the entry
  `@kadrion/runtime/volume` with `volumeEnvelope`. The runtime build changes
  with the schema, so Q14 reopens and parity is measured again (D34).
- `@kadrion/producer`: the `amultiply` step, the envelope pipe, and the
  additive manifest fields. `@kadrion/player`: the curve's gain node; the
  Player's dist tree changes.
- `@kadrion/editor-sdk` and `@kadrion/ai-sdk`: `SetClipFades` on videos, the
  animation commands on clips, the timeline rules, six descriptions, the
  budget test. `@kadrion/editor-session` and `@kadrion/cli`: nothing of their
  own (`kadrion migrate` gains the step with the schema).
- Package boundaries (D12) do not change: the plan stays in the schema, the
  grid and the envelope in the runtime; the bus still depends on neither
  runtime nor host. Nothing names a host (D01, D02).
- Known costs: a curved sound costs the Producer one envelope computed per
  sample and an extra input of the pass; the Player schedules one automation
  event per placed keyframe.

## Verification

- `packages/schema/test`: the step's pair and the corpus `compatibility/v0-26`;
  `clip-fades-exceed-duration` on a video node and on a group's child; a
  volume animation on a clip and a video, refused on any other node, with an
  easing other than `linear` or `hold`, and twice on one clip; the plan by
  hand with `volumeKeys` in a scene, a definition, and a group, and a video's
  fades cut by its scene and by its group.
- `packages/runtime/test`: the placement of keyframes on the grid (halves,
  two on one sample, keyframes before and after the sound); `volumeEnvelope`
  against an independent reference in exact rationals and `BigInt` with a
  logarithm to 30 digits, within 1e-9 relative, on seeded curves with zeros,
  holds, and long ramps; the same SHA-256 of a fixed set of envelopes in Node
  and in the pinned Chromium; a split of a curved sound at a multiple of
  125 µs hears the same gains as the whole.
- `packages/producer/test`: the graph with and without a curve (byte for byte
  without), the pipe's bytes, and the manifests.
- `packages/player/test`: the recording double of Web Audio schedules the
  ramps of every segment kind, from the start and from a seek inside a ramp.
- `packages/editor-sdk/test` and `packages/ai-sdk/test`: `SetClipFades` on a
  video, on a clip, on another node; the animation commands on a clip; the
  timeline rules of D85.8, each undone byte for byte; the catalogue snapshot;
  the budget of 700 characters; a fixture of model requests ("fade the
  interview's sound in over one second", "lower the music to 20% from 0:10 to
  0:20 with half a second each way", "make the music hold at half volume
  after 0:30"), each checked by `executeTool`.
- `tests/pinned`: the mix test of D52.7 gains a faded video and two curved
  clips (one mapped by D82), its positions stated by hand, summed in
  TypeScript from the decoded sources and the envelopes, within 1e-5 of the
  intermediate; the parity of D53.5 for the same document from sample 0 and
  from a sample inside a ramp; every golden PNG file byte for byte; the
  golden manifests changed in the three fields of D42 alone.

## Implementation plan

The pull requests follow PR-73 in phase six (roadmap). Each is approved on its
own, before it starts and again before its commit and push, and the rules of
phase six hold for them. Sizes are those of the roadmap: S under 500 changed
lines, M 800 to 1 500, L 2 000 to 3 000, tests included.

| Order | PR    | Subject                                                   | Schema | Runtime build | Player dist | Q14 | Size |
| ----: | ----- | --------------------------------------------------------- | ------ | ------------- | ----------- | --- | ---- |
|     1 | PR-74 | D85 (documents only)                                      | —      | —             | —           | —   | S    |
|     2 | PR-75 | The volume curve on the grid and the envelope (library)   | —      | no (checked)  | —           | —   | M    |
|     3 | PR-76 | Schema `0.26`: a video's fades and volume curves, mixed   | `0.26` | yes           | yes         | yes | L    |
|     4 | PR-77 | Commands and tools: fades of a video, a clip's animations | —      | —             | —           | —   | S    |
|     5 | PR-78 | The host guide, ducking as keyframes, and the release     | —      | —             | —           | —   | S    |

- **PR-74.** This document, its row in the index, and the roadmap's entries.
  Acceptance: the owner answers the questions below; `node --run
format:check` and `tests/repo/adr.test.ts` pass. No code; no impact on Q14,
  the runtime build, parity, or golden frames.
- **PR-75.** The placement of keyframes on the grid and `volumeEnvelope`, as
  functions over explicit arguments in the entry `@kadrion/runtime/volume`,
  which the main entry, the render page, and the Player do not reach, so the
  runtime build and the Player's dist tree keep their bytes (checked by their
  hashes, as PR-59, PR-65, and PR-70 did); the exponent and logarithm of
  D85.4 with their reference tests; a pinned check that the pinned FFmpeg's
  `amultiply` of a sound by an envelope on a pipe equals the product in
  TypeScript, and that Chromium's `exponentialRampToValueAtTime` in an
  `OfflineAudioContext` equals the envelope within 1e-5. No field, no host
  change.
- **PR-76.** The step from `0.25`, the frozen `0.25`, the fields, the row, the
  plan with `volumeKeys` and a video's fades, `audioLayout`, the Producer's
  chain, pipe, and manifests, the Player's gain node, and the existing
  timeline commands carrying a video's fades and a clip's animations as D85.8
  says (so that no command of `main` breaks a document of `0.26`); the mix
  test and the parity of the Verification; the complete-clip examples of the
  tools. D52, D53, D55, and D65 get their lines; D35 its step. Q14 reopens and
  closes by the evidence of its CI run; parity is measured again; no golden
  PNG file changes.
- **PR-77.** `SetClipFades` on a video node, `AddAnimation` and the keyframe
  commands on a clip, `volume` in `SetKeyframeValue`, the six descriptions,
  the budget test, and the fixture of model requests. D41 and D46 get their
  lines. No runtime build or Player dist change.
- **PR-78.** The host guide (sound section) and the README: a video's fades,
  volume curves and their two interpolations, ducking computed by the host as
  keyframes with the exact product of two curves (D85.9), the costs; every
  package at version `0.9.0` for the release `v0.9.0`, whose tag the owner
  pushes from `main`; the host flow on the released tarballs.

## Questions for the owner, with recommendations

1. **The command for a video's fades.** Recommendation: widen `SetClipFades`
   to a `clipId` that names a video node, as the timeline commands and
   `SetClipSpeed` address both (D55.1, D82.9); no `SetVideoFades` and no new
   tool, about 150 characters of catalogue instead of about 1 000. If the
   owner prefers the host's working name, `SetVideoFades {nodeId, fadeInUs,
fadeOutUs}` with its tool `set_video_fades` under 600 characters, and the
   budget of question 11 rises to 1 500.
2. **The unit of a keyframe.** Recommendation: a linear factor from 0 to 1, the
   unit of `volume`; decibels only in how it moves (D85.2).
3. **Interpolation.** Recommendation: linear in decibels between two values
   above 0, linear in amplitude where one of them is 0, as R2 asks and as a
   fade already moves.
4. **Easings of a volume keyframe.** Recommendation: `linear` and `hold` only,
   enforced by the schema, so that the Player follows the curve with Web
   Audio's exact ramps and two curves compose exactly; other easings are a
   later step if a host asks.
5. **How a curve meets the stored volume.** Recommendation: mode `factor`, the
   curve multiplied with `volume` and the fades, neutral 1.
6. **Where keyframe times live.** Recommendation: in the holder's time like
   every animation (D49.1, D82.7): `MoveClip` carries them, a trim, a speed,
   and a reverse move none, a split copies them. The host's wording "in the
   clip's lifetime" is read as "over the clip's lifetime"; a host that keeps
   times relative to the clip converts them when it writes the document.
7. **Ducking.** Recommendation: not in Kadrion; the host computes it as volume
   keyframes (D85.9), with its existing algorithm, and the host guide shows
   the exact product of a ducking curve and a user's curve. It keeps the mix
   independent of sample values and the parity of D53.5, and adds no schema,
   command, or tool.
8. **How the Producer applies a curve.** Recommendation: an envelope streamed
   on an extra pipe and multiplied by `amultiply`, a sound without a curve
   unchanged byte for byte; a temporary file is the fallback if the pipe
   proves fragile in PR-75, recorded there.
9. **The arithmetic of the envelope.** Recommendation: `+ − · /` only, with an
   exponent and a logarithm in base 2 of Kadrion's own (D67.3, D82.6), so the
   envelope's SHA-256 does not depend on the engine that runs it.
10. **A video cut at its start by its group.** Recommendation: heard with no
    fade-in, as a definition's clip cut by its instance; an exact fade from
    its middle is a later change of the grid for both kinds.
11. **The catalogue budget (R3).** Recommendation: at most 700 characters of
    growth over the snapshot of `0.25`, all tools together, held by a test, as
    D83.10; about 615 are expected.
12. **The roadmap.** Recommendation: PR-74 to PR-78 in phase six, after PR-73,
    as D83 and D84 joined it; a phase seven only when the owner names a new
    direction.
13. **The release (R4).** Recommendation: `v0.9.0` after PR-78, one release
    with the schema step; the owner pushes the tag.
14. **Amplification.** Recommendation: none: keyframes and `volume` stay at
    most 1 (D52.1); a host that wants a louder clip normalises its asset.
