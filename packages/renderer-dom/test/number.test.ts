/**
 * A number in a text in the rendered tree (D91.2): the element of a text with
 * a number is as large as its box at every instant, its text box lies behind
 * the block of its widest text, and `renderState` writes its lines from the
 * state, every digit in a cell as wide as the widest digit of the font and
 * every letter a fragment of its letter animation. The tree after a frame is
 * the tree of that frame alone, whatever frame came before (D20). What a
 * browser paints is measured in the pinned environment
 * (`tests/pinned/number.pinned.test.ts`); here the tree is checked.
 */
import { evaluateComposition, fontMetrics } from '@kadrion/runtime';
import { generateNumeralFont, numberComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { renderState } from '../src/index.js';
import { DIGIT_CELL_ATTRIBUTE, mountMeasured, NUMBER_ATTRIBUTE } from '../src/mount.js';
import {
  createRoot,
  derived,
  describeRoot,
  draftNode,
  elementOf,
  reference,
  referenceUrls,
  TRUSTED,
  validated,
} from './support.js';

const FONTS = new Map([['asset-font-numerals', fontMetrics(generateNumeralFont())]]);
const URLS = { 'asset-font-numerals': 'data:font/ttf,' };
const composition = validated(numberComposition);
const IDS = [
  'number-count',
  'number-negative',
  'number-micro',
  'number-score',
  'number-grouped',
  'number-still',
] as const;

function mounted(): HTMLElement {
  const root = createRoot();
  mountMeasured(root, composition, URLS, TRUSTED, FONTS);
  return root;
}

function render(root: HTMLElement, timeUs: number): HTMLElement {
  renderState(root, evaluateComposition(composition, timeUs, FONTS));
  return root;
}

function lineTexts(element: HTMLElement): string[] {
  return [...element.querySelectorAll(':scope > [data-kadrion-text-line]')].map(
    (line) => line.textContent,
  );
}

describe('a text with a number in the rendered tree (D91.2)', () => {
  it('mounts an element as large as its box, and no line before the first frame', () => {
    const root = mounted();
    const count = elementOf(root, 'number-count');
    expect(count.hasAttribute(NUMBER_ATTRIBUTE)).toBe(true);
    expect([count.style.getPropertyValue('width'), count.style.getPropertyValue('height')]).toEqual(
      ['248px', '50px'],
    );
    expect(lineTexts(count)).toEqual([]);
    const micro = elementOf(root, 'number-micro');
    expect([micro.style.getPropertyValue('width'), micro.style.getPropertyValue('height')]).toEqual(
      ['260px', '60px'],
    );
    // The text box lies behind the block of the widest text, its padding around it.
    const box = micro.querySelector<HTMLElement>('[data-kadrion-text-box]');
    expect(box?.style.getPropertyValue('left')).toBe('54px');
    expect(box?.style.getPropertyValue('width')).toBe('152px');
    expect(elementOf(root, 'number-grouped').querySelector('[data-kadrion-text-box]')).toBeNull();
  });

  it('writes the lines of the state, and keeps the size of every element in every frame', () => {
    const root = mounted();
    const sizes = new Map<string, string>();
    for (let frame = 0; frame < 30; frame += 1) {
      const timeUs = Math.floor((frame * 1_000_000) / 30);
      render(root, timeUs);
      const state = evaluateComposition(composition, timeUs, FONTS);
      for (const id of IDS) {
        const element = elementOf(root, id);
        const size = `${element.style.getPropertyValue('width')} ${element.style.getPropertyValue('height')}`;
        expect(sizes.get(id) ?? size, id).toBe(size);
        sizes.set(id, size);
        const node = state.scenes[0]?.nodes.find((each) => each.id === id);
        if (node?.type !== 'text' || node.number === undefined) throw new Error(id);
        expect(lineTexts(element), `${id} at ${String(timeUs)}`).toEqual(
          node.number.lines.map(({ text }) => text),
        );
      }
    }
    expect(lineTexts(elementOf(root, 'number-count'))).toEqual(['1 234 567,89']);
    expect(lineTexts(elementOf(root, 'number-score'))).toEqual(['score', '100%']);
  });

  it('sets every digit in a cell as wide as the widest digit, and nothing else', () => {
    const root = render(mounted(), 966_666);
    const count = elementOf(root, 'number-count');
    const cells = [...count.querySelectorAll<HTMLElement>(`[${DIGIT_CELL_ATTRIBUTE}]`)];
    expect(cells.map((cell) => cell.textContent).join('')).toBe('123456789');
    for (const cell of cells) {
      expect(cell.style.getPropertyValue('width')).toBe('24px');
      expect(cell.style.getPropertyValue('display')).toBe('inline-block');
      expect(cell.style.getPropertyValue('text-align')).toBe('center');
    }
    const line = count.querySelector<HTMLElement>('[data-kadrion-text-line]');
    expect(line?.style.getPropertyValue('left')).toBe('0px');
    expect(line?.style.getPropertyValue('white-space')).toBe('pre');
    const negative = elementOf(render(mounted(), 0), 'number-negative');
    expect(
      [...negative.querySelectorAll(`[${DIGIT_CELL_ATTRIBUTE}]`)].map((cell) => cell.textContent),
    ).toEqual(['3']);
    expect(lineTexts(negative)).toEqual(['-3 units']);
  });

  it('makes every letter of the text it shows a fragment of its letter animation, a digit its own cell', () => {
    const root = render(mounted(), 100_000);
    const score = elementOf(root, 'number-score');
    const letters = [...score.querySelectorAll<HTMLElement>('[data-kadrion-fragment="letter"]')];
    const state = evaluateComposition(composition, 100_000, FONTS).scenes[0]?.nodes.find(
      (node) => node.id === 'number-score',
    );
    if (state?.type !== 'text') throw new Error('No score.');
    expect(letters.map((letter) => letter.textContent).join('')).toBe(
      (state.number?.text ?? '').replace(' ', ''),
    );
    expect(letters).toHaveLength(state.fragments?.letters.length ?? -1);
    const digits = letters.filter((letter) => letter.hasAttribute(DIGIT_CELL_ATTRIBUTE));
    expect(digits.length).toBeGreaterThan(0);
    for (const digit of digits) expect(digit.style.getPropertyValue('width')).toBe('16.8px');
    expect(letters[0]?.style.getPropertyValue('opacity')).not.toBe(
      letters[letters.length - 1]?.style.getPropertyValue('opacity'),
    );
  });

  it('draws a frame as it draws it alone, whatever frame came before (D20)', () => {
    for (const timeUs of [0, 500_000, 966_666]) {
      const alone = describeRoot(render(mounted(), timeUs));
      const root = mounted();
      for (const before of [966_666, 33_333, 500_000]) render(root, before);
      expect(describeRoot(render(root, timeUs))).toEqual(alone);
      expect(describeRoot(render(root, timeUs))).toEqual(alone);
    }
  });

  it('refuses a state with a number on a text mounted without one, and the other way round', () => {
    const numbered = derived((draft) => {
      const title = draftNode(draft, 'node-title');
      if (title.type !== 'text') throw new Error('No title.');
      title.text = '';
      title.number = {
        kind: 'number',
        value: 1,
        decimals: 0,
        decimalSeparator: '.',
        groupSeparator: '',
        prefix: '',
        suffix: '',
      };
    });
    const fonts = new Map([['asset-font', fontMetrics(generateNumeralFont())]]);
    const plain = createRoot();
    mountMeasured(plain, reference, referenceUrls, TRUSTED, new Map());
    expect(() => {
      renderState(plain, evaluateComposition(numbered, 0, fonts));
    }).toThrow(/has a number in the state and was mounted without one/);
    const withNumber = createRoot();
    mountMeasured(withNumber, numbered, referenceUrls, TRUSTED, fonts);
    expect(() => {
      renderState(withNumber, evaluateComposition(reference, 0));
    }).toThrow(/has no number in the state and was mounted with one/);
  });
});
