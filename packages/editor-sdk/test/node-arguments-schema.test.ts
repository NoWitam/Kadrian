/**
 * The JSON Schemas of the arguments of `SetNodeOpacity` and `SetTextContent`
 * and the parser they must agree with (D38.2, D38.3, in the manner of D31.2 and
 * D31.9). As for `SetNodePosition`, one corpus goes to Ajv and — with the
 * discriminator added — to `parseCommand`, and both must give the same verdict
 * on every row: every property missing, every property replaced by each value
 * of a pool of JSON values, and an extra field. The rows whose accepted value
 * matters are written by hand, with the result stated rather than recomputed.
 *
 * No AI tool wraps these schemas yet (D31 note, PR-24); they are exported so
 * that one can, and this test is what keeps them honest until then.
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  EditorError,
  parseCommand,
  setNodeOpacityArgumentsSchema,
  setTextContentArgumentsSchema,
  type ArgumentSchema,
  type ClosedObjectSchema,
} from '../src/index.js';

const ajv = new Ajv2020({ strict: true, strictNumbers: true, allErrors: false });

/** One value of every JSON type, including the edges of the string and number types. */
const POOL: readonly unknown[] = [
  '',
  'node-title',
  '0.5',
  0,
  -0,
  0.5,
  1,
  1.5,
  -2.5,
  1e300,
  -1e-300,
  true,
  false,
  null,
  [],
  [1, 2],
  {},
  { x: 1, y: 2 },
];

interface Row {
  readonly label: string;
  readonly args: unknown;
}

interface Case {
  readonly type: 'SetNodeOpacity' | 'SetTextContent';
  readonly schema: ClosedObjectSchema<string>;
  /** The valid arguments every generated row is a variant of. */
  readonly base: Readonly<Record<string, unknown>>;
  /** The field the command sets; the accepted rows state its value. */
  readonly field: 'opacity' | 'text';
  /** Accepted rows, as JSON text, with the value `parseCommand` must produce. */
  readonly accepted: readonly { readonly json: string; readonly value: unknown }[];
  /** Rows both must refuse that the generator does not produce, as JSON text. */
  readonly refused: readonly string[];
  /** How many generated rows each verdict must reach at least. */
  readonly minimum: { readonly accepted: number; readonly refused: number };
}

