/**
 * Media facts at the command bus (D49.6, D50.6, D53). A fact of a source — the
 * duration of a video, or of a sound — is a pure function of its bytes, and
 * therefore of its `contentHash` (D14); the document never stores one. A host
 * that has verified the bytes supplies the facts by hash, and every command
 * whose result changes the sampled source range of a video node, or the source
 * range a sound of the audio plan hears (D52.4), is checked against them: a
 * range that leaves the source, or a range whose asset has no facts, is
 * refused, so the bus never accepts what both hosts would reject before the
 * first frame.
 */
import {
  audioPlan,
  type AudioPlanEntry,
  sampledSourceRange,
  sourceRangeFits,
  type SourceRange,
  type ValidatedComposition,
} from '@kadrion/schema';

import { EditorError } from './errors.js';

/** What a host knows of a video's bytes (D49.6, D53). */
export interface VideoFacts {
  readonly type: 'video';
  /** The presentation end of the last frame, counted from the first, in microseconds (D49.5). */
  readonly durationUs: number;
  /**
   * The length of its decoded sound in whole microseconds, `null` when it has
   * none, or absent when the host has not read it (D53). A video node above
   * volume 0 needs it.
   */
  readonly audioDurationUs?: number | null;
}

/** What a host knows of a sound's bytes (D53). */
export interface AudioFacts {
  readonly type: 'audio';
  /** The length of its decoded samples, in whole microseconds, rounded down. */
  readonly durationUs: number;
}

/** The facts of one asset. */
export type MediaFacts = VideoFacts | AudioFacts;

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
          range: sampledSourceRange(member, scene.durationUs),
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

function isDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Reads a host's facts once, as plain data: anything else is no facts. */
export function factsOf(lookup: MediaFactsLookup, contentHash: string): MediaFacts | null {
  const facts: unknown = lookup(contentHash);
  if (typeof facts !== 'object' || facts === null) return null;
  const { type, durationUs, audioDurationUs } = facts as Partial<Record<string, unknown>>;
  if (!isDuration(durationUs)) return null;
  if (type === 'audio') return { type, durationUs };
  if (type !== 'video') return null;
  if (audioDurationUs === null || isDuration(audioDurationUs)) {
    return { type, durationUs, audioDurationUs };
  }
  return { type, durationUs };
}

/** The source length a sound of the plan reads from, `null` for none, or `undefined` if unknown. */
function soundLength(entry: AudioPlanEntry, facts: MediaFacts | null): number | null | undefined {
  if (facts === null) return undefined;
  if (entry.kind === 'clip') return facts.type === 'audio' ? facts.durationUs : undefined;
  return facts.type === 'video' ? facts.audioDurationUs : undefined;
}

/**
 * Whether sound `b` reads only source time that sound `a` of the same source
 * read already: a range that shrinks reads nothing new and needs no facts.
 */
function readsNothingNew(a: AudioPlanEntry, b: AudioPlanEntry, hashes: [string, string]): boolean {
  return (
    hashes[0] === hashes[1] &&
    b.sourceStartUs >= a.sourceStartUs &&
    b.sourceStartUs - a.sourceStartUs <= a.durationUs - b.durationUs
  );
}

/**
 * Checks every video node of `after` whose sampled source range or asset
 * differs from the node with its ID in `before`, or that `before` does not
 * have (D49.6). A node that samples nothing — its lifetime starts at or after
 * the end of its scene (D54.3) — needs no facts. Throws `media-facts-missing`
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
  checkSounds(before, after, lookup, missing, exceeded);
  if (missing.length > 0) {
    throw new EditorError(
      'media-facts-missing',
      'The host supplied no media facts for the source of a node or clip whose source range the command sets (D49.6, D53).',
      missing,
    );
  }
  if (exceeded.length > 0) {
    throw new EditorError(
      'source-range-exceeded',
      'The command would make a node or clip read past the end of its source (D49.6, D53).',
      exceeded,
    );
  }
}

/**
 * The sounds of the audio plan of `after` (D52.4) that read source time the
 * sound of the same clip or node in `before` did not — a new sound, another
 * asset, or a range reaching outside the one before — checked
 * against the facts of their sources (D53): a clip reads `[sourceStartUs,
 * sourceStartUs + durationUs)` of a sound, and a video node above volume 0 the
 * same of its video's sound. A sound not heard — volume 0, or past the end —
 * needs no facts. Adds to `missing` and `exceeded`.
 */
function checkSounds(
  before: ValidatedComposition,
  after: ValidatedComposition,
  lookup: MediaFactsLookup | null,
  missing: string[],
  exceeded: string[],
): void {
  const hashOf = (document: ValidatedComposition) => {
    const hashes = new Map(document.assets.map((asset) => [asset.id, asset.contentHash]));
    return (assetId: string): string => hashes.get(assetId) ?? '';
  };
  const beforeHash = hashOf(before);
  const afterHash = hashOf(after);
  const previous = new Map(
    audioPlan(before).entries.map((entry) => [`${entry.kind}:${entry.id}`, entry]),
  );
  for (const entry of audioPlan(after).entries) {
    const contentHash = afterHash(entry.assetId);
    const old = previous.get(`${entry.kind}:${entry.id}`);
    if (old !== undefined && readsNothingNew(old, entry, [beforeHash(old.assetId), contentHash])) {
      continue;
    }
    const length = soundLength(entry, lookup === null ? null : factsOf(lookup, contentHash));
    const end = `${String(entry.sourceStartUs)} to ${String(entry.sourceStartUs + entry.durationUs)} µs`;
    if (length === undefined) {
      if (!missing.includes(entry.id)) missing.push(entry.id);
    } else if (length === null) {
      exceeded.push(`${entry.id}: hears ${end} of a source with no sound`);
    } else if (entry.sourceStartUs > length || entry.durationUs > length - entry.sourceStartUs) {
      exceeded.push(`${entry.id}: hears ${end} of a sound of ${String(length)} µs`);
    }
  }
}
