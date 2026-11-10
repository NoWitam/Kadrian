# D79 — Video containers read with Mediabunny, and the verdict of `inspectVideo`

- Status: Proposed
- Date: 2026-11-10
- Supersedes: D51.1 (what the Player accepts) and the MP4 reader of D51.3
- Extends: D12 (the allowlist gains `mediabunny`, and `cli` may depend on
  `player`), D51 (the containers the Player reads), D33.10 (the Player's dist
  manifest names the host modules it is served with), each with an
  `Amended by: K1 (D79)` line
- Related: D25.8, D34, D37, D49.6, D50.5, D53.2, D60

## Context

D51.1 limits the Player to one kind of file: an MP4 with one `moov` box, not
fragmented, read by the Player's own ISO BMFF reader (`packages/player/src/mp4.ts`).
A host's editor receives what people upload: fragmented MP4 from screen
recorders and browsers, QuickTime from phones and cameras, Matroska from
encoders. Every one of them was refused with `video-unsupported`, even when its
H.264 stream is exactly one the Player decodes to the Producer's pixels; and a
host could not ask beforehand whether a file plays as it is or needs a
transcode, so it learned it only from a failed load.

Writing readers for three more containers would multiply the code that has to
match FFmpeg's timestamps exactly. Mediabunny is a TypeScript library, without
runtime dependencies, that reads MP4, fragmented MP4, QuickTime, Matroska and
WebM. The
measurement with the pinned FFmpeg of D29.1 (FFmpeg `autobuild-2026-09-21-13-55`):

- Mediabunny's timestamps times the track's time resolution are the ticks the
  pinned ffprobe reads (`best_effort_timestamp`, D50.5) for MP4, fragmented MP4
  (which starts at 1024 ticks with no edit), MOV, and Matroska (1/1000), for
  25, 30000/1001, 60000/1001 and 24000/1001 frames per second.
- The duration of the last Matroska frame: FFmpeg rounds the fractional default
  duration down to a tick; Mediabunny gives the fraction, so the Player rounds
  it down too.
- Mediabunny applies the first entry of an edit list and warns about the rest;
  it counts sample 0 of an ISO BMFF track a key sample whatever the file says.
- Its colour names (`getColorSpace`) lose the H.273 code points it does not
  name.
- FFmpeg's `-display_rotation 90` is read by Mediabunny as rotation 270: the
  directions differ, so a rotation is never mapped, only refused (K2).

## Decision

> D79: The Player reads MP4, fragmented MP4, QuickTime, and Matroska with Mediabunny 1.62.1, pinned exactly and used without modification, under the rule of D51.1 for the stream: H.264, 8-bit 4:2:0, progressive, BT.601 or BT.709, no rotation; `inspectVideo` gives a host the Player's verdict on a file and its facts before any load, from the same examination the Player uses, and `kadrion inspect` gives it on the command line.

### D79.1 The dependency (amends D12)

- `mediabunny` `1.62.1` (published 2026-10-22, the newest release at least
  two weeks old on 2026-11-10), an exact version in
  `packages/player/package.json`, on the allowlist
  `externalRuntimeDependencies` with the licence MPL-2.0. Its only
  dependencies are two packages of TypeScript declarations
  (`@types/dom-webcodecs`, `@types/dom-mediacapture-transform`), which carry
  no code.
- MPL-2.0 is a file-level copyleft: it binds the files of Mediabunny, not the
  files that import it. Kadrion uses the published package as it is, from
  `node_modules`; it copies, patches, or vendors none of its files into the
  repository. A change to Mediabunny would be made in its own files, offered
  under MPL-2.0, and would need an ADR first. D37 stays: Kadrion's own files
  grant no licence, and a future open-source ADR lists this dependency with
  the others.
- Only `@kadrion/player` imports it. The runtime build of the render page
  (D25) does not contain it: it runs in the host window, where the Player
  reads and decodes.
- A version change is a pull request of its own, with the verdict corpus
  (D79.4) and the parity measurement (D34) run again in the pinned
  environment.

### D79.2 What the Player accepts (supersedes D51.1)

- A file whose container is MP4 (including fragmented MP4), QuickTime, or
  Matroska. WebM is recognised and refused by its codec, since WebM carries no
  H.264. Any other format (MPEG-TS, AVI, …) is refused as a container.
