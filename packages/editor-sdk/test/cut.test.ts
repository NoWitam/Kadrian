/**
 * A transition at a cut (D66): `clipTransitionAtCut` turns two clips that meet
 * end to end into an overlap and a clip transition, as commands of one
 * transaction. The document is the first scene of the clip transitions
 * fixture with two images and two videos that meet at cuts and no
 * transitions; the video lasts 3 s by the facts given here.
 */
import { clipTransitionsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  clipTransitionAtCut,
  clipTransitionAtCutArgumentsSchema,
  createCommandBus,
  type MediaFactsLookup,
} from '../src/index.js';

import { codeOf, errorOf, json, validated, VIDEO_ASSET, VIDEO_NODE } from './support.js';

const FACTS: MediaFactsLookup = (contentHash) =>
  contentHash === VIDEO_ASSET.contentHash ? { type: 'video', durationUs: 3_000_000 } : null;

type Mutable = Record<string, unknown> & { scenes: { nodes: Record<string, unknown>[] }[] };

function cutDocument() {
  const draft = structuredClone(clipTransitionsComposition) as Mutable;
  const [scene] = draft.scenes;
  if (scene === undefined) throw new Error('No scene.');
  const [background, first, second] = scene.nodes;
  if (background === undefined || first === undefined || second === undefined) {
    throw new Error('Unexpected scene.');
  }
  const video = (id: string, startUs: number, durationUs: number, sourceStartUs: number) => ({
    ...VIDEO_NODE,
    id,
    startUs,
    durationUs,
    sourceStartUs,
  });
  scene.nodes = [
    background,
    { ...first, startUs: 0, durationUs: 800_000 },
    { ...second, startUs: 800_000, durationUs: 800_000 },
    // The first video plays its source up to its last instant, the second from its first.
    video('video-a', 1_600_000, 1_000_000, 2_000_000),
    video('video-b', 2_600_000, 1_000_000, 0),
  ];
  Object.assign(scene, { transitions: [] });
  draft.scenes = [scene];
  draft['transitions'] = [];
  draft['durationUs'] = (scene as unknown as { durationUs: number }).durationUs;
  draft['assets'] = [...(draft['assets'] as unknown[]), VIDEO_ASSET];
  return validated(draft);
}

const document = cutDocument();

function bus() {
  return createCommandBus(document, { mediaFacts: FACTS });
}

function transition(durationUs: number, from = 'up-clip-0', to = 'up-clip-1') {
  return {
    id: 'cut-push',
    fromNodeId: from,
    toNodeId: to,
    durationUs,
    effect: { kind: 'push', direction: 'left' },
    easing: { kind: 'linear' },
  };
}

function lifetime(source: unknown, id: string): [number, number] {
  const nodes = (
    source as { scenes: { nodes: { id: string; startUs: number; durationUs: number }[] }[] }
  ).scenes[0]?.nodes;
  const node = nodes?.find((item) => item.id === id);
  if (node === undefined) throw new Error(`No node ${id}.`);
  return [node.startUs, node.durationUs];
}

describe('clipTransitionAtCut (D66)', () => {
  it.each([
    ['start', [0, 1_000_000], [800_000, 800_000], 2],
    ['end', [0, 800_000], [600_000, 1_000_000], 2],
    ['center', [0, 900_000], [700_001, 899_999], 3],
  ] as const)(
    'with alignment %s makes the overlap on the right side of the cut, in one step',
    (alignment, from, to, commands) => {
      const durationUs = alignment === 'center' ? 199_999 : 200_000;
      const built = clipTransitionAtCut(document, {
        transition: transition(durationUs),
        alignment,
      });
      expect(built).toHaveLength(commands);
      expect(built.at(-1)?.type).toBe('AddClipTransition');
      const editor = bus();
      editor.dispatchTransaction(built);
      const after = editor.getDocument();
      expect(lifetime(after, 'up-clip-0')).toEqual(from);
      expect(lifetime(after, 'up-clip-1')).toEqual(to);
      const scene = (after as unknown as { scenes: { transitions: { id: string }[] }[] }).scenes[0];
      expect(scene?.transitions.map(({ id }) => id)).toEqual(['cut-push']);
      // One step, and its undo restores the document byte for byte.
      expect(editor.canUndo()).toBe(true);
      editor.undo();
      expect(editor.canUndo()).toBe(false);
      expect(json(editor.getDocument())).toBe(json(document));
    },
  );

  it('reads the document and changes nothing', () => {
    const before = json(document);
    clipTransitionAtCut(document, { transition: transition(200_000), alignment: 'center' });
    expect(json(document)).toBe(before);
  });

  it('refuses two clips that do not meet at a cut with not-a-cut, naming both', () => {
    const error = errorOf(() =>
      clipTransitionAtCut(document, {
        transition: transition(200_000, 'up-clip-0', 'video-a'),
        alignment: 'start',
      }),
    );
    expect([error.code, error.details]).toEqual(['not-a-cut', ['up-clip-0', 'video-a']]);
  });

  it('refuses an incoming clip that would start before its scene with no-room-at-cut', () => {
    const error = errorOf(() =>
      clipTransitionAtCut(document, {
        transition: transition(900_000),
        alignment: 'end',
      }),
    );
    expect([error.code, error.details]).toEqual(['no-room-at-cut', ['up-clip-1']]);
  });

  it('refuses a clip the document lacks with unknown-node', () => {
    const error = errorOf(() =>
      clipTransitionAtCut(document, {
        transition: transition(200_000, 'up-clip-0', 'missing'),
        alignment: 'start',
      }),
    );
    expect([error.code, error.details]).toEqual(['unknown-node', ['missing']]);
  });

  it.each([
    ['no object', 5],
    ['an unknown field', { transition: transition(200_000), alignment: 'start', extra: 1 }],
    ['a missing alignment', { transition: transition(200_000) }],
    ['an unknown alignment', { transition: transition(200_000), alignment: 'middle' }],
    ['a transition that is no object', { transition: [], alignment: 'start' }],
    ['an empty node ID', { transition: transition(200_000, ''), alignment: 'start' }],
    ['a duration of 0', { transition: transition(0), alignment: 'start' }],
    ['a fractional duration', { transition: transition(0.5), alignment: 'start' }],
  ])('refuses %s with invalid-argument', (_, args) => {
    expect(codeOf(() => clipTransitionAtCut(document, args))).toBe('invalid-argument');
  });

  it('leaves a clip without enough source to the bus, which names it, and changes nothing', () => {
    const editor = bus();
    // video-a plays its source to its end: lasting longer needs source it lacks.
    const built = clipTransitionAtCut(document, {
      transition: transition(200_000, 'video-a', 'video-b'),
      alignment: 'start',
    });
    const error = errorOf(() => editor.dispatchTransaction(built));
    expect(error.code).toBe('source-range-exceeded');
    expect(error.details).toEqual([
      'video-a: samples 2000000 to 3200000 µs of a source of 3000000 µs',
    ]);
    expect(json(editor.getDocument())).toBe(json(document));
    expect(editor.canUndo()).toBe(false);
  });

  it('has an arguments schema that requires the two clips and the duration', () => {
    expect(clipTransitionAtCutArgumentsSchema.required).toEqual(['transition', 'alignment']);
    expect(clipTransitionAtCutArgumentsSchema.properties.transition.required).toEqual([
      'fromNodeId',
      'toNodeId',
      'durationUs',
    ]);
    expect(Object.isFrozen(clipTransitionAtCutArgumentsSchema)).toBe(true);
  });
});
