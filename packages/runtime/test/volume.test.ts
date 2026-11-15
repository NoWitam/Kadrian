/**
 * The volume curve on the sample grid (D85.2, D85.4, PR-75): the placement of
 * keyframes on the 48 kHz grid by `sampleAt` (halves, two on one sample,
 * keyframes before and after the sound), the exponent and the logarithm of
 * Kadrion's own against an independent reference in BigInt, `volumeEnvelope`
 * against the reference in exact rationals within 1e-9 relative on seeded
 * curves with zeros, holds, and long ramps, a split at a multiple of 125 µs
 * hearing the gains of the whole, and the SHA-256 of a fixed set of envelopes
 * pinned, so that a change of the arithmetic cannot pass unseen.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sampleAt } from '../src/index.js';
import { exp2, log2, scaleByPowerOfTwo, splitPowerOfTwo } from '../src/volume-arithmetic.js';
import {
  placeVolumeKeys,
  volumeEnvelope,
  type VolumeKey,
  type VolumeSampleKey,
} from '../src/volume.js';

import { seededRandom } from './support.js';
import { ENVELOPE_CASES, referenceExp2, referenceGain, referenceLog2 } from './volume-support.js';
import pinned from './volume.sha256.json' with { type: 'json' };

const linear = { kind: 'linear' } as const;
const hold = { kind: 'hold' } as const;

/** The relative bound of D85.4. */
const RELATIVE = 1e-9;

/** Whether a relative error is within `bound` of the reference (0 only where the reference is 0). */
function within(actual: number, reference: number, bound: number): boolean {
  if (reference === 0) return actual === 0;
  return Math.abs(actual - reference) <= bound * Math.abs(reference);
}

/**
 * Whether a 32-bit gain is the rounding of a value within 1e-9 relative of
 * the reference: rounding to 32 bits keeps order, so it lies between the
 * roundings of the two ends.
 */
function roundsFromWithin(gain: number, reference: number): boolean {
  if (reference === 0) return gain === 0;
  const low = Math.fround(reference * (1 - RELATIVE));
  const high = Math.fround(reference * (1 + RELATIVE));
  return gain >= low && gain <= high;
}

