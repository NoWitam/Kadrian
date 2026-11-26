# D93 — The command `kadrion check-custom-html`

- Status: Accepted — by the project owner on 2026-11-26 (15:45 Europe/Warsaw),
  with the recommendations of its questions, together with PR-98 to PR-101
  without a separate approval of each; the host's proposal it answers was
  approved with all its recommendations on 2026-11-26 (10:50 Europe/Warsaw)
- Date: 2026-11-26
- Supersedes: —
- Extends, with an `Amended by` line written in PR-101: D78 (78.6: a host's
  command line runs the check) and D48 (48.1: the job line `check`)
- Related: D05, D12, D23, D26, D28, D36, D45, D48, D78, D92

## Context

A host lets a model or a person write Custom HTML, and its worker has the
pinned Chromium; it wants the check of D78.6 from that worker, without a
model and without writing Node code against the Producer. Read from `pr-98`
at `737be15` (PR-97) on 2026-11-26; nothing was measured.

- **The report is put together by the tool.** `checkCustomHtml` of
  `@kadrion/producer` (`packages/producer/src/custom-html-check.ts`) returns
  the render check alone, `{ timesUs, problems }`. The `findings` come from
  `checkCustomHtmlSource` of `@kadrion/editor-sdk`, and the tool
  `check_custom_html` (`packages/ai-sdk/src/execute.ts`) joins both into
  `CustomHtmlCheckReport`, `{ nodeId, findings, render, ok }`, `ok` when
  there is no finding and no problem.
- **The render check needs the pinned browser.** It renders the element alone
  (`customHtmlCheckDocument`: its canvas and frame rate, from time 0, over a
  mid grey background, its fonts its only assets) by `renderFrames`, whose
  `launchChromium` refuses any Playwright or Chromium other than the pinned
  ones (D26.1). It needs no FFmpeg, since the document of the element holds
  no video; it needs the bytes of the element's fonts.
- **The command line.** `@kadrion/cli` depends on `player`, `producer`, and
  `schema` (D12); its commands read a document with `--composition` and its
  assets with `--assets`; a job prints JSON lines and ends in one `done` or
  one `error`, with the exit codes of D48.3.

## Decision

> D93: `kadrion check-custom-html --composition <file> --assets <file> --node-id <id> [--samples <n>]` runs the check of D78.6 on one Custom HTML node — the findings of its html and the render check of the Producer in the pinned Chromium — and prints the report of the tool `check_custom_html`, `{ nodeId, findings, render, ok }`, as one JSON line of a job of D48, with the exit codes of D48.3. The libraries do not change.

### D93.1 The command

- **Flags.** `--composition` and `--assets` as in every command,
  `--node-id` a Custom HTML node of a scene, a group, or a definition, and
  `--samples` the times sampled (5 by default, `CUSTOM_HTML_CHECK_SAMPLES`),
  with the limits and the wall time of every job (D48.4).
- **Output.** One line
  `{ "event": "check", "nodeId", "findings", "render", "ok" }`, then
  `{ "event": "done", "manifest": null }`; it writes no file and takes no
  `--out`. `render` is never `null`: the command always lends the browser.
- **Exit codes** (D48.3): 0 when the check ran, `ok` true or false; 1 for
  `invalid-document` (an invalid document, no such node, a node that is not
  Custom HTML) and every other `ProducerError`, a browser other than the
  pinned one included; 2 for a usage error; 4 for a limit or the wall time;
  5 when cancelled.

### D93.2 What it needs

The pinned Playwright and Chromium of D26.1, which `launchChromium` checks;
no FFmpeg; the element's fonts through `--assets`. The two renders are
compared with each other, never with golden frames, so the check needs no
golden file. A request of the element is blocked by the page wherever it runs
(D28.1); the reference run is the container of D26.2 without a network
(D28.9), and elsewhere the verdict holds for the Chromium of that run, which
`kadrion doctor` names (exit 3 outside the reference).

### D93.3 The libraries do not change

`checkCustomHtml`, `checkCustomHtmlSource`, and the tool keep their API. The
command builds the report as the tool does, from both functions, so it needs
the edge `cli` → `editor-sdk`, which D12 counts as not needed yet and
prohibits nowhere; PR-101 adds it to
`docs/architecture/package-boundaries.json` and states why.

## Questions for the owner, with recommendations (all accepted on 2026-11-26)

1. **Where the findings come from.** Recommendation: the edge `cli` →
   `editor-sdk` and `checkCustomHtmlSource`, as the tool calls it. The other
   ways are `cli` → `ai-sdk` with a bus made only to run one tool, or a
   command without findings, which would not be the report of D78.6.
2. **The exit code when `ok` is false.** Recommendation: 0. The check ran and
   its result is data, as the measurement of `estimate` is; a new code would
   extend the table of D48.3 for one command.
3. **A job or a plain command.** Recommendation: a job of D48, since it opens
   a browser: its limits, its wall time, and its cancellation hold, and a
   queue reads its lines as it reads every other job's.
4. **`--composition`, not `--document`.** Recommendation: `--composition`
   and `--assets`, as every command, the same answer as question 10 of D92.

## Alternatives considered

