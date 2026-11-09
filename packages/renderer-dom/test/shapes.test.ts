/**
 * Shapes in the rendered tree (D73): one `<svg>` in the node's box that lets
 * its drawing leave the box, the gradient of a gradient fill in its `<defs>`,
 * and one `<path>` whose data, fill, and stroke are those of the instant; a
 * trimmed or dashed stroke drawn by a dash array over a `pathLength` of 1000;
 * no stroke at all where it draws nothing; and the same tree whatever was
 * rendered before. The times are those of the composition of shapes.
 */
import { evaluateComposition } from '@kadrion/runtime';
import { shapesComposition, shapesGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { mountComposition, renderState } from '../src/index.js';
import { gradientId, pathData, SHAPE_ATTRIBUTE } from '../src/shapes.js';
import { createRoot, elementOf, shuffled, TRUSTED, validated } from './support.js';

const composition = validated(shapesComposition);
const TIMES = [...shapesGoldenTimestamps.map(({ timeUs }) => timeUs), 600_000, 1_599_999];

function rendered(...times: number[]): HTMLElement {
  const root = createRoot();
  mountComposition(root, composition, {}, TRUSTED);
  for (const timeUs of times) renderState(root, evaluateComposition(composition, timeUs));
  return root;
}

function svgOf(root: HTMLElement, id: string): SVGElement {
  const svg = elementOf(root, id).querySelector<SVGElement>(`:scope > [${SHAPE_ATTRIBUTE}]`);
  if (svg === null) throw new Error(`No svg of ${id}.`);
  return svg;
}

function pathOf(root: HTMLElement, id: string): SVGElement {
  const path = svgOf(root, id).querySelector<SVGElement>(':scope > path');
  if (path === null) throw new Error(`No path of ${id}.`);
  return path;
}

function attributes(element: Element): Record<string, string> {
  return Object.fromEntries([...element.attributes].map(({ name, value }) => [name, value]));
}

describe('the path data of a shape (D73)', () => {
  it('writes absolute commands, every number by Number::toString', () => {
    expect(
      pathData([
        { kind: 'move', x: 0, y: 0.5 },
        { kind: 'line', x: -1, y: 2 },
        { kind: 'cubic', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 },
        { kind: 'quadratic', x1: 1, y1: 2, x: 3, y: 4 },
        { kind: 'arc', rx: 5, ry: 6, rotation: 30, largeArc: true, sweep: false, x: 7, y: 8 },
        { kind: 'close' },
      ]),
    ).toBe('M 0 0.5 L -1 2 C 1 2 3 4 5 6 Q 1 2 3 4 A 5 6 30 1 0 7 8 Z');
  });
});

describe('the mount of a shape (D73)', () => {
  it('builds one svg as large as the box that shows what lies outside it', () => {
    const root = rendered();
    const svg = svgOf(root, 'shape-star');
    expect(attributes(svg)).toMatchObject({ width: '100%', height: '100%' });
    expect(svg.getAttribute('style')).toBe(
      'position: absolute; left: 0px; top: 0px; overflow: visible;',
    );
    expect([...svg.children].map(({ localName }) => localName)).toEqual(['path']);
    expect(attributes(pathOf(root, 'shape-star'))).toEqual({ 'fill-rule': 'nonzero' });
    expect(pathOf(root, 'shape-morph').getAttribute('fill-rule')).toBe('evenodd');
  });

  it('puts a linear gradient in the pixels of the box in its defs, its offsets in fractions', () => {
    const svg = svgOf(rendered(), 'shape-rect');
    const gradient = svg.querySelector('defs > linearGradient');
    expect(gradient === null ? null : attributes(gradient)).toEqual({
      id: gradientId('shape-rect'),
      gradientUnits: 'userSpaceOnUse',
      x1: '0',
      y1: '0',
      x2: '160',
      y2: '100',
    });
    expect([...(gradient?.children ?? [])].map(attributes)).toEqual([
      { offset: '0', 'stop-color': '#7a5af8', 'stop-opacity': '1' },
      { offset: '0.5', 'stop-color': '#ee46bc', 'stop-opacity': '1' },
      { offset: '1', 'stop-color': '#fdb022', 'stop-opacity': '0.6' },
    ]);
  });

  it('puts a radial gradient there too', () => {
    const gradient = svgOf(rendered(), 'shape-ellipse').querySelector('defs > radialGradient');
    expect(gradient === null ? null : attributes(gradient)).toEqual({
      id: 'kadrion-shape-shape-ellipse-fill',
      gradientUnits: 'userSpaceOnUse',
      cx: '56',
      cy: '45',
      r: '80',
    });
  });
});

describe('a shape rendered at one instant (D73)', () => {
  it('writes the size of its box, its path data, and its fill', () => {
    const root = rendered(1_000_000);
    const rect = elementOf(root, 'shape-rect');
    expect(rect.style.getPropertyValue('width')).toBe('200px');
    expect(rect.style.getPropertyValue('height')).toBe('120px');
    expect(pathOf(root, 'shape-rect').getAttribute('d')).toBe(
      'M 60 0 L 140 0 A 60 60 0 0 1 200 60 A 60 60 0 0 1 140 120 L 60 120 A 60 60 0 0 1 0 60 A 60 60 0 0 1 60 0 Z',
    );
    expect(pathOf(root, 'shape-rect').getAttribute('fill')).toBe(
      'url(#kadrion-shape-shape-rect-fill)',
    );
    expect(pathOf(root, 'shape-star').getAttribute('fill')).toBe('#12b76a');
    expect(pathOf(root, 'shape-line').getAttribute('fill')).toBe('none');
  });

  it('writes a stroke without dashes with no dash array', () => {
    expect(attributes(pathOf(rendered(0), 'shape-ellipse'))).toMatchObject({
      stroke: '#d1e9ff',
      'stroke-width': '4',
      'stroke-linecap': 'butt',
      'stroke-linejoin': 'miter',
      'stroke-miterlimit': '4',
    });
    const path = pathOf(rendered(0), 'shape-ellipse');
    for (const name of ['pathLength', 'stroke-dasharray', 'stroke-dashoffset']) {
      expect(path.hasAttribute(name), name).toBe(false);
    }
  });

  it('draws a trimmed stroke by a dash array over a path length of 1000', () => {
    expect(attributes(pathOf(rendered(500_000), 'shape-line'))).toMatchObject({
      pathLength: '1000',
      'stroke-dasharray': '500 1000',
      'stroke-dashoffset': '-250',
    });
  });

  it('writes no stroke where it draws nothing, so no cap shows (D65.5)', () => {
    const path = pathOf(rendered(0), 'shape-star');
    expect(path.getAttribute('stroke')).toBe('none');
    for (const name of ['stroke-width', 'stroke-linecap', 'pathLength', 'stroke-dasharray']) {
      expect(path.hasAttribute(name), name).toBe(false);
    }
  });

  it('renders the tree of a fresh mount at a state, whatever was rendered before (D54.3)', () => {
    for (const timeUs of TIMES) {
      const fresh = rendered(timeUs).innerHTML;
      expect(rendered(...shuffled(TIMES, timeUs), timeUs).innerHTML, String(timeUs)).toBe(fresh);
    }
  });
});