function sha256(samples: Float32Array): string {
  return createHash('sha256')
    .update(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
    .digest('hex');
}

/** A double spread over every binary exponent from `low` to `high`. */
function spread(random: () => number, low: number, high: number): number {
  const exponent = low + Math.floor(random() * (high - low + 1));
  return scaleByPowerOfTwo(1 + random(), exponent);
}

describe('the exponent and the logarithm of D85.4', () => {
  it('splits every double into a mantissa from 1 to 2 and a power of two, exactly', () => {
    const random = seededRandom(0x8541);
    const values = [Number.MIN_VALUE, 2 ** -1_022, 0.75, 1, 1.5, 2, Number.MAX_VALUE];
    for (let i = 0; i < 2_000; i += 1) values.push(spread(random, -1_074, 1_023));
    for (const value of values) {
      const { mantissa, exponent } = splitPowerOfTwo(value);
      expect(mantissa >= 1 && mantissa < 2, String(value)).toBe(true);
      expect(scaleByPowerOfTwo(mantissa, exponent), String(value)).toBe(value);
    }
  });

  it('gives log2 within 1e-9 relative of a BigInt logarithm, and every power of two exactly', () => {
    const random = seededRandom(0x8542);
    const values = [Number.MIN_VALUE, 0.1, 0.5 + 2 ** -53, 1 - 2 ** -53, 1 + 2 ** -52, 3];
    for (let i = 0; i < 2_000; i += 1) values.push(spread(random, -1_074, 1_023));
    for (let i = 0; i < 500; i += 1) values.push(1 + (random() - 0.5) * 2 ** -20);
    let worst = 0;
    for (const value of values) {
      const reference = referenceLog2(value);
      const error = reference === 0 ? 0 : Math.abs(log2(value) - reference) / Math.abs(reference);
      worst = Math.max(worst, error);
      expect(within(log2(value), reference, RELATIVE), String(value)).toBe(true);
    }
    // The polynomial is far inside the bound; a regression of its terms shows here first.
    expect(worst).toBeLessThan(1e-14);
    for (let n = -1_074; n <= 1_023; n += 1) expect(log2(scaleByPowerOfTwo(1, n))).toBe(n);
    expect(log2(1)).toBe(0);
  });

  it('gives exp2 within 1e-9 relative of a BigInt exponential, and every power of two exactly', () => {
    const random = seededRandom(0x8543);
    const values = [0, 0.5, -0.5, 1 - 2 ** -53, -1e-300, 1e-12];
    for (let i = 0; i < 2_000; i += 1) values.push(-1_022 + random() * 2_045);
    for (let i = 0; i < 500; i += 1) values.push((random() - 0.5) * 4);
    let worst = 0;
    for (const value of values) {
      const reference = referenceExp2(value);
      worst = Math.max(worst, Math.abs(exp2(value) - reference) / reference);
      expect(within(exp2(value), reference, RELATIVE), String(value)).toBe(true);
    }
    expect(worst).toBeLessThan(1e-14);
    for (let n = -1_074; n <= 1_023; n += 1) expect(exp2(n)).toBe(scaleByPowerOfTwo(1, n));
    expect(exp2(1_024)).toBe(Infinity);
    expect(exp2(-1_100)).toBe(0);
  });

  it('refuses what has no logarithm or no exponent', () => {
    for (const value of [0, -1, Infinity, NaN]) expect(() => log2(value)).toThrow(RangeError);
    for (const value of [Infinity, -Infinity, NaN]) expect(() => exp2(value)).toThrow(RangeError);
  });
});

describe('the keyframes on the grid (D85.4)', () => {
  const key = (timeUs: number, value = 1, easing: VolumeKey['easing'] = linear): VolumeKey => ({
    timeUs,
    value,
    easing,
  });

  it('places each keyframe at its nearest sample, counted from the sound’s first sample', () => {
    // 48 000 samples a second: a sample is 20.8333… µs, so no time is an exact half.
    const startUs = 1_000_031;
    const times = [1_000_031, 1_000_052, 1_000_053, 1_002_000, 1_500_010];
    const placed = placeVolumeKeys(
      times.map((t) => key(t)),
      startUs,
      1_000_000,
    );
    const independent = (t: number): number => {
      // Nearest by the remainder: up when it is at least half a sample.
      const whole = Math.floor((t * 48) / 1_000);
      return whole + ((t * 48) % 1_000 >= 500 ? 1 : 0);
    };
    expect(placed.map(({ sample }) => sample)).toEqual(
      times.map((t) => independent(t) - independent(startUs)),
    );
    expect(placed.map(({ sample }) => sample)).toEqual(
      times.map((t) => Number(sampleAt(BigInt(t)) - sampleAt(BigInt(startUs)))),
    );
    // 1 000 052 µs is 48 002.496 samples and 1 000 053 µs is 48 002.544: down and up.
    expect(placed.map(({ sample }) => sample).slice(0, 3)).toEqual([0, 1, 2]);
  });

  it('keeps the later of two keyframes on one sample, so the curve jumps there', () => {
    const placed = placeVolumeKeys(
      [key(0, 1), key(1_000_041, 0.4), key(1_000_042, 0.8, hold), key(2_000_000, 0.2)],
      0,
      96_000,
    );
    expect(placed).toEqual([
      { sample: 0, value: 1, easing: linear },
      { sample: 48_002, value: 0.8, easing: hold },
      { sample: 96_000, value: 0.2, easing: linear },
    ]);
  });

  it('keeps the last keyframe at or before the first sample and the first at or after the end', () => {
    const keys = [key(0, 0.1), key(100_000, 0.2), key(200_000, 0.3), key(500_000, 0.4)];
    keys.push(key(700_000, 0.5), key(900_000, 0.6), key(950_000, 0.7));
    // The sound hears 200 000 µs to 700 000 µs: samples 0 to 23 999 of it.
    expect(placeVolumeKeys(keys, 200_000, 24_000).map(({ value }) => value)).toEqual([
      0.3, 0.4, 0.5,
    ]);
    expect(placeVolumeKeys(keys, 150_000, 24_000).map(({ sample }) => sample)).toEqual([
      -2_400, 2_400, 16_800, 26_400,
    ]);
    expect(placeVolumeKeys(keys, 990_000, 100)).toEqual([
      { sample: -1_920, value: 0.7, easing: linear },
    ]);
    expect(placeVolumeKeys([key(800_000, 0.25)], 0, 10)).toEqual([
      { sample: 38_400, value: 0.25, easing: linear },
    ]);
  });

  it('refuses keyframes that are no curve', () => {
    const refusals: (() => unknown)[] = [
      () => placeVolumeKeys([], 0, 10),
      () => placeVolumeKeys([key(10), key(10)], 0, 10),
      () => placeVolumeKeys([key(20), key(10)], 0, 10),
      () => placeVolumeKeys([key(0, 1.5)], 0, 10),
      () => placeVolumeKeys([key(0, -0.1)], 0, 10),
      () => placeVolumeKeys([key(0, NaN)], 0, 10),
      () => placeVolumeKeys([key(0.5)], 0, 10),
      () => placeVolumeKeys([key(-1)], 0, 10),
      () => placeVolumeKeys([key(0)], -1, 10),
      () => placeVolumeKeys([key(0)], 0, -1),
      () => placeVolumeKeys([{ timeUs: 0, value: 1, easing: { kind: 'ease-in' } as never }], 0, 10),
    ];
    for (const refusal of refusals) expect(refusal).toThrow(RangeError);
  });
});

/** A seeded curve: zeros, ones, holds, values down to 1e-6, and spans from 1 sample to 20 s. */
function seededCurve(random: () => number): VolumeSampleKey[] {
  const keys: VolumeSampleKey[] = [];
  let sample = Math.floor(random() * 2_000) - 1_000;
  const count = 2 + Math.floor(random() * 10);
  for (let i = 0; i < count; i += 1) {
    const draw = random();
    const value =
      draw < 0.15
        ? 0
        : draw < 0.25
          ? 1
          : scaleByPowerOfTwo(1, -Math.floor(random() * 20)) * random();
    keys.push({ sample, value, easing: random() < 0.2 ? hold : linear });
    const kind = random();
    sample +=
      kind < 0.1
        ? 1
        : kind < 0.8
          ? 1 + Math.floor(random() * 48_000)
          : Math.floor(random() * 960_000);
    sample += 1;
  }
  return keys;
}

describe('the envelope (D85.2, D85.4)', () => {
  it('meets the reference in exact rationals within 1e-9 relative on seeded curves', () => {
    const random = seededRandom(0x8544);
    let checked = 0;
    for (let curve = 0; curve < 60; curve += 1) {
      const keys = seededCurve(random);
      const first = (keys[0] as VolumeSampleKey).sample - 50;
      const end = (keys[keys.length - 1] as VolumeSampleKey).sample + 50;
      const envelope = volumeEnvelope({ volumeKeys: keys }, first, end - first);
      // Every keyframe, its neighbours, and 200 seeded samples between.
      const samples = new Set<number>([first, end - 1]);
      for (const { sample } of keys)
        for (const n of [sample - 1, sample, sample + 1]) samples.add(n);
      for (let i = 0; i < 200; i += 1) samples.add(first + Math.floor(random() * (end - first)));
      for (const n of samples) {
        if (n < first || n >= end) continue;
        const gain = envelope[n - first] as number;
        const reference = referenceGain(keys, n);
        expect(
          roundsFromWithin(gain, reference),
          `curve ${String(curve)} sample ${String(n)}`,
        ).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(12_000);
  });

  it('is a straight line in decibels between two values above 0, and exact at its keyframes', () => {
    const keys = [
      { sample: 0, value: 1, easing: linear },
      { sample: 48_000, value: 0.01, easing: linear },
    ];
    const envelope = volumeEnvelope({ volumeKeys: keys }, 0, 48_001);
    expect(envelope[0]).toBe(1);
    expect(envelope[48_000]).toBe(Math.fround(0.01));
    // −40 dB over the second: −10 dB at a quarter, −20 dB at the half.
    expect(roundsFromWithin(envelope[12_000] as number, referenceGain(keys, 12_000))).toBe(true);
    expect(Math.abs((envelope[24_000] as number) - 0.1)).toBeLessThan(1e-8);
    expect(Math.abs((envelope[12_000] as number) - 0.31622776601683794)).toBeLessThan(1e-7);
  });

  it('is linear in amplitude where an end is 0, in the order of D18.3', () => {
    const keys = [
      { sample: 100, value: 0.8, easing: linear },
      { sample: 1_100, value: 0, easing: linear },
      { sample: 1_300, value: 0.3, easing: linear },
    ];
    const envelope = volumeEnvelope({ volumeKeys: keys }, 0, 1_400);
    for (let n = 100; n < 1_100; n += 1) {
      expect(envelope[n]).toBe(Math.fround(0.8 + ((0 - 0.8) * (n - 100)) / 1_000));
    }
    for (let n = 1_100; n < 1_300; n += 1) {
      expect(envelope[n]).toBe(Math.fround(0 + ((0.3 - 0) * (n - 1_100)) / 200));
    }
  });

  it('holds before the first keyframe, after the last, and over a hold', () => {
    const keys = [
      { sample: 10, value: 0.25, easing: hold },
      { sample: 20, value: 0.75, easing: linear },
    ];
    expect([...volumeEnvelope({ volumeKeys: keys }, 0, 30)]).toEqual([
      ...Array<number>(20).fill(0.25),
      ...Array<number>(10).fill(0.75),
    ]);
    expect([...volumeEnvelope({ volumeKeys: [keys[0] as VolumeSampleKey] }, -5, 3)]).toEqual([
      0.25, 0.25, 0.25,
    ]);
  });

  it('gives any range of samples as the same range of the whole, byte for byte', () => {
    const random = seededRandom(0x8545);
    for (let curve = 0; curve < 20; curve += 1) {
      const keys = seededCurve(random);
      const from = (keys[0] as VolumeSampleKey).sample - 10;
      const count = Math.min(
        400_000,
        (keys[keys.length - 1] as VolumeSampleKey).sample - from + 10,
      );
      const whole = volumeEnvelope({ volumeKeys: keys }, from, count);
      for (let range = 0; range < 10; range += 1) {
        const start = Math.floor(random() * count);
        const length = Math.floor(random() * (count - start));
        const part = volumeEnvelope({ volumeKeys: keys }, from + start, length);
        expect(sha256(part)).toBe(sha256(whole.subarray(start, start + length)));
      }
    }
  });

  it('gives the halves of a split at a multiple of 125 µs the gains of the whole', () => {
    const random = seededRandom(0x8546);
    for (let trial = 0; trial < 40; trial += 1) {
      const startUs = Math.floor(random() * 3_000_000);
      const durationUs = 1_000_000 + Math.floor(random() * 9_000_000);
      const keys: VolumeKey[] = [];
      let timeUs = Math.max(0, startUs - Math.floor(random() * 2_000_000)) - 1;
      for (let i = 0; i < 8; i += 1) {
        timeUs += 1 + Math.floor(random() * 2_500_000);
        const draw = random();
        keys.push({
          timeUs,
          value: draw < 0.2 ? 0 : 0.001 + random() * 0.999,
          easing: random() < 0.2 ? hold : linear,
        });
      }
      const splitUs = startUs + 125 * (1 + Math.floor(random() * (durationUs / 125 - 1)));
      const samples = (from: number, to: number): number =>
        Number(sampleAt(BigInt(to)) - sampleAt(BigInt(from)));
      const wholeCount = samples(startUs, startUs + durationUs);
      const firstCount = samples(startUs, splitUs);
      const secondCount = samples(splitUs, startUs + durationUs);
      expect(firstCount + secondCount).toBe(wholeCount);
      const envelope = (from: number, count: number): Float32Array =>
        volumeEnvelope({ volumeKeys: placeVolumeKeys(keys, from, count) }, 0, count);
      const whole = envelope(startUs, wholeCount);
      expect(sha256(envelope(startUs, firstCount))).toBe(sha256(whole.subarray(0, firstCount)));
      expect(sha256(envelope(splitUs, secondCount))).toBe(sha256(whole.subarray(firstCount)));
    }
  });

  it('refuses a curve that is not placed', () => {
    const k = (sample: number, value = 1): VolumeSampleKey => ({ sample, value, easing: linear });
    const refusals: (() => unknown)[] = [
      () => volumeEnvelope({ volumeKeys: [] }, 0, 1),
      () => volumeEnvelope({ volumeKeys: [k(5), k(5)] }, 0, 1),
      () => volumeEnvelope({ volumeKeys: [k(5), k(4)] }, 0, 1),
      () => volumeEnvelope({ volumeKeys: [k(0.5)] }, 0, 1),
      () => volumeEnvelope({ volumeKeys: [k(0, 2)] }, 0, 1),
      () => volumeEnvelope({ volumeKeys: [k(0)] }, 0.5, 1),
      () => volumeEnvelope({ volumeKeys: [k(0)] }, 0, -1),
    ];
    for (const refusal of refusals) expect(refusal).toThrow(RangeError);
  });
});

describe('the pinned envelopes (D85.4)', () => {
  it('meet the reference and keep the pinned SHA-256 of every case', () => {
    const hashes = Object.fromEntries(
      ENVELOPE_CASES.map(({ name, volumeKeys, fromSample, count }) => {
        const envelope = volumeEnvelope({ volumeKeys }, fromSample, count);
        for (let i = 0; i < count; i += Math.max(1, Math.floor(count / 500))) {
          const reference = referenceGain(volumeKeys, fromSample + i);
          expect(roundsFromWithin(envelope[i] as number, reference), `${name} ${String(i)}`).toBe(
            true,
          );
        }
        return [name, sha256(envelope)];
      }),
    );
    expect(hashes).toEqual(pinned);
  });
});
