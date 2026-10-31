/**
 * The render job contract of D48 on the Producer's side: progress events,
 * cancellation by an `AbortSignal`, and the limits a host gives a job. Nothing
 * here reads a clock: progress names frames and segments, never times, and the
 * wall time of a job is the CLI's business (D48.4).
 */
import type { ValidatedComposition } from '@kadrion/schema';

import { ProducerError } from './errors.js';
import { canonicalJson } from './manifest.js';

/**
 * What a job reports while it runs (D48.1), in this order: one `start`, then a
 * `frame` per frame rendered and a `segment` per segment written. Each event
 * has exactly the keys shown, so a host can parse it by its `event`.
 */
export type ProgressEvent =
  | {
      /** The checks before rendering passed. */
      readonly event: 'start';
      /** The frames this job renders in the browser. */
      readonly frames: number;
      /** The segments this job encodes; 0 when it encodes none. */
      readonly segments: number;
    }
  | {
      /** A frame was rendered and handed on. */
      readonly event: 'frame';
      /** Its index on the composition's frame grid. */
      readonly frame: number;
      /** How many frames of this job are done, this one included. */
      readonly done: number;
      readonly frames: number;
    }
  | {
      /** A segment is complete and checked, under its final name. */
      readonly event: 'segment';
      /** Its index on the segment grid (D47.1). */
      readonly segment: number;
      readonly done: number;
      readonly segments: number;
    };

/** Receives the events of a job; it must not throw, and it is called synchronously. */
export type ProgressListener = (event: ProgressEvent) => void;

/**
 * The limits of one job (D48.4), each optional: a job without a limit has none.
 * They are checked before a page opens or FFmpeg starts.
 */
export interface JobLimits {
  /** UTF-8 bytes of the canonical JSON of the validated document (D28.7). */
  readonly maxDocumentBytes?: number;
  /** The composition's `durationUs`. */
  readonly maxDurationUs?: number;
  /** The frames of the job's range: the times of a render, 1 for a still. */
  readonly maxFrames?: number;
  /** The assets the document declares. */
  readonly maxAssets?: number;
  /** The bytes of any one asset, as the resolver returned them. */
  readonly maxAssetBytes?: number;
  /** The bytes of all assets together. */
  readonly maxTotalAssetBytes?: number;
}

/** The names of `JobLimits`, in a fixed order: the CLI's flags and the checks follow it. */
export const JOB_LIMITS = [
  'maxDocumentBytes',
  'maxDurationUs',
  'maxFrames',
  'maxAssets',
  'maxAssetBytes',
  'maxTotalAssetBytes',
] as const satisfies readonly (keyof JobLimits)[];

/** What every job of the Producer accepts besides its own request (D48). */
export interface JobOptions {
  /** Cancels the job: the page and FFmpeg stop, and no output stays under a final name. */
  readonly signal?: AbortSignal;
  readonly onProgress?: ProgressListener;
  readonly limits?: JobLimits;
}

function exceeded(what: string, value: number, limit: number): ProducerError {
  return new ProducerError(
    'limit-exceeded',
    `${what} is ${String(value)}, more than the limit of ${String(limit)}.`,
  );
}

/** Checks a limit; a limit that is not a non-negative safe integer is refused as well. */
function within(limits: JobLimits | undefined, name: keyof JobLimits, value: number): void {
  const limit = limits?.[name];
  if (limit === undefined) return;
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new ProducerError(
      'limit-exceeded',
      `The limit ${name} must be a non-negative integer, got ${String(limit)}.`,
    );
  }
  if (value > limit) throw exceeded(LIMIT_WHAT[name], value, limit);
}

const LIMIT_WHAT: Readonly<Record<keyof JobLimits, string>> = {
  maxDocumentBytes: 'The document (canonical JSON, bytes)',
  maxDurationUs: 'The duration (µs)',
  maxFrames: 'The frames of the job',
  maxAssets: 'The number of assets',
  maxAssetBytes: 'An asset (bytes)',
  maxTotalAssetBytes: 'All assets together (bytes)',
};

/** The limits a validated document and the frames of a job can be checked against (D48.4). */
export function checkDocumentLimits(
  limits: JobLimits | undefined,
  composition: ValidatedComposition,
  frames: number,
): void {
  if (limits === undefined) return;
  within(
    limits,
    'maxDocumentBytes',
    new TextEncoder().encode(canonicalJson(composition)).byteLength,
  );
  within(limits, 'maxDurationUs', composition.durationUs);
  within(limits, 'maxFrames', frames);
  within(limits, 'maxAssets', composition.assets.length);
}

/** The limits of the resolved asset bytes, checked before a page opens (D48.4). */
export function checkAssetLimits(
  limits: JobLimits | undefined,
  assets: readonly { readonly id: string; readonly bytes: Uint8Array }[],
): void {
  if (limits === undefined) return;
  let total = 0;
  for (const { id, bytes } of assets) {
    try {
      within(limits, 'maxAssetBytes', bytes.byteLength);
    } catch (reason) {
      throw new ProducerError('limit-exceeded', `The asset "${id}": ${(reason as Error).message}`);
    }
    total += bytes.byteLength;
  }
  within(limits, 'maxTotalAssetBytes', total);
}

/**
 * The error of a cancelled job: the signal's reason when it is a
 * `ProducerError` (the CLI aborts with `limit-exceeded` when the wall time is
 * up), otherwise `cancelled`.
 */
export function cancelledError(signal: AbortSignal): ProducerError {
  const reason: unknown = signal.reason;
  if (reason instanceof ProducerError) return reason;
  return new ProducerError('cancelled', 'The job was cancelled.');
}

/** Throws the error of a cancelled job if `signal` is aborted. */
export function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw cancelledError(signal);
}

/**
 * Calls `stop` once when `signal` aborts (at once if it already has), and
 * returns how to stop listening.
 */
export function onCancel(signal: AbortSignal | undefined, stop: () => void): () => void {
  if (signal === undefined) return () => undefined;
  if (signal.aborted) {
    stop();
    return () => undefined;
  }
  signal.addEventListener('abort', stop, { once: true });
  return () => {
    signal.removeEventListener('abort', stop);
  };
}

/** `reason`, or the error of a cancelled job when the signal aborted meanwhile. */
export function failure(reason: unknown, signal: AbortSignal | undefined): unknown {
  return signal?.aborted === true ? cancelledError(signal) : reason;
}
