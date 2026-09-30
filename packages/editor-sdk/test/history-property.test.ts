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

import { createCommandBus, EditorError, type BusChange } from '../src/index.js';

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

type Json = Record<string, unknown>;

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

const HASH = `sha256:${'a'.repeat(64)}`;

/** Values of the commands of D40: some change a value, some change none, some fail later. */
const FACTORS = [0, 1, 1.25, 2, 1000];
const SIZES = [400, 399.6, 10, 900, 0.4];
const COLORS = ['#ffffff', '#FFFFFF', '#1a2b3c', '#0b1020'];
const FONT_SIZES = [56, 144, 12.4, 0.2];
const FONT_IDS = ['asset-font', 'f1', 'asset-image', 'missing', 'node-title'];
const IMAGE_IDS = ['asset-image', 'i1', 'asset-font', 'missing', 'node-image'];
/** Assets a command may add, each with its own type; `node-title` collides with a node. */
const NEW_ASSETS: readonly Json[] = [
  { id: 'f1', type: 'font', contentHash: HASH },
  { id: 'i1', type: 'image', contentHash: HASH },
  { contentHash: HASH, type: 'audio', id: 'a1' },
  { id: 'node-title', type: 'image', contentHash: HASH },
];
const ASSET_IDS = [
  'f1',
  'i1',
  'a1',
  'asset-image',
  'asset-font',
  'asset-audio',
  'node-image',
  'missing',
];

/** Nodes that carry the fields of the commands of D40 (D40.1, D40.2). */
const CARRIERS = {
  scale: ['node-title', 'node-image', 'node-group', 'node-custom-html'],
  size: ['node-image', 'node-custom-html'],
  color: ['node-title', 'node-caption', 'node-background'],
  fontSize: ['node-title', 'node-caption'],
  font: ['node-title', 'node-caption'],
  image: ['node-image'],
} as const;

/** A carrier of the field most of the time, and any node the rest of it. */
function carrier(next: () => number, kind: keyof typeof CARRIERS, nodeId: string): string {
  return next() < 0.7 ? pick(next, CARRIERS[kind]) : nodeId;
}

/** Payloads that fail whatever the document holds, each for another reason. */
const FAILING: readonly unknown[] = [
  { type: 'SetNodePosition', nodeId: 'node-title', position: { x: 2_000_000, y: 0 } },
  { type: 'SetNodeOpacity', nodeId: 'node-title', opacity: 1.5 },
  { type: 'DuplicateNode', nodeId: 'node-title', newNodeId: 'a b' },
  { type: 'ReorderNode', nodeId: 'node-title', index: 0.5 },
  { type: 'SetNodeScale', nodeId: 'node-title', scale: { x: 1000.5, y: 1 } },
  { type: 'SetNodeColor', nodeId: 'node-title', color: '#fff' },
  { type: 'AddAsset', asset: { id: 'bad id', type: 'image', contentHash: HASH }, index: 0 },
  { type: 'MoveNode', nodeId: 'node-title' },
  'not a command',
  null,
];
const TEXTS = ['', 'Kadrion', 'Deterministic by design', 'A\nB'];

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
      'scale',
      'size',
      'color',
      'fontSize',
      'font',
      'image',
      'addAsset',
      'removeAsset',
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
    case 'scale':
      return {
        type: 'SetNodeScale',
        nodeId: carrier(next, 'scale', nodeId),
        scale: { x: pick(next, FACTORS), y: pick(next, FACTORS) },
      };
    case 'size':
      return {
        type: 'SetNodeSize',
        nodeId: carrier(next, 'size', nodeId),
        width: pick(next, SIZES),
        height: pick(next, SIZES),
      };
    case 'color':
      return {
        type: 'SetNodeColor',
        nodeId: carrier(next, 'color', nodeId),
        color: pick(next, COLORS),
      };
    case 'fontSize':
      return {
        type: 'SetTextFontSize',
        nodeId: carrier(next, 'fontSize', nodeId),
        fontSize: pick(next, FONT_SIZES),
      };
    case 'font':
      return {
        type: 'SetTextFont',
        nodeId: carrier(next, 'font', nodeId),
        fontAssetId: pick(next, FONT_IDS),
      };
    case 'image':
      return {
        type: 'SetImageAsset',
        nodeId: carrier(next, 'image', nodeId),
        assetId: pick(next, IMAGE_IDS),
      };
    case 'addAsset':
      return {
        type: 'AddAsset',
        asset: { ...pick(next, NEW_ASSETS) },
        index: Math.floor(next() * 6),
      };
    case 'removeAsset':
      return { type: 'RemoveAsset', assetId: pick(next, ASSET_IDS) };
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

