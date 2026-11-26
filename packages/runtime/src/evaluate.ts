import {
  definitionTimeUs,
  frameCount,
  frameToTimeUs,
  hasCorners,
  instanceDefinition,
  scenesAt,
  sourceTimeUs,
  type CaptionsNode,
  type Composition,
  type CornerOffsets,
  type ImageNode,
  type InstanceNode,
  type NodeAnimation,
  type Scene,
  type SceneNode,
  type ShapeNode,
  type TextNode,
  type ValidatedComposition,
  type VideoNode,
} from '@kadrion/schema';

import { captionAt, captionFragments, captionPages } from './captions.js';
import { compositingAt } from './compositing.js';
import { effectsAt } from './effects.js';
import { EvaluationError, unsupported } from './errors.js';
import { textFragments } from './fragments.js';
import { cornersHomography } from './homography.js';
import { shapeAt } from './shapes.js';
import { measuredNodes, type FontMetrics } from './text-frame.js';
import {
  cropState,
  sampleColor,
  sampleCorners,
  sampleCrop,
  sampleScalar,
  sampleSize,
  sampleVec2,
} from './keyframes.js';
import {
  clipTransitionEffects,
  sceneTransitionEffects,
  type ClipSideEffect,
} from './transitions.js';
import type {
  CaptionsNodeState,
  ClipTransitionSide,
  CompositionState,
  GroupNodeState,
  ImageNodeState,
  InstanceNodeState,
  LeafNodeState,
  LeafNodeType,
  NodeState,
  PictureState,
  ShapeNodeState,
  Size,
  TextNodeState,
  TransformState,
  Vec2,
  VideoNodeState,
} from './state.js';

type TransformedNode = Exclude<SceneNode, { readonly type: 'background' }>;

/** The rows in `replace` mode each type of node takes (D65.1, D68). */
const REPLACED: Readonly<Record<SceneNode['type'], readonly NodeAnimation['property'][]>> = {
  background: ['color'],
  group: [],
  instance: [],
  'custom-html': [],
  text: ['color'],
  captions: ['color'],
  image: ['size', 'crop', 'cornerRadius'],
  video: ['size', 'crop', 'cornerRadius'],
  shape: ['size', 'fill', 'stroke/color', 'stroke/width', 'trim/start', 'trim/end', 'geometry'],
};

/**
 * Transforms modify their base value (D16.6): position, rotation, and origin
 * keyframes are offsets that are added, scale and opacity keyframes are
 * factors that are multiplied. The base value meets the sampled value in one
 * operation (D18); a property without an animation is its base value. The
 * other rows of D65.1 are read by `replacing`, where the type takes them.
 */
