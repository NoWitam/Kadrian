/**
 * Captions in the rendered tree (D57): the mount builds every page the
 * runtime makes, its lines, and one element per word, all hidden; a render
 * shows the page of the state and gives the word being spoken the highlight
 * colour, and nothing depends on the renders before it. The times are those
 * of the captions fixture.
 */
import { evaluateComposition } from '@kadrion/runtime';
import { captionsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { mountComposition, renderState } from '../src/index.js';
import { createRoot, referenceUrls, shuffled, TRUSTED, validated } from './support.js';

const composition = validated(captionsComposition);
const urls = { 'asset-font': referenceUrls['asset-font'] ?? '' };
const TIMES = [0, 300_000, 1_200_000, 1_700_000, 2_600_000, 2_966_666];

function mounted(): HTMLElement {
  const root = createRoot();
  mountComposition(root, composition, urls, TRUSTED);
  return root;
}

function rendered(...times: number[]): HTMLElement {
  const root = mounted();
  for (const timeUs of times) renderState(root, evaluateComposition(composition, timeUs));
  return root;
}

function box(root: Element): HTMLElement {
  const element = root.querySelector('[data-kadrion-node="captions"]');
  if (element === null) throw new Error('No captions.');
  return element as HTMLElement;
}

function pages(root: Element): HTMLElement[] {
  return [...box(root).querySelectorAll<HTMLElement>('[data-kadrion-caption-page]')];
}

/** What a render shows: the index of each visible page, and the words with an own colour. */
function shown(root: Element): { pages: string[]; highlighted: string[] } {
  return {
    pages: pages(root)
      .filter((page) => page.style.getPropertyValue('display') !== 'none')
      .map((page) => page.getAttribute('data-kadrion-caption-page') ?? ''),
    highlighted: [...box(root).querySelectorAll<HTMLElement>('[data-kadrion-caption-word]')]
      .filter((word) => word.style.getPropertyValue('color') !== '')
      .map((word) => word.textContent),
  };
}

describe('the mount of captions (D57.6)', () => {
  it('builds the pages, lines, and words the runtime makes, as text, all hidden', () => {
    const root = mounted();
    const lines = pages(root).map((page) => [...page.children].map((line) => line.textContent));
    expect(lines).toEqual([
      ['Kadrion renders', 'scenes on time'],
      ['and does it by', 'design'],
    ]);
    expect(shown(root)).toEqual({ pages: [], highlighted: [] });
  });

  it('writes the box, the font, the style, and the highlight colour as static declarations', () => {
    const root = mounted();
    const element = box(root);
    expect(element.style.getPropertyValue('width')).toBe('560px');
    expect(element.style.getPropertyValue('height')).toBe('140px');
    expect(element.style.getPropertyValue('font-family')).toBe('kadrion-font-asset-font');
    expect(element.style.getPropertyValue('font-size')).toBe('40px');
    expect(element.style.getPropertyValue('line-height')).toBe('56px');
    expect(element.style.getPropertyValue('white-space')).toBe('pre');
    expect(element.style.getPropertyValue('text-align')).toBe('center');
    expect(element.style.getPropertyValue('color')).toBe('rgb(255, 255, 255)');
    expect(element.style.getPropertyValue('--kadrion-caption-highlight')).toBe('rgb(255, 212, 0)');
    expect(pages(root)[0]?.style.getPropertyValue('justify-content')).toBe('flex-end');
  });
});

describe('a render of captions (D57.6)', () => {
  it.each([
    [0, [], []],
    [300_000, ['0'], ['Kadrion']],
    [1_200_000, ['0'], ['on']],
    [1_700_000, ['0'], []],
    [2_600_000, ['1'], ['by']],
    [2_966_666, ['1'], ['design']],
  ])('at %i µs shows pages %j and highlights %j', (timeUs, page, words) => {
    expect(shown(rendered(timeUs))).toEqual({ pages: page, highlighted: words });
  });

  it('highlights with the custom property the mount wrote', () => {
    const word = box(rendered(300_000)).querySelector<HTMLElement>(
      '[data-kadrion-caption-word="0"]',
    );
    expect(word?.style.getPropertyValue('color')).toBe('var(--kadrion-caption-highlight)');
  });

  it('gives the same tree whatever was rendered before', () => {
    for (const timeUs of TIMES) {
      const fresh = rendered(timeUs).innerHTML;
      expect(rendered(...shuffled(TIMES, timeUs), timeUs).innerHTML).toBe(fresh);
    }
  });
});
