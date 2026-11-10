/**
 * Instances in the rendered tree (D76): an instance is a box of its size that
 * cuts its content, holding one canvas of its definition's size, fitted to the
 * box, with the definition's nodes inside under their path IDs; a mask or a
 * filter inside an instance is named by that path, once per instance; and the
 * same tree comes out whatever was rendered before. The times are those of the
 * nested fixture.
 */
import { evaluateComposition } from '@kadrion/runtime';
import { nestedComposition, nestedGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { mountComposition, renderState } from '../src/index.js';
import { maskId, MASKS_ATTRIBUTE } from '../src/masks.js';
import { INSTANCE_CONTENT_ATTRIBUTE } from '../src/mount.js';
import { createRoot, elementOf, TRUSTED, validated } from './support.js';

const composition = validated(nestedComposition);
const urls = { 'asset-image': 'data:image/png,', 'asset-font': 'data:font/ttf,' };
const TIMES = [...nestedGoldenTimestamps.map(({ timeUs }) => timeUs), 1_999_999];

function rendered(...times: number[]): HTMLElement {
  const root = createRoot();
  mountComposition(root, composition, urls, TRUSTED);
  for (const timeUs of times) renderState(root, evaluateComposition(composition, timeUs));
  return root;
}

function contentOf(root: HTMLElement, id: string): HTMLElement {
  const content = elementOf(root, id).firstElementChild;
  const window = root.ownerDocument.defaultView;
  if (window === null || !(content instanceof window.HTMLElement)) {
    throw new Error(`No content in ${id}.`);
  }
  return content;
}

describe('the mount of an instance (D76)', () => {
  it('is a box of its size that cuts what it holds', () => {
    const root = rendered(800_000);
    const box = elementOf(root, 'card-small');
    expect([box.style.width, box.style.height, box.style.overflow]).toEqual([
      '240px',
      '120px',
      'hidden',
    ]);
  });

  it("holds one canvas of the definition's size with the definition's nodes under their paths", () => {
    const root = rendered(800_000);
    const content = contentOf(root, 'card-left');
    expect(content.getAttribute(INSTANCE_CONTENT_ATTRIBUTE)).toBe('card');
    expect([content.style.width, content.style.height]).toEqual(['320px', '180px']);
    // The two bars of the crossfade lie in the frames of their clip transition.
    const nodeOf = (child: Element): string | null =>
      child.getAttribute('data-kadrion-node') ??
      child.querySelector('[data-kadrion-node]')?.getAttribute('data-kadrion-node') ??
      null;
    expect([...content.children].map(nodeOf)).toEqual([
      'card-left/card-background',
      'card-left/card-photo',
      'card-left/card-title',
      'card-left/card-bar-a',
      'card-left/card-bar-b',
      'card-left/card-badge',
    ]);
    // The badge inside the card is an instance of its own, two paths deep.
    expect(contentOf(root, 'card-left/card-badge').children).toHaveLength(2);
    expect(elementOf(root, 'card-left/card-badge/badge-square')).toBeDefined();
  });

  it('fits the canvas to the box: fill leaves it as it is, cover scales and centres it', () => {
    const root = rendered(800_000);
    expect(contentOf(root, 'card-left').style.transform).toBe('');
    // cover of 320×180 into 240×120: scale max(0.75, 0.667) = 0.75, 135 px high, 7.5 px up.
    const small = contentOf(root, 'card-small').style.transform;
    expect(small).toContain('0.75');
    expect(small).toContain('-7.5px');
  });

  it('names a mask inside an instance by its path, once per instance, in the order of the lists', () => {
    const root = rendered(800_000);
    const svg = root.querySelector(`[${MASKS_ATTRIBUTE}]`);
    const ids = [...(svg?.querySelectorAll('mask') ?? [])].map((mask) => mask.id);
    // The lists of the scene first, then those of each instance in turn.
    expect(ids).toEqual([
      maskId('card-small'),
      maskId('card-left/card-photo'),
      maskId('card-right/card-photo'),
      maskId('card-small/card-photo'),
    ]);
  });

  it('is the same tree at a time whatever was rendered before', () => {
    for (const timeUs of TIMES) {
      const fresh = rendered(timeUs).innerHTML;
      expect(rendered(...TIMES, timeUs).innerHTML, String(timeUs)).toBe(fresh);
    }
  });
});