function evaluateTransform(
  node: TransformedNode,
  timeUs: number,
  box: Size | null,
): TransformState {
  let position: Vec2 = { x: node.position.x, y: node.position.y };
  let scale: Vec2 = { x: node.scale.x, y: node.scale.y };
  let rotation = node.rotation;
  let origin: Vec2 = { x: node.origin.x, y: node.origin.y };
  let opacity = node.opacity;
  // The base corners, and a node with a corners animation has corners at every instant (D91.1).
  let corners: CornerOffsets | null = hasCorners(node.corners) ? node.corners : null;

  // Validation guarantees at most one animation per property, in any order.
  for (const animation of node.animations) {
    switch (animation.property) {
      case 'position': {
        const offset = sampleVec2(animation, timeUs);
        position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
        break;
      }
      case 'scale': {
        const factor = sampleVec2(animation, timeUs);
        scale = { x: node.scale.x * factor.x, y: node.scale.y * factor.y };
        break;
      }
      case 'opacity':
        opacity = node.opacity * sampleScalar(animation, timeUs);
        break;
      case 'rotation':
        rotation = node.rotation + sampleScalar(animation, timeUs);
        break;
      case 'origin': {
        const offset = sampleVec2(animation, timeUs);
        origin = { x: node.origin.x + offset.x, y: node.origin.y + offset.y };
        break;
      }
      case 'corners': {
        // Mode offset: the base and the sample add, corner by corner (D65.1, D91.1).
        const offset = sampleCorners(animation, timeUs);
        const base = node.corners;
        const added = (key: keyof CornerOffsets): Vec2 => ({
          x: base[key].x + offset[key].x,
          y: base[key].y + offset[key].y,
        });
        corners = {
          topLeft: added('topLeft'),
          topRight: added('topRight'),
          bottomRight: added('bottomRight'),
          bottomLeft: added('bottomLeft'),
        };
        break;
      }
      case 'size':
      case 'color':
      case 'crop':
      case 'cornerRadius':
      case 'fill':
      case 'stroke/color':
      case 'stroke/width':
      case 'trim/start':
      case 'trim/end':
      case 'geometry':
        // Rows of `replace` mode, read where the node's type takes them (D65.1, D68).
        if (!REPLACED[node.type].includes(animation.property)) {
          unsupported(animation as never, 'property');
        }
        break;
      case 'volume':
        // The volume curve of a video's sound shapes no picture: the audio plan reads it (D85.2).
        if (node.type !== 'video') unsupported(animation as never, 'property');
        break;
      default:
        unsupported(animation, 'property');
    }
  }
  // `-0 + 0` is `0`: a rotation of -0 degrees is reported as 0. The flip is not
  // animated (D89.3).
  const flip = { x: node.flip.x, y: node.flip.y };
  const transform = { position, scale, rotation: rotation + 0, origin, flip, opacity };
  // With corners, the homography of the box onto their quadrilateral replaces the
  // transform; a box the runtime does not know (a text without a frame) has none,
  // which validation refuses (D91.1).
  if (corners === null || box === null) return transform;
  return { ...transform, homography: cornersHomography(box, transform, corners) };
}

/**
 * The box of a node in pixels at one instant (D91.1): the size of an image, a
 * video, or a shape; the width and height of captions, an instance, or Custom
 * HTML; the frame of a text, which has no box without one; and the canvas of
 * what holds a group.
 */
function boxOf(
  node: TransformedNode,
  size: Size | null,
  canvas: { readonly width: number; readonly height: number },
): Size | null {
  if (size !== null) return size;
  switch (node.type) {
    case 'text':
      return node.frame.kind === 'fixed'
        ? { width: node.frame.width, height: node.frame.height }
        : null;
    case 'group':
      return { width: canvas.width, height: canvas.height };
    case 'captions':
    case 'instance':
    case 'custom-html':
    case 'image':
    case 'video':
    case 'shape':
      return { width: node.width, height: node.height };
    default:
      return unsupported(node, 'type');
  }
}

/** The animation of a row in `replace` mode, when the node has one (D65.1, D68). */
function replacing<P extends 'size' | 'color' | 'crop' | 'cornerRadius'>(
  animations: readonly NodeAnimation[],
  property: P,
): Extract<NodeAnimation, { property: P }> | undefined {
  return animations.find(
    (animation): animation is Extract<NodeAnimation, { property: P }> =>
      animation.property === property,
  );
}

/** The colour of a node: its own, or what its animation replaces it with (D68). */
function colorOf(
  node: { readonly color: string; readonly animations: readonly NodeAnimation[] },
  timeUs: number,
): string {
  const animation = replacing(node.animations, 'color');
  return animation === undefined ? node.color : sampleColor(animation, timeUs);
}

/** The box and the picture of an image or a video (D68). */
function pictureOf(node: ImageNode | VideoNode, timeUs: number): PictureState {
  const size = replacing(node.animations, 'size');
  const crop = replacing(node.animations, 'crop');
  const radius = replacing(node.animations, 'cornerRadius');
  return {
    size:
      size === undefined ? { width: node.width, height: node.height } : sampleSize(size, timeUs),
    crop: crop === undefined ? cropState(node.crop) : sampleCrop(crop, timeUs),
    cornerRadius: radius === undefined ? node.cornerRadius : sampleScalar(radius, timeUs),
  };
}

/**
 * Whether the lifetime of a node contains `timeUs` (D42.2): the half-open
 * interval from `startUs`, `durationUs` long. The comparison subtracts and
 * never adds: `timeUs` and `startUs` are non-negative safe integers, so their
 * difference is exact, while `startUs + durationUs` may leave the safe range.
 */
