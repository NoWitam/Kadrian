/**
 * A number in a text (D91.2, PR-96): `formatNumber` on decimal digits, half
 * away from zero, in groups of three, without a sign for a zero; the value at
 * an instant by the row `number`, which replaces it; the extremes that bound
 * it, a Bézier that overshoots included; the box and the lines of the widest
 * text, every digit in a cell, which do not move as the value changes; and
 * the evaluation of the fixture of numbers, whose fragments are those of the
 * text it shows.
 */
import { validateComposition, type TextNode, type ValidatedComposition } from '@kadrion/schema';
import { generateNumeralFont, numberComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  digitCellUnits,
  EvaluationError,
  evaluateComposition,
  fontMetrics,
  formatNumber,
  measureInCells,
  numberExtremes,
  numberText,
  numberTextLayout,
  numberValueAt,
  widestNumberText,
  type FontMetrics,
  type NumberTextNode,
  type TextNodeState,
} from '../src/index.js';
import { measuredNodes } from '../src/text-frame.js';
import { hasNumber } from '../src/text-number.js';

const FONT_ID = 'asset-font-numerals';
const METRICS = fontMetrics(generateNumeralFont());
const FONTS: ReadonlyMap<string, FontMetrics> = new Map([[FONT_ID, METRICS]]);

function validated(input: unknown): ValidatedComposition {
  const result = validateComposition(input);
  if (!result.ok) throw new Error(`Invalid: ${JSON.stringify(result.errors.slice(0, 3))}`);
  return result.composition;
}

const composition = validated(numberComposition);

function textNode(id: string): NumberTextNode {
  for (const node of composition.scenes[0]?.nodes ?? []) {
    if (node.id === id && node.type === 'text' && hasNumber(node)) return node;
  }
  throw new Error(`No number ${id}.`);
}

function textState(timeUs: number, id: string): TextNodeState {
  const node = evaluateComposition(composition, timeUs, FONTS).scenes[0]?.nodes.find(
    (each) => each.id === id,
  );
  if (node?.type !== 'text') throw new Error(`No text ${id}.`);
  return node;
}

const DOT = { decimals: 2, decimalSeparator: '.', groupSeparator: ',' } as const;
const COMMA = { decimals: 2, decimalSeparator: ',', groupSeparator: ' ' } as const;

