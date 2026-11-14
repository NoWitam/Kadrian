/**
 * `fontMetrics` over the three formats (D84, PR-72): the metrics of a WOFF and
 * of a WOFF2 file equal those of the sfnt file it holds, for the monospaced
 * and the proportional fixture font in its three `cmap` variants, with
 * `glyf` and `loca` transformed and not and `hmtx` transformed with each
 * combination of bits 0 and 1 and not; one reader of tables, so a refusal of
 * D83.1 reads the same from every format; every refusal of D84.2 to D84.6
 * reaches the caller of `fontMetrics` with its code, as a `FontMetricsError`.
 */
import { generateProportionalFont } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { FontMetricsError, fontMetrics, type FontMetrics } from '../src/text-frame.js';
import { DECOMPRESSED_FONT_LIMIT } from '../src/woff.js';

import {
  encodeWoff,
  monospacedFont,
  setU32,
  sfntOf,
  sfntTables,
  woffEntry,
} from './woff-support.js';
import { encodeWoff2, type Woff2Options } from './woff2-support.js';

const FONTS = [
  ['monospaced', monospacedFont()],
  ['proportional, format 4', generateProportionalFont('format-4')],
  ['proportional, format 12', generateProportionalFont('format-12')],
  ['proportional, both', generateProportionalFont('both')],
] as const;

/** The ways the test encoder writes a WOFF2 file: `glyf` null or transformed, and every `hmtx`. */
const WOFF2_FORMS: readonly (readonly [string, Woff2Options])[] = [
  ['glyf not transformed', { glyf: 'null' }],
  ['glyf transformed', { glyf: 'transformed' }],
  ['hmtx without proportional bearings', { glyf: 'transformed', hmtx: 1 }],
  ['hmtx without monospaced bearings', { glyf: 'transformed', hmtx: 2 }],
  ['hmtx without any bearing', { glyf: 'transformed', hmtx: 3 }],
];

/** The metrics as plain data, advances in the order the reader wrote them. */
function plain(metrics: FontMetrics): unknown {
  return {
    unitsPerEm: metrics.unitsPerEm,
    notdefAdvance: metrics.notdefAdvance,
    advances: [...metrics.advances],
  };
}

/** The error a call of `fontMetrics` throws; anything that is not a `FontMetricsError` fails the test. */
function refusal(bytes: Uint8Array): FontMetricsError {
  try {
    fontMetrics(bytes);
  } catch (error) {
    if (error instanceof FontMetricsError) return error;
    throw error;
  }
  throw new Error('fontMetrics accepted the bytes.');
}

/** An sfnt file of the proportional font with one of its five tables replaced. */
function withTable(tag: string, data: (original: Uint8Array) => Uint8Array): Uint8Array {
  const font = generateProportionalFont();
  const tables = Object.fromEntries(
    sfntTables(font).map((table) => [table.tag, table.tag === tag ? data(table.data) : table.data]),
  );
  return sfntOf(0x00010000, tables);
}

describe.each(FONTS)('the %s font (D84.1)', (_, sfnt) => {
  const expected = plain(fontMetrics(sfnt));

  it('measures as WOFF as it does as sfnt, compressed and stored', () => {
    expect(plain(fontMetrics(encodeWoff(sfnt)))).toEqual(expected);
    const stored = encodeWoff(sfnt, { stored: ['head', 'hhea', 'maxp', 'hmtx', 'cmap'] });
    expect(plain(fontMetrics(stored))).toEqual(expected);
  });

  it.each(WOFF2_FORMS)('measures as WOFF2 as it does as sfnt, %s', (_form, options) => {
    expect(plain(fontMetrics(encodeWoff2(sfnt, options)))).toEqual(expected);
  });
});

