/**
 * The JSON Schemas of the arguments of the commands of D40 and the parser they
 * must agree with (D40.6, in the manner of D31.2 and D31.9). One corpus goes to
 * Ajv and — with the discriminator added — to `parseCommand`, and both must
 * accept and refuse the same rows: every property, at every level, missing or
 * replaced by each value of a pool of JSON values, and an extra field at every
 * level; the rows whose normalised value matters are written by hand.
 *
 * Size and font size are numbers in their schemas because the parser rounds;
 * their range is the document's, refused later as `invalid-result`, so both
 * sides accept any finite number here. A colour's pattern accepts either case
 * because the parser lowercases. No AI tool wraps these schemas yet (PR-24).
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  addAssetArgumentsSchema,
  EditorError,
  parseCommand,
  removeAssetArgumentsSchema,
  setImageAssetArgumentsSchema,
  setNodeColorArgumentsSchema,
  setNodeScaleArgumentsSchema,
  setNodeSizeArgumentsSchema,
  setTextFontArgumentsSchema,
  setTextFontSizeArgumentsSchema,
} from '../src/index.js';

const ajv = new Ajv2020({ strict: true, strictNumbers: true, allErrors: false });

const HASH = `sha256:${'a'.repeat(64)}`;

/** One value of every JSON type, and the edges of the numbers, strings, and colours involved. */
const POOL: readonly unknown[] = [
  '',
  'node-title',
  'a b',
  '#ffffff',
  '#FFFFFF',
  '#fff',
  HASH,
  'image',
  'video',
  0,
  -0,
  0.4,
  1,
  2.5,
  -1,
  1000,
  1000.5,
  9_007_199_254_740_992,
  1e300,
  true,
  null,
  [],
  {},
  { x: 1, y: 2 },
];

type Json = Readonly<Record<string, unknown>>;

interface Schema {
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
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
}

const scaleOf = (command: Json): unknown => command['scale'];
const widthOf = (command: Json): unknown => command['width'];

const CASES: readonly Case[] = [
  {
    type: 'SetNodeScale',
    schema: setNodeScaleArgumentsSchema,
    base: { nodeId: 'node-title', scale: { x: 1, y: 2 } },
    accepted: [
      { json: '{"nodeId":"n","scale":{"x":0,"y":1000}}', read: scaleOf, value: { x: 0, y: 1000 } },
      {
        json: '{"nodeId":"n","scale":{"y":0.25,"x":1.5}}',
        read: scaleOf,
        value: { x: 1.5, y: 0.25 },
      },
    ],
    refused: [
      '{"nodeId":"n","scale":{"x":-0.1,"y":1}}',
      '{"nodeId":"n","scale":{"x":1,"y":1000.0001}}',
    ],
  },
  {
    type: 'SetNodeSize',
    schema: setNodeSizeArgumentsSchema,
    base: { nodeId: 'node-image', width: 10, height: 20 },
    accepted: [
      { json: '{"nodeId":"n","width":299.5,"height":1}', read: widthOf, value: 300 },
      { json: '{"nodeId":"n","width":-0.4,"height":1}', read: widthOf, value: 0 },
      // Accepted by both: the range is the document's (D40.1).
      { json: '{"nodeId":"n","width":1e21,"height":0}', read: widthOf, value: 1e21 },
    ],
    refused: ['{"nodeId":"n","width":"10","height":1}'],
  },
  {
    type: 'SetNodeColor',
    schema: setNodeColorArgumentsSchema,
    base: { nodeId: 'node-title', color: '#1a2b3c' },
    accepted: [
      { json: '{"nodeId":"n","color":"#ABCDEF"}', read: (c) => c['color'], value: '#abcdef' },
      { json: '{"nodeId":"n","color":"#aBc012"}', read: (c) => c['color'], value: '#abc012' },
    ],
    refused: [
      '{"nodeId":"n","color":"#abcdeg"}',
      '{"nodeId":"n","color":"#abcdef00"}',
      '{"nodeId":"n","color":"abcdef"}',
      '{"nodeId":"n","color":" #abcdef"}',
      '{"nodeId":"n","color":"#abcdef\\n"}',
    ],
  },
  {
    type: 'SetTextFontSize',
    schema: setTextFontSizeArgumentsSchema,
    base: { nodeId: 'node-title', fontSize: 40 },
    accepted: [{ json: '{"nodeId":"n","fontSize":39.5}', read: (c) => c['fontSize'], value: 40 }],
    refused: ['{"nodeId":"n","fontSize":null}'],
  },
  {
    type: 'SetTextFont',
    schema: setTextFontArgumentsSchema,
    base: { nodeId: 'node-title', fontAssetId: 'asset-font' },
    accepted: [
      { json: '{"nodeId":"n","fontAssetId":"a b"}', read: (c) => c['fontAssetId'], value: 'a b' },
    ],
    refused: ['{"nodeId":"n","fontAssetId":""}'],
  },
  {
    type: 'SetImageAsset',
    schema: setImageAssetArgumentsSchema,
    base: { nodeId: 'node-image', assetId: 'asset-image' },
    accepted: [{ json: '{"nodeId":"n","assetId":"x"}', read: (c) => c['assetId'], value: 'x' }],
    refused: ['{"nodeId":"n","assetId":7}'],
  },
  {
    type: 'AddAsset',
    schema: addAssetArgumentsSchema,
    base: { asset: { id: 'new', type: 'image', contentHash: HASH }, index: 0 },
    accepted: [
      {
        json: `{"index":-0,"asset":{"contentHash":"${HASH}","type":"font","id":"__proto__"}}`,
        read: (c) => c['index'],
        value: 0,
      },
      {
        json: `{"asset":{"id":"a","type":"audio","contentHash":"${HASH}"},"index":3}`,
        read: (c) => c['index'],
        value: 3,
      },
    ],
    refused: [
      `{"asset":{"id":"a","type":"image","contentHash":"sha256:${'A'.repeat(64)}"},"index":0}`,
      `{"asset":{"id":"a","type":"image","contentHash":"${HASH}","mediaType":"image/png"},"index":0}`,
      `{"asset":{"id":"a","type":"Image","contentHash":"${HASH}"},"index":0}`,
      `{"asset":{"id":"a","type":"image","contentHash":"${HASH}"},"index":0.5}`,
    ],
  },
  {
    type: 'RemoveAsset',
    schema: removeAssetArgumentsSchema,
    base: { assetId: 'asset-image' },
    accepted: [{ json: '{"assetId":"x"}', read: (c) => c['assetId'], value: 'x' }],
    refused: ['{"assetId":""}', '{"assetId":null}'],
  },
];

