/**
 * The bus must not keep a second copy of the schema's knowledge (D30.8). Which
 * node types carry a position, an opacity, or a text is derived here from
 * `compositionSchema` itself and checked against what the bus actually accepts,
 * so a node type the schema gains later cannot silently stay `unsupported-node`.
 */
import { compositionSchema } from '@kadrion/schema';
import { describe, expect, it } from 'vitest';

import { keyframeMinimum, keyframeTimeBounds } from '../src/animations.js';
import { applyCommand, type Command } from '../src/index.js';

import { codeOf, nodeOf, positionOf, reference, validated } from './support.js';

/** Walks a JSON Schema by key, without claiming a type the schema does not have. */
function at(value: unknown, ...path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function variantsOf(value: unknown): readonly unknown[] {
  const oneOf = at(value, 'oneOf');
  return Array.isArray(oneOf) ? oneOf : [];
}

const nodeVariants = variantsOf(
  at(compositionSchema, 'properties', 'scenes', 'items', 'properties', 'nodes', 'items'),
);
const groupVariant = nodeVariants.find(
  (variant) => at(variant, 'properties', 'type', 'const') === 'group',
);
const childVariants = variantsOf(at(groupVariant, 'properties', 'children', 'items'));

/** Node type → whether schema 0.1 gives that type the field. */
function carrying(field: string): Map<string, boolean> {
  return new Map<string, boolean>(
    [...nodeVariants, ...childVariants].map((variant) => [
      String(at(variant, 'properties', 'type', 'const')),
      at(variant, 'properties', field) !== undefined,
    ]),
  );
}

const positioned = carrying('position');
const faded = carrying('opacity');
const texted = carrying('text');

/** One field of a node of a document, read back for an assertion. */
function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

interface FixtureNode {
  readonly id: string;
  readonly type: string;
  readonly children?: readonly FixtureNode[];
}

/** One node of each type in the reference composition, which contains them all (§3.2). */
function nodesByType(): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (node: FixtureNode): void => {
    if (!found.has(node.type)) found.set(node.type, node.id);
    for (const child of node.children ?? []) visit(child);
  };
  for (const scene of (reference() as unknown as { scenes: { nodes: FixtureNode[] }[] }).scenes) {
    for (const node of scene.nodes) visit(node);
  }
  return found;
}

describe('the node types the bus accepts (D30.8)', () => {
  it('reads every node type of schema 0.1 out of the schema itself', () => {
    expect([...positioned.keys()].sort()).toEqual([
      'background',
      'custom-html',
      'group',
      'image',
      'text',
    ]);
    expect(positioned.get('background')).toBe(false);
    expect([...positioned.values()].filter(Boolean)).toHaveLength(4);
  });

  it('has no nested group, which is why searching two levels deep is enough (D16)', () => {
    // `findNode` and `replaceNode` look at a scene's nodes and at one level of
    // children. A group inside a group would make a node unreachable, and the
    // command would answer `unknown-node` for a node that exists.
    for (const variant of childVariants) {
      expect(at(variant, 'properties', 'children')).toBeUndefined();
      expect(at(variant, 'properties', 'type', 'const')).not.toBe('group');
    }
    expect(childVariants.length).toBeGreaterThan(0);
  });

  it('has one node of every type in the reference composition', () => {
    expect([...nodesByType().keys()].sort()).toEqual([...positioned.keys()].sort());
  });

  it.each([...positioned.keys()].sort())(
    'moves a node of type %s exactly when it has a position',
    (type) => {
      const nodeId = nodesByType().get(type) ?? '';
      const document = reference();
      const command: Command = { type: 'SetNodePosition', nodeId, position: { x: 7, y: 9 } };
      if (positioned.get(type) === true) {
        expect(positionOf(applyCommand(document, command).document, nodeId)).toEqual({
          x: 7,
          y: 9,
        });
      } else {
        expect(codeOf(() => applyCommand(document, command))).toBe('unsupported-node');
      }
    },
  );

  it('reads which node types carry an opacity and a text out of the schema (D38.2, D38.3)', () => {
    expect([...faded.keys()].sort()).toEqual([...positioned.keys()].sort());
    expect(
      [...faded]
        .filter(([, has]) => has)
        .map(([type]) => type)
        .sort(),
    ).toEqual(['custom-html', 'group', 'image', 'text']);
    expect([...texted].filter(([, has]) => has).map(([type]) => type)).toEqual(['text']);
  });

  it.each([...faded.keys()].sort())(
    'sets the opacity of a node of type %s exactly when it has one',
    (type) => {
      const nodeId = nodesByType().get(type) ?? '';
      const document = reference();
      const command: Command = { type: 'SetNodeOpacity', nodeId, opacity: 0.125 };
      if (faded.get(type) === true) {
        expect(fieldOf(applyCommand(document, command).document, nodeId, 'opacity')).toBe(0.125);
      } else {
        expect(codeOf(() => applyCommand(document, command))).toBe('unsupported-node');
      }
    },
  );

  it.each([...texted.keys()].sort())(
    'replaces the text of a node of type %s exactly when it has one',
    (type) => {
      const nodeId = nodesByType().get(type) ?? '';
      const document = reference();
      const command: Command = { type: 'SetTextContent', nodeId, text: 'Replaced\ntext' };
      if (texted.get(type) === true) {
        expect(fieldOf(applyCommand(document, command).document, nodeId, 'text')).toBe(
          'Replaced\ntext',
        );
      } else {
        expect(codeOf(() => applyCommand(document, command))).toBe('unsupported-node');
      }
    },
  );
});

