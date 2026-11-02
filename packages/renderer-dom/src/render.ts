/**
 * Writes an evaluated state into a mounted tree (D22.2, D22.4). The tree is
 * found again through its addressing attributes; nothing is remembered between
 * calls, so the result depends on the mounted document and the state only.
 */
import type { CompositionState, NodeState, SceneState } from '@kadrion/runtime';

import { cssColor, cssInset, cssNumber, cssPixels, cssTransform } from './css.js';
import { RenderError, unsupportedNode } from './errors.js';
import { NODE_ATTRIBUTE, SCENE_ATTRIBUTE, STAGE_ATTRIBUTE } from './mount.js';

/** A node of the state together with the element that was mounted for it. */
export interface MountedNode {
  readonly element: HTMLElement;
  readonly state: NodeState;
  /** The time of the node's scene, at which the state was evaluated (D49.3, D54.3). */
  readonly sceneTimeUs: number;
}

/** The declarations `renderState` writes on a node; the mount writes none of them. */
const WRITTEN = ['transform', 'opacity', 'visibility'] as const;

/** The declarations of a scene transition on a scene element (D56); the mount writes none of them. */
const TRANSITION_WRITTEN = ['opacity', 'transform', 'clip-path'] as const;

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
function plan(
  element: HTMLElement,
  state: NodeState,
  sceneTimeUs: number,
  writes: MountedNode[],
): void {
  switch (state.type) {
    case 'background':
      // No transform, but a lifetime like every node (D42.1).
      writes.push({ element, state, sceneTimeUs });
      return;
    case 'group': {
      writes.push({ element, state, sceneTimeUs });
      const ids = state.children.map((child) => child.id);
      matchChildren(element, NODE_ATTRIBUTE, ids).forEach((child, index) => {
        const childState = state.children[index];
        if (childState !== undefined) plan(child, childState, sceneTimeUs, writes);
      });
      return;
    }
    case 'image':
    case 'text':
    case 'custom-html':
    case 'video':
      writes.push({ element, state, sceneTimeUs });
      return;
    default:
      unsupportedNode(state);
  }
}

/** A mounted scene, and whether the state evaluates it. */
interface MountedScene {
  readonly element: HTMLElement;
  /** The state of the scene, when the state evaluates it. */
  readonly state: SceneState | null;
}

/** The mounted tree checked against a state: every scene element, and the nodes of the evaluated ones. */
interface MountedTree {
  readonly stage: HTMLElement;
  readonly scenes: readonly MountedScene[];
  readonly nodes: readonly MountedNode[];
}

function mountedTree(root: Element, state: CompositionState): MountedTree {
  const stage = root.firstElementChild;
  if (root.childElementCount !== 1 || stage?.getAttribute(STAGE_ATTRIBUTE) !== '') {
    throw new RenderError('not-mounted', 'The root holds no tree built by mountComposition.');
  }
  // Every scene of the document is mounted; the state lists the evaluated ones, in
  // the same order (D54.3), so its IDs must be found among the mounted ones in order.
  const elements = [...stage.children];
  const mountedIds = elements.map((child) => child.getAttribute(SCENE_ATTRIBUTE));
  const stateIds = state.scenes.map((scene) => scene.id);
  const positions: number[] = [];
  let from = 0;
  for (const id of stateIds) {
    const at = mountedIds.indexOf(id, from);
    if (at < 0) {
      mismatch(
        `The mounted tree has the scenes ${JSON.stringify(mountedIds)}, which do not hold ${JSON.stringify(stateIds)} in this order.`,
      );
    }
    positions.push(at);
    from = at + 1;
  }
  if (mountedIds.some((id) => id === null)) {
    mismatch(`The mounted tree has ${JSON.stringify(mountedIds)} where scenes belong.`);
  }
  const nodes: MountedNode[] = [];
  state.scenes.forEach((scene, index) => {
    const sceneElement = elements[positions[index] ?? -1];
    if (sceneElement === undefined) return;
    matchChildren(
      sceneElement,
      NODE_ATTRIBUTE,
      scene.nodes.map((node) => node.id),
    ).forEach((element, nodeIndex) => {
      const node = scene.nodes[nodeIndex];
      if (node !== undefined) plan(element, node, scene.timeUs, nodes);
    });
  });
  return {
    // An element that carries the attribute of this renderer is one of its HTML elements.
    stage: stage as HTMLElement,
    scenes: (elements as HTMLElement[]).map((element, at) => ({
      element,
      state: state.scenes[positions.indexOf(at)] ?? null,
    })),
    nodes,
  };
}

/**
 * Checks that `root` holds the tree that `mountComposition` built for the
 * scenes and nodes of `state` — the evaluated scenes among the mounted ones in
 * their order, and their nodes with the same IDs, in the same order and
 * hierarchy — and returns every node of the evaluated scenes with its element,
 * in document order. A mismatch throws a `RenderError`; nothing is written.
 */
export function mountedNodes(root: Element, state: CompositionState): MountedNode[] {
  return [...mountedTree(root, state).nodes];
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
 *
 * A scene that the state does not evaluate gets `visibility: hidden` on its
 * element, which hides every node in it whatever was written there before; an
 * evaluated one loses the declaration (D54.3). The nodes of a scene that is
 * not evaluated lose what an earlier call wrote on them, so that the tree is
 * that of a fresh mount rendered at this state, whatever came before.
 *
 * A scene transition (D56) writes on the scene elements of its two sides what
 * their `transition` states say, and the state's `backdrop` is the stage's
 * background colour; both are removed when the state has none.
 */
export function renderState(root: Element, state: CompositionState): void {
  const tree = mountedTree(root, state);
  if (state.backdrop === undefined) tree.stage.style.removeProperty('background-color');
  else tree.stage.style.setProperty('background-color', cssColor(state.backdrop));
  for (const { element, state: scene } of tree.scenes) {
    writeSceneTransition(element, scene?.transition);
    if (scene !== null) {
      element.style.removeProperty('visibility');
      continue;
    }
    element.style.setProperty('visibility', 'hidden');
    // Back to what the mount wrote, so the tree never keeps an earlier instant.
    for (const node of element.querySelectorAll<HTMLElement>(`[${NODE_ATTRIBUTE}]`)) {
      for (const property of WRITTEN) node.style.removeProperty(property);
    }
  }
  for (const { element, state: node } of tree.nodes) {
    if (node.type !== 'background') {
      element.style.setProperty('transform', cssTransform(node));
      element.style.setProperty('opacity', cssNumber(node.opacity));
    }
    if (node.active) element.style.removeProperty('visibility');
    else element.style.setProperty('visibility', 'hidden');
  }
}

/**
 * Writes what a scene transition does to a scene element (D56), and only that:
 * a factor of its opacity, an offset, or the part of the frame it is cut to;
 * every other declaration of a transition is removed, so a scene outside a
 * transition carries none of them.
 */
function writeSceneTransition(
  element: HTMLElement,
  transition: SceneState['transition'] | undefined,
): void {
  for (const property of TRANSITION_WRITTEN) element.style.removeProperty(property);
  if (transition === undefined) return;
  if (transition.opacity !== undefined) {
    element.style.setProperty('opacity', cssNumber(transition.opacity));
  }
  if (transition.offset !== undefined) {
    element.style.setProperty(
      'transform',
      `translate(${cssPixels(transition.offset.x)}, ${cssPixels(transition.offset.y)})`,
    );
  }
  if (transition.clip !== undefined)
    element.style.setProperty('clip-path', cssInset(transition.clip));
}