- **The render check in `@kadrion/editor-sdk` or `@kadrion/ai-sdk`.** Both
  must work without a renderer (D12 prohibits the edges).
- **The check in the Player.** A host's browser is not pinned, and the
  isolation of D36 is that of the Player's page.
- **A report in lines of text.** A queue and a model read JSON.

## Consequences

- `@kadrion/cli`: the command, its usage line, and the dependency on
  `@kadrion/editor-sdk`.
- No schema, runtime build, renderer, Player, or library API change; Q14 does
  not reopen.
- The host guide names the command where it describes Custom HTML and the
  worker, and D92 asks a host to run it before it reuses a segment with
  Custom HTML (question 9 of D92).

## Verification

- `packages/cli/test/cli.test.ts`: the flags, the line of the report and
  `done`, each exit code, with a fake check.
- `tests/pinned/custom-html-ai.pinned.test.ts`: the command on the fixture
  (`ok`) and on the element that counts its frames (`frames-differ`), in the
  pinned container; no new pinned file.
- `tests/repo/package-boundaries.test.ts`: the new edge in the map.

## Implementation notes (PR-101)

- **The command.** `checkCustomHtmlCommand` in `packages/cli/src/cli.ts`, a
  job of `JOB_COMMANDS` with its usage line; `JobLine` gains `check`
  (`nodeId`, `findings`, `render`, `ok`), and `CliHosts` gains
  `checkCustomHtml` and `launchChromium`, which tests replace (types
  `CheckCustomHtml` and `LaunchBrowser`). `checkCustomHtml`,
  `checkCustomHtmlSource`, and the tool keep their API; the API report of
  the CLI grows by these, and no other report changes.
- **The edge.** `cli` → `editor-sdk` in `package-boundaries.json`, the
  manifest, and the project references; D12 records it with an
  `Amended by: PR-101 (D93)` paragraph. It is the only way to the findings
  without a bus (question 1), and `editor-sdk` depends on `schema` alone, so
  the graph stays acyclic.
- **Readings closest to the ADR**, where the libraries give the command less
  than D93.1 asks:
  - _The browser._ `checkCustomHtml` turns every failed render into the
    problem `render-failed`, a browser that `launchChromium` refuses
    included. So the command launches the pinned Chromium itself with
    `launchChromium` and lends it through `chromium`: a refused browser is
    `chromium-mismatch` or `chromium-missing`, exit 1 (D93.1), not a problem
    of the element. It closes the browser when the check ends.
  - _Cancellation and the wall time._ `checkCustomHtml` takes no signal. A
    job cancelled or out of wall time while the check runs closes the
    browser, which fails the render in flight at once; the command then
    ends with `cancelled` (exit 5) or `limit-exceeded` (exit 4), whatever the
    check returned, and prints no `check` line (D48.2).
  - _The limits._ `checkCustomHtml` takes no limits, so the command checks
    those of D48.4 before the browser opens, in the Producer's words:
    `maxDocumentBytes`, `maxDurationUs`, `maxAssets`, and `maxCanvasPixels`
    on the document as given (the canvas of each definition too),
    `maxFrames` on the frames the check renders, each sampled time twice
    (10 by default), and `maxAssetBytes` and `maxTotalAssetBytes` on the
    element's fonts.
  - _The fonts._ The command reads the element's fonts once, before the
    browser opens, and hands the check only those. A font the asset file
    lacks, gives as no bytes, or gives with other bytes than its content
    hash is `asset-missing`, `asset-invalid`, or `asset-hash-mismatch`, exit
    1, as in every render job (D14), instead of a `render-failed` problem
    of an element that may have no fault.
  - _The node._ The command validates the document and finds the node as
    the Producer does, of a scene, a group, or a definition, so that an
    invalid document, no such node, or another node type is
    `invalid-document` (exit 1) before the browser opens. Schema `0.31`
    places Custom HTML only among the nodes of a scene; the search of groups
    and definitions follows the Producer and the tool.
  - _`--samples`._ A whole number from 1, else a usage error (exit 2); more
    samples than the element has frames sample every frame, as
    `checkCustomHtml` does.
- **Verification.** `packages/cli/test/cli.test.ts` (a fake check and a fake
  browser): the line and `done`, the request lent to the check, findings
  alone and problems alone with `ok` false and exit 0, the usage errors,
  `invalid-document` for the three cases, the fonts refused, a refused
  browser, every limit, and cancellation before and during the check and
  the wall time, each closing the browser.
  `tests/pinned/custom-html-ai.pinned.test.ts` runs `dist/bin.js` in the
  pinned container: `ok` on the fixture, `frames-differ` on the element that
  counts its frames, both exit 0. No pinned file is added, so
  `REQUIRED_PINNED_FILES` and the Q14 list do not change; no runtime build,
  Player dist tree, golden file, or schema changes.
- **The host guide and the release** (the last commit of PR-101): section 11
  of the host guide gives the command, its line, its exit codes with `ok`
  false at 0, and the limits it checks before the browser opens; section 6
  points a host without a model to it, and section 13 asks a host to run it
  before it reuses a segment with Custom HTML (question 9 of D92). Every
  package is `0.14.0` for `v0.14.0` (D92, Implementation notes of PR-101).
