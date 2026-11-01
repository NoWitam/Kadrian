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
  opacity: 1,
  animations: Object.freeze([]),
  assetId: 'asset-video',
  sourceStartUs: 0,
  width: 320,
  height: 180,
  fit: 'contain',
  volume: 0,
});

/**
 * The reference composition with one video node at the top of its scene and
 * its asset (D50.1): a document that holds a node of every type of the schema.
 */
export function everyType(): ValidatedComposition {
  const draft = structuredClone(referenceComposition) as {
    assets: unknown[];
    scenes: { nodes: unknown[] }[];
  };
  draft.assets.push(structuredClone(VIDEO_ASSET));
  draft.scenes[0]?.nodes.push(structuredClone(VIDEO_NODE));
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
