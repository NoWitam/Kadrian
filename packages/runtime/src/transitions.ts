/**
 * Transitions at one instant (D49.4, D56, D66): what a transition does to its two
 * sides, as a pure function of its progress `elapsedUs / durationUs`. Every
 * value comes from one rule, the linear one of D18, so that a value at the
 * start of a transition is its start value exactly and never the result of an
 * operation.
 */
import {
  sceneTransitionAt,
  type Scene,
  type TransitionDirection,
  type TransitionEffect,
  type ValidatedComposition,
} from '@kadrion/schema';

import { unsupported } from './errors.js';
import type {
  Circle,
  ClipTransitionState,
  Hole,
  Inset,
  SceneTransitionState,
  Vec2,
  Zoom,
} from './state.js';

/**
 * `start + ((end - start) * elapsedUs) / spanUs`, the rule of D18, and `start`
 * itself at `elapsedUs = 0`. `spanUs` may be half of an odd duration: halving is
 * exact in binary64.
 */
function progressValue(start: number, end: number, elapsedUs: number, spanUs: number): number {
  return elapsedUs === 0 ? start : start + ((end - start) * elapsedUs) / spanUs;
}

/** The size of a transition's frame: the canvas (D56, D66). */
interface Frame {
  readonly width: number;
  readonly height: number;
}

/** What an effect does to one side, besides what a clip transition adds (D66). */
interface SideEffect {
  readonly opacity?: number;
  readonly offset?: Vec2;
  readonly zoom?: Zoom;
  readonly clip?: Inset;
  readonly circle?: Circle;
  readonly hole?: Hole;
}

/** What an effect does to its two sides at one instant, and the colour under them. */
interface EffectInstant {
  readonly outgoing: SideEffect | null;
  readonly incoming: SideEffect | null;
  readonly backdrop: string | null;
}

/** The two sides of a scene transition at one instant, and the colour under them. */
export interface SceneTransitionEffects {
  /** The index of the outgoing scene; the incoming one is the next. */
  readonly fromIndex: number;
  readonly outgoing: SceneTransitionState | null;
  readonly incoming: SceneTransitionState | null;
  readonly backdrop: string | null;
}

const NO_INSET: Inset = { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 };

/**
 * What one effect does at `elapsedUs` of `durationUs` (D56, D66). The incoming
 * side is above the outgoing one unless `outgoingAbove` says otherwise, which
 * only a clip transition can (D49.2); every effect then changes the side above
 * so that the incoming side is uncovered and nothing of it shows at progress
 * 0. A side the effect moves, cuts, or fades only from the first instant after
 * the start carries nothing at that instant, so the frame there is the
 * outgoing side's alone (D49.4).
 *
 * - `crossfade`: the incoming side's opacity rises from 0 to 1; an outgoing
 *   side above it falls from 1 to 0;
 * - `fade-through-color`: over the first half the outgoing side's opacity falls
 *   from 1 to 0 over the colour, and over the second half the incoming side's
 *   rises from 0 to 1 over it; the colour is shown from the first instant after
 *   the start;
 * - `slide`: the incoming side moves from one frame's width or height away to
 *   its place, in its direction; an outgoing side above it moves out in that
 *   direction instead, and the incoming side is cut to the part of the frame
 *   it has left;
 * - `wipe`: the incoming side is cut to the part of the frame an edge has
 *   passed, the edge moving in its direction from the frame's edge; an
 *   outgoing side above it is cut to the part the edge has not passed;
 * - `push`: the incoming side moves in as in `slide`, and the outgoing side
 *   moves out by one frame in the same direction;
 * - `zoom`: the incoming side scales from `fromScale` to 1 about the centre of
 *   the frame while its opacity rises from 0 to 1; an outgoing side above it
 *   falls from 1 to 0;
 * - `iris`: the incoming side is cut to a circle about `center` whose radius
 *   grows from 0 until it holds the whole frame; an outgoing side above it is
 *   cut to the frame outside that circle.
 */