/**
 * The fields of D40, each with the command that edits it, a value that differs
 * from the reference composition's, and the field it is read back from.
 */
const EDITED = [
  {
    field: 'scale',
    command: (nodeId: string): Command => ({ type: 'SetNodeScale', nodeId, scale: { x: 7, y: 9 } }),
    expected: { x: 7, y: 9 },
  },
  {
    field: 'width',
    command: (nodeId: string): Command => ({ type: 'SetNodeSize', nodeId, width: 33, height: 44 }),
    expected: 33,
  },
  {
    field: 'color',
    command: (nodeId: string): Command => ({ type: 'SetNodeColor', nodeId, color: '#123456' }),
    expected: '#123456',
  },
  {
    field: 'fontSize',
    command: (nodeId: string): Command => ({ type: 'SetTextFontSize', nodeId, fontSize: 17 }),
    expected: 17,
  },
  {
    field: 'fontAssetId',
    command: (nodeId: string): Command => ({
      type: 'SetTextFont',
      nodeId,
      fontAssetId: 'font-2',
    }),
    expected: 'font-2',
  },
  {
    field: 'assetId',
    command: (nodeId: string): Command => ({
      type: 'SetImageAsset',
      nodeId,
      assetId: 'image-2',
    }),
    expected: 'image-2',
  },
] as const;

/**
 * The reference composition with a second font and a second image asset, so the
 * font and image rows change a reference instead of setting the one it holds.
 */
function withSecondAssets() {
  const draft = structuredClone(reference()) as unknown as {
    assets: { id: string; type: string; contentHash: string }[];
  };
  draft.assets.push({ id: 'font-2', type: 'font', contentHash: `sha256:${'c'.repeat(64)}` });
  draft.assets.push({ id: 'image-2', type: 'image', contentHash: `sha256:${'d'.repeat(64)}` });
  return validated(draft);
}

describe('the node types the commands of D40 accept (D30.8)', () => {
  it('reads which node types carry each field out of the schema', () => {
    const carriers = (field: string): string[] =>
      [...carrying(field)]
        .filter(([, has]) => has)
        .map(([type]) => type)
        .sort();
    expect(carriers('scale')).toEqual(['custom-html', 'group', 'image', 'text']);
    expect(carriers('width')).toEqual(['custom-html', 'image']);
    expect(carriers('height')).toEqual(carriers('width'));
    expect(carriers('color')).toEqual(['background', 'text']);
    expect(carriers('fontSize')).toEqual(['text']);
    expect(carriers('fontAssetId')).toEqual(['text']);
    expect(carriers('assetId')).toEqual(['image']);
  });

  for (const { field, command, expected } of EDITED) {
    const carried = carrying(field);
    it.each([...carried.keys()].sort())(
      `edits ${field} of a node of type %s exactly when it has the field`,
      (type) => {
        const nodeId = nodesByType().get(type) ?? '';
        const document = withSecondAssets();
        if (carried.get(type) === true) {
          // Every row sets a value the node does not hold yet, so the field must
          // change: a command that wrote nothing would leave the old value.
          expect(fieldOf(document, nodeId, field)).not.toEqual(expected);
          const edited = applyCommand(document, command(nodeId)).document;
          expect(fieldOf(edited, nodeId, field)).toEqual(expected);
        } else {
          expect(codeOf(() => applyCommand(document, command(nodeId)))).toBe('unsupported-node');
        }
      },
    );
  }
});

