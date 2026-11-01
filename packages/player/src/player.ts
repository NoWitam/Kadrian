/**
 * The browser Player (D25): it creates the render page, loads a document into
 * it, and seeks and plays by asking the page for one frame at a time. It decides
 * no pixel — the page and the runtime build do — and owns only the preview
 * clock (D20.2). It never loads anything but the runtime build and the asset
 * bytes the application passes. `update` brings an edited document into the
 * same page at the time it shows, and `subscribe` reports every change of its
 * state (D44).
 */
import {
  RENDER_PAGE_FRAME_STYLE,
  RENDER_PAGE_SANDBOX,
  renderPageDocument,
  resolveOneAsset,
  type AssetRequest,
  type CustomHtmlPolicy,
  type ResolvedAsset,
} from '@kadrion/renderer-dom';
import {
  AUDIO_SAMPLE_RATE,
  audioLayout,
  audioPlan,
  sampleAt,
  type AudioLayout,
} from '@kadrion/runtime';
import {
  frameCount,
  frameToTimeUs,
  timeUsToFrame,
  validateComposition,
  type ValidatedComposition,
} from '@kadrion/schema';

import { PAGE_AGENT_SCRIPT } from './agent.js';
import {
  checkSoundRanges,
  decodeSound,
  scheduleSounds,
  soundFacts,
  type PlayerAudioFacts,
  type ScheduledSounds,
  type SoundContext,
} from './audio.js';
import { playerCode, PlayerError } from './errors.js';
import {
  checkDecodable,
  checkSourceRanges,
  createVideoFrameSource,
  readVideo,
  verifyVideo,
  videoNodes,
  type PlayerVideoBlob,
  type PlayerVideoFacts,
  type VerifiedBlob,
  type VerifiedVideo,
  type VideoFrameMessage,
  type VideoFrameSource,
} from './video.js';
import {
  isReady,
  LOAD,
  PROTOCOL_VERSION,
  readResult,
  SEEK,
  UPDATE,
  type PageFailure,
} from './protocol.js';

/** The runtime build artifact and the hash the application expects of it (D25.5). */
export interface PlayerRuntime {
  readonly bytes: Uint8Array;
  /** `sha256:` and 64 lowercase hex digits, from the renderer's manifest. */
  readonly contentHash: string;
}

/** An asset of the document, as the Player asks the resolver for it (D14). */
export type PlayerAssetRequest = AssetRequest;

/** The bytes of one asset and their media type, as a resolver returns them. */
export type PlayerAsset = ResolvedAsset;

/** A video asset delivered as a `Blob` (D51.2). */
export type PlayerVideoAsset = PlayerVideoBlob;

/**
 * The host-provided resolver of D14: bytes for an asset of the document, or
 * `null` when the host has none. The Player verifies the SHA-256 of the bytes
 * against the asset's `contentHash` before anything is rendered, through
 * `resolveOneAsset` of `@kadrion/renderer-dom`, which the Producer uses too
 * (D27.3). A video asset may instead be a `Blob` with its media type, which the
 * Player verifies with an incremental SHA-256 without reading it whole into
 * memory (D51.2); its bytes stay in the host window and never reach the page.
 */
export type PlayerAssetResolver = (
  asset: PlayerAssetRequest,
) => PlayerAsset | PlayerVideoAsset | null | Promise<PlayerAsset | PlayerVideoAsset | null>;

/** The media facts of a verified video (D49.6, D51.5), and of a decoded sound (D53). */
export type { PlayerAudioFacts, PlayerVideoFacts };

/**
 * The sound of the preview (D53): the Web Audio context the Player plays the
 * document's audio plan in, created by the host (a browser lets a context
 * start only after a gesture of the user). It must run at 48 kHz, the rate of
 * the Producer's mix (D29.6). While a document with sound plays, its clock is
 * the preview clock.
 */
export interface PlayerAudio {
  readonly context: AudioContext;
}

/**
 * The host's decision about the Custom HTML of every document this Player
 * loads (D36). `disabled`, the default, never runs it: each element stays an
 * empty box of its size and place. `trusted` runs it in its sandboxed frame
 * (D23), which is the host's decision to execute the document's code, not
 * network isolation: in a user's browser an element can still reach the
 * network through WebRTC (STUN, TURN) and DNS (D36).
 */
export type PlayerCustomHtmlPolicy = CustomHtmlPolicy;

/** The preview clock (D25.6): milliseconds and frame callbacks. */
export interface PlayerScheduler {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
}

/** Timers that bound the Player's requests to the page. */
export interface PlayerTimers {
  setTimeout(callback: () => void, milliseconds: number): number;
  clearTimeout(handle: number): void;
}

