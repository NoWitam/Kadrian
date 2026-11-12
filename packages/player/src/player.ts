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
  readImageSize,
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
  frameToTimeUs,
  isTemplate,
  timeUsToFrame,
  readSvg,
  validateComposition,
  type SvgViewBox,
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
import { playerCode, PlayerError, withAsset, type PlayerErrorAsset } from './errors.js';
import {
  checkDecodable,
  checkSourceRanges,
  createVideoFrameSource,
  readVideo,
  RunCache,
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

/** The size of a verified image as an image node lays it out, read from its header (D62.1). */
export interface PlayerImageFacts {
  readonly width: number;
  readonly height: number;
  /** The view box of an SVG asset (D74.6); absent for an image. */
  readonly viewBox?: SvgViewBox;
}

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

/**
 * `waiting`: playing, but the frame the clock is at is not shown yet, because
 * the frame before it (its video frames, its page render) or the sound is not
 * ready; the frame shown is still a frame of the document (D61.3). `ended`:
 * playback reached the last frame of the document or of the play range and
 * stopped, reported once per play (D61.1).
 */
export type PlayerStatus =
  'empty' | 'loading' | 'seeking' | 'ready' | 'playing' | 'waiting' | 'ended' | 'error';

/**
 * The part of the document playback stays in (D61.2): from `startUs`, a time
 * of the frame grid, to `endUs`, exclusive, a time of the frame grid or the
 * document's duration. With `loop`, playback restarts at `startUs` after the
 * last frame of the range instead of ending.
 */
export interface PlayerPlayRange {
  readonly startUs: number;
  readonly endUs: number;
  readonly loop: boolean;
}

export interface PlayerState {
  readonly status: PlayerStatus;
  /** The time of the last frame that became ready, or `null` before the first. */
  readonly timeUs: number | null;
  /** The verified content hash of the runtime build that the page runs (D25.5). */
  readonly runtimeHash: string;
  readonly error: PlayerError | null;
  /** The play range, or `null` for the whole document (D61.2). */
  readonly playRange: PlayerPlayRange | null;
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
  /**
   * Bounds playback to `range`, or to the whole document with `null` (D61.2).
   * It needs a loaded document (`not-loaded`) and a range inside it on its
   * frame grid (`invalid-play-range`). While playing, the clock goes on from
   * the frame shown if the range holds it, else from the range's start. `load`
   * clears the range; `update` keeps it while the new document holds it,
   * cut to its end when the document became shorter, and clears it otherwise.
   */
  setPlayRange(range: PlayerPlayRange | null): void;
  getState(): PlayerState;
  /**
   * Calls `listener` with the new state after every change of `status`,
   * `timeUs`, `error`, or `playRange`, until the returned function is called.
   * Needs the option `onListenerError` (D44, D61).
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
  /**
   * Resolves and verifies one image asset and reads its size from its header
   * (D62.1), before any document uses it, without decoding it: the size is
   * the same as the Producer reads. The verified bytes are kept for a later
   * `load` or `update`. A media type other than PNG, JPEG, or WebP is
   * `image-unsupported`; bytes that are not a whole file of their media type
   * are `image-invalid`. An SVG asset is read by the sanitiser instead, which
   * gives its natural size and its view box, or refuses it with
   * `svg-refused` (D74.6).
   */
  prepareImage(
    asset: PlayerAssetRequest,
    resolveAsset: PlayerAssetResolver,
  ): Promise<PlayerImageFacts>;
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

/** The nodes of a document, group children included, in document order. */
interface AnyNode {
  readonly id: string;
  readonly type: string;
  readonly assetId?: string;
  readonly children?: readonly AnyNode[];
}

function nodesOf(composition: ValidatedComposition): AnyNode[] {
  const found: AnyNode[] = [];
  const visit = (node: AnyNode): void => {
    found.push(node);
    node.children?.forEach(visit);
  };
  for (const scene of composition.scenes) scene.nodes.forEach(visit);
  return found;
}

/**
 * The asset a failure of the page is about (D61.4). The page reports it in
 * the message of the runtime build only: `The font "<id>"` for a font, and
 * `The image of "<node id>"` for an image, which names the node; the forms
 * are pinned by a test against the renderer's own errors.
 */
export function pageFailureAsset(
  failure: PageFailure,
  composition: ValidatedComposition | null,
): PlayerErrorAsset | null {
  if (composition === null) return null;
  let id: string | undefined;
  if (failure.code === 'font-load-failed' || failure.code === 'asset-url-missing') {
    id = /^The font "([^"]*)"/.exec(failure.message)?.[1];
  } else if (failure.code === 'asset-decode-failed') {
    const nodeId = /^The image of "([^"]*)"/.exec(failure.message)?.[1];
    id = nodesOf(composition).find((node) => node.id === nodeId)?.assetId;
  }
  const asset = composition.assets.find((candidate) => candidate.id === id);
  return asset === undefined ? null : { id: asset.id, contentHash: asset.contentHash };
}