/** The animation shapes of schema 0.1, by node type, read here independently of `animations.ts`. */
function animationShapes(): { readonly type: string; readonly shapes: readonly unknown[] }[] {
  return [...nodeVariants, ...childVariants].map((variant) => ({
    type: String(at(variant, 'properties', 'type', 'const')),
    shapes: variantsOf(at(variant, 'properties', 'animations', 'items')),
  }));
}

describe('what the animation commands read from the schema (D41.2, D41.4)', () => {
  it('reads the minimum number of keyframes of each property from the schema', () => {
    const minimums = new Map<string, unknown>();
    for (const { shapes } of animationShapes()) {
      for (const shape of shapes) {
        const property = String(at(shape, 'properties', 'property', 'const'));
        const minimum = at(shape, 'properties', 'keyframes', 'minItems');
        expect(minimums.get(property) ?? minimum, property).toBe(minimum);
        minimums.set(property, minimum);
      }
    }
    expect([...minimums.keys()].sort()).toEqual(['opacity', 'position', 'scale']);
    for (const [property, minimum] of minimums) {
      expect(keyframeMinimum(compositionSchema, property), property).toBe(minimum);
    }
    // The fact of schema 0.1 the commands are tested against (D16.6).
    expect(new Set(minimums.values())).toEqual(new Set([2]));
  });

  it('reads the bounds of a keyframe time from the schema', () => {
    for (const { shapes } of animationShapes()) {
      for (const shape of shapes) {
        const time = at(shape, 'properties', 'keyframes', 'items', 'properties', 'timeUs');
        expect(keyframeTimeBounds(compositionSchema)).toEqual({
          minimum: at(time, 'minimum'),
          maximum: at(time, 'maximum'),
        });
      }
    }
    expect(keyframeTimeBounds(compositionSchema)).toEqual({
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    });
  });

  it('refuses exactly the removal that would go below the minimum of the schema', () => {
    const minimum = keyframeMinimum(compositionSchema, 'opacity');
    let document = reference();
    const count = (): number =>
      (nodeOf(document, 'node-title').animations as { keyframes: unknown[] }[])[0]?.keyframes
        .length ?? 0;
    for (let at = count(); at <= minimum; at += 1) {
      const add: Command = {
        type: 'AddKeyframe',
        animationId: 'anim-title-opacity',
        keyframe: { timeUs: 8_000_000 + at, value: 0.5 },
      };
      document = applyCommand(document, add).document;
    }
    expect(count()).toBe(minimum + 1);
    const remove = (timeUs: number): Command => ({
      type: 'RemoveKeyframe',
      animationId: 'anim-title-opacity',
      timeUs,
    });
    document = applyCommand(document, remove(0)).document;
    expect(count()).toBe(minimum);
    expect(codeOf(() => applyCommand(document, remove(7_500_000)))).toBe('too-few-keyframes');
  });

  it.each(animationShapes().map(({ type, shapes }) => [type, shapes.length > 0] as const))(
    'adds an animation to a node of type %s exactly when the schema gives it animations',
    (type, animated) => {
      const nodeId = nodesByType().get(type) ?? '';
      const animationIds = (
        (nodeOf(reference(), nodeId).animations as { property: string }[] | undefined) ?? []
      ).map(({ property }) => property);
      const property = ['opacity', 'position', 'scale'].find(
        (name) => !animationIds.includes(name),
      );
      const command: Command = {
        type: 'AddAnimation',
        nodeId,
        index: 0,
        animation: {
          id: 'anim-new',
          property: property ?? 'opacity',
          interpolation: 'linear',
          keyframes: [
            { timeUs: 0, value: property === 'opacity' ? 0 : { x: 1, y: 1 } },
            { timeUs: 1, value: property === 'opacity' ? 1 : { x: 2, y: 2 } },
          ],
        },
      };
      if (animated) {
        expect(applyCommand(reference(), command).createdIds).toEqual(['anim-new']);
      } else {
        expect(codeOf(() => applyCommand(reference(), command))).toBe('unsupported-node');
      }
    },
  );
});

