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
  in the pinned container, as D80 did.
- **One function per rule, shared by both hosts.** The time map lives in
  `@kadrion/schema`, the stretch of sound in `@kadrion/runtime`; neither host
  computes either on its own (D82.1, D82.6).

## The pull requests, in order

The order puts the two pieces that can be measured without a schema change
first, so that the schema step only wires what is already proven.

| Order | PR    | Subject                                                 | Schema | Runtime build | Player dist | Q14 | Size |
| ----: | ----- | ------------------------------------------------------- | ------ | ------------- | ----------- | --- | ---- |
|     1 | PR-58 | D82 and this roadmap (documents only)                   | —      | —             | —           | —   | S    |
|     2 | PR-59 | The time map and the stretch of sound (library only)    | —      | no (checked)  | —           | —   | M    |
|     3 | PR-60 | Decoding backwards in the Player and the Producer       | —      | —             | yes         | yes | M    |
|     4 | PR-61 | Schema `0.24`: speed, freeze, and reverse in both hosts | `0.24` | yes           | yes         | yes | L    |
|     5 | PR-62 | Commands and tools: speed, reverse, and a freeze frame  | —      | —             | —           | —   | M    |
|     6 | PR-63 | Showcases, the host guide, and the release              | —      | —             | —           | —   | S    |

Sizes are rough, tests included: S under 500 changed lines, M 800 to 1 500, L
2 000 to 3 000 (most of it the step, the corpus, and fixtures).

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

### PR-63 — Showcases, the host guide, and the release

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

## Impact on Q14, parity, and golden frames

- PR-60 and PR-61 change the Player's dist tree, so parity is measured again in
  each; PR-61 changes the runtime build and reopens Q14; PR-59 is expected not
  to, and says so with the hash.
- The golden PNG files of every earlier composition stay byte for byte; one new
  composition with its golden frames enters in PR-61, so
  `REQUIRED_PINNED_FILES` and the Q14 artifact list grow in the same diff.
- Renders without a mapped clip keep every byte of their manifests (rules
  above).

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
   with an intermediate release after PR-61 if the host asks for it.
