/**
 * A number in a text (D91.2, PR-96): the format of a number on decimal
 * digits, the value of a text's number at an instant, the widest text it takes
 * over its lifetime, and its lines, in which every digit stands in a cell as
 * wide as the widest digit of its font.
 *
 * Every function is pure and takes its inputs as explicit arguments. `format`
 * works on the decimal digits of `Number::toString`, the shortest decimal that
 * round-trips to the same binary64 value, which ECMAScript specifies exactly;
 * it uses neither `Intl`, `toLocaleString`, `toFixed`, nor `toPrecision`, so
 * every engine writes the same characters (D24).
 */
import type { TextNode, TextNumberFormat } from '@kadrion/schema';

import { EvaluationError } from './errors.js';
import { isWhiteSpace } from './graphemes.js';
import { PROPERTY_BOUNDS, sampleNumberKeyframes } from './keyframes.js';
import {
  advanceOf,
  fitsWidth,
  textLinesHeight,
  unitsToPixels,
  type FontMetrics,
} from './text-frame.js';

// --- format (D91.2) ---------------------------------------------------------

/** How a number is written (D91.2): the fields of a text's number that `formatNumber` reads. */
export interface NumberFormat {
  /** The digits after the decimal separator, exactly, from 0 to 6. */
  readonly decimals: number;
  readonly decimalSeparator: string;
  /** What joins the groups of three digits of the integer part; `''` for none. */
  readonly groupSeparator: string;
}

/**
 * The decimal digits of a finite non-negative number and where its decimal
 * point lies: the number is `0.d₁d₂…dₙ × 10^point`. Read from
 * `Number::toString`, the shortest decimal that round-trips, which ECMAScript
 * specifies digit for digit; its exponent form (`1e-7`, `1.5e+21`) is read too.
 */
function decimalDigits(magnitude: number): { digits: string; point: number } {
  const written = String(magnitude);
  const [mantissa = '0', exponent = '0'] = written.split('e');
  const [whole = '0', fraction = ''] = mantissa.split('.');
  let digits = whole + fraction;
  let point = whole.length + Number(exponent);
  while (digits.length > 1 && digits.startsWith('0')) {
    digits = digits.slice(1);
    point -= 1;
  }
  return { digits, point };
}

/** A string of decimal digits plus one, with its carry: `'0999'` gives `'1000'`. */
function incremented(digits: string): string {
  const out = digits.split('');
  for (let at = out.length - 1; at >= 0; at -= 1) {
    if (out[at] !== '9') {
      out[at] = String(Number(out[at]) + 1);
      return out.join('');
    }
    out[at] = '0';
  }
  return `1${out.join('')}`;
}

/**
 * A number as a text shows it (D91.2): rounded half away from zero to
 * `decimals` digits, its integer part in groups of three joined by the group
 * separator, and exactly `decimals` digits after the decimal separator; a
 * negative value starts with `-` (U+002D), unless it rounds to zero, which has
 * no sign.
 *
 * The rounding works on the decimal digits of `Number::toString`, the
 * shortest decimal that names the same binary64 value: the digit after the
 * last one kept decides, 5 to 9 away from zero. So `1.005` with two decimals
 * is `1.01`, as it is written, although its binary value lies just below
 * 1.005; and `0.1 + 0.2`, written `0.30000000000000004`, is `0.30`.
 */
