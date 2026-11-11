/**
 * The evaluation of measured nodes (D83.5 to D83.7, PR-66): `measuredNodes`
 * and `measuredFontIds` find every framed text and every captions node broken
 * by width, in scenes, groups, and definitions; `evaluateComposition` needs
 * the metrics of exactly their fonts, and without them throws
 * `font-metrics-missing` at any time; `captionPages` breaks by width with the
 * width of the box and the metrics, and by characters as it always did; and a
 * framed text animated by line counts the lines of its frame.
 */
import { validateComposition, type CaptionWord, type ValidatedComposition } from '@kadrion/schema';
import {
  framedTextComposition,
  generateProportionalFont,
  nestedComposition,
  referenceComposition,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  captionPages,
  captionPagesByWidth,
  EvaluationError,
  evaluateComposition,
  fontMetrics,
  measuredFontIds,
  textLines,
  type FontMetrics,
} from '../src/index.js';
import { measuredNodes } from '../src/text-frame.js';

const FONT_ID = 'asset-font-proportional';
const METRICS = fontMetrics(generateProportionalFont());
const FONTS: ReadonlyMap<string, FontMetrics> = new Map([[FONT_ID, METRICS]]);

function validated(input: unknown): ValidatedComposition {
  const result = validateComposition(input);
  if (!result.ok) throw new Error(`Invalid: ${JSON.stringify(result.errors.slice(0, 3))}`);
  return result.composition;
}

const framed = validated(framedTextComposition);

/** A variant of `source`, changed by `edit` as plain JSON. */
function variant(source: unknown, edit: (draft: Draft) => void): ValidatedComposition {
  const draft = structuredClone(source) as Draft;
  edit(draft);
  return validated(draft);
}

type DraftNode = Record<string, unknown> & {
  id: string;
  type: string;
  frame?: unknown;
  fontAssetId?: string;
  style: Record<string, unknown>;
  children?: DraftNode[];
};
interface Draft {
  scenes: { nodes: DraftNode[] }[];
  definitions: { nodes: DraftNode[] }[];
}

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof EvaluationError) return error.code;
    throw error;
  }
  return undefined;
}

describe('the measured nodes of a document (D83.7)', () => {
  it('are the framed texts and the captions broken by width, in the order of the document', () => {
    expect(measuredNodes(framed).map(({ nodeId }) => nodeId)).toEqual([
      'text-top-left',
      'text-top-center',
      'text-top-right',
      'text-middle-left',
      'text-middle-center',
      'text-middle-right',
      'text-bottom-left',
      'text-bottom-center',
      'text-bottom-right',
      'text-long-word',
      'text-too-many-lines',
      'text-outlined-lines',
      'captions-width',
    ]);
    expect(measuredFontIds(framed)).toEqual([FONT_ID]);
  });

  it('are none in a document migrated from 0.24, which needs no metrics', () => {
    for (const document of [referenceComposition, nestedComposition]) {
      const composition = validated(document);
      expect(measuredNodes(composition)).toEqual([]);
      expect(JSON.stringify(evaluateComposition(composition, 0))).toBe(
        JSON.stringify(evaluateComposition(composition, 0, FONTS)),
      );
    }
  });

  it('are found in groups and in definitions too', () => {
    const nested = variant(nestedComposition, (draft) => {
      const texts: DraftNode[] = [];
      const visit = (node: DraftNode): void => {
        if (node.type === 'text') texts.push(node);
        for (const child of node.children ?? []) visit(child);
      };
      for (const node of [
        ...draft.scenes.flatMap((scene) => scene.nodes),
        ...draft.definitions.flatMap((definition) => definition.nodes),
      ]) {
        visit(node);
      }
      for (const text of texts) text.frame = { kind: 'fixed', width: 200, height: 100 };
    });
    const found = measuredNodes(nested);
    const inDefinitions = nested.definitions.flatMap((definition) =>
      definition.nodes.map(({ id }) => id),
    );
    expect(found.map(({ nodeId }) => nodeId)).toEqual(['card-title']);
    expect(inDefinitions).toContain('card-title');
    expect(measuredFontIds(nested)).toEqual(['asset-font']);
    // The caption of the reference composition is a child of its group.
    const grouped = variant(referenceComposition, (draft) => {
      for (const node of draft.scenes.flatMap((scene) => scene.nodes)) {
        for (const child of node.children ?? []) {
          if (child.type === 'text') child.frame = { kind: 'fixed', width: 400, height: 200 };
        }
      }
    });
    expect(measuredNodes(grouped).map(({ nodeId }) => nodeId)).toEqual(['node-caption']);
  });
});

