/**
 * Writes an evaluated state into a mounted tree (D22.2, D22.4). The tree is
 * found again through its addressing attributes; nothing is remembered between
 * calls, so the result depends on the mounted document and the state only.
 */
import type {
  CaptionsNodeState,
  EffectState,
  SvgEffectState,
  FragmentState,
  Circle,
  ClipTransitionState,
  CompositionState,
  Hole,
  Inset,
  MaskState,
  NodeState,
  SceneState,
  ShapeNodeState,
  TextNodeState,
} from '@kadrion/runtime';

import {
  cssCircle,
  cssColor,
  cssFilter,
  filterId,
  cssFragmentTransform,
  cssHole,
  cssInset,
  cssNumber,
  cssPixels,
  cssTransform,
  cssTransitionTransform,
  cssViewBox,
} from './css.js';
import { RenderError, unsupportedNode } from './errors.js';
import {
  CAPTION_LINE_ATTRIBUTE,
  CAPTION_PAGE_ATTRIBUTE,
  CAPTION_UNDERLINE_ATTRIBUTE,
  CAPTION_WORD_ATTRIBUTE,
  CAPTION_WORD_BOX_ATTRIBUTE,
  CLIP_FRAME_ATTRIBUTE,
  FRAGMENT_ATTRIBUTE,
  HIGHLIGHT_PROPERTY,
  INSTANCE_CONTENT_ATTRIBUTE,
  NODE_ATTRIBUTE,
  SCENE_ATTRIBUTE,
  STAGE_ATTRIBUTE,
} from './mount.js';
import {
  maskId,
  MASKS_ATTRIBUTE,
  MATTE_ATTRIBUTE,
  MATTE_FRAME_ATTRIBUTE,
  matteId,
  writeMasks,
} from './masks.js';
import { clearShape, writeShape } from './shapes.js';
import { EFFECTS_ATTRIBUTE, isSvgEffectState, writeEffectFilters } from './svg-filters.js';

/** A node of the state together with the element that was mounted for it. */
export interface MountedNode {
  readonly element: HTMLElement;
  readonly state: NodeState;
  /** The time of the node's scene, at which the state was evaluated (D49.3, D54.3). */
  readonly sceneTimeUs: number;
}

/**
 * The declarations `renderState` writes on a node; the mount writes none of
 * them. Besides the transform, the opacity, and the visibility, the colour of a
 * background, a text, and captions, which an animation can reach (D68), and
 * the filter of a node with effects or a blurring transition (D71).
 */
const WRITTEN = [
  'transform',
  'opacity',
  'visibility',
  'background-color',
  'color',
  'filter',
] as const;

/**
 * The declarations `renderState` writes on the picture of an image or a video,
 * an `img` element, besides `WRITTEN` (D68). On a background and on Custom HTML
 * the mount writes a width and a height of its own, which stay.
 */
const PICTURE_WRITTEN = ['width', 'height', 'object-view-box', 'border-radius'] as const;

/** The declarations `renderState` writes on a fragment of a text (D69); the mount writes none of them. */
const FRAGMENT_WRITTEN = ['opacity', 'transform', 'color'] as const;

/** The units of fragments, with the list of each in the state of a text (D69). */
const FRAGMENT_UNITS = [
  ['line', 'lines'],
  ['word', 'words'],
  ['letter', 'letters'],
] as const;

/**
 * The declarations of a scene transition and of the scene's effects on a scene
 * element (D56, D71); the mount writes none of them.
 */
const TRANSITION_WRITTEN = ['opacity', 'transform', 'clip-path', 'filter'] as const;

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
function unframed(outer: Element): Element {
  // The frame of a matte holds the node, or the frame of its clip transition (D75).
  const matteOf = outer.getAttribute(MATTE_FRAME_ATTRIBUTE);
  let child = outer;
  if (matteOf !== null) {
    const inner = outer.firstElementChild;
    if (outer.childElementCount !== 1 || inner === null || outer.hasAttribute(NODE_ATTRIBUTE)) {
      mismatch(`The frame of the matte of "${matteOf}" does not hold its node alone.`);
    }
    child = inner;
  }
  const frameOf = child.getAttribute(CLIP_FRAME_ATTRIBUTE);
  if (frameOf === null) return matched(child, matteOf);
  const node = child.firstElementChild;
  if (
    child.childElementCount !== 1 ||
    node === null ||
    child.hasAttribute(NODE_ATTRIBUTE) ||
    node.getAttribute(NODE_ATTRIBUTE) !== frameOf
  ) {
    mismatch(`The frame of the clip transition of "${frameOf}" does not hold its node alone.`);
  }
  return matched(node, matteOf);
}

