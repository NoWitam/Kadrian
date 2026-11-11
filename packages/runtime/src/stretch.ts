/**
 * The sound of a clip at another speed or reversed (D82.6): a time-stretch that
 * keeps the pitch, by a waveform-similarity overlap-add (WSOLA) whose grains
 * are anchored on the clip's time map. The Producer and the Player share this
 * one function, so both hear the same samples; it is pure and computes with
 * `+ − · /` and comparisons only (no `Math.cos`, `Math.pow`, or FFT, as D67.3),
 * so Node and Chromium give the same 32-bit floats. It is the entry
 * `@kadrion/runtime/stretch`, which neither the render page nor the Player
 * imports before schema `0.24` (PR-61), so the runtime build and the Player's
 * dist tree do not change (D21, D33.10).
 *
 * The grains, at `AUDIO_SAMPLE_RATE`:
 *
 * - Grain `k` is `STRETCH_GRAIN` samples long and centred at composition
 *   sample `y0 + k · STRETCH_HOP`, where `y0` is the sample at or before the
 *   instant at which the clip's map would read source time 0. Two grains
 *   overlap at every sample: the first half of a grain fades in by
 *   `x² · (3 − 2x)` at `x = i / STRETCH_HOP` and its second half fades out by
 *   `1 −` that, so the two fades of every sample sum to 1.
 * - Its nominal position is the source sample nearest to the exact map at its
 *   centre, read forwards or, for a reversed clip, from the reversed source.
 * - It is shifted by at most `STRETCH_RADIUS` samples to where its first half
 *   best matches the source's own continuation of the grain before it, by a
 *   correlation summed in a fixed order over the sum of the channels: first
 *   over every `STRETCH_SEARCH_STEP`th shift and sample, then around the best.
 * - The chain of shifts restarts once in every block of `STRETCH_BLOCK` grains,
 *   counted from grain 0, at the grain whose nominal samples hold the least
 *   energy (the first on a tie), with no shift. So the shift of a grain depends
 *   on the source, the map, and `k` only: the halves of a split, a trimmed
 *   clip, a sound cut by its scene, a seek in the Player, and every range of
 *   the Producer hear the same samples as the whole (D82.6, PR-59).
 *
 * At speed 1 there are no grains: each sample is the source sample nearest to
 * the map, so a reversed sound is its samples in reverse order and a sound at
 * speed 1 forwards is its samples unchanged, byte for byte.
 */
import type { ClipTimeMap } from '@kadrion/schema/time-map';

/** The length of a grain, in samples at 48 kHz (21⅓ ms); fixed by the quality check of PR-59. */
export const STRETCH_GRAIN = 1_024;
/**
 * The distance of two grains, half a grain: every sample is heard through two
 * grains. A literal, so that the bundle of the render page, which imports this
 * package's entry, keeps none of this module (D21).
 */
export const STRETCH_HOP = 512;
/** How far a grain may move from its nominal position, in samples (10⅔ ms). */
export const STRETCH_RADIUS = 512;
/** The step of the first pass of the search, in samples and in the samples it correlates. */
export const STRETCH_SEARCH_STEP = 2;
/** The grains of a block, in which the chain of shifts restarts once (341⅓ ms of composition). */
export const STRETCH_BLOCK = 32;

/** A microsecond is 6/125 of a sample at 48 kHz. */
const SAMPLE_NUM = 6n;
const SAMPLE_DEN = 125n;

/** The decoded samples of a source at 48 kHz, in its own channels, from one source sample on. */
export interface StretchSource {
  /** One array per channel, of equal length. */
  readonly channels: readonly Float32Array[];
  /** The source sample of index 0 of every channel. A sample outside them reads 0. */
  readonly startSample: number;
}

/** What to compute: a clip's map in composition time, its source, and the composition samples heard. */
export interface StretchRequest {
  /** `clipTimeMap` of the clip, in the time of the composition; its speed is not 0. */
  readonly map: ClipTimeMap;
  readonly source: StretchSource;
  /** The first composition sample to compute. */
  readonly startSample: number;
  readonly sampleCount: number;
}

/** The source samples `stretchSound` reads for a range of composition samples, and their times. */
export interface StretchSourceRange {
  /** The first source sample read, at least 0. */
  readonly startSample: number;
  /** The end of the samples read, exclusive; equal to `startSample` when none is read. */
  readonly endSample: number;
  /** The time of `startSample`, rounded down, in microseconds. */
  readonly startUs: number;
  /** The time of `endSample`, rounded up, in microseconds: `[startUs, endUs)` holds every sample read. */
  readonly endUs: number;
}

