/**
 * The WOFF encoder of the tests (D84, PR-70): WOFF 1.0 files written from the
 * generated fixture fonts (D27.5) over `node:zlib`, so no font file and no
 * font tool enters the repository. Dev only; nothing here is part of the
 * package.
 */
import { deflateSync } from 'node:zlib';

import { generateReferenceAssets } from '@kadrion/test-fixtures';

/** One table of an sfnt file. */
export interface SfntTable {
  readonly tag: string;
  readonly checksum: number;
  readonly data: Uint8Array;
}

export function u32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at);
}

export function setU16(bytes: Uint8Array, at: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(at, value);
}

export function setU32(bytes: Uint8Array, at: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(at, value >>> 0);
}

/** The tables of an sfnt file, in the order of its directory. */
export function sfntTables(sfnt: Uint8Array): SfntTable[] {
  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const tables: SfntTable[] = [];
  for (let index = 0; index < view.getUint16(4); index += 1) {
    const at = 12 + index * 16;
    const offset = view.getUint32(at + 8);
    tables.push({
      tag: String.fromCharCode(...sfnt.subarray(at, at + 4)),
      checksum: view.getUint32(at + 4),
      data: sfnt.slice(offset, offset + view.getUint32(at + 12)),
    });
  }
  return tables;
}

/** How the encoder writes a WOFF file. */
export interface WoffOptions {
  /** The deflate level of the compressed tables (default 9). */
  readonly level?: number;
  /** Tables written as is even where deflate would be smaller. */
  readonly stored?: readonly string[];
  /** The directory and the data in reverse order, which WOFF 1.0 asks to be ascending (not checked, D84.2). */
  readonly reversed?: boolean;
  /** Bytes appended after the table data as a metadata block (never read, D84.2). */
  readonly metadata?: Uint8Array;
  /** Table data without the four-byte padding WOFF 1.0 asks for (not checked, D84.2). */
  readonly unpadded?: boolean;
}

/**
 * Writes an sfnt file as WOFF 1.0: the 44-byte header, one 20-byte entry per
 * table, and each table's data, zlib-compressed when that is smaller and
 * stored otherwise, padded to four bytes.
 */
export function encodeWoff(sfnt: Uint8Array, options: WoffOptions = {}): Uint8Array {
  const flavor = u32(sfnt, 0);
  const tables = sfntTables(sfnt);
  if (options.reversed === true) tables.reverse();
  const stored = new Set(options.stored ?? []);
  const data = tables.map((table) => {
    if (stored.has(table.tag)) return table.data;
    const compressed = new Uint8Array(deflateSync(table.data, { level: options.level ?? 9 }));
    return compressed.length < table.data.length ? compressed : table.data;
  });
  const pad = (length: number): number =>
    options.unpadded === true ? length : Math.ceil(length / 4) * 4;
  const directoryEnd = 44 + tables.length * 20;
  const dataEnd = directoryEnd + data.reduce((sum, bytes) => sum + pad(bytes.length), 0);
  const metadata = options.metadata ?? new Uint8Array(0);
  const length = metadata.length > 0 ? dataEnd + metadata.length : dataEnd;
  const out = new Uint8Array(length);
  setU32(out, 0, 0x774f4646);
  setU32(out, 4, flavor);
  setU32(out, 8, length);
  setU16(out, 12, tables.length);
  setU16(out, 14, 0);
  const sfntSize = tables.reduce((sum, table) => sum + Math.ceil(table.data.length / 4) * 4, 0);
  setU32(out, 16, 12 + 16 * tables.length + sfntSize);
  setU16(out, 20, 1); // majorVersion
  setU16(out, 22, 0); // minorVersion
  if (metadata.length > 0) {
    setU32(out, 24, dataEnd);
    setU32(out, 28, metadata.length);
    setU32(out, 32, metadata.length * 4);
    out.set(metadata, dataEnd);
  }
  let offset = directoryEnd;
  tables.forEach((table, index) => {
    const bytes = data[index] ?? new Uint8Array(0);
    const at = 44 + index * 20;
    for (let char = 0; char < 4; char += 1) out[at + char] = table.tag.charCodeAt(char);
    setU32(out, at + 4, offset);
    setU32(out, at + 8, bytes.length);
    setU32(out, at + 12, table.data.length);
    setU32(out, at + 16, table.checksum);
    out.set(bytes, offset);
    offset += pad(bytes.length);
  });
  return out;
}

