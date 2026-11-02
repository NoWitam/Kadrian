import {
  scenesAt,
  sourceTimeUs,
  type SceneNode,
  type ValidatedComposition,
  type VideoNode,
} from '@kadrion/schema';

import { EvaluationError, unsupported } from './errors.js';
import { sampleScalar, sampleVec2 } from './keyframes.js';
import { clipTransitionFactors, sceneTransitionEffects } from './transitions.js';
import type {
  CompositionState,
  GroupNodeState,
  LeafNodeState,
  LeafNodeType,
  NodeState,
  TransformState,
  Vec2,
  VideoNodeState,
} from './state.js';

type TransformedNode = Exclude<SceneNode, { readonly type: 'background' }>;

/**
 * An animation modifies the base value and never replaces it (D16.6): position
 * keyframes are offsets that are added, scale and opacity keyframes are factors
 * that are multiplied. The base value meets the sampled value in one operation
 * (D18); a property without an animation is its base value.
 */
function evaluateTransform(node: TransformedNode, timeUs: number): TransformState {
  let position: Vec2 = { x: node.position.x, y: node.position.y };
  let scale: Vec2 = { x: node.scale.x, y: node.scale.y };
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
      default:
        unsupported(animation, 'property');
    }
  }
  return { position, scale, opacity };
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
 * The factors clip transitions multiply into opacities at this instant (D56), by
 * node ID; a node without one is evaluated as it would be without them.
 */
type Factors = ReadonlyMap<string, number>;

/** The transform of a node, with the factor of a clip transition in its opacity (D56). */
function transformOf(node: TransformedNode, timeUs: number, factors: Factors): TransformState {
  const transform = evaluateTransform(node, timeUs);
  const factor = factors.get(node.id);
  return factor === undefined ? transform : { ...transform, opacity: transform.opacity * factor };
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

/** A video leaf with the source time it shows while active (D49.5, D50.3). */
function evaluateVideo(node: VideoNode, timeUs: number, factors: Factors): VideoNodeState {
  const leaf = evaluateLeaf(node, timeUs, factors);
  return { ...leaf, sourceTimeUs: leaf.active ? sourceTimeUs(node, timeUs) : null };
}

/** A child of a group: an image, a text, or a video. */
function evaluateChild(
  child: Extract<SceneNode, { readonly type: 'group' }>['children'][number],
  timeUs: number,
  factors: Factors,
): GroupNodeState['children'][number] {
  return child.type === 'video'
    ? evaluateVideo(child, timeUs, factors)
    : evaluateLeaf(child, timeUs, factors);
}

/**
 * Children keep their local values: nothing of the group is folded into them
 * (D15), their `active` included (D42.3). An inactive node is evaluated like any
 * other, so the state still mirrors the document.
 */
function evaluateNode(node: SceneNode, timeUs: number, factors: Factors): NodeState {
  switch (node.type) {
    case 'background':
      return { id: node.id, type: node.type, active: isActive(node, timeUs) };
    case 'group':
      return {
        id: node.id,
        type: node.type,
        active: isActive(node, timeUs),
        ...transformOf(node, timeUs, factors),
        children: node.children.map((child) => evaluateChild(child, timeUs, factors)),
      };
    case 'image':
    case 'text':
    case 'custom-html':
      return evaluateLeaf(node, timeUs, factors);
    case 'video':
      return evaluateVideo(node, timeUs, factors);
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
 * the opacities of its nodes, and the composition's `backdrop` (D56).
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
      scene === undefined ? new Map<string, number>() : clipTransitionFactors(scene, sceneTimeUs);
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
      ...(effect === null ? {} : { transition: effect }),
    };
  });
  return {
    timeUs: time,
    scenes,
    ...(transition?.backdrop == null ? {} : { backdrop: transition.backdrop }),
  };
}
