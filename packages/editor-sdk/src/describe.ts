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
  /** The ID of the scene, the definition, or the group whose list holds the node. */
  readonly parentId: string;
  /** The node's index in that list: 0 is the bottom layer, painted first. */
  readonly layer: number;
  readonly startUs: number;
  readonly durationUs: number;
  /**
   * Every other field the document stores for the node, as it stores it —
   * `animations` and the `html` of a Custom HTML element included, since
   * `SetCustomHtml` edits it (D78) — except `children`, which `children` below
   * describes.
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
  /** The effects of the whole scene, in the order they apply, as the document stores them (D71). */
  readonly effects: readonly unknown[];
}

/** One definition, a nested composition instances place (D76). */
export interface DefinitionDescription {
  readonly id: string;
  /** The host's label of the source the definition was made from, or `''` (D77). */
  readonly sourceHash: string;
  /** The definition's own canvas, in its pixels. */
  readonly width: number;
  readonly height: number;
  readonly durationUs: number;
  /** The definition's nodes from the bottom layer to the top, in definition time. */
  readonly nodes: readonly NodeDescription[];
  /** The definition's audio clips, in definition time, as the document stores them. */
  readonly clips: readonly unknown[];
  /** The transitions between clips of the definition, as the document stores them. */
  readonly transitions: readonly unknown[];
  /** The IDs of the instance nodes that place the definition, in document order. */
  readonly instanceIds: readonly string[];
  /**
   * The definition's template, as the document stores it: the inputs an
   * instance gives values to, and the bindings, conditions, and repeats that
   * write them; all empty in a definition that is no element (D77).
   */
  readonly template: {
    readonly inputs: readonly unknown[];
    readonly bindings: readonly unknown[];
    readonly conditions: readonly unknown[];
    readonly repeats: readonly unknown[];
  };
}

/** What `describeDocument` returns; plain JSON, deep-frozen. */
export interface DocumentDescription {
  readonly schemaVersion: string;
  /** The canvas, in composition pixels. */
  readonly width: number;
  readonly height: number;
  /**
   * The safe area, from each edge of the canvas, as the document stores it
   * (D70): where captions and other text that must be read belong. It cuts
   * nothing.
   */
  readonly safeArea: {
    readonly fromTop: number;
    readonly fromRight: number;
    readonly fromBottom: number;
    readonly fromLeft: number;
  };
  readonly fps: number;
  /** The length of the composition, in integer microseconds. */
  readonly durationUs: number;
  readonly scenes: readonly SceneDescription[];
  /**
   * The declared assets, as the document stores them. A video or audio asset
   * whose facts the host supplied also states its `sourceDurationUs` (D49.6,
   * D50.6, D53); a video whose sound the host read states its
   * `soundDurationUs`, `null` when it has none (D53). An image asset whose
   * facts the host supplied states its `width` and `height` as an image node
   * lays it out (D62); an SVG asset also states its `viewBox` (D74.6).
   */
  readonly assets: readonly unknown[];
  /** The composition's clips, in composition time, as the document stores them. */
  readonly clips: readonly unknown[];
  /** The transitions between scenes, as the document stores them (D56.1). */
  readonly transitions: readonly unknown[];
  /** The definitions, nested compositions that instance nodes place (D76). */
  readonly definitions: readonly DefinitionDescription[];
  /**
   * The template section, as the document stores it (D58): its inputs with
   * their constraints and defaults, and its bindings; both empty in a
   * composition that is no template.
   */
  readonly template: { readonly inputs: readonly unknown[]; readonly bindings: readonly unknown[] };
}

type SceneNode =
  | Composition['scenes'][number]['nodes'][number]
  | Composition['definitions'][number]['nodes'][number];
type ChildNode = Extract<SceneNode, { type: 'group' }>['children'][number];

/** The fields a description states on its own, or leaves out (D46.3). */
const OWN_FIELDS = Object.freeze(['id', 'type', 'startUs', 'durationUs', 'children']);

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
 * video and audio asset, and the size of every image, whose facts `mediaFactsOf`
 * knows (D49.6, D53, D62). The result shares no object with the
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
    safeArea: copy.safeArea,
    fps: copy.fps,
    durationUs: copy.durationUs,
    scenes: copy.scenes.map((scene, index) => ({
      id: scene.id,
      startUs: placements[index]?.startUs ?? 0,
      durationUs: scene.durationUs,
      nodes: scene.nodes.map((node, at) => describeNode(node, scene.id, at)),
      clips: scene.clips,
      transitions: scene.transitions,
      effects: scene.effects,
    })),
    assets: copy.assets.map((asset) => {
      const facts = asset.type === 'font' ? null : mediaFactsOf(asset.contentHash);
      if (facts === null || facts.type !== asset.type) return asset;
      if (facts.type === 'image') return { ...asset, width: facts.width, height: facts.height };
      if (facts.type === 'svg') {
        const { width, height, viewBox } = facts;
        return { ...asset, width, height, viewBox: { ...viewBox } };
      }
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
    definitions: copy.definitions.map((definition) => ({
      id: definition.id,
      sourceHash: definition.sourceHash,
      width: definition.width,
      height: definition.height,
      durationUs: definition.durationUs,
      nodes: definition.nodes.map((node, at) => describeNode(node, definition.id, at)),
      clips: definition.clips,
      transitions: definition.transitions,
      instanceIds: [...copy.scenes, ...copy.definitions].flatMap((holder) =>
        holder.nodes.flatMap((node) =>
          node.type === 'instance' && node.definitionId === definition.id ? [node.id] : [],
        ),
      ),
      template: definition.template,
    })),
    template: copy.template,
  });
}

/** A deep copy of a JSON document, typed as the document it copies; it carries no brand. */
function structuredJson(document: Composition): Composition {
  return JSON.parse(JSON.stringify(document)) as Composition;
}
