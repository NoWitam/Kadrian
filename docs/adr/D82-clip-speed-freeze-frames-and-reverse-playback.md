# D82 — Clip speed, freeze frames, and reverse playback: a rational time map, schema 0.24

- Status: Accepted — by the project owner on 2026-11-11 (PR-58), before any
  code, with the recommendations of all fifteen questions; question 1 is
  completed by the multiplier notation of D82.11 and question 12 is confirmed
  (see "Questions for the owner")
- Date: 2026-11-11
- Supersedes: —
- Extends: D49 (49.1 trims and splits, 49.5 the source time, 49.8 "speed
  changes, reverse playback" leave the list of what is not decided), D50.5
  (the Producer's decode seeks to an IDR picture), D51.4 and D79.5 (the
  Player keeps the frames of a decode run), D52.4 and D52.5 (the plan and the
  mix of a sound at another speed or reversed), D53.2 (the Player plays such
  a sound), and D55 (55.2, 55.4, and 55.5: trims, splits, and joins through
  the time map; two commands and a helper), each with an
  `Amended by: PR-58 (D82)` line written on acceptance that names the pull
  request from which it is in force. D35 (the step from `0.23` to `0.24`) and
  D46 (three tools) get their lines from PR-61 and PR-62, as every schema step
  and every tool before them
- Related: D04, D12, D13, D18, D30, D34, D35, D38, D46, D47, D48, D56, D57,
  D65.4, D66, D67, D76, D77, D79, D80, D81,
  [roadmap of phase six](../roadmap/phase-6.md) PR-58 to PR-63

## Context

A host's video editor needs three things on its timeline that the engine does
not have: a clip played faster or slower (0.25× to 4×, with its sound), a
frame held for a while (a freeze frame), and a clip played backwards, picture
and sound. D49 left all three out on purpose: "Speed changes and reverse
playback are outside this model; a later speed would be a rational factor in
the same integer rule" (D49.5), and D49.8 lists them among what it does not
decide. Phase four deferred "a playback rate other than 1 (its audio would need
resampling, which no ADR covers)" (PR-38), and phase five carried it as a debt.

What the repository has, read on 2026-11-11 at `main` `685fbfc` (`v0.6.0`,
schema `0.23`, after D81):

- **One rule for source time.** A video node and an audio clip carry
  `sourceStartUs`, "speed is 1" in their schema descriptions. At scene time
  `u` a video shows `sourceTimeUs(node, u) = sourceStartUs + (u − startUs)`
  (`packages/schema/src/source-frame.ts`), and the frame is
  `sourceFrameIndex`: the last frame at or before that integer time, compared
  in `BigInt` (D49.5). The runtime puts the source time in the state
  (`VideoState.sourceTimeUs`, `packages/runtime/src/evaluate.ts`); the Player
  (`packages/player/src/video.ts`) and the Producer
  (`packages/producer/src/video.ts`) choose the frame by the same functions.
  `sampledSourceRange` gives the range the bus and both hosts check against
  media facts (D49.6; `packages/editor-sdk/src/media.ts`).
- **Instances use the same rule** for definition time (`definitionTimeUs`,
  `packages/schema/src/definitions.ts`, D65.4, D76); a definition holds no
  video node (76.1), but it holds audio clips (76.5).
- **The audio plan** (`packages/schema/src/audio-plan.ts`, D52.4, D53.1) gives
  each heard sound a `sourceStartUs` "heard at `startUs`; speed is 1", cut to
  its scene, group, or instance by moving that start. `audioLayout` of
  `@kadrion/runtime` puts it on the 48 kHz grid, and the Producer's audio pass
  reads each source with `aresample`, `aformat`, and `atrim` by samples
  (`audioPassGraph`, `packages/producer/src/segments.ts`, D52.5). The Player
  plays the same layout with `AudioBufferSourceNode`s from buffers the browser
  decoded whole (D53.2); parity is measured at 1e-4 per sample (D53.5).
- **Decoding.** The Player decodes every frame on its own, from the last
  sample that holds an IDR picture up to the frame (D79.5), and keeps the PNG
  of the last four frames of each video. The Producer runs one FFmpeg decoder
  per node that reads forward from frame 0 and is restarted from frame 0 to go
  back (`frameOf` in `packages/producer/src/video.ts`): showing a clip
  backwards would decode the source from its start once for every frame.
- **Edits.** `TrimClipStart`, `TrimClipEnd`, `SplitClip`, and `JoinClips`
  (D55) keep the frames that remain exactly where they were, because the map
  is `+ (u − startUs)`; a split of a heard sound is refused with
  `split-not-exact` off the 125 µs grid (D55.4). The cut helper of D66.5 trims
  clips to make a transition's overlap.

Speed, freeze, and reverse are one subject: each is a different map from scene
time to source time. Deciding them together keeps one rule in the schema, one
place in each host, and one schema step.

## Decision

> D82: A video node and an audio clip map scene time to source time by an exact rational time map: a speed `{num, den}` from 1/4 to 4, or 0 for a freeze frame of a video, an exact source start (`sourceStartUs` and a remainder in units of `1/den` µs), and `reverse`, which plays the same source range backwards. The source time shown is the floor of the exact map, in integer microseconds, and the frame is chosen from it by D49.5 unchanged. Trims, splits, and joins move the map exactly. A sound at another speed or reversed keeps its pitch and is computed by one pure function of `@kadrion/runtime` that the Producer and the Player share; a sound at speed 1 forward stays byte for byte. The Player keeps the frames of each decode run, and the Producer seeks to an IDR picture to go back. Schema `0.24` adds the fields with a step that gives every clip speed 1, remainder 0, and `reverse: false`. Hosts, the documents, and the AI tools show and accept a speed as a multiplier such as `x0.5` or `x2`, converted to the exact rational or refused, never rounded.

### D82.1 The time map (amends D49.1 and D49.5)

- **Fields.** A video node and an audio clip gain three fields, written after
  `sourceStartUs` in this order:
  - `sourceStartRemainder`: an integer from 0 to `den − 1`. The exact source
    time at the clip's `startUs` is `sourceStartUs + sourceStartRemainder / den`
    microseconds.
  - `speed`: `{ num, den }`, integers, `den` from 1 to 1 000 and `num` from 0
    to 4 000, in lowest terms. Either `num = 0` and `den = 1` (a freeze frame,
    D82.3; a video node only), or `1/4 ≤ num/den ≤ 4`, checked as
    `4·num ≥ den` and `num ≤ 4·den`.
  - `reverse`: a boolean; `false` for a freeze frame.

  Lowest terms make every speed one JSON text, so two documents that mean the
  same are the same bytes (D30.7). A violation is `speed-invalid`, a semantic
  error of the schema. A person or a model reads and writes a speed as a
  multiplier (`x0.5`, `x2`); the document keeps the rational (D82.11).