describe('one reader of tables for the three formats (D84.3)', () => {
  it.each([
    [
      'a truncated hmtx',
      withTable('hmtx', (hmtx) => hmtx.subarray(0, 2)),
      'its hmtx table is truncated',
    ],
    [
      'a unitsPerEm past 16384',
      withTable('head', (head) => {
        const copy = head.slice();
        copy[18] = 0x80;
        copy[19] = 0x00;
        return copy;
      }),
      'its unitsPerEm, 32768, is not from 16 to 16384',
    ],
    [
      'a cmap without a subtable it reads',
      withTable('cmap', () => Uint8Array.of(0, 0, 0, 0)),
      'its cmap has no Unicode subtable of format 4 or 12',
    ],
  ])('refuses %s in sfnt, WOFF, and WOFF2 alike, as font-unmeasurable', (_, sfnt, message) => {
    for (const bytes of [sfnt, encodeWoff(sfnt), encodeWoff2(sfnt, { glyf: 'null' })]) {
      const error = refusal(bytes);
      expect(error.code).toBe('font-unmeasurable');
      expect(error.message).toContain(message);
    }
  });
});

describe('the refusals of WOFF and WOFF2 reach fontMetrics with their codes (D84.6)', () => {
  const sfnt = generateProportionalFont();

  it('is a FontMetricsError of its own name for every format', () => {
    const woff = encodeWoff(sfnt);
    woff[woff.length - 1] = 1;
    setU32(woff, 8, woff.length + 1);
    for (const bytes of [Uint8Array.of(0, 1, 0, 0), woff]) {
      expect(refusal(bytes).name).toBe('FontMetricsError');
      expect(refusal(bytes)).toBeInstanceOf(RangeError);
    }
  });

  it('refuses a damaged WOFF container or stream as font-invalid', () => {
    const lying = encodeWoff(sfnt);
    setU32(lying, 8, lying.length + 4);
    expect(refusal(lying).code).toBe('font-invalid');
    expect(refusal(lying).message).toContain('The font is invalid: its WOFF header gives a length');
    const broken = encodeWoff(sfnt);
    const cmap = woffEntry(broken, 'cmap');
    broken[cmap.offset + cmap.compLength - 1] =
      (broken[cmap.offset + cmap.compLength - 1] ?? 0) ^ 1;
    expect(refusal(broken).code).toBe('font-invalid');
    expect(refusal(broken).message).toContain('cmap');
  });

  it('refuses a damaged WOFF2 container or stream as font-invalid', () => {
    const lying = encodeWoff2(sfnt);
    setU32(lying, 8, lying.length - 1);
    expect(refusal(lying).code).toBe('font-invalid');
    const cut = encodeWoff2(sfnt, { glyf: 'null' });
    // The stream's length in the header, shortened: the stream ends before the five tables.
    setU32(cut, 20, 4);
    expect(refusal(cut).code).toBe('font-invalid');
    expect(refusal(cut).message).toContain('Brotli stream');
  });

  it('refuses a WOFF2 collection and a WOFF of another flavor as font-unmeasurable', () => {
    const collection = encodeWoff2(sfnt, { flavor: 0x74746366 });
    expect(refusal(collection).code).toBe('font-unmeasurable');
    expect(refusal(collection).message).toContain('font collection');
    const other = encodeWoff(sfnt);
    setU32(other, 4, 0x4f54544e);
    expect(refusal(other).code).toBe('font-unmeasurable');
    expect(refusal(other).message).toContain('its flavor is not an sfnt font');
  });

  it('refuses a WOFF past 64 MiB as font-unmeasurable, naming the limit', () => {
    const huge = encodeWoff(sfnt);
    setU32(huge, woffEntry(huge, 'cmap').at + 12, DECOMPRESSED_FONT_LIMIT);
    const error = refusal(huge);
    expect(error.code).toBe('font-unmeasurable');
    expect(error.message).toContain(`past the limit of ${String(DECOMPRESSED_FONT_LIMIT)} bytes`);
  });

  it('still refuses an sfnt collection and an unknown format as font-unmeasurable', () => {
    const collection = sfnt.slice();
    setU32(collection, 0, 0x74746366);
    expect(refusal(collection).code).toBe('font-unmeasurable');
    expect(refusal(collection).message).toContain('font collection');
    const unknown = sfnt.slice();
    setU32(unknown, 0, 0x4f54544e);
    expect(refusal(unknown).message).toContain('it is not an sfnt, WOFF, or WOFF2 font');
  });
});
