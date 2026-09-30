/**
 * The bus must not keep a second copy of the schema's knowledge (D30.8). Which
 * node types carry a position, an opacity, or a text is derived here from
 * `compositionSchema` itself and checked against what the bus actually accepts,
 * so a node type the schema gains later cannot silently stay `unsupported-node`.
 */
import { compositionSchema } from '@kadrion/schema';
import { describe, expect, it } from 'vitest';

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
