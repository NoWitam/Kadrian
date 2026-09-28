/**
 * A property of the history (D30.9, D38.7, D38.9): over long, seeded, and
 * therefore reproducible sequences of dispatches, transactions, undos, and
 * redos — valid ones, no-ops, and failures mixed — the bus behaves exactly like
 * a model of two stacks of document snapshots. Every undo restores a
 * byte-identical earlier document, a failure changes neither the document nor
 * a stack and delivers no change, and every committed operation delivers
 * exactly one.
 *
 * The model is independent of the bus under test: it applies each command to
 * its own copy of the document and decides from the current value of the field
 * whether the command fails, changes a value, or changes nothing. What the bus
 * reports — an inverse, the list of inverses — is checked against the model,
 * never used to drive it.
 *
 * A failing undo or redo has no natural path with these commands: an inverse
 * restores a value that validated a moment ago. That test belongs to PR-19
 * (D38.12); no backdoor is added to produce one here.
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

/** Values that change something, or nothing, but never fail. */
const MOVABLE = ['node-title', 'node-caption', 'node-image', 'node-group', 'node-custom-html'];
const COORDINATES = [0, 60, 90, 160, 120.5, -7];
const OPACITIES = [0, 0.25, 0.75, 1, -0];
const TEXTS = ['', 'Kadrion', 'Deterministic by design', 'A\nB'];

/** Commands that fail, each for another reason. */
const FAILING: readonly unknown[] = [
  { type: 'SetNodePosition', nodeId: 'node-title', position: { x: 2_000_000, y: 0 } },
  { type: 'SetNodePosition', nodeId: 'node-background', position: { x: 1, y: 1 } },
  { type: 'SetNodeOpacity', nodeId: 'node-missing', opacity: 0.5 },
  { type: 'SetNodeOpacity', nodeId: 'node-title', opacity: 1.5 },
  { type: 'SetTextContent', nodeId: 'node-image', text: 'x' },
  { type: 'MoveNode', nodeId: 'node-title' },
  'not a command',
  null,
];

/** A command that succeeds, as the model reads it. */
type Valid =
  | { type: 'SetNodePosition'; nodeId: string; position: { x: number; y: number } }
  | { type: 'SetNodeOpacity'; nodeId: string; opacity: number }
  | { type: 'SetTextContent'; nodeId: string; text: string };

/** A generated command, labelled by the generator with whether it must fail. */
type Generated =
  | { readonly fails: true; readonly payload: unknown }
  | { readonly fails: false; readonly payload: Valid };

function pick<T>(next: () => number, items: readonly T[]): T {
  const item = items[Math.floor(next() * items.length)];
  if (item === undefined) throw new Error('Empty choice.');
  return item;
}

/** A command: most change a value or none, about one in eight fails. */
function command(next: () => number): Generated {
  if (next() < 0.125) return { fails: true, payload: pick(next, FAILING) };
  const nodeId = pick(next, MOVABLE);
  switch (pick(next, ['position', 'opacity', 'text'] as const)) {
    case 'position':
      return {
        fails: false,
        payload: {
          type: 'SetNodePosition',
          nodeId,
          position: { x: pick(next, COORDINATES), y: pick(next, COORDINATES) },
        },
      };
    case 'opacity':
      return {
        fails: false,
        payload: { type: 'SetNodeOpacity', nodeId, opacity: pick(next, OPACITIES) },
      };
    case 'text':
      // Only text nodes have a text; the others would fail, which FAILING covers.
      return {
        fails: false,
        payload: {
          type: 'SetTextContent',
          nodeId: pick(next, ['node-title', 'node-caption']),
          text: pick(next, TEXTS),
        },
      };
  }
}

type JsonNode = Record<string, unknown>;

/** The node with that ID in the model's copy of the document, one level into groups. */
function nodeIn(document: unknown, nodeId: string): JsonNode {
  const { scenes } = document as { scenes: { nodes: (JsonNode & { children?: JsonNode[] })[] }[] };
  for (const scene of scenes) {
    for (const node of scene.nodes) {
      if (node['id'] === nodeId) return node;
      for (const child of node.children ?? []) if (child['id'] === nodeId) return child;
    }
  }
  throw new Error(`The model has no node ${nodeId}.`);
}

/** A value as the document stores it: -0 is 0 (D30.3, D38.2). */
function stored(value: number): number {
  return value === 0 ? 0 : value;
}

type Prediction =
  | { readonly fails: true }
  | { readonly fails: false; readonly changed: boolean; readonly text: string };

/**
 * The model's own verdict on a dispatch or a transaction: it fails when any
 * command fails, and otherwise changes the document when any command finds a
 * field holding another value than the one it sets — a round trip included
 * (D38.9). The edits are made in place on a parsed copy, which keeps the order
 * of the keys, so the text is comparable byte for byte.
 */
