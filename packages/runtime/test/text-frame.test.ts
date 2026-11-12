/**
 * Lines measured from the font (D83, PR-65): `fontMetrics` reads the advances
 * the generators of the fixture fonts wrote, through a format 4 and a format
 * 12 subtable, and refuses what it cannot measure; the measure equals an
 * independent rational reference; `textLines` and `captionPagesByWidth` equal
 * an independent greedy reference on seeded texts; the mode `characters` is
 * `captionPages` unchanged; and `frameLayout` places every alignment and
 * overflow.
 */
import type { CaptionWord } from '@kadrion/schema';
import {
  FONT_NOTDEF_ADVANCE,
  generateProportionalFont,
  generateReferenceAssets,
  PROPORTIONAL_FONT_ADVANCES,
  type FixtureFontCmap,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { captionPages } from '../src/index.js';
import {
  captionPagesByWidth,
  fitsWidth,
  fontMetrics,
  frameLayout,
  measureText,
  textLines,
  textLinesFitHeight,
  unitsToPixels,
  type CaptionsFrameInput,
  type FontMetrics,
  type FrameAlign,
  type FrameVerticalAlign,
  type TextFrameInput,
} from '../src/text-frame.js';

import { seededRandom } from './support.js';

/** The advance the generator wrote for a character, read from its table and not from the font. */
function written(character: string): number {
  return PROPORTIONAL_FONT_ADVANCES[character] ?? FONT_NOTDEF_ADVANCE;
}

const METRICS = fontMetrics(generateProportionalFont());

// --- a minimal sfnt written here, for the paths the fixture fonts do not take ---

class Bytes {
  readonly values: number[] = [];

  u16(...values: number[]): this {
    for (const value of values) this.values.push((value >>> 8) & 0xff, value & 0xff);
    return this;
  }

  u32(...values: number[]): this {
    for (const value of values) this.u16(value >>> 16, value & 0xffff);
    return this;
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.values);
  }
}

/** An sfnt of the given tables, sorted by tag, with no checksums (`fontMetrics` reads none). */
function sfnt(tables: Readonly<Record<string, Uint8Array>>, signature = 0x00010000): Uint8Array {
  const tags = Object.keys(tables).sort();
  const header = new Bytes().u32(signature).u16(tags.length, 0, 0, 0);
  const body: number[] = [];
  let offset = 12 + tags.length * 16;
  for (const tag of tags) {
    const data = tables[tag] ?? new Uint8Array(0);
    for (const character of tag) header.values.push(character.charCodeAt(0));
    header.u32(0, offset, data.length);
    body.push(...data);
    while (body.length % 4 !== 0) body.push(0);
    offset = 12 + tags.length * 16 + body.length;
  }
  return Uint8Array.from([...header.values, ...body]);
}

/** `head`, `hhea`, `maxp`, and `hmtx` of a font with these long advances, the last one repeated up to `numGlyphs`. */
function metricTables(
  advances: readonly number[],
  numGlyphs: number,
  unitsPerEm = 1000,
): Record<string, Uint8Array> {
  const head = new Bytes().u32(0x00010000, 0x00010000, 0, 0x5f0f3cf5).u16(0, unitsPerEm);
  while (head.values.length < 54) head.values.push(0);
  const hhea = new Bytes().u32(0x00010000);
  while (hhea.values.length < 34) hhea.values.push(0);
  hhea.u16(advances.length);
  const hmtx = new Bytes();
  for (const advance of advances) hmtx.u16(advance, 0);
  for (let glyph = advances.length; glyph < numGlyphs; glyph += 1) hmtx.u16(0);
  return {
    head: head.bytes(),
    hhea: hhea.bytes(),
    maxp: new Bytes().u32(0x00005000).u16(numGlyphs).bytes(),
    hmtx: hmtx.bytes(),
  };
}

function cmapOf(...subtables: (readonly [number, number, Uint8Array])[]): Uint8Array {
  const out = new Bytes().u16(0, subtables.length);
  let offset = 4 + subtables.length * 8;
  for (const [platform, encoding, data] of subtables) {
    out.u16(platform, encoding).u32(offset);
    offset += data.length;
  }
  for (const [, , data] of subtables) out.values.push(...data);
  return out.bytes();
}

