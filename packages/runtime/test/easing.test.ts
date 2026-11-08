/**
 * Easing (D67): the eased progress of every Bézier curve against a table
 * computed independently in `BigInt`, the exact arithmetic of `steps` and
 * `hold`, linear segments left to D18.3, the bounds an overshoot is held
 * within, and the easing of transitions, the halves of a fade through a
 * colour included.
 *
 * The independent table does not repeat the runtime's arithmetic: it holds
 * each control point and each progress as a dyadic rational with 256
 * fractional bits, evaluates the Bernstein form of the curve rather than its
 * power form, bisects 240 times, and rounds once, at the end.
 */
import { compositionSchema } from '@kadrion/schema';
import { transitionsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  BISECTION_STEPS,
  bezierProgress,
  easedValue,
  stepsTaken,
  type Bounds,
} from '../src/easing.js';
import { evaluateComposition } from '../src/index.js';
import { PROPERTY_BOUNDS } from '../src/keyframes.js';
import { animation, derived, draftNode, stateNode, validated, type Draft } from './support.js';

interface Curve {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

const NAMED: Readonly<Record<'ease-in' | 'ease-out' | 'ease-in-out', Curve>> = {
  'ease-in': { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  'ease-out': { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  'ease-in-out': { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
};

/** Curves whose `x` rises everywhere: the parameter of a progress is well conditioned. */
const CURVES: readonly [string, Curve][] = [
  ...Object.entries(NAMED),
  ['an overshoot', { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 }],
  ['an anticipation', { x1: 0.36, y1: -0.64, x2: 0.6, y2: 1.4 }],
  ['the diagonal', { x1: 0, y1: 0, x2: 1, y2: 1 }],
  ['the extremes of y', { x1: 0.5, y1: -1, x2: 0.5, y2: 2 }],
];

/** The fixed progress points: every 64th, and three near the ends and the middle. */
const POINTS: readonly number[] = [
  ...Array.from({ length: 63 }, (_, index) => (index + 1) / 64),
  1e-9,
  0.5 + 2 ** -40,
  1 - 2 ** -30,
];

/**
 * The bounds measured on this table, as distances on the axis of progress:
 * 2^-51 for the named curves, two units in the last place of a progress near
 * 1, and 2^-50 for curves whose `y` reaches from -1 to 2. They are not one
 * unit in the last place of the result: near an end where the curve is flat,
 * `e(p)` is tiny and its last place much finer than the rounding of `x(s)`
 * that the bisection compares, the same in every engine.
 */
const NAMED_BOUND = 2 ** -51;
const BOUND = 2 ** -50;

const FRACTION_BITS = 256n;
const ONE = 1n << FRACTION_BITS;

/** A double as an exact dyadic rational: the numerator over 2^256. */
function exactOf(value: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  if (exponent === 0 && fraction === 0n) return 0n;
  const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
  const shift = FRACTION_BITS + BigInt((exponent === 0 ? 1 : exponent) - 1075);
  const magnitude = shift >= 0n ? mantissa << shift : mantissa >> -shift;
  return negative ? -magnitude : magnitude;
}

function times(a: bigint, b: bigint): bigint {
  return (a * b) >> FRACTION_BITS;
}

/** `3(1 − s)²s·c1 + 3(1 − s)s²·c2 + s³`, the Bernstein form, in 256 fractional bits. */
function bernstein(c1: bigint, c2: bigint, s: bigint): bigint {
  const rest = ONE - s;
  return (
    3n * times(times(times(rest, rest), s), c1) +
    3n * times(times(times(rest, s), s), c2) +
    times(times(s, s), s)
  );
}

/** The eased progress of `curve` at `p` to 2^-240, rounded to the nearest double once. */
function independent(curve: Curve, p: number): number {
  const [x1, y1, x2, y2] = [curve.x1, curve.y1, curve.x2, curve.y2].map(exactOf) as [
    bigint,
    bigint,
    bigint,
    bigint,
  ];
  const target = exactOf(p);
  let low = 0n;
  let high = ONE;
  for (let step = 0; step < 240; step += 1) {
    const middle = (low + high) >> 1n;
    if (bernstein(x1, x2, middle) < target) low = middle;
    else high = middle;
  }
  return Number(bernstein(y1, y2, low)) / 2 ** 256;
}

const NO_BOUNDS: Bounds = { min: -Infinity, max: Infinity };

describe('the eased progress of a cubic Bézier (D67.3)', () => {
  it.each(CURVES)('of %s meets the independent table at every point', (name, curve) => {
    let worst = 0;
    for (const p of POINTS) {
      worst = Math.max(worst, Math.abs(bezierProgress(curve, p) - independent(curve, p)));
    }
    expect(worst).toBeLessThanOrEqual(Object.hasOwn(NAMED, name) ? NAMED_BOUND : BOUND);
  });

  it('is farther from the table where x stands still: the parameter itself is ill conditioned', () => {
    // x'(1/2) = 0 for x1 = 1 and x2 = 0: an error of 2^-53 in x(s) moves s by its cube root.
    const curve = { x1: 1, y1: -1, x2: 0, y2: 2 };
    let worst = 0;
    for (const p of POINTS) {
      worst = Math.max(worst, Math.abs(bezierProgress(curve, p) - independent(curve, p)));
    }
    expect(worst).toBeGreaterThan(BOUND);
    expect(worst).toBeLessThanOrEqual(2 ** -17);
  });

  it('runs a fixed number of bisection steps', () => {
    expect(BISECTION_STEPS).toBe(64);
  });

  it.each(Object.entries(NAMED))(
    'of %s never decreases when the progress grows (D67.4)',
    (_, curve) => {
      const points = [
        ...Array.from({ length: 4095 }, (_, index) => (index + 1) / 4096),
        // Runs of adjacent doubles, where only the rounding of x(s) could reorder them.
        ...[2 ** -20, 0.25, 0.5, 0.75, 1 - 2 ** -20].flatMap((start) =>
          Array.from({ length: 200 }, (_, index) => start + index * 2 ** -52),
        ),
      ].sort((a, b) => a - b);
      let previous = -Infinity;
      for (const p of points) {
        const eased = bezierProgress(curve, p);
        expect(eased).toBeGreaterThanOrEqual(previous);
        previous = eased;
      }
    },
  );

  it('has bits that do not move: a change of the arithmetic changes this table (D18)', () => {
    const bits = (value: number): string => {
      const view = new DataView(new ArrayBuffer(8));
      view.setFloat64(0, value);
      return view.getBigUint64(0).toString(16);
    };
    const table = Object.entries(NAMED).map(([name, curve]) => [
      name,
      [0.25, 0.5, 0.75].map((p) => bits(bezierProgress(curve, p))),
    ]);
    expect(table).toEqual([
      ['ease-in', ['3fb7ed4ca22b5ed2', '3fd42ece5724788d', '3fe3e64adcd789e8']],
      ['ease-out', ['3fd8336a4650ec32', '3fe5e898d46dc3b9', '3fed02566bba9426']],
      ['ease-in-out', ['3fc08860cede43d9', '3fe0000000000000', '3febdde7cc486f08']],
    ]);
  });
});

describe('steps (D67.5)', () => {
  it('jumps at the end of each interval for end, and at its start for start', () => {
    const at = (position: 'start' | 'end', elapsedUs: number): number =>
      stepsTaken(4, position, elapsedUs, 1_000_000);
    expect([0, 249_999, 250_000, 999_999].map((t) => at('end', t))).toEqual([0, 0, 1, 3]);
    expect([0, 249_999, 250_000, 999_999].map((t) => at('start', t))).toEqual([1, 1, 2, 4]);
  });

  it('counts exactly where the product of the time and the count leaves the doubles', () => {
    const span = 2 ** 53 - 1;
    expect(stepsTaken(1000, 'end', span - 1, span)).toBe(999);
    expect(stepsTaken(3, 'end', 2 ** 52, span)).toBe(1);
  });

  it('counts exactly in a span that is half of an odd duration (D56)', () => {
    // 400 001 µs: each half is 200 000.5 µs, and both times are doubled before they are divided.
    expect(stepsTaken(2, 'end', 100_000, 200_000.5)).toBe(0);
    expect(stepsTaken(2, 'end', 100_000.5, 200_000.5)).toBe(1);
  });

  it('places a value by the order of D18.3 with the jumps in place of the time', () => {
    const steps = { kind: 'steps', count: 3, position: 'end' } as const;
    expect(easedValue(steps, 0, 1, 700_000, 1_000_000, NO_BOUNDS)).toBe((1 * 2) / 3);
    expect(easedValue(steps, 10, 40, 999_999, 1_000_000, NO_BOUNDS)).toBe(10 + (30 * 2) / 3);
  });
});

describe('linear and hold (D67.2)', () => {
  it('keeps linear exactly the arithmetic of D18.3, unbounded', () => {
    const linear = { kind: 'linear' } as const;
    const tight = { min: 0, max: 0 };
    for (const [a, b, t, span] of [
      [0, 1, 1, 3],
      [-12.5, 1e6, 123_456, 1_000_001],
      [0.1, 0.7, 2, 7],
    ] as const) {
      expect(easedValue(linear, a, b, t, span, tight)).toBe(a + ((b - a) * t) / span);
    }
  });

  it('holds the start value without arithmetic', () => {
    expect(easedValue({ kind: 'hold' }, 0.1, 0.9, 999_999, 1_000_000, NO_BOUNDS)).toBe(0.1);
  });
});

describe('the bounds of a sampled value (D67.6)', () => {
  it('are the bounds of each animated property in the schema', () => {
    const found: Record<string, unknown> = {};
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const properties = (node as { properties?: Record<string, unknown> }).properties;
      const property = (properties?.['property'] as { const?: string } | undefined)?.const;
      const keyframes = properties?.['keyframes'] as
        { items: { properties: { value: Record<string, unknown> } } } | undefined;
      if (property !== undefined && keyframes !== undefined) {
        const value = keyframes.items.properties.value;
        const channels = value['properties'] as Record<string, Record<string, unknown>> | undefined;
        // A vector by its x, a size by its width, a crop by its top inset (D68).
        const scalar = channels?.['x'] ?? channels?.['width'] ?? channels?.['top'] ?? value;
        found[property] = { min: scalar['minimum'], max: scalar['maximum'] };
      }
      for (const child of Object.values(node)) walk(child);
    };
    walk(compositionSchema);
    // A colour is a string in the schema; it is held per channel, from 0 to 255 (D68).
    expect(found['color']).toEqual({ min: undefined, max: undefined });
    expect(found).toEqual({ ...PROPERTY_BOUNDS, color: found['color'] });
    expect(PROPERTY_BOUNDS.color).toEqual({ min: 0, max: 255 });
  });

  it('hold an overshoot of opacity within 0 and 1, and leave a value inside as it is', () => {
    const back = { kind: 'cubic-bezier', x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 } as const;
    const bounds = PROPERTY_BOUNDS.opacity;
    expect(easedValue(back, 0, 1, 600_000, 1_000_000, bounds)).toBe(1);
    const inside = easedValue(back, 0, 0.5, 600_000, 1_000_000, bounds);
    expect(inside).toBe(0.5 * bezierProgress(back, 0.6));
    expect(inside).toBeGreaterThan(0.5);
  });

  it('let an anticipation of scale stop at 0', () => {
    const anticipate = { kind: 'cubic-bezier', x1: 0.36, y1: -1, x2: 0.6, y2: 1 } as const;
    expect(easedValue(anticipate, 0, 2, 50_000, 1_000_000, PROPERTY_BOUNDS.scale)).toBe(0);
  });
});

describe('eased keyframes in the evaluated state (D67.1)', () => {
  /** The reference with its title's opacity eased from its first keyframe. */
  function titleEased(easing: unknown): ReturnType<typeof validated> {
    return derived((draft: Draft) => {
      const node = draftNode(draft, 'node-title');
      node.opacity = 1;
      const fade = animation('anim-title-opacity', 'opacity', [0, 0], [1_000_000, 1]);
      (fade.keyframes[0] as { easing: unknown }).easing = easing;
      node.animations = [fade];
    });
  }

  it('reads the easing of the keyframe a segment starts at', () => {
    const document = titleEased({ kind: 'ease-in' });
    const opacity = stateNode(evaluateComposition(document, 250_000), 'node-title').opacity;
    expect(opacity).toBe(0 + (1 - 0) * bezierProgress(NAMED['ease-in'], 0.25));
    expect(stateNode(evaluateComposition(document, 0), 'node-title').opacity).toBe(0);
    expect(stateNode(evaluateComposition(document, 1_000_000), 'node-title').opacity).toBe(1);
  });

  it('holds the value of a hold until the next keyframe', () => {
    const document = titleEased({ kind: 'hold' });
    expect(stateNode(evaluateComposition(document, 999_999), 'node-title').opacity).toBe(0);
    expect(stateNode(evaluateComposition(document, 1_000_000), 'node-title').opacity).toBe(1);
  });

  it('starts a steps segment at its keyframe value, whatever its position', () => {
    const document = titleEased({ kind: 'steps', count: 2, position: 'start' });
    const at = (timeUs: number): number =>
      stateNode(evaluateComposition(document, timeUs), 'node-title').opacity;
    expect([at(0), at(1), at(499_999), at(500_000), at(1_000_000)]).toEqual([0, 0.5, 0.5, 1, 1]);
  });
});

describe('eased transitions (D67.8)', () => {
  function sequence(id: string, easing: unknown): ReturnType<typeof validated> {
    const copy = structuredClone(transitionsComposition) as {
      transitions: { id: string; easing: unknown }[];
    };
    for (const transition of copy.transitions) if (transition.id === id) transition.easing = easing;
    return validated(copy);
  }

  function opacities(document: ReturnType<typeof validated>, timeUs: number): unknown[] {
    return evaluateComposition(document, timeUs).scenes.map(
      (scene) => (scene.transition as { opacity?: number } | undefined)?.opacity,
    );
  }

  it('eases the progress of a crossfade', () => {
    const document = sequence('transition-crossfade', { kind: 'ease-in' });
    expect(opacities(document, 700_000)).toEqual([
      undefined,
      bezierProgress(NAMED['ease-in'], 0.25),
    ]);
    expect(opacities(document, 600_000)).toEqual([undefined, 0]);
  });

  it('eases each half of a fade through a colour on its own', () => {
    const document = sequence('transition-fade', { kind: 'ease-out' });
    const eased = bezierProgress(NAMED['ease-out'], 0.5);
    // The first half, 200 000 µs from 1 200 000: the outgoing side falls from 1 to 0.
    expect(opacities(document, 1_300_000)).toEqual([1 + (0 - 1) * eased, 0]);
    // The second half: the incoming side rises from 0 to 1.
    expect(opacities(document, 1_500_000)).toEqual([0, eased]);
  });

  it('holds an overshoot within the two ends of the motion', () => {
    const back = { kind: 'cubic-bezier', x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 };
    const document = sequence('transition-crossfade', back);
    expect(opacities(document, 900_000)).toEqual([undefined, 1]);
  });
});
