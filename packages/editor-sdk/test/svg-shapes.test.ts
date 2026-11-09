/**
 * `svgToShapes` (D74.5): the shape nodes of a drawing, placed in the box of
 * the options as an image node with `fill` would show it, inserted by `AddNode`
 * in one transaction; and the refusals of what a shape cannot state.
 */
import { describe, expect, it } from 'vitest';

import { createCommandBus, svgToShapes, type SvgToShapesOptions } from '../src/index.js';

import { codeOf, errorOf, reference } from './support.js';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const BOX: SvgToShapesOptions = {
  idPrefix: 'logo',
  x: 100,
  y: 50,
  width: 200,
  height: 100,
  startUs: 0,
  durationUs: 1_000_000,
};

function drawing(body: string, root = 'width="100" height="50" viewBox="0 0 100 50"'): string {
  return `<svg ${NS} ${root}>${body}</svg>`;
}

describe('svgToShapes (D74.5)', () => {
  it('maps the view box onto the box and gives each shape a box around itself', () => {
    const [node, ...rest] = svgToShapes(
      drawing('<rect x="10" y="5" width="20" height="10" fill="#ff8800"/>'),
      BOX,
    );
    expect(rest).toEqual([]);
    expect(node).toEqual({
      id: 'logo-1',
      type: 'shape',
      startUs: 0,
      durationUs: 1_000_000,
      position: { x: 120, y: 60 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      origin: { x: 500, y: 500 },
      opacity: 1,
      animations: [],
      width: 40,
      height: 20,
      geometry: {
        kind: 'path',
        fillRule: 'nonzero',
        commands: [
          { kind: 'move', x: 0, y: 0 },
          { kind: 'line', x: 40, y: 0 },
          { kind: 'line', x: 40, y: 20 },
          { kind: 'line', x: 0, y: 20 },
          { kind: 'close' },
        ],
      },
      fill: { kind: 'solid', color: '#ff8800' },
      stroke: { color: '#000000', width: 0, dash: [], cap: 'butt', join: 'miter' },
      trim: { start: 0, end: 1000 },
      effects: [],
    });
  });

  it('centres a drawing of another aspect ratio, as meet does, and fills the box under none', () => {
    const square = 'width="10" height="10" viewBox="0 0 10 10"';
    const [met] = svgToShapes(drawing('<rect width="10" height="10"/>', square), BOX);
    expect(met).toMatchObject({ position: { x: 150, y: 50 }, width: 100, height: 100 });
    const [stretched] = svgToShapes(
      drawing('<rect width="10" height="10"/>', `${square} preserveAspectRatio="none"`),
      BOX,
    );
    expect(stretched).toMatchObject({ position: { x: 100, y: 50 }, width: 200, height: 100 });
  });

  it('inherits paint from groups, multiplies their opacity, and keeps arcs under a similarity', () => {
    const nodes = svgToShapes(
      drawing(
        '<g fill="none" stroke="red" stroke-width="2" opacity="0.5" transform="rotate(90 50 25)"><circle cx="50" cy="25" r="10" stroke-linecap="round"/><path d="M0 0 l10 0" opacity="0.5"/></g>',
      ),
      BOX,
    );
    expect(nodes.map(({ id }) => id)).toEqual(['logo-1', 'logo-2']);
    const [circle, line] = nodes;
    expect(circle).toMatchObject({
      opacity: 0.5,
      fill: { kind: 'none' },
      stroke: { color: '#ff0000', width: 4, cap: 'round', join: 'miter' },
    });
    if (circle?.geometry.kind !== 'path') throw new Error('Not a path.');
    expect(circle.geometry.commands.map(({ kind }) => kind)).toEqual([
      'move',
      'arc',
      'arc',
      'close',
    ]);
    expect(circle.geometry.commands[1]).toMatchObject({ rx: 20, ry: 20, rotation: 90 });
    expect(line?.opacity).toBe(0.25);
  });

  it('turns arcs into cubic curves under a skew, and fills along them', () => {
    const [node] = svgToShapes(
      drawing('<ellipse cx="50" cy="25" rx="20" ry="10" transform="skewX(20)"/>'),
      BOX,
    );
    if (node?.geometry.kind !== 'path') throw new Error('Not a path.');
    expect(new Set(node.geometry.commands.map(({ kind }) => kind))).toEqual(
      new Set(['move', 'cubic', 'close']),
    );
  });

  it('converts a gradient of user space into the box of its shape', () => {
    const [node] = svgToShapes(
      drawing(
        '<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0"><stop offset="0" stop-color="#000"/><stop offset="50%" stop-color="#fff" stop-opacity="0.5"/></linearGradient></defs><rect x="0" y="0" width="100" height="50" fill="url(#g)"/>',
      ),
      BOX,
    );
    expect(node?.fill).toEqual({
      kind: 'linear-gradient',
      start: { x: 0, y: 0 },
      end: { x: 200, y: 0 },
      stops: [
        { offset: 0, color: '#000000', opacity: 1 },
        { offset: 500, color: '#ffffff', opacity: 0.5 },
      ],
    });
  });

  it('leaves out what draws nothing', () => {
    expect(
      svgToShapes(
        drawing(
          '<rect width="0" height="5"/><circle r="5" fill="none"/><line x2="5" y2="5"/><title>x</title>',
        ),
        BOX,
      ),
    ).toEqual([]);
  });

  it('gives nodes the bus inserts in one transaction, undone in one step', () => {
    const nodes = svgToShapes(
      drawing(
        '<rect x="5" y="5" width="40" height="20" rx="4" fill="#0af" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><polygon points="60,40 80,10 95,40" fill="#fa0" fill-rule="evenodd"/><path d="M10 45 Q 50 30 90 45 T 95 48" fill="none" stroke="#222"/>',
      ),
      BOX,
    );
    const bus = createCommandBus(reference());
    bus.dispatchTransaction(
      nodes.map((node, index) => ({
        type: 'AddNode',
        parentId: 'scene-main',
        index: index + 1,
        node,
      })),
    );
    const ids = bus.getDocument().scenes[0]?.nodes.map(({ id }) => id);
    expect(ids?.slice(1, 4)).toEqual(['logo-1', 'logo-2', 'logo-3']);
    bus.undo();
    expect(bus.getDocument().scenes[0]?.nodes.map(({ id }) => id)).not.toContain('logo-1');
  });

  it.each([
    [
      'dashes in user units',
      '<rect width="10" height="10" fill="none" stroke="#000" stroke-dasharray="2 1"/>',
    ],
    ['another miter limit', '<rect width="10" height="10" stroke="#000" stroke-miterlimit="8"/>'],
    [
      'a stroke scaled unevenly',
      '<rect width="10" height="10" stroke="#000" transform="scale(2 1)"/>',
    ],
    [
      'a gradient of a bounding box',
      '<linearGradient id="g"><stop offset="0"/><stop offset="1"/></linearGradient><rect width="10" height="10" fill="url(#g)"/>',
    ],
    [
      'a gradient with one stop',
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0"><stop offset="0"/></linearGradient><rect width="10" height="10" fill="url(#g)"/>',
    ],
    [
      'a stroke of a gradient',
      '<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0"><stop offset="0"/><stop offset="1"/></linearGradient><rect width="10" height="10" fill="none" stroke="url(#g)"/>',
    ],
    ['two opacities', '<rect width="10" height="10" stroke="#000" fill-opacity="0.5"/>'],
  ])('refuses %s with svg-not-convertible, naming the element', (_, body) => {
    const error = errorOf(() => svgToShapes(drawing(body), BOX));
    expect(error.code).toBe('svg-not-convertible');
    expect(error.details).toEqual(['/svg/rect[0]']);
  });

  it('refuses what the sanitiser refuses, with its code and path', () => {
    const error = errorOf(() => svgToShapes(drawing('<rect onclick="x"/>'), BOX));
    expect(error.code).toBe('svg-refused');
    expect(error.details).toEqual(['svg-event-attribute', '/svg/rect[0]/@onclick']);
  });

  it('refuses options out of shape', () => {
    const svg = drawing('');
    expect(codeOf(() => svgToShapes(svg, { ...BOX, idPrefix: 'a b' }))).toBe('invalid-argument');
    expect(codeOf(() => svgToShapes(svg, { ...BOX, width: 0 }))).toBe('invalid-argument');
    expect(codeOf(() => svgToShapes(svg, { ...BOX, durationUs: 0.5 }))).toBe('invalid-argument');
  });
});
