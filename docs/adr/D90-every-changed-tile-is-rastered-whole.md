# D90 — Every changed tile is rastered whole

- Status: Accepted — by the project owner on 2026-11-24 (13:21 Europe/Warsaw),
  after PR-93 measured the cause and the cost, with the recommendations of
  all three questions
- Date: 2026-11-24
- Supersedes: —
- Extends, with an `Amended by` line written on acceptance and in force from
  PR-93: D26 (26.3: the arguments in addition to Playwright's defaults
  gain `--disable-partial-raster`)
- Related: D22 (22.9), D26, D28, D33, D34, D65, D75, D86, D89

## Context

The probes of the flip (PR-89) found a defect of masks outside the flip
(D89, implementation notes of PR-89): a frame of the composition of
compositing (D75) depends on the frames rendered before it in the same page.
It breaks the invariant that the runtime state of a frame, and so its
picture, is derived from `(composition, timeUs)` alone. The owner approved its
fix on 2026-11-24.

Measured on 2026-11-24 at `e219a8e` (the release `v0.12.0`), in the pinned
container (four processors, no GPU), with the Producer's `renderFrames`:

| The composition of compositing at 1 000 000 µs, with | Alone, then after frame 0 or after itself |
| ---------------------------------------------------- | ----------------------------------------- |
| every animation of the fixture                       | 186 pixels, 15 levels at most             |
| only the turn of the star matte                      | 109 pixels, 15 levels                     |
| only the morph of the text's polygon mask            | 77 pixels, 2 levels                       |
| only the morph and feather of the photo's mask       | 0                                         |
| no animation of a mask or a matte                    | 0                                         |

- **The first frame of a page is the odd one.** A frame after frame 0, after
  the last frame, or after itself is the same picture every time; only the
  frame rendered first on a fresh page differs. Rendered alone twice, a frame
  keeps its bytes. In the 60 frames of the fixture's grid, 51 rendered
  forward and 50 in reverse differ from the same frame rendered alone, by up
  to 245 pixels. The Player shows the same: a time sought again after another
  differs from the Producer's frame rendered alone.
- **The document is not the cause.** The DOM written for a time is the tree a
  fresh mount writes for it (D54.3, D75.6, and the unit tests of
  `compositing.test.ts`). Replacing every `<mask>` with a fresh copy before
  each frame changed no pixel of the difference.
- **Partial raster is.** Chromium's compositor rasters only the part of a tile
  that a frame invalidated into the tile's existing pixels; the first frame
  of a page rasters whole tiles. Content turned off the axes inside an SVG
  mask, a turned path or a morphing polygon, is painted differently into
  that part than into a whole tile. With `--disable-partial-raster` every
  frame of the grid, forward and in reverse, is the frame rendered alone,
  byte for byte, and a frame rendered alone keeps the bytes it had without
  the argument (at 0, 0.5, 1, and 1.5 s). `--num-raster-threads=1` and
  `--enable-gpu-rasterization` left the difference as it was.
- **Cost.** 90 frames of the reference composition (1080 × 1920) took 14.4 to
  14.6 s without the argument and 14.6 to 14.7 s with it, in two passes: the
  frames of the reference change almost all of every tile anyway.
- **Six golden frames recorded it.** Every composition's golden frames are
  rendered in one sequence. Written again with the argument, twice in fresh
  containers with the same bytes, six golden PNG files change, each to the
  frame rendered alone, byte for byte; the frame rendered alone differs from
  the old file:

  | Golden frame                      | Pixels | Levels at most |
  | --------------------------------- | -----: | -------------: |
  | compositing at 1 000 000 µs (D75) |    186 |             15 |
  | compositing at 1 500 000 µs       |    227 |             22 |
  | shapes at 1 000 000 µs (D73)      |     62 |             12 |
  | shapes at 1 400 000 µs            |     68 |             12 |
  | svg at 1 000 000 µs (D74)         |    101 |             32 |
  | svg at 1 400 000 µs               |    101 |             32 |

  So the defect is not one of masks alone: shapes that morph, trim, or turn,
  and SVG assets that turn, drawn as SVG, meet it too. Every other golden PNG
  file keeps its bytes. The same kind of dependence was seen once before, in
  the animated captions at 1 s (D86, implementation notes); the mark fixed
  that one.

## Decision

> D90: `launchChromium` adds `--disable-partial-raster` to the arguments of D26.3, so the pinned Chromium rasters every tile that a frame changes whole, as it rasters the first frame of a page. A frame of the Producer, and of the Player in the pinned tests, is then the frame rendered alone on a fresh page, whatever was rendered before it.

### D90.1 The argument

`CHROMIUM_ARGS` gains `--disable-partial-raster` after `--mute-audio`. It is
one of D26.3's arguments, so every caller of `launchChromium` gets it: the
Producer, the CLI, and every browser test, the pages of the Player that the
parity of D33 and the gate of D34 measure included. The environment manifest
(D26.4) records it in `args`, a field of `PIXEL_ENVIRONMENT`, so every golden
manifest and parity record is written again with it.

### D90.2 What does not change

