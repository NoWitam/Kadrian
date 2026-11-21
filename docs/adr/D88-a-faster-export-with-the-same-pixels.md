# D88 — A faster export with the same pixels: a fast capture and a first decode that seeks

- Status: Accepted — by the project owner on 2026-11-21 (20:15 Europe/Warsaw),
  before any code, with the recommendations of all six questions
- Date: 2026-11-21
- Supersedes: —
- Extends, on acceptance, each with an `Amended by` line written then and in
  force from the pull request it names: D28 (28.5: an export may capture with
  another compression of the PNG, D88.1), D29 (29.3 and its Verification: the
  frames of an export equal those of `renderFrames` in pixels, no longer in
  bytes, D88.1 and D88.2), D29 (29.9) and D47 (47.8: `EXPORT_MANIFEST_VERSION`
  6 with the field `capture`, D88.2), D82 (82.5 and 82.10: the first start of
  a decoder in an export may seek, D88.3), and the rule "speed 1 forwards
  stays byte for byte" of the [roadmap of phase six](../roadmap/phase-6.md)
  (D88.5)
- Depends on: D86 (a frame is captured only after it was presented). The fast
  capture is not built before D86 is in force.
- Related: D26, D34, D48, D50, D79, D80, D81. D79 to D81 are `Proposed` in the
  index although their code is on `main`; this ADR builds on what `main` does.

## Context

A host's editor reports that an export is slow, most of all when the film
holds a video clip. Measured on 2026-11-21 at `af8622d`, in a container with
four virtual processors and no GPU, with the pinned Chromium and the pinned
FFmpeg, on a film of 10 s at 1080×1920 and 30 fps (300 frames) exported at
`1080p` in one pass:

| Film                                                           | Export |
| -------------------------------------------------------------- | -----: |
| text and shapes, no video                                      |   34 s |
| one full-frame clip, 1080p, flat synthetic picture             |   97 s |
| one full-frame clip, 1080p, a noisy picture (a real recording) |  624 s |

Where the 624 s go, per frame of the film:

| Step                                                                         | Per frame |
| ---------------------------------------------------------------------------- | --------: |
| `Page.captureScreenshot` as PNG (`captureFrame`)                             |    783 ms |
| the clip's frame into the page (PNG, base64 through CDP, base64 in the page) |    704 ms |
| reading the decoded frame from FFmpeg (`decodeVideoWith`)                    |    303 ms |
| the encoder (`libx264`, one thread)                                          |    185 ms |
| the clip's frame encoded as PNG in Node                                      |    115 ms |
| the barrier and the document check (D28.5, D29.7)                            |     33 ms |

Three findings follow from it.

- **The capture spends its time compressing.** With the parameter
  `optimizeForSpeed: true` the same call takes 155 ms on the noisy film
  instead of 783 ms. Chromium then encodes the PNG with a lower compression
  level: for one page captured both ways, the two files have the same `IHDR`,
  no ancillary chunk, and decode to the same pixels. The PNG itself is larger
  (a page of text: 45 KiB against 118 KiB) and its bytes, and so its SHA-256,
  differ. An export of the noisy film with the fast capture wrote the MP4 of
  `main`, byte for byte (SHA-256 `487c0b96…`). An export of the flat film did
  not: one frame of 300 held the picture of the frame before. That is the
  defect of D86 (the barrier of D28.5 under load), which a shorter capture
  meets more often; it is why this ADR waits for D88.
- **A clip that starts late in its source is decoded from frame 0.** The first
  read of a node starts its decoder at the first frame and decodes every frame
  before the one needed, 12 ms each at 1080p. A range job of D47 pays it again
  for every range, so a clip cut from the tenth minute of a recording costs
  every job about 216 s before its first frame. D82.5 already seeks to the IDR
  picture before a frame when a clip goes back; D82.10 left the first start
  out because it changes manifests.
