# D52 — Audio: clips, volume, fades, and the mix in the Producer

- Status: Accepted — by the project owner on 2026-11-01, after PR-29a was merged
- Date: 2026-10-31
- Supersedes: —
- Extends: D16 (any number of clips, their new fields, `volume` on video
  nodes), D29 (29.6: the audio graph, the checks before the render, the private
  copies, the export manifest), D35 (the step from `0.3`), D46 (six tools), D47
  (47.4 and 47.8: the audio pass of several sounds, `EXPORT_MANIFEST_VERSION`
  5), D49 (49.7: no `muted`), and D50 (50.1: the sound of a video), each with
  an `Amended by: PR-29a (D52)` line
- Amended by: PR-29b (D53) on 2026-11-01: 52.4 (the plan lives in `@kadrion/schema`, re-exported by the runtime; the sample grid in the runtime) and 52.6 (the bus checks the ranges of clips and of the sound of videos) (D53.1, D53.4)
- Amended by: PR-30 (D54) on 2026-11-01: 52.4: the plan holds the clips of each scene, placed at the scene start and cut to its end (D54.3)
- Related: D04, D13, D14, D15, D17, D19, D30, D38, D42, D43, D48,
  [roadmap of phase three](../roadmap/phase-3.md) PR-29

## Context

D49 decided that `0.4` adds any number of composition clips, a source start,
a gain and fades on clips, and the sound of a video node, by a step that keeps
every document sounding as before (D49.7). It left to this ADR the unit of the
gain, the shape of a fade, what a clip past its source does (roadmap, PR-29),
and the fields, commands, and checks.

Three findings of the implementation shape the decision:

- **The schema subset has no boolean.** D17 lists the keywords the validator
  supports; `type: "boolean"` is not among them. D49.7 named `muted: true` as
  the step's value for a video node. A boolean would widen the schema subset for
  a value that `volume: 0` already states.
- **Playback in the Player is a change of its own.** The Producer mixes with the
  pinned FFmpeg it already verifies (D29.1). The Player needs Web Audio in the
  host window, a clock of its own that follows seeks, delivery of audio bytes to
  the host, and audio media facts read by `editor-session`. Each is reviewable
  alone, as with video (D50, D51), so PR-29 is split: **PR-29a** (this ADR) is
  the schema, the audio plan, the commands, and the mix in the Producer;
  **PR-29b** is playback in the Player and audio media facts at the bus, and
  amends this ADR where it says so.
- **An encoder's assembly differs between CPUs.** A fixture made with FFmpeg's
  AAC encoder gave different bytes on a CPU with AVX-512 and one without, as
  x264 did before (D50.8). `-cpuflags 0` turns FFmpeg's assembly off for every
  codec and makes the bytes equal (measured on the pinned build).

## Decision

> D52: Schema `0.4` gives every clip `sourceStartUs`, `volume`, `fadeInUs`, and `fadeOutUs`, allows any number of clips, and gives every video node a `volume`, where 0 is silent; a pure audio plan in `@kadrion/runtime` says what is heard when, and the Producer turns it into an FFmpeg mix with every position a sample count; six commands edit audio; the Player plays nothing until PR-29b.

### D52.1 Schema `0.4`

- **Clips.** `clips` has no `maxItems`. A clip is `id`, `type: "audio"`,
  `assetId`, `startUs`, `durationUs`, `sourceStartUs`, `volume`, `fadeInUs`,
  `fadeOutUs`, all required, in that order.
  - `sourceStartUs` is an integer from 0 to 2^53 − 1: the source time heard at
    `startUs`; speed is 1 (D49.1).
  - `sourceStartUs + durationUs − 1` must be a safe integer
    (`source-time-out-of-range`), as for a video node (D50.1).
- **Volume.** `volume` is a number from 0 to 1 inclusive: a linear factor of
  the amplitude. 0 is silent and 1 is the source as it is. A volume never
  amplifies, so a mix of sources that do not clip can clip only by their sum.
- **Video nodes.** Every video node has a `volume` of the same form. A video
  node above 0 is heard from the source time it shows, at that volume. There is
  no `muted`: `volume: 0` is the silent video (D49.7 is amended).
- **Order.** Clips are mixed by adding, so their order is not heard. The order
  is kept, as every list is (D16).
- **Error code.** The semantic rule `clip-fades-exceed-duration` refuses a clip
  whose `fadeInUs + fadeOutUs` exceeds its `durationUs`. It is reported at
  `/clips/<i>/fadeOutUs`.
- **What validates, renders** (D16.2): a field arrives in the version whose
  pull request renders it. The Producer renders every field of `0.4`. The
  Player renders the picture of `0.4` as before and plays no sound until
  PR-29b. It never did play sound (D25.2), so no document sounds different in
  the Player.

### D52.2 Fades

