/**
 * `stretchSound` (D82.6, PR-59): the samples of a clip at another speed or
 * reversed. Its samples depend on the map and the source only, so any range
 * equals the same samples of the whole, and the halves of a split equal the
 * whole sample for sample; speed 1 is the source's samples, forwards
 * unchanged and reversed in reverse order; the pitch of a sine is kept within
 * 1 %; and the SHA-256 of every case is pinned, so that a change of the
 * constants, which changes output samples, cannot pass unseen.
 */
import { createHash } from 'node:crypto';

import {
  advanceClipSource,
  clipTimeMap,
  type ClipTiming,
  type ClipTimeMap,
  type Speed,
} from '@kadrion/schema/time-map';
import { generateSoundFixture } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { sampleAt } from '../src/index.js';
import {
  STRETCH_GRAIN,
  STRETCH_HOP,
  STRETCH_RADIUS,
  stretchSound,
  stretchSourceRange,
  type StretchSource,
} from '../src/stretch.js';

import { CHECKED_SPEEDS, wholeClip, zeroCrossingRate } from './stretch-support.js';
import pinned from './stretch.sha256.json' with { type: 'json' };

const SPEECH = generateSoundFixture('speech', 1);
const MUSIC = generateSoundFixture('music', 1);
const SINE = generateSoundFixture('sine', 1);

function whole(samples: Float32Array): StretchSource {
  return { channels: [samples], startSample: 0 };
}

