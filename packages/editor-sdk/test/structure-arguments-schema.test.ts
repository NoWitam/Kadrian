/**
 * The JSON Schemas of the arguments of the structural commands and the parser
 * they must agree with (D39.1, in the manner of D31.2 and D31.9). One corpus goes
 * to Ajv and — with the discriminator added — to `parseCommand`, and both must
 * accept and refuse the same rows: every property missing, every property
 * replaced by each value of a pool of JSON values, and an extra field; the rows
 * whose value matters are written by hand.
 *
 * `node` of `AddNode` is an object and nothing more: its shape is the document's
 * schema, applied by the full validation to the result (D30.6), so on that field
 * the two agree on the envelope only. No AI tool wraps these schemas yet (PR-24).
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  addNodeArgumentsSchema,
  duplicateNodeArgumentsSchema,
  EditorError,
  parseCommand,
  removeNodeArgumentsSchema,
  reorderNodeArgumentsSchema,
  type ArgumentSchema,
} from '../src/index.js';

const ajv = new Ajv2020({ strict: true, strictNumbers: true, allErrors: false });

/** One value of every JSON type, including the edges of the string, integer, and object types. */
const POOL: readonly unknown[] = [
  '',
  'node-title',
  'a b',
  'wę',
  '_-',
  0,
  -0,
  1,
  1.5,
  -1,
  9_007_199_254_740_991,
  9_007_199_254_740_992,
  1e300,
  true,
  null,
  [],
  [1],
  {},
  { id: 'x' },
];

interface Case {
  readonly type: 'AddNode' | 'RemoveNode' | 'DuplicateNode' | 'ReorderNode';
  readonly schema: {
    readonly properties: Readonly<Record<string, unknown>>;
    readonly required: readonly string[];
    readonly additionalProperties: false;
  };
  readonly base: Readonly<Record<string, unknown>>;
  /** Rows both must accept, as JSON text. */
  readonly accepted: readonly string[];
  /** Rows both must refuse, as JSON text. */
  readonly refused: readonly string[];
}

const CASES: readonly Case[] = [
  {
    type: 'AddNode',
    schema: addNodeArgumentsSchema,
    base: { parentId: 'scene-main', index: 0, node: { id: 'a' } },
    accepted: [
      '{"parentId":"scene-main","index":-0,"node":{}}',
      '{"parentId":"scene-main","index":1.0,"node":{"id":"a","children":[{"id":"b"}]}}',
      '{"node":{"id":"a"},"index":9007199254740991,"parentId":" "}',
    ],
    refused: [
      '{"parentId":"scene-main","index":0,"node":[]}',
      '{"parentId":"scene-main","index":0,"node":"a"}',
      '{"parentId":"scene-main","index":0.5,"node":{}}',
      '{"parentId":"scene-main","index":-1,"node":{}}',
      '{"parentId":"scene-main","index":9007199254740992,"node":{}}',
      '{"parentId":"","index":0,"node":{}}',
      '{"__proto__":{"x":1},"parentId":"scene-main","index":0,"node":{}}',
    ],
  },
  {
    type: 'RemoveNode',
    schema: removeNodeArgumentsSchema,
    base: { nodeId: 'node-title' },
    accepted: ['{"nodeId":"node-title"}', '{"nodeId":"wę"}'],
    refused: ['{"nodeId":""}', '{"nodeId":7}', '{}'],
  },
  {
    type: 'DuplicateNode',
    schema: duplicateNodeArgumentsSchema,
    base: { nodeId: 'node-title', newNodeId: 'copy' },
    accepted: [
      '{"nodeId":"node-title","newNodeId":"_-"}',
      '{"newNodeId":"A9","nodeId":"node-title"}',
      `{"nodeId":"node-title","newNodeId":"${'a'.repeat(1000)}"}`,
    ],
    refused: [
      '{"nodeId":"node-title","newNodeId":""}',
      '{"nodeId":"node-title","newNodeId":"a b"}',
      '{"nodeId":"node-title","newNodeId":"wę"}',
      '{"nodeId":"node-title","newNodeId":"a\\nb"}',
      '{"nodeId":"node-title","newNodeId":"a.b"}',
    ],
  },
  {
    type: 'ReorderNode',
    schema: reorderNodeArgumentsSchema,
    base: { nodeId: 'node-title', index: 0 },
    accepted: ['{"nodeId":"node-title","index":-0}', '{"nodeId":"node-title","index":3}'],
    refused: [
      '{"nodeId":"node-title","index":1e300}',
      '{"nodeId":"node-title","index":"1"}',
      '{"nodeId":"node-title","index":2.5}',
    ],
  },
];

