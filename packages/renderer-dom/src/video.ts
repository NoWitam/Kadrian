/**
 * The frames of video nodes (D50.4). The renderer shows a video as an image the
 * host supplies for each frame it renders: the runtime says which source time
 * an active video node shows (D49.5), the host selects the source frame by the
 * rule of `@kadrion/schema` and decodes its pixels, and this module writes them
 * into the node's image. An inactive video node loses its source, so a frame
 * that an earlier render left is never shown. Nothing is kept between calls.
 * A playing Player may give a frame as a bitmap instead (D87.3, D87.4): the
 * node's image is then replaced by a canvas with the same attributes and
 * styles, which shows the bitmap, and the image returns with the next frame
 * given as bytes or the node's next inactive frame. A Producer never sends a
 * bitmap, so the tree it renders is the tree of D50.4.
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

/**
 * The pixels of the source frame of a playing video node, as a bitmap the
 * message owns (D87.3). Only a Player sends one; a Producer never does.
 */
export interface VideoFrameBitmap {
  readonly nodeId: string;
  readonly bitmap: ImageBitmap;
}

const FRAME_KEYS = 'bytes,mediaType,nodeId';
const BITMAP_KEYS = 'bitmap,nodeId';

/** What one node is given: the URL of image bytes, or a bitmap. */
type Supplied = { readonly url: string } | { readonly bitmap: ImageBitmap };

function invalid(message: string): RenderError {
  return new RenderError('video-frames-invalid', message);
}

/** An `ArrayBuffer` of any realm: a structured clone belongs to the page, a test's may not. */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

/** An `ImageBitmap` of any realm that is not closed. */
function isBitmap(value: unknown): value is ImageBitmap {
  if (Object.prototype.toString.call(value) !== '[object ImageBitmap]') return false;
  const { width, height } = value as ImageBitmap;
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
}

const SHAPES =
  'A video frame is { nodeId, mediaType, bytes } with an image media type, or { nodeId, bitmap } with an open ImageBitmap.';

/** Reads the frames once: an array of `{ nodeId, mediaType, bytes }` or `{ nodeId, bitmap }`, each node once. */
function framesByNode(frames: unknown): ReadonlyMap<string, Supplied> {
  if (!Array.isArray(frames)) throw invalid('The video frames must be an array.');
  const supplied = new Map<string, Supplied>();
  for (const frame of frames as unknown[]) {
    if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) throw invalid(SHAPES);
    const keys = Reflect.ownKeys(frame)
      .map((key) => (typeof key === 'string' ? key : '#symbol'))
      .sort()
      .join(',');
    const { nodeId, mediaType, bytes, bitmap } = frame as Partial<Record<string, unknown>>;
    let given: Supplied;
    if (
      keys === FRAME_KEYS &&
      typeof nodeId === 'string' &&
      typeof mediaType === 'string' &&
      MEDIA_TYPE.test(mediaType) &&
      mediaType.startsWith('image/') &&
      isArrayBuffer(bytes)
    ) {
      given = { url: `data:${mediaType};base64,${base64(new Uint8Array(bytes))}` };
    } else if (keys === BITMAP_KEYS && typeof nodeId === 'string' && isBitmap(bitmap)) {
      given = { bitmap };
    } else {
      throw invalid(SHAPES);
    }
    if (supplied.has(nodeId)) throw invalid(`The video node "${nodeId}" has two frames.`);
    supplied.set(nodeId, given);
  }
  return supplied;
}

/** The attributes an element of a video node keeps when it changes from image to canvas or back. */
function carried(name: string): boolean {
  return name !== 'src' && name !== 'alt' && name !== 'width' && name !== 'height';
}

/**
 * The element of a video node as `tag`: the same element when it is one, else
 * a new one in its place with the same attributes and styles (D87.4).
 */
function asTag(element: HTMLElement, tag: 'img' | 'canvas'): HTMLElement {
  if (element.localName === tag) return element;
  const next = element.ownerDocument.createElement(tag);
  for (const { name, value } of [...element.attributes]) {
    if (carried(name)) next.setAttribute(name, value);
  }
  if (tag === 'img') next.setAttribute('alt', '');
  element.replaceWith(next);
  return next;
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
  // Checked before anything is written: a page that cannot draw a bitmap refuses it.
  if (
    [...urls.values()].some((given) => 'bitmap' in given) &&
    root.ownerDocument.createElement('canvas').getContext('bitmaprenderer') === null
  ) {
    throw invalid('This page cannot draw a bitmap: it has no bitmaprenderer context.');
  }
  for (const { element, state: node } of videos) {
    const given = urls.get(node.id);
    if (given === undefined || 'url' in given) {
      // An inactive node, or bytes: the image of D50.4.
      const image = asTag(element, 'img');
      if (given === undefined) image.removeAttribute('src');
      else if (image.getAttribute('src') !== given.url) image.setAttribute('src', given.url);
      continue;
    }
    const canvas = asTag(element, 'canvas') as HTMLCanvasElement;
    if (canvas.width !== given.bitmap.width) canvas.width = given.bitmap.width;
    if (canvas.height !== given.bitmap.height) canvas.height = given.bitmap.height;
    const context = canvas.getContext('bitmaprenderer');
    if (context === null) throw invalid('A canvas of a video node has no bitmaprenderer context.');
    context.transferFromImageBitmap(given.bitmap);
  }
}
