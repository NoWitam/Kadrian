# D50 — Video nodes and `fit`: schema 0.3, the source frame, and video in the Producer

- Status: Accepted — by the project owner on 2026-10-31, after PR-28a was merged
  (PR #15)
- Date: 2026-10-31
- Supersedes: —
- Extends: D14 (asset type `video`), D16 (node `video`, `fit`), D22 (`fit` as
  `object-fit`, the video element), D25 (`frame` takes the frames of video
  nodes), D28 (the agent passes them; the manifest field `video`), D29 (the
  Producer's private copies of a video), D35 (the step from `0.2`), D46 (three
  tools, source durations in `describe_document`), and D47 (manifest
  versions), each with an `Amended by: PR-28a (D50)` line
- Amended by: PR-28b (D51) on 2026-10-31: D50.6 is superseded by D51 (the Player shows video),
  and the last item of D50.7 (`editor-session` now passes facts)
- Related: D04, D13, D18, D19, D30, D34, D38, D40, D42, D43, D48, D49,
  [roadmap of phase three](../roadmap/phase-3.md) PR-28

## Context

D49 decided the timeline model: a clip is a node, a video node has
`sourceStartUs`, the source frame is chosen from the container's own
timestamps (D49.5), media facts stay out of the document and are checked
before the first frame and in the bus (D49.6), and `0.3` adds video and `fit`
by a step that changes no time value (D49.7). It left to this ADR the fields,
the exact source duration, the rendering path, the delivery of the bytes, the
commands, and the parity threshold.

Two findings of the implementation shape the decision:

- **Decoding in both hosts is two changes, not one.** The Producer decodes
  with the pinned FFmpeg, which it already verifies (D29.1). The Player needs a
  browser decoder in the host window, a frame source per seek, delivery by
  `Blob` with an incremental hash, and a parity measurement of its own (roadmap,
  "Parity"). Each is reviewable alone, so PR-28 is split: **PR-28a** (this ADR)
  is the schema, the runtime, the renderer, the commands, and the Producer;
  **PR-28b** is video in the Player and media facts read by `editor-session`,
  and amends this ADR where it says so.
- **A container is read by seeking.** An MP4 whose `moov` box follows its data
  cannot be read from a pipe, so the Producer cannot hand a video to FFmpeg on
  standard input as it does the audio (D29.6).

## Decision

> D50: Schema `0.3` adds the asset type `video`, the node `video` with `sourceStartUs` and `fit`, and `fit` on images; the source frame of D49.5 and the source duration are pure functions in `@kadrion/schema`; the renderer shows a video node as an image whose bytes the host supplies for each frame; the Producer decodes them with the pinned FFmpeg from a private copy and checks every sampled range before the first frame; and the Player refuses a document with video until PR-28b.

### D50.1 Schema `0.3`

- **Asset type `video`**, with the shape of every asset (D14): `{ id, type,
contentHash }`. Its media type is `video/…` (D27.3).
- **Node `video`**: `id`, `type`, `startUs`, `durationUs`, `position`,
  `scale`, `opacity`, `animations`, `assetId`, `sourceStartUs`, `width`,
  `height`, `fit` — the fields of an image, plus `sourceStartUs`, an integer
  from 0 to 2^53 − 1 (D49.1). It may be a child of a group.
- **`fit`** is `fill`, `contain`, or `cover`, required on every image and video
  node.
- **`muted` and `volume` are not fields of `0.3`.** What validates, renders
  (D16.2, D49.7): a video node of `0.3` is silent, and they arrive in `0.4`
  with PR-29. A video node with either field is refused as an unknown field.
- **Semantic rules.** The asset of a video node must have type `video`, as an
  image's must have type `image`. `sourceStartUs + durationUs − 1`, the last
  source time the node can show, must be a safe integer
  (`source-time-out-of-range`). Whether the sampled range lies inside the
  video is a media fact (D49.6), never a validation rule.

### D50.2 The step from `0.2`

The step gives every image node, children of groups included, `fit: "fill"`
as its last field, and sets the version. `fill` is the `object-fit` an image
always had (D22), so the reference composition renders byte for byte as
before, and the golden manifest changes only in `render.schemaVersion`,
`render.compositionHash`, `render.runtime.contentHash`, and the manifest
version of D50.5 (D49.7). The frozen `0.2` schema, its reference, and its
invalid cases join the compatibility corpus (D35.4, D43.6).

### D50.3 The source frame and the source duration

`@kadrion/schema` exports, beside the frame grid of D13:

- `sourceTimeUs(node, timeUs)`: `sourceStartUs + (timeUs − startUs)` for an
  active node (D49.5), a `RangeError` otherwise;
- `sampledSourceRange(node, compositionDurationUs)`: the lifetime cut to
  `[0, compositionDurationUs)`, mapped to source time, or `null` when nothing
  is sampled (D49.6);
- `sourceFrameIndex(timestamps, timeBase, sourceTimeUs)`: the largest `i` with
  `(pi − p0) × num × 1 000 000 ≤ s × den`, in `BigInt` (D49.5);
- `sourceDurationUs(timestamps, lastDuration, timeBase)`: **the source
  duration** is `(pn − p0) + dn` ticks, where `dn` is the duration of the last
  frame, converted to microseconds and **rounded down**;
- `sourceRangeFits(range, sourceDurationUs)`: the range lies in
  `[0, sourceDuration)`.

Rounding down makes the check conservative: a range that fits in
microseconds fits in ticks. The runtime puts `sourceTimeUs` (or `null` when
inactive) into the state of every video node (D19); it never sees a timestamp.

### D50.4 The renderer: a video is an image of the host's bytes

- A video node is mounted as an `<img>` with the styles of an image node (D22)
  and no `src`; `fit` maps to `object-fit` on images and videos alike. The
  render page keeps its policy: no `media-src`, no `<video>`, nothing played
  (D25.2).
- `KadrionRuntime.frame(root, document, timeUs, host, videoFrames)` takes, as
  a fifth argument, an array of `{ nodeId, mediaType, bytes }`: for every
  video node active at `timeUs` exactly one frame with an `image/…` media
  type, and none for any other node. They become `data:` URLs (`img-src
data:`, D25.2) before the tree is rendered; an inactive video loses its
  `src`. A missing, extra, duplicate, or malformed frame is the `RenderError`
  `video-frames-invalid`, before anything is written. Without video nodes the
  argument is empty and the frame is what it was.
- The runtime stays a function of `(composition, timeUs)` plus the supplied
  bytes, as with images (D19, D27).

### D50.5 Video in the Producer

- **Delivery.** The resolver delivers a video like every asset: bytes and a
  media type, verified against `contentHash` (D14, D27.3), limited by the job
  limits of D48. Delivery by path with a hash computed while reading, which the
  roadmap foresaw for large files, is not part of PR-28a.
- **Private copies.** The Producer writes the verified bytes of each video a
  node uses to a file of its own in a new directory under the system's
  temporary directory, mode `0600`, and removes the directory when the probe or
  the frame loop that needed it ends, whatever the outcome. This amends D29.3's
  "the Producer writes no file"; a lint rule allows `mkdtemp` and `writeFile`
  in `packages/producer/src/video.ts` only. The bytes of a video never enter
  the render page.
- **Media facts.** The pinned `ffprobe` reads the first video stream's size
  and time base, and the best-effort timestamp and duration of every decoded
  frame. The timestamps must be safe integers and strictly ascending; a
  missing last duration is the interval before it; a file without a decodable
  video stream is `video-undecodable`.
- **Before the first frame**, every video node's sampled range is checked
  against its source duration (D49.6): `source-range-exceeded` names the node,
  the range, and the duration. A document with video nodes and no FFmpeg paths
  is `ffmpeg-missing`, also for a PNG still and for `render-frames`, whose
  FFmpeg paths are optional otherwise.
- **Frames.** Each frame loop decodes every video node with its own process:
  `-threads 1`, `-fps_mode passthrough`, bit-exact scaling flags, packed RGB
  on a pipe, read one frame at a time. A node's decoder only reads forward; a
  frame before its position starts it again, so any order of frames gives the
  same pixels. The selected frame becomes a PNG (filter 0, `node:zlib`) and is
  passed to the agent with the frame time. A decoder that ends before the
  probed number of frames is `video-undecodable`.
- **Manifest.** Every render, segment, export, and still manifest has a field
  `video`: `null` without video nodes, otherwise the verified FFmpeg, the
  decode arguments with the path as `<input>`, and for each source its asset,
  hash, size, frame count, time base, and source duration. `MANIFEST_VERSION`
  becomes 3 and `EXPORT_MANIFEST_VERSION` 4 (D28.7, D47.8); `video` is one of
  the fields every part of a join must share (D47.5).

### D50.6 The Player until PR-28b

_Superseded by D51 (PR-28b): the Player decodes video in its host window._

The Player refuses a document with a video asset or a video node with
`video-unsupported`, before it resolves any asset, and names every one of them
in the details. It never shows a frame without its video. PR-28b replaces
this refusal with decoding in the host window, delivery by `Blob`, and a
parity measurement whose threshold inside video nodes is decided from that
measurement (D34 method); outside video nodes the gate stays zero.

### D50.7 Commands, media facts, and tools

- **`SetNodeFit`** `{ nodeId, fit }` on an image or a video node;
  **`SetVideoAsset`** `{ nodeId, assetId }` with an asset of type `video`;
  **`SetVideoSource`** `{ nodeId, sourceStartUs }`. `SetImageAsset` now
  requires an image node, and `AddNode`, `AddAsset`, `SetNodeSize`, and the
  structural commands accept video nodes and assets.
- **Media facts in the bus (D49.6).** `createCommandBus` takes an optional
  `mediaFacts(contentHash)` that returns `{ type: 'video', durationUs }` or
  `null`, and `CommandBus.mediaFactsOf` exposes it. After validation, a command
  whose result changes the sampled source range of a video node — a new node,
  a new asset, a new source start, a new lifetime, a duplicate — is refused
  with `source-range-exceeded` when the range leaves the source, and with
  `media-facts-missing` when the bus has no facts for that asset. A command
  that leaves every sampled range as it was needs no facts. The check reads
  only the document before and after and the facts, so D30's guarantees hold.
- **Tools (D46).** The catalogue gains `set_node_fit`, `set_video_asset`, and
  `set_video_source`, 27 command tools in all, each with its metadata entry
  in `editor-sdk`. `describe_document` reports `sourceDurationUs` of each video
  asset when the bus has its facts.
- `editor-session` passes no facts yet: reading them from the bytes its
  resolver verified is PR-28b. Until then a host gives them to the bus itself.

### D50.8 The second reference composition

- `@kadrion/test-fixtures` adds `videoComposition`, 640 × 360 at 30 fps for 2 s,
  with one video asset and the reference image: a video with `fill` at the
  source size, a video with `cover` and a source start, a video with `contain`
  inside an animated group with a lifetime shorter than the composition, and
  images with `contain` and `cover`. Its golden timestamps are 0, 0.5 s, 1 s,
  1.5 s, and the last frame.
- **The video is generated, never committed**: three seconds of `testsrc2` at
  320 × 180 and 25 fps, H.264 with x264's assembly off (its output differs
  between CPUs with and without AVX-512), made by the pinned FFmpeg with committed
  arguments (`videoFixtureArguments`) and accepted only with the committed
  SHA-256 and facts (`VIDEO_FIXTURE`). `tests/pinned/video-fixture.ts` makes
  it.
