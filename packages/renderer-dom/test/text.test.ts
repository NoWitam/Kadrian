/**
 * The style of a text and its fragments in the rendered tree (D69): the
 * stroke, the shadow, and the box the mount writes, the nested elements of
 * the fragments, and the opacity, transform, and colour that `renderState`
 * writes on every fragment on every call. What a browser paints for them is
 * measured in the pinned environment; here the tree is checked.
 */
import { evaluateComposition, graphemes, type CompositionState } from '@kadrion/runtime';
import {
  referenceComposition,
  textComposition,
  textGoldenTimestamps,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { cssFragmentTransform, cssTranslucent } from '../src/css.js';
import { mountComposition, renderState } from '../src/index.js';
import { createRoot, elementOf, TRUSTED, validated } from './support.js';

const composition = validated(textComposition);
const urls = { 'asset-font': 'data:font/ttf,' };
const TIMES = textGoldenTimestamps.map(({ timeUs }) => timeUs);

function mounted(): HTMLElement {
  const root = createRoot();
  mountComposition(root, composition, urls, TRUSTED);
  return root;
}

const fragments = (element: Element, unit: string): HTMLElement[] => [
  ...element.querySelectorAll<HTMLElement>(`[data-kadrion-fragment="${unit}"]`),
];

/** The text of an element without its box, as a reader sees it. */
const shownText = (element: Element): string =>
  [...element.childNodes]
    .filter(
      (child) => child.nodeType !== 1 || !(child as Element).hasAttribute('data-kadrion-text-box'),
    )
    .map((child) => child.textContent)
    .join('');

describe('the style of a text (D69)', () => {
  it('writes a colour with an opacity as rgba, and an opaque one as rgb', () => {
    expect(cssTranslucent('#344054', 0.8)).toBe('rgba(52, 64, 84, 0.8)');
    expect(cssTranslucent('#344054', 1)).toBe('rgb(52, 64, 84)');
    expect(cssTranslucent('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  it('draws a stroke outside the glyphs: twice its width, under the fill', () => {
    const letters = elementOf(mounted(), 'node-letters');
    expect(letters.style.getPropertyValue('-webkit-text-stroke-width')).toBe('4px');
    expect(letters.style.getPropertyValue('-webkit-text-stroke-color')).toBe('rgb(240, 68, 56)');
    expect(letters.style.getPropertyValue('paint-order')).toBe('stroke');
  });

  it('writes a drop shadow with its opacity, offset, and blur', () => {
    const words = elementOf(mounted(), 'node-words');
    const node = composition.scenes[0]?.nodes.find(({ id }) => id === 'node-words');
    if (node?.type !== 'text' || node.style.shadow.kind !== 'drop') throw new Error('No shadow.');
    const { color, opacity, offset, blur } = node.style.shadow;
    expect(words.style.getPropertyValue('text-shadow')).toBe(
      `${cssTranslucent(color, opacity)} ${String(offset.x)}px ${String(offset.y)}px ${String(blur)}px`,
    );
    expect(words.style.getPropertyValue('-webkit-text-stroke-width')).toBe('');
  });

  it('puts a box behind the lines, padded on every side, as the first child of the text', () => {
    const lines = elementOf(mounted(), 'node-lines');
    const box = lines.firstElementChild as HTMLElement;
    expect(box.hasAttribute('data-kadrion-text-box')).toBe(true);
    expect(box.textContent).toBe('');
    expect(
      [
        'position',
        'left',
        'top',
        'right',
        'bottom',
        'z-index',
        'background-color',
        'border-radius',
      ].map((property) => box.style.getPropertyValue(property)),
    ).toEqual(['absolute', '-8px', '-8px', '-8px', '-8px', '-1', 'rgba(52, 64, 84, 0.8)', '10px']);
  });

  it('writes nothing of a plain style', () => {
    const root = createRoot();
    mountComposition(
      root,
      validated(referenceComposition),
      { ...urls, 'asset-image': 'data:image/png;base64,AAAA' },
      TRUSTED,
    );
    const title = elementOf(root, 'node-title');
    for (const property of ['-webkit-text-stroke-width', 'paint-order', 'text-shadow']) {
      expect(title.style.getPropertyValue(property)).toBe('');
    }
    expect(title.querySelector('[data-kadrion-text-box]')).toBeNull();
    expect(title.querySelector('[data-kadrion-fragment]')).toBeNull();
    expect([...title.childNodes].map((child) => child.nodeType)).toEqual([3]);
  });
});

describe('the fragments of a text in the mounted tree (D69)', () => {
  it('makes one inline-block element per letter, the white space as text between them', () => {
    const letters = elementOf(mounted(), 'node-letters');
    const list = fragments(letters, 'letter');
    expect(list.map((element) => element.textContent)).toEqual(graphemes('Kadriondanced'));
    expect(
      list.every((element) => element.style.getPropertyValue('display') === 'inline-block'),
    ).toBe(true);
    expect(shownText(letters)).toBe('Kadrion danced');
  });

  it('nests the letters in their words when both units are used', () => {
    const accent = elementOf(mounted(), 'node-accent');
    const words = fragments(accent, 'word');
    expect(
      words.map((word) => fragments(word, 'letter').map((letter) => letter.textContent)),
    ).toEqual([graphemes('radiant'), graphemes('comets')]);
    expect(shownText(accent)).toBe('radiant comets');
  });

  it('makes a line only of a line that holds a word, and keeps the line feed as text', () => {
    const lines = elementOf(mounted(), 'node-lines');
    expect(fragments(lines, 'line').map((line) => line.textContent)).toEqual([
      'Kadrion',
      'is steady',
    ]);
    expect(shownText(lines)).toBe('Kadrion\nis steady');
    expect(fragments(lines, 'word')).toEqual([]);
  });

  it('writes none of the values of a fragment at mount', () => {
    for (const fragment of mounted().querySelectorAll<HTMLElement>('[data-kadrion-fragment]')) {
      for (const property of ['opacity', 'transform', 'color']) {
        expect(fragment.style.getPropertyValue(property)).toBe('');
      }
    }
  });
});

describe('the fragments of a text in the rendered tree (D69)', () => {
  it('writes the opacity, the transform, and the colour of every fragment from the state', () => {
    for (const timeUs of TIMES) {
      const root = mounted();
      const state = evaluateComposition(composition, timeUs);
      renderState(root, state);
      for (const node of state.scenes[0]?.nodes ?? []) {
        if (node.type !== 'text' || node.fragments === null) continue;
        const element = elementOf(root, node.id);
        for (const [unit, list] of [
          ['letter', node.fragments.letters],
          ['word', node.fragments.words],
          ['line', node.fragments.lines],
        ] as const) {
          const written = fragments(element, unit).map((fragment) => [
            Number(fragment.style.getPropertyValue('opacity')),
            fragment.style.getPropertyValue('transform'),
            fragment.style.getPropertyValue('color'),
          ]);
          expect(written).toEqual(
            list.map((fragment) => [
              fragment.opacity,
              cssFragmentTransform(fragment),
              cssTranslucent(fragment.color, 1),
            ]),
          );
        }
      }
    }
  });

  it('writes a fragment at rest too, so that an earlier call leaves nothing behind', () => {
    const root = mounted();
    renderState(root, evaluateComposition(composition, TIMES[0] ?? 0));
    renderState(root, evaluateComposition(composition, 1_999_999));
    const fresh = mounted();
    renderState(fresh, evaluateComposition(composition, 1_999_999));
    expect(root.innerHTML).toBe(fresh.innerHTML);
    const letter = fragments(elementOf(root, 'node-letters'), 'letter')[0];
    expect(letter?.style.getPropertyValue('transform')).toBe(
      'translate(0px, 0px) rotate(0deg) scale(1, 1)',
    );
  });

  it('refuses a state whose fragments are not the ones mounted', () => {
    const root = mounted();
    const state = evaluateComposition(composition, 300_000);
    const damaged = structuredClone(state) as {
      -readonly [K in keyof CompositionState]: unknown;
    } & { scenes: { nodes: { id: string; fragments: { letters: unknown[] } | null }[] }[] };
    const node = damaged.scenes[0]?.nodes.find(({ id }) => id === 'node-letters');
    node?.fragments?.letters.pop();
    expect(() => {
      renderState(root, damaged as unknown as CompositionState);
    }).toThrow(expect.objectContaining({ name: 'RenderError', code: 'state-mismatch' }));
  });
});
