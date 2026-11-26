# D92 — The key of a segment, a grid of spans, and a join of segments of earlier renders

- Status: Accepted — by the project owner on 2026-11-26 (15:45 Europe/Warsaw),
  with the recommendations of its questions, together with PR-98 to PR-101
  without a separate approval of each; the host's proposal it answers was
  approved with all its recommendations on 2026-11-26 (10:50 Europe/Warsaw)
- Date: 2026-11-26
- Supersedes: —
- Extends, each with an `Amended by` line written in the pull request that
  brings it into force:
  - D47 (47.3, 47.5, 47.6, 47.8): the key of a segment, the join by keys,
    and the command `segment-keys` (PR-99, PR-100).
  - D80 (80.1 to 80.4, 80.6): spans inside the grid of a span (PR-100). D80
    was accepted on the same day, with PR-98, as written and implemented.
  - D48 (48.5): `estimate` counts the segments of a grid of spans (PR-100).
- Related: D04, D12, D13, D14, D19, D21, D26, D28, D29, D54, D78, D83, D88,
  D89, D90, D93

## Context

A host edits one scene of a long film and renders the film again. It wants to
render only the segments whose frames changed and to join them with segments
it stored from renders of earlier versions of the document. Read from `pr-98`
at `737be15` (PR-97) on 2026-11-26; nothing was measured.

- **The join refuses another document.** `joinPlan`
  (`packages/producer/src/export.ts`) compares 17 fields of every segments
  manifest as canonical JSON (`SHARED_FIELDS`): besides the version, the
  grid, and the pins of the run (`runtime`, `chromium`, `environment`,
  `preset`, `segmentFrames`, `ffmpeg`, `identity`, `capture`, `clear`), six
  describe the whole document:
  `compositionHash`, `schemaVersion`, `assets`, `durationUs`, `frameCount`,
  and `video`, whose `sources` are every video asset the document's nodes
  sample (`packages/producer/src/video.ts`). A segment of an earlier version
  is `join-invalid`, even when its frames are the same.
- **Every boundary hangs on one origin.** The grid of D47.1 starts at frame
  0, the grid of D80 at the first frame of one span (`gridSegments`,
  `packages/producer/src/segments.ts`). A scene that gets longer moves every
  boundary after it, so equal frames fall into other segments.
- **A segment's bytes do not know its place.** Each segment is one FFmpeg
  process (`segmentArgs`) that starts at presentation time 0 with an IDR
  picture, with `+bitexact` and no metadata (D47.3): its bytes are a function
  of its PNG frames, the preset's `videoGraph`, the frame rate (the time
  scale `fps × 512`), and the FFmpeg build.
- **The state of a frame is not all a frame draws.** The state of D19.4
  (`packages/runtime/src/state.ts`) holds what is evaluated at an instant: a
  scene's time, transforms, opacity, effects, transitions, fragments, a
  number's text, a video's source time. What stays in the document, and the
  renderer reads beside the state, is not in it: the string and style of a
  text, the asset of an image or a video, the gradient of a shape
  (`{ kind: 'gradient' }`), and the `html`, `fontAssetIds`, and `parameters`
  of Custom HTML, whose state is the leaf state alone (lifetime, transform,
  opacity, transition). A key of the state alone does not change when a text
  does.
- **A measured node needs its font.** `evaluateComposition` takes the
  metrics of the fonts of measured nodes and throws `font-metrics-missing`
  without them (D83.7, `measuredFontIds`); a key computed from states needs
  the bytes of those fonts.
- **Nothing drawn reads the composition time.** Every node is evaluated at
  its scene's time (D54.3); the renderer pushes each Custom HTML element its
  scene time (`packages/renderer-dom/src/render.ts`, `synchronize.ts`), and
  the managed clock seeds its random numbers by the instance ID (D78.1). The
  composition time of the state appears only in an error message of the
  renderer.
- **Files are named by an index alone.** `segment-NNNNNN.mp4` (D47.3),
  `segments-NNNNNN-NNNNNN.manifest.json` (D47.8), and the join orders the
  segments by `index`.
- **The runtime build does not name the pixels alone.** D90 changed the
  pixels of six golden frames by one argument of Chromium, with the same
  runtime build.
- **The manifest version is 7** (D88.2, D89.2); D80.2, which says it stays 5,
  was written before them. `@kadrion/producer` already depends on
  `@kadrion/runtime` (D12) and evaluates it in Node (`audioPlan`,
  `cornersWarnings`).