- `goldens:update` renders its golden frames beside the reference ones, into
  `video-<timeUs>.png` and `video.golden-frames.json`, and needs the pinned
  FFmpeg to do so.

## Alternatives considered

- **Video in both hosts in one pull request** — one review of a schema step, a
  decoder pipeline in Node.js, a decoder in the browser, two delivery
  contracts, and a new parity measurement at once. The Producer is the
  reference (`AGENTS.md`), so it goes first.
- **Showing a video's first frame, or nothing, in the Player until PR-28b** — a
  frame that is not the document's frame, which "Missing required assets are
  errors, not silent fallbacks" forbids.
- **`muted` and `volume` in `0.3`, without effect** — a field that validates
  but does not render, against D16.2; and a later change of its meaning
  without a version.
- **A `<video>` element in the render page** — the page would play media,
  `media-src` would open, and the frame shown would depend on the browser's
  decoder and clock, not on the document and the time.
- **Frames as PNG straight from FFmpeg** (`image2pipe`) — the stream would have
  to be split into PNG files by parsing chunks, and an encoder setting more
  would enter the manifest; packed RGB is FFmpeg's own decode, which the
  pinned test compares with directly.
- **Decoding from the start for every frame** (`select`) — quadratic in the
  length of the video.
- **A video read from standard input** — impossible for a container whose
  index follows its data, the common output of encoders.
