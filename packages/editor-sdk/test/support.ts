/**
 * Helpers of the editor-sdk tests. The fixture document is deep-frozen by
 * `@kadrion/test-fixtures`, so an in-place mutation of the input throws in the
 * strict mode of a module instead of passing unnoticed (D30.7).
 */
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { referenceComposition } from '@kadrion/test-fixtures';

import { EditorError } from '../src/index.js';

/** Any document, validated, or a failure that names the first error. */
export function validated(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok)
    throw new Error(`The document does not validate: ${result.errors[0]?.message ?? ''}`);
  return result.composition;
}

/** The reference composition, validated. */
export function reference(): ValidatedComposition {
  return validated(referenceComposition);
}

/** The video asset and node `everyType` adds to the reference composition. */
export const VIDEO_ASSET = Object.freeze({
  id: 'asset-video',
  type: 'video',
  contentHash: `sha256:${'c'.repeat(64)}`,
});
export const VIDEO_NODE = Object.freeze({
  id: 'node-video',
  type: 'video',
  startUs: 0,
  durationUs: 1_000_000,
  position: Object.freeze({ x: 10, y: 20 }),
  scale: Object.freeze({ x: 1, y: 1 }),
  rotation: 0,
  origin: Object.freeze({ x: 0, y: 0 }),
  opacity: 1,
  animations: Object.freeze([]),
  assetId: 'asset-video',
  sourceStartUs: 0,
  sourceStartRemainder: 0,
  speed: { num: 1, den: 1 },
  reverse: false,
  width: 320,
  height: 180,
  fit: 'contain',
  focus: Object.freeze({ x: 500, y: 500 }),
  crop: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }),
  cornerRadius: 0,
  volume: 0,
  effects: Object.freeze([]),
  mask: Object.freeze({ kind: 'none' }),
  matte: Object.freeze({ kind: 'none' }),
  blendMode: 'normal',
});

/** The shape node `everyType` adds to the reference composition (D73). */
export const SHAPE_NODE = Object.freeze({
  id: 'node-shape',
  type: 'shape',
  startUs: 0,
  durationUs: 1_000_000,
  position: Object.freeze({ x: 30, y: 40 }),
  scale: Object.freeze({ x: 1, y: 1 }),
  rotation: 0,
  origin: Object.freeze({ x: 0, y: 0 }),
  opacity: 1,
  animations: Object.freeze([]),
  width: 200,
  height: 120,
  geometry: Object.freeze({ kind: 'rect', cornerRadius: 16 }),
  fill: Object.freeze({ kind: 'solid', color: '#12b76a' }),
  stroke: Object.freeze({
    color: '#ffffff',
    width: 4,
    dash: Object.freeze([]),
    cap: 'butt',
    join: 'miter',
  }),
  trim: Object.freeze({ start: 0, end: 1000 }),
  effects: Object.freeze([]),
  mask: Object.freeze({ kind: 'none' }),
  matte: Object.freeze({ kind: 'none' }),
  blendMode: 'normal',
});

/** The captions node `everyType` adds to the reference composition (D57). */
export const CAPTIONS_NODE = Object.freeze({
  id: 'node-captions',
  type: 'captions',
  startUs: 0,
  durationUs: 2_000_000,
  position: Object.freeze({ x: 40, y: 1500 }),
  scale: Object.freeze({ x: 1, y: 1 }),
  rotation: 0,
  origin: Object.freeze({ x: 0, y: 0 }),
  opacity: 1,
  animations: Object.freeze([]),
  fontAssetId: 'asset-font',
  width: 1000,
  height: 300,
  style: Object.freeze({
    fontSize: 64,
    lineHeight: 80,
    color: '#ffffff',
    highlight: Object.freeze({
      color: '#ffd400',
      scale: 1,
      tracks: Object.freeze([]),
      underline: Object.freeze({ kind: 'none' }),
      box: Object.freeze({ kind: 'none' }),
    }),
    align: 'center',
    verticalAlign: 'bottom',
    maxLineLength: 16,
    maxLines: 2,
    stroke: Object.freeze({ kind: 'none' }),
    shadow: Object.freeze({ kind: 'none' }),
    box: Object.freeze({ kind: 'none' }),
    pageIn: Object.freeze({ kind: 'none' }),
    pageOut: Object.freeze({ kind: 'none' }),
  }),
  words: Object.freeze([
    Object.freeze({ text: 'Kadrion', startUs: 0, durationUs: 400_000 }),
    Object.freeze({ text: 'renders', startUs: 400_000, durationUs: 400_000 }),
    Object.freeze({ text: 'captions', startUs: 1_000_000, durationUs: 500_000 }),
  ]),
  effects: [],
  mask: { kind: 'none' },
  matte: { kind: 'none' },
  blendMode: 'normal',
});