describe('formatNumber (D91.2)', () => {
  it.each([
    [0, COMMA, '0,00'],
    [1_234_567.89, COMMA, '1 234 567,89'],
    [1_234_567.89, { ...COMMA, groupSeparator: '' }, '1234567,89'],
    [1_234_567.89, { ...COMMA, groupSeparator: ' ' }, '1 234 567,89'],
    [1_234_567.89, { ...DOT, groupSeparator: "'" }, "1'234'567.89"],
    [999_999.999, DOT, '1,000,000.00'],
    [123, DOT, '123.00'],
    [1234, DOT, '1,234.00'],
    [-1234.5, { ...DOT, decimals: 0 }, '-1,235'],
    [1.005, DOT, '1.01'],
    [0.1 + 0.2, DOT, '0.30'],
    [2.5, { ...DOT, decimals: 0 }, '3'],
    [-2.5, { ...DOT, decimals: 0 }, '-3'],
    [2.4999, { ...DOT, decimals: 0 }, '2'],
    [-0.004, DOT, '0.00'],
    [-0.005, DOT, '-0.01'],
    [-0, DOT, '0.00'],
    [0.0000004, { ...DOT, decimals: 6 }, '0.000000'],
    [-0.0000004, { ...DOT, decimals: 6 }, '0.000000'],
    [0.0000005, { ...DOT, decimals: 6 }, '0.000001'],
    [1e-7, { ...DOT, decimals: 6 }, '0.000000'],
    [123.456789, { ...DOT, decimals: 6 }, '123.456789'],
    [9.9999995, { ...DOT, decimals: 6 }, '10.000000'],
    [1e21, { ...DOT, decimals: 0 }, '1,000,000,000,000,000,000,000'],
    [Number.MAX_SAFE_INTEGER, { ...DOT, decimals: 0 }, '9,007,199,254,740,991'],
    [-Number.MAX_SAFE_INTEGER, { ...DOT, decimals: 0 }, '-9,007,199,254,740,991'],
  ] as const)('writes %s with %o as %s', (value, format, expected) => {
    expect(formatNumber(value, format)).toBe(expected);
  });

  it('writes the sign as U+002D, and digits and separators only', () => {
    const written = formatNumber(-1234.5, COMMA);
    expect(written.codePointAt(0)).toBe(0x2d);
    expect(written).toMatch(/^-[0-9 ,]+$/);
  });

  it('refuses a value that is not finite', () => {
    expect(() => formatNumber(Number.NaN, DOT)).toThrow(EvaluationError);
    expect(() => formatNumber(Number.POSITIVE_INFINITY, DOT)).toThrow(EvaluationError);
  });

  it('agrees with exact decimal arithmetic on 3000 seeded values', () => {
    // A decimal n · 10^-d with |n| < 10^15 is the shortest decimal of the
    // double nearest it, so `formatNumber` must round it as integers do.
    let state = 0x9e3779b9;
    const next = (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
    for (let run = 0; run < 3000; run += 1) {
      const digits = 1 + (next() % 15);
      let n = BigInt(next() % 10) * 10n ** BigInt(digits - 1) + BigInt(next());
      n %= 10n ** BigInt(digits);
      if (next() % 2 === 1) n = -n;
      const scale = next() % 7;
      const decimals = next() % 7;
      const value = Number(n) / 10 ** scale;
      // round(|n| · 10^(decimals − scale)) half away from zero, in integers.
      const magnitude = n < 0n ? -n : n;
      let kept: bigint;
      if (decimals >= scale) kept = magnitude * 10n ** BigInt(decimals - scale);
      else {
        const divisor = 10n ** BigInt(scale - decimals);
        kept = magnitude / divisor + ((magnitude % divisor) * 2n >= divisor ? 1n : 0n);
      }
      const text = kept.toString().padStart(decimals + 1, '0');
      const integer = text.slice(0, text.length - decimals);
      const fraction = text.slice(text.length - decimals);
      const grouped = integer.replace(/\B(?=(\d{3})+$)/g, ' ');
      const sign = n < 0n && kept !== 0n ? '-' : '';
      const expected = `${sign}${grouped}${decimals > 0 ? `,${fraction}` : ''}`;
      expect(formatNumber(value, { decimals, decimalSeparator: ',', groupSeparator: ' ' })).toBe(
        expected,
      );
    }
  });

  it('puts the prefix and the suffix around the number', () => {
    expect(numberText(textNode('number-score').number, 99.6)).toBe('score 100%');
    expect(numberText(textNode('number-grouped').number, 1_000_000)).toBe('$1.000.000');
  });
});

describe('the value and its extremes (D65.1, D67, D91.2)', () => {
  it('samples the row number, which replaces the value, and rounds only when it writes', () => {
    const count = textNode('number-count');
    expect(numberValueAt(count, 0)).toBe(0);
    expect(numberValueAt(count, 900_000)).toBe(1_234_567.89);
    expect(numberValueAt(count, 450_000)).toBeCloseTo(617_283.945, 6);
    expect(numberValueAt(textNode('number-still'), 500_000)).toBe(-0.0000004);
  });

  it('bounds a Bézier that overshoots by its control values, and other curves by their keyframes', () => {
    const micro = textNode('number-micro');
    const extremes = numberExtremes(micro);
    // The value, the first keyframe, a + (b − a) · 1.56 for y1 above 1, and the last keyframe.
    expect(extremes).toHaveLength(4);
    expect(extremes[2]).toBeCloseTo(0.000001 + (1.5 - 0.000001) * 1.56, 12);
    for (let timeUs = 0; timeUs < 1_000_000; timeUs += 1_000) {
      const value = numberValueAt(micro, timeUs);
      expect(value).toBeLessThanOrEqual(Math.max(...extremes));
      expect(value).toBeGreaterThanOrEqual(Math.min(...extremes));
    }
    expect(numberExtremes(textNode('number-count'))).toEqual([0, 0, 1_234_567.89]);
    expect(numberExtremes(textNode('number-still'))).toEqual([-0.0000004]);
  });

  it('holds a control value that leaves the row within its bounds', () => {
    const micro = structuredClone(textNode('number-micro')) as {
      animations: { keyframes: { value: number }[] }[];
    } & NumberTextNode;
    const keyframes = micro.animations[0]?.keyframes ?? [];
    if (keyframes[1] !== undefined) keyframes[1].value = Number.MAX_SAFE_INTEGER;
    expect(Math.max(...numberExtremes(micro))).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('the box and the lines in cells (D83.5, D91.2)', () => {
  it('gives every digit a cell as wide as the widest digit of the font', () => {
    // The numeral font draws 1 at 400 units and 7 at 500; every other digit at 600.
    expect(digitCellUnits(METRICS)).toBe(600);
    expect(measureInCells('111', METRICS, 600)).toBe(1800);
    expect(measureInCells('1.7', METRICS, 600)).toBe(1400);
  });

  it('measures the widest text of the lifetime: the most integer digits, and the sign', () => {
    expect(widestNumberText(textNode('number-count'), METRICS)).toBe('1 234 567,89');
    expect(widestNumberText(textNode('number-negative'), METRICS)).toBe('-3 units');
    expect(widestNumberText(textNode('number-grouped'), METRICS)).toBe('$1.000.000');
    expect(widestNumberText(textNode('number-score'), METRICS)).toBe('score 100%');
  });

  it('keeps the box, the block, and the line breaks in every frame, while the text changes', () => {
    for (const node of composition.scenes[0]?.nodes ?? []) {
      if (node.type !== 'text' || !hasNumber(node)) continue;
      const first = numberTextLayout(node, numberValueAt(node, 0), METRICS);
      const texts = new Set<string>();
      for (let frame = 0; frame < 30; frame += 1) {
        const timeUs = Math.floor((frame * 1_000_000) / 30);
        const layout = numberTextLayout(node, numberValueAt(node, timeUs), METRICS);
        texts.add(layout.text);
        expect([layout.width, layout.height, layout.cell], node.id).toEqual([
          first.width,
          first.height,
          first.cell,
        ]);
        expect(layout.block, node.id).toEqual(first.block);
        expect(
          layout.lines.map(({ y }) => y),
          node.id,
        ).toEqual(first.lines.map(({ y }) => y));
        expect(layout.lines.map(({ text }) => text).join('\n')).toBe(
          layout.text.replace(/^score /, 'score\n'),
        );
        // Every line lies in the box.
        for (const line of layout.lines) {
          expect(line.x).toBeGreaterThanOrEqual(-1e-9);
          expect(line.x + line.width).toBeLessThanOrEqual(layout.width + 1e-9);
        }
      }
      if (node.id !== 'number-still') expect(texts.size, node.id).toBeGreaterThan(1);
    }
  });

  it('wraps the widest text in a frame and the shown text at the same breaks', () => {
    const score = textNode('number-score');
    const low = numberTextLayout(score, 0, METRICS);
    const high = numberTextLayout(score, 100, METRICS);
    expect(low.lines.map(({ text }) => text)).toEqual(['score', '0%']);
    expect(high.lines.map(({ text }) => text)).toEqual(['score', '100%']);
    // Aligned right in a frame of 120: the cell of a digit is 600 units at 28 px.
    expect(high.cell).toBeCloseTo(16.8, 12);
    expect(high.lines[1]?.x).toBeCloseTo(120 - 3 * 16.8 - (600 * 28) / 1000, 9);
    expect(low.lines[1]?.x).toBeCloseTo(120 - 16.8 - (600 * 28) / 1000, 9);
  });

  it('centres the block in a frame, and sizes a text without a frame by its widest line', () => {
    const micro = numberTextLayout(textNode('number-micro'), 1, METRICS);
    expect([micro.width, micro.height]).toEqual([260, 60]);
    expect(micro.block.y).toBe((60 - 35) / 2);
    const count = numberTextLayout(textNode('number-count'), 0, METRICS);
    expect([count.width, count.height]).toEqual([248, 50]);
    // `0,00`: three cells of 24 px and a comma of 200 units at 40 px, aligned right.
    expect(count.lines[0]?.x).toBe(248 - (3 * 24 + 8));
  });
});

describe('the evaluation of a text with a number (D83.7, D91.2)', () => {
  it('is a measured node, and needs the metrics of its font', () => {
    expect(measuredNodes(composition).map((node) => node.nodeId)).toEqual([
      'number-count',
      'number-negative',
      'number-micro',
      'number-score',
      'number-grouped',
      'number-still',
    ]);
    expect(() => evaluateComposition(composition, 0)).toThrow(EvaluationError);
    try {
      evaluateComposition(composition, 0);
    } catch (error) {
      expect(error).toBeInstanceOf(EvaluationError);
      expect((error as EvaluationError).code).toBe('font-metrics-missing');
    }
  });

  it('carries the value, the text, the lines, and the cell, and nothing for a text without one', () => {
    const count = textState(966_666, 'number-count');
    expect(count.number?.text).toBe('1 234 567,89');
    expect(count.number?.lines).toEqual([{ text: '1 234 567,89', x: 0, y: 0 }]);
    expect(count.number?.cell).toBe(24);
    expect(textState(0, 'number-negative').number?.text).toBe('-3 units');
    expect(textState(500_000, 'number-negative').number?.text).toBe('0 units');
    expect(textState(966_666, 'number-negative').number?.text).toBe('3 units');
    expect(textState(0, 'number-still').number?.text).toBe('0,000000');
  });

  it('animates the letters of the text it shows: a digit is a letter, and a line those of its wrap', () => {
    const early = textState(0, 'number-score');
    expect(early.fragments?.letters).toHaveLength('score0%'.length);
    expect(early.fragments?.words).toEqual([]);
    const late = textState(966_666, 'number-score');
    expect(late.fragments?.letters).toHaveLength('score100%'.length);
    // The letters fade in one after another, 30 ms apart.
    const opacities = textState(100_000, 'number-score').fragments?.letters.map(
      ({ opacity }) => opacity,
    );
    expect(opacities?.[0]).toBeGreaterThan(opacities?.[3] ?? 1);
  });

  it('gives the same state twice', () => {
    for (const timeUs of [0, 500_000, 966_666]) {
      expect(evaluateComposition(composition, timeUs, FONTS)).toStrictEqual(
        evaluateComposition(composition, timeUs, FONTS),
      );
    }
  });

  it('keeps every other text as it was: no number, no field', () => {
    const plain = structuredClone(numberComposition) as {
      scenes: { nodes: Record<string, unknown>[] }[];
    };
    const node = plain.scenes[0]?.nodes[1] as Record<string, unknown> & TextNode;
    (node as Record<string, unknown>)['text'] = '42';
    (node as Record<string, unknown>)['number'] = { kind: 'none' };
    (node as Record<string, unknown>)['animations'] = [];
    const state = evaluateComposition(validated(plain), 0, FONTS).scenes[0]?.nodes[1];
    expect(state?.type === 'text' && 'number' in state).toBe(false);
  });
});
