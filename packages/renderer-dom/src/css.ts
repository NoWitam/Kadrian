/**
 * CSS text of evaluated and static values (D22). The one rule for numbers is
 * ECMAScript `Number::toString`: exactly specified and the shortest decimal that
 * reads back as the same double, so every engine writes the same text for the
 * same bits. Nothing is rounded or fixed to a number of digits.
 */
import type { Circle, CropState, Hole, Inset, TransformState, Vec2, Zoom } from '@kadrion/runtime';

/** `-0` becomes `"0"`; below 1e-6 the text has an exponent, a valid CSS number token. */
export function cssNumber(value: number): string {
  return String(value);
}

export function cssPixels(value: number): string {
  return `${cssNumber(value)}px`;
}

/**
 * The node's own transform (D15, D68), with the element's `transform-origin`
 * at `0px 0px`: translate the top-left corner to the position, then rotate and
 * scale about the origin point. CSS applies the list from the right, so the
 * origin is first moved to the corner (`translate(-x%, -y%)`, in per cent of
 * the element's own box), scaled, rotated, and moved back. A part that is the
 * identity for every value it can take is left out: no pivot while the origin
 * is the top-left corner, no rotation while it is 0, so a node of 0.12 is
 * written exactly as before.
 */
export function cssTransform({ position, scale, rotation, origin }: TransformState): string {
  const parts = [`translate(${cssPixels(position.x)}, ${cssPixels(position.y)})`];
  const pivot = origin.x !== 0 || origin.y !== 0;
  if (pivot) parts.push(`translate(${cssPercent(origin.x)}, ${cssPercent(origin.y)})`);
  if (rotation !== 0) parts.push(`rotate(${cssNumber(rotation)}deg)`);
  parts.push(`scale(${cssNumber(scale.x)}, ${cssNumber(scale.y)})`);
  if (pivot) parts.push(`translate(${cssPercent(-origin.x)}, ${cssPercent(-origin.y)})`);
  return parts.join(' ');
}

/** Per mille as a CSS percentage: `x / 10` per cent (D63.2, D68). */
export function cssPercent(permille: number): string {
  return `${cssNumber(permille / 10)}%`;
}

/**
 * The crop of a picture as CSS `object-view-box` (D68): the part of the
 * picture that `object-fit` and `object-position` then treat as the whole
 * picture, as insets in per cent of its natural size from each edge. The
 * insets are written in the shortest form, as the CSS Object Model serialises
 * them: a left equal to the right is left out, then a bottom equal to the top,
 * then a right equal to the top (D22).
 */
export function cssViewBox(crop: CropState): string {
  const sides = [crop.fromTop, crop.fromRight, crop.fromBottom, crop.fromLeft].map(cssPercent);
  const [top, right, bottom] = sides;
  if (sides[3] === right) {
    sides.pop();
    if (bottom === top) {
      sides.pop();
      if (right === top) sides.pop();
    }
  }
  return `inset(${sides.join(' ')})`;
}

/** A schema colour `#rrggbb` as the CSS Object Model serialises it: `rgb(r, g, b)`. */
export function cssColor(hex: string): string {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${channels.join(', ')})`;
}

/**
 * A schema colour with an opacity (D69), as the CSS Object Model serialises
 * it: `rgb(r, g, b)` when opaque, `rgba(r, g, b, a)` otherwise.
 */
export function cssTranslucent(hex: string, opacity: number): string {
  if (opacity === 1) return cssColor(hex);
  return `${cssColor(hex).replace('rgb(', 'rgba(').slice(0, -1)}, ${cssNumber(opacity)})`;
}

/**
 * The transform of a fragment of a text (D69), about the fragment's own centre
 * (the initial `transform-origin` of its element): moved by its offset, then
 * rotated, then scaled, as CSS applies the list from the right. Every part is
 * written, at rest too, so that a fragment never changes how it is drawn.
 */
export function cssFragmentTransform(fragment: {
  readonly offset: Vec2;
  readonly rotation: number;
  readonly scale: Vec2;
}): string {
  const { offset, rotation, scale } = fragment;
  return `translate(${cssPixels(offset.x)}, ${cssPixels(offset.y)}) rotate(${cssNumber(rotation)}deg) scale(${cssNumber(scale.x)}, ${cssNumber(scale.y)})`;
}

/**
 * The `object-position` of a focus point (D63.2): per mille of the picture's
 * sides as a percentage, which CSS reads as the same fraction of the picture and
 * of the box, so the focus point lies at that fraction of the box. The centre,
 * 500 per mille, is `50% 50%`, the initial value the renderer had before 0.10.
 */
export function cssObjectPosition(focus: { readonly x: number; readonly y: number }): string {
  return `${cssPercent(focus.x)} ${cssPercent(focus.y)}`;
}

/** The font family a text node names (D22.6); asset IDs are valid CSS identifier characters. */
export function fontFamily(fontAssetId: string): string {
  return `kadrion-font-${fontAssetId}`;
}

/** What a scene transition cuts away of a scene, as CSS `clip-path` (D56). */
export function cssInset(inset: Inset): string {
  const sides = [inset.fromTop, inset.fromRight, inset.fromBottom, inset.fromLeft];
  return `inset(${sides.map(cssPixels).join(' ')})`;
}

/**
 * What a transition moves a side by, as the start of a CSS `transform` (D56,
 * D66): the offset, then a scale about a point of the frame. CSS applies the
 * list from the right, so both act after whatever follows them, the node's own
 * transform included. Empty when the transition moves nothing.
 */
export function cssTransitionTransform(moved: {
  readonly offset?: Vec2 | undefined;
  readonly zoom?: Zoom | undefined;
}): string {
  const parts: string[] = [];
  if (moved.offset !== undefined) {
    parts.push(`translate(${cssPixels(moved.offset.x)}, ${cssPixels(moved.offset.y)})`);
  }
  if (moved.zoom !== undefined) {
    const { factor, center } = moved.zoom;
    parts.push(
      `translate(${cssPixels(center.x)}, ${cssPixels(center.y)})`,
      `scale(${cssNumber(factor)})`,
      `translate(${cssPixels(-center.x)}, ${cssPixels(-center.y)})`,
    );
  }
  return parts.join(' ');
}

/** The circle of the frame a side is cut to, as CSS `clip-path` (D66). */
export function cssCircle(circle: Circle): string {
  return `circle(${cssPixels(circle.radius)} at ${cssPixels(circle.x)} ${cssPixels(circle.y)})`;
}

/**
 * The frame less a circle, as CSS `clip-path` (D66): one path of the frame's
 * rectangle and the circle as two half arcs, filled by the even-odd rule, so
 * that the inside of the circle is cut away. Numbers in the path are user
 * units, which are composition pixels here.
 */
export function cssHole(hole: Hole): string {
  const n = cssNumber;
  const { x, y, radius: r } = hole;
  const rectangle = `M0 0H${n(hole.width)}V${n(hole.height)}H0Z`;
  const circle = `M${n(x - r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x + r)} ${n(y)}A${n(r)} ${n(r)} 0 1 0 ${n(x - r)} ${n(y)}Z`;
  return `path(evenodd, "${rectangle}${circle}")`;
}
