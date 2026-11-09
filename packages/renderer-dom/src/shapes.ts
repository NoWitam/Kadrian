/**
 * Shapes as inline SVG (D03, D73). The mount builds, inside the node's box, one
 * `<svg>` that lets its drawing leave the box, with the gradient of the fill
 * when it has one and one `<path>`; `renderState` writes on every call the box,
 * the path data, the fill, and the stroke of the instant, and removes what the
 * state does not hold, so a tree rendered at a state is that of a fresh mount
 * rendered at it (D54.3).
 *
 * A trimmed or dashed stroke is drawn by `stroke-dasharray` over a
 * `pathLength` of 1000, the primitive the probes of D65 found exact; a stroke
 * that draws nothing is not written at all, because caps would show (D65.5).
 */
import type { PathCommandState, ShapeNodeState } from '@kadrion/runtime';
import type { ShapeNode } from '@kadrion/schema';

import { cssNumber, cssPixels } from './css.js';
import { unsupportedNode } from './errors.js';
import { SVG_NAMESPACE } from './svg-filters.js';

/** The `<svg>` of a shape inside its node's box. */
export const SHAPE_ATTRIBUTE = 'data-kadrion-shape';

/** The attributes `renderState` writes on the path of a shape; the mount writes none of them. */
const PATH_WRITTEN = [
  'd',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'pathLength',
  'stroke-dasharray',
  'stroke-dashoffset',
] as const;

/** The declarations `renderState` writes on the box of a shape, besides those of every node. */
export const SHAPE_WRITTEN = ['width', 'height'] as const;

/** The ID of the gradient of a shape's fill (D73); IDs are unique in the document (D16). */
export function gradientId(nodeId: string): string {
  return `kadrion-shape-${nodeId}-fill`;
}

const n = cssNumber;

/** The path data of absolute commands, every number by `Number::toString` (D22, D73). */
export function pathData(path: readonly PathCommandState[]): string {
  return path
    .map((command) => {
      switch (command.kind) {
        case 'move':
          return `M ${n(command.x)} ${n(command.y)}`;
        case 'line':
          return `L ${n(command.x)} ${n(command.y)}`;
        case 'cubic':
          return `C ${n(command.x1)} ${n(command.y1)} ${n(command.x2)} ${n(command.y2)} ${n(command.x)} ${n(command.y)}`;
        case 'quadratic':
          return `Q ${n(command.x1)} ${n(command.y1)} ${n(command.x)} ${n(command.y)}`;
        case 'arc':
          return `A ${n(command.rx)} ${n(command.ry)} ${n(command.rotation)} ${command.largeArc ? '1' : '0'} ${command.sweep ? '1' : '0'} ${n(command.x)} ${n(command.y)}`;
        case 'close':
          return 'Z';
        default:
          return unsupportedNode(command);
      }
    })
    .join(' ');
}

function svgElement(
  document: Document,
  tag: string,
  attributes: Readonly<Record<string, string>>,
): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

/** The gradient of a shape's fill, in the pixels of its box, or `null` for any other fill (D73). */
function gradientElement(document: Document, node: ShapeNode): SVGElement | null {
  const { fill } = node;
  if (fill.kind !== 'linear-gradient' && fill.kind !== 'radial-gradient') return null;
  const gradient =
    fill.kind === 'linear-gradient'
      ? svgElement(document, 'linearGradient', {
          id: gradientId(node.id),
          gradientUnits: 'userSpaceOnUse',
          x1: n(fill.start.x),
          y1: n(fill.start.y),
          x2: n(fill.end.x),
          y2: n(fill.end.y),
        })
      : svgElement(document, 'radialGradient', {
          id: gradientId(node.id),
          gradientUnits: 'userSpaceOnUse',
          cx: n(fill.center.x),
          cy: n(fill.center.y),
          r: n(fill.radius),
        });
  for (const stop of fill.stops) {
    gradient.append(
      svgElement(document, 'stop', {
        offset: n(stop.offset / 1000),
        'stop-color': stop.color,
        'stop-opacity': n(stop.opacity),
      }),
    );
  }
  return gradient;
}

