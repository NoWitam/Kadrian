# D62 — Image facts: the size of an image from its header

- Status: Proposed
- Date: 2026-11-03
- Supersedes: —
- Amends: D27 (27.3: verifying an image asset of a media type whose header
  Kadrion reads also reads that header), D44 (`readMediaFacts` of an image),
  and D49 (49.6: the size of an image is a media fact), each with an
  `Amended by: PR-39a (D62)` line
- Related: D14, D22, D25, D44, D46, D50, D51, D53, D60, D61,
  [roadmap of phase four](../roadmap/phase-4.md) PR-39a

## Context

A host places an image before it renders it: it offers "fit to frame", keeps
an aspect ratio while the user resizes the node, and picks `contain` or
`cover` (D50). Since D51.3 the session reads a video's facts from its verified
bytes; for an image, `session.readMediaFacts` answered `null`, so a host had
to decode the image itself, in a browser that may orient it differently from
the pinned Chromium, or in Node.js with a library of its own.

The size must be the one the renderer lays out, and the same in both hosts.
A browser decode is not available in Node.js, and two decoders need not agree:
the pinned Chromium applies the EXIF orientation of some formats and not of
others. Measured in the pinned Chromium (153.0.8010.12, revision 1243) with a
40 x 20 image tagged with each orientation:

| Format | Where the orientation is                   | `naturalWidth` x `naturalHeight` |
| ------ | ------------------------------------------ | -------------------------------- |
| JPEG   | the first APP1 segment holding EXIF, 1–4   | 40 x 20                          |
| JPEG   | the first APP1 segment holding EXIF, 5–8   | 20 x 40                          |
| JPEG   | a second EXIF APP1 after one that says 1   | 40 x 20 (the first one counts)   |
| JPEG   | the value 0 or 9                           | 40 x 20 (ignored)                |
| PNG    | an `eXIf` chunk before the first `IDAT`, 6 | 20 x 40                          |
| PNG    | an `eXIf` chunk after the image data, 6    | 40 x 20 (ignored)                |
| WebP   | an `EXIF` chunk, 6, lossy or lossless      | 40 x 20 (ignored)                |

The renderer sets no `image-orientation`, so the default `from-image` applies
in the Player and in the Producer alike, and an image node shows the oriented
image.

## Decision

**62.1 The facts and the parser.** The facts of an image are
`{ type: 'image', width, height }`: its size in pixels as an image node lays
it out, whole numbers of at least 1. They are read from the header by a parser
of Kadrion's own in `@kadrion/renderer-dom` (`readImageSize`), the package
both hosts already resolve and verify assets with (D27.3), so the browser and
Node.js read the same facts from the same bytes, with no decode.

- **PNG:** the signature, `IHDR` as the first chunk (width and height of at
  most 2^31 − 1), and every chunk whole up to `IEND`, with at least one
  `IDAT`. CRCs are not checked.
- **JPEG:** SOI, every marker segment whole up to the first SOS, the size of
  the first frame header (SOF0–SOF15 without DHT, JPG, and DAC; a height of 0,
  defined later by DNL, is refused), and an EOI after the scan. Bytes after
  the EOI are allowed.
- **WebP:** a RIFF file whose size fits the bytes, and the size of its first
  chunk: `VP8 ` (a key frame with its start code), `VP8L` (its signature), or
  the canvas of `VP8X`.

Only `image/png`, `image/jpeg`, and `image/webp` are read. Another media type
is the typed error `image-unsupported`; bytes that are not a whole file of
their media type (another format, a header that states no size, or a file cut
short) are `image-invalid`.

**62.2 EXIF orientation is applied as the pinned Chromium applies it.** Of
the three options of the plan (refuse an orientation tag, ignore it, report
it), the facts report the size laid out: for JPEG, the orientation tag of the
first IFD of the first APP1 segment holding EXIF before the first SOS; for
PNG, that of an `eXIf` chunk before the first `IDAT`. Values 5 to 8 turn the
image by a quarter, so width and height are swapped; values 1 to 4, values
outside 1 to 8, and an EXIF structure that cannot be read leave the size as
stored. The EXIF of a WebP is ignored, as Chromium ignores it. The orientation
itself is not part of the facts: a host needs the size it lays out, and the
document stores none of it. Refusing the tag was not chosen, since photos of
phones carry it and the renderer already shows them oriented; ignoring it
would state a size the renderer does not lay out.

**62.3 Who reads the facts, and who checks them.**

- **Verification refuses what the parser refuses.** `resolveOneAsset` (and so
  `resolveAssets`) reads the header of every image asset whose media type is
  one of 62.1, after its hash, and refuses it with `image-invalid`, naming
  the asset. The Player and the Producer therefore accept the same image
  bytes. An image of another media type (GIF, SVG, …) is passed on unread, as
  before: it renders, but has no facts.
- **The Player:** `Player.prepareImage(asset, resolveAsset)` resolves and
  verifies one image asset and returns `PlayerImageFacts { width, height }`;
  the verified bytes are kept, so a later `load` or `update` does not ask the
  resolver for them again (as `prepareVideo`, D51.5). Its errors carry the
  asset (D61.4): `image-unsupported`, `image-invalid`, and those of
  resolving. The Player decodes nothing for it.
- **The session:** `readMediaFacts` returns the facts of an image through
  `prepareImage`, once per content hash, and the bus knows them from then on.
  It reads none at start: nothing at the bus needs them.
