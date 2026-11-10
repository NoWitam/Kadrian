# Vertical spike report

- Date: 2026-09-23 (PR-10)
- Scope: the vertical spike of [`vertical-spike.md`](vertical-spike.md), PR-00 to
  PR-10
- Exit criteria: §12 of the specification

## 1. Summary

Each of the five proofs has evidence in the repository, and P1, P2, P3, and P5
have passed in the pinned environment:

- **P1:** a versioned JSON composition plays in the browser Player.
- **P2:** the byte-identical runtime build renders it in pinned Chromium.
- **P3:** a canvas drag and undo/redo go through one typed command bus.
- **P4:** an AI-shaped tool call dispatches on that same bus and produces
  byte-identical JSON.
- **P5:** the Producer streams H.264 MP4 in both presets.

The environment is the Playwright image of D26 by digest, run with
`--network none` (D28.9).

Parity between the Player and the Producer is **measured** (§6.2, D33). Since
PR-11 it is **gated** in the pinned environment (D34, accepted 2026-09-23): 0
differing pixels and a channel difference of 0 against the committed golden
frames. Parity between environments is only reported.

The spike did not need to change schema `0.1`, and no Accepted decision had to
be bypassed.

## 2. Evidence of the five proofs

| Proof | Evidence                                                                                                                                                                                                            | Decisions           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| P1    | `tests/pinned/player.pinned.test.ts`: five golden seeks; the same pixels after a fresh load, after play and pause, and after a seek back; runtime hash; device pixel ratio 1; fixture font only.                    | D25, D27 (Accepted) |
| P2    | Golden frames in `packages/test-fixtures/src/golden-frames/`, written twice in fresh containers with identical SHA-256; `tests/pinned/producer.pinned.test.ts`: repeatability, order and clock independence.        | D26, D28 (Accepted) |
| P3    | `packages/editor-sdk/test/`, `tests/app/playground-drag.test.ts`, and `tests/pinned/editor.pinned.test.ts`: a drag at two preview scales changes the document by the right delta; undo brings back the first frame. | D30 (Accepted)      |
| P4    | `tests/app/ai-equivalence.test.ts`: the committed tool call gives a document byte-identical to the one the drag gives; refused arguments leave document and history untouched.                                      | D31 (Accepted)      |
| P5    | `tests/pinned/export.pinned.test.ts` and `kadrion export` in a read-only container: both presets verified structurally by `ffprobe`, with frames streamed and memory bounded.                                       | D29 (Accepted)      |
| §6.2  | `tests/pinned/parity.pinned.test.ts`, the record `docs/spike/parity-measurement.json`, and section 3 below.                                                                                                         | D33, D34 (Proposed) |

## 3. Parity between the Player and the Producer (§6.2, Q9)

### What was measured

The method is [D33](../adr/D33-parity-measurement.md) (Proposed). For each
golden timestamp, the measurement compares two frames:

- the frame that the **public, built `@kadrion/player`** shows after
  `seek(timeUs)`, in a minimal conformance host (`tests/pinned/conformance-host.ts`);
- the **committed golden frame** of the Producer.

The capture is at 1080x1920 and device pixel ratio 1. Nothing is scaled,
cropped, or resampled, and a frame of any other size is refused.

The measurement concerns the Player as an artifact, not the look of the
playground application. The playground's `scale(0.35)` and its drag overlay
belong to the application that hosts the Player (D25.2), and they are not part
of what the Player renders. No 0.35 measurement was made.

Every row is bound to the following. A mismatch in any of them makes the
comparison refuse the row rather than produce a number:

- the runtime build the Player verified;
- the document text the host received, hashed the Producer's way;
- the time the Player confirmed;
- the golden file and its SHA-256.

On every golden row, the hand-derived DOM tree corroborates what was rendered
and when, wherever that tree differs between neighbouring frames.

A preflight runs before every capture and fails the measurement unless all of
these hold:

- device pixel ratio 1;
- a surface of exactly 1080x1920 at the origin;
- no transform, zoom, or pixel effect on any ancestor;
- only the reset style sheet;
- nothing selected or focused;
- fonts and images ready;
- the hand-derived DOM tree of that time.

The premise was proven first (D33.7). Each of these cases gives a non-zero
difference:

- a Player frame one grid step later;
- a Player frame of another golden timestamp;
- a golden frame shifted by one pixel column;
- a document that moves one node.

The Player frames go through the same capture function as the rows. The
shifted golden frame is pixels only.

### Environment of the recorded measurement

