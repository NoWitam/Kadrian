/**
 * The SVG assets of schema 0.19 (D74): `readSvg`, the sanitiser of Kadrion's
 * own that the command bus, the Player, and the Producer use alike. It is a
 * pure function of the bytes: it parses them as XML with a parser of its own,
 * accepts a closed subset of SVG — shapes, paths, groups, and linear and
 * radial gradients painted by presentation attributes — and refuses anything
 * else with one typed error that names the first offence in document order.
 * It never strips: a document must not render something other than what its
 * bytes say (D74.2). What it accepts runs no script and loads nothing, shown
 * as an image or not.
 *
 * The parsers of its values (`svgPathCommands`, `svgTransform`, `svgPaint`,
 * and `svgLength`) are exported for `svgToShapes` of `@kadrion/editor-sdk`,
 * which turns an accepted drawing into shape nodes (D73, D74.5).
 */

/** Why `readSvg` refused the bytes (D74.3). */
export type SvgErrorCode =
  /** The bytes are not UTF-8, or hold a NUL. */
  | 'svg-encoding'
  /** The bytes are not well-formed XML of the form the reader accepts. */
  | 'svg-malformed'
  /** A document type declaration, which may declare entities and reach other files. */
  | 'svg-doctype'
  /** A processing instruction other than the XML declaration, such as a style sheet. */
  | 'svg-processing-instruction'
  /** The root is not an `<svg>` element of the SVG namespace. */
  | 'svg-not-svg'
  /** A `<script>` element. */
  | 'svg-script'
  /** A `<foreignObject>` element, which embeds HTML. */
  | 'svg-foreign-object'
  /** CSS: a `<style>` element, a `style` attribute, or a `class`. */
  | 'svg-style'
  /** An event attribute, such as `onload` or `onclick`. */
  | 'svg-event-attribute'
  /** A reference that leaves the document: `href`, `xlink:href`, or `url()` not of the form `url(#id)`. */
  | 'svg-external-reference'
  /** SMIL animation: `animate`, `animateMotion`, `animateTransform`, `set`, `mpath`, or `discard`. */
  | 'svg-animation'
  /** An element outside the subset, nested `<svg>` included. */
  | 'svg-element'
  /** An attribute outside the subset of its element. */
  | 'svg-attribute'
  /** An attribute of the subset with a value outside its grammar or its bounds. */
  | 'svg-value'
  /** The root lacks a whole `width` and `height` from 1 to 16 384, or a `viewBox` of positive size. */
  | 'svg-size'
  /** More than 1 000 000 bytes, 10 000 elements, or a depth of 64. */
  | 'svg-too-large';

/** The first offence of the bytes, in document order (D74.3). */
export interface SvgError {
  readonly code: SvgErrorCode;
  readonly message: string;
  /**
   * Where it lies: the element path from the root, each step its name and its
   * index among its parent's elements, and `@name` for an attribute, such as
   * `/svg/g[0]/path[2]/@onclick`; `''` for the bytes as a whole.
   */
  readonly path: string;
}

/** The names of the elements of the subset (D74.4). */
export type SvgElementName =
  | 'svg'
  | 'g'
  | 'defs'
  | 'title'
  | 'desc'
  | 'path'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'polyline'
  | 'polygon'
  | 'linearGradient'
  | 'radialGradient'
  | 'stop';

/** An element of an accepted drawing, its attributes as written, entities decoded. */
export interface SvgElement {
  readonly name: SvgElementName;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly SvgElement[];
}

/** The box of user space a drawing shows (SVG `viewBox`). */
export interface SvgViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A drawing `readSvg` accepted: its natural size, its view box, and its tree. */
export interface SvgDrawing {
  /** The natural width in pixels, the root's `width`: an integer from 1 to 16 384. */
  readonly width: number;
  /** The natural height in pixels, the root's `height`: an integer from 1 to 16 384. */
  readonly height: number;
  readonly viewBox: SvgViewBox;
  readonly root: SvgElement;
}

/** What `readSvg` returns. */
export type SvgReading =
  | { readonly ok: true; readonly svg: SvgDrawing }
  | { readonly ok: false; readonly error: SvgError };

/** One absolute command of SVG path data, in the closed form of D73. */
export type SvgPathCommand =
  | { readonly kind: 'move'; readonly x: number; readonly y: number }
  | { readonly kind: 'line'; readonly x: number; readonly y: number }
  | {
      readonly kind: 'cubic';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'quadratic';
      readonly x1: number;
      readonly y1: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'arc';
      readonly rx: number;
      readonly ry: number;
      readonly rotation: number;
      readonly largeArc: boolean;
      readonly sweep: boolean;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: 'close' };

/** An affine matrix `[a, b, c, d, e, f]`, as SVG `matrix(a b c d e f)`. */
export type SvgMatrix = readonly [number, number, number, number, number, number];

/** A paint of `fill` or `stroke`: none, a colour `#rrggbb`, or a gradient of the drawing. */
export type SvgPaint =
  | { readonly kind: 'none' }
  | { readonly kind: 'color'; readonly color: string }
  | { readonly kind: 'gradient'; readonly id: string };

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

