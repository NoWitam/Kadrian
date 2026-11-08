/**
 * The properties of D68 in the rendered tree: the transform list with a pivot
 * and a rotation, the group's box, and the colour, size, crop, and corner
 * radius that `renderState` writes on every call. What a browser paints for
 * them is measured in the pinned environment; here the tree is checked.
 */
import { evaluateComposition } from '@kadrion/runtime';
import { motionComposition, motionGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { cssTransform, cssViewBox } from '../src/css.js';
import { mountComposition, renderState } from '../src/index.js';
import { createRoot, describeRoot, elementOf, shuffled, TRUSTED, validated } from './support.js';

const composition = validated(motionComposition);
const urls = { 'asset-image': 'data:image/png;base64,AAAA', 'asset-font': 'data:font/ttf,' };
const TIMES = motionGoldenTimestamps.map(({ timeUs }) => timeUs);

function mounted(): HTMLElement {
  const root = createRoot();
  mountComposition(root, composition, urls, TRUSTED);
  return root;
}

function rendered(timeUs: number): HTMLElement {
  const root = mounted();
  renderState(root, evaluateComposition(composition, timeUs));
  return root;
}

const identity = { position: { x: 3, y: 4 }, scale: { x: 2, y: 0.5 }, opacity: 1 };

describe('the transform list (D68)', () => {
  it('writes the list of 0.12 for a node at its top-left corner without rotation', () => {
    expect(cssTransform({ ...identity, rotation: 0, origin: { x: 0, y: 0 } })).toBe(
      'translate(3px, 4px) scale(2, 0.5)',
    );
  });

  it('rotates after the scale, both about the origin in per cent of the box', () => {
    expect(cssTransform({ ...identity, rotation: -22.5, origin: { x: 500, y: 1000 } })).toBe(
      'translate(3px, 4px) translate(50%, 100%) rotate(-22.5deg) scale(2, 0.5) translate(-50%, -100%)',
    );
  });

  it('writes a pivot without a rotation, and a rotation without a pivot', () => {
    expect(cssTransform({ ...identity, rotation: 0, origin: { x: 0, y: 333 } })).toBe(
      'translate(3px, 4px) translate(0%, 33.3%) scale(2, 0.5) translate(0%, -33.3%)',
    );
    expect(cssTransform({ ...identity, rotation: 720, origin: { x: 0, y: 0 } })).toBe(
      'translate(3px, 4px) rotate(720deg) scale(2, 0.5)',
    );
  });

  it('writes a crop as the insets of the view box of the picture', () => {
    expect(cssViewBox({ fromTop: 0, fromRight: 250, fromBottom: 12.5, fromLeft: 999 })).toBe(
      'inset(0% 25% 1.25% 99.9%)',
    );
  });

  it('writes the insets in the shortest form, as the CSS Object Model serialises them', () => {
    const crop = (fromTop: number, fromRight: number, fromBottom: number, fromLeft: number) =>
      cssViewBox({ fromTop, fromRight, fromBottom, fromLeft });
    expect(crop(0, 0, 0, 0)).toBe('inset(0%)');
    expect(crop(0, 250, 0, 250)).toBe('inset(0% 25%)');
    expect(crop(10, 250, 20, 250)).toBe('inset(1% 25% 2%)');
    expect(crop(10, 10, 10, 20)).toBe('inset(1% 1% 1% 2%)');
    expect(crop(10, 20, 10, 10)).toBe('inset(1% 2% 1% 1%)');
  });
});

describe('the mounted tree of the motion fixture (D68)', () => {
  it('gives the group the canvas as its box', () => {
    const group = elementOf(mounted(), 'node-group');
    expect(group.style.getPropertyValue('width')).toBe('640px');
    expect(group.style.getPropertyValue('height')).toBe('360px');
  });

  it('writes none of the properties an animation can reach', () => {
    const root = mounted();
    for (const id of ['node-image-spin', 'node-image-crop', 'node-image-round', 'node-video']) {
      const element = elementOf(root, id);
      for (const name of ['width', 'height', 'object-view-box', 'border-radius']) {
        expect(element.style.getPropertyValue(name), `${id} ${name}`).toBe('');
      }
    }
    expect(elementOf(root, 'node-text').style.getPropertyValue('color')).toBe('');
    expect(elementOf(root, 'node-background').style.getPropertyValue('background-color')).toBe('');
  });
});

describe('a render of the motion fixture (D68)', () => {
  it('writes the rotation about the centre of a spinning image', () => {
    const state = evaluateComposition(composition, 0);
    const spin = elementOf(rendered(0), 'node-image-spin');
    const node = state.scenes[0]?.nodes.find(({ id }) => id === 'node-image-spin');
    if (node === undefined || node.type !== 'image') throw new Error('No spinning image.');
    expect(spin.style.getPropertyValue('transform')).toBe(cssTransform(node));
    expect(spin.style.getPropertyValue('transform')).toContain('translate(50%, 50%) rotate(10deg)');
  });

  it('writes the size, the crop, and the corner radius of every picture', () => {
    const root = rendered(0);
    const video = elementOf(root, 'node-video');
    expect(video.style.getPropertyValue('width')).toBe('200px');
    expect(video.style.getPropertyValue('height')).toBe('112px');
    expect(video.style.getPropertyValue('object-view-box')).toBe('inset(0% 25%)');
    expect(video.style.getPropertyValue('border-radius')).toBe('16px');
  });

  it('writes the colour of the text and of the background', () => {
    const root = rendered(0);
    expect(elementOf(root, 'node-text').style.getPropertyValue('color')).toBe('rgb(255, 255, 255)');
    expect(elementOf(root, 'node-background').style.getPropertyValue('background-color')).toBe(
      'rgb(29, 41, 57)',
    );
  });

  it('yields the tree of a fresh mount in any order of renders', () => {
    const fresh = new Map(
      TIMES.map((timeUs) => [timeUs, JSON.stringify(describeRoot(rendered(timeUs)))]),
    );
    const root = mounted();
    for (const timeUs of [...shuffled(TIMES, 20_261_107), ...[...TIMES].reverse()]) {
      renderState(root, evaluateComposition(composition, timeUs));
      expect(JSON.stringify(describeRoot(root)), String(timeUs)).toBe(fresh.get(timeUs));
    }
  });
});