- Image: `mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27` (linux/amd64), run with `--network none` (interfaces: lo; loopback only: true).
- Chromium: Playwright `1.63.0`, revision `1243`, reported version `153.0.8010.12`, channel `chromium`, arguments `--force-color-profile=srgb --disable-lcd-text --hide-scrollbars --mute-audio`.
- Context: viewport {"width":1080,"height":1920}, device scale factor 1, locale `en-US`, time zone `UTC`; Node `v24.20.0`.
- Runtime build: `sha256:c4b856ed6f5abb5810c45559b105f63ca51d9709a59fa833b9990a37dd3d8c13`.
- Document (composition hash): `sha256:4840028bbc02b991ab8255dc18c41fe847d134ecad05e61bdbcf8a12e58476ba`.
- Player dist tree (D33.10): `sha256:a7b583cc9d2a65085acf1c4b9a31230ef2ddd03d7269ec725ab78429a77a2452`, 65 files (the Player's dist and the Mediabunny bundle a host maps for it, D79.7), the manifest in the record.
- Golden manifest: `packages/test-fixtures/src/golden-frames/reference.golden-frames.json`, `sha256:e6fbdb1e808194c74f32430784bd82dd784c8e61d3e0c9542a5dd807af5ecd53`.
- Record: version 2, `gate: true`, thresholds `{"differingPixels":0,"maxChannelDifference":0}` (D34.1).
- Source: the pinned bootstrap of PR-21 (2026-10-03), in this order. One isolated `goldens:update` first generated the golden frames for the new build: the five PNG files came out byte for byte as committed, and the manifest changed in `render.schemaVersion`, `render.compositionHash`, and `render.runtime.contentHash` only; that manifest was accepted by the owner and copied into the tree. `pinned-run.sh reference` then ran its first `test:pinned` pass against those frames of the tree, and the record of that pass was copied out before the pipeline's own `goldens:update` wrote the frames again (D33.6); that regeneration, and the one of `repeat`, produced the same six files byte for byte. The record kept here is the one of the first reference run that passed, in which `tests/repo/parity-record.test.ts` and `tests/repo/q14.test.ts` were held aside in the Docker volume because both read this record; the full second run, with nothing held aside, measured the same record, and so did every later pass: the raw files are byte-identical. The file in the repository is that record in the repository's Prettier formatting, which differs from the raw bytes in white space only: the same data in the same key order. PR-21 (D42) changed the schema version, the reference document, the runtime build, and the Player's dist tree. Measured again for PR-23 (D44) on 2026-10-31, which changed the Player's dist tree and nothing else that the record binds: one `test:pinned` pass in the pinned container with `--network none` wrote it, and it differs from the record of PR-21 in `playerDistTreeSha256` and the three Player files of the manifest only; every row is again 0/0, with the same PNG hashes. Measured again for PR-28a (D50) on 2026-10-31, which changed the schema version, the reference document, the runtime build, and the Player's dist tree: one isolated `goldens:update` in the pinned container with `--network none` wrote the five reference PNG files byte for byte as committed, the manifest changed in `manifestVersion`, `render.schemaVersion`, `render.compositionHash`, `render.runtime.contentHash`, and the new field `video` (`null`) only, and it wrote the golden frames of the video composition beside them (D50.8); the `test:pinned` pass that followed wrote this record against those frames. Every row is 0/0, with the same PNG hashes; the video composition has no Player rows, because the Player refuses video until PR-28b (D50.6). Measured again for PR-28b (D51) on 2026-10-31, which changed the Player's dist tree and nothing else that the record binds: one `test:pinned` pass in the pinned container with `--network none` wrote this record and, beside it, the record of the video rows (`docs/spike/video-parity-measurement.json`, below); this record differs from the one of PR-28a in `playerDistTreeSha256` and the Player files of the manifest only, and every row is again 0/0, with the same PNG hashes. Measured again for PR-29a (D52) on 2026-11-01, which changed the schema version, both reference documents, the runtime build, and the Player's dist tree: one isolated `goldens:update` in the pinned container with `--network none` wrote the five reference PNG files and the five PNG files of the video composition byte for byte as committed, and both manifests changed in `render.schemaVersion`, `render.compositionHash`, and `render.runtime.contentHash` only (D52.3); the `test:pinned` pass that followed wrote this record and the record of the video rows against those frames. Every row is again 0/0, with the same PNG hashes. Measured again for PR-29b (D53) on 2026-11-01, which changed the runtime build (the audio grid is exported by `@kadrion/runtime`, the plan moved to `@kadrion/schema`) and the Player's dist tree: one isolated `goldens:update` in the pinned container with `--network none` wrote all ten PNG files byte for byte as committed, and both manifests changed in `render.runtime.contentHash` only; the `test:pinned` pass that followed wrote this record and the record of the video rows. Every row is again 0/0, with the same PNG hashes. Measured again for PR-30 (D54) on 2026-11-01, which changed the schema version, both reference documents, the runtime build (scenes in sequence), and the Player's dist tree: one isolated `goldens:update` in the pinned container with `--network none` wrote all ten PNG files byte for byte as committed, and both manifests changed in `render.schemaVersion`, `render.compositionHash`, and `render.runtime.contentHash` only (D54.4); the `test:pinned` pass that followed wrote this record and the record of the video rows. Every row is again 0/0, with the same PNG hashes. Measured again for PR-32 (D56) on 2026-11-01, which changed the schema version, both reference documents, the runtime build (transitions), and the Player's dist tree: one isolated `goldens:update` in the pinned container with `--network none` wrote all ten PNG files byte for byte as committed, both manifests changed in `render.schemaVersion`, `render.compositionHash`, and `render.runtime.contentHash` only (D56.4), and it wrote the golden frames of the transitions composition beside them; the `test:pinned` pass that followed wrote this record and the record of the video rows. Every row is again 0/0, with the same PNG hashes. Measured again for PR-33 (D57) on 2026-11-02, which changed the schema version, both reference documents, the runtime build (captions), and the Player's dist tree: one isolated `goldens:update` in the pinned container with `--network none` wrote all sixteen earlier PNG files byte for byte as committed, the three manifests changed in `render.schemaVersion`, `render.compositionHash`, and `render.runtime.contentHash` only (D57.7), and it wrote the golden frames of the captions composition beside them; the `test:pinned` pass that followed wrote this record and the record of the video rows. Every row is again 0/0, with the same PNG hashes. Measured again for PR-34a (D58) on 2026-11-02, which changed the schema version, both reference documents, the runtime build (the schema it holds), and the Player's dist tree (the Player refuses a template): one isolated `goldens:update` in the pinned container with `--network none` wrote all twenty-two PNG files byte for byte as committed, and the four manifests changed in `render.schemaVersion`, `render.compositionHash`, and `render.runtime.contentHash` only (D58.5); the `test:pinned` pass that followed wrote this record and the record of the video rows. Every row is again 0/0, with the same PNG hashes. Measured again for PR-34b (D59) on 2026-11-02, which changed the schema version, both reference documents, the runtime build (the schema it holds), and the Player's dist tree (one more module of the schema): one isolated `goldens:update` in the pinned container with `--network none` wrote all twenty-two PNG files byte for byte as committed, and the four manifests changed in `render.schemaVersion`, `render.compositionHash`, and `render.runtime.contentHash` only (D59.5); the `test:pinned` pass that followed wrote this record and the record of the video rows. Every row is again 0/0, with the same PNG hashes. Measured again for PR-38 (D61) on 2026-11-03, which changed the Player's dist tree and nothing else that the record binds: one `test:pinned` pass in the pinned container with `--network none` (154 of 154 tests) wrote this record and the record of the video rows; both differ from those of PR-34b in `playerDistTreeSha256` and the Player files of the manifest only, and every row is again 0/0, with the same PNG hashes. Measured again for PR-39a (D62) on 2026-11-03, which changed the Player's dist tree (the image header parser of `@kadrion/renderer-dom`, one more file, and `prepareImage`) and nothing else that the record binds: one `test:pinned` pass in the pinned container with `--network none` wrote this record and the record of the video rows; both differ from those of PR-38 in `playerDistTreeSha256` and the Player files of the manifest only, and every row is again 0/0, with the same PNG hashes. Measured again for PR-39b (D63) on 2026-11-03, which changed the schema version, both reference documents, the runtime build (the schema it holds), and the Player's dist tree (the renderer writes `object-position`): one isolated `goldens:update` in the pinned container with `--network none` wrote all twenty-two earlier PNG files byte for byte as committed, the four manifests changed in `render.schemaVersion`, `render.compositionHash`, and `render.runtime.contentHash` only (D63.6), and it wrote the golden frames of the focus composition beside them; the `test:pinned` pass that followed wrote this record and the record of the video rows. Every row is again 0/0, with the same PNG hashes. Measured again for K1 (D79) on 2026-11-10, on the code merged with PR-55a (D76), which changed the Player's dist tree (Mediabunny reads the containers in place of `mp4.js`; the manifest also lists `packages/player/node_modules/mediabunny/dist/bundles/mediabunny.mjs`, which the host maps for the Player's import) and nothing else that the record binds: one `test:pinned` pass in the pinned container with `--network none` (252 of 252 tests in 26 files) wrote this record and the record of the video rows; both differ from the records they replace in `playerDistTreeSha256` and the files of the manifest only, and every row is again 0/0, with the same PNG hashes. In the same pass, the fixture video copied into fragmented MP4, MOV, and MKV showed the Producer's frames with zero differing pixels at every golden timestamp of the video composition. Measured again for PR-55b (D77) on 2026-11-10, on the code merged with K1 (D79), which changed the schema version, the reference document, the runtime build (elements are instantiated where they are shown), and the Player's dist tree: one isolated `goldens:update` in the pinned container with `--network none` wrote every earlier PNG file byte for byte as committed, the manifests changed in `render.schemaVersion`, `render.compositionHash`, and `render.runtime.contentHash` only (D77.7), and it wrote the golden frames of the elements composition beside them; the `test:pinned` pass that followed (254 of 254 tests) wrote this record and the record of the video rows. Every row is again 0/0, with the same PNG hashes. Measured again for K2 (D81) on 2026-11-10, on main after PR-55b (D77), which changed the Player's dist tree (the Player turns a video by its display matrix after the conversion to RGB, in `container.js` and `video.js`; the manifest also lists `packages/renderer-dom/dist/video-orientation.js`, the function the Player shares with the Producer) and nothing else that the record binds: one `test:pinned` pass in the pinned container with `--network none` (276 of 276 tests in 26 files) wrote this record and the record of the video rows; both differ from the records they replace in `playerDistTreeSha256` and the files of the manifest only, and every row is again 0/0, with the same PNG hashes. In the same pass, the fixture video turned by its container in each of the seven orientations of D81.4 showed the Producer's frames with zero differing pixels and a maximum channel difference of 0 at every golden timestamp of the video composition, and the golden frames were not regenerated. Measured again for K2 on 2026-11-10, on the code merged with PR-56 (D78), which had changed the runtime build and the Player's dist tree on main: one `test:pinned` pass in the pinned container with `--network none` (289 of 289 tests in 27 files) wrote this record and the record of the video rows; both differ from those of PR-56 in `playerDistTreeSha256` and the files of the manifest only, and every row is again 0/0, with the same PNG hashes. The environment equals the golden frames' environment on every field that affects pixels, and the record is current with the build (checked by `check`).