/** The bounds of what `readSvg` reads (D74.4). */
const MAX_BYTES = 1_000_000;
const MAX_ELEMENTS = 10_000;
const MAX_DEPTH = 64;
const MAX_SIZE = 16_384;
/** The bound of every number of a drawing, as of a coordinate of a shape (D73). */
const MAX_NUMBER = 1_000_000;

const ANIMATION: readonly string[] = Object.freeze([
  'animate',
  'animateMotion',
  'animateTransform',
  'set',
  'mpath',
  'discard',
]);

/** Presentation attributes the subset accepts on `svg`, `g`, and every shape. */
const PRESENTATION = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
] as const;

const GRADIENT = ['id', 'gradientUnits', 'gradientTransform', 'spreadMethod'] as const;

/** The attributes of each element of the subset (D74.4). */
const ATTRIBUTES: Readonly<Record<SvgElementName, ReadonlySet<string>>> = {
  svg: new Set([
    'xmlns',
    'xmlns:xlink',
    'version',
    'width',
    'height',
    'viewBox',
    'preserveAspectRatio',
    'id',
    ...PRESENTATION,
  ]),
  g: new Set(['id', 'transform', ...PRESENTATION]),
  defs: new Set(['id']),
  title: new Set(['id']),
  desc: new Set(['id']),
  path: new Set(['id', 'transform', 'd', ...PRESENTATION]),
  rect: new Set(['id', 'transform', 'x', 'y', 'width', 'height', 'rx', 'ry', ...PRESENTATION]),
  circle: new Set(['id', 'transform', 'cx', 'cy', 'r', ...PRESENTATION]),
  ellipse: new Set(['id', 'transform', 'cx', 'cy', 'rx', 'ry', ...PRESENTATION]),
  line: new Set(['id', 'transform', 'x1', 'y1', 'x2', 'y2', ...PRESENTATION]),
  polyline: new Set(['id', 'transform', 'points', ...PRESENTATION]),
  polygon: new Set(['id', 'transform', 'points', ...PRESENTATION]),
  linearGradient: new Set([...GRADIENT, 'x1', 'y1', 'x2', 'y2']),
  radialGradient: new Set([...GRADIENT, 'cx', 'cy', 'r', 'fx', 'fy']),
  stop: new Set(['id', 'offset', 'stop-color', 'stop-opacity']),
};

/** The elements each element may hold; `title` and `desc` hold text only. */
const CHILDREN: Readonly<Record<SvgElementName, ReadonlySet<SvgElementName>>> = (() => {
  const graphics: SvgElementName[] = [
    'g',
    'defs',
    'title',
    'desc',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'linearGradient',
    'radialGradient',
  ];
  const shape = new Set<SvgElementName>(['title', 'desc']);
  return {
    svg: new Set(graphics),
    g: new Set(graphics),
    defs: new Set(graphics),
    title: new Set(),
    desc: new Set(),
    path: shape,
    rect: shape,
    circle: shape,
    ellipse: shape,
    line: shape,
    polyline: shape,
    polygon: shape,
    linearGradient: new Set(['stop', 'title', 'desc']),
    radialGradient: new Set(['stop', 'title', 'desc']),
    stop: new Set(),
  };
})();

/** The colour keywords the subset accepts, as `#rrggbb` (CSS Color 4). */
const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  navy: '#000080',
  purple: '#800080',
  teal: '#008080',
  orange: '#ffa500',
};

class Refusal extends Error {
  readonly code: SvgErrorCode;
  readonly path: string;

  constructor(code: SvgErrorCode, message: string, path: string) {
    super(message);
    this.code = code;
    this.path = path;
  }
}

function refuse(code: SvgErrorCode, message: string, path: string): never {
  throw new Refusal(code, message, path);
}

/** An element as the XML reader builds it, before the subset is checked. */
interface RawElement {
  readonly name: string;
  readonly attributes: [string, string][];
  readonly children: RawElement[];
  text: string;
  readonly path: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/;
const SPACE = /^[ \t\r\n]*/;

/** Decodes the five predefined entities and character references; any other is malformed. */
function decodeEntities(text: string, path: string): string {
  return text.replace(/&([^;&]*);?/g, (match, body: string) => {
    if (!match.endsWith(';'))
      refuse('svg-malformed', 'An ampersand that starts no reference.', path);
    switch (body) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
    }
    const code = /^#x[0-9A-Fa-f]{1,6}$/.test(body)
      ? Number.parseInt(body.slice(2), 16)
      : /^#[0-9]{1,7}$/.test(body)
        ? Number.parseInt(body.slice(1), 10)
        : -1;
    if (code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      refuse(
        'svg-malformed',
        `The reference &${body}; is not a character or one of the five entities of XML.`,
        path,
      );
    }
    return String.fromCodePoint(code);
  });
}

