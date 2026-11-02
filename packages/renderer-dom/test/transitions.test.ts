/**
 * Transitions in the rendered tree (D56): a scene transition writes on the
 * elements of its two sides only what their `transition` states say, the
 * backdrop of a fade through a colour is the stage's background colour, and
 * a render after the transition leaves none of it behind, in any order of
 * renders. The times are those of the transitions fixture.
 */
import { evaluateComposition } from '@kadrion/runtime';
import { transitionsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { mountComposition, renderState } from '../src/index.js';
import {
  createRoot,
  describeRoot,
  referenceUrls,
  shuffled,
  TRUSTED,
  validated,
} from './support.js';

const sequence = validated(transitionsComposition);
const urls = {
  'asset-image': referenceUrls['asset-image'] ?? '',
  'asset-font': referenceUrls['asset-font'] ?? '',
};

function rendered(...times: number[]): HTMLElement {
  const root = createRoot();
  mountComposition(root, sequence, urls, TRUSTED);
  for (const timeUs of times) renderState(root, evaluateComposition(sequence, timeUs));
  return root;
}

function stage(root: Element): HTMLElement {
  return root.firstElementChild as HTMLElement;
}

function scene(root: Element, id: string): HTMLElement {
  const element = root.querySelector(`[data-kadrion-scene="${id}"]`);
  if (element === null) throw new Error(`No scene "${id}".`);
  return element as HTMLElement;
}

function declared(element: HTMLElement, property: string): string {
  return element.style.getPropertyValue(property);
}

describe('a scene transition in the rendered tree (D56)', () => {
  it('writes the opacity of the incoming side of a crossfade', () => {
    const root = rendered(800_000);
    expect(declared(scene(root, 'scene-b'), 'opacity')).toBe('0.5');
    expect(declared(scene(root, 'scene-a'), 'opacity')).toBe('');
    expect(declared(stage(root), 'background-color')).toBe('');
  });

  it('writes both sides and the backdrop of a fade through a colour', () => {
    const root = rendered(1_300_000);
    expect(declared(scene(root, 'scene-b'), 'opacity')).toBe('0.5');
    expect(declared(scene(root, 'scene-c'), 'opacity')).toBe('0');
    expect(declared(stage(root), 'background-color')).not.toBe('');
  });

  it('shows no backdrop at the first instant of a fade', () => {
    expect(declared(stage(rendered(1_200_000)), 'background-color')).toBe('');
  });

  it('writes the offset of a slide and the cut of a wipe', () => {
    expect(declared(scene(rendered(2_000_000), 'scene-d'), 'transform')).toBe(
      'translate(320px, 0px)',
    );
    expect(declared(scene(rendered(2_500_000), 'scene-e'), 'clip-path')).toBe(
      'inset(270px 0px 0px 0px)',
    );
  });

  it('yields the tree of a fresh mount in any order of renders', () => {
    const times = [0, 600_000, 800_000, 1_200_000, 1_300_000, 1_500_000, 2_000_000, 2_500_000];
    const fresh = new Map(
      times.map((timeUs) => [timeUs, JSON.stringify(describeRoot(rendered(timeUs)))]),
    );
    const root = rendered();
    for (const timeUs of [...shuffled(times, 20_261_101), ...[...times].reverse()]) {
      renderState(root, evaluateComposition(sequence, timeUs));
      expect(JSON.stringify(describeRoot(root)), String(timeUs)).toBe(fresh.get(timeUs));
    }
  });

  it('leaves nothing of a transition behind after it', () => {
    const after = rendered(1_300_000, 2_000_000, 2_500_000, 3_000_000);
    expect(JSON.stringify(describeRoot(after))).toBe(
      JSON.stringify(describeRoot(rendered(3_000_000))),
    );
    expect(declared(stage(after), 'background-color')).toBe('');
  });
});