export function formatNumber(value: number, format: NumberFormat): string {
  if (!Number.isFinite(value)) {
    throw new EvaluationError('invalid-document', `A number must be finite, got ${String(value)}.`);
  }
  const { decimals, decimalSeparator, groupSeparator } = format;
  let { digits, point } = decimalDigits(value < 0 ? -value : value);
  // At least one digit before the point, and one past the last digit kept.
  if (point < 1) {
    digits = '0'.repeat(1 - point) + digits;
    point = 1;
  }
  const kept = point + decimals;
  if (digits.length <= kept) digits += '0'.repeat(kept + 1 - digits.length);
  let rounded = digits.slice(0, kept);
  if ((digits.charCodeAt(kept) || 0x30) >= 0x35) {
    rounded = incremented(rounded);
    if (rounded.length > kept) point += 1;
  }
  const integer = rounded.slice(0, point).replace(/^0+(?=\d)/, '');
  const fraction = rounded.slice(point);
  let grouped = '';
  for (let end = integer.length; end > 0; end -= 3) {
    const group = integer.slice(Math.max(0, end - 3), end);
    grouped = grouped === '' ? group : `${group}${groupSeparator}${grouped}`;
  }
  const zero = !/[1-9]/.test(rounded);
  const sign = value < 0 && !zero ? '-' : '';
  return `${sign}${grouped}${decimals > 0 ? `${decimalSeparator}${fraction}` : ''}`;
}

/** What a text with a number shows for `value` (D91.2): `prefix + formatNumber(value) + suffix`. */
export function numberText(number: TextNumberFormat, value: number): string {
  return `${number.prefix}${formatNumber(value, number)}${number.suffix}`;
}

// --- the value (D65.1, D91.2) -----------------------------------------------

/** A text node that shows a number (D91.2). */
export type NumberTextNode = TextNode & { readonly number: TextNumberFormat };

/** Whether a text shows a number (D91.2). */
export function hasNumber(node: TextNode): node is NumberTextNode {
  return node.number.kind === 'number';
}

/** The `number` animation of a text, when it has one (D65.1, D91.2). */
function numberAnimation(
  node: TextNode,
): Extract<TextNode['animations'][number], { property: 'number' }> | undefined {
  return node.animations.find(
    (animation): animation is Extract<TextNode['animations'][number], { property: 'number' }> =>
      animation.property === 'number',
  );
}

/**
 * The value of a text's number at `timeUs` (D65.1, D91.2): the sample of its
 * `number` animation, which replaces the value, by the curves of D67, or its
 * own value without one. It is rounded only when it is written.
 */
export function numberValueAt(node: NumberTextNode, timeUs: number): number {
  const animation = numberAnimation(node);
  if (animation === undefined) return node.number.value;
  return sampleNumberKeyframes(animation.keyframes, PROPERTY_BOUNDS.number, timeUs);
}

/** Holds `value` within the bounds of the row `number`. */
function held(value: number): number {
  const { min, max } = PROPERTY_BOUNDS.number;
  if (value < min) return min;
  return value > max ? max : value;
}

/**
 * The values that bound every value a text's number takes (D91.2): its own
 * value, every keyframe value, and, for a segment eased by a cubic Bézier
 * whose control values leave 0 to 1, the values of its extreme control
 * values, `a + (b − a) · y`, held within the bounds of the row. A curve
 * bounds its values by the hull of its control points, so every value of a
 * segment lies between two of these; every other curve of D67 stays between
 * its keyframes (D67.4). The box this yields may be wider than the widest
 * text a Bézier that overshoots actually shows, never narrower.
 */
export function numberExtremes(node: NumberTextNode): number[] {
  const values = [node.number.value];
  const animation = numberAnimation(node);
  if (animation === undefined) return values;
  const { keyframes } = animation;
  keyframes.forEach((keyframe, index) => {
    values.push(keyframe.value);
    const next = keyframes[index + 1];
    const { easing } = keyframe;
    if (next === undefined || easing.kind !== 'cubic-bezier') return;
    const a = keyframe.value;
    const b = next.value;
    for (const y of [easing.y1, easing.y2]) {
      if (y < 0 || y > 1) values.push(held(a + (b - a) * y));
    }
  });
  return values;
}

// --- the measure in cells (D91.2) -------------------------------------------

/** Whether a code point is a digit 0 to 9, which stands in a cell (D91.2). */
export function isDigit(codePoint: number): boolean {
  return codePoint >= 0x30 && codePoint <= 0x39;
}