/**
 * Reads the text as XML into a tree of raw elements: an optional XML
 * declaration, comments, elements, attributes, and text. A doctype, a
 * processing instruction, and CDATA are refused where they stand.
 */
function parseXml(text: string): RawElement {
  let at = 0;
  let elements = 0;
  const rest = (): string => text.slice(at, at + 64);
  const skipSpace = (): void => {
    at += SPACE.exec(text.slice(at))?.[0].length ?? 0;
  };
  const expect = (literal: string, path: string): void => {
    if (!text.startsWith(literal, at)) {
      refuse('svg-malformed', `Expected ${JSON.stringify(literal)} at offset ${String(at)}.`, path);
    }
    at += literal.length;
  };
  /** Comments, white space, and refusals between elements; `inside` is the path of the parent. */
  const misc = (path: string): void => {
    for (;;) {
      skipSpace();
      if (text.startsWith('<!--', at)) {
        const end = text.indexOf('-->', at + 4);
        if (end < 0) refuse('svg-malformed', 'A comment that does not end.', path);
        at = end + 3;
      } else if (text.startsWith('<!DOCTYPE', at) || text.startsWith('<!doctype', at)) {
        refuse(
          'svg-doctype',
          'A document type declaration may declare entities and reach other files.',
          path,
        );
      } else if (text.startsWith('<![CDATA[', at)) {
        refuse('svg-malformed', 'CDATA sections are not read.', path);
      } else if (text.startsWith('<?', at)) {
        const target = NAME.exec(text.slice(at + 2))?.[0] ?? '';
        refuse(
          'svg-processing-instruction',
          `The processing instruction <?${target} …?> is refused${target === 'xml-stylesheet' ? ': it loads a style sheet' : ''}.`,
          path,
        );
      } else {
        return;
      }
    }
  };
  const element = (path: string, depth: number): RawElement => {
    expect('<', path);
    const name = NAME.exec(text.slice(at))?.[0];
    if (name === undefined)
      refuse('svg-malformed', `An element without a name: ${JSON.stringify(rest())}.`, path);
    at += name.length;
    elements += 1;
    if (elements > MAX_ELEMENTS)
      refuse('svg-too-large', `More than ${String(MAX_ELEMENTS)} elements.`, path);
    if (depth > MAX_DEPTH)
      refuse('svg-too-large', `Elements nested deeper than ${String(MAX_DEPTH)}.`, path);
    const raw: RawElement = { name, attributes: [], children: [], text: '', path };
    const seen = new Set<string>();
    for (;;) {
      const before = at;
      skipSpace();
      if (text.startsWith('/>', at)) {
        at += 2;
        return raw;
      }
      if (text.startsWith('>', at)) {
        at += 1;
        break;
      }
      if (at === before)
        refuse('svg-malformed', `Expected white space before an attribute of <${name}>.`, path);
      const attribute = NAME.exec(text.slice(at))?.[0];
      if (attribute === undefined)
        refuse('svg-malformed', `A malformed attribute of <${name}>.`, path);
      at += attribute.length;
      skipSpace();
      expect('=', `${path}/@${attribute}`);
      skipSpace();
      const quote = text[at];
      if (quote !== '"' && quote !== "'") {
        refuse(
          'svg-malformed',
          `The value of ${attribute} is not quoted.`,
          `${path}/@${attribute}`,
        );
      }
      const end = text.indexOf(quote, at + 1);
      if (end < 0)
        refuse('svg-malformed', `The value of ${attribute} does not end.`, `${path}/@${attribute}`);
      const value = text.slice(at + 1, end);
      if (value.includes('<')) {
        refuse('svg-malformed', `The value of ${attribute} holds a "<".`, `${path}/@${attribute}`);
      }
      at = end + 1;
      if (seen.has(attribute)) {
        refuse(
          'svg-malformed',
          `The attribute ${attribute} is given twice.`,
          `${path}/@${attribute}`,
        );
      }
      seen.add(attribute);
      raw.attributes.push([attribute, decodeEntities(value, `${path}/@${attribute}`)]);
    }
    const counts = new Map<string, number>();
    for (;;) {
      const next = text.indexOf('<', at);
      if (next < 0) refuse('svg-malformed', `The element <${name}> does not end.`, path);
      raw.text += decodeEntities(text.slice(at, next), path);
      at = next;
      if (text.startsWith('</', at)) {
        at += 2;
        const closing = NAME.exec(text.slice(at))?.[0];
        if (closing !== name) {
          refuse('svg-malformed', `<${name}> is closed by </${closing ?? ''}>.`, path);
        }
        at += closing.length;
        skipSpace();
        expect('>', path);
        return raw;
      }
      if (text.startsWith('<!--', at) || text.startsWith('<!', at) || text.startsWith('<?', at)) {
        misc(path);
        continue;
      }
      const childName = NAME.exec(text.slice(at + 1))?.[0] ?? '';
      const index = counts.get(childName) ?? 0;
      counts.set(childName, index + 1);
      raw.children.push(element(`${path}/${childName}[${String(index)}]`, depth + 1));
    }
  };

  if (text.startsWith('<?xml', at) && /^<\?xml[ \t\r\n]/.test(text.slice(at, at + 6))) {
    const end = text.indexOf('?>', at);
    if (end < 0) refuse('svg-malformed', 'The XML declaration does not end.', '');
    const declaration = text.slice(at, end);
    const encoding = /encoding[ \t\r\n]*=[ \t\r\n]*["']([^"']*)["']/.exec(declaration)?.[1];
    if (encoding !== undefined && encoding.toLowerCase() !== 'utf-8') {
      refuse('svg-encoding', `The declared encoding ${encoding} is not UTF-8.`, '');
    }
    at = end + 2;
  }
  misc('');
  if (!text.startsWith('<', at)) refuse('svg-malformed', 'The document holds no element.', '');
  const rootName = NAME.exec(text.slice(at + 1))?.[0] ?? '';
  const root = element(`/${rootName}`, 1);
  misc('');
  if (at !== text.length) refuse('svg-malformed', 'Something follows the root element.', '');
  return root;
}