- **The forward map.** For elapsed time `e = u − startUs`, `0 ≤ e < durationUs`:

  ```text
  F(e) = sourceStartUs + ⌊(sourceStartRemainder + e · num) / den⌋
  ```

  in `BigInt`, as D13 and D49.5 compute.

- **The source time shown** at scene time `u` is `F(e)` for a clip played
  forwards and `F(durationUs − 1 − e)` for a reversed one. A reversed clip
  therefore samples exactly the source range the same clip samples forwards,
  and shows it from its last instant to its first.

- **Speed 1, remainder 0, forwards** gives `sourceStartUs + e`: D49.5 exactly.

- **The frame at a source time that is not a whole microsecond.** The exact map
  is rational; the source time shown is its floor, an integer (D04), and the
  frame is the last frame at or before it by `sourceFrameIndex`, unchanged.
  Where a frame's presentation time lies within the microsecond below the
  exact source time, the frame before it is shown; both hosts show the same
  one, because both compute the same integer.

- **Sampled source range** (D49.6). With the lifetime cut to the scene,
  `c = min(durationUs, sceneDurationUs − startUs)`, a forward clip samples
  `F(0)` to `F(c − 1)` and a reversed one `F(durationUs − c)` to
  `F(durationUs − 1)`, as the half-open range `[first, last + 1)`. A freeze
  frame samples one microsecond.

- **The functions** stay in `@kadrion/schema` beside the frame grid (D13.3,
  D49.5): `sourceTimeUs` and `sampledSourceRange` keep their names and
  parameters and read the new fields; new are `clipTimeMap` (the exact affine
  map of a clip, for the audio function of D82.6 and the commands of D82.9)
  and `sceneTimesOfSource` (the scene times at which a source time is shown,
  an interval that may be empty), so that a host or a model can move timed
  words onto a clip at another speed (D82.7).

### D82.2 Edits move the map exactly (amends D49.1, D55.2, D55.4, D55.5)

- **Advancing the map** by `d` microseconds of scene time, `d` of either sign:

  ```text
  q = sourceStartRemainder + d · num
  sourceStartUs'        = sourceStartUs + ⌊q / den⌋
  sourceStartRemainder' = q mod den          (in [0, den))
  ```

  Then `F'(e) = F(e + d)` for every `e`, with no rounding: the remainder
  carries the fraction a microsecond of source time cannot hold.

- **The commands of D55**, for a clip with a source:

  | Command              | Forwards                                                 | Reversed                                                             |
  | -------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
  | `TrimClipStart` by d | `startUs + d`, `durationUs − d`, the map advanced by `d` | `startUs + d`, `durationUs − d`, the map unchanged                   |
  | `TrimClipEnd` by d   | `durationUs + d`                                         | `durationUs + d`, the map advanced by `−d`                           |
  | `SplitClip` at d     | first `d` long; second from `startUs + d`, advanced `d`  | first `d` long, advanced `durationUs − d`; second from `startUs + d` |
  | `MoveClip`           | unchanged (D55.2)                                        | unchanged                                                            |

  A trimmed or split clip shows, at every scene time it still covers, the
  frame the clip showed there before: the guarantee of D49.1 and D55.4 holds at
  every speed and in both directions. `JoinClips` stays "exactly what a split
  would make" (D55.5), now through this table. A freeze frame advances by 0.
  A map advanced below 0 is `source-range-exceeded` (D55.6).

- **Sound** keeps the rule of D55.4 at speed 1 forwards. At another speed or
  reversed it follows D82.6; a split of such a sound is refused with
  `split-not-exact` wherever its halves would not be heard sample for sample as
  the whole.

### D82.3 A freeze frame is speed 0

- A video node with `speed: { num: 0, den: 1 }` shows the frame at
  `sourceStartUs` for its whole lifetime; its remainder is 0 and `reverse` is
  `false`.
- Its sound is not heard: the audio plan leaves it out whatever its `volume`,
  which stays in the document so that a speed other than 0 restores it.
- An audio clip at speed 0 is `speed-invalid`: silence is a gap, not a clip.
- Trims and splits of a freeze frame change only its lifetime, so it has room
  for any transition at a cut (D66.5).

### D82.4 Decoding backwards in the Player (amends D51.4 and D79.5)

- The frame chosen at every instant is the one of D82.1; how the Player
  decodes it changes, its pixels do not.
- **The run cache.** A decode starts at the last IDR sample at or before the
  frame (D79.5) and passes every frame after it in decode order. The Player
  keeps the decoded planes (I420) of every frame of that run that the
  composition samples, by video and frame index, in a cache bounded by bytes
  (256 MiB per Player, least recently used runs evicted first). A frame found
  in the cache is converted (`yuv420ToRgb`), turned (D81), and encoded as a
  frame decoded afresh; decoding is exact (D51.4), so the PNG is the same.
- So a reversed clip decodes each group of pictures once instead of once per
  frame, and forward playback gains the same; a group longer than the budget
  is decoded again in parts, slower but with the same pixels.
- Real-time reverse playback is not promised: the preview clock paces requests
  (D25.6, D53.2) and shows what is ready, as for any slow source.

### D82.5 Decoding backwards in the Producer (amends D50.5)

