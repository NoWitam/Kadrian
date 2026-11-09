/**
 * `svgToShapes` (D74.5): a pure helper that turns a drawing of an SVG asset
 * into shape nodes of D73, one per drawn element, so that its parts can be
 * animated. It is no command: it reads only the drawing and the options, and
 * the host inserts its nodes with `AddNode` in one transaction, so the
 * conversion is undone as one step and the bus checks every node as it checks
 * any other.
 *
 * The drawing is fitted into the box of the options as an image node of that
 * box with `fill` shows it: the root's view box is mapped onto the box by its
 * `preserveAspectRatio`. Each shape lies in a box around its own drawing, in
 * composition pixels, with its origin at the centre, so a part turns and
 * scales about itself. What a shape node cannot state is refused with
 * `svg-not-convertible`, naming the element and the reason; nothing is
 * approximated silently.
 */
import {
  readSvg,
  svgColor,
  svgLength,
  svgMultiply,
  svgPaint,
  svgPathCommands,
  svgTransform,
  SVG_IDENTITY,
  type PathCommand,
  type ShapeFill,
  type ShapeNode,
  type ShapeStroke,
  type SvgDrawing,
  type SvgElement,
  type SvgMatrix,
  type SvgPathCommand,
} from '@kadrion/schema';

import { EditorError } from './errors.js';

/** Where the shapes go and when they live (D74.5). */
export interface SvgToShapesOptions {
  /** The IDs of the nodes are this prefix, a hyphen, and 1, 2, 3, … in document order. */
  readonly idPrefix: string;
  /** The box the drawing fills, in composition pixels of the parent the nodes are added to. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The lifetime of every node, in integer microseconds of its scene. */
  readonly startUs: number;
  readonly durationUs: number;
}

/** The inherited presentation attributes of SVG that a shape node can state. */
interface Style {
  readonly fill: string;
  readonly fillOpacity: number;
  readonly fillRule: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeOpacity: number;
  readonly cap: string;
  readonly join: string;
  readonly miterLimit: number;
  readonly dash: string;
}

const INITIAL: Style = {
  fill: '#000000',
  fillOpacity: 1,
  fillRule: 'nonzero',
  stroke: 'none',
  strokeWidth: 1,
  strokeOpacity: 1,
  cap: 'butt',
  join: 'miter',
  miterLimit: 4,
  dash: 'none',
};

const ID_PREFIX = /^[A-Za-z0-9_-]+$/;
const MAX_COORDINATE = 1_000_000;
const MAX_COMMANDS = 1000;
const MAX_STROKE = 1000;
const MAX_STOPS = 16;

function notConvertible(path: string, reason: string): never {
  throw new EditorError('svg-not-convertible', `${path}: ${reason}`, [path]);
}

/** A number in thousandths of a pixel, so that a document stays readable; never −0. */
function rounded(value: number): number {
  const result = Math.round(value * 1000) / 1000;
  return result === 0 ? 0 : result;
}

