# Host guide

This guide is for a host that builds a video editor and its render worker on
Kadrion. For each task of the host, it gives the call to make, the errors to
expect, the limits that apply, and the decision record (ADR) that is the
authority. The tasks come in the order of the host flow test
([`tests/release/host-flow.ts`](../../tests/release/host-flow.ts)), which runs
every one of them on the tarballs of a release before the release is
published.

The guide decides nothing. Where it and an ADR differ, the ADR is right and
the guide has a bug. The [README](../../README.md#using-kadrion) holds longer
examples of each call; this guide gives the shortest form and the contract.

Every rule in [Rules every host follows](../../README.md#rules-every-host-follows)
applies throughout: the document is the only source of rendering truth,
times are integer microseconds ([D04](../adr/D04-integer-microsecond-time.md)),
IDs are stable, assets are supplied by the host and checked by their SHA-256
([D14](../adr/D14-content-addressed-assets.md)), and every edit goes through
the command bus ([D30](../adr/D30-command-bus-and-undo.md)).

## Contents

1. [Install a release](#1-install-a-release)
2. [Load a saved document](#2-load-a-saved-document)
3. [Open the editor: Player and session](#3-open-the-editor-player-and-session)
4. [Read the facts of a media asset](#4-read-the-facts-of-a-media-asset)
5. [Edit from the UI](#5-edit-from-the-ui)
6. [Edit from a model](#6-edit-from-a-model)
7. [Undo, redo, and the history](#7-undo-redo-and-the-history)
8. [Follow playback](#8-follow-playback)
9. [Save the document](#9-save-the-document)
10. [Make a template and instantiate it](#10-make-a-template-and-instantiate-it)
11. [Set up the worker](#11-set-up-the-worker)
12. [Estimate a render](#12-estimate-a-render)
13. [Render in jobs and join](#13-render-in-jobs-and-join)
14. [Export in one pass](#14-export-in-one-pass)
15. [Render a still](#15-render-a-still)
16. [Run, limit, and cancel jobs](#16-run-limit-and-cancel-jobs)

## 1. Install a release

- **Call:** take the nine tarballs and `kadrion-release.json` of the GitHub
  release `v<version>`. Give every tarball as a dependency and as an override
  (npm) or under `overrides` (pnpm), also the packages you do not import, and
  check that the lockfile records each tarball's `integrity` from
  `kadrion-release.json` ([README, section 10](../../README.md#10-installing-a-release)).
- **What goes where:** the browser needs `schema`, `editor-sdk`, `ai-sdk`,
  `editor-session`, and `player`, with `renderer-dom` and `runtime`, whose
  runtime build the host serves. The worker needs `producer` and `cli`, the
  pinned image, and the pinned FFmpeg (section 11).
- **Limits:** all nine packages come from one release; upgrading replaces all
  nine at once. No `@kadrion` name may resolve from a registry. The packages
  are private and unlicensed; a release grants no licence.
- **Authority:** [D45](../adr/D45-delivering-packages-as-release-tarballs.md)
  (tarballs and manifest), [D37](../adr/D37-publicly-visible-proprietary-repository.md)
  (no licence, no registry), [D60](../adr/D60-api-reports-and-document-object.md)
  (the public surface: a breaking change of an API report needs a new minor
  version).

## 2. Load a saved document

- **Call:** `parseComposition(text)` of `@kadrion/schema/migrate` on the saved
  text, or the job `kadrion migrate <file> --out <file>` (and `--check` to
  find documents that are not current). Both carry a document of any version
  in `SUPPORTED_SCHEMA_VERSIONS` forward to the current one.
- **Result:** `{ ok: true, composition, versions }`; `versions.length > 1`
  means it was migrated, so store it as a new version of the host's project.
  Loading replaces the document: create a new command bus with a fresh
  history for it, and publish it only after the load succeeded.
- **Errors:** `stage: 'text'` with `not-a-string` or `invalid-json`; otherwise
  `version` and every validation error. An unknown version is refused, never
  read as the nearest one. The job writes an `invalid` line and the error
  `invalid-document` (exit 1), or exits 6 (`not-current`) under `--check`.
- **Limits:** only `validateComposition`'s current version is accepted by the
  Player, the Producer, the render jobs, and the bus; none of them migrates.
- **Authority:** [D43](../adr/D43-saved-compositions-and-compatibility.md)
  (saved form, migration, `kadrion migrate` by amendment), [D35](../adr/D35-schema-migration-policy.md)
  (forward migrations), [D48](../adr/D48-render-job-contract.md) (the job's
  lines and exit codes, by amendment).

## 3. Open the editor: Player and session

- **Call:** serve `@kadrion/renderer-dom/runtime-build/kadrion-runtime.js` and
  its `.json`; `createPlayer(container, { runtime: { bytes, contentHash }, onListenerError })`
  on a container that already has its size; then
  `createEditorSession({ document, player, resolveAsset, onListenerError })`.
  The session loads the Player, and `session.destroy()` destroys both.
- **The resolver:** `({ id, type, contentHash }) => ({ bytes, mediaType }) | null`.
  It is asked only for hashes the Player does not hold yet.
- **Errors:** a `PlayerError`, checked by its `code`, never by `instanceof`:
  `runtime-hash-mismatch` (the build is not the one of the manifest),
  `invalid-document`, `asset-missing`, `asset-hash-mismatch`, `asset-invalid`,
  `image-unsupported`, `image-invalid`, `font-load-failed`,
  `video-unsupported`, `audio-unsupported`, `page-timeout`, `superseded` (a
  newer load replaced this one; expected after quick edits). An error about an
  asset names it in `asset: { id, contentHash }`. A template is shown as its
  instantiation with the defaults; the Player itself refuses a template.
- **Limits:** `ackTimeoutMs` (default 2000) and `requestTimeoutMs` (default 10000) of `createPlayer`. Without `customHtml: { mode: 'trusted' }`, no
  Custom HTML runs; trusted is not a security boundary. Sound plays only with
  `audio: { context }`, an `AudioContext` at 48 kHz made on a user gesture.
  The headers of the page that embeds the Player (CSP, Permissions-Policy) are
  the host's.
- **Authority:** [D44](../adr/D44-host-facade-and-live-preview.md) (the
  session), [D25](../adr/D25-player-host-and-render-page.md) (the Player and
  its render page), [D21](../adr/D21-runtime-build-artifact.md) (the runtime
  build), [D27](../adr/D27-fonts-and-the-load-step.md) (fonts only from font
  assets), [D36](../adr/D36-webrtc-in-the-player.md) (Custom HTML policy),
  [D51](../adr/D51-video-in-the-player.md) and [D53](../adr/D53-audio-in-the-player.md)
  (video and sound in the Player), [D58](../adr/D58-templates-inputs-bindings-and-instantiation.md)
  (preview of a template).

## 4. Read the facts of a media asset

- **Call:** `session.readMediaFacts({ id, type, contentHash })` before the
  host places an asset: `{ type: 'image', width, height }`,
  `{ type: 'video', durationUs, audioDurationUs }`, or
  `{ type: 'audio', durationUs }`. The session hands these facts to the bus.
- **Errors:** the asset errors of section 3; an image's size is read from its
  PNG, JPEG, or WebP header, with the EXIF orientation applied as the pinned
  Chromium applies it. The bus refuses a clip or a heard video that reads past
  its source (`source-range-exceeded`) or whose facts it does not have
  (`media-facts-missing`).
- **Before an upload is used:** `inspectVideo(blob)` of `@kadrion/player`, or
  `kadrion inspect --json <file>` on the worker, says whether the Player shows
  a video as it is (`playable`) and if not, why (`reasons[].code`), with its
  facts. H.264 in MP4, fragmented MP4, QuickTime, or Matroska plays; transcode
  anything else before placing it. A file turned by its container a quarter
  turn, mirrored or not, as phones record, plays too: both hosts turn the
  picture the same way, and the facts (`width`, `height`) are the size as
  shown, with `rotation` and `flipped` beside them; `rotation` as a reason
  means a display matrix that is no quarter turn. A host that loads the
  Player's `dist` through an import map maps `mediabunny` to the package's
  `dist/bundles/mediabunny.mjs`. (Proposed in D79 and D81; this guide links
  them once the owner accepts them.)
- **A clip at another speed, frozen, or reversed:** the time map of D82, ahead
  of the fields of schema `0.24` (PR-61), so a host computes nothing of its
  own. Each takes a clip's timing explicitly: `startUs`, `durationUs`,
  `sourceStartUs`, `sourceStartRemainder`, `speed` (`{ num, den }`), and
  `reverse`. From `@kadrion/schema/time-map`: `sourceTimeOfScene(clip, timeUs)` is the
  source time shown at a scene time; `sceneTimesOfSource(clip, sourceTimeUs)`
  the scene times that show a source time (`{ startUs, durationUs }` or
  `null`), to retime words; `clipSourceRange(clip, sceneDurationUs)` the source
  range the picture samples, to check against the facts; `clipTimeMap(clip)`
  the exact map, which a trim or a split does not change;
  `advanceClipSource(clip, deltaUs)` the source start moved by a trim; and
  `parseSpeed(value)` and `formatSpeed(speed)` the multiplier a person or a
  model reads and writes (`"x0.5"`, `2`, `"x1/3"`; a value with no exact speed
  is refused with `speed-invalid` and the nearest speed named, never rounded).
  From `@kadrion/runtime/stretch`: `stretchSourceRange(map, startSample, sampleCount)`
  the source samples, and their microseconds `[startUs, endUs)`, that the
  sound of a clip reads for the composition samples heard, which is wider than
  the range heard; and `stretchSound` the samples, the pitch kept, the same in
  both hosts.
- **Authority:** [D49](../adr/D49-the-timeline-model.md) (facts outside the
  document), [D51](../adr/D51-video-in-the-player.md),
  [D53](../adr/D53-audio-in-the-player.md), [D62](../adr/D62-image-facts.md),
  [D82](../adr/D82-clip-speed-freeze-frames-and-reverse-playback.md) (the time
  map, the stretch of sound, and the multiplier).

## 5. Edit from the UI

- **Call:** `session.bus.dispatch(command)` or
  `session.bus.dispatchTransaction([command, …])` (all or none, one undo
  step). `COMMAND_TYPES` lists every command; the README lists them by group.
  Each edit reaches the preview at the time it shows; `await session.settled()`
  waits until the Player shows the latest document.
- **Result:** `{ document, inverse, createdIds }`; one `document` event per
  committed operation. `clipTransitionAtCut(document, args)` returns the
  commands that put a clip transition on a cut, for one
  `dispatchTransaction`.
- **Errors:** an `EditorError` by `code`, and nothing changes: for example
  `invalid-argument`, `unknown-node`, `id-in-use`, `unknown-asset`,
  `asset-type-mismatch`, `asset-in-use`, `keyframe-exists`,
  `too-few-keyframes`, `transition-in-use`, `split-not-exact`,
  `input-in-use`, `binding-in-use`, `not-a-cut`, `no-room-at-cut`, and
  `busy` when a listener dispatches during a change. A listener's own error
  goes to `onListenerError`.
- **Limits:** IDs are chosen by the host and never reused across the history;
  times are never rounded; positions and sizes are.
- **Authority:** [D30](../adr/D30-command-bus-and-undo.md),
  [D38](../adr/D38-authoring-foundation.md), [D39](../adr/D39-structural-commands-and-node-identifiers.md),
  [D40](../adr/D40-property-and-asset-commands.md), [D41](../adr/D41-authoring-animations-and-keyframes.md),
  [D42](../adr/D42-schema-0-2-element-lifetime-and-first-migration.md),
  [D50](../adr/D50-video-nodes-and-fit.md), [D52](../adr/D52-audio-clips-volume-fades-and-the-mix.md),
  [D54](../adr/D54-scenes-in-sequence.md), [D55](../adr/D55-timeline-commands.md),
  [D56](../adr/D56-transitions.md), [D57](../adr/D57-captions.md),
  [D63](../adr/D63-the-focus-point-of-cover.md), [D66](../adr/D66-clip-transitions-in-the-canvas-frame.md),
  [D67](../adr/D67-easing-curves.md), [D68](../adr/D68-rotation-origin-and-more-animated-properties.md),
  and for the motion graphics of phase five [D69](../adr/D69-text-styles-and-text-animated-in-fragments.md)
  (text styles and text in fragments), [D70](../adr/D70-animated-captions-and-the-safe-area.md)
  (animated captions and the safe area), [D71](../adr/D71-effects-of-css-filters.md)
  and [D72](../adr/D72-effects-of-svg-filters.md) (effects),
  [D73](../adr/D73-vector-shapes-and-paths.md) and [D74](../adr/D74-svg-assets.md)
  (vector shapes and SVG assets), [D75](../adr/D75-blend-modes-masks-and-mattes.md)
  (blend modes, masks, and mattes), [D76](../adr/D76-nested-compositions.md) and
  [D77](../adr/D77-elements.md) (definitions, instances, and Elements), and
  [D78](../adr/D78-custom-html-for-ai-authors.md) (Custom HTML for AI authors). The playground shows each of them in a showcase
  of its own ([D32](../adr/D32-playground-showcases.md)).

## 6. Edit from a model

- **Call:** offer `TOOL_CATALOGUE` (name, description, JSON Schema input) to
  the model, and run each call with `executeTool(session.bus, name, args)`, on
  the same bus as the UI. `describe_document` returns the IDs, types,
  lifetimes, layers, fields, and image sizes and changes nothing;
  `add_clip_transition_at_cut` puts a clip transition on a cut and
  `run_transaction` applies several calls, each as one undoable step;
  `check_custom_html` checks a Custom HTML element and, when the host lends
  `checkCustomHtml` of `@kadrion/producer`, renders it twice.
- **What a model is expected to call:** the fixture of ten common requests
  ([`tests/app/fixtures/model-requests.json`](../../tests/app/fixtures/model-requests.json)),
  such as "animate this title letter by letter" or "put a push between these
  clips", names the calls for each and the document they must give; it is
  checked by `executeTool` on every run, and a host can use it to test its own
  prompts.
- **Errors:** the bus's `EditorError` codes; a refused call changes nothing.
- **Limits:** a tool never undoes or redoes; that stays with the host. Kadrion
  does not choose, prompt, or evaluate a model.
- **Authority:** [D09](../adr/D09-ai-edits-through-typed-domain-tools.md),
  [D31](../adr/D31-ai-tool-contract.md), [D46](../adr/D46-tool-catalogue-from-the-command-registry.md),
  [D66](../adr/D66-clip-transitions-in-the-canvas-frame.md), [D67](../adr/D67-easing-curves.md),
  [D68](../adr/D68-rotation-origin-and-more-animated-properties.md),
  [D78](../adr/D78-custom-html-for-ai-authors.md).

## 7. Undo, redo, and the history

- **Call:** `session.bus.undo()`, `session.bus.redo()`, and
  `session.getHistory()` (`canUndo`, `canRedo`, `undoDepth`, `redoDepth`);
  the session reports a `history` event on every change.
- **Errors:** `nothing-to-undo`, `nothing-to-redo`, `busy`.
- **Limits:** `historyLimit` (default 100; 0 keeps no history). A transaction
  is one step. An edit after an undo clears the redo stack.
- **Authority:** [D30](../adr/D30-command-bus-and-undo.md),
  [D38](../adr/D38-authoring-foundation.md), [D44](../adr/D44-host-facade-and-live-preview.md).

## 8. Follow playback

- **Call:** `session.seek(timeUs)`, `session.play()`, `session.pause()`,
  `session.setPlayRange({ startUs, endUs, loop })` or `null`, and the
  `playback` events of `session.subscribe`, whose state carries `status`,
  `timeUs`, `runtimeHash`, `error`, and `playRange`.
- **Statuses:** `ended` once per play that reached the end of the document or
  of the range; `waiting` while the frame or the sound due is not ready.
- **Errors:** `time-out-of-range`, `invalid-play-range` (not on the frame
  grid), `not-loaded`, `destroyed`.
- **Limits:** playback rate 1 only; a seek is the only frame stepping.
- **Authority:** [D61](../adr/D61-player-playback-events.md),
  [D44](../adr/D44-host-facade-and-live-preview.md), [D13](../adr/D13-frame-grid-and-integer-frame-rate.md).

## 9. Save the document

- **Call:** `serializeComposition(session.bus.getDocument())` of
  `@kadrion/schema/migrate`; store `text` as the host's project version.
- **Errors:** `{ ok: false, errors }` for a document the validator refuses; an
  older document is refused, never migrated on save.
- **Limits:** the saved form is the composition as JSON, without an envelope;
  its identity is the composition hash, not the bytes of the text.
- **Authority:** [D43](../adr/D43-saved-compositions-and-compatibility.md),
  [D02](../adr/D02-kadrion-owns-composition-schema.md) (the host stores
  versions, Kadrion owns the schema).

## 10. Make a template and instantiate it

- **Call (editor):** the template commands on the bus, such as
  `AddTemplateInput`, `AddTemplateBinding`, `AddTemplateCondition`, and
  `AddTemplateRepeat`. A bound property holds its input's default.
- **Call (render):** `instantiateTemplate(template, values)` of
  `@kadrion/schema/template` on the parsed template, then render
  `result.composition`; `templateDefaults(template)` gives what an input left
  out takes.
- **Errors:** on the bus, `unknown-input`, `unknown-binding`, `input-in-use`,
  `binding-in-use`, and validation codes such as `binding-value-mismatch`; on
  instantiation, `invalid-values`, `unknown-input`, `invalid-input-value`,
  `repeat-limit`, and `invalid-composition`, each with its `inputId` and
  `path`. The Player and the Producer refuse a template itself with
  `invalid-document`.
- **Limits:** at most 100 000 IDs in the copies of all repeats.
- **Authority:** [D58](../adr/D58-templates-inputs-bindings-and-instantiation.md),
  [D59](../adr/D59-templates-conditions-and-repetition.md).

## 11. Set up the worker

- **Call:** `kadrion fetch-ffmpeg --dir <dir>` installs the pinned FFmpeg
  (it prints the paths of `ffmpeg` and `ffprobe` with their SHA-256), then
  `kadrion doctor` with `--ffmpeg` and `--ffprobe` or `KADRION_FFMPEG` and
  `KADRION_FFPROBE`.
- **Errors:** `download-failed`, `archive-hash-mismatch`, and the other
  `FFMPEG_INSTALL_ERROR_CODES` (exit 1); `doctor` exits 3 when the process is
  not the reference environment.
- **Limits:** only a render in the pinned image (Linux x64, the pinned
  Playwright and Chromium, the pinned FFmpeg, no network but loopback) is
  reference output; anywhere else the output is informative. `PATH` is never
  searched for FFmpeg.
- **Authority:** [D26](../adr/D26-pinned-render-environment.md),
  [D29](../adr/D29-mp4-export.md) (the pinned FFmpeg, D29.1),
  [D45](../adr/D45-delivering-packages-as-release-tarballs.md) (`fetch-ffmpeg`
  and `doctor`), [D06](../adr/D06-reference-producer.md).

## 12. Estimate a render

- **Call:** `kadrion estimate --composition <file> --assets <file> --preset <720p|1080p> [--samples <n>] [--budget-ms <ms>]`,
  or `estimatePlan` and a render of its range in the library. It renders and
  encodes a few frames, keeps none, and reports `msPerFrame`, `segments`, and
  `segmentsInBudget`. With the grid flags of section 13, `segments` counts the
  segments of that grid. (Proposed in D80; this guide links it once the owner
  accepts it.)
- **Errors and limits:** those of every job (section 16).
- **Authority:** [D48](../adr/D48-render-job-contract.md) (D48.5).

## 13. Render in jobs and join

- **Call:** `kadrion render-range … --preset <p> --from-us <t> --to-us <t>`
  for ranges of whole segments, in any order and in separate processes;
  `kadrion render-audio …` for the audio of the range; then
  `kadrion join --in <dir> … --out <dir>`, with exactly one audio directory.
  In the library: `renderSegments`, `renderAudio`, `joinSegments`.
- **Result:** the MP4 that one export of the same document and preset writes,
  byte for byte.
- **A fragment:** for a range whose ends are not boundaries of the
  composition's grid, give `render-range` the fragment's own grid:
  `--grid-from-us <t> --grid-to-us <t>` (the fragment) and
  `--min-segment-frames <n>` (0.5 s is 15 at 30 fps). Its segments start at
  the fragment's first frame, and a last one shorter than the minimum is
  merged into the one before it. Every job of the fragment gives the same
  grid flags and `--segment-frames`, and a range of whole segments of that
  grid, or no range for all of it; `render-audio` takes the fragment's range; the join checks the
  grid. The frames, range, and audio are those of the same fragment in
  segments of one frame. Without these flags nothing changes. (Proposed in
  D80; this guide links it once the owner accepts it.)
- **Errors:** `range-invalid` (an end not on the segment grid),
  `segment-length-invalid`, `join-invalid` (parts that are not one render, or
  a gap), `preset-unsupported` (a preset that would upscale or gives odd
  sizes), `source-range-exceeded`, `asset-changed` (a file read by path
  changed during the job), and the asset and FFmpeg errors.
- **Limits:** segments of `--segment-frames` frames, 60 by default; the
  `--assets` map gives each asset `{ path, mediaType }`, and video and audio
  are read by path, never held in memory.
- **Authority:** [D47](../adr/D47-segmented-rendering-join-and-stills.md),
  [D29](../adr/D29-mp4-export.md), [D07](../adr/D07-h264-mp4-720p-1080p-output.md),
  [D52](../adr/D52-audio-clips-volume-fades-and-the-mix.md) (the mix),
  [D64](../adr/D64-video-and-audio-read-by-path.md) (media by path).

## 14. Export in one pass

- **Call:** `kadrion export --composition <file> --assets <file> --out <dir> --preset <720p|1080p>`,
  or `exportMp4` in the library. It writes `video-<preset>.mp4` and its render
  manifest and keeps no intermediate frames.
- **Errors:** as in section 13, plus `encode-failed`, `ffmpeg-missing`, and
  `ffmpeg-mismatch`. A failed export removes its partial output.
- **Authority:** [D29](../adr/D29-mp4-export.md),
  [D47](../adr/D47-segmented-rendering-join-and-stills.md).

## 15. Render a still

- **Call:** `kadrion render-still … --time-us <t> --format <png|jpeg|webp>`,
  or `renderStill`; `render-frames` and `renderFrames` render PNG frames at
  given times.
- **Errors:** `frame-out-of-range` (a time not on the frame grid or past the
  end), `still-format-unsupported`. PNG needs no FFmpeg unless the document
  has video nodes.
- **Authority:** [D47](../adr/D47-segmented-rendering-join-and-stills.md),
  [D28](../adr/D28-producer-frame-capture.md).

## 16. Run, limit, and cancel jobs

- **Standard output:** JSON lines only: `start`, `frame`, `segment`, `file`,
  and last one `done` or `error`. Diagnostics go to standard error. Every file
  is written under a temporary name and renamed when complete.
- **Exit codes:** 0 success, 1 an error of the Producer or the FFmpeg
  installation, 2 usage, 4 an exceeded limit (`limit-exceeded`), 5 cancelled,
  6 `migrate --check` found a document that is not current.
- **Limits:** `--max-document-bytes`, `--max-duration-us`, `--max-frames`,
  `--max-assets`, `--max-asset-bytes`, and `--max-total-asset-bytes` are
  checked before rendering; `--max-wall-ms` cancels the job when its time is
  up. In the library, every job takes `signal`, `onProgress`, and `limits`.
- **Cancellation:** `SIGTERM` or `SIGINT` stops Chromium and FFmpeg, removes
  what the job wrote, and exits 5.
- **Authority:** [D48](../adr/D48-render-job-contract.md).

## What this guide does not cover

A REST service, a queue, storage, permissions, or anything of a specific host:
these belong to the host ([D01](../adr/D01-engine-sdk-not-application.md),
[`AGENTS.md`](../../AGENTS.md)). Waveforms and thumbnails for a timeline, a
playback rate other than 1, and Custom HTML isolation in browsers other than
Chromium are not part of the engine yet ([phase four](../roadmap/phase-4.md#debts-carried-into-this-phase)).
