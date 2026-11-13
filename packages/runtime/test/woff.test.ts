/**
 * The WOFF 1.0 container (D84.2, PR-70): the five tables read from WOFF files
 * of the generated fixture fonts (D27.5), written by the test encoder over
 * `node:zlib`, equal the tables of the sfnt files byte for byte, and the
 * metrics of an sfnt file built from them equal the metrics of the original;
 * every refusal of D84.2, D84.4, and D84.6 with its code; what is not checked
 * is read; seeded mutations end in tables or in one of the two codes, never in
 * another exception.
 */
import { generateProportionalFont } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { fontMetrics } from '../src/text-frame.js';
import {
  DECOMPRESSED_FONT_LIMIT,
  FontDecodeError,
  woffTables,
  type FontTables,
} from '../src/woff.js';

import { seededRandom } from './support.js';
import {
  encodeWoff,
  mutate,
  setU16,
  setU32,
  sfntOf,
  sfntTables,
  u32,
  woffEntries,
  woffEntry,
  type WoffOptions,
  monospacedFont,
} from './woff-support.js';

const MEASURED = ['head', 'hhea', 'maxp', 'hmtx', 'cmap'] as const;

const FONTS = [
  ['monospaced', monospacedFont()],
  ['proportional, format 4', generateProportionalFont('format-4')],
  ['proportional, format 12', generateProportionalFont('format-12')],
  ['proportional, both', generateProportionalFont('both')],
] as const;

const MONOSPACED = monospacedFont();
const WOFF = encodeWoff(MONOSPACED);

/** The code of the `FontDecodeError` a call throws; anything else thrown fails the test. */
function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof FontDecodeError) return error.code;
    throw error;
  }
  return 'accepted';
}

function edited(edit: (bytes: Uint8Array) => void, from: Uint8Array = WOFF): Uint8Array {
  const copy = from.slice();
  edit(copy);
  return copy;
}

function flip(bytes: Uint8Array, at: number): void {
  bytes[at] = (bytes[at] ?? 0) ^ 1;
}

function expectTablesOf(sfnt: Uint8Array, tables: FontTables): void {
  const original = new Map(sfntTables(sfnt).map((table) => [table.tag, table.data]));
  for (const tag of MEASURED) expect(tables[tag], tag).toEqual(original.get(tag));
  // The reader of tables of PR-72 sees what it sees in the sfnt file.
  expect(fontMetrics(sfntOf(u32(sfnt, 0), { ...tables }))).toEqual(fontMetrics(sfnt));
}

const OPTIONS: [string, WoffOptions][] = [
  ['compressed at level 9', {}],
  ['compressed at level 1', { level: 1 }],
  ['stored', { stored: MEASURED }],
  ['partly stored', { stored: ['head', 'hmtx'] }],
  ['in reverse order', { reversed: true }],
  ['without padding', { unpadded: true }],
  ['with a metadata block', { metadata: new TextEncoder().encode('<metadata/>') }],
];

describe('the tables of a WOFF file (D84.2)', () => {
  for (const [fontName, sfnt] of FONTS) {
    it.each(OPTIONS)(`equal the sfnt tables of the ${fontName} font, %s`, (_name, options) => {
      expectTablesOf(sfnt, woffTables(encodeWoff(sfnt, options)));
    });
  }

  it('inflates the tables deflate made smaller and keeps the others as they are', () => {
    const entries = woffEntries(WOFF);
    expect(entries.map((entry) => entry.tag)).toEqual(sfntTables(MONOSPACED).map((t) => t.tag));
    const compressed = entries.filter((entry) => entry.compLength < entry.origLength);
    expect(compressed.map((entry) => entry.tag)).toEqual(expect.arrayContaining(['cmap', 'hmtx']));
    expect(entries.some((entry) => entry.compLength === entry.origLength)).toBe(true);
  });

  it('reads the flavors of TrueType and CFF outlines', () => {
    for (const flavor of [0x00010000, 0x74727565, 0x4f54544f]) {
      expectTablesOf(
        MONOSPACED,
        woffTables(
          edited((bytes) => {
            setU32(bytes, 4, flavor);
          }),
        ),
      );
    }
  });

  it('reads a view of its argument', () => {
    const padded = new Uint8Array(WOFF.length + 7);
    padded.set(WOFF, 3);
    expectTablesOf(MONOSPACED, woffTables(padded.subarray(3, 3 + WOFF.length)));
  });

  it('does not check origChecksum, the order of entries, the padding, the metadata, or the private block', () => {
    const lenient = edited((bytes) => {
      for (const entry of woffEntries(bytes)) setU32(bytes, entry.at + 16, 0xdeadbeef);
      setU32(bytes, 16, 1); // totalSfntSize
      setU32(bytes, 24, 0xffffffff); // metaOffset
      setU32(bytes, 28, 0xffffffff); // metaLength
      setU32(bytes, 36, 0xffffffff); // privOffset
      setU32(bytes, 40, 0xffffffff); // privLength
      setU16(bytes, 20, 0xffff); // majorVersion
    });
    expectTablesOf(MONOSPACED, woffTables(lenient));
  });
});