/** `⌊a / b⌋` for `b > 0`. */
function floorDiv(a: bigint, b: bigint): bigint {
  const quotient = a / b;
  return a % b < 0n ? quotient - 1n : quotient;
}

function safeInteger(name: string, value: number, minimum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(
      `${name} must be a safe integer from ${String(minimum)}, got ${String(value)}.`,
    );
  }
  return value;
}

/**
 * The map in samples, in the direction it is read: the position
 * `p(y) = (offset + scale · y) / span` of the read signal at composition sample
 * `y`, where the read signal is the source forwards (`x[q] = source[q]`) or,
 * reversed, the source backwards (`x[q] = source[−q − 1]`), so that `p` always
 * grows at the speed.
 */
interface SampleMap {
  readonly reverse: boolean;
  readonly unit: boolean;
  readonly offset: bigint;
  readonly scale: bigint;
  readonly span: bigint;
  /** The composition sample at or before which the map reads position 0. */
  readonly anchor: bigint;
}

function sampleMap(map: ClipTimeMap): SampleMap {
  const den = safeInteger('map.den', map.den, 1);
  if (den > 1_000 || !Number.isSafeInteger(map.slope)) {
    throw new RangeError('A time map has a den from 1 to 1000 and an integer slope.');
  }
  if (map.slope === 0) throw new RangeError('A sound at speed 0 is not heard (D82.3).');
  const reverse = map.slope < 0;
  const num = Math.abs(map.slope);
  if (4 * num < den || num > 4 * den) throw new RangeError('A speed is from 1/4 to 4.');
  // Source sample position = source µs · 6/125, at composition µs = y · 125/6:
  // (6 · intercept + 125 · slope · y) / (125 · den); reversed, its negation.
  const offset = (reverse ? -SAMPLE_NUM : SAMPLE_NUM) * map.intercept;
  const scale = SAMPLE_DEN * BigInt(num);
  return {
    reverse,
    unit: num === den,
    offset,
    scale,
    span: SAMPLE_DEN * BigInt(den),
    anchor: floorDiv(-offset, scale),
  };
}

/** The position of the read signal nearest to the map at composition sample `y`, an exact half up. */
function nearest(map: SampleMap, y: bigint): number {
  return Number(floorDiv(2n * (map.offset + map.scale * y) + map.span, 2n * map.span));
}

/** The nominal position of the centre of grain `k`. */
function grainCentre(map: SampleMap, k: number): number {
  return nearest(map, map.anchor + BigInt(k * STRETCH_HOP));
}

/** The grain whose second half is heard at composition sample `y`. */
function grainAt(map: SampleMap, y: number): number {
  return Number(floorDiv(BigInt(y) - map.anchor, BigInt(STRETCH_HOP)));
}

function blockOf(k: number): number {
  return Math.floor(k / STRETCH_BLOCK);
}

/** The positions of the read signal that the grains of `[first, last]` may read, half-open. */
function grainReads(map: SampleMap, first: number, last: number): [number, number] {
  // The blocks whose quietest grain is looked for: the one before the first grain's and every one up to the last.
  const lowest = (blockOf(first) - 1) * STRETCH_BLOCK;
  const highest = (blockOf(last) + 1) * STRETCH_BLOCK - 1;
  const low = grainCentre(map, lowest) - STRETCH_HOP - STRETCH_RADIUS;
  const high = Math.max(
    grainCentre(map, last) + STRETCH_HOP + STRETCH_RADIUS,
    grainCentre(map, highest) + STRETCH_HOP,
  );
  return [low, high];
}

/** The positions of the read signal heard over `[startSample, startSample + sampleCount)`, half-open. */
function readRange(map: SampleMap, startSample: number, sampleCount: number): [number, number] {
  const first = BigInt(startSample);
  const last = first + BigInt(sampleCount - 1);
  if (map.unit) return [nearest(map, first), nearest(map, last) + 1];
  return grainReads(
    map,
    grainAt(map, startSample),
    grainAt(map, startSample + sampleCount - 1) + 1,
  );
}

/**
 * The source samples `stretchSound` reads to compute the composition samples
 * `[startSample, startSample + sampleCount)` of a clip with this map (D82.6):
 * the samples heard, the search radius, and the blocks in which the chain of
 * shifts restarts. A host decodes at least these samples of the source, where
 * the source has them, and hands them to `stretchSound`; the result is then the
 * same as from the whole source. Samples before source sample 0 read 0 and are
 * left out.
 */
