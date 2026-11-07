/**
 * Writes an evaluated state into a mounted tree (D22.2, D22.4). The tree is
 * found again through its addressing attributes; nothing is remembered between
 * calls, so the result depends on the mounted document and the state only.
 */
import type {
  CaptionsNodeState,
  Circle,
  ClipTransitionState,
  CompositionState,
  Hole,
  Inset,
  NodeState,
  SceneState,
} from '@kadrion/runtime';

import {
  cssCircle,
  cssColor,
  cssHole,
  cssInset,
  cssNumber,
  cssTransform,
  cssTransitionTransform,
} from './css.js';
import { RenderError, unsupportedNode } from './errors.js';
import {
  CAPTION_PAGE_ATTRIBUTE,
  CAPTION_WORD_ATTRIBUTE,
  CLIP_FRAME_ATTRIBUTE,
  HIGHLIGHT_PROPERTY,
  NODE_ATTRIBUTE,
  SCENE_ATTRIBUTE,
  STAGE_ATTRIBUTE,
} from './mount.js';

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

/** The declarations of a clip transition on the frame of a side (D66); the mount writes none of them. */
const FRAME_WRITTEN = ['clip-path', 'background-color'] as const;

function mismatch(message: string): never {
  throw new RenderError('state-mismatch', message);
}

/**
 * The node element a child of a scene or group holds: the child itself, or the
 * one node inside the frame of a clip transition (D66), which carries the
 * node's ID too. Anything else is returned as it is, for `matchChildren` to
 * refuse.
 */
function unframed(child: Element): Element {
  const frameOf = child.getAttribute(CLIP_FRAME_ATTRIBUTE);
  if (frameOf === null) return child;
  const node = child.firstElementChild;
  if (
    child.childElementCount !== 1 ||
    node === null ||
    child.hasAttribute(NODE_ATTRIBUTE) ||
    node.getAttribute(NODE_ATTRIBUTE) !== frameOf
  ) {
    mismatch(`The frame of the clip transition of "${frameOf}" does not hold its node alone.`);
  }
  return node;
}

/** The element children of `parent` must carry exactly `ids`, in this order. */
function matchChildren(parent: Element, attribute: string, ids: readonly string[]): HTMLElement[] {
  const children =
    attribute === NODE_ATTRIBUTE ? [...parent.children].map(unframed) : [...parent.children];
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
    case 'captions': {
      // The page shown must be one the mount built (D57).
      const pages = element.querySelectorAll(`[${CAPTION_PAGE_ATTRIBUTE}]`).length;
      if (state.page !== null && state.page >= pages) {
        mismatch(
          `The captions \`${state.id}\` have ${String(pages)} pages mounted where the state shows page ${String(state.page)}.`,
        );
      }
      writes.push({ element, state, sceneTimeUs });
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
 * A scene transition (D56, D66) writes on the scene elements of its two sides
 * what their `transition` states say, and the state's `backdrop` is the
 * stage's background colour; both are removed when the state has none. A clip
 * transition (D66) puts its offset and zoom before the node's own transform,
 * and its cut and colour on the frame around the node.
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
      writeCaptions(node, null);
    }
    for (const frame of element.querySelectorAll<HTMLElement>(`[${CLIP_FRAME_ATTRIBUTE}]`)) {
      writeClipFrame(frame, undefined);
    }
  }
  for (const { element, state: node } of tree.nodes) {
    if (node.type === 'captions') writeCaptions(element, node);
    if (node.type !== 'background') {
      const moved = cssTransitionTransform(node.transition ?? {});
      const own = cssTransform(node);
      element.style.setProperty('transform', moved === '' ? own : `${moved} ${own}`);
      element.style.setProperty('opacity', cssNumber(node.opacity));
      const frame = element.parentElement;
      if (frame?.getAttribute(CLIP_FRAME_ATTRIBUTE) === node.id) {
        writeClipFrame(frame, node.transition);
      }
    }
    if (node.active) element.style.removeProperty('visibility');
    else element.style.setProperty('visibility', 'hidden');
  }
}

/**
 * Shows the page of a captions node that its state names and hides every other
 * one, and gives the word being spoken the highlight colour the mount wrote
 * on the box as a custom property, and every other
 * word none of its own (D57). `null`, or a state without a page, is the tree as
 * mounted: every page hidden, no word highlighted. Every page and word is
 * written on every call, so nothing depends on what an earlier call left.
 */
function writeCaptions(element: HTMLElement, state: CaptionsNodeState | null): void {
  for (const page of element.querySelectorAll<HTMLElement>(`[${CAPTION_PAGE_ATTRIBUTE}]`)) {
    const shown =
      state?.page != null && page.getAttribute(CAPTION_PAGE_ATTRIBUTE) === String(state.page);
    page.style.setProperty('display', shown ? 'flex' : 'none');
  }
  for (const word of element.querySelectorAll<HTMLElement>(`[${CAPTION_WORD_ATTRIBUTE}]`)) {
    const spoken =
      state?.word != null && word.getAttribute(CAPTION_WORD_ATTRIBUTE) === String(state.word);
    if (spoken) word.style.setProperty('color', `var(${HIGHLIGHT_PROPERTY})`);
    else {
      word.style.removeProperty('color');
      // A word without a declaration carries no style attribute, as the mount built it.
      if (word.style.length === 0) word.removeAttribute('style');
    }
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
  const moved = cssTransitionTransform(transition);
  if (moved !== '') element.style.setProperty('transform', moved);
  const clip = cssClipPath(transition);
  if (clip !== null) element.style.setProperty('clip-path', clip);
}

/** The cut of a transition as CSS `clip-path`, or `null` when it cuts nothing (D56, D66). */
function cssClipPath(cut: {
  readonly clip?: Inset;
  readonly circle?: Circle;
  readonly hole?: Hole;
}): string | null {
  if (cut.clip !== undefined) return cssInset(cut.clip);
  if (cut.circle !== undefined) return cssCircle(cut.circle);
  if (cut.hole !== undefined) return cssHole(cut.hole);
  return null;
}

/**
 * Writes what a clip transition does on the frame of a side (D66), and only
 * that: the part of the frame the side is cut to, and the colour under it.
 * Every other declaration is removed, so the frame of a side outside a
 * transition is the bare box the mount built, and one without a declaration
 * carries no style attribute but the mount's.
 */
function writeClipFrame(frame: HTMLElement, transition: ClipTransitionState | undefined): void {
  for (const property of FRAME_WRITTEN) frame.style.removeProperty(property);
  if (transition === undefined) return;
  const clip = cssClipPath(transition);
  if (clip !== null) frame.style.setProperty('clip-path', clip);
  if (transition.backdrop !== undefined) {
    frame.style.setProperty('background-color', cssColor(transition.backdrop));
  }
}