interface Row {
  readonly label: string;
  readonly args: unknown;
}

function generatedRows({ schema, base }: Case): Row[] {
  const rows: Row[] = [{ label: 'the base arguments', args: { ...base } }];
  for (const value of POOL) rows.push({ label: `(root) = ${JSON.stringify(value)}`, args: value });
  for (const key of Object.keys(schema.properties)) {
    for (const value of POOL) {
      const shown = `${JSON.stringify(value)}${Object.is(value, -0) ? ' (-0)' : ''}`;
      rows.push({ label: `${key} = ${shown}`, args: { ...base, [key]: value } });
    }
    const missing: Record<string, unknown> = { ...base };
    Reflect.deleteProperty(missing, key);
    rows.push({ label: `${key} missing`, args: missing });
  }
  rows.push({ label: 'an extra field', args: { ...base, extra: 1 } });
  return rows;
}

function parses({ type }: Case, args: unknown): boolean | string {
  const command =
    typeof args === 'object' && args !== null && !Array.isArray(args) ? { type, ...args } : args;
  try {
    parseCommand(command);
    return true;
  } catch (reason) {
    if (reason instanceof EditorError)
      return reason.code === 'invalid-argument' ? false : reason.code;
    throw reason;
  }
}

function disagreements(test: Case, rows: readonly Row[]): string[] {
  const accepts = ajv.compile(test.schema);
  return rows
    .filter(({ args }) => accepts(args) !== parses(test, args))
    .map(
      ({ label, args }) =>
        `${label}: Ajv ${String(accepts(args))}, parseCommand ${String(parses(test, args))}`,
    );
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe.each(CASES)('the argument schema of $type (D39.1)', (test) => {
  const { schema, base } = test;
  const rowsOf = (texts: readonly string[]): Row[] =>
    texts.map((text) => ({ label: text.slice(0, 80), args: JSON.parse(text) as unknown }));

  it('is a valid draft 2020-12 schema, deep-frozen, closed, and without a type field', () => {
    expect(ajv.validateSchema(schema)).toBe(true);
    expect(ajv.compile(schema)(base)).toBe(true);
    expect(isDeepFrozen(schema)).toBe(true);
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(base).sort());
    expect(ajv.compile(schema)({ type: test.type, ...base })).toBe(false);
  });

  it('gets the same verdict as parseCommand on every generated row', () => {
    const rows = generatedRows(test);
    const accepts = ajv.compile(schema);
    // The premise: a corpus of one verdict would agree with any schema.
    expect(rows.filter(({ args }) => accepts(args)).length).toBeGreaterThan(2);
    expect(rows.filter(({ args }) => !accepts(args)).length).toBeGreaterThan(15);
    expect(disagreements(test, rows)).toEqual([]);
  });

  it('gets the same verdict on the hand-written rows', () => {
    const accepts = ajv.compile(schema);
    const accepted = rowsOf(test.accepted);
    const refused = rowsOf(test.refused);
    expect(disagreements(test, [...accepted, ...refused])).toEqual([]);
    for (const { label, args } of accepted) expect(accepts(args), label).toBe(true);
    for (const { label, args } of refused) expect(accepts(args), label).toBe(false);
  });
});

describe('the ID pattern of DuplicateNode (D39.3)', () => {
  it('is the document schema’s own, not a copy of it', async () => {
    const { compositionSchema } = await import('@kadrion/schema');
    const newNodeId = duplicateNodeArgumentsSchema.properties.newNodeId as ArgumentSchema & {
      pattern: string;
    };
    expect(newNodeId.pattern).toBe(compositionSchema.properties.scenes.items.properties.id.pattern);
  });
});
