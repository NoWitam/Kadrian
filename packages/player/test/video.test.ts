/**
 * The parts of the Player's video path that need no browser (D51): the
 * incremental SHA-256, the MP4 reader, the colour facts of the H.264 stream,
 * and the YUV-to-RGB conversion that repeats the Producer's FFmpeg. That the
 * reader's facts equal ffprobe's and the conversion equals FFmpeg's on real
 * H.264 is proven in pinned Chromium (`tests/pinned/player-video.pinned.test.ts`);
 * here the conversion is checked against three outputs of the pinned FFmpeg
 * for one small frame.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { avcColour } from '../src/avc.js';
import { readMp4VideoTrack, type ByteSource } from '../src/mp4.js';
import { Sha256 } from '../src/sha256.js';
import { blobSha256 } from '../src/video.js';
import { yuv420ToRgb } from '../src/yuv.js';
import { testMp4, testSps, type TestSample } from './media.js';

function source(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: (offset, length) => Promise.resolve(bytes.slice(offset, offset + length)),
  };
}

function nodeSha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

describe('the incremental SHA-256 (D51.2)', () => {
  it('equals node:crypto for every length around the block boundaries, in any chunking', () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, at) => (at * 37 + 11) & 255);
    for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 300]) {
      const whole = bytes.subarray(0, length);
      expect(new Sha256().update(whole).digest(), String(length)).toBe(nodeSha256(whole));
      const chunked = new Sha256();
      for (let at = 0; at < length; at += 7) chunked.update(whole.subarray(at, at + 7));
      expect(chunked.digest(), `${String(length)} in chunks`).toBe(nodeSha256(whole));
    }
  });

  it('hashes a Blob chunk by chunk to the same digest', async () => {
    const bytes = Uint8Array.from({ length: 9 * 1024 * 1024 + 3 }, (_, at) => (at * 13) & 255);
    expect(await blobSha256(new Blob([bytes]))).toBe(nodeSha256(bytes));
  });

  it('refuses a second digest', () => {
    const hash = new Sha256();
    hash.digest();
    expect(() => hash.digest()).toThrow();
  });
});

/** Five samples in decode order I P B B P, as an encoder with B-frames writes them. */
const reordered: TestSample[] = [
  { data: new Uint8Array([10, 0]), duration: 40, offset: 80, sync: true },
  { data: new Uint8Array([20, 1]), duration: 40, offset: 160, sync: false },
  { data: new Uint8Array([30, 2]), duration: 40, offset: 40, sync: false },
  { data: new Uint8Array([40, 3]), duration: 40, offset: 40, sync: false },
  { data: new Uint8Array([50, 4]), duration: 40, offset: 80, sync: false },
];

describe('the MP4 reader (D51.3)', () => {
  it('reads presentation timestamps in presentation order, shifted by the edit, and the last duration', async () => {
    const track = await readMp4VideoTrack(
      source(testMp4({ samples: reordered, editMediaTime: 80, timescale: 1000 })),
    );
    // pts = dts + offset: 80, 200, 120, 160, 240; minus the edit of 80.
    expect(track.timestamps).toEqual([0, 40, 80, 120, 160]);
    expect(track.presentation).toEqual([0, 2, 3, 1, 4]);
    expect(track.samples.map(({ sync }) => sync)).toEqual([true, false, false, false, false]);
    expect(track.lastDuration).toBe(40);
    expect(track.timeBase).toEqual({ num: 1, den: 1000 });
    expect(track.codec).toBe('avc1.42001e');
    expect({ width: track.width, height: track.height }).toEqual({ width: 32, height: 16 });
    expect(track.colour).toEqual({ matrix: 'bt601', fullRange: false });
  });

  it('places every sample at its bytes', async () => {
    const file = testMp4({ samples: reordered });
    const track = await readMp4VideoTrack(source(file));
    for (const [at, sample] of track.samples.entries()) {
      expect([...file.subarray(sample.offset, sample.offset + sample.size)]).toEqual([
        ...(reordered[at]?.data ?? []),
      ]);
    }
  });

  it.each([
    ['a file without a moov box', { samples: reordered, withoutMoov: true }, /no "moov"/],
    ['a fragmented file', { samples: reordered, fragmented: true }, /fragmented/],
    ['another codec', { samples: reordered, entry: 'hvc1' }, /H\.264/],
    ['an edit that cuts frames', { samples: reordered, editMediaTime: 120 }, /cuts frames/],
    [
      'two frames at one time',
      {
        samples: [
          { data: new Uint8Array([1]), duration: 40, offset: 40, sync: true },
          { data: new Uint8Array([2]), duration: 40, offset: 0, sync: false },
        ],
      },
      /same presentation time/,
    ],
    [
      'a first sample that is not a sync sample',
      { samples: [reordered[1] as TestSample, reordered[0] as TestSample] },
      /first sample/,
    ],
  ])('refuses %s with video-unsupported', async (_, options, message) => {
    await expect(readMp4VideoTrack(source(testMp4(options)))).rejects.toMatchObject({
      code: 'video-unsupported',
      message: expect.stringMatching(message) as unknown,
    });
  });
});

