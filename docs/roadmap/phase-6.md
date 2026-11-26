# Phase six: speed, freeze frames, and reverse playback of clips

- Status: Accepted as a direction by the project owner on 2026-11-11 (PR-58),
  together with its design ADR
  [D82](../adr/D82-clip-speed-freeze-frames-and-reverse-playback.md), with
  every recommendation of the questions of D82 and of the questions at the end;
  speeds are written as multipliers (D82.11). Accepting this roadmap approves
  no pull request: each one below is approved on its own, before it starts and
  again before its commit and push, as in phase five.
- Starting point: `main` at `685fbfc`. Phase five is complete (PR-45 to
  PR-57, D65 to D81), schema `0.23`, released as `v0.6.0`.
- Authority: `AGENTS.md` and the ADRs in [`docs/adr`](../adr/README.md). This
  document plans; it decides nothing that needs an ADR. The decisions it relies
  on are those of D82, accepted by the owner on 2026-11-11.
- Predecessor: [phase five](phase-5.md).

## Goal

Give a host's video editor three edits of a clip on its timeline, each the same
in the Player's preview and in the Producer's export, each edited through the
command bus and offered as an AI tool:

1. **Speed**: a clip played from 0.25× to 4×, with its sound, the pitch kept.
2. **A freeze frame**: one source frame held for a chosen duration.
3. **Reverse**: a clip played backwards, picture and sound.

Kadrion stays an engine (D01) and owns the schema (D02). Where this document
says "the host", it means any application that embeds Kadrion; nothing here
names one, depends on one, or knows its tracks or its domain objects. Ripple
edits of the rest of a timeline, speed ramps, and the controls of a timeline
stay the host's or a later phase's (D82.10).

## What the current repository fixes (read on 2026-11-11)

Each fact is a constraint on a pull request below; D82's context states them
with their files.

- **Source time is `sourceStartUs + (u − startUs)`** for a video node and an
  audio clip (D49.5, `packages/schema/src/source-frame.ts`), and the frame is
  the last one at or before it (`sourceFrameIndex`). Instances use the same
  rule for definition time (D65.4, D76) and hold no video.
- **The audio plan** (`packages/schema/src/audio-plan.ts`) says "speed is 1"
  for every entry; the Producer mixes it with FFmpeg by sample counts
  (`audioPassGraph`, D52.5) and the Player with Web Audio (D53.2), within 1e-4
  of each other (D53.5).
- **The Player decodes each frame from its IDR picture** (D79.5) and keeps four
  PNG files per video; **the Producer decodes forward from frame 0** and starts
  again from frame 0 to go back (`packages/producer/src/video.ts`).
- **Timeline commands** (D55) and the cut helper (D66.5) keep frames exactly
  because the map has slope 1.

## Rules for every pull request of this phase

