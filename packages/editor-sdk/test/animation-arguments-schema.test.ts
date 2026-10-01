/**
 * The JSON Schemas of the arguments of the animation commands of D41 and the
 * parser they must agree with (D41.1, in the manner of D31.2 and D31.9). One
 * corpus goes to Ajv and — with the discriminator added — to `parseCommand`,
 * and both must accept and refuse the same rows: every property, at every level,
 * missing or replaced by each value of a pool of JSON values, and an extra field
 * at every level; the rows whose normalised value matters are written by hand.
 *
 * `animation` of `AddAnimation` is an object and nothing more, and `keyframe`
 * of `AddKeyframe` an object whose time alone is described: every other field is
 * the document's, applied by the full validation to the result (D41.3), so an
 * extra field there is accepted by both. An offset is a number in its schema
 * because the parser rounds, and its range is the document's. No AI tool wraps
 * these schemas yet (PR-24).
 */
import { compositionSchema } from '@kadrion/schema';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  addAnimationArgumentsSchema,
  addKeyframeArgumentsSchema,
  EditorError,
  moveKeyframeArgumentsSchema,
  parseCommand,
  removeAnimationArgumentsSchema,
  removeKeyframeArgumentsSchema,
  setOpacityKeyframeArgumentsSchema,
  setPositionKeyframeArgumentsSchema,
  setScaleKeyframeArgumentsSchema,
} from '../src/index.js';

const ajv = new Ajv2020({ strict: true, strictNumbers: true, allErrors: false });

const MAX_TIME = 9_007_199_254_740_991;

/** One value of every JSON type, and the edges of the times, factors, and strings involved. */
const POOL: readonly unknown[] = [
  '',
  'anim-title-opacity',
  'a b',
  '0',
  0,
  -0,
  0.5,
  1,
  1.5,
  -1,
  1000,
  1000.5,
  MAX_TIME,
  MAX_TIME + 1,
  1e300,
  true,
  null,
  [],
  {},
  { x: 1, y: 2 },
  { timeUs: 0, value: 0 },
];

type Json = Readonly<Record<string, unknown>>;

interface Schema {
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: readonly string[];
  readonly additionalProperties?: false;
}

interface Case {
  readonly type: string;
  readonly schema: Schema;
  readonly base: Json;
  /** Rows both must accept, as JSON text, with the value of one field after parsing. */
  readonly accepted: readonly {
    readonly json: string;
    readonly read: (command: Json) => unknown;
    readonly value: unknown;
  }[];
  /** Rows both must refuse, as JSON text. */
  readonly refused: readonly string[];
  /** The paths of the objects that are open on purpose (D41.3). */
  readonly open: readonly string[];
}

const field =
  (...path: string[]) =>
  (command: Json): unknown =>
    path.reduce<unknown>((value, key) => (value as Json)[key], command);

/** The time fields every command refuses unless they are safe integers within the bounds. */
const REFUSED_TIMES = ['0.5', '1e-7', '-1', '9007199254740992', '"0"'];

