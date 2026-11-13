/**
 * The WOFF 2.0 container (D84.3, PR-71): the five tables read from WOFF2 files
 * of the generated fixture fonts (D27.5), written by the test encoder over
 * `node:zlib` with `glyf` and `loca` transformed and not and `hmtx`
 * transformed with each combination of its bits and not, equal the tables of
 * the sfnt files byte for byte (a transformed `hmtx` in its advances and the
 * bearings it kept), and give the metrics of the sfnt file; the stream is
 * decoded only up to the last of them, and `glyf` is never read; every refusal
 * of D84.3 to D84.6 with its code; seeded mutations end in tables or in one of
 * the two codes, never in another exception.
 */
import { constants } from 'node:zlib';

import { generateProportionalFont } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { BitWriter } from '../scripts/brotli-dictionary.js';
import { fontMetrics } from '../src/text-frame.js';
import {
  DECOMPRESSED_FONT_LIMIT,
  FontDecodeError,
  woff2Tables,
  type FontTables,
} from '../src/woff.js';

import { seededRandom } from './support.js';
import { monospacedFont, mutate, setU16, setU32, sfntOf, sfntTables, u32 } from './woff-support.js';
import {
  KNOWN_TAGS,
  assembleWoff2,
  encodeWoff2,
  encodeWoff2Tables,
  markedHead,
  transformGlyf,
  woff2Entries,
  woff2Entry,
  type Woff2Assembly,
  type Woff2Options,
  type Woff2Table,
} from './woff2-support.js';

const MEASURED = ['head', 'hhea', 'maxp', 'hmtx', 'cmap'] as const;

const FONTS = [
  ['monospaced', monospacedFont()],
  ['proportional, format 4', generateProportionalFont('format-4')],
  ['proportional, format 12', generateProportionalFont('format-12')],
  ['proportional, both', generateProportionalFont('both')],
] as const;

const PROPORTIONAL = generateProportionalFont('both');
const WOFF2 = encodeWoff2(PROPORTIONAL);

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

function edited(edit: (bytes: Uint8Array) => void, from: Uint8Array = WOFF2): Uint8Array {
  const copy = from.slice();
  edit(copy);
  return copy;
}

