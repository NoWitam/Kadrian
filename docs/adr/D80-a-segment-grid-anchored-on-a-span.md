# D80 — A segment grid anchored on a span, with a shortest last segment

- Status: Proposed
- Date: 2026-11-10
- Supersedes: —
- Extends: D47 (47.1 the grid, 47.2 a range, 47.5 the join, 47.8 the CLI) and
  D48 (48.5 the estimate), each with an `Amended by: K-range (D80)` line
- Related: D04, D12, D13, D14, D29, D34, D52,
  [roadmap of phase three](../roadmap/phase-3.md) PR-25a and PR-25b

## Context

D47.1 lays one grid of segments over every render: segment `i` starts at frame
`i × segmentFrames`, counted from frame 0 of the composition, and D47.2 accepts
only ranges whose both ends are boundaries of that grid. The join copies
segments without cutting them (D47.5), so a host that renders a fragment a
user selected must pick a segment length that divides the first frame of the
fragment and the frame after its last, unless the fragment reaches the end of
the composition.

For a fragment on "odd" frames that length is 1. Frames 7 to 73 of a 30 fps
composition (67 frames) have no other common divisor of 7 and 74, so the
fragment is 67 segments of one frame: 67 FFmpeg processes, 67 MP4 files, 67
IDR pictures, and in a host's queue up to 67 jobs. Measured with the pinned
FFmpeg of D29.1 at `1080p` on the reference composition: the join of those 67
segments is 691 322 bytes, the join of the same frames in the two segments of
this decision is 173 875 bytes.

The project owner decided on 2026-11-10 that a segment of a render is never
shorter than 0.5 s, and that the result of an export does not change: its
frames, its length, its boundaries, and its sound.

## Decision

A render job may name a grid anchored on a span of the composition instead of
the composition's grid: segments of `segmentFrames` from the span's first
frame, and a last segment shorter than `minSegmentFrames` merged into the one
before it. Every job of one render names the same grid; the manifests record
it and the join checks it. A job that names no grid is the job of D47, byte
for byte.

### D80.1 The grid of a span

