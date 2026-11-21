# D87 — Video played at the film's frame rate: decoded forward, converted in workers

- Status: Accepted — by the project owner on 2026-11-21 (13:31 Europe/Warsaw),
  before any code, with the recommendations of all six questions
- Date: 2026-11-21
- Supersedes: —
- Extends, on acceptance, each with an `Amended by` line written then and in
  force from the pull request it names: D51 (51.4: while a film plays, a video
  is decoded forward and converted outside the host's thread; 51.5: protocol
  version 3 carries a frame as a bitmap), D50 (50.4: the renderer shows a
  video's frame from a bitmap as well as from image bytes), D25 (the protocol
  version), and D33 (a measurement of playing frames beside the parity
  record, D87.6)
- Related: D26, D28, D34, D61, D79, D81, D82. D79 and D81 are `Proposed` in
  the index although their code is on `main`; this ADR builds on what `main`
  does.

## Context

A host's editor reports that the preview is not smooth, most of all with a
video clip in the film. Measured on 2026-11-21 at `af8622d`, in a container
with four virtual processors and no GPU, in the pinned Chromium, on a film of
1080×1920 at 30 fps with one full-frame clip, playing:

| Clip                                    | Frames shown per second |
| --------------------------------------- | ----------------------: |
| none (text and shapes)                  |                      30 |
| 720p, a key picture every second        |                     7.4 |
| 1080p, a key picture every second       |                     4.2 |
| 1080p, a key picture every 250 pictures |                     2.2 |
| 2160p, a key picture every second       |                     1.5 |

The film without a clip plays at its rate, so the cost is the clip's frame.
For each frame the Player (D51.4) starts a new decoder at the last sync
sample before the frame that holds an IDR picture and decodes up to it, copies the planes, converts them to RGB
in JavaScript on the host's thread (76 ms at 1080p, 30 % of the profile),
compresses the result as PNG, and posts it to the page, which turns it into a
`data:` URL in JavaScript and decodes the PNG again. With a clip of 1080p the
host's thread is blocked for 2.2 s of every 6 s, so the host's own interface
stutters as well.

What a probe measured in the same container:

- **Decoding forward is not the cost.** One decoder reading on in presentation
  order gives 333 frames of 1080p per second.
- **A bitmap crosses into the page.** An `ImageBitmap` transferred to the
  sandboxed `srcdoc` frame and shown by a canvas with the `bitmaprenderer`
  context: 59 frames per second at 1080p, with Chromium's own conversion of
  colour.
- **Chromium's conversion is not the Producer's**, as D51 found. Against the
  Producer's RGB, in this container: for 1080p tagged BT.709, a mean
  difference of 7 to 9 levels with a quarter to two thirds of the pixels off
  by more than 8; for a file without a colour description, the wrong matrix
  (BT.709 where FFmpeg uses BT.601), a mean of 26 levels. A GPU converts
  differently again, and was not measured.
- **The exact conversion keeps up when it runs beside the host's thread.**
  `yuv420ToRgb` unchanged, in dedicated workers, one frame per worker at a
  time, decoded forward, shown as bitmaps:

| Clip         | Workers | Frames per second |
| ------------ | ------: | ----------------: |
| 1080p        |       1 |              10.1 |
| 1080p        |       2 |              20.6 |
| 1080p        |       3 |              29.7 |
| 1080p        |       4 |              34.6 |
| 1080p, noisy |       3 |              26.8 |
| 720p         |       2 |              50.0 |
| 2160p        |       4 |               9.4 |

So the Player can play a clip of 1080p at the film's rate and still show the
Producer's pixels. The approximation is not needed.

The numbers come from probe pages that are not in the repository (a page that
decodes forward, a worker that runs `packages/player/dist/yuv.js`, and a
sandboxed `srcdoc` frame with a canvas). PR-82 and PR-83 state them again
from the tests they add (D87.6); until then they are a measurement of one
container, not a gate.

## Decision

> D87: While a film plays, the Player decodes each video forward with one decoder per node, converts the planes with the conversion of D51.4 in a small pool of workers, a few frames ahead of the clock, and gives the page each frame as an `ImageBitmap` that the renderer shows in a canvas. A frame the host seeks to keeps the path of D51. The pixels of a video's source frame are the Producer's in both, and the sought frame and the Producer stay the reference.

### D87.1 A stream per video node while playing

- **Forward.** When playback starts, each video node that is active or becomes
  active gets a stream: one `VideoDecoder`, configured as in D51.4 (software
  decoding included), fed from the last sync sample that holds an IDR picture
  before the node's frame at the clock's time (the sample D51.4 and D82.4
  start from; a sync sample that is only a recovery point is passed over), in
  decode order, without a flush between frames. The decoder gives the frames
  in presentation order; it may hold a frame back until later samples are
  fed, which the reading ahead supplies, and after the source's last sample
  the stream flushes once, so the last frames come out.
- **Ahead, and bounded.** The stream stays at most 6 converted frames ahead of
  the frame the clock last asked for and stops feeding the decoder beyond
  that, so memory is bounded by the frames in flight, whatever the clip's
  length. 6 frames of 1080p are 50 MB of bitmaps.
