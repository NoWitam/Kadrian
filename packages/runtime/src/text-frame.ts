/**
 * Lines measured from the font (D83, PR-65): the advance widths of a font read
 * from its bytes (`fontMetrics`, D83.1), the measure of a run of text
 * (D83.2), the lines of a text wrapped to a frame (`textLines`, D83.5), the
 * pages of captions broken by width (`captionPagesByWidth`, D83.5), and the
 * helper for hosts (`frameLayout`, D83.6).
 *
 * Every function is pure and takes its inputs as explicit arguments: integer
 * arithmetic on a `DataView`, no `FontFace`, no canvas, no `Intl`, no platform
 * API (D24), so the same bytes give the same metrics and the same lines in
 * Node and in any browser. No kerning, no ligatures, no shaping (D83.2).
 * From PR-72 `fontMetrics` reads WOFF and WOFF2 files as well as sfnt files,
 * with the runtime's own inflate and Brotli decoder (D84).
 *
 * From schema `0.25` (PR-66) the evaluation, the render page, and the Player
 * use them: the main entry of `@kadrion/runtime` exports them, and so does the
 * entry `@kadrion/runtime/text-frame`, which reaches nothing of the
 * evaluation.
 *
 * A tab is white space (D69.2) and a run of white space like any other: it is
 * measured as the advance of its glyph, or of `.notdef` when the font maps
 * none, and `frameLayout` then lists U+0009 in `missing`. The browser draws a
 * tab as a tab stop, not as a glyph, so the drawn width of a line with a tab
 * may differ from the measured one, as for a shaped script (D83.2); a host
 * keeps tabs out of measured texts, as it keeps their texts within their fonts.
 */
import type { CaptionStyle, CaptionWord, Composition } from '@kadrion/schema';

import {
  captionPagesByCharacters,
  codePoints,
  pagesOfLines,
  type CaptionPage,
} from './caption-lines.js';
import { unmeasurable } from './font-decode.js';
import { textLayout, type TextRun } from './graphemes.js';
import { woffTables, type FontTables } from './woff.js';
import { woff2Tables } from './woff2.js';

// --- errors -----------------------------------------------------------------

export { FontMetricsError } from './font-decode.js';

/**
 * Why a font cannot be measured (D83.1, D84.6): `font-unmeasurable` for a
 * well-formed file Kadrion does not measure (a collection, an unknown format
 * or flavor, a missing or short table, a `cmap` without a subtable it reads,
 * or a font past the limit of D84.4), and `font-invalid` for a WOFF or WOFF2
 * file whose container or compressed stream is damaged.
 */
export type FontMetricsErrorCode = 'font-unmeasurable' | 'font-invalid';

// --- fontMetrics (D83.1, D84) -----------------------------------------------

/** The advance widths of a font, in font units, read from its bytes (D83.1). */
export interface FontMetrics {
  /** Font units per em, from `head`: from 16 to 16 384. */
  readonly unitsPerEm: number;
  /** The advance of glyph 0, `.notdef`, which a code point without a glyph measures (D83.1). */
  readonly notdefAdvance: number;
  /** The advance of the glyph of every code point the font maps, by code point. */
  readonly advances: ReadonlyMap<number, number>;
}

/** `0x00010000`: TrueType outlines. */
const SFNT_TRUETYPE = 0x00010000;
/** `true`: TrueType outlines, as older Apple fonts write it. */
const SFNT_APPLE = 0x74727565;
/** `OTTO`: CFF outlines. */
const SFNT_CFF = 0x4f54544f;
const WOFF = 0x774f4646;
const WOFF2 = 0x774f4632;
const COLLECTION = 0x74746366;