- **The reader of FFmpeg's output joined its whole backlog for every frame.**
  That is a defect, not a decision, and its fix needs no ADR (PR-79, proposed
  beside this one): 303 ms become 1 to 4 ms, the flat film takes 88 s instead
  of 97 s, and its MP4 keeps its bytes (SHA-256 `666966da…`, measured outside
  the pinned container; the pull request repeats it inside).

The second row of the table (the clip's frame into the page) is the largest
after the capture. It needs a different way to hand a frame to the page and is
left to its own decision (D88.6).

## Decision

> D88: An export captures its frames with Chromium's faster PNG compression, records that in its manifest, and proves by test that they hold the pixels of the reference capture; frames that leave the Producer as PNG (`renderFrames`, a still, the golden frames) keep today's bytes. In an export, a video node's first decoder seeks to the IDR picture before its first frame when that frame is at or beyond source frame 256.

### D88.1 An export captures for speed (amends D28.5 and D29.3)

- **Two captures, one picture.** `Page.captureScreenshot` keeps its arguments
  of D28.5 (`format: 'png'`, `fromSurface: true`, `captureBeyondViewport:
false`, the clip of the composition at scale 1). The **reference capture** adds nothing and is what D28.5
  describes. The **fast capture** adds `optimizeForSpeed: true`.
- **Who uses which.** `exportMp4` and every range job of D47 (`renderSegments`,
  and so `kadrion export`, `kadrion render-range`, and the sample of `kadrion
estimate`) use the fast capture: their frames go to the encoder's pipe and
  are kept nowhere. `renderFrames`, `renderStill`, the Custom HTML check, and
  the Player's measurement keep the reference capture, so a golden frame, a
  PNG still handed to a host, and every parity record keep their bytes.
  `renderAudio` and `join` capture nothing.
- **Not an option of a request.** The capture is chosen by the entry point,
  not by the caller: `RenderRequest` and the CLI gain no field. The render
  session takes it as an option, so that a test can read the fast frames of
  the same times an export wrote.
- **The frames of an export are the fast bytes.** D29.3 stands with one word
  changed: the bytes FFmpeg reads are the bytes of the export's capture,
  unchanged, and their SHA-256 goes into the manifest and is checked by the
  receipt. What no longer holds is that these hashes equal those of
  `renderFrames` and of the golden frames; their decoded pixels do (D88.4).

### D88.2 The manifest says which capture made the frames

- `EXPORT_MANIFEST_VERSION` becomes 6. The manifests of an export and of a
  range job gain a required field `capture: 'fast'`. `joinPlan` already
  refuses a part of another version; it compares `capture` as it compares the
  other facts of a part, so that a later value never joins this one.
- The version is shared with the manifests of a still and of a sound; their
  number changes with it and their content does not, as in PR-29a (D52.5).
- `MANIFEST_VERSION` of `renderFrames` stays 3 and gains nothing.
- A bump, not an additive field: every `frames` hash of an export changes, and
  a reader that compared them with a `render-frames` manifest must be told.

### D88.3 The first start of a decoder in an export may seek (amends D82.5, D82.10)

- **Where.** The frame loop is shared by every entry point, so the rule is an
  option of the render session, set by the entry points that set the fast
  capture (D88.1): an export and a range job. `renderFrames`, a still, and
  the Custom HTML check start at frame 0 as today, whatever the frame, and
  their manifests gain nothing.
- **The rule.** When a node's first frame has source index 256 or more, its
  decoder starts as D82.5 starts one that goes back: at the last sample at or
  before that frame that holds an IDR picture (D79.5), by an input seek to its
  presentation time, counting presentation indices from it. Below 256 it
  starts at frame 0 as today. The fallback of D82.5 is unchanged: no known IDR
  picture, or one that is the first frame, means frame 0.
- **Why 256.** It is four windows of D82.5 (`DECODE_WINDOW_FRAMES` = 64) and
  just above the default distance of key pictures of `libx264` (250), below
  which the IDR picture before the frame is usually frame 0 and the scan for
  IDR pictures would be paid for nothing. It is a constant of source frames, a
  function of the document and the range only, never of a measured time.
- **The window stays closed.** A first start by a seek keeps no window of
  frames: the node reads forward from there exactly as it does from frame 0.
- **Manifest.** Such a job records `seekArgs` as D82.5 defines them. A film
  rendered in one pass and the same film joined from ranges can therefore
  differ in `video.seekArgs`, and in nothing else. D82 already allows it for
  a clip that goes back: a join compares the decode of its parts without
  `seekArgs` and keeps it when any part has it (the note of PR-60 in D82).
  Nothing of D47 changes.
- **Cancelling.** The scan for IDR pictures takes the job's signal, so a
  cancelled job (D48.2) does not wait for it or leave it running.

### D88.4 What is proven, and how

- **Pixels.** For every frame of the reference export (300 frames), the fast
  capture of a page decodes to the pixels of the reference capture, with the
  same `IHDR` and the same list of ancillary chunks. The export's manifest
  `frames` equal those fast captures byte for byte.
- **The file.** The SHA-256 of every segment and of the MP4 of the reference
  export and of the video composition equals the one `main` writes in the same
  container, measured before the change and stated in the pull request, in
  one export alone and in four at once (the load of D86).
- **The seek.** For every container the Producer reads (MP4, fragmented MP4,
  MOV, MKV, and a turned video of D81), a decoder started at a late IDR
  picture and read across at least two later IDR pictures returns the frames
  of a decoder read from frame 0, byte for byte. Today's pinned tests read at
  most 64 frames after a seek and never across the next IDR picture, so this
  is new evidence, not a repetition.
- **Joined against one pass.** For a video composition whose clip starts
  below source frame 256 and is entered by a later range at frame 256 or
  later (the one pass reads on from its start, the range job seeks): the same
  MP4 bytes and the same `frames`, and manifests equal apart from
  `video.seekArgs`. And for a clip that starts at frame 256 or later, where
  both seek: equal manifests.
- **Nothing else moves.** The diff of the golden frames, their manifests, the
  parity records, and the hashes of `docs/spike/report.md` is empty.

### D88.5 An exception to a rule of phase six

The roadmap of phase six requires that a render of a document without a mapped
clip "writes the same frames, sound, and manifests as on `main`". After D88 an
export writes the same picture and the same sound, in the same MP4 bytes; its
manifest differs in `version`, `capture`, the hashes of `frames`, and, for a
range job that starts late in a source, `video.seekArgs`. `renderFrames` and a
still keep the rule in full (D88.3 does not reach them).

### D88.6 Not included

- **The clip's frame into the page without PNG and base64** (704 ms per frame
  on the noisy film). It changes how the render page receives a frame (D50.4)
  and needs its own decision.
