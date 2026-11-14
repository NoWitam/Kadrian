/**
 * Fonts in WOFF and WOFF2 measured by Kadrion (D84): `inflate` (RFC 1950, RFC
 * 1951) and the reader of the WOFF 1.0 container (W3C, PR-70), which yields
 * the bytes of the five tables `fontMetrics` reads (D83.1) and decompresses
 * nothing else (D84.2); `brotliDecode` (RFC 7932) and the reader of the WOFF
 * 2.0 container (W3C, PR-71), which decodes its stream only up to the last of
 * the five tables and never reconstructs `glyf` or `loca` (D84.3).
 *
 * Since PR-72 `fontMetrics` reads WOFF and WOFF2 files through these readers,
 * so the main entry, the render page, and the runtime build reach them; this
 * entry, `@kadrion/runtime/woff`, still offers the decoders and the readers
 * of the containers on their own. Pure and synchronous, under the determinism
 * guardrail like every source of the runtime (D20, D24, D84.7).
 */
import { checkLimit, invalid, unmeasurable } from './font-decode.js';
import { inflateStream } from './inflate.js';

export { DECOMPRESSED_FONT_LIMIT, FontMetricsError } from './font-decode.js';
export type { FontMetricsErrorCode } from './text-frame.js';
export { inflate } from './inflate.js';
export { brotliDecode } from './brotli.js';
export { woff2Tables } from './woff2.js';

/**
 * The bytes of the five tables `fontMetrics` reads (D83.1), each exactly as
 * long as the sfnt table it is or was compressed from. A table of an sfnt
 * file, or one stored as it is in a WOFF file, is a view of the bytes it was
 * read from; any other is a view of a buffer of its own. From a transformed
 * `hmtx` of a WOFF2 file, every bearing the transform omitted is 0 (D84.3);
 * its advances are the font's.
 */
export interface FontTables {
  readonly head: Uint8Array;
  readonly hhea: Uint8Array;
  readonly maxp: Uint8Array;
  readonly hmtx: Uint8Array;
  readonly cmap: Uint8Array;
}

/** `wOFF`. */
const WOFF_SIGNATURE = 0x774f4646;
/** The three sfnt signatures `fontMetrics` reads: `0x00010000`, `true`, and `OTTO`. */
const FLAVORS = [0x00010000, 0x74727565, 0x4f54544f] as const;
/** `ttcf`. */
const COLLECTION = 0x74746366;
const HEADER_SIZE = 44;
const ENTRY_SIZE = 20;
const MEASURED_TABLES = ['head', 'hhea', 'maxp', 'hmtx', 'cmap'] as const;

/** One entry of the table directory of a WOFF file. */
interface WoffEntry {
  readonly tag: string;
  readonly offset: number;
  readonly compLength: number;
  readonly origLength: number;
}

/**
 * Reads a WOFF 1.0 file and returns the five tables `fontMetrics` reads,
 * decompressed (D84.2). The metadata block, the private block, and every
 * other table are never read; `origChecksum`, the order of the entries, and
 * the padding are not checked, since they change no byte that is read.
 *
 * Throws `FontMetricsError` `font-invalid` for a damaged container: a header
 * whose `length` is not the file's, a `reserved` other than 0, no table, a
 * directory or a table outside the file, two entries for one tag, table data
 * overlapping the header, the directory, or another table, a `compLength`
 * larger than `origLength`, or a zlib stream that is malformed, fails its
 * check, does not produce exactly `origLength` bytes, or leaves bytes after
 * its end. Throws `font-unmeasurable` for a file that is not WOFF, a flavor
 * other than TrueType or CFF outlines, a missing table, or five tables that
 * would decompress past 64 MiB, which is checked on the declared lengths
 * before anything is allocated or decoded (D84.4).
 */
