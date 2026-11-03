# Phase four: a host integrates the engine

- Status: Accepted as a direction by the project owner on 2026-11-03 (PR-36,
  merged as PR #36), with every recommendation of the questions at the end.
  Accepting this roadmap approves no pull request: each one below has its own
  plan, review, and decisions, and its ADR is accepted on its own.
- Starting point: `main` at `c0d7120`. Phase three is complete (PR-23 to
  PR-34b, D44 to D59), schema `0.9`, 62 AI tools, Q14 closed by the evidence of
  the push run of `bde9bb9` (PR #35).
- Authority: `AGENTS.md` and the ADRs in [`docs/adr`](../adr/README.md). This
  document plans; it decides nothing that needs an ADR. Every decision it names
  is a proposal for an ADR from D60 upwards, which only the owner accepts.
- Predecessor: [phase three](phase-3.md).

## Goal

Make the engine of phase three ready for its first host to build on: close the
debts carried since the spike, give the host the few contracts it still lacks
around an editor (the Player's playback events, image facts, video read from
the host's storage without a copy, migration as a command), freeze and
document the public surface the host compiles against, and prove the whole
host flow on the released tarballs, outside the workspace.

Kadrion stays an engine (D01) and owns the schema (D02). The first host is the
Studio module of Taskio; nothing in this repository names it, depends on it,
or knows its queue, its storage, its tenants, or its domain objects. Where this
document says "the host", it means any application that embeds Kadrion. This
phase adds no node type, no timeline feature, and no render mode beyond what
is named below.

## What the deferred items are now (read on 2026-11-02)

The items deferred through phases two and three, checked against `main`. Two
of them are already closed and need no pull request; the plan records that so
that no later document carries them as debts.

| Item                                  | State on `main`                                                                                                                                                                                                                      | Pull request       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `fit` of an image                     | Closed by D50: `0.3` made `fit` (`fill`, `contain`, `cover`) a required field of every image and video, and `SetNodeFit` edits it. Open: the host cannot learn an image's size, and `cover` cannot choose which part stays in frame. | PR-39a, PR-39b     |
| `audioPlan` in the Producer           | Closed by D52.4: the end of a clip is cut by subtraction only, the Producer and the Player share the plan of `@kadrion/schema`, and the untyped `RangeError` beyond 2^53 − 1 is gone.                                                | — (recorded here)  |
| The Player's events                   | Partly closed by D44: `Player.subscribe` reports `status`, `timeUs`, and `error`. Open: the end of playback, a loop or play range, waiting for media, and which asset failed.                                                        | PR-38              |
| Video delivery by path                | Open (D50.5, D51.2): the Producer is given the bytes and writes a private copy for FFmpeg.                                                                                                                                           | PR-40              |
| A `migrate` command of the CLI        | Open (D43): `parseComposition` migrates in a library call only.                                                                                                                                                                      | PR-41              |
| Playground showcases                  | Open (D32): four showcases of the spike, no showcase of video, audio, scenes, transitions, captions, or templates, and the check in Chromium is manual and unrecorded.                                                               | PR-42              |
| Renaming `NodeData`                   | Open (D42, D43): `NodeData` of `@kadrion/editor-sdk` types nodes, animations, keyframes, and clips alike.                                                                                                                            | PR-37              |
| Custom HTML isolation beyond Chromium | Open (D36, option E). Stays deferred: the first host previews in Chromium-based browsers, and the Producer is the reference.                                                                                                         | — (still deferred) |
| The CI artifact for the Q14 evidence  | Closed in practice (PR #35): the cloud environment may now download it; the procedure of the first CI run is unchanged.                                                                                                              | — (recorded here)  |

## What the host integration still needs

Beyond the deferred items, the first host meets three gaps that no ADR covers
yet. Each is stated here as a need; the pull request named decides it.

- **A stable surface.** The host compiles against the `.d.ts` of the
  packages. Nothing in the repository shows when a pull request changes that
  surface, so a breaking change can land as a side effect (PR-37).
- **A tested host flow.** The release smoke test of D45 installs the tarballs
  and renders one frame. No test runs the flow a host editor runs: open a
  saved document, migrate it, edit it through the session and the AI tools,
  save it, instantiate a template, render it as range jobs, join them, and
  render a still (PR-43).
- **A host guide.** The contracts a host needs are spread over 59 ADRs. A host
  needs one document that says, per task, which call to make, which errors to
  expect, and which ADR is the authority (PR-43).

## Rules for every pull request of this phase

The rules of [phase three](phase-3.md#rules-for-every-pull-request-of-this-phase)
hold unchanged: the rules of phase two (no skipped test, no repeated failed
run, no raised timeout without the owner's consent; the runtime build, the
schema version, the Player's dist tree, and the CI identity each with their
procedure), every new command with its tool, every new node or asset type with
the full extension set of `AGENTS.md`, generated media out of Git, one schema
version per schema change, and nothing for the host's domain.

As agreed with the owner on 2026-10-31, each pull request is started, pushed,
and opened without asking first; the owner reviews and merges, and its ADR is
marked Accepted in a short docs pull request after the merge. Pinned and
FFmpeg checks run locally in the pinned container before the push, not by
trying them in GitHub Actions (owner, 2026-10-30).

Added for this phase:

- **The public surface is reviewed.** From PR-37 on, a pull request that
  changes an exported type, function, or constant of a package changes the
  committed API report of that package in the same diff, and its description
  says whether the change is additive or breaking.
- **No behaviour without the host flow.** From PR-43 on, a pull request that
  changes a contract the host flow uses keeps the flow test green or changes
  it in the same diff.

## The pull requests, in order

The order puts the change of the public surface first, so the host compiles
against the final names, then the Player and asset contracts an editor UI
needs, then the worker side, then the developer aids, and the host flow last,
because it tests everything before it.

| Order | PR     | Subject                                            | Schema | Runtime build | Player dist | Q14    |
| ----: | ------ | -------------------------------------------------- | ------ | ------------- | ----------- | ------ |
|     1 | PR-37  | The public surface and the name of `NodeData`      | —      | —             | —           | —      |
|     2 | PR-38  | The Player's playback events                       | —      | —             | yes         | if any |
|     3 | PR-39a | Image facts                                        | —      | —             | yes         | if any |
|     4 | PR-39b | The focus point of `cover` (if question 4 is yes)  | `0.10` | yes           | yes         | yes    |
|     5 | PR-40  | Video and audio read by path in the Producer       | —      | —             | —           | yes    |
|     6 | PR-41  | `kadrion migrate`                                  | —      | —             | —           | —      |
|     7 | PR-42  | Showcases of phase three and their automated check | —      | —             | —           | if any |
|     8 | PR-43  | The host flow on released tarballs, and host guide | —      | —             | —           | —      |

"Q14 if any" means: only if the pull request turns out to touch one of the
items that reopen it (first-run.md). PR-36 is this document.

### PR-37 — The public surface and the name of `NodeData`

- **Goal:** the host compiles against names that will not change for naming
  reasons, and every later change of the surface is visible in review.
- **Scope:**
  - an API report per package: a committed text file generated from the
    package's built `.d.ts` (its exports, in a stable order, with their
    signatures), and a repository test that fails when the built surface and
    the report differ; `node --run api:update` writes the reports again;
  - `NodeData` of `@kadrion/editor-sdk` is renamed to the neutral name decided
    in D60. `DocumentObject`, which `document.ts` already uses for the same
    shape, is the candidate, so the package has one name for one type;
  - whether the old name stays as a deprecated alias for one release depends
    on question 2.
- **Decisions (D60):** what the report contains (exports only, or also
  members); whether it is generated by a dependency (API Extractor) or by a
  small script over the TypeScript compiler API already in the toolchain
  (D11); the name of the type; the rule that a breaking change of the report
  needs a minor version of the release (D45, versions `0.N.0`).
- **Packages and documents:** every package (reports only), `@kadrion/editor-sdk`
  (the rename), `@kadrion/ai-sdk` (its uses), tests, README, D60; D42 and D43,
  which name the debt, get a line that it is closed.
- **Acceptance:** the reports match the built surface of every package; the
  rename changes no emitted JavaScript except names, no document, and no tool
  of the catalogue (the snapshot of D46 stays byte for byte).
- **Impact:** none on Q14, the runtime hash, parity, or golden frames.
- **Not included:** semantic versioning tooling, changelogs generated from
  commits, a registry (D37.3).

### PR-38 — The Player's playback events

- **Goal:** a host's transport controls and playhead follow the Player without
  polling and without reading a clock of their own.
- **Scope (D61):** rows added to the table of events of D44.4, reported through
  `Player.subscribe` and the session alike:
  - **ended:** playback reached the last frame of the composition (or of the
    play range) and stopped; today the Player only becomes `ready`, so a host
    cannot tell an end from a pause;
  - **a play range and looping:** `Player.setPlayRange({ startUs, endUs,
loop })`, validated on the frame grid (D13); playback stays inside the range,
    and a loop restarts at its start with the audio rescheduled from the same
    sample rule as a seek (D53), so the loop point is exact in pixels and in
    sound;
  - **waiting:** a status `waiting` while a video frame or a decoded sound the
    next frame needs is not ready, so the host can show that playback is held
    rather than late; the frame shown is still only ever the document's frame;
  - **asset errors that name the asset:** an error of a failed asset carries
    the asset's `id` and `contentHash`, so the host can mark the clip in its
    timeline.
- **Decisions (D61):** whether the play range is Player state or a session
  option; whether `waiting` is a status or a separate event; how a loop
  interacts with `update` (D44.5) that shortens the composition below the
  range.
- **Packages and documents:** `@kadrion/player`, `@kadrion/editor-session`,
  README, D61; D44.4 gains its rows by amendment.
- **Acceptance:** every event is deterministic for the same operations and the
  same Player answers (D44.4); a loop of `n` passes presents the same frames
  as `n` plays of the range; `ended` is reported exactly once per play.
- **Tests:** unit tests of the state machine with an injected scheduler and
  audio clock; jsdom tests against the real render page; the audio graph of a
  loop in `OfflineAudioContext` against the Producer's mix of the range, as in
  D53.
- **Impact:** the Player's dist tree changes, so parity is measured again in
  the pinned environment. The runtime build stays byte for byte. Q14 reopens
  only if a pinned test file changes.
- **Not included:** a playback rate other than 1 (its audio would need
  resampling, which no ADR covers), frame stepping beyond `seek`, and any UI.

### PR-39a — Image facts

- **Goal:** the host knows an image's size before it places it, as it knows a
  video's size since D51.3, so it can offer "fit to frame" and keep an aspect
  ratio without decoding the image itself.
- **Scope (D62):** `session.readMediaFacts` returns
  `{ type: 'image', width, height }` for a verified image, read from the PNG,
  JPEG, or WebP header by a parser of Kadrion's own (no browser decode, so
  the facts are the same in the browser and in Node.js); the Producer reads
  the same facts with the same parser and reports a mismatch with the
  decoded image as an error; a media type the parser does not know is a typed
  error, not a guess.
- **Decisions (D62):** the header fields read (for JPEG, the first frame
  marker, and the EXIF orientation question: whether an orientation tag is
  refused, ignored as Chromium's `image-orientation` would apply it, or
  reported); whether the bus may check anything with image facts (for
  example nothing, since an image has no source range).
- **Packages and documents:** `@kadrion/editor-sdk` (the fact type),
  `@kadrion/editor-session`, `@kadrion/producer`, fixtures, D62; D49.6 gains
  the image row by amendment.
- **Acceptance:** for every image of the fixtures, the facts equal the size the
  pinned Chromium decodes; a truncated or mislabelled file is refused with a
  typed error naming the asset.
- **Impact:** the Player's dist tree changes only if the parser is bundled into
  it; if so, parity is measured again. Q14 reopens only if a pinned test file
  changes.

### PR-39b — The focus point of `cover` (if question 4 is yes)

- **Goal:** an image or video in `cover` keeps the part the user chose in
  frame, which `fit` alone cannot do: today `cover` always keeps the centre.
- **Scope (D63):** schema `0.10` adds `focus` `{ x, y }` to image and video
  nodes, integers in per mille of the source width and height (D15), mapped to
  `object-position` by the renderer and to the same crop in the Producer's
  video path; the step adds `focus: { x: 500, y: 500 }`, the centre, so every
  document renders byte for byte; a command `SetNodeFocus` and its tool.
- **Decisions (D63):** per mille or another integer unit; whether `focus` is
  animatable (a pan inside `cover`); its effect under `fill` and `contain`
  (none, or `contain`'s alignment).
- **Packages and documents:** schema (`0.10`), renderer-dom, editor-sdk,
  ai-sdk, fixtures, compatibility corpus, D63.
- **Acceptance:** the reference compositions render byte for byte after the
  step; golden frames of an off-centre focus for an image and a video.
- **Impact:** as a schema step of phase three: the runtime build changes,
  goldens and parity are measured again, Q14 reopens and closes by the
  evidence of its commit.
- **Not included:** free cropping to a rectangle, rotation of the source,
  masks.

### PR-40 — Video and audio read by path in the Producer

- **Goal:** a worker renders long or large media from the host's storage
  mounted read-only, without holding the bytes in memory and without a private
  copy per job.
- **Scope (D64):** the Producer's resolver may return `{ path, mediaType }` for
  a video or an audio asset, beside `{ bytes, mediaType }`, which stays valid.
  The Producer verifies the file's SHA-256 by streaming it before any use,
  checks the job limits of D48 against its size, and gives FFmpeg the
  verified file without copying it. The manifest records the delivery (bytes
  or path) without the path itself, so manifests of the two deliveries of the
  same bytes are equal.
- **Decisions (D64):** how the verified bytes stay the bytes FFmpeg reads
  (the file is opened once and FFmpeg reads the open descriptor, or the size
  and modification time are checked again after the render, or a hash is
  computed again after the render); whether images and fonts may come by path
  too (they are small and enter the page as bytes, so the recommendation is
  no); what a path outside an allowed root is.
- **Packages and documents:** `@kadrion/producer`, `@kadrion/cli` (the CLI's
  resolver reads paths from its asset map), README, D64; D50.5 and D52.5 are
  amended.
- **Acceptance:** every pinned video and audio test gives the same frames,
  WAV samples, and MP4 bytes with both deliveries; a file changed between
  verification and decode is refused, never rendered; no file is written
  besides the outputs of the job.
- **Tests:** unit tests of the verification and the limits; a pinned test of
  both deliveries over the second reference composition.
- **Impact:** a pinned test file changes, so Q14 reopens and closes by the
  evidence of its commit. No pixel, golden frame, or parity record changes;
  the Player is not touched (D51.2).
- **Not included:** object storage, HTTP sources, or signed URLs: the host
  mounts or downloads, the Producer reads a local file.

### PR-41 — `kadrion migrate`

- **Goal:** a host migrates stored documents in a batch job, and a developer
  checks a document's version, without writing code against
  `@kadrion/schema/migrate`.
- **Scope:** `kadrion migrate <input> [--out <file>] [--check]`, a thin command
  over `parseComposition` and `serializeComposition` (D43): it reads one
  document, reports the versions it passed through, and writes the current
  version; `--check` writes nothing and exits non-zero when the document is not
  current. It speaks the job contract of D48: JSON lines on stdout, the exit
  codes of D48, and no partial file on failure or on a signal.
- **Decisions:** none expected beyond an amendment of D43 that names the
  command; the pull request opens an ADR only if the review finds one.
- **Packages and documents:** `@kadrion/cli`, README, D43 and D48 amended.
- **Acceptance:** every document of the compatibility corpus migrates through
  the command to the same bytes as `serializeComposition(parseComposition(…))`;
  an invalid document gives the typed errors of `parseComposition` as JSON.
- **Impact:** none on Q14, the runtime hash, parity, or golden frames.
- **Not included:** migrating a directory or a database; the host loops.

### PR-42 — Showcases of phase three and their automated check

- **Goal:** every feature of phase three can be seen and tried in the
  playground, and the check of D32 that each showcase loads stops being a
  manual step that no record keeps.
- **Scope:** showcases for a video with `fit`, audio clips with fades, scenes
  in sequence with transitions, captions, a template previewed with its
  defaults and instantiated with values, and an AI tool call of each kind
  (D32.1); their media are generated by the committed recipes of the fixtures
  into a directory Git ignores, so no media enter Git; a Playwright test in
  `tests/app` that loads every showcase in Chromium, plays it, and checks that
  no error is reported (it replaces the manual check of D32 and its missing
  record).
- **Decisions:** whether the media of showcases are the test fixtures or
  their own recipes; D32 is amended, no new ADR is expected.
- **Packages and documents:** `apps/playground`, `tests/app`, README, D32
  amended.
- **Acceptance:** `tests/repo/showcases.test.ts` validates every showcase, and
  the new test loads each one without an error.
- **Impact:** the pinned editor test imports the playground's code, so Q14
  reopens only if that code or the pinned file changes; the reference
  compositions and their goldens are untouched.
- **Not included:** a timeline UI or any editor UI beyond what a showcase
  needs (D01).

### PR-43 — The host flow on released tarballs, and the host guide

- **Goal:** the flow a host editor runs is tested end to end on the tarballs of
  a release, and a host has one guide to it.
- **Scope:**
  - a test project in `tests/release` that installs the tarballs of a release
    by integrity, outside the workspace (D45), and runs: parse and migrate a
    saved `0.1` document; edit it through `editor-session` and through
    `executeTool` on the same bus; undo and redo; save it; instantiate a
    template with values; render it with `render-range` jobs and
    `render-audio`, `join` them, and compare the bytes with a one-pass export
    (D47); render a still; estimate the job (D48);
  - `docs/integration/host-guide.md`: per host task, the call, its errors, its
    limits, and the ADR that is the authority, in the order of the flow test;
  - the release of the phase (question 6).
- **Decisions:** none expected; the guide decides nothing and links every
  rule to its ADR.
- **Packages and documents:** `tests/release`, `.github/workflows/release.yml`
  if the flow joins the release smoke test, `docs/integration/host-guide.md`,
  README.
- **Acceptance:** the flow passes in the pinned image on the tarballs of the
  release candidate; every rule in the guide links an accepted ADR.
- **Impact:** none on Q14 as long as `ci.yml` stays byte for byte; the release
  workflow is a separate file (D45).
- **Not included:** an example host application, a REST service, or anything of
  Taskio (`AGENTS.md`).

## Impact on Q14, parity, and golden frames

- **Q14 reopens in PR-40**, and in PR-39b if question 4 is yes, each by the
  procedure of [the first CI run](../ci/first-run.md) and each closed again by
  the evidence of a green run of its commit. PR-38, PR-39a, and PR-42 reopen
  it only if they touch a pinned test file or a bound report.
- **The golden PNG files stay byte for byte** in every pull request; PR-39b
  adds golden frames of its own and changes the golden manifest only in the
  fields of D42.
- **Parity** is measured again in the pinned environment in PR-38, in PR-39a if
  its parser enters the Player, and in PR-39b. The gate of D34 (zero) holds for
  every pixel, video included (D51.6).
- **The runtime build** changes only in PR-39b.

## Debts carried into this phase

- From phase three: the playground showcases and their manual check (PR-42);
  a `migrate` command of the CLI (PR-41); renaming `NodeData` (PR-37);
  delivery of video by path (PR-40); the Player's events beyond D44 (PR-38).
- Closed before this phase and only recorded: `fit` of an image (D50), the
  `audioPlan` overflow in the Producer (D52.4), downloading the CI artifact by
  hand (PR #35).
- Still deferred: Custom HTML isolation in browsers other than Chromium (D36,
  option E); a playback rate other than 1; free cropping and masks; waveforms
  and thumbnails for a host's timeline (question 7).

## Questions for the owner, with recommendations

Answered by the owner on 2026-11-03: every question as recommended. Question
1 is carried out with the acceptance of this plan (`AGENTS.md` names phase
four as current); question 4 keeps PR-39b in the plan as schema `0.10`;
question 6 leaves the tag `v0.1.0` to the owner. The other answers are
directions for the ADRs named in them; each ADR is still accepted on its own.

1. **`AGENTS.md` for phase four.** It names phase three as current.
   Recommendation: on acceptance of this plan, "Current phase" names phase four
   and this document, with the same limits as phase three (no end-user
   editor, media platform, plugin ecosystem, render service, or Taskio
   integration); the excluded list is unchanged.
2. **The old name `NodeData`.** Recommendation: rename without an alias. No
   host has installed a release yet (no `v0.N.0` tag exists), so no host code
   breaks; an alias would be a second name to document and remove.
3. **The API report.** Recommendation: a small script over the TypeScript
   compiler API that is already a dev dependency, reporting exports with
   their signatures, rather than API Extractor, which adds a dependency and a
   configuration per package for features this repository does not use.
4. **The focus point of `cover`.** Recommendation: yes, as schema `0.10`. An
   editor's `cover` without it crops faces and text the user cannot recover;
   it is one small field, mapped to one CSS property and one crop in the
   Producer, and it is the last schema change this phase plans.
5. **Paths for images and fonts.** Recommendation: no; only video and audio
   come by path. Images and fonts enter the render page as bytes anyway
   (D27.3), and they are small.
6. **The release of the phase.** No tag exists yet: `v0.1.0` was planned for
   after PR-26 and never pushed. Recommendation: the owner pushes `v0.1.0` from
   the current `main` now, so the host can start on phase three, and `v0.2.0`
   after PR-43, whose flow test runs on its release candidate. Tags are
   pushed by the owner only (from the cloud, git may push only the working
   branch).
7. **Waveforms and video thumbnails for the host's timeline.**
   Recommendation: not in this phase. They are display data, not reference
   output, and the host can derive them from the bytes it already holds;
   if the host finds it needs Kadrion's decoders for them, a later pull
   request adds them to `editor-session` behind its own ADR.