/** A node element inside the frame of a matte must be the frame's own node (D75). */
function matched(node: Element, matteOf: string | null): Element {
  if (matteOf !== null && node.getAttribute(NODE_ATTRIBUTE) !== matteOf) {
    mismatch(`The frame of the matte of "${matteOf}" does not hold its node alone.`);
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
      // Its pieces must be those the mount built (D70): none for a node drawn as
      // D57 draws it, and the lines and words of the page shown otherwise.
      const pieces = element.querySelector(`[${CAPTION_LINE_ATTRIBUTE}]`) !== null;
      const shown = shownPage(element, state.page);
      const lines = shown === null ? 0 : piecesOf(shown, CAPTION_LINE_ATTRIBUTE).length;
      const words = shown === null ? 0 : piecesOf(shown, CAPTION_WORD_ATTRIBUTE).length;
      const fragments = state.fragments;
      if (
        (fragments === null && pieces) ||
        (fragments !== null &&
          (fragments.lines.length !== lines || fragments.words.length !== words))
      ) {
        mismatch(
          `The captions \`${state.id}\` have ${String(lines)} lines and ${String(words)} words in pieces mounted on the page shown where the state has ${fragments === null ? 'none' : `${String(fragments.lines.length)} and ${String(fragments.words.length)}`}.`,
        );
      }
      writes.push({ element, state, sceneTimeUs });
      return;
    }
    case 'text':
      // The fragments of every unit must be those the mount built (D69).
      for (const [unit, list] of FRAGMENT_UNITS) {
        const mounted = fragmentsOf(element, unit).length;
        const evaluated = state.fragments?.[list].length ?? 0;
        if (mounted !== evaluated) {
          mismatch(
            `The text \`${state.id}\` has ${String(mounted)} fragments of the unit ${unit} mounted where the state has ${String(evaluated)}.`,
          );
        }
      }
      writes.push({ element, state, sceneTimeUs });
      return;
    case 'image':
    case 'custom-html':
    case 'video':
    case 'shape':
      writes.push({ element, state, sceneTimeUs });
      return;
    case 'instance': {
      // The box holds the canvas of its definition alone, and the canvas its nodes (D76).
      const content = element.firstElementChild;
      if (
        element.childElementCount !== 1 ||
        content?.getAttribute(INSTANCE_CONTENT_ATTRIBUTE) !== state.definitionId
      ) {
        mismatch(
          `The instance \`${state.id}\` does not hold the canvas of definition "${state.definitionId}" alone.`,
        );
      }
      writes.push({ element, state, sceneTimeUs });
      const ids = state.nodes.map((node) => node.id);
      matchChildren(content, NODE_ATTRIBUTE, ids).forEach((child, index) => {
        const nodeState = state.nodes[index];
        if (nodeState !== undefined) plan(child, nodeState, state.definitionTimeUs, writes);
      });
      return;
    }
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
  // The filters of SVG effects follow the scenes (D72).
  const elements = [...stage.children].filter(
    (child) => !child.hasAttribute(EFFECTS_ATTRIBUTE) && !child.hasAttribute(MASKS_ATTRIBUTE),
  );
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
  const filters = tree.stage.querySelector(`:scope > [${EFFECTS_ATTRIBUTE}]`);
  if (filters !== null) writeEffectFilters(filters, svgEffectsOf(state));
  const masks = tree.stage.querySelector(`:scope > [${MASKS_ATTRIBUTE}]`);
  if (masks !== null) writeMasks(masks, maskWritesOf(state));
  if (state.backdrop === undefined) tree.stage.style.removeProperty('background-color');
  else tree.stage.style.setProperty('background-color', cssColor(state.backdrop));
  for (const { element, state: scene } of tree.scenes) {
    writeSceneTransition(element, scene?.transition);
    if (scene !== null) {
      const filter = cssFilter(scene.effects, scene.transition?.blur);
      if (filter !== null) element.style.setProperty('filter', filter);
      element.style.removeProperty('visibility');
      continue;
    }
    element.style.setProperty('visibility', 'hidden');
    // Back to what the mount wrote, so the tree never keeps an earlier instant.
    for (const node of element.querySelectorAll<HTMLElement>(`[${NODE_ATTRIBUTE}]`)) {
      for (const property of WRITTEN) node.style.removeProperty(property);
      if (node.tagName === 'IMG') {
        for (const property of PICTURE_WRITTEN) node.style.removeProperty(property);
      }
      writeCaptions(node, null);
      clearShape(node);
    }
    for (const fragment of element.querySelectorAll<HTMLElement>(`[${FRAGMENT_ATTRIBUTE}]`)) {
      for (const property of FRAGMENT_WRITTEN) fragment.style.removeProperty(property);
    }
    for (const frame of element.querySelectorAll<HTMLElement>(`[${CLIP_FRAME_ATTRIBUTE}]`)) {
      writeClipFrame(frame, undefined);
    }
  }
  for (const { element, state: node } of tree.nodes) {
    if (node.type === 'captions') writeCaptions(element, node);
    if (node.type === 'text') writeFragments(element, node);
    if (node.type === 'shape') writeShape(element, node);
    writeProperties(element, node);
    if (node.type !== 'background') {
      const moved = cssTransitionTransform(node.transition ?? {});
      const own = cssTransform(node);
      element.style.setProperty('transform', moved === '' ? own : `${moved} ${own}`);
      element.style.setProperty('opacity', cssNumber(node.opacity));
      const filter = cssFilter('effects' in node ? node.effects : [], node.transition?.blur);
      if (filter === null) element.style.removeProperty('filter');
      else element.style.setProperty('filter', filter);
      const frame = element.parentElement;
      if (frame?.getAttribute(CLIP_FRAME_ATTRIBUTE) === node.id) {
        writeClipFrame(frame, node.transition);
      }
    }
    // A matte is drawn into the mask of the node it mattes only (D75).
    if (node.active && !element.hasAttribute(MATTE_ATTRIBUTE)) {
      element.style.removeProperty('visibility');
    } else element.style.setProperty('visibility', 'hidden');
  }
}

