# D81 — Video turned by its container: the display matrix applied after the conversion to RGB

- Status: Proposed
- Date: 2026-11-10
- Supersedes: the refusal of rotated and mirrored tracks in D79.2 and D79.4
  (reason code `rotation`)
- Extends: D50.5 (the Producer's decode and its media facts), D51.4 (the
  Player's decoding), D79.2 and D79.4 (what the Player accepts and the
  verdict), each with an `Amended by: K2 (D81)` line
- Related: D12, D20, D33, D34, D49.6, D62.2, D79.1

## Context

A phone does not turn the pictures it records: it writes them as the sensor
sees them and stores a display matrix in the track header (`tkhd` of MP4 and
QuickTime), which a player applies when it shows the video. Almost every
upright video of a phone is therefore a landscape stream with a matrix of 90°.

Before this decision the two hosts read that matrix differently:

- The Player refused every such file (D79.2, reason code `rotation`), so a host
  had to transcode what phones record before it could preview it.
- The Producer's FFmpeg turned the picture by default (`autorotate`), inserting
  `transpose`, `hflip`, or `vflip` before its conversion to RGB, while its
  probe kept the coded size: a turned frame of `height × width` was read as
  `width × height` bytes. The render did not match the Player's refusal, and
  for a turned file it did not match the picture either.

D79 recorded that Mediabunny names the turn otherwise than FFmpeg's
`-display_rotation` (FFmpeg's 90 is Mediabunny's 270), and left rotation to K2.
The measurement for this decision, with the pinned FFmpeg of D29.1 (FFmpeg
`n8.1.3-20260921`) and Mediabunny 1.62.1, on a 64×36 stream copied with
`-display_rotation` 90, 180, 270, 45, `-display_hflip`, `-display_vflip`, and
both flips with 90:

- In MP4 and MOV, the linear part `[a, b, c, d]` of the matrix ffprobe prints
  (`stream_side_data`, `displaymatrix`, 16.16 fixed point) equals Mediabunny's
  `getTransformationMatrix()` exactly, for every case, 45° included. In
  Matroska, where FFmpeg writes the matrix as a `Projection`, the linear parts
  are equal for every quarter turn; Mediabunny adds a translation that FFmpeg
  does not.
- Both name the same picture: FFmpeg's 90 counter-clockwise is the matrix
  `[0, -1, 1, 0]`, Mediabunny's clockwise 270. The difference D79 noted is one
  of naming, not of the matrix.
- FFmpeg's own turn happens before its conversion to RGB. Turning the RGB of a
  decode with `-noautorotate` by the matrix instead gives the same picture to
  within the chroma filter: a mean difference of 0.0007 to 0.06 per channel and
  at most 6, against 31 to 222 for every other orientation. Two pixels of the
  same picture differ because libswscale's chroma interpolation is not
  symmetric; only a turn after the conversion moves whole pixels and changes
  none.
- For a 45° matrix FFmpeg turns the picture by 45° (`rotate`); Mediabunny's
  `getRotation()` rounds it to 0. In Matroska Mediabunny drops a roll that is
  no multiple of 90° altogether and reports the identity matrix.

## Decision

> D81: The Player and the Producer read the display matrix of a video's container and accept exactly the eight quarter turns, with or without a mirror; each decodes the coded picture, converts it to RGB as before, and then turns the RGB by one shared function of `@kadrion/renderer-dom`, the Producer with FFmpeg's own rotation off (`-noautorotate`); any other matrix is refused, with `rotation` in the verdict and `video-undecodable` in the Producer; the media facts state the size as shown.

### D81.1 The orientation

- The matrix is the one of ISO BMFF and of FFmpeg's display matrix, row-major
  `[a, b, u, c, d, v, x, y, w]`: a point `(p, q)` of the decoded picture, `x`
  right and `y` down, is shown at `(a·p + c·q + x, b·p + d·q + y)`.