/**
 * A format 4 subtable: each segment either maps by `delta` alone or through
 * its own glyph IDs (`idRangeOffset`), and the final segment of U+FFFF.
 */
interface Segment {
  readonly start: number;
  readonly end: number;
  readonly delta?: number;
  readonly glyphs?: readonly number[];
}

function format4(segments: readonly Segment[]): Uint8Array {
  const all: Segment[] = [...segments, { start: 0xffff, end: 0xffff, delta: 1 }];
  const count = all.length;
  const glyphArray: number[] = [];
  const rangeOffsets = all.map((segment, index) => {
    if (segment.glyphs === undefined) return 0;
    const offset = (count - index) * 2 + glyphArray.length * 2;
    glyphArray.push(...segment.glyphs);
    return offset;
  });
  const out = new Bytes().u16(4, 0, 0, count * 2, 0, 0, 0);
  out.u16(...all.map(({ end }) => end), 0);
  out.u16(...all.map(({ start }) => start));
  out.u16(...all.map((segment) => (segment.delta ?? 0) & 0xffff));
  out.u16(...rangeOffsets, ...glyphArray);
  const bytes = out.bytes();
  bytes[3] = bytes.length & 0xff;
  bytes[2] = bytes.length >>> 8;
  return bytes;
}

function format12(groups: readonly (readonly [number, number, number])[]): Uint8Array {
  return new Bytes()
    .u16(12, 0)
    .u32(16 + groups.length * 12, 0, groups.length)
    .u32(...groups.flat())
    .bytes();
}

/** The entries of a table of the directory: where its record and its data lie. */
function tableOf(
  font: Uint8Array,
  tag: string,
): { record: number; offset: number; length: number } {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  for (let index = 0; index < view.getUint16(4); index += 1) {
    const record = 12 + index * 16;
    if (String.fromCharCode(...font.subarray(record, record + 4)) === tag) {
      return { record, offset: view.getUint32(record + 8), length: view.getUint32(record + 12) };
    }
  }
  throw new Error(`No ${tag}.`);
}

function patched(font: Uint8Array, edit: (bytes: Uint8Array, view: DataView) => void): Uint8Array {
  const bytes = Uint8Array.from(font);
  edit(bytes, new DataView(bytes.buffer));
  return bytes;
}

function refusal(bytes: Uint8Array): { code: string; message: string } {
  try {
    fontMetrics(bytes);
  } catch (error) {
    const { code, message } = error as { code: string; message: string };
    return { code, message };
  }
  throw new Error('The font was measured.');
}