function sha256(samples: Float32Array): string {
  return createHash('sha256')
    .update(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
    .digest('hex');
}

function heard(
  map: ClipTimeMap,
  source: StretchSource,
  startSample: number,
  sampleCount: number,
): Float32Array {
  return stretchSound({ map, source, startSample, sampleCount })[0] as Float32Array;
}

/** The samples of a clip as a plan entry would place them: from the sample of its start to the sample of its end. */
function samplesOf(clip: ClipTiming, source: StretchSource): Float32Array {
  const first = Number(sampleAt(BigInt(clip.startUs)));
  const end = Number(sampleAt(BigInt(clip.startUs + clip.durationUs)));
  return heard(clipTimeMap(clip), source, first, end - first);
}

function speedName(speed: Speed): string {
  return `${String(speed.num)}/${String(speed.den)}`;
}

/**
 * The SHA-256 of the 32-bit samples of every fixture at every checked speed,
 * forwards and reversed, for the whole one-second source. They are what Node
 * computes; the pinned test compares Chromium with Node.
 */
const PINNED = pinned as Record<string, string>;

describe('stretchSound (D82.6)', () => {
  it('has a hop of half a grain and a search within one hop', () => {
    expect(STRETCH_HOP * 2).toBe(STRETCH_GRAIN);
    expect(STRETCH_RADIUS).toBeLessThanOrEqual(STRETCH_HOP);
  });

  it('gives one channel per source channel, as many samples as asked for', () => {
    const { map } = wholeClip({ num: 1, den: 2 }, false, SPEECH.length);
    const half = SPEECH.map((value) => value / 2);
    const out = stretchSound({
      map,
      source: { channels: [SPEECH, half], startSample: 0 },
      startSample: 1_000,
      sampleCount: 4_321,
    });
    expect(out).toHaveLength(2);
    expect(out.map((channel) => channel.length)).toEqual([4_321, 4_321]);
    // One shift for all channels: a channel at half the level is the other at half the level.
    expect([...(out[1] as Float32Array)]).toEqual([...(out[0] as Float32Array)].map((v) => v / 2));
    expect(stretchSound({ map, source: whole(SPEECH), startSample: 0, sampleCount: 0 })).toEqual([
      new Float32Array(0),
    ]);
  });

  it('plays speed 1 forwards as the source samples, byte for byte', () => {
    const clip = {
      startUs: 125_000,
      durationUs: 500_000,
      sourceStartUs: 250_000,
      sourceStartRemainder: 0,
      speed: { num: 1, den: 1 },
      reverse: false,
    };
    // 125 000 µs is sample 6 000 and 250 000 µs sample 12 000.
    expect(sha256(samplesOf(clip, whole(SPEECH)))).toBe(
      sha256(SPEECH.slice(12_000, 12_000 + 24_000)),
    );
  });

  it('plays speed 1 reversed as the source samples in reverse order, with no grains', () => {
    const clip = {
      startUs: 125_000,
      durationUs: 500_000,
      sourceStartUs: 250_000,
      sourceStartRemainder: 0,
      speed: { num: 1, den: 1 },
      reverse: true,
    };
    const expected = SPEECH.slice(12_000, 12_000 + 24_000).reverse();
    expect(sha256(samplesOf(clip, whole(SPEECH)))).toBe(sha256(expected));
  });

  it.each(
    [...CHECKED_SPEEDS, { num: 2, den: 3 }, { num: 7, den: 5 }].map(
      (speed) => [speedName(speed), speed] as const,
    ),
  )(
    'hears the halves of a split at %s as the whole, sample for sample, forwards and reversed',
    (_, speed) => {
      for (const reverse of [false, true]) {
        const clip: ClipTiming = {
          startUs: 250_000,
          durationUs: Math.floor((400_000 * speed.den) / speed.num),
          sourceStartUs: 100_000,
          sourceStartRemainder: speed.den - 1,
          speed,
          reverse,
        };
        // A split on the 125 µs grid, where a sample boundary falls (D55.4).
        const at = 125 * Math.floor(clip.durationUs / 375);
        const firstSource = reverse ? advanceClipSource(clip, clip.durationUs - at) : clip;
        const secondSource = reverse ? clip : advanceClipSource(clip, at);
        const first = { ...clip, ...firstSource, durationUs: at };
        const second = {
          ...clip,
          ...secondSource,
          startUs: clip.startUs + at,
          durationUs: clip.durationUs - at,
        };
        const all = samplesOf(clip, whole(MUSIC));
        const halves = new Float32Array([
          ...samplesOf(first, whole(MUSIC)),
          ...samplesOf(second, whole(MUSIC)),
        ]);
        expect(sha256(halves), `${speedName(speed)} ${String(reverse)}`).toBe(sha256(all));
      }
    },
  );

  it('computes any range from the source samples stretchSourceRange names, as from the whole', () => {
    const cases: [Speed, boolean, number, number][] = [
      [{ num: 1, den: 4 }, false, 30_000, 20_000],
      [{ num: 4, den: 1 }, false, 0, 9_000],
      [{ num: 3, den: 2 }, true, 5_000, 12_345],
      [{ num: 1, den: 2 }, true, 70_000, 25_000],
      [{ num: 1, den: 1 }, true, 10_000, 1_000],
    ];
    for (const [speed, reverse, start, count] of cases) {
      const { map } = wholeClip(speed, reverse, SPEECH.length);
      const range = stretchSourceRange(map, start, count);
      expect(range.startSample).toBeGreaterThanOrEqual(0);
      expect(range.startUs).toBe(Math.floor((range.startSample * 125) / 6));
      expect(range.endUs).toBe(Math.ceil((range.endSample * 125) / 6));
      const part = heard(
        map,
        {
          channels: [SPEECH.slice(range.startSample, range.endSample)],
          startSample: range.startSample,
        },
        start,
        count,
      );
      const fromWhole = heard(map, whole(SPEECH), start, count);
      const longer = heard(map, whole(SPEECH), start - 1_000, count + 2_000).subarray(
        1_000,
        1_000 + count,
      );
      expect(sha256(part), speedName(speed)).toBe(sha256(fromWhole));
      expect(sha256(new Float32Array(longer)), speedName(speed)).toBe(sha256(fromWhole));
    }
  });

  it('keeps the pitch of a sine within 1 % at every checked speed, both ways (a report, not a gate of quality)', () => {
    const rates: Record<string, number> = {};
    const source = zeroCrossingRate(SINE);
    for (const speed of CHECKED_SPEEDS) {
      for (const reverse of [false, true]) {
        const { map, sampleCount } = wholeClip(speed, reverse, SINE.length);
        const rate = zeroCrossingRate(heard(map, whole(SINE), 0, sampleCount));
        rates[`${speedName(speed)} ${reverse ? 'reversed' : 'forwards'}`] = rate;
        expect(Math.abs(rate / source - 1), speedName(speed)).toBeLessThan(0.01);
      }
    }
    expect(Math.abs(source - 220)).toBeLessThan(0.01);
    expect(Object.keys(rates)).toHaveLength(12);
  });

  it('keeps silence silent', () => {
    const silence = new Float32Array(48_000);
    for (const speed of CHECKED_SPEEDS) {
      const { map, sampleCount } = wholeClip(speed, false, silence.length);
      expect(heard(map, whole(silence), 0, sampleCount).every((value) => value === 0)).toBe(true);
    }
  });

  it('refuses a freeze, a speed out of bounds, and channels of different lengths', () => {
    const map = clipTimeMap({
      startUs: 0,
      durationUs: 10,
      sourceStartUs: 0,
      sourceStartRemainder: 0,
      speed: { num: 0, den: 1 },
      reverse: false,
    });
    expect(() => heard(map, whole(SPEECH), 0, 10)).toThrow('speed 0');
    expect(() => heard({ intercept: 0n, slope: 5, den: 1 }, whole(SPEECH), 0, 10)).toThrow(
      RangeError,
    );
    expect(() => heard({ intercept: 0n, slope: 1, den: 5 }, whole(SPEECH), 0, 10)).toThrow(
      RangeError,
    );
    expect(() => heard({ intercept: 0n, slope: 1, den: 1_001 }, whole(SPEECH), 0, 10)).toThrow(
      RangeError,
    );
    expect(() =>
      stretchSound({
        map: { intercept: 0n, slope: 1, den: 2 },
        source: { channels: [SPEECH, SINE.subarray(1)], startSample: 0 },
        startSample: 0,
        sampleCount: 10,
      }),
    ).toThrow('one length');
    expect(() =>
      stretchSound({
        map: { intercept: 0n, slope: 1, den: 2 },
        source: { channels: [], startSample: 0 },
        startSample: 0,
        sampleCount: 10,
      }),
    ).toThrow('one length');
  });

  it('gives the pinned samples for every fixture, speed, and direction', () => {
    const found: Record<string, string> = {};
    for (const [name, samples] of [
      ['speech', SPEECH],
      ['music', MUSIC],
    ] as const) {
      for (const speed of CHECKED_SPEEDS) {
        for (const reverse of [false, true]) {
          const { map, sampleCount } = wholeClip(speed, reverse, samples.length);
          found[`${name} ${speedName(speed)}${reverse ? ' reversed' : ''}`] = sha256(
            heard(map, whole(samples), 0, sampleCount),
          );
        }
      }
    }
    expect(found).toEqual(PINNED);
  });
});