- `videoOrientation(matrix)` of `@kadrion/renderer-dom` gives an orientation
  when `u = v = 0`, `w = 1`, and `[a, b, c, d]` is exactly one of the eight
  signed permutations; otherwise `null`. The translation `x, y` is ignored, as
  FFmpeg and Mediabunny ignore it. The values are compared exactly: ISO BMFF
  stores them in fixed point, where a quarter turn is exact.
- An orientation is `{ rotation, flipped }`: a clockwise turn of 0, 90, 180,
  or 270 degrees, then a mirror left to right, as Mediabunny's `getRotation`
  and `getFlip` name them and as `inspectVideo` already states them (D79.4).
- `orientRgb(rgb, width, height, orientation)` moves pixel `(i, j)` of a packed
  RGB picture to `(a·i + c·j, b·i + d·j)`, shifted into the turned picture, and
  `orientedSize` swaps the sides for 90° and 270°. The upright orientation
  returns the picture itself. The functions are pure, and neither the runtime
  build nor the render page imports them: they live in `renderer-dom` because
  both hosts depend on it and shared host code moves down, never sideways
  (D12, `docs/architecture/package-boundaries.json`).

### D81.2 The Player (amends D51.4, D79.2, D79.4)

- `container.ts` reads `getTransformationMatrix()`, not `getRotation()`, so a
  matrix that is no quarter turn cannot pass as one. A quarter turn is no
  longer a reason; any other matrix is the reason `rotation`, which now means
  only that.
- The decoder is configured, and its frames are checked, with the coded size,
  as before. After `yuv420ToRgb`, the RGB is turned by `orientRgb`, and the PNG
  handed to the page has the size as shown.
- The Player's media facts (`PlayerVideoFacts`) and the verdict's `video.width`
  and `video.height` are the size as shown; `video.rotation` and
  `video.flipped` state the turn (0 and `false` when the matrix is refused).

### D81.3 The Producer (amends D50.5)

- ffprobe reads the display matrix with the stream's size and time base
  (`stream_side_data=side_data_type,displaymatrix`); no side data is the
  upright orientation. A matrix that is no quarter turn is
  `video-undecodable`, named in its message, before any page opens.
- The decode gains `-noautorotate` before its input and is otherwise
  unchanged: one thread, every frame passed through, bit-exact scaling flags,
  packed RGB of the coded size. Each selected frame is turned by `orientRgb`
  before it becomes the PNG of the page: the same function at the same place
  as in the Player, after the conversion of colour.
- `VideoProbe` gains `orientation`; its `width` and `height` stay the coded
  size, which the decode reads. The manifest's `video.sources[].width` and
  `height` are the size as shown, and its `decodeArgs` contain
  `-noautorotate`. The shape of the manifest does not change, so
  `MANIFEST_VERSION` stays 3.

### D81.4 The fixtures and the measurement

- `@kadrion/test-fixtures` gains `ROTATED_VIDEO_FIXTURES`: the stream of
  `VIDEO_FIXTURE` copied into MP4 by the pinned FFmpeg with the matrix of each
  of the seven turned orientations, with their SHA-256 and the size as shown;
  `TILTED_VIDEO_FIXTURE`, the same stream at 45°; and
  `rotatedVideoFixtureArguments`. As for every video fixture, the recipe and
  the hash are committed and the bytes are never; each file is about 115 kB.
- Parity (D34) is measured for each of the seven: the Player shows the
  Producer's frame of the video composition at every golden timestamp with 0
  differing pixels and a maximum channel difference of 0, and both state the
  size as shown.

## Alternatives considered

- **Let FFmpeg turn the picture (`autorotate`) and turn the YUV planes in the
  Player before `yuv420ToRgb`** — FFmpeg's transpose of 4:2:0 planes changes
  which chroma samples the bicubic filter reads across which axis, so the
  Player would have to port that order of operations exactly for every one of
  the eight cases; a turn of RGB moves whole pixels and needs no port.
- **Turn the picture with FFmpeg filters after the conversion
  (`format=rgb24,transpose=…`) in the Producer** — the same pixels, but a
  second implementation of the turn beside the Player's, and decode arguments
  that differ by file, which the manifest records once (D50.5).
