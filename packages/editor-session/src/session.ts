/**
 * The host facade (D44): one document, the one command bus over it, and a
 * Player that shows it. Every edit goes through the bus (D09, D30.9); the
 * session only watches it, brings each new document to the preview with
 * `Player.update`, and reports what changed through one table of events. It
 * keeps no domain rule of its own and reads no clock: the playback time it
 * reports is the Player's (D20.2).
 */
import { createCommandBus, type BusChange, type CommandBus } from '@kadrion/editor-sdk';
import {
  PlayerError,
  type Player,
  type PlayerAssetResolver,
  type PlayerState,
} from '@kadrion/player';
import type { ValidatedComposition } from '@kadrion/schema';

/** The history the bus reaches after a change (D38.7, D44). */
export interface SessionHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
}

/**
 * Every event a host receives, one table for all features (D44):
 *
 * - `document`: the bus committed a change; delivered synchronously, after the commit.
 * - `history`: what undo and redo reach changed; right after its `document` event.
 * - `playback`: the Player's state changed (status, time, error).
 * - `error`: the preview could not show a document; the bus holds it all the same.
 */
export type SessionEvent =
  | { readonly type: 'document'; readonly change: BusChange }
  | { readonly type: 'history'; readonly history: SessionHistory }
  | { readonly type: 'playback'; readonly state: PlayerState }
  | { readonly type: 'error'; readonly error: PlayerError };

export type SessionListener = (event: SessionEvent) => void;

/** Receives what a listener threw. It must not throw itself (as D38.8). */
export type SessionListenerErrorHandler = (error: unknown, event: SessionEvent) => void;

export interface EditorSessionOptions {
  /** The document to start from; the bus validates it. */
  readonly document: unknown;
  /**
   * A Player that is not loaded yet, created with `onListenerError`. The
   * session owns it from now on: it loads it, updates it, and destroys it.
   */
  readonly player: Player;
  /** Asked for the bytes of an asset the Player has not verified yet (D14, D44). */
  readonly resolveAsset: PlayerAssetResolver;
  /** As the option of the bus (D38.7). */
  readonly historyLimit?: number;
  /** Required before `subscribe`: where the errors of listeners go. */
  readonly onListenerError?: SessionListenerErrorHandler;
}

export interface EditorSession {
  /**
   * The one command bus over the document; UI and AI edit through it. A change
   * committed here reaches the preview without anything else to call.
   */
  readonly bus: CommandBus;
  seek(timeUs: number): Promise<void>;
  play(): void;
  pause(): void;
  getPlaybackState(): PlayerState;
  getHistory(): SessionHistory;
  /**
   * Resolves once the preview has tried to show the bus's current document;
   * what failed was reported as an `error` event.
   */
  settled(): Promise<void>;
  /** Calls `listener` with every event until the returned function is called. */
  subscribe(listener: SessionListener): () => void;
  /** Stops listening and destroys the Player. */
  destroy(): void;
}

const historyOf = (bus: CommandBus, change: BusChange | null): SessionHistory =>
  Object.freeze({
    canUndo: bus.canUndo(),
    canRedo: bus.canRedo(),
    undoDepth: change?.undoDepth ?? 0,
    redoDepth: change?.redoDepth ?? 0,
  });

const sameHistory = (a: SessionHistory, b: SessionHistory): boolean =>
  a.canUndo === b.canUndo &&
  a.canRedo === b.canRedo &&
  a.undoDepth === b.undoDepth &&
  a.redoDepth === b.redoDepth;

/**
 * Creates the bus over `document`, loads it into the Player, and resolves with
 * the session once frame 0 is shown. A document the bus refuses throws its
 * `EditorError`; a failed load rejects with the `PlayerError`, and the Player
 * is destroyed either way.
 */
export async function createEditorSession(options: EditorSessionOptions): Promise<EditorSession> {
  const { player, resolveAsset, onListenerError } = options;
  const listeners = new Set<{ readonly listener: SessionListener }>();
  let destroyed = false;

  const emit = (event: SessionEvent): void => {
    if (destroyed) return;
    const frozen = Object.freeze(event);
    for (const { listener } of [...listeners]) {
      try {
        listener(frozen);
      } catch (reason) {
        try {
          onListenerError?.(reason, frozen);
        } catch {
          // The handler broke its contract; the session carries on (as D38.8).
        }
      }
    }
  };

  let bus: CommandBus;
  let stopPlayer: () => void;
  try {
    bus = createCommandBus(options.document, {
      ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
      // The session's own listener catches everything; another one reports here.
      onListenerError: (reason, change) => {
        onListenerError?.(reason, Object.freeze({ type: 'document', change }));
      },
    });
    stopPlayer = player.subscribe((state) => {
      emit({ type: 'playback', state });
    });
    await player.load(bus.getDocument(), resolveAsset);
  } catch (reason) {
    destroyed = true;
    player.destroy();
    throw reason;
  }

  let history = historyOf(bus, null);
  /** The document the preview was last asked to show. */
  let shown: ValidatedComposition = bus.getDocument();
  let running = false;
  /** The latest run of `sync`; settled when the preview caught up. */
  let syncing: Promise<void> = Promise.resolve();

  /**
   * Brings the preview to the bus's document, one update at a time; edits
   * committed meanwhile are coalesced into the next one, so only the latest
   * document is sent. A Player that holds no document after a failure is
   * loaded again instead, from frame 0.
   */
  const sync = async (): Promise<void> => {
    running = true;
    try {
      while (!destroyed && shown !== bus.getDocument()) {
        const target = bus.getDocument();
        shown = target;
        try {
          if (player.getState().timeUs === null) await player.load(target, resolveAsset);
          else await player.update(target, resolveAsset);
        } catch (reason) {
          // After destroy, the Player rejects with `destroyed` and `emit` reports nothing.
          emit({
            type: 'error',
            error:
              reason instanceof PlayerError
                ? reason
                : new PlayerError(
                    'page-error',
                    reason instanceof Error ? reason.message : String(reason),
                  ),
          });
        }
      }
    } finally {
      // Cleared in the step that found nothing left to send, with no await in
      // between: a change committed after it starts a new run.
      running = false;
    }
  };

  const stopBus = bus.subscribe((change) => {
    emit({ type: 'document', change });
    const next = historyOf(bus, change);
    if (!sameHistory(history, next)) {
      history = next;
      emit({ type: 'history', history });
    }
    if (!running) syncing = sync();
  });

  return Object.freeze<EditorSession>({
    bus,
    seek: (timeUs) => player.seek(timeUs),
    play: () => {
      player.play();
    },
    pause: () => {
      player.pause();
    },
    getPlaybackState: () => player.getState(),
    getHistory: () => history,
    settled: () => syncing,
    subscribe(listener) {
      if (onListenerError === undefined) {
        throw new PlayerError(
          'invalid-options',
          'subscribe needs the option onListenerError, where the errors of listeners go (D44).',
        );
      }
      const entry = { listener };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      stopBus();
      stopPlayer();
      player.destroy();
    },
  });
}