A fade is linear and counted in the clip's whole lifetime
`[startUs, startUs + durationUs)`, also where the composition cuts the clip:

- the gain rises from 0 to 1 over the first `fadeInUs`;
- it falls from 1 to 0 over the last `fadeOutUs`;
- 0 is no fade.

A clip that the composition cuts is therefore heard with the part of its
fade-out that lies before the cut, and a template can shorten a composition
without changing how a clip sounds where it is heard. Fades multiply the
volume. A video node has no fades in `0.4`; transitions (PR-32) decide how a
picture and its sound enter and leave.

### D52.3 The step from `0.3`

The step adds, as last fields:

- `volume: 0` to every video node, children of groups included;
- `sourceStartUs: 0`, `volume: 1`, `fadeInUs: 0`, `fadeOutUs: 0` to every clip.

It then sets the version. These values sound as `0.3` did: a video node of
`0.3` is silent (D50.1), and a clip of `0.3` plays its asset from the start
at full amplitude. The golden frames of both reference compositions stay byte
for byte. Their manifests change only in `render.schemaVersion`,
`render.compositionHash`, and `render.runtime.contentHash` (D49.7). The frozen
`0.3` schema, its reference, and its invalid cases join the compatibility
corpus. `compatibility/v0-3` keeps its bytes, and `compatibility/v0-4` is new
(D35.4, D43.6).

### D52.4 The audio plan

`@kadrion/runtime` exports `audioPlan(composition)`, a pure function of the
document, like the state of D19. It returns `{ durationUs, entries }`. Each
entry holds:

- `kind` (`clip` or `video`), `id`, and `assetId`;
- `startUs` and `durationUs`, which is what is heard, at least 1 µs and cut at
  the composition's end;
- `sourceStartUs` and `volume`;
- `lifetimeUs`, the lifetime its fades are counted in;
- `fadeInUs` and `fadeOutUs`.

Clips come first and then video nodes, each in document order. Several rules
decide what is in the plan:

- A sound at volume 0 is left out, so its source is never read. So is a sound
  whose lifetime lies wholly at or after the composition's end.
- A video in a group is heard only while the group is active (D42.4), from
  the source time its node shows then (D49.5).
- An end is cut by subtraction only, so every value stays a safe integer
  however far a lifetime reaches.

The last rule repairs the debt of phase two: the end of a clip was computed as
a sum, which threw an untyped `RangeError` beyond 2^53 − 1. Both hosts use the
plan: the Producer now, and the Player in PR-29b. The plan knows no sample
rate, no media fact, and no clock.

### D52.5 The mix in the Producer (amends D29.6 and D47.4)

- **Sample grid.** Every time of an entry is placed on the 48 kHz grid by the
  rule of D29.6, in `BigInt`, with an exact half rounded up.
  - A sound occupies the samples from the sample of its start up to the sample
    of its end, and its source is read from the sample of `sourceStartUs`.
  - A fade runs from the sample of its first instant up to the sample of its
    end. A fade of no sample is no fade, and a fade-out that begins after the
    last sample heard is left out.
  - A sound of no sample is not heard.
- **Graph.** Each sound passes through the following steps, in order:
  1. `aresample` and `aformat` to stereo float at 48 kHz;
  2. `atrim` of its source samples, then `asetpts`;
  3. `volume=<v>:precision=float`, left out at 1;
  4. `afade` in and out, with `curve=tri` (linear) and positions in samples;
  5. `adelay` to its start sample, then `apad` and `atrim` to the composition's
     samples.

  Several sounds are summed by `amix` with `normalize=0`, so nothing is divided
  by their number. The audio pass of a range then cuts the range's samples
  (D47.4).

- **Sources.** Each sound reads a private copy of its verified source, written
  like a video's (D50.5) and removed when the pass ends. A source is read by
  path, not on a pipe, because an MP4 with its sound cannot be read from one.
- **Before the render**, with the pinned `ffprobe` on the same copies, every
  heard sound must meet these rules:
  - Its source has exactly one audio stream with a sample rate
    (`audio-invalid`).
  - For a video, the audio stream starts at the same instant as the video
    stream (`audio-invalid`), so source time 0 is one instant for picture and
    sound.
  - The decoded samples cover every source time it is heard at:
    `samples × 1 000 000 ≥ (sourceStartUs + durationUs) × rate`, in `BigInt`.
    A shorter source is `source-range-exceeded`, the code of a video's range
    (D49.6), where it was `audio-invalid`.
- **Nothing heard.** A composition with nothing heard has no audio stream,
  even if it has clips. A clip at or after the end is no longer `audio-invalid`
  (D29.6): it is outside the composition, like a node there.
