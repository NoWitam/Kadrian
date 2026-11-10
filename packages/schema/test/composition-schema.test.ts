import { invalidCompositionCases, referenceComposition } from '@kadrion/test-fixtures';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { compositionSchema } from '../src/index.js';
import type { JsonSchema } from '../src/json-schema.js';
import { assertSupportedSchema, validateStructure } from '../src/validate-structure.js';
import { applyPatch } from './apply-patch.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = Record<string, Json>;

const MAX_SAFE_INTEGER = 9_007_199_254_740_991;
const ID_PATTERN = '^[A-Za-z0-9_-]+$';

/** The schema exactly as a third party sees it: plain JSON without TypeScript types. */
const schemaJson = JSON.parse(JSON.stringify(compositionSchema)) as JsonObject;

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

interface Located {
  readonly location: string;
  /** Name of the property that holds this schema, when there is one. */
  readonly name: string | undefined;
  readonly schema: JsonObject;
}

/** Every subschema, however deeply nested. */
function subschemas(schema: JsonObject, location = '#', name?: string): Located[] {
  const found: Located[] = [{ location, name, schema }];
  const { properties, items, oneOf } = schema;
  if (isObject(properties)) {
    for (const [key, child] of Object.entries(properties)) {
      if (isObject(child)) found.push(...subschemas(child, `${location}/properties/${key}`, key));
    }
  }
  if (isObject(items)) found.push(...subschemas(items, `${location}/items`));
  if (Array.isArray(oneOf)) {
    oneOf.forEach((branch, index) => {
      if (isObject(branch)) {
        found.push(...subschemas(branch, `${location}/oneOf/${String(index)}`));
      }
    });
  }
  return found;
}

const all = subschemas(schemaJson);
const locationsWhere = (predicate: (located: Located) => boolean): string[] =>
  all.filter(predicate).map(({ location }) => location);

/** Every object and array reachable from a value, the value itself included. */
function everyObject(value: unknown): object[] {
  if (typeof value !== 'object' || value === null) return [];
  return [value, ...Object.values(value).flatMap((child) => everyObject(child))];
}

// D24.2: `validate-structure.ts` remembers the schema objects it has checked,
// which is harmless only if none of them can change afterwards.
describe('the memo of checked schema objects (D24)', () => {
  it('sees only frozen schema objects: every object of compositionSchema is frozen', () => {
    const objects = everyObject(compositionSchema);
    expect(objects.length).toBeGreaterThan(100);
    expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
  });

  it('cannot be tricked by a change after the first check', () => {
    assertSupportedSchema(compositionSchema);
    const width = compositionSchema.properties.width as unknown as Record<string, unknown>;
    expect(() => {
      width.format = 'uuid';
    }).toThrow(TypeError);
    expect(width).not.toHaveProperty('format');
  });

  it('gives the same verdict for a schema object the second time', () => {
    const schema = { type: 'string', minLength: 1 } as unknown as JsonSchema;
    for (let round = 0; round < 2; round += 1) {
      expect(() => {
        assertSupportedSchema(schema);
      }).toThrow('Unsupported JSON Schema at #: string, minLength');
    }
    const accepted = Object.freeze({ type: 'string' }) as JsonSchema;
    for (let round = 0; round < 2; round += 1) {
      expect(() => {
        assertSupportedSchema(accepted);
      }).not.toThrow();
    }
  });
});

