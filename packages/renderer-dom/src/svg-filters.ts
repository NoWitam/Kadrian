/**
 * The effects drawn by SVG filters (D72): curves, a colour grade, a glow, a
 * vignette, and a chroma key. Each such effect has one `<filter>` element of
 * its own, in one hidden `<svg>` of the stage, and stands in the CSS `filter`
 * of its holder as `url("#…")` at its place in the list, between the CSS
 * functions of the other effects (D71.4).
 *
 * The mount writes the `<filter>` elements with their ID only; `renderState`
 * writes everything else on every call: the units, the region, the colour
 * space, and the primitives with the values of the instant, and it empties the
 * filter of an effect the state does not hold. A tree rendered at a state is
 * therefore that of a fresh mount rendered at it, whatever came before
 * (D54.3).
 *
 * Every filter works in sRGB, as the CSS filters do, so that its numbers mean
 * what they mean in a colour picker; its region is a square of 8 000 000
 * composition pixels about the holder's top-left corner, far beyond any
 * position a document can hold (D15), so nothing a blur spilled earlier in the
 * list is cut.
 */
import type { EffectState, SvgEffectState } from '@kadrion/runtime';
import type { Effect } from '@kadrion/schema';

import { cssNumber, filterId } from './css.js';

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** The hidden `<svg>` of the stage that holds the filters of the document's SVG effects. */
export const EFFECTS_ATTRIBUTE = 'data-kadrion-effects';

/** The kinds of effects drawn by an SVG filter (D72). */
export const SVG_EFFECT_KINDS = [
  'curves',
  'color-grade',
  'glow',
  'vignette',
  'chroma-key',
] as const;

/** Half the side of the region of every filter, in composition pixels (D72). */
export const FILTER_REACH = 4_000_000;

/** Whether an effect is drawn by an SVG filter of its own (D72). */
export function isSvgEffect<E extends Pick<Effect, 'kind'>>(
  effect: E,
): effect is Extract<E, { readonly kind: (typeof SVG_EFFECT_KINDS)[number] }> {
  return (SVG_EFFECT_KINDS as readonly string[]).includes(effect.kind);
}

/** Whether an evaluated effect is drawn by an SVG filter of its own (D72). */
export function isSvgEffectState(effect: EffectState): effect is SvgEffectState {
  return (SVG_EFFECT_KINDS as readonly string[]).includes(effect.kind);
}

/** An SVG element and its children, as the renderer writes them. */
interface Primitive {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children?: readonly Primitive[];
}

const n = cssNumber;

/** The three colour channels of a component transfer, each with the same function. */
function channels(attributes: Readonly<Record<string, string>>): Primitive[] {
  return ['feFuncR', 'feFuncG', 'feFuncB'].map((tag) => ({ tag, attributes }));
}

/**
 * Curves (D72): a table transfer per channel, then a mix of the result and the
 * pixels it was given by `amount`, on premultiplied values; a table leaves
 * alpha as it is.
 */
function curves(effect: Extract<SvgEffectState, { kind: 'curves' }>): Primitive[] {
  const table = (tag: string, levels: readonly number[]): Primitive => ({
    tag,
    attributes: { type: 'table', tableValues: levels.map(n).join(' ') },
  });
  return [
    {
      tag: 'feComponentTransfer',
      attributes: { in: 'SourceGraphic', result: 'curves' },
      children: [
        table('feFuncR', effect.red),
        table('feFuncG', effect.green),
        table('feFuncB', effect.blue),
      ],
    },
    {
      tag: 'feComposite',
      attributes: {
        in: 'curves',
        in2: 'SourceGraphic',
        operator: 'arithmetic',
        k1: '0',
        k2: n(effect.amount),
        k3: n(1 - effect.amount),
        k4: '0',
      },
    },
  ];
}

/**
 * A colour grade (D72): one matrix scales each channel by its white balance,
 * then maps black to `lift` and white to `gain`; a gamma transfer with the
 * exponent 1 / `gamma` then bends the mid-tones. Alpha is kept.
 */