export interface PlayerOptions {
  readonly runtime: PlayerRuntime;
  /** Absent means `{ mode: 'disabled' }`; only an explicit `{ mode: 'trusted' }` runs Custom HTML (D36). */
  readonly customHtml?: PlayerCustomHtmlPolicy;
  /** How long the page waits for a Custom HTML acknowledgement (D23.4). */
  readonly ackTimeoutMs?: number;
  /** How long the Player waits for the page's answer to one request. */
  readonly requestTimeoutMs?: number;
  readonly scheduler?: PlayerScheduler;
  readonly timers?: PlayerTimers;
  /**
   * Required before `subscribe`: receives what a listener threw, with the state
   * it was given. It must not throw itself; the Player catches it all the same
   * (D44, as D38.8).
   */
  readonly onListenerError?: PlayerListenerErrorHandler;
  /** Absent means no sound: the Player plays the picture only, as before D53. */
  readonly audio?: PlayerAudio;
}

export type PlayerStatus = 'empty' | 'loading' | 'seeking' | 'ready' | 'playing' | 'error';

export interface PlayerState {
  readonly status: PlayerStatus;
  /** The time of the last frame that became ready, or `null` before the first. */
  readonly timeUs: number | null;
  /** The verified content hash of the runtime build that the page runs (D25.5). */
  readonly runtimeHash: string;
  readonly error: PlayerError | null;
}

export type PlayerListener = (state: PlayerState) => void;

export type PlayerListenerErrorHandler = (error: unknown, state: PlayerState) => void;

export interface Player {
  load(document: unknown, resolveAsset: PlayerAssetResolver): Promise<void>;
  /**
   * Shows `document` in place of the loaded one, in the same page, at the time
   * shown now: that time's frame on the new frame grid, and the last frame if
   * the document became shorter (D44). Assets with a content hash the Player
   * verified for the document shown now are not asked for again; only new ones
   * go to `resolveAsset`. It plays on if it was playing. Needs a loaded
   * document; updates run one after another.
   */
  update(document: unknown, resolveAsset: PlayerAssetResolver): Promise<void>;
  seek(timeUs: number): Promise<void>;
  play(): void;
  pause(): void;
  getState(): PlayerState;
  /**
   * Calls `listener` with the new state after every change of `status`,
   * `timeUs`, or `error`, until the returned function is called. Needs the
   * option `onListenerError` (D44).
   */
  subscribe(listener: PlayerListener): () => void;
  /**
   * Resolves and verifies one video asset, reads its first video track, and
   * returns its media facts (D49.6, D51.5), before any document uses it. The
   * verified video is kept, so a later `load` or `update` of a document with
   * that content hash does not ask the resolver for it again.
   */
  prepareVideo(
    asset: PlayerAssetRequest,
    resolveAsset: PlayerAssetResolver,
  ): Promise<PlayerVideoFacts>;
  /**
   * Resolves and verifies one audio or video asset, decodes its sound at
   * 48 kHz, and returns its facts (D53), before any document uses it: the
   * decoded sound is kept for a later `load` or `update`. It decodes with the
   * option `audio`, or without it in an offline context of the window; a
   * window with neither is `audio-unsupported`, and bytes without a sound the
   * browser decodes are `audio-invalid`.
   */
  prepareAudio(
    asset: PlayerAssetRequest,
    resolveAsset: PlayerAssetResolver,
  ): Promise<PlayerAudioFacts>;
  destroy(): void;
}

const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/;

/** How far ahead of the context's clock playback is scheduled, in seconds (D53). */
const SOUND_LEAD_S = 0.05;

/** The host's sound context, checked: absent means no sound (D53). */
function audioContextOf(value: unknown): SoundContext | null {
  if (value === undefined) return null;
  const context: unknown =
    typeof value === 'object' && value !== null
      ? (value as { context?: unknown }).context
      : undefined;
  if (
    typeof context !== 'object' ||
    context === null ||
    typeof (context as Partial<SoundContext>).createBufferSource !== 'function' ||
    typeof (context as Partial<SoundContext>).decodeAudioData !== 'function'
  ) {
    throw new PlayerError(
      'invalid-options',
      'audio must be absent or { context: AudioContext } (D53).',
    );
  }
  const { sampleRate } = context as SoundContext;
  if (sampleRate !== AUDIO_SAMPLE_RATE) {
    throw new PlayerError(
      'invalid-options',
      `The audio context runs at ${String(sampleRate)} Hz; the Player plays at 48 000 Hz (D29.6, D53).`,
    );
  }
  return context as SoundContext;
}

/**
 * The policy the host stated, or `disabled` when it stated none (D36). Only
 * exactly `{ mode: 'disabled' }` or `{ mode: 'trusted' }`, as own data
 * properties, is accepted; anything else is a typed error, never a guess.
 */
function customHtmlPolicy(value: unknown): PlayerCustomHtmlPolicy {
  if (value === undefined) return Object.freeze({ mode: 'disabled' });
  const descriptor =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.getOwnPropertyDescriptor(value, 'mode')
      : undefined;
  const mode: unknown =
    descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
  if (
    descriptor === undefined ||
    Reflect.ownKeys(value as object).length !== 1 ||
    (mode !== 'disabled' && mode !== 'trusted')
  ) {
    throw new PlayerError(
      'invalid-options',
      'customHtml must be absent, { mode: "disabled" }, or { mode: "trusted" } (D36).',
    );
  }
  return Object.freeze({ mode });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0'));
  return `sha256:${hex.join('')}`;
}

