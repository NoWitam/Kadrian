/**
 * The audio plan of a composition (D52.4, D54.3): which source is heard when, from
 * which source time, at which volume, and with which fades. It is a pure
 * function of the document, like the sampled source range of D49.5 beside it,
 * and everything that hears a document uses it: the Producer turns it into an
 * FFmpeg graph (D52.5), the Player plays it with Web Audio, and the command bus
 * checks the source ranges it hears (D53). It lives in the schema, the one
 * package all three may use (D12, D53); `@kadrion/runtime` re-exports it. It
 * knows no sample rate, no media fact, and no clock.
 *
 * Every time of an entry is an integer: a composition time, a source time, or
 * an offset from the entry's start. Nothing is ever added past the end of the
 * composition, so every value stays a safe integer however far a lifetime
 * reaches (the repair of the debt of D29.6, where the end of a clip was
 * computed as a sum).
 */
import { scenePlacements } from './scenes.js';
import type { AudioClip, SceneNode, ValidatedComposition, VideoNode } from './types.js';

/** One sound of the plan: an audio clip, or the sound of a video node. */
export interface AudioPlanEntry {
  /** `clip` for an audio clip of the composition or of a scene, `video` for the sound of a video node. */
  readonly kind: 'clip' | 'video';
  /** The ID of the clip, or of the video node. */
  readonly id: string;
  readonly assetId: string;
  /** Composition time of the first instant heard, before the end of what holds it. */
  readonly startUs: number;
  /** How long it is heard, at least 1; it ends at or before the end of its scene, or of the composition. */
  readonly durationUs: number;
  /** The source time heard at `startUs`; speed is 1. */
  readonly sourceStartUs: number;
  /** The linear factor of the amplitude, above 0 and at most 1. */
  readonly volume: number;
  /**
   * The length of the lifetime the fades are counted in, from `startUs`: the
   * clip's whole `durationUs`, which may reach past the end of what holds it, or,
   * for a video, the part that is heard.
   */
  readonly lifetimeUs: number;
  /** The gain rises linearly from 0 over `[0, fadeInUs)` of the lifetime; 0 for a video. */
  readonly fadeInUs: number;
  /** The gain falls linearly to 0 over the last `fadeOutUs` of the lifetime; 0 for a video. */
  readonly fadeOutUs: number;
}

/**
 * What is heard of a composition: its entries — the composition's clips, then
 * the clips of each scene, then the videos — each in document order.
 */
export interface AudioPlan {
  readonly durationUs: number;
  readonly entries: readonly AudioPlanEntry[];
}

/**
 * The end of `[startUs, startUs + durationUs)` cut to `limitUs`, computed by
 * subtraction only: `startUs + durationUs` may leave the safe integers, the
 * result never does.
 */
function cutEnd(startUs: number, durationUs: number, limitUs: number): number {
  if (startUs >= limitUs) return limitUs;
  return startUs + Math.min(durationUs, limitUs - startUs);
}

/** The video nodes of a scene with the lifetime of their group, if they have one. */
function videosOf(
  nodes: readonly SceneNode[],
): { readonly node: VideoNode; readonly group: SceneNode | null }[] {
  const found: { node: VideoNode; group: SceneNode | null }[] = [];
  for (const node of nodes) {
    if (node.type === 'video') found.push({ node, group: null });
    else if (node.type === 'group') {
      for (const child of node.children) {
        if (child.type === 'video') found.push({ node: child, group: node });
      }
    }
  }
  return found;
}

/**
 * The entry of a clip held by something that starts at `offsetUs` of the
 * composition and lasts `limitUs`: the composition itself (offset 0), or a
 * scene (D54.3). `null` when it is not heard.
 */
function clipEntry(clip: AudioClip, offsetUs: number, limitUs: number): AudioPlanEntry | null {
  if (clip.volume === 0 || clip.startUs >= limitUs) return null;
  return {
    kind: 'clip',
    id: clip.id,
    assetId: clip.assetId,
    startUs: offsetUs + clip.startUs,
    durationUs: cutEnd(clip.startUs, clip.durationUs, limitUs) - clip.startUs,
    sourceStartUs: clip.sourceStartUs,
    volume: clip.volume,
    lifetimeUs: clip.durationUs,
    fadeInUs: clip.fadeInUs,
    fadeOutUs: clip.fadeOutUs,
  };
}

/**
 * The audio plan of D52.4 and D54.3. A clip or a video at volume 0 is not heard
 * and is not in the plan, so its source is never read; neither is one whose
 * lifetime lies wholly at or after the end of what holds it. A composition clip
 * is in composition time and cut to the composition; a scene's clip and the
 * sound of a scene's video are in scene time, cut to their scene, and placed at
 * the scene's start (D49.3). The sound of a video in a group is heard only while
 * the group is active too (D42.4), from the source time its node shows at that
 * instant (D49.5).
 */
export function audioPlan(composition: ValidatedComposition): AudioPlan {
  const end = composition.durationUs;
  const entries: AudioPlanEntry[] = [];
  for (const clip of composition.clips) {
    const entry = clipEntry(clip, 0, end);
    if (entry !== null) entries.push(entry);
  }
  const placements = scenePlacements(composition.scenes);
  composition.scenes.forEach((scene, index) => {
    const offset = placements[index]?.startUs ?? 0;
    for (const clip of scene.clips) {
      const entry = clipEntry(clip, offset, scene.durationUs);
      if (entry !== null) entries.push(entry);
    }
  });
  composition.scenes.forEach((scene, index) => {
    const offset = placements[index]?.startUs ?? 0;
    const limit = scene.durationUs;
    for (const { node, group } of videosOf(scene.nodes)) {
      if (node.volume === 0) continue;
      let startUs = node.startUs;
      let endUs = cutEnd(node.startUs, node.durationUs, limit);
      if (group !== null) {
        startUs = Math.max(startUs, group.startUs);
        endUs = Math.min(endUs, cutEnd(group.startUs, group.durationUs, limit));
      }
      if (startUs >= endUs) continue;
      const durationUs = endUs - startUs;
      entries.push({
        kind: 'video',
        id: node.id,
        assetId: node.assetId,
        startUs: offset + startUs,
        durationUs,
        // Within the node's lifetime, so a source time the schema keeps safe (D50.2).
        sourceStartUs: node.sourceStartUs + (startUs - node.startUs),
        volume: node.volume,
        lifetimeUs: durationUs,
        fadeInUs: 0,
        fadeOutUs: 0,
      });
    }
  });
  return { durationUs: end, entries };
}
