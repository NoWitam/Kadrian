/**
 * A property of the history (D30.9, D38.7, D38.9, D39.6): over long, seeded, and
 * therefore reproducible sequences of dispatches, transactions, undos, and
 * redos — property and structural commands, valid ones, no-ops, and failures
 * mixed — the bus behaves exactly like a model of two stacks of document
 * snapshots. Every undo restores a byte-identical earlier document, a failure
 * changes neither the document nor a stack and delivers no change, and every
 * committed operation delivers exactly one.
 *
 * The model is independent of the bus under test. It applies every command to
 * its own copy of the document and decides from that copy alone whether the
 * command fails and with which code (a malformed payload, a missing node or
 * parent, a field the node lacks, a value out of range, an index past the list,
 * an ID in use, a node the parent does not take), changes nothing, or changes
 * the document — and which IDs the operation, its undo, and its redo create.
 * What the bus reports is checked against the model, never used to drive it.
 *
 * No sequence makes `bus.undo()` fail: the history is linear and owned by the
 * bus, and every inverse was built from, and validated against, the document it
 * undoes (D39.6). This test shows it over every operation; no backdoor exists.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { createCommandBus, type BusChange } from '../src/index.js';

import { codeOf, json } from './support.js';

/** A small seeded generator (mulberry32), so every run replays the same sequence. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(next: () => number, items: readonly T[]): T {
  const item = items[Math.floor(next() * items.length)];
  if (item === undefined) throw new Error('Empty choice.');
  return item;
}

/** IDs the commands name: the fixture's, some the sequence may create, and non-nodes. */
const NODE_IDS = [
  'node-title',
  'node-caption',
  'node-group',
  'node-custom-html',
  'node-background',
  'node-group',
  'node-image',
  'node-caption',
  'node-title',
  'node-custom-html',
  'n1',
  'n2',
  'd1',
  'd1-c0',
  'd2',
  'node-missing',
  'anim-title-opacity',
];
const PARENT_IDS = ['scene-main', 'scene-main', 'node-group', 'd1', 'node-title', 'node-missing'];
const NEW_IDS = ['n1', 'n2', 'd1', 'd2', 'node-title'];
const COORDINATES = [0, 60, 90, 160, 120.5, -7];
const OPACITIES = [0, 0.25, 0.75, 1, -0];

/** Payloads that fail whatever the document holds, each for another reason. */
const FAILING: readonly unknown[] = [
  { type: 'SetNodePosition', nodeId: 'node-title', position: { x: 2_000_000, y: 0 } },
  { type: 'SetNodeOpacity', nodeId: 'node-title', opacity: 1.5 },
  { type: 'DuplicateNode', nodeId: 'node-title', newNodeId: 'a b' },
  { type: 'ReorderNode', nodeId: 'node-title', index: 0.5 },
  { type: 'MoveNode', nodeId: 'node-title' },
  'not a command',
  null,
];
const TEXTS = ['', 'Kadrion', 'Deterministic by design', 'A\nB'];

type Json = Record<string, unknown>;

/** A new node a command may add: a text node, animated or not, or a Custom HTML element. */
function newNode(next: () => number, id: string): Json {
  const base = { position: { x: 5, y: 5 }, scale: { x: 1, y: 1 }, opacity: 1 };
  if (next() < 0.25) {
    return {
      id,
      type: 'custom-html',
      ...base,
      animations: [],
      width: 10,
      height: 10,
      html: '<p>x</p>',
    };
  }
  const animations =
    next() < 0.5
      ? []
      : [
          {
            id: `${id}-anim`,
            property: 'opacity',
            interpolation: 'linear',
            keyframes: [
              { timeUs: 0, value: 0 },
              { timeUs: 1_000_000, value: 1 },
            ],
          },
        ];
  return {
    id,
    type: 'text',
    ...base,
    animations,
    text: 'New',
    fontAssetId: 'asset-font',
    fontSize: 40,
    color: '#ffffff',
  };
}

