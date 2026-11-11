/**
 * The commands and the helper of D82.9: `SetClipSpeed`, which takes a speed as
 * a multiplier, a number, or `{ num, den }` and converts it by `parseSpeed`
 * (D82.11); `SetClipReverse`; and `freezeFrame` in modes `overwrite` and
 * `insert`. Each undone leaves the document byte for byte; every form of the
 * table of D82.11 gives its stored speed; every refusal of D82.9 has its code.
 * The frame a clip shows is read by `sourceTimeOfScene` of the schema, whose
 * rule is checked against an independent rational reference there.
 */
import {
  sampledSourceRange,
  sourceTimeOfScene,
  type ClipTiming,
  type ValidatedComposition,
} from '@kadrion/schema';
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  createCommandBus,
  freezeFrame,
  freezeFrameArgumentsSchema,
  parseCommand,
  type CommandBus,
  type MediaFactsLookup,
} from '../src/index.js';

import { codeOf, errorOf, json, validated, VIDEO_ASSET, VIDEO_NODE } from './support.js';

const AUDIO_HASH =
  (referenceComposition as { assets: { type: string; contentHash: string }[] }).assets.find(
    ({ type }) => type === 'audio',
  )?.contentHash ?? '';

/** A video of 60 s with a sound as long, and the reference sound of 60 s. */
const FACTS: MediaFactsLookup = (contentHash) => {
  if (contentHash === VIDEO_ASSET.contentHash) {
    return { type: 'video', durationUs: 60_000_000, audioDurationUs: 60_000_000 };
  }
  return contentHash === AUDIO_HASH ? { type: 'audio', durationUs: 60_000_000 } : null;
};

interface VideoFields {
  readonly startUs?: number;
  readonly durationUs?: number;
  readonly sourceStartUs?: number;
  readonly sourceStartRemainder?: number;
  readonly speed?: { readonly num: number; readonly den: number };
  readonly reverse?: boolean;
  readonly volume?: number;
}

/**
 * The reference composition with a video node from 1 s to 5 s that shows its
 * source from 2 s, with an opacity animation and an effect, so that a copy
 * shows their renaming (D55.3).
 */
function withVideo(fields: VideoFields = {}): ValidatedComposition {
  const draft = structuredClone(referenceComposition) as {
    assets: unknown[];
    scenes: { nodes: unknown[] }[];
  };
  draft.assets.push(structuredClone(VIDEO_ASSET));
  draft.scenes[0]?.nodes.push({
    ...structuredClone(VIDEO_NODE),
    startUs: 1_000_000,
    durationUs: 4_000_000,
    sourceStartUs: 2_000_000,
    animations: [
      {
        id: 'anim-video-opacity',
        property: 'opacity',
        keyframes: [
          { timeUs: 1_000_000, value: 0, easing: { kind: 'linear' } },
          { timeUs: 2_000_000, value: 1, easing: { kind: 'linear' } },
        ],
      },
    ],
    effects: [{ id: 'effect-video-grey', kind: 'grayscale', amount: 1, animations: [] }],
    ...fields,
  });
  return validated(draft);
}

function busOf(document: ValidatedComposition, facts: MediaFactsLookup | null = FACTS): CommandBus {
  return facts === null
    ? createCommandBus(document)
    : createCommandBus(document, { mediaFacts: facts });
}

type Clip = ClipTiming & { readonly id: string; readonly [key: string]: unknown };

/** The node or audio clip of a document by its ID. */
function clipOf(document: unknown, clipId: string): Clip {
  const source = document as { clips: Clip[]; scenes: { nodes: Clip[] }[] };
  const found = [...source.clips, ...(source.scenes[0]?.nodes ?? [])].find(
    ({ id }) => id === clipId,
  );
  if (found === undefined) throw new Error(`No clip ${clipId}.`);
  return found;
}

/** The IDs of the nodes of the first scene, in layer order. */
function nodeIds(document: unknown): string[] {
  return (
    (document as { scenes: { nodes: { id: string }[] }[] }).scenes[0]?.nodes.map(({ id }) => id) ??
    []
  );
}

