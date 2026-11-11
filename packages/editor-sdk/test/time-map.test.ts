/**
 * The existing timeline commands on clips at another speed, reversed, or
 * frozen (D82.2, D82.9): a trim or a split shows the same source time at every
 * scene time the clip still covers, and a split followed by its join is the
 * document byte for byte, for 2 000 seeded clips — sounds and videos, forwards
 * and reversed. The source time is read by `sourceTimeOfScene` of the schema,
 * whose rule is checked against an independent rational reference there.
 */
import {
  sourceTimeOfScene,
  type ClipTiming,
  type Speed,
  type ValidatedComposition,
} from '@kadrion/schema';
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  EditorError,
  type Command,
  type CommandResult,
  type MediaFacts,
} from '../src/index.js';

import { json, validated, VIDEO_ASSET, VIDEO_NODE } from './support.js';

const AUDIO_HASH =
  (referenceComposition as { assets: { type: string; contentHash: string }[] }).assets.find(
    ({ type }) => type === 'audio',
  )?.contentHash ?? '';

/** Sources long enough for every seeded clip: the commands refuse nothing for its facts. */
function mediaFacts(contentHash: string): MediaFacts | null {
  if (contentHash === AUDIO_HASH) return { type: 'audio', durationUs: 1_000_000_000 };
  if (contentHash === VIDEO_ASSET.contentHash) {
    return { type: 'video', durationUs: 1_000_000_000, audioDurationUs: 1_000_000_000 };
  }
  return null;
}

function apply(document: ValidatedComposition, command: Command): CommandResult {
  return applyCommand(document, command, { mediaFacts });
}

/** A small seeded generator (mulberry32), so every run replays the same sequence. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A speed of D82.1: 1/4 to 4 in lowest terms, or a freeze frame for a video. */
function randomSpeed(next: () => number, frozen: boolean): Speed {
  if (frozen && next() < 0.1) return { num: 0, den: 1 };
  if (next() < 0.1) return { num: 1, den: 1 };
  for (;;) {
    const den = 1 + Math.floor(next() * 1_000);
    const num = Math.ceil(den / 4) + Math.floor(next() * (4 * den - Math.ceil(den / 4) + 1));
    if (gcd(num, den) === 1) return { num, den };
  }
}

/** The grid a heard sound is split on (D55.4): one sample at 8 kHz, 125 µs. */
const GRID_US = 125;

interface Seeded {
  readonly kind: 'audio' | 'video';
  readonly document: ValidatedComposition;
  readonly clipId: string;
  readonly timing: ClipTiming;
}

/** A clip of the reference composition, a sound or a video, with a seeded map. */
function seeded(next: () => number, index: number): Seeded {
  const kind = index % 2 === 0 ? 'audio' : 'video';
  const speed = randomSpeed(next, kind === 'video');
  const timing: ClipTiming = {
    // On the grid, so a split at a multiple of 125 µs from the start is exact.
    startUs: GRID_US * Math.floor(next() * 40_000),
    durationUs: GRID_US * (4 + Math.floor(next() * 40_000)),
    sourceStartUs: Math.floor(next() * 20_000_000),
    sourceStartRemainder: speed.num === 0 ? 0 : Math.floor(next() * speed.den),
    speed,
    reverse: speed.num !== 0 && next() < 0.5,
  };
  const draft = structuredClone(referenceComposition) as {
    assets: unknown[];
    scenes: { nodes: Record<string, unknown>[] }[];
    clips: Record<string, unknown>[];
  };
  const fields = {
    startUs: timing.startUs,
    durationUs: timing.durationUs,
    sourceStartUs: timing.sourceStartUs,
    sourceStartRemainder: timing.sourceStartRemainder,
    speed: timing.speed,
    reverse: timing.reverse,
  };
  if (kind === 'audio') {
    Object.assign(draft.clips[0] ?? {}, fields, { fadeInUs: 0, fadeOutUs: 0 });
    return { kind, document: validated(draft), clipId: 'clip-audio', timing };
  }
  draft.assets.push(structuredClone(VIDEO_ASSET));
  draft.scenes[0]?.nodes.push({ ...structuredClone(VIDEO_NODE), ...fields, volume: 0.5 });
  return { kind, document: validated(draft), clipId: VIDEO_NODE.id, timing };
}