### Numbers

Measured against the committed golden frames:

<!-- parity-table:start -->

| `timeUs` | Frame | Differing pixels |    Share | Max channel difference | Histogram 0 / 1 / 2-3 / 4-7 / 8-15 / 16-31 / 32-63 / 64-127 / 128-255 |
| :------- | ----: | ---------------: | -------: | ---------------------: | --------------------------------------------------------------------: |
| 0        |     0 |      0 / 2073600 | 0.0000 % |                      0 |                               2073600 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| 2500000  |    75 |      0 / 2073600 | 0.0000 % |                      0 |                               2073600 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| 5000000  |   150 |      0 / 2073600 | 0.0000 % |                      0 |                               2073600 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| 7500000  |   225 |      0 / 2073600 | 0.0000 % |                      0 |                               2073600 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| 9900000  |   297 |      0 / 2073600 | 0.0000 % |                      0 |                               2073600 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |

<!-- parity-table:end -->

Worst case: 0 differing pixels (at 0 µs), share 0.0000 % (at 0 µs), maximum channel difference 0 (at 0 µs).

In every row the SHA-256 of the Player's PNG equals that of the golden PNG: in the pinned
environment the public Player produced the golden frames byte for byte.

Since PR-11 these numbers **are a gate** in the pinned environment:
[D34](../adr/D34-parity-thresholds.md) (accepted 2026-09-23) sets the
thresholds of D34.1, and the record carries them with `gate: true`. The gate
compares decoded pixels, not PNG bytes. A run that claims the pinned image
(`KADRION_PINNED_IMAGE`) in another environment fails; it never degrades to a
report. A failing gate never updates golden frames. In PR-10 the same
measurement was recorded without thresholds, as version 1.