function apply(matrix: SvgMatrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

/** The uniform scale of a matrix that only turns, mirrors, scales evenly, and moves; `null` otherwise. */
function similarityScale(matrix: SvgMatrix): number | null {
  const [a, b, c, d] = matrix;
  const first = a * a + b * b;
  const second = c * c + d * d;
  const tolerance = 1e-9 * Math.max(first, second, 1);
  if (Math.abs(first - second) > tolerance || Math.abs(a * c + b * d) > tolerance) return null;
  return Math.sqrt(first);
}

/** The matrix that maps the view box onto the box, by the root's `preserveAspectRatio`. */
function viewportMatrix(drawing: SvgDrawing, options: SvgToShapesOptions): SvgMatrix {
  const { viewBox } = drawing;
  const value = (drawing.root.attributes['preserveAspectRatio'] ?? 'xMidYMid meet').trim();
  let sx = options.width / viewBox.width;
  let sy = options.height / viewBox.height;
  let tx = options.x - viewBox.x * sx;
  let ty = options.y - viewBox.y * sy;
  if (value !== 'none') {
    const slice = value.endsWith('slice');
    const scale = slice ? Math.max(sx, sy) : Math.min(sx, sy);
    const spareX = options.width - viewBox.width * scale;
    const spareY = options.height - viewBox.height * scale;
    const align = (part: string, spare: number): number =>
      part === 'Min' ? 0 : part === 'Mid' ? spare / 2 : spare;
    sx = scale;
    sy = scale;
    tx = options.x - viewBox.x * scale + align(value.slice(1, 4), spareX);
    ty = options.y - viewBox.y * scale + align(value.slice(5, 8), spareY);
  }
  return [sx, 0, 0, sy, tx, ty];
}

/** The style of an element: its parent's, with the presentation attributes it states. */
function styleOf(element: SvgElement, parent: Style): Style {
  const at = element.attributes;
  const number = (name: string, fallback: number): number => {
    const value = at[name];
    return value === undefined ? fallback : Number(value.trim());
  };
  const length = (name: string, fallback: number): number => {
    const value = at[name];
    return value === undefined ? fallback : (svgLength(value) ?? fallback);
  };
  return {
    fill: at['fill']?.trim() ?? parent.fill,
    fillOpacity: number('fill-opacity', parent.fillOpacity),
    fillRule: at['fill-rule']?.trim() ?? parent.fillRule,
    stroke: at['stroke']?.trim() ?? parent.stroke,
    strokeWidth: length('stroke-width', parent.strokeWidth),
    strokeOpacity: number('stroke-opacity', parent.strokeOpacity),
    cap: at['stroke-linecap']?.trim() ?? parent.cap,
    join: at['stroke-linejoin']?.trim() ?? parent.join,
    miterLimit: number('stroke-miterlimit', parent.miterLimit),
    dash: at['stroke-dasharray']?.trim() ?? parent.dash,
  };
}

/** A number attribute of a shape element in user units; absent is `fallback`. */
function lengthAttribute(element: SvgElement, name: string, fallback = 0): number {
  const value = element.attributes[name];
  return value === undefined ? fallback : (svgLength(value) ?? fallback);
}

/** An arc of four quarter arcs' worth of cubic curves, in user space (SVG 2, appendix B.2.4). */
function arcToCubics(
  x0: number,
  y0: number,
  arc: Extract<SvgPathCommand, { kind: 'arc' }>,
): SvgPathCommand[] {
  const { x, y, sweep, largeArc } = arc;
  let rx = Math.abs(arc.rx);
  let ry = Math.abs(arc.ry);
  if ((x0 === x && y0 === y) || rx === 0 || ry === 0) return [{ kind: 'line', x, y }];
  const phi = (arc.rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const root = Math.sqrt(Math.max(0, numerator / denominator)) * (largeArc === sweep ? -1 : 1);
  const cx1 = (root * rx * y1) / ry;
  const cy1 = (-root * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (x0 + x) / 2;
  const cy = sin * cx1 + cos * cy1 + (y0 + y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return sign * Math.acos(Math.min(1, Math.max(-1, dot)));
  };
  const theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): [number, number] => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ];
  const derivative = (t: number): [number, number] => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ];
  const cubics: SvgPathCommand[] = [];
  for (let index = 0; index < segments; index += 1) {
    const t1 = theta + index * step;
    const t2 = t1 + step;
    const [px1, py1] = point(t1);
    const [px2, py2] = index === segments - 1 ? [x, y] : point(t2);
    const [dx1, dy1] = derivative(t1);
    const [dx2, dy2] = derivative(t2);
    cubics.push({
      kind: 'cubic',
      x1: px1 + k * dx1,
      y1: py1 + k * dy1,
      x2: px2 - k * dx2,
      y2: py2 - k * dy2,
      x: px2,
      y: py2,
    });
  }
  return cubics;
}