function avcC(sps: Uint8Array): Uint8Array {
  return new Uint8Array([
    1,
    sps[1] ?? 66,
    0,
    30,
    0xff,
    0xe1,
    sps.length >> 8,
    sps.length & 255,
    ...sps,
    0,
  ]);
}

describe('the colour facts of the stream (D51.4)', () => {
  it.each([
    ['no VUI', null, { matrix: 'bt601', fullRange: false }],
    [
      'a range without a colour description',
      { fullRange: true },
      { matrix: 'bt601', fullRange: true },
    ],
    [
      'BT.709',
      { fullRange: false, primaries: 1, transfer: 1, matrix: 1 },
      { matrix: 'bt709', fullRange: false },
    ],
    [
      'SMPTE 170M',
      { fullRange: false, primaries: 6, transfer: 6, matrix: 6 },
      { matrix: 'bt601', fullRange: false },
    ],
    [
      'BT.470 BG',
      { fullRange: false, primaries: 5, transfer: 5, matrix: 5 },
      { matrix: 'bt601', fullRange: false },
    ],
  ])('converts %s as FFmpeg does', (_, vui, expected) => {
    expect(avcColour(avcC(testSps(32, 16, { vui })), null)).toEqual(expected);
  });

  it.each([
    ['10-bit video', testSps(32, 16, { profile: 100, bitDepth: 10 }), null],
    ['4:2:2 video', testSps(32, 16, { profile: 100, chromaFormat: 2 }), null],
    ['interlaced video', testSps(32, 16, { progressive: false }), null],
    [
      'BT.2020',
      testSps(32, 16, { vui: { fullRange: false, primaries: 9, transfer: 16, matrix: 9 } }),
      null,
    ],
    [
      'a colr box that disagrees',
      testSps(32, 16, { vui: { fullRange: false, primaries: 1, transfer: 1, matrix: 1 } }),
      { primaries: 6, transfer: 6, matrix: 6, fullRange: false },
    ],
    [
      'a colr box where the stream says nothing',
      testSps(32, 16),
      { primaries: 1, transfer: 1, matrix: 1, fullRange: false },
    ],
  ])('refuses %s with video-unsupported', (_, sps, colr) => {
    expect(() => avcColour(avcC(sps), colr)).toThrow(
      expect.objectContaining({ code: 'video-unsupported' }),
    );
  });

  it('accepts High profile 8-bit 4:2:0 and a colr box that agrees', () => {
    const sps = testSps(32, 16, {
      profile: 100,
      vui: { fullRange: false, primaries: 1, transfer: 1, matrix: 1 },
    });
    expect(
      avcColour(avcC(sps), { primaries: 1, transfer: 1, matrix: 1, fullRange: false }),
    ).toEqual({
      matrix: 'bt709',
      fullRange: false,
    });
  });
});

/** A 16x8 4:2:0 frame of pseudo-random samples in 16–239, the input the expected outputs were made from. */
function tinyFrame(): Uint8Array {
  const bytes = new Uint8Array(16 * 8 * 1.5);
  let state = 12345;
  for (let at = 0; at < bytes.length; at += 1) {
    // In doubles, as the generator that made the expected outputs: not Math.imul.
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    bytes[at] = 16 + ((state >> 16) % 224);
  }
  return bytes;
}

/**
 * The pinned FFmpeg's RGB of `tinyFrame()`, made with
 * `ffmpeg -f rawvideo -pix_fmt yuv420p -s 16x8 [-color_range pc | -colorspace bt709] -i tiny.yuv
 * -sws_flags bitexact+accurate_rnd+full_chroma_int -pix_fmt rgb24 -f rawvideo`.
 */