/** The source time the clip shows at a scene time (D82.1). */
function shown(document: unknown, clipId: string, timeUs: number): number {
  return sourceTimeOfScene(clipOf(document, clipId), timeUs);
}

describe('SetClipSpeed takes a speed in every form of D82.11 (D82.9)', () => {
  const ROWS: readonly [unknown, { num: number; den: number }][] = [
    ['x0.5', { num: 1, den: 2 }],
    [0.5, { num: 1, den: 2 }],
    ['0.5', { num: 1, den: 2 }],
    [
      { num: 1, den: 2 },
      { num: 1, den: 2 },
    ],
    [
      { num: 2, den: 4 },
      { num: 1, den: 2 },
    ],
    ['x2', { num: 2, den: 1 }],
    [2, { num: 2, den: 1 }],
    ['X2', { num: 2, den: 1 }],
    ['×2', { num: 2, den: 1 }],
    [' x2 ', { num: 2, den: 1 }],
    ['x1/3', { num: 1, den: 3 }],
    [
      { num: 1, den: 3 },
      { num: 1, den: 3 },
    ],
    ['x0.333', { num: 333, den: 1000 }],
    ['x1.25', { num: 5, den: 4 }],
    ['x4', { num: 4, den: 1 }],
    ['x0.25', { num: 1, den: 4 }],
    ['x0', { num: 0, den: 1 }],
    [0, { num: 0, den: 1 }],
  ];

  it.each(ROWS)('stores %j as %j on a video, and the undo restores every byte', (speed, stored) => {
    const bus = busOf(withVideo());
    const before = json(bus.getDocument());
    const result = bus.dispatch({ type: 'SetClipSpeed', clipId: 'node-video', speed });
    expect(clipOf(result.document, 'node-video').speed).toEqual(stored);
    // The command, its inverse, and the history hold the exact fraction alone (D82.9).
    expect(result.inverse).toEqual({
      type: 'SetClipSpeed',
      clipId: 'node-video',
      speed: { num: 1, den: 1 },
      durationUs: 4_000_000,
      sourceStartRemainder: 0,
    });
    bus.undo();
    expect(json(bus.getDocument())).toBe(before);
    bus.redo();
    expect(clipOf(bus.getDocument(), 'node-video').speed).toEqual(stored);
  });

  it('parses every form to the exact fraction, so the command holds no multiplier', () => {
    for (const [speed, stored] of ROWS) {
      expect(parseCommand({ type: 'SetClipSpeed', clipId: 'node-video', speed })).toEqual({
        type: 'SetClipSpeed',
        clipId: 'node-video',
        speed: stored,
      });
    }
  });

  it('sets the speed of an audio clip, its sound kept in sync, and the undo restores every byte', () => {
    const bus = busOf(withVideo());
    const before = json(bus.getDocument());
    const result = bus.dispatch({ type: 'SetClipSpeed', clipId: 'clip-audio', speed: 'x2' });
    const clip = clipOf(result.document, 'clip-audio');
    expect(clip.speed).toEqual({ num: 2, den: 1 });
    expect(clip.durationUs).toBe(5_000_000);
    bus.undo();
    expect(json(bus.getDocument())).toBe(before);
  });
});