## Decision

> D92: The Producer computes, without a browser, a key of every segment: a SHA-256 of what decides its bytes — the pins of the runtime, the browser, and FFmpeg, the preset and the segment length, and, for each of its frames in order, the frame's state without its composition time, the document's own objects of the nodes that state lists, and the content hashes of the assets they read. A render job may divide its grid into spans that start on frame times; the grid of D80 holds inside each span, and its manifests record each segment's span and key. Given the document, the join accepts a segment of an earlier render wherever its key is the key of the document's segment there, and writes the document's export. A job without spans writes the bytes of D47 and D80.

### D92.1 The key of a segment

- **The function.** `segmentKeys(document, grid, settings)` of
  `@kadrion/producer` is pure: no browser, no file, no FFmpeg, no clock.
  `document` is `unknown` and validated (`invalid-document`); `grid` is the
  `GridRequest` of D80.6 with the spans of D92.2; `settings` is
  `{ preset, segmentFrames?, fonts }`: the preset of D29.5, the segment
  length of D47.1, and the metrics of the fonts of measured nodes, as
  `evaluateComposition` takes them (D83.7). It returns
  `{ keyVersion, segments }`, each segment
  `{ index, span, firstFrame, frameCount, key }`, for the whole grid.
- **What the key hashes.** `sha256(canonicalJson(…))`, the hash and the JSON
  of the `compositionHash` (D28.7), of:
  - `keyVersion`, 1: a change of what the key reads raises it, so that no
    earlier key matches;
  - the `contentHash` of the runtime build (D21);
  - the pins of the browser (D26): Playwright, the Chromium revision and
    version, its arguments (`CHROMIUM_ARGS`, D90), the locale, the time zone,
    the device scale factor, and the pinned image; the capture `fast` (D88.2)
    and the clear `white` (D89.2) of every video job;
  - the pinned FFmpeg (D29.1): release, asset, archive hash, the hashes of
    `ffmpeg` and `ffprobe`, version, and configuration; the arguments of a
    segment (`segmentArgs`) with the preset's `videoGraph`;
  - the canvas (`width`, `height`, `fps`) and the segment length;
  - for each frame of the segment, in order: its state at its frame time
    (`evaluateComposition`, D19.4) without the composition's `timeUs` (the
    times of its scenes stay); the document's object of every node that
    state lists, in the order of the state, with the definition of an
    instance; and `{ id, contentHash }` of every asset those objects and the
    state name, a font included (D14).
- **What it promises.** Two segments with equal keys are the same bytes in
  the environment of D26.2 (D47.3, D47.6). PR-100 measures it.
- **What it does not read.** The composition time and the frame index: a span
  that moves on the timeline, because an earlier scene got longer, keeps the
  keys of its segments (question 4). Nor the ID or `compositionHash` of the
  document: two documents share a key where they draw the same frames.
- **Equal keys in one document.** Two segments of one still scene may have
  one key; the join may fill both with one file (D92.3).
- **The manifests.** A render job on a grid of spans computes the keys of its
  segments by this function and records each (D92.2).
- **The command line.** `kadrion segment-keys --composition <file> --assets
<file> --preset <p> [--segment-frames <n>]`, with the grid flags of D80.6
  and `--spans-us` of D92.2: a job of D48 whose line
  `{ "event": "segment-keys", "keyVersion", "segments" }` comes before its
  `done`, as the measurement of `estimate` does. It reads the fonts of
  measured nodes from the asset file and nothing else.

### D92.2 A grid of spans

- **The request.** `GridRequest.spans` lists start times: integers, strictly
  increasing, each a frame time of the composition inside the grid's span
  (D80.1), the first equal to that span's start. Span `k` runs from its
  start to the next one, or to the end of the grid's span. Anything else is
  `range-invalid`, before a page opens. A host gives the starts of its
  scenes, or any other frame times (question 2).
- **The segments.** Inside each span the rule of D80.1 holds: segments of
  `segmentFrames` from its first frame, and a last one shorter than
  `minSegmentFrames` merged into the one before it; a span shorter than the
  minimum is one segment. `index` counts the segments of the whole grid in
  order, so files keep the names of D47.3 and the join its order; each
  segment also names its `span` (question 7).