/** One generated payload: every command type, and some that are not commands at all. */
function command(next: () => number): unknown {
  if (next() < 0.08) return pick(next, FAILING);
  const nodeId = pick(next, NODE_IDS);
  switch (
    pick(next, [
      'position',
      'opacity',
      'text',
      'add',
      'add',
      'remove',
      'duplicate',
      'reorder',
    ] as const)
  ) {
    case 'position':
      return {
        type: 'SetNodePosition',
        nodeId,
        position: { x: pick(next, COORDINATES), y: pick(next, COORDINATES) },
      };
    case 'opacity':
      return { type: 'SetNodeOpacity', nodeId, opacity: pick(next, OPACITIES) };
    case 'text':
      return { type: 'SetTextContent', nodeId, text: pick(next, TEXTS) };
    case 'add':
      return {
        type: 'AddNode',
        parentId: pick(next, PARENT_IDS),
        index: Math.floor(next() * 7),
        node: newNode(next, pick(next, NEW_IDS)),
      };
    case 'remove':
      return { type: 'RemoveNode', nodeId };
    case 'duplicate':
      return { type: 'DuplicateNode', nodeId, newNodeId: pick(next, NEW_IDS) };
    case 'reorder':
      return { type: 'ReorderNode', nodeId, index: Math.floor(next() * 6) };
  }
}

// ---------------------------------------------------------------- the model

interface Place {
  readonly node: Json;
  readonly list: Json[];
  readonly index: number;
}

function sceneOf(document: Json): Json & { id: string; nodes: Json[] } {
  const scene = (document['scenes'] as (Json & { id: string; nodes: Json[] })[])[0];
  if (scene === undefined) throw new Error('The model has no scene.');
  return scene;
}

function place(document: Json, nodeId: string): Place | null {
  const nodes = sceneOf(document).nodes;
  for (const [index, node] of nodes.entries()) {
    if (node['id'] === nodeId) return { node, list: nodes, index };
    const children = (node['children'] as Json[] | undefined) ?? [];
    for (const [at, child] of children.entries()) {
      if (child['id'] === nodeId) return { node: child, list: children, index: at };
    }
  }
  return null;
}

function everyId(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const item of value) everyId(item, into);
  else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'id' && typeof child === 'string') into.add(child);
      else everyId(child, into);
    }
  }
  return into;
}

/** Node IDs in preorder, then animation IDs grouped by owner (D39.4). */
function subtree(node: Json): string[] {
  const owners = [node, ...((node['children'] as Json[] | undefined) ?? [])];
  return [
    ...owners.map((owner) => owner['id'] as string),
    ...owners.flatMap((owner) =>
      ((owner['animations'] as Json[] | undefined) ?? []).map(
        (animation) => animation['id'] as string,
      ),
    ),
  ];
}

function renamed(owner: Json, id: string): Json {
  const copy: Json = { ...owner, id };
  const animations = owner['animations'] as Json[] | undefined;
  if (animations !== undefined) {
    copy['animations'] = animations.map((animation) => ({
      ...animation,
      id: `${id}-a-${String(animation['property'])}`,
    }));
  }
  return copy;
}

/** An index of a list: a safe integer from 0 (D39.2). */
function isIndex(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function stored(value: number): number {
  return value === 0 ? 0 : value;
}

/** What one command did to the model's document. */
interface Effect {
  readonly created: string[];
  readonly removed: string[];
  readonly changed: boolean;
}

/** A command that must fail, and the code it fails with. */
class Refused {
  readonly code: string;

  constructor(code: string) {
    this.code = code;
  }
}

/**
 * The code with which the parser refuses a payload, or `null` when it parses.
 * The generator only varies what these rules read (D30.3, D38.2, D39.2, D39.3).
 */
function parseCode(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return 'invalid-argument';
  }
  const command = payload as Json;
  switch (command['type']) {
    case 'SetNodePosition':
    case 'SetTextContent':
    case 'RemoveNode':
      return null;
    case 'SetNodeOpacity': {
      const opacity = command['opacity'] as number;
      return opacity >= 0 && opacity <= 1 ? null : 'invalid-argument';
    }
    case 'AddNode':
    case 'ReorderNode':
      return isIndex(command['index'] as number) ? null : 'invalid-argument';
    case 'DuplicateNode':
      return /^[A-Za-z0-9_-]+$/.test(command['newNodeId'] as string) ? null : 'invalid-argument';
    default:
      return typeof command['type'] === 'string' ? 'unknown-command' : 'invalid-argument';
  }
}