/**
 * Reads a font file — sfnt, WOFF 1.0, or WOFF 2.0 — and returns its
 * `unitsPerEm` and the advance width of the glyph of every code point it maps
 * (D83.1, D84). It reads the tables `head`, `hhea`, `maxp`, `hmtx`, and
 * `cmap`, and nothing else: of a WOFF file it inflates only those five tables
 * (D84.2), and of a WOFF2 file it decodes the Brotli stream only up to the end
 * of the last of them, never reconstructing `glyf` or `loca` (D84.3). The
 * three formats yield the bytes of the five tables, and one reader reads the
 * metrics from them, so every check below holds for each.
 *
 * Of `cmap` it reads one subtable, the first of the best kind in the order
 * format 12 of platform 3, format 12 of platform 0, format 4 of platform 3,
 * format 4 of platform 0 (platform 3 with encoding 10 for format 12 and 1 for
 * format 4). A code point that maps to glyph 0 or to a glyph past `numGlyphs`
 * has no glyph.
 *
 * Throws `FontMetricsError` `font-unmeasurable` for a collection (sfnt, or
 * WOFF2 of flavor `ttcf`), any other format or flavor, a missing or truncated
 * table, a subtable whose ranges are not in ascending order, or a WOFF or
 * WOFF2 font whose five tables would decompress past 64 MiB, checked before
 * anything is allocated (D84.4); and `font-invalid` for a WOFF or WOFF2 file
 * whose container or compressed stream is damaged (D84.6).
 */
export function fontMetrics(bytes: Uint8Array): FontMetrics {
  if (bytes.byteLength < 4) unmeasurable('it is too short to be a font');
  const signature = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (signature === WOFF) return metricsOfTables(woffTables(bytes));
  if (signature === WOFF2) return metricsOfTables(woff2Tables(bytes));
  return metricsOfTables(sfntTables(bytes));
}

/**
 * The five tables of an sfnt file, as views of its bytes, by the offsets of
 * its table directory (D83.1). A table that lies past the end of the file is
 * truncated; how long each must be is the reader's to check.
 */
function sfntTables(bytes: Uint8Array): FontTables {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = bytes.byteLength;
  const signature = view.getUint32(0);
  if (signature === COLLECTION) unmeasurable('it is a font collection, which holds several fonts');
  if (signature !== SFNT_TRUETYPE && signature !== SFNT_APPLE && signature !== SFNT_CFF) {
    unmeasurable('it is not an sfnt, WOFF, or WOFF2 font');
  }
  if (size < 12) unmeasurable('its table directory is truncated');
  const numTables = view.getUint16(4);
  if (12 + numTables * 16 > size) unmeasurable('its table directory is truncated');
  const tables = new Map<string, { readonly offset: number; readonly length: number }>();
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(
      bytes[record] ?? 0,
      bytes[record + 1] ?? 0,
      bytes[record + 2] ?? 0,
      bytes[record + 3] ?? 0,
    );
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    if (tables.has(tag)) unmeasurable(`its table directory lists ${tag} twice`);
    tables.set(tag, { offset, length });
  }
  const table = (tag: keyof FontTables): Uint8Array => {
    const found = tables.get(tag);
    if (found === undefined) unmeasurable(`it has no ${tag} table`);
    if (found.offset + found.length > size) unmeasurable(`its ${tag} table is truncated`);
    return bytes.subarray(found.offset, found.offset + found.length);
  };
  return {
    head: table('head'),
    hhea: table('hhea'),
    maxp: table('maxp'),
    hmtx: table('hmtx'),
    cmap: table('cmap'),
  };
}

/** A view of one table, which must hold at least `minimum` bytes (D83.1). */
function tableView(tables: FontTables, tag: keyof FontTables, minimum: number): DataView {
  const table = tables[tag];
  if (table.byteLength < minimum) unmeasurable(`its ${tag} table is truncated`);
  return new DataView(table.buffer, table.byteOffset, table.byteLength);
}