Two assertions that are not thresholds are unchanged, and both passed:

- the equality gate of D28.5: the Player and the Producer in the same run and
  the same browser binary differ in zero pixels;
- the golden-frame equality of the Producer (D26.5).

### Video rows (D51.6)

Since PR-28b the Player shows video nodes, so the video composition of D50.8
(640x360, document `sha256:e5cec62be8b124733ae60e5dace9691837c60b9c68f395e96ede6f601f023af8`)
is measured too, against its own golden frames
(`packages/test-fixtures/src/golden-frames/video.golden-frames.json`), in the
same pass, environment, runtime build, and Player dist tree as the record
above. Its record is `docs/spike/video-parity-measurement.json`, gated by the
same thresholds of D34.1: the Player decodes in its host window and converts
YUV to RGB exactly as the Producer's FFmpeg does (D51.4), so pixels inside a
video node carry no tolerance of their own.

<!-- video-parity-table:start -->

| `timeUs` | Frame | Differing pixels |    Share | Max channel difference | Histogram 0 / 1 / 2-3 / 4-7 / 8-15 / 16-31 / 32-63 / 64-127 / 128-255 |
| :------- | ----: | ---------------: | -------: | ---------------------: | --------------------------------------------------------------------: |
| 0        |     0 |       0 / 230400 | 0.0000 % |                      0 |                                230400 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| 500000   |    15 |       0 / 230400 | 0.0000 % |                      0 |                                230400 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| 1000000  |    30 |       0 / 230400 | 0.0000 % |                      0 |                                230400 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| 1500000  |    45 |       0 / 230400 | 0.0000 % |                      0 |                                230400 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| 1966666  |    59 |       0 / 230400 | 0.0000 % |                      0 |                                230400 / 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |

<!-- video-parity-table:end -->

In every row the SHA-256 of the Player's PNG equals that of the golden PNG.

**Informative only, not evidence (D33.9):** the same test on the Windows development machine
(`win32`/`x64`, Playwright Chromium `153.0.8010.12`, not the container)
measured its Player against the same committed golden frames, which a Linux container rendered.
This is a difference between environments, not between the two hosts: in the same Windows run the
D28.5 gate still found zero differing pixels between the Player and the Producer.

| `timeUs` | Differing pixels |    Share | Max channel difference | Histogram 0 / 1 / 2-3 / 4-7 / 8-15 / 16-31 / 32-63 / 64-127 / 128-255 |
| :------- | ---------------: | -------: | ---------------------: | --------------------------------------------------------------------: |
| 0        |  27033 / 2073600 | 1.3037 % |                    114 |           2046567 / 4135 / 6240 / 4951 / 8001 / 1523 / 1692 / 491 / 0 |
| 2500000  |  27031 / 2073600 | 1.3036 % |                    114 |           2046569 / 3781 / 5759 / 5375 / 7235 / 2302 / 2088 / 491 / 0 |
| 5000000  |  35457 / 2073600 | 1.7099 % |                    114 |          2038143 / 3295 / 6689 / 9356 / 11410 / 1196 / 3019 / 492 / 0 |
| 7500000  |  43422 / 2073600 | 2.0940 % |                    114 |         2030178 / 3936 / 9336 / 12003 / 13085 / 1309 / 2868 / 885 / 0 |
| 9900000  |  51769 / 2073600 | 2.4966 % |                    114 |         2021831 / 8123 / 7949 / 13934 / 16303 / 1707 / 2868 / 885 / 0 |