- **Delivery by path now** — a second resolver contract for one asset type,
  before the Player's `Blob` contract exists to share its rules; it stays the
  roadmap's direction for large files.

## Consequences

- `@kadrion/schema`: version `0.3`, the step from `0.2`, the frozen `0.2`
  schema, the source-frame module, and the new semantic rules.
- `@kadrion/runtime`: `VideoNodeState` with `sourceTimeUs`.
- `@kadrion/renderer-dom`: the video `<img>`, `object-fit` from `fit`,
  `applyVideoFrames`, the fifth argument of `frame`, `resolveOneAsset`; the
  runtime build changes.
- `@kadrion/producer`: `src/video.ts`, `probeVideo` and `decodeVideo` of the
  pinned FFmpeg, `RenderRequest.ffmpeg`, the manifest field `video`, three
  error codes (`video-undecodable`, `source-range-exceeded`,
  `video-frames-invalid`), and new manifest versions.
- `@kadrion/cli`: `render-frames` and `render-still --format png` take
  `--ffmpeg` and `--ffprobe` when the document has video nodes.
- `@kadrion/player`: the refusal `video-unsupported`; its dist changes, so
  parity is measured again.
- `@kadrion/editor-sdk` and `@kadrion/ai-sdk`: three commands and tools, the
  media-facts input, and the source durations in `describe_document`.
