#!/usr/bin/env node
/**
 * The executable of `@kadrion/cli`: `node packages/cli/dist/bin.js render-frames …`.
 *
 * `SIGTERM` and `SIGINT` cancel the running job (D48.2): the Producer closes
 * the page, kills FFmpeg, removes what it was writing, and the process exits
 * with `EXIT_CANCELLED`. If that takes longer than `CANCEL_GRACE_MS`, or a
 * second signal arrives, the process exits at once; only files under their
 * temporary names can then remain, which the next run of the job replaces.
 */
import process from 'node:process';

import { ProducerError } from '@kadrion/producer';

import { CANCEL_GRACE_MS, EXIT_CANCELLED, runCli } from './cli.js';

const controller = new AbortController();

function cancel(signal: NodeJS.Signals): void {
  if (controller.signal.aborted) process.exit(EXIT_CANCELLED);
  process.stderr.write(`${signal}: cancelling the job\n`);
  controller.abort(new ProducerError('cancelled', `The job was cancelled by ${signal}.`));
  setTimeout(() => {
    process.stderr.write(`The job did not stop within ${String(CANCEL_GRACE_MS)} ms.\n`);
    process.exit(EXIT_CANCELLED);
  }, CANCEL_GRACE_MS).unref();
}

process.on('SIGTERM', cancel);
process.on('SIGINT', cancel);

process.exitCode = await runCli(
  process.argv.slice(2),
  {
    out: (line) => {
      process.stdout.write(`${line}\n`);
    },
    err: (line) => {
      process.stderr.write(`${line}\n`);
    },
  },
  { signal: controller.signal },
);