- A grid is a span of the composition, a segment length, and a shortest last
  segment. The span is a range of frame times by the rules of D47.2
  (`fromUs` inclusive, `toUs` exclusive or the composition's end), or the whole
  composition when it is not given; otherwise `range-invalid`.
- The segment length is that of D47.1. The shortest last segment
  `minSegmentFrames` is an integer from 1 to the segment length, 1 when it is
  not given; otherwise `segment-length-invalid`.
- Segment `i` starts at the span's first frame plus `i × segmentFrames`; the
  last one ends at the span's end. When the grid has more than one segment and
  the last one holds fewer than `minSegmentFrames` frames, it is merged into
  the one before it, which then holds `segmentFrames + last` frames, fewer
  than `segmentFrames + minSegmentFrames` and so fewer than twice the segment
  length. A span shorter than the minimum is one segment, as short as it is.
- The grid of D47.1 is the grid of the whole composition with
  `minSegmentFrames` 1, and every grid of the whole composition that merges
  nothing has its segments.
- The minimum is given in frames, never in seconds (D04, D13): a host that
  wants 0.5 s at 30 fps gives 15.

### D80.2 The manifest names the grid only when it is not D47.1's

- The segments manifest and the export manifest gain an optional field `grid`:
  `{ fromUs, toUs, firstFrame, frameCount, minSegmentFrames }`, the span and
  the shortest last segment. It is written only when the grid's segments are
  not those of D47.1: a span other than the whole composition, or a merged
  last segment.
- Without it, the grid is D47.1's, and the request, the manifests, and every
  file are those of D47: a job that names no grid, and a job that names the
  whole composition and merges nothing, write the same bytes.
- `EXPORT_MANIFEST_VERSION` stays 5. The field is additive and absent from
  every render D47 describes. A join of an earlier version reads a manifest
  with a grid as if it had none: it refuses it with `join-invalid` when a
  segment is not a segment of D47.1's grid, and otherwise joins segments whose
  files are the ones D47.1's grid has.

### D80.3 A range on the grid

- A job on a grid renders whole segments of it: both ends of its range must be
  boundaries of the grid, the first frames of its segments or the end of its
  span. The boundary a merge removed is not one. Without a range, the job
  renders the whole span. Anything else is `range-invalid`, before a page
  opens.
- Segment indices count from the span's first frame. Files and manifests are
  named by them as D47.3 and D47.8 name them.
- The audio pass is unchanged: `render-audio` of the fragment's range states
  the range the join covers (D47.4).

### D80.4 The join

- The join of D47.5 compares `grid` among the fields every manifest shares; an
  absent grid compares as none, so a part on a grid never joins a part
  without one, nor a part on another grid.
- When the manifests name a grid, the join checks, before FFmpeg starts, that
  it is a span of whole frames inside the composition whose times are the
  frame times of its ends (or the composition's end), that its shortest last
  segment lies in `[1, segmentFrames]`, and that it is not D47.1's grid, which
  no manifest names. Each segment must be the segment of the grid with its
  index. Gaps, overlaps, and the range of the audio pass are checked as in
  D47.5. Anything else is `join-invalid`.
- The export manifest of the join carries the grid of its parts.

### D80.5 The estimate

- `kadrion estimate` and `estimatePlan` take the same grid. Its `segments`
  counts the segments of that grid instead of the composition's. The sampled
  segment, its measurement, and the other keys of D48.5 do not change;
  `msPerSegment` stays `msPerFrame × segmentFrames`, and a merged last segment
  takes at most `minSegmentFrames − 1` frames more.

### D80.6 The library and the command line

- `SegmentsRequest.grid` is `{ range?: { fromUs, toUs }, minSegmentFrames? }`.
  `estimatePlan(document, samples, segmentFrames, renderGrid)` takes the same
  object. `@kadrion/producer` exports `segmentGrid`, `gridSegments`,
  `gridRange`, `checkedMinSegmentFrames`, and the types `GridRequest`,
  `SegmentGrid`, and `ManifestGrid`.
- `render-range` and `estimate` take `--grid-from-us <t> --grid-to-us <t>`
  (both or neither) and `--min-segment-frames <n>`. Either one names a grid;
  without them the command is that of D47. `export`, `render-audio`, and
  `join` take no new flag: the join reads the grid from the manifests.

  ```bash
  kadrion render-range … --preset 1080p --segment-frames 30 \
    --grid-from-us 233333 --grid-to-us 2466666 --min-segment-frames 15
  kadrion render-audio … --from-us 233333 --to-us 2466666
  kadrion join --in <range> --in <audio> --out <dir>
  ```

## What stays the same

Measured in the pinned container (image of D26.2, FFmpeg of D29.1) on the
reference composition at `1080p`, by `tests/pinned/export.pinned.test.ts` (D80):
frames 7 to 73 rendered on the grid of the fragment (`--segment-frames 30
--min-segment-frames 15`, two CLI jobs run in reverse order, 30 and 37 frames)
and rendered as today in segments of one frame (one job, 67 segments), each
joined with the same audio pass.

| Property                                                         | Grid of the fragment against segments of one frame |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| SHA-256 of each of the 67 PNG frames piped into FFmpeg           | equal                                              |
| Range (`fromUs`, `toUs`, `firstFrame`, `frameCount`)             | equal                                              |
| Audio of the manifest, intermediate WAV, every AAC packet        | equal                                              |
| Video packets and presentation times (`index × 512`)             | 67 each, equal                                     |
| Streams (codec, profile, size, rates, time bases, `duration_ts`) | equal                                              |
| Size of the MP4                                                  | 173 875 bytes against 691 322 bytes                |
| Decoded video, PSNR of one against the other (report only, P5)   | 46.2 to 47.8 dB at 7 frames                        |

The encoded video differs, as D47.1 already says of any other segment length:
every segment starts with an IDR picture and the encoder's lookahead stops at
its end, so segments of one frame are a stream of intra pictures. What a host
asked for (the frames rendered, the length, the boundaries, and the sound) is
the same.

A job without a grid was compared with the code of `origin/main` in the same
container: `render-range` at `1080p` with the default segment length and at
`720p` with 45 frames, `render-audio`, `join`, `export` at `720p`, and the
`segments` of `estimate`. Every file and every manifest has the same SHA-256.

## Alternatives considered

- **A grid anchored on each job's own range (`--grid-origin range`).** The
  grid of a job would depend on how the host split the fragment into jobs, so
  the join could not check that its parts are one render. A span names the
  grid independently of the jobs; a host that renders a fragment in one job
  gives the span and no range.
- **A cut in the join.** Render the segments of D47.1's grid that cover the
  fragment and cut the ends in the join. Stream copy cannot start a stream
  between two IDR pictures, and a re-encode makes a joined render differ from
  a one-pass render (rejected in D47).
- **A free range rounded to segments by the Producer.** Rejected in D47: a
  host that asked for one range and got another would join the wrong parts.
- **Segments of equal length over the span.** Every boundary would move when
  the span changes, and the join could not check a segment by its index alone.
  Merging the last segment keeps every other one at the segment length.
- **`EXPORT_MANIFEST_VERSION` 6.** It would change the bytes of every manifest
  of a render without a grid, against the owner's requirement, for a field
  that means nothing there.
- **A minimum in seconds.** Persistent times are microseconds and grids are
  frames (D04, D13); the host converts once.

## Consequences

- A host renders a fragment it does not choose in jobs of at least its
  minimum, and at most twice the segment length, instead of jobs of one frame.
- Renders without a grid, the one-pass export, and every existing host are
  unchanged byte for byte. Golden frames, the runtime build, the schema, and
  parity (D34) are unchanged; no package boundary changes (D12), and Kadrion
  stays independent of any host (D01, D02).
- `@kadrion/producer` and `@kadrion/cli` change; the API report of the
  Producer gains the exports of D80.6.
- The minimum is the host's policy. Kadrion only refuses a minimum outside
  `[1, segmentFrames]`.

## Verification

- `packages/producer/test/export.test.ts`: the segments of a grid, the merge
  and its threshold, a span shorter than the minimum, D47.1's grid as a grid of
  the whole composition, 2 000 seeded grids whose segments are contiguous,
  cover the span, and stay within the minimum and twice the length; the
  bounds of the minimum; ranges on and off the grid; jobs of a fragment joined
  in any order; the frames, range, and audio of that join equal to segments of
  one frame; a grid of the whole composition that writes the manifest of D47
  and joins with jobs without a grid into the one-pass export's manifest;
  every refusal of the join; the estimate.
- `packages/cli/test/cli.test.ts`: the flags of `render-range` and `estimate`,
  passed through or refused with exit 2, and no grid without them.
- `tests/pinned/export.pinned.test.ts`, in the pinned container: the
  measurement above, the bytes of D47 for a grid of the whole composition, and
  the estimate's `segments`.