## 4. What held

- **One source of truth.** Every frame in both hosts is derived from
  `(validated document, timeUs)`. Seeks after play, after seeking back, and in
  shuffled order gave identical pixels.
- **The same runtime build in both hosts.** A single esbuild artifact addressed
  by SHA-256 (D21) is verified by the Player and by the Producer. Every parity
  row carries the hash the Player verified, and the comparison refuses a row
  whose hash differs from the golden manifest's.
- **Determinism.** The page clocks were replaced by throwing functions, and the
  frames stayed pixel-identical. Golden frames reproduced in a fresh container.
- **Pinned environment.** The Playwright image is pinned by digest, Chromium by
  revision, FFmpeg by SHA-256, and fonts come from asset bytes. The reference
  run has no network.
- **One command bus for the UI and the AI (D30, D31).** The drag and the tool
  call produce byte-identical documents and share one history. Since PR-10 the
  bus is a frozen facade (D30.13).
- **Custom HTML isolation.** It runs in a sandbox with an opaque origin and a
  policy that blocks fetch-style network access and storage. WebRTC and DNS
  are not blocked by it, so in a user's browser the Player provides no network
  isolation; the Producer has no network at all (D28.9, D36). Since PR-16 the
  Player runs no Custom HTML unless the host trusts it. Self-navigation is
  refused by the page policy in both hosts (D28 measurements).
- **Streaming export.** Frames stream from the Producer to FFmpeg; none are
  stored on disk, and memory stays bounded.

## 5. What has to change (ADR proposals)

Proposed in PR-10 and **accepted by the project owner on 2026-09-23**:

- [D33](../adr/D33-parity-measurement.md): the parity measurement method, its
  bindings, and its record. It was amended in PR-11 at the owner's request by
  33.10, the Player's dist tree in the record.
- [D34](../adr/D34-parity-thresholds.md): parity thresholds from the measured
  numbers, gated in the pinned environment since PR-11.
- [D35](../adr/D35-schema-migration-policy.md): the schema migration policy
  (Q16), with the owner's refinements. It is in force from 2026-09-23.

Still open:

- **Still Proposed from earlier:** [D32](../adr/D32-playground-showcases.md)
  (playground showcases). (Accepted by the owner on 2026-09-28 with the
  amendment D32.9, PR-17; see section 10.)
- **The process question of PR-10 is settled.** `docs/adr/README.md` now
  allows an additive amendment to an Accepted ADR on the owner's explicit
  instruction. Such an amendment carries an "Amended by" line, and a change of
  substance still needs a superseding ADR.

Implemented since: [D36](../adr/D36-webrtc-in-the-player.md), proposed in
PR-12 and accepted by the owner on 2026-09-24 with the corrections of PR-13,
WebRTC and the network isolation of Custom HTML in the Player. The reference
run closes the channel by having no network (D28.9); a Player in a user's
browser does not, so §7.3 is not met there, and the evidence comes from the
pinned Chromium only. PR-16 implements the decision (D36, Implementation):

- Custom HTML in the Player is a host opt-in: `createPlayer` takes
  `customHtml: { mode: 'disabled' | 'trusted' }`, and without it no Custom
  HTML runs; an untrusted element is an empty box of its size and place;
- `trusted` is the host's decision to run the document's code, not network
  isolation, and the page's `Permissions-Policy` and headers stay the host's;
- the Producer states `trusted` and keeps `--network none`;
- D21.4, D22.3, D22.4, D23, D25, and D27.1 carry the amendment of PR-16.

Reopened: CI runs on a remote GitHub runner in the pinned image (Q14,
closed on 2026-09-25, reopened by the commit of PR-16 (`531ab79`,
2026-09-27), closed again on 2026-09-27 by the evidence of the run of that
commit, reopened by the commit of PR-21 (`8b2b18e`, 2026-10-03), closed
again on 2026-10-03 by the documentation commit that adds the evidence of run
37151313481 of that commit, reopened by PR-25a on 2026-10-31, closed again on
2026-11-02 by the evidence of run 41481200563 of main after PR-34b, and
reopened by PR-38 (D61) on 2026-11-03, which changed a pinned test file,
closed again on 2026-11-04 by the evidence of run 41814956253 of main after
PR-40, reopened by PR-42 on 2026-11-04, which added a pinned test file, and
closed again on 2026-11-04 by the evidence of run 41857750361 of main after
PR-42, and reopened by PR-46 (D66) on 2026-11-07, which changed a pinned test
file and its reports).

Then reopened by the commit of PR-25a (D47, 2026-10-31), which changed pinned
test files and the reports of the export, and closed again on 2026-11-02 by the
documentation commit that adds the evidence of run 41481200563 of the main
commit bde9bb9 (after PR-34b). See section 9.

## 6. D31 and the amendment D30.13

- **D31** (the AI tool contract `set_node_position`) was accepted by the project
  owner on 2026-09-23 without a change of substance.
