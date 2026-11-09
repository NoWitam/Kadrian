/**
 * `readSvg`, the sanitiser of SVG assets (D74): the subset it accepts, the
 * hostile corpus it refuses with the code of each offence, and the parsers of
 * its values that `svgToShapes` uses.
 */
import { describe, expect, it } from 'vitest';

import {
  readSvg,
  svgColor,
  svgPaint,
  svgPathCommands,
  svgTransform,
  type SvgDrawing,
  type SvgError,
} from '../src/index.js';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

function svg(body: string, root = `${NS} width="100" height="50" viewBox="0 0 200 100"`): string {
  return `<svg ${root}>${body}</svg>`;
}

function accepted(source: string | Uint8Array): SvgDrawing {
  const reading = readSvg(source);
  if (!reading.ok)
    throw new Error(`${reading.error.code} ${reading.error.path}: ${reading.error.message}`);
  return reading.svg;
}

function refused(source: string | Uint8Array): SvgError {
  const reading = readSvg(source);
  if (reading.ok) throw new Error('The drawing was accepted.');
  return reading.error;
}

const BADGE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- A badge: every element of the subset. -->
<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="120" height="80" viewBox="0 0 120 80" preserveAspectRatio="xMidYMid meet">
  <title>Badge &amp; star</title>
  <desc>A test drawing</desc>
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7a5af8"/>
      <stop offset="100%" stop-color="rgb(238, 70, 188)" stop-opacity="0.5"/>
    </linearGradient>
    <radialGradient id="sun" cx="60" cy="40" r="30" gradientUnits="userSpaceOnUse" spreadMethod="pad">
      <stop offset="0.2" stop-color="yellow"/>
      <stop offset="1" stop-color="#f80"/>
    </radialGradient>
  </defs>
  <g transform="translate(4 4) scale(0.9)" opacity="0.8" stroke="#fff" stroke-width="2">
    <rect x="0" y="0" width="120" height="80" rx="8" fill="url(#sky)"/>
    <circle cx="60" cy="40" r="20" fill="url( #sun )" stroke-linecap="round"/>
    <ellipse cx="20" cy="20" rx="10" ry="5" fill="none" stroke-dasharray="4 2" stroke-dashoffset="1"/>
    <line x1="0" y1="80" x2="120" y2="0" stroke-linejoin="bevel" stroke-miterlimit="4"/>
    <polyline points="0,0 10,10 20,0" fill="none"/>
    <polygon points="60,10 70,30 50,30" fill="#0a0" fill-rule="evenodd" fill-opacity=".5"/>
    <path d="M10 10h20v20H10z m40 0 c5 0 10 5 10 10 s-5 10-10 10 q-5 0-5-5 t5-5 a5 5 0 1 0 10 0 A5,5 30 0,1 70,30 L 80 30" stroke-opacity="1"/>
  </g>
