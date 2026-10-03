/**
 * The bounds of a lifetime are the schema's (D42.10), read by `lifetimeBounds`
 * from every node shape and used by the parser of `SetNodeLifetime`. Schema 0.2
 * states 0 to 2^53 − 1 for a start and 1 to 2^53 − 1 for a duration, which a
 * parser that only asked for a safe integer would nearly enforce by itself; so
 * the function is handed other metadata, and the parser is loaded against a
 * schema module with other bounds, while the validator stays the real one.
 *
 * Neither schema 0.2 nor the public API changes. The mock is set up for one
 * block and taken down after it; the last block shows the real bounds back.
 */
import { compositionSchema } from '@kadrion/schema';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { lifetimeBounds } from '../src/lifetimes.js';

type Sdk = typeof import('../src/index.js');
type SchemaModule = typeof import('@kadrion/schema');

const MAX = Number.MAX_SAFE_INTEGER;
const START = { minimum: 5, maximum: 20_000_000 };
const DURATION = { minimum: 3, maximum: 30_000_000 };

interface Bounded {
  minimum: number;
  maximum: number;
}
interface Shape {
  properties: {
    startUs: Bounded;
    durationUs: Bounded;
    children?: { items: { oneOf: Shape[] } };
  };
}

/** Every node shape of a composition schema, group children included, as editable data. */
function shapesOf(schema: unknown): Shape[] {
  const nodes = (
    schema as {
      properties: { scenes: { items: { properties: { nodes: { items: { oneOf: Shape[] } } } } } };
    }
  ).properties.scenes.items.properties.nodes.items.oneOf;
  return nodes.flatMap((node) => [node, ...(node.properties.children?.items.oneOf ?? [])]);
}

/** The composition schema as separate objects, so that one shape can differ from another. */
function separate(): unknown {
  return JSON.parse(JSON.stringify(compositionSchema)) as unknown;
}

/** The code of the error a call throws, read from the error itself: the SDK is loaded anew here. */
function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (reason) {
    const code = (reason as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : 'threw something else';
  }
  return 'did not throw';
}

describe('lifetimeBounds reads the metadata it is given (D42.10)', () => {
  it('reads the bounds of schema 0.2, which every node shape states alike', () => {
    expect(shapesOf(compositionSchema)).toHaveLength(7);
    expect(lifetimeBounds(compositionSchema)).toEqual({
      startUs: { minimum: 0, maximum: MAX },
      durationUs: { minimum: 1, maximum: MAX },
    });
  });

  it('returns what other metadata states, not numbers of its own', () => {
    const schema = separate();
    for (const shape of shapesOf(schema)) {
      Object.assign(shape.properties.startUs, START);
      Object.assign(shape.properties.durationUs, DURATION);
    }
    expect(lifetimeBounds(schema)).toEqual({ startUs: START, durationUs: DURATION });
  });

  it.each([0, 1, 2, 3, 4, 5, 6])(
    'refuses node shapes that disagree, whichever shape differs: shape %d',
    (index) => {
      for (const field of ['startUs', 'durationUs'] as const) {
        const schema = separate();
        const shape = shapesOf(schema)[index];
        if (shape === undefined) throw new Error('No shape.');
        shape.properties[field].maximum = 7;
        expect(() => lifetimeBounds(schema), field).toThrow(/disagree/);
      }
    },
  );

  it.each([
    ['a start without a minimum', 'startUs', 'minimum'],
    ['a start without a maximum', 'startUs', 'maximum'],
    ['a duration without a minimum', 'durationUs', 'minimum'],
    ['a duration without a maximum', 'durationUs', 'maximum'],
  ] as const)('refuses a shape that states %s, instead of asking the others', (_, field, bound) => {
    for (const index of [0, 2, 6]) {
      const schema = separate();
      const shape = shapesOf(schema)[index];
      if (shape === undefined) throw new Error('No shape.');
      Reflect.deleteProperty(shape.properties[field], bound);
      expect(() => lifetimeBounds(schema), String(index)).toThrow(/states no bounds/);
    }
  });

  it('refuses a schema without a node shape', () => {
    expect(() => lifetimeBounds({})).toThrow(/no node shape/);
  });
});

describe('the parser of SetNodeLifetime follows the schema it loads with (D42.10)', () => {
  let sdk: Sdk;
  const command = (startUs: number, durationUs: number): unknown => ({
    type: 'SetNodeLifetime',
    nodeId: 'node-title',
    startUs,
    durationUs,
  });

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('@kadrion/schema', async (importOriginal) => {
      const actual = await importOriginal<SchemaModule>();
      const schema = structuredClone(actual.compositionSchema);
      for (const shape of shapesOf(schema)) {
        Object.assign(shape.properties.startUs, START);
        Object.assign(shape.properties.durationUs, DURATION);
      }
      return { ...actual, compositionSchema: schema };
    });
    sdk = await import('../src/index.js');
  });

  afterAll(() => {
    vi.doUnmock('@kadrion/schema');
    vi.resetModules();
  });

  it.each([
    ['a start above the maximum', START.maximum + 1, DURATION.minimum, 'invalid-argument'],
    ['the maximum start', START.maximum, DURATION.minimum, 'did not throw'],
    ['a start below the minimum', START.minimum - 1, DURATION.minimum, 'invalid-argument'],
    ['the start 0', 0, DURATION.minimum, 'invalid-argument'],
    ['the minimum start', START.minimum, DURATION.minimum, 'did not throw'],
    ['a duration above the maximum', START.minimum, DURATION.maximum + 1, 'invalid-argument'],
    ['the maximum duration', START.minimum, DURATION.maximum, 'did not throw'],
    ['a duration below the minimum', START.minimum, DURATION.minimum - 1, 'invalid-argument'],
    ['the duration 1', START.minimum, 1, 'invalid-argument'],
  ])('judges %s by the altered bounds', (_, startUs, durationUs, code) => {
    // Every value here is a safe integer that schema 0.2 itself would take.
    expect(Number.isSafeInteger(startUs) && Number.isSafeInteger(durationUs)).toBe(true);
    expect(codeOf(() => sdk.parseCommand(command(startUs, durationUs)))).toBe(code);
  });

  it('states the same bounds in the argument schema', () => {
    expect(sdk.setNodeLifetimeArgumentsSchema.properties.startUs).toMatchObject(START);
    expect(sdk.setNodeLifetimeArgumentsSchema.properties.durationUs).toMatchObject(DURATION);
  });
});

describe('after the altered metadata (D42.10)', () => {
  it('loads the SDK with the bounds of schema 0.2 again', async () => {
    const sdk = await import('../src/index.js');
    const parse = (startUs: number, durationUs: number): string =>
      codeOf(() =>
        sdk.parseCommand({ type: 'SetNodeLifetime', nodeId: 'node-title', startUs, durationUs }),
      );
    expect(parse(0, 1)).toBe('did not throw');
    expect(parse(START.maximum + 1, DURATION.maximum + 1)).toBe('did not throw');
    expect(parse(MAX, MAX)).toBe('did not throw');
    expect(parse(MAX + 1, 1)).toBe('invalid-argument');
    expect(parse(0, 0)).toBe('invalid-argument');
    expect(sdk.setNodeLifetimeArgumentsSchema.properties.startUs).toMatchObject({
      minimum: 0,
      maximum: MAX,
    });
  });
});