- **D30.13** (an amendment at the owner's request): `createCommandBus()` returns
  a shallow `Object.freeze`d facade. No caller can replace, add, or delete a
  method of the bus it shares with the AI tool. The closure with the current
  document and the undo and redo stacks is not frozen, and neither behaviour
  nor signatures change. Five tests in `packages/editor-sdk/test/bus.test.ts`
  prove it, and the mutation table of PR-10 saw each of them fail.

## 7. Open questions of §11

| #   | Status after the spike                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Decided by D13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q2  | Answered, D29.5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Q3  | Answered, D26 and D28                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Q4  | Answered, D29.1–29.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Q5  | Answered, D27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q6  | Decided by D14                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q7  | Answered, D29.6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Q8  | Answered by measurement: no LFS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Q9  | **Decided** by D33 and D34 (accepted 2026-09-23); gated in the pinned environment since PR-11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q10 | Decided by D15                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q11 | Decided by D16                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q12 | Decided by D21                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q13 | Decided by D16                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q14 | **Open**: reopened by PR-46 (D66, 2026-11-07), which changed a pinned test file, tests/pinned/transitions.pinned.test.ts, and its reports; its evidence was deleted until a green push run of a later commit. PR-47 (D67) added the pinned test file tests/pinned/easing.pinned.test.ts and two reports while it was open, PR-48 (D68) the pinned test file tests/pinned/motion.pinned.test.ts and one report, PR-49 (D69) the pinned test file tests/pinned/text.pinned.test.ts and two reports, PR-50 (D70) the pinned test file tests/pinned/captions-motion.pinned.test.ts, PR-51a (D71) the pinned test file tests/pinned/effects.pinned.test.ts and one report, PR-51b (D72) the pinned test file tests/pinned/effects-svg.pinned.test.ts and one report, and changed tests/pinned/effects.pinned.test.ts, and PR-52 (D73) the pinned test file tests/pinned/shapes.pinned.test.ts and one report. Before that, closed: the run 41857750361 of the main commit 062f532 (after PR-42) supplied the validated evidence, which met all eight criteria, and the documentation commit that follows it closed Q14 (section 9). Reopened before by PR-42 (2026-11-04), which added a pinned test file. Before that, closed: the run 41814956253 of the main commit 10573cf (after PR-40) supplied the validated evidence, which met all eight criteria, and the documentation commit that follows it closed Q14 (section 9). Reopened before by PR-38 (D61, 2026-11-03), which changed a pinned test file. Before that, closed: the run 41481200563 of the main commit bde9bb9 (after PR-34b) supplied the validated evidence, which met all eight criteria, and the documentation commit that follows it closed Q14 (section 9). Reopened before by PR-25a (D47, 2026-10-31), which changed pinned test files. Before that, closed: the run 37151313481 of the PR-21 commit 8b2b18e supplied the validated evidence, docs/ci/q14-evidence.json, which meets all eight criteria, and the documentation commit that follows it closes Q14 (section 9). Closed before by the run 36350016065 of PR-16 and reopened by PR-21, and before that by the run 36072703155 of PR-15 and reopened by PR-16 |
| Q15 | Decided by D20                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q16 | **Decided** by D35 (accepted 2026-09-23, with the refinements of the owner); in force from then on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Q17 | Answered: `ValidatedComposition`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 8. Recommended next phase

(PR-17: kept as the recommendation of PR-10. The plan of the next phase is now
[`docs/roadmap/phase-2.md`](../roadmap/phase-2.md); see section 10.)

The first phase after the spike should keep the engine narrow and harden what
the spike proved, rather than widen it:

1. **Keep CI green (Q14 reopened on 2026-11-07).** Run 41857750361 of the main
   commit 062f532 supplied the validated evidence, and the documentation commit
   that follows it closed Q14 again (section 9), after PR-42 had reopened it;
   PR-46 reopened it, and it closes by the evidence of a green push run of a
   later commit.
   A later red run is a regression to
   analyse first, and a change to what the evidence is checked against reopens
   Q14 in the commit that makes it (docs/ci/first-run.md).
2. **D36 is implemented** (section 5, PR-16): Custom HTML in the Player is a
   host opt-in and disabled by default. What stays open is a measurement in
   other browsers before any of them may count as isolating (D36, option E).
3. **The first schema change under D35**, driven by the first real need of
   Taskio, together with the migration framework and the second editor command.
   D30.9's failing-undo test belongs with that command.

Taskio integration, a timeline UI, and a language model stay outside the next
phase until these hold.

## 9. CI status after the evidence of main after PR-42 (Q14)

**Q14 is open.** PR-46 (D66) reopened it on 2026-11-07: it changed the pinned
test file `tests/pinned/transitions.pinned.test.ts` and added two of its
reports to the artifact (67 files), and deleted the evidence below. It closes
again by the evidence of a green push run of a later commit. The evidence of
2026-11-04, the second time that day, as it was:

- The evidence was `docs/ci/q14-evidence.json`, of the run
  https://github.com/NoWitam/Kadrian/actions/runs/41857750361 (run ID
  `41857750361`, attempt 1, event `push`) of the validated commit
  `062f532da84a520049abed97636caf83971dfa87` (main after PR-42), which passed every step.
- Its artifact `13338718802` was downloaded from the download URL the GitHub
  API gives for it. The SHA-256 of the ZIP, computed before it was extracted,
  equals the digest the GitHub API publishes. The validator found no problem,
  and all eight criteria of docs/ci/first-run.md passed: 15 pinned test files,
  178 of 178 tests.
- The commit that closes Q14 is a later documentation commit, which adds the
  evidence and updates the documents that state the status of Q14; the
  evidence is of the validated commit.
