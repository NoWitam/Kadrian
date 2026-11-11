/**
 * The font asset: a TrueType font built here, glyph by glyph, so that no font
 * file enters the repository and its licence is this repository's own (D10).
 * Every glyph is drawn on a pixel grid of 100 font units; each run of set
 * pixels in a row is one rectangular contour. It covers exactly the characters
 * listed in `FONT_GLYPHS`, which are the characters of the reference texts; a
 * character outside it would make the browser fall back to another font.
 *
 * Beside it, the proportional font of D83 (PR-65), built by the same code:
 * its glyphs have advances of their own (`PROPORTIONAL_FONT_ADVANCES`), so a
 * line measured from the font breaks elsewhere than a line counted in
 * characters. It maps its characters through a format 4 subtable, a format 12
 * subtable, or both, and writes the advances of its last glyphs once, as font
 * tools do, so that a reader of `hmtx` and `cmap` is tried on every path.
 */
import { ByteWriter } from './bytes.js';

export const FONT_FAMILY_NAME = 'Kadrion Fixture';
export const FONT_UNITS_PER_EM = 1000;
const CELL = 100;
const ADVANCE = 600;
const ASCENDER = 800;
const DESCENDER = -200;

/**
 * Glyph bitmaps, top row first. Seven rows sit on or above the baseline, and
 * glyphs with a descender have two more rows below it.
 */
export const FONT_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  ' ': [],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.###.', '#....', '#....', '#...#', '.###.'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  g: ['.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['..#..', '..#..', '#####', '..#..', '..#..', '..#..', '...##'],
  y: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
};

/**
 * The proportional font (D83, PR-65): the glyphs of `FONT_GLYPHS` with some
 * drawn narrower or wider, a few more letters, and one character outside the
 * Basic Multilingual Plane, U+1F642, which only a format 12 subtable maps.
 */
export const PROPORTIONAL_FONT_FAMILY_NAME = 'Kadrion Fixture Proportional';

