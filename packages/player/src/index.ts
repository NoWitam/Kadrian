/**
 * @kadrion/player — browser host, iframe protocol, playback and seek.
 *
 * `createPlayer` puts the render page of `@kadrion/renderer-dom` into a
 * sandboxed frame, runs the verified runtime build in it, and offers `load`,
 * `seek`, `play`, and `pause` (D25). The Player decides no pixel and loads
 * nothing but the runtime build and the asset bytes the application passes.
 * Video nodes are decoded in the host window by the browser's WebCodecs
 * decoder and reach the page as images (D51).
 */
export { PlayerError } from './errors.js';
export type { PlayerErrorCode } from './errors.js';
export { createPlayer } from './player.js';
export type {
  Player,
  PlayerAsset,
  PlayerAssetRequest,
  PlayerAssetResolver,
  PlayerCustomHtmlPolicy,
  PlayerListener,
  PlayerListenerErrorHandler,
  PlayerOptions,
  PlayerRuntime,
  PlayerScheduler,
  PlayerState,
  PlayerStatus,
  PlayerTimers,
  PlayerVideoAsset,
  PlayerVideoFacts,
} from './player.js';
