/**
 * The size of an image from its header (D62), read by a parser of Kadrion's
 * own and never by a browser decode, so a host in a browser and a host in
 * Node.js read the same size from the same bytes. The size is the one an
 * image node lays out: the natural size the pinned Chromium decodes, with the
 * EXIF orientation of a JPEG or a PNG applied as CSS `image-orientation:
 * from-image` applies it (D62.2), and the EXIF of a WebP ignored, as Chromium
 * ignores it. PNG, JPEG, and WebP are known (D62.1); any other media type is
 * `image-unsupported`, and bytes that are not a whole file of their media
 * type are `image-invalid`.
 */
import { RenderError } from './errors.js';

/** The width and height of an image as it is laid out, in pixels, each at least 1 (D62.1). */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** The media types whose header `readImageSize` reads (D62.1). */
export const IMAGE_SIZE_MEDIA_TYPES: readonly string[] = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

/** Whether `readImageSize` reads images of this media type. */
export function imageSizeKnown(mediaType: string): boolean {
  return IMAGE_SIZE_MEDIA_TYPES.includes(mediaType);
}

class Invalid extends Error {}

/** A bounds-checked big- or little-endian reader; reading past the end is `Invalid`. */
class Reader {
  private readonly bytes: Uint8Array;
  private readonly little: boolean;

  constructor(bytes: Uint8Array, little = false) {
    this.bytes = bytes;
    this.little = little;
  }

  get length(): number {
    return this.bytes.length;
  }

  u8(at: number): number {
    const value = this.bytes[at];
    if (value === undefined || at < 0) throw new Invalid('The file ends inside its header.');
    return value;
  }

  u16(at: number): number {
    const [a, b] = [this.u8(at), this.u8(at + 1)];
    return this.little ? a | (b << 8) : (a << 8) | b;
  }

  u24le(at: number): number {
    return this.u8(at) | (this.u8(at + 1) << 8) | (this.u8(at + 2) << 16);
  }

  u32(at: number): number {
    const [a, b, c, d] = [this.u8(at), this.u8(at + 1), this.u8(at + 2), this.u8(at + 3)];
    return (
      (this.little
        ? (d << 24) | (c << 16) | (b << 8) | a
        : (a << 24) | (b << 16) | (c << 8) | d) >>> 0
    );
  }

  ascii(at: number, length: number): string {
    let text = '';
    for (let index = 0; index < length; index += 1)
      text += String.fromCharCode(this.u8(at + index));
    return text;
  }

  sub(start: number, end: number): Uint8Array {
    if (start < 0 || end > this.bytes.length || start > end) {
      throw new Invalid('The file ends inside its header.');
    }
    return this.bytes.subarray(start, end);
  }
}

/**
 * The orientation tag (0x0112) of the first IFD of a TIFF structure, 1 to 8,
 * or 1 when there is none or the structure cannot be read: Chromium ignores
 * an EXIF it cannot read, and so does this parser (D62.2).
 */
