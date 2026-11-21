/**
 * Video nodes and `fit` in the rendered tree (D50.1, D50.4): a video is an
 * image without a source until the host supplies the frame of the instant, an
 * inactive video loses its source, and the fit of images and videos is their
 * `object-fit`, and their focus their `object-position` (D63.2). What a browser paints for them is measured in the pinned
 * environment; here the tree is checked.
 */
import { evaluateComposition } from '@kadrion/runtime';
import { focusComposition, videoComposition } from '@kadrion/test-fixtures';
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
  it('mounts every video as an image without a source, fitted like an image and sized by its render (D68)', () => {
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
    expect(elementOf(root, 'node-video-contain').style.getPropertyValue('width')).toBe('');
    renderState(root, evaluateComposition(composition, 0));
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

  it('maps the focus of an image and a video to its object-position in percent (D63.2)', () => {
    const root = mounted();
    expect(elementOf(root, 'node-video-cover').style.getPropertyValue('object-position')).toBe(
      '50% 50%',
    );
    const focused = createRoot();
    mountComposition(focused, validated(focusComposition), urls, TRUSTED);
    const positions = Object.fromEntries(
      ['node-image-cover', 'node-image-contain', 'node-video-cover', 'node-video-contain'].map(
        (id) => [id, elementOf(focused, id).style.getPropertyValue('object-position')],
      ),
    );
    expect(positions).toEqual({
      'node-image-cover': '0% 50%',
      'node-image-contain': '100% 0%',
      'node-video-cover': '85% 50%',
      'node-video-contain': '50% 100%',
    });
  });

  it('writes a focus of any per mille as the shortest percentage, never rounded (D22.1)', () => {
    const draft = structuredClone(focusComposition) as {
      scenes: { nodes: { id: string; focus?: { x: number; y: number } }[] }[];
    };
    const node = draft.scenes[0]?.nodes.find(({ id }) => id === 'node-image-cover');
    if (node === undefined) throw new Error('No image.');
    node.focus = { x: 333, y: 1 };
    const root = createRoot();
    mountComposition(root, validated(draft), urls, TRUSTED);
    expect(elementOf(root, 'node-image-cover').style.getPropertyValue('object-position')).toBe(
      '33.3% 0.1%',
    );
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

/** A stand-in bitmap: what the renderer reads of one (its tag and size), and its transfer. */
function bitmapOf(width = 4, height = 2): ImageBitmap {
  return {
    [Symbol.toStringTag]: 'ImageBitmap',
    width,
    height,
    close: () => undefined,
  } as unknown as ImageBitmap;
}

/** Gives every canvas of the root's window a bitmaprenderer context that records what it was handed. */
function withBitmapRenderer<T>(
  root: HTMLElement,
  run: (shown: Map<HTMLCanvasElement, ImageBitmap>) => T,
): T {
  const shown = new Map<HTMLCanvasElement, ImageBitmap>();
  const view = root.ownerDocument.defaultView as unknown as {
    HTMLCanvasElement: { prototype: { getContext: unknown } };
  };
  const prototype = view.HTMLCanvasElement.prototype;
  const before = prototype.getContext;
  prototype.getContext = function getContext(this: HTMLCanvasElement, kind: string) {
    if (kind !== 'bitmaprenderer') return null;
    return {
      transferFromImageBitmap: (bitmap: ImageBitmap) => {
        shown.set(this, bitmap);
      },
    };
  };
  try {
    return run(shown);
  } finally {
    prototype.getContext = before;
  }
}

/** The video nodes active at 0. */
const ACTIVE = ['node-video-full', 'node-video-cover'];

describe('a frame of a playing video as a bitmap (D87.3, D87.4)', () => {
  const at = (timeUs: number) => evaluateComposition(composition, timeUs);

  it('puts a canvas in the image’s place with its attributes and styles, of the bitmap’s size, and the image back for bytes', () => {
    const root = mounted();
    withBitmapRenderer(root, (shown) => {
      const image = elementOf(root, 'node-video-cover');
      const attributes = [...image.attributes]
        .map(({ name, value }) => [name, value])
        .filter(([name]) => name !== 'alt');
      const bitmap = bitmapOf(16, 9);
      applyVideoFrames(root, at(0), [
        frame('node-video-full'),
        { nodeId: 'node-video-cover', bitmap },
      ]);
      const canvas = elementOf(root, 'node-video-cover') as HTMLCanvasElement;
      expect(canvas.localName).toBe('canvas');
      expect(image.isConnected).toBe(false);
      for (const [name, value] of attributes)
        expect(canvas.getAttribute(name ?? ''), name).toBe(value);
      expect(canvas.hasAttribute('alt')).toBe(false);
      expect([canvas.width, canvas.height]).toEqual([16, 9]);
      expect(shown.get(canvas)).toBe(bitmap);
      expect(elementOf(root, 'node-video-full').localName).toBe('img');
      // The renderer writes the instant on the canvas as it does on the image.
      renderState(root, at(0));
      expect(canvas.style.getPropertyValue('object-fit')).toBe('cover');
      applyVideoFrames(
        root,
        at(0),
        ACTIVE.map((id) => frame(id, 7)),
      );
      const back = elementOf(root, 'node-video-cover');
      expect(back.localName).toBe('img');
      expect(back.getAttribute('alt')).toBe('');
      expect(back.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
      expect(back.hasAttribute('width')).toBe(false);
      for (const [name, value] of attributes) {
        if (name !== 'style') expect(back.getAttribute(name ?? ''), name).toBe(value);
      }
    });
  });

  it('keeps one canvas while bitmaps follow each other, and an inactive node is the image without a source', () => {
    const root = mounted();
    withBitmapRenderer(root, (shown) => {
      const frames = (n: number) => ACTIVE.map((nodeId) => ({ nodeId, bitmap: bitmapOf(n, n) }));
      applyVideoFrames(root, at(0), frames(2));
      const canvas = elementOf(root, 'node-video-full');
      applyVideoFrames(root, at(0), frames(3));
      expect(elementOf(root, 'node-video-full')).toBe(canvas);
      expect((canvas as HTMLCanvasElement).width).toBe(3);
      expect(shown.get(canvas as HTMLCanvasElement)?.width).toBe(3);
      const later = at(1_500_000);
      const active = VIDEOS.filter((id) =>
        later.scenes.some((scene) => scene.nodes.some((node) => node.id === id && node.active)),
      );
      applyVideoFrames(
        root,
        later,
        active.map((id) => frame(id)),
      );
      for (const id of VIDEOS.filter((each) => !active.includes(each))) {
        expect(elementOf(root, id).localName, id).toBe('img');
        expect(elementOf(root, id).hasAttribute('src'), id).toBe(false);
      }
    });
  });

  it('refuses a bitmap entry of another shape, a closed bitmap, two frames of a node, and a page without the context, before writing', () => {
    const root = mounted();
    for (const frames of [
      [{ nodeId: 'node-video-full', bitmap: {} }],
      [{ nodeId: 'node-video-full', bitmap: bitmapOf(0, 0) }],
      [{ nodeId: 'node-video-full', bitmap: bitmapOf(), mediaType: 'image/png' }],
      [{ nodeId: 'node-video-full', bitmap: bitmapOf() }, frame('node-video-full')],
    ]) {
      expect(() => {
        applyVideoFrames(root, at(0), [...frames, frame('node-video-cover')]);
      }).toThrow(expect.objectContaining({ code: 'video-frames-invalid' }) as Error);
    }
    // jsdom draws nothing: without the context the frame is refused and the images stay.
    expect(() => {
      applyVideoFrames(
        root,
        at(0),
        ACTIVE.map((nodeId) => ({ nodeId, bitmap: bitmapOf() })),
      );
    }).toThrow(/bitmaprenderer/);
    expect(VIDEOS.map((id) => elementOf(root, id).localName)).toEqual(['img', 'img', 'img']);
  });
});