const CASES: readonly Case[] = [
  {
    type: 'AddAnimation',
    schema: addAnimationArgumentsSchema,
    base: {
      nodeId: 'node-caption',
      index: 0,
      animation: { id: 'a', property: 'opacity', interpolation: 'linear', keyframes: [] },
    },
    accepted: [
      { json: '{"nodeId":"n","index":-0,"animation":{}}', read: field('index'), value: 0 },
      {
        json: '{"animation":{"keyframes":[],"id":7,"extra":1},"index":2,"nodeId":"n"}',
        read: field('animation'),
        value: { keyframes: [], id: 7, extra: 1 },
      },
    ],
    refused: [
      '{"nodeId":"n","index":0.5,"animation":{}}',
      '{"nodeId":"n","index":0,"animation":[]}',
      '{"nodeId":"n","index":0,"animation":null}',
    ],
    open: ['animation'],
  },
  {
    type: 'RemoveAnimation',
    schema: removeAnimationArgumentsSchema,
    base: { animationId: 'anim-title-opacity' },
    accepted: [{ json: '{"animationId":"a b"}', read: field('animationId'), value: 'a b' }],
    refused: ['{"animationId":""}', '{"animationId":7}'],
    open: [],
  },
  {
    type: 'SetOpacityKeyframe',
    schema: setOpacityKeyframeArgumentsSchema,
    base: { animationId: 'anim-title-opacity', timeUs: 0, opacity: 0.5 },
    accepted: [
      {
        json: '{"animationId":"a","timeUs":0,"opacity":0.123}',
        read: field('opacity'),
        value: 0.123,
      },
      { json: '{"animationId":"a","timeUs":-0,"opacity":1}', read: field('timeUs'), value: 0 },
      {
        json: `{"animationId":"a","timeUs":${String(MAX_TIME)},"opacity":0}`,
        read: field('timeUs'),
        value: MAX_TIME,
      },
    ],
    refused: [
      '{"animationId":"a","timeUs":0,"opacity":1.0001}',
      ...REFUSED_TIMES.map((time) => `{"animationId":"a","timeUs":${time},"opacity":0}`),
    ],
    open: [],
  },
  {
    type: 'SetPositionKeyframe',
    schema: setPositionKeyframeArgumentsSchema,
    base: { animationId: 'anim-group-position', timeUs: 0, offset: { x: 1, y: 2 } },
    accepted: [
      {
        json: '{"animationId":"a","timeUs":0,"offset":{"y":-10.5,"x":10.5}}',
        read: field('offset'),
        value: { x: 11, y: -10 },
      },
      {
        json: '{"animationId":"a","timeUs":0,"offset":{"x":1e21,"y":0}}',
        read: field('offset', 'x'),
        value: 1e21,
      },
    ],
    refused: [
      '{"animationId":"a","timeUs":0,"offset":{"x":"1","y":0}}',
      ...REFUSED_TIMES.map((time) => `{"animationId":"a","timeUs":${time},"offset":{"x":0,"y":0}}`),
    ],
    open: [],
  },
  {
    type: 'SetScaleKeyframe',
    schema: setScaleKeyframeArgumentsSchema,
    base: { animationId: 'anim-image-scale', timeUs: 0, factor: { x: 1, y: 2 } },
    accepted: [
      {
        json: '{"animationId":"a","timeUs":5,"factor":{"y":0.25,"x":1000}}',
        read: field('factor'),
        value: { x: 1000, y: 0.25 },
      },
    ],
    refused: [
      '{"animationId":"a","timeUs":0,"factor":{"x":-0.1,"y":1}}',
      '{"animationId":"a","timeUs":0,"factor":{"x":1,"y":1000.0001}}',
      ...REFUSED_TIMES.map((time) => `{"animationId":"a","timeUs":${time},"factor":{"x":1,"y":1}}`),
    ],
    open: [],
  },
  {
    type: 'AddKeyframe',
    schema: addKeyframeArgumentsSchema,
    base: { animationId: 'anim-title-opacity', keyframe: { timeUs: 5, value: 0.5 } },
    accepted: [
      {
        json: '{"animationId":"a","keyframe":{"value":{"y":1,"x":2},"timeUs":-0,"extra":1}}',
        read: field('keyframe'),
        value: { value: { y: 1, x: 2 }, timeUs: 0, extra: 1 },
      },
      {
        json: '{"animationId":"a","keyframe":{"timeUs":3}}',
        read: field('keyframe'),
        value: { timeUs: 3 },
      },
    ],
    refused: [
      '{"animationId":"a","keyframe":{"value":0}}',
      '{"animationId":"a","keyframe":[]}',
      ...REFUSED_TIMES.map((time) => `{"animationId":"a","keyframe":{"timeUs":${time},"value":0}}`),
    ],
    open: ['keyframe'],
  },
  {
    type: 'RemoveKeyframe',
    schema: removeKeyframeArgumentsSchema,
    base: { animationId: 'anim-title-opacity', timeUs: 0 },
    accepted: [{ json: '{"animationId":"a","timeUs":-0}', read: field('timeUs'), value: 0 }],
    refused: REFUSED_TIMES.map((time) => `{"animationId":"a","timeUs":${time}}`),
    open: [],
  },
  {
    type: 'MoveKeyframe',
    schema: moveKeyframeArgumentsSchema,
    base: { animationId: 'anim-title-opacity', timeUs: 0, toTimeUs: 5 },
    accepted: [
      { json: '{"animationId":"a","timeUs":1,"toTimeUs":-0}', read: field('toTimeUs'), value: 0 },
      { json: '{"animationId":"a","timeUs":1,"toTimeUs":1}', read: field('toTimeUs'), value: 1 },
    ],
    refused: [
      ...REFUSED_TIMES.map((time) => `{"animationId":"a","timeUs":${time},"toTimeUs":0}`),
      ...REFUSED_TIMES.map((time) => `{"animationId":"a","timeUs":0,"toTimeUs":${time}}`),
    ],
    open: [],
  },
];

