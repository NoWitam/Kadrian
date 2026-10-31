/**
 * The host facade (D44) against a recording Player: what the session asks the
 * Player to do for each change of the bus, and the events it reports. The
 * Player itself — `update` in the same page, at the time it shows — is tested
 * in `packages/player/test/player.test.ts`.
 */
import type { Command } from '@kadrion/editor-sdk';
import {
  PlayerError,
  type Player,
  type PlayerAssetRequest,
  type PlayerAssetResolver,
  type PlayerListener,
  type PlayerState,
  type PlayerVideoFacts,
} from '@kadrion/player';
import { referenceComposition, VIDEO_FIXTURE, videoComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { createEditorSession, type SessionEvent } from '../src/index.js';

const TITLE = 'node-title';

function move(x: number, y: number): Command {
  return { type: 'SetNodePosition', nodeId: TITLE, position: { x, y } };
}

interface Call {
  readonly method: 'load' | 'update';
  readonly document: unknown;
  readonly resolveAsset: PlayerAssetResolver;
  readonly settle: (error?: PlayerError) => void;
}

/**
 * A Player that records `load` and `update` and settles each only when the test
 * says so; `auto` settles every call at once. It keeps the state a real Player
 * would: no time after a failure.
 */
function recordingPlayer(
  auto = true,
  videoFacts: Readonly<Record<string, PlayerVideoFacts | PlayerError>> = {},
) {
  const calls: Call[] = [];
  const prepared: PlayerAssetRequest[] = [];
  const listeners = new Set<PlayerListener>();
  let state: PlayerState = Object.freeze({
    status: 'empty',
    timeUs: null,
    runtimeHash: 'sha256:test',
    error: null,
  });
  let destroyed = false;
  const set = (next: Partial<PlayerState>): void => {
    state = Object.freeze({ ...state, ...next });
    for (const listener of [...listeners]) listener(state);
  };
  const call =
    (method: Call['method']) =>
    (document: unknown, resolveAsset: PlayerAssetResolver): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        set({ status: 'loading' });
        const settle = (error?: PlayerError): void => {
          if (error === undefined) {
            set({ status: 'ready', timeUs: method === 'load' ? 0 : state.timeUs, error: null });
            resolve();
          } else {
            set({ status: 'error', timeUs: null, error });
            reject(error);
          }
        };
        calls.push({ method, document, resolveAsset, settle });
        if (auto) settle();
      });
  const player: Player = {
    load: call('load'),
    update: call('update'),
    seek: (timeUs) => {
      set({ status: 'ready', timeUs });
      return Promise.resolve();
    },
    play: () => {
      set({ status: 'playing' });
    },
    pause: () => {
      set({ status: 'ready' });
    },
    getState: () => state,
    prepareVideo(asset) {
      prepared.push(asset);
      const facts = videoFacts[asset.contentHash];
      if (facts instanceof PlayerError) return Promise.reject(facts);
      if (facts === undefined) {
        return Promise.reject(new PlayerError('asset-missing', `No bytes for ${asset.id}.`));
      }
      return Promise.resolve(facts);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      destroyed = true;
    },
  };
  return { player, calls, prepared, listeners, isDestroyed: () => destroyed };
}

const resolveAsset: PlayerAssetResolver = () => null;

async function session(auto = true, historyLimit?: number) {
  const recording = recordingPlayer(auto);
  const events: SessionEvent[] = [];
  const failures: unknown[] = [];
  const started = createEditorSession({
    document: referenceComposition,
    player: recording.player,
    resolveAsset,
    ...(historyLimit === undefined ? {} : { historyLimit }),
    onListenerError: (error) => failures.push(error),
  });
  if (!auto) recording.calls[0]?.settle();
  const editor = await started;
  editor.subscribe((event) => events.push(event));
  return { ...recording, editor, events, failures };
}

const brief = (event: SessionEvent): string => {
  switch (event.type) {
    case 'document':
      return `document ${event.change.kind}`;
    case 'history': {
      const { undoDepth, redoDepth } = event.history;
      return `history ${String(undoDepth)}/${String(redoDepth)}`;
    }
    case 'playback':
      return `playback ${event.state.status} ${String(event.state.timeUs)}`;
    case 'error':
      return `error ${event.error.code}`;
  }
};

describe('createEditorSession (D44)', () => {
  it('loads the document once, with the host resolver, and shows frame 0', async () => {
    const { calls, editor } = await session();
    expect(calls.map(({ method }) => method)).toEqual(['load']);
    expect(calls[0]?.document).toBe(editor.bus.getDocument());
    expect(calls[0]?.resolveAsset).toBe(resolveAsset);
    expect(editor.getPlaybackState()).toMatchObject({ status: 'ready', timeUs: 0 });
    expect(editor.getHistory()).toEqual({
      canUndo: false,
      canRedo: false,
      undoDepth: 0,
      redoDepth: 0,
    });
  });

  it('refuses an invalid document and destroys the Player', async () => {
    const { player, isDestroyed, calls } = recordingPlayer();
    await expect(
      createEditorSession({ document: { schemaVersion: '0.2' }, player, resolveAsset }),
    ).rejects.toMatchObject({ code: 'invalid-document' });
    expect(calls).toEqual([]);
    expect(isDestroyed()).toBe(true);
  });

  it('rejects with the error of a failed load and destroys the Player', async () => {
    const { player, isDestroyed, calls } = recordingPlayer(false);
    const started = createEditorSession({ document: referenceComposition, player, resolveAsset });
    calls[0]?.settle(new PlayerError('asset-missing', 'missing'));
    await expect(started).rejects.toMatchObject({ code: 'asset-missing' });
    expect(isDestroyed()).toBe(true);
  });
});