</svg>
`;

describe('readSvg accepts the subset (D74.4)', () => {
  it('reads every element of the subset, its size, and its view box', () => {
    const drawing = accepted(BADGE);
    expect(drawing.width).toBe(120);
    expect(drawing.height).toBe(80);
    expect(drawing.viewBox).toEqual({ x: 0, y: 0, width: 120, height: 80 });
    expect(drawing.root.name).toBe('svg');
    expect(drawing.root.children.map(({ name }) => name)).toEqual(['title', 'desc', 'defs', 'g']);
    const group = drawing.root.children[3];
    expect(group?.children.map(({ name }) => name)).toEqual([
      'rect',
      'circle',
      'ellipse',
      'line',
      'polyline',
      'polygon',
      'path',
    ]);
    expect(Object.isFrozen(drawing)).toBe(true);
    expect(Object.isFrozen(drawing.root.children)).toBe(true);
  });

  it('reads the same drawing from its UTF-8 bytes, with a byte order mark too', () => {
    const bytes = new TextEncoder().encode(`${String.fromCharCode(0xfeff)}${BADGE}`);
    expect(accepted(bytes)).toEqual(accepted(BADGE));
  });

  it('decodes the five entities and character references in attributes', () => {
    const drawing = accepted(svg('<g id="a&#x2D;b&#45;c"/>'));
    expect(drawing.root.children[0]?.attributes['id']).toBe('a-b-c');
  });

  it('takes px as user units and a viewBox with commas', () => {
    const drawing = accepted(`<svg ${NS} width="64px" height="32" viewBox="-10,-10, 20 ,10"/>`);
    expect(drawing).toMatchObject({ width: 64, height: 32 });
    expect(drawing.viewBox).toEqual({ x: -10, y: -10, width: 20, height: 10 });
  });
});

describe('readSvg refuses the hostile corpus with the code of each offence (D74.3)', () => {
  it.each([
    ['a script', svg('<script>alert(1)</script>'), 'svg-script', '/svg/script[0]'],
    [
      'a script in a group',
      svg('<g><rect width="1" height="1"/><script href="https://evil.example/x.js"/></g>'),
      'svg-script',
      '/svg/g[0]/script[0]',
    ],
    [
      'an event attribute',
      svg('<rect width="1" height="1" onclick="alert(1)"/>'),
      'svg-event-attribute',
      '/svg/rect[0]/@onclick',
    ],
    [
      'onload on the root',
      `<svg ${NS} onload="alert(1)" width="1" height="1" viewBox="0 0 1 1"/>`,
      'svg-event-attribute',
      '/svg/@onload',
    ],
    ['an upper-case event', svg('<g ONCLICK="x"/>'), 'svg-event-attribute', '/svg/g[0]/@ONCLICK'],
    [
      'a foreignObject',
      svg(
        '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
      ),
      'svg-foreign-object',
      '/svg/foreignObject[0]',
    ],
    [
      'xlink:href to the network',
      svg(
        '<image xlink:href="https://evil.example/pixel.png" width="1" height="1"/>',
        `${NS} xmlns:xlink="http://www.w3.org/1999/xlink" width="1" height="1" viewBox="0 0 1 1"`,
      ),
      'svg-external-reference',
      '/svg/image[0]/@xlink:href',
    ],
    [
      'an href of a gradient',
      svg('<linearGradient id="g" href="other.svg#g"/>'),
      'svg-external-reference',
      '/svg/linearGradient[0]/@href',
    ],
    [
      'a use of an internal id',
      svg('<use href="#a"/>'),
      'svg-external-reference',
      '/svg/use[0]/@href',
    ],
    [
      'CSS url() to the network',
      svg('<rect width="1" height="1" fill="url(https://evil.example/p.svg#g)"/>'),
      'svg-external-reference',
      '/svg/rect[0]/@fill',
    ],
    [
      'url() of a data URL',
      svg("<rect width='1' height='1' fill='url(\"data:image/svg+xml,x\")'/>"),
      'svg-external-reference',
      '/svg/rect[0]/@fill',
    ],
    [
      'url() in a filter',
      svg('<g filter="url(//evil.example/f)"/>'),
      'svg-external-reference',
      '/svg/g[0]/@filter',
    ],
    [
      'a style element',
      svg('<style>rect { fill: url(https://evil.example/x) }</style>'),
      'svg-style',
      '/svg/style[0]',
    ],
    [
      'a style attribute',
      svg('<rect width="1" height="1" style="fill:red"/>'),
      'svg-style',
      '/svg/rect[0]/@style',
    ],
    ['a class', svg('<rect class="a" width="1" height="1"/>'), 'svg-style', '/svg/rect[0]/@class'],
    [
      'SMIL animation',
      svg('<rect width="1" height="1"><animate attributeName="x" to="5" dur="1s"/></rect>'),
      'svg-animation',
      '/svg/rect[0]/animate[0]',
    ],
    ['set', svg('<set attributeName="fill" to="red"/>'), 'svg-animation', '/svg/set[0]'],
    [
      'a doctype with an entity',
      `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${svg('')}`,
      'svg-doctype',
      '',
    ],
    [
      'a style sheet',
      `<?xml-stylesheet href="https://evil.example/s.css"?>${svg('')}`,
      'svg-processing-instruction',
      '',
    ],
    ['a text element', svg('<text x="0" y="10">Hi</text>'), 'svg-element', '/svg/text[0]'],
    [
      'an image of a data URL without href',
      svg('<image width="1" height="1"/>'),
      'svg-element',
      '/svg/image[0]',
    ],
    [
      'a nested svg',
      svg(`<svg ${NS} width="1" height="1" viewBox="0 0 1 1"/>`),
      'svg-element',
      '/svg/svg[0]',
    ],
    [
      'an element of another namespace',
      svg('<sodipodi:namedview/>'),
      'svg-element',
      '/svg/sodipodi:namedview[0]',
    ],
    ['a filter', svg('<filter id="f"/>'), 'svg-element', '/svg/filter[0]'],
    ['a stop outside a gradient', svg('<stop offset="0"/>'), 'svg-element', '/svg/stop[0]'],
    [
      'an attribute outside the subset',
      svg('<rect width="1" height="1" mask="m"/>'),
      'svg-attribute',
      '/svg/rect[0]/@mask',
    ],
    [
      'an xmlns below the root',
      svg('<g xmlns="http://www.w3.org/2000/svg"/>'),
      'svg-attribute',
      '/svg/g[0]/@xmlns',
    ],
    [
      'currentColor',
      svg('<rect width="1" height="1" fill="currentColor"/>'),
      'svg-value',
      '/svg/rect[0]/@fill',
    ],
    [
      'a percentage length',
      svg('<rect width="50%" height="1"/>'),
      'svg-value',
      '/svg/rect[0]/@width',
    ],
    ['an em length', svg('<rect width="1em" height="1"/>'), 'svg-value', '/svg/rect[0]/@width'],
    ['path data without a move', svg('<path d="L 1 1"/>'), 'svg-value', '/svg/path[0]/@d'],
    ['broken path data', svg('<path d="M 1 1 L 2"/>'), 'svg-value', '/svg/path[0]/@d'],
    ['an opacity above 1', svg('<g opacity="2"/>'), 'svg-value', '/svg/g[0]/@opacity'],
    [
      'a transform outside the grammar',
      svg('<g transform="perspective(2)"/>'),
      'svg-value',
      '/svg/g[0]/@transform',
    ],
    [
      'a reference to no gradient',
      svg('<g id="a"/><rect width="1" height="1" fill="url(#a)"/>'),
      'svg-value',
      '/svg/rect[0]/@fill',
    ],
    ['a duplicate ID', svg('<g id="a"/><g id="a"/>'), 'svg-value', '/svg/g[1]/@id'],
    [
      'a root that is no svg',
      '<html xmlns="http://www.w3.org/1999/xhtml"/>',
      'svg-not-svg',
      '/html',
    ],
    [
      'a root without the namespace',
      '<svg width="1" height="1" viewBox="0 0 1 1"/>',
      'svg-not-svg',
      '/svg',
    ],
    ['no width', `<svg ${NS} height="1" viewBox="0 0 1 1"/>`, 'svg-size', '/svg/@width'],
    [
      'a width of a fraction',
      `<svg ${NS} width="1.5" height="1" viewBox="0 0 1 1"/>`,
      'svg-size',
      '/svg/@width',
    ],
    [
      'a width above 16 384',
      `<svg ${NS} width="16385" height="1" viewBox="0 0 1 1"/>`,
      'svg-size',
      '/svg/@width',
    ],
    ['no view box', `<svg ${NS} width="1" height="1"/>`, 'svg-size', '/svg/@viewBox'],
    [
      'an empty view box',
      `<svg ${NS} width="1" height="1" viewBox="0 0 0 1"/>`,
      'svg-size',
      '/svg/@viewBox',
    ],
    ['an unknown entity', svg('<g id="&nbsp;"/>'), 'svg-malformed', '/svg/g[0]/@id'],
    ['CDATA', svg('<title><![CDATA[x]]></title>'), 'svg-malformed', '/svg/title[0]'],
    [
      'an element that is not closed',
      `<svg ${NS} width="1" height="1" viewBox="0 0 1 1"><g>`,
      'svg-malformed',
      '/svg/g[0]',
    ],
    ['text in a group', svg('<g>hello</g>'), 'svg-malformed', '/svg/g[0]'],
    ['two roots', `${svg('')}${svg('')}`, 'svg-malformed', ''],
    [
      'an encoding other than UTF-8',
      `<?xml version="1.0" encoding="ISO-8859-1"?>${svg('')}`,
      'svg-encoding',
      '',
    ],
  ] as const)('%s', (_, source, code, path) => {
    const error = refused(source);
    expect({ code: error.code, path: error.path }).toEqual({ code, path });
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('refuses bytes that are not UTF-8, and a NUL', () => {
    expect(refused(new Uint8Array([0x3c, 0xff, 0x3e])).code).toBe('svg-encoding');
    expect(refused(new Uint8Array([0x3c, 0xc0, 0x80])).code).toBe('svg-encoding');
    expect(refused(svg('\u0000')).code).toBe('svg-encoding');
  });

  it('refuses a drawing beyond its bounds', () => {
    const many = svg('<g/>'.repeat(10_000));
    expect(refused(many).code).toBe('svg-too-large');
    const deep = svg(`${'<g>'.repeat(64)}${'</g>'.repeat(64)}`);
    expect(refused(deep).code).toBe('svg-too-large');
    expect(refused(new Uint8Array(1_000_001)).code).toBe('svg-too-large');
  });

  it('reports the first offence in document order', () => {
    const error = refused(svg('<rect width="1" height="1" mask="m" onclick="x"/><script/>'));
    expect(error).toMatchObject({ code: 'svg-event-attribute', path: '/svg/rect[0]/@onclick' });
  });
});

describe('the parsers of values (D74.5)', () => {
  it('makes path data absolute, with lines for H and V and reflected controls for S and T', () => {
    expect(svgPathCommands('m10 10 h20 v5 l-5 5 z')).toEqual([
      { kind: 'move', x: 10, y: 10 },
      { kind: 'line', x: 30, y: 10 },
      { kind: 'line', x: 30, y: 15 },
      { kind: 'line', x: 25, y: 20 },
      { kind: 'close' },
    ]);
    expect(svgPathCommands('M0 0 C 0 10 10 10 10 0 S 20 -10 20 0 Q 25 5 30 0 T 40 0')).toEqual([
      { kind: 'move', x: 0, y: 0 },
      { kind: 'cubic', x1: 0, y1: 10, x2: 10, y2: 10, x: 10, y: 0 },
      { kind: 'cubic', x1: 10, y1: -10, x2: 20, y2: -10, x: 20, y: 0 },
      { kind: 'quadratic', x1: 25, y1: 5, x: 30, y: 0 },
      { kind: 'quadratic', x1: 35, y1: -5, x: 40, y: 0 },
    ]);
  });

  it('reads arcs with packed flags, and lines after a move', () => {
    expect(svgPathCommands('M0,0 1,1a5 5 0 105 5')).toEqual([
      { kind: 'move', x: 0, y: 0 },
      { kind: 'line', x: 1, y: 1 },
      { kind: 'arc', rx: 5, ry: 5, rotation: 0, largeArc: true, sweep: false, x: 6, y: 6 },
    ]);
    expect(svgPathCommands('M0 0 z 5 5')).toBeNull();
  });

  it('reads transform lists as one matrix', () => {
    expect(svgTransform('translate(10) scale(2, 3)')).toEqual([2, 0, 0, 3, 10, 0]);
    expect(svgTransform('matrix(1 0 0 1 5 6)')).toEqual([1, 0, 0, 1, 5, 6]);
    const turned = svgTransform('rotate(90 10 10)') ?? [];
    expect(turned.map((value) => Math.round(value * 1e9) / 1e9)).toEqual([0, 1, -1, 0, 20, 0]);
    expect(svgTransform('scale()')).toBeNull();
  });

  it('reads colours and paints', () => {
    expect(svgColor('#ABC')).toBe('#aabbcc');
    expect(svgColor('rgb(255, 0, 16)')).toBe('#ff0010');
    expect(svgColor('Orange')).toBe('#ffa500');
    expect(svgColor('rgb(256, 0, 0)')).toBeNull();
    expect(svgColor('constructor')).toBeNull();
    expect(svgPaint('none')).toEqual({ kind: 'none' });
    expect(svgPaint('url(#g)')).toEqual({ kind: 'gradient', id: 'g' });
  });
});
