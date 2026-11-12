/**
 * The layout and the timing of captions (D57): which words make a line, which
 * lines make a page, which page is shown, and which word is spoken. All of it
 * is a pure function of the document — the words and the style of a captions
 * node — of the scene time, and, for captions broken by width, of the advance
 * widths of the node's font (D83.5). Broken by characters, nothing is
 * measured: a line holds as many words as `maxLineLength` characters allow,
 * counted as Unicode code points with one space between two words. Broken by
 * width, the line also fits the width of the node's box, measured from the
 * font's bytes by Kadrion itself, never by the browser's layout.
 */
import type { CaptionsNode, CaptionStyle, CaptionWord } from '@kadrion/schema';

import { captionPagesByCharacters, type CaptionPage } from './caption-lines.js';
import { EvaluationError } from './errors.js';
import { applied, fragmentSteps, rest, tracksLength } from './fragments.js';
import type { CaptionFragmentsState, FragmentState } from './state.js';
import { captionPagesByWidth, type FontMetrics } from './text-frame.js';

export type { CaptionLine, CaptionPage } from './caption-lines.js';

/** What a captions node shows at one instant (D57). */
export interface CaptionInstant {
  /** The index of the page shown, or `null` before the first word starts. */
  readonly page: number | null;
  /** The index of the word being spoken, or `null` between two words. */
  readonly word: number | null;
}

/**
 * The pages of a captions node (D57, D83.5). With `lineBreak` `characters`, or
 * without one, the words fill a line greedily, in order, while the line with
 * one space before the next word stays within `maxLineLength`; a word longer
 * than that stands alone on its line (D57.3). With `width`, a word joins the
 * line while it also fits `width`, the width of the node's box, measured with
 * `metrics`, the metrics of the node's font (`captionPagesByWidth`). Every
 * `maxLines` lines make a page, and the last page may hold fewer. No words, no
 * pages. `width` and `metrics` are needed only for `width`; without them it is
 * the `EvaluationError` `font-metrics-missing` (D83.7).
 */
export function captionPages(
  words: readonly CaptionWord[],
  style:
    | Pick<CaptionStyle, 'maxLineLength' | 'maxLines'>
    | Pick<CaptionStyle, 'fontSize' | 'maxLineLength' | 'maxLines' | 'lineBreak'>,
  width?: number,
  metrics?: FontMetrics,
): CaptionPage[] {
  if (!('lineBreak' in style) || style.lineBreak === 'characters') {
    return captionPagesByCharacters(words, style);
  }
  if (width === undefined || metrics === undefined) {
    throw new EvaluationError(
      'font-metrics-missing',
      'Captions broken by width need the width of their box and the metrics of their font (D83.7).',
    );
  }
  return captionPagesByWidth(words, style, width, metrics);
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

/**
 * Whether a captions node is drawn in pieces (D70): every line and every word
 * an element of its own whose opacity, transform, and colour are written at
 * every instant. It is, for its whole lifetime, as soon as its style moves a
 * word or a line, draws something under one, or animates a page: a box behind
 * the lines, a scale, tracks, an underline, or a box of the highlight, or an
 * entrance or an exit. A colour, an outline, and a shadow alone keep the words
 * of D57, so that every captions node of 0.14 is drawn as it was.
 */
export function captionsInPieces(style: CaptionStyle): boolean {
  const { highlight } = style;
  return (
    style.box.kind !== 'none' ||
    highlight.scale !== 1 ||
    highlight.tracks.length > 0 ||
    highlight.underline.kind !== 'none' ||
    highlight.box.kind !== 'none' ||
    style.pageIn.kind !== 'none' ||
    style.pageOut.kind !== 'none'
  );
}

/** The step of every fragment of one unit of a page, and how many steps there are (D69.3). */
function stepsOf(
  animation: Extract<CaptionStyle['pageIn'], { kind: 'animate' }>,
  count: number,
): { readonly steps: readonly number[]; readonly count: number } {
  const steps = fragmentSteps(animation.order, count);
  return { steps, count: steps.reduce((most, step) => (step + 1 > most ? step + 1 : most), 0) };
}

/**
 * The words and lines of the page shown at the scene time `timeUs` (D70), in
 * the order of the page, or `null` for a node that is not drawn in pieces.
 * Every fragment starts at rest in `color`, the colour of the words at that
 * instant. The entrance gives the fragment of step k the own time
 * `t − start − k·s`, where `start` is the start of the page's first word; the
 * exit `t − end + L + (S − 1 − k)·s`, where `end` is the start of the next
 * page's first word, or the end of the last word on the last page, `L` the
 * time of the latest keyframe, and `S` the number of steps, so that the last
 * fragment's last keyframe falls on `end`. Then the word being spoken takes the
 * highlight colour, its scale on both axes, and its tracks in its own time
 * `t − startUs`, while it is spoken and at no other time. Every combination is
 * the rule of D69.3; a page with no page shown has no fragments.
 */
export function captionFragments(
  node: CaptionsNode,
  pages: readonly CaptionPage[],
  instant: CaptionInstant,
  color: string,
  timeUs: number,
): CaptionFragmentsState | null {
  const { style, words } = node;
  if (!captionsInPieces(style)) return null;
  const page = instant.page === null ? undefined : pages[instant.page];
  if (page === undefined) return { lines: [], words: [] };
  const lineStates: FragmentState[] = page.lines.map(() => rest(color));
  const wordIndices = page.lines.flatMap((line) => line.words);
  const wordStates: FragmentState[] = wordIndices.map(() => rest(color));

  const firstWord = words[page.firstWord];
  const nextPage = instant.page === null ? undefined : pages[instant.page + 1];
  const nextWord = nextPage === undefined ? undefined : words[nextPage.firstWord];
  const lastWord = words[words.length - 1];
  for (const phase of ['pageIn', 'pageOut'] as const) {
    const animation = style[phase];
    if (animation.kind !== 'animate') continue;
    const list = animation.unit === 'word' ? wordStates : lineStates;
    const { steps, count } = stepsOf(animation, list.length);
    list.forEach((fragment, index) => {
      const step = steps[index] ?? 0;
      let ownTimeUs: number;
      if (phase === 'pageIn') {
        ownTimeUs = timeUs - (firstWord?.startUs ?? 0) - step * animation.staggerUs;
      } else {
        // The end of the page: the next page's start, or the end of the last word,
        // formed as a difference so that no end past the safe integers is needed.
        const fromEnd =
          nextWord !== undefined
            ? timeUs - nextWord.startUs
            : timeUs - (lastWord?.startUs ?? 0) - (lastWord?.durationUs ?? 0);
        ownTimeUs =
          fromEnd + tracksLength(animation.tracks) + (count - 1 - step) * animation.staggerUs;
      }
      list[index] = applied(fragment, animation.tracks, ownTimeUs);
    });
  }

  const spokenAt = instant.word === null ? -1 : wordIndices.indexOf(instant.word);
  const spoken = wordStates[spokenAt];
  const spokenWord = instant.word === null ? undefined : words[instant.word];
  if (spoken !== undefined && spokenWord !== undefined) {
    const { highlight } = style;
    const lit: FragmentState = {
      ...spoken,
      color: highlight.color,
      scale: { x: spoken.scale.x * highlight.scale, y: spoken.scale.y * highlight.scale },
    };
    wordStates[spokenAt] = applied(lit, highlight.tracks, timeUs - spokenWord.startUs);
  }
  return { lines: lineStates, words: wordStates };
}