describe('edits reach the preview (D44)', () => {
  it('updates the Player with every committed document, through the one bus', async () => {
    const { calls, editor, events } = await session();
    editor.bus.dispatch(move(1, 1));
    await editor.settled();
    editor.bus.undo();
    await editor.settled();
    expect(calls.map(({ method }) => method)).toEqual(['load', 'update', 'update']);
    expect(calls[2]?.document).toBe(editor.bus.getDocument());
    expect(events.map(brief)).toEqual([
      'document dispatch',
      'history 1/0',
      'playback loading 0',
      'playback ready 0',
      'document undo',
      'history 0/1',
      'playback loading 0',
      'playback ready 0',
    ]);
  });

  it('sends only the latest document of edits made while an update runs', async () => {
    const { calls, editor } = await session(false);
    editor.bus.dispatch(move(1, 1));
    editor.bus.dispatch(move(2, 2));
    editor.bus.dispatch(move(3, 3));
    expect(calls.map(({ method }) => method)).toEqual(['load', 'update']);
    const first = calls[1]?.document;
    calls[1]?.settle();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toHaveLength(3);
    calls[2]?.settle();
    await editor.settled();
    expect(calls).toHaveLength(3);
    expect(first).not.toBe(editor.bus.getDocument());
    expect(calls[2]?.document).toBe(editor.bus.getDocument());
  });

  it('reports a failed update, keeps the edit, and loads the next document', async () => {
    const { calls, editor, events } = await session(false);
    editor.bus.dispatch(move(1, 1));
    calls[1]?.settle(new PlayerError('asset-missing', 'missing'));
    await editor.settled();
    expect(events.map(brief)).toContain('error asset-missing');
    expect(editor.bus.canUndo()).toBe(true);
    editor.bus.undo();
    expect(calls.map(({ method }) => method)).toEqual(['load', 'update', 'load']);
    calls[2]?.settle();
    await editor.settled();
    expect(editor.getPlaybackState()).toMatchObject({ status: 'ready', timeUs: 0 });
  });

  it('sends nothing for a no-op', async () => {
    const { calls, editor, events } = await session();
    const { x, y } = (
      editor.bus.getDocument().scenes[0]?.nodes.find((node) => node.id === TITLE) as unknown as {
        position: { x: number; y: number };
      }
    ).position;
    editor.bus.dispatch(move(x, y));
    await editor.settled();
    expect(calls).toHaveLength(1);
    expect(events).toEqual([]);
  });
});

describe('the events (D44)', () => {
  it('reports history only when it changed, with the depths within the limit', async () => {
    const { editor, events } = await session(true, 1);
    editor.bus.dispatch(move(1, 1));
    editor.bus.dispatch(move(2, 2));
    editor.bus.undo();
    await editor.settled();
    expect(events.filter((event) => event.type !== 'playback').map(brief)).toEqual([
      'document dispatch',
      'history 1/0',
      'document dispatch',
      'document undo',
      'history 0/1',
    ]);
    expect(editor.getHistory()).toEqual({
      canUndo: false,
      canRedo: true,
      undoDepth: 0,
      redoDepth: 1,
    });
  });

  it('reports playback from the Player, and passes seek, play, and pause through', async () => {
    const { editor, events } = await session();
    await editor.seek(2_500_000);
    editor.play();
    editor.pause();
    expect(events.map(brief)).toEqual([
      'playback ready 2500000',
      'playback playing 2500000',
      'playback ready 2500000',
    ]);
    expect(events.every((event) => Object.isFrozen(event))).toBe(true);
  });

  it('gives what a listener threw to the handler, and tells the other listeners all the same', async () => {
    const { editor, events, failures } = await session();
    const boom = new Error('listener');
    editor.subscribe(() => {
      throw boom;
    });
    const later: string[] = [];
    editor.subscribe((event) => later.push(brief(event)));
    editor.bus.dispatch(move(1, 1));
    await editor.settled();
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.every((failure) => failure === boom)).toBe(true);
    expect(later).toEqual(events.slice(0, later.length).map(brief));
  });

  it('needs a handler before subscribe', async () => {
    const { player } = recordingPlayer();
    const editor = await createEditorSession({
      document: referenceComposition,
      player,
      resolveAsset,
    });
    expect(() => editor.subscribe(() => undefined)).toThrow(
      expect.objectContaining({ code: 'invalid-options' }) as Error,
    );
    editor.destroy();
  });
});

