/**
 * The layout and the timing of captions (D57): which words make a line, which
 * lines make a page, which page is shown, and which word is spoken. All of it
 * is a pure function of the document — the words and the style of a captions
 * node — and of the scene time. Nothing is measured: a line holds as many
 * words as `maxLineLength` characters allow, counted as Unicode code points
 * with one space between two words, so the runtime stays free of fonts and of
 * the browser's layout.
 */
import type { CaptionsNode, CaptionStyle, CaptionWord } from '@kadrion/schema';

/** One line of a page: the indices of its words in the node's `words`, in order. */
export interface CaptionLine {
  readonly words: readonly number[];
}

/** One page of captions: up to `maxLines` lines, shown from the start of its first word. */
export interface CaptionPage {
  readonly lines: readonly CaptionLine[];
  /** The index of the page's first word in the node's `words`. */
  readonly firstWord: number;
}

/** What a captions node shows at one instant (D57). */
export interface CaptionInstant {
  /** The index of the page shown, or `null` before the first word starts. */
  readonly page: number | null;
  /** The index of the word being spoken, or `null` between two words. */
  readonly word: number | null;
}

/** The length of a word in Unicode code points (D57). */
function codePoints(text: string): number {
  return Array.from(text).length;
}

/**
 * The pages of a captions node (D57): the words fill a line greedily, in
 * order, while the line with one space before the next word stays within
 * `maxLineLength`; a word longer than that stands alone on its line. Every
 * `maxLines` lines make a page, and the last page may hold fewer. No words, no
 * pages.
 */
export function captionPages(
  words: readonly CaptionWord[],
  style: Pick<CaptionStyle, 'maxLineLength' | 'maxLines'>,
): CaptionPage[] {
  const lines: number[][] = [];
  let line: number[] = [];
  let length = 0;
  words.forEach((word, index) => {
    const wordLength = codePoints(word.text);
    if (line.length > 0 && length + 1 + wordLength <= style.maxLineLength) {
      line.push(index);
      length += 1 + wordLength;
      return;
    }
    if (line.length > 0) lines.push(line);
    line = [index];
    length = wordLength;
  });
  if (line.length > 0) lines.push(line);

  const pages: CaptionPage[] = [];
  for (let at = 0; at < lines.length; at += style.maxLines) {
    const pageLines = lines.slice(at, at + style.maxLines);
    pages.push({
      lines: pageLines.map((words) => ({ words })),
      firstWord: pageLines[0]?.[0] ?? 0,
    });
  }
  return pages;
}

/**
 * The last index whose item starts at or before `timeUs`, or -1. The items
 * ascend by `startUs` (D57, validated), so the search halves.
 */
function lastStarted(starts: readonly { readonly startUs: number }[], timeUs: number): number {
  let low = 0;
  let high = starts.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const item = starts[middle];
    if (item !== undefined && item.startUs <= timeUs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * What a captions node shows at a scene time (D57), from the word timings
 * alone: the page whose first word started last at or before `timeUs` — a page
 * stays until the next one starts — and the word whose interval
 * `[startUs, startUs + durationUs)` holds `timeUs`, compared as a difference so
 * that no end is formed past the safe integers. Whether the node is active is
 * the caller's matter.
 */
export function captionAt(
  words: CaptionsNode['words'],
  pages: readonly CaptionPage[],
  timeUs: number,
): CaptionInstant {
  const starts = pages.map((page) => ({ startUs: words[page.firstWord]?.startUs ?? 0 }));
  const page = lastStarted(starts, timeUs);
  const candidate = lastStarted(words, timeUs);
  const word = words[candidate];
  const spoken = word !== undefined && timeUs - word.startUs < word.durationUs;
  return { page: page < 0 ? null : page, word: spoken ? candidate : null };
}