- **A job.** Its range is whole segments of the grid (D80.3); the boundaries
  are the first frames of the segments of every span and the end of the
  grid's span. The audio pass is unchanged (D47.4).
- **The manifests.** `grid` gains `spans`, `[{ fromUs, firstFrame }]`, and
  every segment of a segments manifest and of an export manifest gains
  `span` and `key`. A grid with spans is always named, even with one span,
  since its manifests carry keys. `EXPORT_MANIFEST_VERSION` stays 7: the
  fields are additive, as `grid` was (D80.2).
- **Without spans** nothing changes: a job writes the files and manifests of
  D47 and D80 byte for byte, and they hold no key (question 6).
- **The join** checks the spans as it checks the grid (D80.4): start times
  that are frame times inside the grid's span, increasing, and each segment
  the segment of its span with its index; anything else is `join-invalid`.
- **The estimate** takes the same spans, and `segments` counts their
  segments (D80.5).
- **The command line.** `render-range`, `estimate`, and `segment-keys` take
  `--spans-us <t,…>` beside the flags of D80.6.

### D92.3 The join by keys

- **The request.** `JoinRequest` gains the target document, its asset
  resolver, and its grid (`segmentFrames` and the `GridRequest` with its
  spans); `kadrion join` gains `--composition <file> --assets <file>`, both
  or neither, with the grid flags of D80.6 and `--spans-us` (question 10).
- **The keys.** The join validates the document and computes its keys by
  `segmentKeys`, with the preset of the parts and the fonts read through the
  resolver. Every slot of the grid that the audio pass covers must be filled.
- **Placing a segment.** A part of the target document (its
  `compositionHash`) fills its own slots, as in D47.5 and D80.4. A segment of
  another document fills every slot that no part of the target fills and
  whose key is its own key; one file may fill several slots, and a segment
  that fills none is left out of the join and of its manifest (question 8).
  A slot without a segment, two segments of the target in one slot, or a
  segment without a key is `join-invalid`.
- **What is compared.** Between every part, as in D47.5: `manifestVersion`,
  `capture`, `clear`, `runtime`, `chromium`, `environment`, `preset`,
  `segmentFrames`, `ffmpeg`, `identity`, and `video` without its sources and
  its `seekArgs`; every file name plain and every file with its hash. With
  the target, not between parts: `compositionHash`, `schemaVersion`,
  `assets`, `durationUs`, `frameCount`, and `grid` of its own parts, and the
  audio manifest, which is the target's and covers the slots as in D47.5. A
  part of another document is checked as a render of its own (its segments
  on its own grid, its frames those of its segments); only its keys tie it
  to the target.
- **The frames.** Each part's `frames` are checked against its own segments
  (D47.5), then numbered with the indices and times of the slots they fill.
- **The export manifest** is the one a render of the target on the same grid
  writes: the target's `compositionHash`, `schemaVersion`, `assets`,
  `durationUs`, `frameCount`, and `grid`; `video` with the target's sources,
  which the join reads as a job reads them (D50.5); the segments with their
  keys; `video.seekArgs` as D88.3 states it.
- **Without the document** the join is that of D47.5 and D80.4, with the
  check of spans of D92.2.

### D92.4 Not included