/** The one reader of the metrics, from the bytes of the five tables, whatever file they came from (D84.3). */
function metricsOfTables(tables: FontTables): FontMetrics {
  const head = tableView(tables, 'head', 54);
  const unitsPerEm = head.getUint16(18);
  if (unitsPerEm < 16 || unitsPerEm > 16_384) {
    unmeasurable(`its unitsPerEm, ${String(unitsPerEm)}, is not from 16 to 16384`);
  }
  const numberOfHMetrics = tableView(tables, 'hhea', 36).getUint16(34);
  const numGlyphs = tableView(tables, 'maxp', 6).getUint16(4);
  if (numGlyphs === 0) unmeasurable('it has no glyph');
  if (numberOfHMetrics === 0 || numberOfHMetrics > numGlyphs) {
    unmeasurable(`its numberOfHMetrics, ${String(numberOfHMetrics)}, is not from 1 to numGlyphs`);
  }
  const hmtx = tableView(tables, 'hmtx', numberOfHMetrics * 4 + (numGlyphs - numberOfHMetrics) * 2);
  // A glyph past the last long metric advances as the last one.
  const advanceOfGlyph = (glyph: number): number =>
    hmtx.getUint16(Math.min(glyph, numberOfHMetrics - 1) * 4);

  const cmap = tableView(tables, 'cmap', 4);
  const end = cmap.byteLength;
  const subtableCount = cmap.getUint16(2);
  if (4 + subtableCount * 8 > end) unmeasurable('its cmap table is truncated');
  let best: { readonly rank: number; readonly offset: number } | null = null;
  for (let index = 0; index < subtableCount; index += 1) {
    const record = 4 + index * 8;
    const platform = cmap.getUint16(record);
    const encoding = cmap.getUint16(record + 2);
    const offset = cmap.getUint32(record + 4);
    if (offset + 2 > end) unmeasurable('a cmap subtable lies outside its table');
    const rank = subtableRank(platform, encoding, cmap.getUint16(offset));
    if (rank !== null && (best === null || rank < best.rank)) best = { rank, offset };
  }
  if (best === null) unmeasurable('its cmap has no Unicode subtable of format 4 or 12');

  const advances = new Map<number, number>();
  const map = (codePoint: number, glyph: number): void => {
    if (glyph !== 0 && glyph < numGlyphs) advances.set(codePoint, advanceOfGlyph(glyph));
  };
  if (cmap.getUint16(best.offset) === 4) readFormat4(cmap, best.offset, end, map);
  else readFormat12(cmap, best.offset, end, map);
  return { unitsPerEm, notdefAdvance: advanceOfGlyph(0), advances };
}

/** The rank of a subtable among those `fontMetrics` reads, lowest first, or `null` for one it does not read. */
function subtableRank(platform: number, encoding: number, format: number): number | null {
  if (format === 12 && platform === 3 && encoding === 10) return 0;
  if (format === 12 && platform === 0) return 1;
  if (format === 4 && platform === 3 && encoding === 1) return 2;
  if (format === 4 && platform === 0) return 3;
  return null;
}

/** A format 4 subtable: segments of BMP code points, in ascending order, without U+FFFF. */
function readFormat4(
  view: DataView,
  offset: number,
  end: number,
  map: (codePoint: number, glyph: number) => void,
): void {
  if (offset + 14 > end) unmeasurable('its cmap subtable of format 4 is truncated');
  const segCountX2 = view.getUint16(offset + 6);
  if (segCountX2 === 0 || segCountX2 % 2 !== 0) {
    unmeasurable('its cmap subtable of format 4 has no whole segment');
  }
  const ends = offset + 14;
  const starts = ends + segCountX2 + 2;
  const deltas = starts + segCountX2;
  const rangeOffsets = deltas + segCountX2;
  if (rangeOffsets + segCountX2 > end) unmeasurable('its cmap subtable of format 4 is truncated');
  let previousEnd = -1;
  for (let at = 0; at < segCountX2; at += 2) {
    const last = view.getUint16(ends + at);
    const first = view.getUint16(starts + at);
    if (first > last || first <= previousEnd) {
      unmeasurable('the segments of its cmap subtable of format 4 are not in ascending order');
    }
    previousEnd = last;
    const delta = view.getUint16(deltas + at);
    const rangeOffset = view.getUint16(rangeOffsets + at);
    for (let codePoint = first; codePoint <= last && codePoint < 0xffff; codePoint += 1) {
      if (rangeOffset === 0) {
        map(codePoint, (codePoint + delta) & 0xffff);
        continue;
      }
      const address = rangeOffsets + at + rangeOffset + (codePoint - first) * 2;
      if (address + 2 > end) unmeasurable('its cmap subtable of format 4 is truncated');
      const glyph = view.getUint16(address);
      map(codePoint, glyph === 0 ? 0 : (glyph + delta) & 0xffff);
    }
  }
}

