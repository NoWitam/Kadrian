/**
 * The lists of siblings a mounted tree holds (D16, D75, D76): the nodes of each
 * scene, the children of each group, and the nodes of the definition of every
 * instance, with every ID inside an instance its path (D76.3), at any depth,
 * in document order. The mount, the masks, and the filters read the document
 * through it, so that a node inside an instance is mounted, masked, and
 * filtered under the same path that the runtime gives its state.
 */
import {
  instanceDefinition,
  type ClipTransition,
  type GroupNode,
  type SceneNode,
  type ValidatedComposition,
} from '@kadrion/schema';

export type MountedDocumentNode = SceneNode | GroupNode['children'][number];

/** One list of siblings and the clip transitions among them, if its holder has any. */
export interface Siblings {
  readonly nodes: readonly MountedDocumentNode[];
  readonly transitions: readonly ClipTransition[];
}

/** The lists of siblings of one scene: its nodes, then, in document order, those under them. */
export function sceneSiblingLists(
  composition: ValidatedComposition,
  scene: ValidatedComposition['scenes'][number],
): Siblings[] {
  const lists: Siblings[] = [];
  const visit = (
    nodes: readonly MountedDocumentNode[],
    transitions: readonly ClipTransition[],
  ): void => {
    lists.push({ nodes, transitions });
    for (const node of nodes) {
      if (node.type === 'group') lists.push({ nodes: node.children, transitions: [] });
      if (node.type === 'instance') {
        const definition = instanceDefinition(composition, node);
        if (definition !== null) visit(definition.nodes, definition.transitions);
      }
    }
  };
  visit(scene.nodes, scene.transitions);
  return lists;
}

/** The lists of siblings of every scene, scene by scene. */
export function siblingLists(composition: ValidatedComposition): Siblings[] {
  return composition.scenes.flatMap((scene) => sceneSiblingLists(composition, scene));
}