/** The advance of a cell of a digit in font units: the widest advance of the digits 0 to 9 (D91.2). */
export function digitCellUnits(metrics: FontMetrics): number {
  let widest = 0;
  for (let digit = 0x30; digit <= 0x39; digit += 1) {
    const advance = advanceOf(metrics, digit);
    if (advance > widest) widest = advance;
  }
  return widest;
}

/** The width of a run in font units with every digit in a cell of `cell` units (D91.2). */
export function measureInCells(text: string, metrics: FontMetrics, cell: number): number {
  let units = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    units += isDigit(codePoint) ? cell : advanceOf(metrics, codePoint);
  }
  return units;
}

// --- the lines (D83.5, D91.2) -----------------------------------------------

/** A line of a text drawn from its offsets in the text, in UTF-16 code units, and its width. */
interface Span {
  readonly start: number;
  readonly end: number;
  readonly units: number;
}

/**
 * The lines of `text` (D83.5), as spans of it: split at its line feeds, and
 * with a `width` wrapped greedily by the rule of `textLines`, every digit
 * measured as a cell. The number, from `numberStart` to `numberEnd`, is one
 * word whatever separators it has: a line never breaks inside it.
 */
function wrappedSpans(
  text: string,
  numberStart: number,
  numberEnd: number,
  fontSize: number,
  width: number | null,
  metrics: FontMetrics,
  cell: number,
): Span[] {
  const fits = (units: number): boolean =>
    width === null || fitsWidth(units, fontSize, width, metrics);
  const out: Span[] = [];
  let lineStart = 0;
  for (const line of text.split('\n')) {
    // The runs of the line: white space, or a word, which the number never leaves.
    const runs: { readonly space: boolean; readonly start: number; end: number; units: number }[] =
      [];
    let offset = lineStart;
    for (const character of line) {
      const codePoint = character.codePointAt(0) ?? 0;
      const space = isWhiteSpace(codePoint) && (offset < numberStart || offset >= numberEnd);
      const units = isDigit(codePoint) ? cell : advanceOf(metrics, codePoint);
      const last = runs[runs.length - 1];
      if (last !== undefined && last.space === space) {
        last.end = offset + character.length;
        last.units += units;
      } else runs.push({ space, start: offset, end: offset + character.length, units });
      offset += character.length;
    }
    let start = lineStart;
    let end = lineStart;
    let units = 0;
    let hasWord = false;
    let pending: (typeof runs)[number] | null = null;
    for (const run of runs) {
      if (run.space) {
        if (hasWord) pending = run;
        else {
          end = run.end;
          units += run.units;
        }
        continue;
      }
      if (!hasWord) {
        end = run.end;
        units += run.units;
        hasWord = true;
        continue;
      }
      const joined = units + (pending?.units ?? 0) + run.units;
      if (fits(joined)) {
        end = run.end;
        units = joined;
      } else {
        out.push({ start, end, units });
        start = run.start;
        end = run.end;
        units = run.units;
      }
      pending = null;
    }
    if (pending !== null && fits(units + pending.units)) {
      end = pending.end;
      units += pending.units;
    }
    out.push({ start, end, units });
    lineStart += line.length + 1;
  }
  return out;
}

/** One line of a text with a number, in composition pixels from the top-left corner of its box (D91.2). */
export interface NumberTextLine {
  /** What the line draws. */
  readonly text: string;
  /** Its width in font units, every digit in a cell. */
  readonly units: number;
  /** Its width in composition pixels. */
  readonly width: number;
  /** Its left edge, as the style's `align` places it in the box (D83.4). */
  readonly x: number;
  /** Its top edge, as `verticalAlign` places the block of lines in a frame (D83.4). */
  readonly y: number;
}