function effectAt(
  effect: TransitionEffect,
  elapsedUs: number,
  durationUs: number,
  frame: Frame,
  outgoingAbove: boolean,
): EffectInstant {
  const along = (from: number, to: number): number =>
    progressValue(from, to, elapsedUs, durationUs);
  const toZero = (from: number): number => along(from, 0);
  // A side that changes only after the start: nothing at the first instant.
  const later = (side: SideEffect): SideEffect | null => (elapsedUs === 0 ? null : side);
  const fadingOut = (): SideEffect | null =>
    outgoingAbove ? later({ opacity: along(1, 0) }) : null;
  switch (effect.kind) {
    case 'crossfade':
      return { outgoing: fadingOut(), incoming: { opacity: along(0, 1) }, backdrop: null };
    case 'fade-through-color': {
      const half = durationUs / 2;
      // The first half: compared as a difference, so that no double of a time is formed.
      if (elapsedUs < durationUs - elapsedUs) {
        return {
          outgoing: { opacity: progressValue(1, 0, elapsedUs, half) },
          incoming: { opacity: 0 },
          backdrop: elapsedUs === 0 ? null : effect.color,
        };
      }
      return {
        outgoing: { opacity: 0 },
        incoming: { opacity: progressValue(0, 1, elapsedUs - half, half) },
        backdrop: effect.color,
      };
    }
    case 'slide':
      if (outgoingAbove) {
        return {
          outgoing: later({ offset: leaving(effect.direction, frame, along) }),
          incoming: { clip: passed(effect.direction, frame, toZero) },
          backdrop: null,
        };
      }
      return {
        outgoing: null,
        incoming: { offset: arriving(effect.direction, frame, toZero) },
        backdrop: null,
      };
    case 'wipe':
      return {
        outgoing: outgoingAbove ? later({ clip: unpassed(effect.direction, frame, along) }) : null,
        incoming: { clip: passed(effect.direction, frame, toZero) },
        backdrop: null,
      };
    case 'push':
      return {
        outgoing: later({ offset: leaving(effect.direction, frame, along) }),
        incoming: { offset: arriving(effect.direction, frame, toZero) },
        backdrop: null,
      };
    case 'zoom':
      return {
        outgoing: fadingOut(),
        incoming: {
          opacity: along(0, 1),
          zoom: {
            factor: along(effect.fromScale, 1),
            center: { x: frame.width / 2, y: frame.height / 2 },
          },
        },
        backdrop: null,
      };
    case 'iris': {
      const x = (effect.center.x * frame.width) / 1000;
      const y = (effect.center.y * frame.height) / 1000;
      // Farther than every corner without a square root: the sum of the two
      // largest distances along the axes bounds the distance to each corner.
      const reach = Math.max(x, frame.width - x) + Math.max(y, frame.height - y);
      const radius = along(0, reach);
      return {
        outgoing: outgoingAbove
          ? later({ hole: { x, y, radius, width: frame.width, height: frame.height } })
          : null,
        incoming: { circle: { x, y, radius } },
        backdrop: null,
      };
    }
    default:
      return unsupported(effect, 'kind');
  }
}

type Direction = TransitionDirection;
type Along = (from: number, to: number) => number;

/** The offset of a side that moves in: from one frame away to 0, in its direction (D56). */
function arriving(direction: Direction, frame: Frame, toZero: (from: number) => number): Vec2 {
  return {
    left: { x: toZero(frame.width), y: 0 },
    right: { x: toZero(-frame.width), y: 0 },
    up: { x: 0, y: toZero(frame.height) },
    down: { x: 0, y: toZero(-frame.height) },
  }[direction];
}

/** The offset of a side that moves out: from 0 to one frame away, in the same direction (D66). */
function leaving(direction: Direction, frame: Frame, along: Along): Vec2 {
  return {
    left: { x: along(0, -frame.width), y: 0 },
    right: { x: along(0, frame.width), y: 0 },
    up: { x: 0, y: along(0, -frame.height) },
    down: { x: 0, y: along(0, frame.height) },
  }[direction];
}

/** What is cut away of the incoming side: the part of the frame the edge has not passed (D56). */
function passed(direction: Direction, frame: Frame, toZero: (from: number) => number): Inset {
  return {
    left: { ...NO_INSET, fromLeft: toZero(frame.width) },
    right: { ...NO_INSET, fromRight: toZero(frame.width) },
    up: { ...NO_INSET, fromTop: toZero(frame.height) },
    down: { ...NO_INSET, fromBottom: toZero(frame.height) },
  }[direction];
}

/** What is cut away of an outgoing side above: the part of the frame the edge has passed (D66). */
function unpassed(direction: Direction, frame: Frame, along: Along): Inset {
  return {
    left: { ...NO_INSET, fromRight: along(0, frame.width) },
    right: { ...NO_INSET, fromLeft: along(0, frame.width) },
    up: { ...NO_INSET, fromBottom: along(0, frame.height) },
    down: { ...NO_INSET, fromTop: along(0, frame.height) },
  }[direction];
}

