/**
 * Helpers of the tests of `stretchSound` (D82.6, PR-59): the cases both Node
 * and the pinned Chromium compute, a sequential WSOLA of the same constants
 * that the quality check compares with (question 11 of D82), and the measures
 * of that check.
 */
import { clipTimeMap, type ClipTimeMap, type Speed } from '@kadrion/schema/time-map';

import * as stretch from '../src/stretch.js';

// Local copies: a test module reads an imported binding through its module object, slowly in a hot loop.
const STRETCH_GRAIN = stretch.STRETCH_GRAIN;
const STRETCH_HOP = stretch.STRETCH_HOP;
const STRETCH_RADIUS = stretch.STRETCH_RADIUS;
const STRETCH_SEARCH_STEP = stretch.STRETCH_SEARCH_STEP;

/** The speeds of the quality check (D82, question 11). */
export const CHECKED_SPEEDS: readonly Speed[] = [
  { num: 1, den: 4 },
  { num: 1, den: 2 },
  { num: 3, den: 4 },
  { num: 3, den: 2 },
  { num: 2, den: 1 },
  { num: 4, den: 1 },
];

/**
 * The map of a clip that starts at composition time 0 and reads its source from
 * 0, `sourceSamples` long at 48 kHz, so that the map reads source time 0 at
 * composition sample 0 forwards; and the composition samples it is heard.
 */
export function wholeClip(
  speed: Speed,
  reverse: boolean,
  sourceSamples: number,
): { map: ClipTimeMap; sampleCount: number } {
  const sourceUs = Math.floor((sourceSamples * 125) / 6);
  const durationUs = Math.floor((sourceUs * speed.den) / speed.num);
  const map = clipTimeMap({
    startUs: 0,
    durationUs,
    sourceStartUs: 0,
    sourceStartRemainder: 0,
    speed,
    reverse,
  });
  return { map, sampleCount: Math.floor((durationUs * 6) / 125) };
}

function score(x: Float64Array, from: number, target: number, step: number): number {
  let correlation = 0;
  let energy = 0;
  for (let index = 0; index < STRETCH_HOP; index += step) {
    const value = x[from + index] ?? 0;
    correlation += value * (x[target + index] ?? 0);
    energy += value * value;
  }
  return energy > 0 ? (correlation * Math.abs(correlation)) / energy : 0;
}

function bestShift(x: Float64Array, base: number, target: number): number {
  let coarse = 0;
  let coarseScore = Number.NEGATIVE_INFINITY;
  // The order of stretchSound: 0, s, −s, 2s, −2s, …, so that a tie resolves alike.
  for (let order = 0; order * STRETCH_SEARCH_STEP <= 2 * STRETCH_RADIUS; order += 1) {
    const shift = (order % 2 === 1 ? (order + 1) / 2 : -order / 2) * STRETCH_SEARCH_STEP;
    const found = score(x, base + shift, target, STRETCH_SEARCH_STEP);
    if (found > coarseScore) {
      coarseScore = found;
      coarse = shift;
    }
  }
  let best = coarse;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const shift of [coarse, coarse - 1, coarse + 1]) {
    if (shift < -STRETCH_RADIUS || shift > STRETCH_RADIUS) continue;
    const found = score(x, base + shift, target, 1);
    if (found > bestScore) {
      bestScore = found;
      best = shift;
    }
  }
  return best;
}

/**
 * A sequential WSOLA with the constants of `stretchSound`: grain `k` is centred
 * at output sample `k · STRETCH_HOP`, read near source sample
 * `round(k · STRETCH_HOP · speed)`, and aligned with the continuation of the
 * grain before it as that grain was placed; grain 0 is not shifted. Its samples
 * depend on where the output starts, which is why D82 does not use it. With
 * `follow: 'nominal'` each grain is aligned with the continuation of the grain
 * before it at its nominal, unshifted position instead: the strictest reading
 * of "its shift depends only on the source and k", which the quality check
 * measures beside the other two.
 */
