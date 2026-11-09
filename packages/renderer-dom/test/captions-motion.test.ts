/**
 * Captions drawn in pieces in the rendered tree (D70): the mount wraps every
 * line in an element of its own, makes every word one, and puts the box behind
 * the lines and the box and the underline of the highlight under each word,
 * hidden; a render writes the opacity, transform, and colour of every line and
 * word of the page shown, shows the highlight's pieces on the word being spoken
 * alone, and leaves the same tree whatever was rendered before. The times are
 * those of the animated captions fixture.
 */
import { evaluateComposition, type CompositionState } from '@kadrion/runtime';
import { captionsMotionComposition, captionsMotionGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { cssColor, cssFragmentTransform } from '../src/css.js';
import { mountComposition, renderState } from '../src/index.js';
import { createRoot, elementOf, shuffled, TRUSTED, validated } from './support.js';

const composition = validated(captionsMotionComposition);
const urls = { 'asset-font': 'data:font/ttf,' };
const TIMES = [
  0,
  ...captionsMotionGoldenTimestamps.map(({ timeUs }) => timeUs),
  1_050_000,
  1_999_999,
];

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

const all = (element: Element, attribute: string): HTMLElement[] => [
  ...element.querySelectorAll<HTMLElement>(`[${attribute}]`),
];

function page(root: Element, id: string, index: number): HTMLElement {
  const element = elementOf(root, id).querySelector<HTMLElement>(
    `[data-kadrion-caption-page="${String(index)}"]`,
  );
  if (element === null) throw new Error(`No page ${String(index)}.`);
  return element;
}

describe('the mount of captions in pieces (D70)', () => {
  it('wraps every line of every page in a line element that holds its words', () => {
    const root = mounted();
    const pop = elementOf(root, 'captions-pop');
    expect(all(pop, 'data-kadrion-caption-line').map((line) => line.textContent)).toEqual([
      'Kadrion sings',
      'on time and',
      'dances in',
      'stride',
    ]);
    for (const line of all(pop, 'data-kadrion-caption-line')) {
      expect(line.style.getPropertyValue('display')).toBe('inline-block');
      expect(line.style.getPropertyValue('position')).toBe('relative');
    }
    for (const word of all(pop, 'data-kadrion-caption-word')) {
      expect(word.style.getPropertyValue('display')).toBe('inline-block');
    }
  });

  it('writes the outline and the shadow of the style on the box, as on a text', () => {
    const root = mounted();
    expect(
      elementOf(root, 'captions-pop').style.getPropertyValue('-webkit-text-stroke-width'),
    ).toBe('4px');
    expect(elementOf(root, 'captions-bounce').style.getPropertyValue('text-shadow')).not.toBe('');
  });

  it('puts the box of the style behind every line, and the pieces of the highlight under every word, hidden', () => {
    const root = mounted();
    const bounce = elementOf(root, 'captions-bounce');
    const lines = all(bounce, 'data-kadrion-caption-line');
    expect(
      lines.map((line) => line.firstElementChild?.hasAttribute('data-kadrion-caption-line-box')),
    ).toEqual(lines.map(() => true));
    const words = all(bounce, 'data-kadrion-caption-word');
    for (const word of words) {
      const wordBox = word.querySelector<HTMLElement>('[data-kadrion-caption-word-box]');
      expect(wordBox?.style.getPropertyValue('display')).toBe('none');
      expect(word.querySelector('[data-kadrion-caption-underline]')).toBeNull();
    }
    const pop = elementOf(root, 'captions-pop');
    expect(pop.querySelector('[data-kadrion-caption-line-box]')).toBeNull();
    for (const word of all(pop, 'data-kadrion-caption-word')) {
      const underline = word.querySelector<HTMLElement>('[data-kadrion-caption-underline]');
      expect(underline?.style.getPropertyValue('display')).toBe('none');
      expect(underline?.style.getPropertyValue('height')).toBe('4px');
      expect(underline?.style.getPropertyValue('bottom')).toBe('-2px');
      expect(underline?.style.getPropertyValue('background-color')).toBe('rgb(255, 212, 0)');
    }
  });

  it('keeps the words as text, so that a line reads as it did in one piece', () => {
    const root = mounted();
    const word = all(elementOf(root, 'captions-pop'), 'data-kadrion-caption-word')[0];
    expect(word?.textContent).toBe('Kadrion');
    expect(word?.lastChild?.nodeType).toBe(3);
  });
});

describe('a render of captions in pieces (D70)', () => {
  it('writes the opacity, the transform, and the colour of every line and word of the page shown', () => {
    for (const timeUs of TIMES) {
      const root = rendered(timeUs);
      const state = evaluateComposition(composition, timeUs);
      for (const node of state.scenes[0]?.nodes ?? []) {
        if (node.type !== 'captions' || node.fragments === null || node.page === null) continue;
        const shown = page(root, node.id, node.page);
        expect(
          all(shown, 'data-kadrion-caption-line').map((line) => [
            Number(line.style.getPropertyValue('opacity')),
            line.style.getPropertyValue('transform'),
          ]),
        ).toEqual(node.fragments.lines.map((line) => [line.opacity, cssFragmentTransform(line)]));
        expect(
          all(shown, 'data-kadrion-caption-word').map((word) => [
            Number(word.style.getPropertyValue('opacity')),
            word.style.getPropertyValue('transform'),
            word.style.getPropertyValue('color'),
          ]),
        ).toEqual(
          node.fragments.words.map((word) => [
            word.opacity,
            cssFragmentTransform(word),
            cssColor(word.color),
          ]),
        );
      }
    }
  });

  it('shows the box and the underline of the highlight on the word being spoken alone', () => {
    const root = rendered(300_000);
    const visible = (id: string, attribute: string): string[] =>
      all(elementOf(root, id), attribute)
        .filter((piece) => piece.style.getPropertyValue('display') === 'block')
        .map((piece) => piece.parentElement?.textContent ?? '');
    // 'sings' is spoken from 300 000 µs, 'stars' from 200 000 µs.
    expect(visible('captions-pop', 'data-kadrion-caption-underline')).toEqual(['sings']);
    expect(visible('captions-bounce', 'data-kadrion-caption-word-box')).toEqual(['stars']);
    const pause = rendered(290_000);
    expect(
      all(elementOf(pause, 'captions-pop'), 'data-kadrion-caption-underline').filter(
        (piece) => piece.style.getPropertyValue('display') === 'block',
      ),
    ).toEqual([]);
  });

  it('leaves the lines and words of every other page without values of their own', () => {
    const root = rendered(300_000, 1_200_000);
    for (const piece of [
      ...all(page(root, 'captions-pop', 0), 'data-kadrion-caption-line'),
      ...all(page(root, 'captions-pop', 0), 'data-kadrion-caption-word'),
    ]) {
      for (const property of ['opacity', 'transform', 'color']) {
        expect(piece.style.getPropertyValue(property)).toBe('');
      }
    }
  });

  it('never uses the highlight property of D57 for a node in pieces', () => {
    for (const timeUs of TIMES) {
      for (const word of all(rendered(timeUs), 'data-kadrion-caption-word')) {
        expect(word.style.getPropertyValue('color')).not.toContain('var(');
      }
    }
  });

  it('gives the same tree whatever was rendered before', () => {
    for (const timeUs of TIMES) {
      const fresh = rendered(timeUs).innerHTML;
      expect(rendered(...shuffled(TIMES, timeUs), timeUs).innerHTML).toBe(fresh);
    }
  });

  it('leaves no value on any piece while no page is shown', () => {
    const root = rendered(300_000, 1_050_000, 0);
    for (const piece of [
      ...all(root, 'data-kadrion-caption-line'),
      ...all(root, 'data-kadrion-caption-word'),
    ]) {
      expect(piece.style.getPropertyValue('opacity')).toBe('');
    }
  });

  it('refuses a state whose fragments are not the pieces mounted on the page shown', () => {
    const state = evaluateComposition(composition, 300_000);
    const damage = (
      edit: (fragments: { lines: unknown[]; words: unknown[] } | null) => unknown,
    ) => {
      const damaged = structuredClone(state) as unknown as {
        scenes: {
          nodes: { id: string; fragments: { lines: unknown[]; words: unknown[] } | null }[];
        }[];
      };
      const node = damaged.scenes[0]?.nodes.find(({ id }) => id === 'captions-pop');
      if (node !== undefined) node.fragments = edit(node.fragments) as typeof node.fragments;
      return damaged as unknown as CompositionState;
    };
    for (const damaged of [
      damage((fragments) => ({
        lines: fragments?.lines ?? [],
        words: fragments?.words.slice(1) ?? [],
      })),
      damage((fragments) => ({
        lines: fragments?.lines.slice(1) ?? [],
        words: fragments?.words ?? [],
      })),
      damage(() => null),
    ]) {
      expect(() => {
        renderState(mounted(), damaged);
      }).toThrow(expect.objectContaining({ name: 'RenderError', code: 'state-mismatch' }));
    }
  });
});
