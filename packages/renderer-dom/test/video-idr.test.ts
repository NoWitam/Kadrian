/**
 * The NAL check both hosts start a decode from (D79.5, D82.5): an IDR slice
 * among the length-prefixed NAL units of a sample, with the length size of the
 * `avcC` record. The Player's reading of whole files is tested in its package.
 */
import { describe, expect, it } from 'vitest';

import { holdsIdr } from '../src/index.js';

/** An `avcC` record whose fifth byte states `lengthSize − 1`, as far as `holdsIdr` reads it. */
function record(lengthSize: 1 | 2 | 4): Uint8Array {
  return new Uint8Array([1, 0x64, 0, 0x0c, 0xfc | (lengthSize - 1)]);
}

/** One NAL unit of `type`, prefixed by its length in `lengthSize` bytes. */
function nal(lengthSize: 1 | 2 | 4, type: number, payload: readonly number[] = [0]): number[] {
  const length = payload.length + 1;
  const prefix = Array.from(
    { length: lengthSize },
    (_, at) => Math.floor(length / 256 ** (lengthSize - 1 - at)) % 256,
  );
  return [...prefix, 0x60 | type, ...payload];
}

describe('holdsIdr (D79.5, D82.5)', () => {
  it.each([1, 2, 4] as const)(
    'finds an IDR slice after other NAL units with %i-byte lengths',
    (size) => {
      const sample = new Uint8Array([...nal(size, 6), ...nal(size, 7, [1, 2]), ...nal(size, 5)]);
      expect(holdsIdr(record(size), sample)).toBe(true);
      expect(holdsIdr(record(size), new Uint8Array([...nal(size, 6), ...nal(size, 1)]))).toBe(
        false,
      );
    },
  );

  it('reads no further than a NAL unit of length 0 or one that runs past the sample', () => {
    expect(holdsIdr(record(4), new Uint8Array([0, 0, 0, 0, ...nal(4, 5)]))).toBe(false);
    expect(holdsIdr(record(4), new Uint8Array([0, 0, 0, 9, 0x65]))).toBe(false);
    expect(holdsIdr(record(2), new Uint8Array([0]))).toBe(false);
  });
});