describe('SetClipSpeed keeps the start, the source start, and the direction (D82.9)', () => {
  it('covers the same source span by default: ⌈durationUs · old / new⌉', () => {
    for (const [from, to, durationUs, expected] of [
      [{ num: 1, den: 1 }, 'x0.5', 4_000_000, 8_000_000],
      [{ num: 1, den: 1 }, 'x2', 4_000_000, 2_000_000],
      [{ num: 1, den: 1 }, 'x3', 1_000_000, 333_334],
      [{ num: 3, den: 2 }, 'x1/3', 1_000_000, 4_500_000],
      [{ num: 1, den: 4 }, 'x4', 1_000_001, 62_501],
    ] as const) {
      const document = withVideo({ speed: from, durationUs });
      const result = busOf(document).dispatch({
        type: 'SetClipSpeed',
        clipId: 'node-video',
        speed: to,
      });
      const after = clipOf(result.document, 'node-video');
      const before = clipOf(document, 'node-video');
      expect(after.durationUs, `${JSON.stringify(from)} to ${to}`).toBe(expected);
      expect(after.startUs).toBe(before.startUs);
      expect(after.sourceStartUs).toBe(before.sourceStartUs);
      expect(after.reverse).toBe(before.reverse);
    }
  });

  it('keeps the duration when either speed is x0, and takes a duration given', () => {
    const frozen = busOf(withVideo()).dispatch({
      type: 'SetClipSpeed',
      clipId: 'node-video',
      speed: 'x0',
    });
    expect(clipOf(frozen.document, 'node-video').durationUs).toBe(4_000_000);
    const thawed = busOf(validated(frozen.document)).dispatch({
      type: 'SetClipSpeed',
      clipId: 'node-video',
      speed: 'x0.5',
    });
    expect(clipOf(thawed.document, 'node-video').durationUs).toBe(4_000_000);
    const given = busOf(withVideo()).dispatch({
      type: 'SetClipSpeed',
      clipId: 'node-video',
      speed: 'x2',
      durationUs: 1_500_000,
    });
    expect(clipOf(given.document, 'node-video').durationUs).toBe(1_500_000);
  });

  it('scales the remainder to the new den, rounded down, or takes the one given', () => {
    const document = withVideo({ speed: { num: 1, den: 4 }, sourceStartRemainder: 3 });
    const scaled = busOf(document).dispatch({
      type: 'SetClipSpeed',
      clipId: 'node-video',
      speed: 'x0.5',
    });
    expect(clipOf(scaled.document, 'node-video').sourceStartRemainder).toBe(1);
    const given = busOf(document).dispatch({
      type: 'SetClipSpeed',
      clipId: 'node-video',
      speed: 'x1/3',
      sourceStartRemainder: 2,
    });
    expect(clipOf(given.document, 'node-video').sourceStartRemainder).toBe(2);
    const frozen = busOf(document).dispatch({
      type: 'SetClipSpeed',
      clipId: 'node-video',
      speed: 'x0',
    });
    expect(clipOf(frozen.document, 'node-video').sourceStartRemainder).toBe(0);
  });

  it('keeps a reversed clip on the same source span by default, still reversed', () => {
    const document = withVideo({ reverse: true });
    const result = busOf(document).dispatch({
      type: 'SetClipSpeed',
      clipId: 'node-video',
      speed: 'x2',
    });
    const after = clipOf(result.document, 'node-video');
    expect(after.reverse).toBe(true);
    // The exact span is [2 s, 6 s) at either speed; at x2 its last sampled instant
    // is one microsecond of source earlier, since each instant covers two (D82.1).
    expect(sampledSourceRange(clipOf(document, 'node-video'), 10_000_000)).toEqual({
      startUs: 2_000_000,
      durationUs: 4_000_000,
    });
    expect(sampledSourceRange(after, 10_000_000)).toEqual({
      startUs: 2_000_000,
      durationUs: 3_999_999,
    });
    // It now starts with the frame the clip showed at its end, and ends with its first.
    expect(shown(result.document, 'node-video', 1_000_000)).toBe(5_999_998);
    expect(shown(result.document, 'node-video', 2_999_999)).toBe(2_000_000);
  });

  it('changes nothing for the speed, duration, and remainder the clip has', () => {
    const bus = busOf(withVideo());
    const result = bus.dispatch({ type: 'SetClipSpeed', clipId: 'node-video', speed: 1 });
    expect(result.inverse).toBeNull();
    expect(bus.canUndo()).toBe(false);
  });
});

