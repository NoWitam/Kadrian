/**
 * Support of the tests of the volume curve (D85.4, PR-75): an independent
 * reference in exact rationals and BigInt, and the fixed envelopes whose
 * SHA-256 is pinned in `volume.sha256.json` and compared in the pinned
 * Chromium (`tests/pinned/volume.pinned.test.ts`). Nothing here imports the
 * runtime, so the pinned tests can include it as it is.
 */

// --- the reference ----------------------------------------------------------

/** The binary digits after the point of every fixed-point real here: about 77 decimal digits. */
const BITS = 256n;
const ONE = 1n << BITS;

/** A finite double as the exact rational `mantissa · 2^exponent`, the mantissa a BigInt integer. */
export function exactDouble(x: number): { readonly mantissa: bigint; readonly exponent: number } {
  if (!Number.isFinite(x)) throw new RangeError('A finite double.');
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const sign = bits >> 63n === 1n ? -1n : 1n;
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  return biased === 0
    ? { mantissa: sign * fraction, exponent: -1_074 }
    : { mantissa: sign * (fraction | (1n << 52n)), exponent: biased - 1_075 };
}

function bitLength(value: bigint): number {
  return value === 0n ? 0 : value.toString(2).length;
}

/** `atanh(s)` of a fixed-point `0 ≤ s < 1/2`, summed until a term is 0. */
function atanhFixed(s: bigint): bigint {
  const s2 = (s * s) >> BITS;
  let power = s;
  let sum = 0n;
  for (let k = 0n; power !== 0n; k += 1n) {
    sum += power / (2n * k + 1n);
    power = (power * s2) >> BITS;
  }
  return sum;
}

/** `ln 2 = 2·atanh(1/3)`, fixed-point. */
export const LN2_FIXED = 2n * atanhFixed(ONE / 3n);

/** The natural logarithm of a positive BigInt integer, fixed-point. */
function lnInteger(value: bigint): bigint {
  const b = bitLength(value) - 1;
  const base = 1n << BigInt(b);
  // value = base · m with 1 ≤ m < 2; ln m = 2·atanh((m − 1) / (m + 1)).
  const s = ((value - base) << BITS) / (value + base);
  return 2n * atanhFixed(s) + BigInt(b) * LN2_FIXED;
}

/** The natural logarithm of a finite double above 0, fixed-point. */
export function lnFixed(x: number): bigint {
  if (!(x > 0)) throw new RangeError('A double above 0.');
  const { mantissa, exponent } = exactDouble(x);
  return lnInteger(mantissa) + BigInt(exponent) * LN2_FIXED;
}

/** `⌊a / b⌋` for BigInt integers of any sign, `b > 0`. */
function floorDivide(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a < 0n && q * b !== a ? q - 1n : q;
}

/** `v · 2^n` exactly for a double whose result stays normal. */
function scaled(v: number, n: number): number {
  let out = v;
  for (let k = 0; k < n; k += 1) out *= 2;
  for (let k = 0; k > n; k -= 1) out /= 2;
  return out;
}

/** The double nearest (within one rounding) to the rational `numerator / denominator`, both above 0. */
export function rationalToDouble(numerator: bigint, denominator: bigint): number {
  if (numerator === 0n) return 0;
  const shift = 80 - (bitLength(numerator) - bitLength(denominator));
  const quotient =
    shift >= 0
      ? (numerator << BigInt(shift)) / denominator
      : numerator / (denominator << BigInt(-shift));
  return scaled(Number(quotient), -shift);
}

/** A fixed-point real as a double, within one rounding (a sign kept). */
export function fixedToDouble(value: bigint): number {
  return value < 0n ? -rationalToDouble(-value, ONE) : rationalToDouble(value, ONE);
}

/** `e^y` of a fixed-point `y`, as a double: `y = I · ln 2 + r`, `e^r` by its series. */
export function expFixedToDouble(y: bigint): number {
  const whole = floorDivide(y, LN2_FIXED);
  const r = y - whole * LN2_FIXED;
  let term = ONE;
  let sum = 0n;
  for (let k = 1n; term !== 0n; k += 1n) {
    sum += term;
    term = (term * r) / (ONE * k);
  }
  // sum is e^r · 2^BITS with 1 ≤ e^r < 2.
  return scaled(Number(sum), Number(whole) - Number(BITS));
}

/** A finite double as a fixed-point real, exactly where it has no more than 256 binary places. */
export function doubleToFixed(x: number): bigint {
  const { mantissa, exponent } = exactDouble(x);
  const shift = BigInt(exponent) + BITS;
  return shift >= 0n ? mantissa << shift : mantissa >> -shift;
}

/** `log2(x)` by the reference, as a double. */
export function referenceLog2(x: number): number {
  return rationalToDoubleSigned(lnFixed(x), LN2_FIXED);
}

function rationalToDoubleSigned(numerator: bigint, denominator: bigint): number {
  return numerator < 0n
    ? -rationalToDouble(-numerator, denominator)
    : rationalToDouble(numerator, denominator);
}