/** Integrity of the runtime build (D25.5): its hash, UTF-8, and one script element. */
async function runtimeScript(runtime: PlayerRuntime): Promise<string> {
  if (!CONTENT_HASH.test(runtime.contentHash)) {
    throw new PlayerError('runtime-hash-mismatch', 'The expected content hash is malformed.');
  }
  const actual = await sha256(runtime.bytes);
  if (actual !== runtime.contentHash) {
    throw new PlayerError(
      'runtime-hash-mismatch',
      `The runtime build has ${actual}, not ${runtime.contentHash}.`,
    );
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(runtime.bytes);
  } catch {
    throw new PlayerError('runtime-unsafe', 'The runtime build is not UTF-8.');
  }
}

function pageDocument(script: string): string {
  try {
    return renderPageDocument([script, PAGE_AGENT_SCRIPT]);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    throw new PlayerError('runtime-unsafe', message);
  }
}

function failureError(failure: PageFailure): PlayerError {
  return new PlayerError(playerCode(failure.code), failure.message, failure.details);
}

interface AssetMessage {
  readonly id: string;
  readonly mediaType: string;
  readonly bytes: ArrayBuffer;
}

function typed(reason: unknown): PlayerError {
  if (reason instanceof PlayerError) return reason;
  const code = (reason as { code?: unknown } | null)?.code;
  const message = reason instanceof Error ? reason.message : String(reason);
  return new PlayerError(typeof code === 'string' ? playerCode(code) : 'page-error', message);
}

/** What the Player verified for one document: the page's assets and the videos it decodes. */
interface PreparedAssets {
  readonly messages: AssetMessage[];
  /** The verified bytes of the non-video assets, by content hash, for an update to reuse (D44). */
  readonly bytes: Map<string, PlayerAsset>;
  /** Every verified video asset, by content hash. */
  readonly blobs: Map<string, VerifiedBlob>;
  /** The videos the document's nodes show, read, by content hash (D51.3). */
  readonly videos: Map<string, VerifiedVideo>;
  /** Every decoded sound, by content hash (D53). */
  readonly sounds: Map<string, AudioBuffer>;
  /** What the document makes heard, or `null` when the Player has no sound (D53). */
  audio: PreparedAudio | null;
}

/** The audio plan of a document on the grid, with the decoded source of each asset it hears. */
interface PreparedAudio {
  readonly layout: AudioLayout;
  /** By asset ID. */
  readonly buffers: ReadonlyMap<string, AudioBuffer>;
}

/**
 * Resolves and verifies every asset of the document (D14, D27.3), in the
 * document's order, each once: a missing asset or a mismatch is a typed error
 * before the first frame. Only declared assets are asked for. Video assets are
 * verified in the host window and stay there (D51.2): the page receives the
 * others. Every video a node shows is read, its sampled ranges are checked
 * against its facts (D49.6), and the host window must be able to decode it,
 * all before the first frame. With a sound context, every source the audio
 * plan hears is decoded and its ranges are checked too (D53).
 */
async function prepareAssets(
  view: Window,
  composition: ValidatedComposition,
  resolveAsset: PlayerAssetResolver,
  known: {
    readonly bytes: ReadonlyMap<string, PlayerAsset>;
    readonly blobs: ReadonlyMap<string, VerifiedBlob>;
    readonly videos: ReadonlyMap<string, VerifiedVideo>;
    readonly sounds: ReadonlyMap<string, AudioBuffer>;
  },
  decoder: SoundContext | null,
): Promise<PreparedAssets> {
  const prepared: PreparedAssets = {
    messages: [],
    bytes: new Map(),
    blobs: new Map(),
    videos: new Map(),
    sounds: new Map(),
    audio: null,
  };
  const BlobOf = (view as unknown as { Blob?: typeof Blob }).Blob ?? Blob;
  try {
    for (const asset of composition.assets) {
      const { id, type, contentHash } = asset;
      if (type === 'video') {
        const blob =
          known.videos.get(contentHash) ??
          known.blobs.get(contentHash) ??
          (await verifyVideo(asset, resolveAsset, BlobOf));
        prepared.blobs.set(contentHash, { ...blob, id });
        continue;
      }
      const cached = known.bytes.get(contentHash);
      const verified = await resolveOneAsset(
        asset,
        (request) => {
          if (cached !== undefined) return cached;
          const given = resolveAsset(request);
          // A Blob is accepted for a video only; the shared check refuses it here.
          return given as PlayerAsset | null | Promise<PlayerAsset | null>;
        },
        sha256,
      );
      prepared.bytes.set(contentHash, {
        mediaType: verified.mediaType,
        bytes: verified.bytes.slice(),
      });
      prepared.messages.push({
        id,
        mediaType: verified.mediaType,
        bytes: verified.bytes.buffer as ArrayBuffer,
      });
    }
    const hashes = new Map(composition.assets.map((asset) => [asset.id, asset.contentHash]));
    for (const node of videoNodes(composition)) {
      const contentHash = hashes.get(node.assetId) ?? '';
      if (prepared.videos.has(contentHash)) continue;
      const blob = prepared.blobs.get(contentHash);
      if (blob === undefined) {
        throw new PlayerError('asset-missing', `The video "${node.assetId}" was not resolved.`);
      }
      prepared.videos.set(contentHash, known.videos.get(contentHash) ?? (await readVideo(blob)));
    }
    checkSourceRanges(composition, prepared.videos);
    if (prepared.videos.size > 0) await checkDecodable(view, prepared.videos.values());
    if (decoder !== null)
      prepared.audio = await prepareSounds(composition, prepared, known, decoder);
  } catch (reason) {
    throw typed(reason);
  }
  return prepared;
}

