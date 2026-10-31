# Phase three: the engine under a video editor

- Status: Accepted as a direction by the project owner on 2026-10-30 (PR-35),
  with every recommendation of the questions at the end. Accepting this
  roadmap approves no pull request: each one below is approved separately,
  before it starts and again before its commit and push, with its own plan,
  review, and decisions.
- Starting point: `main` at `69b3adc` (PR-22, D43), Q14 closed. This plan first
  said that PR-23 existed as uncommitted work on the owner's machine; it did
  not (owner, 2026-10-31), and PR-23 was written from scratch.
- Authority: `AGENTS.md` and the ADRs in [`docs/adr`](../adr/README.md). This
  document plans; it decides nothing that needs an ADR. Every decision it names
  is a proposal for an ADR from D44 upwards, which only the owner accepts.
- Predecessor: [phase two](phase-2.md). PR-18 to PR-22 are done; PR-23, PR-24,
  and PR-25 move into this phase, changed as stated below.

## Goal

Make Kadrion the engine of a video editor that a host builds: a host can drive
one document through one facade, edit a film made of video, images, text,
audio, scenes, transitions, and captions with typed commands that the UI and
the AI share, render it in its own job queue as independent range jobs that
join into one MP4, render single frames, and turn a document into a template
that a pure function fills with values.

Kadrion stays an engine (D01) and owns the schema (D02). The first host is the
Studio module of Taskio; nothing in this repository names it, depends on it,
or knows its queue, its storage, its tenants, or its domain objects. Where this
document says "the host", it means any application that embeds Kadrion.

## What the host editor needs (owner, 2026-10-30)

The owner's input, in the owner's numbering, and where each item lands. The
mapping approves no scope.

| #   | Need                                                                                   | Pull request                      |
| --- | -------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | One facade for document, bus, Player, and assets; live preview; an event table         | PR-23 (carried over)              |
| 2   | Timeline commands: move, trim start and end, split, change layer, all exactly undone   | PR-31                             |
| 3   | Video as an asset and a node: source in and out, mute, volume, fit; frames in Producer | PR-28                             |
| 4   | Audio: playback in the Player, several clips, volume, fades, mixing in the Producer    | PR-29                             |
| 5   | Several scenes in sequence, each with a stable ID the host maps                        | PR-30                             |
| 6   | Editing basics: `fit` of images and video; transitions between clips or scenes         | `fit` in PR-28; transitions PR-32 |
| 7   | Captions with word timings and a caption style                                         | PR-33                             |
| 8   | Rendering in the host's queue: ranges, joining, single frames, idempotence, limits     | PR-25a, PR-25b                    |
| 9   | A composition as a template: inputs, bindings, conditions, repetition, instantiation   | PR-34a, PR-34b                    |
| 10  | AI tools derived from the command registry, on the same bus                            | PR-24, then every command PR      |
| 11  | Delivering the packages to the host without a registry (D37)                           | PR-26                             |

Outside this phase, as the owner stated: a timeline UI, the host application,
queues or a REST service, choosing AI models that generate clips, and storing
versions of projects. The host does all of that.

## What the current repository fixes (read on 2026-10-30)

The plan starts from these facts; each is a constraint on a pull request below.

- **One scene, nodes with lifetimes.** Schema `0.2` has exactly one scene
  (`scenes`, `maxItems: 1`, D16); nodes carry `startUs` and `durationUs`
  (D42); groups do not nest; node types are `background`, `group`, `image`,
  `text`, and `custom-html`.
- **Assets.** An asset is `{ id, type, contentHash }` with `type` in `image`,
  `audio`, `font` (D14). The document carries no media metadata, so the size
  of an image or the length of a clip is known only from the bytes.
- **Audio.** At most one audio clip, played from the start of its asset, no
  source offset, no volume (D16, D29.6). The Producer muxes it; the Player
  plays no audio, and the render page's policy has no `media-src` (D25.2).
- **Producer.** One render is one page and every frame in order (D28.4);
  `exportMp4` encodes the whole grid in one FFmpeg process with
  `-threads 1` (D29.3, D29.4); the asset bytes reach FFmpeg on a pipe (D29.6),
  and an MP4 with its index at the end cannot be read there. Output is H.264
  MP4 in the presets `1080p` and `720p` only (D07, D29.5).
- **Commands.** 24 commands in a closed registry (D38.1): structure, properties,
  assets, animations, keyframes, and `SetNodeLifetime`. Every one exports a
  closed argument schema (D31.2, D38.11), but `ai-sdk` has one tool,
  `set_node_position` (D31).
- **Player.** Each `load` remounts the page and seeks to 0, and the Player has
  no events (phase two, debts). PR-23 addresses both.
- **Packages.** Every package is `"private": true` and `"license":
"UNLICENSED"`, with `exports` pointing at `dist`, and nothing is published
  (D37.3). The package list is pinned to `AGENTS.md` (D12).
