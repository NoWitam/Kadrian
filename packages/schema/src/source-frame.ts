/**
 * The source time and the source frame of a video (D49.5, D50.3), beside the
 * frame grid of D13: what the field `sourceStartUs` of a video node means. Both
 * hosts choose a frame by these functions from the container's own
 * timestamps, never from rounded microseconds, so the Player and the Producer
 * show the same frame index. They evaluate no composition state and read no
 * bytes: the timestamps are media facts a host reads from the bytes (D49.6).
 *
 * `BigInt` keeps the arithmetic exact over the whole safe-integer range.
 */

const MICROSECONDS_PER_SECOND = 1_000_000n;

/** A stream's time base `num / den` seconds per tick, both positive safe integers. */
export interface TimeBase {
  readonly num: number;
  readonly den: number;
}

/** The part of a video node that maps scene time to source time. */
export interface SourceMapping {
  readonly startUs: number;
  readonly durationUs: number;
  readonly sourceStartUs: number;
}

/** The source range a clip ever samples: from `startUs`, `durationUs` long (D49.6). */
export interface SourceRange {
  readonly startUs: number;
  readonly durationUs: number;
}

function safe(name: string, value: number, minimum: number): bigint {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(
      `${name} must be a safe integer from ${String(minimum)}, got ${String(value)}.`,
    );
  }
  return BigInt(value);
}

function toSafeNumber(name: string, value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${name} exceeds the safe integer range.`);
  }
  return Number(value);
}

function checkedTimeBase(timeBase: TimeBase): { readonly num: bigint; readonly den: bigint } {
  return { num: safe('timeBase.num', timeBase.num, 1), den: safe('timeBase.den', timeBase.den, 1) };
}

/**
 * The source time a video node shows at scene time `timeUs` (D49.5):
 * `sourceStartUs + (timeUs − startUs)`. The node must be active at `timeUs`
 * (D42.2); the sum must stay a safe integer.
 */
export function sourceTimeUs(node: SourceMapping, timeUs: number): number {
  const time = safe('timeUs', timeUs, 0);
  const start = safe('startUs', node.startUs, 0);
  const duration = safe('durationUs', node.durationUs, 1);
  if (time < start || time - start >= duration) {
    throw new RangeError(`The node is not active at ${String(timeUs)}.`);
  }
  return toSafeNumber(
    'sourceTimeUs',
    safe('sourceStartUs', node.sourceStartUs, 0) + (time - start),
  );
}

/**
 * The source range a node ever samples: its lifetime cut to its scene,
 * `[0, sceneDurationUs)`, mapped into source time (D49.6, D54.3). `null` when
 * the lifetime starts at or after the end of the scene and nothing is sampled.
 */
export function sampledSourceRange(
  node: SourceMapping,
  sceneDurationUs: number,
): SourceRange | null {
  const start = safe('startUs', node.startUs, 0);
  const duration = safe('durationUs', node.durationUs, 1);
  const end = safe('sceneDurationUs', sceneDurationUs, 1);
  if (start >= end) return null;
  const sampled = duration < end - start ? duration : end - start;
  return {
    startUs: Number(safe('sourceStartUs', node.sourceStartUs, 0)),
    durationUs: Number(sampled),
  };
}

/**
 * The frame shown at source time `sourceTimeUs` (D49.5): the largest index `i`
 * with `(pi − p0) × num × 1 000 000 ≤ sourceTimeUs × den`, where `p0 … pn` are
 * the presentation timestamps of the stream in presentation order, strictly
 * ascending, in ticks of `timeBase`. Source time 0 is the first frame's
 * presentation time, so the index is never below 0.
 */
export function sourceFrameIndex(
  timestamps: readonly number[],
  timeBase: TimeBase,
  sourceTimeUs: number,
): number {
  const { num, den } = checkedTimeBase(timeBase);
  const limit = safe('sourceTimeUs', sourceTimeUs, 0) * den;
  const first = timestamps[0];
  if (first === undefined) throw new RangeError('A video stream needs at least one frame.');
  const origin = BigInt(first);
  const at = (index: number): bigint =>
    (BigInt(timestamps[index] ?? 0) - origin) * num * MICROSECONDS_PER_SECOND;
  // Binary search for the last index whose offset is at or before the limit.
  let low = 0;
  let high = timestamps.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (at(middle) <= limit) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * The source duration of a video stream (D49.5, D50.3): the presentation end of
 * its last frame, `(pn − p0) + dn` ticks, counted from the first frame, in
 * microseconds rounded down. `lastDuration` is the last frame's duration in
 * ticks, at least 1.
 */
export function sourceDurationUs(
  timestamps: readonly number[],
  lastDuration: number,
  timeBase: TimeBase,
): number {
  const { num, den } = checkedTimeBase(timeBase);
  const first = timestamps[0];
  const last = timestamps.at(-1);
  if (first === undefined || last === undefined) {
    throw new RangeError('A video stream needs at least one frame.');
  }
  const ticks = BigInt(last) - BigInt(first) + safe('lastDuration', lastDuration, 1);
  return toSafeNumber('sourceDurationUs', (ticks * num * MICROSECONDS_PER_SECOND) / den);
}

/**
 * Whether a sampled source range lies in `[0, sourceDurationUs)` (D49.6): its
 * last sampled microsecond is before the end of the source.
 */
export function sourceRangeFits(range: SourceRange, sourceDurationUs: number): boolean {
  return BigInt(range.startUs) + BigInt(range.durationUs) <= BigInt(sourceDurationUs);
}