/** Decodes every source the audio plan hears, each content hash once, and checks its ranges (D53). */
async function prepareSounds(
  composition: ValidatedComposition,
  prepared: PreparedAssets,
  known: { readonly sounds: ReadonlyMap<string, AudioBuffer> },
  decoder: SoundContext,
): Promise<PreparedAudio> {
  const layout = audioLayout(audioPlan(composition));
  const heard = new Set(layout.sounds.map(({ entry }) => entry.assetId));
  const buffers = new Map<string, AudioBuffer>();
  for (const { id, contentHash } of composition.assets) {
    if (!heard.has(id)) continue;
    let buffer = prepared.sounds.get(contentHash) ?? known.sounds.get(contentHash);
    if (buffer === undefined) {
      const blob = prepared.blobs.get(contentHash);
      const bytes =
        blob !== undefined
          ? await blob.blob.arrayBuffer()
          : prepared.bytes.get(contentHash)?.bytes.slice().buffer;
      if (bytes === undefined) {
        throw new PlayerError('asset-missing', `The sound "${id}" was not resolved.`);
      }
      buffer = await decodeSound(decoder, id, bytes);
    }
    prepared.sounds.set(contentHash, buffer);
    buffers.set(id, buffer);
  }
  checkSoundRanges(layout, buffers);
  return { layout, buffers };
}

/** The sound of one run of the clock: when its first sample is heard, once scheduled. */
interface PlayingSound {
  when: number | null;
  sounds: ScheduledSounds | null;
}

/** One run of the preview clock, from `startUs`. */
interface Playing {
  startNow: number;
  readonly startUs: number;
  handle: number;
  /** With sound, the audio context is the clock (D53); otherwise `null`. */
  sound: PlayingSound | null;
}

interface Waiting {
  readonly timeUs: number;
  readonly resolve: () => void;
  readonly reject: (error: PlayerError) => void;
}

interface Pending {
  readonly requestId: number;
  readonly settle: (error: PlayerError | null) => void;
}

/**
 * Creates the render page in `container` and resolves once it runs the verified
 * runtime build and has reported that it is ready.
 */