- The primary video track is H.264 (`avc1`/`avc3` with a decoder configuration
  record), 8-bit, 4:2:0, progressive, with colour as D51.1 stated it (now
  D79.3), neither rotated nor flipped.
- Its presentation times are whole ticks of its time resolution, never before
  zero (an edit list that cuts frames from the start is refused), and strictly
  ascending. An edit list of more than one entry, or a fragment's run that
  Mediabunny skips, is refused, because Mediabunny's timeline would no longer
  be FFmpeg's. The duration of the last frame is its own, rounded down to a
  tick, or else the interval before it, as FFmpeg reads it.
- The first sample is a sync sample that holds an IDR picture (D79.5).
- The media facts of D51.3 (`durationUs`, `width`, `height`, `frames`) come
  from these timestamps, through `sourceDurationUs` of `@kadrion/schema`, so
  they stay those of the Producer's ffprobe.
- The rule is otherwise D51.1's: the Player never converts approximately, so
  HEVC, VP9, AV1, 10-bit, 4:2:2, interlaced, BT.2020, and rotated videos stay
  refused, even when Chromium decodes them. Rotation is the subject of K2,
  VP9 and AV1 of K3; each needs its own ADR and measurement.
- A sound of more than two channels does not stop the picture: the Player
  refuses the sound as D53.2 says, and the verdict says so (D79.4).

### D79.3 Colour from the container

- What the container says about colour (the `colr` box, Matroska's colour
  elements) is read as H.273 code points through Mediabunny's names. Each
  field it states (other than 2, unspecified) must equal what the sequence
  parameter set says, with 2 read as the default; its range must equal the
  bitstream's. A name Mediabunny gives that is not in the table is never a
  match.
- A code point Mediabunny does not name (for example matrix 7, SMPTE 240M)
  reaches the Player as "not stated", and the sequence parameter set decides,
  as before.

### D79.4 The verdict: `inspectVideo`

- `inspectVideo(file: Blob | Uint8Array): Promise<VideoInspection>` is
  exported by `@kadrion/player`. It reads the file it is given and nothing
  else: no URL, no fetch (D25.8); a host fetches a remote file and passes the
  `Blob`. Bytes are copied first. It never throws for the file's sake.
- The verdict is frozen: `playable` (whether the Player shows the file as it
  is), `reasons` (each a `code` and an English `message`), `container`
  (`mp4`, `mov`, `mkv`, `webm`, `other`, or `null`), `format` (Mediabunny's
  name of it), `video` (`codec`, `codecString`, `width`, `height`, `rotation`,
  `flipped`, `frames`, `durationUs`, `timeBase`, `frameRate`), and `audio`
  (`codec`, `channels`, `sampleRate`) or `null`.
- The reason codes: `unreadable`, `container`, `no-video`, `codec`,
  `bit-depth`, `chroma`, `interlaced`, `colour`, `rotation`, `timing`,
  `audio-channels`. The list may grow by an additive change of the API report
  (D60); a host treats an unknown code as "not directly".
- The Player and `inspectVideo` share one examination: the Player's
  `video-unsupported` is the first reason as its message and every reason as
  `code: message` in its `details`. A verdict therefore never says "plays"
  for a file the Player refuses, or the reverse; only `audio-channels` lets
  the Player show the picture while the verdict is not `playable`.
- The verdict cannot know whether a given browser's WebCodecs has an H.264
  decoder; a decoder that fails stays `video-undecodable` at load (D51.1).

### D79.5 The first decode starts at an IDR picture

- A sample marked sync in the container is a start of decoding only when its
  bytes hold an IDR picture (NAL unit type 5), as FFmpeg decodes it. The Player
  decodes from the latest such sample at or before the one it needs, passing
  over sync samples that hold none (recovery points, open GOP). A file whose
  first sample holds no IDR picture is refused with `timing`.

### D79.6 `kadrion inspect`

- `kadrion inspect [--json] <file>` reads the file as a `Blob`
  (`fs.openAsBlob`, without loading it into memory) and prints the verdict of
  `inspectVideo`: as JSON with `--json`, as lines of text without. It exits 0
  whenever it prints a verdict, playable or not; 2 for a usage error; 1 when
  the file cannot be opened.