/** The SVG number grammar, without units. */
const NUMBER = /^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

/** A number of the subset: finite and within ±1 000 000. */
function numberOf(value: string, path: string, what: string): number {
  const trimmed = value.trim();
  const parsed = NUMBER.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_NUMBER) {
    refuse(
      'svg-value',
      `${what} must be a number within ±1 000 000, not ${JSON.stringify(value)}.`,
      path,
    );
  }
  return parsed === 0 ? 0 : parsed;
}

/** A length in user units: a number, or a number of `px`; percentages and other units are refused. */
export function svgLength(value: string): number | null {
  const trimmed = value.trim().replace(/px$/, '');
  if (!NUMBER.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && Math.abs(parsed) <= MAX_NUMBER
    ? parsed === 0
      ? 0
      : parsed
    : null;
}

function lengthOf(value: string, path: string, what: string, minimum = -MAX_NUMBER): number {
  const parsed = svgLength(value);
  if (parsed === null || parsed < minimum) {
    refuse(
      'svg-value',
      `${what} must be a length in user units${minimum === 0 ? ' from 0' : ''}, not ${JSON.stringify(value)}.`,
      path,
    );
  }
  return parsed;
}

/** A list of numbers separated by white space or one comma. */
function numberList(value: string): number[] | null {
  const trimmed = value.trim();
  if (trimmed === '') return [];
  const parts = trimmed.split(/[ \t\r\n]*,[ \t\r\n]*|[ \t\r\n]+/);
  const numbers = parts.map((part) => (NUMBER.test(part) ? Number(part) : Number.NaN));
  return numbers.every((number) => Number.isFinite(number) && Math.abs(number) <= MAX_NUMBER)
    ? numbers.map((number) => (number === 0 ? 0 : number))
    : null;
}

/** The paint of `fill` or `stroke`, or `null` when it is outside the subset. */
export function svgPaint(value: string): SvgPaint | null {
  const trimmed = value.trim();
  if (trimmed === 'none') return { kind: 'none' };
  const reference = /^url\(\s*#([A-Za-z_][A-Za-z0-9_.-]*)\s*\)$/.exec(trimmed);
  if (reference?.[1] !== undefined) return { kind: 'gradient', id: reference[1] };
  const color = svgColor(trimmed);
  return color === null ? null : { kind: 'color', color };
}

/** A colour as `#rrggbb`: `#rgb`, `#rrggbb`, `rgb(r, g, b)` of integers, or a keyword of the subset. */
export function svgColor(value: string): string | null {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(lower)) return lower;
  if (/^#[0-9a-f]{3}$/.test(lower)) {
    return lower.replace(/[0-9a-f]/g, (digit) => digit + digit);
  }
  const rgb = /^rgb\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)$/.exec(lower);
  if (rgb !== null) {
    const channels = rgb.slice(1, 4).map(Number);
    if (channels.some((channel) => channel > 255)) return null;
    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }
  return Object.hasOwn(NAMED_COLORS, lower) ? (NAMED_COLORS[lower] ?? null) : null;
}

/** Multiplies two affine matrices: `a` then `b` applied to a point is `multiply(b, a)`… here `a · b`. */
export function svgMultiply(a: SvgMatrix, b: SvgMatrix): SvgMatrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export const SVG_IDENTITY: SvgMatrix = [1, 0, 0, 1, 0, 0];