export function woffTables(bytes: Uint8Array): FontTables {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = bytes.byteLength;
  if (size < 4 || view.getUint32(0) !== WOFF_SIGNATURE) unmeasurable('it is not a WOFF file');
  if (size < HEADER_SIZE) invalid('its WOFF header is truncated');
  const declared = view.getUint32(8);
  if (declared !== size) {
    invalid(
      `its WOFF header gives a length of ${String(declared)} bytes, but the file has ${String(size)}`,
    );
  }
  const numTables = view.getUint16(12);
  if (view.getUint16(14) !== 0) invalid('the reserved field of its WOFF header is not 0');
  if (numTables === 0) invalid('its WOFF header lists no table');
  const directoryEnd = HEADER_SIZE + numTables * ENTRY_SIZE;
  if (directoryEnd > size) invalid('its table directory runs past the end of the file');
  const flavor = view.getUint32(4);
  if (flavor === COLLECTION)
    unmeasurable('its flavor is a font collection, which holds several fonts');
  if (!FLAVORS.some((known) => known === flavor)) {
    unmeasurable('its flavor is not an sfnt font with TrueType or CFF outlines');
  }

  const entries = new Map<string, WoffEntry>();
  for (let index = 0; index < numTables; index += 1) {
    const at = HEADER_SIZE + index * ENTRY_SIZE;
    const tag = String.fromCharCode(
      bytes[at] ?? 0,
      bytes[at + 1] ?? 0,
      bytes[at + 2] ?? 0,
      bytes[at + 3] ?? 0,
    );
    const entry: WoffEntry = {
      tag,
      offset: view.getUint32(at + 4),
      compLength: view.getUint32(at + 8),
      origLength: view.getUint32(at + 12),
    };
    if (entry.offset + entry.compLength > size) {
      invalid(`the data of its ${tag} table lies outside the file`);
    }
    if (entry.compLength > 0 && entry.offset < directoryEnd) {
      invalid(`the data of its ${tag} table overlaps the WOFF header or the table directory`);
    }
    if (entries.has(tag)) invalid(`its table directory lists ${tag} twice`);
    entries.set(tag, entry);
  }
  // Table data in the order of the file: each must begin at or after the end of the one before.
  const placed = [...entries.values()]
    .filter((entry) => entry.compLength > 0)
    .sort((a, b) => a.offset - b.offset);
  for (let index = 1; index < placed.length; index += 1) {
    const before = placed[index - 1];
    const entry = placed[index];
    if (
      before !== undefined &&
      entry !== undefined &&
      entry.offset < before.offset + before.compLength
    ) {
      invalid(`the data of its ${before.tag} and ${entry.tag} tables overlap`);
    }
  }

  const entryOf = (tag: (typeof MEASURED_TABLES)[number]): WoffEntry => {
    const entry = entries.get(tag);
    if (entry === undefined) unmeasurable(`it has no ${tag} table`);
    return entry;
  };
  const head = entryOf('head');
  const hhea = entryOf('hhea');
  const maxp = entryOf('maxp');
  const hmtx = entryOf('hmtx');
  const cmap = entryOf('cmap');
  checkLimit(
    head.origLength + hhea.origLength + maxp.origLength + hmtx.origLength + cmap.origLength,
    `its tables ${MEASURED_TABLES.join(', ')}`,
  );
  return {
    head: tableBytes(bytes, head),
    hhea: tableBytes(bytes, hhea),
    maxp: tableBytes(bytes, maxp),
    hmtx: tableBytes(bytes, hmtx),
    cmap: tableBytes(bytes, cmap),
  };
}

/** A table stored as is when `compLength` equals `origLength`, inflated when it is smaller (D84.2). */
function tableBytes(bytes: Uint8Array, entry: WoffEntry): Uint8Array {
  const data = bytes.subarray(entry.offset, entry.offset + entry.compLength);
  if (entry.compLength === entry.origLength) return data;
  if (entry.compLength > entry.origLength) {
    invalid(
      `its ${entry.tag} table is ${String(entry.compLength)} bytes compressed, more than its ${String(entry.origLength)} bytes decompressed`,
    );
  }
  return inflateStream(data, entry.origLength, `the zlib stream of its ${entry.tag} table`);
}