/**
 * Applies one parsed payload to the model's document in place and returns what
 * it did, or the code it must fail with, in the order of checks D39.8 fixes.
 * Written from D30, D38, and D39 alone.
 */
function apply(document: Json, command: Json): Effect | Refused {
  const none: Effect = { created: [], removed: [], changed: false };
  const changed: Effect = { created: [], removed: [], changed: true };
  const nodeId = command['nodeId'] as string;
  switch (command['type']) {
    case 'SetNodePosition': {
      const target = place(document, nodeId)?.node;
      if (target === undefined) return new Refused('unknown-node');
      const position = target['position'] as { x: number; y: number } | undefined;
      if (position === undefined) return new Refused('unsupported-node');
      const request = command['position'] as { x: number; y: number };
      const x = stored(Math.round(request.x));
      const y = stored(Math.round(request.y));
      if (Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000) return new Refused('invalid-result');
      if (position.x === x && position.y === y) return none;
      position.x = x;
      position.y = y;
      return changed;
    }
    case 'SetNodeOpacity': {
      const target = place(document, nodeId)?.node;
      if (target === undefined) return new Refused('unknown-node');
      if (typeof target['opacity'] !== 'number') return new Refused('unsupported-node');
      const opacity = stored(command['opacity'] as number);
      if (target['opacity'] === opacity) return none;
      target['opacity'] = opacity;
      return changed;
    }
    case 'SetTextContent': {
      const target = place(document, nodeId)?.node;
      if (target === undefined) return new Refused('unknown-node');
      if (typeof target['text'] !== 'string') return new Refused('unsupported-node');
      if (target['text'] === command['text']) return none;
      target['text'] = command['text'];
      return changed;
    }
    case 'AddNode': {
      const parentId = command['parentId'] as string;
      const scene = sceneOf(document);
      let list: Json[];
      if (parentId === scene.id) list = scene.nodes;
      else {
        const parent = place(document, parentId);
        if (parent === null) return new Refused('unknown-parent');
        const children = parent.node['children'] as Json[] | undefined;
        if (children === undefined) return new Refused('unsupported-node');
        list = children;
      }
      const index = command['index'] as number;
      if (index > list.length) return new Refused('index-out-of-range');
      const node = structuredClone(command['node']) as Json;
      const ids = subtree(node);
      const present = everyId(document);
      if (ids.some((id, at) => present.has(id) || ids.indexOf(id) !== at)) {
        return new Refused('id-in-use');
      }
      // A group takes image and text nodes only (D16.2): the schema's verdict.
      if (list !== scene.nodes && node['type'] !== 'text' && node['type'] !== 'image') {
        return new Refused('invalid-result');
      }
      list.splice(index, 0, node);
      return { created: ids, removed: [], changed: true };
    }
    case 'RemoveNode': {
      const found = place(document, nodeId);
      if (found === null) return new Refused('unknown-node');
      found.list.splice(found.index, 1);
      return { created: [], removed: subtree(found.node), changed: true };
    }
    case 'DuplicateNode': {
      const found = place(document, nodeId);
      if (found === null) return new Refused('unknown-node');
      const newNodeId = command['newNodeId'] as string;
      const source = structuredClone(found.node);
      const copy = renamed(source, newNodeId);
      const children = source['children'] as Json[] | undefined;
      if (children !== undefined) {
        copy['children'] = children.map((child, at) =>
          renamed(child, `${newNodeId}-c${String(at)}`),
        );
      }
      const ids = subtree(copy);
      const present = everyId(document);
      if (ids.some((id) => present.has(id))) return new Refused('id-in-use');
      found.list.splice(found.index + 1, 0, copy);
      return { created: ids, removed: [], changed: true };
    }
    case 'ReorderNode': {
      const found = place(document, nodeId);
      if (found === null) return new Refused('unknown-node');
      const index = command['index'] as number;
      if (index > found.list.length - 1) return new Refused('index-out-of-range');
      if (index === found.index) return none;
      found.list.splice(found.index, 1);
      found.list.splice(index, 0, found.node);
      return changed;
    }
    default:
      throw new Error('The generator made a command the model does not know.');
  }
}

