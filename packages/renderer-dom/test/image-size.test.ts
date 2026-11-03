/**
 * The image header parser of D62.1 on bytes built here: PNG, JPEG, and WebP
 * headers, EXIF orientation as the pinned Chromium applies it (D62.2), and the
 * typed errors of a media type it does not read and of bytes that are not a
 * whole file. That the sizes equal what the pinned Chromium decodes is checked
 * in the pinned environment (tests/pinned/producer.pinned.test.ts).
 */
import { generateReferenceAssets, IMAGE_SIZE } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { IMAGE_SIZE_MEDIA_TYPES, imageSizeKnown, readImageSize } from '../src/index.js';

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));
const u16be = (value: number): number[] => [(value >>> 8) & 0xff, value & 0xff];
const u16le = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff];
const u24le = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
];
const u32be = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];
const u32le = (value: number): number[] => u32be(value).reverse();

/** A TIFF structure with one IFD holding the orientation tag. */
function tiff(orientation: number, big = false): number[] {
  const u16 = big ? u16be : u16le;
  const u32 = big ? u32be : u32le;
  return [
    ...ascii(big ? 'MM' : 'II'),
    ...u16(42),
    ...u32(8),
    ...u16(1),
    ...u16(0x0112),
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u32(0),
  ];
}

function pngChunk(type: string, data: number[]): number[] {
  // The parser checks no CRC; four zero bytes stand in for it.
  return [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
}

function png(width: number, height: number, before: number[][] = [], after: number[][] = []) {
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk('IHDR', [...u32be(width), ...u32be(height), 8, 2, 0, 0, 0]),
    ...before.flat(),
    ...pngChunk('IDAT', [0x78, 0x01]),
    ...after.flat(),
    ...pngChunk('IEND', []),
  ]);
}

function segment(marker: number, data: number[]): number[] {
  return [0xff, marker, ...u16be(data.length + 2), ...data];
}

function jpeg(
  width: number,
  height: number,
  options: { before?: number[][]; frame?: number; tail?: number[] } = {},
) {
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...(options.before ?? []).flat(),
    ...segment(options.frame ?? 0xc0, [8, ...u16be(height), ...u16be(width), 1, 1, 0x11, 0]),
    ...segment(0xc4, [0, 0]),
    ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
    // Entropy-coded data, with a stuffed 0xff and a restart marker.
    0x12,
    0xff,
    0x00,
    0x34,
    0xff,
    0xd0,
    0x56,
    ...(options.tail ?? [0xff, 0xd9]),
  ]);
}

const exif = (orientation: number, big = false): number[] =>
  segment(0xe1, [...ascii('Exif'), 0, 0, ...tiff(orientation, big)]);

function riff(chunks: number[][]): Uint8Array {
  const body = [...ascii('WEBP'), ...chunks.flat()];
  return Uint8Array.from([...ascii('RIFF'), ...u32le(body.length), ...body]);
}

function webpChunk(type: string, data: number[]): number[] {
  return [...ascii(type), ...u32le(data.length), ...data, ...(data.length % 2 === 1 ? [0] : [])];
}

const vp8 = (width: number, height: number): number[] =>
  webpChunk('VP8 ', [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height), 0, 0]);

function vp8l(width: number, height: number): number[] {
  const bits = (width - 1) | ((height - 1) << 14);
  return webpChunk('VP8L', [0x2f, ...u32le(bits >>> 0), 0]);
}

const vp8x = (width: number, height: number, flags = 0): number[] =>
  webpChunk('VP8X', [flags, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]);

const code = (run: () => unknown): unknown => {
  try {
    run();
  } catch (reason) {
    return (reason as { code?: unknown }).code;
  }
  return null;
};