describe('SetClipSpeed refuses what D82.9 and D82.11 refuse', () => {
  it('refuses x0.3333 with speed-invalid, naming x1/3', () => {
    const bus = busOf(withVideo());
    const error = errorOf(() =>
      bus.dispatch({ type: 'SetClipSpeed', clipId: 'node-video', speed: 'x0.3333' }),
    );
    expect(error.code).toBe('speed-invalid');
    expect(error.message).toContain('the nearest is x1/3');
    expect(
      codeOf(() => bus.dispatch({ type: 'SetClipSpeed', clipId: 'node-video', speed: 0.1 + 0.2 })),
    ).toBe('speed-invalid');
    expect(bus.canUndo()).toBe(false);
  });

  it('refuses speeds out of bounds or form with speed-invalid, other JSON types with invalid-argument', () => {
    const bus = busOf(withVideo());
    for (const speed of [
      'x0.2',
      'x5',
      'x-2',
      'fast',
      '',
      'x 2',
      '1e0',
      -1,
      0.2,
      5,
      { num: 1 },
      {},
    ]) {
      expect(
        codeOf(() => bus.dispatch({ type: 'SetClipSpeed', clipId: 'node-video', speed })),
        JSON.stringify(speed),
      ).toBe('speed-invalid');
    }
    for (const speed of [true, null, [], ['x2']]) {
      expect(
        codeOf(() => bus.dispatch({ type: 'SetClipSpeed', clipId: 'node-video', speed })),
        JSON.stringify(speed),
      ).toBe('invalid-argument');
    }
    for (const extra of [
      { durationUs: 0 },
      { durationUs: 1.5 },
      { sourceStartRemainder: -1 },
      { sourceStartRemainder: 1000 },
      { reverse: true },
    ]) {
      expect(
        codeOf(() =>
          bus.dispatch({ type: 'SetClipSpeed', clipId: 'node-video', speed: 'x2', ...extra }),
        ),
        JSON.stringify(extra),
      ).toBe('invalid-argument');
    }
  });

  it('refuses x0 for an audio clip and for a reversed clip, and a remainder not below den', () => {
    expect(
      codeOf(() =>
        busOf(withVideo()).dispatch({ type: 'SetClipSpeed', clipId: 'clip-audio', speed: 'x0' }),
      ),
    ).toBe('speed-invalid');
    expect(
      codeOf(() =>
        busOf(withVideo({ reverse: true })).dispatch({
          type: 'SetClipSpeed',
          clipId: 'node-video',
          speed: 'x0',
        }),
      ),
    ).toBe('speed-invalid');
    expect(
      codeOf(() =>
        busOf(withVideo()).dispatch({
          type: 'SetClipSpeed',
          clipId: 'node-video',
          speed: 'x0.5',
          sourceStartRemainder: 2,
        }),
      ),
    ).toBe('speed-invalid');
  });

  it('refuses an unknown clip, a node without a source, and a source the facts do not cover', () => {
    const bus = busOf(withVideo());
    expect(codeOf(() => bus.dispatch({ type: 'SetClipSpeed', clipId: 'gone', speed: 2 }))).toBe(
      'unknown-clip',
    );
    expect(
      codeOf(() => bus.dispatch({ type: 'SetClipSpeed', clipId: 'node-title', speed: 2 })),
    ).toBe('unsupported-node');
    expect(
      codeOf(() =>
        busOf(withVideo(), null).dispatch({ type: 'SetClipSpeed', clipId: 'node-video', speed: 2 }),
      ),
    ).toBe('media-facts-missing');
    // 4 s at x4 read 16 s of source from 2 s: past the end of a 15 s source.
    const short: MediaFactsLookup = (hash) =>
      hash === VIDEO_ASSET.contentHash ? { type: 'video', durationUs: 15_000_000 } : FACTS(hash);
    expect(
      codeOf(() =>
        busOf(withVideo(), short).dispatch({
          type: 'SetClipSpeed',
          clipId: 'node-video',
          speed: 'x4',
          durationUs: 4_000_000,
        }),
      ),
    ).toBe('source-range-exceeded');
  });
});