/** The IDs a sequence of effects creates and leaves in place, each once, last creation last. */
function net(steps: readonly { created: string[]; removed: string[] }[]): string[] {
  let list: string[] = [];
  for (const { created, removed } of steps) {
    const gone = new Set([...removed, ...created]);
    list = [...list.filter((id) => !gone.has(id)), ...created];
  }
  return list;
}

type Prediction =
  | { readonly code: string }
  | {
      readonly code: null;
      readonly changed: boolean;
      readonly text: string;
      readonly created: readonly string[];
      /** What the undo of this operation creates: its effects reversed and inverted. */
      readonly undoCreated: readonly string[];
      readonly structural: boolean;
    };

/**
 * The model's verdict on an operation: every payload parsed first (D38.4), then
 * all of them applied, or none — with the code of the first failure (D39.8).
 */
function predict(text: string, payloads: readonly unknown[]): Prediction {
  for (const payload of payloads) {
    const code = parseCode(payload);
    if (code !== null) return { code };
  }
  const document = JSON.parse(text) as Json;
  const effects: Effect[] = [];
  for (const payload of payloads) {
    const effect = apply(document, payload as Json);
    if (effect instanceof Refused) return { code: effect.code };
    effects.push(effect);
  }
  return {
    code: null,
    changed: effects.some((effect) => effect.changed),
    text: JSON.stringify(document),
    created: net(effects),
    undoCreated: net(
      [...effects]
        .reverse()
        .map(({ created, removed }) => ({ created: removed, removed: created })),
    ),
    structural: effects.some(({ created, removed }) => created.length + removed.length > 0),
  };
}

// ------------------------------------------------------------------ the run

/** One history entry of the model: both documents, and what undo and redo create. */
interface Entry {
  readonly before: string;
  readonly after: string;
  readonly undoCreated: readonly string[];
  readonly redoCreated: readonly string[];
}

interface Model {
  current: string;
  readonly past: Entry[];
  readonly future: Entry[];
}