/** A format 12 subtable: groups of code points mapped to consecutive glyphs, in ascending order. */
function readFormat12(
  view: DataView,
  offset: number,
  end: number,
  map: (codePoint: number, glyph: number) => void,
): void {
  if (offset + 16 > end) unmeasurable('its cmap subtable of format 12 is truncated');
  const groups = view.getUint32(offset + 12);
  if (offset + 16 + groups * 12 > end) unmeasurable('its cmap subtable of format 12 is truncated');
  let previousEnd = -1;
  for (let index = 0; index < groups; index += 1) {
    const group = offset + 16 + index * 12;
    const first = view.getUint32(group);
    const last = view.getUint32(group + 4);
    const glyph = view.getUint32(group + 8);
    if (first > last || last > 0x10ffff || first <= previousEnd) {
      unmeasurable('the groups of its cmap subtable of format 12 are not in ascending order');
    }
    previousEnd = last;
    for (let codePoint = first; codePoint <= last; codePoint += 1) {
      map(codePoint, glyph + (codePoint - first));
    }
  }
}

// --- the measure (D83.2) ----------------------------------------------------

/** The advance of one code point, in font units: its glyph's, or `.notdef`'s when it has none (D83.1). */
export function advanceOf(metrics: FontMetrics, codePoint: number): number {
  return metrics.advances.get(codePoint) ?? metrics.notdefAdvance;
}

/** The width of a run of text in font units: the sum of the advances of its code points (D83.2). */
export function measureText(text: string, metrics: FontMetrics): number {
  let units = 0;
  for (const character of text) units += advanceOf(metrics, character.codePointAt(0) ?? 0);
  return units;
}

/**
 * Whether a run `units` wide fits a width at a font size, both integer
 * composition pixels: `units · fontSize ≤ width · unitsPerEm`, compared in
 * `BigInt`, with no rounding (D83.2).
 */
export function fitsWidth(
  units: number,
  fontSize: number,
  width: number,
  metrics: FontMetrics,
): boolean {
  return BigInt(units) * BigInt(fontSize) <= BigInt(width) * BigInt(metrics.unitsPerEm);
}

/** The width of a run `units` wide in composition pixels, `units · fontSize / unitsPerEm`, for a host to show. */
export function unitsToPixels(units: number, fontSize: number, metrics: FontMetrics): number {
  return (units * fontSize) / metrics.unitsPerEm;
}

/** The height of `lineCount` lines of a text, `1.25 · fontSize` each (D22.6), in composition pixels. */
export function textLinesHeight(lineCount: number, fontSize: number): number {
  return (lineCount * fontSize * 5) / 4;
}

/** Whether `lineCount` lines of a text fit a height: `5 · lineCount · fontSize ≤ 4 · height` (D83.2). */
export function textLinesFitHeight(lineCount: number, fontSize: number, height: number): boolean {
  return 5n * BigInt(lineCount) * BigInt(fontSize) <= 4n * BigInt(height);
}

// --- textLines (D83.5) ------------------------------------------------------

/** One line of a text as it is drawn: its runs, its text, and its width. */
export interface MeasuredLine {
  /** The runs of the line, white space and words, in order (D69.2). */
  readonly runs: readonly TextRun[];
  /** The runs joined: what the line draws. */
  readonly text: string;
  /** Its width in font units (D83.2). */
  readonly units: number;
}

function runText(run: TextRun): string {
  return 'space' in run ? run.space : run.letters.join('');
}

function measuredLine(runs: readonly TextRun[], units: number): MeasuredLine {
  return { runs, text: runs.map(runText).join(''), units };
}

/**
 * The lines of a text (D83.5). The text is split at its line feeds, which stay
 * breaks; with a `width`, each of those lines is wrapped to it: its words
 * fill a line greedily, in order, a word with the run of white space before it
 * joining while the line still fits by `fitsWidth`, otherwise starting a new
 * line. The run of white space at which a line breaks is neither drawn nor
 * measured. White space at the start of a line of the text is kept, and the
 * first word of a line always joins it, so a word wider than the frame stands
 * alone on its line and overflows; it is never broken inside (D83.5). White
 * space at the end of a line of the text is kept while the line still fits
 * with it, and is otherwise the run at which the line breaks. With a `width`
 * of `null`, the text is not wrapped: its lines are those of its line feeds.
 */
