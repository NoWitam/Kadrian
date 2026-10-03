/**
 * The JSON Schema of the arguments of `SetNodeLifetime` and the parser it must
 * agree with (D42.10, in the manner of D31.2 and D31.9). One corpus goes to Ajv
 * and — with the discriminator added — to `parseCommand`, and both must accept
 * and refuse the same rows: every property missing or replaced by each value of
 * a pool of JSON values, and an extra field; the rows whose normalised value
 * matters are written by hand. No AI tool wraps this schema yet (PR-24).
 */
import { compositionSchema } from '@kadrion/schema';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { EditorError, parseCommand, setNodeLifetimeArgumentsSchema } from '../src/index.js';

const ajv = new Ajv2020({ strict: true, strictNumbers: true, allErrors: false });
const MAX = 9_007_199_254_740_991;
const schema = setNodeLifetimeArgumentsSchema;
const base = { nodeId: 'node-title', startUs: 0, durationUs: 1 };

/** One value of every JSON type, and the edges of the two times and of the ID. */
const POOL: readonly unknown[] = [
  '',
  'node-title',
  'a b',
  '0',
  0,
  -0,
  0.5,
  1,
  1.5,
  -1,
  MAX,
  MAX + 1,
  1e300,
  true,
  null,
  [],
  {},
  { startUs: 0 },
];

type Json = Readonly<Record<string, unknown>>;

function parsed(args: unknown): Json | string {
  const command =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? { type: 'SetNodeLifetime', ...args }
      : args;
  try {
    return parseCommand(command) as unknown as Json;
  } catch (reason) {
    if (reason instanceof EditorError) return reason.code;
    throw reason;
  }
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe('the argument schema of SetNodeLifetime (D42.10)', () => {
  const accepts = ajv.compile(schema);

  it('is a valid draft 2020-12 schema, deep-frozen, closed, and without a type field', () => {
    expect(ajv.validateSchema(schema)).toBe(true);
    expect(accepts(base)).toBe(true);
    expect(isDeepFrozen(schema)).toBe(true);
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(accepts({ type: 'SetNodeLifetime', ...base })).toBe(false);
  });

  it('gets the same verdict as parseCommand on every generated row', () => {
    const rows: { label: string; args: unknown }[] = [
      { label: 'the base arguments', args: { ...base } },
      { label: 'an extra field', args: { ...base, extra: 1 } },
      ...POOL.map((value) => ({ label: `(root) = ${JSON.stringify(value)}`, args: value })),
    ];
    for (const name of Object.keys(schema.properties)) {
      const rest = Object.fromEntries(Object.entries(base).filter(([key]) => key !== name));
      rows.push({ label: `${name} missing`, args: rest });
      for (const value of POOL) {
        const shown = `${JSON.stringify(value)}${Object.is(value, -0) ? ' (-0)' : ''}`;
        rows.push({ label: `${name} = ${shown}`, args: { ...base, [name]: value } });
      }
    }
    // The premise: a corpus of one verdict would agree with any schema.
    expect(rows.filter(({ args }) => accepts(args)).length).toBeGreaterThan(5);
    expect(rows.filter(({ args }) => !accepts(args)).length).toBeGreaterThan(40);
    const disagreements = rows
      .filter(({ args }) => accepts(args) !== (typeof parsed(args) !== 'string'))
      .map(
        ({ label, args }) =>
          `${label}: Ajv ${String(accepts(args))}, ${JSON.stringify(parsed(args))}`,
      );
    expect(disagreements).toEqual([]);
  });

  it('gets the same verdict on the hand-written rows, and normalises as stated', () => {
    const accepted: [string, Json][] = [
      ['{"nodeId":"n","startUs":-0,"durationUs":1}', { startUs: 0, durationUs: 1 }],
      [
        `{"durationUs":${String(MAX)},"startUs":${String(MAX)},"nodeId":"a b"}`,
        { startUs: MAX, durationUs: MAX },
      ],
      ['{"nodeId":"n","startUs":20000000,"durationUs":7}', { startUs: 20_000_000, durationUs: 7 }],
    ];
    const refused = [
      '{"nodeId":"n","startUs":0,"durationUs":0}',
      '{"nodeId":"n","startUs":0,"durationUs":-0}',
      '{"nodeId":"n","startUs":0.5,"durationUs":1}',
      '{"nodeId":"n","startUs":1e-7,"durationUs":1}',
      '{"nodeId":"n","startUs":-1,"durationUs":1}',
      '{"nodeId":"n","startUs":0,"durationUs":1.5}',
      '{"nodeId":"n","startUs":9007199254740992,"durationUs":1}',
      '{"nodeId":"n","startUs":0,"durationUs":9007199254740992}',
      '{"nodeId":"n","startUs":"0","durationUs":1}',
      '{"nodeId":"","startUs":0,"durationUs":1}',
    ];
    for (const text of refused) {
      expect(accepts(JSON.parse(text)), text).toBe(false);
      expect(parsed(JSON.parse(text)), text).toBe('invalid-argument');
    }
    for (const [text, expected] of accepted) {
      expect(accepts(JSON.parse(text)), text).toBe(true);
      const result = parsed(JSON.parse(text));
      if (typeof result === 'string') throw new Error(`${text} was refused: ${result}`);
      expect(result, text).toMatchObject(expected);
      expect(Object.is(result['startUs'], -0), text).toBe(false);
    }
  });
});

describe('what the schema takes from the document (D42.10)', () => {
  it('states the bounds the composition schema states for a node’s lifetime', () => {
    const nodes = compositionSchema.properties.scenes.items.properties.nodes.items.oneOf;
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      const { startUs, durationUs } = node.properties;
      expect(schema.properties.startUs).toMatchObject({
        type: 'integer',
        minimum: startUs.minimum,
        maximum: startUs.maximum,
      });
      expect(schema.properties.durationUs).toMatchObject({
        type: 'integer',
        minimum: durationUs.minimum,
        maximum: durationUs.maximum,
      });
    }
    expect(schema.properties.startUs).toMatchObject({ minimum: 0, maximum: MAX });
    expect(schema.properties.durationUs).toMatchObject({ minimum: 1, maximum: MAX });
  });
});