- **Which frames.** The source frame of a film frame is still chosen by the
  rule of D49.5 through the time map of D82. A frame the film skips (a clip
  played faster) is decoded and not converted.
- **The same source frame again.** A clip played slower, or held (D82), shows
  one source frame for several film frames. The stream keeps the bitmap of
  the frame a node shows until the node shows another, and gives the page a
  copy of it (a structured clone, not a transfer) for every film frame, so
  every message still carries exactly one frame per active node (D50.4) and
  the page keeps no frame of its own between messages. The cost of the copy
  is measured in PR-83.
- **The caches of D51 and D82.** The stream neither reads nor fills the frames
  kept for seeks (`KEPT_FRAMES`) or the runs kept for reversed clips
  (`RunCache`). They serve sought frames as today.
- **When the stream starts again.** A seek, a pause, an update of the
  document that changes the node's source, range, or time map, a frame behind
  the stream's position, or a frame beyond the next sample that holds an IDR
  picture ends the stream; the next playing frame starts one at the last such
  sample before it. A pause shows the frame of its time by the path of D51,
  as a seek does. A reversed clip (D82.4) keeps today's path: it is not made
  faster by this ADR.
- **No state changes a pixel.** A frame from a stream is the frame the path of
  D51.4 gives for the same sample: decoding is exact wherever it starts from a
  sample that holds an IDR picture (D51, D79.5), and the conversion is the
  same function. The stream's position is decode state of the host: it
  selects no frame and changes no pixel, so the frame shown is still a
  function of the document and the time alone.

### D87.2 The conversion runs in workers

- **The same function.** A worker runs `yuv420ToRgb` and the turn of D81 on
  the planes of one frame, as the path of D51.4 does before it compresses,
  and returns an `ImageBitmap` made from those RGB bytes with an alpha of 255
  added, without a colour conversion, a resize, or premultiplication.
  Chromium's conversion of a `VideoFrame` is never used.
- **The pool.** `min(4, max(1, hardwareConcurrency − 2))` dedicated workers,
  created when the first stream starts and ended with the Player. The number
  changes how fast frames arrive, never a pixel.
- **The host's thread** feeds the decoder and passes frames on; it converts
  nothing and compresses nothing while playing.
- **Delivery.** The worker's code is a module of `@kadrion/player`, loaded
  with `new Worker(new URL(…, import.meta.url), { type: 'module' })`. A host
  that sets a content security policy allows workers from its own origin; the
  host guide says so. Where a worker cannot be created, the Player plays with
  the path of D51 and reports it once (`video-workers-unavailable`, a
  warning, not an error).

### D87.3 Protocol version 3: a frame as a bitmap (amends D51.5)

- A `videoFrames` entry is either `{ nodeId, mediaType, bytes }` as today or
  `{ nodeId, bitmap }`, an `ImageBitmap` that belongs to the message (a
  transfer, or a copy where the host keeps the frame, D87.1). A message holds
  one entry per node; any other shape is `video-frames-invalid`.
- The protocol version becomes 3; a page and a host of different versions
  refuse each other as before.
- The Producer keeps sending bytes. It never sends a bitmap.

### D87.4 The renderer draws a bitmap into a canvas (amends D50.4)

- A video node is mounted as the `img` of today (D50.4) and stays one for as
  long as its frames come as bytes. When a frame comes as a bitmap, the
  renderer puts a `canvas` in the image's place, with the same attributes and
  the same styles (the box, `object-fit`, `object-position`, the transform,
  the crop, the corner radius, effects, mask, and blend mode), and hands it
  the bitmap (`transferFromImageBitmap`); when a frame comes as bytes again,
  the image returns. Nothing is wrapped and nothing is added beside the
  node, so the tree a Producer renders, which never receives a bitmap, is the
  tree of today, element for element.
- The canvas has the size of the bitmap, the picture as shown (D81).
- An inactive node is the image without a source, as today.
- This is a change of `@kadrion/renderer-dom`: the runtime build changes, the
  Producer runs it too, and Q14 reopens by its procedure. The build gains a
  branch that only a Player reaches. The golden frames, which hold two films
  with video, must not change; the pinned run of PR-83 proves it.

### D87.5 What the Player does when a frame is late is unchanged

The clock, the status `waiting`, and the rule of D61.3 (playback is held, not
late, while the frame before is not ready) stay as they are. This ADR makes
frames arrive sooner; it does not let the Player show a frame of another time.

### D87.6 What is measured and gated

- **The source pixels.** For every container and colour description of D51.1
  and for a turned video: the bytes a worker returns for a frame of a stream
  equal the RGB of the path of D51.4, over a read across at least two later
  samples that hold an IDR picture. Gated at zero.
- **A playing frame at the clip's own size.** In the pinned environment, a
  clip shown at its own size, unscaled: the page captured while a stream
  supplies a frame equals the page after a seek to the same time, pixel for
  pixel. Gated at zero. PR-83 measures it first; if it is not zero, PR-83
  stops and this ADR is revised.
