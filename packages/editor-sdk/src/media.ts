/**
 * Media facts at the command bus (D49.6, D50.6). A fact of a source — here the
 * duration of a video — is a pure function of its bytes, and therefore of its
 * `contentHash` (D14); the document never stores one. A host that has verified
 * the bytes supplies the facts by hash, and every command whose result changes
 * the sampled source range of a video node is checked against them: a range
 * that leaves the source, or a range whose asset has no facts, is refused, so
 * the bus never accepts what both hosts would reject before the first frame.
 */
import {
  sampledSourceRange,
  sourceRangeFits,
  type SourceRange,
  type ValidatedComposition,
} from '@kadrion/schema';

import { EditorError } from './errors.js';

/** What a host knows of a video's bytes (D49.6). */
export interface VideoFacts {
  readonly type: 'video';
  /** The presentation end of the last frame, counted from the first, in microseconds (D49.5). */
  readonly durationUs: number;
}

/** The facts of one asset; a later version adds audio. */
export type MediaFacts = VideoFacts;

/** The facts of the bytes with this content hash, or `null` when the host has none. */
export type MediaFactsLookup = (contentHash: string) => MediaFacts | null;

/** A video node's sampled source range in a document, with the hash of its asset. */
interface SampledVideo {
  readonly nodeId: string;
  readonly contentHash: string;
  readonly range: SourceRange | null;
}

/** Every video node of a document, group children included, in document order. */
function sampledVideos(document: ValidatedComposition): SampledVideo[] {
  const hashes = new Map(document.assets.map((asset) => [asset.id, asset.contentHash]));
  const videos: SampledVideo[] = [];
  for (const scene of document.scenes) {
    for (const node of scene.nodes) {
      const members = node.type === 'group' ? node.children : [node];
      for (const member of members) {
        if (member.type !== 'video') continue;
        videos.push({
          nodeId: member.id,
          contentHash: hashes.get(member.assetId) ?? '',
          range: sampledSourceRange(member, document.durationUs),
        });
      }
    }
  }
  return videos;
}

function sameRange(a: SourceRange | null, b: SourceRange | null): boolean {
  return (
    a === b ||
    (a !== null && b !== null && a.startUs === b.startUs && a.durationUs === b.durationUs)
  );
}

/** Reads a host's facts once, as plain data: anything else is no facts. */
export function factsOf(lookup: MediaFactsLookup, contentHash: string): MediaFacts | null {
  const facts: unknown = lookup(contentHash);
  if (typeof facts !== 'object' || facts === null) return null;
  const { type, durationUs } = facts as Partial<Record<string, unknown>>;
  if (type !== 'video' || typeof durationUs !== 'number' || !Number.isSafeInteger(durationUs)) {
    return null;
  }
  return { type, durationUs };
}

/**
 * Checks every video node of `after` whose sampled source range or asset
 * differs from the node with its ID in `before`, or that `before` does not
 * have (D49.6). A node that samples nothing — its lifetime starts at or after
 * the end of the composition — needs no facts. Throws `media-facts-missing`
 * when the host has no facts for a checked asset, and `source-range-exceeded`
 * when a range does not lie in `[0, durationUs)` of its source; the details
 * name the nodes, in document order.
 */
export function checkSourceRanges(
  before: ValidatedComposition,
  after: ValidatedComposition,
  lookup: MediaFactsLookup | null,
): void {
  const previous = new Map(sampledVideos(before).map((video) => [video.nodeId, video]));
  const missing: string[] = [];
  const exceeded: string[] = [];
  for (const video of sampledVideos(after)) {
    const old = previous.get(video.nodeId);
    if (
      old !== undefined &&
      old.contentHash === video.contentHash &&
      sameRange(old.range, video.range)
    ) {
      continue;
    }
    if (video.range === null) continue;
    const facts = lookup === null ? null : factsOf(lookup, video.contentHash);
    if (facts === null) missing.push(video.nodeId);
    else if (!sourceRangeFits(video.range, facts.durationUs)) {
      exceeded.push(
        `${video.nodeId}: samples ${String(video.range.startUs)} to ${String(video.range.startUs + video.range.durationUs)} µs of a source of ${String(facts.durationUs)} µs`,
      );
    }
  }
  if (missing.length > 0) {
    throw new EditorError(
      'media-facts-missing',
      'The host supplied no media facts for the video of a node whose source range the command sets (D49.6).',
      missing,
    );
  }
  if (exceeded.length > 0) {
    throw new EditorError(
      'source-range-exceeded',
      'The command would make a video node sample past the end of its source (D49.6).',
      exceeded,
    );
  }
}