/** The definition `everyType` adds to the reference composition (D76). */
export const DEFINITION = Object.freeze({
  id: 'definition-card',
  sourceHash: '',
  width: 320,
  height: 180,
  durationUs: 2_000_000,
  nodes: Object.freeze([
    Object.freeze({
      id: 'node-card-background',
      type: 'background',
      startUs: 0,
      durationUs: 2_000_000,
      color: '#203040',
      animations: Object.freeze([]),
    }),
  ]),
  clips: Object.freeze([]),
  transitions: Object.freeze([]),
  template: Object.freeze({
    inputs: Object.freeze([]),
    bindings: Object.freeze([]),
    conditions: Object.freeze([]),
    repeats: Object.freeze([]),
  }),
});

/** The instance node `everyType` adds to the reference composition (D76). */
export const INSTANCE_NODE = Object.freeze({
  id: 'node-instance',
  type: 'instance',
  startUs: 0,
  durationUs: 1_000_000,
  position: Object.freeze({ x: 10, y: 20 }),
  scale: Object.freeze({ x: 1, y: 1 }),
  rotation: 0,
  origin: Object.freeze({ x: 0, y: 0 }),
  opacity: 1,
  animations: Object.freeze([]),
  definitionId: 'definition-card',
  inputs: Object.freeze([]),
  sourceStartUs: 0,
  width: 320,
  height: 180,
  fit: 'fill',
  effects: Object.freeze([]),
  mask: Object.freeze({ kind: 'none' }),
  matte: Object.freeze({ kind: 'none' }),
  blendMode: 'normal',
});

/**
 * The reference composition with one video node, one captions node, one shape
 * node, and one instance node at the top of its scene, the video's asset, and
 * the instance's definition (D50.1, D57, D73, D76): a document that holds a
 * node of every type of the schema.
 */
export function everyType(): ValidatedComposition {
  const draft = structuredClone(referenceComposition) as {
    assets: unknown[];
    scenes: { nodes: unknown[] }[];
    definitions: unknown[];
  };
  draft.assets.push(structuredClone(VIDEO_ASSET));
  draft.scenes[0]?.nodes.push(structuredClone(VIDEO_NODE));
  draft.scenes[0]?.nodes.push(structuredClone(CAPTIONS_NODE));
  draft.scenes[0]?.nodes.push(structuredClone(SHAPE_NODE));
  draft.definitions.push(structuredClone(DEFINITION));
  draft.scenes[0]?.nodes.push(structuredClone(INSTANCE_NODE));
  return validated(draft);
}

/** The exact JSON text of a document: the comparison P3 and P4 speak of. */
export function json(value: unknown): string {
  return JSON.stringify(value);
}

/** The code of the `EditorError` a call throws, or what it did instead. */
export function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (reason) {
    if (reason instanceof EditorError) return reason.code;
    return `threw ${reason instanceof Error ? reason.name : typeof reason}`;
  }
  return 'did not throw';
}

/** The `EditorError` a call throws. */
export function errorOf(run: () => unknown): EditorError {
  try {
    run();
  } catch (reason) {
    if (reason instanceof EditorError) return reason;
    throw reason;
  }
  throw new Error('The call did not throw.');
}

export interface Probe {
  readonly id: string;
  readonly type: string;
  readonly position?: { readonly x: number; readonly y: number };
  readonly animations?: unknown;
  readonly children?: readonly Probe[];
}

/** A node of a document, read back for an assertion. */
export function nodeOf(document: unknown, nodeId: string): Probe {
  const scenes = (document as { scenes: { nodes: Probe[] }[] }).scenes;
  for (const scene of scenes) {
    for (const node of scene.nodes) {
      if (node.id === nodeId) return node;
      for (const child of node.children ?? []) if (child.id === nodeId) return child;
    }
  }
  throw new Error(`The document has no node ${nodeId}.`);
}

/** The position of a node, as a plain pair. */
export function positionOf(document: unknown, nodeId: string): { x: number; y: number } {
  const { position } = nodeOf(document, nodeId);
  if (position === undefined) throw new Error(`The node ${nodeId} has no position.`);
  return { x: position.x, y: position.y };
}