/** One entry of a WOFF table directory, with the offset of the entry itself. */
export interface WoffEntryAt {
  readonly at: number;
  readonly tag: string;
  readonly offset: number;
  readonly compLength: number;
  readonly origLength: number;
}

export function woffEntries(woff: Uint8Array): WoffEntryAt[] {
  const count = (woff[12] ?? 0) * 256 + (woff[13] ?? 0);
  return Array.from({ length: count }, (_, index) => {
    const at = 44 + index * 20;
    return {
      at,
      tag: String.fromCharCode(...woff.subarray(at, at + 4)),
      offset: u32(woff, at + 4),
      compLength: u32(woff, at + 8),
      origLength: u32(woff, at + 12),
    };
  });
}

export function woffEntry(woff: Uint8Array, tag: string): WoffEntryAt {
  const entry = woffEntries(woff).find((candidate) => candidate.tag === tag);
  if (entry === undefined) throw new Error(`The test WOFF has no ${tag} table.`);
  return entry;
}

/** An sfnt file holding only the given tables, for `fontMetrics` (which checks no checksum). */
export function sfntOf(flavor: number, tables: Readonly<Record<string, Uint8Array>>): Uint8Array {
  const tags = Object.keys(tables).sort();
  const pad = (length: number): number => Math.ceil(length / 4) * 4;
  const size =
    12 + tags.length * 16 + tags.reduce((sum, tag) => sum + pad(tables[tag]?.length ?? 0), 0);
  const out = new Uint8Array(size);
  setU32(out, 0, flavor);
  setU16(out, 4, tags.length);
  let offset = 12 + tags.length * 16;
  tags.forEach((tag, index) => {
    const data = tables[tag] ?? new Uint8Array(0);
    const at = 12 + index * 16;
    for (let char = 0; char < 4; char += 1) out[at + char] = tag.charCodeAt(char);
    setU32(out, at + 8, offset);
    setU32(out, at + 12, data.length);
    out.set(data, offset);
    offset += pad(data.length);
  });
  return out;
}

/** One seeded mutation of a file or a stream: flipped bits, a truncation, a splice, an insertion, or a deletion. */
export function mutate(bytes: Uint8Array, random: () => number): Uint8Array {
  const at = (): number => Math.floor(random() * bytes.length);
  const kind = Math.floor(random() * 5);
  if (kind === 0) {
    const copy = bytes.slice();
    const flips = 1 + Math.floor(random() * 4);
    for (let index = 0; index < flips; index += 1) {
      const position = at();
      copy[position] = (copy[position] ?? 0) ^ (1 << Math.floor(random() * 8));
    }
    return copy;
  }
  if (kind === 1) return bytes.slice(0, at());
  if (kind === 2) {
    const copy = bytes.slice();
    const from = at();
    const to = at();
    const length = 1 + Math.floor(random() * 32);
    copy.set(bytes.subarray(from, from + length).subarray(0, copy.length - to), to);
    return copy;
  }
  const position = at();
  if (kind === 3) {
    const inserted = Array.from({ length: 1 + Math.floor(random() * 16) }, () =>
      Math.floor(random() * 256),
    );
    return Uint8Array.from([
      ...bytes.subarray(0, position),
      ...inserted,
      ...bytes.subarray(position),
    ]);
  }
  const removed = 1 + Math.floor(random() * 16);
  return Uint8Array.from([...bytes.subarray(0, position), ...bytes.subarray(position + removed)]);
}

/** The monospaced font of the reference composition (D27.5). */
export function monospacedFont(): Uint8Array {
  const font = generateReferenceAssets().find(({ id }) => id === 'asset-font');
  if (font === undefined) throw new Error('The reference assets have no asset-font.');
  return font.bytes;
}
