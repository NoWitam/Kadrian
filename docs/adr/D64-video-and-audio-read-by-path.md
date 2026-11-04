# D64 — Video and audio read by path in the Producer

- Status: Proposed
- Date: 2026-11-04
- Supersedes: —
- Amends: D50 (50.5: a video read by path gets no private copy) and D52
  (52.5: a sound source read by path gets no private copy), each with an
  `Amended by: PR-40 (D64)` line
- Related: D14, D27, D29, D47, D48, D49, D51,
  [roadmap of phase four](../roadmap/phase-4.md) PR-40

## Context

Since D50.5 and D52.5 the Producer's resolver hands over the bytes of every
asset, and the Producer writes a private copy of each video and sound source
for FFmpeg, because a container such as MP4 is read by seeking, never from a
pipe. D50.5 named delivery by path as the step for large files that PR-28a
left out, and the plan of phase four gives it to PR-40.

For a worker this matters as soon as media are long: a host that renders a
ten-minute clip from storage it mounts read-only holds the whole file in
memory to pass it to the resolver, and the Producer writes it out again for
every probe and every frame loop, once per job of a render split into ranges
(D47). The bytes are the same each time; only the delivery differs.

The plan asked three questions: how the verified bytes stay the bytes FFmpeg
reads, whether images and fonts may come by path too, and what a path outside
an allowed root is.

## Decision

> D64: The Producer's resolver may return `{ path, mediaType }` for a video or
> an audio asset. The Producer verifies the file's SHA-256 by streaming it,
> checks the job limits against its size before reading it, gives FFmpeg that
> same file without copying it, and after every read of FFmpeg checks that the
> file is still the one it verified, before anything FFmpeg read is used. The
> outputs and the manifests do not depend on the delivery.

### D64.1 The delivery

- `ProducerAssetResolver` of `@kadrion/producer` returns, for the frozen
  request of D14, `{ bytes, mediaType }` (unchanged, D27.3), `{ path,
mediaType }` (new), or `null`. Every request type of the Producer
  (`renderFrames`, `renderSegments`, `renderAudio`, `exportMp4`,
  `renderStill`) takes it; a resolver of `AssetResolver` type still fits.
- A path is accepted only for an asset of type `video` or `audio`, with a
  media type of that type, as an absolute path without a NUL byte to a
  regular file. Anything else is `asset-invalid`; an answer with both `bytes`
  and `path` too. A file that cannot be opened or read is `asset-missing`, as
  bytes the host does not have are.
- The path is resolved once (`realpath`): every later read uses the real path,
  so a symbolic link that changes later changes nothing.
- The Producer reads the file's facts first and refuses a file larger than
  `maxAssetBytes` (D48.4) before reading it. It then streams the file through
  SHA-256; a hash other than `contentHash` is `asset-hash-mismatch`. The size
  of the file counts towards `maxTotalAssetBytes` like the size of bytes.
- The Producer never holds the file's bytes in memory, never writes to it, and
  never removes it.

### D64.2 Images and fonts stay bytes

Images and fonts enter the render page as bytes (D27.1), and the Producer
compares an image's header with the pinned Chromium's decode (D62.3); both are
small. A path would only move the read into the Producer without saving a
copy. A path for an image or a font is `asset-invalid`.

The render page receives images and fonts only: a video's frames arrive frame
by frame (D50.4), and a sound never enters the page, however either was
delivered. Before, the bytes of a sound were passed to the page and unused.

### D64.3 The verified bytes are the bytes FFmpeg reads

Of the three ways the plan named, the Producer takes the second, made stronger:

- At verification it records the file's device, inode, size, and modification
  and change times in nanoseconds, before and after the hash; a difference, or
  a number of bytes read other than the size, is `asset-changed`.
- After every read of FFmpeg, before what it read is used, it reads them again
  and requires them unchanged (`asset-changed`): after each `ffprobe` of a
  video or a sound, after the decoded frames of each instant and before they
  go to the page, and after the audio pass and before its file gets its final
  name.