describe('fontMetrics (D83.1)', () => {
  it.each<FixtureFontCmap>(['both', 'format-4', 'format-12'])(
    'reads the advances the generator of the proportional font wrote, through %s',
    (cmap) => {
      const metrics = fontMetrics(generateProportionalFont(cmap));
      const expected = Object.keys(PROPORTIONAL_FONT_ADVANCES)
        .filter((character) => cmap !== 'format-4' || (character.codePointAt(0) ?? 0) <= 0xffff)
        .map((character) => [character.codePointAt(0) ?? 0, written(character)] as const)
        .sort(([a], [b]) => a - b);
      expect(metrics.unitsPerEm).toBe(1000);
      expect(metrics.notdefAdvance).toBe(FONT_NOTDEF_ADVANCE);
      expect([...metrics.advances].sort(([a], [b]) => a - b)).toEqual(expected);
    },
  );

  it('reads the advances of glyphs past numberOfHMetrics from the last long metric', () => {
    // The proportional font writes its three last glyphs (x, y, U+1F642) with one long metric.
    const font = generateProportionalFont();
    const hhea = tableOf(font, 'hhea');
    const maxp = tableOf(font, 'maxp');
    const view = new DataView(font.buffer);
    expect(view.getUint16(hhea.offset + 34)).toBe(view.getUint16(maxp.offset + 4) - 2);
    expect(METRICS.advances.get(0x1f642)).toBe(600);
    expect(METRICS.advances.get(0x77)).toBe(800);
  });

  it('reads the monospaced fixture font as 600 units for every character', () => {
    const font = generateReferenceAssets().find(({ id }) => id === 'asset-font');
    const metrics = fontMetrics(font?.bytes ?? new Uint8Array(0));
    expect(new Set(metrics.advances.values())).toEqual(new Set([600]));
    expect(metrics.advances.size).toBe(17);
  });

  it('reads CFF fonts (OTTO) and Apple TrueType (true) by the same tables', () => {
    const font = generateProportionalFont();
    for (const signature of [0x4f54544f, 0x74727565]) {
      const other = patched(font, (_, view) => {
        view.setUint32(0, signature);
      });
      expect(fontMetrics(other)).toEqual(METRICS);
    }
  });

  it('maps through the glyph IDs of a format 4 segment, and prefers format 12 to format 4', () => {
    const tables = metricTables([500, 100, 200, 300, 400], 6);
    const bmp = format4([
      { start: 0x41, end: 0x43, glyphs: [3, 0, 5] },
      { start: 0x61, end: 0x62, delta: 1 - 0x61 },
    ]);
    const viaFormat4 = fontMetrics(sfnt({ ...tables, cmap: cmapOf([3, 1, bmp]) }));
    expect([...viaFormat4.advances]).toEqual([
      [0x41, 300],
      [0x43, 400], // glyph 5, past numberOfHMetrics
      [0x61, 100],
      [0x62, 200],
    ]);
    expect(viaFormat4.notdefAdvance).toBe(500);
    const full = format12([
      [0x41, 0x41, 2],
      [0x1f600, 0x1f601, 3],
    ]);
    const both = fontMetrics(sfnt({ ...tables, cmap: cmapOf([3, 1, bmp], [3, 10, full]) }));
    expect([...both.advances]).toEqual([
      [0x41, 200],
      [0x1f600, 300],
      [0x1f601, 400],
    ]);
    // Platform 0 is read when Windows has no subtable; a glyph past numGlyphs has none.
    const unicode = fontMetrics(
      sfnt({ ...tables, cmap: cmapOf([0, 4, format12([[0x30, 0x37, 1]])]) }),
    );
    expect([...unicode.advances].map(([codePoint]) => codePoint)).toEqual([
      0x30, 0x31, 0x32, 0x33, 0x34,
    ]);
  });

  it.each([
    ['WOFF', 0x774f4646, /WOFF, which would need a zlib/],
    ['WOFF2', 0x774f4632, /WOFF2, which would need a Brotli/],
    ['a collection', 0x74746366, /font collection/],
    ['an unknown format', 0x4f54544e, /not an sfnt font/],
  ])('refuses %s as font-unmeasurable', (_, signature, message) => {
    const bytes = patched(generateProportionalFont(), (_, view) => {
      view.setUint32(0, signature);
    });
    const { code, message: text } = refusal(bytes);
    expect(code).toBe('font-unmeasurable');
    expect(text).toMatch(message);
    expect(text).toContain('sfnt');
  });

  it.each(['head', 'hhea', 'maxp', 'hmtx', 'cmap'])('refuses a font without %s', (tag) => {
    const font = generateProportionalFont();
    const { record } = tableOf(font, tag);
    const bytes = patched(font, (data) => {
      data.set([0x7a, 0x7a, 0x7a, 0x7a], record);
    });
    const { code, message } = refusal(bytes);
    expect(code).toBe('font-unmeasurable');
    expect(message).toContain(`it has no ${tag} table`);
  });

  it.each(['head', 'hhea', 'maxp', 'hmtx', 'cmap'])('refuses a truncated %s', (tag) => {
    const font = generateProportionalFont();
    const { record } = tableOf(font, tag);
    // Past the end of the file, and shorter than what is read of it.
    for (const length of [font.length, 2]) {
      const bytes = patched(font, (_, view) => {
        view.setUint32(record + 12, length);
      });
      expect(refusal(bytes).message).toContain(`its ${tag} table is truncated`);
    }
  });

  it('refuses a truncated header and directory, and a malformed font', () => {
    const font = generateProportionalFont();
    expect(refusal(font.subarray(0, 2)).message).toContain('too short');
    expect(refusal(font.subarray(0, 40)).message).toContain('table directory is truncated');
    const head = tableOf(font, 'head').offset;
    const hhea = tableOf(font, 'hhea').offset;
    const cmap = tableOf(font, 'cmap').offset;
    // Each case writes 16-bit words at offsets of the font.
    const cases: [readonly (readonly [number, number])[], string][] = [
      [[[head + 18, 0]], 'unitsPerEm, 0, is not from 16 to 16384'],
      [[[hhea + 34, 0]], 'numberOfHMetrics, 0'],
      [[[hhea + 34, 999]], 'numberOfHMetrics, 999'],
      [
        [
          [cmap + 4, 1],
          [cmap + 12, 1],
        ],
        'no Unicode subtable',
      ],
      [[[cmap + 10, 0xffff]], 'outside its table'],
    ];
    for (const [words, message] of cases) {
      const bytes = patched(font, (_, view) => {
        for (const [at, value] of words) view.setUint16(at, value);
      });
      expect(refusal(bytes).message).toContain(message);
    }
    const tables = metricTables([500, 100], 2);
    const unsorted4 = format4([
      { start: 0x62, end: 0x63, delta: 1 },
      { start: 0x61, end: 0x61, delta: 1 },
    ]);
    expect(refusal(sfnt({ ...tables, cmap: cmapOf([3, 1, unsorted4]) })).message).toContain(
      'format 4 are not in ascending order',
    );
    const overlapping12 = format12([
      [0x61, 0x65, 1],
      [0x65, 0x66, 1],
    ]);
    expect(refusal(sfnt({ ...tables, cmap: cmapOf([3, 10, overlapping12]) })).message).toContain(
      'format 12 are not in ascending order',
    );
    expect(
      refusal(sfnt({ ...tables, cmap: cmapOf([3, 10, format12([[0x61, 0x110000, 1]])]) })).message,
    ).toContain('format 12 are not in ascending order');
  });
});

