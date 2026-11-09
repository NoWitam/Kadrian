/**
 * A shape at one instant (D73): its box, its geometry as a path of absolute
 * commands, its fill, and its stroke with the dashes that draw the part of the
 * outline its trim keeps. Every length along the outline is in per mille of
 * the outline, which the browser measures as `pathLength` 1000: nothing here
 * measures a curve, so the runtime computes no length it could get wrong.
 */
import type { NodeAnimation, ShapeGeometry, ShapeNode } from '@kadrion/schema';

import { easedValue, type Bounds } from './easing.js';
import { unsupported } from './errors.js';
import {
  PROPERTY_BOUNDS,
  sampleColorKeyframes,
  sampleKeyframes,
  sampleNumberKeyframes,
  sampleSize,
  type Keyframe,
} from './keyframes.js';
import type {
  PathCommandState,
  ShapeFillState,
  ShapeStrokeState,
  Size,
  TrimState,
} from './state.js';

type AnimationOf<P extends NodeAnimation['property']> = Extract<NodeAnimation, { property: P }>;

/** The animation of a row of a shape, when it has one (D65.1, D73). */
function animationOf<P extends NodeAnimation['property']>(
  animations: readonly NodeAnimation[],
  property: P,
): AnimationOf<P> | undefined {
  return animations.find(
    (animation): animation is AnimationOf<P> => animation.property === property,
  );
}

/** The bounds of a coordinate, of a length, and of the turn of an arc (D73). */
const COORDINATE: Bounds = PROPERTY_BOUNDS.geometry;
const LENGTH: Bounds = { min: 0, max: 1_000_000 };
const TURN: Bounds = { min: -360, max: 360 };

/** Every number of a geometry with its bounds, in the order of the document (D73). */
function numbersOf(geometry: ShapeGeometry): { values: number[]; bounds: Bounds[] } {
  const values: number[] = [];
  const bounds: Bounds[] = [];
  const add = (value: number, within: Bounds): void => {
    values.push(value);
    bounds.push(within);
  };
  switch (geometry.kind) {
    case 'rect':
      add(geometry.cornerRadius, LENGTH);
      break;
    case 'ellipse':
      break;
    case 'polygon':
      for (const point of geometry.points) {
        add(point.x, COORDINATE);
        add(point.y, COORDINATE);
      }
      break;
    case 'path':
      for (const command of geometry.commands) {
        switch (command.kind) {
          case 'move':
          case 'line':
            add(command.x, COORDINATE);
            add(command.y, COORDINATE);
            break;
          case 'cubic':
            add(command.x1, COORDINATE);
            add(command.y1, COORDINATE);
            add(command.x2, COORDINATE);
            add(command.y2, COORDINATE);
            add(command.x, COORDINATE);
            add(command.y, COORDINATE);
            break;
          case 'quadratic':
            add(command.x1, COORDINATE);
            add(command.y1, COORDINATE);
            add(command.x, COORDINATE);
            add(command.y, COORDINATE);
            break;
          case 'arc':
            add(command.rx, LENGTH);
            add(command.ry, LENGTH);
            add(command.rotation, TURN);
            add(command.x, COORDINATE);
            add(command.y, COORDINATE);
            break;
          case 'close':
            break;
          default:
            unsupported(command, 'kind');
        }
      }
      break;
    default:
      unsupported(geometry, 'kind');
  }
  return { values, bounds };
}

/**
 * The geometry of `structure` with `values` in place of its numbers, in the
 * order `numbersOf` reads them; it shares no object with the document.
 */
function withNumbers(structure: ShapeGeometry, values: readonly number[]): ShapeGeometry {
  let at = 0;
  const next = (): number => values[at++] ?? 0;
  switch (structure.kind) {
    case 'rect':
      return { kind: 'rect', cornerRadius: next() };
    case 'ellipse':
      return { kind: 'ellipse' };
    case 'polygon':
      return { kind: 'polygon', points: structure.points.map(() => ({ x: next(), y: next() })) };
    case 'path':
      return {
        kind: 'path',
        fillRule: structure.fillRule,
        commands: structure.commands.map((command) => {
          switch (command.kind) {
            case 'move':
            case 'line':
              return { kind: command.kind, x: next(), y: next() };
            case 'cubic':
              return {
                kind: 'cubic',
                x1: next(),
                y1: next(),
                x2: next(),
                y2: next(),
                x: next(),
                y: next(),
              };
            case 'quadratic':
              return { kind: 'quadratic', x1: next(), y1: next(), x: next(), y: next() };
            case 'arc':
              return {
                kind: 'arc',
                rx: next(),
                ry: next(),
                rotation: next(),
                largeArc: command.largeArc,
                sweep: command.sweep,
                x: next(),
                y: next(),
              };
            case 'close':
              return { kind: 'close' };
            default:
              return unsupported(command, 'kind');
          }
        }),
      };
    default:
      return unsupported(structure, 'kind');
  }
}

