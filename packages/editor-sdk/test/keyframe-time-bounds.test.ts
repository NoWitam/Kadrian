/**
 * The seam of D41.2 at the parsers: the bounds of every time a command takes
 * are the ones `compositionSchema` states for a keyframe's `timeUs`, read when
 * `editor-sdk` loads, not numbers of its own. Schema `0.1` states 0 to 2^53 − 1,
 * which a parser that only asked for a safe integer from 0 would also enforce;
 * so here the module `@kadrion/schema` hands the SDK other metadata — times from
 * 5 to 20 000 000 — and every time-bearing argument must follow it.
 *
 * Neither schema `0.2` nor the public API changes. The mock is set up for the
 * first block only and taken down after it; the last block loads the SDK again
 * and shows that the real bounds are back.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Sdk = typeof import('../src/index.js');
type SchemaModule = typeof import('@kadrion/schema');

const MINIMUM = 5;
const MAXIMUM = 20_000_000;
const OPACITY = 'anim-title-opacity';

interface TimeSchema {
  minimum: number;
  maximum: number;
}
interface Shape {
  properties: { keyframes: { items: { properties: { timeUs: TimeSchema } } } };
}
interface Variant {
  properties: {
    animations?: { items: { oneOf: Shape[] } };
    children?: { items: { oneOf: Variant[] } };
  };
}

/** The schema module with other bounds on the time of every keyframe shape. */
function altered(actual: SchemaModule): SchemaModule {
  const schema = structuredClone(actual.compositionSchema);
  const visit = (variant: Variant): void => {
    for (const shape of variant.properties.animations?.items.oneOf ?? []) {
      const time = shape.properties.keyframes.items.properties.timeUs;
      time.minimum = MINIMUM;
      time.maximum = MAXIMUM;
    }
    for (const child of variant.properties.children?.items.oneOf ?? []) visit(child);
  };
  const nodes = schema.properties.scenes.items.properties.nodes.items.oneOf;
  for (const variant of nodes as unknown as Variant[]) visit(variant);
  return { ...actual, compositionSchema: schema };
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

/** Every argument of a command that is a time, with the other times within the altered bounds. */
const TIME_ARGUMENTS: readonly (readonly [string, (timeUs: number) => unknown])[] = [
  [
    'SetOpacityKeyframe.timeUs',
    (timeUs) => ({ type: 'SetOpacityKeyframe', animationId: OPACITY, timeUs, opacity: 0.5 }),
  ],
  [
    'SetPositionKeyframe.timeUs',
    (timeUs) => ({
      type: 'SetPositionKeyframe',
      animationId: 'anim-group-position',
      timeUs,
      offset: { x: 1, y: 1 },
    }),
  ],
  [
    'SetScaleKeyframe.timeUs',
    (timeUs) => ({
      type: 'SetScaleKeyframe',
      animationId: 'anim-image-scale',
      timeUs,
      factor: { x: 1, y: 1 },
    }),
  ],
  [
    'AddKeyframe.keyframe.timeUs',
    (timeUs) => ({ type: 'AddKeyframe', animationId: OPACITY, keyframe: { timeUs, value: 0.5 } }),
  ],
  ['RemoveKeyframe.timeUs', (timeUs) => ({ type: 'RemoveKeyframe', animationId: OPACITY, timeUs })],
  [
    'MoveKeyframe.timeUs',
    (timeUs) => ({ type: 'MoveKeyframe', animationId: OPACITY, timeUs, toTimeUs: 1000 }),
  ],
  [
    'MoveKeyframe.toTimeUs',
    (timeUs) => ({ type: 'MoveKeyframe', animationId: OPACITY, timeUs: 1000, toTimeUs: timeUs }),
  ],
];

describe('the bounds of a command time are the schema’s (D41.2)', () => {
  let sdk: Sdk;

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('@kadrion/schema', async (importOriginal) =>
      altered(await importOriginal<SchemaModule>()),
    );
    sdk = await import('../src/index.js');
  });

  afterAll(() => {
    vi.doUnmock('@kadrion/schema');
    vi.resetModules();
  });

  it.each(TIME_ARGUMENTS)('%s is refused above the maximum the metadata states', (_, make) => {
    // A safe integer, and far below 2^53 − 1: only the schema's maximum refuses it.
    expect(Number.isSafeInteger(MAXIMUM + 1)).toBe(true);
    expect(codeOf(() => sdk.parseCommand(make(MAXIMUM + 1)))).toBe('invalid-argument');
    expect(codeOf(() => sdk.parseCommand(make(MAXIMUM)))).toBe('did not throw');
  });

  it.each(TIME_ARGUMENTS)('%s is refused below the minimum the metadata states', (_, make) => {
    // Non-negative safe integers: only the schema's minimum refuses them.
    expect(codeOf(() => sdk.parseCommand(make(MINIMUM - 1)))).toBe('invalid-argument');
    expect(codeOf(() => sdk.parseCommand(make(0)))).toBe('invalid-argument');
    expect(codeOf(() => sdk.parseCommand(make(MINIMUM)))).toBe('did not throw');
  });

  it('states the same bounds in every argument schema', () => {
    const times = [
      sdk.setOpacityKeyframeArgumentsSchema.properties.timeUs,
      sdk.setPositionKeyframeArgumentsSchema.properties.timeUs,
      sdk.setScaleKeyframeArgumentsSchema.properties.timeUs,
      sdk.addKeyframeArgumentsSchema.properties.keyframe.properties.timeUs,
      sdk.removeKeyframeArgumentsSchema.properties.timeUs,
      sdk.moveKeyframeArgumentsSchema.properties.timeUs,
      sdk.moveKeyframeArgumentsSchema.properties.toTimeUs,
    ];
    for (const time of times) {
      expect(time).toMatchObject({ type: 'integer', minimum: MINIMUM, maximum: MAXIMUM });
    }
  });

  it('leaves the document and the history unchanged when the bus refuses a time', () => {
    const bus = sdk.createCommandBus(referenceComposition, { historyLimit: 10 });
    const before = bus.getDocument();
    const [, make] = TIME_ARGUMENTS[0] ?? [];
    if (make === undefined) throw new Error('No time argument.');
    expect(codeOf(() => bus.dispatch(make(MAXIMUM + 1)))).toBe('invalid-argument');
    expect(bus.getDocument()).toBe(before);
    expect(bus.canUndo()).toBe(false);
    // Within the bounds the command runs: the validator is the real one.
    bus.dispatch(make(MAXIMUM));
    expect(bus.canUndo()).toBe(true);
  });
});

describe('after the altered metadata (D41.2)', () => {
  it('loads the SDK with the bounds of schema 0.2 again', async () => {
    const [sdk, schema, animations] = await Promise.all([
      import('../src/index.js'),
      import('@kadrion/schema'),
      import('../src/animations.js'),
    ]);
    expect(animations.keyframeTimeBounds(schema.compositionSchema)).toEqual({
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    });
    for (const [, make] of TIME_ARGUMENTS) {
      expect(codeOf(() => sdk.parseCommand(make(0)))).toBe('did not throw');
      expect(codeOf(() => sdk.parseCommand(make(MAXIMUM + 1)))).toBe('did not throw');
      expect(codeOf(() => sdk.parseCommand(make(Number.MAX_SAFE_INTEGER)))).toBe('did not throw');
      expect(codeOf(() => sdk.parseCommand(make(Number.MAX_SAFE_INTEGER + 1)))).toBe(
        'invalid-argument',
      );
    }
    expect(sdk.removeKeyframeArgumentsSchema.properties.timeUs).toMatchObject({
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    });
  });
});