interface Row {
  readonly label: string;
  readonly args: unknown;
}

function isClosed(node: unknown): node is Schema {
  return typeof node === 'object' && node !== null && 'properties' in node;
}

/** Every path to a property the schema describes, at every level. */
function paths(schema: Schema, prefix: readonly string[] = []): (readonly string[])[] {
  return Object.entries(schema.properties).flatMap(([name, child]) => [
    [...prefix, name],
    ...(isClosed(child) ? paths(child, [...prefix, name]) : []),
  ]);
}

/** Every closed object the schema describes, by its path. */
function objects(schema: Schema, prefix: readonly string[] = []): (readonly string[])[] {
  return [
    prefix,
    ...Object.entries(schema.properties).flatMap(([name, child]) =>
      isClosed(child) ? objects(child, [...prefix, name]) : [],
    ),
  ];
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

function generatedRows({ schema, base }: Case): Row[] {
  const rows: Row[] = [{ label: 'the base arguments', args: structuredClone(base) }];
  for (const value of POOL) rows.push({ label: `(root) = ${JSON.stringify(value)}`, args: value });
  for (const path of paths(schema)) {
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
  for (const path of objects(schema)) {
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

describe.each(CASES)('the argument schema of $type (D40.6)', (test) => {
  const { schema, base } = test;

  it('is a valid draft 2020-12 schema, deep-frozen, closed at every level, and without a type field', () => {
    expect(ajv.validateSchema(schema)).toBe(true);
    expect(ajv.compile(schema)(base)).toBe(true);
    expect(isDeepFrozen(schema)).toBe(true);
    for (const path of objects(schema)) {
      let node: unknown = schema;
      for (const key of path) node = (node as Schema).properties[key];
      if (!isClosed(node)) throw new Error(`Not a closed object at ${path.join('.')}.`);
      expect(node.additionalProperties, path.join('.')).toBe(false);
      expect([...node.required].sort(), path.join('.')).toEqual(
        Object.keys(node.properties).sort(),
      );
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
    }
  });
});

describe('what the schemas take from the document (D40.3)', () => {
  it('reads the asset ID, type, and hash forms from compositionSchema', async () => {
    const { compositionSchema } = await import('@kadrion/schema');
    const asset = addAssetArgumentsSchema.properties.asset as unknown as Schema;
    const document = compositionSchema.properties.assets.items.properties;
    expect(asset.properties['type']).toMatchObject({ enum: document.type.enum });
    expect(asset.properties['contentHash']).toMatchObject({
      pattern: document.contentHash.pattern,
    });
    expect(asset.properties['id']).toMatchObject({ pattern: document.id.pattern });
  });
});
