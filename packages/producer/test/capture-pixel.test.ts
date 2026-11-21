/**
 * The pixel of the mark read from a capture (D86.2): the first pixel of a PNG
 * of 8-bit RGB or RGBA, whatever filter its row uses, and a refusal of any
 * other PNG. The wait for a late mark: the frame waits until the number
 * appears, and `presentation-timeout` when it never does. The capture itself
 * needs Chromium and is in `tests/pinned`.
 */
import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { awaitMark, firstPixel, markNumber } from '../src/capture.js';

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  // The CRC is not checked by the reader; a zero keeps the fixture short.
  return Buffer.concat([head, Buffer.from(body), Buffer.alloc(4)]);
}

function png(
  pixel: readonly number[],
  { depth = 8, colour = 2, interlace = 0, filter = 0 } = {},
): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = depth;
  header[9] = colour;
  header[12] = interlace;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(Buffer.from([filter, ...pixel]))),
      chunk('IEND', new Uint8Array()),
    ]),
  );
}

describe('the first pixel of a capture (D86.2)', () => {
  it('reads RGB and RGBA under every filter of PNG', () => {
    for (const filter of [0, 1, 2, 3, 4]) {
      expect(firstPixel(png([44, 1, 0], { filter }))).toEqual([44, 1, 0]);
      expect(firstPixel(png([7, 8, 9, 255], { colour: 6, filter }))).toEqual([7, 8, 9]);
    }
  });

  it('refuses what is not a PNG of 8-bit RGB or RGBA without interlacing', () => {
    for (const bytes of [
      new Uint8Array([1, 2, 3]),
      png([1, 2, 3], { depth: 16 }),
      png([1], { colour: 3 }),
      png([1, 2, 3], { interlace: 1 }),
    ]) {
      expect(() => firstPixel(bytes)).toThrow(expect.objectContaining({ code: 'page-error' }));
    }
  });
});

describe('the wait for the mark (D86.2)', () => {
  const colour = (number: number): readonly [number, number, number] => [
    number % 256,
    Math.floor(number / 256) % 256,
    Math.floor(number / 65_536),
  ];

  it('reads the colours of the agent as their numbers', () => {
    for (const number of [1, 255, 256, 300, 65_536, 0xfffffe]) {
      expect(markNumber(colour(number))).toBe(number);
    }
  });

  it('reads at once, and waits for a late mark with the barrier before every further read', async () => {
    const steps: string[] = [];
    // The surface shows the mark of the frame before for three reads.
    const shown = [299, 299, 299, 300];
    const reads = await awaitMark(
      300,
      () => {
        steps.push('barrier');
        return Promise.resolve();
      },
      () => {
        steps.push('read');
        return Promise.resolve(colour(shown.shift() ?? 300));
      },
      5_000,
      'frame 299',
    );
    expect(reads).toBe(4);
    expect(steps).toEqual(['read', ...Array.from({ length: 3 }, () => ['barrier', 'read']).flat()]);
  });

  it('needs no barrier when the surface already shows the mark', async () => {
    let barriers = 0;
    const reads = await awaitMark(
      7,
      () => {
        barriers += 1;
        return Promise.resolve();
      },
      () => Promise.resolve(colour(7)),
      5_000,
      'frame 6',
    );
    expect([reads, barriers]).toEqual([1, 0]);
  });

  it('refuses with presentation-timeout when the number never appears', async () => {
    let reads = 0;
    const wait = awaitMark(
      300,
      () => new Promise((resolve) => setTimeout(resolve, 5)),
      () => {
        reads += 1;
        return Promise.resolve(colour(299));
      },
      50,
      'frame 299',
    );
    await expect(wait).rejects.toMatchObject({
      code: 'presentation-timeout',
      message: expect.stringContaining('frame 299') as unknown,
    });
    expect(reads).toBeGreaterThan(1);
  });
});