- **Rendering ranges in parallel on one machine.** D47 already lets a host run
  range jobs side by side; how many at once is the host's choice.
- **One CDP session kept for the capture.** Opening and detaching a session
  costs 2.3 ms per frame (measured), under 1 % of a frame. `captureFrame`
  keeps opening its own.
- **Capturing with `HeadlessExperimental.beginFrame`, JPEG between the page
  and the encoder, and more encoder threads**: see the alternatives.

## Alternatives considered

- **The fast capture everywhere.** One capture for every entry point keeps the
  equality of bytes between an export, `renderFrames`, and a still. It
  rewrites all 104 golden PNGs, 20 golden manifests, both parity records, and
  the hashes of the spike report in one change whose proof (the new golden
  frames decode to the pixels of the old ones) can be shown once and never
  again, because the old frames are gone. It also makes every PNG still a
  host receives larger, about 2.6 times for a page of text.
- **JPEG between the page and the encoder.** Faster still, and lossy: the
  encoder would no longer read the pixels of the reference frames.
- **`HeadlessExperimental.beginFrame`.** It needs `chrome-headless-shell`, a
  different build than the pinned Chromium of D26, runs on Linux only, and has
  no published measurement against `captureScreenshot`.
- **More threads for `libx264`.** It changes the bytes of the MP4 (D29.4 pins
  one thread).