describe('the measure (D83.2)', () => {
  it('sums the advances of the code points, .notdef for one without a glyph', () => {
    expect(measureText('', METRICS)).toBe(0);
    expect(measureText('mil', METRICS)).toBe(800 + 200 + 300);
    expect(measureText('\u{1F642}Z', METRICS)).toBe(600 + FONT_NOTDEF_ADVANCE);
  });

  it('decides a fit as an independent rational reference does, for 4 000 seeded cases', () => {
    const random = seededRandom(83);
    const integer = (max: number): number => 1 + Math.floor(random() * max);
    for (let index = 0; index < 4_000; index += 1) {
      const unitsPerEm = 16 + Math.floor(random() * 16_369);
      const metrics: FontMetrics = { unitsPerEm, notdefAdvance: 0, advances: new Map() };
      const fontSize = integer(index % 2 === 0 ? 200 : 1_000_000);
      const width = integer(index % 3 === 0 ? 2_000 : 1_000_000);
      // A quarter on the boundary, where a float would round: units · fontSize = width · unitsPerEm ± 1.
      const exact = (BigInt(width) * BigInt(unitsPerEm)) / BigInt(fontSize);
      const units = Math.max(
        0,
        index % 4 === 0
          ? Number(exact) + Math.floor(random() * 3) - 1
          : Math.floor(random() * 2 ** 40),
      );
      const quotient = (BigInt(units) * BigInt(fontSize)) / BigInt(unitsPerEm);
      const remainder = (BigInt(units) * BigInt(fontSize)) % BigInt(unitsPerEm);
      const reference =
        quotient < BigInt(width) || (quotient === BigInt(width) && remainder === 0n);
      expect(fitsWidth(units, fontSize, width, metrics)).toBe(reference);
    }
  });

  it('fits lines of 1.25 · fontSize to a height', () => {
    expect(textLinesFitHeight(4, 40, 200)).toBe(true);
    expect(textLinesFitHeight(4, 40, 199)).toBe(false);
    expect(textLinesFitHeight(0, 40, 1)).toBe(true);
    expect(unitsToPixels(3700, 50, METRICS)).toBe(185);
  });
});

// --- the independent references of the wrap --------------------------------

function referenceFits(units: number, fontSize: number, width: number | null): boolean {
  if (width === null) return true;
  return (
    (BigInt(units) * BigInt(fontSize)) / 1000n < BigInt(width) ||
    BigInt(units) * BigInt(fontSize) === BigInt(width) * 1000n
  );
}

function referenceUnits(text: string): number {
  return Array.from(text).reduce((sum, character) => sum + written(character), 0);
}

