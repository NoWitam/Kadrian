/**
 * Media facts at the command bus (D49.6, D50.6, D53, D62, D74). A fact of a source —
 * the duration of a video, or of a sound, or the size of an image or a drawing — is a pure
 * function of its bytes, and
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
  heardSourceRange,
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

/**
 * What a host knows of an image's bytes (D62): its size as an image node lays
 * it out, read from its header. The bus checks nothing with it, since an
 * image has no source range; `describeDocument` reports it.
 */
export interface ImageFacts {
  readonly type: 'image';
  /** In pixels, a whole number of at least 1. */
  readonly width: number;
  /** In pixels, a whole number of at least 1. */
  readonly height: number;
}

/**
 * What a host knows of an SVG asset's bytes (D74.6): its natural size and
 * its view box, read by the sanitiser. Like an image's, the bus checks
 * nothing with them; `describeDocument` reports them.
 */
export interface SvgFacts {
  readonly type: 'svg';
  /** In pixels, a whole number from 1 to 16 384. */
  readonly width: number;
  /** In pixels, a whole number from 1 to 16 384. */
  readonly height: number;
  /** The box of user space the drawing shows. */
  readonly viewBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** The facts of one asset. */
export type MediaFacts = VideoFacts | AudioFacts | ImageFacts | SvgFacts;

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

function isSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

/** A view box of finite numbers with a positive size, copied; anything else is `null`. */
function viewBoxOf(value: unknown): SvgFacts['viewBox'] | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y, width, height } = value as Partial<Record<string, unknown>>;
  const finite = (number: unknown): number is number =>
    typeof number === 'number' && Number.isFinite(number);
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) return null;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Reads a host's facts once, as plain data: anything else is no facts. */
export function factsOf(lookup: MediaFactsLookup, contentHash: string): MediaFacts | null {
  const facts: unknown = lookup(contentHash);
  if (typeof facts !== 'object' || facts === null) return null;
  const { type, durationUs, audioDurationUs, width, height, viewBox } = facts as Partial<
    Record<string, unknown>
  >;
  if (type === 'image') {
    return isSize(width) && isSize(height) ? { type, width, height } : null;
  }
  if (type === 'svg') {
    const box = viewBoxOf(viewBox);
    return isSize(width) && isSize(height) && box !== null
      ? { type, width, height, viewBox: box }
      : null;
  }
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
  if (facts === null || facts.type === 'image' || facts.type === 'svg') return undefined;
  if (entry.kind === 'clip') return facts.type === 'audio' ? facts.durationUs : undefined;
  return facts.type === 'video' ? facts.audioDurationUs : undefined;
}

/**
 * Whether sound `b` reads only source time that sound `a` of the same source
 * read already: a range that shrinks reads nothing new and needs no facts.
 */
function readsNothingNew(a: AudioPlanEntry, b: AudioPlanEntry, hashes: [string, string]): boolean {
  const old = heardSourceRange(a);
  const range = heardSourceRange(b);
  return (
    hashes[0] === hashes[1] &&
    range.startUs >= old.startUs &&
    range.startUs - old.startUs <= old.durationUs - range.durationUs
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
    if (facts === null || facts.type === 'image' || facts.type === 'svg') {
      missing.push(video.nodeId);
    } else if (!sourceRangeFits(video.range, facts.durationUs)) {
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
 * sourceStartUs + durationUs)` of a sound at speed 1 forwards and the range its
 * map hears otherwise (D82.6), and a video node above volume 0 the same of its
 * video's sound. A sound not heard — volume 0, or past the end —
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
    // The range a sound hears, through its map at another speed or reversed (D82.6).
    const range = heardSourceRange(entry);
    const end = `${String(range.startUs)} to ${String(range.startUs + range.durationUs)} µs`;
    if (length === undefined) {
      if (!missing.includes(entry.id)) missing.push(entry.id);
    } else if (length === null) {
      exceeded.push(`${entry.id}: hears ${end} of a source with no sound`);
    } else if (range.startUs > length || range.durationUs > length - range.startUs) {
      exceeded.push(`${entry.id}: hears ${end} of a sound of ${String(length)} µs`);
    }
  }
}