Storing, finding, and removing segments (the host's); a key of the audio
pass, which always renders the whole range without a browser (D47.4); reuse
of frames inside a segment; keys of a still or of `render-frames`; joining
segments of another worker environment, which the join still refuses by
`environment`, `chromium`, and `identity`.

### D92.5 The release

PR-99 brings the keys and `segment-keys`, PR-100 the grid of spans and the
join by keys, PR-101 the command of D93, the host guide, and `v0.14.0`. No
schema, runtime, renderer, or Player change: the runtime build, the Player's
dist tree, golden frames, and parity records keep their bytes.

## Questions for the owner, with recommendations (all accepted on 2026-11-26)

1. **A key from frame states, not from a slice of the document.**
   Recommendation: yes. The state says what a frame shows, transitions,
   instances, and HTML times included, without a second rule of which parts
   of the document reach a frame. Read from the code: the state holds only
   what is evaluated (D19.4), so the key also reads the document's objects
   of the nodes the state lists, and the assets they name (D92.1).
2. **Spans at any frame times, not only at scenes.** Recommendation: yes. The
   engine does not know what a boundary means to the host.
3. **The time to compute keys.** A film of 10 minutes at 30 fps is 18 000
   states. Recommendation: PR-99 measures it in the pinned container on a
   10-minute document assembled from the fixtures and records the time
   here; nothing is cached between frames unless that measurement asks for
   it, by an amendment.
4. **A key without the composition time.** Recommendation: yes. Nothing drawn
   reads it (Context), so a scene moved by a longer scene before it keeps
   its keys; PR-100 measures the moved scene.
5. **The browser's pins in the key.** The proposal names the runtime hash
   and FFmpeg. Recommendation: the Chromium revision, its arguments, the
   pinned image, the capture, and the clear too: D90 changed pixels with the
   same runtime build.
6. **Keys in every manifest.** Recording them always would change the bytes
   of every manifest without spans. Recommendation: only a job on a grid of
   spans records them; a host that wants reuse gives spans, one span for a
   whole film.
7. **Numbering within a span.** The proposal numbers segments within their
   span, but files are named by an index alone and the join orders by it.
   Recommendation: `index` over the whole grid and `span` beside it; a slot
   is its span and its place there.
8. **One key in several slots.** A still scene has equal segments.
   Recommendation: one stored segment fills every free slot with its key,
   and a given segment that fills none is left out, so a host may pass the
   manifests it stored whole.
9. **What Custom HTML contributes (D78).** Its state is the leaf state; what
   it draws comes from its `html`, `fontAssetIds`, and `parameters`, its
   start, its instance ID, and its scene time, all of which the key reads.
   An element that keeps state between frames or reads a timer draws
   something else, and its key cannot know. Recommendation: Kadrion refuses
   nothing; `segment-keys` lists, per segment, the IDs of the Custom HTML
   nodes active in it, and the host guide asks a host to reuse such a
   segment only while `check-custom-html` (D93) of each is `ok`.
10. **`--composition` and `--assets`, not `--document`.** Recommendation:
    `--composition`, the name of every command (D47.8), and `--assets`, which
    the fonts of measured nodes and the facts of videos need.

## Alternatives considered

- **A key of a slice of the document** (a scene, its transitions, its
  definitions). A second rule of which parts of the document reach a frame,
  which every new feature would have to keep in step with the runtime.
- **A key of the rendered frames.** It needs the render it was to spare.
- **A key per span.** Any change in a scene renders all of it again; a key
  per segment reuses the unchanged part of a changed scene.
- **A join that cuts or re-encodes.** Rejected in D47 and D80: the result
  would differ from one pass.
- **The composition time in the key.** A longer scene would invalidate every
  segment after it (question 4).
- **Kadrion storing segments.** A render service or a media store (D01).

## Consequences

- `@kadrion/producer`: `segmentKeys` and its types, spans in `GridRequest`,
  `SegmentGrid`, and `ManifestGrid`, `span` and `key` in `ManifestSegment`,
  the join by keys; its API report grows. No package boundary changes (D12).
- `@kadrion/cli`: `segment-keys`, `--spans-us`, and `join --composition
--assets`.
- No schema, runtime build, renderer, or Player change; golden frames and
  parity records keep their bytes, and Q14 does not reopen.
- D47.6 gains a stronger form: a segment's bytes are a function of its key.
- A host stores segments under their keys with their manifests. After an
  upgrade of Kadrion or of the worker's pins, the keys change and nothing
  stored is found: a render, never a wrong join. Parts of another
  environment (the Node version and the network of D28.9 included) are
  still `join-invalid`.

## Verification

- `packages/producer/test`: keys stable over runs; a change of a frame's
  state, of a shown node's text, asset, html, parameters, or gradient, or of
  a pin changes the key of the segments that show it, and of no other; a
  scene moved in time keeps its keys; `font-metrics-missing` without a
  font's metrics; spans and their refusals; manifests without spans byte
  for byte; the join by keys with fakes: placement, a key in several slots,
  a segment left out, a gap, another pin, another audio pass.
- A test that every field of the fixture documents reaches the key of the
  segments that show its node, or is listed with the reason the renderer
  does not read it.
- `packages/cli/test/cli.test.ts`: the flags, passed through or refused
  with exit 2.
- `tests/pinned/export.pinned.test.ts`, in the pinned container: a document
  rendered on spans; a second one with one scene changed and an earlier
  scene made longer, its changed segments rendered and the others reused
  from the first; joined with `--composition`, equal to a fresh render of
  the second on the same grid: the MP4 bytes, every frame hash, and the
  manifest apart from `video.seekArgs`. A job without spans writes the bytes
  of `737be15`.

## Implementation notes (PR-99)

PR-99 brings the keys of D92.1 and `kadrion segment-keys`; the grid of spans
in render jobs and manifests and the join by keys are PR-100.

- **The module.** `segmentKeys`, `measuredFontMetrics`, `SEGMENT_KEY_VERSION`
  (1), and the types `SegmentKey`, `SegmentKeys`, `SegmentKeysGrid`, and
  `SegmentKeysSettings` live in `packages/producer/src/segment-keys.ts`,
  exported by `index.ts`; `FontMetrics` is re-exported from
  `@kadrion/runtime`. Its comment states the byte layout of the hashed input,
  and a test writes that input out by hand and hashes it. No package
  boundary changes (D12): the Producer already depends on the runtime.
- **The byte layout.** `sha256` of the UTF-8 bytes of `canonicalJson` of
  `{ browser, canvas, ffmpeg, frames, keyVersion, preset, runtime,
segmentFrames }`, hashed frame by frame without holding the segment's text.
  `browser` holds the pins question 5 names (Playwright, the Chromium
  revision and version, `CHROMIUM_ARGS`, the locale, the time zone, the
  device scale factor, and `PINNED_IMAGE`) and `capture: "fast"` and
  `clear: "white"`; `ffmpeg` the pins of D29.1 that D92.1 names and
  `segmentArgs` with the preset's graph and `<output>`; `preset` the MP4
  preset of the manifests. Each frame's record is
  `{ assets, definitions, nodes, scenes, state }`.
- **Readings closest to the ADR**, where the code reads more than D92.1
  names:
  - The mount reads two facts of a scene beside its nodes at every frame of
    the scene, outside the state: a frame for each side of a clip transition
    (`scene.transitions`) and a layer (`will-change: opacity`) for a scene a
    scene transition fades. So a frame's record also holds, for each scene
    of its state, the scene's object without its `nodes` (listed apart), its
    `clips` (sounds), and its `durationUs` (which places the scenes, as the
    states show), with `sceneTransitions`, the document's scene transitions
    from or to it. A change of a transition renders its two scenes again,
    never a wrong join.
  - An asset is `{ contentHash, id, type }`, not `{ id, contentHash }`: the
    renderer reads bytes by the asset's type, so the same SVG file is read by
    `readSvg` as an `svg` asset (D74.3) and shown as it is as an `image`
    asset (`resolve.ts` of the renderer). The assets of a frame are those
    whose ID is a string anywhere in its record, sorted by ID, so an
    element's asset input (D77) and a mask's image are named, whatever field
    names them.
  - The definitions of the instances a state lists, at any depth, are listed
    once each in the order of the state, beside the nodes, rather than inside
    each instance.
- **Additions the ADR leaves open.** `SegmentKey` also carries
  `customHtmlNodeIds`, the Custom HTML nodes whose own lifetime holds a frame
  of the segment, by their IDs in the state (paths inside instances), which
  `segment-keys` prints by question 9. `SegmentKeysSettings` also takes
  `runtime` (as every job takes it; the build of `@kadrion/renderer-dom`,
  read and verified by `loadRuntimeBuild`, when it is not given: the only
  file the function reads) and `limits` (D48.4, the frames being those of
  the grid's span). `measuredFontMetrics(document, resolveAsset, limits?)`
  reads the fonts of measured nodes and nothing else, verified against their
  `contentHash` and the byte limits, for the command line, which does not
  depend on the runtime (D12). Three codes join `ProducerErrorCode`:
  `font-metrics-missing` (D83.7), and `font-invalid` and
  `font-unmeasurable` for a font `fontMetrics` refuses (D84.6).
- **Spans.** `gridSpans` and `spanSegments` of `segments.ts` check the start
  times of D92.2 (`range-invalid`) and lay the grid of D80.1 inside each
  span; only `segmentKeys` takes them in this pull request, and `--spans-us`
  only `segment-keys`. `render-range`, `estimate`, the manifests, and the
  join are unchanged: every job writes the bytes of `737be15`.
- **The command.** `kadrion segment-keys --composition --assets --preset
[--segment-frames] [--grid-from-us --grid-to-us] [--min-segment-frames]
[--spans-us]`, with the limits of D48.4 and `--max-wall-ms`, prints
  `{ "event": "segment-keys", "keyVersion", "segments" }` and
  `{ "event": "done", "manifest": null }`, writes no file, and exits as
  D48.3 says. The computation is synchronous: a signal is honoured before
  the fonts are read and before the keys are computed, and the grace of
  D48.2 bounds the rest. D48 gains an `Amended by` line for the job (48.1),
  besides the line of 48.5 that PR-100 writes; D47 gains the line of 47.6
  and 47.8.
- **What reaches the key.** A test walks every field of 25 fixture
  documents (every fixture but the templates) and finds each in the record
  of a frame that shows it, or in a list with the reason: the version, the
  canvas (`canvas` and `preset`), the duration and the scenes' durations
  (the frame grid and the states), `safeArea` (read by no runtime and no
  renderer), the document's `clear` (every video job clears white), and
  every sound and an asset only sounds name (the audio pass, D47.4).
- **The time (question 3).** A film of ten minutes at 30 fps, the reference
  scene sixty times with its IDs prefixed (18 000 states, 300 segments of
  60 frames), took 3 501, 3 588, and 3 584 ms in three runs of
  `segment-keys.test.ts` in the container of D26.2 (`--network none`, Node
  24.20.0, 4 cores of an Intel Xeon at 2.10 GHz), about 0.2 ms a frame, and
  3 961 ms on the host. Nothing is cached between frames; the measurement
  asks for no amendment.
- **Unchanged.** No schema, runtime build
  (`sha256:22b773177561b753b4f2924e6d7edb2b1410420c82d2b9234b683c957bb5d09d`),
  Player dist tree
  (`sha256:50c7eb3436470071bfca0783930a12124c2ff0a4594a49d3c4bb46fa112de7f4`),
  golden, parity, or pinned file changes, so the pinned suite does not run
  again; `mp4Preset` and `EXPORT_CAPTURE` moved from `export.ts` to
  `encode.ts` unchanged, so the manifests keep their bytes.

## Implementation notes (PR-100)

PR-100 brings the grid of spans of D92.2 into render jobs, their manifests,
the estimate, and the join, and the join by keys of D92.3.

- **The grid.** `GridRequest.spans` (start times) and `SegmentGrid.spans`
  (`GridSpan`, `{ fromUs, firstFrame }`) are optional; `segmentGrid` checks the
  spans by `gridSpans` and names them only when the request does, so a grid of
  D80 keeps its value. `gridSegments` of a grid of spans gives the segments of
  every span, indexed over the grid and each with its span; `gridRange`,
  `gridRangeSegments`, and `estimatePlan` read it, so the boundaries of a range
  and the segments an estimate counts are those of every span.
  `SegmentKeysGrid` is now `GridRequest`.
- **The keys of a job.** A range job on spans computes the keys of the
  segments of its range before a page opens: `segmentKeyer` (the function of
  `segmentKeys`, for any segment of the grid) with the preset and segment
  length of the job, the runtime build it runs (`contentHash`), and the fonts
  of measured nodes measured from the assets it verified (`measuredFonts`,
  which `measuredFontMetrics` now shares). The keys are those `segment-keys`
  prints; the pinned run compares them.
- **The manifests.** `ManifestGrid.spans` (`ManifestSpan`) and
  `ManifestSegment.span` and `key`, written only on a grid of spans and always
  named there (`isCompositionGrid` is false for a grid of spans). A segment's
  fields are `index`, `span`, `firstFrame`, `frameCount`, `key`, then `file`
  and `sha256`, in the segments manifest and, without `file`, in the export
  manifest. `EXPORT_MANIFEST_VERSION` stays 7.
- **The join without a target** (D47.5, D80.4) checks a grid of spans as
  D92.2 says: a list of spans, each a frame time of the composition inside the
  grid's span, increasing, the first at the grid's start; each segment the
  segment of its index on the spans, naming its span, with a key. A grid of
  spans that is the composition's grid is accepted; without spans it is still
  refused. Its export manifest carries the spans and the keys.
- **The join by keys.** `JoinRequest.target` (`JoinTarget`: `document`,
  `resolveAsset`, `grid`, and optional `segmentFrames` and `limits`) runs
  `keyedJoinPlan` instead of `joinPlan`. It validates the target, lays its
  grid, verifies its assets within the limits, measures the fonts of its
  measured nodes, reads its videos as a job reads them (`prepareVideos`), and
  computes the keys of the slots the audio pass covers, each once, with the
  pins of this build of the Producer and the runtime build the parts name.
  The export manifest takes from the target its `compositionHash`,
  `schemaVersion`, `assets` (as a job records them), `durationUs`,
  `frameCount`, `grid`, and the decode and sources of its videos; the rest of
  it from the parts, as in D47.5. `JoinPlan` gains `document`, what the export
  says of its document, the parts' own without a target.
- **Readings closest to the ADR**, where D92.3 leaves a choice:
  - A join by keys requires the spans of the target's grid (`join-invalid`
    without them, exit 2 for `kadrion join --composition` without
    `--spans-us`): only a render on spans records keys (question 6), and the
    export of the target on its grid names them.
  - A part of the target fills its own slot only with the key of the target
    there, so a part rendered with other pins, which every other part would
    match on no key, is `join-invalid` rather than joined.
  - The decode of video is compared between the parts that decoded one, and
    with the target's, without sources and `seekArgs`: a part of a document
    without video nodes (`video: null`) joins with parts that have them, since
    the decoder is the FFmpeg every part names and the arguments are those of
    this build.
  - Every part given is compared with the others in the pins of the run, also
    a part whose segments fill no slot; a host passes the manifests of the
    current worker (D92.4).
  - The first segment given with a key, in the order of the parts and of their
    segments, fills the free slots of that key; the export lists, for each slot,
    its file, the hash of that file, and the frame hashes of that segment
    numbered as the slot's frames (question 8).
  - `blockedRequests` and `video.seekArgs` are those of the parts that fill a
    slot.
  - `kadrion join` takes its segment length and preset from the parts, and the
    limits of D48.4 only with `--composition`.
- **The measurement** (`tests/pinned/export.pinned.test.ts`, in the container
  of D26.2, `--network none`, Node 24.20.0): the scenes fixture (three scenes
  of 30, 45, and 21 frames) rendered by `render-range` on spans at its scenes
  in segments of 15 frames; a second document with its first scene 6 frames
  longer (so the other two start 6 frames later) and the text of its last
  scene changed. Of its 8 segments, `segment-keys` finds 5 among the keys of
  the first render (the first scene's two, and the moved scene's three:
  question 4) and 3 new (the 6 frames the first scene gained and the changed
  scene's two); `render-range` rendered only those, 27 of 102 frames, in two
  jobs. `join --composition --assets --spans-us`, given every manifest of
  the first render (its last scene's two segments fill no slot and are left
  out), the two jobs, and the audio pass of the second document, wrote the
  MP4 of a fresh render of the second document on the same grid joined
  without a target, byte for byte
  (`sha256:5593fde6dad20949db96317d19d74e64412bae82d834054737f80e95a752923a`,
  109 053 bytes), with every frame hash and the export manifest equal, here
  byte for byte too (the document has no video, so no `seekArgs`). The keys
  the jobs record are those `segment-keys` prints. A grid of one span over the
  whole document writes the segment files of the grid without spans byte for
  byte, and a manifest that differs only by `grid` and each segment's `span`
  and `key`.
- **The bytes of `737be15`.** `tests/pinned/export.pinned.test.ts` ran in the
  pinned container on the tree of PR-99 (`1a3bfaf`, which writes the bytes of
  `737be15`) and on this one: the 36 manifests, MP4 files, and WAV files of
  the one-pass exports, the jobs, the stills, and the grid of D80 that both
  write are identical, byte for byte. The memory report of the export (D29.3), a
  report only, timed out at its 600 s in both trees, alone too, while other
  work held the host's four cores at a load of about 10, and in the full
  pinned run of this tree (371 of 372 tests passed); run alone at a load of
  about 5 it passed in 197 s on this tree, as in 198 s on PR-99's.
- **Unchanged.** No schema, runtime build
  (`sha256:22b773177561b753b4f2924e6d7edb2b1410420c82d2b9234b683c957bb5d09d`),
  renderer, Player dist tree, golden frame, parity record, or pinned file
  list changes; the measurement is a `describe` of an existing pinned file,
  so `REQUIRED_PINNED_FILES` and the Q14 artifact list keep their entries.
  The API report of the Producer grows by `GridSpan`, `JoinDocument`,
  `JoinTarget`, `ManifestSpan`, and the fields above; that of the CLI keeps
  its bytes. The host guide of the keys and the join by keys is PR-101's.