describe('SetClipReverse (D82.9)', () => {
  it('plays the same source range backwards and forwards again, the undo restoring every byte', () => {
    for (const fields of [{}, { speed: { num: 3, den: 2 }, sourceStartRemainder: 1 }]) {
      const bus = busOf(withVideo(fields));
      const document = bus.getDocument();
      const before = json(document);
      const range = sampledSourceRange(clipOf(bus.getDocument(), 'node-video'), 10_000_000);
      const result = bus.dispatch({ type: 'SetClipReverse', clipId: 'node-video', reverse: true });
      const after = clipOf(result.document, 'node-video');
      expect(after.reverse).toBe(true);
      expect(sampledSourceRange(after, 10_000_000)).toEqual(range);
      // The last instant shows what the first showed, and the first what the last showed.
      expect(shown(result.document, 'node-video', 4_999_999)).toBe(
        shown(document, 'node-video', 1_000_000),
      );
      expect(result.inverse).toEqual({
        type: 'SetClipReverse',
        clipId: 'node-video',
        reverse: false,
      });
      bus.undo();
      expect(json(bus.getDocument())).toBe(before);
    }
  });

  it('reverses an audio clip, and changes nothing for the direction it has', () => {
    const bus = busOf(withVideo());
    const result = bus.dispatch({ type: 'SetClipReverse', clipId: 'clip-audio', reverse: true });
    expect(clipOf(result.document, 'clip-audio').reverse).toBe(true);
    expect(
      bus.dispatch({ type: 'SetClipReverse', clipId: 'clip-audio', reverse: true }).inverse,
    ).toBeNull();
  });

  it('refuses a freeze frame, a node without a source, an unknown clip, and a reverse that is no boolean', () => {
    const frozen = busOf(withVideo({ speed: { num: 0, den: 1 } }));
    expect(
      codeOf(() =>
        frozen.dispatch({ type: 'SetClipReverse', clipId: 'node-video', reverse: true }),
      ),
    ).toBe('speed-invalid');
    const bus = busOf(withVideo());
    expect(
      codeOf(() => bus.dispatch({ type: 'SetClipReverse', clipId: 'node-title', reverse: true })),
    ).toBe('unsupported-node');
    expect(
      codeOf(() => bus.dispatch({ type: 'SetClipReverse', clipId: 'gone', reverse: true })),
    ).toBe('unknown-clip');
    for (const reverse of ['true', 1, null]) {
      expect(
        codeOf(() => bus.dispatch({ type: 'SetClipReverse', clipId: 'node-video', reverse })),
      ).toBe('invalid-argument');
    }
  });
});