- Why Q14 was reopened: PR-42 (2026-11-04) added the pinned test file
  `tests/pinned/showcases.pinned.test.ts` and deleted the evidence of main
  after PR-40. The list of artifact files is unchanged (65 files).
- Local tests, including the pinned container runs, do not replace a run on a
  GitHub runner.

Before that, on 2026-11-04 (reopened by PR-42 the same day):

- The evidence is `docs/ci/q14-evidence.json`, of the run
  https://github.com/NoWitam/Kadrian/actions/runs/41814956253 (run ID
  `41814956253`, attempt 1, event `push`) of the validated commit
  `10573cfa69663474e025191d64e8c56a9e7f0bc4` (main after PR-40), which passed every step.
- Its artifact `13314004975` was downloaded from the download URL the GitHub
  API gives for it. The SHA-256 of the ZIP, computed before it was extracted,
  equals the digest the GitHub API publishes. The validator found no problem,
  and all eight criteria of docs/ci/first-run.md passed: 14 pinned test files,
  167 of 167 tests.
- The commit that closes Q14 is a later documentation commit, which adds the
  evidence and updates the documents that state the status of Q14; the
  evidence is of the validated commit.
- Why Q14 was reopened: PR-38 (D61, 2026-11-03) changed
  `tests/pinned/audio.pinned.test.ts` and deleted the evidence of main after
  PR-34b. PR-39a to PR-40 changed and added pinned test files and reports while
  Q14 was open, so the evidence is of a run that includes them, and the
  validator's list of artifact files follows what the pinned run writes now.
- Local tests, including the pinned container runs, do not replace a run on a
  GitHub runner.

Before that, on 2026-11-02 (reopened by PR-38 on 2026-11-03):

- The evidence is `docs/ci/q14-evidence.json`, of the run
  https://github.com/NoWitam/Kadrian/actions/runs/41481200563 (run ID
  `41481200563`, attempt 1, event `push`) of the validated commit
  `bde9bb9dac6de15acb561cfb9a82ace10fc0db09` (main after PR-34b), which passed every step.
- Its artifact `13161440055` was downloaded from GitHub by the owner by hand.
  The SHA-256 of the ZIP, computed before it was extracted, equals the digest
  the GitHub API publishes. The validator found no problem, and all eight
  criteria of docs/ci/first-run.md passed: 13 pinned test files, 153 of 153
  tests.
- The commit that closes Q14 is a later documentation commit, which adds the
  evidence and updates the documents that state the status of Q14; the
  evidence is of the validated commit.
- Why Q14 was reopened: PR-25a (D47, 2026-10-31) changed three of the then
  seven pinned test files, the export report they write, and the encoders the
  pinned build must have, and deleted the evidence of PR-21. PR-25b to PR-34b
  added pinned test files and reports while Q14 was open, so the evidence is of
  a run that includes them, and the validator's list of artifact files follows
  what the pinned run writes now.
- Local tests, including the pinned container runs, do not replace a run on a
  GitHub runner.

Before that, on 2026-10-03:

- The evidence is `docs/ci/q14-evidence.json`, of the run
  https://github.com/NoWitam/Kadrian/actions/runs/37151313481 (run ID
  `37151313481`, attempt 1, event `push`) of the validated commit
  `8b2b18ee74a5a62f812a078335dd9a2da574c96d` (PR-21), which passed every step.
- Its artifact `11283749088` was downloaded from GitHub by the owner by hand.
  The SHA-256 of the ZIP, computed before it was extracted, equals the digest
  the GitHub API publishes. The validator of that commit found no problem,
  and all eight criteria of docs/ci/first-run.md passed, with the pixel
  measurements of D42.6 in the pinned Chromium among the passed tests.
- The commit that closes Q14 is a later documentation commit, which adds the
  evidence and updates the documents that state the status of Q14; the
  evidence is of the validated commit.
- Why Q14 was reopened: PR-21 (D42, schema `0.2`) changed the schema, the
  runtime, and the DOM renderer, so the runtime build changed and the
  reference composition became a `0.2` document. The golden-frame manifest got
  a new `render.schemaVersion`, `render.compositionHash`, and
  `render.runtime.contentHash` (the golden PNG files are unchanged); the
  evidence of PR-16, checked against that manifest, no longer validated, so
  PR-21 deleted it and reopened Q14.
- History: Q14 was closed on 2026-09-27 by the evidence of the run
  https://github.com/NoWitam/Kadrian/actions/runs/36350016065 (run ID
  `36350016065`, attempt 1, event `push`) of the validated commit
  `531ab79f5e4189c4a551bca2f9b0f780f4263af4` (PR-16), which passed every step.
  Its artifact `10941847963` was downloaded from GitHub by the owner by hand;
  the SHA-256 of the ZIP equals the digest the GitHub API publishes. The
  validator of that commit found no problem, and all eight criteria of
  docs/ci/first-run.md passed, with the D36 test of the Player in the pinned
  Chromium among the passed tests. The documentation commit `068165d` added
  that evidence; the file stays in the Git history.
- Before that, PR-16 (D36) had reopened Q14: it changed the runtime build, so
  the golden-frame manifest got a new `render.runtime.contentHash` (the golden
  PNG files were unchanged), and the evidence of PR-15, checked against that
  manifest, no longer validated.