/**
 * The content of a shape's box (D73): an `<svg>` at its top-left corner as
 * large as the box, which shows what lies outside it, holding the gradient of
 * its fill and its path. The fill rule is static; everything an animation can
 * reach is written by `renderState`.
 */
export function shapeContent(document: Document, node: ShapeNode): SVGElement {
  const svg = svgElement(document, 'svg', { [SHAPE_ATTRIBUTE]: '', width: '100%', height: '100%' });
  svg.style.setProperty('position', 'absolute');
  svg.style.setProperty('left', '0px');
  svg.style.setProperty('top', '0px');
  svg.style.setProperty('overflow', 'visible');
  const gradient = gradientElement(document, node);
  if (gradient !== null) {
    const defs = svgElement(document, 'defs', {});
    defs.append(gradient);
    svg.append(defs);
  }
  svg.append(
    svgElement(document, 'path', {
      'fill-rule': node.geometry.kind === 'path' ? node.geometry.fillRule : 'nonzero',
    }),
  );
  return svg;
}

/** The path of a shape's box, or `null` when the box holds none. */
function pathOf(element: HTMLElement): SVGElement | null {
  return element.querySelector(`:scope > [${SHAPE_ATTRIBUTE}] > path`);
}

/** Removes what `writeShape` wrote on a shape's box and path, back to the mount. */
export function clearShape(element: HTMLElement): void {
  const path = pathOf(element);
  if (path === null) return;
  for (const property of SHAPE_WRITTEN) element.style.removeProperty(property);
  clearShapePath(path);
}

/** Removes what `writeShapePath` wrote on a path, back to the mount. */
export function clearShapePath(path: Element): void {
  for (const attribute of PATH_WRITTEN) path.removeAttribute(attribute);
}

/**
 * Writes a shape at one instant (D73): the size of its box, its path data, its
 * fill, and its stroke, and removes every attribute of the stroke it does not
 * draw. Colours are written as the document holds them, `#rrggbb`.
 */
export function writeShape(element: HTMLElement, node: ShapeNodeState): void {
  const path = pathOf(element);
  if (path === null) return;
  // The size is set in place, so its declarations keep the order of a fresh
  // mount; the attributes of the path are removed first, for a stroke that
  // draws less than before leaves none of its own behind (D54.3).
  clearShapePath(path);
  element.style.setProperty('width', cssPixels(node.size.width));
  element.style.setProperty('height', cssPixels(node.size.height));
  writeShapePath(path, node);
}

/**
 * Writes the path data, the fill, and the stroke of a shape at one instant on
 * a path the mount built, of its box or of a matte (D73, D75); `clearShapePath`
 * comes first.
 */
export function writeShapePath(path: Element, node: ShapeNodeState): void {
  path.setAttribute('d', pathData(node.path));
  const { fill, stroke } = node;
  path.setAttribute(
    'fill',
    fill.kind === 'none'
      ? 'none'
      : fill.kind === 'solid'
        ? fill.color
        : `url(#${gradientId(node.id)})`,
  );
  if (stroke === null) {
    path.setAttribute('stroke', 'none');
    return;
  }
  path.setAttribute('stroke', stroke.color);
  path.setAttribute('stroke-width', n(stroke.width));
  path.setAttribute('stroke-linecap', stroke.cap);
  path.setAttribute('stroke-linejoin', stroke.join);
  path.setAttribute('stroke-miterlimit', '4');
  if (stroke.dashArray === null) return;
  path.setAttribute('pathLength', '1000');
  path.setAttribute('stroke-dasharray', stroke.dashArray.map(n).join(' '));
  path.setAttribute('stroke-dashoffset', n(stroke.dashOffset));
}
