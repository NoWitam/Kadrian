/**
 * Masks and mattes (D65.6, D75). Every mask is an SVG `<mask>` in one hidden
 * `<svg>` of the stage, which the masked element names in its CSS `mask`; the
 * probes of D65 found an SVG mask on an HTML element exact. Its region is the
 * square of `FILTER_REACH` about the element's top-left corner, the region of
 * the effects' filters (D72), and its content is in the pixels of the element's
 * box, before its transform, as CSS masking lays out a mask of user space.
 *
 * Every mask is a luminance mask whose content is white where the node shows:
 *
 * - a shape mask is its path, white, or, inverted, a black path over a white
 *   square as large as the region; the feather is a CSS `blur()` of the path;
 * - an image mask is the image stretched over its box: `brightness(0)
 *   invert(1)` makes it white where it is opaque (alpha), and nothing changes
 *   it in luminance mode; inverted, `brightness(0)` or `invert(1)` over a white
 *   square gives one less the alpha or one less the luminance times the alpha;
 * - a matte (D75) draws its sibling shape, with that shape's transform,
 *   opacity, effects, and visibility, into the mask of a canvas-sized frame
 *   around the masked node, in the space of their parent, by the same rules.
 *
 * An SVG mask paints no HTML (the pinned Chromium does not paint a
 * `<foreignObject>` inside a `<mask>`), so a matte is a shape node, drawn here
 * as the path of its own `<svg>`; its gradient is that of its own element,
 * which stays mounted and hidden.
 *
 * The mount writes everything static: the masks with their IDs and regions,
 * the squares, the mode filters, an image's source and box, and a shape's fill
 * rule. `renderState` writes on every call what the instant decides — the path,
 * the feather, the matte's transform, opacity, effects, visibility, fill, and
 * stroke — and removes them for a node the state does not evaluate, so a tree
 * rendered at a state is that of a fresh mount rendered at it (D54.3).
 */
import type { MaskState, ShapeNodeState } from '@kadrion/runtime';
import type { GroupNode, SceneNode, ShapeNode, ValidatedComposition } from '@kadrion/schema';

import type { AssetUrls } from './assets.js';
import { cssFilter, cssNumber, cssPixels } from './css.js';
import { siblingLists } from './nested.js';
import { pathData, writeShapePath, clearShapePath } from './shapes.js';
import { FILTER_REACH, SVG_NAMESPACE } from './svg-filters.js';

/** The hidden `<svg>` of the stage that holds the masks and mattes of the document (D75). */
export const MASKS_ATTRIBUTE = 'data-kadrion-masks';
/**
 * The frame of a matte around the node it mattes (D75): a canvas-sized box at
 * the origin of the node's parent, holding the node alone. It carries the ID of
 * its node.
 */
export const MATTE_FRAME_ATTRIBUTE = 'data-kadrion-matte-frame';
/** The element of a node that is the matte of a sibling, which is never drawn by itself (D75). */
export const MATTE_ATTRIBUTE = 'data-kadrion-matte';
/** The element of a mask that `renderState` writes on. */
const CONTENT_ATTRIBUTE = 'data-kadrion-mask-content';

/** The ID of the mask of a node; IDs are unique in the document (D16). */
export function maskId(nodeId: string): string {
  return `kadrion-mask-${nodeId}`;
}

/** The ID of the mask a node's matte is drawn into (D75). */
export function matteId(nodeId: string): string {
  return `kadrion-matte-${nodeId}`;
}

/** A mask as the value of CSS `mask`, as the CSS Object Model serialises it. */
export function cssMask(id: string): string {
  return `url("#${id}")`;
}

type Node = SceneNode | GroupNode['children'][number];
type Mode = 'alpha' | 'alpha-inverted' | 'luminance' | 'luminance-inverted';

/** The filter that makes a drawing white where it shows the node, by mode (D75). */
const MODE_FILTERS: Readonly<Record<Mode, string | null>> = Object.freeze({
  alpha: 'brightness(0) invert(1)',
  'alpha-inverted': 'brightness(0)',
  luminance: null,
  'luminance-inverted': 'invert(1)',
});

function svgElement(
  document: Document,
  tag: string,
  attributes: Readonly<Record<string, string>>,
): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

