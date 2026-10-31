# D47 — Segmented rendering, the join, and still frames

- Status: Accepted — by the project owner on 2026-10-31, after PR-25a was merged
- Date: 2026-10-31
- Supersedes: —
- Extends: D07 (still images as an output) and D29 (segments, the audio pass,
  files written under a temporary name), each with an `Amended by: PR-25a
(D47)` line
- Related: D04, D06, D13, D14, D26, D28, D29, D44,
  [roadmap of phase three](../roadmap/phase-3.md) PR-25a and PR-25b

## Context

Item 8 of the host editor's needs is "rendering in the host's queue: ranges,
joining, single frames, idempotence, limits". The host runs its own queue: it
splits a render into range jobs, runs them in any order and in separate
processes, possibly on separate machines, and the last job joins the result.
Until now one render was one page and every frame in order (D28.4), and
`exportMp4` encoded the whole grid in one FFmpeg process (D29.3, D29.4).

A joined render is only useful if it is the render: the host must not be able
to tell from the bytes whether a film was rendered in one job or in twenty.
Measuring "the same frames, approximately" would make idempotence and parity a
tolerance instead of a property.

Two ways of joining were measured with the pinned FFmpeg build of D29.1 (on the
host, on 2026-10-31, with the 10-second reference composition at `1080p`, 300
frames, five segments of 60 frames):

| Join                                                                 | Packets | PTS `index × 512` | Deterministic |
| -------------------------------------------------------------------- | ------: | ----------------- | ------------- |
| MP4 segments, concat demuxer, `-c:v copy`, muxed with audio once     |     300 | all 300           | yes           |
| Elementary H.264 (Annex B) segments joined by bytes, then muxed once |     298 | 20 of 298         | —             |

The elementary stream loses its timestamps at every boundary: the raw H.264
demuxer reconstructs them, drops frames around each IDR, and fails the
self-check of D29.3. The concat demuxer keeps every packet with its time and
passes it. A one-pass export and the join of three range jobs rendered out of
order were then the same bytes (`sha256:18e583a5…`), with equal manifests.

## Decision

H.264 output is a sequence of segments of a fixed number of frames on the
composition's frame grid, each encoded by its own FFmpeg process with the same
arguments. A render job renders a range of whole segments; the join concatenates
segment files with stream copy and encodes the audio once. A one-pass export is
the same segments, rendered and joined in one call, so a joined render and a
one-pass render are the same bytes.

### D47.1 The segment grid

- The segment length `segmentFrames` is a whole number of frames, `1` to
  `1 000 000`, part of the export settings and of every manifest. The default
  is `DEFAULT_SEGMENT_FRAMES = 60`. Another value is
  `segment-length-invalid`.
- Segment `i` holds frames `i × segmentFrames` up to the next boundary or the
  composition's last frame, so only the last segment may be shorter.
- A different segment length is a different render: its bytes differ, and the
  join refuses to mix them.

### D47.2 A range is whole segments

- A range is given in integer microseconds, `fromUs` (inclusive) and `toUs`
  (exclusive), and both must be frame times of the grid (D13.2), with
  `toUs = durationUs` naming the end. Omitted, a range is the whole
  composition.
- Both ends must be segment boundaries. A range that is empty, outside the
  composition, off the frame grid, or off the segment grid is `range-invalid`,
  raised before a page opens.

### D47.3 One FFmpeg process per segment

- One page renders the range's frames in order (D28.4). For each segment the
  Producer starts an FFmpeg process at the segment's first frame and finishes it
  at its last; frames are streamed exactly as in D29.3 (receipt by `framehash`,
  backpressure, failure handling).
- The arguments are those of D29.4 without audio and without `+faststart`,
  writing an MP4 whose presentation times start at 0. Every segment therefore
  starts with an IDR frame and depends on no other segment.
- Each segment passes the self-check of D29.3 over its own frames: as many
  packets as frames, presentation times `index × 512`.
- `renderSegments` writes `segment-NNNNNN.mp4` (index padded to six digits) and
  returns a manifest of kind `segments`: the range, the segment length, and for
  each segment its index, first frame, frame count, file name, and SHA-256.

### D47.4 The audio is a pass of its own

- `renderAudio` renders the mix of D29.6 over the whole composition, cuts it to
  the samples of a range (`atrim=start_sample:end_sample`, then
  `asetpts=N/SR/TB`), and writes a lossless intermediate: WAV, `pcm_f32le`,
  stereo, 48 kHz, bit-exact. It needs no browser.
- The range of the audio manifest is the range the join must cover. A preview
  of a range is `render-range` plus `render-audio` of that range, joined at
  the `720p` preset; it is not a separate code path.
- AAC is encoded once, in the join, so no AAC priming or padding falls on a
  segment boundary.

### D47.5 The join