A write to a file changes its change time when it happens, and the change time
cannot be set from user space, so a frame or a sample read from changed bytes
is always followed by a check that fails: such a file is refused, never
rendered. A failed job leaves nothing under a final name (D47.6, D48.2), so a
segment finished before the change was noticed is removed with the rest.

Not chosen: reading through one open descriptor protects against a file
replaced by another, not against one changed in place, and FFmpeg reopens an
input for each process; hashing again after the render doubles the reads of
the largest files and still learns of a change only at the end.

### D64.4 No allowed root

The Producer has no allowed root: the resolver is host code, as it is for
bytes (D14), and choosing which file belongs to an asset is the host's
business. A path is required to be absolute, so it is unambiguous for FFmpeg
and never read relative to the worker's directory. The CLI reads the paths of
its asset map relative to that file, as before, and hands video and audio to
the Producer by path, images and fonts as bytes.

### D64.5 The manifests

The manifests do not record the delivery. A render of the same document with
the same bytes gives the same frames, samples, files, and manifests by either
delivery, so the parts of one render may come from jobs that delivered the
same asset differently and still join (D47.5). The `contentHash` identifies the
bytes; a path is never written. `MANIFEST_VERSION` and
`EXPORT_MANIFEST_VERSION` stay as they are.

### D64.6 Private copies

D50.5 and D52.5 are amended: a video or a sound source read by path gets no
private copy; one delivered as bytes gets one as before. The Producer creates
the directory of its copies only when there is a copy to write, so a job whose
media all come by path writes no file besides its outputs.

## Alternatives considered

- **Record the delivery in the manifest** (as the plan sketched). The delivery
  is not a property of the output: recording it would make two runs of the same
  bytes differ, make a join of parts with different deliveries fail, and need
  a new manifest version, while `contentHash` already names the bytes.
- **Paths for every asset type.** See D64.2: no copy is saved, and the page and
  the image check need the bytes anyway.
- **An allowed root given to the Producer.** It would duplicate a decision the
  host's resolver already makes, as it does for bytes; a root the host must
  configure as well as its resolver is one more place to get wrong.
- **Hand FFmpeg an open descriptor (`/dev/fd/N`).** See D64.3.

## Consequences

- `@kadrion/producer`: `ProducerAssetResolver` and `ResolvedPath` are exported;
  the request types take them (additive); `ProducerErrorCode` gains
  `asset-changed` (a wider union of codes, so a breaking change of the API
  report, D60). `RenderSession.load` takes the verified assets of either
  delivery.
- `@kadrion/cli`: video and audio of the asset map go to the Producer by path.
  The read-only reference container of `pinned-run.sh` keeps no copy of the
  sound in its `/tmp`.
- The Player is not touched: it reads bytes or a `Blob` (D51.2).
- A change that a file system does not record in the change time (a write
  through a shared memory map before its write-back, or a file system that
  does not keep the time) is outside what the Producer can see; the host keeps
  its media unchanged while a job runs.

## Verification

- `packages/producer/test/media-path.test.ts`: verification by streaming, the
  real path, every refusal, the limit before the read, the total, and a file
  rewritten in place with its times put back, grown, replaced, or removed
  (`asset-changed`); no copy and no removal of the host's file.
- `packages/producer/test/video.test.ts`: a video read by path gives the frames
  of its bytes, and a file changed after the probe or during it is refused
  before a frame reaches the page.
- `packages/producer/test/export.test.ts`: the audio pass over a file gives the
  manifest and intermediate of its bytes; a file changed during the pass is
  refused and nothing gets the final name; the size limit before the read.
- `packages/cli/test/cli.test.ts`: the CLI resolver names the audio by path.
- `tests/pinned/video.pinned.test.ts`, `tests/pinned/audio.pinned.test.ts`,
  and `tests/pinned/export.pinned.test.ts` with the pinned FFmpeg and Chromium:
  the same frames and manifest of the video composition, the same audio
  intermediate and manifest of the mix with every source read by path, the
  same MP4 bytes and manifest from the CLI (audio by path) as from the library
  (bytes), and a file changed between verification and decode refused with
  `asset-changed`.