export function stretchSourceRange(
  map: ClipTimeMap,
  startSample: number,
  sampleCount: number,
): StretchSourceRange {
  const sample = sampleMap(map);
  safeInteger('startSample', startSample, Number.MIN_SAFE_INTEGER);
  safeInteger('sampleCount', sampleCount, 1);
  const [low, high] = readRange(sample, startSample, sampleCount);
  // Reversed, position q reads source sample −q − 1: [low, high) reads [−high, −low).
  const start = Math.max(0, sample.reverse ? -high : low);
  const end = Math.max(start, sample.reverse ? -low : high);
  return {
    startSample: start,
    endSample: end,
    startUs: Number(floorDiv(BigInt(start) * SAMPLE_DEN, SAMPLE_NUM)),
    endUs: Number(-floorDiv(-BigInt(end) * SAMPLE_DEN, SAMPLE_NUM)),
  };
}

/** The read signal over `[low, high)`: every channel, and their sum, which chooses the shifts. */
interface ReadSignal {
  readonly low: number;
  readonly channels: readonly Float64Array[];
  readonly mix: Float64Array;
}

function readSignal(map: SampleMap, source: StretchSource, low: number, high: number): ReadSignal {
  const length = high - low;
  const sourceLength = source.channels[0]?.length ?? 0;
  const channels = source.channels.map(() => new Float64Array(length));
  const mix = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = low + index;
    const at = (map.reverse ? -position - 1 : position) - source.startSample;
    if (at < 0 || at >= sourceLength) continue;
    let sum = 0;
    for (let channel = 0; channel < channels.length; channel += 1) {
      const value = source.channels[channel]?.[at] ?? 0;
      (channels[channel] as Float64Array)[index] = value;
      sum += value;
    }
    mix[index] = sum;
  }
  return { low, channels, mix };
}

/** The fade-in of a grain's first half, `x² · (3 − 2x)`; the fade-out of its second half is `1 −` it. */
function windowRise(): Float64Array {
  const rise = new Float64Array(STRETCH_HOP);
  for (let index = 0; index < STRETCH_HOP; index += 1) {
    const x = index / STRETCH_HOP;
    rise[index] = x * x * (3 - 2 * x);
  }
  return rise;
}

/** The energy of the nominal samples of grain `k`. */
function grainEnergy(map: SampleMap, signal: ReadSignal, k: number): number {
  const from = grainCentre(map, k) - STRETCH_HOP - signal.low;
  let energy = 0;
  for (let index = 0; index < STRETCH_GRAIN; index += 1) {
    const value = signal.mix[from + index] ?? 0;
    energy += value * value;
  }
  return energy;
}

/**
 * The score of a candidate first half at `from` against the samples at
 * `target`, both indices of the mix, over every `step`th sample: `c · |c| / e`,
 * where `c` is the correlation and `e` the energy of the candidate, summed in
 * index order; 0 for a silent candidate. It orders candidates as the
 * normalised correlation does, without a square root.
 */
function score(mix: Float64Array, from: number, target: number, step: number): number {
  let correlation = 0;
  let energy = 0;
  for (let index = 0; index < STRETCH_HOP; index += step) {
    const value = mix[from + index] ?? 0;
    correlation += value * (mix[target + index] ?? 0);
    energy += value * value;
  }
  return energy > 0 ? (correlation * Math.abs(correlation)) / energy : 0;
}

/**
 * The shift that best matches grain `k`'s first half to the samples at
 * `reference`, in two passes: the shifts 0, s, −s, 2s, −2s, … up to the radius,
 * with `s = STRETCH_SEARCH_STEP`, scored over every `s`th sample; then the best
 * of them and its neighbours below and above it, scored over every sample.
 * The first candidate wins a tie.
 */
function bestShift(map: SampleMap, signal: ReadSignal, k: number, reference: number): number {
  const { mix, low } = signal;
  const base = grainCentre(map, k) - STRETCH_HOP - low;
  const target = reference - low;
  let coarse = 0;
  let coarseScore = Number.NEGATIVE_INFINITY;
  for (let order = 0; order * STRETCH_SEARCH_STEP <= 2 * STRETCH_RADIUS; order += 1) {
    const shift = (order % 2 === 1 ? (order + 1) / 2 : -order / 2) * STRETCH_SEARCH_STEP;
    const found = score(mix, base + shift, target, STRETCH_SEARCH_STEP);
    if (found > coarseScore) {
      coarseScore = found;
      coarse = shift;
    }
  }
  let best = coarse;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const shift of [coarse, coarse - 1, coarse + 1]) {
    if (shift < -STRETCH_RADIUS || shift > STRETCH_RADIUS) continue;
    const found = score(mix, base + shift, target, 1);
    if (found > bestScore) {
      bestScore = found;
      best = shift;
    }
  }
  return best;
}