describe('freezeFrame holds the frame shown at atUs (D82.3, D82.9)', () => {
  const ARGS = {
    clipId: 'node-video',
    atUs: 3_000_000,
    holdUs: 1_000_000,
    newClipIds: ['node-video-freeze', 'node-video-after'],
  };

  /** Dispatches the helper's transaction; returns the bus, the document before, and the result. */
  function frozen(document: ValidatedComposition, args: unknown) {
    const bus = busOf(document);
    const before = json(bus.getDocument());
    const result = bus.dispatchTransaction(freezeFrame(bus.getDocument(), args));
    return { bus, before, after: result.document, createdIds: result.createdIds };
  }

  it.each([
    ['forwards at speed 1', {}],
    ['forwards at x3/2 with a remainder', { speed: { num: 3, den: 2 }, sourceStartRemainder: 1 }],
    ['reversed at x1/3', { speed: { num: 1, den: 3 }, reverse: true }],
  ])(
    'overwrite, %s: the middle is frozen, the rest shows what it showed, one undo',
    (_, fields) => {
      const document = withVideo(fields);
      const { bus, before, after } = frozen(document, { ...ARGS, mode: 'overwrite' });
      const freeze = clipOf(after, 'node-video-freeze');
      expect(freeze).toMatchObject({
        startUs: 3_000_000,
        durationUs: 1_000_000,
        sourceStartUs: shown(document, 'node-video', 3_000_000),
        sourceStartRemainder: 0,
        speed: { num: 0, den: 1 },
        reverse: false,
      });
      for (let timeUs = 3_000_000; timeUs < 4_000_000; timeUs += 99_999) {
        expect(shown(after, 'node-video-freeze', timeUs)).toBe(
          shown(document, 'node-video', 3_000_000),
        );
      }
      for (const [clipId, timeUs] of [
        ['node-video', 1_000_000],
        ['node-video', 2_999_999],
        ['node-video-after', 4_000_000],
        ['node-video-after', 4_999_999],
      ] as const) {
        expect(shown(after, clipId, timeUs)).toBe(shown(document, 'node-video', timeUs));
      }
      expect(clipOf(after, 'node-video').durationUs).toBe(2_000_000);
      expect(clipOf(after, 'node-video-after')).toMatchObject({
        startUs: 4_000_000,
        durationUs: 1_000_000,
      });
      expect(nodeIds(after).slice(-3)).toEqual([
        'node-video',
        'node-video-freeze',
        'node-video-after',
      ]);
      bus.undo();
      expect(json(bus.getDocument())).toBe(before);
    },
  );

  it('overwrite up to the end of the clip makes no part after it', () => {
    const document = withVideo();
    const { after, createdIds } = frozen(document, {
      ...ARGS,
      holdUs: 2_000_000,
      mode: 'overwrite',
    });
    expect(clipOf(after, 'node-video-freeze')).toMatchObject({
      startUs: 3_000_000,
      durationUs: 2_000_000,
      speed: { num: 0, den: 1 },
    });
    expect(nodeIds(after)).not.toContain('node-video-after');
    expect(createdIds).not.toContain('node-video-after');
  });

  it.each([
    ['forwards at speed 1', {}],
    ['forwards at x1/4 with a remainder', { speed: { num: 1, den: 4 }, sourceStartRemainder: 3 }],
    ['reversed at x2', { speed: { num: 2, den: 1 }, reverse: true }],
  ])('insert, %s: the freeze between the halves, the second half later, one undo', (_, fields) => {
    const document = withVideo(fields);
    const { bus, before, after, createdIds } = frozen(document, { ...ARGS, mode: 'insert' });
    const freeze = clipOf(after, 'node-video-freeze');
    expect(freeze).toMatchObject({
      startUs: 3_000_000,
      durationUs: 1_000_000,
      sourceStartUs: shown(document, 'node-video', 3_000_000),
      sourceStartRemainder: 0,
      speed: { num: 0, den: 1 },
      reverse: false,
    });
    // The animations and effects a split copies, renamed after the freeze frame (D55.3).
    expect(freeze['animations']).toEqual([
      {
        id: 'node-video-freeze-a-opacity',
        property: 'opacity',
        keyframes: [
          { timeUs: 1_000_000, value: 0, easing: { kind: 'linear' } },
          { timeUs: 2_000_000, value: 1, easing: { kind: 'linear' } },
        ],
      },
    ]);
    expect(freeze['effects']).toEqual([
      { id: 'node-video-freeze-e0', kind: 'grayscale', amount: 1, animations: [] },
    ]);
    // The second half shows, holdUs later, what the clip showed there.
    for (const timeUs of [3_000_000, 3_000_001, 4_123_457, 4_999_999]) {
      expect(shown(after, 'node-video-after', timeUs + 1_000_000)).toBe(
        shown(document, 'node-video', timeUs),
      );
    }
    for (const timeUs of [1_000_000, 2_999_999]) {
      expect(shown(after, 'node-video', timeUs)).toBe(shown(document, 'node-video', timeUs));
    }
    expect(clipOf(after, 'node-video-after')).toMatchObject({
      startUs: 4_000_000,
      durationUs: 2_000_000,
    });
    expect(nodeIds(after).slice(-3)).toEqual([
      'node-video',
      'node-video-freeze',
      'node-video-after',
    ]);
    expect(createdIds).toEqual(expect.arrayContaining(['node-video-after', 'node-video-freeze']));
    bus.undo();
    expect(json(bus.getDocument())).toBe(before);
  });

  it('builds the commands of D82.9 in order, and reads the document without changing it', () => {
    const document = withVideo();
    const before = json(document);
    expect(freezeFrame(document, { ...ARGS, mode: 'overwrite' }).map(({ type }) => type)).toEqual([
      'SplitClip',
      'SplitClip',
      'SetClipReverse',
      'SetClipSpeed',
      'SetVideoSource',
    ]);
    expect(freezeFrame(document, { ...ARGS, mode: 'insert' }).map(({ type }) => type)).toEqual([
      'SplitClip',
      'MoveClip',
      'AddNode',
    ]);
    expect(json(document)).toBe(before);
    expect(Object.isFrozen(freezeFrameArgumentsSchema)).toBe(true);
  });
});

