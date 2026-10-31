# D48 — The render job contract

- Status: Accepted — by the project owner on 2026-10-31, after PR-25b was merged
- Date: 2026-10-31
- Supersedes: —
- Extends: D28 (28.6, two error codes; 28.8, the exit codes and standard
  output of the CLI), with an `Amended by: PR-25b (D48)` line
- Related: D04, D06, D12, D26, D28, D29, D47,
  [roadmap of phase three](../roadmap/phase-3.md) PR-25b

## Context

Item 8 of the host editor's needs is "rendering in the host's queue: ranges,
joining, single frames, idempotence, limits". D47 decided what a job renders:
a range of whole segments, the audio pass, the join, or one frame. It did not
decide how a job behaves inside a queue that Kadrion does not own, and the
host needs that to run one:

- A worker needs to show progress and to tell a stalled job from a slow one.
  Until now the CLI printed one human-readable line per file at the end, and
  nothing while it rendered.
- A queue cancels jobs: a user aborts a preview, a deployment stops a worker,
  a batch is superseded by a newer edit. Until now `SIGINT` reached
  Playwright's own handler, which closed the browser and exited with 130
  before the job removed its partial files, and `SIGTERM` closed the browser
  under the running frame loop, which ended as `page-error`.
- A queue decides by the exit code whether to retry. Until now every failure
  of a render was exit 1, so "this document is too long for this tier" and
  "the job was stopped" looked like a broken render.
- A host bounds the cost of a job before it starts, and needs a figure to
  split a render into jobs of a useful length.

The determinism invariants of `AGENTS.md` hold for all of this: no runtime
state may depend on a clock, and no output may depend on how a job was
observed.

## Decision

Every render command of the CLI is a job with a fixed contract: JSON lines on
standard output, cancellation by signal, limits checked before rendering, and
a stable table of exit codes. The Producer carries the same contract in its
library: every job accepts `signal`, `onProgress`, and `limits`. Nothing of it
reaches a manifest or an output, and nothing of it reads a clock except the
CLI's wall-time limit and `kadrion estimate`.

### D48.1 Progress and standard output

- The jobs are `render-frames`, `export`, `render-range`, `render-audio`,
  `join`, `render-still`, and `estimate`. `fetch-ffmpeg` and `doctor` are set-up
  tools, not jobs, and keep their output (D45).
- A job's standard output is JSON lines and nothing else: one object per line,
  with the key `event` and a fixed set of keys for each event. Diagnostics,
  including the message of an error, go to standard error.

  | `event`    | Keys                                                                                                | When                                                               |
  | ---------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
  | `start`    | `frames`, `segments`                                                                                | the checks before rendering passed; what the job will render       |
  | `frame`    | `frame` (its grid index), `done`, `frames`                                                          | a frame was rendered and handed on                                 |
  | `segment`  | `segment` (its grid index), `done`, `segments`                                                      | a segment file is complete, checked, and under its final name      |
  | `file`     | `file` (a name in `--out`)                                                                          | a file of the job is under its final name; the manifest comes last |
  | `estimate` | `samples`, `setupMs`, `msPerFrame`, `segmentFrames`, `msPerSegment`, `segments`, `segmentsInBudget` | `estimate` only (D48.5)                                            |
  | `done`     | `manifest` (its name, or `null` for `estimate`)                                                     | the job succeeded; the last line                                   |
  | `error`    | `code` (a `ProducerError` code, an FFmpeg installation code, or `usage`), `exitCode`                | the job failed; the last line                                      |

- Exactly one `done` or `error` ends every job. `start`, `frame`, and `segment`
  come from the Producer (`ProgressEvent`, passed to `onProgress`); the
  others are the CLI's. The audio pass and the join render no frame: their
  `start` has `frames: 0` and `segments: 0`, or they report none.
- Progress names frames and segments, never times. For one job, the lines
  before `done` are a function of the request, so a host can test against
  them; only `estimate` reports measured times.

### D48.2 Cancellation