- **A threshold from a measured time for the seek.** The manifest of a job
  would depend on the machine it ran on.
- **Seeking on every first start.** A clip that starts in the first key
  interval would pay the scan for IDR pictures and gain nothing, and every
  manifest of a film with video would change.

## Consequences

- `@kadrion/producer` only. `capture.ts` gains the fast capture beside
  `captureFrame`, whose signature stays; `render.ts` an option of the render
  session (public, so the API report changes); `export.ts` asks for it;
  `manifest.ts` the version and the field; `video.ts` and `ffmpeg.ts` the
  first start and the signal of the scan.
- No change to the schema, the runtime build, the Player, its dist tree, the
  golden frames, or the parity records.
- The pinned tests of the seek need sources longer than today's (every video
  source of the golden manifests has 75 frames): at least 600 frames with an
  IDR picture every 120, for each container and for a turned video. They are
  made by the fixture of the pinned tests, not stored; the pull request says
  whether Q14 is touched and follows its procedure if so.
- A host that reads export manifests reads version 6 and must not join parts
  written by different versions; the host guide says so.
- The measurements of D29 ("300 PNG frames are about 10 MB") and of D48.5
  (193 ms per frame) are measured again and restated; the estimate of D48.5
  gets closer to what a range job costs, because its setup no longer decodes
  from frame 0.
- Measured with the reader's fix and the fast capture applied by hand,
  outside the pinned container: 97 s to 66 s for the flat film and 624 s to
  441 s for the noisy one. With the mark of D86 as well: 82 s for the flat
  film, and the MP4 of `main`, byte for byte, in one export alone and in four
  at once.

## Verification

- `packages/producer/test`: the capture each entry point asks for, the
  manifest's version and field, `joinPlan` refusing parts of two versions, the
  first start below and at 256, the closed window, and `seekArgs`.
- `tests/pinned/export.pinned.test.ts`: the three links of D88.4 for pixels
  and the file, replacing the equality of hashes with `renderFrames`.
- `tests/pinned/video.pinned.test.ts`: the seek read across later IDR pictures
  for every container, and joined against one pass.
- `tests/repo`: the ADR's row in the index.
- The pull requests state, from the pinned container, the SHA-256 of the
  segments and the MP4 on `main` and after the change.

## Questions for the owner, with recommendations

1. **Which frames are captured for speed.** Recommendation: only the frames of
   an export (D88.1). The other choice, every capture, rewrites every golden
   frame and makes PNG stills larger.
2. **The version of the export manifest becomes 6.** Recommendation: yes. A
   host that stored version 5 parts renders them again rather than joining
   them with new ones.
3. **The first start of an export seeks from source frame 256.**
   Recommendation: yes, with the evidence of D88.4 before the change lands.
4. **The exception of D88.5.** Recommendation: accept it; the picture, the
   sound, and the MP4 keep their bytes.
5. **The roadmap.** Recommendation: the pull requests join phase six after
   those of D86 and D87; they change no schema.
6. **The release.** Recommendation: with the release that follows D87, or one
   of its own if D87 waits; a host reads manifest version 6 from it.

## The pull requests

Each is approved separately, before it starts and again before its commit and
push, and the rules of phase six hold for them. Sizes are those of the
roadmap. PR-79 needs no ADR and has a roadmap row of its own.

| Order | PR    | Subject                                               | Schema | Runtime build | Player dist | Q14         | Size |
| ----: | ----- | ----------------------------------------------------- | ------ | ------------- | ----------- | ----------- | ---- |
|     1 | PR-85 | D88 and the roadmap rows (documents only)             | —      | —             | —           | —           | S    |
|     2 | PR-86 | The fast capture of an export, manifest version 6     | —      | —             | —           | —           | M    |
|     3 | PR-87 | A first start that seeks in an export, the host guide | —      | —             | —           | if fixtures | M    |