/** The outline of a shape element as absolute path commands in its user space; `null` draws nothing. */
function outlineOf(element: SvgElement): SvgPathCommand[] | null {
  const at = element.attributes;
  const points = (): [number, number][] => {
    const numbers = (at['points'] ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const pairs: [number, number][] = [];
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      pairs.push([numbers[index] ?? 0, numbers[index + 1] ?? 0]);
    }
    return pairs;
  };
  switch (element.name) {
    case 'path':
      return svgPathCommands(at['d'] ?? '');
    case 'rect': {
      const x = lengthAttribute(element, 'x');
      const y = lengthAttribute(element, 'y');
      const width = lengthAttribute(element, 'width');
      const height = lengthAttribute(element, 'height');
      if (width <= 0 || height <= 0) return null;
      let rx = at['rx'] === undefined ? undefined : lengthAttribute(element, 'rx');
      let ry = at['ry'] === undefined ? undefined : lengthAttribute(element, 'ry');
      rx ??= ry ?? 0;
      ry ??= rx;
      rx = Math.min(rx, width / 2);
      ry = Math.min(ry, height / 2);
      if (rx === 0 || ry === 0) {
        return [
          { kind: 'move', x, y },
          { kind: 'line', x: x + width, y },
          { kind: 'line', x: x + width, y: y + height },
          { kind: 'line', x, y: y + height },
          { kind: 'close' },
        ];
      }
      const corner = (cx: number, cy: number): SvgPathCommand => ({
        kind: 'arc',
        rx,
        ry,
        rotation: 0,
        largeArc: false,
        sweep: true,
        x: cx,
        y: cy,
      });
      return [
        { kind: 'move', x: x + rx, y },
        { kind: 'line', x: x + width - rx, y },
        corner(x + width, y + ry),
        { kind: 'line', x: x + width, y: y + height - ry },
        corner(x + width - rx, y + height),
        { kind: 'line', x: x + rx, y: y + height },
        corner(x, y + height - ry),
        { kind: 'line', x, y: y + ry },
        corner(x + rx, y),
        { kind: 'close' },
      ];
    }
    case 'circle':
    case 'ellipse': {
      const cx = lengthAttribute(element, 'cx');
      const cy = lengthAttribute(element, 'cy');
      const rx = lengthAttribute(element, element.name === 'circle' ? 'r' : 'rx');
      const ry = lengthAttribute(element, element.name === 'circle' ? 'r' : 'ry');
      if (rx <= 0 || ry <= 0) return null;
      const half = (x: number): SvgPathCommand => ({
        kind: 'arc',
        rx,
        ry,
        rotation: 0,
        largeArc: false,
        sweep: true,
        x,
        y: cy,
      });
      return [{ kind: 'move', x: cx + rx, y: cy }, half(cx - rx), half(cx + rx), { kind: 'close' }];
    }
    case 'line':
      return [
        { kind: 'move', x: lengthAttribute(element, 'x1'), y: lengthAttribute(element, 'y1') },
        { kind: 'line', x: lengthAttribute(element, 'x2'), y: lengthAttribute(element, 'y2') },
      ];
    case 'polyline':
    case 'polygon': {
      const [first, ...rest] = points();
      if (first === undefined) return null;
      const commands: SvgPathCommand[] = [
        { kind: 'move', x: first[0], y: first[1] },
        ...rest.map(([x, y]): SvgPathCommand => ({ kind: 'line', x, y })),
      ];
      if (element.name === 'polygon') commands.push({ kind: 'close' });
      return commands;
    }
    default:
      return null;
  }
}

