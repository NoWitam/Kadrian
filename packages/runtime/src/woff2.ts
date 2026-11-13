/**
 * The reader of the WOFF 2.0 container (W3C) for fonts measured by Kadrion
 * (D84.3, PR-71): it yields the bytes of the five tables `fontMetrics` reads
 * (D83.1) and decodes the one Brotli stream of the file only up to the end of
 * the last of them. `glyf` and `loca` are never reconstructed, and the
 * advances of a transformed `hmtx` are read where they lie. Pure and
 * synchronous, under the determinism guardrail (D20, D24, D84.7).
 */
import { brotliStream } from './brotli.js';
import { checkLimit, invalid, unmeasurable } from './font-decode.js';
import type { FontTables } from './woff.js';

/** `wOF2`. */
const WOFF2_SIGNATURE = 0x774f4632;
/** The three sfnt signatures `fontMetrics` reads: `0x00010000`, `true`, and `OTTO`. */
const FLAVORS = [0x00010000, 0x74727565, 0x4f54544f] as const;
/** `ttcf`. */
const COLLECTION = 0x74746366;
const HEADER_SIZE = 48;
const MEASURED_TABLES = ['head', 'hhea', 'maxp', 'hmtx', 'cmap'] as const;

/** The 63 known tags of a table directory entry, by the index in its flags (WOFF 2.0, 4.1). */
const KNOWN_TAGS = [
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
/** The index in the flags that says a four-byte tag follows. */
const ARBITRARY_TAG = 63;

/** One entry of the table directory, with where its data lies in the decompressed stream. */
interface Woff2Entry {
  readonly tag: string;
  /** The transform version, the top two bits of the flags. */
  readonly version: number;
  readonly transformed: boolean;
  readonly origLength: number;
  /** The bytes of the table in the stream: `transformLength` when transformed, else `origLength`. */
  readonly start: number;
  readonly length: number;
}

/**
 * Reads a WOFF 2.0 file and returns the five tables `fontMetrics` reads
 * (D84.3). The Brotli stream is decoded only up to the end of the last of
 * them; the rest of it, the metadata, and the private block are never read.
 * `head`, `hhea`, `maxp`, and `cmap` are the bytes of the stream. An `hmtx`
 * in transform version 1 is returned as an sfnt `hmtx` table: its advances
 * and the bearings it kept where the sfnt table holds them, and every bearing
 * it omitted as 0, since those would be reconstructed from `glyf`, which is
 * never read (D84.3, D84.11).
 *
 * Throws `FontDecodeError` `font-invalid` for a damaged container: a header
 * whose `length` is not the file's, no table, a
 * directory or compressed data past the end of the file, a bad `UIntBase128`,
 * two entries for one tag, a transform version the specification does not
 * define for the table, a transformed `loca` whose `transformLength` is not 0,
 * a transformed `hmtx` without a transformed `glyf`, with reserved flag bits,
 * with neither bit 0 nor bit 1, or of another length than its flags give, or
 * a Brotli stream that is malformed or ends before the last of the five
 * tables. Throws `font-unmeasurable` for a file that is not WOFF2, a
 * collection, a flavor other than TrueType or CFF outlines, a missing table,
 * an `hhea` or `maxp` too short for a transformed `hmtx`, or a stream up to
 * the last of the five tables past 64 MiB, which is checked on the declared
 * lengths before anything is allocated or decoded (D84.4).
 */
export function woff2Tables(bytes: Uint8Array): FontTables {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = bytes.byteLength;
  if (size < 4 || view.getUint32(0) !== WOFF2_SIGNATURE) unmeasurable('it is not a WOFF2 file');
  if (size < HEADER_SIZE) invalid('its WOFF2 header is truncated');
  const declared = view.getUint32(8);
  if (declared !== size) {
    invalid(
      `its WOFF2 header gives a length of ${String(declared)} bytes, but the file has ${String(size)}`,
    );
  }
  const numTables = view.getUint16(12);
  // `reserved` (offset 14) is ignored: the WOFF2 specification forbids a decoder to
  // reject a file for it (amendment of D84.4, 2026-11-13).
  if (numTables === 0) invalid('its WOFF2 header lists no table');
  const flavor = view.getUint32(4);
  if (flavor === COLLECTION) {
    unmeasurable('its flavor is a font collection, which holds several fonts');
  }
  if (!FLAVORS.some((known) => known === flavor)) {
    unmeasurable('its flavor is not an sfnt font with TrueType or CFF outlines');
  }
  const totalCompressedSize = view.getUint32(20);

  // The table directory (WOFF 2.0, 4.1): entries of variable length, in the order of the stream.
  let at = HEADER_SIZE;
  const byte = (): number => {
    if (at >= size) invalid('its table directory runs past the end of the file');
    const value = bytes[at] ?? 0;
    at += 1;
    return value;
  };
  const entries = new Map<string, Woff2Entry>();
  let streamLength = 0;
  for (let index = 0; index < numTables; index += 1) {
    const flags = byte();
    const known = flags & 0x3f;
    const tag =
      known === ARBITRARY_TAG
        ? String.fromCharCode(byte(), byte(), byte(), byte())
        : (KNOWN_TAGS[known] ?? '');
    const version = flags >> 6;
    // WOFF 2.0, 4.1 and 5: version 0 transforms glyf and loca and 3 leaves them; version 1
    // transforms hmtx; version 0 leaves every other table. No other version is defined.
    const nullVersion = tag === 'glyf' || tag === 'loca' ? 3 : 0;
    const transformVersion = tag === 'glyf' || tag === 'loca' ? 0 : tag === 'hmtx' ? 1 : null;
    if (version !== nullVersion && version !== transformVersion) {
      invalid(
        `its ${tag} table names the transform version ${String(version)}, which is not defined`,
      );
    }
    const transformed = version !== nullVersion;
    const origLength = uintBase128(byte, tag, 'origLength');
    const length = transformed ? uintBase128(byte, tag, 'transformLength') : origLength;
    if (tag === 'loca' && transformed && length !== 0) {
      invalid(`its transformed loca table has a transformLength of ${String(length)}, not 0`);
    }
    if (entries.has(tag)) invalid(`its table directory lists ${tag} twice`);
    entries.set(tag, { tag, version, transformed, origLength, start: streamLength, length });
    streamLength += length;
  }
  const dataStart = at;
  if (dataStart + totalCompressedSize > size) {
    invalid('its compressed data runs past the end of the file');
  }

  const entryOf = (tag: (typeof MEASURED_TABLES)[number]): Woff2Entry => {
    const entry = entries.get(tag);
    if (entry === undefined) unmeasurable(`it has no ${tag} table`);
    return entry;
  };
  const head = entryOf('head');
  const hhea = entryOf('hhea');
  const maxp = entryOf('maxp');
  const hmtx = entryOf('hmtx');
  const cmap = entryOf('cmap');
  if (hmtx.transformed && entries.get('glyf')?.transformed !== true) {
    invalid('its hmtx table is transformed without a transformed glyf table');
  }
  const end = Math.max(
    ...[head, hhea, maxp, hmtx, cmap].map((entry) => entry.start + entry.length),
  );
  checkLimit(end, `the stream of its tables up to the end of ${MEASURED_TABLES.join(', ')}`);

  const stream = brotliStream(
    bytes.subarray(dataStart, dataStart + totalCompressedSize),
    end,
    'the Brotli stream of its tables',
    true,
  );
  const tableOf = (entry: Woff2Entry): Uint8Array =>
    stream.subarray(entry.start, entry.start + entry.length);
  return {
    head: tableOf(head),
    hhea: tableOf(hhea),
    maxp: tableOf(maxp),
    hmtx: hmtx.transformed
      ? transformedHmtx(tableOf(hmtx), tableOf(hhea), tableOf(maxp))
      : tableOf(hmtx),
    cmap: tableOf(cmap),
  };
}

/**
 * Reads a `UIntBase128` (WOFF 2.0, 3.1): seven bits a byte, the high bit set
 * on every byte but the last; a leading 0x80, more than five bytes, or a
 * value past 2^32 - 1 is refused.
 */
function uintBase128(byte: () => number, tag: string, field: string): number {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const next = byte();
    if (index === 0 && next === 0x80) {
      invalid(`the ${field} of its ${tag} table is a UIntBase128 with a leading zero`);
    }
    if (value >= 2 ** 25)
      invalid(`the ${field} of its ${tag} table is a UIntBase128 past 2^32 - 1`);
    value = value * 128 + (next & 0x7f);
    if ((next & 0x80) === 0) return value;
  }
  return invalid(`the ${field} of its ${tag} table is a UIntBase128 longer than five bytes`);
}