describe('refusals (D84.2, D84.4, D84.6)', () => {
  const cmap = woffEntry(WOFF, 'cmap');
  const hmtx = woffEntry(WOFF, 'hmtx');
  const glyf = woffEntry(WOFF, 'glyf');

  const cases: [string, Uint8Array, string, string][] = [
    ['nothing', new Uint8Array(0), 'font-unmeasurable', 'it is not a WOFF file'],
    ['an sfnt file', MONOSPACED, 'font-unmeasurable', 'it is not a WOFF file'],
    [
      'a WOFF2 signature',
      edited((bytes) => {
        setU32(bytes, 0, 0x774f4632);
      }),
      'font-unmeasurable',
      'it is not a WOFF file',
    ],
    ['a truncated header', WOFF.slice(0, 43), 'font-invalid', 'its WOFF header is truncated'],
    ['a byte after the file', Uint8Array.from([...WOFF, 0]), 'font-invalid', 'but the file has'],
    [
      'a length other than the file',
      edited((bytes) => {
        setU32(bytes, 8, WOFF.length - 4);
      }),
      'font-invalid',
      'its WOFF header gives a length',
    ],
    [
      'a reserved field other than 0',
      edited((bytes) => {
        setU16(bytes, 14, 1);
      }),
      'font-invalid',
      'reserved',
    ],
    [
      'no table',
      edited((bytes) => {
        setU16(bytes, 12, 0);
      }),
      'font-invalid',
      'lists no table',
    ],
    [
      'a directory past the file',
      edited((bytes) => {
        setU16(bytes, 12, 0xffff);
      }),
      'font-invalid',
      'table directory runs past',
    ],
    [
      'the flavor of a collection',
      edited((bytes) => {
        setU32(bytes, 4, 0x74746366);
      }),
      'font-unmeasurable',
      'font collection',
    ],
    [
      'an unknown flavor',
      edited((bytes) => {
        setU32(bytes, 4, 0x00020000);
      }),
      'font-unmeasurable',
      'its flavor is not',
    ],
    [
      'a table past the file',
      edited((bytes) => {
        setU32(bytes, glyf.at + 4, WOFF.length - 2);
      }),
      'font-invalid',
      'glyf table lies outside the file',
    ],
    [
      'a table length past the file',
      edited((bytes) => {
        setU32(bytes, cmap.at + 8, 0xffffffff);
      }),
      'font-invalid',
      'cmap table lies outside the file',
    ],
    [
      'a table over the directory',
      edited((bytes) => {
        setU32(bytes, glyf.at + 4, 44);
      }),
      'font-invalid',
      'overlaps the WOFF header',
    ],
    [
      'two tables over each other',
      edited((bytes) => {
        setU32(bytes, hmtx.at + 4, cmap.offset + 1);
      }),
      'font-invalid',
      'overlap',
    ],
    [
      'two entries for one tag',
      edited((bytes) => {
        bytes.set(new TextEncoder().encode('cmap'), glyf.at);
      }),
      'font-invalid',
      'lists cmap twice',
    ],
    [
      'a compLength larger than origLength',
      edited((bytes) => {
        setU32(bytes, cmap.at + 12, cmap.compLength - 1);
      }),
      'font-invalid',
      'more than its',
    ],
    [
      'a bad Adler-32',
      edited((bytes) => {
        flip(bytes, cmap.offset + cmap.compLength - 1);
      }),
      'font-invalid',
      'the zlib stream of its cmap table fails its Adler-32',
    ],
    [
      'a bad zlib header',
      edited((bytes) => {
        flip(bytes, hmtx.offset + 1);
      }),
      'font-invalid',
      'the zlib stream of its hmtx table has a header',
    ],
    [
      'a stream shorter than origLength',
      edited((bytes) => {
        setU32(bytes, cmap.at + 12, cmap.origLength + 1);
      }),
      'font-invalid',
      'the zlib stream of its cmap table ends after',
    ],
    [
      'a stream longer than origLength',
      edited((bytes) => {
        setU32(bytes, cmap.at + 12, cmap.origLength - 1);
      }),
      'font-invalid',
      'the zlib stream of its cmap table produces more',
    ],
  ];
  for (const tag of MEASURED) {
    const entry = woffEntry(WOFF, tag);
    cases.push([
      `a font without ${tag}`,
      edited((bytes) => {
        bytes[entry.at + 3] = 0x21;
      }),
      'font-unmeasurable',
      `it has no ${tag} table`,
    ]);
  }

  it.each(cases)('refuses %s', (_name, bytes, code, message) => {
    expect(refusal(() => woffTables(bytes))).toBe(code);
    expect(() => woffTables(bytes)).toThrow(message);
  });

  it('refuses stream bytes after the end of a zlib stream', () => {
    // The cmap stream followed by one byte that compLength still covers.
    const woff = edited((bytes) => {
      setU32(bytes, cmap.at + 8, cmap.compLength + 1);
    });
    const covered = woff[cmap.offset + cmap.compLength];
    expect(covered).toBeDefined();
    expect(() => woffTables(woff)).toThrow(
      'the zlib stream of its cmap table leaves bytes after its Adler-32',
    );
  });

  it('refuses five tables past 64 MiB on their declared lengths, before decoding any of them', () => {
    // Each below the limit, together past it, and every stream broken.
    const woff = edited((bytes) => {
      setU32(bytes, hmtx.at + 12, 40 * 1024 * 1024);
      setU32(bytes, cmap.at + 12, 30 * 1024 * 1024);
      for (const tag of MEASURED) {
        const entry = woffEntry(bytes, tag);
        bytes[entry.offset] = 0;
      }
    });
    expect(refusal(() => woffTables(woff))).toBe('font-unmeasurable');
    expect(() => woffTables(woff)).toThrow(
      `its tables head, hhea, maxp, hmtx, cmap would decompress to ${String(70 * 1024 * 1024 + woffEntry(WOFF, 'head').origLength + woffEntry(WOFF, 'hhea').origLength + woffEntry(WOFF, 'maxp').origLength)} bytes, past the limit of ${String(DECOMPRESSED_FONT_LIMIT)} bytes (64 MiB)`,
    );
    const huge = edited((bytes) => {
      setU32(bytes, cmap.at + 12, 0xffffffff);
    });
    expect(refusal(() => woffTables(huge))).toBe('font-unmeasurable');
  });

  it('decodes a declared length at the limit', () => {
    // A stored head and a cmap that inflates to exactly what the rest of 64 MiB leaves.
    const rest =
      DECOMPRESSED_FONT_LIMIT -
      MEASURED.filter((tag) => tag !== 'cmap').reduce(
        (sum, tag) => sum + woffEntry(WOFF, tag).origLength,
        0,
      );
    const big = new Uint8Array(rest);
    big.set(
      sfntTables(MONOSPACED).find((table) => table.tag === 'cmap')?.data ?? new Uint8Array(0),
    );
    const sfnt = sfntOf(0x00010000, {
      ...Object.fromEntries(sfntTables(MONOSPACED).map((table) => [table.tag, table.data])),
      cmap: big,
    });
    const woff = encodeWoff(sfnt);
    expect(woffEntry(woff, 'cmap').compLength).toBeLessThan(rest);
    const tables = woffTables(woff);
    expect(tables.cmap.length).toBe(rest);
    expect(fontMetrics(sfntOf(0x00010000, { ...tables }))).toEqual(fontMetrics(MONOSPACED));
  });
});