/** The lines of a text with a number at one value, in the box of its widest text (D91.2). */
export interface NumberTextLayout {
  /** What the text shows: `prefix + formatNumber(value) + suffix`. */
  readonly text: string;
  readonly lines: readonly NumberTextLine[];
  /** The box of the node: its frame, or the block of the lines of its widest text. */
  readonly width: number;
  readonly height: number;
  /** The width of the cell of a digit, in composition pixels. */
  readonly cell: number;
  /**
   * The block of the lines of the widest text, where the box of the text's
   * style lies (D69, D83.3): it does not move as the value changes.
   */
  readonly block: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** The share of the free space before a line or a block: 0, a half, or all of it. */
function share(align: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): number {
  if (align === 'center' || align === 'middle') return 0.5;
  return align === 'right' || align === 'bottom' ? 1 : 0;
}

/**
 * The widest text a text with a number takes over its lifetime (D91.2): the
 * text of the value of `numberExtremes` whose number is the widest in cells,
 * the first of them on a tie. The width of a number in cells grows with its
 * count of integer digits and with its sign, both of which grow with the
 * distance of the value from zero on each side of it, so a value between two
 * of these is never wider than both.
 */
export function widestNumberText(node: NumberTextNode, metrics: FontMetrics): string {
  const cell = digitCellUnits(metrics);
  let widest = '';
  let widestUnits = -1;
  for (const value of numberExtremes(node)) {
    const formatted = formatNumber(value, node.number);
    const units = measureInCells(formatted, metrics, cell);
    if (units > widestUnits) {
      widest = formatted;
      widestUnits = units;
    }
  }
  return `${node.number.prefix}${widest}${node.number.suffix}`;
}

/**
 * The lines of a text with a number showing `value` (D83.5, D91.2). Its box
 * and lines are those of its widest text (`widestNumberText`): without a
 * frame, its lines are those of its line feeds and its box is as wide as the
 * widest of them; with a frame, the widest text wraps to the frame's width by
 * the rule of `textLines`, the number never broken. The text of `value` takes
 * the same lines — the same breaks in its prefix and its suffix — so the lines
 * never change as the value does, and each lies in the box as the style's
 * `align` and `verticalAlign` say. Every digit stands in a cell as wide as
 * the widest digit of the font; every other character keeps its advance.
 */
export function numberTextLayout(
  node: NumberTextNode,
  value: number,
  metrics: FontMetrics,
): NumberTextLayout {
  const { fontSize, frame, style } = node;
  const { prefix, suffix } = node.number;
  const cell = digitCellUnits(metrics);
  const widest = widestNumberText(node, metrics);
  const shown = numberText(node.number, value);
  const fixed = frame.kind === 'fixed' ? frame : null;
  const numberStart = prefix.length;
  const widestEnd = widest.length - suffix.length;
  const spans = wrappedSpans(
    widest,
    numberStart,
    widestEnd,
    fontSize,
    fixed?.width ?? null,
    metrics,
    cell,
  );
  // An offset of the widest text in the text shown: the number lies between the same prefix and suffix.
  const shift = shown.length - widest.length;
  const mapped = (offset: number): number => (offset < widestEnd ? offset : offset + shift);
  const px = (units: number): number => unitsToPixels(units, fontSize, metrics);
  const widestWidth = Math.max(0, ...spans.map((span) => px(span.units)));
  const boxWidth = fixed?.width ?? widestWidth;
  const blockHeight = textLinesHeight(spans.length, fontSize);
  const top = fixed === null ? 0 : (fixed.height - blockHeight) * share(style.verticalAlign);
  const lines = spans.map((span, index): NumberTextLine => {
    const text = shown.slice(mapped(span.start), mapped(span.end));
    const units = measureInCells(text, metrics, cell);
    const width = px(units);
    return {
      text,
      units,
      width,
      x: (boxWidth - width) * share(style.align),
      y: top + textLinesHeight(index, fontSize),
    };
  });
  const left = Math.min(...spans.map((span) => (boxWidth - px(span.units)) * share(style.align)));
  return {
    text: shown,
    lines,
    width: boxWidth,
    height: fixed?.height ?? blockHeight,
    cell: px(cell),
    block: { x: left, y: top, width: widestWidth, height: blockHeight },
  };
}