export function textLines(
  text: string,
  fontSize: number,
  width: number | null,
  metrics: FontMetrics,
): MeasuredLine[] {
  const fits = (units: number): boolean =>
    width === null || fitsWidth(units, fontSize, width, metrics);
  const out: MeasuredLine[] = [];
  for (const { runs } of textLayout(text).lines) {
    let line: TextRun[] = [];
    let units = 0;
    let hasWord = false;
    let pending: { readonly run: TextRun; readonly units: number } | null = null;
    for (const run of runs) {
      const runUnits = measureText(runText(run), metrics);
      if ('space' in run) {
        if (hasWord) pending = { run, units: runUnits };
        else {
          line.push(run);
          units += runUnits;
        }
        continue;
      }
      if (!hasWord) {
        line.push(run);
        units += runUnits;
        hasWord = true;
        continue;
      }
      const joined = units + (pending?.units ?? 0) + runUnits;
      if (fits(joined)) {
        if (pending !== null) line.push(pending.run);
        line.push(run);
        units = joined;
      } else {
        out.push(measuredLine(line, units));
        line = [run];
        units = runUnits;
      }
      pending = null;
    }
    if (pending !== null && fits(units + pending.units)) {
      line.push(pending.run);
      units += pending.units;
    }
    out.push(measuredLine(line, units));
  }
  return out;
}

// --- captions broken by width (D83.5) ---------------------------------------

/**
 * The pages of a captions node broken by width (D83.5, `lineBreak: "width"`):
 * a word joins the line while both bounds hold, the count of D57.3
 * (`maxLineLength` code points, one space between two words) and the width of
 * the node's box by `fitsWidth`, the space between two words measured as the
 * advance of U+0020. The first word of a line always joins it, so a word wider
 * than the box or longer than `maxLineLength` stands alone. Every `maxLines`
 * lines make a page, as in `captionPages`, whose result this has.
 */
export function captionPagesByWidth(
  words: readonly CaptionWord[],
  style: Pick<CaptionStyle, 'fontSize' | 'maxLineLength' | 'maxLines'>,
  width: number,
  metrics: FontMetrics,
): CaptionPage[] {
  const space = advanceOf(metrics, 0x20);
  const lines: number[][] = [];
  let line: number[] = [];
  let length = 0;
  let units = 0;
  words.forEach((word, index) => {
    const wordLength = codePoints(word.text);
    const wordUnits = measureText(word.text, metrics);
    if (
      line.length > 0 &&
      length + 1 + wordLength <= style.maxLineLength &&
      fitsWidth(units + space + wordUnits, style.fontSize, width, metrics)
    ) {
      line.push(index);
      length += 1 + wordLength;
      units += space + wordUnits;
      return;
    }
    if (line.length > 0) lines.push(line);
    line = [index];
    length = wordLength;
    units = wordUnits;
  });
  if (line.length > 0) lines.push(line);
  return pagesOfLines(lines, style.maxLines);
}

// --- frameLayout (D83.6) ----------------------------------------------------

/** Where each line lies across the frame's width (D83.4, D57). */
export type FrameAlign = 'left' | 'center' | 'right';
/** Where the block of lines lies along the frame's height (D83.4, D57). */
export type FrameVerticalAlign = 'top' | 'middle' | 'bottom';

/**
 * A text node as `frameLayout` reads it: the fields of schema `0.25` that place
 * its lines (D83.3, D83.4).
 */
export interface TextFrameInput {
  readonly type: 'text';
  readonly text: string;
  readonly fontSize: number;
  readonly frame:
    | { readonly kind: 'none' }
    | { readonly kind: 'fixed'; readonly width: number; readonly height: number };
  readonly style: { readonly align: FrameAlign; readonly verticalAlign: FrameVerticalAlign };
}

