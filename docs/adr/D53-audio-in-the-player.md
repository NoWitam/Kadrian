# D53 — Audio in the Player: the plan on the Producer's grid, the audio clock, and audio media facts

- Status: Proposed
- Date: 2026-11-01
- Supersedes: —
- Extends: D25 (the option `audio`, `prepareAudio`, the audio clock, a seek
  while playing), D44 (`editor-session` reads audio facts), D46
  (`describe_document` states the length of sounds), D49 (49.6: the check of
  the source ranges sounds hear), and D52 (52.4: the plan moves to the schema;
  52.6: the bus checks the ranges of clips and of the sound of videos), each
  with an `Amended by: PR-29b (D53)` line
- Related: D12, D14, D20, D29, D33, D50, D51,
  [roadmap of phase three](../roadmap/phase-3.md) PR-29

## Context

D52 made the Producer mix the audio plan of a document with the pinned FFmpeg,
every position a sample count on a 48 kHz grid (D52.5), and left playback in
the Player and audio media facts at the bus to PR-29b. The Player never played
sound (D25.2); a host that previews a document with clips hears nothing, and
the bus accepts a clip that reads past its source, which only the export
refuses.

Four findings of the implementation shape the decision:

- **Chromium decodes the sources as the pinned FFmpeg does.** In pinned
  Chromium, `decodeAudioData` of an `OfflineAudioContext` at 48 kHz decodes the
  WAV sources and the AAC sound of the fixture video to the same samples as
  the pinned FFmpeg's 32-bit float decode, aligned. For the AAC sound it
  returns 144 000 samples where FFmpeg counts 144 384: the browser's length is
  the shorter, so a range it accepts the Producer accepts too.
- **FFmpeg's upmix of a mono source is `√½` on each channel.** The Producer
  normalises every source to stereo with `aformat` (D52.5); the pinned FFmpeg
  gives a mono sample `x` as `x·√½` on both channels (measured: 0.70710678).
  Web Audio's speaker rule copies a mono channel to both at gain 1.
- **The plan is needed where the runtime may not be.** The bus checks the
  ranges a document hears, but D12 forbids `editor-sdk` to depend on
  `@kadrion/runtime`, where D52.4 put the audio plan. The plan is a pure
  function of the document, like `sampledSourceRange` of D49.5, which lives in
  the schema.
- **A browser starts sound only after a gesture of the user.** A context that
  the Player made itself would stay suspended until one; the host has the
  gesture, so the host creates the context.

## Decision

> D53: The Player plays the audio plan with Web Audio in an `AudioContext` the host passes, placed on the Producer's 48 kHz grid by the same function, with sources decoded by the browser, a mono source at √½, and fades as gain automation on the grid; while sound plays, the context's clock drives the picture. `Player.prepareAudio` and `editor-session` read audio facts from decoded bytes, and the bus checks every range a clip or a heard video reads. The audio plan moves to `@kadrion/schema`.

### D53.1 The plan and the grid are shared

`audioPlan` and its types move from `@kadrion/runtime` to `@kadrion/schema`
(`audio-plan.ts`), unchanged; the runtime re-exports them, so every import of
D52 still holds (D52.4 is amended). The sample grid — `AUDIO_SAMPLE_RATE`,
`sampleAt`, and `audioLayout` — moves from the Producer to
`@kadrion/runtime`, which the Producer and the Player both use; the Producer
re-exports it under its names of D52.5. Nothing of the plan or the grid
changes: the Producer's manifests and mix stay byte for byte.

### D53.2 Sound in the Player (amends D25)

- **The option `audio`.** `createPlayer` takes `audio: { context }`, an
  `AudioContext` the host creates. Absent, the Player plays no sound, as
  before. A context at a rate other than 48 000 Hz, or anything that is not a
  context, is `invalid-options`.
- **Decoding.** At `load` and `update`, with the option, the Player decodes
  every source the plan hears with the context's `decodeAudioData`, from the
  bytes it verified (D14), a video from its verified `Blob` (D51.2), each
  content hash once and kept as long as the document shows it. Bytes the
  browser cannot decode at 48 kHz are `audio-invalid`, as the Producer calls a
  source without one readable audio stream; a sound of more than two channels
  is `audio-unsupported`, since the browser would mix it down by other rules
  than FFmpeg. A sound that reads past the decoded samples of its source is
  `source-range-exceeded`, before the first frame (D49.6).