const CASES: readonly Case[] = [
  {
    type: 'SetNodeOpacity',
    schema: setNodeOpacityArgumentsSchema,
    base: { nodeId: 'node-title', opacity: 0.5 },
    field: 'opacity',
    accepted: [
      { json: '{"nodeId":"node-title","opacity":0}', value: 0 },
      { json: '{"nodeId":"node-title","opacity":-0}', value: 0 },
      { json: '{"nodeId":"node-title","opacity":-0.0}', value: 0 },
      { json: '{"nodeId":"node-title","opacity":1}', value: 1 },
      { json: '{"nodeId":"node-title","opacity":1.0}', value: 1 },
      { json: '{"opacity":0.25,"nodeId":"node-title"}', value: 0.25 },
      // Nothing is rounded: the value is kept to the last bit.
      { json: '{"nodeId":"node-title","opacity":0.30000000000000004}', value: 0.30000000000000004 },
      { json: '{"nodeId":"node-title","opacity":0.9999999999999999}', value: 0.9999999999999999 },
      { json: '{"nodeId":"node-title","opacity":5e-324}', value: 5e-324 },
      { json: '{"nodeId":"node-title","opacity":1e-7}', value: 1e-7 },
      { json: '{"nodeId":"węzeł","opacity":0.5}', value: 0.5 },
    ],
    refused: [
      // Nothing is clamped either: just outside the range is outside it.
      '{"nodeId":"node-title","opacity":1.0000000000000002}',
      '{"nodeId":"node-title","opacity":-5e-324}',
      '{"nodeId":"node-title","opacity":2}',
      '{"nodeId":"node-title","opacity":-1}',
      '{"nodeId":"node-title","opacity":1e999}',
      '{"nodeId":"node-title","opacity":"1"}',
      '{"__proto__":{"x":1},"nodeId":"node-title","opacity":0.5}',
      '{"nodeId":7,"opacity":0.5}',
      '"{\\"nodeId\\":\\"node-title\\",\\"opacity\\":0.5}"',
    ],
    minimum: { accepted: 7, refused: 30 },
  },
  {
    type: 'SetTextContent',
    schema: setTextContentArgumentsSchema,
    base: { nodeId: 'node-title', text: 'Hello' },
    field: 'text',
    accepted: [
      { json: '{"nodeId":"node-title","text":""}', value: '' },
      { json: '{"nodeId":"node-title","text":" padded "}', value: ' padded ' },
      { json: '{"nodeId":"node-title","text":"line\\nbreak\\r\\n"}', value: 'line\nbreak\r\n' },
      { json: '{"nodeId":"node-title","text":"\\u0000\\t"}', value: '\u0000\t' },
      { json: '{"nodeId":"node-title","text":"e\\u0301 é"}', value: 'é é' },
      {
        json: '{"text":"Zażółć gęślą jaźń 🎬","nodeId":"node-title"}',
        value: 'Zażółć gęślą jaźń 🎬',
      },
      { json: '{"nodeId":"node-title","text":"\\ud800"}', value: '\ud800' },
      // No length limit (D38.3).
      {
        json: JSON.stringify({ nodeId: 'node-title', text: 'a'.repeat(100_000) }),
        value: 'a'.repeat(100_000),
      },
    ],
    refused: [
      '{"nodeId":"node-title","text":7}',
      '{"nodeId":"node-title","text":["Hello"]}',
      '{"nodeId":"node-title","text":null}',
      '{"__proto__":{"x":1},"nodeId":"node-title","text":"Hello"}',
      '{"nodeId":"","text":"Hello"}',
      '"{\\"nodeId\\":\\"node-title\\",\\"text\\":\\"Hello\\"}"',
    ],
    minimum: { accepted: 3, refused: 30 },
  },
];

/** Every place in the arguments the schema describes, found by walking it. */
function slotsOf(node: ArgumentSchema, path: readonly string[] = []): (readonly string[])[] {
  if (!('properties' in node)) return [path];
  return [
    path,
    ...Object.entries(node.properties).flatMap(([name, child]) => slotsOf(child, [...path, name])),
  ];
}

/** The generated corpus of one case. The schemas are flat, so only the root holds fields. */
function generatedRows({ schema, base }: Case): Row[] {
  const rows: Row[] = [{ label: 'the base arguments', args: { ...base } }];
  for (const path of slotsOf(schema)) {
    const key = path[0];
    for (const value of POOL) {
      const shown = `${JSON.stringify(value)}${Object.is(value, -0) ? ' (-0)' : ''}`;
      rows.push(
        key === undefined
          ? { label: `(root) = ${shown}`, args: value }
          : { label: `${key} = ${shown}`, args: { ...base, [key]: value } },
      );
    }
  }
  for (const name of Object.keys(schema.properties)) {
    const args: Record<string, unknown> = { ...base };
    Reflect.deleteProperty(args, name);
    rows.push({ label: `${name} missing`, args });
  }
  rows.push({ label: 'an extra field', args: { ...base, extra: 1 } });
  return rows;
}

type Verdict = { ok: true; value: unknown } | { ok: false; code: string };

/** The verdict of `parseCommand` on the arguments with the discriminator added. */
function parsed({ type, field }: Case, args: unknown): Verdict {
  const command =
    typeof args === 'object' && args !== null && !Array.isArray(args) ? { type, ...args } : args;
  try {
    const result = parseCommand(command);
    return { ok: true, value: (result as unknown as Record<string, unknown>)[field] };
  } catch (reason) {
    if (reason instanceof EditorError) return { ok: false, code: reason.code };
    throw reason;
  }
}

