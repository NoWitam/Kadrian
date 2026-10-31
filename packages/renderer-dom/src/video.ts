/**
 * The frames of video nodes (D50.4). The renderer shows a video as an image the
 * host supplies for each frame it renders: the runtime says which source time
 * an active video node shows (D49.5), the host selects the source frame by the
 * rule of `@kadrion/schema` and decodes its pixels, and this module writes them
 * into the node's image. An inactive video node loses its source, so a frame
 * that an earlier render left is never shown. Nothing is kept between calls.
 */
import type { CompositionState } from '@kadrion/runtime';

import { RenderError } from './errors.js';
import { base64 } from './load.js';
import { MEDIA_TYPE } from './media-type.js';
import { mountedNodes } from './render.js';

/** The pixels of the source frame one video node shows in one render, as image bytes. */
export interface VideoFrame {
  readonly nodeId: string;
  readonly mediaType: string;
  readonly bytes: ArrayBuffer;
}

const FRAME_KEYS = 'bytes,mediaType,nodeId';

function invalid(message: string): RenderError {
  return new RenderError('video-frames-invalid', message);
}

/** An `ArrayBuffer` of any realm: a structured clone belongs to the page, a test's may not. */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

/** Reads the frames once: an array of `{ nodeId, mediaType, bytes }`, each node once. */
function framesByNode(frames: unknown): ReadonlyMap<string, string> {
  if (!Array.isArray(frames)) throw invalid('The video frames must be an array.');
  const urls = new Map<string, string>();
  for (const frame of frames as unknown[]) {
    if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) {
      throw invalid('A video frame is not { nodeId, mediaType, bytes }.');
    }
    const keys = Reflect.ownKeys(frame).map((key) => (typeof key === 'string' ? key : '#symbol'));
    const { nodeId, mediaType, bytes } = frame as Partial<Record<string, unknown>>;
    if (
      keys.sort().join(',') !== FRAME_KEYS ||
      typeof nodeId !== 'string' ||
      typeof mediaType !== 'string' ||
      !MEDIA_TYPE.test(mediaType) ||
      !mediaType.startsWith('image/') ||
      !isArrayBuffer(bytes)
    ) {
      throw invalid('A video frame is not { nodeId, mediaType, bytes } with an image media type.');
    }
    if (urls.has(nodeId)) throw invalid(`The video node "${nodeId}" has two frames.`);
    urls.set(nodeId, `data:${mediaType};base64,${base64(new Uint8Array(bytes))}`);
  }
  return urls;
}

/**
 * Writes the supplied frames into the video nodes of the tree that
 * `mountComposition` built, for the instant of `state`: every active video node
 * must have exactly one frame and gets it as the source of its image; every
 * inactive one must have none and loses its source. The tree and the frames are
 * checked first; a problem throws a `RenderError` before anything is written.
 */
export function applyVideoFrames(root: Element, state: CompositionState, frames: unknown): void {
  const urls = framesByNode(frames);
  const videos = mountedNodes(root, state).filter(({ state: node }) => node.type === 'video');
  const active = new Set(
    videos.filter(({ state: node }) => node.active).map(({ state: node }) => node.id),
  );
  const missing = [...active].filter((nodeId) => !urls.has(nodeId));
  const extra = [...urls.keys()].filter((nodeId) => !active.has(nodeId));
  if (missing.length > 0 || extra.length > 0) {
    const list = (ids: readonly string[]): string => ids.map((id) => JSON.stringify(id)).join(', ');
    throw invalid(
      [
        missing.length > 0 ? `no frame for the active video nodes ${list(missing)}` : '',
        extra.length > 0 ? `a frame for ${list(extra)}, which is no active video node` : '',
      ]
        .filter((part) => part !== '')
        .join('; ') + '.',
    );
  }
  for (const { element, state: node } of videos) {
    const url = urls.get(node.id);
    if (url === undefined) element.removeAttribute('src');
    else if (element.getAttribute('src') !== url) element.setAttribute('src', url);
  }
}
