/**
 * Clip transitions in the rendered tree (D66): each side of a clip transition
 * is mounted inside its frame, an unstyled element the size of the canvas at
 * the origin of the parent; a render writes the cut and the colour of a
 * transition on the frame and its offset and zoom before the node's own
 * transform, and a render after it leaves nothing behind, in any order of
 * renders. The times are those of the clip transitions fixture.
 */
import { evaluateComposition } from '@kadrion/runtime';
import { clipTransitionsComposition } from '@kadrion/test-fixtures';
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

const document = validated(clipTransitionsComposition);
const urls = {
  'asset-image': referenceUrls['asset-image'] ?? '',
  'asset-font': referenceUrls['asset-font'] ?? '',
};
const DOWN = 4_600_000;

function rendered(...times: number[]): HTMLElement {
  const root = createRoot();
  mountComposition(root, document, urls, TRUSTED);
  for (const timeUs of times) renderState(root, evaluateComposition(document, timeUs));
  return root;
}

function node(root: Element, id: string): HTMLElement {
  const element = root.querySelector(`[data-kadrion-node="${id}"]`);
  if (element === null) throw new Error(`No node "${id}".`);
  return element as HTMLElement;
}

function frame(root: Element, id: string): HTMLElement {
  const element = root.querySelector(`[data-kadrion-clip-frame="${id}"]`);
  if (element === null) throw new Error(`No frame of "${id}".`);
  return element as HTMLElement;
}

function declared(element: HTMLElement, property: string): string {
  return element.style.getPropertyValue(property);
}

describe('the frames of clip transitions (D66)', () => {
  it('wraps each side of a clip transition, and nothing else, in a frame of its own', () => {
    const root = rendered();
    for (const id of ['up-clip-0', 'up-clip-7', 'down-clip-3', 'group-first', 'group-second']) {
      const wrapper = frame(root, id);
      expect(wrapper.firstElementChild).toBe(node(root, id));
      expect(wrapper.childElementCount).toBe(1);
    }
    expect(node(root, 'up-background').parentElement?.hasAttribute('data-kadrion-clip-frame')).toBe(
      false,
    );
    expect(node(root, 'end-title').parentElement?.hasAttribute('data-kadrion-clip-frame')).toBe(
      false,
    );
  });

  it('gives a frame the size of the canvas at the origin and no declaration a render writes', () => {
    const wrapper = frame(rendered(), 'group-second');
    expect(declared(wrapper, 'width')).toBe('640px');
    expect(declared(wrapper, 'height')).toBe('360px');
    expect(declared(wrapper, 'clip-path')).toBe('');
    expect(declared(wrapper, 'background-color')).toBe('');
    expect(declared(wrapper, 'transform')).toBe('');
  });
});

describe('a clip transition in the rendered tree (D66)', () => {
  it('writes the offset of a slide before the own transform and cuts its frame', () => {
    const root = rendered(1_900_000);
    expect(declared(node(root, 'up-clip-3'), 'transform')).toMatch(/^translate\(320px, 0px\) /);
    expect(declared(frame(root, 'up-clip-3'), 'clip-path')).toBe('inset(0px 0px 0px 0px)');
    expect(declared(frame(root, 'up-clip-2'), 'clip-path')).toBe('');
  });

  it('writes the zoom about the frame centre', () => {
    const root = rendered(3_700_000);
    expect(declared(node(root, 'up-clip-6'), 'transform')).toMatch(
      /^translate\(320px, 180px\) scale\(0\.625\) translate\(-320px, -180px\) /,
    );
    expect(declared(node(root, 'up-clip-6'), 'opacity')).toBe('0.5');
  });

  it('cuts the sides of an iris to a circle and to the frame outside it', () => {
    const root = rendered(DOWN + 4_300_000);
    expect(declared(frame(root, 'down-clip-7'), 'clip-path')).toBe('circle(366px at 160px 252px)');
    expect(declared(frame(root, 'down-clip-6'), 'clip-path')).toMatch(/^path\(evenodd, /);
  });

  it('writes the colour of a fade on the frame of the lower side', () => {
    const root = rendered(1_300_000);
    expect(declared(frame(root, 'up-clip-1'), 'background-color')).not.toBe('');
    expect(declared(frame(root, 'up-clip-2'), 'background-color')).toBe('');
  });

  it('yields the tree of a fresh mount in any order of renders', () => {
    const times = [
      0,
      600_000,
      700_000,
      1_300_000,
      1_900_000,
      2_500_000,
      3_100_000,
      3_700_000,
      4_300_000,
      4_800_000,
      DOWN + 1_900_000,
      DOWN + 4_300_000,
      9_400_000,
      9_900_000,
      10_400_000,
    ];
    const fresh = new Map(
      times.map((timeUs) => [timeUs, JSON.stringify(describeRoot(rendered(timeUs)))]),
    );
    const root = rendered();
    for (const timeUs of [...shuffled(times, 20_261_107), ...[...times].reverse()]) {
      renderState(root, evaluateComposition(document, timeUs));
      expect(JSON.stringify(describeRoot(root)), String(timeUs)).toBe(fresh.get(timeUs));
    }
  });

  it('leaves nothing of a transition behind after it', () => {
    const after = rendered(1_300_000, 1_900_000, 3_700_000, 4_300_000, DOWN + 4_300_000, 5_000_000);
    expect(JSON.stringify(describeRoot(after))).toBe(
      JSON.stringify(describeRoot(rendered(5_000_000))),
    );
  });
});