function disagreements(test: Case, rows: readonly Row[]): string[] {
  const accepts = ajv.compile(test.schema);
  return rows
    .filter(({ args }) => accepts(args) !== parsed(test, args).ok)
    .map(
      ({ label, args }) =>
        `${label}: Ajv ${String(accepts(args))}, parseCommand ${JSON.stringify(parsed(test, args))}`,
    );
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe.each(CASES)('the argument schema of $type (D38)', (test) => {
  const { schema, base } = test;
  const rowsOf = (texts: readonly string[]): Row[] =>
    texts.map((json) => ({ label: json.slice(0, 80), args: JSON.parse(json) as unknown }));

  it('is a valid draft 2020-12 schema that Ajv compiles under strict mode', () => {
    expect(ajv.validateSchema(schema)).toBe(true);
    expect(ajv.compile(schema)(base)).toBe(true);
  });

  it('is deep-frozen, so no caller can edit the schema a tool will share', () => {
    expect(isDeepFrozen(schema)).toBe(true);
    expect(() => {
      (schema.required as string[]).push('extra');
    }).toThrow(TypeError);
  });

  it('is closed, requires every property it names, and has no type field', () => {
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(base).sort());
    expect(ajv.compile(schema)({ type: test.type, ...base })).toBe(false);
  });

  it('builds a corpus that reaches every property and both verdicts', () => {
    const accepts = ajv.compile(schema);
    const rows = generatedRows(test);
    expect(slotsOf(schema).map((path) => path.join('.'))).toEqual(['', 'nodeId', test.field]);
    expect(rows.filter(({ args }) => accepts(args)).length).toBeGreaterThanOrEqual(
      test.minimum.accepted,
    );
    expect(rows.filter(({ args }) => !accepts(args)).length).toBeGreaterThanOrEqual(
      test.minimum.refused,
    );
  });

  it('gives the same verdict as parseCommand on every generated row', () => {
    expect(disagreements(test, generatedRows(test))).toEqual([]);
  });

  it('gives the same verdict on the hand-written rows', () => {
    const accepts = ajv.compile(schema);
    const accepted = rowsOf(test.accepted.map(({ json }) => json));
    const refused = rowsOf(test.refused);
    expect(disagreements(test, [...accepted, ...refused])).toEqual([]);
    for (const { label, args } of accepted) expect(accepts(args), label).toBe(true);
    for (const { label, args } of refused) expect(accepts(args), label).toBe(false);
  });

  it('keeps every accepted hand-written value as stated', () => {
    for (const { json, value } of test.accepted) {
      const verdict = parsed(test, JSON.parse(json));
      if (!verdict.ok) throw new Error(`${json.slice(0, 80)} was refused: ${verdict.code}`);
      expect(Object.is(verdict.value, value), json.slice(0, 80)).toBe(true);
    }
  });

  it('refuses a refused row as invalid-argument', () => {
    for (const json of test.refused) {
      expect(parsed(test, JSON.parse(json)), json).toEqual({ ok: false, code: 'invalid-argument' });
    }
  });
});

describe('the opacity range (D38.2)', () => {
  const opacity = CASES[0];
  if (opacity === undefined) throw new Error('No opacity case.');

  it('states the range 0 to 1 in the schema, which the parser enforces', () => {
    expect(setNodeOpacityArgumentsSchema.properties.opacity).toMatchObject({
      type: 'number',
      minimum: 0,
      maximum: 1,
    });
  });

  it('refuses the numbers JSON cannot carry on both sides', () => {
    const accepts = ajv.compile(setNodeOpacityArgumentsSchema);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const args = { nodeId: 'node-title', opacity: value };
      expect(accepts(args), String(value)).toBe(false);
      expect(parsed(opacity, args), String(value)).toEqual({
        ok: false,
        code: 'invalid-argument',
      });
    }
  });

  it('normalises -0 to 0, which Object.is tells apart', () => {
    const verdict = parsed(opacity, { nodeId: 'node-title', opacity: -0 });
    expect(verdict.ok && Object.is(verdict.value, 0)).toBe(true);
  });
});
