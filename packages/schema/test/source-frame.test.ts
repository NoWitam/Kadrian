/**
 * The source time and the source frame of a video (D49.5, D50.3). The
 * expectations are derived by hand from the rule, never from the code.
 */
import { VIDEO_FIXTURE } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  sampledSourceRange,
  sourceDurationUs,
  sourceFrameIndex,
  sourceRangeFits,
  sourceTimeUs,
} from '../src/index.js';

/** 25 frames per second in ticks of 1/12800 s, as the fixture video has them. */
const TICKS = Array.from({ length: 75 }, (_, index) => index * 512);
const TIME_BASE = { num: 1, den: 12_800 };

describe('the source time of a video node (D49.5)', () => {
  const node = { startUs: 500_000, durationUs: 1_000_000, sourceStartUs: 1_000_000 };

  it('is sourceStartUs at startUs and grows with scene time at speed 1', () => {
    expect(sourceTimeUs(node, 500_000)).toBe(1_000_000);
    expect(sourceTimeUs(node, 500_001)).toBe(1_000_001);
    expect(sourceTimeUs(node, 1_499_999)).toBe(1_999_999);
  });

  it('is undefined outside the lifetime, whose end is exclusive', () => {
    expect(() => sourceTimeUs(node, 499_999)).toThrow(RangeError);
    expect(() => sourceTimeUs(node, 1_500_000)).toThrow(RangeError);
  });

  it('refuses a sum that leaves the safe integers instead of rounding it', () => {
    const far = { startUs: 0, durationUs: 10, sourceStartUs: Number.MAX_SAFE_INTEGER - 5 };
    expect(sourceTimeUs(far, 5)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => sourceTimeUs(far, 6)).toThrow(RangeError);
  });
});

describe('the frame shown at a source time (D49.5)', () => {
  it('is the last frame whose presentation time is at or before it', () => {
    // Frame i starts at i × 40 000 µs.
    expect(sourceFrameIndex(TICKS, TIME_BASE, 0)).toBe(0);
    expect(sourceFrameIndex(TICKS, TIME_BASE, 39_999)).toBe(0);
    expect(sourceFrameIndex(TICKS, TIME_BASE, 40_000)).toBe(1);
    expect(sourceFrameIndex(TICKS, TIME_BASE, 1_966_666)).toBe(49);
    expect(sourceFrameIndex(TICKS, TIME_BASE, 2_999_999)).toBe(74);
    expect(sourceFrameIndex(TICKS, TIME_BASE, 10_000_000)).toBe(74);
  });

  it('counts from the first frame, whatever its timestamp', () => {
    const shifted = TICKS.map((tick) => tick + 1_001);
    expect(sourceFrameIndex(shifted, TIME_BASE, 0)).toBe(0);
    expect(sourceFrameIndex(shifted, TIME_BASE, 40_000)).toBe(1);
  });

  it('needs nothing else for a variable frame rate', () => {
    // Frames at 0, 1 ms, 100 ms and 101 ms in a millisecond time base.
    const variable = [0, 1, 100, 101];
    const base = { num: 1, den: 1_000 };
    expect(sourceFrameIndex(variable, base, 999)).toBe(0);
    expect(sourceFrameIndex(variable, base, 1_000)).toBe(1);
    expect(sourceFrameIndex(variable, base, 99_999)).toBe(1);
    expect(sourceFrameIndex(variable, base, 100_000)).toBe(2);
    expect(sourceFrameIndex(variable, base, 101_000)).toBe(3);
  });

  it('is exact where a floating-point division would not be', () => {
    // A time base of 1/90 000: frame 3 starts at 3003 ticks, 33 366.66… µs.
    const ntsc = [0, 1_001, 2_002, 3_003];
    const base = { num: 1, den: 90_000 };
    expect(sourceFrameIndex(ntsc, base, 33_366)).toBe(2);
    expect(sourceFrameIndex(ntsc, base, 33_367)).toBe(3);
  });

  it('refuses a stream without frames and a time base that is no positive integer pair', () => {
    expect(() => sourceFrameIndex([], TIME_BASE, 0)).toThrow(RangeError);
    expect(() => sourceFrameIndex(TICKS, { num: 0, den: 1 }, 0)).toThrow(RangeError);
    expect(() => sourceFrameIndex(TICKS, { num: 1, den: 0.5 }, 0)).toThrow(RangeError);
    expect(() => sourceFrameIndex(TICKS, TIME_BASE, -1)).toThrow(RangeError);
  });
});

describe('the source duration and the sampled range (D49.6, D50.3)', () => {
  it('ends with the presentation end of the last frame', () => {
    expect(sourceDurationUs(TICKS, 512, TIME_BASE)).toBe(VIDEO_FIXTURE.sourceDurationUs);
    expect(sourceDurationUs([0, 1_001, 2_002], 1_001, { num: 1, den: 90_000 })).toBe(33_366);
  });

  it('is the lifetime cut to the composition, in source time', () => {
    const node = { startUs: 500_000, durationUs: 1_000_000, sourceStartUs: 1_000_000 };
    expect(sampledSourceRange(node, 2_000_000)).toEqual({
      startUs: 1_000_000,
      durationUs: 1_000_000,
    });
    expect(sampledSourceRange(node, 1_000_000)).toEqual({
      startUs: 1_000_000,
      durationUs: 500_000,
    });
    expect(sampledSourceRange(node, 500_000)).toBeNull();
  });

  it('fits when its last microsecond lies before the end of the source', () => {
    expect(sourceRangeFits({ startUs: 1_000_000, durationUs: 2_000_000 }, 3_000_000)).toBe(true);
    expect(sourceRangeFits({ startUs: 1_000_000, durationUs: 2_000_001 }, 3_000_000)).toBe(false);
  });
});