- **The parity record is untouched.** The measurement of D33 seeks, so it
  runs the path of D51; its thresholds (D34.1, D51.6) and its records do not
  change, apart from being measured again for the new runtime build and dist
  tree.
- **A playing frame of a scaled clip.** The same comparison for a clip that
  is shown smaller, larger, cropped, and turned. An image and a canvas may be
  scaled by different filters. The first measurement decides: if it is zero
  in every row, it becomes a gate at zero; if not, the differing pixels and
  the largest difference are written into this ADR as a known difference of
  playing frames of a scaled clip, and the sought frame stays the reference.
- **The rate.** The pull request states frames per second for the five clips
  of the table above, before and after, and the longest block of the host's
  thread.

### D87.7 Not included

- A reversed clip, a clip of 2160p at the film's rate (9.4 frames per second
  with four workers here), and the conversion on the GPU (a shader in integer
  arithmetic could be exact and much faster; it needs its own measurement).
- Decoding in a worker: the decoder's work already runs outside the host's
  thread in Chromium; only its feeding stays there.
- Smaller copies of large sources for the preview: a host's choice, outside
  the engine.
- The Producer, which this ADR changes only through the runtime build.

## Alternatives considered

- **Chromium's conversion while playing, the exact frame when stopped.** The
  fastest (59 frames per second) and the least code. Rejected on the
  measurement above: the picture would change visibly between playing and
  stopped, by a different amount on every machine and browser version, and
  for files without a colour description it would show other colours.
- **The exact conversion on the host's thread, decoded forward.** 76 ms per
  frame of 1080p caps it at 13 frames per second and keeps blocking the host.
- **PNG or BMP bytes instead of a bitmap.** The page's policy allows images
  from `data:` only, so bytes become a base64 string in JavaScript and are
  decoded again: the cost this ADR removes.
- **A `video` element.** Not frame-exact, not deterministic, and the page
  plays no media (D50.4).
- **Decoding in the page.** As in D51: the page would need the whole file.
- **Showing the nearest decoded frame when one is late.** Smoother to the eye,
  but the page would show a state the document does not have at that time.

## Consequences

- `@kadrion/player`: the stream, the pool, the worker module, protocol
  version 3; its dist tree changes in PR-82 and again in PR-83, and a parity
  record is measured again in each. `@kadrion/renderer-dom`: the canvas and
  the bitmap entry; the runtime build changes and Q14 reopens (PR-83).
- No change to the schema, the Producer's code, the golden frames, or a
  manifest's shape (the runtime's hash in a manifest changes with the build).
- A host bundles one more module and may have to allow workers in its policy.
- Playing uses up to four more threads and up to 6 frames of bitmaps per
  playing video node.

## Verification

- `packages/player/test`: the stream's order, its bound, every reason it
  starts again, skipped frames, the pool's size, the fallback without
  workers, and the two shapes of a `videoFrames` entry.
- `packages/renderer-dom/test`: the image and the canvas of a node, which one
  shows, and an inactive node.
- `tests/pinned/player-video.pinned.test.ts`: the gates and the measurement
  of D87.6.
- `tests/repo/parity-record.test.ts`: the records measured again.

## Questions for the owner, with recommendations

1. **Exact colours while playing.** Recommendation: yes (this ADR). The
   alternative is faster on a weak machine and shows other colours while the
   film plays.
2. **Up to four workers.** Recommendation: yes; fewer on a machine with fewer
   processors.
3. **A playing frame of a scaled clip may differ from the sought frame in how
   it is filtered**, if the measurement of D87.6 finds it; a clip at its own
   size may not (a gate at zero). Recommendation: accept it for scaled clips
   and state the measured difference; the sought frame and the export stay
   the reference.
4. **Reversed clips and 2160p stay as slow as today.** Recommendation: accept
   for now; a host shows large sources from a smaller copy.
5. **The roadmap.** Recommendation: PR-82 to PR-84 join phase six after the
   pull requests of D86 (PR-79 to PR-81), as D83 to D85 joined it; they change no schema.
6. **The release.** Recommendation: one release after PR-84, with the
   protocol version 3 that a host's Player and page take together.

## The pull requests

Each is approved separately, before it starts and again before its commit and
push, and the rules of phase six hold for them. Sizes are those of the
roadmap.

| Order | PR    | Subject                                              | Schema | Runtime build | Player dist | Q14 | Size |
| ----: | ----- | ---------------------------------------------------- | ------ | ------------- | ----------- | --- | ---- |
|     1 | PR-80 | D87 with D86, and the roadmap rows (documents only)  | —      | —             | —           | —   | S    |
|     2 | PR-82 | The stream and the pool of workers (library, tests)  | —      | —             | yes         | —   | M    |
|     3 | PR-83 | Protocol version 3 and the canvas of a video node    | —      | yes           | yes         | yes | M    |
|     4 | PR-84 | The host guide (workers, the policy) and the release | —      | —             | —           | —   | S    |
