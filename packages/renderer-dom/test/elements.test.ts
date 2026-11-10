/**
 * Element instances in the rendered tree (D77): each instance mounts its
 * definition instantiated with its own values — the nodes whose conditions
 * hold, with the inputs written into them — and renders the same tree
 * whatever was rendered before. The times are those of the elements fixture.
 */
import { evaluateComposition } from '@kadrion/runtime';
import { elementsComposition, elementsGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { mountComposition, renderState } from '../src/index.js';
import { createRoot, elementOf, TRUSTED, validated } from './support.js';

const composition = validated(elementsComposition);
const urls = { 'asset-font': 'data:font/ttf,' };

function rendered(...times: number[]): HTMLElement {
  const root = createRoot();
  mountComposition(root, composition, urls, TRUSTED);
  for (const timeUs of times) renderState(root, evaluateComposition(composition, timeUs));
  return root;
}

function mountedIds(root: HTMLElement, prefix: string): string[] {
  return [...root.querySelectorAll('[data-kadrion-node]')]
    .map((element) => element.getAttribute('data-kadrion-node') ?? '')
    .filter((id) => id.startsWith(prefix));
}

describe('the mount of an element instance (D77)', () => {
  it('holds the nodes of its own instantiation, the removed ones not at all', () => {
    const root = rendered(500_000);
    expect(mountedIds(root, 'third-a/')).toEqual([
      'third-a/lt-background',
      'third-a/lt-title',
      'third-a/lt-badge',
    ]);
    expect(mountedIds(root, 'third-b/')).toEqual(['third-b/lt-background', 'third-b/lt-title']);
    expect(mountedIds(root, 'speech-a/')).toEqual(['speech-a/sp-bold']);
  });

  it('writes the values of each instance, and the defaults of the inputs it gives none', () => {
    const root = rendered(500_000);
    expect(elementOf(root, 'third-a/lt-title').textContent).toBe('Dance');
    expect(elementOf(root, 'third-b/lt-title').textContent).toBe('Kadrion design');
    // third-a gives its accent, third-b takes the default.
    expect(elementOf(root, 'third-a/lt-background').style.backgroundColor).toBe(
      'rgb(18, 183, 106)',
    );
    expect(elementOf(root, 'third-b/lt-background').style.backgroundColor).toBe('rgb(247, 144, 9)');
  });

  it('renders the same tree for the same time, whatever was rendered before', () => {
    for (const { timeUs } of elementsGoldenTimestamps) {
      const fresh = rendered(timeUs).innerHTML;
      expect(rendered(1_999_999, 0, timeUs).innerHTML).toBe(fresh);
    }
  });
});
