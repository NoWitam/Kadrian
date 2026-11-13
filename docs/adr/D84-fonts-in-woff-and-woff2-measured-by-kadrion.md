# D84 — Fonts in WOFF and WOFF2 measured by Kadrion: its own inflate and Brotli in the runtime

- Status: Proposed
- Date: 2026-11-13
- Supersedes: in part, on acceptance, the paragraph **Formats** of D83.1 for
  WOFF and WOFF2 (collections stay refused), the item "WOFF, WOFF2, and
  collections in a measured node" of D83.11 for WOFF and WOFF2, and the
  recommendation of question 3 of D83 that a host converts its fonts. D83
  keeps its status; on acceptance it gets a line naming D84 and the pull
  request from which D84 is in force (D84.9), as D82 wrote its lines
- Related: D12, D14, D20, D21, D22, D24, D27, D33, D34, D37, D62, D79, D83,
  [roadmap of phase six](../roadmap/phase-6.md)

## Context

The project owner agreed on 2026-11-13 that Kadrion measures fonts in WOFF and
WOFF2 as well. A host keeps its users' fonts as WOFF and WOFF2 and wants to use
them in framed texts and in captions broken by width (D83.3, D83.5) without
converting them to sfnt first. Today it cannot: the recommendation of question
3 of D83, which the owner accepted, was "sfnt only … a host converts its fonts
before it stores them".

What the repository fixes (read on 2026-11-13, `main` at `fe491e1`):

