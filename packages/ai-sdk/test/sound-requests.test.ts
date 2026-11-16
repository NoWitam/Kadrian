/**
 * The assistant can do what the user can (owner, 2026-11-11; D85.8): a
 * fixture of requests a model receives about a video's fades and volume
 * curves, each with the tool calls that carry it out and the document they
 * must give, written out by hand. Every call goes through `executeTool` alone,
 * on the host's bus, and each request is one undo.
 */
import { createCommandBus, type CommandBus, type MediaFacts } from '@kadrion/editor-sdk';
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { executeTool, type ToolBus } from '../src/index.js';

import { codeOf, json, stateOf } from './support.js';

const INTERVIEW_HASH = `sha256:${'d'.repeat(64)}`;
const MUSIC_HASH = `sha256:${'e'.repeat(64)}`;
const AUDIO_HASH = 'sha256:a383506e57b39f51b8952cff8a82f2a058e4d07b8c970068b8af84f72d058f97';

/** An interview of 40 s with its sound, music of 60 s, and the reference sound of 20 s. */
function mediaFacts(contentHash: string): MediaFacts | null {
  if (contentHash === INTERVIEW_HASH) {
    return { type: 'video', durationUs: 40_000_000, audioDurationUs: 40_000_000 };
  }
  if (contentHash === MUSIC_HASH) return { type: 'audio', durationUs: 60_000_000 };
  return contentHash === AUDIO_HASH ? { type: 'audio', durationUs: 20_000_000 } : null;
}

type Node = Record<string, unknown>;
interface Draft {
  durationUs: number;
  assets: Node[];
  clips: Node[];
  scenes: { durationUs: number; nodes: Node[] }[];
}

const SECOND = 1_000_000;

/** A keyframe of a volume curve. */
function key(timeUs: number, value: number, kind: 'linear' | 'hold' = 'linear'): Node {
  return { timeUs, value, easing: { kind } };
}

/**
 * The reference composition lengthened to 40 s, with the interview heard at
 * full volume over the whole scene on the top layer (`node-interview`) and the
 * music as a clip of the composition (`clip-music`), both without fades or
 * curves.
 */
function start(): Draft {
  const draft = structuredClone(referenceComposition) as Draft;
  draft.durationUs = 40 * SECOND;
  const scene = draft.scenes[0];
  if (scene === undefined) throw new Error('The fixture has no scene.');
  scene.durationUs = 40 * SECOND;
  draft.assets.push(
    { id: 'asset-interview', type: 'video', contentHash: INTERVIEW_HASH },
    { id: 'asset-music', type: 'audio', contentHash: MUSIC_HASH },
  );
  scene.nodes.push({
    id: 'node-interview',
    type: 'video',
    startUs: 0,
    durationUs: 40 * SECOND,
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    origin: { x: 0, y: 0 },
    opacity: 1,
    animations: [],
    assetId: 'asset-interview',
    sourceStartUs: 0,
    sourceStartRemainder: 0,
    speed: { num: 1, den: 1 },
    reverse: false,
    width: 1080,
    height: 1920,
    fit: 'cover',
    focus: { x: 500, y: 500 },
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
    cornerRadius: 0,
    volume: 1,
    fadeInUs: 0,
    fadeOutUs: 0,
    effects: [],
    mask: { kind: 'none' },
    matte: { kind: 'none' },
    blendMode: 'normal',
  });
  draft.clips.push({
    id: 'clip-music',
    type: 'audio',
    assetId: 'asset-music',
    startUs: 0,
    durationUs: 40 * SECOND,
    sourceStartUs: 0,
    sourceStartRemainder: 0,
    speed: { num: 1, den: 1 },
    reverse: false,
    volume: 0.8,
    fadeInUs: 0,
    fadeOutUs: 0,
    animations: [],
  });
  return draft;
}

function interviewOf(draft: Draft): Node {
  const node = draft.scenes[0]?.nodes.find((candidate) => candidate['id'] === 'node-interview');
  if (node === undefined) throw new Error('No interview.');
  return node;
}

