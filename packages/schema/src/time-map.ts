/**
 * The time map of a clip (D82.1, D82.2) and the multiplier notation of a speed
 * (D82.11), beside the frame grid of D13 and the source time of D49.5. A video
 * node or an audio clip played at a speed `num / den` from 1/4 to 4, frozen
 * (speed 0), or reversed maps scene time to source time by an exact rational
 * map; the source time shown is the floor of it, in integer microseconds, and
 * the frame follows `sourceFrameIndex` unchanged.
 *
 * The fields of the map are those of a video node and an audio clip of schema
 * `0.24` (D82.8); `sourceTimeUs` and `sampledSourceRange` of the frame grid read
 * them through `sourceTimeOfScene` and `clipSourceRange`, and the audio plan
 * carries the map of a mapped sound, moved into composition time with
 * `shiftedTimeMap` (D82.6). The main entry of `@kadrion/schema` re-exports this
 * module, and the entry `@kadrion/schema/time-map` stays for a host that needs
 * nothing else. A host uses these functions to show a clip's source at a
 * speed, to retime words (`sceneTimesOfSource`, D82.7), and to read and write
 * a speed as a multiplier (`formatSpeed`, `parseSpeed`).
 *
 * `BigInt` keeps the arithmetic exact over the whole safe-integer range.
 */

/** The largest denominator of a speed (D82.1). */
export const MAX_SPEED_DEN = 1_000;

/** A speed `num / den` in lowest terms: 0 (a freeze frame of a video) or from 1/4 to 4 (D82.1). */
export interface Speed {
  readonly num: number;
  readonly den: number;
}

/**
 * The part of a video node or an audio clip that maps scene time to source time
 * (D82.1): its lifetime, the exact source start `sourceStartUs +
 * sourceStartRemainder / speed.den`, the speed, and the direction.
 */
export interface ClipTiming {
  readonly startUs: number;
  readonly durationUs: number;
  readonly sourceStartUs: number;
  /** From 0 to `speed.den − 1`; 0 for a freeze frame. */
  readonly sourceStartRemainder: number;
  readonly speed: Speed;
  /** Plays the same source range backwards; `false` for a freeze frame. */
  readonly reverse: boolean;
}

/**
 * The exact affine map of a clip (D82.1): at scene time `u`, the continuous
 * source time is `(intercept + slope · u) / den` microseconds. `slope` is
 * `speed.num` forwards, `−speed.num` reversed, and 0 for a freeze frame; `den`
 * is `speed.den`. The instant `u` covers `[u, u + 1)`, and the source time shown
 * at it is the floor of the lower end of its image: `(intercept + slope · u)`
 * forwards, `(intercept + slope · (u + 1))` reversed, over `den`. A trim, a
 * split, or a join (D82.2) leaves the map of every clip it keeps unchanged, so
 * whatever is computed from the map alone, such as the samples of a stretched
 * sound (D82.6), is the same for the halves of a split as for the whole.
 */
export interface ClipTimeMap {
  readonly intercept: bigint;
  readonly slope: number;
  readonly den: number;
}

/** A half-open range of microseconds, `[startUs, startUs + durationUs)`. */
export interface TimeRange {
  readonly startUs: number;
  readonly durationUs: number;
}