- **The graph.** The plan is placed on the grid by `audioLayout` (D53.1). Each
  sound is one `AudioBufferSourceNode`, started at the context time of its
  first sample, from the time of its source sample, for its sample count; then
  one gain node of its volume (times `√½` for a mono source, all nodes of two
  channels by the speaker rule, so a mono source is copied to both channels as
  FFmpeg's upmix gives it), and one gain node per fade, whose value is set at
  the first sample heard and ramps linearly to the end of the fade on the
  grid: the gain of D52.2 at sample `k` is `k / n` rising and `1 − k / n`
  falling, as `afade` gives it. A stereo sound at volume 1 without fades goes
  straight to the destination.
- **The clock.** While a document with sound plays, the preview clock of D25.6
  is the context's: the plan is scheduled from the sample of the time shown,
  50 ms ahead of `currentTime`, and the frame shown is the one of the time
  heard, `currentTime − outputLatency` after that start. The scheduler only
  paces the requests. A suspended context is resumed first; if the browser
  refuses, the picture plays without sound on the scheduler's clock. Pausing,
  a new document, and `destroy` stop every sound; at the last frame the
  picture stops and the sound plays to its end.
- **A seek while playing** restarts the clock, and its sound, from the time
  sought; before, the clock went on from where it started and overrode the
  seek with the next tick.
- **`prepareAudio(asset, resolveAsset)`** resolves, verifies, and decodes one
  audio or video asset and returns `{ type: 'audio', durationUs }`: its
  decoded samples as whole microseconds, rounded down. It decodes with the
  option's context, or without it in one `OfflineAudioContext` of the window;
  a window with neither is `audio-unsupported`. The decoded sound is kept for
  a later `load` or `update`.

`decodeSound` and `scheduleSounds`, the two functions the Player plays with,
are exported so that the pinned test measures the Player's own graph (D53.5).

### D53.3 Audio facts (amends D44 and D49.6)

`MediaFacts` becomes `VideoFacts | AudioFacts`. `AudioFacts` is
`{ type: 'audio', durationUs }`; `VideoFacts` gains `audioDurationUs`: the
length of the video's sound, `null` when the browser finds none to decode, or
absent when the host has not read it.

`editor-session` reads them from the Player:

- `readMediaFacts` of an audio asset returns its `AudioFacts`; of a video, its
  facts with `audioDurationUs` (absent when the window decodes no sound).
- At start, after the first load, it reads the facts of every audio asset a
  clip above volume 0 plays and the sound of every video a node above volume 0
  shows. A window that cannot decode sound starts all the same; the bus then
  knows no sound.

### D53.4 The bus checks what is heard (amends D52.6)

The check of D49.6 extends to the audio plan of D52.4. A command whose result
makes a clip or a video node hear source time the same clip or node did not
hear before — a new sound, another asset, or a range reaching outside the one
before — is checked against the facts of its source: a clip reads
`[sourceStartUs, sourceStartUs + durationUs)` of the plan's entry from its
`AudioFacts`, a video node above volume 0 the same from its `audioDurationUs`.
Without facts, `media-facts-missing`; past the end, or a video with no sound,
`source-range-exceeded`; the details name the clips and nodes. A sound that is
not heard (volume 0, or past the end of the composition) needs no facts, and
neither does one that hears less than before, so a fade or a quieter volume
never asks the host for anything.

`describe_document` states an audio asset's `sourceDurationUs` and a video's
`soundDurationUs` (`null` for none) when the host knows them (amends D46.3);
the descriptions of `add_audio_clip`, `set_clip_source`, and
`set_video_volume` list the new refusals.

### D53.5 Verification

- Unit tests with a recording double of Web Audio: what is scheduled where,
  from the start and from the middle of sounds and fades; the mono factor;
  stopping; the audio clock driving the picture, with output latency; pause,
  seek while playing, a suspended context; `prepareAudio`; the refusals.
- Bus tests of D53.4, and `editor-session` with a Player that decodes no
  sound.
- In pinned Chromium (`tests/pinned/audio.pinned.test.ts`): the Player's graph
  for the document of the mix test of D52.7, rendered in an
  `OfflineAudioContext` from sample 0 and from sample 75 001 (inside the
  music's fade-out and the video's sound), equals the Producer's audio
  intermediate of the same run within 1e-4 per sample; measured 1.0e-5, the
  error of 32-bit float gain automation. The browser decodes the WAVs to their
  own lengths.

## Alternatives considered

- **The Player creates its own `AudioContext`.** A browser keeps it suspended
  until a gesture inside the page that made it, which the Player cannot see;
  the host has the gesture and the device choice.
- **Exact sample slices instead of buffer offsets.** Copying every sound's
  samples into a buffer of its own would make the start exact by construction,
  but costs a copy of every source at every play; offsets on the grid measure
  equal within float automation.
- **An `AudioWorklet` that sums the plan by hand.** Bit-exact against the
  TypeScript mix, but a second implementation of the mix and a script the host
  page would have to load; the graph is the browser's own and measured.
- **The plan stays in the runtime, with an edge `editor-sdk` → `runtime`.**
  D12 forbids it for a reason that still holds: commands are document
  transforms that work without a renderer.
- **The scheduler's clock with sound started beside it.** The two clocks
  drift; the picture would leave the sound over a long play.

## Consequences

- A host that wants sound creates an `AudioContext({ sampleRate: 48000 })` on
  a gesture and passes it; nothing changes for one that does not.
- The runtime build changes (`sampleAt` is exported); its hash, the golden
  manifests, and the parity records are measured again. No pixel changes.
- A host must read facts before a command makes a clip or video hear a source
  the document did not hear yet, as for video (D51.7).
- Known limitations: a source the browser cannot decode as a whole (very long
  video) costs its memory at 48 kHz; a sound of more than two channels plays in
  the Producer only; the clock follows `outputLatency`, not
  `getOutputTimestamp`.

## Verification

`node --run check`; `packages/player/test/audio.test.ts`,
`packages/editor-sdk/test/audio.test.ts`, `packages/editor-session`; the
pinned run with `tests/pinned/audio.pinned.test.ts` in the pinned image.