/** The scene transition under way at composition time `timeUs`, or `null` (D49.4). */
export function sceneTransitionEffects(
  composition: ValidatedComposition,
  timeUs: number,
): SceneTransitionEffects | null {
  const instant = sceneTransitionAt(composition, timeUs);
  if (instant === null) return null;
  const transition = composition.transitions.find(({ id }) => id === instant.id);
  if (transition === undefined) return null;
  const { outgoing, incoming, backdrop } = effectAt(
    transition.effect,
    instant.elapsedUs,
    instant.durationUs,
    composition,
    false,
  );
  const scene = (side: SideEffect | null): SceneTransitionState | null =>
    side === null ? null : { id: transition.id, ...side };
  return {
    fromIndex: instant.fromIndex,
    outgoing: scene(outgoing),
    incoming: scene(incoming),
    backdrop,
  };
}

/** The position of a node among its siblings, which is its layer (D49.2). */
function layerOf(scene: Scene, nodeId: string): number {
  for (const [index, node] of scene.nodes.entries()) {
    if (node.id === nodeId) return index;
    if (node.type === 'group') {
      const child = node.children.findIndex(({ id }) => id === nodeId);
      if (child >= 0) return child;
    }
  }
  return -1;
}

/** What clip transitions do to one node at one instant (D56, D66). */
export interface ClipSideEffect {
  /** The factor multiplied into the node's opacity. */
  readonly factor?: number;
  /** Everything else, when the effect changes more than the opacity. */
  readonly state?: ClipTransitionState;
}

/**
 * What the clip transitions of a scene do to their nodes at scene time
 * `timeUs` (D56, D66), by node ID. A node is a side of at most one clip
 * transition at any instant (D56.3), and outside the overlap it has no entry
 * and is shown as it would be without the transition. An opacity becomes a
 * factor of the node's own; whatever else the effect does is the node's
 * `transition` state, in the frame of the canvas in its parent's space. A side
 * that moves or grows and is not cut otherwise is cut to that frame, so that
 * it never shows outside it. The colour of `fade-through-color` lies under the
 * lower of the two sides.
 */
export function clipTransitionEffects(
  scene: Scene,
  timeUs: number,
  frame: Frame,
): Map<string, ClipSideEffect> {
  const effects = new Map<string, ClipSideEffect>();
  for (const transition of scene.transitions) {
    const { durationUs } = transition;
    const startUs = startOf(scene, transition.toNodeId);
    if (startUs === null || timeUs < startUs || timeUs - startUs >= durationUs) continue;
    const outgoingAbove =
      layerOf(scene, transition.fromNodeId) > layerOf(scene, transition.toNodeId);
    const instant = effectAt(transition.effect, timeUs - startUs, durationUs, frame, outgoingAbove);
    const lower = outgoingAbove ? 'incoming' : 'outgoing';
    for (const [nodeId, sideName] of [
      [transition.fromNodeId, 'outgoing'],
      [transition.toNodeId, 'incoming'],
    ] as const) {
      const side = instant[sideName];
      const backdrop = sideName === lower ? instant.backdrop : null;
      if (side === null && backdrop === null) continue;
      const { opacity, ...rest } = side ?? {};
      const moved = rest.offset !== undefined || rest.zoom !== undefined;
      const cut = rest.clip !== undefined || rest.circle !== undefined || rest.hole !== undefined;
      const state: Omit<ClipTransitionState, 'id'> = {
        ...rest,
        ...(moved && !cut ? { clip: NO_INSET } : {}),
        ...(backdrop === null ? {} : { backdrop }),
      };
      effects.set(nodeId, {
        ...(opacity === undefined ? {} : { factor: opacity }),
        ...(Object.keys(state).length === 0 ? {} : { state: { id: transition.id, ...state } }),
      });
    }
  }
  return effects;
}

/** The `startUs` of a node of the scene, or `null`. */
function startOf(scene: Scene, nodeId: string): number | null {
  for (const node of scene.nodes) {
    if (node.id === nodeId) return node.startUs;
    if (node.type === 'group') {
      const child = node.children.find(({ id }) => id === nodeId);
      if (child !== undefined) return child.startUs;
    }
  }
  return null;
}
