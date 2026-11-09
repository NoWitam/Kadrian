import {
  scenesAt,
  sourceTimeUs,
  type CaptionsNode,
  type ImageNode,
  type NodeAnimation,
  type SceneNode,
  type ShapeNode,
  type TextNode,
  type ValidatedComposition,
  type VideoNode,
} from '@kadrion/schema';

import { captionAt, captionFragments, captionPages } from './captions.js';
import { effectsAt } from './effects.js';
import { EvaluationError, unsupported } from './errors.js';
import { textFragments } from './fragments.js';
import { shapeAt } from './shapes.js';
import {
  cropState,
  sampleColor,
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
  LeafNodeState,
  LeafNodeType,
  NodeState,
  PictureState,
  ShapeNodeState,
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
function evaluateTransform(node: TransformedNode, timeUs: number): TransformState {
  let position: Vec2 = { x: node.position.x, y: node.position.y };
  let scale: Vec2 = { x: node.scale.x, y: node.scale.y };
  let rotation = node.rotation;
  let origin: Vec2 = { x: node.origin.x, y: node.origin.y };
  let opacity = node.opacity;

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
      default:
        unsupported(animation, 'property');
    }
  }
  // `-0 + 0` is `0`: a rotation of -0 degrees is reported as 0.
  return { position, scale, rotation: rotation + 0, origin, opacity };
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
): TransformState & ClipTransitionSide {
  const transform = evaluateTransform(node, timeUs);
  const effect = factors.get(node.id);
  if (effect === undefined) return transform;
  return {
    ...transform,
    ...(effect.factor === undefined ? {} : { opacity: transform.opacity * effect.factor }),
    ...(effect.state === undefined ? {} : { transition: effect.state }),
  };
}

function evaluateLeaf<Type extends LeafNodeType>(
  node: TransformedNode & { readonly type: Type },
  timeUs: number,
  factors: Factors,
): LeafNodeState<Type> {
  return {
    id: node.id,
    type: node.type,
    active: isActive(node, timeUs),
    ...transformOf(node, timeUs, factors),
  };
}

/** An image leaf with its box and picture (D68). */
function evaluateImage(node: ImageNode, timeUs: number, factors: Factors): ImageNodeState {
  return {
    ...evaluateLeaf(node, timeUs, factors),
    ...pictureOf(node, timeUs),
    effects: effectsAt(node.effects, timeUs),
  };
}

/** A text leaf with its colour (D68) and its fragments (D69). */
function evaluateText(node: TextNode, timeUs: number, factors: Factors): TextNodeState {
  const color = colorOf(node, timeUs);
  return {
    ...evaluateLeaf(node, timeUs, factors),
    color,
    fragments: textFragments(node, color, timeUs),
    effects: effectsAt(node.effects, timeUs),
  };
}

/** A video leaf with its box and picture, and the source time it shows while active (D49.5, D50.3). */
function evaluateVideo(node: VideoNode, timeUs: number, factors: Factors): VideoNodeState {
  const leaf = evaluateLeaf(node, timeUs, factors);
  return {
    ...leaf,
    ...pictureOf(node, timeUs),
    sourceTimeUs: leaf.active ? sourceTimeUs(node, timeUs) : null,
    effects: effectsAt(node.effects, timeUs),
  };
}

/**
 * A captions leaf with its colour, the page it shows, the word being spoken
 * while active, and the pieces of the page shown (D57, D68, D70).
 */
function evaluateCaptions(node: CaptionsNode, timeUs: number, factors: Factors): CaptionsNodeState {
  const leaf = {
    ...evaluateLeaf(node, timeUs, factors),
    color: colorOf({ color: node.style.color, animations: node.animations }, timeUs),
  };
  const pages = captionPages(node.words, node.style);
  const instant = leaf.active ? captionAt(node.words, pages, timeUs) : { page: null, word: null };
  return {
    ...leaf,
    ...instant,
    fragments: captionFragments(node, pages, instant, leaf.color, timeUs),
    effects: effectsAt(node.effects, timeUs),
  };
}

/** A shape leaf with its box, path, fill, stroke, and trim (D73). */
function evaluateShape(node: ShapeNode, timeUs: number, factors: Factors): ShapeNodeState {
  return {
    ...evaluateLeaf(node, timeUs, factors),
    ...shapeAt(node, timeUs),
    effects: effectsAt(node.effects, timeUs),
  };
}

/** A child of a group: an image, a text, a video, or a shape. */
function evaluateChild(
  child: Extract<SceneNode, { readonly type: 'group' }>['children'][number],
  timeUs: number,
  factors: Factors,
): GroupNodeState['children'][number] {
  switch (child.type) {
    case 'video':
      return evaluateVideo(child, timeUs, factors);
    case 'image':
      return evaluateImage(child, timeUs, factors);
    case 'text':
      return evaluateText(child, timeUs, factors);
    case 'shape':
      return evaluateShape(child, timeUs, factors);
    default:
      return unsupported(child, 'type');
  }
}

/**
 * Children keep their local values: nothing of the group is folded into them
 * (D15), their `active` included (D42.3). An inactive node is evaluated like any
 * other, so the state still mirrors the document.
 */
function evaluateNode(node: SceneNode, timeUs: number, factors: Factors): NodeState {
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
        ...transformOf(node, timeUs, factors),
        children: node.children.map((child) => evaluateChild(child, timeUs, factors)),
        effects: effectsAt(node.effects, timeUs),
      };
    case 'image':
      return evaluateImage(node, timeUs, factors);
    case 'text':
      return evaluateText(node, timeUs, factors);
    case 'custom-html':
      return evaluateLeaf(node, timeUs, factors);
    case 'video':
      return evaluateVideo(node, timeUs, factors);
    case 'captions':
      return evaluateCaptions(node, timeUs, factors);
    case 'shape':
      return evaluateShape(node, timeUs, factors);
    default:
      return unsupported(node, 'type');
  }
}

/**
 * The state of a composition at `timeUs`, derived from `(composition, timeUs)`
 * and nothing else: no clock, no timer, no playback history, no cache (D18,
 * D19). The document is never modified, and the state shares no object with it.
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

  // `-0` is an integer inside the domain; the state reports it as `0`.
  const time = timeUs === 0 ? 0 : timeUs;
  const transition = sceneTransitionEffects(composition, time);
  const scenes = scenesAt(composition, time).map(({ placement, timeUs: sceneTimeUs }) => {
    const scene = composition.scenes[placement.index];
    const factors =
      scene === undefined
        ? new Map<string, ClipSideEffect>()
        : clipTransitionEffects(scene, sceneTimeUs, composition);
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
      nodes: (scene?.nodes ?? []).map((node) => evaluateNode(node, sceneTimeUs, factors)),
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
