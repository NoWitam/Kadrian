/**
 * CSS text of evaluated and static values (D22). The one rule for numbers is
 * ECMAScript `Number::toString`: exactly specified and the shortest decimal that
 * reads back as the same double, so every engine writes the same text for the
 * same bits. Nothing is rounded or fixed to a number of digits.
 */
import type { Circle, Hole, Inset, TransformState, Vec2, Zoom } from '@kadrion/runtime';

/** `-0` becomes `"0"`; below 1e-6 the text has an exponent, a valid CSS number token. */
export function cssNumber(value: number): string {
  return String(value);
}

export function cssPixels(value: number): string {
  return `${cssNumber(value)}px`;
}

/**
 * Translate, then scale about the node's own top-left corner (D15): CSS applies
 * the list from the right, and the element's origin is `0px 0px`.
 */
export function cssTransform({ position, scale }: TransformState): string {
  const translate = `translate(${cssPixels(position.x)}, ${cssPixels(position.y)})`;
  return `${translate} scale(${cssNumber(scale.x)}, ${cssNumber(scale.y)})`;
}

/** A schema colour `#rrggbb` as the CSS Object Model serialises it: `rgb(r, g, b)`. */
export function cssColor(hex: string): string {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${channels.join(', ')})`;
}

/**
 * The `object-position` of a focus point (D63.2): per mille of the picture's
 * sides as a percentage, which CSS reads as the same fraction of the picture and
 * of the box, so the focus point lies at that fraction of the box. The centre,
 * 500 per mille, is `50% 50%`, the initial value the renderer had before 0.10.
 */
export function cssObjectPosition(focus: { readonly x: number; readonly y: number }): string {
  return `${cssNumber(focus.x / 10)}% ${cssNumber(focus.y / 10)}%`;
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