/** The shifts of grains `first` to `last`, each a function of the source, the map, and its index. */
function grainShifts(map: SampleMap, signal: ReadSignal, first: number, last: number): Int32Array {
  const resets = new Map<number, number>();
  const resetOf = (block: number): number => {
    const known = resets.get(block);
    if (known !== undefined) return known;
    let quietest = block * STRETCH_BLOCK;
    let least = Number.POSITIVE_INFINITY;
    for (let k = block * STRETCH_BLOCK; k < (block + 1) * STRETCH_BLOCK; k += 1) {
      const energy = grainEnergy(map, signal, k);
      if (energy < least) {
        least = energy;
        quietest = k;
      }
    }
    resets.set(block, quietest);
    return quietest;
  };
  const ownReset = resetOf(blockOf(first));
  const start = first >= ownReset ? ownReset : resetOf(blockOf(first) - 1);
  const shifts = new Int32Array(last - first + 1);
  let previous = 0;
  for (let k = start; k <= last; k += 1) {
    const shift =
      k === resetOf(blockOf(k)) ? 0 : bestShift(map, signal, k, grainCentre(map, k - 1) + previous);
    if (k >= first) shifts[k - first] = shift;
    previous = shift;
  }
  return shifts;
}

/**
 * The samples a clip at another speed or reversed plays at composition samples
 * `[startSample, startSample + sampleCount)` (D82.6), in the source's own
 * channels at 48 kHz, as 32-bit floats. They depend on the map, the source, and
 * the samples asked for only, so any range of a sound equals the same samples
 * of a longer range. The source must hold every sample of `stretchSourceRange`
 * that the source has.
 */
export function stretchSound(request: StretchRequest): Float32Array[] {
  const map = sampleMap(request.map);
  const { startSample, sampleCount, source } = request;
  safeInteger('startSample', startSample, Number.MIN_SAFE_INTEGER);
  safeInteger('sampleCount', sampleCount, 0);
  safeInteger('source.startSample', source.startSample, 0);
  const length = source.channels[0]?.length;
  if (length === undefined || source.channels.some((channel) => channel.length !== length)) {
    throw new RangeError('A source has at least one channel, all of one length.');
  }
  const out = source.channels.map(() => new Float32Array(sampleCount));
  if (sampleCount === 0) return out;
  const [low, high] = readRange(map, startSample, sampleCount);
  const signal = readSignal(map, source, low, high);
  if (map.unit) {
    // At speed 1 the position grows by exactly 1 per sample, from `low`.
    for (let channel = 0; channel < out.length; channel += 1) {
      (out[channel] as Float32Array).set(signal.channels[channel] as Float64Array);
    }
    return out;
  }
  const first = grainAt(map, startSample);
  const last = grainAt(map, startSample + sampleCount - 1) + 1;
  const shifts = grainShifts(map, signal, first, last);
  // Where grain k reads its first sample, as an index of the read signal.
  const starts = Array.from(
    { length: last - first + 1 },
    (_, index) => grainCentre(map, first + index) + (shifts[index] ?? 0) - STRETCH_HOP - low,
  );
  const rise = windowRise();
  let k = first;
  let offset = startSample - Number(map.anchor + BigInt(first * STRETCH_HOP));
  for (let index = 0; index < sampleCount; index += 1, offset += 1) {
    if (offset === STRETCH_HOP) {
      k += 1;
      offset = 0;
    }
    const fadeIn = rise[offset] ?? 0;
    const fadeOut = 1 - fadeIn;
    const outgoing = (starts[k - first] ?? 0) + STRETCH_HOP + offset;
    const incoming = (starts[k + 1 - first] ?? 0) + offset;
    for (let channel = 0; channel < out.length; channel += 1) {
      const samples = signal.channels[channel] as Float64Array;
      (out[channel] as Float32Array)[index] =
        fadeOut * (samples[outgoing] ?? 0) + fadeIn * (samples[incoming] ?? 0);
    }
  }
  return out;
}