/** The matrix of a `transform` list, or `null` when it is outside the grammar. */
export function svgTransform(value: string): SvgMatrix | null {
  let rest = value.trim();
  let matrix = SVG_IDENTITY;
  while (rest !== '') {
    const call = /^([A-Za-z]+)\s*\(([^)]*)\)\s*,?\s*/.exec(rest);
    if (call === null) return null;
    const name = call[1] ?? '';
    const args = numberList(call[2] ?? '');
    if (args === null) return null;
    const [p = 0, q = 0, r = 0, s = 0, t = 0, u = 0] = args;
    let step: SvgMatrix;
    const radians = (degrees: number): number => (degrees * Math.PI) / 180;
    if (name === 'matrix' && args.length === 6) step = [p, q, r, s, t, u];
    else if (name === 'translate' && (args.length === 1 || args.length === 2))
      step = [1, 0, 0, 1, p, q];
    else if (name === 'scale' && (args.length === 1 || args.length === 2)) {
      step = [p, 0, 0, args.length === 1 ? p : q, 0, 0];
    } else if (name === 'rotate' && (args.length === 1 || args.length === 3)) {
      const cos = Math.cos(radians(p));
      const sin = Math.sin(radians(p));
      step = [cos, sin, -sin, cos, 0, 0];
      if (args.length === 3) {
        step = svgMultiply(svgMultiply([1, 0, 0, 1, q, r], step), [1, 0, 0, 1, -q, -r]);
      }
    } else if (name === 'skewX' && args.length === 1) step = [1, 0, Math.tan(radians(p)), 1, 0, 0];
    else if (name === 'skewY' && args.length === 1) step = [1, Math.tan(radians(p)), 0, 1, 0, 0];
    else return null;
    matrix = svgMultiply(matrix, step);
    rest = rest.slice(call[0].length);
  }
  return matrix.every(Number.isFinite) ? matrix : null;
}

/**
 * SVG path data as absolute commands of the closed form of D73: relative
 * commands are made absolute, `H` and `V` become lines, `S` and `T` become
 * cubic and quadratic curves with their reflected control points, and a move
 * followed by pairs draws lines. `null` when the data is outside the grammar
 * or does not start with a move.
 */
export function svgPathCommands(data: string): SvgPathCommand[] | null {
  const tokens: (string | number)[] = [];
  const pattern =
    /[ \t\r\n]+|,|([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)/y;
  let at = 0;
  while (at < data.length) {
    pattern.lastIndex = at;
    const match = pattern.exec(data);
    if (match === null) return null;
    if (match[1] !== undefined) tokens.push(match[1]);
    else if (match[2] !== undefined) tokens.push(match[2]);
    at = pattern.lastIndex;
  }
  const commands: SvgPathCommand[] = [];
  let index = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  /** The second control point of the last cubic, or the control point of the last quadratic. */
  let lastCubic: [number, number] | null = null;
  let lastQuadratic: [number, number] | null = null;
  const number = (): number | null => {
    const token = tokens[index];
    if (typeof token !== 'string' || /[A-Za-z]/.test(token)) return null;
    const value = Number(token);
    if (!Number.isFinite(value)) return null;
    index += 1;
    return value === 0 ? 0 : value;
  };
  /** An arc flag: a 0 or a 1, which may be packed with what follows it (`011`). */
  const flag = (): boolean | null => {
    const token = tokens[index];
    if (typeof token !== 'string' || (token[0] !== '0' && token[0] !== '1')) return null;
    if (token.length === 1) index += 1;
    else tokens[index] = token.slice(1);
    return token[0] === '1';
  };
  let command = '';
  while (index < tokens.length) {
    const token = tokens[index];
    if (typeof token === 'string' && /^[A-Za-z]$/.test(token)) {
      command = token;
      index += 1;
    } else if (command === '' || command === 'Z' || command === 'z') {
      return null;
    }
    if (commands.length === 0 && command !== 'M' && command !== 'm') return null;
    const relative = command === command.toLowerCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    const upper = command.toUpperCase();
    if (upper === 'Z') {
      commands.push({ kind: 'close' });
      x = startX;
      y = startY;
      lastCubic = null;
      lastQuadratic = null;
      continue;
    }
    if (upper === 'M' || upper === 'L') {
      const px = number();
      const py = number();
      if (px === null || py === null) return null;
      x = ox + px;
      y = oy + py;
      if (upper === 'M') {
        commands.push({ kind: 'move', x, y });
        startX = x;
        startY = y;
        // Pairs after a move draw lines.
        command = relative ? 'l' : 'L';
      } else {
        commands.push({ kind: 'line', x, y });
      }
      lastCubic = null;
      lastQuadratic = null;
    } else if (upper === 'H' || upper === 'V') {
      const value = number();
      if (value === null) return null;
      if (upper === 'H') x = ox + value;
      else y = oy + value;
      commands.push({ kind: 'line', x, y });
      lastCubic = null;
      lastQuadratic = null;
    } else if (upper === 'C' || upper === 'S') {
      let x1: number;
      let y1: number;
      if (upper === 'C') {
        const a = number();
        const b = number();
        if (a === null || b === null) return null;
        x1 = ox + a;
        y1 = oy + b;
      } else {
        x1 = lastCubic === null ? x : 2 * x - lastCubic[0];
        y1 = lastCubic === null ? y : 2 * y - lastCubic[1];
      }
      const c = number();
      const d = number();
      const e = number();
      const f = number();
      if (c === null || d === null || e === null || f === null) return null;
      const x2 = ox + c;
      const y2 = oy + d;
      x = ox + e;
      y = oy + f;
      commands.push({ kind: 'cubic', x1, y1, x2, y2, x, y });
      lastCubic = [x2, y2];
      lastQuadratic = null;
    } else if (upper === 'Q' || upper === 'T') {
      let x1: number;
      let y1: number;
      if (upper === 'Q') {
        const a = number();
        const b = number();
        if (a === null || b === null) return null;
        x1 = ox + a;
        y1 = oy + b;
      } else {
        x1 = lastQuadratic === null ? x : 2 * x - lastQuadratic[0];
        y1 = lastQuadratic === null ? y : 2 * y - lastQuadratic[1];
      }
      const e = number();
      const f = number();
      if (e === null || f === null) return null;
      x = ox + e;
      y = oy + f;
      commands.push({ kind: 'quadratic', x1, y1, x, y });
      lastQuadratic = [x1, y1];
      lastCubic = null;
    } else if (upper === 'A') {
      const rx = number();
      const ry = number();
      const rotation = number();
      const largeArc = flag();
      const sweep = flag();
      const e = number();
      const f = number();
      if (
        rx === null ||
        ry === null ||
        rotation === null ||
        largeArc === null ||
        sweep === null ||
        e === null ||
        f === null
      ) {
        return null;
      }
      x = ox + e;
      y = oy + f;
      commands.push({
        kind: 'arc',
        rx: Math.abs(rx),
        ry: Math.abs(ry),
        rotation,
        largeArc,
        sweep,
        x,
        y,
      });
      lastCubic = null;
      lastQuadratic = null;
    } else {
      return null;
    }
  }
  return commands.length > 0 ? commands : null;
}

const ENUMS: Readonly<Record<string, ReadonlySet<string>>> = {
  'fill-rule': new Set(['nonzero', 'evenodd']),
  'stroke-linecap': new Set(['butt', 'round', 'square']),
  'stroke-linejoin': new Set(['miter', 'round', 'bevel']),
  gradientUnits: new Set(['userSpaceOnUse', 'objectBoundingBox']),
  spreadMethod: new Set(['pad', 'reflect', 'repeat']),
};

const ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** A number or a percentage, as a gradient coordinate or a stop offset; a percentage is a fraction. */
function fractionOf(value: string, path: string, what: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) return numberOf(trimmed.slice(0, -1), path, what) / 100;
  return numberOf(trimmed, path, what);
}