/** A `<mask>` whose region is that of the effects' filters, in the pixels of the masked box. */
function maskElement(document: Document, id: string): SVGElement {
  return svgElement(document, 'mask', {
    id,
    maskUnits: 'userSpaceOnUse',
    x: cssNumber(-FILTER_REACH),
    y: cssNumber(-FILTER_REACH),
    width: cssNumber(2 * FILTER_REACH),
    height: cssNumber(2 * FILTER_REACH),
  });
}

/** White over the whole region: what an inverted mask shows where nothing covers it. */
function whiteSquare(document: Document): SVGElement {
  return svgElement(document, 'rect', {
    x: cssNumber(-FILTER_REACH),
    y: cssNumber(-FILTER_REACH),
    width: cssNumber(2 * FILTER_REACH),
    height: cssNumber(2 * FILTER_REACH),
    fill: '#ffffff',
  });
}

function modeOf(mask: { readonly mode: 'alpha' | 'luminance'; readonly inverted: boolean }): Mode {
  return mask.inverted ? `${mask.mode}-inverted` : mask.mode;
}

/** The `<mask>` of a node's own mask, with everything static (D75). */
function ownMask(
  document: Document,
  node: Node & {
    readonly mask: Exclude<Extract<Node, { mask: unknown }>['mask'], { kind: 'none' }>;
  },
  urls: AssetUrls,
): SVGElement {
  const mask = maskElement(document, maskId(node.id));
  const { mask: value } = node;
  if (value.inverted) mask.append(whiteSquare(document));
  if (value.kind === 'shape') {
    mask.append(
      svgElement(document, 'path', {
        [CONTENT_ATTRIBUTE]: '',
        transform: `translate(${cssNumber(value.x)} ${cssNumber(value.y)})`,
        fill: value.inverted ? '#000000' : '#ffffff',
        'fill-rule': value.geometry.kind === 'path' ? value.geometry.fillRule : 'nonzero',
      }),
    );
    return mask;
  }
  mask.append(
    svgElement(document, 'image', {
      [CONTENT_ATTRIBUTE]: '',
      href: urls[value.assetId] ?? '',
      x: cssNumber(value.x),
      y: cssNumber(value.y),
      width: cssNumber(value.width),
      height: cssNumber(value.height),
      preserveAspectRatio: 'none',
    }),
  );
  return mask;
}

/** The `<mask>` a node's matte is drawn into, with everything static (D75). */
function matteMask(document: Document, holderId: string, mode: Mode, matte: ShapeNode): SVGElement {
  const mask = maskElement(document, matteId(holderId));
  if (mode.endsWith('-inverted')) mask.append(whiteSquare(document));
  const filtered = svgElement(document, 'g', {});
  const filter = MODE_FILTERS[mode];
  if (filter !== null) filtered.style.setProperty('filter', filter);
  const content = svgElement(document, 'g', { [CONTENT_ATTRIBUTE]: '' });
  content.append(
    svgElement(document, 'path', {
      'fill-rule': matte.geometry.kind === 'path' ? matte.geometry.fillRule : 'nonzero',
    }),
  );
  filtered.append(content);
  mask.append(filtered);
  return mask;
}

/**
 * The siblings of every parent of the document: the nodes of each scene, the
 * children of each group, and the nodes inside each instance by their paths (D76).
 */
function parentsOf(composition: ValidatedComposition): (readonly Node[])[] {
  return siblingLists(composition).map(({ nodes }) => nodes);
}

/** The IDs of the nodes that matte a sibling (D75). */
export function matteIds(composition: ValidatedComposition): Set<string> {
  const ids = new Set<string>();
  for (const siblings of parentsOf(composition)) {
    for (const node of siblings) {
      if ('matte' in node && node.matte.kind === 'node') ids.add(node.matte.nodeId);
    }
  }
  return ids;
}

/**
 * The hidden `<svg>` of the masks and mattes of the document, in document
 * order, or `null` when no node has either (D75).
 */