describe('freezeFrame refuses what D82.9 refuses', () => {
  const ARGS = {
    clipId: 'node-video',
    atUs: 3_000_000,
    holdUs: 1_000_000,
    mode: 'insert',
    newClipIds: ['node-video-freeze', 'node-video-after'],
  };

  it('refuses arguments that are not as its schema states with invalid-argument', () => {
    const document = withVideo();
    for (const args of [
      null,
      [],
      { ...ARGS, extra: 1 },
      { ...ARGS, clipId: '' },
      { ...ARGS, atUs: -1 },
      { ...ARGS, atUs: 1.5 },
      { ...ARGS, holdUs: 0 },
      { ...ARGS, mode: 'ripple' },
      { ...ARGS, newClipIds: ['node-video-freeze'] },
      { ...ARGS, newClipIds: ['a', 'a'] },
      { ...ARGS, newClipIds: ['a', 'b c'] },
      { ...ARGS, newClipIds: 'a' },
    ]) {
      expect(
        codeOf(() => freezeFrame(document, args)),
        JSON.stringify(args),
      ).toBe('invalid-argument');
    }
  });

  it('refuses an unknown clip, and anything but a video node', () => {
    const document = withVideo();
    expect(codeOf(() => freezeFrame(document, { ...ARGS, clipId: 'gone' }))).toBe('unknown-clip');
    for (const clipId of ['node-title', 'node-image', 'clip-audio']) {
      expect(
        codeOf(() => freezeFrame(document, { ...ARGS, clipId })),
        clipId,
      ).toBe('unsupported-node');
    }
  });

  it('refuses a time not strictly inside the clip, and an overwrite past its end', () => {
    const document = withVideo();
    for (const atUs of [0, 1_000_000, 5_000_000, 6_000_000]) {
      expect(
        codeOf(() => freezeFrame(document, { ...ARGS, atUs })),
        String(atUs),
      ).toBe('time-outside-clip');
    }
    expect(
      codeOf(() => freezeFrame(document, { ...ARGS, mode: 'overwrite', holdUs: 2_000_001 })),
    ).toBe('time-outside-clip');
  });

  it('refuses IDs in use through the bus, and a heard video cut off the grid of 125 µs', () => {
    const bus = busOf(withVideo());
    for (const mode of ['insert', 'overwrite']) {
      for (const newClipIds of [
        ['node-title', 'node-video-after'],
        ['node-video-freeze', 'node-title'],
      ]) {
        expect(
          codeOf(() =>
            bus.dispatchTransaction(freezeFrame(bus.getDocument(), { ...ARGS, mode, newClipIds })),
          ),
          `${mode} ${newClipIds.join(' ')}`,
        ).toBe('id-in-use');
      }
    }
    expect(bus.canUndo()).toBe(false);
    const heard = busOf(withVideo({ volume: 0.5 }));
    for (const mode of ['insert', 'overwrite']) {
      expect(
        codeOf(() =>
          heard.dispatchTransaction(
            freezeFrame(heard.getDocument(), { ...ARGS, mode, atUs: 3_000_001 }),
          ),
        ),
        mode,
      ).toBe('split-not-exact');
    }
    expect(heard.canUndo()).toBe(false);
  });
});