- **Let the browser turn the picture (`VideoFrame` rotation, CSS)** — a
  browser's turn of a frame is not measured against the Producer, and the
  page would have to know about containers (D50.4: a video is an image of the
  host's bytes).
- **Read rotation from Mediabunny's `getRotation()` and `getFlip()`** — they
  round any angle to a quarter turn, so a tilted file would play turned in the
  Player while FFmpeg shows it at its own angle.
- **Record the orientation in the manifest** (`rotation`, `flipped` per
  source) — a new field of the manifest, which needs a manifest version (D47);
  the size as shown and `-noautorotate` record what changed, and the asset's
  `contentHash` binds the matrix.
- **Accept any angle by drawing the picture rotated** — FFmpeg's `rotate`
  filter interpolates; no browser would match it pixel for pixel, and phones
  write quarter turns only.

## Consequences

- A host previews and renders phone recordings without a transcode, and the
  preview and the render agree to the pixel. `inspectVideo` says "plays" for
  them, with the size as shown and the turn.
- `@kadrion/renderer-dom` exports `videoOrientation`, `orientRgb`,
  `orientedSize`, `UPRIGHT`, `VideoOrientation`, and `VideoRotation`
  (additive); `@kadrion/producer`'s `VideoProbe` gains `orientation`;
  `@kadrion/test-fixtures` gains the fixtures of D81.4. The Player's API
  report does not change: `rotation` keeps its name with a narrower meaning.
- The Player's dist tree changes (`container.js`, `video.js`, and the new
  `renderer-dom/dist/video-orientation.js` it serves), so the committed parity
  records (`docs/spike/parity-measurement.json`,
  `docs/spike/video-parity-measurement.json`) must be measured again in the
  pinned container before `check` passes; the runtime build, the schema, and
  the golden frames do not change, and the reference rows cannot, since no
  reference video is turned.
- The committed golden manifests still record the decode arguments without
  `-noautorotate` until the next `goldens:update`; their pixels are those of
  an upright video, which the flag does not change.
- Not detected: a Matroska `Projection` whose roll, yaw, or pitch is no
  multiple of 90°. Mediabunny 1.62.1 drops it and reports the identity, so the
  Player shows the picture upright while the Producer's ffprobe reads the
  angle and refuses the file (`video-undecodable`). A refusal, never a wrong
  frame; phones write such files in MP4 or QuickTime, where the matrix is
  read exactly.
- A matrix of a quarter turn with a scale (a `tkhd` that also stretches the
  picture) is refused by both hosts; FFmpeg would turn it and apply the scale
  as a sample aspect ratio. Such a file is refused rather than guessed at.

## Verification

- `packages/renderer-dom/test/video-orientation.test.ts`: the eight matrices
  FFmpeg writes and their names; a translation ignored; 45°, scale, shear,
  perspective, and malformed matrices refused; every pixel of every
  orientation where its matrix puts it.
- `packages/player/test/video.test.ts`: MP4, MOV, and MKV turned and mirrored
  read as playable with the size as shown and the coded size for the decoder;
  a 45° and a scaled matrix refused with `rotation`.
- `packages/producer/test/video.test.ts`: a turned probe decodes the coded
  size, hands the page a PNG of the size as shown, and records it and
  `-noautorotate` in the manifest; ffprobe's display matrix parsed.
- `tests/pinned/video.pinned.test.ts` (pinned FFmpeg and Chromium): for each
  fixture of D81.4 the page shows the turned RGB of the coded decode pixel for
  pixel, and of the eight orientations the one of D81 is the nearest, by far,
  to FFmpeg's own `autorotate`; the tilted fixture is `video-undecodable`.
- `tests/pinned/player-video.pinned.test.ts` (pinned): the D34 measurement of
  D81.4 for each fixture, and the tilted fixture refused with
  `video-unsupported`.
- `tests/pinned/inspect.pinned.test.ts` (pinned): MP4, MOV, and MKV turned by
  the pinned FFmpeg play with the size as shown, and a 45° MP4 gets
  `rotation`, also through `kadrion inspect --json`.