function isActive(
  node: { readonly startUs: number; readonly durationUs: number },
  timeUs: number,
): boolean {
  return timeUs >= node.startUs && timeUs - node.startUs < node.durationUs;
}

/**
 * What clip transitions do to nodes at this instant (D56, D66), by node ID; a
 * node without an entry is evaluated as it would be without them.
 */
type Factors = ReadonlyMap<string, ClipSideEffect>;

/**
 * The transform of a node, with the factor of a clip transition in its opacity
 * and whatever else the transition does as its `transition` (D56, D66).
 */
function transformOf(
  node: TransformedNode,
  timeUs: number,
  factors: Factors,
  box: Size | null,
): TransformState & ClipTransitionSide {
  const transform = evaluateTransform(node, timeUs, box);
  const effect = factors.get(node.id);
  if (effect === undefined) return transform;
  return {
    ...transform,
    ...(effect.factor === undefined ? {} : { opacity: transform.opacity * effect.factor }),
    ...(effect.state === undefined ? {} : { transition: effect.state }),
  };
}

/** What every node is laid out in: the canvas of the scene or definition that holds it (D76). */
type Canvas = { readonly width: number; readonly height: number };

/** A canvas for the leaves, which never read it: their box is their own (D91.1). */
const NO_CANVAS: Canvas = { width: 1, height: 1 };

function evaluateLeaf<Type extends LeafNodeType>(
  node: TransformedNode & { readonly type: Type },
  timeUs: number,
  factors: Factors,
  size: Size | null = null,
): LeafNodeState<Type> {
  return {
    id: node.id,
    type: node.type,
    active: isActive(node, timeUs),
    ...transformOf(node, timeUs, factors, boxOf(node, size, NO_CANVAS)),
  };
}

/** An image leaf with its box and picture (D68). */
function evaluateImage(node: ImageNode, timeUs: number, factors: Factors): ImageNodeState {
  const picture = pictureOf(node, timeUs);
  return {
    ...evaluateLeaf(node, timeUs, factors, picture.size),
    ...picture,
    effects: effectsAt(node.effects, timeUs),
    ...compositingAt(node, timeUs),
  };
}

/** The metrics of the fonts of the document's measured nodes, by the ID of the font asset (D83.7). */
type Fonts = ReadonlyMap<string, FontMetrics>;

/** A text leaf with its colour (D68) and its fragments (D69), whose lines follow its frame (D83.5). */
function evaluateText(
  node: TextNode,
  timeUs: number,
  factors: Factors,
  fonts: Fonts,
): TextNodeState {
  const color = colorOf(node, timeUs);
  return {
    ...evaluateLeaf(node, timeUs, factors),
    color,
    fragments: textFragments(node, color, timeUs, fonts.get(node.fontAssetId)),
    effects: effectsAt(node.effects, timeUs),
    ...compositingAt(node, timeUs),
  };
}

/** A video leaf with its box and picture, and the source time it shows while active (D49.5, D50.3). */
function evaluateVideo(node: VideoNode, timeUs: number, factors: Factors): VideoNodeState {
  const picture = pictureOf(node, timeUs);
  const leaf = evaluateLeaf(node, timeUs, factors, picture.size);
  return {
    ...leaf,
    ...picture,
    sourceTimeUs: leaf.active ? sourceTimeUs(node, timeUs) : null,
    effects: effectsAt(node.effects, timeUs),
    ...compositingAt(node, timeUs),
  };
}

/**
 * A captions leaf with its colour, the page it shows, the word being spoken
 * while active, and the pieces of the page shown (D57, D68, D70); its pages
 * are broken by characters or by the width of its box (D83.5).
 */
function evaluateCaptions(
  node: CaptionsNode,
  timeUs: number,
  factors: Factors,
  fonts: Fonts,
): CaptionsNodeState {
  const leaf = {
    ...evaluateLeaf(node, timeUs, factors),
    color: colorOf({ color: node.style.color, animations: node.animations }, timeUs),
  };
  const pages = captionPages(node.words, node.style, node.width, fonts.get(node.fontAssetId));
  const instant = leaf.active ? captionAt(node.words, pages, timeUs) : { page: null, word: null };
  return {
    ...leaf,
    ...instant,
    fragments: captionFragments(node, pages, instant, leaf.color, timeUs),
    effects: effectsAt(node.effects, timeUs),
    ...compositingAt(node, timeUs),
  };
}