function failureError(failure: PageFailure, composition: ValidatedComposition | null): PlayerError {
  return new PlayerError(
    playerCode(failure.code),
    failure.message,
    failure.details,
    pageFailureAsset(failure, composition),
  );
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
      try {
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
      } catch (reason) {
        throw withAsset(typed(reason), { id, contentHash });
      }
    }
    const hashes = new Map(composition.assets.map((asset) => [asset.id, asset.contentHash]));
    for (const node of videoNodes(composition)) {
      const contentHash = hashes.get(node.assetId) ?? '';
      if (prepared.videos.has(contentHash)) continue;
      const asset = { id: node.assetId, contentHash };
      const blob = prepared.blobs.get(contentHash);
      if (blob === undefined) {
        throw new PlayerError(
          'asset-missing',
          `The video "${node.assetId}" was not resolved.`,
          [],
          asset,
        );
      }
      try {
        prepared.videos.set(contentHash, known.videos.get(contentHash) ?? (await readVideo(blob)));
      } catch (reason) {
        throw withAsset(typed(reason), asset);
      }
    }
    checkSourceRanges(composition, prepared.videos);
    if (prepared.videos.size > 0) {
      // Named by the document's own asset ID, whichever ID prepared the video.
      const ids = new Map(composition.assets.map((asset) => [asset.contentHash, asset.id]));
      await checkDecodable(
        view,
        [...prepared.videos.values()].map((video) => ({
          ...video,
          id: ids.get(video.contentHash) ?? video.id,
        })),
      );
    }
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
        throw new PlayerError('asset-missing', `The sound "${id}" was not resolved.`, [], {
          id,
          contentHash,
        });
      }
      try {
        buffer = await decodeSound(decoder, id, bytes);
      } catch (reason) {
        throw withAsset(typed(reason), { id, contentHash });
      }
    }
    prepared.sounds.set(contentHash, buffer);
    buffers.set(id, buffer);
  }
  checkSoundRanges(
    layout,
    buffers,
    new Map(composition.assets.map((asset) => [asset.id, asset.contentHash])),
  );
  return { layout, buffers };
}

/** The sound of one run of the clock: when its first sample is heard, once scheduled. */
interface PlayingSound {
  when: number | null;
  /** The passes scheduled so far, by number; a run without a loop has pass 0 only (D61.2). */
  readonly passes: Map<number, ScheduledSounds>;
}

/**
 * What one run of the clock plays (D61.2): from `startUs` to the exclusive
 * `endUs`, whose last frame starts at `lastUs`; with `loop`, again from
 * `startUs` after it.
 */
interface Bounds {
  readonly startUs: number;
  readonly endUs: number;
  readonly lastUs: number;
  readonly loop: boolean;
  /** Whether a play range set them; the whole document's sound plays to its own end. */
  readonly ranged: boolean;
}

/** One run of the preview clock, from `startUs` inside `bounds`. */
interface Playing {
  startNow: number;
  readonly startUs: number;
  readonly bounds: Bounds;
  handle: number;
  /** With sound, the audio context is the clock (D53); otherwise `null`. */
  sound: PlayingSound | null;
}

interface Queued {
  readonly timeUs: number;
  readonly resolve: () => void;
  readonly reject: (error: PlayerError) => void;
}

interface Pending {
  readonly requestId: number;
  /** The document the request is about, to name the asset of a failure (D61.4). */
  readonly document: ValidatedComposition | null;
  readonly settle: (error: PlayerError | null) => void;
}

/** The time of the last frame that starts before `endUs` (D13). */
function lastFrameUs(endUs: number, fps: number): number {
  return frameToTimeUs(timeUsToFrame(endUs - 1, fps), fps);
}

/** Whether `timeUs` is the time of a frame of the grid (D13). */
function onGrid(timeUs: number, fps: number): boolean {
  return frameToTimeUs(timeUsToFrame(timeUs, fps), fps) === timeUs;
}