describe('destroy', () => {
  it('stops every event and destroys the Player', async () => {
    const { editor, events, isDestroyed, listeners } = await session(false);
    editor.bus.dispatch(move(1, 1));
    events.length = 0;
    editor.destroy();
    editor.bus.dispatch(move(2, 2));
    expect(events).toEqual([]);
    expect(listeners.size).toBe(0);
    expect(isDestroyed()).toBe(true);
  });
});

describe('media facts from verified bytes (D49.6, D51.5)', () => {
  const fixtureFacts: PlayerVideoFacts = Object.freeze({
    type: 'video',
    durationUs: VIDEO_FIXTURE.sourceDurationUs,
    width: VIDEO_FIXTURE.width,
    height: VIDEO_FIXTURE.height,
    frames: VIDEO_FIXTURE.frames,
  });
  const CLIP = 'sha256:' + 'c'.repeat(64);
  const clipFacts: PlayerVideoFacts = Object.freeze({
    ...fixtureFacts,
    durationUs: 500_000,
    frames: 13,
  });

  async function videoSession(facts: Readonly<Record<string, PlayerVideoFacts | PlayerError>>) {
    const recording = recordingPlayer(true, facts);
    const editor = await createEditorSession({
      document: videoComposition,
      player: recording.player,
      resolveAsset,
      onListenerError: () => undefined,
    });
    return { ...recording, editor };
  }

  it('reads the facts of every video a node shows, through the Player, before the load', async () => {
    const { editor, prepared, calls } = await videoSession({
      [VIDEO_FIXTURE.contentHash]: fixtureFacts,
    });
    expect(prepared).toEqual([
      { id: VIDEO_FIXTURE.id, type: 'video', contentHash: VIDEO_FIXTURE.contentHash },
    ]);
    expect(calls.map(({ method }) => method)).toEqual(['load']);
    expect(editor.bus.mediaFactsOf(VIDEO_FIXTURE.contentHash)).toEqual({
      type: 'video',
      durationUs: 3_000_000,
    });
  });

  it('lets the bus refuse a source range past the video, and accept one inside it', async () => {
    const { editor } = await videoSession({ [VIDEO_FIXTURE.contentHash]: fixtureFacts });
    expect(() =>
      editor.bus.dispatch({
        type: 'SetVideoSource',
        nodeId: 'node-video-full',
        sourceStartUs: 1_500_000,
      }),
    ).toThrow(expect.objectContaining({ code: 'source-range-exceeded' }));
    editor.bus.dispatch({
      type: 'SetVideoSource',
      nodeId: 'node-video-full',
      sourceStartUs: 1_000_000,
    });
    await editor.settled();
  });

  it('reads the facts of a new video on request, so the bus can check a node that shows it', async () => {
    const { editor, prepared } = await videoSession({
      [VIDEO_FIXTURE.contentHash]: fixtureFacts,
      [CLIP]: clipFacts,
    });
    const clip = { id: 'asset-clip', type: 'video', contentHash: CLIP } as const;
    editor.bus.dispatch({ type: 'AddAsset', asset: clip, index: 0 });
    const show = {
      type: 'SetVideoAsset',
      nodeId: 'node-video-full',
      assetId: 'asset-clip',
    } as const;
    expect(() => editor.bus.dispatch(show)).toThrow(
      expect.objectContaining({ code: 'media-facts-missing' }),
    );
    await expect(editor.readMediaFacts(clip)).resolves.toEqual({
      type: 'video',
      durationUs: 500_000,
    });
    // Read once: a second request is answered from the facts already read.
    await editor.readMediaFacts(clip);
    expect(prepared.filter(({ contentHash }) => contentHash === CLIP)).toHaveLength(1);
    expect(() => editor.bus.dispatch(show)).toThrow(
      expect.objectContaining({ code: 'source-range-exceeded' }),
    );
    editor.bus.dispatch({
      type: 'SetNodeLifetime',
      nodeId: 'node-video-full',
      startUs: 0,
      durationUs: 500_000,
    });
    editor.bus.dispatch(show);
    expect(editor.bus.mediaFactsOf(CLIP)).toEqual({ type: 'video', durationUs: 500_000 });
  });

  it('has no facts for other assets yet, and refuses what is not an asset', async () => {
    const { editor } = await videoSession({ [VIDEO_FIXTURE.contentHash]: fixtureFacts });
    await expect(
      editor.readMediaFacts({ id: 'asset-image', type: 'image', contentHash: CLIP }),
    ).resolves.toBeNull();
    await expect(editor.readMediaFacts({} as PlayerAssetRequest)).rejects.toMatchObject({
      code: 'invalid-options',
    });
  });

  it('fails to start, and destroys the Player, when a video cannot be verified or read', async () => {
    const recording = recordingPlayer(true, {
      [VIDEO_FIXTURE.contentHash]: new PlayerError('video-unsupported', 'not H.264'),
    });
    await expect(
      createEditorSession({ document: videoComposition, player: recording.player, resolveAsset }),
    ).rejects.toMatchObject({ code: 'video-unsupported' });
    expect(recording.isDestroyed()).toBe(true);
    expect(recording.calls).toEqual([]);
  });
});
