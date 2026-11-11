/**
 * The time map of a clip (D82.1, D82.2) and the multiplier notation of a speed
 * (D82.11). The map is checked against an independent rational reference for
 * 2 000 seeded clips, forwards and reversed; the refusals of `parseSpeed`
 * against a brute-force search over every den up to 1 000.
 */
import { describe, expect, it } from 'vitest';

import { sampledSourceRange, sourceTimeUs } from '../src/index.js';
import {
  advanceClipSource,
  clipSourceRange,
  clipTimeMap,
  formatSpeed,
  MAX_SPEED_DEN,
  parseSpeed,
  sceneTimesOfSource,
  sourceTimeOfScene,
  speedProblem,
  type ClipTiming,
  type Speed,
} from '../src/time-map.js';

/** A small seeded generator (mulberry32), so every run replays the same sequence. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** An exact fraction `n / d`, `d > 0`, written apart from the code under test. */
class Fraction {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }
  static of(n: number | bigint, d: number | bigint = 1n): Fraction {
    return new Fraction(BigInt(n), BigInt(d));
  }
  plus(other: Fraction): Fraction {
    return new Fraction(this.n * other.d + other.n * this.d, this.d * other.d);
  }
  times(other: Fraction): Fraction {
    return new Fraction(this.n * other.n, this.d * other.d);
  }
  floor(): bigint {
    const q = this.n / this.d;
    return this.n % this.d !== 0n && this.n < 0n ? q - 1n : q;
  }
}

/** The source time shown at elapsed time `e` by the words of D82.1, in fractions. */
function reference(clip: ClipTiming, elapsed: number): number {
  const read = clip.reverse ? clip.durationUs - 1 - elapsed : elapsed;
  const exact = Fraction.of(clip.sourceStartUs)
    .plus(Fraction.of(clip.sourceStartRemainder, clip.speed.den))
    .plus(Fraction.of(read).times(Fraction.of(clip.speed.num, clip.speed.den)));
  return Number(exact.floor());
}

function randomSpeed(next: () => number): Speed {
  if (next() < 0.05) return { num: 0, den: 1 };
  for (;;) {
    const den = 1 + Math.floor(next() * MAX_SPEED_DEN);
    const num = Math.ceil(den / 4) + Math.floor(next() * (4 * den - Math.ceil(den / 4) + 1));
    if (gcd(num, den) === 1) return { num, den };
  }
}

function randomClip(next: () => number): ClipTiming {
  const speed = randomSpeed(next);
  return {
    startUs: Math.floor(next() * 5_000_000),
    durationUs: 1 + Math.floor(next() * 3_000_000),
    sourceStartUs: Math.floor(next() * 10_000_000),
    sourceStartRemainder: speed.num === 0 ? 0 : Math.floor(next() * speed.den),
    speed,
    reverse: speed.num !== 0 && next() < 0.5,
  };
}

const CLIPS = (() => {
  const next = random(82);
  return Array.from({ length: 2_000 }, () => randomClip(next));
})();

/** Elapsed times to check: the ends of the lifetime and some in between. */
function elapsedTimes(clip: ClipTiming, next: () => number): number[] {
  const last = clip.durationUs - 1;
  return [
    0,
    1,
    last - 1,
    last,
    ...Array.from({ length: 6 }, () => Math.floor(next() * last)),
  ].filter((e) => e >= 0 && e <= last);
}