- Q14 stays open: the runtime build, the Player dist, the golden manifest, and
  the pinned tests change.

## Verification

- `packages/schema/test/source-frame.test.ts`, `migrate.test.ts`,
  `historical-schema.test.ts`, `invalid-compositions.test.ts`, and the
  compatibility corpus: the rule, the step, the frozen `0.2`, and the refusals.
- `packages/runtime/test/video.test.ts`,
  `packages/renderer-dom/test/video.test.ts`: the state and the frames.
- `packages/editor-sdk/test/video.test.ts`, `packages/ai-sdk/test/tools.test.ts`,
  and the catalogue snapshot: the commands, the facts check, and the tools.
- `packages/producer/test/video.test.ts`: probing, the range check, the frame
  selection, the forward-only decoder, the PNG, and the removed copies, on a
  fake FFmpeg.
- `packages/player/test/player.test.ts`: `video-unsupported` before any asset
  is resolved.
- `tests/pinned/video.pinned.test.ts`: the fixture's hash and facts, every
  pixel of the `fill` node equal to FFmpeg's own decode of the selected frame,
  the same frames in reverse order, the golden frames in the pinned
  environment, and the typed errors before the first frame.
- `tests/pinned/producer.pinned.test.ts` with the unchanged PNG files of the
  reference golden frames: the step renders byte for byte as before.
- The lint rule of D50.5 and `tests/repo/lint-guardrails.test.ts`.
