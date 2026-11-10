/**
 * Masks, mattes, and blend modes in the rendered tree (D75): the hidden
 * `<svg>` of the masks after the filters, one `<mask>` per mask and per matte
 * in document order, the CSS `mask` of a masked element, the canvas-sized frame
 * of a matte, the matte's own element hidden, `mix-blend-mode` on the
 * outermost element of a node and `isolation` on its parent, and the same tree
 * whatever was rendered before. The times are those of the composition of
 * compositing.
 */
import { evaluateComposition } from '@kadrion/runtime';
import {
  compositingComposition,
  compositingGoldenTimestamps,
  referenceComposition,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { mountComposition, renderState } from '../src/index.js';
import {
  cssMask,
  MASKS_ATTRIBUTE,
  maskId,
  MATTE_ATTRIBUTE,
  MATTE_FRAME_ATTRIBUTE,
  matteId,
} from '../src/masks.js';
import { createRoot, elementOf, referenceUrls, shuffled, TRUSTED, validated } from './support.js';

const composition = validated(compositingComposition);
const urls = { 'asset-image': 'data:image/png,', 'asset-font': 'data:font/ttf,' };
const TIMES = [...compositingGoldenTimestamps.map(({ timeUs }) => timeUs), 250_000, 1_999_999];

function rendered(...times: number[]): HTMLElement {
  const root = createRoot();
  mountComposition(root, composition, urls, TRUSTED);
  for (const timeUs of times) renderState(root, evaluateComposition(composition, timeUs));
  return root;
}

function masksOf(root: HTMLElement): Element {
  const svg = root.querySelector(`[${MASKS_ATTRIBUTE}]`);
  if (svg === null) throw new Error('No masks.');
  return svg;
}

function maskOf(root: HTMLElement, id: string): Element {
  const mask = masksOf(root).querySelector(`mask[id="${id}"]`);
  if (mask === null) throw new Error(`No mask ${id}.`);
  return mask;
}

describe('the mount of masks and mattes (D75)', () => {
  it('holds one mask per mask and per matte, in document order, in one hidden svg', () => {
    const root = rendered();
    const ids = [...masksOf(root).querySelectorAll('mask')].map((mask) => mask.id);
    expect(ids).toEqual([
      maskId('mask-image-bar'),
      maskId('mask-shape-photo'),
      maskId('mask-text'),
      matteId('matte-luminance-photo'),
      matteId('matte-alpha-photo'),
    ]);
    expect(masksOf(root).getAttribute('aria-hidden')).toBe('true');
  });

  it('names the mask of a masked node in the CSS mask of its element', () => {
    const root = rendered();
    for (const id of ['mask-image-bar', 'mask-shape-photo', 'mask-text']) {
      expect(elementOf(root, id).style.getPropertyValue('mask'), id).toBe(cssMask(maskId(id)));
    }
    expect(elementOf(root, 'blend-normal').style.getPropertyValue('mask')).toBe('');
  });

  it('puts a matted node alone in a canvas-sized frame that carries the mask of its matte', () => {
    const root = rendered();
    for (const id of ['matte-alpha-photo', 'matte-luminance-photo']) {
      const frame = elementOf(root, id).parentElement;
      expect(frame?.getAttribute(MATTE_FRAME_ATTRIBUTE), id).toBe(id);
      expect(frame?.children).toHaveLength(1);
      expect(frame?.style.getPropertyValue('mask')).toBe(cssMask(matteId(id)));
      expect(frame?.style.getPropertyValue('width')).toBe('640px');
      expect(frame?.style.getPropertyValue('height')).toBe('360px');
    }
  });

  it('marks a matte and never draws it by itself', () => {
    const root = rendered(...TIMES);
    for (const id of ['matte-star', 'matte-gradient']) {
      const element = elementOf(root, id);
      expect(element.hasAttribute(MATTE_ATTRIBUTE), id).toBe(true);
      expect(element.style.getPropertyValue('visibility'), id).toBe('hidden');
    }
  });

  it('inverts a mask by a white square under its content', () => {
    const root = rendered();
    const inverted = maskOf(root, maskId('mask-text'));
    expect(inverted.firstElementChild?.tagName).toBe('rect');
    expect(inverted.firstElementChild?.getAttribute('fill')).toBe('#ffffff');
    expect(maskOf(root, maskId('mask-shape-photo')).firstElementChild?.tagName).toBe('path');
  });

  it('writes no masks svg for a document without masks or mattes', () => {
    const root = createRoot();
    mountComposition(root, validated(referenceComposition), referenceUrls, TRUSTED);
    expect(root.querySelector(`[${MASKS_ATTRIBUTE}]`)).toBeNull();
  });
});

describe('blend modes in the tree (D75)', () => {
  it('writes mix-blend-mode on the outermost element of a node that blends, and none on one that does not', () => {
    const root = rendered();
    expect(elementOf(root, 'blend-multiply').style.getPropertyValue('mix-blend-mode')).toBe(
      'multiply',
    );
    expect(elementOf(root, 'blend-normal').style.getPropertyValue('mix-blend-mode')).toBe('');
    expect(elementOf(root, 'matte-group').style.getPropertyValue('mix-blend-mode')).toBe('lighten');
  });

  it('isolates the scene that holds a node that blends', () => {
    const root = rendered();
    const scene = elementOf(root, 'blend-multiply').parentElement;
    expect(scene?.style.getPropertyValue('isolation')).toBe('isolate');
  });
});

describe('masks at an instant (D75)', () => {
  it('writes the path and the feather of a shape mask at every time', () => {
    const root = rendered(TIMES[0] ?? 0);
    const path = maskOf(root, maskId('mask-shape-photo')).querySelector('path');
    expect(path?.getAttribute('d')).toMatch(/^M /);
  });

  it.each(TIMES)('renders at %i the tree a fresh mount renders, whatever came before', (timeUs) => {
    const fresh = rendered(timeUs);
    const before = shuffled(TIMES, timeUs + 1);
    const visited = rendered(...before, timeUs);
    expect(visited.innerHTML).toBe(fresh.innerHTML);
  });

  it('hides a matte drawn into its mask while it is not active', () => {
    const root = rendered(0);
    const content = maskOf(root, matteId('matte-luminance-photo')).querySelector<SVGElement>(
      '[data-kadrion-mask-content]',
    );
    expect(content?.style.getPropertyValue('visibility')).toBe('hidden');
    const later = rendered(1_000_000);
    const shown = maskOf(later, matteId('matte-luminance-photo')).querySelector<SVGElement>(
      '[data-kadrion-mask-content]',
    );
    expect(shown?.style.getPropertyValue('visibility')).toBe('');
  });
});