/** A captions node as `frameLayout` reads it: the fields of schema `0.25` that place its lines (D57, D83.5). */
export interface CaptionsFrameInput {
  readonly type: 'captions';
  readonly width: number;
  readonly height: number;
  readonly words: readonly CaptionWord[];
  readonly style: Pick<
    CaptionStyle,
    'fontSize' | 'lineHeight' | 'align' | 'verticalAlign' | 'maxLineLength' | 'maxLines'
  > & { readonly lineBreak: 'characters' | 'width' };
}

/** One line as `frameLayout` places it, in composition pixels from the top-left corner of the node's box. */
export interface FrameLine {
  /** What the line draws. */
  readonly text: string;
  /** Its width in font units (D83.2). */
  readonly units: number;
  /** Its width in composition pixels, `units · fontSize / unitsPerEm`. */
  readonly width: number;
  /** Whether it fits the width of the frame by `fitsWidth`; always, for a text without a frame. */
  readonly fits: boolean;
  /** Its left edge, as `align` places it; negative when it overflows to the left (D83.6). */
  readonly x: number;
  /** Its top edge, as `verticalAlign` places its block; negative when the block overflows upwards. */
  readonly y: number;
}

/** One line of captions: also the indices of its words in `words` and the index of its page. */
export interface CaptionFrameLine extends FrameLine {
  readonly words: readonly number[];
  readonly page: number;
}

/** The lines of a node in its frame, and whether they fit (D83.6). */
export interface FrameLayout<Line extends FrameLine = FrameLine> {
  readonly lines: readonly Line[];
  /** The height of the block of lines, in composition pixels; for captions, of the tallest page. */
  readonly height: number;
  /** Whether every line fits the width and every block the height. */
  readonly fits: boolean;
  /** The code points the text uses that the font has no glyph for, ascending (D83.1). */
  readonly missing: readonly number[];
}

/** The share of the free space before a line or a block: 0, a half, or all of it. */
function share(align: FrameAlign | FrameVerticalAlign): number {
  if (align === 'center' || align === 'middle') return 0.5;
  return align === 'right' || align === 'bottom' ? 1 : 0;
}

/** The code points of a text without a glyph in the font, ascending; a line feed is a break, not a glyph. */
function missingCodePoints(text: string, metrics: FontMetrics): number[] {
  const missing = new Set<number>();
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint !== 0x0a && !metrics.advances.has(codePoint)) missing.add(codePoint);
  }
  return [...missing].sort((a, b) => a - b);
}

/**
 * The lines of a text or a captions node in its frame (D83.6), for a host's
 * overlay and its mark "does not fit", with the metrics of the node's font.
 * A framed text wraps to its frame by `textLines`; a text without a frame keeps
 * the lines of its line feeds, aligned within its widest line, and always
 * fits. Captions break by `captionPages` (`characters`) or
 * `captionPagesByWidth` (`width`), each page placed in the box on its own.
 * Nothing is clipped: a line wider than the frame or a block taller than it
 * overflows on the side its alignment leaves free.
 */
export function frameLayout(
  node: CaptionsFrameInput,
  metrics: FontMetrics,
): FrameLayout<CaptionFrameLine>;
export function frameLayout(node: TextFrameInput, metrics: FontMetrics): FrameLayout;
export function frameLayout(
  node: TextFrameInput | CaptionsFrameInput,
  metrics: FontMetrics,
): FrameLayout {
  return node.type === 'text' ? textFrameLayout(node, metrics) : captionsFrameLayout(node, metrics);
}