/** The commands mapped by the matrix: arcs stay arcs under a similarity and become cubics otherwise. */
function transformed(commands: readonly SvgPathCommand[], matrix: SvgMatrix): SvgPathCommand[] {
  const scale = similarityScale(matrix);
  const mirrored = matrix[0] * matrix[3] - matrix[1] * matrix[2] < 0;
  const turn = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
  const result: SvgPathCommand[] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  for (const command of commands) {
    const pieces =
      command.kind === 'arc' && scale === null ? arcToCubics(x, y, command) : [command];
    for (const piece of pieces) {
      switch (piece.kind) {
        case 'move':
        case 'line': {
          const [px, py] = apply(matrix, piece.x, piece.y);
          result.push({ kind: piece.kind, x: px, y: py });
          break;
        }
        case 'cubic': {
          const [x1, y1] = apply(matrix, piece.x1, piece.y1);
          const [x2, y2] = apply(matrix, piece.x2, piece.y2);
          const [px, py] = apply(matrix, piece.x, piece.y);
          result.push({ kind: 'cubic', x1, y1, x2, y2, x: px, y: py });
          break;
        }
        case 'quadratic': {
          const [x1, y1] = apply(matrix, piece.x1, piece.y1);
          const [px, py] = apply(matrix, piece.x, piece.y);
          result.push({ kind: 'quadratic', x1, y1, x: px, y: py });
          break;
        }
        case 'arc': {
          const [px, py] = apply(matrix, piece.x, piece.y);
          const factor = scale ?? 1;
          const rotation =
            (((mirrored ? turn - piece.rotation : turn + piece.rotation) % 360) + 360) % 360;
          result.push({
            kind: 'arc',
            rx: piece.rx * factor,
            ry: piece.ry * factor,
            rotation: rotation > 180 ? rotation - 360 : rotation,
            largeArc: piece.largeArc,
            sweep: mirrored ? !piece.sweep : piece.sweep,
            x: px,
            y: py,
          });
          break;
        }
        case 'close':
          result.push(piece);
          break;
      }
    }
    if (command.kind === 'close') {
      x = startX;
      y = startY;
    } else {
      x = command.x;
      y = command.y;
      if (command.kind === 'move') {
        startX = x;
        startY = y;
      }
    }
  }
  return result;
}

/**
 * Every coordinate of the commands, control points included, as `[x, y]`
 * pairs; an arc counts by the control points of its cubic curves, which hold
 * it, so that the box of a circle is the circle's.
 */
function coordinates(commands: readonly SvgPathCommand[]): [number, number][] {
  const points: [number, number][] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  for (const command of commands) {
    switch (command.kind) {
      case 'close':
        x = startX;
        y = startY;
        continue;
      case 'cubic':
        points.push([command.x1, command.y1], [command.x2, command.y2]);
        break;
      case 'quadratic':
        points.push([command.x1, command.y1]);
        break;
      case 'arc':
        for (const piece of arcToCubics(x, y, command)) {
          if (piece.kind === 'cubic') points.push([piece.x1, piece.y1], [piece.x2, piece.y2]);
        }
        break;
      default:
        break;
    }
    points.push([command.x, command.y]);
    x = command.x;
    y = command.y;
    if (command.kind === 'move') {
      startX = x;
      startY = y;
    }
  }
  return points;
}

/** The commands moved into the box at `leftEdge`, `topEdge`, in the closed form of D73. */
function boxed(
  commands: readonly SvgPathCommand[],
  leftEdge: number,
  topEdge: number,
): PathCommand[] {
  return commands.map((command): PathCommand => {
    switch (command.kind) {
      case 'close':
        return { kind: 'close' };
      case 'move':
      case 'line':
        return {
          kind: command.kind,
          x: rounded(command.x - leftEdge),
          y: rounded(command.y - topEdge),
        };
      case 'cubic':
        return {
          kind: 'cubic',
          x1: rounded(command.x1 - leftEdge),
          y1: rounded(command.y1 - topEdge),
          x2: rounded(command.x2 - leftEdge),
          y2: rounded(command.y2 - topEdge),
          x: rounded(command.x - leftEdge),
          y: rounded(command.y - topEdge),
        };
      case 'quadratic':
        return {
          kind: 'quadratic',
          x1: rounded(command.x1 - leftEdge),
          y1: rounded(command.y1 - topEdge),
          x: rounded(command.x - leftEdge),
          y: rounded(command.y - topEdge),
        };
      case 'arc':
        return {
          kind: 'arc',
          rx: rounded(command.rx),
          ry: rounded(command.ry),
          rotation: rounded(command.rotation),
          largeArc: command.largeArc,
          sweep: command.sweep,
          x: rounded(command.x - leftEdge),
          y: rounded(command.y - topEdge),
        };
    }
  });
}

