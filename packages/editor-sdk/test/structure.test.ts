/**
 * The structural commands of D39: `AddNode`, `RemoveNode`, `DuplicateNode`, and
 * `ReorderNode`. A node owns its animations and a group its children (D16.4),
 * so every command works on a whole subtree, and every inverse is a plain,
 * parseable command that restores it byte for byte. The expected values are
 * written out by hand from the reference composition.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createCommandBus,
  parseCommand,
  type Command,
  type CommandBus,
  type NodeData,
} from '../src/index.js';

import { codeOf, errorOf, json, nodeOf, reference, validated } from './support.js';

const SCENE = 'scene-main';
const GROUP = 'node-group';
const TITLE = 'node-title';
/** The scene's list, bottom first: background, group, title, Custom HTML. */
const SCENE_ORDER = ['node-background', GROUP, TITLE, 'node-custom-html'];
/** The group's children, bottom first. */
const GROUP_ORDER = ['node-image', 'node-caption'];

/** The value, or a failure that says it was missing. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`No ${what}.`);
  return value;
}

/** An array of one hole, which JSON cannot carry. */
function holey(): unknown[] {
  const items: unknown[] = [];
  items.length = 1;
  return items;
}

function add(parentId: string, index: number, node: unknown): Command {
  return { type: 'AddNode', parentId, index, node } as Command;
}

function remove(nodeId: string): Command {
  return { type: 'RemoveNode', nodeId };
}

function duplicate(nodeId: string, newNodeId: string): Command {
  return { type: 'DuplicateNode', nodeId, newNodeId };
}

function reorder(nodeId: string, index: number): Command {
  return { type: 'ReorderNode', nodeId, index };
}

/** A text node with the given ID and, optionally, one opacity animation. */
function textNode(id: string, animationId?: string): Record<string, unknown> {
  return {
    id,
    type: 'text',
    position: { x: 10, y: 20 },
    scale: { x: 1, y: 1 },
    opacity: 1,
    animations:
      animationId === undefined
        ? []
        : [
            {
              id: animationId,
              property: 'opacity',
              interpolation: 'linear',
              keyframes: [
                { timeUs: 0, value: 0 },
                { timeUs: 1_000_000, value: 1 },
              ],
            },
          ],
    text: 'New',
    fontAssetId: 'asset-font',
    fontSize: 40,
    color: '#ffffff',
  };
}

/** The IDs of a list of the document, bottom first. */
function order(document: unknown, parentId: string): string[] {
  const scene = (document as { scenes: { id: string; nodes: { id: string }[] }[] }).scenes[0];
  if (scene === undefined) throw new Error('No scene.');
  if (parentId === scene.id) return scene.nodes.map(({ id }) => id);
  return (nodeOf(document, parentId).children ?? []).map(({ id }) => id);
}

/** Every string `id` of a value, written out independently of `document.ts`. */
function allIds(value: unknown): string[] {
  const found: string[] = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) item.forEach(visit);
    else if (typeof item === 'object' && item !== null) {
      for (const [key, child] of Object.entries(item)) {
        if (key === 'id' && typeof child === 'string') found.push(child);
        else visit(child);
      }
    }
  };
  visit(value);
  return found;
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function bus(): CommandBus {
  return createCommandBus(referenceComposition);
}

