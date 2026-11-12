/**
 * The assistant can do what the user can (owner, 2026-11-11; D82.9): a
 * fixture of requests a model receives, each with the tool calls that carry it
 * out and the document they must give, written out by hand. Every call goes
 * through `executeTool` alone, on the host's bus, so speed, the freeze frame in
 * both modes, and reverse are each reached by a tool, and each is one undo.
 */
import { createCommandBus, type CommandBus, type MediaFacts } from '@kadrion/editor-sdk';
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { executeTool, type ToolBus } from '../src/index.js';

import { codeOf, json, stateOf } from './support.js';

const VIDEO_HASH = `sha256:${'b'.repeat(64)}`;
const AUDIO_HASH = 'sha256:a383506e57b39f51b8952cff8a82f2a058e4d07b8c970068b8af84f72d058f97';

/** A video of 10 s, silent, and the reference sound of 20 s. */
function mediaFacts(contentHash: string): MediaFacts | null {
  if (contentHash === VIDEO_HASH) {
    return { type: 'video', durationUs: 10_000_000, audioDurationUs: null };
  }
  return contentHash === AUDIO_HASH ? { type: 'audio', durationUs: 20_000_000 } : null;
}

type Node = Record<string, unknown>;
interface Draft {
  assets: Node[];
  scenes: { nodes: Node[] }[];
}

function video(id: string, startUs: number, sourceStartUs: number): Node {
  return {
    id,
    type: 'video',
    startUs,
    durationUs: 4_000_000,
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    origin: { x: 0, y: 0 },
    opacity: 1,
    animations: [],
    assetId: 'asset-video',
    sourceStartUs,
    sourceStartRemainder: 0,
    speed: { num: 1, den: 1 },
    reverse: false,
    width: 1080,
    height: 1920,
    fit: 'cover',
    focus: { x: 500, y: 500 },
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
    cornerRadius: 0,
    volume: 0,
    effects: [],
    mask: { kind: 'none' },
    matte: { kind: 'none' },
    blendMode: 'normal',
  };
}

/**
 * The reference composition with two clips of one video on the top layer, one
 * after the other: `node-video-a` from 0 to 4 s showing its source from 0, and
 * `node-video-b`, the last clip, from 4 s to 8 s showing it from 4 s.
 */
function start(): Draft {
  const draft = structuredClone(referenceComposition) as Draft;
  draft.assets.push({ id: 'asset-video', type: 'video', contentHash: VIDEO_HASH });
  draft.scenes[0]?.nodes.push(
    video('node-video-a', 0, 0),
    video('node-video-b', 4_000_000, 4_000_000),
  );
  return draft;
}

/** The node of a draft by its ID, to write an expected document by hand. */
function nodeOf(draft: Draft, id: string): Node {
  const node = draft.scenes[0]?.nodes.find((candidate) => candidate['id'] === id);
  if (node === undefined) throw new Error(`No node ${id}.`);
  return node;
}

/** The expected document: the start with `edit` applied to a copy. */
function expected(edit: (draft: Draft) => void): string {
  const draft = start();
  edit(draft);
  return json(draft);
}

interface Request {
  readonly request: string;
  readonly calls: readonly { readonly name: string; readonly arguments: unknown }[];
  readonly expected: string;
}

const REQUESTS: readonly Request[] = [
  {
    request: 'Slow this clip to half speed.',
    calls: [{ name: 'set_clip_speed', arguments: { clipId: 'node-video-a', speed: 'x0.5' } }],
    // Twice as long, the same 4 s of source; nothing after it moves.
    expected: expected((draft) => {
      Object.assign(nodeOf(draft, 'node-video-a'), {
        durationUs: 8_000_000,
        speed: { num: 1, den: 2 },
      });
    }),
  },
  {
    request: 'Play it at x2.',
    calls: [{ name: 'set_clip_speed', arguments: { clipId: 'node-video-a', speed: 2 } }],
    expected: expected((draft) => {
      Object.assign(nodeOf(draft, 'node-video-a'), {
        durationUs: 2_000_000,
        speed: { num: 2, den: 1 },
      });
    }),
  },
  {
    request: 'Play it at a third of its speed.',
    calls: [{ name: 'set_clip_speed', arguments: { clipId: 'node-video-a', speed: 'x1/3' } }],
    expected: expected((draft) => {
      Object.assign(nodeOf(draft, 'node-video-a'), {
        durationUs: 12_000_000,
        speed: { num: 1, den: 3 },
      });
    }),
  },
  {
    request: 'Freeze the frame at 3 s for 2 s.',
    calls: [
      {
        name: 'freeze_frame',
        arguments: {
          clipId: 'node-video-a',
          atUs: 3_000_000,
          holdUs: 2_000_000,
          mode: 'insert',
          newClipIds: ['node-video-a-freeze', 'node-video-a-rest'],
        },
      },
    ],
    // The clip cut at 3 s, the frame at 3 s held from 3 s to 5 s, and the rest a
    // second from 5 s; the last clip does not move (no ripple, D82.9).
    expected: expected((draft) => {
      const nodes = draft.scenes[0]?.nodes ?? [];
      const first = nodeOf(draft, 'node-video-a');
      first['durationUs'] = 3_000_000;
      const freeze = {
        ...video('node-video-a-freeze', 3_000_000, 3_000_000),
        durationUs: 2_000_000,
        speed: { num: 0, den: 1 },
      };
      const rest = {
        ...video('node-video-a-rest', 5_000_000, 3_000_000),
        durationUs: 1_000_000,
      };
      nodes.splice(nodes.indexOf(first) + 1, 0, freeze, rest);
    }),
  },
  {
    request: 'Hold the frame at 1 s for 2 s, over the clip.',
    calls: [
      {
        name: 'freeze_frame',
        arguments: {
          clipId: 'node-video-a',
          atUs: 1_000_000,
          holdUs: 2_000_000,
          mode: 'overwrite',
          newClipIds: ['node-video-a-freeze', 'node-video-a-rest'],
        },
      },
    ],
    // The part from 1 s to 3 s becomes the frame at 1 s; nothing moves.
    expected: expected((draft) => {
      const nodes = draft.scenes[0]?.nodes ?? [];
      const first = nodeOf(draft, 'node-video-a');
      first['durationUs'] = 1_000_000;
      const freeze = {
        ...video('node-video-a-freeze', 1_000_000, 1_000_000),
        durationUs: 2_000_000,
        speed: { num: 0, den: 1 },
      };
      const rest = {
        ...video('node-video-a-rest', 3_000_000, 3_000_000),
        durationUs: 1_000_000,
      };
      nodes.splice(nodes.indexOf(first) + 1, 0, freeze, rest);
    }),
  },
  {
    request: 'Play the last clip backwards.',
    calls: [{ name: 'set_clip_reverse', arguments: { clipId: 'node-video-b', reverse: true } }],
    expected: expected((draft) => {
      nodeOf(draft, 'node-video-b')['reverse'] = true;
    }),
  },
  {
    request:
      'Freeze the first clip on its first frame for 1 s, and play the last one backwards, in one step.',
    calls: [
      {
        name: 'run_transaction',
        arguments: {
          calls: [
            {
              name: 'set_clip_speed',
              arguments: { clipId: 'node-video-a', speed: 'x0', durationUs: 1_000_000 },
            },
            { name: 'set_clip_reverse', arguments: { clipId: 'node-video-b', reverse: true } },
          ],
        },
      },
    ],
    expected: expected((draft) => {
      Object.assign(nodeOf(draft, 'node-video-a'), {
        durationUs: 1_000_000,
        speed: { num: 0, den: 1 },
      });
      nodeOf(draft, 'node-video-b')['reverse'] = true;
    }),
  },
];