/**
 * A play range checked against `composition` (D61.2), as a frozen copy: whole
 * microseconds, `0 <= startUs < endUs <= durationUs`, `startUs` on the frame
 * grid, `endUs` on it or the document's end, and a boolean `loop`.
 */
function checkedRange(value: unknown, composition: ValidatedComposition): PlayerPlayRange {
  const { startUs, endUs, loop } = (
    typeof value === 'object' && value !== null ? value : {}
  ) as Partial<Record<keyof PlayerPlayRange, unknown>>;
  const { durationUs, fps } = composition;
  if (
    typeof startUs !== 'number' ||
    typeof endUs !== 'number' ||
    typeof loop !== 'boolean' ||
    !Number.isSafeInteger(startUs) ||
    !Number.isSafeInteger(endUs) ||
    startUs < 0 ||
    endUs <= startUs ||
    endUs > durationUs ||
    !onGrid(startUs, fps) ||
    (endUs !== durationUs && !onGrid(endUs, fps))
  ) {
    throw new PlayerError(
      'invalid-play-range',
      `A play range is { startUs, endUs, loop }: integers with 0 <= startUs < endUs <= ${String(durationUs)}, startUs a frame time and endUs a frame time or the end, at ${String(fps)} fps (D61.2).`,
    );
  }
  return Object.freeze({ startUs, endUs, loop });
}

/** What the clock plays: the play range, or the whole document. */
function boundsOf(composition: ValidatedComposition, range: PlayerPlayRange | null): Bounds {
  const startUs = range?.startUs ?? 0;
  const endUs = range?.endUs ?? composition.durationUs;
  return {
    startUs,
    endUs,
    lastUs: lastFrameUs(endUs, composition.fps),
    loop: range?.loop ?? false,
    ranged: range !== null,
  };
}

/**
 * The range kept by an update (D61.2): the same values while the new document
 * holds them, with `endUs` cut to a shorter document's end; otherwise `null`.
 */
function keptRange(
  range: PlayerPlayRange | null,
  composition: ValidatedComposition,
): PlayerPlayRange | null {
  if (range === null) return null;
  const endUs = Math.min(range.endUs, composition.durationUs);
  try {
    const kept = checkedRange({ ...range, endUs }, composition);
    return kept.endUs === range.endUs ? range : kept;
  } catch {
    return null;
  }
}

/**
 * Where a run is after `elapsed` (in microseconds, or in samples with sound):
 * its pass, and how far into it. Pass 0 runs from the run's start to the
 * range's end; every later pass is the whole range (D61.2).
 */