describe('readImageSize (D62.1)', () => {
  it('knows PNG, JPEG, and WebP, and nothing else', () => {
    expect(IMAGE_SIZE_MEDIA_TYPES).toEqual(['image/png', 'image/jpeg', 'image/webp']);
    expect(imageSizeKnown('image/gif')).toBe(false);
    expect(code(() => readImageSize(png(1, 1), 'image/gif'))).toBe('image-unsupported');
    expect(code(() => readImageSize(png(1, 1), 'image/svg+xml'))).toBe('image-unsupported');
  });

  it('reads the fixture image', () => {
    const image = generateReferenceAssets().find(({ mediaType }) => mediaType.startsWith('image/'));
    expect(image).toBeDefined();
    const size = readImageSize(image?.bytes ?? new Uint8Array(0), 'image/png');
    expect(size).toEqual({ width: IMAGE_SIZE, height: IMAGE_SIZE });
    expect(Object.isFrozen(size)).toBe(true);
  });

  it('reads PNG from IHDR, with an eXIf orientation before the first IDAT only (D62.2)', () => {
    expect(readImageSize(png(40, 20), 'image/png')).toEqual({ width: 40, height: 20 });
    expect(readImageSize(png(40, 20, [pngChunk('eXIf', tiff(6))]), 'image/png')).toEqual({
      width: 20,
      height: 40,
    });
    expect(readImageSize(png(40, 20, [], [pngChunk('eXIf', tiff(6))]), 'image/png')).toEqual({
      width: 40,
      height: 20,
    });
  });

  it('reads JPEG from the first frame header, with the first EXIF APP1 before the scan', () => {
    expect(readImageSize(jpeg(40, 20), 'image/jpeg')).toEqual({ width: 40, height: 20 });
    // Progressive and extended frames too.
    expect(readImageSize(jpeg(40, 20, { frame: 0xc2 }), 'image/jpeg')).toEqual({
      width: 40,
      height: 20,
    });
    for (const orientation of [1, 2, 3, 4, 0, 9]) {
      expect(readImageSize(jpeg(40, 20, { before: [exif(orientation)] }), 'image/jpeg')).toEqual({
        width: 40,
        height: 20,
      });
    }
    for (const orientation of [5, 6, 7, 8]) {
      expect(readImageSize(jpeg(40, 20, { before: [exif(orientation)] }), 'image/jpeg')).toEqual({
        width: 20,
        height: 40,
      });
    }
    expect(readImageSize(jpeg(40, 20, { before: [exif(6, true)] }), 'image/jpeg')).toEqual({
      width: 20,
      height: 40,
    });
    // An APP1 without EXIF (XMP) is passed over; only the first EXIF counts.
    const xmp = segment(0xe1, [...ascii('http://ns.adobe.com/xap/1.0/'), 0]);
    expect(readImageSize(jpeg(40, 20, { before: [xmp, exif(6)] }), 'image/jpeg')).toEqual({
      width: 20,
      height: 40,
    });
    expect(readImageSize(jpeg(40, 20, { before: [exif(1), exif(6)] }), 'image/jpeg')).toEqual({
      width: 40,
      height: 20,
    });
    // An EXIF that cannot be read is no orientation, as Chromium ignores it.
    const broken = segment(0xe1, [...ascii('Exif'), 0, 0, ...ascii('II'), 42, 0, 0xff, 0xff, 0, 0]);
    expect(readImageSize(jpeg(40, 20, { before: [broken] }), 'image/jpeg')).toEqual({
      width: 40,
      height: 20,
    });
    // Trailing bytes after the end of image are allowed.
    expect(readImageSize(jpeg(40, 20, { tail: [0xff, 0xd9, 0, 0, 0] }), 'image/jpeg')).toEqual({
      width: 40,
      height: 20,
    });
  });

  it('reads WebP from VP8, VP8L, and the canvas of VP8X, and ignores its EXIF (D62.2)', () => {
    expect(readImageSize(riff([vp8(40, 20)]), 'image/webp')).toEqual({ width: 40, height: 20 });
    expect(readImageSize(riff([vp8l(40, 20)]), 'image/webp')).toEqual({ width: 40, height: 20 });
    expect(readImageSize(riff([vp8l(16384, 1)]), 'image/webp')).toEqual({
      width: 16384,
      height: 1,
    });
    const withExif = riff([vp8x(40, 20, 0x08), vp8(40, 20), webpChunk('EXIF', tiff(6))]);
    expect(readImageSize(withExif, 'image/webp')).toEqual({ width: 40, height: 20 });
  });

  it('refuses mislabelled bytes as image-invalid', () => {
    expect(code(() => readImageSize(png(40, 20), 'image/jpeg'))).toBe('image-invalid');
    expect(code(() => readImageSize(jpeg(40, 20), 'image/webp'))).toBe('image-invalid');
    expect(code(() => readImageSize(riff([vp8(40, 20)]), 'image/png'))).toBe('image-invalid');
    expect(code(() => readImageSize(new Uint8Array(0), 'image/png'))).toBe('image-invalid');
  });

  it('refuses a file cut short, or one that states no size, as image-invalid', () => {
    const cuts = [
      [png(40, 20), 'image/png'],
      [jpeg(40, 20, { before: [exif(6)] }), 'image/jpeg'],
      [riff([vp8x(40, 20), vp8(40, 20)]), 'image/webp'],
    ] as const;
    for (const [bytes, mediaType] of cuts) {
      expect(readImageSize(bytes, mediaType)).toBeDefined();
      for (let length = 0; length < bytes.length; length += 1) {
        expect(code(() => readImageSize(bytes.subarray(0, length), mediaType))).toBe(
          'image-invalid',
        );
      }
    }
    expect(code(() => readImageSize(png(0, 20), 'image/png'))).toBe('image-invalid');
    expect(code(() => readImageSize(png(2 ** 31, 1), 'image/png'))).toBe('image-invalid');
    expect(code(() => readImageSize(jpeg(40, 0), 'image/jpeg'))).toBe('image-invalid');
    expect(code(() => readImageSize(riff([vp8(0, 20)]), 'image/webp'))).toBe('image-invalid');
    // A PNG without image data, a JPEG without a frame header, a WebP of another first chunk.
    const noData = Uint8Array.from([...png(40, 20)].filter((_, at) => at < 33 || at >= 47));
    expect(code(() => readImageSize(noData, 'image/png'))).toBe('image-invalid');
    expect(
      code(() =>
        readImageSize(
          Uint8Array.from([0xff, 0xd8, ...segment(0xda, [0]), 0xff, 0xd9]),
          'image/jpeg',
        ),
      ),
    ).toBe('image-invalid');
    expect(code(() => readImageSize(riff([webpChunk('ALPH', [0, 0])]), 'image/webp'))).toBe(
      'image-invalid',
    );
  });
});