/**
 * What the masks hold at this instant (D75): the own mask of every evaluated
 * node that has one, and, for every evaluated node with a matte, the state of
 * that sibling shape.
 */
function maskWritesOf(state: CompositionState): Map<string, MaskState | ShapeNodeState> {
  const writes = new Map<string, MaskState | ShapeNodeState>();
  const collect = (siblings: readonly NodeState[]): void => {
    for (const node of siblings) {
      if (!('mask' in node)) continue;
      if (node.mask.kind !== 'none') writes.set(maskId(node.id), node.mask);
      const { matte } = node;
      if (matte.kind !== 'node') continue;
      const target = siblings.find((sibling) => sibling.id === matte.nodeId);
      if (target?.type === 'shape') writes.set(matteId(node.id), target);
    }
  };
  for (const scene of state.scenes)
    for (const siblings of siblingsOf(scene.nodes)) collect(siblings);
  return writes;
}

/**
 * The lists of siblings of the state of a scene: its nodes, the children of
 * each group, and the nodes of each instance, at any depth (D76).
 */
function siblingsOf(nodes: readonly NodeState[]): (readonly NodeState[])[] {
  const lists: (readonly NodeState[])[] = [nodes];
  for (const node of nodes) {
    if (node.type === 'group') lists.push(node.children);
    if (node.type === 'instance') lists.push(...siblingsOf(node.nodes));
  }
  return lists;
}

/** The effects drawn by SVG filters of every evaluated scene and node, by the ID of their filter (D72). */
function svgEffectsOf(state: CompositionState): Map<string, SvgEffectState> {
  const effects = new Map<string, SvgEffectState>();
  const collect = (list: readonly EffectState[]): void => {
    for (const effect of list)
      if (isSvgEffectState(effect)) effects.set(filterId(effect.id), effect);
  };
  for (const scene of state.scenes) {
    collect(scene.effects);
    for (const siblings of siblingsOf(scene.nodes)) {
      for (const node of siblings) if ('effects' in node) collect(node.effects);
    }
  }
  return effects;
}

/**
 * Writes the properties of D68 that a node has, animated or not: its colour,
 * or its size, crop, and corner radius. The crop is the `object-view-box` of
 * the picture, so it applies before `object-fit` and `object-position`; the
 * corner radius clips the box (D65.6).
 */
function writeProperties(element: HTMLElement, node: NodeState): void {
  switch (node.type) {
    case 'background':
      element.style.setProperty('background-color', cssColor(node.color));
      return;
    case 'text':
    case 'captions':
      element.style.setProperty('color', cssColor(node.color));
      return;
    case 'image':
    case 'video':
      element.style.setProperty('width', cssPixels(node.size.width));
      element.style.setProperty('height', cssPixels(node.size.height));
      element.style.setProperty('object-view-box', cssViewBox(node.crop));
      element.style.setProperty('border-radius', cssPixels(node.cornerRadius));
      return;
    default:
      return;
  }
}

/** The fragments of one unit of a text's element, in the order of the text (D69). */
function fragmentsOf(element: HTMLElement, unit: string): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(`[${FRAGMENT_ATTRIBUTE}="${unit}"]`)];
}