/** Checks one attribute of the subset against its grammar and bounds. */
function checkValue(element: SvgElementName, name: string, value: string, path: string): void {
  const what = `${name} of <${element}>`;
  const enumeration = ENUMS[name];
  if (enumeration !== undefined) {
    if (!enumeration.has(value.trim())) {
      refuse(
        'svg-value',
        `${what} must be one of ${[...enumeration].join(', ')}, not ${JSON.stringify(value)}.`,
        path,
      );
    }
    return;
  }
  switch (name) {
    case 'id':
      if (!ID.test(value))
        refuse('svg-value', `The ID ${JSON.stringify(value)} is not a name.`, path);
      return;
    case 'version':
      if (!/^[0-9.]+$/.test(value.trim())) refuse('svg-value', `${what} is not a version.`, path);
      return;
    case 'fill':
    case 'stroke':
      if (svgPaint(value) === null) {
        refuse(
          'svg-value',
          `${what} must be none, a colour, or url(#id) of a gradient, not ${JSON.stringify(value)}.`,
          path,
        );
      }
      return;
    case 'stop-color':
      if (svgColor(value) === null)
        refuse('svg-value', `${what} must be a colour, not ${JSON.stringify(value)}.`, path);
      return;
    case 'opacity':
    case 'fill-opacity':
    case 'stroke-opacity':
    case 'stop-opacity': {
      const opacity = numberOf(value, path, what);
      if (opacity < 0 || opacity > 1) refuse('svg-value', `${what} must lie from 0 to 1.`, path);
      return;
    }
    case 'stroke-width':
      lengthOf(value, path, what, 0);
      return;
    case 'stroke-miterlimit':
      if (numberOf(value, path, what) < 1) refuse('svg-value', `${what} must be at least 1.`, path);
      return;
    case 'stroke-dashoffset':
      lengthOf(value, path, what);
      return;
    case 'stroke-dasharray': {
      if (value.trim() === 'none') return;
      const list = numberList(value.replace(/px/g, ''));
      if (list === null || list.length === 0 || list.some((item) => item < 0)) {
        refuse(
          'svg-value',
          `${what} must be none or lengths from 0, not ${JSON.stringify(value)}.`,
          path,
        );
      }
      return;
    }
    case 'transform':
    case 'gradientTransform':
      if (svgTransform(value) === null)
        refuse('svg-value', `${what} is not a transform list.`, path);
      return;
    case 'd': {
      const commands = svgPathCommands(value);
      if (commands === null)
        refuse('svg-value', `${what} is not path data that starts with a move.`, path);
      for (const command of commands) {
        for (const number of Object.values(command)) {
          if (typeof number === 'number' && Math.abs(number) > MAX_NUMBER) {
            refuse('svg-value', `${what} leaves ±1 000 000.`, path);
          }
        }
      }
      return;
    }
    case 'points': {
      const list = numberList(value);
      if (list === null || list.length < 4 || list.length % 2 !== 0) {
        refuse('svg-value', `${what} must be at least two pairs of numbers.`, path);
      }
      return;
    }
    case 'x':
    case 'y':
    case 'cx':
    case 'cy':
    case 'x1':
    case 'y1':
    case 'x2':
    case 'y2':
    case 'fx':
    case 'fy':
      if (element === 'linearGradient' || element === 'radialGradient')
        fractionOf(value, path, what);
      else lengthOf(value, path, what);
      return;
    case 'r':
      if (element === 'radialGradient') {
        if (fractionOf(value, path, what) < 0)
          refuse('svg-value', `${what} must be at least 0.`, path);
      } else {
        lengthOf(value, path, what, 0);
      }
      return;
    case 'width':
    case 'height':
    case 'rx':
    case 'ry':
      lengthOf(value, path, what, 0);
      return;
    case 'offset':
      fractionOf(value, path, what);
      return;
    case 'preserveAspectRatio':
      if (!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/.test(value.trim())) {
        refuse('svg-value', `${what} must be none or an alignment with meet or slice.`, path);
      }
      return;
    case 'viewBox':
    case 'xmlns':
    case 'xmlns:xlink':
      return;
    default:
      refuse('svg-attribute', `${what} is outside the subset.`, path);
  }
}