describe('evaluateComposition with the metrics of the fonts (D83.7)', () => {
  it('throws font-metrics-missing without them, at any time, after the time is checked', () => {
    for (const timeUs of [0, 500_000, 1_999_999]) {
      expect(codeOf(() => evaluateComposition(framed, timeUs))).toBe('font-metrics-missing');
      expect(codeOf(() => evaluateComposition(framed, timeUs, new Map()))).toBe(
        'font-metrics-missing',
      );
    }
    expect(codeOf(() => evaluateComposition(framed, 2_000_000))).toBe('time-out-of-range');
    expect(codeOf(() => evaluateComposition(framed, 0.5))).toBe('time-not-integer');
  });

  it('needs only the fonts of measured nodes, and ignores any other', () => {
    const extra = new Map([...FONTS, ['asset-unused', METRICS]]);
    expect(JSON.stringify(evaluateComposition(framed, 1_500_000, extra))).toBe(
      JSON.stringify(evaluateComposition(framed, 1_500_000, FONTS)),
    );
  });

  it('pages captions broken by width as captionPages does with the box and the metrics', () => {
    const node = framed.scenes[1]?.nodes.find(({ id }) => id === 'captions-width');
    if (node?.type !== 'captions') throw new Error('No captions.');
    const pages = captionPages(node.words, node.style, node.width, METRICS);
    // The second page holds the last word alone, which the characters would not.
    expect(pages.map((page) => page.lines.length)).toEqual([2, 1]);
    const byCharacters = captionPages(node.words, { ...node.style, lineBreak: 'characters' });
    expect(byCharacters).toHaveLength(1);
    const last = node.words.length - 1;
    const word = node.words[last];
    if (word === undefined) throw new Error('No words.');
    const state = evaluateComposition(framed, 1_000_000 + word.startUs, FONTS);
    const shown = state.scenes[0]?.nodes.find(({ id }) => id === 'captions-width');
    expect(shown?.type === 'captions' && [shown.page, shown.word]).toEqual([1, last]);
  });

  it('counts the lines of the frame for a framed text animated by line', () => {
    const node = framed.scenes[1]?.nodes.find(({ id }) => id === 'text-outlined-lines');
    if (node?.type !== 'text' || node.frame.kind !== 'fixed') throw new Error('No framed text.');
    const wrapped = textLines(node.text, node.fontSize, node.frame.width, METRICS);
    // One line feed, and the frame wraps the second line again.
    expect(node.text.split('\n')).toHaveLength(2);
    expect(wrapped).toHaveLength(3);
    const state = evaluateComposition(framed, 1_100_000, FONTS);
    const shown = state.scenes[0]?.nodes.find(({ id }) => id === 'text-outlined-lines');
    expect(shown?.type === 'text' && shown.fragments?.lines).toHaveLength(3);
  });
});

describe('captionPages (D57.3, D83.5)', () => {
  const words: CaptionWord[] = 'Kadrion draws mmmmmmmm in a line'
    .split(' ')
    .map((text, at) => ({ text, startUs: at * 100_000, durationUs: 100_000 }));
  const style = { fontSize: 40, maxLineLength: 30, maxLines: 2 } as const;

  it('breaks by characters without a mode or with characters, as before', () => {
    const before = captionPages(words, { maxLineLength: 30, maxLines: 2 });
    expect(captionPages(words, { ...style, lineBreak: 'characters' })).toEqual(before);
    expect(captionPages(words, { ...style, lineBreak: 'characters' }, 1, METRICS)).toEqual(before);
  });

  it('breaks by width with the box and the metrics, as captionPagesByWidth does', () => {
    const byWidth = captionPages(words, { ...style, lineBreak: 'width' }, 300, METRICS);
    expect(byWidth).toEqual(captionPagesByWidth(words, style, 300, METRICS));
    expect(byWidth).not.toEqual(captionPages(words, { ...style, lineBreak: 'characters' }));
  });

  it('refuses to break by width without the width of the box or the metrics', () => {
    expect(codeOf(() => captionPages(words, { ...style, lineBreak: 'width' }))).toBe(
      'font-metrics-missing',
    );
    expect(codeOf(() => captionPages(words, { ...style, lineBreak: 'width' }, 300))).toBe(
      'font-metrics-missing',
    );
  });
});