describe('schema conventions', () => {
  it('stays within the keyword subset that the validator interprets', () => {
    expect(() => {
      assertSupportedSchema(compositionSchema);
    }).not.toThrow();
  });

  it.each([
    ['an unknown keyword', { type: 'string', format: 'uuid' }],
    ['an unsupported type', { type: 'null' }],
    ['a boolean with a keyword it does not take', { type: 'boolean', const: true }],
    [
      'an open object',
      { type: 'object', properties: {}, required: [], additionalProperties: true },
    ],
    [
      'a required field that is not a property',
      { type: 'object', properties: {}, required: ['id'], additionalProperties: false },
    ],
    ['a union without a discriminator', { oneOf: [{ type: 'object', properties: {} }] }],
    ['a nested violation', { type: 'array', items: { type: 'string', minLength: 1 } }],
  ])('rejects %s instead of ignoring it', (_name, schema) => {
    expect(() => {
      assertSupportedSchema(schema as unknown as JsonSchema);
    }).toThrow();
  });

  it('closes every object and requires every property (D16)', () => {
    const objects = all.filter(({ schema }) => schema.type === 'object');
    expect(objects.length).toBeGreaterThan(10);
    const open = objects.filter(({ schema }) => {
      const names = isObject(schema.properties) ? Object.keys(schema.properties) : [];
      const required = Array.isArray(schema.required) ? [...schema.required] : [];
      return (
        schema.additionalProperties !== false ||
        JSON.stringify(required.sort()) !== JSON.stringify(names.sort())
      );
    });
    expect(open.map(({ location }) => location)).toEqual([]);
  });

  it('bounds every number (D15)', () => {
    const numbers = all.filter(
      ({ schema }) => schema.type === 'integer' || schema.type === 'number',
    );
    expect(numbers.length).toBeGreaterThan(10);
    const unbounded = numbers.filter(({ schema: { type, minimum, maximum } }) => {
      const isBound = type === 'integer' ? Number.isSafeInteger : Number.isFinite;
      return !isBound(minimum) || !isBound(maximum);
    });
    expect(unbounded.map(({ location }) => location)).toEqual([]);
  });

  it('stores time as integer microseconds in fields that end in "Us", and only there (D04)', () => {
    const isTime = ({ type, minimum, maximum }: JsonObject): boolean =>
      type === 'integer' && Number(minimum) >= 0 && maximum === MAX_SAFE_INTEGER;
    const named = all.filter(({ name }) => name?.endsWith('Us') === true);
    expect(named.length).toBeGreaterThan(3);
    expect(named.filter(({ schema }) => !isTime(schema)).map(({ location }) => location)).toEqual(
      [],
    );
    expect(
      locationsWhere(({ name, schema }) => isTime(schema) && name?.endsWith('Us') !== true),
    ).toEqual([]);
  });

  /** Whether an array holds the values an instance gives its inputs, each with an inputId (D77). */
  const givesInputs = (schema: JsonObject): boolean => {
    const items = schema['items'];
    if (!isObject(items) || !Array.isArray(items['oneOf'])) return false;
    return items['oneOf'].every(
      (branch) =>
        isObject(branch) && isObject(branch['properties']) && 'inputId' in branch['properties'],
    );
  };

  it('requires a stable ID for every entity: all array items except keyframes, caption words, the tracks of a text animation, the fields and items of a list input, the values of an instance, the levels of a curve, the points, commands, stops, and dashes of a shape, and the fonts and parameters of a Custom HTML element', () => {
    // A keyframe is addressed by its time, a caption word by its index (D57), a
    // field of a list input by its key, an item of its default by its index, and
    // a value of an item by its field (D58.1), a track of a text animation
    // by its property, which it holds once (D69), and a level of a curve by its
    // index, a number and no entity (D72); the points and commands of a shape's
    // geometry, the stops of its gradient, and the dashes of its stroke are
    // values addressed by their index and replaced whole (D73); the values of an
    // instance are addressed by the input they give, and the items of a list value
    // by their index, as a default's are (D77); the fonts of a Custom HTML
    // element are asset references, and its parameters are addressed by their
    // key, which they hold once (D78).
    const values = locationsWhere(({ name }) => name === 'default' || name === 'value').map(
      (location) => `${location}/items`,
    );
    const entities = all
      .filter(
        ({ name, location, schema }) =>
          schema.type === 'array' &&
          ![
            'keyframes',
            'words',
            'fields',
            'default',
            'tracks',
            'red',
            'green',
            'blue',
            'points',
            'commands',
            'stops',
            'dash',
            'value',
            'fontAssetIds',
            'parameters',
          ].includes(name ?? '') &&
          !values.includes(location) &&
          !givesInputs(schema),
      )
      .flatMap(({ location, schema: { items } }) => {
        const branches = isObject(items) && Array.isArray(items.oneOf) ? items.oneOf : [items];
        return branches.map((branch, index) => ({
          location: `${location}[${String(index)}]`,
          branch,
        }));
      });
    expect(entities.length).toBeGreaterThan(10);
    const withoutId = entities.filter(({ branch }) => {
      const id = isObject(branch) && isObject(branch.properties) ? branch.properties.id : undefined;
      return !isObject(id) || id.type !== 'string' || id.pattern !== ID_PATTERN;
    });
    expect(withoutId.map(({ location }) => location)).toEqual([]);
  });

  it('knows every asset reference site, so that none escapes the reference check', () => {
    const sites = all
      .filter(({ schema }) => isObject(schema.properties))
      .flatMap(({ schema: { properties } }) => {
        const fields = isObject(properties) ? properties : {};
        // A binding is told apart by its kind (D58.2).
        const tag = isObject(fields.type)
          ? fields.type.const
          : isObject(fields.kind)
            ? fields.kind.const
            : undefined;
        const type = typeof tag === 'string' ? tag : 'unknown';
        return Object.keys(fields)
          .filter((name) => /assetIds?$/i.test(name))
          .map((name) => `${type}.${name}`);
      });
    // A new site needs a rule in validate-semantics.ts and negative fixtures before it is listed here.
    expect([...new Set(sites)].sort()).toEqual([
      'asset.assetId',
      'audio.assetId',
      'captions.fontAssetId',
      'custom-html.fontAssetIds',
      'image.assetId',
      'item-asset.assetId',
      'text.fontAssetId',
      'video.assetId',
    ]);
  });
});