function run(seed: number, historyLimit: number, steps: number): void {
  const next = random(seed);
  const changes: BusChange[] = [];
  const listenerErrors: unknown[] = [];
  const bus = createCommandBus(referenceComposition, {
    historyLimit,
    onListenerError: (error) => listenerErrors.push(error),
  });
  bus.subscribe((change) => changes.push(change));
  const state: Model = { current: json(referenceComposition), past: [], future: [] };
  let expectedChanges = 0;
  const counts = { committed: 0, structural: 0, noop: 0, failed: 0, undo: 0, redo: 0 };
  const codes = new Set<string>();

  /** Records an entry on a stack of the model, the oldest dropped first (D38.7). */
  function record(stack: Entry[], entry: Entry): void {
    if (historyLimit === 0) return;
    stack.push(entry);
    if (stack.length > historyLimit) stack.shift();
  }

  for (let step = 0; step < steps; step += 1) {
    const where = `seed ${String(seed)}, limit ${String(historyLimit)}, step ${String(step)}`;
    const document = bus.getDocument();
    const operation = pick(next, ['dispatch', 'transaction', 'undo', 'redo'] as const);
    if (operation === 'dispatch' || operation === 'transaction') {
      const payloads =
        operation === 'dispatch'
          ? [command(next)]
          : Array.from({ length: 1 + Math.floor(next() * 2) }, () => command(next));
      const prediction = predict(state.current, payloads);
      const reported: { changed?: boolean; created?: readonly string[] } = {};
      const code = codeOf(() => {
        const result =
          operation === 'dispatch' ? bus.dispatch(payloads[0]) : bus.dispatchTransaction(payloads);
        reported.changed =
          'inverse' in result ? result.inverse !== null : result.inverses.length > 0;
        reported.created = result.createdIds;
      });
      if (prediction.code !== null) {
        counts.failed += 1;
        codes.add(prediction.code);
        // The model names the code; the bus must fail with exactly that one.
        expect(code, where).toBe(prediction.code);
        expect(bus.getDocument(), where).toBe(document);
      } else {
        expect(code, where).toBe('did not throw');
        // What the bus reports must agree with the model; it does not decide.
        expect(reported.changed, where).toBe(prediction.changed);
        expect(reported.created, where).toEqual(prediction.created);
        if (prediction.changed) {
          counts.committed += 1;
          if (prediction.structural) counts.structural += 1;
          expectedChanges += 1;
          record(state.past, {
            before: state.current,
            after: prediction.text,
            undoCreated: prediction.undoCreated,
            redoCreated: prediction.created,
          });
          state.future.length = 0;
          state.current = prediction.text;
        } else {
          counts.noop += 1;
          expect(bus.getDocument(), where).toBe(document);
        }
      }
    } else {
      const [from, to] =
        operation === 'undo' ? [state.past, state.future] : [state.future, state.past];
      const entry = from.pop();
      const outcome: { created?: readonly string[] } = {};
      const code = codeOf(() => {
        outcome.created = (operation === 'undo' ? bus.undo() : bus.redo()).createdIds;
      });
      if (entry === undefined) {
        expect(code, where).toBe(operation === 'undo' ? 'nothing-to-undo' : 'nothing-to-redo');
        expect(bus.getDocument(), where).toBe(document);
      } else {
        expect(code, where).toBe('did not throw');
        // The model knows what this undo or redo creates, from the entry alone.
        expect(outcome.created, where).toEqual(
          operation === 'undo' ? entry.undoCreated : entry.redoCreated,
        );
        record(to, entry);
        state.current = operation === 'undo' ? entry.before : entry.after;
        expectedChanges += 1;
        counts[operation] += 1;
      }
    }
    expect(json(bus.getDocument()), where).toBe(state.current);
    expect(bus.canUndo(), where).toBe(state.past.length > 0);
    expect(bus.canRedo(), where).toBe(state.future.length > 0);
    expect(changes.length, where).toBe(expectedChanges);
    const last = changes.at(-1);
    if (last !== undefined) expect(last.document, where).toBe(bus.getDocument());
  }

  expect(listenerErrors).toEqual([]);
  // The premise: a sequence that never committed a structural change, failed
  // with several codes, changed nothing, or went back would prove little.
  expect(counts.committed).toBeGreaterThan(steps / 20);
  expect(counts.structural).toBeGreaterThan(steps / 40);
  expect(counts.failed).toBeGreaterThan(steps / 20);
  expect(codes.size).toBeGreaterThanOrEqual(5);
  expect(counts.noop).toBeGreaterThanOrEqual(2);
  if (historyLimit > 0) {
    expect(counts.undo).toBeGreaterThan(steps / 20);
    expect(counts.redo).toBeGreaterThan(steps / 20);
  }
}

describe('the history against a model of snapshots (D38, D39)', () => {
  it.each([
    [1, 100],
    [2, 100],
    [3, 3],
    [4, 1],
    [5, 0],
    [6, 100],
  ])('replays seed %d with historyLimit %d', (seed, historyLimit) => {
    run(seed, historyLimit, 400);
  });

  it('unwinds a whole sequence to the original bytes and redoes it again', () => {
    const next = random(42);
    const original = json(referenceComposition);
    const bus = createCommandBus(referenceComposition, { historyLimit: 1000 });
    for (let step = 0; step < 300; step += 1) {
      const payloads = Array.from({ length: 1 + Math.floor(next() * 2) }, () => command(next));
      codeOf(() => bus.dispatchTransaction(payloads));
    }
    expect(bus.canUndo()).toBe(true);
    const edited = json(bus.getDocument());
    while (bus.canUndo()) bus.undo();
    expect(json(bus.getDocument())).toBe(original);
    while (bus.canRedo()) bus.redo();
    expect(json(bus.getDocument())).toBe(edited);
  });
});
