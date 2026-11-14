/**
 * The WOFF2 encoder of the tests (D84, PR-71): WOFF 2.0 files written from the
 * generated fixture fonts (D27.5) over `node:zlib`, with the transform of
 * `glyf` and `loca` for their simple glyphs and the transform of `hmtx`, so no
 * font file and no font tool enters the repository. Written from the W3C
 * specification; dev only, nothing here is part of the package.
 */
import { brotliCompressSync, constants } from 'node:zlib';

import { setU16, setU32, sfntTables, u32 } from './woff-support.js';

/** The 63 known tags of WOFF 2.0, 4.1, by the index in the flags. */
export const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
] as const;

/** A growing byte buffer, big-endian. */
class Bytes {
  private readonly bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  u8(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }

  u16(value: number): this {
    return this.u8(value >> 8).u8(value);
  }

  u32(value: number): this {
    return this.u16(value >>> 16).u16(value & 0xffff);
  }

  append(bytes: ArrayLike<number>): this {
    for (let index = 0; index < bytes.length; index += 1) this.u8(bytes[index] ?? 0);
    return this;
  }

  /** 255UInt16 of WOFF 2.0, 3.1, in its shortest form. */
  u255(value: number): this {
    if (value < 253) return this.u8(value);
    if (value < 506) return this.u8(255).u8(value - 253);
    if (value < 762) return this.u8(254).u8(value - 506);
    return this.u8(253).u16(value);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** UIntBase128 of WOFF 2.0, 3.1, in its shortest form. */
export function uintBase128(value: number): number[] {
  const out = [value % 128];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    out.unshift(0x80 | (rest % 128));
    rest = Math.floor(rest / 128);
  }
  return out;
}

function i16(bytes: Uint8Array, at: number): number {
  const value = ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
  return value >= 0x8000 ? value - 0x10000 : value;
}

function u16(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

/** A simple glyph of `glyf` (OFF 5.3.3), its points absolute. */
interface SimpleGlyph {
  readonly box: readonly [number, number, number, number];
  readonly endPoints: readonly number[];
  readonly instructions: Uint8Array;
  readonly points: readonly { readonly x: number; readonly y: number; readonly onCurve: boolean }[];
}

/** The byte offsets of each glyph in `glyf`, from `loca` of the given format. */
function glyphOffsets(loca: Uint8Array, indexFormat: number, numGlyphs: number): number[] {
  return Array.from({ length: numGlyphs + 1 }, (_, glyph) =>
    indexFormat === 0 ? u16(loca, glyph * 2) * 2 : u32(loca, glyph * 4),
  );
}

/** Parses a simple glyph; `null` for an empty one. Composite glyphs are not written by the fixtures. */
function simpleGlyph(data: Uint8Array): SimpleGlyph | null {
  if (data.length === 0) return null;
  const contours = i16(data, 0);
  if (contours < 0) throw new Error('The test WOFF2 encoder writes simple glyphs only.');
  const box = [i16(data, 2), i16(data, 4), i16(data, 6), i16(data, 8)] as const;
  const endPoints = Array.from({ length: contours }, (_, index) => u16(data, 10 + index * 2));
  let at = 10 + contours * 2;
  const instructionLength = u16(data, at);
  at += 2;
  const instructions = data.slice(at, at + instructionLength);
  at += instructionLength;
  const count = contours === 0 ? 0 : (endPoints[contours - 1] ?? 0) + 1;
  const flags: number[] = [];
  while (flags.length < count) {
    const flag = data[at] ?? 0;
    at += 1;
    flags.push(flag);
    if ((flag & 0x08) !== 0) {
      const repeat = data[at] ?? 0;
      at += 1;
      for (let index = 0; index < repeat; index += 1) flags.push(flag);
    }
  }
  if (((flags[0] ?? 0) & 0x40) !== 0) {
    throw new Error('The test WOFF2 encoder writes no overlap bitmap.');
  }
  const coordinates = (short: number, same: number): number[] => {
    let value = 0;
    return flags.map((flag) => {
      if ((flag & short) !== 0) {
        const delta = data[at] ?? 0;
        at += 1;
        value += (flag & same) !== 0 ? delta : -delta;
      } else if ((flag & same) === 0) {
        value += i16(data, at);
        at += 2;
      }
      return value;
    });
  };
  const xs = coordinates(0x02, 0x10);
  const ys = coordinates(0x04, 0x20);
  return {
    box,
    endPoints,
    instructions,
    points: flags.map((flag, index) => ({
      x: xs[index] ?? 0,
      y: ys[index] ?? 0,
      onCurve: (flag & 0x01) !== 0,
    })),
  };
}

/** The triplet of WOFF 2.0, 5.2 for one point: its flag byte and its coordinate bytes. */
export function triplet(dx: number, dy: number, onCurve: boolean): [number, number[]] {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const xSign = dx < 0 ? 0 : 1;
  const ySign = dy < 0 ? 0 : 1;
  const signs = xSign + 2 * ySign;
  const curve = onCurve ? 0 : 0x80;
  if (dx === 0 && absY < 1280) return [curve | (((absY >> 8) << 1) + ySign), [absY & 0xff]];
  if (dy === 0 && absX < 1280) return [curve | (10 + ((absX >> 8) << 1) + xSign), [absX & 0xff]];
  if (absX > 0 && absX <= 64 && absY > 0 && absY <= 64) {
    const index = 20 + ((absX - 1) & 0x30) + (((absY - 1) & 0x30) >> 2) + signs;
    return [curve | index, [(((absX - 1) & 0x0f) << 4) | ((absY - 1) & 0x0f)]];
  }
  if (absX > 0 && absX <= 768 && absY > 0 && absY <= 768) {
    const index = 84 + 12 * (((absX - 1) & 0x300) >> 8) + (((absY - 1) & 0x300) >> 6) + signs;
    return [curve | index, [(absX - 1) & 0xff, (absY - 1) & 0xff]];
  }
  if (absX < 4096 && absY < 4096) {
    return [curve | (120 + signs), [absX >> 4, ((absX & 0x0f) << 4) | (absY >> 8), absY & 0xff]];
  }
  return [curve | (124 + signs), [absX >> 8, absX & 0xff, absY >> 8, absY & 0xff]];
}

/**
 * The transformed `glyf` of WOFF 2.0, 5.1, for fonts of simple glyphs: the
 * streams of contour counts, point counts, flags, coordinates, bounding boxes,
 * and instructions. A bounding box is written only when it differs from the
 * one its points give.
 */
export function transformGlyf(sfnt: Uint8Array): Uint8Array {
  const tables = new Map(sfntTables(sfnt).map((table) => [table.tag, table.data]));
  const glyf = tables.get('glyf') ?? new Uint8Array(0);
  const indexFormat = i16(tables.get('head') ?? new Uint8Array(0), 50);
  const numGlyphs = u16(tables.get('maxp') ?? new Uint8Array(0), 4);
  const offsets = glyphOffsets(tables.get('loca') ?? new Uint8Array(0), indexFormat, numGlyphs);
  const contourStream = new Bytes();
  const pointStream = new Bytes();
  const flagStream = new Bytes();
  const glyphStream = new Bytes();
  const boxBitmap = new Uint8Array(4 * Math.floor((numGlyphs + 31) / 32));
  const boxStream = new Bytes();
  const instructionStream = new Bytes();
  for (let index = 0; index < numGlyphs; index += 1) {
    const glyph = simpleGlyph(glyf.subarray(offsets[index] ?? 0, offsets[index + 1] ?? 0));
    if (glyph === null) {
      contourStream.u16(0);
      continue;
    }
    contourStream.u16(glyph.endPoints.length);
    let previousEnd = -1;
    for (const end of glyph.endPoints) {
      pointStream.u255(end - previousEnd);
      previousEnd = end;
    }
    let x = 0;
    let y = 0;
    for (const point of glyph.points) {
      const [flag, bytes] = triplet(point.x - x, point.y - y, point.onCurve);
      flagStream.u8(flag);
      glyphStream.append(bytes);
      x = point.x;
      y = point.y;
    }
    glyphStream.u255(glyph.instructions.length);
    instructionStream.append(glyph.instructions);
    const xs = glyph.points.map((point) => point.x);
    const ys = glyph.points.map((point) => point.y);
    const computed = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    if (computed.some((value, at) => value !== glyph.box[at])) {
      boxBitmap[index >> 3] = (boxBitmap[index >> 3] ?? 0) | (0x80 >> (index & 7));
      for (const value of glyph.box) boxStream.u16(value & 0xffff);
    }
  }
  const out = new Bytes()
    .u16(0) // reserved
    .u16(0) // optionFlags: no overlap bitmap
    .u16(numGlyphs)
    .u16(indexFormat)
    .u32(contourStream.length)
    .u32(pointStream.length)
    .u32(flagStream.length)
    .u32(glyphStream.length)
    .u32(0) // composite stream
    .u32(boxBitmap.length + boxStream.length)
    .u32(instructionStream.length);
  for (const stream of [contourStream, pointStream, flagStream, glyphStream]) {
    out.append(stream.toBytes());
  }
  return out
    .append(boxBitmap)
    .append(boxStream.toBytes())
    .append(instructionStream.toBytes())
    .toBytes();
}

/**
 * The transformed `hmtx` of WOFF 2.0, 5.4 with the given flags (bit 0 omits
 * the proportional bearings, bit 1 the monospaced ones). Each omitted bearing
 * must equal the `xMin` of its glyph, or 0 for an empty glyph, as the
 * specification requires.
 */
export function transformHmtx(sfnt: Uint8Array, flags: number): Uint8Array {
  const tables = new Map(sfntTables(sfnt).map((table) => [table.tag, table.data]));
  const hmtx = tables.get('hmtx') ?? new Uint8Array(0);
  const numberOfHMetrics = u16(tables.get('hhea') ?? new Uint8Array(0), 34);
  const numGlyphs = u16(tables.get('maxp') ?? new Uint8Array(0), 4);
  const glyf = tables.get('glyf') ?? new Uint8Array(0);
  const indexFormat = i16(tables.get('head') ?? new Uint8Array(0), 50);
  const offsets = glyphOffsets(tables.get('loca') ?? new Uint8Array(0), indexFormat, numGlyphs);
  const bearing = (glyph: number): number =>
    glyph < numberOfHMetrics
      ? i16(hmtx, glyph * 4 + 2)
      : i16(hmtx, numberOfHMetrics * 4 + (glyph - numberOfHMetrics) * 2);
  const xMin = (glyph: number): number => {
    const start = offsets[glyph] ?? 0;
    return start === offsets[glyph + 1] ? 0 : i16(glyf, start + 2);
  };
  const out = new Bytes().u8(flags);
  for (let glyph = 0; glyph < numberOfHMetrics; glyph += 1) out.u16(u16(hmtx, glyph * 4));
  const runs: [boolean, number, number][] = [
    [(flags & 0x01) !== 0, 0, numberOfHMetrics],
    [(flags & 0x02) !== 0, numberOfHMetrics, numGlyphs],
  ];
  for (const [omitted, from, to] of runs) {
    for (let glyph = from; glyph < to; glyph += 1) {
      if (omitted && bearing(glyph) !== xMin(glyph)) {
        throw new Error(`The bearing of glyph ${String(glyph)} is not its xMin.`);
      }
      if (!omitted) out.u16(bearing(glyph) & 0xffff);
    }
  }
  return out.toBytes();
}

/** One table of a WOFF2 file as the test writes it. */
export interface Woff2Table {
  readonly tag: string;
  /** The top two bits of the flags. */
  readonly version: number;
  readonly origLength: number;
  /** Written when present, whatever the version says. */
  readonly transformLength?: number;
  /** The bytes of the table in the stream. */
  readonly data: Uint8Array;
  /** Writes the tag after the flags (index 63) even when it is a known tag. */
  readonly arbitraryTag?: boolean | undefined;
  /** The bytes of `origLength` and `transformLength` as written, in place of their shortest form. */
  readonly lengthBytes?: readonly number[];
}

/** How the test writes the Brotli stream and the blocks after it. */
export interface Woff2Assembly {
  readonly flavor?: number;
  readonly quality?: number;
  readonly window?: number;
  readonly mode?: number;
  /** The stream itself, written as it is instead of compressing the tables. */
  readonly stream?: Uint8Array;
  readonly metadata?: Uint8Array;
  readonly privateData?: Uint8Array;
}

/** Writes a WOFF2 file: the 48-byte header, the table directory, and one Brotli stream. */
export function assembleWoff2(
  tables: readonly Woff2Table[],
  assembly: Woff2Assembly = {},
): Uint8Array {
  const directory = new Bytes();
  for (const table of tables) {
    const known = KNOWN_TAGS.findIndex((tag) => tag === table.tag);
    const arbitrary = known < 0 || table.arbitraryTag === true;
    directory.u8((table.version << 6) | (arbitrary ? 63 : known));
    if (arbitrary) for (let char = 0; char < 4; char += 1) directory.u8(table.tag.charCodeAt(char));
    if (table.lengthBytes !== undefined) {
      directory.append(table.lengthBytes);
    } else {
      directory.append(uintBase128(table.origLength));
      if (table.transformLength !== undefined) directory.append(uintBase128(table.transformLength));
    }
  }
  const data = new Uint8Array(tables.reduce((sum, table) => sum + table.data.length, 0));
  tables.reduce((at, table) => {
    data.set(table.data, at);
    return at + table.data.length;
  }, 0);
  const stream =
    assembly.stream ??
    new Uint8Array(
      brotliCompressSync(data, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: assembly.quality ?? 11,
          [constants.BROTLI_PARAM_LGWIN]: assembly.window ?? 22,
          [constants.BROTLI_PARAM_MODE]: assembly.mode ?? constants.BROTLI_MODE_FONT,
          [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
        },
      }),
    );
  const pad = (length: number): number => Math.ceil(length / 4) * 4;
  const dataStart = 48 + directory.length;
  const metadata = assembly.metadata ?? new Uint8Array(0);
  const privateData = assembly.privateData ?? new Uint8Array(0);
  const metaOffset = metadata.length > 0 ? pad(dataStart + stream.length) : 0;
  const privOffset =
    privateData.length > 0
      ? pad(metaOffset > 0 ? metaOffset + metadata.length : dataStart + stream.length)
      : 0;
  // Without a block after it, the stream is padded to four bytes too: the decoder of
  // browsers refuses a file that ends before the stream's four-byte boundary.
  const length =
    privOffset > 0
      ? privOffset + privateData.length
      : metaOffset > 0
        ? metaOffset + metadata.length
        : pad(dataStart + stream.length);
  const out = new Uint8Array(length);
  setU32(out, 0, 0x774f4632);
  setU32(out, 4, assembly.flavor ?? 0x00010000);
  setU32(out, 8, length);
  setU16(out, 12, tables.length);
  setU16(out, 14, 0);
  setU32(out, 16, 12 + 16 * tables.length + tables.reduce((sum, t) => sum + pad(t.origLength), 0));
  setU32(out, 20, stream.length);
  setU16(out, 24, 1); // majorVersion
  setU16(out, 26, 0); // minorVersion
  setU32(out, 28, metaOffset);
  setU32(out, 32, metadata.length);
  setU32(out, 36, metadata.length);
  setU32(out, 40, privOffset);
  setU32(out, 44, privateData.length);
  out.set(directory.toBytes(), 48);
  out.set(stream, dataStart);
  out.set(metadata, metaOffset);
  out.set(privateData, privOffset);
  return out;
}

/** How the test encoder writes a WOFF2 file. */
export interface Woff2Options extends Omit<Woff2Assembly, 'stream'> {
  /** `glyf` and `loca` transformed (version 0, the default) or not (version 3). */
  readonly glyf?: 'transformed' | 'null';
  /** The flags of a transformed `hmtx` (1 to 3), or 0 for none (the default). */
  readonly hmtx?: number;
  /** The tables in this order; by default the order of the sfnt directory. */
  readonly order?: readonly string[];
  /** Every tag written after the flags (index 63). */
  readonly arbitraryTags?: boolean;
  /** Bit 11 of the flags of `head`, which WOFF 2.0 encoders set (default true). */
  readonly markHead?: boolean;
}

/** `head` with bit 11 of its flags set, as WOFF 2.0, 5 asks of an encoder. */
export function markedHead(head: Uint8Array): Uint8Array {
  const marked = head.slice();
  marked[16] = (marked[16] ?? 0) | 0x08;
  return marked;
}

/**
 * The tables of an sfnt file of TrueType outlines as WOFF 2.0 writes them:
 * `glyf` and `loca` transformed or not, `hmtx` transformed with the given
 * flags or not, every other table as it is.
 */
export function encodeWoff2Tables(sfnt: Uint8Array, options: Woff2Options = {}): Woff2Table[] {
  const transformed = (options.glyf ?? 'transformed') === 'transformed';
  const hmtxFlags = options.hmtx ?? 0;
  const order = options.order;
  const tables =
    order === undefined
      ? sfntTables(sfnt)
      : sfntTables(sfnt).sort((a, b) => order.indexOf(a.tag) - order.indexOf(b.tag));
  return tables.map(({ tag, data }): Woff2Table => {
    const plain = {
      tag,
      version: 0,
      origLength: data.length,
      data,
      arbitraryTag: options.arbitraryTags,
    };
    if (tag === 'head' && options.markHead !== false) return { ...plain, data: markedHead(data) };
    if (tag === 'glyf' || tag === 'loca') {
      if (!transformed) return { ...plain, version: 3 };
      const glyf = tag === 'glyf' ? transformGlyf(sfnt) : new Uint8Array(0);
      return { ...plain, transformLength: glyf.length, data: glyf };
    }
    if (tag === 'hmtx' && hmtxFlags !== 0) {
      const hmtx = transformHmtx(sfnt, hmtxFlags);
      return { ...plain, version: 1, transformLength: hmtx.length, data: hmtx };
    }
    return plain;
  });
}

/** Writes an sfnt file of TrueType outlines as WOFF 2.0. */
export function encodeWoff2(sfnt: Uint8Array, options: Woff2Options = {}): Uint8Array {
  return assembleWoff2(encodeWoff2Tables(sfnt, options), {
    ...options,
    flavor: options.flavor ?? u32(sfnt, 0),
  });
}

/** One entry of a WOFF2 table directory as the test reads it back, with the offset of the entry. */
export interface Woff2EntryAt {
  readonly at: number;
  readonly tag: string;
  readonly version: number;
  readonly origLength: number;
  readonly transformLength: number | null;
  /** Where its bytes lie in the decompressed stream. */
  readonly start: number;
  readonly length: number;
}

/** Reads back the directory the test encoder wrote (shortest UIntBase128 only). */
export function woff2Entries(woff2: Uint8Array): { entries: Woff2EntryAt[]; dataStart: number } {
  let at = 48;
  let start = 0;
  const base128 = (): number => {
    let value = 0;
    for (;;) {
      const byte = woff2[at] ?? 0;
      at += 1;
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
  };
  const entries = Array.from({ length: u16(woff2, 12) }, (): Woff2EntryAt => {
    const entryAt = at;
    const flags = woff2[at] ?? 0;
    at += 1;
    let tag: string = KNOWN_TAGS[flags & 0x3f] ?? '';
    if ((flags & 0x3f) === 63) {
      tag = String.fromCharCode(...woff2.subarray(at, at + 4));
      at += 4;
    }
    const version = flags >> 6;
    const origLength = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    const transformLength = transformed ? base128() : null;
    const length = transformLength ?? origLength;
    const entry = { at: entryAt, tag, version, origLength, transformLength, start, length };
    start += length;
    return entry;
  });
  return { entries, dataStart: at };
}

export function woff2Entry(woff2: Uint8Array, tag: string): Woff2EntryAt {
  const entry = woff2Entries(woff2).entries.find((candidate) => candidate.tag === tag);
  if (entry === undefined) throw new Error(`The test WOFF2 has no ${tag} table.`);
  return entry;
}
