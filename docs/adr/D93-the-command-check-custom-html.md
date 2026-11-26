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