/** `2^x` by the reference, as a double, for a result in the normal range. */
export function referenceExp2(x: number): number {
  return expFixedToDouble((doubleToFixed(x) * LN2_FIXED) >> BITS);
}

/** A placed keyframe, as `@kadrion/runtime/volume` names it. */
export interface ReferenceKey {
  readonly sample: number;
  readonly value: number;
  readonly easing: { readonly kind: 'linear' } | { readonly kind: 'hold' };
}

/**
 * The gain at sample `n` of a placed curve by the rules of D85.2 and D85.4,
 * from the exact rationals of its keyframes: linear in decibels (as
 * `exp(ln g0 + (ln g1 − ln g0) · (n − s0) / (s1 − s0))`, every logarithm to
 * about 77 digits), linear in amplitude where an end is 0, held for `hold`.
 * A double within two roundings of the exact gain.
 */
export function referenceGain(keys: readonly ReferenceKey[], n: number): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) throw new RangeError('No keyframe.');
  if (n < first.sample) return first.value;
  if (n >= last.sample) return last.value;
  let index = 0;
  while ((keys[index + 1] as ReferenceKey).sample <= n) index += 1;
  const start = keys[index] as ReferenceKey;
  const end = keys[index + 1] as ReferenceKey;
  if (start.easing.kind === 'hold') return start.value;
  const elapsed = BigInt(n - start.sample);
  const span = BigInt(end.sample - start.sample);
  if (start.value === 0 || end.value === 0) {
    // g0 + (g1 − g0) · elapsed / span, as one exact rational.
    const a = doubleToFixed(start.value);
    const b = doubleToFixed(end.value);
    const numerator = a * span + (b - a) * elapsed;
    return numerator === 0n ? 0 : rationalToDouble(numerator, span * ONE);
  }
  const ln0 = lnFixed(start.value);
  const ln1 = lnFixed(end.value);
  return expFixedToDouble(ln0 + floorDivide((ln1 - ln0) * elapsed, span));
}

// --- the pinned envelopes -----------------------------------------------------

const linear = { kind: 'linear' } as const;
const hold = { kind: 'hold' } as const;

/** One envelope of the pinned set: a placed curve and the samples asked of it. */
export interface EnvelopeCase {
  readonly name: string;
  readonly volumeKeys: readonly ReferenceKey[];
  readonly fromSample: number;
  readonly count: number;
}

/**
 * The fixed envelopes whose SHA-256 is pinned: ramps in decibels up and down,
 * long and short, a ramp to and from 0, holds, a jump, values far below 1,
 * samples before the first keyframe and after the last, and ranges that start
 * inside a ramp.
 */
export const ENVELOPE_CASES: readonly EnvelopeCase[] = [
  {
    name: 'fade down 1 to 0.1 over 1 s',
    volumeKeys: [
      { sample: 0, value: 1, easing: linear },
      { sample: 48_000, value: 0.1, easing: linear },
    ],
    fromSample: 0,
    count: 48_001,
  },
  {
    name: 'rise 0.001 to 1 over 3 s, from inside',
    volumeKeys: [
      { sample: -24_000, value: 0.001, easing: linear },
      { sample: 120_000, value: 1, easing: linear },
    ],
    fromSample: 0,
    count: 144_000,
  },
  {
    name: 'duck and release',
    volumeKeys: [
      { sample: 4_800, value: 1, easing: linear },
      { sample: 7_200, value: 0.2, easing: linear },
      { sample: 40_000, value: 0.2, easing: linear },
      { sample: 52_000, value: 1, easing: linear },
    ],
    fromSample: 0,
    count: 60_000,
  },
  {
    name: 'to silence and back, linear in amplitude',
    volumeKeys: [
      { sample: 0, value: 0.75, easing: linear },
      { sample: 12_000, value: 0, easing: linear },
      { sample: 18_000, value: 0, easing: linear },
      { sample: 30_000, value: 0.5, easing: linear },
    ],
    fromSample: -100,
    count: 30_200,
  },
  {
    name: 'holds and a jump',
    volumeKeys: [
      { sample: 1_000, value: 0.5, easing: hold },
      { sample: 9_000, value: 0.9, easing: linear },
      { sample: 9_001, value: 0.3, easing: hold },
      { sample: 20_000, value: 1, easing: linear },
    ],
    fromSample: 0,
    count: 24_000,
  },
  {
    name: 'far below 1',
    volumeKeys: [
      { sample: 0, value: 1e-30, easing: linear },
      { sample: 9_600, value: 1, easing: linear },
      { sample: 19_200, value: 3e-12, easing: linear },
    ],
    fromSample: 0,
    count: 19_201,
  },
  {
    name: 'long ramp 0.5 to 0.01 over 60 s, a range',
    volumeKeys: [
      { sample: 0, value: 0.5, easing: linear },
      { sample: 2_880_000, value: 0.01, easing: linear },
    ],
    fromSample: 1_000_003,
    count: 96_000,
  },
];
