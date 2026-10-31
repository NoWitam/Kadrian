/**
 * Video nodes and `fit` in the rendered tree (D50.1, D50.4): a video is an
 * image without a source until the host supplies the frame of the instant, an
 * inactive video loses its source, and the fit of images and videos is their
 * `object-fit`. What a browser paints for them is measured in the pinned
 * environment; here the tree is checked.
 */
import { evaluateComposition } from '@kadrion/runtime';
import { videoComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { applyVideoFrames, mountComposition, renderState } from '../src/index.js';
import { awaitMediaReady } from '../src/ready.js';
import { createRoot, elementOf, TRUSTED, validated } from './support.js';

const composition = validated(videoComposition);
const urls = { 'asset-image': 'data:image/png;base64,AAAA' };
const VIDEOS = ['node-video-full', 'node-video-cover', 'node-video-contain'];

function mounted(): HTMLElement {
  const root = createRoot();
  mountComposition(root, composition, urls, TRUSTED);
  return root;
}

function frame(
  nodeId: string,
  byte = 1,
): { nodeId: string; mediaType: string; bytes: ArrayBuffer } {
  return { nodeId, mediaType: 'image/png', bytes: new Uint8Array([byte, 2, 3]).buffer };
}

describe('the mounted tree of video nodes (D50.4)', () => {
  it('mounts every video as an image without a source, sized and fitted like an image', () => {
    const root = mounted();
    for (const id of VIDEOS) {
      const element = elementOf(root, id);
      expect(element.localName, id).toBe('img');
      expect(element.hasAttribute('src'), id).toBe(false);
      expect(element.getAttribute('alt'), id).toBe('');
    }
    expect(elementOf(root, 'node-video-full').style.getPropertyValue('object-fit')).toBe('fill');
    expect(elementOf(root, 'node-video-cover').style.getPropertyValue('object-fit')).toBe('cover');
    expect(elementOf(root, 'node-video-contain').style.getPropertyValue('object-fit')).toBe(
      'contain',
    );
    expect(elementOf(root, 'node-video-contain').style.getPropertyValue('width')).toBe('280px');
  });

  it('maps the fit of an image to its object-fit (D50.1)', () => {
    const root = mounted();
    expect(elementOf(root, 'node-image-contain').style.getPropertyValue('object-fit')).toBe(
      'contain',
    );
    expect(elementOf(root, 'node-image-cover').style.getPropertyValue('object-fit')).toBe('cover');
    expect(elementOf(root, 'node-image-cover').getAttribute('src')).toBe(urls['asset-image']);
  });

  it('needs no URL for a video asset: its pixels never arrive as one', () => {
    expect(() => {
      mountComposition(createRoot(), composition, urls, TRUSTED);
    }).not.toThrow();
  });
});

describe('the frames of video nodes (D50.4)', () => {
  it('gives every active video its frame as a data URL, and leaves the inactive one without', () => {
    const root = mounted();
    // At 0 the contained video, which starts at 0.5 s, is not active.
    const state = evaluateComposition(composition, 0);
    applyVideoFrames(root, state, [frame('node-video-full'), frame('node-video-cover', 9)]);
    expect(elementOf(root, 'node-video-full').getAttribute('src')).toBe(
      'data:image/png;base64,AQID',
    );
    expect(elementOf(root, 'node-video-cover').getAttribute('src')).toBe(
      'data:image/png;base64,CQID',
    );
    expect(elementOf(root, 'node-video-contain').hasAttribute('src')).toBe(false);
  });

  it('takes the source away from a video that is no longer active, whatever an earlier render left', () => {
    const root = mounted();
    applyVideoFrames(
      root,
      evaluateComposition(composition, 1_000_000),
      VIDEOS.map((id) => frame(id)),
    );
    expect(elementOf(root, 'node-video-contain').hasAttribute('src')).toBe(true);
    applyVideoFrames(root, evaluateComposition(composition, 1_500_000), [
      frame('node-video-full'),
      frame('node-video-cover'),
    ]);
    expect(elementOf(root, 'node-video-contain').hasAttribute('src')).toBe(false);
  });

  it.each([
    ['no frame for an active video', [frame('node-video-full')]],
    [
      'a frame for an inactive video',
      [frame('node-video-full'), frame('node-video-cover'), frame('node-video-contain')],
    ],
    ['a frame for a node that is no video', [frame('node-video-full'), frame('node-image-cover')]],
    ['two frames for one node', [frame('node-video-full'), frame('node-video-full')]],
    [
      'a frame that is no image',
      [frame('node-video-full'), { ...frame('node-video-cover'), mediaType: 'video/mp4' }],
    ],
    [
      'a frame with another key',
      [frame('node-video-full'), { ...frame('node-video-cover'), x: 1 }],
    ],
    [
      'bytes that are no ArrayBuffer',
      [frame('node-video-full'), { ...frame('node-video-cover'), bytes: [1] }],
    ],
    ['no array', { 'node-video-full': frame('node-video-full') }],
  ])('refuses %s with video-frames-invalid before it writes anything', (_, frames) => {
    const root = mounted();
    const before = root.innerHTML;
    expect(() => {
      applyVideoFrames(root, evaluateComposition(composition, 0), frames);
    }).toThrow(expect.objectContaining({ name: 'RenderError', code: 'video-frames-invalid' }));
    expect(root.innerHTML).toBe(before);
  });

  it('writes the frames before the state, so a render shows both of one instant', () => {
    const root = mounted();
    const state = evaluateComposition(composition, 1_000_000);
    applyVideoFrames(
      root,
      state,
      VIDEOS.map((id) => frame(id)),
    );
    renderState(root, state);
    for (const id of VIDEOS) {
      expect(elementOf(root, id).style.getPropertyValue('visibility'), id).toBe('');
    }
  });

  it('waits for the decoding of active videos only: an image without a source is not decoded', async () => {
    const root = mounted();
    const decoded: string[] = [];
    for (const image of root.querySelectorAll('img')) {
      Object.defineProperty(image, 'decode', {
        value: () => {
          decoded.push(image.getAttribute('data-kadrion-node') ?? '');
          return Promise.resolve();
        },
      });
    }
    Object.defineProperty(root.ownerDocument, 'fonts', { value: { ready: Promise.resolve() } });
    applyVideoFrames(root, evaluateComposition(composition, 0), [
      frame('node-video-full'),
      frame('node-video-cover'),
    ]);
    await awaitMediaReady(root);
    expect(decoded.sort()).toEqual(
      ['node-image-contain', 'node-image-cover', 'node-video-cover', 'node-video-full'].sort(),
    );
  });
});
