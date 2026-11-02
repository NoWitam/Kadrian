/**
 * Transitions at one instant (D49.4, D56): what a transition does to its two
 * sides, as a pure function of its progress `elapsedUs / durationUs`. Every
 * value comes from one rule, the linear one of D18, so that a value at the
 * start of a transition is its start value exactly and never the result of an
 * operation.
 */
import {
  sceneTransitionAt,
  type Scene,
  type SceneTransitionEffect,
  type ValidatedComposition,
} from '@kadrion/schema';

import { unsupported } from './errors.js';
import type { SceneTransitionState } from './state.js';

/**
 * `start + ((end - start) * elapsedUs) / spanUs`, the rule of D18, and `start`
 * itself at `elapsedUs = 0`. `spanUs` may be half of an odd duration: halving is
 * exact in binary64.
 */
function progressValue(start: number, end: number, elapsedUs: number, spanUs: number): number {
  return elapsedUs === 0 ? start : start + ((end - start) * elapsedUs) / spanUs;
}

/** The two sides of a scene transition at one instant, and the colour under them. */
export interface SceneTransitionEffects {
  /** The index of the outgoing scene; the incoming one is the next. */
  readonly fromIndex: number;
  readonly outgoing: SceneTransitionState | null;
  readonly incoming: SceneTransitionState | null;
  readonly backdrop: string | null;
}

/**
 * What one effect does at `elapsedUs` of `durationUs` (D56). The incoming scene
 * lies above the outgoing one (D16.4), so every kind but `fade-through-color`
 * changes the incoming scene only:
 *
 * - `crossfade`: the incoming scene's opacity rises from 0 to 1;
 * - `fade-through-color`: over the first half the outgoing scene's opacity
 *   falls from 1 to 0 over the colour, and over the second half the incoming
 *   scene's rises from 0 to 1 over it; the colour is shown from the first
 *   instant after the start;
 * - `slide`: the incoming scene moves from one frame's width or height away to
 *   its place, in its direction;
 * - `wipe`: the incoming scene is cut to the part of the frame an edge has
 *   passed, the edge moving in its direction from the frame's edge.
 */
function effectAt(
  id: string,
  effect: SceneTransitionEffect,
  elapsedUs: number,
  durationUs: number,
  frame: { readonly width: number; readonly height: number },
): Omit<SceneTransitionEffects, 'fromIndex'> {
  const toZero = (from: number): number => progressValue(from, 0, elapsedUs, durationUs);
  switch (effect.kind) {
    case 'crossfade':
      return {
        outgoing: null,
        incoming: { id, opacity: progressValue(0, 1, elapsedUs, durationUs) },
        backdrop: null,
      };
    case 'fade-through-color': {
      const half = durationUs / 2;
      // The first half: compared as a difference, so that no double of a time is formed.
      if (elapsedUs < durationUs - elapsedUs) {
        return {
          outgoing: { id, opacity: progressValue(1, 0, elapsedUs, half) },
          incoming: { id, opacity: 0 },
          backdrop: elapsedUs === 0 ? null : effect.color,
        };
      }
      return {
        outgoing: { id, opacity: 0 },
        incoming: { id, opacity: progressValue(0, 1, elapsedUs - half, half) },
        backdrop: effect.color,
      };
    }
    case 'slide': {
      const offset = {
        left: { x: toZero(frame.width), y: 0 },
        right: { x: toZero(-frame.width), y: 0 },
        up: { x: 0, y: toZero(frame.height) },
        down: { x: 0, y: toZero(-frame.height) },
      }[effect.direction];
      return { outgoing: null, incoming: { id, offset }, backdrop: null };
    }
    case 'wipe': {
      const none = { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 };
      const clip = {
        left: { ...none, fromLeft: toZero(frame.width) },
        right: { ...none, fromRight: toZero(frame.width) },
        up: { ...none, fromTop: toZero(frame.height) },
        down: { ...none, fromBottom: toZero(frame.height) },
      }[effect.direction];
      return { outgoing: null, incoming: { id, clip }, backdrop: null };
    }
    default:
      return unsupported(effect, 'kind');
  }
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
  return {
    fromIndex: instant.fromIndex,
    ...effectAt(
      transition.id,
      transition.effect,
      instant.elapsedUs,
      instant.durationUs,
      composition,
    ),
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

/**
 * The factors that the clip transitions of a scene multiply into the opacity of
 * their nodes at scene time `timeUs` (D56), by node ID. During the overlap of
 * a `crossfade`, the incoming node's factor rises from 0 to 1, and the outgoing
 * node's falls from 1 to 0 when it lies above the incoming one, so that it does
 * not cover it; one below it keeps its opacity. Outside the overlap a node has
 * no factor and is shown as it would be without the transition.
 */
export function clipTransitionFactors(scene: Scene, timeUs: number): Map<string, number> {
  const factors = new Map<string, number>();
  const multiply = (nodeId: string, factor: number): void => {
    factors.set(nodeId, (factors.get(nodeId) ?? 1) * factor);
  };
  for (const transition of scene.transitions) {
    const { durationUs } = transition;
    const to = layerOf(scene, transition.toNodeId);
    const startUs = startOf(scene, transition.toNodeId);
    if (startUs === null || timeUs < startUs || timeUs - startUs >= durationUs) continue;
    const elapsedUs = timeUs - startUs;
    // `crossfade` is the one kind of a clip transition (D56.1); the schema's types pin it.
    multiply(transition.toNodeId, progressValue(0, 1, elapsedUs, durationUs));
    if (layerOf(scene, transition.fromNodeId) > to) {
      multiply(transition.fromNodeId, progressValue(1, 0, elapsedUs, durationUs));
    }
  }
  return factors;
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
