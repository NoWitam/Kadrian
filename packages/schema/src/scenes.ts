/**
 * The placement of scenes in a composition (D49.3, D54): what the order and the
 * `durationUs` of the scenes mean. A scene has no `startUs`; its start is the
 * sum of the durations before it, so reordering or resizing one scene can never
 * leave two starts that disagree. Until transitions exist (PR-32), scenes meet
 * end to end:
 *
 * ```text
 * start(0)     = 0
 * start(k + 1) = start(k) + D(k)
 * durationUs   = start(last) + D(last)
 * ```
 *
 * Like the frame grid (D13.3) and the source frame (D49.5), these are pure
 * functions every host shares: the runtime evaluates by them, the Producer and
 * the Player choose video frames and place sounds by them, and the command bus
 * checks by them. Every sum is exact: a validated document's durations add up
 * to its own `durationUs`, a safe integer (D54.2).
 */

import type { SceneNode, ValidatedComposition, VideoNode } from './types.js';

/** The part of a scene that places it. */
export interface SceneSpan {
  readonly id: string;
  readonly durationUs: number;
}

/** Where one scene lies in composition time. */
export interface ScenePlacement {
  readonly id: string;
  /** Its index among the scenes. */
  readonly index: number;
  /** Composition time of its first instant: the sum of the durations before it. */
  readonly startUs: number;
  readonly durationUs: number;
}

/** A scene evaluated at one instant: which one, and its local time (D49.3). */
export interface SceneInstant {
  readonly placement: ScenePlacement;
  /** Scene time, `timeUs − startUs`: from 0 to less than the scene's duration. */
  readonly timeUs: number;
}

/** Every scene with its start, in their order (D49.3). */
export function scenePlacements(scenes: readonly SceneSpan[]): ScenePlacement[] {
  let startUs = 0;
  return scenes.map((scene, index) => {
    const placement = { id: scene.id, index, startUs, durationUs: scene.durationUs };
    startUs += scene.durationUs;
    return placement;
  });
}

/**
 * The scenes evaluated at composition time `timeUs` (D49.3): scene `k` exactly
 * when `0 ≤ timeUs − start(k) < D(k)`. Scenes meet end to end, so that is one
 * scene inside the composition and none at or after its end. The result is a
 * list because a transition (PR-32) will make it two.
 */
export function scenesAt(scenes: readonly SceneSpan[], timeUs: number): SceneInstant[] {
  return scenePlacements(scenes)
    .filter(
      (placement) =>
        timeUs >= placement.startUs && timeUs - placement.startUs < placement.durationUs,
    )
    .map((placement) => ({ placement, timeUs: timeUs - placement.startUs }));
}

/** A video node with the scene it belongs to (D49.3, D54.3). */
export interface PlacedVideo {
  readonly node: VideoNode;
  readonly scene: ScenePlacement;
}

/** Every video node of a composition, group children included, in document order, with its scene. */
export function placedVideos(composition: ValidatedComposition): PlacedVideo[] {
  const placements = scenePlacements(composition.scenes);
  const found: PlacedVideo[] = [];
  composition.scenes.forEach((scene, index) => {
    const placement = placements[index];
    if (placement === undefined) return;
    const visit = (node: SceneNode | VideoNode): void => {
      if (node.type === 'video') found.push({ node, scene: placement });
      else if (node.type === 'group') node.children.forEach(visit);
    };
    scene.nodes.forEach(visit);
  });
  return found;
}

/**
 * The scene time at which a placed video shows a frame at composition time
 * `timeUs`: `timeUs` minus its scene's start, when its scene is evaluated then
 * and the node's own lifetime contains that scene time (D42.2, D49.3), and
 * `null` otherwise. The lifetime of a group is not consulted, as the runtime's
 * `active` of a child does not (D42.3).
 */
export function videoSceneTimeUs(video: PlacedVideo, timeUs: number): number | null {
  const local = timeUs - video.scene.startUs;
  if (local < 0 || local >= video.scene.durationUs) return null;
  const { node } = video;
  return local >= node.startUs && local - node.startUs < node.durationUs ? local : null;
}
