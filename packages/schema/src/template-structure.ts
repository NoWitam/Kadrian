/**
 * Where the scenes and nodes of a template lie, which repeat holds each, and
 * who uses each asset (D59): shared by the validation of a document and by
 * `instantiateTemplate`, so that both judge "inside a repeat" by one rule.
 */
import type { Composition, TemplateRepeat } from './types.js';
import type { CompositionV08 } from './v0-8/composition-schema.js';
import type { CompositionV09 } from './v0-9/composition-schema.js';
import type { CompositionV010 } from './v0-10/composition-schema.js';
import type { CompositionV011 } from './v0-11/composition-schema.js';

/** A scene, or a node with the scene and the group it lies in. */
export interface TemplateElement {
  readonly kind: 'scene' | 'node';
  readonly id: string;
  /** The scene the element is or lies in. */
  readonly sceneId: string;
  /** The group a child lies in, or `null` for a scene and a node of a scene. */
  readonly groupId: string | null;
}

export interface TemplateStructure {
  readonly elements: ReadonlyMap<string, TemplateElement>;
  /** The repeats by the ID of their target; the first of two for one target. */
  readonly repeatOf: ReadonlyMap<string, TemplateRepeat>;
  /**
   * The elements that use each asset: the node that shows it or writes with it,
   * the scene whose clip plays it, and `null` for a clip of the composition.
   */
  readonly assetUsers: ReadonlyMap<string, readonly (string | null)[]>;
  /** The element, then its group, then its scene: the elements it lies in, itself first. */
  chain(id: string): readonly string[];
  /** The repeat whose target is the element or an element it lies in, nearest first; or `null`. */
  repeatHolding(id: string): TemplateRepeat | null;
}

/** A node of the current version or of 0.9, whose images and videos have no focus (D63). */
type AnyNode =
  | Composition['scenes'][number]['nodes'][number]
  | Extract<Composition['scenes'][number]['nodes'][number], { type: 'group' }>['children'][number]
  | CompositionV09['scenes'][number]['nodes'][number]
  | Extract<
      CompositionV09['scenes'][number]['nodes'][number],
      { type: 'group' }
    >['children'][number];

/** The assets a node uses: its picture or its font (D14). */
export function assetsOfNode(node: AnyNode): readonly string[] {
  if (node.type === 'image' || node.type === 'video') return [node.assetId];
  if (node.type === 'text' || node.type === 'captions') return [node.fontAssetId];
  return [];
}

/**
 * The structure of a composition of 0.9 or later; a document of 0.8 or
 * earlier, which has no repeats, has none.
 */
export function templateStructure(
  composition: Composition | CompositionV011 | CompositionV010 | CompositionV09 | CompositionV08,
): TemplateStructure {
  const elements = new Map<string, TemplateElement>();
  const assetUsers = new Map<string, (string | null)[]>();
  const use = (assetId: string, user: string | null): void => {
    const users = assetUsers.get(assetId) ?? [];
    users.push(user);
    assetUsers.set(assetId, users);
  };
  for (const scene of composition.scenes) {
    if (!elements.has(scene.id)) {
      elements.set(scene.id, { kind: 'scene', id: scene.id, sceneId: scene.id, groupId: null });
    }
    const visit = (node: AnyNode, groupId: string | null): void => {
      if (!elements.has(node.id)) {
        elements.set(node.id, { kind: 'node', id: node.id, sceneId: scene.id, groupId });
      }
      for (const assetId of assetsOfNode(node)) use(assetId, node.id);
      if (node.type === 'group') for (const child of node.children) visit(child, node.id);
    };
    for (const node of scene.nodes) visit(node, null);
    for (const clip of scene.clips) use(clip.assetId, scene.id);
  }
  for (const clip of composition.clips) use(clip.assetId, null);
  const repeats: readonly TemplateRepeat[] =
    'repeats' in composition.template ? composition.template.repeats : [];
  const repeatOf = new Map<string, TemplateRepeat>();
  for (const repeat of repeats) {
    if (!repeatOf.has(repeat.targetId)) repeatOf.set(repeat.targetId, repeat);
  }
  const chain = (id: string): readonly string[] => {
    const element = elements.get(id);
    if (element === undefined) return [];
    if (element.kind === 'scene') return [id];
    return element.groupId === null
      ? [id, element.sceneId]
      : [id, element.groupId, element.sceneId];
  };
  return {
    elements,
    repeatOf,
    assetUsers,
    chain,
    repeatHolding(id) {
      for (const at of chain(id)) {
        const repeat = repeatOf.get(at);
        if (repeat !== undefined) return repeat;
      }
      return null;
    },
  };
}