/**
 * The geometry of a shape at `timeUs` (D73): its own, or the geometry its
 * animation replaces it with. Between two keyframes every number moves on its
 * own by the rule of D18 under the easing of the earlier keyframe (D67), held
 * within its bounds where eased; validation guarantees that every keyframe has
 * the structure of the shape's geometry, so the numbers pair up one by one.
 */
export function geometryAt(node: ShapeNode, timeUs: number): ShapeGeometry {
  const animation = animationOf(node.animations, 'geometry');
  if (animation === undefined) return node.geometry;
  return sampleKeyframes(
    animation.keyframes,
    timeUs,
    (value) => value,
    (previous, next) => {
      const elapsedUs = timeUs - previous.timeUs;
      const spanUs = next.timeUs - previous.timeUs;
      const a = numbersOf(previous.value);
      const b = numbersOf(next.value).values;
      const values = a.values.map((from, index) =>
        easedValue(
          previous.easing,
          from,
          b[index] ?? from,
          elapsedUs,
          spanUs,
          a.bounds[index] ?? COORDINATE,
        ),
      );
      return withNumbers(previous.value, values);
    },
  );
}

/** A rectangle of the box, its radius reduced to half the shorter side, clockwise from the top edge (D73). */
function rectPath(size: Size, cornerRadius: number): PathCommandState[] {
  const { width: w, height: h } = size;
  const r = Math.min(cornerRadius, w / 2, h / 2);
  if (r <= 0) {
    return [
      { kind: 'move', x: 0, y: 0 },
      { kind: 'line', x: w, y: 0 },
      { kind: 'line', x: w, y: h },
      { kind: 'line', x: 0, y: h },
      { kind: 'close' },
    ];
  }
  const corner = (x: number, y: number): PathCommandState => ({
    kind: 'arc',
    rx: r,
    ry: r,
    rotation: 0,
    largeArc: false,
    sweep: true,
    x,
    y,
  });
  const commands: PathCommandState[] = [{ kind: 'move', x: r, y: 0 }];
  // A side that the corners take whole has no straight part.
  if (w - r > r) commands.push({ kind: 'line', x: w - r, y: 0 });
  commands.push(corner(w, r));
  if (h - r > r) commands.push({ kind: 'line', x: w, y: h - r });
  commands.push(corner(w - r, h));
  if (w - r > r) commands.push({ kind: 'line', x: r, y: h });
  commands.push(corner(0, h - r));
  if (h - r > r) commands.push({ kind: 'line', x: 0, y: r });
  commands.push(corner(r, 0), { kind: 'close' });
  return commands;
}

/** An ellipse of the box in two half arcs, clockwise from its rightmost point (D73). */
function ellipsePath(size: Size): PathCommandState[] {
  const rx = size.width / 2;
  const ry = size.height / 2;
  const half = (x: number): PathCommandState => ({
    kind: 'arc',
    rx,
    ry,
    rotation: 0,
    largeArc: false,
    sweep: true,
    x,
    y: ry,
  });
  return [{ kind: 'move', x: size.width, y: ry }, half(0), half(size.width), { kind: 'close' }];
}

/** The path of a geometry in a box of `size` (D73): every geometry is drawn as one path. */
export function shapePath(geometry: ShapeGeometry, size: Size): PathCommandState[] {
  switch (geometry.kind) {
    case 'rect':
      return rectPath(size, geometry.cornerRadius);
    case 'ellipse':
      return ellipsePath(size);
    case 'polygon':
      return [
        ...geometry.points.map((point, index): PathCommandState => ({
          kind: index === 0 ? 'move' : 'line',
          x: point.x,
          y: point.y,
        })),
        { kind: 'close' },
      ];
    case 'path':
      return geometry.commands.map((command) => ({ ...command }));
    default:
      return unsupported(geometry, 'kind');
  }
}

/**
 * The visible parts of an outline (D73): the dashes of `dash` from its start,
 * repeated, cut to `[start, end]` and to the outline, as intervals in per
 * mille of its length. Without dashes the whole trimmed part is one interval.
 */