describe('the seam of the schema metadata (D41.4)', () => {
  /** The composition schema with other metadata: opacity takes three keyframes, times end at 10. */
  function alternative(): unknown {
    const schema = structuredClone(compositionSchema) as unknown;
    for (const variant of [
      ...variantsOf(at(schema, 'properties', 'scenes', 'items', 'properties', 'nodes', 'items')),
    ]) {
      const shapes = [
        ...variantsOf(at(variant, 'properties', 'animations', 'items')),
        ...variantsOf(at(variant, 'properties', 'children', 'items')).flatMap((child) =>
          variantsOf(at(child, 'properties', 'animations', 'items')),
        ),
      ];
      for (const shape of shapes) {
        const keyframes = at(shape, 'properties', 'keyframes') as Record<string, unknown>;
        if (at(shape, 'properties', 'property', 'const') === 'opacity') keyframes['minItems'] = 3;
        const time = at(keyframes, 'items', 'properties', 'timeUs') as Record<string, unknown>;
        time['maximum'] = 10;
      }
    }
    return schema;
  }

  it('returns the minimum the given metadata states, not a number of its own', () => {
    const schema = alternative();
    expect(keyframeMinimum(schema, 'opacity')).toBe(3);
    expect(keyframeMinimum(schema, 'scale')).toBe(2);
    expect(keyframeTimeBounds(schema)).toEqual({ minimum: 0, maximum: 10 });
  });

  it('refuses metadata that states no minimum or no bounds instead of guessing', () => {
    expect(() => keyframeMinimum(compositionSchema, 'rotation')).toThrow(/rotation/);
    expect(() => keyframeMinimum({}, 'opacity')).toThrow(Error);
    expect(() => keyframeTimeBounds({})).toThrow(Error);
  });
});