/** Every gradient of the drawing, by ID. */
function gradientsOf(element: SvgElement, found: Map<string, SvgElement>): Map<string, SvgElement> {
  const id = element.attributes['id'];
  if (
    (element.name === 'linearGradient' || element.name === 'radialGradient') &&
    id !== undefined
  ) {
    found.set(id, element);
  }
  for (const child of element.children) gradientsOf(child, found);
  return found;
}

/** The fill of a shape for a paint, in the box at `leftEdge`, `topEdge`. */
function fillOf(
  paint: string,
  context: {
    readonly gradients: ReadonlyMap<string, SvgElement>;
    readonly matrix: SvgMatrix;
    readonly leftEdge: number;
    readonly topEdge: number;
    readonly path: string;
  },
): ShapeFill {
  const parsed = svgPaint(paint);
  if (parsed === null || parsed.kind === 'none') return { kind: 'none' };
  if (parsed.kind === 'color') return { kind: 'solid', color: parsed.color };
  const { path, matrix, leftEdge, topEdge } = context;
  const gradient = context.gradients.get(parsed.id);
  if (gradient === undefined) notConvertible(path, `url(#${parsed.id}) names no gradient.`);
  const at = gradient.attributes;
  if (at['gradientUnits']?.trim() !== 'userSpaceOnUse') {
    notConvertible(
      path,
      `the gradient #${parsed.id} is not in userSpaceOnUse, so its geometry depends on a bounding box.`,
    );
  }
  if (at['gradientTransform'] !== undefined) {
    notConvertible(path, `the gradient #${parsed.id} has a gradientTransform.`);
  }
  if ((at['spreadMethod']?.trim() ?? 'pad') !== 'pad') {
    notConvertible(
      path,
      `the gradient #${parsed.id} repeats or reflects; a shape's gradient pads.`,
    );
  }
  const scale = similarityScale(matrix);
  if (scale === null)
    notConvertible(path, 'a gradient under a transform that skews or scales unevenly.');
  const coordinate = (name: string): number => {
    const value = at[name];
    const parsedValue = value === undefined || value.trim().endsWith('%') ? null : svgLength(value);
    if (parsedValue === null) {
      notConvertible(path, `the gradient #${parsed.id} needs ${name} in user units.`);
    }
    return parsedValue;
  };
  let previous = 0;
  const stops = gradient.children
    .filter((child) => child.name === 'stop')
    .map((stop) => {
      const offsetText = stop.attributes['offset']?.trim() ?? '0';
      const raw = offsetText.endsWith('%')
        ? Number(offsetText.slice(0, -1)) / 100
        : Number(offsetText);
      previous = Math.max(previous, Math.min(1, Math.max(0, raw)));
      return {
        offset: Math.round(previous * 1000),
        color: svgColor(stop.attributes['stop-color'] ?? 'black') ?? '#000000',
        opacity: Number(stop.attributes['stop-opacity']?.trim() ?? '1'),
      };
    });
  if (stops.length < 2 || stops.length > MAX_STOPS) {
    notConvertible(
      path,
      `the gradient #${parsed.id} has ${String(stops.length)} stops; a shape's has 2 to 16.`,
    );
  }
  const point = (x: number, y: number): { x: number; y: number } => {
    const [px, py] = apply(matrix, x, y);
    return { x: rounded(px - leftEdge), y: rounded(py - topEdge) };
  };
  if (gradient.name === 'linearGradient') {
    return {
      kind: 'linear-gradient',
      start: point(coordinate('x1'), coordinate('y1')),
      end: point(coordinate('x2'), coordinate('y2')),
      stops,
    };
  }
  const cx = coordinate('cx');
  const cy = coordinate('cy');
  if (
    (at['fx'] !== undefined && coordinate('fx') !== cx) ||
    (at['fy'] !== undefined && coordinate('fy') !== cy)
  ) {
    notConvertible(path, `the gradient #${parsed.id} has a focus off its centre.`);
  }
  const radius = rounded(coordinate('r') * scale);
  if (radius < 1) notConvertible(path, `the gradient #${parsed.id} has a radius under 1 pixel.`);
  return { kind: 'radial-gradient', center: point(cx, cy), radius, stops };
}