function passAt(
  elapsed: number,
  first: number,
  length: number,
  loop: boolean,
): { pass: number; offset: number } | null {
  if (elapsed < first) return { pass: 0, offset: elapsed };
  if (!loop) return null;
  const after = elapsed - first;
  return { pass: 1 + Math.floor(after / length), offset: after % length };
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
  let playRange: PlayerPlayRange | null = null;
  let composition: ValidatedComposition | null = null;
  let nextRequestId = 1;
  let pending: Pending | null = null;
  let seeking = false;
  /** The time of the frame in flight, while `seeking`. */
  let seekingTo: number | null = null;
  let queued: Queued | null = null;
  let playing: Playing | null = null;
  /** The clock is at a newer frame than the one in flight: playback is held (D61.3). */
  let late = false;
  /** The last play reached its last frame and stopped (D61.1). */
  let ended = false;
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
  /** Images verified by `prepareImage`, by content hash (D62). */
  const preparedImages = new Map<string, PlayerAsset>();
  /** The decoders of the document shown now, or `null` without video nodes (D51.4). */
  let videoSource: VideoFrameSource | null = null;
  // One cache of decode runs for the Player's life, across loads and updates (D82.4): a
  // run is kept by the content hash of its video, so a frame is the same in every document.
  const runs = new RunCache();
  /** Updates run one after another, each after the one before has settled. */
  let updates: Promise<void> = Promise.resolve();
  const { onListenerError } = options;
  /** One entry per subscription, so that the same function may subscribe twice. */
  const listeners = new Set<{ readonly listener: PlayerListener }>();
  let reported: PlayerState | null = null;

  const snapshot = (): PlayerState =>
    Object.freeze({ status, timeUs, runtimeHash, error, playRange });

  /**
   * Tells every listener about the state, unless it equals the one reported
   * last. Called after each change; a listener's error goes to the host (D44).
   */
  const notify = (): void => {
    if (
      reported !== null &&
      reported.status === status &&
      reported.timeUs === timeUs &&
      reported.error === error &&
      reported.playRange === playRange
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
    const { settle, document } = pending;
    pending = null;
    settle(result.error === null ? null : failureError(result.error, document));
  };
  view.addEventListener('message', onMessage);

  /**
   * Sends one request about `document` and waits for its result, bounded by
   * the request timeout.
   */
  const request = (
    message: Record<string, unknown>,
    document: ValidatedComposition | null,
  ): Promise<void> =>
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
        document,
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
    // A template is never played as it is; a host plays its instantiation (D58.4).
    if (isTemplate(result.composition)) {
      throw fail(
        new PlayerError(
          'invalid-document',
          'The document is a template; instantiate it first with instantiateTemplate (D58.4).',
          ['/template: not empty'],
        ),
      );
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
    const bytes = new Map(preparedImages);
    if (includeShown && shownAssets !== null) {
      for (const [hash, asset] of shownAssets.bytes) bytes.set(hash, asset);
    }
    return {
      sounds,
      bytes,
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

  /**
   * The status once nothing the host asked for is in flight (D61): playing,
   * or waiting while the clock is ahead of the frame shown or its sound has
   * not started; ended after a play reached its last frame; ready otherwise.
   */
  const settledStatus = (): PlayerStatus => {
    if (playing !== null) return late || playing.sound?.when === null ? 'waiting' : 'playing';
    return ended ? 'ended' : 'ready';
  };

  /** Settles the status after something changed while no request of the host is in flight. */
  const resettle = (): void => {
    if (!seeking && error === null && composition !== null) status = settledStatus();
    notify();
  };

  /** The marker of a queued frame that the clock, not the host, asked for. */
  const clockFrame = (): void => undefined;

  /**
   * Renders the frame at `target`. A seek of the host (`byClock` false) shows
   * the status `seeking` until it is ready; a frame of the clock leaves the
   * status as it is, so playing stays playing (D61.3).
   */
  const startSeek = (target: number, done: Queued | null, byClock = false): void => {
    seeking = true;
    seekingTo = target;
    if (!byClock) {
      status = 'seeking';
      notify();
    }
    const requestId = nextRequestId++;
    const shown = composition;
    const source = videoSource;
    const sent = (async () => {
      const videoFrames = await framesOf(source, shown, target);
      await request(
        {
          type: SEEK,
          version: PROTOCOL_VERSION,
          requestId,
          timeUs: target,
          videoFrames,
        },
        shown,
      );
    })();
    inFlight = sent.then(
      () => undefined,
      () => undefined,
    );
    sent.then(
      () => {
        seeking = false;
        seekingTo = null;
        late = false;
        timeUs = target;
        error = null;
        done?.resolve();
        next();
        notify();
      },
      (reason: unknown) => {
        seeking = false;
        seekingTo = null;
        late = false;
        const failure = fail(reason);
        stopClock();
        done?.reject(failure);
        next();
      },
    );
  };

  /** After a seek: start the one that waits, or settle the status. */
  const next = (): void => {
    if (queued !== null) {
      const waiting = queued;
      queued = null;
      // It was checked against the document of its time; an update may have shortened it.
      if (composition !== null && waiting.timeUs >= composition.durationUs) {
        waiting.reject(outOfRange(waiting.timeUs));
        next();
        return;
      }
      startSeek(waiting.timeUs, waiting, waiting.resolve === clockFrame);
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
    ended = false;
    queued?.reject(new PlayerError('superseded', 'A new document replaced this seek.'));
    queued = null;
    // A seek that is still in flight finishes first; its time is the one kept.
    await inFlight;
    const shown = Math.min(timeUs ?? 0, loaded.durationUs - 1);
    const target = frameToTimeUs(timeUsToFrame(shown, loaded.fps), loaded.fps);
    // `timeUs` keeps the frame shown until the new one is.
    seeking = true;
    seekingTo = target;
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
      const source =
        assets.videos.size === 0 ? null : createVideoFrameSource(view, assets.videos, runs);
      staged = { assets, source };
      const videoFrames = await framesOf(source, loaded, target);
      frame.style.setProperty('width', `${String(loaded.width)}px`);
      frame.style.setProperty('height', `${String(loaded.height)}px`);
      await request(
        {
          type: UPDATE,
          version: PROTOCOL_VERSION,
          requestId: nextRequestId++,
          document: text,
          assets: assets.messages,
          ackTimeoutMs,
          customHtml: { mode: customHtml.mode },
          timeUs: target,
          videoFrames,
        },
        loaded,
      );
    })();
    inFlight = sent.then(
      () => undefined,
      () => undefined,
    );
    try {
      await sent;
    } catch (reason) {
      seeking = false;
      seekingTo = null;
      // What the page holds is not known any more: a new load is needed.
      composition = null;
      timeUs = null;
      playRange = null;
      shownAssets = null;
      videoSource = null;
      // A seek may have been requested while the update was in flight.
      (queued as Queued | null)?.reject(new PlayerError('superseded', 'The update failed.'));
      queued = null;
      throw fail(reason);
    }
    seeking = false;
    seekingTo = null;
    composition = loaded;
    // The range is kept while the new document holds it (D61.2).
    playRange = keptRange(playRange, loaded);
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
      ended = false;
      if (playing !== null) {
        // While playing, the clock goes on from the time sought, with its sound (D53); a
        // time outside the play range stops it, since playback stays inside (D61.2).
        const { bounds } = playing;
        if (checked >= bounds.startUs && checked < bounds.endUs) startClock(checked, bounds);
        else stopClock();
      }
      if (!seeking) {
        startSeek(checked, { timeUs: checked, resolve, reject });
        return;
      }
      // One seek at a time; a newer one supersedes the one that waits (D25.6).
      queued?.reject(new PlayerError('superseded', 'A newer seek replaced this one.'));
      queued = { timeUs: checked, resolve, reject };
      // The frame in flight is the clock's: the status says that the host's seek runs.
      status = 'seeking';
      notify();
    });

  const stopClock = (): void => {
    if (playing !== null) {
      scheduler.cancelFrame(playing.handle);
      for (const pass of playing.sound?.passes.values() ?? []) pass.stop();
    }
    playing = null;
    late = false;
    lingering?.stop();
    lingering = null;
  };

  /**
   * Schedules pass `pass` of a run's sound (D61.2): pass 0 from the run's
   * start, every later one the whole range, each heard right after the one
   * before, sample for sample, as a seek to the range's start would schedule
   * it (D53).
   */
  const schedulePass = (run: Playing, sound: PlayingSound, pass: number): void => {
    const audio = shownAssets?.audio ?? null;
    if (audioContext === null || audio === null || sound.when === null) return;
    const { bounds } = run;
    const runStart = Number(sampleAt(BigInt(run.startUs)));
    const rangeStart = Number(sampleAt(BigInt(bounds.startUs)));
    const rangeEnd = bounds.ranged ? Number(sampleAt(BigInt(bounds.endUs))) : undefined;
    const fromSample = pass === 0 ? runStart : rangeStart;
    const before =
      pass === 0 ? 0 : (rangeEnd ?? 0) - runStart + (pass - 1) * ((rangeEnd ?? 0) - rangeStart);
    const when = sound.when + before / AUDIO_SAMPLE_RATE;
    sound.passes.set(
      pass,
      scheduleSounds(audioContext, audio.layout, audio.buffers, fromSample, when, rangeEnd),
    );
  };

  /**
   * Starts the preview clock at `startUs` inside `bounds`, in place of a
   * running one. With sound to play, the clock is the audio context's (D53):
   * the plan is scheduled from the sample of `startUs` a little ahead of the
   * context's time, and the picture follows what is heard; a loop schedules
   * the pass after the one heard (D61.2). A context that is not running is
   * resumed first, and the status is `waiting` until it is (D61.3); one that
   * cannot be resumed leaves the picture to the scheduler, without sound.
   */
  const startClock = (startUs: number, bounds: Bounds): void => {
    stopClock();
    const run: Playing = { startNow: scheduler.now(), startUs, bounds, handle: 0, sound: null };
    playing = run;
    const audio = shownAssets?.audio ?? null;
    if (audioContext !== null && audio !== null && audio.layout.sounds.length > 0) {
      const context = audioContext;
      const sound: PlayingSound = { when: null, passes: new Map() };
      run.sound = sound;
      const begin = (): void => {
        if (playing !== run) return;
        sound.when = context.currentTime + SOUND_LEAD_S;
        schedulePass(run, sound, 0);
        if (bounds.loop) schedulePass(run, sound, 1);
      };
      const resumable = context as SoundContext & {
        readonly state?: string;
        resume?: () => Promise<void>;
      };
      if (resumable.state === 'running' || typeof resumable.resume !== 'function') begin();
      else {
        resumable.resume().then(
          () => {
            begin();
            if (playing === run) resettle();
          },
          () => {
            // The browser keeps the context stopped: the picture plays on without sound.
            if (playing !== run) return;
            run.sound = null;
            run.startNow = scheduler.now();
            resettle();
          },
        );
      }
    }
    run.handle = scheduler.requestFrame(tick);
  };

  /**
   * Where the run is (D61.2): its pass and the time in it, or `null` once a
   * run without a loop is past its end. Without sound the scheduler's
   * milliseconds count; with sound, the samples heard, so that the passes of
   * the picture are those of the sound.
   */
  const positionOf = (run: Playing): { pass: number; timeUs: number } | null => {
    const { bounds, startUs } = run;
    if (run.sound === null) {
      const elapsedUs = Math.max(0, Math.round((scheduler.now() - run.startNow) * 1_000));
      const at = passAt(
        elapsedUs,
        bounds.endUs - startUs,
        bounds.endUs - bounds.startUs,
        bounds.loop,
      );
      if (at === null) return null;
      return { pass: at.pass, timeUs: (at.pass === 0 ? startUs : bounds.startUs) + at.offset };
    }
    const { when } = run.sound;
    if (when === null || audioContext === null) return { pass: 0, timeUs: startUs };
    const latency = (audioContext as { readonly outputLatency?: unknown }).outputLatency;
    const heard = audioContext.currentTime - (typeof latency === 'number' ? latency : 0);
    const elapsed = Math.max(0, (heard - when) * AUDIO_SAMPLE_RATE);
    const runStart = Number(sampleAt(BigInt(startUs)));
    const rangeStart = Number(sampleAt(BigInt(bounds.startUs)));
    const rangeEnd = Number(sampleAt(BigInt(bounds.endUs)));
    const at = passAt(elapsed, rangeEnd - runStart, rangeEnd - rangeStart, bounds.loop);
    if (at === null) return null;
    const offsetUs = Math.round((at.offset * 1_000_000) / AUDIO_SAMPLE_RATE);
    return { pass: at.pass, timeUs: (at.pass === 0 ? startUs : bounds.startUs) + offsetUs };
  };

  /**
   * The end of a play (D61.1): the clock stops, the sound of the last frame
   * plays to its end, the last frame is shown, and then the status is `ended`.
   */
  const finish = (run: Playing, target: number): void => {
    const passes = [...(run.sound?.passes.values() ?? [])];
    run.sound = null;
    stopClock();
    lingering = {
      stop() {
        for (const pass of passes) pass.stop();
      },
    };
    ended = true;
    if (!seeking) {
      if (target === timeUs) resettle();
      else startSeek(target, null, true);
      return;
    }
    // The last frame follows the frame in flight, in place of a frame that waits.
    if (seekingTo !== target) {
      queued?.reject(new PlayerError('superseded', 'Playback reached its last frame.'));
      queued = { timeUs: target, resolve: clockFrame, reject: clockFrame };
    }
  };

  const tick = (): void => {
    if (playing === null || composition === null) return;
    const run = playing;
    const { fps } = composition;
    const { bounds } = run;
    const at = positionOf(run);
    const shownAt = at === null ? bounds.lastUs : Math.min(at.timeUs, bounds.lastUs);
    const target = frameToTimeUs(timeUsToFrame(shownAt, fps), fps);
    if (at === null || (!bounds.loop && target === bounds.lastUs)) {
      finish(run, target);
      return;
    }
    // The pass after the one heard is always scheduled; passes before the last one are over.
    const { sound } = run;
    if (sound !== null && bounds.loop && sound.when !== null) {
      if (!sound.passes.has(at.pass + 1)) schedulePass(run, sound, at.pass + 1);
      for (const [pass, scheduled] of sound.passes) {
        if (pass < at.pass - 1) {
          scheduled.stop();
          sound.passes.delete(pass);
        }
      }
    }
    if (target !== timeUs && target !== seekingTo) {
      if (!seeking) startSeek(target, null, true);
      else if (!late) {
        // The frame before is not ready yet: playback is held, not late (D61.3).
        late = true;
        if (status === 'playing') {
          status = 'waiting';
          notify();
        }
      }
    }
    run.handle = scheduler.requestFrame(tick);
  };

  const player: Player = {
    async load(document, resolveAsset) {
      const { text, loaded } = parsed(document);
      stopClock();
      ended = false;
      queued?.reject(new PlayerError('superseded', 'A new document was loaded.'));
      queued = null;
      status = 'loading';
      composition = null;
      timeUs = null;
      playRange = null;
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
        await request(
          {
            type: LOAD,
            version: PROTOCOL_VERSION,
            requestId: nextRequestId++,
            document: text,
            assets: assets.messages,
            ackTimeoutMs,
            customHtml: { mode: customHtml.mode },
          },
          loaded,
        );
      } catch (reason) {
        throw fail(reason);
      }
      composition = loaded;
      shownAssets = assets;
      videoSource =
        assets.videos.size === 0 ? null : createVideoFrameSource(view, assets.videos, runs);
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
      const bounds = boundsOf(composition, playRange);
      // From the frame shown while the range holds it before its last frame, else from its start.
      const startUs =
        timeUs !== null && timeUs >= bounds.startUs && timeUs < bounds.lastUs
          ? timeUs
          : bounds.startUs;
      ended = false;
      startClock(startUs, bounds);
      if (!seeking && error === null) status = settledStatus();
      notify();
    },
    pause() {
      stopClock();
      if (error === null && (status === 'playing' || status === 'waiting')) {
        status = seeking ? 'seeking' : 'ready';
      }
      notify();
    },
    setPlayRange(range) {
      if (destroyed) throw new PlayerError('destroyed', 'The Player was destroyed.');
      if (composition === null) throw new PlayerError('not-loaded', 'No document is loaded.');
      const checked = range === null ? null : checkedRange(range, composition);
      playRange = checked;
      if (playing !== null) {
        const bounds = boundsOf(composition, playRange);
        const from =
          timeUs !== null && timeUs >= bounds.startUs && timeUs < bounds.endUs
            ? timeUs
            : bounds.startUs;
        startClock(from, bounds);
        if (!seeking && error === null) status = settledStatus();
      }
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
        throw withAsset(typed(reason), { id, contentHash });
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
        throw withAsset(typed(reason), { id, contentHash });
      }
    },
    async prepareImage(asset, resolveAsset) {
      if (destroyed) throw new PlayerError('destroyed', 'The Player was destroyed.');
      const given: unknown = asset;
      const { id, type, contentHash } = (
        typeof given === 'object' && given !== null ? given : {}
      ) as Partial<PlayerAssetRequest>;
      if (
        typeof id !== 'string' ||
        (type !== 'image' && type !== 'svg') ||
        typeof contentHash !== 'string' ||
        !CONTENT_HASH.test(contentHash)
      ) {
        throw new PlayerError(
          'invalid-options',
          'prepareImage needs { id, type: "image" or "svg", contentHash } with a sha256 content hash.',
        );
      }
      try {
        const cached = preparedImages.get(contentHash) ?? shownAssets?.bytes.get(contentHash);
        const verified = await resolveOneAsset(
          { id, type, contentHash },
          (request) =>
            cached ?? (resolveAsset(request) as PlayerAsset | null | Promise<PlayerAsset | null>),
          sha256,
        );
        let facts: PlayerImageFacts;
        if (type === 'svg') {
          // `resolveOneAsset` has accepted it, so the reading succeeds (D74.6).
          const reading = readSvg(verified.bytes);
          if (!reading.ok) throw new PlayerError('svg-refused', reading.error.message);
          const { width, height, viewBox } = reading.svg;
          facts = { width, height, viewBox };
        } else {
          // Checked here too: `resolveOneAsset` reads the header only for the media types it knows.
          const { width, height } = readImageSize(verified.bytes, verified.mediaType);
          facts = { width, height };
        }
        preparedImages.set(contentHash, {
          mediaType: verified.mediaType,
          bytes: verified.bytes.slice(),
        });
        return Object.freeze(facts);
      } catch (reason) {
        throw withAsset(typed(reason), { id, contentHash });
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
      queued?.reject(gone);
      queued = null;
      pending?.settle(gone);
      pending = null;
      readyPage?.(gone);
      readyPage = null;
      listeners.clear();
      shownAssets = null;
      videoSource = null;
      preparedVideos.clear();
      preparedSounds.clear();
      preparedImages.clear();
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