function tiffOrientation(tiff: Uint8Array): number {
  try {
    const order = new Reader(tiff).ascii(0, 2);
    if (order !== 'II' && order !== 'MM') return 1;
    const reader = new Reader(tiff, order === 'II');
    if (reader.u16(2) !== 42) return 1;
    const ifd = reader.u32(4);
    const count = reader.u16(ifd);
    for (let index = 0; index < count; index += 1) {
      const entry = ifd + 2 + index * 12;
      if (reader.u16(entry) !== 0x0112) continue;
      // SHORT, one value, held in the entry itself.
      if (reader.u16(entry + 2) !== 3 || reader.u32(entry + 4) !== 1) return 1;
      const value = reader.u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
    return 1;
  } catch (reason) {
    if (reason instanceof Invalid) return 1;
    throw reason;
  }
}

/** The size laid out for stored pixels of `width` x `height` in an EXIF orientation. */
function oriented(width: number, height: number, orientation: number): ImageSize {
  // Orientations 5 to 8 turn the image by a quarter (EXIF 2.32, 4.6.4 A).
  return orientation >= 5 ? { width: height, height: width } : { width, height };
}

function positive(width: number, height: number): void {
  if (width < 1 || height < 1) throw new Invalid('The header states an empty image.');
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * PNG (ISO/IEC 15948): the signature, `IHDR` first, and every chunk whole up
 * to `IEND`. An `eXIf` chunk counts only before the first `IDAT`, as Chromium
 * reads it.
 */
function pngSize(bytes: Uint8Array): ImageSize {
  const reader = new Reader(bytes);
  PNG_SIGNATURE.forEach((byte, at) => {
    if (reader.u8(at) !== byte) throw new Invalid('The bytes are not a PNG file.');
  });
  if (reader.u32(8) !== 13 || reader.ascii(12, 4) !== 'IHDR') {
    throw new Invalid('The PNG file does not start with its IHDR chunk.');
  }
  const width = reader.u32(16);
  const height = reader.u32(20);
  positive(width, height);
  if (width > 0x7fffffff || height > 0x7fffffff) {
    throw new Invalid('The PNG file states a size above 2^31 - 1.');
  }
  let orientation = 1;
  let image = false;
  let at = 8;
  for (;;) {
    const length = reader.u32(at);
    const type = reader.ascii(at + 4, 4);
    const end = at + 12 + length;
    if (end > reader.length) throw new Invalid('The PNG file ends inside a chunk.');
    if (type === 'IDAT') image = true;
    if (type === 'eXIf' && !image)
      orientation = tiffOrientation(reader.sub(at + 8, at + 8 + length));
    if (type === 'IEND') break;
    at = end;
  }
  if (!image) throw new Invalid('The PNG file has no IDAT chunk.');
  return oriented(width, height, orientation);
}

/** The JPEG start-of-frame markers: SOF0 to SOF15 without DHT (C4), JPG (C8), and DAC (CC). */
function isFrameMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * JPEG (ITU-T T.81): SOI, every marker segment whole up to the first SOS, the
 * size of the first frame header, and an EOI after the scan. The orientation
 * is that of the first APP1 segment that holds EXIF, before the first SOS, as
 * Chromium reads it.
 */
function jpegSize(bytes: Uint8Array): ImageSize {
  const reader = new Reader(bytes);
  if (reader.u8(0) !== 0xff || reader.u8(1) !== 0xd8) {
    throw new Invalid('The bytes are not a JPEG file.');
  }
  let at = 2;
  let size: { width: number; height: number } | null = null;
  let orientation: number | null = null;
  for (;;) {
    if (reader.u8(at) !== 0xff) throw new Invalid('The JPEG file has bytes between its markers.');
    // Fill bytes (T.81, B.1.1.2).
    while (reader.u8(at + 1) === 0xff) at += 1;
    const marker = reader.u8(at + 1);
    at += 2;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd8 || marker === 0xd9) {
      throw new Invalid('The JPEG file has no scan before its end.');
    }
    const length = reader.u16(at);
    if (length < 2 || at + length > reader.length) {
      throw new Invalid('The JPEG file ends inside a marker segment.');
    }
    if (marker === 0xda) {
      at += length;
      break;
    }
    if (isFrameMarker(marker) && size === null) {
      const height = reader.u16(at + 3);
      const width = reader.u16(at + 5);
      // A height of 0 is defined later by a DNL segment, which Chromium does not read.
      positive(width, height);
      size = { width, height };
    }
    if (marker === 0xe1 && orientation === null && reader.ascii(at + 2, 6) === 'Exif\0\0') {
      orientation = tiffOrientation(reader.sub(at + 8, at + length));
    }
    at += length;
  }
  if (size === null) throw new Invalid('The JPEG file has no frame header before its scan.');
  let end = false;
  for (let index = reader.length - 2; index >= at && !end; index -= 1) {
    end = reader.u8(index) === 0xff && reader.u8(index + 1) === 0xd9;
  }
  if (!end) throw new Invalid('The JPEG file has no end of image after its scan.');
  return oriented(size.width, size.height, orientation ?? 1);
}

/**
 * WebP (RFC 9649): a RIFF file whose size fits the bytes, and the size of its
 * first chunk — `VP8 ` (a key frame), `VP8L`, or the canvas of `VP8X`.
 */
function webpSize(bytes: Uint8Array): ImageSize {
  const reader = new Reader(bytes, true);
  if (reader.ascii(0, 4) !== 'RIFF' || reader.ascii(8, 4) !== 'WEBP') {
    throw new Invalid('The bytes are not a WebP file.');
  }
  const riff = reader.u32(4);
  if (riff < 4 || riff + 8 > reader.length)
    throw new Invalid('The WebP file ends inside its RIFF chunk.');
  const type = reader.ascii(12, 4);
  const length = reader.u32(16);
  if (20 + length > riff + 8) throw new Invalid('The WebP file ends inside its first chunk.');
  const data = 20;
  let width: number;
  let height: number;
  if (type === 'VP8 ') {
    if (length < 10) throw new Invalid('The VP8 chunk is too short for a frame header.');
    if ((reader.u8(data) & 1) !== 0)
      throw new Invalid('The VP8 chunk does not start with a key frame.');
    if (
      reader.u8(data + 3) !== 0x9d ||
      reader.u8(data + 4) !== 0x01 ||
      reader.u8(data + 5) !== 0x2a
    ) {
      throw new Invalid('The VP8 chunk has no start code.');
    }
    width = reader.u16(data + 6) & 0x3fff;
    height = reader.u16(data + 8) & 0x3fff;
  } else if (type === 'VP8L') {
    if (length < 5) throw new Invalid('The VP8L chunk is too short for its header.');
    if (reader.u8(data) !== 0x2f) throw new Invalid('The VP8L chunk has no signature.');
    const bits = reader.u32(data + 1);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (type === 'VP8X') {
    if (length < 10) throw new Invalid('The VP8X chunk is too short for its canvas.');
    width = reader.u24le(data + 4) + 1;
    height = reader.u24le(data + 7) + 1;
  } else {
    throw new Invalid(`The WebP file starts with a chunk "${type}", not VP8, VP8L, or VP8X.`);
  }
  positive(width, height);
  return { width, height };
}

/**
 * The size of the image in `bytes` as an image node lays it out (D62.1,
 * D62.2), from its header. `image-unsupported` when `mediaType` is not one of
 * `IMAGE_SIZE_MEDIA_TYPES`; `image-invalid` when the bytes are not a whole
 * file of that media type: another format (a mislabelled file), a header that
 * states no size, or a file that ends early.
 */
export function readImageSize(bytes: Uint8Array, mediaType: string): ImageSize {
  if (!imageSizeKnown(mediaType)) {
    throw new RenderError(
      'image-unsupported',
      `Kadrion reads the size of PNG, JPEG, and WebP images, not of ${mediaType} (D62.1).`,
    );
  }
  try {
    const size =
      mediaType === 'image/png'
        ? pngSize(bytes)
        : mediaType === 'image/jpeg'
          ? jpegSize(bytes)
          : webpSize(bytes);
    return Object.freeze(size);
  } catch (reason) {
    if (!(reason instanceof Invalid)) throw reason;
    throw new RenderError('image-invalid', `${reason.message} (${mediaType}, D62.1)`);
  }
}