/** Reads the source as a drawing, or refuses it with the sanitiser's error (D74.3). */
function drawingOf(source: SvgDrawing | Uint8Array | string): SvgDrawing {
  if (typeof source === 'string' || source instanceof Uint8Array) {
    const reading = readSvg(source);
    if (!reading.ok) {
      const { code, path, message } = reading.error;
      throw new EditorError('svg-refused', `${code}: ${message}`, [code, path]);
    }
    return reading.svg;
  }
  return source;
}

function checkOptions(options: SvgToShapesOptions): void {
  const integer = (value: unknown, minimum: number, maximum: number): boolean =>
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum;
  if (
    typeof options !== 'object' ||
    typeof options.idPrefix !== 'string' ||
    !ID_PREFIX.test(options.idPrefix) ||
    !integer(options.x, -MAX_COORDINATE, MAX_COORDINATE) ||
    !integer(options.y, -MAX_COORDINATE, MAX_COORDINATE) ||
    !integer(options.width, 1, MAX_COORDINATE) ||
    !integer(options.height, 1, MAX_COORDINATE) ||
    !integer(options.startUs, 0, Number.MAX_SAFE_INTEGER) ||
    !integer(options.durationUs, 1, Number.MAX_SAFE_INTEGER)
  ) {
    throw new EditorError(
      'invalid-argument',
      'svgToShapes needs { idPrefix, x, y, width, height, startUs, durationUs }: an ID prefix of letters, digits, _ and -, a box of integers with a width and height of at least 1, and a lifetime of integer microseconds.',
    );
  }
}

/**
 * The shape nodes of a drawing (D74.5): one for each `path`, `rect`,
 * `circle`, `ellipse`, `line`, `polyline`, and `polygon` that draws
 * something, in document order, which is the order of their layers. The
 * source is a drawing `readSvg` accepted, or the bytes or the text of one.
 * Refused with `svg-refused` when the sanitiser refuses the source,
 * `invalid-argument` for options out of shape, and `svg-not-convertible` for
 * what a shape cannot state: dashes in user units, a stroke or a gradient
 * under a transform that skews or scales unevenly, a gradient in the units of
 * a bounding box, with a transform, a spread, a focus, or other than 2 to 16
 * stops, a miter limit other than 4, a fill and a stroke of different
 * opacities, or more than 1000 commands; the details name the element.
 * Group opacity is applied to each element of the group.
 */