describe('AddNode (D39.1)', () => {
  it('inserts a complete node at an index of the scene, and removes it again as its inverse', () => {
    const result = applyCommand(reference(), add(SCENE, 2, textNode('new-text', 'new-anim')));
    expect(order(result.document, SCENE)).toEqual([
      'node-background',
      GROUP,
      'new-text',
      TITLE,
      'node-custom-html',
    ]);
    expect(result.inverse).toEqual(remove('new-text'));
    expect(result.createdIds).toEqual(['new-text', 'new-anim']);
    // The result is frozen, as the bus's own results are (D39.9).
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.createdIds)).toBe(true);
  });

  it('inserts at 0 (the bottom) and at the length of the list (the top)', () => {
    const bottom = applyCommand(reference(), add(SCENE, 0, textNode('a')));
    expect(order(bottom.document, SCENE)[0]).toBe('a');
    const top = applyCommand(reference(), add(SCENE, 4, textNode('a')));
    expect(order(top.document, SCENE)[4]).toBe('a');
    const child = applyCommand(reference(), add(GROUP, 2, textNode('a')));
    expect(order(child.document, GROUP)).toEqual([...GROUP_ORDER, 'a']);
  });

  it('refuses an index past the end of the list as index-out-of-range', () => {
    expect(codeOf(() => applyCommand(reference(), add(SCENE, 5, textNode('a'))))).toBe(
      'index-out-of-range',
    );
    expect(codeOf(() => applyCommand(reference(), add(GROUP, 3, textNode('a'))))).toBe(
      'index-out-of-range',
    );
  });

  it.each([
    ['a missing parent', 'node-missing', 'unknown-parent'],
    ['an animation as the parent', 'anim-title-opacity', 'unknown-parent'],
    ['an asset as the parent', 'asset-font', 'unknown-parent'],
    ['a text node, which has no children', TITLE, 'unsupported-node'],
    ['a group child, which has no children', 'node-image', 'unsupported-node'],
    ['the background, which has no children', 'node-background', 'unsupported-node'],
  ])('refuses %s', (_, parentId, code) => {
    expect(codeOf(() => applyCommand(reference(), add(parentId, 0, textNode('a'))))).toBe(code);
  });

  it('leaves to the schema which nodes a parent takes (D30.6)', () => {
    const group = {
      id: 'g2',
      type: 'group',
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      opacity: 1,
      animations: [],
      children: [],
    };
    expect(codeOf(() => applyCommand(reference(), add(SCENE, 0, group)))).toBe('did not throw');
    expect(codeOf(() => applyCommand(reference(), add(GROUP, 0, group)))).toBe('invalid-result');
    const html = { ...structuredClone(nodeOf(reference(), 'node-custom-html')), id: 'h2' };
    expect(codeOf(() => applyCommand(reference(), add(GROUP, 0, html)))).toBe('invalid-result');
    expect(codeOf(() => applyCommand(reference(), add(SCENE, 0, { id: 'bare' })))).toBe(
      'invalid-result',
    );
  });

  it.each([
    ['a node ID', textNode(TITLE), [TITLE]],
    ['an animation ID', textNode('a', 'anim-title-opacity'), ['anim-title-opacity']],
    ['an asset ID', textNode('asset-font'), ['asset-font']],
    ['a clip ID', textNode('clip-audio'), ['clip-audio']],
    ['the scene ID', textNode(SCENE), [SCENE]],
    ['its own ID twice', textNode('same', 'same'), ['same']],
  ])('refuses %s already in use as id-in-use, listing it', (_, node, colliding) => {
    const error = errorOf(() => applyCommand(reference(), add(SCENE, 0, node)));
    expect(error.code).toBe('id-in-use');
    expect(error.details).toEqual(colliding);
  });

  it('lists every colliding ID, sorted, and prefers id-in-use to invalid-result', () => {
    const node = { ...textNode('node-title', 'anim-title-opacity'), unknown: 1 };
    const error = errorOf(() => applyCommand(reference(), add(SCENE, 0, node)));
    expect(error.code).toBe('id-in-use');
    expect(error.details).toEqual(['anim-title-opacity', 'node-title']);
  });

  it('reads IDs only where they are well formed and leaves the rest to the schema', () => {
    for (const malformed of [
      { ...textNode('a'), animations: null },
      { ...textNode('a'), animations: 'x' },
      { ...textNode('a'), animations: [7] },
      { ...textNode('a'), children: null },
      { ...textNode(''), text: 'no id' },
      { ...textNode('a'), id: 7 },
    ]) {
      expect(codeOf(() => applyCommand(reference(), add(SCENE, 0, malformed)))).toBe(
        'invalid-result',
      );
    }
  });

  it.each([
    ['a fraction', 1.5],
    ['a negative index', -1],
    ['an unsafe integer', 2 ** 53],
    ['NaN', Number.NaN],
    ['a string', '1'],
  ])('refuses %s as the index with invalid-argument, never rounding it', (_, index) => {
    expect(
      codeOf(() => applyCommand(reference(), add(SCENE, index as number, textNode('a')))),
    ).toBe('invalid-argument');
  });

  it('reads -0 as the index 0', () => {
    const command = parseCommand(add(SCENE, -0, textNode('a'))) as { index: number };
    expect(Object.is(command.index, 0)).toBe(true);
  });

  it.each([
    ['a Date', { ...textNode('a'), text: new Date(0) }],
    ['a function', { ...textNode('a'), text: () => 'x' }],
    ['undefined', { ...textNode('a'), text: undefined }],
    ['a bigint', { ...textNode('a'), fontSize: 40n }],
    ['a symbol', { ...textNode('a'), text: Symbol('x') }],
    ['a typed array', { ...textNode('a'), position: new Uint8Array(2) }],
    ['a hole', { ...textNode('a'), animations: holey() }],
    ['a Map', new Map([['id', 'a']])],
    ['an array', [textNode('a')]],
    ['null', null],
  ])('refuses a node holding %s as invalid-argument', (_, node) => {
    expect(codeOf(() => parseCommand(add(SCENE, 0, node)))).toBe('invalid-argument');
  });

  it('refuses a cycle as invalid-argument rather than overflowing the stack', () => {
    const node: Record<string, unknown> = textNode('a');
    node['self'] = node;
    expect(codeOf(() => parseCommand(add(SCENE, 0, node)))).toBe('invalid-argument');
    const shared = { x: 1, y: 2 };
    // A value used twice is not a cycle.
    expect(
      codeOf(() =>
        parseCommand(add(SCENE, 0, { ...textNode('a'), position: shared, scale: shared })),
      ),
    ).toBe('did not throw');
  });

  it('accepts what the validator accepts as data, a node without a prototype included', () => {
    const node = Object.assign(Object.create(null) as Record<string, unknown>, textNode('bare'));
    const result = applyCommand(reference(), add(SCENE, 0, node));
    expect(json(nodeOf(result.document, 'bare'))).toBe(json(textNode('bare')));
  });

  it('keeps its own frozen copy: the caller keeps an unfrozen object, and later edits reach nothing', () => {
    const node = textNode('a', 'a-anim');
    const board = bus();
    board.dispatch(add(SCENE, 0, node));
    expect(Object.isFrozen(node)).toBe(false);
    const added = nodeOf(board.getDocument(), 'a');
    expect(isDeepFrozen(added)).toBe(true);
    node['text'] = 'changed';
    must((node['animations'] as { id: string }[])[0], 'animation').id = 'changed';
    board.undo();
    board.redo();
    expect(json(nodeOf(board.getDocument(), 'a'))).toBe(json(textNode('a', 'a-anim')));
  });

  it('reads each field of the node once', () => {
    let reads = 0;
    const node = textNode('a');
    Object.defineProperty(node, 'text', {
      enumerable: true,
      get() {
        reads += 1;
        return 'once';
      },
    });
    const result = applyCommand(reference(), add(SCENE, 0, node));
    expect(reads).toBe(1);
    expect((nodeOf(result.document, 'a') as unknown as { text: string }).text).toBe('once');
  });
});