/** The checks of D74.3 in their order: what an element is, then what each attribute does. */
function checkElement(
  raw: RawElement,
  isRoot: boolean,
  ids: Map<string, SvgElementName>,
): SvgElement {
  const { name, path } = raw;
  if (name === 'script') refuse('svg-script', 'A <script> element.', path);
  if (name === 'foreignObject')
    refuse('svg-foreign-object', 'A <foreignObject> element embeds HTML.', path);
  if (name === 'style')
    refuse('svg-style', 'A <style> element: CSS beyond presentation attributes.', path);
  if (ANIMATION.includes(name)) refuse('svg-animation', `<${name}> is SMIL animation.`, path);
  for (const [attribute, value] of raw.attributes) {
    const at = `${path}/@${attribute}`;
    if (/^on/i.test(attribute))
      refuse('svg-event-attribute', `The event attribute ${attribute}.`, at);
    if (attribute === 'href' || attribute.endsWith(':href')) {
      refuse('svg-external-reference', `${attribute} refers to ${JSON.stringify(value)}.`, at);
    }
    if (attribute === 'style' || attribute === 'class') {
      refuse('svg-style', `The attribute ${attribute}: CSS beyond presentation attributes.`, at);
    }
    for (const reference of value.matchAll(/url\s*\(([^)]*)\)?/gi)) {
      const target = (reference[1] ?? '').trim().replace(/^["']|["']$/g, '');
      if (!/^#[A-Za-z_][A-Za-z0-9_.-]*$/.test(target)) {
        refuse('svg-external-reference', `url(${target}) leaves the document.`, at);
      }
    }
  }
  if (isRoot) {
    if (name !== 'svg') refuse('svg-not-svg', `The root is <${name}>, not <svg>.`, path);
    const xmlns = raw.attributes.find(([attribute]) => attribute === 'xmlns')?.[1];
    if (xmlns !== SVG_NAMESPACE) {
      refuse('svg-not-svg', `The root must declare xmlns="${SVG_NAMESPACE}".`, path);
    }
  } else if (name === 'svg') {
    refuse('svg-element', 'A nested <svg> element is outside the subset.', path);
  }
  if (!Object.hasOwn(ATTRIBUTES, name))
    refuse('svg-element', `<${name}> is outside the subset.`, path);
  const known = name as SvgElementName;
  const allowed = ATTRIBUTES[known];
  const attributes = Object.create(null) as Record<string, string>;
  for (const [attribute, value] of raw.attributes) {
    const at = `${path}/@${attribute}`;
    if (!allowed.has(attribute) || (!isRoot && attribute.startsWith('xmlns'))) {
      refuse('svg-attribute', `${attribute} of <${name}> is outside the subset.`, at);
    }
    if (attribute === 'xmlns:xlink' && value !== XLINK_NAMESPACE) {
      refuse('svg-attribute', `xmlns:xlink must be "${XLINK_NAMESPACE}".`, at);
    }
    checkValue(known, attribute, value, at);
    if (attribute === 'id') {
      if (ids.has(value)) refuse('svg-value', `The ID ${JSON.stringify(value)} is used twice.`, at);
      ids.set(value, known);
    }
    attributes[attribute] = value;
  }
  if (known !== 'title' && known !== 'desc' && raw.text.trim() !== '') {
    refuse('svg-malformed', `<${name}> holds text; only <title> and <desc> do.`, path);
  }
  const children = raw.children.map((child) => {
    const element = checkElement(child, false, ids);
    if (!CHILDREN[known].has(element.name)) {
      refuse('svg-element', `<${element.name}> may not lie in <${name}>.`, child.path);
    }
    return element;
  });
  return Object.freeze({
    name: known,
    attributes: Object.freeze(attributes),
    children: Object.freeze(children),
  });
}

/** Every `url(#id)` of a paint names a gradient of the drawing. */
function checkReferences(
  element: SvgElement,
  ids: ReadonlyMap<string, SvgElementName>,
  path: string,
): void {
  for (const attribute of ['fill', 'stroke']) {
    const value = element.attributes[attribute];
    if (value === undefined) continue;
    const paint = svgPaint(value);
    if (paint?.kind !== 'gradient') continue;
    const target = ids.get(paint.id);
    if (target !== 'linearGradient' && target !== 'radialGradient') {
      refuse(
        'svg-value',
        `url(#${paint.id}) names no gradient of the drawing.`,
        `${path}/@${attribute}`,
      );
    }
  }
  const counts = new Map<string, number>();
  for (const child of element.children) {
    const index = counts.get(child.name) ?? 0;
    counts.set(child.name, index + 1);
    checkReferences(child, ids, `${path}/${child.name}[${String(index)}]`);
  }
}

/** The natural size and the view box of the root (D74.4). */
function sizeOf(root: SvgElement): Pick<SvgDrawing, 'width' | 'height' | 'viewBox'> {
  const whole = (name: 'width' | 'height'): number => {
    const value = root.attributes[name];
    const parsed = value === undefined ? null : svgLength(value);
    if (parsed === null || !Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SIZE) {
      refuse(
        'svg-size',
        `The root needs a ${name} of a whole number of pixels from 1 to 16 384, not ${JSON.stringify(value ?? null)}.`,
        `/svg/@${name}`,
      );
    }
    return parsed;
  };
  const width = whole('width');
  const height = whole('height');
  const box = numberList(root.attributes['viewBox'] ?? '');
  if (box?.length !== 4 || (box[2] ?? 0) <= 0 || (box[3] ?? 0) <= 0) {
    refuse(
      'svg-size',
      'The root needs a viewBox of four numbers with a positive width and height.',
      '/svg/@viewBox',
    );
  }
  const [x = 0, y = 0, boxWidth = 1, boxHeight = 1] = box;
  return { width, height, viewBox: Object.freeze({ x, y, width: boxWidth, height: boxHeight }) };
}

/**
 * Strict UTF-8, written out so that no platform decoder is involved: an
 * overlong form, a surrogate, a code point above U+10FFFF, or a truncated
 * sequence is `null`.
 */
function decodeUtf8(bytes: Uint8Array): string | null {
  const units: string[] = [];
  let at = 0;
  while (at < bytes.length) {
    const first = bytes[at] ?? 0;
    let need: number;
    let code: number;
    let minimum: number;
    if (first < 0x80) {
      need = 0;
      code = first;
      minimum = 0;
    } else if (first >= 0xc2 && first < 0xe0) {
      need = 1;
      code = first & 0x1f;
      minimum = 0x80;
    } else if (first >= 0xe0 && first < 0xf0) {
      need = 2;
      code = first & 0x0f;
      minimum = 0x800;
    } else if (first >= 0xf0 && first < 0xf5) {
      need = 3;
      code = first & 0x07;
      minimum = 0x10000;
    } else {
      return null;
    }
    for (let index = 1; index <= need; index += 1) {
      const next = bytes[at + index];
      if (next === undefined || (next & 0xc0) !== 0x80) return null;
      code = (code << 6) | (next & 0x3f);
    }
    if (code < minimum || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
    units.push(String.fromCodePoint(code));
    at += need + 1;
  }
  return units.join('');
}

/**
 * Reads an SVG asset (D74): its bytes, or its text. It is accepted only if it
 * is UTF-8 XML of at most 1 000 000 bytes whose every element and attribute
 * lies in the closed subset of D74.4; anything else is refused with the first
 * offence in document order. The result is frozen and shares nothing with the
 * input.
 */
export function readSvg(source: Uint8Array | string): SvgReading {
  try {
    let text: string;
    if (typeof source === 'string') {
      text = source;
      if (text.length > MAX_BYTES) refuse('svg-too-large', 'More than 1 000 000 characters.', '');
    } else {
      if (source.length > MAX_BYTES) refuse('svg-too-large', 'More than 1 000 000 bytes.', '');
      const decoded = decodeUtf8(source);
      if (decoded === null) refuse('svg-encoding', 'The bytes are not UTF-8.', '');
      text = decoded;
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.includes('\u0000')) refuse('svg-encoding', 'The text holds a NUL.', '');
    const ids = new Map<string, SvgElementName>();
    const root = checkElement(parseXml(text), true, ids);
    checkReferences(root, ids, '/svg');
    return Object.freeze({ ok: true, svg: Object.freeze({ ...sizeOf(root), root }) });
  } catch (reason) {
    if (!(reason instanceof Refusal)) throw reason;
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: reason.code, message: reason.message, path: reason.path }),
    });
  }
}
