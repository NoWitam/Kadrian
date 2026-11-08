/**
 * Letters, words, and lines of a text, from the text alone (D65.3, D69.2): a
 * letter is an extended grapheme cluster of UAX #29 by the table of
 * `grapheme-table.ts`, pinned to one Unicode version, so that the Player and
 * the Producer split a text the same way whatever the ICU of their browser; a
 * word is a maximal run of characters that are not white space; a line is a
 * line of the text as written, split at a line feed. Nothing is measured.
 * `Intl.Segmenter` is never used.
 */
import { GRAPHEME_TABLE } from './grapheme-table.js';

/** The classes of the table, by the numbers `tests/unicode/grapheme-table.ts` gives them. */
const OTHER = 0;
const CR = 1;
const LF = 2;
const CONTROL = 3;
const EXTEND = 4;
const ZWJ = 5;
const REGIONAL_INDICATOR = 6;
const PREPEND = 7;
const SPACING_MARK = 8;
const L = 9;
const V = 10;
const T = 11;
const LV = 12;
const LVT = 13;
const PICTOGRAPHIC = 14;
const CONSONANT = 15;
const EXTEND_INCB_EXTEND = 16;
const EXTEND_INCB_LINKER = 17;

/** The first code point of every run of the table, and its class. */
interface Runs {
  readonly starts: readonly number[];
  readonly classes: readonly number[];
}

/** The runs of the table, decoded once when the module loads. */
function decode(): Runs {
  const starts: number[] = [];
  const classes: number[] = [];
  let start = 0;
  // A run is its length in base 36, in lower case, and its class as one upper-case letter.
  for (const [, length = '', name = 'A'] of GRAPHEME_TABLE.matchAll(/([0-9a-z]+)([A-Z])/g)) {
    starts.push(start);
    classes.push(name.charCodeAt(0) - 65);
    start += Number.parseInt(length, 36);
  }
  return Object.freeze({ starts: Object.freeze(starts), classes: Object.freeze(classes) });
}

const RUNS: Runs = decode();

/** The class of one code point, by a binary search of the runs. */
export function graphemeClass(codePoint: number): number {
  const { starts, classes } = RUNS;
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = low + Math.ceil((high - low) / 2);
    if ((starts[middle] ?? 0) <= codePoint) low = middle;
    else high = middle - 1;
  }
  return classes[low] ?? OTHER;
}

function isControl(c: number): boolean {
  return c === CONTROL || c === CR || c === LF;
}

function isExtend(c: number): boolean {
  return c === EXTEND || c === EXTEND_INCB_EXTEND || c === EXTEND_INCB_LINKER || c === ZWJ;
}

/**
 * The extended grapheme clusters of a text, in order (UAX #29, rules GB3 to
 * GB999, with GB9c and GB11): their concatenation is the text. An empty text
 * has none. A lone surrogate is a code point of its own, of the class Control.
 */
export function graphemes(text: string): string[] {
  const out: string[] = [];
  let cluster = '';
  let previous = -1;
  // GB9c: 0 no consonant, 1 a consonant then extends, 2 the same with a linker.
  let conjunct = 0;
  // GB11: 0 nothing, 1 a pictograph then extends, 2 the same then a ZWJ.
  let emoji = 0;
  // GB12, GB13: the regional indicators in a row before this code point.
  let indicators = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    const current = graphemeClass(codePoint);
    if (previous >= 0 && breaksBetween(previous, current, conjunct, emoji, indicators)) {
      out.push(cluster);
      cluster = '';
    }
    cluster += character;

    if (current === CONSONANT) conjunct = 1;
    else if (conjunct > 0 && current === EXTEND_INCB_LINKER) conjunct = 2;
    else if (conjunct > 0 && (current === EXTEND_INCB_EXTEND || current === ZWJ)) {
      // An extend keeps whatever came before it.
    } else conjunct = 0;

    if (current === PICTOGRAPHIC) emoji = 1;
    else if (emoji === 1 && isExtend(current) && current !== ZWJ) emoji = 1;
    else if (emoji === 1 && current === ZWJ) emoji = 2;
    else emoji = 0;

    indicators = current === REGIONAL_INDICATOR ? indicators + 1 : 0;
    previous = current;
  }
  if (cluster !== '') out.push(cluster);
  return out;
}

/** Whether a cluster ends between a code point of class `a` and one of class `b`. */
function breaksBetween(
  a: number,
  b: number,
  conjunct: number,
  emoji: number,
  indicators: number,
): boolean {
  if (a === CR && b === LF) return false; // GB3
  if (isControl(a) || isControl(b)) return true; // GB4, GB5
  if (a === L && (b === L || b === V || b === LV || b === LVT)) return false; // GB6
  if ((a === LV || a === V) && (b === V || b === T)) return false; // GB7
  if ((a === LVT || a === T) && b === T) return false; // GB8
  if (isExtend(b)) return false; // GB9
  if (b === SPACING_MARK) return false; // GB9a
  if (a === PREPEND) return false; // GB9b
  if (conjunct === 2 && b === CONSONANT) return false; // GB9c
  if (emoji === 2 && b === PICTOGRAPHIC) return false; // GB11
  if (a === REGIONAL_INDICATOR && b === REGIONAL_INDICATOR) return indicators % 2 === 0; // GB12, GB13
  return true; // GB999
}

/**
 * White space, by the code points of ECMAScript's `WhiteSpace` and
 * `LineTerminator` (D57, D69.2), written out so that no engine's Unicode
 * version decides it.
 */
export function isWhiteSpace(codePoint: number): boolean {
  return (
    (codePoint >= 0x09 && codePoint <= 0x0d) ||
    codePoint === 0x20 ||
    codePoint === 0xa0 ||
    codePoint === 0x1680 ||
    (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x202f ||
    codePoint === 0x205f ||
    codePoint === 0x3000 ||
    codePoint === 0xfeff
  );
}

/** A word of a line: its letters, whose concatenation is the word. */
export interface TextWord {
  readonly letters: readonly string[];
}

/** A run of a line: white space, kept as written, or a word. */
export type TextRun = { readonly space: string } | TextWord;

/** One line of a text as written: its runs, in order. */
export interface TextLine {
  readonly runs: readonly TextRun[];
}

/**
 * The fragments of a text (D65.3, D69.2): its lines, split at a line feed, each
 * with its runs of white space and its words, each word with its letters. A
 * line with no word is no line fragment, and white space is no letter. The
 * runs of every line, joined by line feeds, are the text.
 */
export interface TextLayout {
  readonly lines: readonly TextLine[];
  /** How many letters, words, and line fragments the text has. */
  readonly letters: number;
  readonly words: number;
  readonly fragmentLines: number;
}

export function textLayout(text: string): TextLayout {
  let letters = 0;
  let words = 0;
  let fragmentLines = 0;
  const lines = text.split('\n').map((line): TextLine => {
    const out: TextRun[] = [];
    let current = '';
    let spaced: boolean | null = null;
    const flush = (): void => {
      if (current === '') return;
      if (spaced === true) out.push({ space: current });
      else {
        const word = graphemes(current);
        letters += word.length;
        words += 1;
        out.push({ letters: word });
      }
      current = '';
    };
    for (const character of line) {
      const space = isWhiteSpace(character.codePointAt(0) ?? 0);
      if (space !== spaced) flush();
      spaced = space;
      current += character;
    }
    flush();
    if (out.some((run) => 'letters' in run)) fragmentLines += 1;
    return { runs: out };
  });
  return { lines, letters, words, fragmentLines };
}