describe('the animation shapes of group children are read too (D41.4)', () => {
  function shape(property: string, minItems: number, minimum: number, maximum: number): unknown {
    return {
      properties: {
        property: { const: property },
        keyframes: { minItems, items: { properties: { timeUs: { minimum, maximum } } } },
      },
    };
  }

  /** Metadata whose scene-level node states `top` and whose group child states `nested`. */
  function metadata(top: readonly unknown[], nested: readonly unknown[]): unknown {
    const child = { properties: { animations: { items: { oneOf: nested } } } };
    const group = {
      properties: {
        ...(top.length > 0 ? { animations: { items: { oneOf: top } } } : {}),
        children: { items: { oneOf: [child] } },
      },
    };
    return {
      properties: { scenes: { items: { properties: { nodes: { items: { oneOf: [group] } } } } } },
    };
  }

  /** The composition schema as separate objects, with one edit of the children's opacity shape. */
  function withChildren(edit: (keyframes: Record<string, unknown>) => void): unknown {
    const schema = JSON.parse(JSON.stringify(compositionSchema)) as unknown;
    for (const child of variantsOf(at(groupOf(schema), 'properties', 'children', 'items'))) {
      for (const item of variantsOf(at(child, 'properties', 'animations', 'items'))) {
        if (at(item, 'properties', 'property', 'const') !== 'opacity') continue;
        edit(at(item, 'properties', 'keyframes') as Record<string, unknown>);
      }
    }
    return schema;
  }

  function groupOf(schema: unknown): unknown {
    return variantsOf(
      at(schema, 'properties', 'scenes', 'items', 'properties', 'nodes', 'items'),
    ).find((variant) => at(variant, 'properties', 'type', 'const') === 'group');
  }

  it('finds a shape only a group child states', () => {
    const schema = metadata([], [shape('opacity', 4, 1, 9)]);
    expect(keyframeMinimum(schema, 'opacity')).toBe(4);
    expect(keyframeTimeBounds(schema)).toEqual({ minimum: 1, maximum: 9 });
  });

  it('accepts shapes of a node and of a child that agree', () => {
    const schema = metadata([shape('scale', 3, 0, 5)], [shape('scale', 3, 0, 5)]);
    expect(keyframeMinimum(schema, 'scale')).toBe(3);
    expect(keyframeTimeBounds(schema)).toEqual({ minimum: 0, maximum: 5 });
  });

  it('refuses shapes of a node and of a child that disagree, instead of taking the first', () => {
    expect(() =>
      keyframeMinimum(metadata([shape('scale', 2, 0, 5)], [shape('scale', 3, 0, 5)]), 'scale'),
    ).toThrow(/disagree/);
    expect(() =>
      keyframeTimeBounds(metadata([shape('scale', 2, 0, 5)], [shape('scale', 2, 0, 6)])),
    ).toThrow(/disagree/);
  });

  it('refuses a shape that states no minimum or no bound, instead of asking the others', () => {
    const silent = { properties: { property: { const: 'scale' }, keyframes: { items: {} } } };
    const half = {
      properties: {
        property: { const: 'scale' },
        keyframes: { minItems: 3, items: { properties: { timeUs: { minimum: 0 } } } },
      },
    };
    // The other shape states 3 and 0 to 5; taking them would be the silent choice.
    for (const schema of [
      metadata([silent], [shape('scale', 3, 0, 5)]),
      metadata([shape('scale', 3, 0, 5)], [silent]),
    ]) {
      expect(() => keyframeMinimum(schema, 'scale')).toThrow(/states no minimum/);
      expect(() => keyframeTimeBounds(schema)).toThrow(/states no bounds/);
    }
    const partial = metadata([shape('scale', 3, 0, 5)], [half]);
    expect(keyframeMinimum(partial, 'scale')).toBe(3);
    expect(() => keyframeTimeBounds(partial)).toThrow(/states no bounds/);
    // A shape of another property does not matter for the minimum asked.
    expect(keyframeMinimum(metadata([silent], [shape('opacity', 4, 0, 5)]), 'opacity')).toBe(4);
  });

  it('refuses a shape whose time states a maximum and no minimum', () => {
    const upperOnly = {
      properties: {
        property: { const: 'scale' },
        keyframes: { minItems: 3, items: { properties: { timeUs: { maximum: 5 } } } },
      },
    };
    // Alone, and beside a shape like it: nothing disagrees, so only the missing
    // minimum can be what is refused.
    expect(() => keyframeTimeBounds(metadata([], [upperOnly]))).toThrow(/states no bounds/);
    expect(() => keyframeTimeBounds(metadata([upperOnly], [upperOnly]))).toThrow(
      /states no bounds/,
    );
    // The premise: with its minimum the same shape is read, and its other value is untouched.
    expect(keyframeTimeBounds(metadata([], [shape('scale', 3, 0, 5)]))).toEqual({
      minimum: 0,
      maximum: 5,
    });
    expect(keyframeMinimum(metadata([], [upperOnly]), 'scale')).toBe(3);
  });

  it('reads the children of the real schema: an edit of their shapes alone is noticed', () => {
    const minimum = withChildren((keyframes) => {
      keyframes['minItems'] = 5;
    });
    expect(() => keyframeMinimum(minimum, 'opacity')).toThrow(/disagree/);
    expect(keyframeMinimum(minimum, 'scale')).toBe(2);
    const bounds = withChildren((keyframes) => {
      (at(keyframes, 'items', 'properties', 'timeUs') as Record<string, unknown>)['maximum'] = 7;
    });
    expect(() => keyframeTimeBounds(bounds)).toThrow(/disagree/);
    // A child shape of the real schema that loses its minimum is an error too:
    // the validator would then take any number of keyframes there.
    const lost = withChildren((keyframes) => {
      Reflect.deleteProperty(keyframes, 'minItems');
    });
    expect(() => keyframeMinimum(lost, 'opacity')).toThrow(/states no minimum/);
  });

  it('keeps what schema 0.1 states: its nodes and its children agree', () => {
    expect(childVariants.length).toBeGreaterThan(0);
    for (const property of ['opacity', 'position', 'scale']) {
      expect(keyframeMinimum(compositionSchema, property), property).toBe(2);
    }
    expect(keyframeTimeBounds(compositionSchema)).toEqual({
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    });
  });
});