/** D83.5 written again from its words, on tokens of `\s+` and `\S+`. */
function referenceLines(text: string, fontSize: number, width: number | null): string[] {
  const out: string[] = [];
  const fits = (line: string): boolean => referenceFits(referenceUnits(line), fontSize, width);
  for (const source of text.split('\n')) {
    const tokens = source.match(/\s+|\S+/gu) ?? [];
    let line = tokens[0] !== undefined && /^\s/u.test(tokens[0]) ? (tokens.shift() ?? '') : '';
    if (tokens.length === 0) {
      out.push(line);
      continue;
    }
    line += tokens[0] ?? '';
    for (let at = 1; at < tokens.length; at += 2) {
      const space = tokens[at] ?? '';
      const word = tokens[at + 1];
      if (word === undefined) {
        if (fits(line + space)) line += space;
      } else if (fits(line + space + word)) line += space + word;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

const PIECES = [
  'Kadrion',
  'draws',
  'time',
  'i',
  'mmmmmmmmmmmmmmmmmmmm',
  'Zebra',
  '\u{1F642}',
  'wild',
  ' ',
  ' ',
  '   ',
  '\t',
  ' ',
  '\n',
];

function seededText(random: () => number): string {
  const count = Math.floor(random() * 24);
  let text = '';
  for (let index = 0; index < count; index += 1) {
    text += PIECES[Math.floor(random() * PIECES.length)] ?? '';
  }
  return text;
}

describe('textLines (D83.5)', () => {
  it('wraps a text greedily at white space, dropping the run at a break', () => {
    // At 50 px, 300 px is 6 000 units: "Kadrion" is 3 700, "draws" 3 100, a space 300.
    expect(textLines('Kadrion draws time', 50, 300, METRICS).map(({ text }) => text)).toEqual([
      'Kadrion',
      'draws time',
    ]);
  });

  it('keeps line feeds, leading white space, and a word wider than the frame alone on its line', () => {
    const lines = textLines('  mmmmmmmmmm i\n\ndraws ', 50, 300, METRICS);
    expect(lines.map(({ text, units }) => [text, units])).toEqual([
      ['  mmmmmmmmmm', 600 + 8_000],
      ['i', 200],
      ['', 0],
      ['draws ', 3_400],
    ]);
    expect(lines[0]?.runs).toEqual([
      { space: '  ' },
      { letters: ['m', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm', 'm'] },
    ]);
  });

  it('drops white space at the end of a line of the text when the line would not fit with it', () => {
    // "draws" is 3 100 units; at 60 px a width of 200 px is 3 333⅓ units.
    expect(textLines('draws ', 60, 200, METRICS).map(({ text }) => text)).toEqual(['draws']);
    expect(textLines('draws  ', 50, 300, METRICS).map(({ text }) => text)).toEqual(['draws  ']);
  });

  it('does not wrap without a frame', () => {
    expect(
      textLines('Kadrion draws time\nwild', 50, null, METRICS).map(({ text }) => text),
    ).toEqual(['Kadrion draws time', 'wild']);
  });

  it('equals the independent reference for 2 000 seeded texts, widths, and sizes', () => {
    const random = seededRandom(65);
    for (let index = 0; index < 2_000; index += 1) {
      const text = seededText(random);
      const fontSize = 10 + Math.floor(random() * 110);
      const width = index % 10 === 0 ? null : 1 + Math.floor(random() * 2_000);
      const lines = textLines(text, fontSize, width, METRICS);
      expect(
        lines.map(({ text: line }) => line),
        JSON.stringify([text, fontSize, width]),
      ).toEqual(referenceLines(text, fontSize, width));
      for (const line of lines) expect(line.units).toBe(referenceUnits(line.text));
    }
  });
});

function words(...texts: string[]): CaptionWord[] {
  return texts.map((text, at) => ({ text, startUs: at * 100, durationUs: 100 }));
}

describe('captionPagesByWidth (D83.5)', () => {
  it('breaks by the width of the box and by the count together', () => {
    // At 100 px, 1 000 px is 10 000 units: "mmmm" is 3 200, "iiii" 800, a space 300,
    // so the first line fills the box exactly.
    const style = { fontSize: 100, maxLineLength: 1000, maxLines: 2 };
    const narrowWide = words('iiii', 'iiii', 'iiii', 'mmmm', 'mmmm', 'mmmm');
    expect(captionPagesByWidth(narrowWide, style, 1000, METRICS)).toEqual([
      { firstWord: 0, lines: [{ words: [0, 1, 2, 3, 4] }, { words: [5] }] },
    ]);
    // Counted in characters, the same words break elsewhere: that is what the font is for.
    expect(captionPages(narrowWide, { maxLineLength: 14, maxLines: 2 })).toEqual([
      { firstWord: 0, lines: [{ words: [0, 1, 2] }, { words: [3, 4, 5] }] },
    ]);
    // Both bounds: a count of 9 holds two words of four letters.
    expect(captionPagesByWidth(narrowWide, { ...style, maxLineLength: 9 }, 1000, METRICS)).toEqual([
      { firstWord: 0, lines: [{ words: [0, 1] }, { words: [2, 3] }] },
      { firstWord: 4, lines: [{ words: [4, 5] }] },
    ]);
  });

  it('puts a word wider than the box alone on its line, and has no pages for no words', () => {
    const style = { fontSize: 100, maxLineLength: 1000, maxLines: 5 };
    expect(captionPagesByWidth(words('i', 'mmmmmmmmmmmm', 'i'), style, 1000, METRICS)).toEqual([
      { firstWord: 0, lines: [{ words: [0] }, { words: [1] }, { words: [2] }] },
    ]);
    expect(captionPagesByWidth([], style, 1000, METRICS)).toEqual([]);
  });

  it('equals the independent reference, and the count alone with a wide box, for 1 000 seeded cases', () => {
    const random = seededRandom(57);
    const vocabulary = ['Kadrion', 'draws', 'i', 'mmmmmmmm', 'wild', 'Zebra', '\u{1F642}', 'time'];
    for (let index = 0; index < 1_000; index += 1) {
      const texts = Array.from(
        { length: Math.floor(random() * 30) },
        () => vocabulary[Math.floor(random() * vocabulary.length)] ?? 'i',
      );
      const style = {
        fontSize: 10 + Math.floor(random() * 100),
        maxLineLength: 1 + Math.floor(random() * 40),
        maxLines: 1 + Math.floor(random() * 4),
      };
      const width = 1 + Math.floor(random() * 1_500);
      const lines: number[][] = [];
      let line: number[] = [];
      let text = '';
      texts.forEach((word, at) => {
        const joined = `${text} ${word}`;
        if (
          line.length > 0 &&
          Array.from(joined).length <= style.maxLineLength &&
          referenceFits(referenceUnits(joined), style.fontSize, width)
        ) {
          line.push(at);
          text = joined;
        } else {
          if (line.length > 0) lines.push(line);
          line = [at];
          text = word;
        }
      });
      if (line.length > 0) lines.push(line);
      const pages = captionPagesByWidth(words(...texts), style, width, METRICS);
      expect(pages.flatMap((page) => page.lines.map((item) => item.words))).toEqual(lines);
      expect(pages.map((page) => page.lines.length)).toEqual(
        pages.map((_, at) => Math.min(style.maxLines, lines.length - at * style.maxLines)),
      );
      expect(captionPagesByWidth(words(...texts), style, 1_000_000, METRICS)).toEqual(
        captionPages(words(...texts), style),
      );
    }
  });
});

function textNode(
  text: string,
  frame: TextFrameInput['frame'],
  align: FrameAlign = 'left',
  verticalAlign: FrameVerticalAlign = 'top',
): TextFrameInput {
  return { type: 'text', text, fontSize: 50, frame, style: { align, verticalAlign } };
}

function captionsNode(
  texts: readonly string[],
  lineBreak: 'characters' | 'width',
  align: FrameAlign = 'left',
  verticalAlign: FrameVerticalAlign = 'top',
): CaptionsFrameInput {
  return {
    type: 'captions',
    width: 1000,
    height: 300,
    words: words(...texts),
    style: {
      fontSize: 100,
      lineHeight: 120,
      align,
      verticalAlign,
      maxLineLength: 14,
      maxLines: 2,
      lineBreak,
    },
  };
}

describe('frameLayout (D83.6)', () => {
  const frame = { kind: 'fixed', width: 300, height: 200 } as const;

  it.each<[FrameAlign, FrameVerticalAlign, number[], number]>([
    ['left', 'top', [0, 0], 0],
    ['center', 'middle', [57.5, 15], 37.5],
    ['right', 'bottom', [115, 30], 75],
    ['left', 'bottom', [0, 0], 75],
    ['right', 'top', [115, 30], 0],
  ])('places lines %s and %s in the frame', (align, verticalAlign, xs, top) => {
    // "Kadrion" is 185 px wide, "draws time" 270 px; two lines are 125 px tall.
    const layout = frameLayout(
      textNode('Kadrion draws time', frame, align, verticalAlign),
      METRICS,
    );
    expect(layout).toEqual({
      lines: [
        { text: 'Kadrion', units: 3_700, width: 185, fits: true, x: xs[0], y: top },
        { text: 'draws time', units: 5_400, width: 270, fits: true, x: xs[1], y: top + 62.5 },
      ],
      height: 125,
      fits: true,
      missing: [],
    });
  });

  it('lets a wide line and a tall block overflow on the side the alignment leaves free', () => {
    const wide = textNode('mmmmmmmmmm\ni\ni', frame, 'center', 'middle');
    const layout = frameLayout(wide, METRICS);
    // 8 000 units at 50 px is 400 px, wider than 300; three lines are 187.5 px, within 200.
    expect(layout.lines.map(({ x, y, fits }) => [x, y, fits])).toEqual([
      [-50, 6.25, false],
      [145, 68.75, true],
      [145, 131.25, true],
    ]);
    expect(layout.fits).toBe(false);
    const tall = frameLayout(textNode('i\ni\ni\ni', frame, 'right', 'bottom'), METRICS);
    expect(tall.height).toBe(250);
    expect(tall.lines[0]).toMatchObject({ x: 290, y: -50, fits: true });
    expect(tall.fits).toBe(false);
    const right = frameLayout(textNode('mmmmmmmmmm', frame, 'right'), METRICS);
    expect(right.lines[0]?.x).toBe(-100);
  });

  it('aligns a text without a frame within its widest line, and it always fits', () => {
    const layout = frameLayout(
      textNode('Kadrion draws time\nwild Zebra', { kind: 'none' }, 'center', 'bottom'),
      METRICS,
    );
    expect(layout.lines.map(({ text, x, y, fits }) => [text, x, y, fits])).toEqual([
      ['Kadrion draws time', 0, 0, true],
      ['wild Zebra', 107.5, 62.5, true],
    ]);
    expect(layout.fits).toBe(true);
    expect(layout.missing).toEqual([0x5a]);
  });

  it('breaks captions by characters exactly as captionPages, and places every page in the box', () => {
    const texts = ['iiii', 'iiii', 'iiii', 'mmmm', 'mmmm', 'mmmm', 'mmmmmmmmmmmmmmmm'];
    const node = captionsNode(texts, 'characters', 'center', 'bottom');
    const layout = frameLayout(node, METRICS);
    expect(layout.lines.map(({ words: indices, page }) => [page, indices])).toEqual(
      captionPages(node.words, node.style).flatMap((item, page) =>
        item.lines.map((line) => [page, line.words]),
      ),
    );
    expect(layout.lines.map(({ text, width, fits, x, y }) => [text, width, fits, x, y])).toEqual([
      ['iiii iiii iiii', 300, true, 350, 60],
      ['mmmm mmmm mmmm', 1020, false, -10, 180],
      ['mmmmmmmmmmmmmmmm', 1280, false, -140, 180],
    ]);
    expect(layout.height).toBe(240);
    expect(layout.fits).toBe(false);
  });

  it('breaks captions by width, and lists the code points without a glyph', () => {
    const texts = ['iiii', 'iiii', 'iiii', 'mmmm', 'mmmm', 'mmmm', 'Zebra'];
    const layout = frameLayout(captionsNode(texts, 'width', 'right'), METRICS);
    expect(layout.lines.map(({ text, page, x, y }) => [text, page, x, y])).toEqual([
      ['iiii iiii iiii', 0, 700, 0],
      ['mmmm mmmm', 0, 330, 120],
      ['mmmm Zebra', 1, 360, 0],
    ]);
    expect(layout.fits).toBe(true);
    expect(layout.missing).toEqual([0x5a]);
    expect(frameLayout(captionsNode([], 'width'), METRICS)).toEqual({
      lines: [],
      height: 0,
      fits: true,
      missing: [],
    });
  });
});