function colorGrade(effect: Extract<SvgEffectState, { kind: 'color-grade' }>): Primitive[] {
  const { lift, gain } = effect;
  const balance = [1 + effect.temperature / 4, 1 - effect.tint / 4, 1 - effect.temperature / 4];
  const rows = balance.map((factor, channel) => {
    const row = [0, 0, 0, 0, lift];
    row[channel] = (gain - lift) * factor;
    return row;
  });
  rows.push([0, 0, 0, 1, 0]);
  return [
    {
      tag: 'feColorMatrix',
      attributes: {
        in: 'SourceGraphic',
        type: 'matrix',
        values: rows.map((row) => row.map(n).join(' ')).join(' '),
      },
    },
    {
      tag: 'feComponentTransfer',
      attributes: {},
      children: channels({
        type: 'gamma',
        amplitude: '1',
        exponent: n(1 / effect.gamma),
        offset: '0',
      }),
    },
  ];
}

/** A glow (D72): the alpha blurred by `radius`, filled with the colour, merged under the holder. */
function glow(effect: Extract<SvgEffectState, { kind: 'glow' }>): Primitive[] {
  return [
    {
      tag: 'feGaussianBlur',
      attributes: { in: 'SourceAlpha', stdDeviation: n(effect.radius), result: 'spread' },
    },
    {
      tag: 'feFlood',
      attributes: { 'flood-color': effect.color, 'flood-opacity': n(effect.opacity) },
    },
    { tag: 'feComposite', attributes: { in2: 'spread', operator: 'in', result: 'glow' } },
    {
      tag: 'feMerge',
      attributes: {},
      children: [
        { tag: 'feMergeNode', attributes: { in: 'glow' } },
        { tag: 'feMergeNode', attributes: { in: 'SourceGraphic' } },
      ],
    },
  ];
}

/**
 * A vignette (D72), in the units of the holder's box: a flat surface over the
 * box lit by a point light above its centre at the height `size` gives the
 * cosine of the angle to the light, I; the factor 1 − amount + amount · I⁴
 * (white outside the box) multiplies every premultiplied channel but alpha.
 */
function vignette(effect: Extract<SvgEffectState, { kind: 'vignette' }>): Primitive[] {
  const box = { x: '0', y: '0', width: '1', height: '1' };
  return [
    { tag: 'feFlood', attributes: { 'flood-color': '#ffffff', result: 'outside' } },
    { tag: 'feFlood', attributes: { 'flood-color': '#ffffff', ...box, result: 'flat' } },
    {
      tag: 'feDiffuseLighting',
      attributes: {
        in: 'flat',
        surfaceScale: '0',
        diffuseConstant: '1',
        'lighting-color': '#ffffff',
        ...box,
        result: 'light',
      },
      children: [{ tag: 'fePointLight', attributes: { x: '0.5', y: '0.5', z: n(effect.size) } }],
    },
    {
      tag: 'feComponentTransfer',
      attributes: { in: 'light', result: 'falloff' },
      children: channels({
        type: 'gamma',
        amplitude: n(effect.amount),
        exponent: '4',
        offset: n(1 - effect.amount),
      }),
    },
    {
      tag: 'feMerge',
      attributes: { result: 'factor' },
      children: [
        { tag: 'feMergeNode', attributes: { in: 'outside' } },
        { tag: 'feMergeNode', attributes: { in: 'falloff' } },
      ],
    },
    {
      tag: 'feComposite',
      attributes: {
        in: 'SourceGraphic',
        in2: 'factor',
        operator: 'arithmetic',
        k1: '1',
        k2: '0',
        k3: '0',
        k4: '0',
      },
    },
  ];
}

/**
 * A key by channel difference (D72). With K the key channel and O the mean of
 * the other two, d = K − O (at least 0); the matte is
 * 1 − (d − tolerance) / softness, held from 0 to 1. Spill multiplies K by
 * 1 − spill · d, so that only a pixel whose key channel exceeds the others
 * loses some of it. The result is the despilled pixels within the matte.
 */