/** A shape leaf with its box, path, fill, stroke, and trim (D73). */
function evaluateShape(node: ShapeNode, timeUs: number, factors: Factors): ShapeNodeState {
  const shape = shapeAt(node, timeUs);
  return {
    ...evaluateLeaf(node, timeUs, factors, shape.size),
    ...shape,
    effects: effectsAt(node.effects, timeUs),
    ...compositingAt(node, timeUs),
  };
}

/** A child of a group: an image, a text, a video, or a shape. */
function evaluateChild(
  child: Extract<SceneNode, { readonly type: 'group' }>['children'][number],
  timeUs: number,
  factors: Factors,
  fonts: Fonts,
): GroupNodeState['children'][number] {
  switch (child.type) {
    case 'video':
      return evaluateVideo(child, timeUs, factors);
    case 'image':
      return evaluateImage(child, timeUs, factors);
    case 'text':
      return evaluateText(child, timeUs, factors, fonts);
    case 'shape':
      return evaluateShape(child, timeUs, factors);
    default:
      return unsupported(child, 'type');
  }
}

/** What the evaluation of nested compositions reads of the document: its definitions and its canvas (D76). */
type Definitions = Pick<Composition, 'definitions'>;

/**
 * The nodes of a scene or a definition at its own time `timeUs`, with what the
 * clip transitions among them do in the frame of its canvas (D56, D66, D76).
 */
function evaluateNodes(
  holder: Pick<Scene, 'nodes' | 'transitions'>,
  timeUs: number,
  canvas: { readonly width: number; readonly height: number },
  definitions: Definitions,
  fonts: Fonts,
): NodeState[] {
  const factors = clipTransitionEffects(holder, timeUs, canvas);
  return holder.nodes.map((node) =>
    evaluateNode(node, timeUs, factors, definitions, fonts, canvas),
  );
}

/**
 * An instance (D65.4, D76): its transform, effects, and compositing as a
 * group's, and the nodes of its definition evaluated at the definition time it
 * shows, every ID inside them the path of instance IDs to it (D76.3). An
 * inactive instance is evaluated at the nearest instant of its lifetime, so the
 * state still mirrors the document.
 */
function evaluateInstance(
  node: InstanceNode,
  timeUs: number,
  factors: Factors,
  definitions: Definitions,
  fonts: Fonts,
): InstanceNodeState {
  const definition = instanceDefinition(definitions, node);
  if (definition === null) {
    // Validation refuses an instance without its definition (D76).
    throw new EvaluationError(
      'invalid-document',
      `The instance "${node.id}" names no definition of the document.`,
    );
  }
  const definitionTime = definitionTimeUs(node, timeUs);
  return {
    id: node.id,
    type: node.type,
    active: isActive(node, timeUs),
    ...transformOf(node, timeUs, factors, boxOf(node, null, NO_CANVAS)),
    definitionId: node.definitionId,
    definitionTimeUs: definitionTime,
    nodes: evaluateNodes(definition, definitionTime, definition, definitions, fonts),
    effects: effectsAt(node.effects, timeUs),
    ...compositingAt(node, timeUs),
  };
}

/**
 * Children keep their local values: nothing of the group is folded into them
 * (D15), their `active` included (D42.3). An inactive node is evaluated like any
 * other, so the state still mirrors the document.
 */
