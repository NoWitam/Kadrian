/**
 * The lines and pages of captions broken by characters (D57.3), and the pages
 * that every `maxLines` lines make, whichever way the lines were broken
 * (D83.5). A module of its own so that the captions of the evaluation and the
 * frame layout of `text-frame.ts` share them without importing each other.
 */
import type { CaptionStyle, CaptionWord } from '@kadrion/schema';

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

/** The length of a word in Unicode code points (D57). */
export function codePoints(text: string): number {
  return Array.from(text).length;
}

/** Every `maxLines` lines make a page, and the last page may hold fewer (D57.3). */
export function pagesOfLines(
  lines: readonly (readonly number[])[],
  maxLines: number,
): CaptionPage[] {
  const pages: CaptionPage[] = [];
  for (let at = 0; at < lines.length; at += maxLines) {
    const pageLines = lines.slice(at, at + maxLines);
    pages.push({
      lines: pageLines.map((words) => ({ words })),
      firstWord: pageLines[0]?.[0] ?? 0,
    });
  }
  return pages;
}

/**
 * The pages of captions broken by characters (D57.3): the words fill a line
 * greedily, in order, while the line with one space before the next word stays
 * within `maxLineLength`; a word longer than that stands alone on its line.
 * Every `maxLines` lines make a page. No words, no pages.
 */
export function captionPagesByCharacters(
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
  return pagesOfLines(lines, style.maxLines);
}