/** The clip of a document by its ID: the composition's clips or the nodes of its scene. */
function clipOf(document: unknown, clipId: string): ClipTiming {
  const source = document as {
    clips: ClipTiming[];
    scenes: { nodes: (ClipTiming & { id: string })[] }[];
  };
  const found = [
    ...(source.clips as (ClipTiming & { id: string })[]),
    ...(source.scenes[0]?.nodes ?? []),
  ].find((clip) => clip.id === clipId);
  if (found === undefined) throw new Error(`No clip ${clipId}.`);
  return found;
}

/** Scene times to compare at: the ends of a range and some between them. */
function timesIn(fromUs: number, toUs: number, next: () => number): number[] {
  return [
    fromUs,
    fromUs + 1,
    toUs - 2,
    toUs - 1,
    ...Array.from({ length: 4 }, () => fromUs + Math.floor(next() * (toUs - fromUs))),
  ].filter((time) => time >= fromUs && time < toUs);
}

/** The commands a clip refuses only by the start of its source (D55.6). */
function refusedBySource(run: () => CommandResult): CommandResult | null {
  try {
    return run();
  } catch (reason) {
    if (reason instanceof EditorError && reason.code === 'source-range-exceeded') return null;
    throw reason;
  }
}

const SEEDED = (() => {
  const next = random(8_202);
  return Array.from({ length: 2_000 }, (_, index) => seeded(next, index));
})();

