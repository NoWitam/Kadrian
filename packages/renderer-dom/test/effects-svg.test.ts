/**
 * The effects of SVG filters in the rendered tree (D72): one `<filter>` per
 * such effect in one hidden `<svg>` after the scenes, referred to by its ID in
 * the CSS `filter` of its holder at its place among the CSS functions; the
 * primitives of each kind with the values of the instant; empty filters for
 * the effects of a scene the state does not evaluate; no `<svg>` at all for a
 * document without such effects; and the same tree whatever was rendered
 * before. The times are those of the composition of SVG effects.
 */
import { evaluateComposition, type SvgEffectState } from '@kadrion/runtime';
import { effectsSvgComposition, effectsSvgGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { cssFilter } from '../src/css.js';
import { mountComposition, renderState } from '../src/index.js';
import { STAGE_ATTRIBUTE } from '../src/mount.js';
import { EFFECTS_ATTRIBUTE, FILTER_REACH, writeEffectFilters } from '../src/svg-filters.js';
import {
  createRoot,
  elementOf,
  reference,
  referenceUrls,
  shuffled,
  TRUSTED,
  validated,
} from './support.js';

const composition = validated(effectsSvgComposition);
const urls = {
  'asset-image': 'data:image/png,',
  'asset-video': 'data:video/mp4,',
  'asset-font': 'data:font/ttf,',
  'asset-video-green': 'data:video/mp4,',
};
const TIMES = [...effectsSvgGoldenTimestamps.map(({ timeUs }) => timeUs), 1_599_999];

function rendered(...times: number[]): HTMLElement {
  const root = createRoot();
  mountComposition(root, composition, urls, TRUSTED);
  for (const timeUs of times) renderState(root, evaluateComposition(composition, timeUs));
  return root;
}

const filterOf = (element: HTMLElement): string => element.style.getPropertyValue('filter');

function filterElement(root: Element, effectId: string): Element {
  const element = root.querySelector(`filter[id="kadrion-effect-${effectId}"]`);
  if (element === null) throw new Error(`No filter of ${effectId}.`);
  return element;
}

/** The primitives of a filter as tag and attributes, children included. */
function shape(element: Element): unknown {
  return {
    tag: element.localName,
    attributes: Object.fromEntries([...element.attributes].map(({ name, value }) => [name, value])),
    children: [...element.children].map(shape),
  };
}

describe('the CSS filter of the effects of SVG filters (D72)', () => {
  it('refers to the filter of each such effect at its place among the CSS functions', () => {
    const effects = [
      { id: 'a', kind: 'brightness', amount: 1.3 },
      { id: 'b', kind: 'curves', red: [1, 0], green: [0, 1], blue: [0, 1], amount: 1 },
      { id: 'c', kind: 'blur', radius: 2 },
      { id: 'd', kind: 'vignette', amount: 1, size: 0.5 },
    ] as const;
    expect(cssFilter(effects, 4)).toBe(
      'brightness(1.3) url("#kadrion-effect-b") blur(2px) url("#kadrion-effect-d") blur(4px)',
    );
  });
});

describe('the filters of SVG effects in the rendered tree (D72)', () => {
  it('mounts one empty filter per SVG effect, in document order, in a hidden svg after the scenes', () => {
    const root = createRoot();
    mountComposition(root, composition, urls, TRUSTED);
    const stage = root.querySelector(`[${STAGE_ATTRIBUTE}]`);
    const svg = stage?.lastElementChild;
    expect(svg?.hasAttribute(EFFECTS_ATTRIBUTE)).toBe(true);
    expect(svg?.getAttribute('width')).toBe('0');
    expect(svg?.getAttribute('height')).toBe('0');
    const filters = [...(svg?.querySelectorAll('filter') ?? [])];
    expect(filters.map((filter) => filter.id).slice(0, 7)).toEqual([
      'kadrion-effect-scene-svg-e0',
      'kadrion-effect-svg-curves-e0',
      'kadrion-effect-svg-grade-e0',
      'kadrion-effect-svg-glow-e0',
      'kadrion-effect-svg-chain-e1',
      'kadrion-effect-svg-group-e0',
      'kadrion-effect-svg-group-image-e0',
    ]);
    // Every SVG effect of the document, and none of a CSS filter.
    expect(filters).toHaveLength(8 + 16);
    for (const filter of filters) {
      expect(filter.attributes).toHaveLength(1);
      expect(filter.childElementCount).toBe(0);
    }
  });

  it('mounts no svg for a document without SVG effects, so its tree is what it was', () => {
    const root = createRoot();
    mountComposition(root, reference, referenceUrls, TRUSTED);
    expect(root.querySelector(`[${EFFECTS_ATTRIBUTE}]`)).toBeNull();
    renderState(root, evaluateComposition(reference, 5_000_000));
    expect(root.querySelector('svg')).toBeNull();
  });

  it('writes the filter of a node, a group, and a scene in the order of their effects', () => {
    const root = rendered(0);
    expect(filterOf(elementOf(root, 'svg-curves'))).toBe('url("#kadrion-effect-svg-curves-e0")');
    expect(filterOf(elementOf(root, 'svg-chain'))).toBe(
      'brightness(1.3) url("#kadrion-effect-svg-chain-e1") blur(2px)',
    );
    expect(filterOf(elementOf(root, 'svg-group'))).toBe('url("#kadrion-effect-svg-group-e0")');
    const scene = root.querySelector<HTMLElement>('[data-kadrion-scene="scene-svg"]');
    expect(scene === null ? '' : filterOf(scene)).toBe('url("#kadrion-effect-scene-svg-e0")');
  });

  it('writes the region, the units, and the colour space of every filter of the instant', () => {
    const root = rendered(500_000);
    const grade = filterElement(root, 'svg-grade-e0');
    expect(grade.getAttribute('filterUnits')).toBe('userSpaceOnUse');
    expect(grade.getAttribute('primitiveUnits')).toBe('userSpaceOnUse');
    expect(grade.getAttribute('x')).toBe(String(-FILTER_REACH));
    expect(grade.getAttribute('width')).toBe(String(2 * FILTER_REACH));
    expect(grade.getAttribute('color-interpolation-filters')).toBe('sRGB');
    expect(filterElement(root, 'svg-group-image-e0').getAttribute('primitiveUnits')).toBe(
      'objectBoundingBox',
    );
  });

  it('writes curves as table transfers mixed in by the amount', () => {
    const root = rendered(500_000);
    expect([...filterElement(root, 'svg-curves-e0').children].map(shape)).toEqual([
      {
        tag: 'feComponentTransfer',
        attributes: { in: 'SourceGraphic', result: 'curves' },
        children: [
          {
            tag: 'feFuncR',
            attributes: { type: 'table', tableValues: '0 0.15 0.5 0.85 1' },
            children: [],
          },
          {
            tag: 'feFuncG',
            attributes: { type: 'table', tableValues: '0 0.15 0.5 0.85 1' },
            children: [],
          },
          {
            tag: 'feFuncB',
            attributes: { type: 'table', tableValues: '0.1 0.4 0.9' },
            children: [],
          },
        ],
      },
      {
        tag: 'feComposite',
        attributes: {
          in: 'curves',
          in2: 'SourceGraphic',
          operator: 'arithmetic',
          k1: '0',
          k2: '0.5',
          k3: '0.5',
          k4: '0',
        },
        children: [],
      },
    ]);
  });

  it('writes a colour grade as one matrix and a gamma transfer', () => {
    const effect: SvgEffectState = {
      id: 'g',
      kind: 'color-grade',
      lift: 0.1,
      gamma: 2,
      gain: 1.1,
      temperature: 0.4,
      tint: -0.4,
    };
    const svg = filtersOf([effect]);
    const [matrix, transfer] = [...filterElement(svg, 'g').children];
    // Red ×1.1, green ×1.1, blue ×0.9, then black to 0.1 and white to 1.1.
    expect(matrix?.getAttribute('values')).toBe(
      '1.1 0 0 0 0.1 0 1.1 0 0 0.1 0 0 0.9 0 0.1 0 0 0 1 0',
    );
    expect([...(transfer?.children ?? [])].map((func) => func.getAttribute('exponent'))).toEqual([
      '0.5',
      '0.5',
      '0.5',
    ]);
  });

  it('writes a glow under its holder, a vignette over the box, and a key by channel difference', () => {
    const svg = filtersOf([
      { id: 'glow', kind: 'glow', color: '#f79009', opacity: 0.9, radius: 6 },
      { id: 'vignette', kind: 'vignette', amount: 0.6, size: 0.5 },
      { id: 'key', kind: 'chroma-key', key: 'blue', tolerance: 0.2, softness: 0.25, spill: 0.5 },
    ]);
    const tags = (id: string): string[] =>
      [...filterElement(svg, id).children].map((child) => child.localName);
    expect(tags('glow')).toEqual(['feGaussianBlur', 'feFlood', 'feComposite', 'feMerge']);
    expect(filterElement(svg, 'glow').firstElementChild?.getAttribute('stdDeviation')).toBe('6');
    expect(tags('vignette')).toEqual([
      'feFlood',
      'feFlood',
      'feDiffuseLighting',
      'feComponentTransfer',
      'feMerge',
      'feComposite',
    ]);
    const light = filterElement(svg, 'vignette').querySelector('fePointLight');
    expect(light?.getAttribute('z')).toBe('0.5');
    const falloff = filterElement(svg, 'vignette').querySelector('feFuncR');
    expect(falloff?.getAttribute('amplitude')).toBe('0.6');
    expect(falloff?.getAttribute('offset')).toBe('0.4');
    const key = filterElement(svg, 'key');
    expect(tags('key')).toEqual([
      'feColorMatrix',
      'feComponentTransfer',
      'feColorMatrix',
      'feComposite',
      'feComposite',
    ]);
    // The blue channel less the mean of red and green, into alpha.
    expect(key.children[0]?.getAttribute('values')).toBe(
      '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -0.5 -0.5 1 0 0',
    );
    const matte = key.querySelector('feFuncA');
    expect(matte?.getAttribute('slope')).toBe('-4');
    expect(matte?.getAttribute('intercept')).toBe('1.8');
    // Spill multiplies blue by 1 − 0.5 · (B − (R + G) / 2).
    expect(key.children[2]?.getAttribute('values')).toBe(
      '0 0 0 0 1 0 0 0 0 1 0.25 0.25 -0.5 0 1 0 0 0 0 1',
    );
  });

  it('empties the filters of a scene the state does not evaluate', () => {
    const root = rendered(500_000, 1_400_000);
    const fresh = rendered(1_400_000);
    expect(filterElement(root, 'svg-curves-e0').childElementCount).toBe(0);
    expect(filterElement(root, 'svg-curves-e0').attributes).toHaveLength(1);
    expect(filterElement(root, 'kinds-image-curves-e0').childElementCount).toBe(2);
    expect(root.innerHTML).toBe(fresh.innerHTML);
  });

  it('leaves the same tree whatever was rendered before', () => {
    for (const timeUs of TIMES) {
      const direct = rendered(timeUs).innerHTML;
      expect(rendered(...shuffled(TIMES, timeUs), timeUs).innerHTML, String(timeUs)).toBe(direct);
    }
  });
});

/** A hidden svg with the filters of `effects`, written as `renderState` writes them. */
function filtersOf(effects: readonly SvgEffectState[]): Element {
  const root = createRoot();
  const document = root.ownerDocument;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const { id } of effects) {
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', `kadrion-effect-${id}`);
    svg.append(filter);
  }
  root.append(svg);
  writeEffectFilters(
    svg,
    new Map(effects.map((effect) => [`kadrion-effect-${effect.id}`, effect])),
  );
  return svg;
}
