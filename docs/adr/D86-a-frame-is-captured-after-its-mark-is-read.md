# D86 — A frame is captured only after its mark is read from the surface

- Status: Accepted — by the project owner on 2026-11-21 (13:31 Europe/Warsaw),
  before any code, with the recommendations of all five questions; step 4
  of D86.2 amended by the owner on 2026-11-21 (14:19 Europe/Warsaw), in
  PR-81, after the cost was measured: the mark is read at once, and the
  barrier runs again only before a further read
- Date: 2026-11-21
- Supersedes: —
- Extends, on acceptance, each with an `Amended by` line written then and in
  force from the pull request it names: D28 (28.1: the frame that holds the
  render page is two pixels taller than the composition; 28.3: the agent
  gains a third call, `mark`, and one painted element outside the root; 28.5:
  the barrier ends with the frame's mark read from the surface), D26 (26.3:
  the context of a render session is the composition's size and the strip of
  the mark; 26.4: `viewport` in a manifest is the composition's size, not the
  window's), and D29 (29.7: the documents are checked before the first and
  after the last capture of a frame; 29.3: the Producer decodes one pixel,
  the mark's, and still no frame)
- Related: D05, D23, D25, D33, D34, D47, D48, D50

## Context

D28.5 captures a frame after the runtime reported it ready and every frame of
the page waited for two animation frames. D28 measured that barrier with one
element on a development machine, a measurement it calls informative (1 of 6
captures before the barrier showed the state before, none of 6 after it).

Measured on 2026-11-21 at `af8622d`, in a container with four virtual
processors and no GPU, with the pinned Chromium and the pinned FFmpeg, outside
the pinned container: a film of 10 s at 1080×1920 and 30 fps (300 frames) with
one full-frame clip of 1080p, exported at `1080p`.

- **One export alone** wrote the same MP4 in every run (SHA-256 `666966da…`).
- **Four exports of the same film at once** did not:

| Build                                             | Exports | With a wrong frame | Wrong frames in each |
| ------------------------------------------------- | ------: | -----------------: | -------------------- |
| `main`                                            |       4 |                  3 | 1, 2, 2              |
| `main` with the reader's fix (PR-79)              |       4 |                  4 | 3, 1, 1, 4           |
| the same, started with `--run-all-compositor-…`\* |       4 |                  2 | not counted          |
| the same with the mark of this ADR (a prototype)  |       8 |                  0 | —                    |
| the mark and a faster capture (prototype)\*\*     |       4 |                  0 | —                    |

\* `--run-all-compositor-stages-before-draw`.
\*\* `Page.captureScreenshot` with `optimizeForSpeed: true`, which a later
decision proposes for exports.

- **Every wrong frame is the capture of the frame before**, byte for byte: its
  hash in the manifest is the hash of the previous frame.
- **The document was right.** An instrumented run recorded, at every wrong
  frame, that the page had been given the source frame of its own time, that
  the image's current source was that frame and was complete, and that a
  second barrier and capture returned another picture. The surface was late,
  not the page.
- **A faster capture meets it without load.** One export alone with the fast
  capture (`optimizeForSpeed: true`) held one such frame in 300.
- **With the mark, every export wrote the MP4 of the export alone**, byte for
  byte, in all 12 exports under load and in 2 alone; with the fast capture
  too. The prototype patched the built Producer by hand and is in no branch.
  It set the mark at the end of `frame`; the order decided below (after the
  first barrier) is stricter and is measured in PR-81.

What is believed to happen, and is not proven: the render page runs in a
process of its own (D28 measured it so, informatively; the pinned container
was not inspected). The last change of a frame, here the picture of a
video's frame, is committed by that process's compositor before the barrier
starts. The two animation frames of the barrier then carry no change, so they
end without waiting for that commit to be rastered and activated, and
`Page.captureScreenshot` redraws the page's own target and copies the surface
with the frame the render page presented last. Under load the raster of a
picture of 1080p outlasts two empty animation frames.

What follows for a host: range jobs of D47 running side by side on one
machine, or any other load on it, can write a film that repeats a frame, and
two renders of one document can differ. The invariant "the Producer is the
reference output" does not hold under load. No test meets it: the pinned
tests render one composition at a time.

## Decision

> D86: After the barrier of D28.5 the Producer has its agent set a mark in the render page: a strip below the composition whose colour is a sequence number. It then repeats the barrier and reads one pixel of the strip from the surface until it reads that number, and only then captures the frame. A frame whose mark does not appear in time fails with `presentation-timeout`.

### D86.1 The mark

- **Where.** The `iframe` that holds the render page, and the window of a
  render session, are the composition's width and its height plus 2 pixels.
  `contextOptions` keeps its meaning (D26.3) and the render session asks it
  for the taller window; every other caller (the Player's pages in the tests)
  is untouched. The composition keeps the area from the top-left corner that
  it has today, and the capture of a frame keeps its clip. The mark is an
  element of 4 × 2 pixels directly below the root, a child of the render
  page's `body`, made by the Producer's agent (D28.3) at its first use. It is
  no node, the runtime and the renderer do not know it, and the Player's page
  has none. Apart from those 2 pixels the embedding is still the Player's
  (D28.1): the same sandbox, origin, policy, and nesting.
- **What.** The agent counts its marks, from 1. The mark's colour is that
  number as `rgb(n mod 256, (n ÷ 256) mod 256, n ÷ 65 536)`. A session that
  would pass 16 777 214 fails; the page's white is never a number.
- **The call.** The agent gains `mark()`: it sets the next number and answers
  it. It holds no logic of pixels beyond this colour.
- **Custom HTML cannot reach it.** The mark is in the render page's document,
  which an element's frame cannot script (D05, D23).

### D86.2 The barrier (amends D28.5)

1. `KadrionRuntime.frame` resolves `{ ok: true }` and the documents are
   checked (D29.7), as today.
2. The barrier of D28.5 runs, as today. It gives an element that paints after
   its acknowledgement its two animation frames (the case D28.5 was made
   for), before the mark exists.
3. The Producer calls `mark()`. The mark is now the last change of the page:
   the Producer changes nothing else until the capture.
4. The Producer captures the pixel at `(0, height)` with the arguments of
   D28.5 and a clip of 1 × 1, decodes it, and compares it with the number.
   Not this number: the barrier runs again and step 4 is repeated, until it
   is, or until `presentationTimeoutMs` have passed since step 3 (a timer of
   its own; each barrier keeps its own bound), which fails the frame with
   `presentation-timeout`. The read is the proof; the barrier only paces the
   reads that follow a miss. (As accepted, the barrier also ran before the
   first read; measured in PR-81, that cost about 30 ms a frame and proved
   nothing more, so the owner amended it.)
5. The frame is captured as D28.5 says, and the documents are checked again.

- **What the read proves.** The surface shows a commit of the render page's
  compositor that is the mark's or a later one, so every change the render
  page's document had at step 3 is in it. This rests on one assumption,
  stated: a copy of the surface never shows an older frame of the render page
  than an earlier copy did.
- **What it does not prove.** A Custom HTML frame that runs in another
  process than the render page has a compositor of its own, which the mark
  does not order. D28 measured the element's frame in the render page's
  process; PR-81 states what the pinned container does, and the test under
  load includes a composition with a Custom HTML element. If the element's
  frame is out of process there, this ADR is revised before the code lands.
- **Every render session**: `renderFrames`, a still, an export, a range job,
  and the Custom HTML check. There is no option.
- **The Player's measurement** (D33) keeps the barrier and the capture of
  D28.5 without a mark: its page has no Producer's agent. Its pictures are
  gated at zero (D34.1), so a late capture there fails the comparison instead
  of being stored. This is the difference D28's review warned of (a barrier
  the measurement does not share); it is accepted because the mark changes
  when a picture is taken, never the picture.

### D86.3 What does not change

- The bytes of every frame's PNG, their hashes, the segments, the MP4, and
  every manifest, for a render that was right on `main`: the composition's
  area does not depend on the strip. The 104 golden frames and their 20
  manifests are the proof (D86.4).
- `viewport` in the environment manifest keeps the composition's size, as the
  code has always recorded it. D26.4 is amended to say so: the window is 2
  pixels taller, a constant of the Producer like its host document.
- The runtime build, the renderer, the Player, its dist tree, the schema.

### D86.4 What is proven, and how

- **Unchanged output.** `goldens:update` in the pinned container writes the
  golden frames and manifests of `main`, byte for byte; `test:pinned` passes
  against them; the parity records are measured again and equal.
- **Under load.** A new pinned test renders the video composition and a
  composition with a Custom HTML element in four Producer processes at once
  and requires the frames' hashes of each to equal those of one render alone,
  with the default timeouts. The table above was measured outside the pinned
  container, so PR-81 first records this test on `main` in the pinned
  container, with the number of processors: red there, green with the mark.
  If it is not red on `main` there, the load is raised until it is, and the
  pull request says by how much.
- **The mark is what holds a frame back.** A unit test with a page whose
  mark is late: the frame is captured only after the number appears, and
  `presentation-timeout` when it never does.
- **The cost.** The pull request states the time of the reference export and
  of the video composition before and after. The prototype, with the mark set
  at the end of `frame` and one barrier, cost 13 ms per frame (88 s to 92 s
  for the film above); the second barrier of D86.2 adds to it.

## Alternatives considered

- **More animation frames in the barrier.** Three or four make a late capture
  rarer and prove nothing: the animation frames carry no change, whatever
  their number.
- **`--run-all-compositor-stages-before-draw`.** Measured: two of four exports
  under load still held a wrong frame. It is also a launch argument, which
  every manifest records (D26.4).
- **Capturing twice and requiring equal pictures.** Two captures of a late
  surface are equal. It also doubles the largest cost of a frame.
- **A change that only makes the animation frames carry a commit, without
  reading it back.** The prototype suggests that this alone removes the wrong
  frames (the mark was never read late in 4 200 frames). It would rest on the
  compositor's scheduling instead of on what the surface shows.
- **The mark inside the composition's area, shown for the read and hidden for
  the capture.** Hiding it is a change that needs the same proof again.
- **The render page in the page's own process.** A redraw of the page would
  then include it, but the process boundary is part of the isolation of Custom
  HTML (D05, D28).
- **`HeadlessExperimental.beginFrame`.** Needs another build than the pinned
  Chromium of D26.
- **Telling hosts not to render side by side.** A machine is loaded by other
  things too, and D47 exists so that ranges can run side by side.

## Consequences

- `@kadrion/producer` only: `agent.ts` (the mark and `mark()`), `render.ts`
  (the taller frame and window, the steps of D86.2), `capture.ts` (the capture
  of one pixel and its decoding). No signature of the public surface changes;
  the text `hostDocument` returns does (the frame's height).
- A frame costs a second barrier and a capture of one pixel.
- `tests/pinned/producer.pinned.test.ts` asserts that the render page's window
  is as high as the composition; it asserts the strip from now on.
- The composition must not depend on the height of the render page's window.
  The stage has its size in pixels and clips, and neither the renderer nor
  the runtime reads the window (checked by reading the code). If a golden
  frame changes with the strip all the same, this ADR is revised before any
  code lands.
- A faster capture of exports, proposed separately, is built only after this
  is in force.
- A host is told in the release notes that films rendered under load before
  this release may hold a repeated frame.

## Verification

- `packages/producer/test`: the agent's number and mark, the order of D86.2,
  the read and its repetition, the timeout, the number's bound, and the host
  document's height.
- `tests/pinned/load.pinned.test.ts` (new, so the list of required pinned
  files grows, as for the pinned files added earlier in phase six): four
  renders at once against one alone, for both compositions.
- `tests/pinned` as a whole and `goldens:update`: no golden frame, manifest,
  or parity record changes.
- `tests/repo`: the ADR's row in the index.

## Implementation notes (PR-81)

- **The code.** `agent.ts` gains `mark(top)` and its one element; `capture.ts`
  gains `capturePixel` (one pixel of the surface), `firstPixel` (the colour
  of the first pixel of a PNG of 8-bit RGB or RGBA, which every filter of PNG
  leaves as it is), `markNumber`, and `awaitMark` (step 4, with the barrier
  and the read given, so that a unit test makes the mark late); `render.ts`
  makes the frame and the window 2 pixels taller and runs the steps of D86.2.
  None of them is exported from the package.
- **The test under load.** `tests/pinned/load.pinned.test.ts` exports, with
  the CLI, a film of 10 s at 1080 × 1920 with one video node over the whole
  frame (a clip the pinned FFmpeg makes from `testsrc2`, which changes every
  frame) and the reference composition with its Custom HTML element: first
  each alone, then four processes at once, two of each. In the pinned
  container (4 processors), `main` held 1 repeated frame of the film in one
  of four exports in a first run and none in a second; with the reader of
  PR-79 alone, two of four held 6 in all; with the mark, no frame differed in
  seven runs (two with step 4 as accepted, five as amended). The load was not raised, because `main` was red as it is.
- **Step 4 amended.** As accepted, step 4 ran the barrier before every read.
  Measured in the pinned container against the reader of PR-79 alone, that
  cost 85 ms a frame (the film 96 s to 120 s, the reference composition 51 s
  to 77 s); reading at once and running the barrier only after a miss cost
  53 to 60 ms (112 s and 69 s). The read is the proof either way, so the
  owner amended step 4 on 2026-11-21 (14:19 Europe/Warsaw). The prototype's
  13 ms set the mark before the barrier, which D86.2 does not allow.
- **One golden frame was wrong on `main`.** The frame at 1 000 000 µs of the
  animated captions composition (D70) on `main` depends on the frames
  rendered before it in the session: rendered alone it is
  `sha256:2c6eca85…`, after the three earlier golden times it is the golden
  `sha256:c691596e…` (311 pixels differ, by 1 level at most). With the mark it
  is `sha256:2c6eca85…` in both orders, so it was not "right on `main`"
  (D86.3): PR-81 writes it again, and it is the only golden file that
  changes. Two runs of `goldens:update` in fresh containers wrote the same
  bytes. A frame that depends on the frames before it is what the
  invariants forbid; the mark is what made this one independent.
- **Custom HTML.** In the pinned container the element's frame is in the
  render page's process (`producer-processes.json`: one frame with a target
  of its own, the render page), so the mark orders it (D86.2).

## Questions for the owner, with recommendations

1. **Fix the capture before making it faster.** Recommendation: yes; a faster capture
   waits for this ADR.
2. **A strip of 2 pixels below the composition in the Producer's page.**
   Recommendation: yes. It is outside every captured frame.
3. **`viewport` in manifests keeps the composition's size.** Recommendation:
   yes, so that no manifest changes. The other choice records the taller
   window and changes every manifest and its version.
4. **A pinned test that renders four at once.** Recommendation: yes, although
   it adds about three minutes to the pinned run; without it the defect can
   come back unseen.
5. **The roadmap and the release.** Recommendation: PR-80 and PR-81 join phase
   six next, before D87 and a faster capture, and are released as a patch release
   (`v0.9.1`) that the host pins at once. PR-79 (the reader of the decoder's
   output, a fix without an ADR) gets a roadmap row of its own.

## The pull requests

Each is approved separately, before it starts and again before its commit and
push, and the rules of phase six hold for them. Sizes are those of the
roadmap.

| Order | PR    | Subject                                                | Schema | Runtime build | Player dist | Q14 | Size |
| ----: | ----- | ------------------------------------------------------ | ------ | ------------- | ----------- | --- | ---- |
|     1 | PR-80 | D86 with D87, and the roadmap rows (documents only)    | —      | —             | —           | —   | S    |
|     2 | PR-81 | The mark, its read, the test under load, release notes | —      | —             | —           | —\* | M    |

\* No schema, runtime, or renderer change, so Q14 does not reopen by its rule;
a pinned test file is added and one pinned assertion changes, and the pinned
run of the pull request is its evidence.