function textFrameLayout(node: TextFrameInput, metrics: FontMetrics): FrameLayout {
  const { fontSize, frame, style } = node;
  const fixed = frame.kind === 'fixed' ? frame : null;
  const measured = textLines(node.text, fontSize, fixed?.width ?? null, metrics);
  const widths = measured.map((line) => unitsToPixels(line.units, fontSize, metrics));
  const frameWidth = fixed?.width ?? Math.max(0, ...widths);
  const height = textLinesHeight(measured.length, fontSize);
  const top = fixed === null ? 0 : (fixed.height - height) * share(style.verticalAlign);
  const lines = measured.map((line, index): FrameLine => {
    const width = widths[index] ?? 0;
    return {
      text: line.text,
      units: line.units,
      width,
      fits: fixed === null || fitsWidth(line.units, fontSize, fixed.width, metrics),
      x: (frameWidth - width) * share(style.align),
      y: top + textLinesHeight(index, fontSize),
    };
  });
  const fitsHeight = fixed === null || textLinesFitHeight(measured.length, fontSize, fixed.height);
  return {
    lines,
    height,
    fits: fitsHeight && lines.every((line) => line.fits),
    missing: missingCodePoints(node.text, metrics),
  };
}

function captionsFrameLayout(
  node: CaptionsFrameInput,
  metrics: FontMetrics,
): FrameLayout<CaptionFrameLine> {
  const { style, words } = node;
  const pages =
    style.lineBreak === 'width'
      ? captionPagesByWidth(words, style, node.width, metrics)
      : captionPagesByCharacters(words, style);
  const space = advanceOf(metrics, 0x20);
  const lines: CaptionFrameLine[] = [];
  // The tallest page: a page of captions never holds more than `maxLines` lines.
  const tallest = Math.max(0, ...pages.map((page) => page.lines.length));
  const height = tallest * style.lineHeight;
  pages.forEach((page, pageIndex) => {
    const block = page.lines.length * style.lineHeight;
    const top = (node.height - block) * share(style.verticalAlign);
    page.lines.forEach((line, lineIndex) => {
      const texts = line.words.map((index) => words[index]?.text ?? '');
      const units =
        texts.reduce((sum, text) => sum + measureText(text, metrics), 0) +
        space * Math.max(0, texts.length - 1);
      const width = unitsToPixels(units, style.fontSize, metrics);
      lines.push({
        text: texts.join(' '),
        units,
        width,
        fits: fitsWidth(units, style.fontSize, node.width, metrics),
        x: (node.width - width) * share(style.align),
        y: top + lineIndex * style.lineHeight,
        words: line.words,
        page: pageIndex,
      });
    });
  });
  const used = words.map(({ text }) => text).join(' ');
  return {
    lines,
    height,
    fits: height <= node.height && lines.every((line) => line.fits),
    missing: missingCodePoints(used, metrics),
  };
}

// --- measured nodes (D83.7) -------------------------------------------------

/** A node whose lines Kadrion measures, and the font it uses (D83.7). */
export interface MeasuredNode {
  readonly nodeId: string;
  readonly fontAssetId: string;
}

type AnyNode =
  | Composition['scenes'][number]['nodes'][number]
  | Composition['definitions'][number]['nodes'][number];

/**
 * The measured nodes of a document, in document order: every text with a
 * frame and every captions node broken by width, in its scenes, their groups,
 * and its definitions (D83.7).
 */
export function measuredNodes(
  composition: Pick<Composition, 'scenes' | 'definitions'>,
): MeasuredNode[] {
  const found: MeasuredNode[] = [];
  const visit = (node: AnyNode): void => {
    if (node.type === 'group') {
      for (const child of node.children) visit(child);
    } else if (node.type === 'text' && node.frame.kind === 'fixed') {
      found.push({ nodeId: node.id, fontAssetId: node.fontAssetId });
    } else if (node.type === 'captions' && node.style.lineBreak === 'width') {
      found.push({ nodeId: node.id, fontAssetId: node.fontAssetId });
    }
  };
  for (const scene of composition.scenes) for (const node of scene.nodes) visit(node);
  for (const definition of composition.definitions) {
    for (const node of definition.nodes) visit(node);
  }
  return found;
}

/**
 * The IDs of the font assets the measured nodes of a document use, each once,
 * in the order of their first use (D83.7): the fonts whose metrics
 * `evaluateComposition` needs, and that the load step reads with
 * `fontMetrics`. A document without a measured node needs none.
 */
export function measuredFontIds(
  composition: Pick<Composition, 'scenes' | 'definitions'>,
): string[] {
  return [...new Set(measuredNodes(composition).map(({ fontAssetId }) => fontAssetId))];
}