export function maskDefinitions(
  document: Document,
  composition: ValidatedComposition,
  urls: AssetUrls,
): Element | null {
  const masks: SVGElement[] = [];
  for (const siblings of parentsOf(composition)) {
    for (const node of siblings) {
      if (!('mask' in node)) continue;
      if (node.mask.kind !== 'none') {
        masks.push(ownMask(document, node as Parameters<typeof ownMask>[1], urls));
      }
      const { matte } = node;
      if (matte.kind !== 'node') continue;
      const target = siblings.find((sibling) => sibling.id === matte.nodeId);
      // Validation guarantees a sibling shape (D75).
      if (target?.type === 'shape') masks.push(matteMask(document, node.id, matte.mode, target));
    }
  }
  if (masks.length === 0) return null;
  const svg = svgElement(document, 'svg', {
    [MASKS_ATTRIBUTE]: '',
    width: '0',
    height: '0',
    'aria-hidden': 'true',
    style: 'position: absolute; left: 0px; top: 0px;',
  });
  const defs = svgElement(document, 'defs', {});
  defs.append(...masks);
  svg.append(defs);
  return svg;
}

/** What `renderState` writes into the masks: by mask ID, a node's own mask or the state of its matte. */
export type MaskWrites = ReadonlyMap<string, MaskState | ShapeNodeState>;

/** The declarations `renderState` writes on the content of a mask. */
const CONTENT_WRITTEN = ['filter', 'transform', 'opacity', 'visibility'] as const;

/**
 * The transform of a matte inside its mask (D75): that of its element (D15,
 * D68), with the origin in pixels of its box, since a percentage of an SVG
 * element is one of the viewport.
 */
function svgTransform(node: ShapeNodeState): string {
  const { position, scale, rotation, origin, size } = node;
  const parts = [`translate(${cssPixels(position.x)}, ${cssPixels(position.y)})`];
  const x = (origin.x / 1000) * size.width;
  const y = (origin.y / 1000) * size.height;
  const pivot = origin.x !== 0 || origin.y !== 0;
  if (pivot) parts.push(`translate(${cssPixels(x)}, ${cssPixels(y)})`);
  if (rotation !== 0) parts.push(`rotate(${cssNumber(rotation)}deg)`);
  parts.push(`scale(${cssNumber(scale.x)}, ${cssNumber(scale.y)})`);
  if (pivot) parts.push(`translate(${cssPixels(-x)}, ${cssPixels(-y)})`);
  return parts.join(' ');
}

/** The feather of a mask as a CSS function, or nothing at 0 (D75). */
function featherOf(feather: number): string[] {
  return feather === 0 ? [] : [`blur(${cssPixels(feather)})`];
}

function clear(content: SVGElement): void {
  for (const property of CONTENT_WRITTEN) content.style.removeProperty(property);
  if (content.tagName === 'path') content.removeAttribute('d');
  const path = content.tagName === 'g' ? content.querySelector('path') : null;
  if (path !== null) clearShapePath(path);
  if (content.getAttribute('style') === '') content.removeAttribute('style');
}

/**
 * Writes every mask of `svg` at this instant, and clears the content of every
 * mask that `writes` does not hold, back to the mount (D75).
 */
export function writeMasks(svg: Element, writes: MaskWrites): void {
  for (const mask of svg.querySelectorAll('mask')) {
    const content = mask.querySelector<SVGElement>(`[${CONTENT_ATTRIBUTE}]`);
    if (content === null) continue;
    clear(content);
    const value = writes.get(mask.getAttribute('id') ?? '');
    if (value === undefined) continue;
    if ('type' in value) {
      // A matte: its sibling shape as its element draws it (D73, D75).
      const path = content.querySelector('path');
      if (path === null) continue;
      content.style.setProperty('transform', svgTransform(value));
      content.style.setProperty('opacity', cssNumber(value.opacity));
      const filter = cssFilter(value.effects, undefined);
      if (filter !== null) content.style.setProperty('filter', filter);
      if (!value.active) content.style.setProperty('visibility', 'hidden');
      writeShapePath(path, value);
      continue;
    }
    switch (value.kind) {
      case 'shape': {
        content.setAttribute('d', pathData(value.path));
        const feather = featherOf(value.feather);
        if (feather.length > 0) content.style.setProperty('filter', feather.join(' '));
        break;
      }
      case 'image': {
        const mode = MODE_FILTERS[modeOf(value)];
        const filter = [...featherOf(value.feather), ...(mode === null ? [] : [mode])];
        if (filter.length > 0) content.style.setProperty('filter', filter.join(' '));
        break;
      }
      case 'none':
        break;
    }
  }
}
