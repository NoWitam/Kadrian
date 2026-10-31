/**
 * A read-only description of a document for a model that cannot see the
 * canvas (D46.3): every scene and node with its ID, type, lifetime, parent,
 * and layer, the node's stored fields, and the assets and clips as the
 * document stores them. It reads and never writes, and it is a pure function
 * of the document: the same document gives the same description.
 */
import type { Composition, ValidatedComposition } from '@kadrion/schema';

import { deepFreeze } from './commands.js';

/** One node, with what its place in the document says about it. */
export interface NodeDescription {
  readonly id: string;
  readonly type: string;
  /** The ID of the scene or the group whose list holds the node. */
  readonly parentId: string;
  /** The node's index in that list: 0 is the bottom layer, painted first. */
  readonly layer: number;
  readonly startUs: number;
  readonly durationUs: number;
  /**
   * Every other field the document stores for the node, as it stores it —
   * `animations` included — except `children`, which `children` below
   * describes, and the `html` of a Custom HTML element, which no command edits.
   */
  readonly fields: Readonly<Record<string, unknown>>;
  /** A group's children, described the same way; present on groups only. */
  readonly children?: readonly NodeDescription[];
}

export interface SceneDescription {
  readonly id: string;
  /** The scene's nodes from the bottom layer to the top. */
  readonly nodes: readonly NodeDescription[];
}

/** What `describeDocument` returns; plain JSON, deep-frozen. */
export interface DocumentDescription {
  readonly schemaVersion: string;
  /** The canvas, in composition pixels. */
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** The length of the composition, in integer microseconds. */
  readonly durationUs: number;
  readonly scenes: readonly SceneDescription[];
  /** The declared assets, as the document stores them. */
  readonly assets: readonly unknown[];
  /** The clips, as the document stores them. */
  readonly clips: readonly unknown[];
}

type SceneNode = Composition['scenes'][number]['nodes'][number];
type ChildNode = Extract<SceneNode, { type: 'group' }>['children'][number];

/** The fields a description states on its own, or leaves out (D46.3). */
const OWN_FIELDS = Object.freeze(['id', 'type', 'startUs', 'durationUs', 'children', 'html']);

function describeNode(
  node: SceneNode | ChildNode,
  parentId: string,
  layer: number,
): NodeDescription {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!OWN_FIELDS.includes(key)) fields[key] = value;
  }
  const described = {
    id: node.id,
    type: node.type,
    parentId,
    layer,
    startUs: node.startUs,
    durationUs: node.durationUs,
    fields,
  };
  if (node.type !== 'group') return described;
  return {
    ...described,
    children: node.children.map((child, at) => describeNode(child, node.id, at)),
  };
}

/**
 * Describes a validated document (D46.3). The result shares no object with the
 * document's arrays it lists — it is a fresh JSON value — and is deep-frozen.
 */
export function describeDocument(document: ValidatedComposition): DocumentDescription {
  // A JSON round trip gives a value that shares nothing with the document,
  // whose objects belong to the bus and its history.
  const copy = structuredJson(document);
  return deepFreeze<DocumentDescription>({
    schemaVersion: copy.schemaVersion,
    width: copy.width,
    height: copy.height,
    fps: copy.fps,
    durationUs: copy.durationUs,
    scenes: copy.scenes.map((scene) => ({
      id: scene.id,
      nodes: scene.nodes.map((node, at) => describeNode(node, scene.id, at)),
    })),
    assets: copy.assets,
    clips: copy.clips,
  });
}

/** A deep copy of a JSON document, typed as the document it copies; it carries no brand. */
function structuredJson(document: Composition): Composition {
  return JSON.parse(JSON.stringify(document)) as Composition;
}
