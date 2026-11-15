/**
 * The exponent and the logarithm in base 2 of a volume curve (D85.4), with
 * `+ − · /`, `Math.floor`, and comparisons only, so that every engine that
 * implements IEEE 754 binary64 gives the same bits: the ECMAScript
 * specification leaves `Math.pow`, `Math.exp`, `Math.log2`, and their kin
 * approximated (D67.3, D82.6). Both reduce their argument exactly, by powers of
 * two, and then evaluate a fixed polynomial with a fixed number of terms; the
 * relative error of each is below 1e-15 on normal numbers, well inside the
 * 1e-9 of D85.4. Internal to the entry `@kadrion/runtime/volume`.
 */

/** The smallest exponent of a subnormal binary64 number, and the largest of a finite one. */
const MIN_EXPONENT = -1_074;
const MAX_EXPONENT = 1_023;

/**
 * `2^n` for every `n` from −1074 to 1023, at index `n + 1074`: each one exact,
 * made by doubling and halving 1, never by `Math.pow`.
 */
const POWERS_OF_TWO: readonly number[] = (() => {
  const powers = new Array<number>(MAX_EXPONENT - MIN_EXPONENT + 1);
  powers[-MIN_EXPONENT] = 1;
  for (let n = 1; n <= MAX_EXPONENT; n += 1) {
    powers[n - MIN_EXPONENT] = (powers[n - 1 - MIN_EXPONENT] as number) * 2;
  }
  for (let n = -1; n >= MIN_EXPONENT; n -= 1) {
    powers[n - MIN_EXPONENT] = (powers[n + 1 - MIN_EXPONENT] as number) / 2;
  }
  return powers;
})();

function powerOfTwo(n: number): number {
  return POWERS_OF_TWO[n - MIN_EXPONENT] as number;
}

/** The binary exponents by which the reduction steps, largest first: their sum is 1023. */
const REDUCTION_STEPS = [512, 256, 128, 64, 32, 16, 8, 4, 2, 1] as const;

/** `ln 2` and `1 / ln 2`, the binary64 numbers nearest to them. */
const LN2 = 0.6931471805599453;
const INV_LN2 = 1.4426950408889634;
/** The binary64 number nearest to √2, the bound of the logarithm's reduced argument. */
const SQRT2 = 1.4142135623730951;

/**
 * The terms of `ln m = 2·atanh(s)`, `s = (m − 1) / (m + 1)`: `2 / (2k + 1)` for
 * `k` from 0 to 10. With `|s| ≤ 0.1716` the first term left out is below
 * 1e-17 of the sum.
 */
const ATANH_TERMS: readonly number[] = Array.from({ length: 11 }, (_, k) => 2 / (2 * k + 1));

/**
 * The terms of `2^f = e^(f · ln 2)` for `0 ≤ f ≤ 1`: `1 / k!` for `k` from 0 to
 * 18, each the quotient of the one before by `k`. The first term left out,
 * `(ln 2)^19 / 19!`, is below 1e-20.
 */
const EXP_TERMS: readonly number[] = (() => {
  const terms = [1];
  for (let k = 1; k <= 18; k += 1) terms.push((terms[k - 1] as number) / k);
  return terms;
})();

/**
 * `x = m · 2^e` with `1 ≤ m < 2`, for a finite `x > 0`, exactly: every step
 * multiplies or divides by a power of two whose result is normal.
 */
export function splitPowerOfTwo(x: number): {
  readonly mantissa: number;
  readonly exponent: number;
} {
  let mantissa = x;
  let exponent = 0;
  // A subnormal number is first made normal; the steps below then reach any exponent.
  if (mantissa < powerOfTwo(-1_022)) {
    mantissa *= powerOfTwo(64);
    exponent -= 64;
  }
  for (const step of REDUCTION_STEPS) {
    if (mantissa >= powerOfTwo(step)) {
      mantissa /= powerOfTwo(step);
      exponent += step;
    }
  }
  for (const step of REDUCTION_STEPS) {
    if (mantissa < powerOfTwo(1 - step)) {
      mantissa *= powerOfTwo(step);
      exponent -= step;
    }
  }
  return { mantissa, exponent };
}

/**
 * `v · 2^n` for an integer `n`, rounded once: exact while the result is a
 * normal number, rounded by the one multiplication that makes it subnormal
 * (0 below the smallest subnormal), Infinity above the largest number.
 */
export function scaleByPowerOfTwo(v: number, n: number): number {
  if (n > MAX_EXPONENT) return scaleByPowerOfTwo(v * powerOfTwo(MAX_EXPONENT), n - MAX_EXPONENT);
  if (n >= -1_022) return v * powerOfTwo(n);
  const rest = n + 1_022;
  // Below 2^-1074 · 2^-1022 nothing of a number below 2^1024 is left.
  if (rest < MIN_EXPONENT) return 0;
  return v * powerOfTwo(-1_022) * powerOfTwo(rest);
}

/**
 * The natural logarithm of `m` from 1 to 2, reduced to `[√2 / 2, √2]` and
 * evaluated as `2·atanh(s)` by Horner's rule in `s²`; `m − 1` is exact.
 */
function lnMantissa(m: number): { readonly ln: number; readonly carry: number } {
  const carry = m > SQRT2 ? 1 : 0;
  const reduced = carry === 1 ? m / 2 : m;
  const s = (reduced - 1) / (reduced + 1);
  const s2 = s * s;
  let sum = ATANH_TERMS[ATANH_TERMS.length - 1] as number;
  for (let k = ATANH_TERMS.length - 2; k >= 0; k -= 1) sum = sum * s2 + (ATANH_TERMS[k] as number);
  return { ln: sum * s, carry };
}

/** `log2(x)` of a finite `x > 0` (D85.4). `log2(2^n)` is `n` exactly. */
export function log2(x: number): number {
  if (!(x > 0) || x === Infinity) throw new RangeError('log2 takes a finite number above 0.');
  const { mantissa, exponent } = splitPowerOfTwo(x);
  const { ln, carry } = lnMantissa(mantissa);
  return exponent + carry + ln * INV_LN2;
}

/** `2^f` for `0 ≤ f ≤ 1`, by Horner's rule in `f · ln 2`; `2^0` is 1 exactly. */
export function exp2Fraction(f: number): number {
  const y = f * LN2;
  let sum = EXP_TERMS[EXP_TERMS.length - 1] as number;
  for (let k = EXP_TERMS.length - 2; k >= 0; k -= 1) sum = sum * y + (EXP_TERMS[k] as number);
  return sum;
}

/** `2^x` of a finite `x` (D85.4): `2^n` is exact for every integer `n` from −1074 to 1023. */
export function exp2(x: number): number {
  if (!Number.isFinite(x)) throw new RangeError('exp2 takes a finite number.');
  const whole = Math.floor(x);
  return scaleByPowerOfTwo(exp2Fraction(x - whole), whole);
}