The rules of [phase five](phase-5.md#rules-for-every-pull-request-of-this-phase)
hold unchanged: the owner approves each pull request before it starts and
again before its commit and push; no test is skipped, no failed run repeated,
and no timeout raised without the owner's prior consent; a change of the
schema, the runtime, or the DOM renderer reopens Q14 by the procedure of
[the first CI run](../ci/first-run.md); a change of the Player's dist tree
needs a parity record measured again; every new command carries its tool; one
schema version per schema change; nothing for the host's domain.

Added for this phase:

- **Speed 1 forwards stays byte for byte.** A render of a document without a
  mapped clip writes the same frames, sound, and manifests as on `main`; every
  pull request that touches the Producer's decode or its audio pass shows it
  in the pinned container, as D80 did. (Amended by: PR-85 (D88), in force
  from PR-86 and PR-87, D88.5: after D88 an export writes the same picture,
  sound, and MP4 bytes, and its manifest differs in `version`, `capture`, the
  hashes of `frames`, and, for a range job that starts late in a source,
  `video.seekArgs`; `renderFrames` and a still keep the rule in full.)
- **One function per rule, shared by both hosts.** The time map lives in
  `@kadrion/schema`, the stretch of sound in `@kadrion/runtime`; neither host
  computes either on its own (D82.1, D82.6).

## The pull requests, in order

The order puts the two pieces that can be measured without a schema change
first, so that the schema step only wires what is already proven.

| Order | PR    | Subject                                                   | Schema | Runtime build | Player dist | Q14 | Size |
| ----: | ----- | --------------------------------------------------------- | ------ | ------------- | ----------- | --- | ---- |
|     1 | PR-58 | D82 and this roadmap (documents only)                     | —      | —             | —           | —   | S    |
|     2 | PR-59 | The time map and the stretch of sound (library only)      | —      | no (checked)  | —           | —   | M    |
|     3 | PR-60 | Decoding backwards in the Player and the Producer         | —      | —             | yes         | yes | M    |
|     4 | PR-61 | Schema `0.24`: speed, freeze, and reverse in both hosts   | `0.24` | yes           | yes         | yes | L    |
|     5 | PR-62 | Commands and tools: speed, reverse, and a freeze frame    | —      | —             | —           | —   | M    |
|     6 | PR-64 | D83 (documents only)                                      | —      | —             | —           | —   | S    |
|     7 | PR-65 | Font metrics and measured lines (library only)            | —      | no (checked)  | —           | —   | M    |
|     8 | PR-66 | Schema `0.25`: the frame, alignment, the width mode, W5   | `0.25` | yes           | yes         | yes | L    |
|     9 | PR-67 | `SetNodeSize` on a text, descriptions, the budget of W6   | —      | —             | —           | —   | S    |
|    10 | PR-63 | Showcases, the host guide, and the release                | —      | —             | —           | —   | S    |
|    11 | PR-68 | The host guide and a showcase of D83 (with PR-63)         | —      | —             | —           | —   | S    |
|    12 | PR-69 | D84 (documents only)                                      | —      | —             | —           | —   | S    |
|    13 | PR-70 | Inflate and the WOFF container (library only)             | —      | no (checked)  | —           | —   | M    |
|    14 | PR-71 | Brotli, the dictionary, and the WOFF2 container           | —      | no (checked)  | —           | —   | L    |
|    15 | PR-72 | `fontMetrics` reads WOFF and WOFF2 in both hosts          | —      | yes           | yes         | yes | M    |
|    16 | PR-73 | The host guide, the README, and the release               | —      | —             | —           | —   | S    |
|    17 | PR-74 | D85 (documents only)                                      | —      | —             | —           | —   | S    |
|    18 | PR-75 | The volume curve on the grid and the envelope (library)   | —      | no (checked)  | —           | —   | M    |
|    19 | PR-76 | Schema `0.26`: a video's fades and volume curves, mixed   | `0.26` | yes           | yes         | yes | L    |
|    20 | PR-77 | Commands and tools: fades of a video, a clip's animations | —      | —             | —           | —   | S    |
|    21 | PR-78 | The host guide, ducking as keyframes, and the release     | —      | —             | —           | —   | S    |
|    22 | PR-80 | D86 and D87 (documents only)                              | —      | —             | —           | —   | S    |
|    23 | PR-79 | The reader of the decoder's output, one frame at a time   | —      | —             | —           | —   | S    |
|    24 | PR-81 | D86: the mark of a frame, the test under load, `v0.9.1`   | —      | —             | —           | —\* | M    |
|    25 | PR-82 | D87: the forward stream and the pool of workers           | —      | —             | yes         | —   | M    |
|    26 | PR-83 | D87: protocol version 3 and the canvas of a video node    | —      | yes           | yes         | yes | M    |
|    27 | PR-84 | D87: the host guide and the release                       | —      | —             | —           | —   | S    |
|    28 | PR-85 | D88 and its roadmap rows (documents only)                 | —      | —             | —           | —   | S    |
|    29 | PR-86 | D88: the fast capture of an export, manifest version 6    | —      | —             | —           | —   | M    |
|    30 | PR-87 | D88: a first start that seeks in an export, host guide    | —      | —             | —           | —†  | M    |
|    31 | PR-88 | D89 and its roadmap rows (documents only)                 | —      | —             | —           | —   | S    |
|    32 | PR-89 | D89: schema `0.27`, the flip of a node and its command    | `0.27` | yes           | yes         | yes | M    |
|    33 | PR-90 | D89: schema `0.28`, the clear and transparent stills      | `0.28` | yes           | yes         | yes | M    |
|    34 | PR-91 | D89: schema `0.29`, a still canvas up to 8192             | `0.29` | yes           | yes         | yes | M    |
|    35 | PR-92 | D89: the host guide and the release                       | —      | —             | —           | —   | S    |
|    36 | PR-93 | D90: every changed tile rastered whole, `v0.12.1`         | —      | —             | —           | yes | S    |
|    37 | PR-94 | D91 and its roadmap rows (documents only)                 | —      | —             | —           | —   | S    |
|    38 | PR-95 | D91: schema `0.30`, four corners of a node and a command  | `0.30` | yes           | yes         | yes | M    |
|    39 | PR-96 | D91: schema `0.31`, a number in a text and a command      | `0.31` | yes           | yes         | yes | L    |
|    40 | PR-97 | D91: the host guide, a showcase, and `v0.13.0`            | —      | —             | —           | —   | S    |

Sizes are rough, tests included: S under 500 changed lines, M 800 to 1 500, L
2 000 to 3 000 (most of it the step, the corpus, and fixtures).

\* PR-81 changes no schema, runtime, or renderer, so Q14 does not reopen by its
rule; it adds a pinned test file and changes one pinned assertion, and its
pinned run is the evidence (D86).

† PR-87 reopens Q14 only if it changes fixtures (D88).

PR-64 to PR-68 are the pull requests of
[D83](../adr/D83-a-text-frame-and-lines-measured-from-the-font.md) (a text
frame, alignment, and lines measured from the font), which the owner accepted
on 2026-11-11 and ordered after PR-62 and before PR-63, so that the release
`v0.7.0` carries schema `0.24` and `0.25` and the host pins once (question 13
of D83). Their plan is the implementation plan of D83; their statuses are
below, after PR-62, and in D83.

### PR-58 — D82 and this roadmap (documents only)

- Status: the owner answered the questions on 2026-11-11 and accepted D82 and
  this roadmap; the `Amended by: PR-58 (D82)` lines of D49, D50, D51, D52,
  D53, D55, and D79 are written, each naming the pull request from which it is
  in force, and `AGENTS.md` names phase six as current (question 1). Open
  until it is merged.

- **Goal:** one model for speed, freeze, and reverse before any code.
- **Scope:** D82 (Proposed), this document, and the row of D82 in the index of
  ADRs.
- **Acceptance:** the owner answers the questions of D82 and of this document;
  `node --run format:check` and `tests/repo/adr.test.ts` pass.
- **Impact:** none on Q14, the runtime build, parity, or golden frames.
- **Not included:** any code.

### PR-59 — The time map and the stretch of sound (library only)

- Status: in review. The functions, the constants of `stretchSound`, and the
  quality check are recorded in the implementation notes of D82. Deviations
  from this plan, confirmed by the owner on 2026-11-11: the shifts of `stretchSound` are
  chained within blocks of 32 grains and restart at each block's quietest
  grain, since a shift that follows only the nominal grain before it keeps no
  phase on a pitched sound (D82, question 11); the map's floor rule is
  exported as `sourceTimeOfScene` and the sampled range as `clipSourceRange`
  beside the unchanged `sourceTimeUs` and `sampledSourceRange`, and both
  pieces are entries of their own (`@kadrion/schema/time-map`,
  `@kadrion/runtime/stretch`) so that the runtime build and the Player's dist
  tree keep their bytes; at the host's
  request, `stretchSourceRange` of the runtime gives the source range a sound
  reads, and the host guide lists the helpers. Open: the owner listens to the
  recordings; the pinned comparison of Node and Chromium runs in the pinned
  container (a pinned test file added while Q14 is open).

- **Goal:** the two shared functions, proven on their own, before any document
  can use them.
- **Scope (D82.1, D82.2, D82.6):**
  - `@kadrion/schema`: the exact map (`clipTimeMap`), advancing it by `d`, the
    floor rule, the sampled range forwards and reversed, and
    `sceneTimesOfSource`, as functions over explicit arguments; `sourceTimeUs`
    and `sampledSourceRange` are not changed yet; `parseSpeed` and
    `formatSpeed`, the multiplier notation (D82.11);
  - `@kadrion/runtime`: `stretchSound`, anchored WSOLA in `+ − · /` only, with
    its constants (grain length, window, search radius) fixed by a quality
    check: speech and music fixtures at 1/4, 1/2, 3/4, 3/2, 2, and 4, compared
    with a sequential WSOLA of the same constants, recordings handed to the
    owner (question 11 of D82); speed 1 reversed is the samples reversed.
- **Packages and documents:** schema, runtime, tests; D82 records the constants.
- **Acceptance:** the map equals an independent rational reference for 2 000
  seeded clips; advancing by `d` equals the map at `e + d`; `stretchSound`
  gives the same SHA-256 in Node and in the pinned Chromium for every fixture
  and speed; the halves of a split equal the whole sample for sample; a sine's
  pitch is kept within 1 %; the owner has heard the recordings.
- **Impact:** the runtime build is expected to stay byte for byte (the page
  imports neither function); if it changes, Q14 reopens by its procedure.
- **Not included:** any field, command, or host change.

### PR-60 — Decoding backwards in the Player and the Producer

- **Goal:** both hosts can show the frames of a source in any order at a
  bounded cost, with the pixels they show today.
- **Scope (D82.4, D82.5):**
  - Player: the cache of decode runs (planes of every sampled frame of a run,
    256 MiB per Player, least recently used first);
  - Producer: going back seeks to the IDR picture before the frame (the rule of
    D79.5; `holdsIdr` moves to `@kadrion/renderer-dom`), a window of 64 frames,
    and `seekArgs` in the render manifest only when a job seeks;
  - both exercised by requests in descending order (still frames of D47.7 in
    any order already ask for them).
- **Packages and documents:** player, producer, renderer-dom, tests; D50.5,
  D51.4, and D79.5, amended on acceptance of D82 (2026-11-11), are in force
  from this pull request.
- **Acceptance:** in the pinned container, every frame decoded after a seek
  equals the forward decode's frame byte for byte, for the fixture video in
  MP4, fragmented MP4, MOV, and MKV, and for the turned fixtures of D81.4; the
  frames of the video composition requested backwards equal its golden frames;
  every render without a backward request writes the same bytes as `main`;
  parity (D34) at zero after the Player's dist tree changes; the cache and the
  window stay within their bounds in unit tests.
- **Impact:** the Player's dist tree changes, so parity is measured again; Q14
  reopens if a pinned test file changes. No schema or runtime change.
- **Not included:** seeking at the first frame of a forward job (D82.10).

### PR-61 — Schema `0.24`: speed, freeze, and reverse in both hosts

- Status: in review. The step, the hosts, and the commands through the map are
  recorded in the implementation notes of D82. Open: the golden frames of the
  speed composition and the parity records are written in the pinned
  container, and Q14 closes by the evidence of that run.

- **Goal:** a document states a speed, a freeze frame, or a reverse on a video
  node or an audio clip, and both hosts render it, picture and sound.
- **Scope (D82.1 to D82.3, D82.6 to D82.8):**
  - schema `0.24`: `sourceStartRemainder`, `speed`, and `reverse` on video
    nodes and audio clips, the semantic rules (`speed-invalid`), the step from
    `0.23`, the frozen `0.23` schema, the pair before and after, and the
    corpus; `sourceTimeUs` and `sampledSourceRange` read the map; the plan's
    mapped entries;
  - Producer and Player: the frame from the map; mapped sounds through
    `stretchSound` (a 32-bit float WAV input in the Producer, a buffer in the
    Player); the frozen video silent; the additive `stretch` of the audio
    manifest;
  - editor-sdk: the existing commands through the map, so that no command
    breaks a mapped clip (`TrimClipStart`, `TrimClipEnd`, `SplitClip`,
    `JoinClips`, `SetVideoSource`, `SetClipSource`, the cut helper, and the
    checks of source ranges); `describe_document` states speed as a multiplier
    (D82.11) and reverse;
  - fixtures: a composition with clips at 1/4×, 1/2×, 3/2×, 4×, reversed, and
    frozen, video and sound, with its golden frames and its pinned test.
- **Packages and documents:** schema, runtime, player, producer, editor-sdk,
  ai-sdk (the description of the document), test-fixtures; D49, D52, D53, and
  D55, amended on acceptance of D82 (2026-11-11), are in force from this pull
  request; D35 gets its line for the step from `0.23` to `0.24`.
- **Acceptance:** every earlier golden PNG file byte for byte and the golden
  manifests changed in the three fields of D42 only; golden frames of the new
  composition; parity at zero for it; the Player's audio graph within 1e-4 of
  the Producer's intermediate for it (D53.5); a trim or a split of a mapped
  clip shows the same frames at every scene time it still covers, and a split
  followed by its join is byte for byte, for 2 000 seeded clips.
- **Impact:** a schema step: the runtime build changes, goldens and parity are
  measured again, Q14 reopens and closes by the evidence of its commit.
- **Not included:** the new commands (PR-62), speed on instances.

### PR-62 — Commands and tools: speed, reverse, and a freeze frame

- Status: in review. The commands, the helper, and the tools are recorded in
  the implementation notes of D82; the catalogue grows from 100 to 103
  entries, and D46 has its line. No runtime build, Player dist tree, or pinned
  file changes.

- **Goal:** a host and a model change a clip's speed, reverse it, and freeze a
  frame, each in one undoable step. The owner's rule (2026-11-11): the
  assistant must be able to do everything the user can, so all three are AI
  tools in this pull request, not later.
- **Scope (D82.9, D82.11):** `SetClipSpeed` and `SetClipReverse` with their
  tools `set_clip_speed` and `set_clip_reverse`; the helper `freezeFrame` in
  modes `overwrite` and `insert` and its tool `freeze_frame`; the `speed` of
  `SetClipSpeed` taken as a multiplier (`"x0.5"`, `2`, `"x1/3"`), a number, or
  `{ num, den }`, converted by `parseSpeed` in the command, so the tool stays
  derived (D46.2); descriptions with the common speeds as multipliers; a
  fixture of model requests ("slow this clip to half speed", "play it at x2",
  "freeze the frame at 3 s for 2 s", "play the last clip backwards"), each
  checked by `executeTool` against its expected document.
- **Packages and documents:** editor-sdk, ai-sdk, the catalogue snapshot, the
  API reports (additive); D46 gets its line for the three tools.
- **Acceptance:** the catalogue holds `set_clip_speed`, `set_clip_reverse`,
  and `freeze_frame`, and the fixture reaches speed, freeze frame (both
  modes), and reverse through `executeTool` alone; each command and the helper
  undone leaves the document byte for byte; every form of D82.11 gives its
  stored speed, and `"x0.3333"` is refused with `speed-invalid` naming `x1/3`;
  every refusal of D82.9 with its code; the fixture of requests gives its
  expected documents.
- **Impact:** none on Q14, the runtime build, parity, or golden frames.
- **Not included:** ripple edits and retiming of captions (the host's, D82.7).

### PR-64 to PR-67 — D83: the frame of a text (in `main`)

- **PR-64** (D83, documents only): done; the owner accepted D83 on 2026-11-11.
- **PR-65** (font metrics and measured lines, library only): done; the runtime
  build and the Player's dist tree kept their bytes.
- **PR-66** (schema `0.25`): done; the runtime build is
  `sha256:cc74d99ce99b8010eacd6a39b28f89e8ff0e81615e43dcd5319ddb58c0d73aef`
  and the Player's dist tree
  `sha256:36dccdc3c7bea7c33a34b9b7202d6bc168b82e393b1b88d15531ff2a89b58c44`
  (71 files) as `main` builds them at `7b96921`, after the merge of PR-61 and
  PR-62.
- **PR-67** (`SetNodeSize` on a text, the budget of W6): done; no runtime
  build or Player dist tree change.

Each is recorded in the implementation notes of D83.

PR-69 to PR-73 are the pull requests of
[D84](../adr/D84-fonts-in-woff-and-woff2-measured-by-kadrion.md) (fonts in
WOFF and WOFF2 measured by Kadrion), proposed on 2026-11-13 after the owner
agreed that day that Kadrion measures WOFF and WOFF2 fonts as well, so that a
host need not convert its users' fonts before it uses them in a framed text or
in captions broken by width. They follow PR-63 and PR-68 and the release
`v0.7.0`; their plan is the implementation plan of D84.

### PR-63 — Showcases, the host guide, and the release

- Status: done, together with PR-68 of D83 (in `main` at `fe491e1`, the
  commit of the tag `v0.7.0`), with the amendment D32.12 of
  D32 (no new ADR). Two showcases, `speed` (speed, freeze frames, and reverse,
  picture and sound) and `framed-text` (D83), checked by the test of PR-42; the
  host guide and the README on mapped clips, speeds as multipliers, the costs
  of reverse, retiming words with `sceneTimesOfSource`, and text frames; every
  package is version `0.7.0` for the release `v0.7.0`, whose tag the owner
  pushes. The runtime build and the Player's dist tree keep the bytes of
  PR-66, and no pinned file changes. Deviation from this plan: the page
  resolves the proportional font of the fixtures, so that the showcases
  measure lines of differing advances (D32.12).

- **Goal:** the host sees and pins the three features.
- **Scope:** showcases of speed, freeze, and reverse in the playground, checked
  by the test of PR-42; the host guide of PR-43 and the README on mapped clips,
  speeds written as multipliers with `formatSpeed` and `parseSpeed` (D82.11),
  the costs of reverse (D82.4, D82.5), and retiming words with
  `sceneTimesOfSource`; every package at version `0.7.0`.
- **Acceptance:** every showcase loads without an error; the host flow on the
  released tarballs passes (PR-43).
- **Impact:** none on Q14 unless a pinned file changes.
- **Not included:** an evaluation of a real model.

### PR-69 to PR-73 — D84: fonts in WOFF and WOFF2

- **PR-69** (D84, documents only): done. The owner accepted D84 on 2026-11-13 (11:56 Europe/Warsaw) with the recommendations of all five questions. D84, its row in the
  index of ADRs, and these entries. Acceptance: the owner answers the
  questions of D84; `node --run format:check` and `tests/repo/adr.test.ts`
  pass. No code; no impact on Q14, the runtime build, parity, or golden
  frames.
- **PR-70** (inflate and the WOFF container, library only): `inflate` of RFC
  1950 and 1951 and the reader of the WOFF container yielding the five tables
  of D83.1, in the entry `@kadrion/runtime/woff`, which the runtime build does
  not reach; the test encoder over `node:zlib`; differential tests against
  `zlib.inflateSync`. The runtime build and the Player's dist tree keep their
  bytes (checked by their hashes, as PR-59 and PR-65 did). Status: done.
  `inflate`, `woffTables` (the five tables as `FontTables`), and
  `FontDecodeError` with the codes `font-invalid` and `font-unmeasurable` in
  `@kadrion/runtime/woff`; the runtime build stays
  `sha256:cc74d99c…0c73aef` (367 421 bytes) and the Player's dist tree
  `sha256:36dccdc3…a89b58c44`; the API report gains only the new entry.
  Deviation from D84, for PR-72 to settle: the entry throws its own
  `FontDecodeError`, since `FontMetricsErrorCode` widens to `font-invalid`
  only in PR-72; PR-72 joins the two.
- **PR-71** (Brotli, the dictionary, and the WOFF2 container, library only):
  `brotliDecode` of RFC 7932, the dictionary derived from Node's Brotli by a
  script and stored deflated with its licence record (D84.8), and the reader
  of the WOFF2 container with the transformed `hmtx`, in the same entry; the
  test encoder with the `glyf` transform; differential tests against
  `zlib.brotliDecompressSync`. The runtime build keeps its bytes (checked).
  Status: done. `brotliDecode` and `woff2Tables` in
  `@kadrion/runtime/woff`, over the table reader and `FontDecodeError` of
  PR-70; the dictionary (122 784 bytes, `sha256:20e42eb1…53f35c70`) is
  generated by `packages/runtime/scripts/brotli-dictionary.ts` from Node's
  Brotli and kept as the base64 of its deflate stream (58 776 bytes) with the
  MIT notice of the Brotli Authors, and inflated per call (D20). The WOFF2
  reader decodes the stream only to the end of the last of the five tables,
  never rebuilds `glyf` or `loca`, and rebuilds a transformed `hmtx` in the
  sfnt layout with its omitted bearings as 0. The runtime build stays
  `sha256:cc74d99c…0c73aef` (367 421 bytes) and the Player's dist tree
  `sha256:36dccdc3…a89b58c44`. Deviations and open points, for PR-72: the
  WOFF2 specification says a decoder must not reject a non-zero `reserved`
  field, which D84 refuses (D84 kept); the sum of the table lengths is not
  checked against the stream, since the stream is read only as a prefix; and
  the runtime bundle drops legal comments, so PR-72 must carry the MIT notice
  of the dictionary into the build.
- **PR-72** (`fontMetrics` reads WOFF and WOFF2 in both hosts): one reader of
  tables for sfnt, WOFF, and WOFF2; the code `font-invalid`; `measureFonts`
  passing the code on; the pinned comparison of Node and Chromium and the
  framed-text composition with its font as WOFF and WOFF2 against its golden
  frames. The runtime build and the Player's dist tree change, so Q14 reopens
  and parity is measured again; every golden PNG file stays byte for byte.
  Status: done (in `main` at `0c92279`). `fontMetrics` keeps its signature
  and reads the sfnt,
  WOFF, and WOFF2 containers into the five tables of D83.1, from which one
  reader reads the metrics, so every refusal of D83.1 reads the same in each
  format. `FontDecodeError` of PR-70 is merged into `FontMetricsError`, whose
  code is `'font-unmeasurable' | 'font-invalid'`; the decoders and the readers
  throw it, and `@kadrion/runtime`, `@kadrion/runtime/text-frame`, and
  `@kadrion/runtime/woff` export the same class. `RenderErrorCode` gains
  `font-invalid`, which `measureFonts` raises from the code of the refusal,
  read by value. The API reports change by the two widened unions and by the
  rename in the entry `woff`. The MIT notice of the Brotli dictionary reaches
  the build as an esbuild banner, the first bytes of the artifact, since the
  bundle keeps no legal comment (`legalComments: 'none'`); a banner keeps that
  option, so no comment of a source or of a later dependency enters the build
  unseen, and `runtime-build.test.ts` holds the banner's notice to the header
  of the generated dictionary module, word for word. The runtime build is
  `sha256:573cbca11d74841d1c3d07b759a8ad2711ece6cdde76f175ca729b9d4dca120f`
  (500 073 bytes, 132 652 more than 367 421, above the estimate of D84.10: the
  base64 of the dictionary's deflate stream is about 78 KB of it), and the
  Player's dist tree
  `sha256:db846bfec498728a4d64c75b2e3529825e8cedf5bf7f6ce9beac6918d17daac3`
  (77 files: `brotli.js`, `brotli-dictionary.js`, `font-decode.js`,
  `inflate.js`, `woff.js`, and `woff2.js` of the runtime join it). In the
  pinned container with `--network none`, two isolated `goldens:update`
  passes wrote all 124 golden files byte for byte the same: every PNG file as
  committed, and the twenty manifests changed in `render.runtime.contentHash`
  only; the `test:pinned` pass that followed passed 333 of 333 tests in 32
  files and wrote both parity records, every row 0/0 with the same PNG
  hashes. In that pass the twelve WOFF and WOFF2 forms of the four fixture
  fonts give the SHA-256 of the sfnt metrics in Node and in the pinned
  Chromium and load as faces through Chromium's decoder
  (`text-frame.pinned.test.ts`), and the framed-text composition with its
  font as WOFF and as WOFF2 renders its golden frames in the Producer with 0
  differing pixels (`framed-text.pinned.test.ts`). No pinned test file is
  added, so `REQUIRED_PINNED_FILES` does not change; the Q14 artifact list
  gains the two reports of that test (`framed-text/golden-comparison-woff.json`
  and `…-woff2.json`) and the three of the framed-text file that PR-66 left
  out of it.
  Q14 reopens with this change and closes by the evidence of the CI run of
  its commit. The test encoders of PR-70 and PR-71 stay in
  `packages/runtime/test` and the pinned tests import them; Chromium's
  decoder found that the WOFF2 encoder did not pad the end of a file to four
  bytes, which the encoder now does (D84 checks nothing there). The
  deviations of PR-70 and PR-71 are settled: the two errors are one, the
  amendment of D84.4 holds `reserved`, and the notice is in the build.
- **PR-73** (the host guide, the README, and the release): sections 3 and 5 of
  the host guide and the README on WOFF and WOFF2 in measured nodes,
  `font-invalid`, the limit, and the costs; every package at the version of
  question 5 of D84; the host flow on the released tarballs.
  Status: done (in `main` at `727f91b`, the commit of the tag `v0.8.0`).
  Section 5 of the host guide and the README say that a
  measured node takes an sfnt, WOFF, or WOFF2 font, stored as it is; that a
  collection and a font whose five tables would decompress past 64 MiB are
  `font-unmeasurable`, and a damaged WOFF or WOFF2 container or stream
  `font-invalid` of `FontMetricsError` and `RenderErrorCode`; and the costs:
  a WOFF or WOFF2 font is decoded synchronously on every call of
  `fontMetrics`, a WOFF2 font up to the last of its five tables, and the
  runtime build is 500 073 bytes (132 652 more, about 78 KB of it the base64
  of the dictionary) with a Player dist tree of 77 files. Section 3 says that
  the Player and the Producer still report both font codes as `page-error`
  with the page's message, since their lists of page codes hold neither
  (`playerCode`, `producerCode`) and D84.6 leaves that to the open question
  of PR-68. Every package is version `0.8.0` (question 5 of D84) for the
  release `v0.8.0`, whose tag the owner pushes from `main`; the lockfile
  names no workspace version, so it does not change. The runtime build and
  the Player's dist tree keep the bytes of PR-72, and no pinned file changes.

### PR-74 to PR-78 — D85: fades of a video's sound and volume keyframes

PR-74 to PR-78 are the pull requests of
[D85](../adr/D85-fades-of-a-video-and-volume-keyframes.md) (fades of a
video's sound and volume keyframes in decibels, schema `0.26`), proposed on
2026-11-14 at the request of a host's video editor (its requirements R1 to
R4), so that a video clip's sound fades in and out, a clip's volume follows a
curve, and the host lowers music under speech by writing volume keyframes it
computes itself (D85.9). They follow PR-73 and the release `v0.8.0`; their
plan is the implementation plan of D85, and its questions are the owner's to
answer before PR-75 starts.

- **PR-74** (D85, documents only): D85, its row in the index of ADRs, and
  these entries. Acceptance: the owner answers the questions of D85;
  `node --run format:check` and `tests/repo/adr.test.ts` pass. No code; no
  impact on Q14, the runtime build, parity, or golden frames. Status: done
  (in `main` at `179a453`).
- **PR-75** (the volume curve on the grid and the envelope, library only): the
  placement of volume keyframes on the 48 kHz grid and `volumeEnvelope`, with
  an exponent and a logarithm of Kadrion's own (`+ − · /` only), in the entry
  `@kadrion/runtime/volume`, which the runtime build does not reach; a pinned
  check of `amultiply` with an envelope on a pipe and of Chromium's
  exponential ramp against the envelope. The runtime build and the Player's
  dist tree keep their bytes (checked by their hashes, as PR-59, PR-65, and
  PR-70 did). Status: done (in `main` at `d7eaf3b`). `placeVolumeKeys` and `volumeEnvelope` in
  `@kadrion/runtime/volume`, over the exponent and logarithm of
  `volume-arithmetic.ts`, which the entry does not export; the runtime build
  stays
  `sha256:573cbca11d74841d1c3d07b759a8ad2711ece6cdde76f175ca729b9d4dca120f`
  (500 073 bytes) and the Player's dist tree
  `sha256:db846bfec498728a4d64c75b2e3529825e8cedf5bf7f6ce9beac6918d17daac3`
  (77 files), the same before and after; the API report gains only the new
  entry. `tests/pinned/volume.pinned.test.ts` is a pinned test file added
  while Q14 is open, so `REQUIRED_PINNED_FILES` and the Q14 artifact list
  (`volume/node-vs-chromium.json`, `volume/amultiply.json`) grow in this
  diff. The envelope pipe of question 8 of D85 held: no temporary file is
  needed. The implementation notes of D85 record the readings and the
  measurements.
- **PR-76** (schema `0.26`): the step from `0.25` (`fadeInUs: 0` and
  `fadeOutUs: 0` on every video node, `animations: []` on every audio clip),
  the frozen `0.25`, the row `volume`, the plan with `volumeKeys`, the
  Producer's `amultiply` step and additive manifest fields
  (`EXPORT_MANIFEST_VERSION` stays 5), the Player's gain node, and the
  existing timeline commands carrying the new fields; the mix test and the
  parity of D53.5 extended. The runtime build and the Player's dist tree
  change, so Q14 reopens and parity is measured again; no golden PNG file
  changes, and the golden manifests change in the three fields of D42 alone.
  Status: done (in `main` at `95f213f`). Schema `0.26` with the step, the frozen `0.25`, the
  pair and the corpus `compatibility/v0-26` (with `volume`, written by hand),
  and eleven invalid cases; the plan carries `volumeKeys` and a video's
  fades, `audioLayout` places the keyframes (`placeVolumeKeys` moved beside
  it and takes keyframes before composition time 0, which a definition
  placed by an instance can have), the Producer multiplies a curved sound by
  its envelope on `pipe:3` and up with additive `volumeKeys` and
  `envelopeSha256` (`EXPORT_MANIFEST_VERSION` stays 5, `MANIFEST_VERSION`
  3), and the Player adds one gain node after the fades. `MoveClip`,
  `SplitClip`, `JoinClips`, `freezeFrame`, and the IDs of the audio clip
  commands carry the new fields as D85.8 says; the two complete-clip examples
  gain `"animations":[]` (36 characters), and the budget test of D85.8 starts
  here, since W6 closed at the snapshot of `0.25`. The runtime build is
  `sha256:e98d722b156580f090d238e1913253dfc7d803b561c22bcbb14218de92bc0676`
  (502 709 bytes) and the Player's dist tree
  `sha256:5f23e9eb57430fb5073c0d4fd0a31fa4e54899fee7b4db74991aa739377233d0`
  (79 files); the twenty golden manifests change in `render.schemaVersion`,
  `render.compositionHash`, and `render.runtime.contentHash` only. The mix
  test of D52.7 and the parity of D53.5 gain a document with a faded video
  and two curved clips, one at half speed; with the pinned FFmpeg outside
  the container they measure 3.9e-8 against 1e-5 and 9.95e-6 against 1e-4.
  The Q14 artifact list gains `audio-curves-report.json`,
  `audio-curves-player-report.json`, and `audio-curves/audio.wav`. With the
  pinned FFmpeg and the workspace's Chromium outside the container, every
  pinned file passes (339 tests in 33 files; parity and the golden frames are
  gated to the container there), and the playground's import map names
  `@kadrion/runtime/volume`. The pinned run in the container (`edcce0d`)
  wrote every golden file byte for byte and both parity records for this
  build (every row 0/0), and Q14 closes by the evidence of the CI run of the
  commit. The implementation notes of D85 record the
  readings.
- **PR-77** (commands and tools): `SetClipFades` on a video node, the
  animation commands on an audio clip, `volume` in `SetKeyframeValue`, six
  descriptions, no new tool, and a test that holds the catalogue's growth over
  the snapshot of `0.25` to at most 700 characters (D85.8); a fixture of
  model requests. No runtime build or Player dist change. Status: done (in
  `main` at `544dd9a`).
  `SetClipFades` finds a node first and edits a video's fades
  (`unsupported-node` for any other node); `AddAnimation` takes an audio
  clip's ID, the animation commands find a clip's animation by its ID, and
  `SetKeyframeValue` sets `volume`. Seven entries of the catalogue change
  for the six rows of D85.8, and `trim_clip_start`, `trim_clip_end`, and
  `set_clip_speed` name a clip's fades rather than an audio clip's (the
  owner, 2026-11-16); no tool is added, and the catalogue grows by 482
  characters here and 518 over the snapshot of `0.25`, within the 700 of the
  budget test of PR-76. `packages/ai-sdk/test/sound-requests.test.ts` is the
  fixture of model requests. The runtime build stays
  `sha256:e98d722b156580f090d238e1913253dfc7d803b561c22bcbb14218de92bc0676`
  and the Player's dist tree
  `sha256:5f23e9eb57430fb5073c0d4fd0a31fa4e54899fee7b4db74991aa739377233d0`
  (79 files), the same before and after; no pinned file changes. D41 and D46
  get their lines, and the implementation notes of D85 record the readings.
- **PR-78** (the host guide, ducking as keyframes, and the release): the sound
  section of the host guide and the README on a video's fades, volume curves,
  and ducking computed by the host as keyframes with the exact product of two
  curves (D85.9); every package at version `0.9.0` for the release `v0.9.0`,
  whose tag the owner pushes from `main`; the host flow on the released
  tarballs. Status: in review; with it every pull request of D85 is done once
  it is merged. Section 5 of the host guide has the sound of a film: a
  video's fades (fields, `SetClipFades` on a video node, the timeline
  rules), volume curves (a factor from 0 to 1 times the volume and the fades,
  linear in decibels between values above 0 and in amplitude where one is 0,
  `hold`, the holder's time, the commands and tools), ducking computed by the
  host as the product of two curves at the union of their keyframe times,
  with the cases that are not exact (a segment through 0, a hold against a
  moving curve, a time off the grid) and a worked example that
  `tests/repo/ducking-example.test.ts` checks sample by sample with
  `volumeEnvelope`, and the costs; section 3 says that the Player plays them,
  and section 13 that a range hears the mix of the whole. The README says the
  same in short. Every package is version `0.9.0` (question 13 of D85) for
  the release `v0.9.0`, whose tag the owner pushes from `main`; the lockfile
  names no workspace version, so it does not change. The runtime build and
  the Player's dist tree keep the bytes of PR-76, and no pinned file changes.

### PR-79 to PR-84 — the speed of a render and of a preview with video: D86 and D87

A host's editor reported on 2026-11-21 that a film with a video clip plays
unevenly in the preview and renders slowly. The measurements behind the
answer are in D86 and D87; they found one defect besides: under load the
Producer can capture the frame before (D86). The owner accepted D86 and D87
on 2026-11-21 at 13:31 (Europe/Warsaw) with the recommendations of all their
questions: the defect is fixed first, in a patch release, then the preview.
A faster capture of exports and a first decode that seeks are proposed
separately and wait for D86. Each pull request is approved before it starts
and again before its commit and push.

- **PR-80** (D86 and D87, documents only): both ADRs, their rows in the index
  of ADRs, the `Amended by` lines of D25, D26, D28, D29, D33, D50, and D51,
  and these entries. Acceptance: `node --run format:check` and
  `tests/repo/adr.test.ts` pass. No code; no impact on Q14, the runtime build,
  parity, or golden frames.
- **PR-79** (the reader of the decoder's output): `decodeVideoWith` in
  `packages/producer/src/ffmpeg.ts` takes one frame at a time from FFmpeg's
  standard output (`frameQueue`) instead of joining its whole backlog for
  every frame, a defect and not a decision, so no ADR. Acceptance: unit tests
  of the reader (chunks, waiting reads, back-pressure, a stream that ends
  inside a frame, failures); `node --run check`; `test:pinned` in the pinned
  container; the MP4 of an export with a 1080p clip keeps its bytes (97 s to
  88 s measured outside the container). The rule "speed 1 forwards stays byte
  for byte" holds in full. Status: done; `test:pinned` in the pinned
  container passed (33 files, 339 tests) on 2026-11-21. In the same container
  the reader made the export of a 1080p clip 20 % faster (121 s to 96 s) and
  of the reference composition 36 % (79 s to 51 s), and it makes the defect
  of D86 more frequent: in the test under load of PR-81 two of four exports
  held 6 repeated frames in all with it, while on `main` one export of four
  held 1 in a first run and none did in a second.
- **PR-81** (D86, the mark of a frame): the agent's `mark()`, the frame and
  window 2 pixels taller, the read of the mark after a second barrier, the
  capture of one pixel; `tests/pinned/load.pinned.test.ts` with four renders
  at once, recorded red on `main` in the pinned container first; every
  package at `0.9.1` for the patch release `v0.9.1`, whose tag the owner
  pushes from `main`, with a note that films rendered under load before it
  may hold a repeated frame. Golden frames, manifests, and parity records
  keep their bytes. Status: done. Step 4 of D86.2 reads the mark at once
  (the owner's amendment of 2026-11-21, 14:19 Europe/Warsaw); the mark costs
  53 to 60 ms a frame in the pinned container. One golden frame changes, the
  animated captions at 1 000 000 µs, which on `main` depended on the frames
  rendered before it (D86, implementation notes); every other golden file,
  manifest, and parity record keeps its bytes.
- **PR-82** (D87, the stream and the pool): the forward stream per video
  node, the bound of 6 frames, every reason it starts again, the pool of
  workers and its fallback; library and unit tests, no protocol change. The
  Player's dist tree changes, so parity is measured again. Status: done; the
  worker's module is a bundle without imports (D87, implementation notes).
- **PR-83** (D87, protocol version 3 and the canvas): the bitmap entry, the
  `canvas` in a video node's place, the gates of D87.6. The runtime build
  changes, Q14 reopens, parity is measured again, golden frames keep their
  bytes. Status: done; a playing frame equals the sought frame at the clip's
  own size, and a clip scaled by a ratio that is not an integer differs by
  its filter (D87, implementation notes, with the measured rates).
- **PR-84** (D87, the host guide and the release): workers and the content
  security policy in the host guide, the measured frame rates, and the
  release that carries protocol version 3. Status: done; every package is
  `0.10.0` for the release `v0.10.0`, whose tag the owner pushes from
  `main`.

### PR-85 to PR-87 — a faster export with the same pixels: D88

D88 makes the capture of the frames of an export faster and lets the first
start of a decoder in an export seek, both keeping the pixels, after D86. The
owner accepted it on 2026-11-21 at 20:15 (Europe/Warsaw) with the
recommendations of all its questions; its pull requests follow those of D87.

- **PR-85** (D88, documents only): the ADR, its row in the index of ADRs,
  and these entries.
- **PR-86** (D88, the fast capture): an export captures with another
  compression of the PNG; its frames equal those of `renderFrames` in pixels;
  export manifest version 6 with the field `capture`. Status: done; the MP4 and
  every segment keep the bytes of `main`, alone and four at once, and an
  export of the reference composition takes 54.8 s instead of 63.1 s.
- **PR-87** (D88, the first start that seeks): the first start of a decoder
  in an export may seek, with the evidence of D88.4; the host guide. Status:
  done; every container reads from a late IDR picture across two more as from
  frame 0, a join that seeks writes the MP4 of one pass, and every package is
  `0.11.0` for the release `v0.11.0`, whose tag the owner pushes from
  `main`.

### PR-88 to PR-92 — stills for a graphics editor: D89

A host's graphics editor renders an image as a composition of one frame and
needs a canvas larger than 1920 pixels, transparent stills, and mirrored
nodes. D89 decides all three; the owner accepted it on 2026-11-22 at 13:30
(Europe/Warsaw) with the recommendations of all its questions, question 5
included, and its pull requests follow those of D88. Video output stays as D07 allows.

- **PR-88** (D89, documents only): the ADR, its row in the index of ADRs,
  and these entries; if the owner accepts question 5 of D89, the line of
  `AGENTS.md` that excludes "4K" and D07's quotation of it, in the same
  words, with an `Amended by` line in D07. Acceptance:
  `node --run format:check` and `tests/repo/adr.test.ts` pass. No code; no
  impact on Q14, the runtime build, parity, or golden frames. Status: done
  (#128); the owner accepted question 5, so the acceptance commit, carried
  by PR-89, changes the line of `AGENTS.md` and D07's quotation.
- **PR-89** (D89.3, the flip): schema `0.27` with `flip: { x, y }` on every
  transformable node and its step, the end of `cssTransform` and of the
  matte's `svgTransform`, `SetNodeFlip` and `set_node_flip`, and the probes of
  the flip, a flipped matte among them, in both hosts. Every document of
  `0.26` writes the transform it wrote before. Status: done (#129). Schema `0.27` with the step, the frozen `0.26`, the pair
  `migration-0-26-to-0-27`, the corpus `compatibility/v0-27` (with `flip`,
  written by hand), and six invalid cases; the flip ends the CSS transform
  and the matte's, with `0px` for a side not flipped, as the CSS Object Model
  serialises it; `SetNodeFlip` and `set_node_flip` (104 tools). The probes
  are a pinned file of their own, `tests/pinned/flip.pinned.test.ts`, so
  `REQUIRED_PINNED_FILES` and the Q14 artifact list grow by it (`flip/probes.json`,
  `flip/mirror.json`). No golden PNG file changes; the golden manifests change
  in the three fields of D42 alone, as in PR-76, since the schema version and
  the composition hash of every fixture change with the step. The runtime build
  is `sha256:b7f9b46fa735aff4b5eab5dc21cb178a629182ab86f49b839733e833b3acb97b`
  (506 099 bytes) and the Player's dist tree
  `sha256:93c12b4b7dc0178711970adcc1f4cd3b3a41585f4e014be900fbb7ae744fddbf`
  (83 files); the parity records and the evidence of Q14 are the pinned run's.
- **PR-90** (D89.2, transparent stills): schema `0.28` with `clear` and its
  step; the page's clear in the runtime build; `color-scheme: normal` on the
  frame and the page; the override of the default background on a session
  that lives with the page, for outputs that keep alpha; a copy with a white
  clear for a JPEG and every video job; `clear` in the manifests of stills,
  segments, and exports, compared by the join, at `EXPORT_MANIFEST_VERSION`
  7; `SetCompositionClear` and its tool; a transparent reference still with
  golden frames, alpha checked in every frame, and a blend mode over the
  clear. Status: done (#130). Schema `0.28`
  with the step, the frozen `0.27`, the pair `migration-0-27-to-0-28`, the
  corpus `compatibility/v0-28` (with `clear.json`, written by hand), and four
  invalid cases; `SetCompositionClear` and `set_composition_clear` (105
  tools). The override of the default background is sent on the session of
  each capture, right before it, and not once on a session kept with the
  page: in the pinned Chromium an override ends when any session of the
  page detaches, as the sessions of the presentation (D28.5) and of the mark
  (D86.2) do before every capture (D89, implementation notes of PR-90). The
  transparent reference still `clear` (640x360) enters with three golden
  frames and `tests/pinned/clear.pinned.test.ts`, so `REQUIRED_PINNED_FILES`
  and the Q14 artifact list grow by it. No existing golden PNG file changes;
  the golden manifests change in the three fields of D42 alone. The runtime
  build is
  `sha256:e3df8346dfdb1d674d8975d4e8150d02a1783510a0143add006e18c081e1c907`
  (506 805 bytes) and the Player's dist tree
  `sha256:dadc1a9b200d27e5a76820d2994d1449548189992eecf666445b03149eb08417`
  (83 files); the parity records and the evidence of Q14 are the pinned run's.
- **PR-91** (D89.1, the canvas): the gate of D89.1 measured first, then
  schema `0.29` with the bound it sets (at most 8192); video jobs refusing a
  composition or a definition with a side above 1920; `maxCanvasPixels`; the
  probe recorded by its SHA-256; the measurements D89.1 lists. Status:
  done (#131). The gate passed at 4224² in seven
  runs of seven and failed at 4352² and above, up to 8192², within today's
  timeouts and without tiles or a new argument, so the bound of `0.29` is
  4224 a side, amended into D89.1 with the measurements (D89, implementation
  notes of PR-91). Schema `0.29` with the step, the frozen `0.28`, the pair
  `migration-0-28-to-0-29`, the corpus `compatibility/v0-29` (with
  `canvas.json`, written by hand), and three new invalid cases;
  `checkVideoCanvas` refuses a side above 1920 in every video job and the
  estimate, and the join refuses a segments manifest that names one;
  `JobLimits.maxCanvasPixels` and `--max-canvas-pixels`. The gate,
  `tests/pinned/canvas.pinned.test.ts`, enters, so `REQUIRED_PINNED_FILES`
  and the Q14 artifact list grow by it; its frames are recorded by SHA-256 in
  `canvas/gate.json` only. No golden PNG file changes; the golden manifests
  change in the three fields of D42 alone. The runtime build is
  `sha256:890ab89b338d9ccae52452365a1faf7ddd6bfcd7857af32091d4d1837de73c34`
  (507 010 bytes) and the Player's dist tree
  `sha256:8716f624a87f3686347801fa15b4f8dbf5dee44cc127e1237f3ac6f3fcfcace2`
  (83 files); the parity records and the evidence of Q14 are the
  pinned run's.
- **PR-92** (D89, the host guide and the release): a large canvas scaled by
  the host, the checkerboard, a blend mode over the clear, the formula of a
  flip in the parent's space, and manifest version 7; the release after that
  of D88. Status: done; the host guide carries each of them (sections 3, 5,
  13, and 15), and every package is `0.12.0` for the release `v0.12.0`,
  whose tag the owner pushes from `main`. The runtime build and the Player's
  dist tree keep the bytes of PR-91; no pinned file changes.

### PR-93 — every changed tile rastered whole: D90

The probes of the flip found in PR-89 that a frame with content turned off
the axes inside a mask depends on the frames rendered before it (D89,
implementation notes of PR-89). The owner approved its fix on 2026-11-24.
[D90](../adr/D90-every-changed-tile-is-rastered-whole.md) finds the cause in
the partial raster of the pinned Chromium and adds one argument of
`launchChromium` against it; the owner accepted D90 on 2026-11-24 with the
recommendations of all three questions.

- **PR-93** (D90): `--disable-partial-raster` in `CHROMIUM_ARGS`;
  `tests/pinned/mask-history.pinned.test.ts`, recorded red on `v0.12.0` in the
  pinned container first (186 and 227 pixels at 1 and 1.5 s); the golden
  frames written again; the parity records and `docs/spike/report.md`; every
  package at `0.12.1` for the patch release `v0.12.1`, whose tag the owner
  pushes from `main`. No schema, runtime build, or Player dist tree changes.
  Status: done; D90 accepted by the owner on 2026-11-24.

### PR-94 to PR-97 — four corners and a number in a text: D91

A host's editor pins a layer onto a quadrilateral and counts a number in a
text. [D91](../adr/D91-four-corners-and-a-number-in-text.md) decides both;
the owner accepted it on 2026-11-24 at 20:03 (Europe/Warsaw).

- **PR-94** (D91, documents only): the ADR, its row in the index of ADRs,
  and these entries. Acceptance: `node --run format:check` and
  `tests/repo/adr.test.ts` pass. No code; no impact on Q14, the runtime
  build, parity, or golden frames. Status: done (#135).
- **PR-95** (D91.1, the corners): the probe of a matte with corners first
  (question 2 of D91); schema `0.30` with `corners`, the step
  `packages/schema/src/migration/step-0-29-to-0-30.ts`, the frozen
  `packages/schema/src/v0-29`, the pair `migration-0-29-to-0-30`, the corpus
  `compatibility/v0-30`, and invalid cases
  (`packages/schema/src/{composition-schema,types,validate-semantics,migrate}.ts`);
  the homography and the row `corners` in
  `packages/runtime/src/{evaluate,state,keyframes}.ts`; `matrix3d` in
  `packages/renderer-dom/src/css.ts` (and `masks.ts` if the probe passes);
  `SetNodeCorners` and `set_node_corners` in
  `packages/editor-sdk/src/{commands,registry,tools,describe}.ts`, which
  `packages/ai-sdk` reads (D46); the warning of `inspect` in `packages/cli`;
  `tests/pinned/corners.pinned.test.ts` with golden frames. Every document
  of `0.29` writes the transform it wrote before.
  Status: done (#136). The probe of question 2 did not pass: Chromium draws a
  perspective `matrix3d` on an SVG element inside a `<mask>` without its
  perspective (3 064 differing pixels against the same transform in HTML,
  0 against the affine part alone), so a matte refuses corners with
  `invalid-corners` and `masks.ts` is unchanged (D91 and D75 amended). As
  decided for PR-95, `corners` is required on every
  node with `flip` and four zero vectors mean none, as D16.1 asks; the step
  0.29 → 0.30 writes them, and D91 says so in its header. The gate,
  `tests/pinned/corners.pinned.test.ts`, enters, so `REQUIRED_PINNED_FILES`
  and the Q14 artifact list grow by it. No earlier golden PNG file changes;
  the golden manifests change in the three fields of D42 alone. The runtime
  build is
  `sha256:7dde65de40a17e636a0f7c4aed27b327744723642080936748db8ad62b2314bd`
  (518 267 bytes) and the Player's dist tree
  `sha256:d64f5510a01ee041dc9f083902b5c36f6d5eae643d4de91b419d49072fa10061`
  (85 files); the parity records (every row 0/0) and the evidence of Q14 are
  the pinned run's.
- **PR-96** (D91.2, the number): schema `0.31` with `number`, the step
  `step-0-30-to-0-31.ts`, the frozen `v0-30`, the pair, the corpus
  `compatibility/v0-31`, and invalid cases; the format, the widest text, the
  cells of digits, and `measuredNodes` in
  `packages/runtime/src/{text-frame,fragments,evaluate,state}.ts` and a module
  of the format; the cells in the text of `packages/renderer-dom/src`;
  `SetTextNumber` and `set_text_number`; `tests/pinned/number.pinned.test.ts`
  with golden frames.
  Status: in review. As decided for PR-95, `number` is required on every
  text node, `{ "kind": "none" }` for none, as D16.1 asks; the step
  0.30 → 0.31 writes it after `text`, and D91 says so in its header.
  `SetTextNumber` states the text the node keeps, so its inverse restores
  the old text. One error code, `invalid-number`. The format rounds half away
  from zero on the digits of `Number::toString`; a cubic Bézier that
  overshoots widens the box by its control values. The numbers use a fixture
  font of their own (`Kadrion Fixture Numerals`), so no earlier font or
  golden PNG file changes; the golden manifests change in the three fields
  of D42 alone. The gate, `tests/pinned/number.pinned.test.ts`, enters, so
  `REQUIRED_PINNED_FILES` and the Q14 artifact list grow by it. The runtime
  build is
  `sha256:22b773177561b753b4f2924e6d7edb2b1410420c82d2b9234b683c957bb5d09d`
  (536 253 bytes) and the Player's dist tree
  `sha256:50c7eb3436470071bfca0783930a12124c2ff0a4594a49d3c4bb46fa112de7f4`
  (86 files); the parity records (every row 0/0) and the evidence
  of Q14 are the pinned run's.
- **PR-97** (D91, the host guide and the release): a frame before corners,
  a quadrilateral that turns concave, corners from a host's tracking frame by
  frame, the font of a number, and its separators; a showcase of both; every
  package at `0.13.0` for the release `v0.13.0`, whose tag the owner pushes
  from `main`. No runtime build, Player dist tree, or pinned file changes.
  Status: in review. The host guide carries each of them (sections 2, 3, 5,
  6, and 13), the README the status and the tarballs at `0.13.0`; the
  showcase `corners-number` (D32.13) pins a picture and its bezel onto a
  screen by animated corners and counts two numbers, with the numeral font
  of the fixtures among the page's assets. The runtime build and the
  Player's dist tree keep the bytes of PR-96; no pinned file changes, and
  the pinned showcases test opens, plays, and edits the new showcase.

## Impact on Q14, parity, and golden frames

- PR-60 and PR-61 change the Player's dist tree, so parity is measured again in
  each; PR-61 changes the runtime build and reopens Q14; PR-59 is expected not
  to, and says so with the hash.
- PR-72 (D84) changes the runtime build and the Player's dist tree, so Q14
  reopens and parity is measured again; PR-70 and PR-71 are expected not to,
  and say so with the hashes. No golden PNG file changes: the browser draws
  WOFF and WOFF2 from their own bytes as it does today, and only the measure is
  new.
- PR-76 (D85) changes the runtime build and the Player's dist tree, so Q14
  reopens and parity is measured again; PR-75 is expected not to, and says so
  with the hashes (it did not: the hashes in its status are those of PR-72). No golden PNG file changes (the change is of sound only);
  the golden manifests change in the three fields of D42, and a render of a
  document without a volume animation or a video's fades writes the same audio
  and manifests as before.
- The golden PNG files of every earlier composition stay byte for byte; one new
  composition with its golden frames enters in PR-61, so
  `REQUIRED_PINNED_FILES` and the Q14 artifact list grow in the same diff.
- Renders without a mapped clip keep every byte of their manifests (rules
  above).
- PR-79 and PR-81 (D86) change no runtime build, Player dist tree, or parity
  record; PR-81 adds a pinned file, so `REQUIRED_PINNED_FILES` grows in its
  diff, and writes again the one golden frame of `main` that depended on the
  frames before it (the animated captions at 1 000 000 µs) with its manifest. PR-82 (D87) changes the Player's
  dist tree and PR-83 the runtime build, so parity is measured again in each
  and Q14 reopens in PR-83; no golden PNG file changes.
- PR-89, PR-90, and PR-91 (D89) each change the schema, the runtime build,
  and the Player's dist tree, so Q14 reopens and parity is measured again in
  each. Every existing golden PNG file, golden manifest, and parity record
  keeps its bytes, the colour scheme that PR-90 states for every document
  included. PR-90 adds a transparent reference still with its golden frames,
  so `REQUIRED_PINNED_FILES` grows in its diff; PR-91 records its probe by
  SHA-256 only, and no large PNG enters Git.
- PR-93 (D90) changes no runtime build or Player dist tree, but the
  arguments of Chromium, a field of every environment manifest: every golden
  manifest and parity record is written again, and six golden PNG files of
  compositing, shapes, and svg change to the frames rendered alone, so Q14
  reopens. It adds a pinned file, so `REQUIRED_PINNED_FILES` grows in its
  diff.
- PR-95 and PR-96 (D91) each change the schema, the runtime build, and the
  Player's dist tree, so Q14 reopens and parity is measured again in each.
  Every existing golden PNG file keeps its bytes; the golden manifests change
  in the three fields of D42 alone. Each adds a pinned file with golden
  frames, so `REQUIRED_PINNED_FILES` and the Q14 artifact list grow in its
  diff.

## Debts carried into this phase

- From phase four and five: "a playback rate other than 1". This phase closes
  the speed of a clip; the playback rate of the Player's preview stays deferred
  (D82.10).
- Still deferred: speed ramps, frame blending, resampled sound, speed of
  instances, and the items phase five deferred.

## Questions for the owner, with recommendations

Answered by the owner on 2026-11-11 at 10:44 (Europe/Warsaw): every question
of D82 and every question below as recommended. Question 1 of D82 is completed
by the multiplier notation (D82.11) and question 12 of D82 is confirmed; the
owner added that the assistant must be able to do everything the user can
(PR-62). Question 1 below is carried out with the acceptance of this plan:
`AGENTS.md` names phase six as current, and its excluded list does not change.

The technical questions are those of D82 (1 to 15). Three more belong to the
plan:

1. **`AGENTS.md` for this phase.** Recommendation: on acceptance, "Current
   phase" names phase six; the excluded line "Full timeline UI, advanced
   trimming, or 3D scenes" stays, since speed, freeze, and reverse are edits
   of a clip's map and not a timeline UI.
2. **The order and the cut of pull requests.** Recommendation: as in the
   table: the two library pieces first (PR-59, PR-60), one schema step
   (PR-61), the commands after it (PR-62), as phase three put the timeline
   commands after their schema.
3. **The release.** Recommendation: `v0.7.0` after PR-63, pushed by the owner,
   with an intermediate release after PR-61 if the host asks for it. No
   intermediate release was asked for; D83 joined the phase (question 13 of
   D83), so PR-63 and PR-68 set every package to `0.7.0`, and the owner pushes
   the tag `v0.7.0` from `main` after them. D84 joined the phase after that
   release; by its question 5 PR-73 sets every package to `0.8.0`, and the
   owner pushes the tag `v0.8.0` from `main` after it. D85 joined the phase
   after that; by its question 13 PR-78 sets every package to `0.9.0`, and
   the owner pushes the tag `v0.9.0` from `main` after it. D86 and D87 joined
   the phase after that; by question 5 of D86 PR-81 sets every package to
   `0.9.1`, and by question 6 of D87 PR-84 makes the next release. D90 joined the
   phase after `v0.12.0`; by its question 2 PR-93 sets every package to
   `0.12.1`. D91 joined the phase after `v0.12.1`; PR-97 sets every package to `0.13.0`, and the owner pushes the tag `v0.13.0` from `main` after it.