describe('RemoveNode (D39.1)', () => {
  const everyNode = [...SCENE_ORDER, ...GROUP_ORDER];

  it.each(everyNode)('removes %s and undoes to the identical document', (nodeId) => {
    const original = json(reference());
    const board = bus();
    board.dispatch(remove(nodeId));
    expect(allIds(board.getDocument())).not.toContain(nodeId);
    board.undo();
    expect(json(board.getDocument())).toBe(original);
    board.redo();
    expect(allIds(board.getDocument())).not.toContain(nodeId);
  });

  it('removes a group with its children and every animation of the subtree', () => {
    const result = applyCommand(reference(), remove(GROUP));
    const left = allIds(result.document);
    for (const gone of [
      GROUP,
      'node-image',
      'node-caption',
      'anim-group-position',
      'anim-image-scale',
    ]) {
      expect(left).not.toContain(gone);
    }
    // Assets are never removed with a node (D39.5).
    expect(left).toContain('asset-image');
  });

  it('returns a plain AddNode carrying the exact subtree, its parent, and its index', () => {
    const document = reference();
    const result = applyCommand(document, remove(GROUP));
    const inverse = result.inverse as {
      type: string;
      parentId: string;
      index: number;
      node: NodeData;
    };
    expect(inverse.type).toBe('AddNode');
    expect(inverse.parentId).toBe(SCENE);
    expect(inverse.index).toBe(1);
    expect(json(inverse.node)).toBe(json(nodeOf(document, GROUP)));
    expect(isDeepFrozen(inverse)).toBe(true);
    expect(parseCommand(inverse)).toEqual(inverse);
    const child = applyCommand(document, remove('node-caption')).inverse as {
      parentId: string;
      index: number;
    };
    expect([child.parentId, child.index]).toEqual([GROUP, 1]);
  });

  it('keeps a snapshot, so a host that later edits its own document reaches nothing', () => {
    const host = structuredClone(referenceComposition) as {
      scenes: { nodes: { id: string; text?: string }[] }[];
    };
    const board = createCommandBus(host);
    const before = json(board.getDocument());
    board.dispatch(remove(TITLE));
    const title = host.scenes[0]?.nodes.find(({ id }) => id === TITLE);
    if (title === undefined) throw new Error('No title.');
    title.text = 'edited by the host';
    expect(Object.isFrozen(title)).toBe(false);
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it.each([
    ['a missing node', 'node-missing'],
    ['an animation', 'anim-title-opacity'],
    ['the scene', SCENE],
    ['an asset', 'asset-image'],
    ['a clip', 'clip-audio'],
  ])('refuses %s as unknown-node', (_, nodeId) => {
    expect(codeOf(() => applyCommand(reference(), remove(nodeId)))).toBe('unknown-node');
  });

  it('creates no ID, and undo reports the IDs it restores', () => {
    const board = bus();
    expect(board.dispatch(remove(GROUP)).createdIds).toEqual([]);
    expect(board.undo().createdIds).toEqual([
      GROUP,
      'node-image',
      'node-caption',
      'anim-group-position',
      'anim-image-scale',
    ]);
  });
});

describe('DuplicateNode (D39.1–D39.3)', () => {
  it('copies a node with its animation directly above the source, under derived IDs', () => {
    const result = applyCommand(reference(), duplicate(TITLE, 'copy'));
    expect(order(result.document, SCENE)).toEqual([
      'node-background',
      GROUP,
      TITLE,
      'copy',
      'node-custom-html',
    ]);
    expect(result.createdIds).toEqual(['copy', 'copy-a-opacity']);
    const expected = structuredClone(nodeOf(reference(), TITLE)) as unknown as {
      id: string;
      animations: { id: string }[];
    };
    expected.id = 'copy';
    must(expected.animations[0], 'animation').id = 'copy-a-opacity';
    expect(json(nodeOf(result.document, 'copy'))).toBe(json(expected));
    expect(result.inverse).toEqual(remove('copy'));
  });

  it('derives every ID of a group copy: children by index, animations by property', () => {
    const result = applyCommand(reference(), duplicate(GROUP, 'g'));
    expect(result.createdIds).toEqual(['g', 'g-c0', 'g-c1', 'g-a-position', 'g-c0-a-scale']);
    expect(order(result.document, 'g')).toEqual(['g-c0', 'g-c1']);
    expect(order(result.document, SCENE)[2]).toBe('g');
  });

  it('copies a group child within its group', () => {
    const result = applyCommand(reference(), duplicate('node-image', 'img'));
    expect(order(result.document, GROUP)).toEqual(['node-image', 'img', 'node-caption']);
    expect(result.createdIds).toEqual(['img', 'img-a-scale']);
  });

  it('never collides with itself, whatever the source IDs are (D39.3)', () => {
    // The group animates its position, and its first child is called
    // `a-position`. A rule that derived a child from its own ID (`N-<childId>`)
    // would give that child `N-a-position`, the ID of the group's animation, for
    // every N: this subtree could never be duplicated. The accepted rule names
    // children by index, so it can.
    const draft = structuredClone(referenceComposition) as {
      scenes: {
        nodes: { id: string; animations?: { property: string }[]; children?: { id: string }[] }[];
      }[];
    };
    const group = draft.scenes[0]?.nodes.find(({ id }) => id === GROUP);
    if (group?.children === undefined) throw new Error('No group.');
    expect(group.animations?.map(({ property }) => property)).toEqual(['position']);
    must(group.children[0], 'first child').id = 'a-position';
    const document = validated(draft);
    for (const newNodeId of ['N', 'M', 'node-group-2']) {
      const result = applyCommand(document, duplicate(GROUP, newNodeId));
      expect(result.createdIds).toEqual([
        newNodeId,
        `${newNodeId}-c0`,
        `${newNodeId}-c1`,
        `${newNodeId}-a-position`,
        `${newNodeId}-c0-a-scale`,
      ]);
      expect(new Set(result.createdIds).size).toBe(result.createdIds.length);
    }
  });

  it('changes IDs only: a text or HTML that mentions an ID is copied as it is', () => {
    const draft = structuredClone(referenceComposition) as {
      scenes: { nodes: { id: string; text?: string; html?: string }[] }[];
    };
    const nodes = draft.scenes[0]?.nodes ?? [];
    must(
      nodes.find(({ id }) => id === TITLE),
      'title',
    ).text = 'node-title anim-title-opacity';
    must(
      nodes.find(({ id }) => id === 'node-custom-html'),
      'Custom HTML node',
    ).html = '<p id="node-custom-html">node-custom-html</p>';
    const document = validated(draft);
    const text = applyCommand(document, duplicate(TITLE, 'copy')).document;
    expect((nodeOf(text, 'copy') as unknown as { text: string }).text).toBe(
      'node-title anim-title-opacity',
    );
    const html = applyCommand(document, duplicate('node-custom-html', 'h')).document;
    expect((nodeOf(html, 'h') as unknown as { html: string }).html).toBe(
      '<p id="node-custom-html">node-custom-html</p>',
    );
  });

  it('refuses, before any change, an ID the document already uses, listing every one sorted', () => {
    const board = bus();
    board.dispatch(add(SCENE, 0, textNode('copy-a-opacity')));
    board.dispatch(add(SCENE, 0, textNode('z')));
    const before = board.getDocument();
    const error = errorOf(() => board.dispatch(duplicate(TITLE, 'copy')));
    expect(error.code).toBe('id-in-use');
    expect(error.details).toEqual(['copy-a-opacity']);
    expect(board.getDocument()).toBe(before);
    const both = errorOf(() => board.dispatch(duplicate(TITLE, 'z')));
    expect(both.details).toEqual(['z']);
    expect(errorOf(() => board.dispatch(duplicate(TITLE, TITLE))).details).toEqual([TITLE]);
    board.dispatch(add(SCENE, 0, textNode('m-a-opacity')));
    board.dispatch(add(SCENE, 0, textNode('m')));
    expect(errorOf(() => board.dispatch(duplicate(TITLE, 'm'))).details).toEqual([
      'm',
      'm-a-opacity',
    ]);
  });

  it.each([
    ['an empty ID', ''],
    ['a space', 'a b'],
    ['a letter outside ASCII', 'wę'],
    ['a dot', 'a.b'],
    ['a number', 7],
  ])('refuses %s as newNodeId with invalid-argument', (_, newNodeId) => {
    expect(codeOf(() => parseCommand(duplicate(TITLE, newNodeId as string)))).toBe(
      'invalid-argument',
    );
  });

  it('returns the same IDs after undo and redo', () => {
    const board = bus();
    const first = board.dispatch(duplicate(GROUP, 'g'));
    const copy = json(board.getDocument());
    expect(board.undo().createdIds).toEqual([]);
    expect(board.redo().createdIds).toEqual(first.createdIds);
    expect(json(board.getDocument())).toBe(copy);
  });

  it('refuses a node that is not there', () => {
    expect(codeOf(() => applyCommand(reference(), duplicate('anim-title-opacity', 'x')))).toBe(
      'unknown-node',
    );
  });
});

describe('ReorderNode (D39.1, D39.2)', () => {
  /** A document whose group has four children, bottom first c0..c3. */
  function withFourChildren() {
    const board = bus();
    board.dispatchTransaction([
      remove('node-image'),
      remove('node-caption'),
      ...['c0', 'c1', 'c2', 'c3'].map((id, at) => add(GROUP, at, textNode(id))),
    ]);
    return board.getDocument();
  }

  /** The expected list: the item at `from` taken out and put at `to` of the result. */
  function moved(list: readonly string[], from: number, to: number): string[] {
    const rest = list.filter((_, at) => at !== from);
    return [...rest.slice(0, to), must(list[from], 'item'), ...rest.slice(to)];
  }

  it.each([
    ['the scene', SCENE, SCENE_ORDER],
    ['a group', GROUP, ['c0', 'c1', 'c2', 'c3']],
  ])('puts a node at its final index, for every pair in %s', (_, parentId, list) => {
    const document = parentId === SCENE ? reference() : withFourChildren();
    expect(order(document, parentId)).toEqual(list);
    for (const [from, nodeId] of list.entries()) {
      for (let to = 0; to < list.length; to += 1) {
        const result = applyCommand(document, reorder(nodeId, to));
        if (from === to) {
          expect(result.document).toBe(document);
          expect(result.inverse).toBeNull();
          continue;
        }
        expect(order(result.document, parentId), `${nodeId} to ${String(to)}`).toEqual(
          moved(list, from, to),
        );
        expect(result.inverse).toEqual(reorder(nodeId, from));
        const back = applyCommand(result.document, result.inverse as Command);
        expect(json(back.document)).toBe(json(document));
      }
    }
  });

  it('moves the node itself, the same object', () => {
    const document = reference();
    const result = applyCommand(document, reorder(TITLE, 0));
    expect(nodeOf(result.document, TITLE)).toBe(nodeOf(document, TITLE));
  });

  it('refuses the length of the list as index-out-of-range', () => {
    expect(codeOf(() => applyCommand(reference(), reorder(TITLE, 4)))).toBe('index-out-of-range');
    expect(codeOf(() => applyCommand(reference(), reorder('node-image', 2)))).toBe(
      'index-out-of-range',
    );
  });

  it('writes no history when the index does not change (D38.9)', () => {
    const board = bus();
    const before = board.getDocument();
    board.dispatch(reorder(TITLE, 2));
    expect(board.getDocument()).toBe(before);
    expect(board.canUndo()).toBe(false);
  });

  it('refuses a node that is not there and an index that is not an integer', () => {
    expect(codeOf(() => applyCommand(reference(), reorder('clip-audio', 0)))).toBe('unknown-node');
    expect(codeOf(() => applyCommand(reference(), reorder(TITLE, 0.5)))).toBe('invalid-argument');
  });
});

describe('object identity on the edited path (D30.7, D39.5)', () => {
  it('rebuilds the root, scenes, the scene, and its list for a top-level edit', () => {
    const document = reference();
    const { document: edited } = applyCommand(document, remove(TITLE));
    expect(edited).not.toBe(document);
    expect(edited.scenes).not.toBe(document.scenes);
    expect(edited.scenes[0]).not.toBe(document.scenes[0]);
    expect(edited.scenes[0]?.nodes).not.toBe(document.scenes[0]?.nodes);
    expect(edited.assets).toBe(document.assets);
    expect(edited.clips).toBe(document.clips);
    expect(nodeOf(edited, GROUP)).toBe(nodeOf(document, GROUP));
    expect(nodeOf(edited, 'node-custom-html')).toBe(nodeOf(document, 'node-custom-html'));
  });

  it('also rebuilds the group and its children for an edit inside a group', () => {
    const document = reference();
    const { document: edited } = applyCommand(document, duplicate('node-image', 'img'));
    expect(nodeOf(edited, GROUP)).not.toBe(nodeOf(document, GROUP));
    expect(nodeOf(edited, GROUP).children).not.toBe(nodeOf(document, GROUP).children);
    expect(nodeOf(edited, 'node-image')).toBe(nodeOf(document, 'node-image'));
    expect(nodeOf(edited, 'node-caption')).toBe(nodeOf(document, 'node-caption'));
    expect(nodeOf(edited, TITLE)).toBe(nodeOf(document, TITLE));
    expect(edited.assets).toBe(document.assets);
  });
});

describe('createdIds of an operation are net (D39.4)', () => {
  const X = textNode('x');

  it.each([
    ['[Add X, Remove X]', [add(SCENE, 0, X), remove('x')], []],
    [
      '[Remove X, Add X]',
      [
        remove('node-caption'),
        add(GROUP, 0, { ...structuredClone(nodeOf(reference(), 'node-caption')) }),
      ],
      ['node-caption'],
    ],
    ['[Add X, Remove X, Add X]', [add(SCENE, 0, X), remove('x'), add(SCENE, 0, X)], ['x']],
    ['[Add X, Add Y]', [add(SCENE, 0, X), add(SCENE, 0, textNode('y', 'y-a'))], ['x', 'y', 'y-a']],
    [
      '[Add Y, Add X, Remove Y]',
      [add(SCENE, 0, textNode('y')), add(SCENE, 0, X), remove('y')],
      ['x'],
    ],
  ])('%s', (_, commands, expected) => {
    const board = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    const seen: (readonly string[])[] = [];
    board.subscribe((change) => seen.push(change.createdIds));
    const result = board.dispatchTransaction(commands);
    expect(result.createdIds).toEqual(expected);
    expect(Object.isFrozen(result.createdIds)).toBe(true);
    expect(seen).toEqual([expected]);
    for (const id of result.createdIds) expect(allIds(result.document)).toContain(id);
  });

  it('reports on undo what undo created, and on redo what redo created', () => {
    const board = bus();
    board.dispatchTransaction([remove(TITLE), add(SCENE, 0, X)]);
    expect(board.undo().createdIds).toEqual([TITLE, 'anim-title-opacity']);
    expect(board.redo().createdIds).toEqual(['x']);
  });
});

describe('transactions of structural commands (D38.4)', () => {
  it('reads each index against the document the earlier commands left', () => {
    const board = bus();
    board.dispatchTransaction([add(SCENE, 0, textNode('a')), add(SCENE, 0, textNode('b'))]);
    expect(order(board.getDocument(), SCENE).slice(0, 2)).toEqual(['b', 'a']);
    board.undo();
    expect(json(board.getDocument())).toBe(json(reference()));
  });

  it('applies none of them when one fails', () => {
    const board = bus();
    const before = board.getDocument();
    const error = errorOf(() =>
      board.dispatchTransaction([add(SCENE, 0, textNode('a')), duplicate(TITLE, 'a')]),
    );
    expect(error.code).toBe('id-in-use');
    expect(error.message).toMatch(/^Command 1 of the transaction: /);
    expect(board.getDocument()).toBe(before);
    expect(board.canUndo()).toBe(false);
  });
});

describe('an inverse applied to a diverged document (D39.6)', () => {
  // The bus never does this: its history is linear. A stateless host that holds
  // an old inverse can, and the failure is then atomic, as every failure is.
  it.each([
    [
      'a restored node whose ID is back in use',
      () => {
        const inverse = applyCommand(reference(), remove(TITLE)).inverse as Command;
        return { document: reference(), inverse, code: 'id-in-use' };
      },
    ],
    [
      'a removed node that is gone already',
      () => {
        const inverse = applyCommand(reference(), add(SCENE, 0, textNode('a'))).inverse as Command;
        return { document: reference(), inverse, code: 'unknown-node' };
      },
    ],
    [
      'an index the shorter list no longer has',
      () => {
        const inverse = applyCommand(reference(), reorder('node-custom-html', 0))
          .inverse as Command;
        const shorter = applyCommand(reference(), remove(TITLE)).document;
        return { document: shorter, inverse, code: 'index-out-of-range' };
      },
    ],
    [
      'a restored node whose parent is gone',
      () => {
        const inverse = applyCommand(reference(), remove('node-caption')).inverse as Command;
        const ungrouped = applyCommand(reference(), remove(GROUP)).document;
        return { document: ungrouped, inverse, code: 'unknown-parent' };
      },
    ],
  ])('fails atomically for %s', (_, setup) => {
    const { document, inverse, code } = setup();
    const before = json(document);
    expect(codeOf(() => applyCommand(document, inverse))).toBe(code);
    expect(json(document)).toBe(before);
  });
});

describe('Custom HTML through structural commands (D39.7)', () => {
  it('adds, duplicates, removes, and restores a Custom HTML node like any other', () => {
    const board = bus();
    const html = { ...structuredClone(nodeOf(reference(), 'node-custom-html')), id: 'h2' };
    board.dispatch(add(SCENE, 4, html));
    board.dispatch(duplicate('h2', 'h3'));
    board.dispatch(remove('node-custom-html'));
    expect(order(board.getDocument(), SCENE).slice(-2)).toEqual(['h2', 'h3']);
    while (board.canUndo()) board.undo();
    expect(json(board.getDocument())).toBe(json(reference()));
  });
});

describe('the options of the bus take own properties only (D39.9)', () => {
  it('refuses an option that only an ancestor supplies', () => {
    const inherited = Object.create({ historyLimit: 5 }) as object;
    expect(codeOf(() => createCommandBus(referenceComposition, inherited))).toBe(
      'invalid-argument',
    );
    const own = Object.assign(Object.create({}) as object, { historyLimit: 5 });
    expect(codeOf(() => createCommandBus(referenceComposition, own))).toBe('did not throw');
  });

  it('never reads a non-enumerable option from an ancestor', () => {
    const prototype = {};
    Object.defineProperty(prototype, 'historyLimit', { value: 1, enumerable: false });
    const board = createCommandBus(referenceComposition, Object.create(prototype) as object);
    board.dispatch(reorder(TITLE, 0));
    board.dispatch(reorder(TITLE, 1));
    board.undo();
    // The default limit applies, not the ancestor's 1.
    expect(board.canUndo()).toBe(true);
  });
});