- Q14 was first closed on 2026-09-25 by the evidence of the run
  https://github.com/NoWitam/Kadrian/actions/runs/36072703155 (run ID
  `36072703155`, attempt 1, event `push`) of the validated commit
  `4f4d4675c09d73d33916885961d1568f73a36c80` (PR-15), which passed every step.
  Its artifact `10838699659` was downloaded from GitHub by the owner by hand;
  the SHA-256 of the ZIP equals the digest the GitHub API publishes. The
  validator of that commit found no problem, and all eight criteria passed.
  The documentation commit `57ef59f` added that evidence.
- The first run, https://github.com/NoWitam/kadrian/actions/runs/36009291627
  (commit `3ddd29d05be2938aabd996701abf9575f219ed33`, attempt 1, event `push`)
  failed at the step `Pinned FFmpeg`. The pinned browser and export tests were
  skipped, the steps `Pinned test summary` and `CI identity` failed, and it
  left no artifact.
- PR-14 was committed as `a58ffc335283d2ad64078cabc4757dbc645a57c0` on the
  branch `pr-14-ci-repair`. Its run
  https://github.com/NoWitam/Kadrian/actions/runs/36054995870 (attempt 1,
  event `push`) passed every step. Its artifact (id `10832915218`) was checked
  on 2026-09-25 and met every machine-checkable criterion except the letter
  case of the repository name, which PR-15 fixed in the validator.
- Local tests, including the pinned container runs, do not replace a run on a
  GitHub runner.
- What closed means, and which changes reopen Q14 in the commit that makes
  them, as PR-16 and PR-21 did: see docs/ci/first-run.md.

The cause: the pinned Playwright image has no `xz`, so `tar -xJf` could not
decompress the FFmpeg archive. PR-14 decompresses with `xz` where it runs and
with `python3` and `lzma` otherwise, extracts with `--no-same-owner` into a
staging directory, and publishes only verified binaries. In GitHub Actions, a
failing stage now leaves a diagnostic in `.kadrion-out/diagnostics/`, which is
never evidence. The run of PR-14 showed the fix working on a GitHub runner.

PR-13 prepared the evidence that a run produces:

- `.kadrion-out/vitest-pinned.json`, with its Kadrion-owned summary
  `pinned-test-summary.json`;
- `.kadrion-out/ci-identity.json`, the commit, run, workflow, image, FFmpeg,
  fonts, Player build, and runtime of the run, binding the other reports by
  hash.

It also prepared the validator that will check the evidence file of a real run.
It created no evidence file.

[docs/ci/first-run.md](../ci/first-run.md) lists the owner's eight criteria for
closing Q14 and the protocol for analysing a failing gate on the runner:

- what each comparison needs;
- where it is found in the artifact or in the job log;
- which items the identity or the summary adds;
- what is forbidden, namely raising thresholds, touching golden frames, gating
  a cross-environment record, and counting a red or partly skipped run as
  evidence.

## 10. Closure of the vertical spike (PR-17)

The owner closed the vertical spike on 2026-09-28. At that time all five proofs
of §5 held in the pinned environment, Q14 was closed by the evidence of the run
of PR-16, and every open question of §11 was decided, answered, or closed.

Since then PR-21 (D42, schema `0.2`) changed the build:

- Q14 was reopened by its commit; run 37151313481 of that commit supplied the
  validated evidence, and the documentation commit that follows it closed Q14
  again on 2026-10-03 (section 9);
- the measured artifacts in the repository — the golden manifest and the
  parity record of section 3 — were measured again for the build of PR-21 in
  the controlled pinned bootstrap of 2026-10-03, locally: the five golden PNG
  files stayed byte for byte, the manifest changed in `render.schemaVersion`,
  `render.compositionHash`, and `render.runtime.contentHash` only, and parity
  is zero differing pixels at every golden timestamp;
- the pinned measurements of D42.6, the clear colour of the render page in the
  Producer and in the Player among them, ran in that bootstrap and passed;
  the CI run of the commit ran them again on a GitHub runner, and they passed
  there too.

The status of Q14 rests on the evidence of that CI run alone
(docs/ci/first-run.md). The local measurements in the pinned image are not
that evidence, and nothing in this report presents them as such.

What the spike proved is a narrow path, not a product: one reference
composition, one editor command (`SetNodePosition`), and one AI tool
(`set_node_position`), measured at five golden timestamps in one pinned
environment. It is a foundation for the engine, not a production-ready one.

PR-17 settled the decisions that the spike left behind:

- [D32](../adr/D32-playground-showcases.md) is accepted, with the amendment
  D32.9 (the page's Custom HTML policy of D36).
- [D37](../adr/D37-publicly-visible-proprietary-repository.md) supersedes D10:
  the repository is publicly visible, and the code stays proprietary; no licence
  is granted, and the packages stay private and unpublished.
- D26 and D28 carry notes that update their implementation status; D21, D22,
  D23, D25, D27, and D36 carry the actual date of PR-16, 2026-09-27.

The next phase is authoring, and preparing the engine for integration with the
Taskio editor. Its plan, the order of its pull requests, and the debts that the
spike leaves are in [`docs/roadmap/phase-2.md`](../roadmap/phase-2.md); each
pull request of it is approved separately.