- **`fontMetrics(bytes)`** (`packages/runtime/src/text-frame.ts`, D83.1) is
  synchronous and pure: integer arithmetic on a `DataView` over the sfnt
  file. It reads the tables `head`, `hhea`, `maxp`, `hmtx`, and `cmap` by
  their offsets in the file, and nothing else. It refuses the signatures
  `wOFF` ("would need a zlib decompressor"), `wOF2` ("would need a Brotli
  decompressor"), and `ttcf` with `FontMetricsError` `font-unmeasurable`, the
  only code of `FontMetricsErrorCode`.
- **Two callers inside the runtime build and one outside.** The load step
  (`load` of `packages/renderer-dom/src/page.ts`, D83.7) is `async`; it
  registers every font through the host's `FontFace` constructor, waits for
  the font set (`registerFonts`, D27.1), and then calls the synchronous
  `measureFonts` (`packages/renderer-dom/src/fonts.ts`), which calls
  `fontMetrics` for every font of `measuredFontIds` and turns any failure into
  the `RenderError` `font-unmeasurable`. Hosts call `fontMetrics` themselves,
  synchronously, before `frameLayout` and `evaluateComposition(…, fonts)`
  (host guide, section 5; README); it is exported by the main entry of
  `@kadrion/runtime` and by `@kadrion/runtime/text-frame`, and its signature
  is in the API reports.
- **The browser already loads WOFF and WOFF2.** `registerFonts` hands the
  original bytes to `FontFace`, which reads both formats; a font that only
  unmeasured nodes use is drawn from WOFF or WOFF2 today. Only the measure is
  missing. A file the browser refuses is `font-load-failed` before any
  measure, so the measure only ever sees bytes the browser accepted.
- **The runtime build** (D21) is one classic script bundled by esbuild 0.28.2
  without minification, 367 421 bytes at
  `sha256:cc74d99ce99b8010eacd6a39b28f89e8ff0e81615e43dcd5319ddb58c0d73aef`.
  The Player and the Producer load it byte for byte; a change of it reopens
  Q14 and needs the parity records measured again (D33, D34).
- **The determinism guardrail** (D20.3, D22.8, D24) binds every source of
  `@kadrion/runtime`: no module-level `let` or `var`, no module-level value
  built with `new`, no `fetch`, no `Worker`, no `Intl`, no platform API. It
  lints the repository's sources, not a dependency's.
- **Dependencies.** `@kadrion/schema`, `@kadrion/runtime`, and
  `@kadrion/renderer-dom` have no external runtime dependency. The allowlist
  `externalRuntimeDependencies` of D12 holds one entry, `mediabunny`
  (MPL-2.0), used by `@kadrion/player` outside the runtime build (D79.1). The
  repository grants no licence (D37), so code or data of others that enters it
  carries its own licence record.
- **The fixture fonts are generated** (`packages/test-fixtures/src/assets/font.ts`,
  D27.5, PR-65): the monospaced and the proportional font are TrueType files
  built glyph by glyph, with `glyf` and `loca` of simple rectangular contours,
  so no font file of others is in the repository (there is no Inter or other
  OFL file). Node, which runs every test, has `zlib.deflateSync`,
  `zlib.inflateSync`, `zlib.brotliCompressSync`, and
  `zlib.brotliDecompressSync`, all synchronous, without a dependency.
- **The schema does not name font formats.** A font asset is
  `{ id, type: "font", contentHash, … }`; the media type the resolver returns
  is any `type/subtype` (D27.3). Nothing in the schema refuses WOFF or WOFF2.

## Decision

> D84: `fontMetrics` reads WOFF 1.0 and WOFF 2.0 files as well as sfnt files, synchronously, with an inflate (RFC 1950 and RFC 1951) and a Brotli decoder (RFC 7932) of Kadrion's own, written in TypeScript in `@kadrion/runtime` under the determinism guardrail, without a dependency and without a platform API. It decompresses only what the five tables of D83.1 need, never reconstructs `glyf` or `loca`, reads the advances of a transformed `hmtx` directly, refuses collections as before, refuses a damaged container or stream with the new code `font-invalid`, and refuses a font that would decompress past 64 MiB. The schema does not change.

### D84.1 The decoders: Kadrion's own, in the runtime

- **`inflate`** of RFC 1951 inside the zlib wrapper of RFC 1950: the header's
  check bits, no preset dictionary, stored, fixed, and dynamic blocks, and the
  Adler-32 at the end, which must match. About 300 lines.
- **`brotliDecode`** of RFC 7932: meta-blocks (compressed, uncompressed, and
  metadata), simple and complex prefix codes, block switches, the four
  literal context modes, distance codes with their postfix and direct codes,
  the window bits of the stream header (10 to 24; the large window of later
  Brotli versions is not RFC 7932 and is `font-invalid`), and the static
  dictionary with its 121 transforms. About 1 000 to 1 300 lines, the
  dictionary apart. The decoder writes into one buffer as long as the output
  it is asked for (D84.4), so it needs no ring buffer: a distance past the
  smaller of the window and the bytes written is a reference to the
  dictionary, as RFC 7932 states it.
- **The static dictionary** (122 784 bytes) is data both formats of Brotli
  need: an encoder may refer to its words in any stream, a font's names and
  tables included, so a decoder without it fails on valid files. It is stored
  in a generated module as the base64 text of its deflate stream (about 50 to
  60 KiB of deflate, by estimate; PR-71 records the measure), which `inflate`
  expands when a stream first refers to it, once per call of `fontMetrics`:
  a module-level `Uint8Array` would be a value built with `new`, which the
  guardrail forbids (D22.8), and a cache would be module state (D20).
  Expanding it costs about a millisecond per WOFF2 font that refers to it.
- **Where the dictionary comes from.** A script of PR-71 derives it from the
  Brotli of Node itself: it writes, for every word length and index, a
  stream whose only command copies that word from the dictionary with the
  identity transform, and decodes it with `zlib.brotliDecompressSync`. No file
  is downloaded and no foreign file enters the repository; the generated
  module records the length, the SHA-256, and the licence record of D84.8.
- **Pure and synchronous.** Both decoders are functions over a `Uint8Array`
  and explicit limits, with integer arithmetic and typed arrays only, under
  the guardrail like every other source of the runtime. They live in the
  runtime because `fontMetrics` does, and the load step must read the metrics
  inside the runtime build so that the Player and the Producer run the same
  code (D83.7).
- **`fontMetrics` keeps its signature.** It stays
  `fontMetrics(bytes: Uint8Array): FontMetrics`, synchronous, so the load
  step, `measureFonts`, `tests/repo/adr-signatures.test.ts`, the API reports,
  and every host's call stay as they are; a host passes the bytes of a WOFF or
  WOFF2 file where it passed an sfnt file.

### D84.2 What is read from a WOFF file

- **The container** (WOFF 1.0, a W3C Recommendation): the 44-byte header, then
  one 20-byte entry per table (`tag`, `offset`, `compLength`, `origLength`,
  `origChecksum`). The header's `length` equals the file's length, `reserved`
  is 0, `numTables` is at least 1, and `flavor` is one of the three sfnt
  signatures `fontMetrics` reads (`0x00010000`, `true`, `OTTO`); any other
  flavor is `font-unmeasurable`.
- **Only the five tables are decompressed.** WOFF compresses each table on
  its own, so `fontMetrics` inflates `head`, `hhea`, `maxp`, `hmtx`, and
  `cmap` and nothing else; `glyf`, `CFF `, and every other table are never
  touched. A table whose `compLength` equals its `origLength` is stored as
  is; a smaller `compLength` is a zlib stream that must inflate to exactly
  `origLength` bytes; a larger one is `font-invalid`.
- **The metadata and the private block** are never read, so they are not
  decompressed and their contents are not checked.
- **Strict where it changes the bytes read, lenient elsewhere.** An entry
  outside the file, two entries for one tag, overlapping table data, a zlib
  stream with a bad header or a bad Adler-32, or one that ends early, runs
  past `origLength`, or leaves bytes after its end, is `font-invalid`. The
  order of the entries, the four-byte padding, and `origChecksum` change no
  byte that is read, so they are not checked, as the sfnt reader of D83.1
  checks no checksum either.

### D84.3 What is read from a WOFF2 file

- **The container** (WOFF 2.0, a W3C Recommendation): the 48-byte header,
  then the table directory, in which each entry has a flags byte (the index
  of one of the 63 known tags, or 63 and the tag in four bytes; the transform
  version in the top two bits), `origLength` as a `UIntBase128`, and
  `transformLength` for a transformed table. A `UIntBase128` with a leading
  zero byte, more than five bytes, or a value past 2³² − 1 is `font-invalid`,
  as the specification requires. `length` equals the file's length and
  `reserved` is 0; the flavor is one of the three sfnt signatures, or
  `ttcf` (D84.5).
- **One stream for all tables.** WOFF2 compresses the concatenation of every
  table's data, in the order of the directory and without padding, as one
  Brotli stream of `totalCompressedSize` bytes. A table's data in the
  decompressed stream is `transformLength` long when the table is transformed
  and `origLength` long otherwise. `fontMetrics` computes where the five
  tables lie, decodes the stream only up to the end of the last of them, and
  stops; the rest of the stream, the metadata, and the private block are not
  decoded. Usually that is most of the stream, since font tools write `glyf`
  before `hmtx`, so the cost of a WOFF2 font is roughly the decoding of its
  outlines (D84.10).
- **No table is reconstructed but the five.** `head`, `hhea`, `maxp`, and
  `cmap` are never transformed (the specification defines transforms for
  `glyf`, `loca`, and `hmtx` only), so their bytes are read as in an sfnt
  file. `glyf` and `loca` are skipped whether they are transformed or not:
  `fontMetrics` reads no outline, so the reconstruction of `glyf` (the
  triplet coding of points, the bounding boxes, the composite glyphs) and of
  `loca` is not written. A transformed `loca` has a `transformLength` of 0,
  which is checked; the bytes of a transformed `glyf` are only skipped.
- **A transformed `hmtx`** (transform version 1) holds a flags byte, then the
  `numberOfHMetrics` advance widths as `uint16`, then the left side bearings
  that bits 0 and 1 of the flags say were not omitted. The advances are
  exactly the ones an sfnt `hmtx` holds, so `fontMetrics` reads them in place
  and never reconstructs the omitted bearings, which need `glyf`. Its
  `transformLength` must equal the length the flags give (1, plus
  `2 · numberOfHMetrics`, plus the bearings kept), its reserved bits must be
  0, and it must come with a transformed `glyf`, as the specification
  requires; otherwise it is `font-invalid`. `numberOfHMetrics` and
  `numGlyphs` come from `hhea` and `maxp`, which are read first. An
  untransformed `hmtx` (version 0) is read as today.
- **One reader of tables.** The sfnt, WOFF, and WOFF2 paths all yield the
  bytes of the five tables, and one function reads the metrics from them, so
  every check of D83.1 and its implementation notes (`unitsPerEm` from 16 to
  16 384, `numberOfHMetrics`, the order of `cmap` segments and groups, the
  choice of subtable) holds for every format unchanged, and a table too short
  for what it must hold stays `font-unmeasurable`.

### D84.4 Limits

- **64 MiB of decompressed bytes per font.** For WOFF, the sum of the
  `origLength` of the five tables; for WOFF2, the length of the stream up to
  the end of the last of them. The limit is checked on the declared lengths
  before any buffer is allocated, so a font over it allocates nothing and
  decodes nothing; it is `font-unmeasurable`, its message naming the limit.
  The largest fonts in use (CJK families of 20 to 30 MB as OpenType) fit.
- **No bomb.** Both decoders are given the exact length they must produce and
  write into a buffer of that length; a stream that would write one byte more,
  that ends before the length, or that leaves compressed bytes after it, is
  `font-invalid`. A small file therefore never allocates more than the length
  its directory declares, and that length is within the limit above.
- **Bounded work.** Each decoder does work linear in its input and output:
  every prefix code is built from at most a fixed number of lengths, every
  loop advances the output or the input, and a code that cannot be decoded is
  `font-invalid` at once. The reader of D83.1 already bounds a hostile `cmap`
  to one pass over its code points.

### D84.5 Collections

- **Still refused.** A WOFF2 whose flavor is `ttcf` holds a collection
  directory and several fonts, as an sfnt collection does; a measured node
  names a font asset and no face of it, and the browser's choice of a face
  would decide the drawing. It is `font-unmeasurable`, as an sfnt collection
  is (D83.1). WOFF 1.0 has no collections.

### D84.6 Error codes

- **`font-invalid`, new.** `FontMetricsErrorCode` becomes
  `'font-unmeasurable' | 'font-invalid'`, and `RenderErrorCode` gains
  `font-invalid`, which `measureFonts` raises from the error's own code
  instead of always `font-unmeasurable`. `font-invalid` means a WOFF or WOFF2
  file whose container or compressed stream is damaged: a header that
  disagrees with the file, a table outside the file or overlapping another, a
  bad `UIntBase128`, a zlib or Brotli stream that is malformed, fails its
  check, or does not produce the declared length. Its message names the font,
  the table, and the offence, as the codes of D62.1 name theirs
  (`image-invalid`).
- **`font-unmeasurable` keeps its meaning** for a well-formed file Kadrion
  does not measure: a collection, an unknown flavor or signature, a missing
  or short table, a `cmap` without a subtable it reads, and a font past the
  limit of D84.4. A truncated sfnt table stays `font-unmeasurable`, as D83.1
  decided, so no existing refusal changes its code.
- **In the hosts.** The browser refuses most damaged files first, so in the
  load step `font-invalid` arises only for a file the browser accepts and
  Kadrion's decoder does not, which the tests of D84.11 keep from happening
  for every fixture; a host meets the code mainly when it calls `fontMetrics`
  itself. The Player and the Producer report it as `page-error` with the
  message, as they report `font-unmeasurable` (D83, implementation notes of
  PR-68); giving them the codes is the open question of PR-68 and is not
  decided here.

### D84.7 Dependencies and determinism

- **No new dependency.** The allowlist of D12 does not change, and the
  runtime build stays the bundle of three workspace packages (D21).
- **Determinism is unchanged.** Inflate and Brotli are lossless and fully
  specified: a stream has one output or is invalid, so the metrics of a WOFF
  or WOFF2 file are the metrics of the sfnt file it holds, in Node and in any
  browser, by the same code. Nothing reads a clock, a platform API, or a
  previous call.

### D84.8 Licence of the dictionary (D37)

- The static dictionary is data of Brotli, published by Google under the MIT
  licence and reproduced in RFC 7932. The generated module carries, in its
  header comment, where the data comes from and the MIT copyright notice and
  permission text, which the MIT licence asks to keep with substantial
  portions; this is the licence record of D37 and D12 for data that is not a
  dependency. The decoders' code is the repository's own, written from the
  RFCs and the W3C specifications, which are cited and not copied.

### D84.9 What does not change

- **The schema.** No field, no version, no step, no migration; the
  compatibility corpus and every saved document stay as they are. A host that
  already stores WOFF or WOFF2 fonts changes nothing in its documents.
- **The drawing.** The browser draws a WOFF or WOFF2 font from its own bytes
  through `FontFace`, as it does today for unmeasured nodes; only the measure
  is new. The golden frames of every composition stay byte for byte.
- **Signatures.** `fontMetrics`, `measureFonts`, `load`, `mount`, and
  `evaluateComposition` keep their signatures; the API reports change only by
  the widened `FontMetricsErrorCode` and `RenderErrorCode`.

### D84.10 Costs

- **The runtime build grows** by the decoders, the containers, and the
  dictionary: about 60 to 100 KB unminified over 367 421 bytes, by estimate,
  most of it the dictionary; PR-72 records the measure. The Player's dist tree
  changes with it, so Q14 reopens and parity is measured again.
- **A load costs a decompression** per WOFF2 font that a measured node uses:
  the stream up to `hmtx` and `cmap`, so roughly the decoded size of the font
  (a Latin font of 30 to 100 KB as WOFF2 decodes in milliseconds; a CJK font
  of several megabytes may take a few hundred milliseconds in a browser). A
  WOFF font costs only its five small tables. A host that reads metrics
  itself reads them once per font (host guide, section 5), as today; the
  runtime caches nothing (D20).

### D84.11 Not included

- Collections in WOFF2 (D84.5) and in sfnt (D83.1).
- The reconstruction of `glyf`, `loca`, or the bearings of `hmtx`, and a
  conversion from WOFF or WOFF2 to sfnt offered to hosts.
- A check of `origChecksum`, of the metadata block, or of the private block.
- An asynchronous `fontMetrics`, a `DecompressionStream`, or WebAssembly.
- Brotli's large window and shared dictionaries (not RFC 7932).

## Alternatives considered

- **`DecompressionStream` of the browser (and of Node)** — it is asynchronous,
  so `fontMetrics` would become `async`: its signature, the API reports, the
  pinned signature tests, `measureFonts`, and every host's synchronous call
  before `frameLayout` would change, for a public function that hosts already
  use. The formats every engine ships are gzip, deflate, and deflate-raw;
  Brotli is not among them in every browser a viewer's Player may run in, so
  WOFF2 would still need a decoder of its own. It is a platform API, which the
  guardrail keeps out of the runtime (D24), and the Player and Node would
  decode with different code, where D83.7 asks for the same code. The load
  step is already `async` and could await it, but hosts could not, so the two
  paths would differ.
- **A dependency for each decoder** — for example a small inflate package and
  a hand-written JavaScript Brotli decoder from npm (MIT). It would be the
  first external dependency of the runtime build, outside the guardrail's
  lint (a dependency that keeps its decoded dictionary in module state, as a
  JavaScript decoder naturally does, breaks D20 where no test sees it),
  without the output limit of D84.4 unless wrapped, with error messages and
  codes of its own, in a module format the IIFE bundle must adapt, and with
  maintenance to watch. The subset needed is small enough to own.
- **Copying a reference decoder into the repository** (Google's Brotli
  decoder in JavaScript, MIT) and converting it to TypeScript — less writing,
  but foreign code under its own licence in the runtime, rewritten anyway to
  meet the guardrail and the limits, which leaves little of the original. It
  stays the fallback if the owner prefers it to a decoder written from the
  RFC (question 1).
- **WebAssembly** (the woff2 decoder of Google or a Brotli build) — a binary
  in the runtime build, a toolchain to pin, and an asynchronous instantiation
  in the browser.
- **The host converts** (the status quo of D83) — the owner decided on
  2026-11-13 that Kadrion measures WOFF and WOFF2; every host would otherwise
  write and run the same conversion before every store.
- **Reconstructing the whole sfnt file** and reading it with the reader of
  D83.1 — the `glyf` transform is the largest part of a WOFF2 decoder and
  gives `fontMetrics` nothing it reads.
- **Decoding every table and checking `origChecksum`** — work and refusals
  that change no byte that is measured; the browser's own decoder checks the
  font it draws.
- **One code for every refusal** (only `font-unmeasurable`) — a host could not
  tell a file to convert from a file that is broken; `image-invalid` (D62.1)
  already draws that line for images.
- **Accepting WOFF2 collections** with a face index on the font asset — a
  schema change for a case no host asked for.

## Consequences

- A host stores its users' WOFF and WOFF2 fonts as they are and uses them in
  framed texts and in captions broken by width; its own overlay calls
  `fontMetrics` on the same bytes. It converts nothing and blocks nothing.
- `@kadrion/runtime`: `inflate`, `brotliDecode`, the dictionary module, the
  readers of the WOFF and WOFF2 containers, `fontMetrics` over one reader of
  tables, and `font-invalid`. Under the guardrail like every other source.
- `@kadrion/renderer-dom`: `measureFonts` passes the code of the error on;
  `RenderErrorCode` gains `font-invalid`. The runtime build changes.
- `@kadrion/player` and `@kadrion/producer`: nothing of their own; the
  Player's dist tree changes with the runtime build.
- `@kadrion/schema`, `@kadrion/editor-sdk`, `@kadrion/ai-sdk`,
  `@kadrion/editor-session`, and `@kadrion/cli`: no change.
- `@kadrion/test-fixtures` or the tests: encoders of WOFF and WOFF2 for the
  generated fonts, using `node:zlib`, dev only.
- Package boundaries (D12) do not change. Nothing names a host (D01, D02).
- The host guide (section 5) and the README say that measured nodes take
  sfnt, WOFF, and WOFF2 fonts, not collections, and name `font-invalid` and
  the limit.

## Verification

- `packages/runtime/test`, inflate: equal to `zlib.inflateSync` on seeded
  inputs (random bytes, text, runs, empty) compressed by `zlib.deflateSync` at
  levels 0 to 9 and every strategy, plus hand-written streams of each block
  kind; every malformation (bad header, preset dictionary, bad Adler-32,
  truncation, trailing bytes, an output longer or shorter than asked) refused
  with `font-invalid`.
- `packages/runtime/test`, Brotli: equal to `zlib.brotliDecompressSync` on
  seeded inputs compressed by `zlib.brotliCompressSync` at qualities 0 to 11,
  window bits 10 to 24, and the modes generic, text, and font, with inputs
  that make the encoder use the dictionary and its transforms (English text,
  names of fonts); hand-written streams of an empty stream, uncompressed and
  metadata meta-blocks, and simple prefix codes of one to four symbols; the
  dictionary's length, SHA-256, and equality with the one Node's Brotli
  yields, re-derived by the generating script.
- `packages/runtime/test`, robustness: a fixed number of seeded mutations
  (flipped bits, truncations, splices) of every WOFF and WOFF2 fixture end in
  metrics or in `font-invalid` or `font-unmeasurable`, never in another
  exception, and never allocate past the declared length.
- `packages/runtime/test`, metrics: for the monospaced and the proportional
  font in its three `cmap` variants, the metrics of the WOFF and of the WOFF2
  file equal those of the sfnt file, with `glyf` and `loca` transformed and
  not, `hmtx` transformed with each combination of bits 0 and 1 and not;
  every refusal of D84.2 to D84.5 with its code; the limit refused before any
  allocation.
- **The fixtures**: WOFF and WOFF2 files of the generated fonts, written by
  test encoders over `node:zlib` (the `glyf` transform for their simple
  glyphs, about 200 lines), so that no font file and no font tool enters the
  repository (D27.5). Chromium's own decoder is the check of the encoders:
  in the pinned Chromium every fixture loads through `FontFace`.
- `tests/pinned`: the comparison of Node and Chromium of D83 (PR-65) gains the
  metrics of the WOFF and WOFF2 fixtures, which must give the same SHA-256 as
  the sfnt fonts; the framed-text composition with its font given as WOFF and
  as WOFF2 renders its golden frames byte for byte in the Producer, and its
  measured lines are drawn as wide as `frameLayout` says, within half a
  pixel; every earlier golden PNG file stays byte for byte; parity at zero.
- `tests/repo`: the signatures of `adr-signatures.test.ts` unchanged; the API
  reports changed only by the two widened unions.

## Implementation plan

The pull requests follow PR-68 in phase six (roadmap). Each is approved on its
own, before it starts and again before its commit and push, and the rules of
phase six hold for them. Sizes are those of the roadmap: S under 500 changed
lines, M 800 to 1 500, L 2 000 to 3 000, tests included; the generated
dictionary module is counted apart.

| Order | PR    | Subject                                          | Schema | Runtime build | Player dist | Q14 | Size |
| ----: | ----- | ------------------------------------------------ | ------ | ------------- | ----------- | --- | ---- |
|     1 | PR-69 | D84 (documents only)                             | —      | —             | —           | —   | S    |
|     2 | PR-70 | Inflate and the WOFF container (library only)    | —      | no (checked)  | —           | —   | M    |
|     3 | PR-71 | Brotli, the dictionary, and the WOFF2 container  | —      | no (checked)  | —           | —   | L    |
|     4 | PR-72 | `fontMetrics` reads WOFF and WOFF2 in both hosts | —      | yes           | yes         | yes | M    |
|     5 | PR-73 | The host guide, the README, and the release      | —      | —             | —           | —   | S    |

- **PR-69.** This document, its row in the index, and the roadmap. Acceptance:
  the owner answers the questions below; `node --run format:check` and
  `tests/repo/adr.test.ts` pass.
- **PR-70.** `inflate` and the reader of the WOFF container yielding the five
  tables, in an entry of their own (`@kadrion/runtime/woff`) that the main
  entry, the render page, and the Player do not reach, so the runtime build
  and the Player's dist tree keep their bytes, as PR-59 and PR-65 did; the
  WOFF encoder of the tests; the tests of inflate and of the container.
- **PR-71.** `brotliDecode`, the generating script and the dictionary module
  with its licence record (D84.8), and the reader of the WOFF2 container with
  the transformed `hmtx`, in the same entry; the WOFF2 encoder of the tests
  with the `glyf` transform; the tests of Brotli and of the container. The
  runtime build keeps its bytes (checked).
- **PR-72.** `fontMetrics` over one reader of tables for the three formats;
  `font-invalid` in `FontMetricsErrorCode` and `RenderErrorCode`;
  `measureFonts` passing the code on; the pinned tests of the Verification;
  the API reports; D83 gets its line. The runtime build and the Player's dist
  tree change: Q14 reopens and closes by the evidence of the pinned run, and
  parity is measured again.
- **PR-73.** The host guide (sections 3 and 5) and the README on WOFF and
  WOFF2 in measured nodes, `font-invalid`, the limit, and the costs; every
  package at the version of question 5; the host flow on the released
  tarballs.

## Questions for the owner, with recommendations

1. **Own decoders or a dependency.** Recommendation: Kadrion's own inflate and
   Brotli decoder in TypeScript, written from RFC 1950, 1951, and 7932 and
   held to Node's zlib by differential tests, synchronous, in
   `@kadrion/runtime` under the guardrail; no `DecompressionStream`, no
   `async` `fontMetrics`, no dependency. If the owner prefers less writing, a
   conversion of Google's MIT decoder with its licence record is the fallback.
2. **The dictionary and the size of the runtime build.** Recommendation: the
   dictionary derived from Node's Brotli by a script, stored deflated in a
   generated module with the MIT notice in its header (D84.8), accepting a
   runtime build about 60 to 100 KB larger (D84.10).
3. **Error codes.** Recommendation: a new `font-invalid` for a damaged WOFF or
   WOFF2 container or stream, beside `font-unmeasurable` for files Kadrion
   does not measure (collections, unknown formats, missing tables, the
   limit); a truncated sfnt table keeps `font-unmeasurable`.
4. **Limits and collections.** Recommendation: 64 MiB of decompressed bytes
   per font, checked on the declared lengths before any allocation; WOFF2
   collections refused as sfnt collections are.
5. **The release.** Recommendation: `v0.8.0` after PR-73, as every release so
   far raised the minor version and a host's exhaustive switch over
   `RenderErrorCode` must learn `font-invalid`; `v0.7.1` if the owner prefers
   to mark that the schema does not change. Either way the owner pushes the
   tag.