describe('the timeline commands through the map (D82.2)', () => {
  it('seeds sounds and videos at every kind of speed, forwards, reversed, and frozen', () => {
    const timings = SEEDED.map(({ timing }) => timing);
    expect(timings.filter(({ reverse }) => reverse).length).toBeGreaterThan(700);
    expect(timings.filter(({ speed }) => speed.num === 0).length).toBeGreaterThan(30);
    expect(timings.filter(({ speed }) => speed.num !== speed.den).length).toBeGreaterThan(1_500);
    expect(SEEDED.filter(({ kind }) => kind === 'audio').length).toBe(1_000);
  });

  it('a trim of the start shows the same source time at every scene time the clip still covers', () => {
    const next = random(1);
    let checked = 0;
    for (const { document, clipId, timing } of SEEDED) {
      // Shorter by up to all but one grid step, or longer by up to a second.
      const deltaUs =
        next() < 0.75
          ? GRID_US * (1 + Math.floor(next() * (timing.durationUs / GRID_US - 1)))
          : -Math.min(timing.startUs, GRID_US * Math.floor(next() * 8_000));
      if (deltaUs === 0) continue;
      const startUs = timing.startUs + deltaUs;
      const result = refusedBySource(() =>
        apply(document, { type: 'TrimClipStart', clipId, startUs }),
      );
      if (result === null) {
        // Only a forward clip made longer reads before its source.
        expect(timing.reverse || deltaUs > 0).toBe(false);
        continue;
      }
      const trimmed = clipOf(result.document, clipId);
      const end = timing.startUs + timing.durationUs;
      for (const time of timesIn(Math.max(startUs, timing.startUs), end, next)) {
        expect(sourceTimeOfScene(trimmed, time)).toBe(sourceTimeOfScene(timing, time));
        checked += 1;
      }
      expect(json(apply(result.document, result.inverse as Command).document)).toBe(json(document));
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it('a trim of the end shows the same source time at every scene time the clip still covers', () => {
    const next = random(2);
    let checked = 0;
    for (const { document, clipId, timing } of SEEDED) {
      const deltaUs =
        next() < 0.75
          ? GRID_US * (1 + Math.floor(next() * (timing.durationUs / GRID_US - 1)))
          : -GRID_US * Math.floor(next() * 8_000);
      if (deltaUs === 0) continue;
      const end = timing.startUs + timing.durationUs;
      const result = refusedBySource(() =>
        apply(document, { type: 'TrimClipEnd', clipId, endUs: end - deltaUs }),
      );
      if (result === null) {
        // Only a reversed clip made longer reads before its source.
        expect(timing.reverse && deltaUs < 0).toBe(true);
        continue;
      }
      const trimmed = clipOf(result.document, clipId);
      for (const time of timesIn(timing.startUs, Math.min(end, end - deltaUs), next)) {
        expect(sourceTimeOfScene(trimmed, time)).toBe(sourceTimeOfScene(timing, time));
        checked += 1;
      }
      expect(json(apply(result.document, result.inverse as Command).document)).toBe(json(document));
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it('a split shows the same source time in both halves, and its join is the document byte for byte', () => {
    const next = random(3);
    let checked = 0;
    for (const { document, clipId, timing } of SEEDED) {
      const atUs =
        timing.startUs + GRID_US * (1 + Math.floor(next() * (timing.durationUs / GRID_US - 1)));
      const split = apply(document, { type: 'SplitClip', clipId, atUs, newClipId: 'second-half' });
      const first = clipOf(split.document, clipId);
      const second = clipOf(split.document, 'second-half');
      const end = timing.startUs + timing.durationUs;
      for (const time of timesIn(timing.startUs, atUs, next)) {
        expect(sourceTimeOfScene(first, time)).toBe(sourceTimeOfScene(timing, time));
        checked += 1;
      }
      for (const time of timesIn(atUs, end, next)) {
        expect(sourceTimeOfScene(second, time)).toBe(sourceTimeOfScene(timing, time));
        checked += 1;
      }
      const joined = apply(split.document, {
        type: 'JoinClips',
        clipId,
        nextClipId: 'second-half',
      });
      expect(json(joined.document)).toBe(json(document));
      expect(json(apply(split.document, split.inverse as Command).document)).toBe(json(document));
    }
    expect(checked).toBeGreaterThan(20_000);
  });
});

describe('the reversed rows of the table of D82.2, by hand', () => {
  // A reversed sound of 1 s from scene time 1 s, over source 2 s to 3 s: it shows F(999 999) =
  // 2 999 999 first and F(0) = 2 000 000 last.
  const reversed = (() => {
    const draft = structuredClone(referenceComposition) as { clips: Record<string, unknown>[] };
    Object.assign(draft.clips[0] ?? {}, {
      startUs: 1_000_000,
      durationUs: 1_000_000,
      sourceStartUs: 2_000_000,
      reverse: true,
      fadeInUs: 0,
      fadeOutUs: 0,
    });
    return validated(draft);
  })();
  const clipId = 'clip-audio';

  it('leaves the map of TrimClipStart where it is', () => {
    const result = apply(reversed, { type: 'TrimClipStart', clipId, startUs: 1_250_000 });
    expect(clipOf(result.document, clipId)).toMatchObject({
      startUs: 1_250_000,
      durationUs: 750_000,
      sourceStartUs: 2_000_000,
    });
  });

  it('advances the map of TrimClipEnd by the part cut off', () => {
    const result = apply(reversed, { type: 'TrimClipEnd', clipId, endUs: 1_500_000 });
    // At scene time 1 s it still shows F′(499 999) = 2 500 000 + 499 999 = 2 999 999.
    expect(clipOf(result.document, clipId)).toMatchObject({
      startUs: 1_000_000,
      durationUs: 500_000,
      sourceStartUs: 2_500_000,
    });
  });

  it('advances the first half of SplitClip by the second, and keeps the second', () => {
    const result = apply(reversed, {
      type: 'SplitClip',
      clipId,
      atUs: 1_250_000,
      newClipId: 'clip-tail',
    });
    expect(clipOf(result.document, clipId)).toMatchObject({
      durationUs: 250_000,
      sourceStartUs: 2_750_000,
    });
    expect(clipOf(result.document, 'clip-tail')).toMatchObject({
      startUs: 1_250_000,
      durationUs: 750_000,
      sourceStartUs: 2_000_000,
    });
  });

  it('carries a remainder through a split at another speed', () => {
    const draft = structuredClone(referenceComposition) as { clips: Record<string, unknown>[] };
    Object.assign(draft.clips[0] ?? {}, {
      startUs: 0,
      durationUs: 1_000_000,
      sourceStartUs: 0,
      sourceStartRemainder: 1,
      speed: { num: 2, den: 3 },
      fadeInUs: 0,
      fadeOutUs: 0,
    });
    const result = apply(validated(draft), {
      type: 'SplitClip',
      clipId,
      atUs: 1_000,
      newClipId: 'clip-tail',
    });
    // The exact source start of the second half is (1 + 1 000 · 2) / 3 = 667 µs exactly.
    expect(clipOf(result.document, 'clip-tail')).toMatchObject({
      sourceStartUs: 667,
      sourceStartRemainder: 0,
    });
  });
});