function musicOf(draft: Draft): Node {
  const clip = draft.clips.find((candidate) => candidate['id'] === 'clip-music');
  if (clip === undefined) throw new Error('No music.');
  return clip;
}

/** The music lowered to 20% from 0:10 to 0:20, with half a second each way. */
const DIP = {
  id: 'clip-music-a-volume',
  property: 'volume',
  keyframes: [key(9_500_000, 1), key(10 * SECOND, 0.2), key(20 * SECOND, 0.2), key(20_500_000, 1)],
};

/** The start with the dip already on the music. */
function dipped(): Draft {
  const draft = start();
  musicOf(draft)['animations'] = [structuredClone(DIP)];
  return draft;
}

interface Request {
  readonly request: string;
  readonly from: () => Draft;
  readonly calls: readonly { readonly name: string; readonly arguments: unknown }[];
  readonly expected: (draft: Draft) => void;
}

const REQUESTS: readonly Request[] = [
  {
    request: "Fade the interview's sound in over one second.",
    from: start,
    calls: [
      {
        name: 'set_clip_fades',
        arguments: { clipId: 'node-interview', fadeInUs: SECOND, fadeOutUs: 0 },
      },
    ],
    // The sound only: the picture keeps its opacity (D85.1).
    expected: (draft) => {
      interviewOf(draft)['fadeInUs'] = SECOND;
    },
  },
  {
    request: 'Lower the music to 20% from 0:10 to 0:20 with half a second each way.',
    from: start,
    calls: [
      {
        name: 'add_animation',
        arguments: { nodeId: 'clip-music', index: 0, animation: DIP },
      },
    ],
    // A factor of its volume of 0.8, so 0.16 of the source is heard in the dip (D85.2).
    expected: (draft) => {
      musicOf(draft)['animations'] = [structuredClone(DIP)];
    },
  },
  {
    request: 'Make the music hold at half volume after 0:30.',
    from: start,
    calls: [
      {
        name: 'add_animation',
        arguments: {
          nodeId: 'clip-music',
          index: 0,
          animation: {
            id: 'clip-music-a-volume',
            property: 'volume',
            keyframes: [key(0, 1, 'hold'), key(30 * SECOND, 0.5, 'hold')],
          },
        },
      },
    ],
    expected: (draft) => {
      musicOf(draft)['animations'] = [
        {
          id: 'clip-music-a-volume',
          property: 'volume',
          keyframes: [key(0, 1, 'hold'), key(30 * SECOND, 0.5, 'hold')],
        },
      ];
    },
  },
  {
    request: 'Make that dip deeper, down to 10%, and let the music come back abruptly at 0:20.',
    from: dipped,
    calls: [
      {
        name: 'run_transaction',
        arguments: {
          calls: [
            {
              name: 'set_keyframe_value',
              arguments: { animationId: 'clip-music-a-volume', timeUs: 10 * SECOND, value: 0.1 },
            },
            {
              name: 'set_keyframe_value',
              arguments: { animationId: 'clip-music-a-volume', timeUs: 20 * SECOND, value: 0.1 },
            },
            {
              name: 'set_keyframe_easing',
              arguments: {
                animationId: 'clip-music-a-volume',
                timeUs: 20 * SECOND,
                easing: { kind: 'hold' },
              },
            },
            {
              name: 'move_keyframe',
              arguments: {
                animationId: 'clip-music-a-volume',
                timeUs: 20_500_000,
                toTimeUs: 20_000_001,
              },
            },
          ],
        },
      },
    ],
    expected: (draft) => {
      musicOf(draft)['animations'] = [
        {
          ...DIP,
          keyframes: [
            key(9_500_000, 1),
            key(10 * SECOND, 0.1),
            key(20 * SECOND, 0.1, 'hold'),
            key(20_000_001, 1),
          ],
        },
      ];
    },
  },
  {
    request: 'Take the dip off the music, and fade the interview out over its last two seconds.',
    from: dipped,
    calls: [
      {
        name: 'run_transaction',
        arguments: {
          calls: [
            { name: 'remove_animation', arguments: { animationId: 'clip-music-a-volume' } },
            {
              name: 'set_clip_fades',
              arguments: { clipId: 'node-interview', fadeInUs: 0, fadeOutUs: 2 * SECOND },
            },
          ],
        },
      },
    ],
    expected: (draft) => {
      musicOf(draft)['animations'] = [];
      interviewOf(draft)['fadeOutUs'] = 2 * SECOND;
    },
  },
  {
    request: 'Move the music 5 seconds later; its dip goes with it.',
    from: () => {
      const draft = dipped();
      Object.assign(musicOf(draft), { durationUs: 35 * SECOND });
      return draft;
    },
    calls: [{ name: 'move_clip', arguments: { clipId: 'clip-music', startUs: 5 * SECOND } }],
    expected: (draft) => {
      Object.assign(musicOf(draft), {
        startUs: 5 * SECOND,
        durationUs: 35 * SECOND,
        animations: [
          {
            ...DIP,
            keyframes: [
              key(14_500_000, 1),
              key(15 * SECOND, 0.2),
              key(25 * SECOND, 0.2),
              key(25_500_000, 1),
            ],
          },
        ],
      });
    },
  },
];