- Every job of the Producer accepts an `AbortSignal`. When it aborts, the job
  closes its page (so a call in flight fails at once instead of after its
  timeout), kills its FFmpeg process with `SIGKILL`, removes its partial
  files, and also removes the segments it had already finished: a cancelled or
  failed job leaves nothing under a final name. It then rejects with
  `cancelled`, or with the signal's reason when that is a `ProducerError`
  (D48.4 uses this for the wall time). A signal that aborted before the job
  starts nothing.
- The CLI aborts its job on `SIGTERM` and `SIGINT` and exits with 5. It owns
  these signals: the Producer launches Chromium with Playwright's
  `handleSIGINT`, `handleSIGTERM`, and `handleSIGHUP` off, and Playwright's
  exit handler still kills the browser if the process ends.
- Cancellation is bounded: if the job has not ended `CANCEL_GRACE_MS`
  (10 000 ms) after the signal, or a second signal arrives, the process exits
  with 5 at once. In the pinned container a job stopped in 138 ms after
  `SIGTERM` and 199 ms after `SIGINT`, with no Chromium or FFmpeg process left
  and an empty output directory.
- A job killed without a signal (`SIGKILL`, a lost machine) leaves at most files
  under their temporary names (`.partial`, D47.6). The next run of the same
  job writes them again; a join reads only manifests and the files they name.
- A signal that arrives after the Producer returned does not undo the work: the
  CLI writes the manifest and exits 0.

### D48.3 Errors and exit codes

`ProducerError` gains two codes: `limit-exceeded` (D48.4) and `cancelled`
(D48.2). The exit codes of D28.8 become this table:

| Exit | Meaning                                                                 | A queue would usually              |
| ---: | ----------------------------------------------------------------------- | ---------------------------------- |
|    0 | success                                                                 | take the result                    |
|    1 | any other `ProducerError`, or an error of the FFmpeg installation (D45) | report it; retry only if transient |
|    2 | a usage error                                                           | fix the call                       |
|    3 | `doctor` only: not the reference environment (D45)                      | fix the worker                     |
|    4 | `limit-exceeded`, the wall time included                                | not retry with the same limits     |
|    5 | `cancelled`                                                             | nothing: it asked for it           |

The `error` line carries the code and the exit code; the code is the one a
library caller sees on the `ProducerError`.

### D48.4 Limits

- `JobLimits` has six optional fields, checked by the Producer before a page
  opens or FFmpeg starts:
  - `maxDocumentBytes`: the UTF-8 bytes of the canonical JSON of the validated
    document (the bytes `compositionHash` is computed from, D28.7), so the
    limit does not depend on how the host formatted the file;
  - `maxDurationUs`: the composition's `durationUs`;
  - `maxFrames`: the frames of the job's range: the times of `render-frames`,
    the range of `render-range` and `render-audio`, every frame for `export`,
    and 1 for a still;
  - `maxAssets`: the assets the document declares;
  - `maxAssetBytes` and `maxTotalAssetBytes`: the bytes of one asset and of all
    of them, as the resolver returned them, before they reach the page.
- A value over its limit is `limit-exceeded`, naming the limit, the value, and
  the maximum; a limit that is not a non-negative safe integer is refused the
  same way. A job without limits has none.
- The CLI takes them as `--max-document-bytes`, `--max-duration-us`,
  `--max-frames`, `--max-assets`, `--max-asset-bytes`, and
  `--max-total-asset-bytes`. `join` reads no document and takes none of them.
- The wall time is the CLI's: `--max-wall-ms` starts a timer on the CLI's clock
  when the job starts and aborts it with `limit-exceeded` when it fires, which
  is cancellation (D48.2) with another reason. The runtime never sees a
  clock, and a library caller gets the same effect by aborting its own signal
  with a `ProducerError`.

### D48.5 The estimate

- `kadrion estimate --composition --assets --preset [--samples n]
[--segment-frames n] [--budget-ms ms]` renders and encodes one segment of
  `samples` frames (default 10, at least 2) from the middle of the
  composition, as a range job into a temporary directory that it removes. The
  middle segment of the grid of that length, never its shorter last one, is
  `estimatePlan` of the Producer.
- It measures with the CLI's monotonic clock: `setupMs` from the start to the
  first frame (the launch, the load, and the first frame), and `msPerFrame`
  from the first frame to the finished segment, divided by `samples − 1`,
  rounded up. `msPerSegment` is `msPerFrame × segmentFrames` (the host's
  segment length, default 60), `segments` is the number of segments of the
  composition, and `segmentsInBudget` is how many segments fit into
  `--budget-ms` after the setup, or `null` without a budget.