/** Deterministic neighbourhood of the reference composition: every field removed, retyped, or pushed out of range. */
function mutantsOf(document: Json): { readonly label: string; readonly mutant: Json }[] {
  const replacements: Json[] = [null, true, 0, -1, 0.5, 1.5, 2 ** 53, '', 'x', [], {}];
  const mutants: { label: string; mutant: Json }[] = [];

  const visit = (value: Json, path: (string | number)[]): void => {
    const label = `/${path.join('/')}`;
    const mutate = (change: (parent: Json, key: string | number) => void, what: string): void => {
      const copy = JSON.parse(JSON.stringify(document)) as Json;
      let parent = copy;
      for (const token of path.slice(0, -1)) {
        parent = (parent as JsonObject)[token as string] ?? null;
      }
      const key = path.at(-1);
      if (key !== undefined) change(parent, key);
      mutants.push({ label: `${what} ${label}`, mutant: copy });
    };

    if (path.length > 0) {
      mutate((parent, key) => {
        if (Array.isArray(parent)) parent.splice(Number(key), 1);
        else Reflect.deleteProperty(parent as JsonObject, key);
      }, 'remove');
      for (const replacement of replacements) {
        if (JSON.stringify(replacement) === JSON.stringify(value)) continue;
        mutate(
          (parent, key) => {
            (parent as JsonObject)[key as string] = replacement;
          },
          `replace with ${JSON.stringify(replacement)}`,
        );
      }
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, [...path, index]);
      });
      const [first] = value;
      if (first !== undefined) {
        mutate((parent, key) => {
          ((parent as JsonObject)[key as string] as Json[]).push(first);
        }, 'duplicate the first item of');
      }
    } else if (isObject(value)) {
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
      // Keys that exist on Object.prototype must not be mistaken for declared properties.
      for (const key of ['unknownField', 'constructor', 'toString', '__proto__']) {
        const copy = JSON.parse(JSON.stringify(document)) as Json;
        let target = copy;
        for (const token of path) target = (target as JsonObject)[token as string] ?? null;
        Object.defineProperty(target, key, { value: 1, enumerable: true, configurable: true });
        mutants.push({ label: `add "${key}" to ${label}`, mutant: copy });
      }
    }
  };

  visit(document, []);
  return mutants;
}