- **The Producer:** after the load of every render page, it reads the size of
  each image of a media type of 62.1 with the same parser, has the pinned
  Chromium decode the same bytes (the agent's `imageSize`, an `Image` it
  captured when it started), and refuses a difference with the new code
  `image-size-mismatch`, and an image the browser cannot decode with
  `asset-decode-failed`, before the first frame. Every pinned render thus
  checks the parser against the decoder that is the reference (D06).

**62.4 The bus checks nothing with image facts.** An image has no source
range, so no command is refused for want of its facts, and image facts never
stand for the duration of a video or a sound. `factsOf` accepts
`{ type: 'image', width, height }` with whole sizes of at least 1 as facts,
and anything else as none. `describe_document` (D46.3) reports `width` and
`height` on an image asset whose facts the bus knows, as it reports a video's
`sourceDurationUs`, so a model can fit an image without guessing; no tool's
description changes.

**62.5 Not included.** Facts of fonts; the size of GIF, SVG, AVIF, or other
formats; any decode in the Player for facts; a crop or focus point (PR-39b,
D63); waveforms and thumbnails (phase four, question 7).

## Alternatives considered

- **A browser decode in the Player** (`createImageBitmap`, `img.decode()`) —
  not available in Node.js, so a worker could not read the same facts, and
  its orientation rules are those of the host's browser, not of the pinned
  Chromium.
- **The parser in `@kadrion/schema`** — the schema holds the document's rules;
  reading media headers belongs with resolving and verifying asset bytes,
  which `@kadrion/renderer-dom` already does for both hosts (D27.3), outside
  the runtime build.
- **Refusing an orientation tag** — rejects ordinary photos that render
  correctly today.
- **Reporting the orientation beside the stored size** — a host would have to
  apply Chromium's per-format rules itself to know the size it lays out.
- **The Producer comparing with the image nodes of the page** — a document may
  declare an image no node shows, and a video node's frames are images too; a
  separate decode of each asset's bytes checks exactly the parser.
- **Checking more of the file** (CRCs, the entropy-coded data) — the facts
  need the header; a file whose pixels are damaged still fails as
  `asset-decode-failed` when it is decoded.

## Consequences

- `@kadrion/renderer-dom` exports `readImageSize`, `imageSizeKnown`,
  `IMAGE_SIZE_MEDIA_TYPES`, and `ImageSize`, and gains the codes
  `image-unsupported` and `image-invalid`. The module is not imported by the
  page entry, so the runtime build stays byte for byte.
- The Player's dist tree changes (it imports the parser and gains
  `prepareImage`), so the parity record is measured again in the pinned
  environment (D33.10). `tests/pinned/producer.pinned.test.ts` changes: its
  image that does not decode was the first twelve bytes of a PNG, which
  verification now refuses as `image-invalid`, so it becomes a whole PNG
  header with image data that is not zlib, and the cut file is a case of its
  own. A pinned test file changes, so Q14 would reopen (`docs/ci/first-run.md`);
  it is open already since PR-38, and closes by the evidence of a later push
  run of main.
- A PNG, JPEG, or WebP image whose bytes are not a whole file of its media
  type is now refused by both hosts when it is resolved, where before it
  failed at decode (`asset-decode-failed`) or, if Chromium sniffed another
  format, rendered. A host that labels its images by file name must label
  them by their bytes.
- The API reports change: `MediaFacts` gains `ImageFacts`, `PlayerErrorCode`
  gains `image-unsupported` and `image-invalid`, `ProducerErrorCode` gains
  `image-invalid` and `image-size-mismatch`, and `Player` gains
  `prepareImage`, which a host implementing it (a test double) must add.
  Widening a union a package returns is breaking by D60.4; the rest is
  additive. The next release raises its minor version, as v0.2.0 does anyway
  (phase four, PR-43).

## Verification

- `packages/renderer-dom/test/image-size.test.ts`: the fixture PNG; PNG,
  JPEG (baseline and progressive), and WebP (`VP8 `, `VP8L`, `VP8X`) headers
  built in the test; every orientation of 62.2 in little- and big-endian
  EXIF, the first EXIF APP1 only, `eXIf` before and after the image data, the
  EXIF of a WebP ignored, an EXIF that cannot be read; mislabelled bytes,
  every truncation of each format, empty sizes, and unknown media types.
- `packages/renderer-dom/test/resolve.test.ts`: verification refuses a PNG
  that is not one with `image-invalid`, naming the asset, and passes another
  media type unread.
- `packages/player/test/player.test.ts` ("prepareImage (D62)"): the size, read
  once, kept for a later load; `image-invalid` for a cut and a mislabelled
  file, `image-unsupported`, a hash mismatch, and wrong requests, each naming
  the asset.
- `packages/editor-session/test/session.test.ts`: `readMediaFacts` of an
  image, read once, known to the bus, and its error passed on.
- `packages/editor-sdk/test/image-facts.test.ts`: `mediaFactsOf`, the facts
  `factsOf` refuses, `describeDocument`, and no video range checked with
  image facts.
- `packages/producer/test/producer.test.ts`: the agent's `imageSize` with
  the constructor it captured.
- `tests/pinned/producer.pinned.test.ts`: an image the pinned Chromium cannot
  decode is `asset-decode-failed`, and a PNG cut inside its header is
  `image-invalid`, both before the first frame.
- In the pinned environment, every render of the fixtures compares the
  parser with the pinned Chromium's decode of its image (62.3), so
  `node --run test:pinned` and the reference runs check that the facts equal
  the decoded size.
- The API reports (D60).
