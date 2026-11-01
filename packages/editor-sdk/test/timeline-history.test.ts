/**
 * A property of the history under the timeline commands (D30.9, D38, D55):
 * over long, seeded, and therefore reproducible sequences of moves, trims,
 * splits, and joins of nodes, a group, a video with sound, and audio clips —
 * valid ones, no-ops, and refusals mixed — with undos and redos between them,
 * the bus behaves exactly like a model of two stacks of document snapshots.
 * Every undo restores the byte-identical earlier document and every redo the
 * later one; a refusal changes neither the document nor a stack; a no-op
 * records nothing. And each split's inverse, applied on its own, is the
 * identity, as is the split of each join.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { scenesComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createCommandBus,
  EditorError,
  type Command,
  type MediaFacts,
} from '../src/index.js';

import { json, validated, VIDEO_ASSET, VIDEO_NODE } from './support.js';

/** A small seeded generator (mulberry32), so every run replays the same sequence. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(next: () => number, items: readonly T[]): T {
  const item = items[Math.floor(next() * items.length)];
  if (item === undefined) throw new Error('Empty choice.');
  return item;
}

/** The scenes fixture with a heard video and a group of two texts in the middle scene. */
function start(): ValidatedComposition {
  const draft = structuredClone(scenesComposition) as {
    assets: unknown[];
    scenes: { nodes: unknown[] }[];
  };
  draft.assets.push(structuredClone(VIDEO_ASSET));
  const middle = draft.scenes[1];
  middle?.nodes.push({ ...structuredClone(VIDEO_NODE), sourceStartUs: 250_000, volume: 1 });
  middle?.nodes.push({
    id: 'middle-group',
    type: 'group',
    startUs: 0,
    durationUs: 1_500_000,
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    opacity: 1,
    animations: [],
    children: [
      {
        id: 'middle-caption',
        type: 'text',
        startUs: 100_000,
        durationUs: 1_000_000,
        position: { x: 90, y: 300 },
        scale: { x: 1, y: 1 },
        opacity: 1,
        animations: [
          {
            id: 'middle-caption-a-opacity',
            property: 'opacity',
            interpolation: 'linear',
            keyframes: [
              { timeUs: 100_000, value: 0 },
              { timeUs: 600_000, value: 1 },
            ],
          },
        ],
        text: 'Caption',
        fontAssetId: 'asset-font',
        fontSize: 64,
        color: '#ffffff',
      },
    ],
  });
  return validated(draft);
}

const AUDIO_HASH = validated(scenesComposition).assets.find(
  ({ type }) => type === 'audio',
)?.contentHash;

function mediaFacts(contentHash: string): MediaFacts | null {
  if (contentHash === AUDIO_HASH) return { type: 'audio', durationUs: 5_000_000 };
  if (contentHash === VIDEO_ASSET.contentHash) {
    return { type: 'video', durationUs: 4_000_000, audioDurationUs: 4_000_000 };
  }
  return null;
}

/** The fixture's clips, some IDs the sequence creates, and some that name nothing. */
const CLIP_IDS = [
  'intro-title',
  'intro-background',
  'middle-image',
  'middle-html',
  'middle-voice',
  'middle-group',
  'middle-caption',
  'node-video',
  'outro-title',
  'clip-music',
  't1',
  't2',
  't3',
  'nothing',
] as const;
const NEW_IDS = ['t1', 't2', 't3', 'intro-title', 'not an id'] as const;
/** Times on and off the 125 µs grid, inside and outside the clips, and out of bounds. */
const TIMES = [
  0, 1, 125_000, 250_000, 333_333, 375_000, 500_000, 625_000, 750_000, 999_999, 1_000_000,
  1_250_000, 1_500_000, 2_200_000, 6_000_000, -1, 0.5,
] as const;

function command(next: () => number): Command {
  const clipId = pick(next, CLIP_IDS);
  const time = pick(next, TIMES);
  switch (pick(next, ['move', 'trimStart', 'trimEnd', 'split', 'split', 'join', 'join'] as const)) {
    case 'move':
      return { type: 'MoveClip', clipId, startUs: time };
    case 'trimStart':
      return { type: 'TrimClipStart', clipId, startUs: time };
    case 'trimEnd':
      return { type: 'TrimClipEnd', clipId, endUs: time };
    case 'split':
      return { type: 'SplitClip', clipId, atUs: time, newClipId: pick(next, NEW_IDS) };
    case 'join':
      // Mostly a half a split created, so that some joins apply.
      return {
        type: 'JoinClips',
        clipId,
        nextClipId: pick(next, ['t1', 't2', 't3', 't1', 't2', 't3', ...CLIP_IDS]),
      };
  }
}

/** Runs one seeded sequence against the model and returns how many edits it committed. */
function run(seed: number, steps: number): { committed: number; refused: number; joined: number } {
  const next = random(seed);
  const bus = createCommandBus(start(), { mediaFacts });
  // The model: every document the history can reach, and where the bus is.
  const snapshots = [json(bus.getDocument())];
  let at = 0;
  let committed = 0;
  let refused = 0;
  let joined = 0;
  for (let step = 0; step < steps; step += 1) {
    const roll = next();
    if (roll < 0.15) {
      if (at === 0) {
        expect(bus.canUndo()).toBe(false);
        continue;
      }
      bus.undo();
      at -= 1;
    } else if (roll < 0.25) {
      if (at === snapshots.length - 1) {
        expect(bus.canRedo()).toBe(false);
        continue;
      }
      bus.redo();
      at += 1;
    } else {
      const payload = command(next);
      const before = bus.getDocument();
      let result;
      try {
        result = bus.dispatch(payload);
      } catch (reason) {
        if (!(reason instanceof EditorError)) throw reason;
        refused += 1;
        expect(json(bus.getDocument()), `${String(seed)}:${String(step)}`).toBe(snapshots[at]);
        expect(bus.canUndo()).toBe(at > 0);
        expect(bus.canRedo()).toBe(at < snapshots.length - 1);
        continue;
      }
      if (result.inverse === null) {
        expect(json(result.document)).toBe(snapshots[at]);
        continue;
      }
      committed += 1;
      if (payload.type === 'JoinClips') joined += 1;
      // The inverse alone, outside the bus, restores the exact text (D30.5).
      const undone = applyCommand(result.document, result.inverse, { mediaFacts }).document;
      expect(json(undone)).toBe(json(before));
      snapshots.splice(at + 1, snapshots.length, json(result.document));
      at += 1;
    }
    expect(json(bus.getDocument()), `${String(seed)}:${String(step)}`).toBe(snapshots[at]);
  }
  // Unwinding the whole history ends at the start, byte for byte.
  while (bus.canUndo()) bus.undo();
  expect(json(bus.getDocument())).toBe(snapshots[0]);
  while (bus.canRedo()) bus.redo();
  expect(json(bus.getDocument())).toBe(snapshots[snapshots.length - 1]);
  return { committed, refused, joined };
}

describe('the history of the timeline commands against a model of snapshots (D38, D55)', () => {
  it('holds over seeded sequences, each with edits and refusals', () => {
    let committed = 0;
    let refused = 0;
    let joined = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const counts = run(seed, 150);
      committed += counts.committed;
      refused += counts.refused;
      joined += counts.joined;
    }
    // The sequences exercise both outcomes, so the property means something.
    expect(committed).toBeGreaterThan(500);
    expect(refused).toBeGreaterThan(500);
    // A join as a command of its own is rarer: the undo of every split is one, too.
    expect(joined).toBeGreaterThan(5);
  });
});