/**
 * The schema for the reference implementation, with every large subschema that
 * occurs more than once moved into `$defs` and referred to: the same schema,
 * since a `$ref` validates as the schema it names. Inlined, the effects of
 * schema 0.17 (D72) at every holder make Ajv generate one function of some
 * 17 MB, which the worker of Node 24 in the pinned container cannot run.
 */
function factored(schema: JsonObject): JsonObject {
  const counts = new Map<string, number>();
  for (const { location, schema: sub } of subschemas(schema)) {
    if (location === '#') continue;
    const key = JSON.stringify(sub);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const defs: Record<string, Json> = {};
  const names = new Map<string, string>();
  const rewrite = (sub: JsonObject, root: boolean): JsonObject => {
    const key = JSON.stringify(sub);
    if (!root && key.length >= 2_000 && (counts.get(key) ?? 0) > 1) {
      let name = names.get(key);
      if (name === undefined) {
        name = `s${String(names.size)}`;
        names.set(key, name);
        defs[name] = children(sub);
      }
      return { $ref: `#/$defs/${name}` };
    }
    return children(sub);
  };
  const children = (sub: JsonObject): JsonObject => {
    const copy: JsonObject = { ...sub };
    const { properties, items, oneOf } = sub;
    if (isObject(properties)) {
      copy.properties = Object.fromEntries(
        Object.entries(properties).map(([key, child]) => [
          key,
          isObject(child) ? rewrite(child, false) : child,
        ]),
      );
    }
    if (isObject(items)) copy.items = rewrite(items, false);
    if (Array.isArray(oneOf)) {
      copy.oneOf = oneOf.map((branch) => (isObject(branch) ? rewrite(branch, false) : branch));
    }
    return copy;
  };
  const result = rewrite(schema, true);
  return { ...result, $defs: defs };
}

describe('conformance with JSON Schema draft 2020-12 (D17)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: false, inlineRefs: false });
  const ajvValidate = ajv.compile(factored(schemaJson));
  const isStructurallyValid = (document: unknown): boolean =>
    validateStructure(compositionSchema, document).length === 0;

  it('is a well-formed schema under the strict mode of a reference implementation', () => {
    expect(ajv.validateSchema(schemaJson)).toBe(true);
    expect(schemaJson.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('agrees with the reference implementation on every fixture', () => {
    const documents = [
      { name: 'reference', document: referenceComposition },
      ...invalidCompositionCases.map(({ name, patch }) => ({
        name,
        document: applyPatch(referenceComposition, patch),
      })),
    ];
    const disagreements = documents
      .filter(({ document }) => ajvValidate(document) !== isStructurallyValid(document))
      .map(({ name }) => name);
    expect(disagreements).toEqual([]);
    expect(ajvValidate(referenceComposition)).toBe(true);
  });

  // Every mutant of a document with effects is validated twice: about 10 s on a
  // loaded container (D71), so the default 5 s is too short.
  it('agrees with the reference implementation on every mutant of the reference composition', () => {
    const mutants = mutantsOf(JSON.parse(JSON.stringify(referenceComposition)) as Json);
    const verdicts = mutants.map(({ label, mutant }) => ({
      label,
      ajv: ajvValidate(mutant),
      own: isStructurallyValid(mutant),
    }));
    expect(verdicts.filter(({ ajv: theirs, own }) => theirs !== own)).toEqual([]);
    // The neighbourhood must exercise both verdicts, or the comparison proves nothing.
    expect(verdicts.filter(({ own }) => !own).length).toBeGreaterThan(1000);
    expect(verdicts.filter(({ own }) => own).length).toBeGreaterThan(50);
  }, 60_000);
});