function u16(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

/** A WOFF2 file of the proportional font whose table entries `edit` changes. */
function withTables(
  edit: (tables: Woff2Table[]) => Woff2Table[],
  options: Woff2Options & Woff2Assembly = { hmtx: 3 },
): Uint8Array {
  return assembleWoff2(edit(encodeWoff2Tables(PROPORTIONAL, options)), options);
}

function replaced(tables: Woff2Table[], tag: string, change: Partial<Woff2Table>): Woff2Table[] {
  return tables.map((table) => (table.tag === tag ? { ...table, ...change } : table));
}

/**
 * Expects the tables of a WOFF2 file to be those of the sfnt file: `head` with
 * bit 11 of its flags unless the encoder left it, a transformed `hmtx` in its
 * advances and the bearings it kept, and the metrics of the sfnt file.
 */
function expectTablesOf(sfnt: Uint8Array, tables: FontTables, options: Woff2Options = {}): void {
  const original = new Map(sfntTables(sfnt).map((table) => [table.tag, table.data]));
  const head = original.get('head') ?? new Uint8Array(0);
  expect(tables.head).toEqual(options.markHead === false ? head : markedHead(head));
  for (const tag of ['hhea', 'maxp', 'cmap'] as const) {
    expect(tables[tag], tag).toEqual(original.get(tag));
  }
  const hmtx = original.get('hmtx') ?? new Uint8Array(0);
  const flags = options.hmtx ?? 0;
  if (flags === 0) {
    expect(tables.hmtx).toEqual(hmtx);
  } else {
    expect(tables.hmtx.length).toBe(hmtx.length);
    const metrics = u16(original.get('hhea') ?? new Uint8Array(0), 34);
    for (let at = 0; at < hmtx.length; at += 2) {
      const advance = at < metrics * 4 && at % 4 === 0;
      const omitted = at < metrics * 4 ? (flags & 1) !== 0 : (flags & 2) !== 0;
      const expected = advance || !omitted ? u16(hmtx, at) : 0;
      expect(u16(tables.hmtx, at), `hmtx at ${String(at)}`).toBe(expected);
    }
  }
  // The reader of tables of PR-72 sees what it sees in the sfnt file.
  expect(fontMetrics(sfntOf(u32(sfnt, 0), { ...tables }))).toEqual(fontMetrics(sfnt));
}

const OTHERS = ['OS/2', 'glyf', 'loca', 'name', 'post'];

const OPTIONS: [string, Woff2Options][] = [
  ['with glyf and loca transformed', {}],
  ['with glyf and loca not transformed', { glyf: 'null' }],
  ['with hmtx transformed without its proportional bearings', { hmtx: 1 }],
  ['with hmtx transformed without its monospaced bearings', { hmtx: 2 }],
  ['with hmtx transformed without any bearing', { hmtx: 3 }],
  ['with every tag written out', { arbitraryTags: true, hmtx: 3 }],
  ['at quality 0 with a window of 10', { quality: 0, window: 10 }],
  ['at quality 5 in the generic mode', { quality: 5, mode: constants.BROTLI_MODE_GENERIC }],
  ['with the five tables first', { order: [...MEASURED, ...OTHERS], hmtx: 1 }],
  ['with the five tables last', { order: [...OTHERS, ...MEASURED] }],
  ['with cmap after glyf and before loca', { order: ['glyf', 'cmap', ...MEASURED, ...OTHERS] }],
  [
    'with a metadata and a private block',
    {
      metadata: new TextEncoder().encode('not a Brotli stream, never read'),
      privateData: Uint8Array.of(1, 2, 3),
    },
  ],
  ['with head as it is', { markHead: false }],
];

describe('the tables of a WOFF2 file (D84.3)', () => {
  for (const [fontName, sfnt] of FONTS) {
    it.each(OPTIONS)(`equal the sfnt tables of the ${fontName} font, %s`, (_name, options) => {
      expectTablesOf(sfnt, woff2Tables(encodeWoff2(sfnt, options)), options);
    });
  }

  it('equal the sfnt tables byte for byte when the encoder leaves head as it is', () => {
    const tables = woff2Tables(encodeWoff2(PROPORTIONAL, { markHead: false }));
    const original = new Map(sfntTables(PROPORTIONAL).map((table) => [table.tag, table.data]));
    for (const tag of MEASURED) expect(tables[tag], tag).toEqual(original.get(tag));
  });

  it('reads the flavors of TrueType and CFF outlines', () => {
    for (const flavor of [0x00010000, 0x74727565, 0x4f54544f]) {
      expectTablesOf(PROPORTIONAL, woff2Tables(encodeWoff2(PROPORTIONAL, { flavor })));
    }
  });

  it('reads a view of its argument', () => {
    const padded = new Uint8Array(WOFF2.length + 7);
    padded.set(WOFF2, 3);
    expectTablesOf(PROPORTIONAL, woff2Tables(padded.subarray(3, 3 + WOFF2.length)));
  });

  it('writes the transforms the test asked for', () => {
    const versions = (options: Woff2Options): Record<string, number | null> =>
      Object.fromEntries(
        woff2Entries(encodeWoff2(PROPORTIONAL, options)).entries.map((entry) => [
          entry.tag,
          entry.transformLength === null ? null : entry.version,
        ]),
      );
    expect(versions({ hmtx: 3 })).toMatchObject({ glyf: 0, loca: 0, hmtx: 1, cmap: null });
    expect(versions({ glyf: 'null' })).toMatchObject({ glyf: null, loca: null, hmtx: null });
    expect(woff2Entry(WOFF2, 'loca').transformLength).toBe(0);
    expect(woff2Entry(WOFF2, 'glyf').transformLength).toBeLessThan(
      woff2Entry(WOFF2, 'glyf').origLength,
    );
  });

  it('decodes the stream only up to the end of the last of the five tables', () => {
    // An uncompressed meta-block holds the five tables; what follows is not Brotli at all.
    const tables = encodeWoff2Tables(PROPORTIONAL, { order: [...MEASURED, ...OTHERS], hmtx: 3 });
    const five = tables.slice(0, 5).flatMap((table) => Array.from(table.data));
    const stream = new BitWriter()
      .bits(0, 1) // WBITS 16
      .bits(0, 1) // not the last meta-block
      .bits(0, 2) // four nibbles
      .bits(five.length - 1, 16)
      .bits(1, 1) // uncompressed
      .raw(Uint8Array.from(five))
      .raw(Uint8Array.of(0xff, 0xff, 0xff, 0xff))
      .toBytes();
    expectTablesOf(PROPORTIONAL, woff2Tables(assembleWoff2(tables, { stream })), { hmtx: 3 });
  });

  it('never reconstructs glyf or loca: a transformed glyf of random bytes is skipped', () => {
    const random = seededRandom(0x91f);
    const woff2 = withTables((tables) => {
      const glyf = tables.find((table) => table.tag === 'glyf');
      const noise = Uint8Array.from({ length: glyf?.data.length ?? 0 }, () =>
        Math.floor(random() * 256),
      );
      return replaced(tables, 'glyf', { data: noise });
    });
    expectTablesOf(PROPORTIONAL, woff2Tables(woff2), { hmtx: 3 });
  });

  it('accepts the largest UIntBase128 for a table it does not read', () => {
    const woff2 = withTables(
      (tables) => [
        ...tables,
        {
          tag: 'zzzz',
          version: 0,
          origLength: 0xffffffff,
          data: new Uint8Array(0),
          lengthBytes: [0x8f, 0xff, 0xff, 0xff, 0x7f],
        },
      ],
      { hmtx: 3, quality: 1 },
    );
    expectTablesOf(PROPORTIONAL, woff2Tables(woff2), { hmtx: 3 });
  });
});

// --- the encoder's glyf transform, read back from the specification ----------

/**
 * The point of a triplet (WOFF 2.0, 5.2), read from the table of the
 * specification: the bits and the added amount of each coordinate by index.
 */
function tripletPoint(flag: number, bytes: number[]): [number, number] {
  const index = flag & 0x7f;
  const sign = (positive: number, value: number): number => (positive !== 0 ? value : -value);
  const [b0 = 0, b1 = 0, b2 = 0, b3 = 0] = bytes;
  if (index < 10) return [0, sign(index & 1, ((index >> 1) << 8) + b0)];
  if (index < 20) return [sign((index - 10) & 1, (((index - 10) >> 1) << 8) + b0), 0];
  if (index < 84) {
    const j = index - 20;
    return [
      sign(j & 1, 1 + (j & 0x30) + (b0 >> 4)),
      sign(j & 2, 1 + ((j & 0x0c) << 2) + (b0 & 0x0f)),
    ];
  }
  if (index < 120) {
    const j = index - 84;
    return [
      sign(j & 1, 1 + (Math.floor(j / 12) << 8) + b0),
      sign(j & 2, 1 + (((j % 12) >> 2) << 8) + b1),
    ];
  }
  if (index < 124) {
    const j = index - 120;
    return [sign(j & 1, (b0 << 4) + (b1 >> 4)), sign(j & 2, ((b1 & 0x0f) << 8) + b2)];
  }
  const j = index - 124;
  return [sign(j & 1, (b0 << 8) + b1), sign(j & 2, (b2 << 8) + b3)];
}

/** The byte count of a triplet by index, flag included (WOFF 2.0, 5.2). */
function tripletBytes(flag: number): number {
  const index = flag & 0x7f;
  if (index < 84) return 1;
  if (index < 120) return 2;
  return index < 124 ? 3 : 4;
}

describe("the test encoder's glyf transform (WOFF 2.0, 5.1 and 5.2)", () => {
  it.each(FONTS)('gives back every point of the %s font', (_name, sfnt) => {
    const tables = new Map(sfntTables(sfnt).map((table) => [table.tag, table.data]));
    const glyf = tables.get('glyf') ?? new Uint8Array(0);
    const loca = tables.get('loca') ?? new Uint8Array(0);
    const transformed = transformGlyf(sfnt);
    const numGlyphs = u16(transformed, 4);
    expect(numGlyphs).toBe(u16(tables.get('maxp') ?? new Uint8Array(0), 4));
    const sizes = Array.from({ length: 7 }, (_, index) => u32(transformed, 8 + index * 4));
    let at = 36;
    const streams = sizes.map((size) => {
      const stream = transformed.subarray(at, at + size);
      at += size;
      return stream;
    });
    expect(at).toBe(transformed.length);
    const [contours, points, flags, coordinates] = streams as [
      Uint8Array,
      Uint8Array,
      Uint8Array,
      Uint8Array,
    ];
    let pointAt = 0;
    let flagAt = 0;
    let coordinateAt = 0;
    for (let glyph = 0; glyph < numGlyphs; glyph += 1) {
      const start = u16(loca, glyph * 2) * 2;
      const end = u16(loca, glyph * 2 + 2) * 2;
      const count = u16(contours, glyph * 2);
      if (start === end) {
        expect(count).toBe(0);
        continue;
      }
      expect(count).toBe(u16(glyf, start));
      // Each contour's point count (one byte for these fonts), then each point.
      const ends: number[] = [];
      for (let contour = 0; contour < count; contour += 1) {
        ends.push((ends.at(-1) ?? -1) + (points[pointAt] ?? 0));
        pointAt += 1;
      }
      for (let contour = 0; contour < count; contour += 1) {
        expect(ends[contour]).toBe(u16(glyf, start + 10 + contour * 2));
      }
      // The fixture glyphs: one flag byte 0x01 per point, then 16-bit x deltas, then y deltas.
      const total = (ends.at(-1) ?? -1) + 1;
      const xAt = start + 10 + count * 2 + 2 + total;
      for (let point = 0; point < total; point += 1) {
        const flag = flags[flagAt] ?? 0;
        flagAt += 1;
        expect(flag & 0x80, 'on curve').toBe(0);
        const bytes = Array.from(
          coordinates.subarray(coordinateAt, coordinateAt + tripletBytes(flag)),
        );
        coordinateAt += tripletBytes(flag);
        const signed = (value: number): number => (value >= 0x8000 ? value - 0x10000 : value);
        expect(tripletPoint(flag, bytes)).toEqual([
          signed(u16(glyf, xAt + point * 2)),
          signed(u16(glyf, xAt + total * 2 + point * 2)),
        ]);
      }
      expect(coordinates[coordinateAt]).toBe(0); // no instructions
      coordinateAt += 1;
    }
    expect(coordinateAt).toBe(coordinates.length);
  });

  it('writes the 63 known tags of the specification', () => {
    expect(KNOWN_TAGS).toHaveLength(63);
    expect(new Set(KNOWN_TAGS).size).toBe(63);
    expect([KNOWN_TAGS[0], KNOWN_TAGS[3], KNOWN_TAGS[10], KNOWN_TAGS[11], KNOWN_TAGS[62]]).toEqual([
      'cmap',
      'hmtx',
      'glyf',
      'loca',
      'Sill',
    ]);
  });
});

// --- refusals ---------------------------------------------------------------

describe('refusals (D84.3, D84.4, D84.5, D84.6)', () => {
  const directoryEnd = woff2Entries(WOFF2).dataStart;
  const cases: [string, Uint8Array, string, string][] = [
    ['nothing', new Uint8Array(0), 'font-unmeasurable', 'it is not a WOFF2 file'],
    ['an sfnt file', PROPORTIONAL, 'font-unmeasurable', 'it is not a WOFF2 file'],
    [
      'a WOFF signature',
      edited((bytes) => {
        setU32(bytes, 0, 0x774f4646);
      }),
      'font-unmeasurable',
      'it is not a WOFF2 file',
    ],
    ['a truncated header', WOFF2.slice(0, 47), 'font-invalid', 'its WOFF2 header is truncated'],
    ['a byte after the file', Uint8Array.from([...WOFF2, 0]), 'font-invalid', 'but the file has'],
    [
      'a length other than the file',
      edited((bytes) => {
        setU32(bytes, 8, WOFF2.length - 4);
      }),
      'font-invalid',
      'its WOFF2 header gives a length',
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
      'the flavor of a collection',
      encodeWoff2(PROPORTIONAL, { flavor: 0x74746366 }),
      'font-unmeasurable',
      'font collection',
    ],
    [
      'an unknown flavor',
      encodeWoff2(PROPORTIONAL, { flavor: 0x00020000 }),
      'font-unmeasurable',
      'its flavor is not',
    ],
    [
      'a directory past the file',
      edited(
        (bytes) => {
          setU32(bytes, 8, 52);
        },
        WOFF2.slice(0, 52),
      ),
      'font-invalid',
      'table directory runs past the end of the file',
    ],
    [
      'compressed data past the file',
      edited((bytes) => {
        setU32(bytes, 20, WOFF2.length - directoryEnd + 1);
      }),
      'font-invalid',
      'its compressed data runs past the end of the file',
    ],
    [
      'a UIntBase128 with a leading zero',
      withTables((tables) => replaced(tables, 'name', { lengthBytes: [0x80, 0x05] })),
      'font-invalid',
      'the origLength of its name table is a UIntBase128 with a leading zero',
    ],
    [
      'a UIntBase128 longer than five bytes',
      withTables((tables) =>
        replaced(tables, 'name', { lengthBytes: [0x81, 0x80, 0x80, 0x80, 0x80, 0x00] }),
      ),
      'font-invalid',
      'is a UIntBase128 longer than five bytes',
    ],
    [
      'a UIntBase128 past 2^32 - 1',
      withTables((tables) =>
        replaced(tables, 'name', { lengthBytes: [0x90, 0x80, 0x80, 0x80, 0x00] }),
      ),
      'font-invalid',
      'is a UIntBase128 past 2^32 - 1',
    ],
    [
      'two entries for one tag',
      withTables((tables) => replaced(tables, 'post', { tag: 'cmap' })),
      'font-invalid',
      'lists cmap twice',
    ],
    [
      'a transform of cmap',
      withTables((tables) => replaced(tables, 'cmap', { version: 1 })),
      'font-invalid',
      'its cmap table names the transform version 1, which is not defined',
    ],
    [
      'the transform version 1 of glyf',
      withTables((tables) => replaced(tables, 'glyf', { version: 1 })),
      'font-invalid',
      'its glyf table names the transform version 1',
    ],
    [
      'the transform version 2 of hmtx',
      withTables((tables) => replaced(tables, 'hmtx', { version: 2 })),
      'font-invalid',
      'its hmtx table names the transform version 2',
    ],
    [
      'the transform version 2 of loca',
      withTables((tables) => replaced(tables, 'loca', { version: 2 })),
      'font-invalid',
      'its loca table names the transform version 2',
    ],
    [
      'a transformed loca with a transformLength other than 0',
      withTables((tables) =>
        replaced(tables, 'loca', { transformLength: 4, data: new Uint8Array(4) }),
      ),
      'font-invalid',
      'its transformed loca table has a transformLength of 4, not 0',
    ],
    [
      'a transformed hmtx without a transformed glyf',
      encodeWoff2(PROPORTIONAL, { glyf: 'null', hmtx: 3 }),
      'font-invalid',
      'its hmtx table is transformed without a transformed glyf table',
    ],
    [
      'a transformed hmtx with a reserved flag bit',
      withTables((tables) =>
        tables.map((table) =>
          table.tag === 'hmtx'
            ? { ...table, data: Uint8Array.from([0x07, ...table.data.subarray(1)]) }
            : table,
        ),
      ),
      'font-invalid',
      'its transformed hmtx table sets reserved flag bits',
    ],
    [
      'a transformed hmtx with neither bit 0 nor bit 1',
      withTables((tables) =>
        tables.map((table) =>
          table.tag === 'hmtx'
            ? { ...table, data: Uint8Array.from([0x00, ...table.data.subarray(1)]) }
            : table,
        ),
      ),
      'font-invalid',
      'omits neither the proportional nor the monospaced bearings',
    ],
    [
      'a transformed hmtx longer than its flags give',
      withTables((tables) =>
        tables.map((table) =>
          table.tag === 'hmtx'
            ? {
                ...table,
                transformLength: table.data.length + 2,
                data: Uint8Array.from([...table.data, 0, 0]),
              }
            : table,
        ),
      ),
      'font-invalid',
      'but its flags give',
    ],
    [
      'a transformed hmtx shorter than its flags give',
      withTables(
        (tables) =>
          tables.map((table) =>
            table.tag === 'hmtx'
              ? {
                  ...table,
                  transformLength: table.data.length - 2,
                  data: table.data.subarray(0, -2),
                }
              : table,
          ),
        { hmtx: 1 },
      ),
      'font-invalid',
      'but its flags give',
    ],
    [
      'an hhea too short for a transformed hmtx',
      withTables((tables) =>
        tables.map((table) =>
          table.tag === 'hhea'
            ? { ...table, origLength: 34, data: table.data.subarray(0, 34) }
            : table,
        ),
      ),
      'font-unmeasurable',
      'its hhea table is too short',
    ],
    [
      'a maxp too short for a transformed hmtx',
      withTables((tables) =>
        tables.map((table) =>
          table.tag === 'maxp'
            ? { ...table, origLength: 4, data: table.data.subarray(0, 4) }
            : table,
        ),
      ),
      'font-unmeasurable',
      'its maxp table is too short',
    ],
    [
      'a numberOfHMetrics of 0 with a transformed hmtx',
      withTables((tables) =>
        tables.map((table) => {
          if (table.tag !== 'hhea') return table;
          const data = table.data.slice();
          setU16(data, 34, 0);
          return { ...table, data };
        }),
      ),
      'font-unmeasurable',
      'its numberOfHMetrics, 0, is not from 1 to numGlyphs',
    ],
    [
      'a damaged Brotli stream',
      edited((bytes) => {
        bytes.fill(0xff, directoryEnd, directoryEnd + 8);
      }),
      'font-invalid',
      'the Brotli stream of its tables',
    ],
    [
      'tables past the end of the stream',
      withTables(
        (tables) =>
          tables.map((table) =>
            table.tag === 'cmap' ? { ...table, origLength: table.origLength + 100_000 } : table,
          ),
        { order: [...OTHERS, ...MEASURED], hmtx: 3 },
      ),
      'font-invalid',
      'the Brotli stream of its tables ends after',
    ],
  ];
  for (const tag of MEASURED) {
    cases.push([
      `a font without ${tag}`,
      withTables((tables) => replaced(tables, tag, { tag: 'zzzz' }), { glyf: 'null' }),
      'font-unmeasurable',
      `it has no ${tag} table`,
    ]);
  }

  it.each(cases)('refuses %s', (_name, bytes, code, message) => {
    expect(refusal(() => woff2Tables(bytes))).toBe(code);
    expect(() => woff2Tables(bytes)).toThrow(message);
  });

  it('refuses a stream past 64 MiB on its declared lengths, before decoding any of it', () => {
    // A table before the five that would take the stream past the limit, and a broken stream.
    const woff2 = withTables(
      (tables) => [
        {
          tag: 'zzzz',
          version: 0,
          origLength: DECOMPRESSED_FONT_LIMIT,
          data: new Uint8Array(0),
        },
        ...tables,
      ],
      { hmtx: 3, stream: Uint8Array.of(0xff, 0xff) },
    );
    expect(refusal(() => woff2Tables(woff2))).toBe('font-unmeasurable');
    const end = Math.max(
      ...woff2Entries(woff2)
        .entries.filter((entry) => (MEASURED as readonly string[]).includes(entry.tag))
        .map((entry) => entry.start + entry.length),
    );
    expect(end).toBeGreaterThan(DECOMPRESSED_FONT_LIMIT);
    expect(() => woff2Tables(woff2)).toThrow(
      `the stream of its tables up to the end of head, hhea, maxp, hmtx, cmap would decompress to ${String(end)} bytes, past the limit of ${String(DECOMPRESSED_FONT_LIMIT)} bytes (64 MiB)`,
    );
  });

  it('decodes a stream up to the limit', () => {
    // A table of zeros before the five tables, which brings their end to exactly 64 MiB.
    const tables = encodeWoff2Tables(PROPORTIONAL, { order: [...MEASURED, ...OTHERS], hmtx: 3 });
    const five = tables.slice(0, 5).reduce((sum, table) => sum + table.data.length, 0);
    const zeros = new Uint8Array(DECOMPRESSED_FONT_LIMIT - five);
    const woff2 = assembleWoff2(
      [{ tag: 'zzzz', version: 0, origLength: zeros.length, data: zeros }, ...tables],
      { quality: 1, window: 24 },
    );
    expectTablesOf(PROPORTIONAL, woff2Tables(woff2), { hmtx: 3 });
  });
});

// --- seeded mutations -------------------------------------------------------

describe('seeded mutations (D84.4, D84.11)', () => {
  it('end in tables no longer than declared or in one of the two codes, never in another exception', () => {
    const random = seededRandom(0x2f2f);
    const codes = { tables: 0, 'font-invalid': 0, 'font-unmeasurable': 0 };
    const variants: Woff2Options[] = [{}, { hmtx: 3 }, { glyf: 'null', quality: 4 }];
    for (const [, sfnt] of FONTS) {
      for (const options of variants) {
        const woff2 = encodeWoff2(sfnt, options);
        for (let index = 0; index < 200; index += 1) {
          const mutated = mutate(woff2, random);
          let tables: FontTables | null = null;
          try {
            tables = woff2Tables(mutated);
          } catch (error) {
            expect(error).toBeInstanceOf(FontDecodeError);
            const { code } = error as FontDecodeError;
            expect(['font-invalid', 'font-unmeasurable']).toContain(code);
            codes[code] += 1;
          }
          if (tables !== null) {
            codes.tables += 1;
            // Views of one stream within the limit, and an hmtx of at most 65 535 glyphs.
            const viewed = tables.head.length + tables.hhea.length + tables.maxp.length;
            expect(viewed + tables.cmap.length).toBeLessThanOrEqual(DECOMPRESSED_FONT_LIMIT);
            expect(tables.hmtx.length).toBeLessThanOrEqual(
              Math.max(DECOMPRESSED_FONT_LIMIT, 4 * 65_535),
            );
          }
        }
      }
    }
    expect(codes.tables + codes['font-invalid'] + codes['font-unmeasurable']).toBe(4 * 3 * 200);
    expect(codes['font-invalid']).toBeGreaterThan(0);
    expect(codes['font-unmeasurable']).toBeGreaterThan(0);
    expect(codes.tables).toBeGreaterThan(0);
  });
});