- **Going back seeks.** When the frame a node needs lies before the decoder's
  position, the Producer no longer restarts from frame 0: it starts a decoder
  at the last sample at or before that frame that holds an IDR picture, by the
  rule of D79.5 (the NAL check `holdsIdr` moves from the Player to
  `@kadrion/renderer-dom`, where both hosts' shared code lives, D81.1), with
  an input seek to that sample's presentation time, and counts presentation
  indices from it.
- **A window.** The RGB of the frames from that IDR up to the frame needed is
  kept for at most 64 frames; frames below the window start a new decode at the
  IDR before them. A reversed clip costs one decode of each group of pictures
  when the group is at most 64 frames, and about `G² / 128` decoded frames for
  a group of `G` frames beyond that. Memory stays bounded by the window.
- **No `reverse` filter.** FFmpeg's `reverse` holds every frame of its input in
  memory (about 3.1 MB per 1080p frame in 4:2:0, so 5.6 GB for a minute at
  30 fps), and the Producer does not filter video with FFmpeg at all: it
  decodes to RGB and hands PNG files to the page (D50.4, D50.5, D81).
- **Manifest.** The render manifest keeps the forward `decodeArgs`; a job that
  seeks records the seek's arguments in an additive field `seekArgs`, absent
  otherwise, so `MANIFEST_VERSION` stays 3 and a render that never goes back
  writes the same bytes as today (as D80.2 did for `grid`).
- **Segments and fragments** (D47, D80). Every job opens its own frame source
  and needs nothing from another; the grid, ranges, the join, and their
  manifests do not change. A reversed clip makes the segments it covers
  slower, which the estimate of D48.5 does not model.

### D82.6 Sound at another speed or reversed (amends D52.4, D52.5, D53.2)

- **Speed 1 forwards is unchanged.** Its plan entry, its FFmpeg chain, its
  manifest, and the Player's graph stay byte for byte. Everything below applies
  to a sound whose speed is not 1 or that is reversed.
- **The pitch is kept.** The sound is time-stretched, not resampled: a voice
  at 1.5× sounds like the same voice speaking faster. Resampling, where the
  pitch follows the speed, is a later option (question 9).
- **One function.** `stretchSound` of `@kadrion/runtime`, beside `audioLayout`
  (D53.1), computes the samples a mapped sound plays at 48 kHz from the
  source's decoded samples at 48 kHz, in the source's own channels, before
  any upmix (D53: a mono source is copied at `√½` afterwards, as today). It is
  pure, uses `+ − · /` and comparisons only (no `Math.cos`, `Math.pow`, or FFT,
  as D67.3), and gives the same 32-bit floats in Node and in the pinned
  Chromium. It is not imported by the render page, so it does not enter the
  runtime build (D21).
- **The algorithm.** A waveform-similarity overlap-add (WSOLA): windowed
  grains of a fixed length, overlapped by half, each read from the source near
  the exact source time of its centre, shifted within a fixed search radius to
  the position whose samples best match the source's own continuation, by a
  correlation summed in a fixed order. At speed 1 reversed, the sound is the
  source's samples in reverse order, with no grains.
- **Anchored grains.** Grain `k` is centred at a fixed sample of composition
  time counted from where the clip's map would read source time 0, and its
  shift depends only on the source and `k`, never on the grains before it.
  The samples heard are then a function of the map, not of the clip's
  lifetime: both halves of a split, a trimmed clip, a sound cut by its scene or
  an instance, a seek in the Player, and every range or fragment of the
  Producer (D47.4, D80.3) hear the same samples as the whole. The grain length,
  the window, and the search radius are constants fixed in PR-59 by its quality
  check (question 11); a later change of them changes output samples and is an
  ADR of its own.
- **The plan.** An `AudioPlanEntry` of a mapped sound carries the map of its
  clip (speed, reverse, the exact source start, the lifetime's start), so a
  cut never changes the samples heard, as `lifetimeUs` already keeps fades. Its
  heard source range is checked against facts as in D53.4, from the map.
- **The Producer.** For each mapped sound, FFmpeg decodes the source range the
  grains read (the heard range and the search radius) to 32-bit float at
  48 kHz in the source's channels; `stretchSound` computes the samples heard,
  which are written to a temporary 32-bit float WAV, and that file is the
  sound's input in `audioPassGraph`, read from sample 0. Upmix, volume, fades,
  delay, and the mix are unchanged. The audio manifest's sound gains an
  additive `stretch` (`speed`, `reverse`, and the SHA-256 of the computed
  samples), absent otherwise; `EXPORT_MANIFEST_VERSION` stays 5.
- **The Player.** From the buffer it decoded (D53.2), the Player computes the
  samples of a mapped sound from the sample the play starts at to the end of
  what it hears, keeps them by asset and map, and schedules them as one
  `AudioBufferSourceNode` on the grid, as any sound. A seek computes from the
  new position only, because grains are anchored.
- **Parity.** The gate of D53.5 holds: the Player's graph rendered in an
  `OfflineAudioContext` equals the Producer's intermediate within 1e-4 per
  sample, now for a composition with mapped sounds too; and `stretchSound`
  itself gives the same SHA-256 in Node and in the pinned Chromium.
- **Reversed sound** has no FFmpeg `areverse`: the function reads the grains
  backwards. Its memory is the decoded source range, in both hosts.
- **A limit.** A reversed clip samples at most 600 000 000 µs (10 minutes) of
  source, a semantic rule of the schema (`speed-invalid`), so a reversed sound
  holds at most about 230 MB of samples in the Producer (stereo, 32-bit) and a
  reversed video is not asked of a host for longer. A wider bound is a
  relaxation (D15).

### D82.7 What else the map touches

- **Keyframes stay in scene time** (D49.1). They animate the box, the effects,
  and the crop, not the source; a speed, a freeze, or a reverse moves none. A
  host that wants an animation to follow a changed duration moves keyframes in
  the same transaction (`MoveKeyframe`, D38).
- **Clip transitions** keep the overlap of D56.3. The cut helper of D66.5
  trims through the map: a forward clip that starts earlier reads source
  earlier by `d · speed`, a reversed one reads later source, a freeze frame
  always has room; a missing handle is `source-range-exceeded` as before.
  Scene transitions do not change.
- **Instances** (D76). Definitions hold no video node (76.1), so no instance
  shows a mapped video. Audio clips of a definition may be mapped, and are
  heard through the instance's own map at speed 1, which composes with
  theirs. An instance gets no speed or reverse in this step.
- **Captions linked to speech** (D57, D77.4). Words are in scene time and the
  document links them to no source, so a speed or a reverse moves no word. A
  host or a model retimes words with `sceneTimesOfSource` and
  `SetCaptionWords` in the same transaction; reversed speech has no words to
  show, which is the host's choice.
- **Groups, effects, masks, crop, fit, and orientation** (D42.4, D71, D75,
  D68, D50, D81) do not change: a mapped video is still one image per frame.
- **The segment grid** (D80) and still frames (D47.7) do not change.

### D82.8 Schema `0.24` and the step from `0.23`

- Schema `0.24` adds the three fields of D82.1 to every video node (in scenes
  and groups) and every audio clip (of the composition, of scenes, and of
  definitions), with the semantic rules of D82.1, D82.3, and D82.6. The
  descriptions of `sourceStartUs` lose "speed is 1".
- The step writes `sourceStartRemainder: 0`, `speed: { num: 1, den: 1 }`, and
  `reverse: false` after each `sourceStartUs`. It changes no time value, so the
  golden PNG files of every reference composition stay byte for byte and the
  golden manifests change only in `render.schemaVersion`,
  `render.compositionHash`, and `render.runtime.contentHash` (D42, D49.7). The
  schema of `0.23` is kept as data (D35.4); the pair before and after and the
  compatibility corpus grow by one entry each (D43).
- The runtime's state keeps its shape: `sourceTimeUs` of a video is the source
  time of D82.1.

### D82.9 Commands and tools (amends D55)

| Command          | Arguments                                                                 | Effect                                                                                                                                                                                                                                                  | Inverse                                                    |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `SetClipSpeed`   | `clipId`, `speed`, optional `durationUs`, optional `sourceStartRemainder` | keeps `startUs`, `sourceStartUs`, and `reverse`; `durationUs` becomes the one given or, by default, `⌈durationUs · old / new⌉`, which covers the same source span (kept when either speed is 0); the remainder is scaled to the new `den`, rounded down | `SetClipSpeed` with the old speed, duration, and remainder |
| `SetClipReverse` | `clipId`, `reverse`                                                       | keeps the lifetime and the sampled source range (D82.1); refused for a freeze frame                                                                                                                                                                     | `SetClipReverse` with the old value                        |

- Both address a video node or an audio clip by `clipId` (D55.1); any other
  clip is `unsupported-node`. A changed source range is checked against facts
  (D49.6, D53.4): `media-facts-missing` or `source-range-exceeded`.
- **`freezeFrame`** is a helper of `@kadrion/editor-sdk`, like the cut helper of
  D66.5: it returns the commands of one transaction, so it is one undo.
  `freezeFrame(document, { clipId, atUs, holdUs, mode, newClipIds })` holds
  the frame the clip shows at `atUs` for `holdUs`:
  - `overwrite`: `SplitClip` at `atUs` and at `atUs + holdUs`; the middle clip
    becomes a freeze frame of the source time shown at `atUs` (`SetClipReverse`
    `false`, `SetVideoSource`, `SetClipSpeed` to 0). Nothing else moves.
  - `insert`: `SplitClip` at `atUs`; a freeze frame of `holdUs` is added
    between the halves (`AddNode`, with the animations a split copies, D55.3);
    the second half moves later by `holdUs` (`MoveClip`). No other clip moves:
    a ripple of the rest of the timeline is the host's (D49.8).
  - Refusals: `invalid-argument`, `unknown-clip`, `unsupported-node` for
    anything but a video node, `time-outside-clip`, `id-in-use`, and whatever
    the commands refuse.
- **The existing commands** read the map: `TrimClipStart`, `TrimClipEnd`,
  `SplitClip`, and `JoinClips` by D82.2; `SetVideoSource` and `SetClipSource`
  set `sourceStartUs` and keep the remainder; the cut helper by D82.7; the
  checks of `checkSourceRanges` and `checkSounds` by the sampled range of
  D82.1 and the plan of D82.6.
- **The `speed` argument** of `SetClipSpeed` is a multiplier, a number, or
  `{ num, den }`, converted by `parseSpeed` when the bus parses the command
  (D82.11); the document, the patch, the inverse, and the history hold the
  exact `{ num, den }` only.
- **Tools** (D46): `set_clip_speed` and `set_clip_reverse` are derived from the
  metadata, `freeze_frame` is a helper tool as `add_clip_transition_at_cut`
  is, so the catalogue grows by three. A speed is a multiplier in every tool
  (D82.11), and the descriptions list the common ones (`x0.25`, `x0.5`,
  `x1.5`, `x2`, `x1/3`, and `x0` for a freeze of a video).
  `describe_document` states each clip's speed in the same notation, its
  `reverse`, and its sampled source range. A model never sees
  `sourceStartRemainder` unless it reads the document itself; the commands
  keep it.
- **The assistant can do what the user can** (owner, 2026-11-11). Each of the
  three edits is a tool: a speed (and a freeze by `x0`) through
  `set_clip_speed`, a reverse through `set_clip_reverse`, and a freeze frame of
  either mode through `freeze_frame`; the existing timeline tools (trim,
  split, join, move, and the transition at a cut) work on mapped clips through
  the same commands. No edit of this ADR is reachable through the bus and not
  through a tool.

### D82.10 Not included

- A speed that changes over time (ramps, time-remapping curves), and frame
  blending or optical flow: the frame shown is always one source frame.
- Speeds outside 1/4 to 4 other than the freeze (question 1).
- Resampling with the pitch following the speed (question 9).
- Speed or reverse of an instance, a scene, Custom HTML, or captions.
- A playback rate of the Player's preview as a whole (the debt of PR-38): the
  same function could serve it, but it is a Player option, not a document field.
- Automatic retiming of captions or of an element's timed words.
- Ripple edits, and computing the stretch in a worker of the Player.
- Seeking at the first frame of a forward segment job (a speed-up of long
  sources that would change the manifests of today's renders).

### D82.11 A speed written as a multiplier (owner, 2026-11-11)

The owner's answer to question 1: "Zapis prędkości np: x0.5 lub x2" (write a
speed as, for example, x0.5 or x2). The document keeps the exact rational of
D82.1; every place a person or a model reads or writes a speed uses the
multiplier.

- **The notation.** `x` followed by the speed: its decimal when the decimal
  ends, in the shortest form (`x0.25`, `x0.5`, `x1.5`, `x2`), and otherwise
  its fraction in lowest terms (`x1/3`, `x2/3`, `x4/3`). A freeze frame is
  `x0`. Reverse is never a sign: it is `reverse` (D82.1).
- **Two functions of `@kadrion/schema`**, beside `clipTimeMap`:
  `formatSpeed(speed)` gives the notation of a valid speed, and
  `parseSpeed(value)` gives the exact `{ num, den }` or a refusal.
  `parseSpeed(formatSpeed(s))` is `s` for every valid speed. A host uses them
  for its controls and the host guide shows them; the commands and the tools
  use them as below.
- **What `parseSpeed` reads.**
  - A string: white space around it is ignored, then an optional `x` (`x`,
    `X`, or `×`), then either a decimal (digits with at most one `.`) or a
    fraction `<integer>/<integer>`. No sign, exponent, or inner space.
  - A JSON number, through its shortest round-trip decimal
    (`Number::toString` of ECMA-262, so `0.5` reads as `"0.5"`, never as the
    binary expansion of a double), then as that string. Every number from 1/4
    to 4 prints without an exponent; one that prints with an exponent is out of
    bounds.
  - An object `{ num, den }` of integers, `den ≥ 1`.

  A decimal with `n` digits after the point is exactly its digits over `10ⁿ`;
  every value is reduced to lowest terms by the greatest common divisor in
  `BigInt`. So `x0.5` is `1/2`, `1.25` is `5/4`, `x0.333` is `333/1000`, and
  `{ num: 2, den: 4 }` is `1/2`.

- **No exact small rational: refused, never snapped.** A value whose lowest
  terms have `den` above 1 000 (`x0.3333` is `3333/10000`; `0.1 + 0.2` prints
  as `0.30000000000000004`) is refused with `speed-invalid`, and the refusal's
  message names the nearest speed with `den` up to 1 000 in the notation (the
  best rational approximation by continued fractions, the smaller `den` on a
  tie): "x0.3333 has no exact speed with a denominator up to 1000; the nearest
  is x1/3". The reasons:
  - a stored speed is exactly the one asked for, or nothing: a snapped speed
    would change the clip's new duration (`⌈durationUs · old / new⌉`, D82.9)
    and its source span without the caller knowing, and the document would
    hold a value no one wrote;
  - every multiplier with at most three decimals is exact, since its `den`
    divides 1 000, which covers every speed a control offers (`x0.25`,
    `x0.333`, `x1.75`); a longer decimal is nearly always a rounded fraction,
    which the caller states exactly as `x1/3`;
  - a model retries in one call with the speed the message names, and a host
    can offer the same speed to its user.
- **Other refusals**, each `speed-invalid`: a speed below `x0.25` other than
  `x0`, above `x4`, negative, not finite, or not in the notation; `x0` for an
  audio clip (D82.3). A value of another JSON type is refused by the tool's
  schema with `invalid-argument` (D46.4).
- **The command takes it.** `speed` of `SetClipSpeed` is one `anyOf` of a
  number, a string, and an object, as `value` of `SetKeyframeValue` is (D68);
  the bus converts it by `parseSpeed` when it parses the command. The
  conversion therefore lives in the command, so `set_clip_speed` stays derived
  from the metadata and adds nothing to the arguments (D46.2), and a host's
  control and a model reach the same command (`AGENTS.md`: both use the same
  command bus).
- **What a model reads.** The descriptions of `set_clip_speed` and
  `freeze_frame` state the notation with examples (`"x0.5"`, `2`, `"x1/3"`,
  `"x0"`), and `describe_document` shows each clip's `speed` in the notation
  (`"x1.5"`) in place of the stored object.

| Input                                          | Stored                         | Shown    |
| ---------------------------------------------- | ------------------------------ | -------- |
| `"x0.5"`, `0.5`, `"0.5"`, `{ num: 1, den: 2 }` | `{ num: 1, den: 2 }`           | `x0.5`   |
| `"x2"`, `2`, `"X2"`, `"×2"`                    | `{ num: 2, den: 1 }`           | `x2`     |
| `"x1/3"`, `{ num: 1, den: 3 }`                 | `{ num: 1, den: 3 }`           | `x1/3`   |
| `"x0.333"`                                     | `{ num: 333, den: 1000 }`      | `x0.333` |
| `"x0"`, `0` (a video node)                     | `{ num: 0, den: 1 }`           | `x0`     |
| `"x0.3333"`                                    | refused, the nearest is `x1/3` | —        |
| `"x0.2"`, `"x5"`, `"x-2"`, `"fast"`            | refused, out of bounds or form | —        |

## Alternatives considered

- **A speed as a JSON number** (`1.5`) — a double cannot hold 1/3 or 1.1, the
  map would round in floating point at every instant, two hosts could disagree
  near a frame boundary if one ever computed in another order, and a split
  could not be exact. D49.5 announced a rational factor.
- **Splits and trims refused off a grid of `den`** instead of a remainder — the
  frame grid of a 30 fps composition (33 333 µs, 66 667 µs, …) is rarely a
  multiple of `den`, so a host would see refusals for ordinary cuts at 1/4×.
  Rounding instead would move the source by less than a microsecond, which
  breaks D49.1's "exactly" and the byte-for-byte join of D55.5.
- **The exact rational in the frame rule** (compare `(pi − p0) · … · den`
  with the map's numerator) — one fewer rounding, but the state's
  `sourceTimeUs` would no longer name the instant chosen, and D49.5's function
  and its tests would change for a difference below a microsecond.
- **A freeze field** (`freezeAtUs`) — a second way to state a map that speed 0
  already states, with its own rules for trims and splits.
- **A freeze as an image the host extracts** — a new asset and its bytes for
  every freeze, a link to the source lost (no unfreeze, no trim into the
  video), and nothing a model can do through the tools.
- **Reverse as a negative speed** — toggling it would change `sourceStartUs` as
  well (the start of the range becomes its end), the bounds become two
  intervals, and a host's "reverse" toggle stops being one field.
- **The Producer reverses with FFmpeg** (`reverse`, `areverse`) — the video
  filter holds the whole clip in memory and the Producer does not filter video
  with FFmpeg (D82.5); `areverse` would be exact for sound at speed 1, but
  every other speed needs the shared function anyway, and one path is simpler.
- **The Producer restarts from frame 0 to go back** (today) — a reversed
  minute of a 30 fps source decodes about 1.6 million frames.
- **FFmpeg's `atempo` or `rubberband` in the Producer, the browser's
  `playbackRate` or `preservesPitch` in the Player** — two algorithms that no
  measurement could bring within 1e-4 of each other, and `playbackRate`
  resamples, so the pitch would follow the speed. `rubberband` would also need
  a build of FFmpeg with the library, which the pinned build does not promise.
- **Sequential WSOLA** (each grain aligned with the grain before it) — slightly
  better sound, but the samples would depend on where the clip starts, so a
  split, a cut by a scene, or a seek in the Player would change them; a split
  of a heard mapped sound would always be refused (D55.4).
- **Speed on video nodes only** — a host that detaches the sound of a video
  into an audio clip (a common edit) could not keep it in sync.

## Consequences

- A host shows slow motion, fast motion, freeze frames, and reversed clips,
  picture and sound, the same in its preview and its export, and edits them
  with the commands it already uses.
- `@kadrion/schema`: version `0.24`, the step, the map functions,
  `parseSpeed` and `formatSpeed`, the semantic rules, the plan's mapped
  entries. `@kadrion/runtime`: `stretchSound`. The
  runtime build changes with the schema, so Q14 reopens and the parity records
  are measured again (D34).
- `@kadrion/renderer-dom`: `holdsIdr` moves there from the Player (D82.5).
- `@kadrion/player`: the run cache, mapped sounds. Its dist tree changes.
- `@kadrion/producer`: the backward decode with its seek, mapped sounds,
  additive manifest fields. Renders of documents without a mapped clip keep
  their bytes.
- `@kadrion/editor-sdk` and `@kadrion/ai-sdk`: two commands, a helper, three
  tools, and the existing timeline commands through the map;
  `@kadrion/test-fixtures`: a composition with mapped clips and its golden
  frames.
- Package boundaries (D12) do not change; nothing names a host (D01, D02).
- Known costs: a reversed clip with long groups of pictures is slow to render
  and to preview; a long mapped sound costs the Player time when a play starts
  and the Producer memory for its source range; the estimate does not see
  either.

## Verification

- `packages/schema/test`: the map against an independent rational reference
  for every speed of a seeded set, forwards and reversed; advancing by any `d`
  equals the map at `e + d`; the sampled range; every refusal of
  `speed-invalid`; the step's pair and the corpus; `parseSpeed` on every row
  of the table of D82.11, `parseSpeed(formatSpeed(s))` equal to `s` for every
  valid speed with `den` up to 1 000, and the nearest speed a refusal names
  against a brute-force search over every `den` up to 1 000.
- `packages/editor-sdk/test`: for 2 000 seeded clips, speeds, and directions,
  a trim or a split shows the same source time at every scene time it still
  covers, and a split followed by its join is the identity byte for byte;
  `SetClipSpeed` with every form of speed of D82.11, `SetClipReverse`, and
  `freezeFrame` undone byte for byte; the refusals; the catalogue snapshot
  with three more tools; `executeTool` reaching each of speed, freeze frame,
  and reverse (D82.9).
- `packages/runtime/test`: `stretchSound` on fixed signals (silence, a sine,
  speech of the fixtures): the length heard, the halves of a split equal to
  the whole, speed 1 reversed equal to the samples reversed, and the pitch of a
  sine kept within 1 % by its zero crossings (a report, not a gate of quality).
- `packages/producer/test` and `packages/player/test`: a backward request
  served from the window, the run cache, and their bounds, with fakes.
- `tests/pinned` (pinned FFmpeg and Chromium): every frame decoded after a seek
  equals the frame of the forward decode byte for byte for the video fixtures
  in MP4, fragmented MP4, MOV, and MKV, turned or not; the golden frames of the
  new composition with clips at 1/4×, 1/2×, 3/2×, 4×, reversed, and frozen; the
  parity of D34 at zero for it; `stretchSound` with the same SHA-256 in Node
  and in Chromium; the Player's audio graph within 1e-4 of the Producer's
  intermediate (D53.5); and every earlier golden PNG file byte for byte.

## Implementation notes (PR-59)

PR-59 adds the two shared functions over explicit arguments, before any field
uses them; nothing in this section is in force for a document before PR-61.

- **Two entries until PR-61.** The map is the entry `@kadrion/schema/time-map`
  and the stretch the entry `@kadrion/runtime/stretch`, so that the main
  entries, which the render page and the Player import, reach neither: the
  runtime build and the Player's dist tree keep their bytes, as the roadmap
  plans for PR-59. PR-61 makes the main entry of the schema read the map.
- **The map** (D82.1, D82.2, D82.11) is `packages/schema/src/time-map.ts`:
  `clipTimeMap`, `sourceTimeOfScene` (the floor rule; `sourceTimeUs` reads it
  from PR-61), `sceneTimesOfSource`, `clipSourceRange` (the sampled range;
  `sampledSourceRange` reads it from PR-61), `advanceClipSource`, `parseSpeed`,
  `formatSpeed`, and `speedProblem`. `clipTimeMap` gives the continuous map
  `(intercept + slope · u) / den`, `slope` negative when reversed; the time
  shown at the instant `u` is the floor of the lower end of the image of
  `[u, u + 1)`, which is `F(e)` forwards and `F(durationUs − 1 − e)` reversed.
  A trim, a split, and a join leave it unchanged.
- **Helpers for a host** (asked by the host for PR-59, within D82.1 and
  D82.6): the scene-to-source map both ways (`sourceTimeOfScene`,
  `sceneTimesOfSource`), the range the picture samples (`clipSourceRange`),
  and the source range the sound reads (`stretchSourceRange` of
  `@kadrion/runtime/stretch`, in samples and in microseconds), exported and listed in
  the host guide (section 4). `stretchSourceRange` lives beside `stretchSound`
  because it depends on the grain constants, and `@kadrion/schema` depends on
  no other package (D12).
- **The constants of `stretchSound`** (D82.6, question 11), at 48 kHz: a
  grain of 1 024 samples (21⅓ ms), two grains overlapping at every sample (a
  hop of 512); the window fades a grain's first half in by `x² · (3 − 2x)`
  and its second half out by `1 −` that, so every sample's two fades sum to 1;
  a search radius of 512 samples (10⅔ ms), searched in two passes, every
  second shift scored over every second sample, then the best and its two
  neighbours over every sample; and a block of 32 grains (341⅓ ms of
  composition). At speed 1 there are no grains in either direction. The
  constants are exported (`STRETCH_GRAIN`, `STRETCH_HOP`, `STRETCH_RADIUS`,
  `STRETCH_SEARCH_STEP`, `STRETCH_BLOCK`), and the SHA-256 of 24 fixed cases
  is pinned in `packages/runtime/test/stretch.sha256.json`, so a change of
  them is seen.
- **How "anchored" is read (question 11; confirmed by the owner on
  2026-11-11 at 13:30 Europe/Warsaw).** The
  strict reading of D82.6, a shift that depends on nothing but the source and
  `k` with each grain aligned to the continuation of the grain before it at
  its nominal position, keeps no phase between grains on a pitched sound: two
  neighbours are as far apart in phase as with no search at all. The quality
  check measured it beside the two others (the `nominal` column below).
  `stretchSound` therefore chains the shifts as sequential WSOLA does, within
  blocks of 32 grains counted from the grain at the map's anchor, and restarts
  the chain once per block, unshifted, at the grain whose nominal samples hold
  the least energy, where a jump of phase is least heard. The shift of grain
  `k` is still a function of the source, the map, and `k` alone, so the
  property D82.6 asks for holds and is tested: the halves of a split, any
  range, and the range read from `stretchSourceRange` give the same samples
  as the whole, byte for byte. What it costs: a range reads source up to two
  blocks before its first sample (about 683 ms of composition, times the
  speed), and computing it starts up to 63 grains early.
- **The quality check.** `packages/runtime/test/stretch-quality.test.ts`
  stretches the synthetic speech and music fixtures (2 s, generated in
  `@kadrion/test-fixtures`, no recording committed) at the six speeds three
  ways and reports the mean deviation of the level from the source's, in
  10 ms windows (lower is better; cancellation where grains overlap shows as
  lost level). On 2026-11-11, in Node 22:

  | Fixture | Speed | Anchored (D82.6 as built) | Sequential | Nominal (strict reading) |
  | ------- | ----- | ------------------------- | ---------- | ------------------------ |
  | speech  | x0.25 | 1.24 dB                   | 1.27 dB    | 2.11 dB                  |
  | speech  | x0.5  | 1.21 dB                   | 1.34 dB    | 1.94 dB                  |
  | speech  | x0.75 | 1.07 dB                   | 1.19 dB    | 1.47 dB                  |
  | speech  | x1.5  | 1.18 dB                   | 1.20 dB    | 1.72 dB                  |
  | speech  | x2    | 1.13 dB                   | 1.15 dB    | 2.19 dB                  |
  | speech  | x4    | 1.19 dB                   | 1.19 dB    | 1.70 dB                  |
  | music   | x0.25 | 0.81 dB                   | 0.81 dB    | 2.19 dB                  |
  | music   | x0.5  | 0.81 dB                   | 0.78 dB    | 1.99 dB                  |
  | music   | x0.75 | 0.92 dB                   | 0.81 dB    | 1.07 dB                  |
  | music   | x1.5  | 0.91 dB                   | 0.82 dB    | 1.54 dB                  |
  | music   | x2    | 1.02 dB                   | 1.12 dB    | 1.70 dB                  |
  | music   | x4    | 0.88 dB                   | 1.08 dB    | 1.70 dB                  |

  The measure is a report, not a gate; the owner decides by ear. With
  `KADRION_STRETCH_RECORDINGS=<directory>` the same test writes every sound
  as a 16-bit WAV file (the source, and each speed anchored, sequential,
  nominal, and reversed) with `report.json`. The fixtures are synthetic; the
  owner may wish to hear a real voice too before the constants are final.

- **Node and Chromium.** `tests/pinned/stretch.pinned.test.ts` compares the
  SHA-256 of the 24 cases in the pinned Chromium with Node's and with the
  pinned file, and writes `stretch/node-vs-chromium.json`; it is a pinned
  test file added while Q14 is open.
- **The runtime build** keeps its bytes
  (`sha256:c4b856ed6f5abb5810c45559b105f63ca51d9709a59fa833b9990a37dd3d8c13`),
  and so does the Player's dist tree: neither reaches the two entries.

## Implementation notes (PR-60)

PR-60 changes how the two hosts decode a frame, not which frame they show;
no field uses it before PR-61, and a request in descending order (D47.7)
already exercises it.

- **`holdsIdr`** moves from the Player to `@kadrion/renderer-dom`
  (`video-idr.ts`, exported); the render page does not import it, so the
  runtime build keeps its bytes
  (`sha256:c4b856ed6f5abb5810c45559b105f63ca51d9709a59fa833b9990a37dd3d8c13`).
- **The Player's run cache** (D82.4) is `RunCache` in
  `packages/player/src/video.ts`, 256 MiB (`RUN_CACHE_BYTES`), one per Player
  for its whole life: runs are kept by the content hash of the video, so they
  outlive a load or an update of the document. A run keeps only the frames of the sampled source ranges of the
  document's video nodes (D49.6), and the frame asked for always; within a run
  the frames of the lowest index are let go first while the run holds more than
  the budget, so a group of pictures longer than the budget is decoded again in
  parts. A frame another run already holds is not kept twice. The PNG cache of
  the last four frames of each video stays in front of it.
- **The IDR pictures in the Producer** (D82.5, D79.5) are read by the pinned
  FFmpeg once per video, when a frame loop first goes back: `ffprobe` gives the
  `avcC` record and every packet's time, size, and key flag; `ffmpeg -c:v copy
-bsf:v noise=drop=not(key) -f data` gives the bytes of the key packets, and
  `holdsIdr` keeps those that hold an IDR slice. A source that is not H.264 in
  `avcC` form (an Annex B stream in MPEG-TS), or whose passes disagree, has no
  known IDR picture, and the Producer goes back by starting again from frame 0,
  as before PR-60. An open group of pictures has an IDR picture only at its
  first frame, so it goes back the same way.
- **The seek** is `-seek_timestamp 1 -ss <start> -i <input>` before the
  decode arguments of D50.5 (`videoSeekArgs`), `<start>` the presentation time
  of the IDR picture in whole microseconds rounded down (`seekStart`); the
  container's start time is not subtracted. Checked with the pinned FFmpeg on
  the fixture in MP4, fragmented MP4 (its first time 1 024), MOV, and MKV:
  every frame from the seek equals the forward decode's frame byte for byte.
- **The window** of 64 frames (`DECODE_WINDOW_FRAMES`) exists for a node only
  after it first went back, so a render that never goes back keeps no more
  frames than before; it holds the RGB of the last 64 frames its decoder read.
- **`seekArgs`** is written, with the placeholders `<input>` and `<start>`,
  only when a frame loop of the render seeked; a seek to frame 0 is a plain
  decode and does not count. A join compares the decode of its parts without
  `seekArgs` (a range job that went back is a part of the same render) and
  keeps it in the export manifest when any part has it.
- **Tests.** The cache's bounds and eviction and the window's bound are unit
  tests; `tests/pinned/video.pinned.test.ts` renders every frame of the fixture
  backwards in each container and in the turned fixtures of D81.4 and compares
  them with the forward render, and `tests/pinned/player-video.pinned.test.ts`
  shows them backwards in the Player against the Producer. `REMUXES` moves to
  `tests/pinned/video-fixture.ts` for both, so a pinned file changes and Q14
  reopens, as the roadmap plans.

## Implementation notes (PR-61)

PR-61 is the schema step: a document of `0.24` states a speed, a freeze frame,
or a reverse on a video node or an audio clip, and both hosts render it.

- **The step from `0.23`** (`step-0-23-to-0-24.ts`) adds
  `sourceStartRemainder: 0`, `speed: { num: 1, den: 1 }`, and
  `reverse: false` to every video node and audio clip, in scenes, in groups,
  in definitions, and in the composition's clips, after `sourceStartUs`; an
  instance has none. The frozen `0.23` schema is `src/v0-23/`. A definition of
  a document of `0.22` or `0.23` is validated as one of `0.24` with the
  defaults added (`withSpeedOne`), so it is judged as its own version judged it.
- **`speed-invalid`** names a speed outside 1/4 to 4 that is not 0, a
  denominator above 1 000, a fraction not in lowest terms, a remainder not below
  its denominator, a frozen audio clip, a frozen clip reversed, and a reversed
  clip that samples more than 600 000 000 µs of source.
- **The main entry** of the schema re-exports `time-map.ts`;
  `sourceTimeUs` and `sampledSourceRange` read the map, and a plan entry at
  another speed or reversed carries `map`, the clip's map in composition time
  (`shiftedTimeMap`). A sound at speed 1 forwards has no `map` key, so its plan
  and the audio manifest keep their bytes.
- **The Producer** (`packages/producer/src/stretch.ts`) decodes the source
  range `stretchSourceRange` names to 32-bit floats with the pinned FFmpeg,
  computes the sound with `stretchSound`, and writes it to a temporary 32-bit
  float WAV that is the sound's input of the audio pass, read from sample 0;
  the manifest records `stretch` (speed, direction, and the SHA-256 of the
  samples). The module writes files, so `eslint.config.js` lists it beside
  `video.ts` as a module allowed to.
- **The source's length.** The Producer reads a mapped sound's source only up
  to the length its first audio stream states (`duration_ts` at its rate,
  `statedSourceSamples`), and the grains hear silence past it, as they do in the
  Player, whose decode holds that length: the pinned FFmpeg decodes the AAC
  sound of the video fixture to 144 384 samples where the stream states, and
  Chromium decodes, 144 000, and the padding of the last frame would otherwise
  reach the last millisecond of a sound read to the end of its source.
- **The Player's subpath imports.** The Player's build imports
  `@kadrion/runtime/stretch`, which imports `@kadrion/schema/time-map`; the
  conformance host, the pinned pages that load the Player, and the playground
  map both (`HOST_ENTRIES` in `tests/parity/parity.ts`), and the Player's dist
  tree of D33.10 includes their files.
- **The Player** computes the same samples from its decoded buffer and plays
  them as one `AudioBufferSourceNode` from offset 0 at the sound's first
  sample; a seek plays the same buffer from the seek's offset. The computed
  buffers are kept per Player (`StretchCache`, not exported from the
  package) by the sound's map, for its decoded buffer, over the samples they
  hold, so a play that starts inside them computes nothing. `scheduleSounds` keeps its signature; the Player
  calls `scheduleSoundsWith`, which is internal. `SoundContext` gains
  `createBuffer`, the one change of the Player's public surface.
- **editor-sdk.** `TrimClipStart`, `TrimClipEnd`, `SplitClip`, and `JoinClips`
  move the map by `advanceClipSource` as the table of D82.2 states; a join of
  reversed parts takes the source of the second and is checked by splitting it
  again. The checks of source ranges read the range a sound hears.
  `describe_document` states `speed` as a multiplier (`"x1.5"`), `reverse`, and
  `sampledSourceRange` after it, without `sourceStartRemainder`.
- **The corpus.** Each corpus document of `0.23` that only had an expectation
  gets an entry `X-0-23` (as in PR-56), so every file of `v0-23/` is named.
- **The speed composition** (`speed.json`) holds video nodes at 1/4, 1/2, 3/2,
  and 4, one reversed, and one frozen, an audio clip at 1/2 and one reversed at
  3/2. `tests/pinned/speed.pinned.test.ts` compares the Producer's frames with
  the Player's forwards and backwards, with its golden frames, and the Player's
  graph in an `OfflineAudioContext` with the Producer's intermediate within
  1e-4; it is a pinned file added while Q14 is open. Its golden frames are
  written by `node --run goldens:update` in the pinned container; PR-61 does
  not commit them from another environment.
- **The runtime build** changes
  (`sha256:a37aae1ca7c49be1a80ed1d29eb5bebecc019dde36a61d36319380a637d45129`):
  the golden manifests change in the three fields of D42 only, every golden PNG
  file keeps its bytes, and the parity records are measured again in the pinned
  container.

## Questions for the owner, with recommendations

Answered by the owner on 2026-11-11 at 10:44 (Europe/Warsaw): every question
as recommended, which accepts this ADR. Question 1 is completed: the
representation stays the rational `{num, den}` and hosts, the documents, and
the AI tools show and accept a speed as a multiplier such as `x0.5` or `x2`
(D82.11; a multiplier with no exact speed of `den` up to 1 000 is refused with
the nearest one named, not snapped). Question 12 is confirmed: audio clips get
speed and reverse too. The owner added a rule for the tools: the assistant must
be able to do everything the user can, so speed, freeze frame, and reverse are
each an AI tool (D82.9; PR-62 of the roadmap of phase six).

1. **The representation and bounds of a speed.** Recommendation: a rational
   `{num, den}` in lowest terms, `den` up to 1 000, from 1/4 to 4, and 0 for a
   freeze frame; wider bounds later as a relaxation. Answered on 2026-11-11:
   as recommended, written and read as a multiplier (`x0.5`, `x2`) by D82.11.
2. **Exact trims and splits.** Recommendation: the field `sourceStartRemainder`
   (D82.1, D82.2), so that every edit keeps its frames at any speed, rather than
   refusing cuts off a grid of `den`.
3. **The frame at a source time between microseconds.** Recommendation: the
   floor of the exact map in integer microseconds, then D49.5 unchanged.
4. **The freeze frame.** Recommendation: speed 0 on a video node, silent,
   with `freezeFrame` as a transaction helper in two modes, `overwrite` and
   `insert`; not a separate field and not an image extracted by the host.
5. **Reverse.** Recommendation: a boolean `reverse` that plays the same source
   range backwards, not a negative speed.
6. **Reverse in the Player.** Recommendation: a cache of decode runs bounded
   at 256 MiB per Player; real time not promised.
7. **Reverse in the Producer.** Recommendation: a seek to the IDR picture
   before the frame and a window of 64 frames; no FFmpeg `reverse` filter.
8. **A maximum length of a reversed clip.** Recommendation: 10 minutes of
   source per reversed clip, picture or sound, as a semantic rule of the schema.
9. **Pitch.** Recommendation: time-stretch with the pitch kept, the only mode
   in `0.24`; resampling (pitch follows the speed) later as a field of its own.
10. **Who computes the sound.** Recommendation: Kadrion's own pure
    `stretchSound`, shared by the Player and the Producer, with the gate of
    D53.5 (1e-4); not FFmpeg's `atempo` or `rubberband`, not the browser's
    `playbackRate`.
11. **Anchored or sequential grains.** Recommendation: anchored grains, so
    splits, cuts, and seeks hear the same samples; if the quality check of
    PR-59 finds them clearly worse than sequential WSOLA on speech, the owner
    decides again with the recordings.
12. **Audio clips.** Recommendation: speed and reverse on audio clips too, in
    the same step (no freeze for audio), so detached sound stays in sync.
    Answered on 2026-11-11: confirmed.
13. **Keyframes.** Recommendation: they stay in scene time; no command scales
    them.
14. **Captions and instances.** Recommendation: no link from words to a source
    and no automatic retiming (Kadrion exports `sceneTimesOfSource`); no speed
    on instances in this step.
15. **One schema step.** Recommendation: one version, `0.24`, for all three
    features, with the step of D82.8.