/**
 * A transformed `hmtx` (WOFF 2.0, 5.4) as the sfnt table: a flags byte, the
 * `numberOfHMetrics` advances, then the proportional bearings unless bit 0 is
 * set and the monospaced bearings unless bit 1 is set. The advances are those
 * of the sfnt table, read in place; an omitted bearing is written as 0, since
 * it would come from `glyf` (D84.3).
 */
function transformedHmtx(data: Uint8Array, hhea: Uint8Array, maxp: Uint8Array): Uint8Array {
  if (hhea.length < 36) unmeasurable('its hhea table is too short');
  if (maxp.length < 6) unmeasurable('its maxp table is too short');
  const numberOfHMetrics = ((hhea[34] ?? 0) << 8) | (hhea[35] ?? 0);
  const numGlyphs = ((maxp[4] ?? 0) << 8) | (maxp[5] ?? 0);
  if (numberOfHMetrics === 0 || numberOfHMetrics > numGlyphs) {
    unmeasurable(`its numberOfHMetrics, ${String(numberOfHMetrics)}, is not from 1 to numGlyphs`);
  }
  if (data.length === 0) invalid('its transformed hmtx table has no flags');
  const flags = data[0] ?? 0;
  if ((flags & 0xfc) !== 0) invalid('its transformed hmtx table sets reserved flag bits');
  if ((flags & 0x03) === 0) {
    invalid(
      'its transformed hmtx table omits neither the proportional nor the monospaced bearings',
    );
  }
  const proportional = (flags & 0x01) === 0;
  const monospaced = (flags & 0x02) === 0;
  const monospacedGlyphs = numGlyphs - numberOfHMetrics;
  const expected =
    1 +
    2 * numberOfHMetrics +
    (proportional ? 2 * numberOfHMetrics : 0) +
    (monospaced ? 2 * monospacedGlyphs : 0);
  if (data.length !== expected) {
    invalid(
      `its transformed hmtx table is ${String(data.length)} bytes, but its flags give ${String(expected)}`,
    );
  }
  const table = new Uint8Array(4 * numberOfHMetrics + 2 * monospacedGlyphs);
  let at = 1;
  for (let glyph = 0; glyph < numberOfHMetrics; glyph += 1) {
    table.set(data.subarray(at, at + 2), glyph * 4);
    at += 2;
  }
  if (proportional) {
    for (let glyph = 0; glyph < numberOfHMetrics; glyph += 1) {
      table.set(data.subarray(at, at + 2), glyph * 4 + 2);
      at += 2;
    }
  }
  if (monospaced) table.set(data.subarray(at, at + 2 * monospacedGlyphs), 4 * numberOfHMetrics);
  return table;
}