describe('seeded mutations (D84.4, D84.11)', () => {
  it('end in tables of the declared lengths or in one of the two codes, never in another exception', () => {
    const random = seededRandom(0x0ff0);
    const codes = { tables: 0, 'font-invalid': 0, 'font-unmeasurable': 0 };
    for (const [, sfnt] of FONTS) {
      for (const [, options] of OPTIONS.slice(0, 3)) {
        const woff = encodeWoff(sfnt, options);
        for (let index = 0; index < 250; index += 1) {
          const mutated = mutate(woff, random);
          let tables: FontTables | null = null;
          try {
            tables = woffTables(mutated);
          } catch (error) {
            expect(error).toBeInstanceOf(FontDecodeError);
            const { code } = error as FontDecodeError;
            expect(['font-invalid', 'font-unmeasurable']).toContain(code);
            codes[code] += 1;
          }
          if (tables !== null) {
            codes.tables += 1;
            const declared = new Map(
              woffEntries(mutated).map((entry) => [entry.tag, entry.origLength]),
            );
            for (const tag of MEASURED) expect(tables[tag].length, tag).toBe(declared.get(tag));
          }
        }
      }
    }
    expect(codes.tables + codes['font-invalid'] + codes['font-unmeasurable']).toBe(4 * 3 * 250);
    expect(codes['font-invalid']).toBeGreaterThan(0);
    expect(codes['font-unmeasurable']).toBeGreaterThan(0);
    expect(codes.tables).toBeGreaterThan(0);
  });
});