function evaluateNode(
  node: SceneNode,
  timeUs: number,
  factors: Factors,
  definitions: Definitions,
  fonts: Fonts,
  canvas: Canvas,
): NodeState {
  switch (node.type) {
    case 'background':
      for (const animation of node.animations) {
        if (!REPLACED.background.includes(animation.property))
          unsupported(animation as never, 'property');
      }
      return {
        id: node.id,
        type: node.type,
        active: isActive(node, timeUs),
        color: colorOf(node, timeUs),
      };
    case 'group':
      return {
        id: node.id,
        type: node.type,
        active: isActive(node, timeUs),
        ...transformOf(node, timeUs, factors, boxOf(node, null, canvas)),
        children: node.children.map((child) => evaluateChild(child, timeUs, factors, fonts)),
        effects: effectsAt(node.effects, timeUs),
        ...compositingAt(node, timeUs),
      };
    case 'image':
      return evaluateImage(node, timeUs, factors);
    case 'text':
      return evaluateText(node, timeUs, factors, fonts);
    case 'custom-html':
      return evaluateLeaf(node, timeUs, factors);
    case 'video':
      return evaluateVideo(node, timeUs, factors);
    case 'captions':
      return evaluateCaptions(node, timeUs, factors, fonts);
    case 'shape':
      return evaluateShape(node, timeUs, factors);
    case 'instance':
      return evaluateInstance(node, timeUs, factors, definitions, fonts);
    default:
      return unsupported(node, 'type');
  }
}

/**
 * The state of a composition at `timeUs`, derived from `(composition, timeUs)`
 * and the bytes of the composition's fonts, which the composition pins by
 * `contentHash` (D14, D83.7), and nothing else: no clock, no timer, no playback
 * history, no cache (D18, D19). The document is never modified, and the state
 * shares no object with it.
 *
 * `fonts` maps the ID of a font asset to its metrics, read from its bytes by
 * `fontMetrics`. It is needed exactly when the document holds a measured node
 * — a text with a frame, or captions broken by width — and only for the fonts
 * those nodes use (`measuredFontIds`); a measured node whose font is not in it
 * throws the `EvaluationError` `font-metrics-missing`, whatever the time. A
 * document without a measured node evaluates the same with or without it.
 *
 * `scenes` lists the scenes evaluated at `timeUs` — one, or the two sides of a
 * scene transition — each at its local time, `timeUs` minus its start; every
 * node of a scene is evaluated at that scene time (D49.3, D54.3). A scene is
 * therefore evaluated alone exactly as it is in the sequence, except for what a
 * transition adds: its `transition` state, the factors of clip transitions in
 * the opacities of its nodes and their own `transition` states, and the
 * composition's `backdrop` (D56, D66).
 *
 * `timeUs` is an integer with `0 <= timeUs < durationUs`; it need not lie on the
 * frame grid, which is host-side sampling (D13). Any other value throws an
 * `EvaluationError` instead of being clamped or rounded.
 */
export function evaluateComposition(
  composition: ValidatedComposition,
  timeUs: number,
  fonts: ReadonlyMap<string, FontMetrics> = new Map(),
): CompositionState {
  if (!Number.isInteger(timeUs)) {
    const message = `timeUs must be an integer number of microseconds, got ${String(timeUs)}.`;
    throw new EvaluationError('time-not-integer', message);
  }
  if (timeUs < 0 || timeUs >= composition.durationUs) {
    const range = `at least 0 and less than durationUs (${String(composition.durationUs)})`;
    throw new EvaluationError(
      'time-out-of-range',
      `timeUs must be ${range}, got ${String(timeUs)}.`,
    );
  }

  for (const { nodeId, fontAssetId } of measuredNodes(composition)) {
    if (!fonts.has(fontAssetId)) {
      throw new EvaluationError(
        'font-metrics-missing',
        `The node "${nodeId}" is measured, and its font "${fontAssetId}" has no metrics among the fonts passed (D83.7).`,
      );
    }
  }

  // `-0` is an integer inside the domain; the state reports it as `0`.
  const time = timeUs === 0 ? 0 : timeUs;
  const transition = sceneTransitionEffects(composition, time);
  const scenes = scenesAt(composition, time).map(({ placement, timeUs: sceneTimeUs }) => {
    const scene = composition.scenes[placement.index];
    const effect =
      transition === null
        ? null
        : placement.index === transition.fromIndex
          ? transition.outgoing
          : placement.index === transition.fromIndex + 1
            ? transition.incoming
            : null;
    return {
      id: placement.id,
      timeUs: sceneTimeUs,
      nodes:
        scene === undefined
          ? []
          : evaluateNodes(scene, sceneTimeUs, composition, composition, fonts),
      effects: effectsAt(scene?.effects ?? [], sceneTimeUs),
      ...(effect === null ? {} : { transition: effect }),
    };
  });
  return {
    timeUs: time,
    scenes,
    ...(transition?.backdrop == null ? {} : { backdrop: transition.backdrop }),
  };
}