function visibleParts(
  dash: readonly number[],
  start: number,
  end: number,
): (readonly [number, number])[] {
  const from = Math.max(start, 0);
  const to = Math.min(end, 1000);
  if (to <= from) return [];
  if (dash.length === 0) return [[from, to]];
  const parts: (readonly [number, number])[] = [];
  let at = 0;
  // Every dash and gap is at least 1 per mille, so this ends within 1000 turns.
  for (let index = 0; at < to; index += 1) {
    const length = dash[index % dash.length] ?? 1000;
    if (index % 2 === 0) {
      const a = Math.max(at, from);
      const b = Math.min(at + length, to);
      if (b > a) parts.push([a, b]);
    }
    at += length;
  }
  return parts;
}

/**
 * The stroke of a shape at one instant (D73), or `null` when it draws nothing:
 * a width of 0, or a trim or dashes that leave no part of the outline, which
 * the renderer must not draw because caps would show (D65.5, probe 5).
 *
 * An untrimmed stroke without dashes has no dash array at all. Otherwise the
 * array lists every visible part and the gap after it, in per mille of the
 * outline, and ends with a gap of 1000, so that the pattern never repeats
 * along the outline; the offset moves its first part to where it begins.
 */
function strokeOf(
  stroke: ShapeNode['stroke'],
  color: string,
  width: number,
  trim: TrimState,
): ShapeStrokeState | null {
  if (width <= 0) return null;
  const base = { color, width, cap: stroke.cap, join: stroke.join };
  if (stroke.dash.length === 0 && trim.start <= 0 && trim.end >= 1000) {
    return { ...base, dashArray: null, dashOffset: 0 };
  }
  const parts = visibleParts(stroke.dash, trim.start, trim.end);
  const first = parts[0];
  if (first === undefined) return null;
  const dashArray: number[] = [];
  parts.forEach(([a, b], index) => {
    const following = parts[index + 1];
    dashArray.push(b - a, following === undefined ? 1000 : following[0] - b);
  });
  return { ...base, dashArray, dashOffset: -first[0] + 0 };
}

/** What a shape is filled with at one instant (D73). */
function fillOf(node: ShapeNode, timeUs: number): ShapeFillState {
  switch (node.fill.kind) {
    case 'none':
      return { kind: 'none' };
    case 'solid': {
      const animation = animationOf(node.animations, 'fill');
      return {
        kind: 'solid',
        color:
          animation === undefined
            ? node.fill.color
            : sampleColorKeyframes(animation.keyframes, timeUs),
      };
    }
    case 'linear-gradient':
    case 'radial-gradient':
      return { kind: 'gradient' };
    default:
      return unsupported(node.fill, 'kind');
  }
}

/** A number of a row in `replace` mode, its own or sampled (D65.1, D73). */
function numberOf(
  animations: readonly NodeAnimation[],
  property: 'stroke/width' | 'trim/start' | 'trim/end',
  own: number,
  timeUs: number,
): number {
  const animation = animationOf(animations, property);
  if (animation === undefined) return own;
  const keyframes: readonly Keyframe<number>[] = animation.keyframes;
  return sampleNumberKeyframes(keyframes, PROPERTY_BOUNDS[property], timeUs);
}

/** The evaluated values of a shape (D73), besides its transform. */
export interface ShapeValues {
  readonly size: Size;
  readonly path: readonly PathCommandState[];
  readonly fill: ShapeFillState;
  readonly stroke: ShapeStrokeState | null;
  readonly trim: TrimState;
}

/** The values of a shape at `timeUs` (D73): each row its own value or what its animation replaces it with. */
export function shapeAt(node: ShapeNode, timeUs: number): ShapeValues {
  const sized = animationOf(node.animations, 'size');
  const size =
    sized === undefined ? { width: node.width, height: node.height } : sampleSize(sized, timeUs);
  const trim = {
    start: numberOf(node.animations, 'trim/start', node.trim.start, timeUs),
    end: numberOf(node.animations, 'trim/end', node.trim.end, timeUs),
  };
  const strokeColor = animationOf(node.animations, 'stroke/color');
  const color =
    strokeColor === undefined
      ? node.stroke.color
      : sampleColorKeyframes(strokeColor.keyframes, timeUs);
  const width = numberOf(node.animations, 'stroke/width', node.stroke.width, timeUs);
  return {
    size,
    path: shapePath(geometryAt(node, timeUs), size),
    fill: fillOf(node, timeUs),
    stroke: strokeOf(node.stroke, color, width, trim),
    trim,
  };
}