function predict(text: string, commands: readonly Generated[]): Prediction {
  const valid: Valid[] = [];
  for (const generated of commands) {
    if (generated.fails) return { fails: true };
    valid.push(generated.payload);
  }
  const document: unknown = JSON.parse(text);
  let changed = false;
  for (const payload of valid) {
    const node = nodeIn(document, payload.nodeId);
    switch (payload.type) {
      case 'SetNodePosition': {
        const position = node['position'] as { x: number; y: number };
        const x = stored(Math.round(payload.position.x));
        const y = stored(Math.round(payload.position.y));
        if (position.x !== x || position.y !== y) {
          changed = true;
          position.x = x;
          position.y = y;
        }
        break;
      }
      case 'SetNodeOpacity': {
        const opacity = stored(payload.opacity);
        if (node['opacity'] !== opacity) {
          changed = true;
          node['opacity'] = opacity;
        }
        break;
      }
      case 'SetTextContent': {
        if (node['text'] !== payload.text) {
          changed = true;
          node['text'] = payload.text;
        }
        break;
      }
    }
  }
  return { fails: false, changed, text: JSON.stringify(document) };
}

/** The model: the document as JSON text and two stacks of snapshots. */
interface Model {
  current: string;
  readonly past: string[];
  readonly future: string[];
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
  const model: Model = { current: json(referenceComposition), past: [], future: [] };
  let expectedChanges = 0;
  const counts = { committed: 0, noop: 0, failed: 0, undo: 0, redo: 0 };

  for (let step = 0; step < steps; step += 1) {
    const where = `seed ${String(seed)}, limit ${String(historyLimit)}, step ${String(step)}`;
    const document = bus.getDocument();
    const operation = pick(next, ['dispatch', 'transaction', 'undo', 'redo'] as const);
    if (operation === 'dispatch' || operation === 'transaction') {
      const commands =
        operation === 'dispatch'
          ? [command(next)]
          : Array.from({ length: 1 + Math.floor(next() * 3) }, () => command(next));
      const prediction = predict(model.current, commands);
      const payloads = commands.map(({ payload }) => payload);
      const reported: { changed?: boolean } = {};
      const code = codeOf(() => {
        reported.changed =
          operation === 'dispatch'
            ? bus.dispatch(payloads[0]).inverse !== null
            : bus.dispatchTransaction(payloads).inverses.length > 0;
      });
      if (prediction.fails) {
        counts.failed += 1;
        expect(code, where).not.toBe('did not throw');
        expect(code, where).not.toMatch(/^threw|busy/);
        expect(bus.getDocument(), where).toBe(document);
      } else {
        expect(code, where).toBe('did not throw');
        // What the bus reports must agree with the model; it does not decide.
        expect(reported.changed, where).toBe(prediction.changed);
        if (prediction.changed) {
          counts.committed += 1;
          expectedChanges += 1;
          if (historyLimit > 0) {
            model.past.push(model.current);
            if (model.past.length > historyLimit) model.past.shift();
          }
          model.future.length = 0;
          model.current = prediction.text;
        } else {
          counts.noop += 1;
          expect(bus.getDocument(), where).toBe(document);
        }
      }
    } else {
      const [from, to] =
        operation === 'undo' ? [model.past, model.future] : [model.future, model.past];
      const snapshot = from.pop();
      const code = codeOf(() => (operation === 'undo' ? bus.undo() : bus.redo()));
      if (snapshot === undefined) {
        expect(code, where).toBe(operation === 'undo' ? 'nothing-to-undo' : 'nothing-to-redo');
        expect(bus.getDocument(), where).toBe(document);
      } else {
        expect(code, where).toBe('did not throw');
        to.push(model.current);
        model.current = snapshot;
        expectedChanges += 1;
        counts[operation] += 1;
      }
    }
    expect(json(bus.getDocument()), where).toBe(model.current);
    expect(bus.canUndo(), where).toBe(model.past.length > 0);
    expect(bus.canRedo(), where).toBe(model.future.length > 0);
    expect(changes.length, where).toBe(expectedChanges);
    expect(changes.at(-1)?.document ?? bus.getDocument(), where).toBe(bus.getDocument());
  }

  expect(listenerErrors).toEqual([]);
  // The premise: a sequence that never committed, failed, changed nothing, or went back
  // would prove little.
  expect(counts.committed).toBeGreaterThan(steps / 5);
  expect(counts.failed).toBeGreaterThan(steps / 20);
  expect(counts.noop).toBeGreaterThan(steps / 40);
  if (historyLimit > 0) {
    expect(counts.undo).toBeGreaterThan(steps / 10);
    expect(counts.redo).toBeGreaterThan(steps / 20);
  }
}

describe('the history against a model of snapshots (D38)', () => {
  it.each([
    [1, 100],
    [2, 100],
    [3, 3],
    [4, 1],
    [5, 0],
  ])('replays seed %d with historyLimit %d', (seed, historyLimit) => {
    run(seed, historyLimit, 400);
  });

  it('unwinds a whole sequence to the original bytes', () => {
    const next = random(42);
    const original = json(referenceComposition);
    const bus = createCommandBus(referenceComposition, { historyLimit: 1000 });
    for (let step = 0; step < 300; step += 1) {
      const commands = Array.from({ length: 1 + Math.floor(next() * 3) }, () => command(next));
      codeOf(() => bus.dispatchTransaction(commands.map(({ payload }) => payload)));
    }
    expect(bus.canUndo()).toBe(true);
    const edited = json(bus.getDocument());
    while (bus.canUndo()) bus.undo();
    expect(json(bus.getDocument())).toBe(original);
    while (bus.canRedo()) bus.redo();
    expect(json(bus.getDocument())).toBe(edited);
  });
});