/**
 * A command that must fail, the code it fails with, and — for `id-in-use` and
 * `asset-in-use` — the details the contract fixes: the IDs, each once, sorted by
 * code units (D39.3, D40.4). `null` where the contract fixes no details.
 */
class Refused {
  readonly code: string;
  readonly details: readonly string[] | null;

  constructor(code: string, details: readonly string[] | null = null) {
    this.code = code;
    this.details = details;
  }
}

/** IDs as the contract lists them: each once, sorted by code units. */
function listed(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
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
    case 'SetNodeScale': {
      const { x, y } = command['scale'] as { x: number; y: number };
      return [x, y].every((factor) => factor >= 0 && factor <= 1000) ? null : 'invalid-argument';
    }
    case 'SetNodeColor':
      return /^#[0-9A-Fa-f]{6}$/.test(command['color'] as string) ? null : 'invalid-argument';
    case 'SetNodeSize':
    case 'SetTextFontSize':
    case 'SetTextFont':
    case 'SetImageAsset':
    case 'RemoveAsset':
      return null;
    case 'AddAsset': {
      const { id } = command['asset'] as { id: string };
      return /^[A-Za-z0-9_-]+$/.test(id) && isIndex(command['index'] as number)
        ? null
        : 'invalid-argument';
    }
    default:
      return typeof command['type'] === 'string' ? 'unknown-command' : 'invalid-argument';
  }
}

