/**
 * Writes an evaluated state into a mounted tree (D22.2, D22.4). The tree is
 * found again through its addressing attributes; nothing is remembered between
 * calls, so the result depends on the mounted document and the state only.
 */
import type { CompositionState, NodeState } from '@kadrion/runtime';

import { cssNumber, cssTransform } from './css.js';
import { RenderError, unsupportedNode } from './errors.js';
import { NODE_ATTRIBUTE, SCENE_ATTRIBUTE, STAGE_ATTRIBUTE } from './mount.js';

/** A node of the state together with the element that was mounted for it. */
export interface MountedNode {
  readonly element: HTMLElement;
  readonly state: NodeState;
}

function mismatch(message: string): never {
  throw new RenderError('state-mismatch', message);
}

/** The element children of `parent` must carry exactly `ids`, in this order. */
function matchChildren(parent: Element, attribute: string, ids: readonly string[]): HTMLElement[] {
  const children = [...parent.children];
  const found = children.map((child) => child.getAttribute(attribute));
  if (found.length !== ids.length || found.some((id, index) => id !== ids[index])) {
    mismatch(
      `The mounted tree has ${JSON.stringify(found)} where the state has ${JSON.stringify(ids)}.`,
    );
  }
  // An element that carries the attribute of this renderer is one of its HTML elements.
  return children as HTMLElement[];
}

/** Collects every write of one node and its children; nothing is written yet. */
function plan(element: HTMLElement, state: NodeState, writes: MountedNode[]): void {
  switch (state.type) {
    case 'background':
      // No transform, but a lifetime like every node (D42.1).
      writes.push({ element, state });
      return;
    case 'group': {
      writes.push({ element, state });
      const ids = state.children.map((child) => child.id);
      matchChildren(element, NODE_ATTRIBUTE, ids).forEach((child, index) => {
        const childState = state.children[index];
        if (childState !== undefined) plan(child, childState, writes);
      });
      return;
    }
    case 'image':
    case 'text':
    case 'custom-html':
      writes.push({ element, state });
      return;
    default:
      unsupportedNode(state);
  }
}

/**
 * Checks that `root` holds the tree that `mountComposition` built for the
 * scenes and nodes of `state` — the same IDs, in the same order and hierarchy —
 * and returns every node with its element, in document order. A mismatch throws
 * a `RenderError`; nothing is written.
 */
export function mountedNodes(root: Element, state: CompositionState): MountedNode[] {
  const stage = root.firstElementChild;
  if (root.childElementCount !== 1 || stage?.getAttribute(STAGE_ATTRIBUTE) !== '') {
    throw new RenderError('not-mounted', 'The root holds no tree built by mountComposition.');
  }
  const writes: MountedNode[] = [];
  const scenes = matchChildren(
    stage,
    SCENE_ATTRIBUTE,
    state.scenes.map((scene) => scene.id),
  );
  scenes.forEach((sceneElement, index) => {
    const nodes = state.scenes[index]?.nodes ?? [];
    matchChildren(
      sceneElement,
      NODE_ATTRIBUTE,
      nodes.map((node) => node.id),
    ).forEach((element, nodeIndex) => {
      const node = nodes[nodeIndex];
      if (node !== undefined) plan(element, node, writes);
    });
  });
  return writes;
}

/**
 * Renders `state` into the tree that `mountComposition` built in `root`. The
 * whole structure is checked first (`mountedNodes`), and only then are
 * `transform` and `opacity` of every transformed node, and the visibility of
 * every node, written. A mismatch throws a `RenderError` before anything is
 * written, so the DOM never shows two instants at once. The frame of a Custom
 * HTML element is not touched: its time is pushed by `synchronizeCustomHtml`
 * (D23.4).
 *
 * An inactive node gets `visibility: hidden`; an active one loses the
 * declaration (D42.4). `visible` is never written: the property inherits, so a
 * hidden group hides its children whatever their own state says, and a tree
 * whose nodes are all active carries no declaration at all. Both branches write
 * on every call, so nothing depends on what an earlier call left.
 */
export function renderState(root: Element, state: CompositionState): void {
  for (const { element, state: node } of mountedNodes(root, state)) {
    if (node.type !== 'background') {
      element.style.setProperty('transform', cssTransform(node));
      element.style.setProperty('opacity', cssNumber(node.opacity));
    }
    if (node.active) element.style.removeProperty('visibility');
    else element.style.setProperty('visibility', 'hidden');
  }
}
