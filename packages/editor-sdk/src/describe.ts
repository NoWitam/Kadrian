/**
 * A read-only description of a document for a model that cannot see the
 * canvas (D46.3): every scene and node with its ID, type, lifetime, parent,
 * and layer, the node's stored fields, and the assets and clips as the
 * document stores them. It reads and never writes, and it is a pure function
 * of the document: the same document gives the same description.
 */
import { scenePlacements, type Composition, type ValidatedComposition } from '@kadrion/schema';

import { deepFreeze } from './commands.js';
import type { MediaFacts } from './media.js';

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
  /**
   * Where the scene starts in composition time: the sum of the durations of the
   * scenes before it less those of the transitions between them, derived and
   * not stored (D49.3, D54.6, D56.1).
   */
  readonly startUs: number;
  readonly durationUs: number;
  /** The scene's nodes from the bottom layer to the top. */
  readonly nodes: readonly NodeDescription[];
  /** The scene's audio clips, in scene time, as the document stores them (D54.1). */
  readonly clips: readonly unknown[];
  /** The transitions between clips of the scene, as the document stores them (D56.1). */
  readonly transitions: readonly unknown[];
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
  /**
   * The declared assets, as the document stores them. A video or audio asset
   * whose facts the host supplied also states its `sourceDurationUs` (D49.6,
   * D50.6, D53); a video whose sound the host read states its
   * `soundDurationUs`, `null` when it has none (D53).
   */
  readonly assets: readonly unknown[];
  /** The composition's clips, in composition time, as the document stores them. */
  readonly clips: readonly unknown[];
  /** The transitions between scenes, as the document stores them (D56.1). */
  readonly transitions: readonly unknown[];
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
 * Describes a validated document (D46.3), with the source duration of every
 * video and audio asset whose facts `mediaFactsOf` knows (D49.6, D53). The result shares no object with the
 * document's arrays it lists — it is a fresh JSON value — and is deep-frozen.
 */
export function describeDocument(
  document: ValidatedComposition,
  mediaFactsOf: (contentHash: string) => MediaFacts | null = () => null,
): DocumentDescription {
  // A JSON round trip gives a value that shares nothing with the document,
  // whose objects belong to the bus and its history.
  const copy = structuredJson(document);
  const placements = scenePlacements(copy);
  return deepFreeze<DocumentDescription>({
    schemaVersion: copy.schemaVersion,
    width: copy.width,
    height: copy.height,
    fps: copy.fps,
    durationUs: copy.durationUs,
    scenes: copy.scenes.map((scene, index) => ({
      id: scene.id,
      startUs: placements[index]?.startUs ?? 0,
      durationUs: scene.durationUs,
      nodes: scene.nodes.map((node, at) => describeNode(node, scene.id, at)),
      clips: scene.clips,
      transitions: scene.transitions,
    })),
    assets: copy.assets.map((asset) => {
      const facts =
        asset.type === 'video' || asset.type === 'audio' ? mediaFactsOf(asset.contentHash) : null;
      if (facts === null || facts.type !== asset.type) return asset;
      if (facts.type === 'audio' || facts.audioDurationUs === undefined) {
        return { ...asset, sourceDurationUs: facts.durationUs };
      }
      return {
        ...asset,
        sourceDurationUs: facts.durationUs,
        soundDurationUs: facts.audioDurationUs,
      };
    }),
    clips: copy.clips,
    transitions: copy.transitions,
  });
}

/** A deep copy of a JSON document, typed as the document it copies; it carries no brand. */
function structuredJson(document: Composition): Composition {
  return JSON.parse(JSON.stringify(document)) as Composition;
}