- `joinSegments` takes segment manifests with their directories and at most one
  audio manifest. Before FFmpeg starts, it checks that:
  - every manifest shares the `compositionHash`, the runtime hash, the preset,
    the segment length, the FFmpeg pins, and the audio fields with the others;
  - the segments are on the grid, without gap or overlap, and cover exactly the
    range of the audio manifest (or, without audio, a contiguous range);
  - every file name is a plain name, and every file on disk still has the hash
    its manifest names.

  Anything else is `join-invalid`.

- FFmpeg reads a concat list on `pipe:0` (`ffconcat version 1.0`, absolute
  `file:` paths, `-f concat -safe 0 -protocol_whitelist file,pipe`), copies the
  video, encodes the intermediate to AAC as D29.6 does, and writes the final
  MP4 with `+faststart`. The result passes the self-check of D29.3 over the
  whole range.
- The manifest of the join (kind `export`) names the range, the segment length,
  and each segment's index, first frame, frame count, and SHA-256, but not the
  file names, which belong to the job and not to the render.

### D47.6 Idempotence

- Every output is a pure function of the document's `compositionHash`, the
  range, the settings, the runtime hash, and the pins. Manifests hold no
  wall-clock value (D28.7).
- FFmpeg writes every file as `<name>.partial`; the Producer renames it when the
  file is complete and checked. A retried job either finds the finished file
  with the expected hash or writes it again. The lint rule of D29.3 allows
  `rename` (not `renameSync`) for this, next to removing a partial output.
- The manifests of segments, audio, joins, and stills have
  `manifestVersion: 3` and a `kind`; the manifest of `renderFrames` and the
  golden manifests keep version 2.

### D47.7 Still frames

- `renderStill` renders one frame time of the grid by the frame loop of
  `renderFrames` and returns the bytes with a manifest of kind `still`.
- `png` is the captured bytes, unchanged; it needs no FFmpeg.
- `jpeg` is `mjpeg` at `-q:v 2`, full range, BT.601 matrix, `yuv444p`;
  `webp` is `libwebp` at quality 90, compression level 4, preset `none`, from
  `bgra`. Both are encoded by the pinned FFmpeg on pipes, single-threaded and
  bit-exact; the arguments are in the manifest. Without FFmpeg paths they are
  `ffmpeg-missing`; another format is `still-format-unsupported`.
- `mjpeg` and `libwebp` join the required encoders of D29.1.

### D47.8 The CLI

`@kadrion/cli` gains `render-range --from-us --to-us`, `render-audio`,
`join --in <dir>… --out <dir>`, and
`render-still --time-us --format png|jpeg|webp`; `export` gains
`--segment-frames`. Each writes its files and its manifest into the output
directory, the manifest under a temporary name first.

## Alternatives considered

- **Elementary H.264 segments joined by bytes and muxed once.** Measured above:
  it loses frames and timestamps at every boundary and fails the self-check.
- **One encoder for the whole film, ranges rendered as PNG and encoded by the
  last job.** It would make the last job encode every frame, which is the
  expensive step, and it would need the frames on disk, which D29.3 forbids.
- **Ranges joined with re-encoding.** It makes a joined render differ from a
  one-pass render, so idempotence becomes approximate.
- **AAC per segment.** Each segment would carry its own priming and padding, so
  the joined audio would have gaps at the boundaries.
- **A free range, rounded to segments by the Producer.** A host that asked for
  one range and got another would join the wrong parts; a typed refusal is
  clearer.

## Consequences

- The one-pass MP4 changes its bytes once, because it is now segmented. No MP4
  is committed, so only the structural checks of D29.11 see it. Golden frames,
  the runtime build, and parity are unchanged.
- A host can split a render into any number of jobs of whole segments, retry
  any of them, and join them in any order; a preview of a range costs a range
  job, an audio pass, and a join.
- Keyframes fall at least on every segment boundary, so the default of 60
  frames (two seconds at 30 fps) also bounds seeking in the output.
- `@kadrion/producer` exports `renderSegments`, `renderAudio`, `joinSegments`,
  `renderStill`, and the arithmetic of the grid; `@kadrion/cli` exports the
  commands. Progress, cancellation, and limits are PR-25b; video and audio
  sources are PR-28 and PR-29.

## Verification

- `packages/producer/test/export.test.ts`: the arguments, the grid, ranges off
  the grid, the order of a one-pass export, jobs joined to the one-pass
  manifest, every check of the join (gaps, overlaps, foreign hashes, changed
  files), and stills.
- `packages/cli/test/cli.test.ts`: the commands, their flags, and their files.
- `tests/pinned/export.pinned.test.ts`, in the pinned container: at both
  presets, range jobs rendered out of order in separate CLI processes and
  joined equal the one-pass export byte for byte, with equal manifests and the
  same frame hashes; the self-check; a range off the grid is refused before
  rendering; a PNG still equals the golden frame of its time, and JPEG and
  WebP stills are deterministic.
- The lint rule of D29.3 in `eslint.config.js`.