function busOf(): CommandBus {
  return createCommandBus(start(), { mediaFacts });
}

/** The capabilities `executeTool` is given and nothing else (D46.4). */
function toolBus(bus: CommandBus): ToolBus {
  return Object.freeze({
    getDocument: () => bus.getDocument(),
    dispatch: (command: unknown) => bus.dispatch(command),
    dispatchTransaction: (commands: unknown) => bus.dispatchTransaction(commands),
  });
}

describe('a model reaches speed, the freeze frame, and reverse through executeTool alone (D82.9)', () => {
  it.each(REQUESTS.map((row) => [row.request, row]))('%s', (_, { calls, expected: after }) => {
    const bus = busOf();
    const before = json(bus.getDocument());
    for (const call of calls) executeTool(toolBus(bus), call.name, call.arguments);
    expect(json(bus.getDocument())).toBe(after);
    // Each request is one step: one undo restores every byte.
    bus.undo();
    expect(json(bus.getDocument())).toBe(before);
    expect(bus.canUndo()).toBe(false);
  });

  it('reads each speed back as a multiplier from describe_document', () => {
    const bus = busOf();
    executeTool(toolBus(bus), 'set_clip_speed', { clipId: 'node-video-a', speed: 0.5 });
    executeTool(toolBus(bus), 'set_clip_reverse', { clipId: 'node-video-b', reverse: true });
    const result = executeTool(toolBus(bus), 'describe_document', {});
    if (result.kind !== 'description') throw new Error('describe_document described nothing.');
    const nodes = result.description.scenes[0]?.nodes ?? [];
    const fields = (id: string) => nodes.find((node) => node.id === id)?.fields;
    expect(fields('node-video-a')).toMatchObject({ speed: 'x0.5', reverse: false });
    expect(fields('node-video-b')).toMatchObject({ speed: 'x1', reverse: true });
  });

  it('refuses a speed with no exact fraction, naming the one to call again with', () => {
    const bus = busOf();
    const before = stateOf(bus);
    expect(() =>
      executeTool(toolBus(bus), 'set_clip_speed', { clipId: 'node-video-a', speed: 'x0.3333' }),
    ).toThrow(/the nearest is x1\/3/);
    expect(
      codeOf(() =>
        executeTool(toolBus(bus), 'set_clip_speed', { clipId: 'node-video-a', speed: 'x0.3333' }),
      ),
    ).toBe('speed-invalid');
    expect(stateOf(bus)).toEqual(before);
    executeTool(toolBus(bus), 'set_clip_speed', { clipId: 'node-video-a', speed: 'x1/3' });
    expect(json(bus.getDocument())).toBe(REQUESTS[2]?.expected);
  });

  it('refuses a freeze of an audio clip, and leaves the document as it was', () => {
    const bus = busOf();
    const before = stateOf(bus);
    expect(
      codeOf(() =>
        executeTool(toolBus(bus), 'freeze_frame', {
          clipId: 'clip-audio',
          atUs: 1_000_000,
          holdUs: 1_000_000,
          mode: 'insert',
          newClipIds: ['clip-audio-freeze', 'clip-audio-rest'],
        }),
      ),
    ).toBe('unsupported-node');
    expect(
      codeOf(() =>
        executeTool(toolBus(bus), 'set_clip_speed', { clipId: 'clip-audio', speed: 'x0' }),
      ),
    ).toBe('speed-invalid');
    expect(stateOf(bus)).toEqual(before);
  });
});