/**
 * Applies one parsed payload to the model's document in place and returns what
 * it did, or the code it must fail with, in the order of checks D39.8 and D40.5
 * fix. Written from D30, D38, D39, and D40 alone.
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
      // Used in the document, or added twice by this node (D39.3).
      const taken = ids.filter((id, at) => present.has(id) || ids.indexOf(id) !== at);
      if (taken.length > 0) return new Refused('id-in-use', listed(taken));
      // A group takes image and text nodes only (D16.2): the schema's verdict.
      if (list !== scene.nodes && node['type'] !== 'text' && node['type'] !== 'image') {
        return new Refused('invalid-result');
      }
      // Every reference of the added subtree must name an asset of the right type
      // that the document still declares — an earlier RemoveAsset may have taken it.
      const kinds = new Map(
        (document['assets'] as Json[]).map((asset) => [asset['id'], asset['type']]),
      );
      const owners = [node, ...((node['children'] as Json[] | undefined) ?? [])];
      const dangling = owners.some(
        (owner) =>
          ('fontAssetId' in owner && kinds.get(owner['fontAssetId']) !== 'font') ||
          ('assetId' in owner && kinds.get(owner['assetId']) !== 'image'),
      );
      if (dangling) return new Refused('invalid-result');
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
      const taken = ids.filter((id) => present.has(id));
      if (taken.length > 0) return new Refused('id-in-use', listed(taken));
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
    case 'SetNodeScale': {
      const target = place(document, nodeId)?.node;
      if (target === undefined) return new Refused('unknown-node');
      const current = target['scale'] as { x: number; y: number } | undefined;
      if (current === undefined) return new Refused('unsupported-node');
      const request = command['scale'] as { x: number; y: number };
      const x = stored(request.x);
      const y = stored(request.y);
      if (current.x === x && current.y === y) return none;
      current.x = x;
      current.y = y;
      return changed;
    }
    case 'SetNodeSize':
    case 'SetTextFontSize': {
      const target = place(document, nodeId)?.node;
      if (target === undefined) return new Refused('unknown-node');
      const fields = command['type'] === 'SetNodeSize' ? ['width', 'height'] : ['fontSize'];
      if (fields.some((field) => typeof target[field] !== 'number'))
        return new Refused('unsupported-node');
      const values = fields.map((field) => stored(Math.round(command[field] as number)));
      if (fields.every((field, at) => target[field] === values[at])) return none;
      // The document takes 1 to 1 000 000 (D15); a rounded value outside it fails last.
      if (values.some((value) => value < 1 || value > 1_000_000))
        return new Refused('invalid-result');
      fields.forEach((field, at) => {
        target[field] = values[at];
      });
      return changed;
    }
    case 'SetNodeColor': {
      const target = place(document, nodeId)?.node;
      if (target === undefined) return new Refused('unknown-node');
      if (typeof target['color'] !== 'string') return new Refused('unsupported-node');
      const color = (command['color'] as string).toLowerCase();
      if (target['color'] === color) return none;
      target['color'] = color;
      return changed;
    }
    case 'SetTextFont':
    case 'SetImageAsset': {
      const target = place(document, nodeId)?.node;
      if (target === undefined) return new Refused('unknown-node');
      const [field, kind] =
        command['type'] === 'SetTextFont' ? ['fontAssetId', 'font'] : ['assetId', 'image'];
      if (typeof target[field] !== 'string') return new Refused('unsupported-node');
      const assetId = command[field] as string;
      const asset = (document['assets'] as Json[]).find(({ id }) => id === assetId);
      if (asset === undefined) return new Refused('unknown-asset');
      if (asset['type'] !== kind) return new Refused('asset-type-mismatch');
      if (target[field] === assetId) return none;
      target[field] = assetId;
      return changed;
    }
    case 'AddAsset': {
      const assets = document['assets'] as Json[];
      const index = command['index'] as number;
      if (index > assets.length) return new Refused('index-out-of-range');
      const asset = structuredClone(command['asset']) as Json;
      const id = asset['id'] as string;
      if (everyId(document).has(id)) return new Refused('id-in-use', [id]);
      assets.splice(index, 0, asset);
      return { created: [id], removed: [], changed: true };
    }
    case 'RemoveAsset': {
      const assets = document['assets'] as Json[];
      const assetId = command['assetId'] as string;
      const index = assets.findIndex(({ id }) => id === assetId);
      if (index < 0) return new Refused('unknown-asset');
      // The model knows the three reference fields of schema 0.1 explicitly; the
      // implementation asks the validator instead (D40.4), so each checks the other.
      const users = [
        ...sceneOf(document).nodes.flatMap((node) => [
          node,
          ...((node['children'] as Json[] | undefined) ?? []),
        ]),
        ...(document['clips'] as Json[]),
      ].filter((user) => user['assetId'] === assetId || user['fontAssetId'] === assetId);
      if (users.length > 0) {
        return new Refused('asset-in-use', listed(users.map((user) => user['id'] as string)));
      }
      assets.splice(index, 1);
      return { created: [], removed: [assetId], changed: true };
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
  | { readonly code: string; readonly details: readonly string[] | null }
  | {
      readonly code: null;
      /** The types of the commands that changed a value, one per such command. */
      readonly applied: readonly string[];
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
    if (code !== null) return { code, details: null };
  }
  const document = JSON.parse(text) as Json;
  const effects: Effect[] = [];
  const applied: string[] = [];
  for (const payload of payloads) {
    const effect = apply(document, payload as Json);
    if (effect instanceof Refused) return { code: effect.code, details: effect.details };
    effects.push(effect);
    if (effect.changed) applied.push((payload as Json)['type'] as string);
  }
  return {
    code: null,
    applied,
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

/** What a call threw: its code and details, or `did not throw`. */
function attempt(action: () => void): { code: string; details: readonly string[] } {
  try {
    action();
  } catch (reason) {
    if (reason instanceof EditorError) return { code: reason.code, details: reason.details };
    throw reason;
  }
  return { code: 'did not throw', details: [] };
}

/** What one seeded run exercised. */
interface Coverage {
  readonly counts: Readonly<Record<string, number>>;
  /** Successful applications that changed a value, by command type. */
  readonly applied: ReadonlyMap<string, number>;
  /** Predicted and observed failures, by code. */
  readonly codes: ReadonlyMap<string, number>;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function run(seed: number, historyLimit: number, steps: number): Coverage {
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
  const codes = new Map<string, number>();
  const applied = new Map<string, number>();

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
      const failure = attempt(() => {
        const result =
          operation === 'dispatch' ? bus.dispatch(payloads[0]) : bus.dispatchTransaction(payloads);
        reported.changed =
          'inverse' in result ? result.inverse !== null : result.inverses.length > 0;
        reported.created = result.createdIds;
      });
      if (prediction.code !== null) {
        counts.failed += 1;
        bump(codes, prediction.code);
        // The model names the code; the bus must fail with exactly that one, and
        // with the details the contract fixes, which the model lists itself.
        expect(failure.code, where).toBe(prediction.code);
        if (prediction.details !== null) expect(failure.details, where).toEqual(prediction.details);
        expect(bus.getDocument(), where).toBe(document);
      } else {
        expect(failure.code, where).toBe('did not throw');
        // What the bus reports must agree with the model; it does not decide.
        expect(reported.changed, where).toBe(prediction.changed);
        expect(reported.created, where).toEqual(prediction.created);
        if (prediction.changed) {
          counts.committed += 1;
          if (prediction.structural) counts.structural += 1;
          for (const type of prediction.applied) bump(applied, type);
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
  expect(codes.size).toBeGreaterThanOrEqual(8);
  expect(counts.noop).toBeGreaterThanOrEqual(2);
  if (historyLimit > 0) {
    expect(counts.undo).toBeGreaterThan(steps / 20);
    expect(counts.redo).toBeGreaterThan(steps / 20);
  }
  return { counts, applied, codes };
}

/** The seeded runs, each run once and shared by the tests that read it. */
const SEEDS: readonly (readonly [number, number])[] = [
  [1, 100],
  [2, 100],
  [3, 3],
  [4, 1],
  [5, 0],
  [6, 100],
];
const STEPS = 600;
const runs = new Map<number, Coverage>();

function runOnce(seed: number, historyLimit: number): Coverage {
  const known = runs.get(seed);
  if (known !== undefined) return known;
  const coverage = run(seed, historyLimit, STEPS);
  runs.set(seed, coverage);
  return coverage;
}

const NEW_COMMANDS = [
  'SetNodeScale',
  'SetNodeSize',
  'SetNodeColor',
  'SetTextFontSize',
  'SetTextFont',
  'SetImageAsset',
  'AddAsset',
  'RemoveAsset',
];
const NEW_CODES = ['unknown-asset', 'asset-type-mismatch', 'asset-in-use'];

describe('the history against a model of snapshots (D38, D39, D40)', () => {
  it.each(SEEDS)('replays seed %d with historyLimit %d', (seed, historyLimit) => {
    runOnce(seed, historyLimit);
  });

  it('applies every command of D40 with a real change, and meets every new code', () => {
    // Over the seeded runs together: the random exploration stays, and this
    // proves it still reaches every command and every failure it must test.
    const applied = new Map<string, number>();
    const codes = new Map<string, number>();
    for (const [seed, historyLimit] of SEEDS) {
      const coverage = runOnce(seed, historyLimit);
      for (const [type, count] of coverage.applied)
        applied.set(type, (applied.get(type) ?? 0) + count);
      for (const [code, count] of coverage.codes) codes.set(code, (codes.get(code) ?? 0) + count);
    }
    for (const type of NEW_COMMANDS) expect(applied.get(type) ?? 0, type).toBeGreaterThan(0);
    for (const code of NEW_CODES) expect(codes.get(code) ?? 0, code).toBeGreaterThan(0);
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