export function svgToShapes(
  source: SvgDrawing | Uint8Array | string,
  options: SvgToShapesOptions,
): ShapeNode[] {
  checkOptions(options);
  const drawing = drawingOf(source);
  const gradients = gradientsOf(drawing.root, new Map());
  const nodes: ShapeNode[] = [];
  const visit = (
    element: SvgElement,
    path: string,
    parentStyle: Style,
    parentMatrix: SvgMatrix,
    parentOpacity: number,
  ): void => {
    if (
      element.name === 'defs' ||
      element.name === 'title' ||
      element.name === 'desc' ||
      element.name === 'linearGradient' ||
      element.name === 'radialGradient'
    ) {
      return;
    }
    const style = styleOf(element, parentStyle);
    const own = element.attributes['transform'];
    const matrix =
      own === undefined
        ? parentMatrix
        : svgMultiply(parentMatrix, svgTransform(own) ?? SVG_IDENTITY);
    const opacity = parentOpacity * Number(element.attributes['opacity']?.trim() ?? '1');
    if (element.name === 'svg' || element.name === 'g') {
      const counts = new Map<string, number>();
      for (const child of element.children) {
        const index = counts.get(child.name) ?? 0;
        counts.set(child.name, index + 1);
        visit(child, `${path}/${child.name}[${String(index)}]`, style, matrix, opacity);
      }
      return;
    }
    const outline = outlineOf(element);
    if (outline === null) return;
    const fills = element.name !== 'line' && svgPaint(style.fill)?.kind !== 'none';
    const strokes = svgPaint(style.stroke)?.kind !== 'none' && style.strokeWidth > 0;
    if (!fills && !strokes) return;
    if (outline.length > MAX_COMMANDS) {
      notConvertible(path, `${String(outline.length)} commands; a shape has at most 1000.`);
    }
    const scale = similarityScale(matrix);
    if (strokes) {
      if (style.dash !== 'none') {
        notConvertible(
          path,
          'stroke-dasharray is in user units; a shape states dashes in per mille of its outline.',
        );
      }
      if (style.miterLimit !== 4 && style.join === 'miter') {
        notConvertible(path, 'a stroke-miterlimit other than 4.');
      }
      if (svgPaint(style.stroke)?.kind === 'gradient') {
        notConvertible(path, 'a stroke painted with a gradient; a shape strokes in one colour.');
      }
      if (scale === null)
        notConvertible(path, 'a stroke under a transform that skews or scales unevenly.');
    }
    if (fills && strokes && style.fillOpacity !== style.strokeOpacity) {
      notConvertible(path, 'a fill and a stroke of different opacities.');
    }
    const commands = transformed(outline, matrix);
    const points = coordinates(commands);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const leftEdge = Math.floor(Math.min(...xs));
    const topEdge = Math.floor(Math.min(...ys));
    const width = Math.max(1, Math.ceil(Math.max(...xs)) - leftEdge);
    const height = Math.max(1, Math.ceil(Math.max(...ys)) - topEdge);
    const geometry = boxed(commands, leftEdge, topEdge);
    if (
      [leftEdge, topEdge, leftEdge + width, topEdge + height].some(
        (value) => Math.abs(value) > MAX_COORDINATE,
      )
    ) {
      notConvertible(path, 'it leaves ±1 000 000 composition pixels.');
    }
    const fill: ShapeFill = fills
      ? fillOf(style.fill, { gradients, matrix, leftEdge, topEdge, path })
      : { kind: 'none' };
    const strokeColor = svgPaint(style.stroke);
    const strokeWidth = strokes ? rounded(style.strokeWidth * (scale ?? 1)) : 0;
    if (strokeWidth > MAX_STROKE) notConvertible(path, 'a stroke wider than 1000 pixels.');
    const stroke: ShapeStroke = {
      color: strokes && strokeColor?.kind === 'color' ? strokeColor.color : '#000000',
      width: strokeWidth,
      dash: [],
      cap: style.cap as ShapeStroke['cap'],
      join: style.join as ShapeStroke['join'],
    };
    const paintOpacity = fills ? style.fillOpacity : style.strokeOpacity;
    nodes.push({
      id: `${options.idPrefix}-${String(nodes.length + 1)}`,
      type: 'shape',
      startUs: options.startUs,
      durationUs: options.durationUs,
      position: { x: leftEdge, y: topEdge },
      scale: { x: 1, y: 1 },
      rotation: 0,
      origin: { x: 500, y: 500 },
      opacity: rounded(opacity * paintOpacity),
      animations: [],
      width,
      height,
      geometry: {
        kind: 'path',
        fillRule: style.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
        commands: geometry,
      },
      fill,
      stroke,
      trim: { start: 0, end: 1000 },
      effects: [],
    });
  };
  visit(drawing.root, '/svg', INITIAL, viewportMatrix(drawing, options), 1);
  return nodes;
}