/**
 * Writes the opacity, the transform, and the colour of every fragment of a
 * text (D69), at rest too, so that nothing depends on what an earlier call
 * left. `plan` has checked that the mount built exactly these fragments.
 */
function writeFragments(element: HTMLElement, node: TextNodeState): void {
  if (node.fragments === null) return;
  for (const [unit, list] of FRAGMENT_UNITS) {
    const states = node.fragments[list];
    fragmentsOf(element, unit).forEach((fragment, index) => {
      const state = states[index];
      if (state === undefined) return;
      fragment.style.setProperty('opacity', cssNumber(state.opacity));
      fragment.style.setProperty('transform', cssFragmentTransform(state));
      fragment.style.setProperty('color', cssColor(state.color));
    });
  }
}

/** The element of the page of a captions node that a state shows, or `null`. */
function shownPage(element: HTMLElement, page: number | null): HTMLElement | null {
  if (page === null) return null;
  return element.querySelector<HTMLElement>(`[${CAPTION_PAGE_ATTRIBUTE}="${String(page)}"]`);
}

/** The pieces of one kind inside an element, in the order of the page (D70). */
function piecesOf(element: HTMLElement, attribute: string): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(`[${attribute}]`)];
}

/** The declarations `renderState` writes on a line or a word of captions in pieces (D70). */
const PIECE_WRITTEN = ['opacity', 'transform', 'color'] as const;

/**
 * Shows the page of a captions node that its state names and hides every other
 * one (D57). A node drawn as D57 draws it gives the word being spoken the
 * highlight colour the mount wrote on the box as a custom property, and every
 * other word none of its own. A node drawn in pieces (D70) gets the opacity,
 * the transform, and the colour of every line and word of the page shown from
 * its state, at rest too, and the box and the underline of the highlight shown
 * on the word being spoken alone; the lines and words of every other page lose
 * what an earlier call wrote. `null`, or a state without a page, is the tree as
 * mounted: every page hidden, no word highlighted. Every page and word is
 * written on every call, so nothing depends on what an earlier call left.
 */
function writeCaptions(element: HTMLElement, state: CaptionsNodeState | null): void {
  for (const page of element.querySelectorAll<HTMLElement>(`[${CAPTION_PAGE_ATTRIBUTE}]`)) {
    const shown =
      state?.page != null && page.getAttribute(CAPTION_PAGE_ATTRIBUTE) === String(state.page);
    page.style.setProperty('display', shown ? 'flex' : 'none');
  }
  const fragments = state?.fragments ?? null;
  const shown = fragments === null ? null : shownPage(element, state?.page ?? null);
  const written = new Map<HTMLElement, FragmentState>();
  if (fragments !== null && shown !== null) {
    piecesOf(shown, CAPTION_LINE_ATTRIBUTE).forEach((line, index) => {
      const value = fragments.lines[index];
      if (value !== undefined) written.set(line, value);
    });
    piecesOf(shown, CAPTION_WORD_ATTRIBUTE).forEach((word, index) => {
      const value = fragments.words[index];
      if (value !== undefined) written.set(word, value);
    });
  }
  for (const line of piecesOf(element, CAPTION_LINE_ATTRIBUTE)) {
    const value = written.get(line);
    if (value === undefined) {
      for (const property of PIECE_WRITTEN) line.style.removeProperty(property);
      continue;
    }
    line.style.setProperty('opacity', cssNumber(value.opacity));
    line.style.setProperty('transform', cssFragmentTransform(value));
  }
  for (const word of piecesOf(element, CAPTION_WORD_ATTRIBUTE)) {
    const spoken =
      state?.word != null && word.getAttribute(CAPTION_WORD_ATTRIBUTE) === String(state.word);
    for (const piece of word.children) {
      if (
        piece.hasAttribute(CAPTION_WORD_BOX_ATTRIBUTE) ||
        piece.hasAttribute(CAPTION_UNDERLINE_ATTRIBUTE)
      ) {
        (piece as HTMLElement).style.setProperty('display', spoken ? 'block' : 'none');
      }
    }
    const value = written.get(word);
    if (value !== undefined) {
      word.style.setProperty('opacity', cssNumber(value.opacity));
      word.style.setProperty('transform', cssFragmentTransform(value));
      word.style.setProperty('color', cssColor(value.color));
      continue;
    }
    for (const property of PIECE_WRITTEN) word.style.removeProperty(property);
    if (spoken && fragments === null) word.style.setProperty('color', `var(${HIGHLIGHT_PROPERTY})`);
    // A word without a declaration carries no style attribute, as the mount built it.
    if (word.style.length === 0) word.removeAttribute('style');
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