export const PROPORTIONAL_FONT_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  ...FONT_GLYPHS,
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['#', '.', '#', '#', '#', '#', '#'],
  l: ['##', '.#', '.#', '.#', '.#', '.#', '.#'],
  m: ['.......', '.......', '###.##.', '#..#..#', '#..#..#', '#..#..#', '#..#..#'],
  r: ['....', '....', '#.##', '##..', '#...', '#...', '#...'],
  t: ['.#.', '.#.', '###', '.#.', '.#.', '.#.', '..#'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####'],
  w: ['.......', '.......', '#.....#', '#.....#', '#..#..#', '#.#.#.#', '.#...#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '\u{1F642}': ['.###.', '#...#', '#.#.#', '#...#', '#.#.#', '#..##', '.###.'],
};

/**
 * The advance of every glyph of the proportional font, in font units, as the
 * generator writes it to `hmtx`: the width of its ink plus one cell, and 300
 * for the space. `.notdef` advances `FONT_NOTDEF_ADVANCE`.
 */
export const PROPORTIONAL_FONT_ADVANCES: Readonly<Record<string, number>> = {
  ' ': 300,
  D: 600,
  K: 600,
  a: 600,
  b: 600,
  c: 600,
  d: 600,
  e: 600,
  g: 600,
  h: 600,
  i: 200,
  l: 300,
  m: 800,
  n: 600,
  o: 600,
  r: 500,
  s: 600,
  t: 400,
  u: 600,
  w: 800,
  x: 600,
  y: 600,
  '\u{1F642}': 600,
};

/** The advance of `.notdef`, glyph 0, in both fonts. */
export const FONT_NOTDEF_ADVANCE = ADVANCE;

/** Which `cmap` subtables a generated font has: Windows Unicode BMP (format 4), full repertoire (format 12), or both. */
export type FixtureFontCmap = 'format-4' | 'format-12' | 'both';

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

interface Glyph {
  readonly rects: readonly Rect[];
}

/**
 * One rectangle per horizontal run of `#`; row 6 ends on the baseline. Column
 * `shift` is drawn at the left side bearing of half a cell.
 */
function rectsOf(rows: readonly string[], shift = 0): Rect[] {
  const rects: Rect[] = [];
  rows.forEach((row, rowIndex) => {
    const top = (7 - rowIndex) * CELL;
    let start = -1;
    for (let column = 0; column <= row.length; column += 1) {
      const set = row[column] === '#';
      if (set && start < 0) start = column;
      if (!set && start >= 0) {
        rects.push({
          x0: (start - shift + 0.5) * CELL,
          y0: top - CELL,
          x1: (column - shift + 0.5) * CELL,
          y1: top,
        });
        start = -1;
      }
    }
  });
  return rects;
}

/** The `.notdef` glyph: a hollow box. */
const NOTDEF: Glyph = {
  rects: [
    { x0: 50, y0: 0, x1: 550, y1: 100 },
    { x0: 50, y0: 600, x1: 550, y1: 700 },
    { x0: 50, y0: 100, x1: 150, y1: 600 },
    { x0: 450, y0: 100, x1: 550, y1: 600 },
  ],
};

function glyphBytes(glyph: Glyph): Uint8Array {
  if (glyph.rects.length === 0) return new Uint8Array(0);
  const xs = glyph.rects.flatMap((rect) => [rect.x0, rect.x1]);
  const ys = glyph.rects.flatMap((rect) => [rect.y0, rect.y1]);
  const out = new ByteWriter()
    .u16be(glyph.rects.length)
    .u16be(Math.min(...xs) & 0xffff)
    .u16be(Math.min(...ys) & 0xffff)
    .u16be(Math.max(...xs) & 0xffff)
    .u16be(Math.max(...ys) & 0xffff);
  glyph.rects.forEach((_, index) => out.u16be(index * 4 + 3));
  out.u16be(0); // no instructions
  const points = glyph.rects.flatMap((rect) => [
    // Clockwise in a y-up space, the direction of an outer TrueType contour.
    [rect.x0, rect.y0],
    [rect.x0, rect.y1],
    [rect.x1, rect.y1],
    [rect.x1, rect.y0],
  ]);
  for (let index = 0; index < points.length; index += 1) out.u8(0x01); // on-curve, 16-bit deltas
  let previous = 0;
  for (const [x] of points) {
    out.u16be(((x ?? 0) - previous) & 0xffff);
    previous = x ?? 0;
  }
  previous = 0;
  for (const [, y] of points) {
    out.u16be(((y ?? 0) - previous) & 0xffff);
    previous = y ?? 0;
  }
  return out.pad(2).toBytes();
}

function utf16be(text: string): Uint8Array {
  const out = new ByteWriter();
  for (let index = 0; index < text.length; index += 1) out.u16be(text.charCodeAt(index));
  return out.toBytes();
}

function checksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let index = 0; index < bytes.length; index += 4) {
    const word =
      ((bytes[index] ?? 0) << 24) |
      ((bytes[index + 1] ?? 0) << 16) |
      ((bytes[index + 2] ?? 0) << 8) |
      (bytes[index + 3] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

/** One glyph of a font to build: its outline, its advance, and the code point that maps to it, if any. */
interface GlyphSpec extends Glyph {
  readonly advance: number;
  readonly codePoint: number | null;
}

/** What differs between the two fixture fonts. */
interface FontSpec {
  readonly familyName: string;
  readonly postScriptName: string;
  /** Glyph 0 is `.notdef`; the others follow in ascending order of code point. */
  readonly glyphs: readonly GlyphSpec[];
  readonly fixedPitch: boolean;
  readonly cmap: FixtureFontCmap;
  /** Whether `hmtx` writes the advance of a run of equal last glyphs once (`numberOfHMetrics` below `numGlyphs`). */
  readonly compactMetrics: boolean;
}

/** The monospaced font of the reference composition: every advance 600, one format 4 subtable. */
export function generateFont(): Uint8Array {
  const characters = Object.keys(FONT_GLYPHS).sort();
  return buildFont({
    familyName: FONT_FAMILY_NAME,
    postScriptName: 'KadrionFixture-Regular',
    glyphs: [
      { ...NOTDEF, advance: ADVANCE, codePoint: null },
      ...characters.map((c) => ({
        rects: rectsOf(FONT_GLYPHS[c] ?? []),
        advance: ADVANCE,
        codePoint: c.codePointAt(0) ?? 0,
      })),
    ],
    fixedPitch: true,
    cmap: 'format-4',
    compactMetrics: false,
  });
}

/**
 * The proportional font of D83 (PR-65), with the subtables `cmap` names
 * (both by default). Its glyphs, advances, and outlines are the same in every
 * variant; a variant without format 12 does not map U+1F642.
 */
export function generateProportionalFont(cmap: FixtureFontCmap = 'both'): Uint8Array {
  const characters = Object.keys(PROPORTIONAL_FONT_GLYPHS).sort(
    (a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0),
  );
  return buildFont({
    familyName: PROPORTIONAL_FONT_FAMILY_NAME,
    postScriptName: 'KadrionFixtureProportional-Regular',
    glyphs: [
      { ...NOTDEF, advance: ADVANCE, codePoint: null },
      ...characters.map((c) => {
        const rows = PROPORTIONAL_FONT_GLYPHS[c] ?? [];
        const advance = PROPORTIONAL_FONT_ADVANCES[c] ?? 0;
        const columns = rows.flatMap((row) =>
          Array.from(row).flatMap((cell, column) => (cell === '#' ? [column] : [])),
        );
        const shift = columns.length === 0 ? 0 : Math.min(...columns);
        const ink = columns.length === 0 ? 0 : Math.max(...columns) - shift + 1;
        if (advance < (ink + 1) * CELL)
          throw new Error(`The advance of ${c} is narrower than its ink.`);
        return { rects: rectsOf(rows, shift), advance, codePoint: c.codePointAt(0) ?? 0 };
      }),
    ],
    fixedPitch: false,
    cmap,
    compactMetrics: true,
  });
}

function buildFont(spec: FontSpec): Uint8Array {
  const { glyphs } = spec;
  const numGlyphs = glyphs.length;
  const glyphData = glyphs.map(glyphBytes);
  const all = glyphs.flatMap((glyph) => glyph.rects);
  const xMin = Math.min(...all.map((rect) => rect.x0));
  const yMin = Math.min(...all.map((rect) => rect.y0));
  const xMax = Math.max(...all.map((rect) => rect.x1));
  const yMax = Math.max(...all.map((rect) => rect.y1));
  const maxPoints = Math.max(...glyphs.map((glyph) => glyph.rects.length * 4));
  const maxContours = Math.max(...glyphs.map((glyph) => glyph.rects.length));
  const mapped = glyphs.flatMap((glyph, index) =>
    glyph.codePoint === null ? [] : [{ code: glyph.codePoint, glyph: index }],
  );
  const codes = mapped.map(({ code }) => code);
  const bmp = mapped.filter(({ code }) => code <= 0xffff);
  const advances = glyphs.map((glyph) => glyph.advance);
  const advanceMax = Math.max(...advances);
  const inked = advances.filter((advance) => advance > 0);
  const averageAdvance = Math.floor(
    inked.reduce((sum, advance) => sum + advance, 0) / inked.length,
  );
  let numberOfHMetrics = numGlyphs;
  if (spec.compactMetrics) {
    while (numberOfHMetrics > 1 && advances[numberOfHMetrics - 2] === advances[numGlyphs - 1]) {
      numberOfHMetrics -= 1;
    }
  }

  const glyf = new ByteWriter();
  const loca = new ByteWriter();
  for (const data of glyphData) {
    loca.u16be(glyf.length / 2);
    glyf.append(data);
  }
  loca.u16be(glyf.length / 2);

  const head = new ByteWriter()
    .u32be(0x00010000) // version
    .u32be(0x00010000) // fontRevision 1.0
    .u32be(0) // checkSumAdjustment, set below
    .u32be(0x5f0f3cf5) // magic
    .u16be(0x0003) // baseline at y=0, left sidebearing at x=0
    .u16be(FONT_UNITS_PER_EM)
    .u32be(0)
    .u32be(0) // created: 1904-01-01, fixed so the bytes never change
    .u32be(0)
    .u32be(0) // modified
    .u16be(xMin & 0xffff)
    .u16be(yMin & 0xffff)
    .u16be(xMax & 0xffff)
    .u16be(yMax & 0xffff)
    .u16be(0) // macStyle
    .u16be(8) // lowestRecPPEM
    .u16be(2) // fontDirectionHint
    .u16be(0) // indexToLocFormat: short
    .u16be(0); // glyphDataFormat

  const hhea = new ByteWriter()
    .u32be(0x00010000)
    .u16be(ASCENDER)
    .u16be(DESCENDER & 0xffff)
    .u16be(0) // lineGap
    .u16be(advanceMax) // advanceWidthMax
    .u16be(0) // minLeftSideBearing
    .u16be(0) // minRightSideBearing
    .u16be(xMax) // xMaxExtent
    .u16be(1) // caretSlopeRise
    .u16be(0) // caretSlopeRun
    .u16be(0) // caretOffset
    .u16be(0)
    .u16be(0)
    .u16be(0)
    .u16be(0) // reserved
    .u16be(0) // metricDataFormat
    .u16be(numberOfHMetrics);

  const hmtx = new ByteWriter();
  glyphs.forEach((glyph, index) => {
    const lsb = glyph.rects.length === 0 ? 0 : Math.min(...glyph.rects.map((rect) => rect.x0));
    if (index < numberOfHMetrics) hmtx.u16be(glyph.advance);
    hmtx.u16be(lsb);
  });

  const maxp = new ByteWriter()
    .u32be(0x00010000)
    .u16be(numGlyphs)
    .u16be(maxPoints)
    .u16be(maxContours)
    .u16be(0) // maxCompositePoints
    .u16be(0) // maxCompositeContours
    .u16be(2) // maxZones
    .u16be(0)
    .u16be(0)
    .u16be(0)
    .u16be(0)
    .u16be(0)
    .u16be(0)
    .u16be(0)
    .u16be(0)
    .u16be(0);

  const os2 = new ByteWriter()
    .u16be(4) // version
    .u16be(averageAdvance) // xAvgCharWidth
    .u16be(400) // usWeightClass
    .u16be(5) // usWidthClass
    .u16be(0) // fsType: installable
    .u16be(650)
    .u16be(600)
    .u16be(0)
    .u16be(75) // subscript
    .u16be(650)
    .u16be(600)
    .u16be(0)
    .u16be(350) // superscript
    .u16be(50) // yStrikeoutSize
    .u16be(300) // yStrikeoutPosition
    .u16be(0) // sFamilyClass
    .append(new Uint8Array(10)) // panose
    .u32be(1) // ulUnicodeRange1: Basic Latin
    .u32be(0)
    .u32be(0)
    .u32be(0)
    .ascii('NONE') // achVendID
    .u16be(0x00c0) // fsSelection: REGULAR | USE_TYPO_METRICS
    .u16be(Math.min(...codes))
    .u16be(Math.min(Math.max(...codes), 0xffff))
    .u16be(ASCENDER)
    .u16be(DESCENDER & 0xffff)
    .u16be(0) // sTypoLineGap
    .u16be(ASCENDER) // usWinAscent
    .u16be(-DESCENDER) // usWinDescent
    .u32be(1) // ulCodePageRange1: Latin 1
    .u32be(0)
    .u16be(500) // sxHeight
    .u16be(700) // sCapHeight
    .u16be(0) // usDefaultChar
    .u16be(32) // usBreakChar
    .u16be(1); // usMaxContext

  // cmap: a format 4 subtable for Windows Unicode BMP, one segment per character,
  // and a format 12 subtable for Windows Unicode full repertoire, one group per character.
  const segCount = bmp.length + 1;
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segCount));
  const format4 = new ByteWriter()
    .u16be(4)
    .u16be(16 + segCount * 8)
    .u16be(0) // language
    .u16be(segCount * 2)
    .u16be(searchRange)
    .u16be(Math.log2(searchRange / 2))
    .u16be(segCount * 2 - searchRange);
  for (const { code } of bmp) format4.u16be(code);
  format4.u16be(0xffff).u16be(0); // endCode[], reservedPad
  for (const { code } of bmp) format4.u16be(code);
  format4.u16be(0xffff); // startCode[]
  for (const { code, glyph } of bmp) format4.u16be((glyph - code) & 0xffff);
  format4.u16be(1); // idDelta[]
  for (let index = 0; index < segCount; index += 1) format4.u16be(0); // idRangeOffset[]
  const format12 = new ByteWriter()
    .u16be(12)
    .u16be(0) // reserved
    .u32be(16 + mapped.length * 12)
    .u32be(0) // language
    .u32be(mapped.length);
  for (const { code, glyph } of mapped) format12.u32be(code).u32be(code).u32be(glyph);
  const subtables: (readonly [number, Uint8Array])[] = [];
  if (spec.cmap !== 'format-12') subtables.push([1, format4.toBytes()]);
  if (spec.cmap !== 'format-4') subtables.push([10, format12.toBytes()]);
  const cmap = new ByteWriter().u16be(0).u16be(subtables.length);
  let subtableOffset = 4 + subtables.length * 8;
  for (const [encoding, bytes] of subtables) {
    cmap.u16be(3).u16be(encoding).u32be(subtableOffset);
    subtableOffset += bytes.length;
  }
  for (const [, bytes] of subtables) cmap.append(bytes);

  const names: readonly (readonly [number, string])[] = [
    [1, spec.familyName],
    [2, 'Regular'],
    [3, `${spec.familyName} Regular 1.000`],
    [4, `${spec.familyName} Regular`],
    [5, 'Version 1.000'],
    [6, spec.postScriptName],
  ];
  const strings = new ByteWriter();
  const name = new ByteWriter()
    .u16be(0)
    .u16be(names.length)
    .u16be(6 + names.length * 12);
  for (const [id, text] of names) {
    const encoded = utf16be(text);
    name.u16be(3).u16be(1).u16be(0x0409).u16be(id).u16be(encoded.length).u16be(strings.length);
    strings.append(encoded);
  }
  name.append(strings.toBytes());

  const post = new ByteWriter()
    .u32be(0x00030000)
    .u32be(0) // italicAngle
    .u16be(-100 & 0xffff) // underlinePosition
    .u16be(50) // underlineThickness
    .u32be(spec.fixedPitch ? 1 : 0) // isFixedPitch
    .u32be(0)
    .u32be(0)
    .u32be(0)
    .u32be(0);

  const tables: [string, Uint8Array][] = (
    [
      ['OS/2', os2],
      ['cmap', cmap],
      ['glyf', glyf],
      ['head', head],
      ['hhea', hhea],
      ['hmtx', hmtx],
      ['loca', loca],
      ['maxp', maxp],
      ['name', name],
      ['post', post],
    ] as const
  ).map(([tag, writer]) => [tag, writer.toBytes()]);

  const numTables = tables.length;
  const tableSearch = 16 * 2 ** Math.floor(Math.log2(numTables));
  const out = new ByteWriter()
    .u32be(0x00010000)
    .u16be(numTables)
    .u16be(tableSearch)
    .u16be(Math.log2(tableSearch / 16))
    .u16be(numTables * 16 - tableSearch);
  let offset = 12 + numTables * 16;
  let headOffset = 0;
  for (const [tag, data] of tables) {
    out.ascii(tag).u32be(checksum(data)).u32be(offset).u32be(data.length);
    if (tag === 'head') headOffset = offset;
    offset += Math.ceil(data.length / 4) * 4;
  }
  for (const [, data] of tables) out.append(data).pad(4);
  const font = out.toBytes();
  const adjustment = (0xb1b0afba - checksum(font)) >>> 0;
  font[headOffset + 8] = adjustment >>> 24;
  font[headOffset + 9] = (adjustment >>> 16) & 0xff;
  font[headOffset + 10] = (adjustment >>> 8) & 0xff;
  font[headOffset + 11] = adjustment & 0xff;
  return font;
}