interface Row {
  readonly label: string;
  readonly args: unknown;
}

function isDescribed(node: unknown): node is Schema {
  return typeof node === 'object' && node !== null && 'properties' in node;
}

/** Every path to a property the schema describes, at every level. */
function paths(schema: Schema, prefix: readonly string[] = []): (readonly string[])[] {
  return Object.entries(schema.properties).flatMap(([name, child]) => [
    [...prefix, name],
    ...(isDescribed(child) ? paths(child, [...prefix, name]) : []),
  ]);
}

/** Every object the schema describes the properties of, by its path. */
function objects(schema: Schema, prefix: readonly string[] = []): (readonly string[])[] {
  return [
    prefix,
    ...Object.entries(schema.properties).flatMap(([name, child]) =>
      isDescribed(child) ? objects(child, [...prefix, name]) : [],
    ),
  ];
}

/** The node of the schema at a path of properties. */
function nodeAt(schema: Schema, path: readonly string[]): unknown {
  let node: unknown = schema;
  for (const key of path) node = (node as Schema).properties[key];
  return node;
}

/** A deep copy of `base` with `edit` applied to the object that holds the last key of `path`. */
function variant(
  base: Json,
  path: readonly string[],
  edit: (holder: Record<string, unknown>, key: string) => void,
): unknown {
  const copy = structuredClone(base) as Record<string, unknown>;
  let holder = copy;
  for (const key of path.slice(0, -1)) holder = holder[key] as Record<string, unknown>;
  edit(holder, path.at(-1) ?? '');
  return copy;
}

/** The paths, with the open objects added once: an open object may describe no property. */
function withOpen(
  found: readonly (readonly string[])[],
  open: readonly string[],
): (readonly string[])[] {
  const names = new Set(found.map((path) => path.join('.')));
  return [...found, ...open.filter((name) => !names.has(name)).map((name) => [name])];
}

function generatedRows({ schema, base, open }: Case): Row[] {
  const rows: Row[] = [{ label: 'the base arguments', args: structuredClone(base) }];
  for (const value of POOL) rows.push({ label: `(root) = ${JSON.stringify(value)}`, args: value });
  for (const path of withOpen(paths(schema), open)) {
    for (const value of POOL) {
      const shown = `${JSON.stringify(value)}${Object.is(value, -0) ? ' (-0)' : ''}`;
      rows.push({
        label: `${path.join('.')} = ${shown}`,
        args: variant(base, path, (holder, key) => {
          holder[key] = value;
        }),
      });
    }
    rows.push({
      label: `${path.join('.')} missing`,
      args: variant(base, path, (holder, key) => {
        Reflect.deleteProperty(holder, key);
      }),
    });
  }
  for (const path of withOpen(objects(schema), open)) {
    rows.push({
      label: `an extra field in ${path.join('.') || '(root)'}`,
      args:
        path.length === 0
          ? { ...structuredClone(base), extra: 1 }
          : variant(base, path, (holder, key) => {
              holder[key] = { ...(holder[key] as object), extra: 1 };
            }),
    });
  }
  return rows;
}

function parsed({ type }: Case, args: unknown): Json | string {
  const command =
    typeof args === 'object' && args !== null && !Array.isArray(args) ? { type, ...args } : args;
  try {
    return parseCommand(command) as unknown as Json;
  } catch (reason) {
    if (reason instanceof EditorError) return reason.code;
    throw reason;
  }
}