const FFMPEG_RGB = {
  bt601:
    'Qv9cAP8mAPYpWt64xBj/yDT/AIslAI8QWG3/XwB8uwAA/z0ArQAAmQAA/7Y/rhUAWrV1AF0YKaVWVIOfgA71/KL/u//bQ8FB+sv//67r5UQA0kwAjkQj7aGg/8uMyRwAmAC17DT3igBw/6H/RDv/TlnuXzAL/+dl/6Y8/6cg/8gAGhkACoGxlub/uUtv0gIA4ADH/xH4oABkskTZHVf/ADSw/9vM/3MMmBQAZxMA//9rMXcQa///J4Ta1GW1/4jV/5HfkAAEZwAV2Of/HJ7/ADugvcHFGw0AhdHYAHSZADBoADIshclB38JfbwA//2H/vztg4Xl9qHY64v/mM7D/AD25FgdFo5G3pv//AIPNW9L/HV9bcHEA//dH/2uXlABobfX/AFFrk38AUioAk7v/Sk3/7l///2r37rfvs4yHpS0T/44yok4A/+wq2jIA/4I/H///hP//a2IAcCwAk5zz4bz/mwDR/5H/02Oa/6+L/8F6/6cpliIArUgA/4gA8CIA',
  full: 'Rv9dBvAuAOUyXM+uuiP1vjv6AIkvAIwdW23zYwB9swkA/EQApwYAlgUA/6xDqCIAXKx0B2EkMp5ZV4CZfxvm6pr/sP/MSLdH577x/6Ta10oAx1EAi0ot3ZqZ/72GvycAlACv3TvniABy85r/SkL/U1zfYzkZ/9Zk/55B/58o/7wEJyYAF4Cpj9b/sE9vyBEO0wC9/xznnQBoqknMKFv8AD2q/8u/9XIXlCAAaiAA//dpOXccafX/MILNyGas/4PH/4vPjwATagsiydb+Jpj/AEOcsra5KBsBgsTKAHSVADprADw2gr5G0LZfcQBH/2H/tkFi03d7oXVA0vDVOqj3AEWyIxZMnIytnfP/AIHDXcX/KGJecHIA/+RK92qRkQBrbOP/DlZtj30AVzQAjbH+T1H/3mD/+mrm3a3eq4iEoDYf/4k4nFMA/9owzToA/39EJ/n/gP//bGQAcjUAjpXj0bH/mADG/4v/x2SV/6aG/7V2/54wky0Apk4A/4QA4iwA',
  bt709:
    'MP9WANwhAM4lUM+40Db/0k//AHIjAG4PVHT/aQCBzQcA/0gAvgIAqQEA/744vRsAU6l0AE8WH5RUT4Chhif9/7b/s//aOq4+/dP//8Dr9EwA4FAAlEkg9Kmf/9WH2ScApQC8+lH9lgB0/7T/Qkj/S2D0ZDMJ/+pe/7A1/68Y/8YAHBEAAHm0juX/wldv5RYA9QDO/zj+sgBouVfeFlz/ADW2/+HL/3sFpRkAcBMA//9kLGoNXfv/HoDe3XS3/6HW/63eoQADcAcV1uj/EJn/ADWmvcHFHQ0Af8raAGmdACVsACYtgbs8479aewBB/4D/ykpg6oN7rXc24P/lJ6n/ADrAFgxHpJW4nf//AHnTUMz/F1hccmYA//U//32WowBsYO//AEptl3gAVycAjrz/Rlj/93j//4L78sDxt5CGsDcQ/5Ysq0sA/+og6jsA/5I6Cf//d///blgAeCkAkaD34c3/qQDY/7H/3HGb/7iI/9F0/7QhoyMAuEYA/48A/y0A',
};

describe('YUV to RGB as the Producer converts it (D51.4)', () => {
  const frame = tinyFrame();
  const planes = {
    width: 16,
    height: 8,
    y: frame.subarray(0, 128),
    yStride: 16,
    u: frame.subarray(128, 160),
    uStride: 8,
    v: frame.subarray(160, 192),
    vStride: 8,
  };

  it.each([
    ['BT.601, limited range', 'bt601', false, FFMPEG_RGB.bt601],
    ['BT.601, full range', 'bt601', true, FFMPEG_RGB.full],
    ['BT.709, limited range', 'bt709', false, FFMPEG_RGB.bt709],
  ] as const)('gives the bytes of the pinned FFmpeg for %s', (_, matrix, fullRange, expected) => {
    expect(Buffer.from(yuv420ToRgb(planes, matrix, fullRange)).toString('base64')).toBe(expected);
  });

  it('reads the planes through their strides', () => {
    const padded = (plane: Uint8Array, width: number, stride: number): Uint8Array => {
      const rows = plane.length / width;
      const out = new Uint8Array(rows * stride).fill(7);
      for (let row = 0; row < rows; row += 1)
        out.set(plane.subarray(row * width, (row + 1) * width), row * stride);
      return out;
    };
    const strided = {
      ...planes,
      y: padded(planes.y, 16, 24),
      yStride: 24,
      u: padded(planes.u, 8, 12),
      uStride: 12,
      v: padded(planes.v, 8, 12),
      vStride: 12,
    };
    expect(Buffer.from(yuv420ToRgb(strided, 'bt601', false)).toString('base64')).toBe(
      FFMPEG_RGB.bt601,
    );
  });

  it('maps limited-range black, white, and grey to their RGB values', () => {
    const flat = (luma: number) => ({
      ...planes,
      y: new Uint8Array(128).fill(luma),
      u: new Uint8Array(32).fill(128),
      v: new Uint8Array(32).fill(128),
    });
    expect([...yuv420ToRgb(flat(16), 'bt601', false).subarray(0, 3)]).toEqual([0, 0, 0]);
    expect([...yuv420ToRgb(flat(235), 'bt601', false).subarray(0, 3)]).toEqual([255, 255, 255]);
    expect(new Set(yuv420ToRgb(flat(126), 'bt709', false))).toEqual(new Set([128]));
  });
});