- **Scope lines of `AGENTS.md`.** "Full timeline UI, advanced trimming, color
  grading, filters, or transitions" were listed outside the current scope, and
  the current phase was phase two. Transitions (item 6) and trimming (item 2)
  therefore needed the owner to change `AGENTS.md` first (question 1); PR-35
  makes that change on the owner's decision of 2026-10-30.

## Rules for every pull request of this phase

The rules of [phase two](phase-2.md#rules-for-every-pull-request-of-this-phase)
hold unchanged:

- the owner approves each pull request before it starts, and again before its
  commit and push;
- no test is skipped, no failed run is repeated, and no timeout is raised
  without the owner's prior consent;
- a change of the schema, the runtime, or the DOM renderer changes the runtime
  build, reopens Q14 by the procedure of [the first CI run](../ci/first-run.md),
  and needs the controlled pinned bootstrap; a change of the schema version
  changes exactly `render.schemaVersion`, `render.compositionHash`, and
  `render.runtime.contentHash` of the golden manifest, each predicted on the
  host before the run (D42);
- a change of the Player's dist tree needs a parity record measured again in
  the pinned environment;
- a change of `.github/workflows/ci.yml`, of the golden manifest or its
  timestamps, of the pinned test files, of the pinned image or FFmpeg, or of
  the reports the CI identity binds reopens Q14 (first-run.md).

Added for this phase:

- **Every new command carries its tool.** A pull request that adds a command
  also adds its argument schema, its tool description, and the differential
  test between tool and command (D31.9). From PR-24 on, a command without AI
  metadata does not compile.
- **Every new node or asset type carries the full extension set** of
  `AGENTS.md`: a type manifest (its schema), a property schema, a runtime
  implementation, editor metadata (its commands), AI metadata (its tools), and
  reference tests.
- **Generated media stay out of Git.** Video and audio fixtures are generated
  in the pinned container by the pinned FFmpeg from a committed recipe (for
  example `testsrc2` and `sine` with fixed arguments), and their SHA-256 is
  committed and checked, as the image and font bytes of the fixtures are
  today.
- **One schema version per schema change** (D35.1). Each schema pull request
  brings its step, its hand-written pair before and after, its corpus entries
  (D43), and the reference composition carried forward.
- **Nothing for the host's domain.** No field, name, or command refers to a
  Studio, a Workflow, a Variable, a tenant, or a project; the names are
  Kadrion's own (template, input, binding, scene).

## The pull requests, in order

The owner proposed: delivery → facade → range render → video → audio → scenes
→ timeline commands → editing basics → captions → templates, with AI tools
growing alongside. The order below keeps that sequence with four changes, each
explained where it happens:

1. PR-23 (the facade) comes before delivery, because a delivered package
   without the facade would give the host the API it is about to replace.
2. PR-24 (the tool catalogue) moves before the first new command, so that
   "AI tools grow with every command" has a generator to grow from.
3. A design-only ADR of the timeline model (PR-27) precedes the first schema
   change, so that video, audio, scenes, transitions, and captions fit one
   model and seven schema versions do not each redesign the last.
4. `fit` joins the video pull request, which needs it anyway.

| Order | PR     | Subject                                    | Schema | Runtime build | Player dist | Q14    |
| ----: | ------ | ------------------------------------------ | ------ | ------------- | ----------- | ------ |
|     1 | PR-23  | Host facade and live preview               | —      | if changed    | yes         | if any |
|     2 | PR-26  | Delivering the packages                    | —      | —             | —           | —      |
|     3 | PR-24  | Tool catalogue from the registry           | —      | —             | —           | —      |
|     4 | PR-25a | Range, segment, join, and still renders    | —      | —             | —           | yes    |
|     5 | PR-25b | The render job contract                    | —      | —             | —           | if any |
|     6 | PR-27  | The timeline model (ADR only)              | —      | —             | —           | —      |
|     7 | PR-28  | Video, and `fit` of images and video       | `0.3`  | yes           | yes         | yes    |
|     8 | PR-29  | Audio: clips, gain, fades, mix, playback   | `0.4`  | yes           | yes         | yes    |
|     9 | PR-30  | Scenes in sequence                         | `0.5`  | yes           | yes         | yes    |
|    10 | PR-31  | Timeline commands                          | —      | —             | —           | —      |
|    11 | PR-32  | Transitions                                | `0.6`  | yes           | yes         | yes    |
|    12 | PR-33  | Captions                                   | `0.7`  | yes           | yes         | yes    |
|    13 | PR-34a | Templates: inputs, bindings, instantiation | `0.8`  | yes           | yes         | yes    |
|    14 | PR-34b | Templates: conditions and repetition       | `0.9`  | yes           | yes         | yes    |

"Q14 if any" means: only if the pull request turns out to touch one of the
items that reopen it. PR-35 is this document.

### PR-23 — Host facade and live preview (carried over from phase two)

- Status: written from scratch in this phase, together with its ADR D44
  (Proposed). An earlier version of this plan said it existed as uncommitted
  work on the owner's machine; that was wrong (owner, 2026-10-31).
- **What changes from phase two:** the scope stays; it is checked against
  Studio item 1. The event table covers the four kinds the host needs:
  document changes, history (can undo, can redo, depths), playback time, and
  errors, because every later feature (audio playback, video frames) reports
  through the same table.
- **Goal:** a host editor drives Kadrion through one facade.
- **Scope:** the facade joining document, command bus, Player, and asset
  resolver; `Player.update`, which brings an edit to the preview in the same
  page, at the time shown, in one request and without asking again for
  verified assets (it still mounts the tree again: D44.5); `Player.subscribe`;
  the history depths of a bus change; the event table.
- **Packages and documents:** `@kadrion/editor-session` (new: `AGENTS.md`
  package list, D12 map, workspace structure test), `@kadrion/player`,
  `@kadrion/editor-sdk`, README, D44, amendments of D12, D25, and D38.
- **Acceptance:** an edit reaches the preview without a new page and keeps the
  current time; an edit made through the facade is an edit of the one bus;
  every event is deterministic and reads no clock except the playback time the
  Player owns; the runtime build stays byte for byte.
- **Tests:** unit tests of the facade and the event table; jsdom tests of
  `Player.update` and `Player.subscribe` against the real render page; parity
  measured again.
- **Impact:** the Player's dist tree changes, so parity is measured again in
  the pinned environment. The runtime build and the pinned test files do not
  change, so Q14 stays closed; the golden PNG files stay byte for byte.
- **Moved to PR-25a:** the playground on the session and a pinned Player test
  of an update. The pinned editor test imports the playground's code, so the
  move reopens Q14, which PR-25a reopens in any case.
- **Not included:** a timeline UI; audio and video in the Player (PR-28,
  PR-29).

### PR-26 — Delivering the packages

- **Goal:** the host installs exact, verifiable builds of Kadrion in the
  browser and on its queue worker without a package registry (D37.3).
- **Need:** the browser side needs `@kadrion/editor-session`, `@kadrion/player`
  with the runtime artifact of `@kadrion/renderer-dom`, `@kadrion/editor-sdk`,
  `@kadrion/ai-sdk`, and `@kadrion/schema`; the worker needs
  `@kadrion/producer`, `@kadrion/cli`, the pinned Chromium (the image of D26),
  and the pinned FFmpeg (D29.1).
- **Proposed decision (D45), to be decided in its ADR:** a tag `v0.N.0` builds,
  in a release workflow separate from `ci.yml`, one `pnpm pack` tarball per
  package (the `workspace:` ranges become the exact versions of the same
  release), a manifest with the SHA-256 of every tarball, the runtime hash, the
  schema version, the image digest, and the FFmpeg pins, and attaches them to a
  GitHub release. The host pins each tarball by URL and integrity in its own
  lockfile, or vendors the tarballs; either way it installs the exact bytes the
  manifest names. Packages stay `"private": true` and `"UNLICENSED"`; `pnpm
pack` does not publish.
- **Alternatives for the ADR:** a Git dependency on a tag (fails: the packages
  are workspace members with `workspace:` ranges and need a build, so a Git
  install of a subdirectory gets neither); GitHub Packages (a registry, which
  D37.3 excludes without a new ADR); a submodule built by the host (the host
  would run Kadrion's build and pins).
- **The worker:** Kadrion does not ship an image and does not redistribute
  FFmpeg (D29.2, D37.4). It documents the one environment in which output is
  reference output (the image of D26 by digest, FFmpeg by SHA-256,
  `--network none`), ships the fetch-and-verify step as a CLI command
  (`kadrion fetch-ffmpeg`) instead of a test script, and adds `kadrion doctor`,
  which reports in JSON whether the current process is that environment. A
  host that builds its own worker image with FFmpeg inside makes a
  distribution decision of its own, with the GPL obligations of D29.2.
- **Versions:** each release states the schema version it validates and the
  versions its migration accepts (D43), so the host knows when stored
  documents need `parseComposition`.
- **Packages and documents:** release workflow, `package.json` versions, CLI,
  README, D45.
- **Acceptance:** a clean project outside the workspace installs the tarballs
  of one release by integrity and runs a smoke test in Node (validate,
  dispatch, render one frame in the pinned image) and a bundler build of the
  browser packages; the manifest's hashes match the attached files.
- **Tests:** a repository test that every package is packable and its tarball
  contains only `dist` and `package.json`; the install smoke test in the
  release workflow.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames, as long
  as `ci.yml` stays byte for byte; the release workflow is a separate file.
- **Not included:** publishing to any registry; a licence (D37.4); a Docker
  image.

### PR-24 — The tool catalogue (carried over from phase two)

- **What changes from phase two:** it moves before the new commands, and it
  becomes a generator plus a rule rather than a fixed set of tools. The tools
  for the commands of PR-28 to PR-34 are added by those pull requests.
- **Goal:** the AI can do exactly what the UI can do, through the same bus
  (D09, D31.5), and the model understands each tool.
- **Scope:** every registry entry of `editor-sdk` gains AI metadata: a tool
  name (`snake_case` of the command), a description written for a model (what
  it changes, units such as microseconds and pixels, what it refuses, an
  example), and its closed argument schema (D31.2). `ai-sdk` derives the
  catalogue from the registry, so a command without metadata fails
  compilation, and executes a tool as one `dispatch` on the host's bus
  (D31.4). Two additions for a model that cannot see the canvas: a read-only
  tool that describes the document (IDs, types, lifetimes, z-order, assets),
  which reads and never writes; and a transaction tool that applies several
  tool calls as one history entry, the same transaction of D38.4.
- **Packages and documents:** `@kadrion/editor-sdk`, `@kadrion/ai-sdk`, tests,
  README, D46 (extends D31).
- **Acceptance:** for every command, the tool and the command give the same
  document byte for byte; a refused call leaves the document and the history
  untouched; the catalogue is deterministic (same order, same text) and
  validates as JSON Schema.
- **Tests:** the differential test of D31.9 over all 24 commands, a test that
  the catalogue covers `COMMAND_TYPES` exactly, mutation tests.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames.
- **Not included:** a language model, prompts, or a conversational agent.

### PR-25a — Range, segment, join, and still renders (carried over from phase two, changed)

- **Carried over from PR-23:** the playground on `@kadrion/editor-session` and
  a pinned Player test of `Player.update`. The pinned editor test imports the
  playground's code, so this reopens Q14, which this pull request reopens in
  any case.

- **What changes from phase two:** PR-25 planned a job model with a minimal
  hosting application (`apps/worker`). The host runs its own queue: a render is
  split into range jobs of one batch, and the last job joins the result. So
  Kadrion delivers a library and CLI commands, not a service and not an
  application; `apps/worker` is dropped. PR-25 splits into PR-25a (what is
  rendered) and PR-25b (how a job behaves).
- **Goal:** a host renders any range of a composition in an independent job,
  joins the ranges into the same MP4 that one job would produce, and renders
  single frames.
- **The canonical segment grid (D47, to be decided):** H.264 output is defined
  as a sequence of segments of a fixed number of frames on the composition's
  frame grid, each encoded by its own FFmpeg process with the same arguments,
  starting with an IDR frame, closing its GOP, and depending on no other
  segment. A render job takes a range of whole segments. Because one-pass
  export is then the same segments in one process, a joined render and a
  one-pass render are the same bytes, not merely the same frames; idempotence
  and parity follow from D29's determinism instead of being measured
  approximately. The segment length is part of the export settings and of the
  manifest. Two ways of joining are measured in the pinned container before
  the ADR is accepted: MP4 segments through FFmpeg's concat demuxer with stream
  copy, and elementary H.264 segments joined by bytes and muxed once. The ADR
  takes the one that passes the self-check of D29.3 (frame count and
  presentation times `index × 512`) and the byte-identity test.
- **Audio is a pass of its own.** The mix of the whole composition is rendered
  once to a lossless intermediate and encoded to AAC once, in the joining step,
  so that no AAC priming or padding falls on a segment boundary. This needs
  no browser and is cheap; it is the place PR-29 extends.
- **Library and CLI:**
  - `renderSegments(range)` and `kadrion render-range --from-us --to-us`: the
    range must lie on segment boundaries (else a typed error before the page
    opens); writes one file per segment and a range manifest;
  - `renderAudio()` and `kadrion render-audio`: the mix of the whole
    composition;
  - `joinSegments()` and `kadrion join`: checks that the manifests cover the
    whole grid without gap or overlap, share one `compositionHash`, runtime
    hash, preset, segment length, and FFmpeg pins, then joins video and audio
    into the final MP4 with `+faststart`, and runs the self-check of D29.3;
  - `renderStill()` and `kadrion render-still --time-us --format png|jpeg|webp`:
    one grid time; PNG is the captured bytes, JPEG and WebP are encoded by the
    pinned FFmpeg with fixed quality settings named in the manifest;
  - a preview of a range is `render-range` plus `render-audio` of that range
    joined at the `720p` preset; it is not a separate code path.
- **Idempotence:** every output is a pure function of the document's
  `compositionHash`, the range, the settings, the runtime hash, and the pins.
  Files are written under a temporary name and renamed when complete, so a
  retried job either finds the finished file with the expected hash or writes
  it again. Manifests hold no wall-clock value (D28.7).
- **Packages and documents:** `@kadrion/producer`, `@kadrion/cli`, pinned
  tests, D47, an additive amendment of D07 (still images as an output) and of
  D29 (segments, the audio pass).
- **Acceptance:** the join of segment jobs rendered in any order and in
  separate processes equals the one-pass export byte for byte, at both presets;
  the PNG hashes of the frames FFmpeg read are identical in both; a range that
  is not on the segment grid is refused before rendering; a still frame equals
  the golden frame of its time.
- **Tests:** unit tests of ranges, segment arithmetic, and manifest checks
  (gaps, overlaps, foreign hashes); pinned tests of the byte identity, the
  self-check, and still frames.
- **Impact:** new pinned tests and possibly new reports of the pinned run, so
  Q14 reopens and closes again by the evidence of a green run; golden frames
  and parity are unchanged; the one-pass MP4 changes its bytes once, because
  it becomes segmented (no MP4 is committed, so only the structural checks of
  D29.11 see it).
- **Not included:** progress, cancellation, and limits (PR-25b); video and
  audio sources (PR-28, PR-29).

### PR-25b — The render job contract

- **Goal:** each CLI command behaves as a well-defined job inside a host's
  queue.
- **Scope (D48, to be decided):**
  - progress as JSON lines on stdout, one object per line with a fixed set of
    keys (`event`, `frame`, `frames`, `segment`), and nothing else on stdout;
    diagnostics on stderr;
  - cancellation by `SIGTERM` or `SIGINT`: Chromium and FFmpeg are stopped,
    nothing partial remains under a final name, and the exit code says
    "cancelled"; a job killed without a signal leaves only files under the
    temporary name, which the next run of the same job replaces;
  - typed errors with a stable table of codes and exit codes (D28.8 extended:
    usage, render error, limit exceeded, cancelled);
  - limits, given by the host and checked before rendering where possible:
    document size, duration, frame count, number and size of assets, and wall
    time of the job (the CLI's clock, never the runtime's);
  - an estimate: `kadrion estimate` renders a few frames of the given
    composition and reports the measured time per frame and how many segments
    fit into a given time budget. It is advice for the host's batching and
    never influences any output.
- **Packages and documents:** `@kadrion/producer`, `@kadrion/cli`, D48.
- **Acceptance:** a cancelled job stops within a bounded time and leaves no
  output under a final name; every limit is a typed error with its exit code;
  the progress lines parse and are complete; the Producer keeps
  `--network none` (D28.9).
- **Tests:** unit tests of the CLI with a fake Producer; a pinned test of
  cancellation if one is needed (then Q14 reopens).
- **Impact:** none on the runtime hash, parity, or golden frames; Q14 only if a
  pinned test file or a bound report changes.
- **Not included:** a REST service, a queue, retries, a render farm.

### PR-27 — The timeline model (ADR only)

- **Goal:** one model for the features of PR-28 to PR-34, decided before the
  first of seven schema changes.
- **Decisions (D49), each with alternatives and a recommendation:**
  - **Clips are nodes.** A video is a node with a lifetime (D42) and a source
    range (`sourceStartUs`); an audio clip keeps its own list. Trimming the
    start of a clip moves `startUs` and `sourceStartUs` together; a split is
    two clips whose source ranges meet.
  - **No tracks in the schema.** The visual layer of a node is its z-order
    (`ReorderNode`); a host's timeline rows are a view the host derives and
    stores, not a document fact. Audio clips are mixed regardless of order.
    The alternative, explicit tracks with a no-overlap rule, is a UI rule that
    would enter the document.
  - **Scenes in sequence.** A composition is a sequence of scenes; each scene
    has a stable ID, a duration, and nodes whose times are local to the scene.
    The composition's duration is the sum of the scene durations minus the
    overlaps of transitions, so a host that maps scenes to its own shots edits
    one scene without moving the others.
  - **Transitions live on boundaries.** A transition between two scenes, or
    between two clips of the same layer, has a kind from a closed set and a
    duration during which both sides are evaluated; nothing else overlaps.
  - **The source frame of a video.** For a video node active at `t`, the source
    time is `sourceStartUs + (t − startUs)` (speed 1 only), and the frame shown
    is the last source frame whose presentation time is at or before it, with
    the source's time base converted in integer arithmetic like D13.
  - **Media metadata stays out of the document** (D14): durations, sizes, frame
    rates, and streams of a source are read from the bytes by the Producer and
    the Player, and a document whose clip exceeds its source is a typed error
    before the first frame, as D29.6 does for audio today.
  - **The schema versions** `0.3` to `0.9` of the table above, each one step.
- **Impact:** none; documentation only.

### PR-28 — Video, and `fit` of images and video

- **Goal:** a video file is an asset, a video node shows the right source frame
  at every time in both hosts, and images and videos fit their box.
- **Scope:** asset type `video`; node `video` with lifetime, transform, box,
  `sourceStartUs`, `fit`, `muted`, and `volume` (the last two act from PR-29
  on, but belong to the node now so that PR-29 needs no second node change; or
  they move to PR-29, to be decided in D50); `fit` (`fill`, `contain`, `cover`)
  on images and videos, mapped to `object-fit` in the renderer (D22).
- **One rendering path (D50, to be decided):** the renderer shows a video
  frame as an image the host supplies for `(assetId, source frame)`. The
  runtime computes which source frame each video node needs at `t`; the host
  provides its pixels. In the Producer the pinned FFmpeg decodes the frames in
  order, streaming, and hands each to the page before the frame is captured.
  In the Player the frames come from a browser decoder in the host window. The
  render page stays without `media-src` and plays no media; the runtime stays a
  function of `(composition, timeUs)` plus the supplied bytes, as with images
  today.
- **Parity:** the Producer is the reference. A browser decoder and FFmpeg
  convert YUV to RGB differently, so the Player's video pixels are not expected
  to be identical. Parity is measured first and recorded as in D33; the gate of
  D34 stays at zero for every pixel outside a video node, and a threshold for
  pixels inside one is a decision of its own, from that measurement (D34
  method). Within one host, frames stay byte-identical across seeks and
  repeats.
- **Asset delivery:** video bytes are too large for the pipes and memory of
  D29.6. The Producer reads a video from a path on a read-only mount and
  verifies its SHA-256 while it reads; the Player receives a `Blob` from the
  resolver and verifies it with an incremental SHA-256 before use. Both are
  amendments of the resolver contract (D25.4, D28) decided in D50.
- **Packages and documents:** `@kadrion/schema` (`0.3`, step, corpus),
  `@kadrion/runtime`, `@kadrion/renderer-dom`, `@kadrion/player`,
  `@kadrion/producer`, `@kadrion/editor-sdk` (`SetVideoAsset`,
  `SetVideoSource`, `SetNodeFit`), `@kadrion/ai-sdk` (their tools), fixtures,
  D50.
- **Acceptance:** the reference composition renders byte for byte as before
  after the step; a video fixture renders the expected source frame at every
  grid time, checked against frames FFmpeg decodes on its own; seeks in any
  order and repeats give the same pixels; a clip longer than its source, a
  missing or mismatched video, and an undecodable file are typed errors before
  the first frame.
- **Tests:** schema, migration, evaluation, rendering, Producer and Player
  pinned tests; a second reference composition with generated media (question 10) with golden frames of its own.
- **Impact:** schema version, runtime build, and Player dist change, so Q14
  reopens and the controlled bootstrap applies; the PNG files of the existing
  golden frames must stay byte for byte; a new golden set for the second
  reference composition changes what the Q14 evidence is checked against;
  parity is measured again, with the new video rows.
- **Not included:** speed changes, reverse playback, colour adjustments, audio
  of the video (PR-29).

### PR-29 — Audio: clips, gain, fades, mix, playback

- **Goal:** several sounds play in the Player and are mixed by the Producer
  the same way.
- **Scope:** any number of audio clips (relaxing `maxItems: 1`, D16); a source
  offset, a gain, and fade-in and fade-out durations per clip; the sound of
  video nodes with `muted` and `volume`; one pure audio plan, computed in
  `@kadrion/runtime` from the document (which samples of which source, at
  which gain, with which fade), used by both hosts. The Producer turns the plan
  into an FFmpeg graph with sample-exact positions (D29.6, integer sample rule)
  in the audio pass of PR-25a; the Player plays the plan with Web Audio in the
  host window, following its own clock, never inside the render page.
- **Numeric decisions (D51):** gain as an integer in a fixed unit (for example
  millibels) or as a number in `[0, 1]` (D15 states the types); fade shape
  (linear only, to start); what a clip past its source does (an error, as
  today).
- **Packages and documents:** `@kadrion/schema` (`0.4`), `@kadrion/runtime`,
  `@kadrion/player`, `@kadrion/producer`, `@kadrion/editor-sdk`
  (`AddAudioClip`, `RemoveAudioClip`, `SetClipGain`, `SetClipFades`,
  `SetClipSource`), `@kadrion/ai-sdk`, D51. The repair of the audio plan debt
  of phase two (an untyped `RangeError` beyond 2^53 − 1) lands here.
- **Acceptance:** the mix of a fixture equals a mix computed independently
  sample for sample, within the tolerance of D29.6 for AAC; the Player starts
  each clip within a stated tolerance of its time and stays in sync after
  seeks; muting and fades are exact in the Producer.
- **Impact:** schema version and runtime build change: Q14 reopens and the
  controlled bootstrap applies; golden PNG files unchanged; the Player's dist
  changes, so parity is measured again.
- **Not included:** effects, ducking, keyframed volume, audio waveforms for a UI.

### PR-30 — Scenes in sequence

- **Goal:** a film is a sequence of scenes, each with a stable ID that a host
  maps to its own shots.
- **Scope:** several scenes (relaxing `maxItems: 1`), each with a duration and
  scene-local times as decided in D49; the step `0.4 → 0.5` turns the one scene
  into a scene of the composition's duration; commands `AddScene`,
  `RemoveScene`, `DuplicateScene`, `ReorderScene`, `SetSceneDuration`, and
  moving a node between scenes; the evaluation maps composition time to a
  scene and its local time.
- **Packages and documents:** schema (`0.5`), runtime, renderer-dom,
  editor-sdk, ai-sdk, fixtures, D52; D16 is superseded in its one-scene rule.
- **Acceptance:** the reference composition renders byte for byte after the
  step; each scene renders alone as it does in the sequence; IDs survive every
  command and its inverse.
- **Impact:** as PR-29.
- **Not included:** transitions (PR-32), nested scenes, scene templates
  (PR-34b).

### PR-31 — Timeline commands

- **Goal:** the editing commands of a timeline, each exactly undone.
- **Scope:** `MoveClip` (a node or an audio clip to a new `startUs`),
  `TrimClipStart` (moves `startUs` and `sourceStartUs` together, keeping the
  end), `TrimClipEnd`, `SplitClip` at a time (two clips whose source ranges
  meet; the host supplies the new ID, D39), and moving a node to another layer
  (`ReorderNode` exists; a host's row maps to an index) or another scene. A
  split of a node with animations states where each keyframe goes. All within
  the model of D49; no schema change.
- **Packages and documents:** `@kadrion/editor-sdk`, `@kadrion/ai-sdk`, D53.
- **Acceptance:** each inverse restores the document byte for byte; a split
  followed by its inverse is the identity; no command leaves a clip outside
  its source or a dangling reference; rendering a split clip gives the same
  frames as the unsplit one.
- **Tests:** unit, differential, property tests of the history, mutation tests;
  a pinned check of the split frames only if a unit test cannot show it.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames.
- **Not included:** ripple edits across layers, snapping, multi-select.
  Ripple and snapping are UI behaviours the host can build from these commands
  in a transaction.

### PR-32 — Transitions

- **Goal:** a transition between two scenes or two clips of one layer.
- **Scope:** a closed set of kinds to start (for example `crossfade`,
  `fade-through-color`, `slide`, `wipe`), each a pure function of progress in
  integer or fixed-point arithmetic (D18); its duration and place as decided in
  D49; commands to add, remove, and change one.
- **Packages and documents:** schema (`0.6`), runtime, renderer-dom,
  editor-sdk, ai-sdk, D54.
- **Acceptance:** at progress 0 and 1 the frames equal the frames without the
  transition; golden frames of the second reference composition in the middle
  of each kind.
- **Impact:** as PR-29, with new golden frames.
- **Not included:** custom shaders, Canvas/WebGL (D03).

### PR-33 — Captions

- **Goal:** captions from a transcription with word timings and a style.
- **Scope:** a node `captions` with a font asset, a style (size, colours,
  position, the highlight of the current word, lines and their breaking), and
  a list of words with `startUs` and `durationUs`; grouping of words into
  lines and pages is a pure function of the document; commands to replace the
  words, edit one word, and change the style.
- **Decisions (D55):** whether line breaking is computed by the runtime
  (deterministic, without measuring text) or by the browser (measured text,
  pinned fonts, D27); the first keeps the runtime free of layout, the second
  wraps naturally.
- **Packages and documents:** schema (`0.7`), runtime, renderer-dom,
  editor-sdk, ai-sdk, fixtures, D55.
- **Acceptance:** the active word and line at every time follow from the word
  timings alone; golden frames with highlighted words.
- **Impact:** as PR-29, with new golden frames.
- **Not included:** transcription itself (the host's), translation, animated
  word effects beyond the highlight.

### PR-34a — Templates: inputs, bindings, instantiation

- **Goal:** a document becomes a template with declared inputs, and a pure
  function makes a composition from it and a set of values.
- **Scope (D56):** a template section in the document with inputs (text,
  number, boolean, colour, image, video, audio asset, and a list of objects of
  those types), each with a stable ID, a type, constraints, and a default;
  bindings from node properties to inputs (a whole property, or text with
  placeholders, without an expression language); `instantiateTemplate(template,
values)`, pure and deterministic, which validates the values against the
  inputs, applies them, removes the template section, and validates the result
  as a composition. Asset values carry `contentHash` like any asset (D14).
  The template is edited with the same commands as a composition, plus
  commands for inputs and bindings. The Player previews a template as its
  instantiation with the defaults.
- **Packages and documents:** schema (`0.8`, the template section and
  instantiation, possibly as an entry point `@kadrion/schema/template` like
  `migrate`), editor-sdk, ai-sdk, editor-session (preview), fixtures, D56.
- **Acceptance:** instantiation is total over valid values and refuses invalid
  ones with typed errors naming the input; the same template and values give
  the same `compositionHash`; a template without inputs instantiates to
  itself without the section.
- **Impact:** as PR-29.

### PR-34b — Templates: conditions and repetition

- **Goal:** parts of a template appear only when a condition holds, and a node
  or scene repeats for each item of a list.
- **Scope:** a condition on a node or scene from a closed set of predicates on
  inputs (empty, not empty, equal, true); repetition of a node or a scene for
  each item of a list input, with item fields bound like inputs and the times
  of the repeats computed by a stated rule (a scene's duration per item, or a
  duration from a numeric field of the item); every ID of a repeat derived
  injectively from the template ID and the index (as D39 does for copies).
- **Packages and documents:** schema (`0.9`), editor-sdk, ai-sdk, D57.
- **Acceptance:** a list of `n` items gives `n` repeats with distinct,
  predictable IDs and contiguous times; a false condition removes the element
  and every reference to it; limits on the number of repeats are typed errors.
- **Impact:** as PR-29.

## Impact on Q14, parity, and golden frames

- **Eight pull requests reopen Q14** (PR-25a and PR-28 to PR-34b, except PR-31),
  each by the procedure of [the first CI run](../ci/first-run.md) and each
  closed again by the evidence of a green run of its commit. PR-23 and PR-25b
  do so only if they touch a pinned test file or a bound report.
- **The golden PNG files of the reference composition stay byte for byte**
  through every schema step: each step's acceptance requires it, and the
  manifest changes only in the three fields of D42.
- **A second reference composition** (question 10) with generated video and
  audio, two scenes, a transition, and captions gets golden frames of its own,
  first in PR-28 and extended in PR-30, PR-32, and PR-33. Each extension
  changes the golden manifest and so what the Q14 evidence is checked against.
  The golden timestamps of the first reference stay as in `AGENTS.md`.
- **Parity** is measured again in the pinned environment in every pull request
  that changes the Player's dist tree. Pixels outside video nodes keep the gate
  of D34 (zero); pixels of video get the measurement-first threshold of D50.
  Audio is not pixels: its parity is a stated timing tolerance of the Player
  against the Producer's plan, not a gate of D34.
- **The MP4 bytes change once**, in PR-25a, when export becomes segmented; no
  MP4 is committed, so this touches only the structural checks.

## Debts carried into this phase

- From phase two: `audioPlan` beyond 2^53 − 1 (PR-29); `fit` of an image
  (PR-28); FFmpeg with `-threads 1` (unchanged per segment; parallel segment
  jobs in the host replace it); several scenes (PR-30); audio in the Player
  (PR-29); the Player's events (PR-23).
- Still deferred: the playground showcases and their manual checks (D32); a
  `migrate` command of the CLI (D43); renaming `NodeData`; Custom HTML
  isolation in browsers other than Chromium (D36, option E); downloading the
  CI artifact by hand for the Q14 evidence.

## Questions for the owner, with recommendations

Answered by the owner on 2026-10-30: every question as recommended. Question
1 is carried out by PR-35 itself (`AGENTS.md` names phase three as current and
no longer excludes transitions, and D03, which quotes that line, carries an
`Amended by` line); the package list gains
`@kadrion/editor-session` with PR-23. The other answers are directions for the
ADRs named in them; each ADR is still accepted on its own.

1. **`AGENTS.md` for phase three.** It names phase two as current and lists
   transitions and advanced trimming outside the scope. Recommendation: on
   acceptance of this plan, the owner changes "Current phase" to phase three
   and removes "transitions" from the excluded list, keeping "advanced
   trimming" (PR-31 is basic trimming), colour grading, and filters excluded;
   the package list gains `@kadrion/editor-session` with PR-23.
2. **The order: PR-23 before delivery.** Recommendation: yes, finish PR-23
   first; the facade is the API the host should receive. (Corrected
   2026-10-31: it was not written yet; the order stands.)
3. **How the host receives packages.** Recommendation: release tarballs of
   `pnpm pack` with a SHA-256 manifest on a GitHub release, pinned by the host
   by URL and integrity (D45). They are downloadable by anyone, like the code
   that is already visible (D37.1); if that is not acceptable, the host vendors
   tarballs built by the owner locally.
4. **A canonical segment grid for H.264.** Recommendation: yes; a joined
   render then equals a one-pass render byte for byte, which makes retries and
   parity exact. The cost is that one-pass export changes its bytes once and
   that range jobs start on segment boundaries (for example two seconds).
5. **Video parity in the Player.** Recommendation: measure first, keep the
   zero gate outside video nodes, and set a threshold for video pixels from the
   measurement (D50), with the Producer as the reference. The alternative,
   exact parity, would need the host to serve frames decoded by the pinned
   FFmpeg to the browser.
6. **Tracks.** Recommendation: no tracks in the schema; a layer is the
   z-order, and the host derives its timeline rows (D49).
7. **Scenes.** Recommendation: a sequence of scenes with local times and their
   own durations, the composition's duration derived from them (D49).
8. **Schema versions.** Recommendation: one version per schema pull request
   (D35.1), seven steps from `0.3` to `0.9`, each with its own controlled
   bootstrap and Q14 cycle. The alternative is fewer, larger pull requests; it
   saves bootstraps but makes each review and each migration larger.
9. **Templates.** Recommendation: a template is a composition with a template
   section, edited by the same commands, instantiated by a pure function in
   `@kadrion/schema` behind its own entry point; no expression language, only
   bindings, placeholders in text, a closed set of conditions, and repetition.
10. **A second reference composition with generated media.** Recommendation:
    yes, from PR-28 on, with media generated by the pinned FFmpeg from a
    committed recipe and checked by hash, so no media enter Git.
11. **Video bytes by path in the Producer, by `Blob` in the Player.**
    Recommendation: yes, each verified by SHA-256 while it is read (D50).
12. **Still images as output.** Recommendation: PNG, JPEG, and WebP by an
    additive amendment of D07 in PR-25a.