function chromaKey(effect: Extract<SvgEffectState, { kind: 'chroma-key' }>): Primitive[] {
  const keyChannel = effect.key === 'green' ? 1 : 2;
  const difference = [-0.5, -0.5, -0.5];
  difference[keyChannel] = 1;
  const row = (values: readonly number[]): string => values.map(n).join(' ');
  const zero = [0, 0, 0, 0, 0];
  const one = [0, 0, 0, 0, 1];
  const spillRow = [...difference.map((weight) => -effect.spill * weight), 0, 1];
  const factor = [one, one, one, one];
  factor[keyChannel] = spillRow;
  return [
    {
      tag: 'feColorMatrix',
      attributes: {
        in: 'SourceGraphic',
        type: 'matrix',
        values: [zero, zero, zero, [...difference, 0, 0]].map(row).join(' '),
        result: 'difference',
      },
    },
    {
      tag: 'feComponentTransfer',
      attributes: { in: 'difference', result: 'matte' },
      children: [
        {
          tag: 'feFuncA',
          attributes: {
            type: 'linear',
            slope: n(-1 / effect.softness),
            intercept: n(1 + effect.tolerance / effect.softness),
          },
        },
      ],
    },
    {
      tag: 'feColorMatrix',
      attributes: {
        in: 'SourceGraphic',
        type: 'matrix',
        values: factor.map(row).join(' '),
        result: 'factor',
      },
    },
    {
      tag: 'feComposite',
      attributes: {
        in: 'SourceGraphic',
        in2: 'factor',
        operator: 'arithmetic',
        k1: '1',
        k2: '0',
        k3: '0',
        k4: '0',
        result: 'despilled',
      },
    },
    { tag: 'feComposite', attributes: { in: 'despilled', in2: 'matte', operator: 'in' } },
  ];
}

function primitives(effect: SvgEffectState): Primitive[] {
  switch (effect.kind) {
    case 'curves':
      return curves(effect);
    case 'color-grade':
      return colorGrade(effect);
    case 'glow':
      return glow(effect);
    case 'vignette':
      return vignette(effect);
    case 'chroma-key':
      return chromaKey(effect);
  }
}

function create(document: Document, primitive: Primitive): Element {
  const element = document.createElementNS(SVG_NAMESPACE, primitive.tag);
  for (const [name, value] of Object.entries(primitive.attributes)) {
    element.setAttribute(name, value);
  }
  for (const child of primitive.children ?? []) element.append(create(document, child));
  return element;
}

/** The attributes `renderState` writes on a `<filter>` element; the mount writes none of them. */
const FILTER_WRITTEN = [
  'filterUnits',
  'primitiveUnits',
  'x',
  'y',
  'width',
  'height',
  'color-interpolation-filters',
] as const;

/**
 * The hidden `<svg>` with one empty `<filter>` per SVG effect of the document,
 * in document order, or `null` when it has none, so that a document without
 * them mounts exactly the tree it mounted before (D72).
 */
export function effectFilters(document: Document, effectIds: readonly string[]): Element | null {
  if (effectIds.length === 0) return null;
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute(EFFECTS_ATTRIBUTE, '');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position: absolute; left: 0px; top: 0px;');
  const defs = document.createElementNS(SVG_NAMESPACE, 'defs');
  for (const id of effectIds) {
    const filter = document.createElementNS(SVG_NAMESPACE, 'filter');
    filter.setAttribute('id', filterId(id));
    defs.append(filter);
  }
  svg.append(defs);
  return svg;
}

/**
 * Writes the filter of every SVG effect of `effects` with its values at this
 * instant, and empties every other filter of `svg`, the attributes the mount
 * did not write included (D72).
 */
export function writeEffectFilters(
  svg: Element,
  effects: ReadonlyMap<string, SvgEffectState>,
): void {
  const document = svg.ownerDocument;
  for (const filter of svg.querySelectorAll('filter')) {
    const id = filter.getAttribute('id') ?? '';
    const effect = effects.get(id);
    if (effect === undefined) {
      for (const name of FILTER_WRITTEN) filter.removeAttribute(name);
      filter.replaceChildren();
      continue;
    }
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute(
      'primitiveUnits',
      effect.kind === 'vignette' ? 'objectBoundingBox' : 'userSpaceOnUse',
    );
    filter.setAttribute('x', n(-FILTER_REACH));
    filter.setAttribute('y', n(-FILTER_REACH));
    filter.setAttribute('width', n(2 * FILTER_REACH));
    filter.setAttribute('height', n(2 * FILTER_REACH));
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.replaceChildren(...primitives(effect).map((primitive) => create(document, primitive)));
  }
}