/** The capabilities `executeTool` is given and nothing else (D46.4). */
function toolBus(bus: CommandBus): ToolBus {
  return Object.freeze({
    getDocument: () => bus.getDocument(),
    dispatch: (command: unknown) => bus.dispatch(command),
    dispatchTransaction: (commands: unknown) => bus.dispatchTransaction(commands),
  });
}

function busOf(draft: Draft): CommandBus {
  return createCommandBus(draft, { mediaFacts });
}

describe("a model reaches a video's fades and volume curves through executeTool alone (D85.8)", () => {
  it.each(REQUESTS.map((row) => [row.request, row]))('%s', (_, row) => {
    const bus = busOf(row.from());
    const before = json(bus.getDocument());
    for (const call of row.calls) executeTool(toolBus(bus), call.name, call.arguments);
    const after = row.from();
    row.expected(after);
    expect(json(bus.getDocument())).toBe(json(after));
    // Each request is one step: one undo restores every byte.
    bus.undo();
    expect(json(bus.getDocument())).toBe(before);
    expect(bus.canUndo()).toBe(false);
  });

  it("reads a video's fades and a clip's curve back from describe_document as stored fields", () => {
    const bus = busOf(dipped());
    executeTool(toolBus(bus), 'set_clip_fades', {
      clipId: 'node-interview',
      fadeInUs: SECOND,
      fadeOutUs: 0,
    });
    const result = executeTool(toolBus(bus), 'describe_document', {});
    if (result.kind !== 'description') throw new Error('describe_document described nothing.');
    const interview = result.description.scenes[0]?.nodes.find(
      (node) => node.id === 'node-interview',
    );
    expect(interview?.fields).toMatchObject({ volume: 1, fadeInUs: SECOND, fadeOutUs: 0 });
    expect(result.description.clips).toContainEqual(
      expect.objectContaining({ id: 'clip-music', animations: [DIP] }),
    );
  });

  it.each([
    [
      'a fade of a text node',
      'set_clip_fades',
      { clipId: 'node-title', fadeInUs: SECOND, fadeOutUs: 0 },
      'unsupported-node',
    ],
    [
      'an easing other than linear or hold',
      'set_keyframe_easing',
      { animationId: 'clip-music-a-volume', timeUs: 10 * SECOND, easing: { kind: 'ease-in' } },
      'invalid-result',
    ],
    [
      'a value that amplifies',
      'set_keyframe_value',
      { animationId: 'clip-music-a-volume', timeUs: 10 * SECOND, value: 1.2 },
      'invalid-result',
    ],
    [
      'a second curve on the music',
      'add_animation',
      { nodeId: 'clip-music', index: 0, animation: { ...DIP, id: 'clip-music-dip' } },
      'duplicate-animation-target',
    ],
  ])('refuses %s, and leaves the document as it was', (_, name, args, code) => {
    const bus = busOf(dipped());
    const before = stateOf(bus);
    expect(codeOf(() => executeTool(toolBus(bus), name, args))).toBe(code);
    expect(stateOf(bus)).toEqual(before);
  });
});