describe('the source time of a clip (D82.1)', () => {
  it('equals an independent rational reference for 2 000 seeded clips, forwards and reversed', () => {
    const next = random(1);
    let checked = 0;
    for (const clip of CLIPS) {
      for (const elapsed of elapsedTimes(clip, next)) {
        expect(sourceTimeOfScene(clip, clip.startUs + elapsed)).toBe(reference(clip, elapsed));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(15_000);
    expect(CLIPS.filter((clip) => clip.reverse).length).toBeGreaterThan(800);
    expect(CLIPS.filter((clip) => clip.speed.num === 0).length).toBeGreaterThan(50);
  });

  it('is the floor of the exact map, read from the lower end of the image of an instant', () => {
    const next = random(2);
    for (const clip of CLIPS.slice(0, 500)) {
      const map = clipTimeMap(clip);
      for (const elapsed of elapsedTimes(clip, next)) {
        const time = BigInt(clip.startUs + elapsed);
        const at = clip.reverse ? time + 1n : time;
        const numerator = map.intercept + BigInt(map.slope) * at;
        const floor =
          numerator / BigInt(map.den) -
          (numerator < 0n && numerator % BigInt(map.den) !== 0n ? 1n : 0n);
        expect(sourceTimeOfScene(clip, clip.startUs + elapsed)).toBe(Number(floor));
      }
    }
  });

  it('is sourceTimeUs of D49.5 at speed 1, remainder 0, forwards', () => {
    const clip = {
      startUs: 500_000,
      durationUs: 1_000_000,
      sourceStartUs: 1_000_000,
      sourceStartRemainder: 0,
      speed: { num: 1, den: 1 },
      reverse: false,
    };
    for (const time of [500_000, 500_001, 999_999, 1_499_999]) {
      expect(sourceTimeOfScene(clip, time)).toBe(sourceTimeUs(clip, time));
    }
    expect(clipSourceRange(clip, 1_200_000)).toEqual(sampledSourceRange(clip, 1_200_000));
    expect(clipSourceRange(clip, 3_000_000)).toEqual(sampledSourceRange(clip, 3_000_000));
  });

  it('holds one frame for a freeze and plays the range backwards in reverse', () => {
    const frozen = {
      startUs: 0,
      durationUs: 2_000_000,
      sourceStartUs: 3_000_000,
      sourceStartRemainder: 0,
      speed: { num: 0, den: 1 },
      reverse: false,
    };
    expect(sourceTimeOfScene(frozen, 0)).toBe(3_000_000);
    expect(sourceTimeOfScene(frozen, 1_999_999)).toBe(3_000_000);
    // Half speed, a third of a microsecond into the source, reversed: 2 s of scene read 1 s.
    const reversed = {
      startUs: 1_000,
      durationUs: 2_000_000,
      sourceStartUs: 10,
      sourceStartRemainder: 1,
      speed: { num: 1, den: 2 },
      reverse: true,
    };
    // F(e) = 10 + ⌊(1 + e) / 2⌋; reversed, e = 0 shows F(1 999 999) = 10 + 1 000 000.
    expect(sourceTimeOfScene(reversed, 1_000)).toBe(1_000_010);
    expect(sourceTimeOfScene(reversed, 1_000 + 1_999_999)).toBe(10);
  });

  it('is undefined outside the lifetime and refuses a broken timing', () => {
    const clip = CLIPS[0] as ClipTiming;
    expect(() => sourceTimeOfScene(clip, clip.startUs + clip.durationUs)).toThrow(RangeError);
    expect(() => sourceTimeOfScene({ ...clip, speed: { num: 2, den: 4 } }, clip.startUs)).toThrow(
      'lowest terms',
    );
    expect(() =>
      sourceTimeOfScene(
        { ...clip, speed: { num: 3, den: 7 }, sourceStartRemainder: 7 },
        clip.startUs,
      ),
    ).toThrow(RangeError);
    expect(() =>
      sourceTimeOfScene(
        { ...clip, speed: { num: 0, den: 1 }, sourceStartRemainder: 0, reverse: true },
        clip.startUs,
      ),
    ).toThrow('never reversed');
  });
});

describe('the exact affine map (D82.1, D82.2)', () => {
  it('is the same for both halves of a split as for the whole, forwards and reversed', () => {
    const next = random(3);
    for (const clip of CLIPS) {
      if (clip.durationUs < 2) continue;
      const at = 1 + Math.floor(next() * (clip.durationUs - 1));
      // The table of D82.2: forwards the second half advances by d, reversed the first by D − d.
      const firstSource = clip.reverse ? advanceClipSource(clip, clip.durationUs - at) : clip;
      const secondSource = clip.reverse ? clip : advanceClipSource(clip, at);
      if (firstSource.sourceStartUs < 0 || secondSource.sourceStartUs < 0) continue;
      const first = { ...clip, ...firstSource, durationUs: at };
      const second = {
        ...clip,
        ...secondSource,
        startUs: clip.startUs + at,
        durationUs: clip.durationUs - at,
      };
      expect(clipTimeMap(first)).toEqual(clipTimeMap(clip));
      expect(clipTimeMap(second)).toEqual(clipTimeMap(clip));
      for (const elapsed of [0, at - 1, at, clip.durationUs - 1]) {
        const time = clip.startUs + elapsed;
        const half = elapsed < at ? first : second;
        expect(sourceTimeOfScene(half, time)).toBe(sourceTimeOfScene(clip, time));
      }
    }
  });
});

describe('advancing the map (D82.2)', () => {
  it('moves it by d with no rounding: F′(e) = F(e + d), for d of either sign', () => {
    const next = random(4);
    for (const clip of CLIPS) {
      const forwards = { ...clip, reverse: false };
      const delta = Math.floor((next() - 0.5) * 2 * clip.durationUs);
      const moved = { ...forwards, ...advanceClipSource(forwards, delta) };
      expect(moved.sourceStartRemainder).toBeGreaterThanOrEqual(0);
      expect(moved.sourceStartRemainder).toBeLessThan(clip.speed.den);
      if (moved.sourceStartUs < 0) {
        // Below 0 the map reads before the source: a command refuses it (D55.6).
        expect(reference(forwards, delta)).toBeLessThan(0);
        continue;
      }
      for (const elapsed of [0, Math.floor(next() * clip.durationUs), clip.durationUs - 1]) {
        if (elapsed + delta < 0) continue;
        expect(reference(moved, elapsed)).toBe(reference(forwards, elapsed + delta));
      }
    }
  });

  it('keeps a freeze frame where it is', () => {
    const frozen = {
      ...(CLIPS[0] as ClipTiming),
      speed: { num: 0, den: 1 },
      sourceStartRemainder: 0,
      reverse: false,
    };
    expect(advanceClipSource(frozen, 123_456)).toEqual({
      sourceStartUs: frozen.sourceStartUs,
      sourceStartRemainder: 0,
    });
  });
});

describe('the sampled source range (D82.1)', () => {
  it('holds every source time shown in the lifetime cut to the scene, and no other', () => {
    const next = random(5);
    for (const clip of CLIPS.slice(0, 400)) {
      const scene = clip.startUs + 1 + Math.floor(next() * clip.durationUs * 1.5);
      const range = clipSourceRange(clip, scene);
      const cut = Math.min(clip.durationUs, scene - clip.startUs);
      const shown = [0, cut - 1].map((elapsed) => reference(clip, elapsed));
      const low = Math.min(...shown);
      const high = Math.max(...shown);
      expect(range).toEqual({ startUs: low, durationUs: high - low + 1 });
    }
  });

  it('is one microsecond for a freeze frame and null after the end of the scene', () => {
    const frozen = {
      startUs: 100,
      durationUs: 1_000,
      sourceStartUs: 42,
      sourceStartRemainder: 0,
      speed: { num: 0, den: 1 },
      reverse: false,
    };
    expect(clipSourceRange(frozen, 10_000)).toEqual({ startUs: 42, durationUs: 1 });
    expect(clipSourceRange(frozen, 100)).toBeNull();
  });
});

describe('the scene times of a source time (D82.1, D82.7)', () => {
  it('is exactly the set of scene times that show it, for 2 000 seeded clips', () => {
    const next = random(6);
    for (const clip of CLIPS) {
      const elapsed = Math.floor(next() * clip.durationUs);
      const source = reference(clip, elapsed);
      const times = sceneTimesOfSource(clip, source);
      expect(times).not.toBeNull();
      if (times === null) continue;
      const first = times.startUs - clip.startUs;
      const last = first + times.durationUs - 1;
      expect(first).toBeLessThanOrEqual(elapsed);
      expect(last).toBeGreaterThanOrEqual(elapsed);
      expect(reference(clip, first)).toBe(source);
      expect(reference(clip, last)).toBe(source);
      if (first > 0) expect(reference(clip, first - 1)).not.toBe(source);
      if (last < clip.durationUs - 1) expect(reference(clip, last + 1)).not.toBe(source);
    }
  });

  it('is null for a source time the clip skips or never reaches', () => {
    const fast = {
      startUs: 0,
      durationUs: 10,
      sourceStartUs: 100,
      sourceStartRemainder: 0,
      speed: { num: 4, den: 1 },
      reverse: false,
    };
    expect(sceneTimesOfSource(fast, 104)).toEqual({ startUs: 1, durationUs: 1 });
    expect(sceneTimesOfSource(fast, 105)).toBeNull();
    expect(sceneTimesOfSource(fast, 99)).toBeNull();
    expect(sceneTimesOfSource(fast, 140)).toBeNull();
    const frozen = { ...fast, speed: { num: 0, den: 1 } };
    expect(sceneTimesOfSource(frozen, 100)).toEqual({ startUs: 0, durationUs: 10 });
    expect(sceneTimesOfSource(frozen, 101)).toBeNull();
  });
});

/** Every valid speed with a den up to 1 000. */
function* validSpeeds(): Generator<Speed> {
  yield { num: 0, den: 1 };
  for (let den = 1; den <= MAX_SPEED_DEN; den += 1) {
    for (let num = Math.ceil(den / 4); num <= 4 * den; num += 1) {
      if (gcd(num, den) === 1) yield { num, den };
    }
  }
}

/** The nearest speed with a den up to 1 000 by trying every den, the smaller den on a tie. */
function bruteNearest(num: bigint, den: bigint): Speed {
  let best = { num: 0n, den: 1n };
  let bestDistance: [bigint, bigint] | null = null;
  for (let d = 1n; d <= BigInt(MAX_SPEED_DEN); d += 1n) {
    const below = (num * d) / den;
    for (const n of [below, below + 1n]) {
      const difference = num * d - n * den;
      const distance: [bigint, bigint] = [difference < 0n ? -difference : difference, den * d];
      if (bestDistance === null || distance[0] * bestDistance[1] < bestDistance[0] * distance[1]) {
        best = { num: n, den: d };
        bestDistance = distance;
      }
    }
  }
  const divisor = BigInt(gcd(Number(best.num), Number(best.den)));
  return { num: Number(best.num / divisor), den: Number(best.den / divisor) };
}

describe('a speed written as a multiplier (D82.11)', () => {
  it('reads every row of the table of D82.11', () => {
    const rows: [unknown[], Speed, string][] = [
      [['x0.5', 0.5, '0.5', { num: 1, den: 2 }], { num: 1, den: 2 }, 'x0.5'],
      [['x2', 2, 'X2', '×2'], { num: 2, den: 1 }, 'x2'],
      [['x1/3', { num: 1, den: 3 }], { num: 1, den: 3 }, 'x1/3'],
      [['x0.333'], { num: 333, den: 1000 }, 'x0.333'],
      [['x0', 0], { num: 0, den: 1 }, 'x0'],
    ];
    for (const [inputs, stored, shown] of rows) {
      for (const input of inputs)
        expect(parseSpeed(input), JSON.stringify(input)).toEqual({ ok: true, speed: stored });
      expect(formatSpeed(stored)).toBe(shown);
    }
    expect(parseSpeed('x0.3333')).toEqual({
      ok: false,
      code: 'speed-invalid',
      message: 'x0.3333 has no exact speed with a denominator up to 1000; the nearest is x1/3',
      nearest: { num: 1, den: 3 },
    });
    for (const refused of ['x0.2', 'x5', 'x-2', 'fast']) {
      const reading = parseSpeed(refused);
      expect(reading.ok, refused).toBe(false);
      if (!reading.ok) {
        expect(reading.code).toBe('speed-invalid');
        expect(reading.nearest).toBeNull();
      }
    }
  });

  it('reads the forms D82.11 names and refuses every other', () => {
    expect(parseSpeed('  x1.25 ')).toEqual({ ok: true, speed: { num: 5, den: 4 } });
    expect(parseSpeed(1.25)).toEqual({ ok: true, speed: { num: 5, den: 4 } });
    expect(parseSpeed({ num: 2, den: 4 })).toEqual({ ok: true, speed: { num: 1, den: 2 } });
    expect(parseSpeed('x.5')).toEqual({ ok: true, speed: { num: 1, den: 2 } });
    expect(parseSpeed('2/8')).toEqual({ ok: true, speed: { num: 1, den: 4 } });
    expect(parseSpeed('x0/7')).toEqual({ ok: true, speed: { num: 0, den: 1 } });
    expect(parseSpeed(0.1 + 0.2)).toMatchObject({ ok: false, nearest: { num: 3, den: 10 } });
    for (const value of [
      'x 2',
      '+2',
      '2e0',
      'x2x',
      'x1/0',
      '1.2.3',
      '',
      'x',
      '.',
      -2,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1e-7,
      1e21,
      0.24,
      4.001,
      { num: 1.5, den: 2 },
      { num: 1, den: 0 },
      { num: -1, den: 2 },
      { num: 1, den: 2, extra: true },
      true,
      null,
      [1, 2],
    ]) {
      expect(parseSpeed(value), JSON.stringify(value)).toMatchObject({
        ok: false,
        code: 'speed-invalid',
      });
    }
  });

  it('formats every valid speed so that it reads back as itself, and refuses an invalid one', () => {
    let count = 0;
    const wrong: string[] = [];
    const notation = /^x(\d+(\.\d*[1-9])?|\d+\/\d+)$/;
    for (const speed of validSpeeds()) {
      const text = formatSpeed(speed);
      const reading = parseSpeed(text);
      if (
        !notation.test(text) ||
        !reading.ok ||
        reading.speed.num !== speed.num ||
        reading.speed.den !== speed.den
      ) {
        wrong.push(`${String(speed.num)}/${String(speed.den)} ${text}`);
      }
      count += 1;
    }
    expect(wrong).toEqual([]);
    expect(count).toBeGreaterThan(1_000_000);
    expect(() => formatSpeed({ num: 1, den: 5 })).toThrow(RangeError);
    expect(() => formatSpeed({ num: 2, den: 2 })).toThrow(RangeError);
    expect(speedProblem({ num: 0, den: 2 })).not.toBeNull();
    expect(speedProblem({ num: 1, den: 1_001 })).not.toBeNull();
  });

  it('names the nearest speed a brute-force search over every den up to 1 000 finds', () => {
    const next = random(11);
    const values: string[] = ['x0.3333', 'x0.25000001', 'x3.99999999', 'x1.0005', 'x0.6180339887'];
    for (let index = 0; index < 200; index += 1) {
      const digits = 4 + Math.floor(next() * 8);
      const value = 0.25 + next() * 3.75;
      values.push(`x${value.toFixed(digits)}`);
    }
    let refusals = 0;
    for (const value of values) {
      const reading = parseSpeed(value);
      if (reading.ok) continue;
      refusals += 1;
      const decimal = value.slice(1);
      const [whole = '', part = ''] = decimal.split('.');
      const expected = bruteNearest(BigInt(whole + part), 10n ** BigInt(part.length));
      expect(reading.nearest, value).toEqual(expected);
      expect(reading.message).toContain(`the nearest is ${formatSpeed(expected)}`);
    }
    expect(refusals).toBeGreaterThan(150);
  });
});