- **Manifests.** `ManifestAudio` and the audio pass record `sampleRate`,
  `totalSamples`, and `sounds`, the placed plan. Each sound holds `kind`, `id`,
  `assetId`, `assetHash`, `volume`, `startSample`, `sampleCount`,
  `sourceStartSample`, `fadeIn`, and `fadeOut`. The arguments name the sources
  `<sound-k>`. `EXPORT_MANIFEST_VERSION` is 5. `MANIFEST_VERSION` stays 3,
  because a render of frames hears nothing.

### D52.6 Commands and tools

Six commands join the closed registry (D38.1). Each has its arguments schema,
AI metadata, and tool (D46):

- **`SetVideoVolume {nodeId, volume}`** sets the volume of a video node.
- **`AddAudioClip {index, clip}`** inserts a complete clip, copied as exact
  data like a node (D39.1). Its inverse is `RemoveAudioClip`.
- **`RemoveAudioClip {clipId}`** removes a clip. Its inverse restores the same
  clip at the same index.
- **`SetClipVolume {clipId, volume}`** sets the volume of a clip.
- **`SetClipFades {clipId, fadeInUs, fadeOutUs}`** sets both fades in one
  command, so the rule of D52.1 never stands between two edits.
- **`SetClipSource {clipId, assetId, sourceStartUs}`** sets the asset and the
  source start in one command, since a new source usually needs a new start.

The bounds come from the schema. The new error code `unknown-clip` names a
clip that the document does not have.

The roadmap named a gain command `SetClipGain`. Its name follows the field,
`volume`. Moving or trimming a clip in time belongs to the timeline commands of
PR-31; until then, a clip is moved by removing it and adding it again in one
transaction.

The bus does not check a clip's source range against media facts in PR-29a.
`editor-session` reads facts of video only (D51.7), so a check would refuse
every clip. The Producer refuses a source that is too short before the first
frame (D52.5). PR-29b adds audio facts and the check of D49.6 for clips and
for the sound of videos.

### D52.7 Fixtures and verification

- **Video with sound.** A second fixture video has sound: the picture of the
  first and three seconds of a 440 Hz sine in AAC. It is made by the pinned
  FFmpeg with `-cpuflags 0` and x264's `asm=0`, and accepted only with its
  committed SHA-256 (D50.8). The bytes never enter Git.
- **The mix.** A pinned test renders the audio pass of a document with these
  sounds:
  - two clips from generated WAV sources, mono and stereo, with a source start,
    a volume, and fades, one of them cut by the end;
  - a silent clip;
  - the sound of a video node.

  The test states the sample positions by hand from D52.5. It sums the mix in
  TypeScript from the sources as the pinned FFmpeg decodes them, and requires
  the 32-bit float intermediate to equal it within `1e-5`. Measured: `3e-8`.

- **Refusals.** Unit tests cover the plan, the grid, and every error before a
  pass. A pinned test runs `audio-invalid` for a video without sound and
  `source-range-exceeded` for a short source.

## Alternatives considered

- **`muted` as a boolean** (D49.7): the schema subset would need a type it does
  not have for a value that `volume: 0` states. A video that is muted at a
  volume would also hold two fields for one fact.
- **Gain as an integer in millibels** (roadmap): an integer is exact in JSON,
  but silence is then a special value, a model must think in logarithms, and
  every host converts it before Web Audio and FFmpeg can use it. A number from 0
  to 1 is what both take, and D15 allows numbers where the value is a factor,
  as opacity is.
- **Fades counted in the heard part:** a clip cut by the composition would then
  sound different when only the composition's length changes. The lifetime is
  the clip's own time, as a node's animations use composition time (D41).
- **One process per sound, then a mix:** more processes and intermediates for a
  sum that `amix` does exactly.
- **Playback in the Player in the same pull request:** see Context; the Player
  has no audio path yet, and its review is that of a clock, not of a mix.

## Consequences

- `@kadrion/schema`: version `0.4`, the frozen `0.3` schema, the step, and
  `clip-fades-exceed-duration`. `@kadrion/runtime`: `audioPlan`.
  `@kadrion/producer` depends on `@kadrion/runtime` for the plan, which keeps
  the plan in one place (D12).
- The runtime build changes with the schema, so parity is measured again and
  the golden manifests change in the three fields of D52.3; Q14 reopens as in
  every schema step.
- A host that sends a document with clips to the Player hears nothing until
  PR-29b; the export is the reference (D06).
- The six commands bring the catalogue to 33 command tools.

## Verification

- `packages/schema/test`: the step, the frozen `0.3` schema, the corpus
  `compatibility/v0-4`, and the invalid cases of every rule of D52.1.
- `packages/runtime/test/audio.test.ts`: the plan, by hand.
- `packages/producer/test/export.test.ts`: the sample grid, the graph, the
  checks before the render, and the manifests.
- `packages/editor-sdk/test/audio.test.ts` and `packages/ai-sdk/test`: the
  commands, their inverses, and their tools.
- `tests/pinned/audio.pinned.test.ts`: the mix against an independent sum, and
  the refusals with the pinned FFmpeg.