- `@kadrion/cli` may depend on `@kadrion/player` for this (amends D12). The
  command uses no browser: `inspectVideo` is pure and runs in Node.

### D79.7 Hosts and the parity measurement (amends D33.10)

- A host that loads the Player's dist through an import map (the playground,
  the pinned hosts) maps `mediabunny` to the package's self-contained bundle
  `mediabunny/dist/bundles/mediabunny.mjs`; a bundler resolves it by itself.
- The Player's dist manifest of the parity record (D33.10) lists that bundle
  with the dist files, by its path in the repository, so the record names
  every byte the Player ran.

## Alternatives considered

- **Extend the Player's own MP4 reader to fragmented MP4, QuickTime, and
  Matroska** — three readers to keep equal to FFmpeg's timestamps, each with
  its own edge cases, for code that is not Kadrion's subject.
- **A WebAssembly build of FFmpeg's demuxers in the browser** — FFmpeg's own
  timestamps, but megabytes of WebAssembly, LGPL/GPL obligations of its own,
  and a toolchain to pin; the Player would still need its own colour checks.
- **mp4box.js, or a WebAssembly demuxer such as web-demuxer** — mp4box.js
  reads ISO BMFF only, so Matroska would still need a reader of its own; a
  WebAssembly demuxer brings the costs of the alternative above.
- **A verdict computed separately from the Player** — it could disagree with
  what the Player does; one examination makes that impossible.
- **Accepting rotated files by rotating the picture** — Mediabunny's and
  FFmpeg's rotation directions differ; it needs its own measurement (K2).

## Consequences

- `@kadrion/player` loses `mp4.ts` and gains `container.ts` and the runtime
  dependency `mediabunny`; its dist tree changes, so parity was measured again
  (D34) in the pinned container on 2026-11-10: 0 differing pixels and a
  maximum channel difference of 0 in all five reference rows and all five video
  rows, gated, with the same PNG hashes as before (`docs/spike/report.md`).
- Hosts that serve the Player through an import map must serve the Mediabunny
  bundle under `mediabunny`; the README says how.
- The API of `@kadrion/player` grows by `inspectVideo` and its types
  (additive). `@kadrion/cli` gains `inspect`, the type `Inspect`, and the
  member `inspect` of `CliHosts`; `runCli` takes `Partial<CliHosts>`, so
  callers that pass hosts are unaffected.
- Mediabunny's warnings are read through its global `Logging` hook while a file
  is examined: two examinations at the same moment can see each other's
  warning about an edit list, and one of them may be refused although it
  plays. A refusal is never a wrong frame.
- Not detected: an empty edit followed by an edit that cuts frames (Mediabunny
  applies the first entry only), and several sample descriptions in one
  track. Neither occurred in the corpus.
- The Producer, the runtime build, the schema, and the golden frames do not
  change.

## Verification

- `packages/player/test/video.test.ts`: the container reader on files muxed
  by Mediabunny in MP4, fragmented MP4, MOV, and MKV, and VP9 and AV1 refused;
  every refusal of D79.2 with its code; IDR detection; colour from the
  container.
- `packages/player/test/player.test.ts`: decoding passes over a sync sample
  without an IDR picture (D79.5).
- `packages/cli/test/cli.test.ts`: `kadrion inspect` with and without
  `--json`, usage errors, and a missing file.
- `tests/pinned/inspect.pinned.test.ts` (pinned): the verdict corpus made by
  the pinned FFmpeg — H.264 in MP4, fragmented MP4, MOV, and MKV plays, with
  the facts ffprobe reads; HEVC, VP9, AV1, 10-bit, 4:2:2, interlaced, BT.2020,
  rotated, MPEG-TS, 5.1 sound, and a file without video each get their reason;
  and `kadrion inspect --json` gives the same verdict.
- `tests/pinned/player-video.pinned.test.ts` (pinned): the fixture video
  remuxed into fragmented MP4, MOV, and MKV shows the Producer's frames with
  zero differing pixels, and the facts of the Producer's manifest.
- `tests/repo/package-boundaries.test.ts`: the allowlist entry and the
  `cli` → `player` edge; `tests/parity/parity.test.ts`: the host-mapped
  bundle in the dist manifest.