/** The exact source start of a clip moved by `d` microseconds of scene time (D82.2). */
export interface AdvancedSource {
  /** May be negative: a map advanced below 0 reads before the source (`source-range-exceeded`, D55.6). */
  readonly sourceStartUs: number;
  readonly sourceStartRemainder: number;
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
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${name} exceeds the safe integer range.`);
  }
  return Number(value);
}

/** `⌊a / b⌋` for `b > 0`, rounding towards −∞ where `BigInt` division rounds towards 0. */
function floorDiv(a: bigint, b: bigint): bigint {
  const quotient = a / b;
  return a % b < 0n ? quotient - 1n : quotient;
}

/** `⌈a / b⌉` for `b > 0`. */
function ceilDiv(a: bigint, b: bigint): bigint {
  return -floorDiv(-a, b);
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/**
 * Why a speed is not valid (D82.1), or `null` when it is: integers, `den` from
 * 1 to 1 000, `num` from 0 to 4 000, lowest terms, and either `0/1` or
 * `4 · num ≥ den` and `num ≤ 4 · den`.
 */
export function speedProblem(speed: Speed): string | null {
  const { num, den } = speed;
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den)) {
    return 'A speed is a pair of integers.';
  }
  if (den < 1 || den > MAX_SPEED_DEN)
    return `The den of a speed is from 1 to ${String(MAX_SPEED_DEN)}.`;
  if (num < 0 || num > 4 * MAX_SPEED_DEN) return 'The num of a speed is from 0 to 4000.';
  if (gcd(BigInt(num), BigInt(den)) !== 1n) return 'A speed is written in lowest terms.';
  if (num === 0) return null;
  if (4 * num < den || num > 4 * den) return 'A speed is 0 or from 1/4 to 4.';
  return null;
}

interface CheckedTiming {
  readonly start: bigint;
  readonly duration: bigint;
  readonly sourceStart: bigint;
  readonly remainder: bigint;
  readonly num: bigint;
  readonly den: bigint;
  readonly reverse: boolean;
}

function checked(clip: ClipTiming): CheckedTiming {
  const problem = speedProblem(clip.speed);
  if (problem !== null) throw new RangeError(problem);
  const remainder = safe('sourceStartRemainder', clip.sourceStartRemainder, 0);
  const den = BigInt(clip.speed.den);
  if (remainder >= den) {
    throw new RangeError('sourceStartRemainder must be below the den of the speed.');
  }
  if (clip.speed.num === 0 && clip.reverse) {
    throw new RangeError('A freeze frame is never reversed.');
  }
  return {
    start: safe('startUs', clip.startUs, 0),
    duration: safe('durationUs', clip.durationUs, 1),
    sourceStart: safe('sourceStartUs', clip.sourceStartUs, 0),
    remainder,
    num: BigInt(clip.speed.num),
    den,
    reverse: clip.reverse,
  };
}

/** `F(e) = sourceStartUs + ⌊(sourceStartRemainder + e · num) / den⌋` (D82.1). */
function forward(clip: CheckedTiming, elapsed: bigint): bigint {
  return clip.sourceStart + floorDiv(clip.remainder + elapsed * clip.num, clip.den);
}

/** The source time shown at elapsed time `e`: `F(e)` forwards, `F(durationUs − 1 − e)` reversed. */
function shown(clip: CheckedTiming, elapsed: bigint): bigint {
  return forward(clip, clip.reverse ? clip.duration - 1n - elapsed : elapsed);
}

/** The exact affine map of a clip from scene time to source time (D82.1). */
export function clipTimeMap(clip: ClipTiming): ClipTimeMap {
  const timing = checked(clip);
  const origin = timing.sourceStart * timing.den + timing.remainder;
  if (timing.reverse) {
    return {
      intercept: origin + (timing.start + timing.duration) * timing.num,
      slope: -clip.speed.num,
      den: clip.speed.den,
    };
  }
  return {
    intercept: origin - timing.start * timing.num,
    slope: clip.speed.num,
    den: clip.speed.den,
  };
}

/**
 * The source time shown at scene time `timeUs` (D82.1): the floor of the exact
 * map, `F(e)` forwards and `F(durationUs − 1 − e)` reversed, for
 * `e = timeUs − startUs`. The clip must be active at `timeUs`. At speed 1,
 * remainder 0, forwards, it is `sourceTimeUs` of D49.5.
 */
export function sourceTimeOfScene(clip: ClipTiming, timeUs: number): number {
  const timing = checked(clip);
  const time = safe('timeUs', timeUs, 0);
  if (time < timing.start || time - timing.start >= timing.duration) {
    throw new RangeError(`The clip is not active at ${String(timeUs)}.`);
  }
  return toSafeNumber('sourceTimeUs', shown(timing, time - timing.start));
}

/**
 * The map of a clip read in the time of what holds its holder (D82.6, D76): a
 * clip whose time 0 lies at `offsetUs` there, which may be negative, shows at
 * time `t` what its own map shows at `t − offsetUs`. The audio plan moves the map
 * of a sound into composition time with it, by the start of its scene and the
 * maps of the instances it is heard through, which play at speed 1.
 */
export function shiftedTimeMap(map: ClipTimeMap, offsetUs: number): ClipTimeMap {
  if (!Number.isSafeInteger(offsetUs)) {
    throw new RangeError(`offsetUs must be a safe integer, got ${String(offsetUs)}.`);
  }
  return {
    intercept: map.intercept - BigInt(map.slope) * BigInt(offsetUs),
    slope: map.slope,
    den: map.den,
  };
}

/**
 * The source time a map shows at the instant `timeUs` (D82.1): the floor of the
 * lower end of the image of `[timeUs, timeUs + 1)`, `⌊(intercept + slope · u) /
 * den⌋` forwards and at speed 0, `⌊(intercept + slope · (u + 1)) / den⌋`
 * reversed. For the map of a clip and an instant of its lifetime it is
 * `sourceTimeOfScene`.
 */
export function sourceTimeOfMap(map: ClipTimeMap, timeUs: number): number {
  if (!Number.isSafeInteger(timeUs)) {
    throw new RangeError(`timeUs must be a safe integer, got ${String(timeUs)}.`);
  }
  const at = BigInt(timeUs) + (map.slope < 0 ? 1n : 0n);
  return toSafeNumber(
    'sourceTimeUs',
    floorDiv(map.intercept + BigInt(map.slope) * at, BigInt(map.den)),
  );
}

/**
 * The source range a map shows over the instants `[startUs, startUs +
 * durationUs)` (D82.1, D82.6): from the least source time shown to the greatest,
 * plus 1. The audio plan checks the range a mapped sound hears with it.
 */
export function timeMapSourceRange(map: ClipTimeMap, range: TimeRange): TimeRange {
  safe('durationUs', range.durationUs, 1);
  const first = sourceTimeOfMap(map, range.startUs);
  const last = sourceTimeOfMap(map, range.startUs + range.durationUs - 1);
  const low = Math.min(first, last);
  return { startUs: low, durationUs: Math.max(first, last) - low + 1 };
}

/**
 * The scene times at which `sourceTimeUs` is shown (D82.1, D82.7): one interval
 * of the clip's lifetime, or `null` when the clip never shows that source
 * time. A host retimes a timed word onto a clip at another speed with it. A
 * freeze frame shows its one source time over its whole lifetime.
 */
export function sceneTimesOfSource(clip: ClipTiming, sourceTimeUs: number): TimeRange | null {
  const timing = checked(clip);
  const delta = safe('sourceTimeUs', sourceTimeUs, 0) - timing.sourceStart;
  const last = timing.duration - 1n;
  let low: bigint;
  let high: bigint;
  if (timing.num === 0n) {
    if (delta !== 0n) return null;
    low = 0n;
    high = last;
  } else {
    // ⌊(r + e · num) / den⌋ = delta ⇔ delta · den ≤ r + e · num < (delta + 1) · den.
    low = ceilDiv(delta * timing.den - timing.remainder, timing.num);
    high = floorDiv((delta + 1n) * timing.den - timing.remainder - 1n, timing.num);
    if (timing.reverse) [low, high] = [last - high, last - low];
  }
  if (low < 0n) low = 0n;
  if (high > last) high = last;
  if (low > high) return null;
  return {
    startUs: toSafeNumber('startUs', timing.start + low),
    durationUs: toSafeNumber('durationUs', high - low + 1n),
  };
}

/**
 * The source range a clip samples (D82.1, D49.6): its lifetime cut to its
 * scene, `c = min(durationUs, sceneDurationUs − startUs)`, from `F(0)` to
 * `F(c − 1)` forwards and from `F(durationUs − c)` to `F(durationUs − 1)`
 * reversed, as the half-open range `[first, last + 1)`. A freeze frame samples
 * one microsecond. `null` when the lifetime starts at or after the end of the
 * scene. At speed 1, remainder 0, forwards, it is `sampledSourceRange`.
 */
export function clipSourceRange(clip: ClipTiming, sceneDurationUs: number): TimeRange | null {
  const timing = checked(clip);
  const end = safe('sceneDurationUs', sceneDurationUs, 1);
  if (timing.start >= end) return null;
  const cut = timing.duration < end - timing.start ? timing.duration : end - timing.start;
  const firstElapsed = timing.reverse ? timing.duration - cut : 0n;
  const lastElapsed = timing.reverse ? timing.duration - 1n : cut - 1n;
  const first = forward(timing, firstElapsed);
  const last = forward(timing, lastElapsed);
  return {
    startUs: toSafeNumber('startUs', first),
    durationUs: toSafeNumber('durationUs', last - first + 1n),
  };
}

/**
 * The exact source start of a clip moved by `deltaUs` microseconds of scene
 * time, of either sign (D82.2): `q = sourceStartRemainder + d · num`,
 * `sourceStartUs + ⌊q / den⌋`, and `q mod den`. Then `F'(e) = F(e + d)` for
 * every `e`, with no rounding. A freeze frame advances by 0. Which way a command
 * advances a reversed clip is the table of D82.2.
 */
export function advanceClipSource(clip: ClipTiming, deltaUs: number): AdvancedSource {
  const timing = checked(clip);
  if (!Number.isSafeInteger(deltaUs)) {
    throw new RangeError(`deltaUs must be a safe integer, got ${String(deltaUs)}.`);
  }
  const q = timing.remainder + BigInt(deltaUs) * timing.num;
  return {
    sourceStartUs: toSafeNumber('sourceStartUs', timing.sourceStart + floorDiv(q, timing.den)),
    sourceStartRemainder: Number(q - floorDiv(q, timing.den) * timing.den),
  };
}

// The multiplier notation (D82.11).

/** What `parseSpeed` gives: the exact speed, or a refusal with `speed-invalid`. */
export type SpeedReading =
  | { readonly ok: true; readonly speed: Speed }
  | {
      readonly ok: false;
      readonly code: 'speed-invalid';
      readonly message: string;
      /** The nearest speed with `den` up to 1 000, when the value is in bounds but has no exact speed. */
      readonly nearest: Speed | null;
    };

const DECIMAL = /^(\d*)(?:\.(\d*))?$/;
const FRACTION = /^(\d+)\/(\d+)$/;

function refused(message: string, nearest: Speed | null = null): SpeedReading {
  return { ok: false, code: 'speed-invalid', message, nearest };
}

/** The best rational approximation of `p / q > 0` with a den up to `limit`, the smaller den on a tie. */
function nearestRational(p: bigint, q: bigint, limit: bigint): { num: bigint; den: bigint } {
  // Convergents h/k of the continued fraction of p/q; (h0, k0) is the one before (h1, k1).
  let [h0, k0, h1, k1] = [0n, 1n, 1n, 0n];
  let [x, y] = [p, q];
  while (y !== 0n) {
    const a = x / y;
    const k2 = a * k1 + k0;
    if (k2 > limit) {
      // The best approximation is the last convergent or the largest semiconvergent within the limit.
      const t = (limit - k0) / k1;
      const semi = { num: t * h1 + h0, den: t * k1 + k0 };
      const last = { num: h1, den: k1 };
      // Compare |p/q − a/b| exactly: |p·b − a·q| / (q·b).
      const distance = (c: { num: bigint; den: bigint }): bigint => {
        const d = p * c.den - c.num * q;
        return d < 0n ? -d : d;
      };
      const semiDistance = distance(semi) * last.den;
      const lastDistance = distance(last) * semi.den;
      if (semiDistance < lastDistance) return semi;
      if (lastDistance < semiDistance) return last;
      return semi.den < last.den ? semi : last;
    }
    [h0, k0, h1, k1] = [h1, k1, a * h1 + h0, k2];
    [x, y] = [y, x - a * y];
  }
  return { num: h1, den: k1 };
}

/** `num / den`, reduced and checked against the bounds and the den of D82.1. */
function reading(num: bigint, den: bigint, written: string): SpeedReading {
  if (den === 0n) return refused(`${written} is not a speed: its den is 0.`);
  const divisor = gcd(num, den);
  const [n, d] = divisor === 0n ? [0n, 1n] : [num / divisor, den / divisor];
  if (n === 0n) return { ok: true, speed: { num: 0, den: 1 } };
  if (4n * n < d || n > 4n * d) {
    return refused(`${written} is outside the speeds x0.25 to x4 (or x0 for a freeze frame).`);
  }
  if (d > BigInt(MAX_SPEED_DEN)) {
    const near = nearestRational(n, d, BigInt(MAX_SPEED_DEN));
    const nearest = { num: Number(near.num), den: Number(near.den) };
    return refused(
      `${written} has no exact speed with a denominator up to ${String(MAX_SPEED_DEN)}; the nearest is ${formatSpeed(nearest)}`,
      nearest,
    );
  }
  return { ok: true, speed: { num: Number(n), den: Number(d) } };
}

function readString(text: string, written: string): SpeedReading {
  const trimmed = text.trim();
  const body = /^[xX×]/.test(trimmed) ? trimmed.slice(1) : trimmed;
  const fraction = FRACTION.exec(body);
  if (fraction !== null) {
    return reading(BigInt(fraction[1] ?? '0'), BigInt(fraction[2] ?? '0'), written);
  }
  const decimal = DECIMAL.exec(body);
  const whole = decimal?.[1] ?? '';
  const part = decimal?.[2] ?? '';
  if (decimal === null || whole.length + part.length === 0) {
    return refused(
      `${JSON.stringify(written)} is not a speed: write a multiplier such as x0.5, x2, or x1/3.`,
    );
  }
  return reading(BigInt(`${whole}${part}` || '0'), 10n ** BigInt(part.length), written);
}

/**
 * The exact speed of a multiplier, a number, or `{ num, den }` (D82.11), or a
 * refusal with `speed-invalid`. A string is read after white space around it
 * as an optional `x` (`x`, `X`, or `×`) and a decimal or a fraction
 * `<integer>/<integer>`; a number through its shortest round-trip decimal; an
 * object as `num / den`, integers with `den ≥ 1`. Every value is reduced to
 * lowest terms; one whose den is then above 1 000 is refused, never snapped,
 * and the refusal names the nearest speed. `x0` is the freeze frame of a video;
 * an audio clip refuses it where the speed is set (D82.3).
 */
export function parseSpeed(value: unknown): SpeedReading {
  if (typeof value === 'string') return readString(value, value.trim());
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return refused(`${String(value)} is not a finite speed.`);
    if (value < 0) return refused(`${String(value)} is negative; reverse is its own field.`);
    const text = String(value);
    if (/e/i.test(text)) return refused(`${text} is outside the speeds x0.25 to x4.`);
    return readString(text, text);
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const keys = Object.keys(value).sort();
    const { num, den } = value as { num?: unknown; den?: unknown };
    if (
      keys.length !== 2 ||
      keys[0] !== 'den' ||
      keys[1] !== 'num' ||
      typeof num !== 'number' ||
      typeof den !== 'number' ||
      !Number.isSafeInteger(num) ||
      !Number.isSafeInteger(den) ||
      num < 0 ||
      den < 1
    ) {
      return refused('A speed object is { num, den }: integers, num from 0 and den from 1.');
    }
    return reading(BigInt(num), BigInt(den), `${String(num)}/${String(den)}`);
  }
  return refused('A speed is a multiplier such as "x0.5", a number, or { num, den }.');
}

/**
 * The multiplier of a valid speed (D82.11): `x` and its decimal when the
 * decimal ends, in the shortest form (`x0.25`, `x1.5`, `x2`), and otherwise its
 * fraction in lowest terms (`x1/3`); `x0` for a freeze frame.
 * `parseSpeed(formatSpeed(s))` is `s` for every valid speed.
 */
export function formatSpeed(speed: Speed): string {
  const problem = speedProblem(speed);
  if (problem !== null) throw new RangeError(problem);
  let den = speed.den;
  let digits = 0;
  // The decimal ends exactly when den has no prime factor but 2 and 5.
  while (den % 2 === 0 || den % 5 === 0) {
    den = den % 2 === 0 ? den / 2 : den / 5;
    digits += 1;
  }
  if (den !== 1) return `x${String(speed.num)}/${String(speed.den)}`;
  const scale = 10 ** digits;
  const scaled = (speed.num * scale) / speed.den;
  const whole = Math.floor(scaled / scale);
  const fraction = String(scaled - whole * scale)
    .padStart(digits, '0')
    .replace(/0+$/, '');
  return fraction === '' ? `x${String(whole)}` : `x${String(whole)}.${fraction}`;
}