export async function createPlayer(
  container: HTMLElement,
  options: PlayerOptions,
): Promise<Player> {
  const view = container.ownerDocument.defaultView;
  if (view === null) throw new PlayerError('page-error', 'The container has no window.');
  const customHtml = customHtmlPolicy(options.customHtml);
  const audioContext = audioContextOf(options.audio);
  const script = await runtimeScript(options.runtime);
  const runtimeHash = options.runtime.contentHash;
  const srcdoc = pageDocument(script);
  const ackTimeoutMs = options.ackTimeoutMs ?? 2_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  const timers: PlayerTimers = options.timers ?? {
    setTimeout: (callback, milliseconds) => view.setTimeout(callback, milliseconds),
    clearTimeout: (handle) => {
      view.clearTimeout(handle);
    },
  };
  const scheduler: PlayerScheduler = options.scheduler ?? {
    now: () => view.performance.now(),
    requestFrame: (callback) => view.requestAnimationFrame(callback),
    cancelFrame: (handle) => {
      view.cancelAnimationFrame(handle);
    },
  };

  const frame = container.ownerDocument.createElement('iframe');
  // Sandbox first, both before the frame is attached (D25.2, as D23.1).
  frame.setAttribute('sandbox', RENDER_PAGE_SANDBOX);
  frame.setAttribute('srcdoc', srcdoc);
  for (const [name, value] of Object.entries(RENDER_PAGE_FRAME_STYLE)) {
    frame.style.setProperty(name, value);
  }
  frame.style.setProperty('width', '0px');
  frame.style.setProperty('height', '0px');

  let status: PlayerStatus = 'empty';
  let timeUs: number | null = null;
  let error: PlayerError | null = null;
  let composition: ValidatedComposition | null = null;
  let nextRequestId = 1;
  let pending: Pending | null = null;
  let seeking = false;
  let waiting: Waiting | null = null;
  let playing: Playing | null = null;
  /** The sounds of a run that reached its last frame, left to end on their own (D53). */
  let lingering: ScheduledSounds | null = null;
  /** Sounds decoded by `prepareAudio`, by content hash (D53). */
  const preparedSounds = new Map<string, AudioBuffer>();
  /** The context that decodes for `prepareAudio` without the option `audio`, made once. */
  let offlineDecoder: SoundContext | null = null;
  let destroyed = false;
  /** The seek that is in flight, settled either way; a load waits for it (D25.4). */
  let inFlight: Promise<void> = Promise.resolve();
  /** What was verified for the document shown now, by content hash (D44). */
  let shownAssets: PreparedAssets | null = null;
  /** Videos verified and read by `prepareVideo`, by content hash (D51.5). */
  const preparedVideos = new Map<string, VerifiedVideo>();
  /** The decoders of the document shown now, or `null` without video nodes (D51.4). */
  let videoSource: VideoFrameSource | null = null;
  /** Updates run one after another, each after the one before has settled. */
  let updates: Promise<void> = Promise.resolve();
  const { onListenerError } = options;
  /** One entry per subscription, so that the same function may subscribe twice. */
  const listeners = new Set<{ readonly listener: PlayerListener }>();
  let reported: PlayerState | null = null;

  const snapshot = (): PlayerState => Object.freeze({ status, timeUs, runtimeHash, error });

  /**
   * Tells every listener about the state, unless it equals the one reported
   * last. Called after each change; a listener's error goes to the host (D44).
   */
  const notify = (): void => {
    if (
      reported !== null &&
      reported.status === status &&
      reported.timeUs === timeUs &&
      reported.error === error
    ) {
      return;
    }
    const state = snapshot();
    reported = state;
    for (const { listener } of [...listeners]) {
      try {
        listener(state);
      } catch (reason) {
        try {
          onListenerError?.(reason, state);
        } catch {
          // The handler broke its contract; the Player carries on (as D38.8).
        }
      }
    }
  };
  let readyPage: ((error: PlayerError | null) => void) | null = null;

  const onMessage = (event: MessageEvent): void => {
    // Only the page's own window speaks for the page (D25.4).
    if (event.source === null || event.source !== frame.contentWindow) return;
    if (readyPage !== null && isReady(event.data)) {
      const settle = readyPage;
      readyPage = null;
      settle(null);
      return;
    }
    const result = readResult(event.data);
    if (result === undefined || pending === null || result.requestId !== pending.requestId) return;
    const { settle } = pending;
    pending = null;
    settle(result.error === null ? null : failureError(result.error));
  };
  view.addEventListener('message', onMessage);

  /** Sends one request and waits for its result, bounded by the request timeout. */
  const request = (message: Record<string, unknown>): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (destroyed) {
        reject(new PlayerError('destroyed', 'The Player was destroyed.'));
        return;
      }
      if (pending !== null) {
        // Never happens: requests are sent one at a time. Refuse rather than lose one.
        reject(new PlayerError('page-error', 'A request is already pending.'));
        return;
      }
      const requestId = message.requestId as number;
      const handle = timers.setTimeout(() => {
        if (pending?.requestId !== requestId) return;
        pending = null;
        reject(new PlayerError('page-timeout', 'The render page did not answer in time.'));
      }, requestTimeoutMs);
      pending = {
        requestId,
        settle: (failure) => {
          timers.clearTimeout(handle);
          if (failure === null) resolve();
          else reject(failure);
        },
      };
      frame.contentWindow?.postMessage(message, '*');
    });

  const fail = (reason: unknown): PlayerError => {
    const failure =
      reason instanceof PlayerError
        ? reason
        : new PlayerError('page-error', reason instanceof Error ? reason.message : String(reason));
    status = 'error';
    error = failure;
    notify();
    return failure;
  };

  /**
   * Serialises the document once and validates it as parsed, so that the page
   * renders exactly the document whose frame grid the Player uses (no getter,
   * no toJSON).
   */
  const parsed = (document: unknown): { text: string; loaded: ValidatedComposition } => {
    let text: string | undefined;
    try {
      text = JSON.stringify(document);
    } catch {
      text = undefined;
    }
    const result = validateComposition(text === undefined ? undefined : JSON.parse(text));
    if (text === undefined || !result.ok) {
      const details = result.ok
        ? []
        : result.errors.map(({ path, message }) => `${path}: ${message}`);
      throw fail(new PlayerError('invalid-document', 'The document is not valid.', details));
    }
    return { text, loaded: result.composition };
  };

  /** The source frames of the video nodes at `target`, decoded in this window (D51.4). */
  const framesOf = async (
    source: VideoFrameSource | null,
    shown: ValidatedComposition | null,
    target: number,
  ): Promise<VideoFrameMessage[]> => {
    if (source === null || shown === null) return [];
    try {
      return await source.framesAt(shown, target);
    } catch (reason) {
      throw typed(reason);
    }
  };

  /** What a load or an update may take without asking the resolver again. */
  const knownAssets = (includeShown: boolean) => {
    const videos = new Map(preparedVideos);
    const sounds = new Map(preparedSounds);
    if (includeShown && shownAssets !== null) {
      for (const [hash, video] of shownAssets.videos) videos.set(hash, video);
      for (const [hash, sound] of shownAssets.sounds) sounds.set(hash, sound);
    }
    return {
      sounds,
      bytes:
        includeShown && shownAssets !== null ? shownAssets.bytes : new Map<string, PlayerAsset>(),
      blobs:
        includeShown && shownAssets !== null ? shownAssets.blobs : new Map<string, VerifiedBlob>(),
      videos,
    };
  };

  /** An offline context of the window, made once, or `null` where the window has none (D53). */
  const offlineDecoderOf = (): SoundContext | null => {
    if (offlineDecoder !== null) return offlineDecoder;
    const Offline = (view as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
      .OfflineAudioContext;
    if (typeof Offline !== 'function') return null;
    offlineDecoder = new Offline(2, 1, AUDIO_SAMPLE_RATE);
    return offlineDecoder;
  };

  const settledStatus = (): PlayerStatus => (playing !== null ? 'playing' : 'ready');

  const startSeek = (target: number, done: Waiting | null): void => {
    seeking = true;
    status = 'seeking';
    notify();
    const requestId = nextRequestId++;
    const shown = composition;
    const source = videoSource;
    const sent = (async () => {
      const videoFrames = await framesOf(source, shown, target);
      await request({
        type: SEEK,
        version: PROTOCOL_VERSION,
        requestId,
        timeUs: target,
        videoFrames,
      });
    })();
    inFlight = sent.then(
      () => undefined,
      () => undefined,
    );
    sent.then(
      () => {
        seeking = false;
        timeUs = target;
        error = null;
        done?.resolve();
        next();
        notify();
      },
      (reason: unknown) => {
        seeking = false;
        const failure = fail(reason);
        stopClock();
        done?.reject(failure);
        next();
      },
    );
  };

  /** After a seek: start the one that waits, or settle the status. */
  const next = (): void => {
    if (waiting !== null) {
      const queued = waiting;
      waiting = null;
      // It was checked against the document of its time; an update may have shortened it.
      if (composition !== null && queued.timeUs >= composition.durationUs) {
        queued.reject(outOfRange(queued.timeUs));
        next();
        return;
      }
      startSeek(queued.timeUs, queued);
      return;
    }
    if (error === null) status = settledStatus();
  };

  const checkedTime = (target: number): number => {
    if (composition === null) throw new PlayerError('not-loaded', 'No document is loaded.');
    if (!Number.isSafeInteger(target) || target < 0 || target >= composition.durationUs) {
      throw outOfRange(target);
    }
    return target;
  };

  const outOfRange = (target: number): PlayerError =>
    new PlayerError(
      'time-out-of-range',
      `timeUs must be an integer in [0, ${String(composition?.durationUs ?? 0)}), got ${String(target)}.`,
    );

  /**
   * One update (D44): the time shown now, on the new frame grid and clamped to
   * its last frame, is rendered with the new document in one request, so the
   * page is never seen between the two.
   */
  const update = async (document: unknown, resolveAsset: PlayerAssetResolver): Promise<void> => {
    if (composition === null) {
      throw new PlayerError('not-loaded', 'No document is loaded.');
    }
    const { text, loaded } = parsed(document);
    const resumes = playing !== null;
    stopClock();
    waiting?.reject(new PlayerError('superseded', 'A new document replaced this seek.'));
    waiting = null;
    // A seek that is still in flight finishes first; its time is the one kept.
    await inFlight;
    const shown = Math.min(timeUs ?? 0, loaded.durationUs - 1);
    const target = frameToTimeUs(timeUsToFrame(shown, loaded.fps), loaded.fps);
    // `timeUs` keeps the frame shown until the new one is.
    seeking = true;
    status = 'loading';
    notify();
    let staged: { assets: PreparedAssets; source: VideoFrameSource | null } | null = null;
    const sent = (async () => {
      const assets = await prepareAssets(
        view,
        loaded,
        resolveAsset,
        knownAssets(true),
        audioContext,
      );
      const source = assets.videos.size === 0 ? null : createVideoFrameSource(view, assets.videos);
      staged = { assets, source };
      const videoFrames = await framesOf(source, loaded, target);
      frame.style.setProperty('width', `${String(loaded.width)}px`);
      frame.style.setProperty('height', `${String(loaded.height)}px`);
      await request({
        type: UPDATE,
        version: PROTOCOL_VERSION,
        requestId: nextRequestId++,
        document: text,
        assets: assets.messages,
        ackTimeoutMs,
        customHtml: { mode: customHtml.mode },
        timeUs: target,
        videoFrames,
      });
    })();
    inFlight = sent.then(
      () => undefined,
      () => undefined,
    );
    try {
      await sent;
    } catch (reason) {
      seeking = false;
      // What the page holds is not known any more: a new load is needed.
      composition = null;
      timeUs = null;
      shownAssets = null;
      videoSource = null;
      // A seek may have been requested while the update was in flight.
      (waiting as Waiting | null)?.reject(new PlayerError('superseded', 'The update failed.'));
      waiting = null;
      throw fail(reason);
    }
    seeking = false;
    composition = loaded;
    const accepted = staged as { assets: PreparedAssets; source: VideoFrameSource | null } | null;
    shownAssets = accepted?.assets ?? null;
    videoSource = accepted?.source ?? null;
    timeUs = target;
    error = null;
    next();
    notify();
    if (resumes) player.play();
  };

  const seek = (target: number): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const checked = checkedTime(target);
      // While playing, the clock goes on from the time sought, with its sound (D53).
      if (playing !== null) startClock(checked);
      if (!seeking) {
        startSeek(checked, { timeUs: checked, resolve, reject });
        return;
      }
      // One seek at a time; a newer one supersedes the one that waits (D25.6).
      waiting?.reject(new PlayerError('superseded', 'A newer seek replaced this one.'));
      waiting = { timeUs: checked, resolve, reject };
    });

  const stopClock = (): void => {
    if (playing !== null) {
      scheduler.cancelFrame(playing.handle);
      playing.sound?.sounds?.stop();
    }
    playing = null;
    lingering?.stop();
    lingering = null;
  };

  /**
   * Starts the preview clock at `startUs`, in place of a running one. With
   * sound to play, the clock is the audio context's (D53): the plan is
   * scheduled from the sample of `startUs` a little ahead of the context's
   * time, and the picture follows what is heard. A context that is not
   * running is resumed first; one that cannot be leaves the picture to the
   * scheduler, without sound.
   */
  const startClock = (startUs: number): void => {
    stopClock();
    const run: Playing = { startNow: scheduler.now(), startUs, handle: 0, sound: null };
    playing = run;
    const audio = shownAssets?.audio ?? null;
    if (audioContext !== null && audio !== null && audio.layout.sounds.length > 0) {
      const context = audioContext;
      const sound: PlayingSound = { when: null, sounds: null };
      run.sound = sound;
      const begin = (): void => {
        if (playing !== run) return;
        const when = context.currentTime + SOUND_LEAD_S;
        const fromSample = Number(sampleAt(BigInt(startUs)));
        sound.sounds = scheduleSounds(context, audio.layout, audio.buffers, fromSample, when);
        sound.when = when;
      };
      const resumable = context as SoundContext & {
        readonly state?: string;
        resume?: () => Promise<void>;
      };
      if (resumable.state === 'running' || typeof resumable.resume !== 'function') begin();
      else {
        resumable.resume().then(begin, () => {
          // The browser keeps the context stopped: the picture plays on without sound.
          if (playing !== run) return;
          run.sound = null;
          run.startNow = scheduler.now();
        });
      }
    }
    run.handle = scheduler.requestFrame(tick);
  };

  /** The microseconds played since the clock started: heard ones, with sound (D53). */
  const elapsedOf = (run: Playing): number => {
    if (run.sound === null) return Math.round((scheduler.now() - run.startNow) * 1_000);
    const { when } = run.sound;
    if (when === null || audioContext === null) return 0;
    const latency = (audioContext as { readonly outputLatency?: unknown }).outputLatency;
    const heard = audioContext.currentTime - (typeof latency === 'number' ? latency : 0);
    return Math.round((heard - when) * 1_000_000);
  };

  const tick = (): void => {
    if (playing === null || composition === null) return;
    const { fps, durationUs } = composition;
    const last = frameCount(durationUs, fps) - 1;
    const elapsedUs = Math.max(0, elapsedOf(playing));
    const index = Math.min(timeUsToFrame(playing.startUs + elapsedUs, fps), last);
    const target = frameToTimeUs(index, fps);
    if (!seeking && target !== timeUs) {
      // Skipped while a seek is in flight, so requests never pile up (D25.6).
      startSeek(target, null);
    }
    if (index === last) {
      // The sound of the last frame plays to its end; the next start stops it.
      const sounds = playing.sound?.sounds ?? null;
      playing.sound = null;
      stopClock();
      lingering = sounds;
      return;
    }
    playing.handle = scheduler.requestFrame(tick);
  };

  const player: Player = {
    async load(document, resolveAsset) {
      const { text, loaded } = parsed(document);
      stopClock();
      waiting?.reject(new PlayerError('superseded', 'A new document was loaded.'));
      waiting = null;
      status = 'loading';
      composition = null;
      timeUs = null;
      notify();
      // A seek that is still in flight finishes first; the page takes one request at a time.
      await inFlight;
      shownAssets = null;
      videoSource = null;
      let assets: PreparedAssets;
      try {
        // A load asks again for every asset except the videos the host prepared (D44, D51.5).
        assets = await prepareAssets(view, loaded, resolveAsset, knownAssets(false), audioContext);
        frame.style.setProperty('width', `${String(loaded.width)}px`);
        frame.style.setProperty('height', `${String(loaded.height)}px`);
        await request({
          type: LOAD,
          version: PROTOCOL_VERSION,
          requestId: nextRequestId++,
          document: text,
          assets: assets.messages,
          ackTimeoutMs,
          customHtml: { mode: customHtml.mode },
        });
      } catch (reason) {
        throw fail(reason);
      }
      composition = loaded;
      shownAssets = assets;
      videoSource = assets.videos.size === 0 ? null : createVideoFrameSource(view, assets.videos);
      await seek(0);
    },
    update(document, resolveAsset) {
      const run = updates.then(() => update(document, resolveAsset));
      updates = run.catch(() => undefined);
      return run;
    },
    seek,
    play() {
      if (composition === null || playing !== null) return;
      const { fps, durationUs } = composition;
      const last = frameToTimeUs(frameCount(durationUs, fps) - 1, fps);
      const startUs = timeUs === null || timeUs >= last ? 0 : timeUs;
      startClock(startUs);
      if (!seeking && error === null) status = 'playing';
      notify();
    },
    pause() {
      stopClock();
      if (!seeking && error === null && status === 'playing') status = 'ready';
      notify();
    },
    getState: snapshot,
    async prepareVideo(asset, resolveAsset) {
      if (destroyed) throw new PlayerError('destroyed', 'The Player was destroyed.');
      const given: unknown = asset;
      const { id, type, contentHash } = (
        typeof given === 'object' && given !== null ? given : {}
      ) as Partial<PlayerAssetRequest>;
      if (
        typeof id !== 'string' ||
        type !== 'video' ||
        typeof contentHash !== 'string' ||
        !CONTENT_HASH.test(contentHash)
      ) {
        throw new PlayerError(
          'invalid-options',
          'prepareVideo needs { id, type: "video", contentHash } with a sha256 content hash.',
        );
      }
      const known = preparedVideos.get(contentHash) ?? shownAssets?.videos.get(contentHash);
      if (known !== undefined) {
        preparedVideos.set(contentHash, known);
        return known.facts;
      }
      try {
        const BlobOf = (view as unknown as { Blob?: typeof Blob }).Blob ?? Blob;
        const blob =
          shownAssets?.blobs.get(contentHash) ??
          (await verifyVideo({ id, type, contentHash }, resolveAsset, BlobOf));
        const video = await readVideo(blob);
        preparedVideos.set(contentHash, video);
        return video.facts;
      } catch (reason) {
        throw typed(reason);
      }
    },
    async prepareAudio(asset, resolveAsset) {
      if (destroyed) throw new PlayerError('destroyed', 'The Player was destroyed.');
      const given: unknown = asset;
      const { id, type, contentHash } = (
        typeof given === 'object' && given !== null ? given : {}
      ) as Partial<PlayerAssetRequest>;
      if (
        typeof id !== 'string' ||
        (type !== 'audio' && type !== 'video') ||
        typeof contentHash !== 'string' ||
        !CONTENT_HASH.test(contentHash)
      ) {
        throw new PlayerError(
          'invalid-options',
          'prepareAudio needs { id, type: "audio" or "video", contentHash } with a sha256 content hash.',
        );
      }
      const known = preparedSounds.get(contentHash) ?? shownAssets?.sounds.get(contentHash);
      if (known !== undefined) {
        preparedSounds.set(contentHash, known);
        return soundFacts(known);
      }
      const decoder = audioContext ?? offlineDecoderOf();
      if (decoder === null) {
        throw new PlayerError(
          'audio-unsupported',
          'This window has no Web Audio context to decode sound with (D53).',
        );
      }
      try {
        let bytes: ArrayBuffer;
        if (type === 'video') {
          const BlobOf = (view as unknown as { Blob?: typeof Blob }).Blob ?? Blob;
          const blob =
            shownAssets?.blobs.get(contentHash) ??
            preparedVideos.get(contentHash) ??
            (await verifyVideo({ id, type, contentHash }, resolveAsset, BlobOf));
          bytes = await blob.blob.arrayBuffer();
        } else {
          const cached = shownAssets?.bytes.get(contentHash);
          const verified = await resolveOneAsset(
            { id, type, contentHash },
            (request) =>
              cached ?? (resolveAsset(request) as PlayerAsset | null | Promise<PlayerAsset | null>),
            sha256,
          );
          bytes = verified.bytes.slice().buffer;
        }
        const buffer = await decodeSound(decoder, id, bytes);
        preparedSounds.set(contentHash, buffer);
        return soundFacts(buffer);
      } catch (reason) {
        throw typed(reason);
      }
    },
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
      destroyed = true;
      stopClock();
      view.removeEventListener('message', onMessage);
      const gone = new PlayerError('destroyed', 'The Player was destroyed.');
      waiting?.reject(gone);
      waiting = null;
      pending?.settle(gone);
      pending = null;
      readyPage?.(gone);
      readyPage = null;
      listeners.clear();
      shownAssets = null;
      videoSource = null;
      preparedVideos.clear();
      preparedSounds.clear();
      frame.remove();
    },
  };

  const pageReady = new Promise<void>((resolve, reject) => {
    const handle = timers.setTimeout(() => {
      if (readyPage === null) return;
      readyPage = null;
      reject(new PlayerError('page-timeout', 'The render page did not start in time.'));
    }, requestTimeoutMs);
    readyPage = (failure) => {
      timers.clearTimeout(handle);
      if (failure === null) resolve();
      else reject(failure);
    };
  });
  container.append(frame);
  try {
    await pageReady;
  } catch (reason) {
    player.destroy();
    throw reason;
  }
  return player;
}