- The runtime build, the renderer, and the Player's dist tree: no document is
  written differently. A host's browser keeps its own raster; its pictures
  were never golden (D26, D33).
- The picture of a frame rendered alone on a fresh page.
- The mark of D86 and the barrier of D28.5. The mark's strip is rastered as
  every other changed tile is.

## Alternatives considered

- **A fresh tree, or fresh masks, for every frame.** A new copy of every
  `<mask>` before each frame changed nothing (above); a whole new tree is what
  D22 rejected, and partial raster would still meet any other content that
  changes in part of a tile.
- **`will-change` on the masked element or its frame, as D22.9 did for
  opacity.** Every node already carries `will-change: opacity`, and the
  difference is inside the raster of a layer, not in what is a layer.
- **Holding masks still in the probes.** That is what PR-89 did for the flip;
  it hides the defect from a test and leaves it in every film with a turned
  or animated mask.
- **Comparing with a tolerance.** The gate of D34 is zero; a frame that
  depends on its history is the defect, not noise.

## Consequences

- `@kadrion/producer`: one more entry in `CHROMIUM_ARGS`, exported as before.
  No API changes shape.
- Every frame of the Producer whose tiles a frame before it had rastered may
  change, towards the picture of the frame rendered alone. Six golden PNG
  files change (above); every golden manifest, parity record, and
  `docs/spike/report.md` record the new `args`.
- A host pins the release that carries it: an MP4 or a range job rendered
  before it with a turned or animated mask, shape, or SVG asset may differ
  from the same frames rendered alone, and two range jobs that split a film
  at different frames could differ at those frames.
- Q14 reopens: the golden manifests and the parity records change.
- The flip probes of PR-89 hold the masks of their composition still; they
  may stop doing so later, and keep asserting that each probe does not
  depend on the frame before.

## Verification

- `packages/producer/test/producer.test.ts`: the arguments of D26.3 with
  `--disable-partial-raster`.
- `tests/pinned/mask-history.pinned.test.ts`: the composition of compositing,
  its photo turned by 30°, at three times: in the Producer the frame rendered
  alone equals the frame after the first frame, after itself, and after the
  last frame, and in the Player the time sought first and sought again after
  others shows the Producer's frame alone. It failed on `v0.12.0` (186 and 227
  pixels at 1 and 1.5 s, in both hosts) and passes with the argument.
- The golden frames, written twice in fresh containers with the same bytes,
  each changed file equal to its frame rendered alone, and the pinned tests
  of the compositions against them (`compositing.pinned.test.ts`,
  `shapes.pinned.test.ts`, `svg.pinned.test.ts`, and the others); the parity
  records measured again.

## Implementation notes (PR-93)

The owner accepted this ADR on 2026-11-24; the code is no longer provisional.

- **The code.** `CHROMIUM_ARGS` of `packages/producer/src/environment.ts`
  gains the argument, and the unit test of D26.3 names it. Nothing else of a
  package changes: the runtime build stays
  `sha256:890ab89b338d9ccae52452365a1faf7ddd6bfcd7857af32091d4d1837de73c34`
  (507 010 bytes) and the Player's dist tree
  `sha256:8716f624a87f3686347801fa15b4f8dbf5dee44cc127e1237f3ac6f3fcfcace2`
  (83 files).
- **The test, red first.** `tests/pinned/mask-history.pinned.test.ts` ran on
  `v0.12.0` in the pinned container before the argument and failed both its
  tests: in the Producer 0, 186, and 227 differing pixels at 0.667, 1, and
  1.5 s after the first frame, after itself, and after the last frame; in the
  Player 186 and 227 at 1 and 1.5 s. With the argument both pass, beside the
  pinned tests of compositing, the flip, the clear, the canvas, and the
  opacity history.
- **The golden frames.** Two runs of `goldens:update` in fresh containers
  wrote the same bytes; the six PNG files of the table above change, each
  equal to its frame rendered alone in a separate render, and every manifest
  changes in `environment.args`.
- **The pinned run** (four processors): the whole pinned suite passes (38
  files, 359 tests); the parity records of `docs/spike` are measured again
  with zero differing pixels and differ from those they replace in
  `environment.args` and `goldenManifestSha256` only. `REQUIRED_PINNED_FILES`
  and the Q14 artifact list (`mask-history/producer.json`,
  `mask-history/player.json`) grow by the new file; Q14 reopens with the
  golden manifests.
- **Not done here.** The motion probes of D65 (`docs/spike/motion-probes.json`)
  are a record of their own run and were not run again; the three dependences
  on earlier frames that D22.9 left open were not measured again with the
  argument.

## Questions for the owner, with recommendations

1. **Accept the argument.** Recommendation: yes. It is the cause, measured,
   and it costs about 1 % of a render's time; the code of PR-93 is
   provisional until then.
2. **A patch release.** Recommendation: every package `0.12.1` for the patch
   release `v0.12.1`, as PR-81 did for D86, whose tag the owner pushes from
   `main`, with a note that frames rendered before it after another frame may
   differ from the same frames rendered alone.
3. **The probes of the flip.** Recommendation: they keep holding their masks
   still in PR-93, which changes no assertion of theirs; letting them turn is
   a later, separate change.