- It is advice for the host's batching. It writes no file the host keeps, and
  no output of any job depends on it. In the pinned container the reference
  composition measured `setupMs` 1 562 and `msPerFrame` 193 at `1080p`.

## Alternatives considered

- **Human-readable lines with a separate `--json` flag.** Two formats double
  the tests and leave the default to whoever parses it first; the host is the
  only caller that matters, and a person can read JSON lines.
- **Progress on standard error.** It mixes with Chromium's and FFmpeg's
  diagnostics and with Node.js warnings; standard output is the channel the
  CLI controls entirely.
- **A progress percentage or an ETA in the lines.** Both need a clock or an
  assumption about the next frames; a host computes them from `done`, the
  totals of `start`, and its own clock.
- **Cancellation by `SIGKILL` only, with cleanup on the next run.** It leaves
  Chromium and FFmpeg processes and partial files for an unknown time; the
  next run is the fallback, not the plan.
- **Keeping the finished segments of a cancelled job.** They are correct, but
  a host that sees files under final names cannot tell a cancelled job from a
  finished one without its manifest; removing them makes the rule simple.
- **One exit code per error code.** The codes grow with every pull request; a
  queue needs the class, and the code is in the `error` line.
- **Limits on the file size of the document as given.** Whitespace and key
  order would change the limit's meaning; the canonical JSON is what the
  render reads and what `compositionHash` names.
- **The wall time inside the Producer.** It would put a clock into the library
  that renders; the CLI owns the clock, and a library caller has its signal.
- **An estimate from browser frames only (`render-frames`).** It would leave
  out the encoder, which is a large part of a segment's time at `-threads 1`.

## Consequences

- A host runs any render command in its queue, shows progress from the lines,
  stops a job with a signal, and decides by the exit code whether to retry.
- The standard output of `render-frames`, `export`, `render-range`,
  `render-audio`, `join`, and `render-still` changes from text to JSON lines.
  No test of the repository and no script read the old text; the pinned run
  logs it only.
- `@kadrion/producer` exports `JobLimits`, `JobOptions`, `ProgressEvent`,
  `ProgressListener`, `JOB_LIMITS`, `estimatePlan`, and
  `DEFAULT_ESTIMATE_SAMPLES`; `FfmpegTools.run` takes a signal. `@kadrion/cli`
  exports the exit codes, `JOB_COMMANDS`, `JobLine`, and `CANCEL_GRACE_MS`.
  No package boundary changes, and the runtime build stays byte for byte
  (`sha256:213ddb19…`); golden frames and parity are unchanged.
- `render-frames` now writes its PNG files under a temporary name and renames
  them, as the other commands do (D47.6).
- `tests/pinned/export.pinned.test.ts` gains the tests of D48, so Q14, which
  PR-25a reopened, still closes only by the evidence of a green push run.
- Retries, queues, a REST service, and a render farm stay outside Kadrion.

## Verification

- `packages/producer/test/export.test.ts`: the progress events of a range, an
  export, and the audio pass, with their exact keys; cancellation of a range
  job, an export, the audio pass, and the join on a fake frame loop and a fake
  FFmpeg (the encoder killed, the page closed, no file left); the signal's
  reason; a signal that aborted before the job; every limit, refused before a
  browser or FFmpeg starts, and accepted at its value; the limits and the
  signal of a still; `estimatePlan`.
- `packages/cli/test/cli.test.ts`: every line parses; the progress passed
  through; the error line and the exit code of every class; the limit flags;
  the wall time on a fake timer; the host's signal; `estimate` on a fake clock,
  including the temporary directory it removes.
- `tests/pinned/export.pinned.test.ts`, in the pinned container: the lines of a
  real range job; `SIGTERM` and `SIGINT` in the middle of a render stop it
  within `CANCEL_GRACE_MS` with exit 5, no Chromium or FFmpeg process carrying
  the job's mark is left, and the output directory is empty; the wall time ends
  a job with exit 4; a limit refuses a job before rendering; the estimate.