/**
 * The first instant at which the animated corners of a node do not form a
 * convex quadrilateral with a non-zero area (D91.1): the node draws nothing
 * then. A node of a scene at a time of the composition's frame grid, with its
 * scene time; a node of a definition at a time of the definition's own grid.
 */
export interface CornersWarning {
  readonly code: 'corners-not-convex';
  readonly nodeId: string;
  /** The scene or the definition that holds the node. */
  readonly holderId: string;
  /** Composition time for a node of a scene, definition time for a node of a definition. */
  readonly timeUs: number;
  readonly message: string;
}

/** The nodes of a holder that animate their corners, a group's children included (D91.1). */
function animatedCornerNodes(nodes: readonly SceneNode[]): TransformedNode[] {
  const found: TransformedNode[] = [];
  const visit = (node: SceneNode): void => {
    if (node.type === 'background') return;
    if (node.animations.some((animation) => animation.property === 'corners')) found.push(node);
    if (node.type === 'group') node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return found;
}

/** Whether a node draws nothing at its own time `timeUs` because of its corners (D91.1). */
function cornersFail(node: TransformedNode, timeUs: number, canvas: Canvas): boolean {
  const size =
    node.type === 'image' || node.type === 'video'
      ? pictureOf(node, timeUs).size
      : node.type === 'shape'
        ? shapeAt(node, timeUs).size
        : null;
  return evaluateTransform(node, timeUs, boxOf(node, size, canvas)).homography === null;
}

/**
 * Every node whose animated corners turn concave, self-intersecting, or
 * degenerate on the frame grid, with the first such instant (D91.1): what
 * `kadrion inspect` lists as a warning. Only the active instants of a node of
 * a scene count; a node of a definition is checked over the definition's
 * time. Pure: derived from the document alone.
 */
export function cornersWarnings(composition: ValidatedComposition): CornersWarning[] {
  const warnings: CornersWarning[] = [];
  const warned = new Set<string>();
  const warn = (node: TransformedNode, holderId: string, timeUs: number, local: string): void => {
    warned.add(node.id);
    warnings.push({
      code: 'corners-not-convex',
      nodeId: node.id,
      holderId,
      timeUs,
      message: `The corners of "${node.id}" do not form a convex quadrilateral at ${local}: it draws nothing then (D91.1).`,
    });
  };
  const frames = frameCount(composition.durationUs, composition.fps);
  for (let frame = 0; frame < frames; frame += 1) {
    const timeUs = frameToTimeUs(frame, composition.fps);
    for (const { placement, timeUs: sceneTimeUs } of scenesAt(composition, timeUs)) {
      const scene = composition.scenes[placement.index];
      if (scene === undefined) continue;
      for (const node of animatedCornerNodes(scene.nodes)) {
        if (warned.has(node.id) || !isActive(node, sceneTimeUs)) continue;
        if (cornersFail(node, sceneTimeUs, composition)) {
          warn(
            node,
            scene.id,
            timeUs,
            `${String(timeUs)} µs (scene time ${String(sceneTimeUs)} µs)`,
          );
        }
      }
    }
  }
  for (const definition of composition.definitions) {
    const nodes = animatedCornerNodes(definition.nodes);
    const count = frameCount(definition.durationUs, composition.fps);
    for (let frame = 0; frame < count && nodes.length > 0; frame += 1) {
      const timeUs = frameToTimeUs(frame, composition.fps);
      for (const node of nodes) {
        if (warned.has(node.id) || !isActive(node, timeUs)) continue;
        if (cornersFail(node, timeUs, definition)) {
          warn(node, definition.id, timeUs, `definition time ${String(timeUs)} µs`);
        }
      }
    }
  }
  return warnings;
}
