# D51 — Video in the Player: decoding in the host window, exact colour, and media facts from verified bytes

- Status: Accepted — by the project owner on 2026-10-31, after PR-28b was merged
- Date: 2026-10-31
- Supersedes: D50.6 (the Player's refusal of video)
- Extends: D25 (the resolver may return a `Blob` for a video, the protocol
  version 2, `prepareVideo`), D28 (the page receives video frames with `seek`
  and `update`), D33 and D34 (the video rows of the parity measurement), D44
  (`editor-session` reads media facts), and D50 (video in the second host),
  each with an `Amended by: PR-28b (D51)` line
- Related: D13, D14, D22, D27, D29, D30, D38, D46, D49,
  [roadmap of phase three](../roadmap/phase-3.md) PR-28,
  [spike report](../spike/report.md) §3

## Context

D50 split PR-28: PR-28a gave the schema, the runtime, the renderer, the
commands, and the Producer, which decodes a video with the pinned FFmpeg; the
Player refused every document with video (D50.6). PR-28b has to let the Player
show the same source frame the Producer shows, deliver large files without
copying them through the iframe protocol, read media facts for the bus from
bytes that were verified (D49.6), and measure parity with video rows.

The roadmap expected that a browser decoder and FFmpeg would convert YUV to
RGB differently and that pixels inside a video node would need a threshold of
their own. The implementation measured something better:

- **H.264 decoding is bit exact.** In the pinned Chromium (153, Chrome for
  Testing) `VideoDecoder` returns I420 planes that are byte for byte the
  `yuv420p` planes of the pinned FFmpeg, for every file tried: 320×180,
  300×170 (odd chroma), 640×360, 1920×1080, variable frame rate, untagged,
  BT.709, SMPTE 170M, BT.470 BG, and full range.
- **Chromium's own RGB conversion is not FFmpeg's.** Drawing a `VideoFrame`
  differs from the Producer by up to 163 in one channel: Chromium treats an
  unspecified matrix as BT.709, FFmpeg as BT.601, and their filters and
  rounding differ.
- **The Producer's conversion is a small, fixed piece of libswscale**: the
  decode arguments of D50.5 pin `bitexact+accurate_rnd+full_chroma_int`, the
  default bicubic chroma filter, and integer coefficients. Ported to
  TypeScript in integer arithmetic, it gives zero differing bytes against
  FFmpeg on all of the files above.

So the Player can show exactly the Producer's pixels, and the gate of D34 can
stay at zero inside video nodes.

## Decision

> D51: The Player reads a video's MP4 container and H.264 colour facts itself, decodes the needed sample with WebCodecs in the host window from the sync sample before it, converts the planes to RGB with a port of the Producer's libswscale path, and gives the page each frame as PNG bytes with the seek; a video comes from the resolver as a `Blob` or as bytes, verified by an incremental SHA-256 before use; `editor-session` reads media facts from those verified bytes; and the video rows of the parity measurement have the same zero thresholds as every other pixel.

### D51.1 What the Player accepts

- An MP4 (ISO BMFF) file with one `moov` box, not fragmented, whose first
  video track is H.264 (`avc1` with an `avcC` record, exactly one sample
  description), 8-bit 4:2:0, progressive.
- An edit list of at most one leading empty edit and one plain edit that
  starts at or before the first presentation time. Presentation times are
  `dts + ctts − media_time` and must ascend strictly; the first sample must be
  a sync sample.
- Colour: primaries 1, 2, 5, or 6; transfer 1, 2, 4, 5, or 6; matrix 1
  (BT.709) or 2, 5, 6 (BT.601, as FFmpeg converts an unspecified one); limited
  range unless the bitstream states full. An MP4 `colr` box must say what the
  sequence parameter set says, or nothing.
- Anything else is `video-unsupported`, before the first frame. The Player
  never converts approximately: BT.2020, high bit depth, 4:2:2, interlacing,
  other codecs, and fragmented files are refused, even when Chromium could
  decode them, because the Player could not show the Producer's pixels.
  `video-undecodable` is a decoder that fails or returns no frame for a sample.

### D51.2 Delivery and verification (amends D25.4)

- `PlayerAssetResolver` may return `{ blob, mediaType }` for a video, beside
  `{ bytes, mediaType }`, which stays valid. The media type must be `video/…`
  (D27.3).
- The Player hashes the bytes with an incremental SHA-256 in 4 MiB slices
  before it reads anything else, and refuses a mismatch with
  `asset-hash-mismatch`. It never reads the container of an unverified file.
- A video stays in the host window. The page receives only decoded frames:
  video bytes are never posted to the render page and never become `data:`
  URLs.
- **Delivery by path is not part of this ADR.** The Producer keeps reading the
  bytes it is given and writing a private copy for FFmpeg (D50.5). Reading a
  path on a read-only mount without a copy is a later change of the Producer
  alone; it changes no pixel and no contract of the Player.

### D51.3 Media facts

- A verified video yields frozen facts `{ type: 'video', durationUs, width,
height, frames }`. `durationUs` is the source duration of D50.3, from the
  container's presentation times and the duration of the last presented
  sample, which is what the Producer's `ffprobe` reads; the pinned test checks
  both against `VIDEO_FIXTURE` and the Producer's manifest.
- `Player.prepareVideo(asset, resolveAsset)` verifies and reads one video and
  returns its facts. A video prepared once is not requested again by `load` or
  `update` while the Player lives.
- Before the first frame the Player checks that every sampled range lies
  inside its video (`source-range-exceeded`, D49.6) and that the decoder
  accepts each track's configuration. A video asset that no node uses is
  verified, but not read.

### D51.4 Decoding and colour

- The decoder runs in the host window (WebCodecs needs a secure context, as
  the Player's host already is). For a source frame of D50.3 the Player decodes
  from the sync sample before it, in decode order, flushes, and keeps the frame
  whose presentation is the needed sample. No state between seeks changes a
  pixel; a few PNGs per video are kept as a cache keyed by sample.
- The I420 planes are converted to RGB by `yuv420ToRgb`, a port of the
  Producer's path in libswscale: bicubic chroma filter (B = 0, C = 0.6),
  chroma sited at the centre, `full_chroma_int`, `accurate_rnd`, and the
  integer coefficients of `ff_yuv2rgb_c_init_tables` for BT.601 and BT.709 in
  limited and full range. The matrix and range come from the bitstream
  (D51.1), never from the decoded frame's own colour space.
- The frame is encoded as a PNG in the host and sent to the page as the image
  of its node (D50.4).

### D51.5 Protocol version 2 (amends D25 and D28)

- `kadrion-player:seek` and `kadrion-player:update` carry `videoFrames`: one
  `{ nodeId, mediaType: 'image/png', bytes }` per video node active at the
  time. The agent passes them to the runtime's `frame` as the Producer does.
  A malformed list is `video-frames-invalid`.
- The protocol version becomes 2; a page and a host of different versions
  refuse each other as before.

### D51.6 Parity (amends D33 and D34)

- The parity test measures a second record,
  `docs/spike/video-parity-measurement.json`: the Player showing the video
  composition of D50.8 against its committed golden frames, with the method
  of D33, in the same pass, environment, runtime build, and Player dist tree as
  the reference record.
- Its thresholds are those of D34.1: zero differing pixels and zero channel
  difference, at every pixel, inside video nodes and outside them. The first
  measurement in the pinned environment is 0/0 in every row, with the Player's
  PNG equal byte for byte to the golden PNG.
- `check` requires the committed video record to be gated, complete, current
  with the reference record, and quoted by the spike report.

### D51.7 `editor-session` reads media facts (amends D44)

- Before it loads a document, the session reads the facts of every video that
  a node uses with `prepareVideo`, and gives the bus `mediaFacts(contentHash)`
  from them (D50.7). A host no longer has to supply facts itself.
- `session.readMediaFacts(asset)` reads the facts of a video before a command
  that needs them (for example before `AddAsset` and `AddNode` with a new
  video), and returns `null` for images, audio, and fonts.

## Alternatives considered

- **A threshold for video pixels** (the roadmap's plan) — not needed: the
  measurement is 0/0. A threshold would have hidden real bugs in exactly the
  pixels that are hardest to check by eye.
- **Drawing `VideoFrame` with Chromium's own conversion** — up to 163 off in
  one channel, and a different matrix for untagged files.
- **Serving frames decoded by the pinned FFmpeg to the browser** — exact, but
  it needs a server next to every preview, which a host editor does not have.
- **Decoding in the render page** — the page has no `media-src` and plays no
  media (D50.4); the page would also need the whole file.
- **Accepting every file Chromium decodes** — the Player would show pixels
  the Producer never renders for 10-bit, BT.2020, or 4:2:2 files.

## Consequences

- `@kadrion/player` gains an MP4 reader, an H.264 SPS reader, an incremental
  SHA-256, and the colour conversion (pure modules), and a decoder pipeline in
  the host window; its dist tree changes, so parity was measured again.
- The runtime build, the schema, the golden frames, and the Producer do not
  change.
- Supported video in the Player is narrower than what FFmpeg decodes. A file
  outside D51.1 is refused by the Player, while the Producer may still render
  it; a host transcodes such files before using them.
- `editor-session` can now drive every video command without facts from the
  host.

## Verification

- `packages/player/test/video.test.ts`: the SHA-256 against Node's, the MP4
  reader and its refusals, the colour facts, and `yuv420ToRgb` against outputs
  of the pinned FFmpeg committed as data.
- `packages/player/test/player.test.ts`: frames per node, decoding from the
  sync sample, `Blob` delivery, every refusal before the first frame,
  `prepareVideo`, and `update`.
- `packages/editor-session/test/session.test.ts`: facts read before load and
  by `readMediaFacts`, and the bus refusing a range past the source.
- `tests/pinned/player-video.pinned.test.ts` (pinned): facts equal to the
  Producer's, zero differing pixels against the Producer at every golden time,
  the same pixels in any order and with `Blob` delivery, typed refusals, and
  the gated video parity record.
- `tests/repo/parity-record.test.ts`: the committed video record and the
  report's table.