function disagreements(test: Case, rows: readonly Row[]): string[] {
  const accepts = ajv.compile(test.schema);
  return rows
    .filter(({ args }) => accepts(args) !== (typeof parsed(test, args) !== 'string'))
    .map(
      ({ label, args }) =>
        `${label}: Ajv ${String(accepts(args))}, parseCommand ${JSON.stringify(parsed(test, args))}`,
    );
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe.each(CASES)('the argument schema of $type (D41.1)', (test) => {
  const { schema, base, open } = test;

  it('is a valid draft 2020-12 schema, deep-frozen, closed but where it is open on purpose, and without a type field', () => {
    expect(ajv.validateSchema(schema)).toBe(true);
    expect(ajv.compile(schema)(base)).toBe(true);
    expect(isDeepFrozen(schema)).toBe(true);
    for (const path of objects(schema)) {
      const node = nodeAt(schema, path);
      if (!isDescribed(node)) throw new Error(`Not an object at ${path.join('.')}.`);
      const name = path.join('.');
      expect(node.additionalProperties, name).toBe(open.includes(name) ? undefined : false);
      expect([...node.required].sort(), name).toEqual(Object.keys(node.properties).sort());
    }
    for (const name of open) {
      expect(nodeAt(schema, [name]), name).toMatchObject({ type: 'object' });
      expect(nodeAt(schema, [name]), name).not.toHaveProperty('additionalProperties');
    }
    expect(ajv.compile(schema)({ type: test.type, ...base })).toBe(false);
  });

  it('gets the same verdict as parseCommand on every generated row', () => {
    const rows = generatedRows(test);
    const accepts = ajv.compile(schema);
    // The premise: a corpus of one verdict would agree with any schema.
    expect(rows.filter(({ args }) => accepts(args)).length).toBeGreaterThan(1);
    expect(rows.filter(({ args }) => !accepts(args)).length).toBeGreaterThan(20);
    expect(disagreements(test, rows)).toEqual([]);
  });

  it('gets the same verdict on the hand-written rows, and normalises as stated', () => {
    const rows = [...test.accepted.map(({ json }) => json), ...test.refused].map((json) => ({
      label: json.slice(0, 80),
      args: JSON.parse(json) as unknown,
    }));
    expect(disagreements(test, rows)).toEqual([]);
    for (const json of test.refused) {
      expect(ajv.compile(schema)(JSON.parse(json)), json).toBe(false);
      expect(parsed(test, JSON.parse(json)), json).toBe('invalid-argument');
    }
    for (const { json, read, value } of test.accepted) {
      const result = parsed(test, JSON.parse(json));
      if (typeof result === 'string') throw new Error(`${json} was refused: ${result}`);
      expect(read(result), json).toEqual(value);
      expect(Object.is(read(result), -0), json).toBe(false);
    }
  });
});

describe('what the schemas take from the document (D41.2)', () => {
  it('reads the bounds of a time from the keyframe time of compositionSchema', () => {
    const nodes = compositionSchema.properties.scenes.items.properties.nodes.items
      .oneOf as unknown as unknown[];
    const times = nodes.flatMap((node) => {
      const branches = (node as { properties: { animations?: { items: { oneOf: unknown[] } } } })
        .properties.animations?.items.oneOf;
      return (branches ?? []).map(
        (branch) =>
          (branch as { properties: { keyframes: { items: { properties: { timeUs: object } } } } })
            .properties.keyframes.items.properties.timeUs,
      );
    });
    expect(times.length).toBeGreaterThan(0);
    const time = setOpacityKeyframeArgumentsSchema.properties.timeUs;
    for (const documentTime of times) {
      const { minimum, maximum } = documentTime as { minimum: number; maximum: number };
      expect(time).toMatchObject({ type: 'integer', minimum, maximum });
    }
    for (const schema of [
      setPositionKeyframeArgumentsSchema.properties.timeUs,
      setScaleKeyframeArgumentsSchema.properties.timeUs,
      removeKeyframeArgumentsSchema.properties.timeUs,
      moveKeyframeArgumentsSchema.properties.timeUs,
      moveKeyframeArgumentsSchema.properties.toTimeUs,
      addKeyframeArgumentsSchema.properties.keyframe.properties.timeUs,
    ]) {
      expect(schema).toEqual(time);
    }
  });
});