export function sequentialStretch(
  source: Float32Array,
  speed: Speed,
  sampleCount: number,
  follow: 'placed' | 'nominal' = 'placed',
): Float32Array {
  const grains = Math.floor(sampleCount / STRETCH_HOP) + 2;
  // The source with silence around it, so that no read leaves the array; `pad` is its sample 0.
  const pad = STRETCH_GRAIN + STRETCH_RADIUS;
  const x = new Float64Array(
    pad + source.length + Math.ceil((grains * STRETCH_HOP * speed.num) / speed.den) + pad,
  );
  x.set(source, pad);
  const starts: number[] = [];
  for (let k = 0; k < grains; k += 1) {
    const nominal = pad + Math.round((k * STRETCH_HOP * speed.num) / speed.den);
    const shift =
      k === 0
        ? 0
        : bestShift(
            x,
            nominal - STRETCH_HOP,
            follow === 'placed'
              ? (starts[k - 1] ?? 0) + STRETCH_HOP
              : pad + Math.round(((k - 1) * STRETCH_HOP * speed.num) / speed.den),
          );
    starts.push(nominal + shift - STRETCH_HOP);
  }
  const out = new Float32Array(sampleCount);
  for (let y = 0; y < sampleCount; y += 1) {
    const k = Math.floor(y / STRETCH_HOP);
    const offset = y - k * STRETCH_HOP;
    const position = offset / STRETCH_HOP;
    const fadeIn = position * position * (3 - 2 * position);
    out[y] =
      (1 - fadeIn) * (x[(starts[k] ?? 0) + STRETCH_HOP + offset] ?? 0) +
      fadeIn * (x[(starts[k + 1] ?? 0) + offset] ?? 0);
  }
  return out;
}

/** The positive-going zero crossings of a signal per second at 48 kHz, between its first and last. */
export function zeroCrossingRate(samples: Float32Array): number {
  const crossings: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1] ?? 0;
    const after = samples[index] ?? 0;
    if (before < 0 && after >= 0) crossings.push(index - 1 + -before / (after - before));
  }
  const first = crossings[0] ?? 0;
  const last = crossings.at(-1) ?? 0;
  return ((crossings.length - 1) * 48_000) / (last - first);
}

function rms(samples: Float32Array, from: number, length: number): number {
  let sum = 0;
  for (let index = from; index < from + length; index += 1) {
    const value = samples[index] ?? 0;
    sum += value * value;
  }
  return Math.sqrt(sum / length);
}

/**
 * How far the level of a stretched sound strays from its source's: over
 * windows of 10 ms, the mean of `|20 · log10(output RMS / source RMS)|`, where
 * the source window is the one the map reads at the centre of the output
 * window, over windows whose source is louder than −40 dB of its peak. A
 * stretch that cancels its own grains where they overlap loses level there.
 */
export function levelDeviationDb(source: Float32Array, output: Float32Array, speed: Speed): number {
  const window = 480;
  let peak = 0;
  for (let from = 0; from + window <= source.length; from += window) {
    peak = Math.max(peak, rms(source, from, window));
  }
  let total = 0;
  let windows = 0;
  for (let from = 0; from + window <= output.length; from += window) {
    const centre = Math.round(((from + window / 2) * speed.num) / speed.den);
    const sourceFrom = centre - window / 2;
    if (sourceFrom < 0 || sourceFrom + window > source.length) continue;
    const reference = rms(source, sourceFrom, window);
    if (reference < peak / 100) continue;
    total += Math.abs(20 * Math.log10(Math.max(rms(output, from, window), 1e-9) / reference));
    windows += 1;
  }
  return total / windows;
}

/** A mono WAV file of 16-bit samples at 48 kHz, for the owner to listen to. */
export function wavFile(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1)
      view.setUint8(at + index, text.charCodeAt(index));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48_000, true);
  view.setUint32(28, 96_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, index) => {
    view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32_767), true);
  });
  return bytes;
}
