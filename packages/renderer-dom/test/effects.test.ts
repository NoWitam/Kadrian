/**
 * Effects in the rendered tree (D71): the CSS `filter` of every effect, written
 * on the element of its node, group, or scene in the order of the effects with
 * the blur of a transition last; no `filter` at all where there is no effect,
 * so a document without effects renders as before (D65.5); and the same tree
 * whatever was rendered before. The times are those of the effects fixture.
 */
import { evaluateComposition, type EffectState } from '@kadrion/runtime';
import { effectsComposition, effectsGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { cssFilter } from '../src/css.js';
import { mountComposition, renderState } from '../src/index.js';
import { SCENE_ATTRIBUTE } from '../src/mount.js';
import {
  createRoot,
  elementOf,
  reference,
  referenceUrls,
  shuffled,
  TRUSTED,
  validated,
} from './support.js';

const composition = validated(effectsComposition);
const urls = {
  'asset-image': 'data:image/png,',
  'asset-video': 'data:video/mp4,',
  'asset-font': 'data:font/ttf,',
};
const TIMES = [0, ...effectsGoldenTimestamps.map(({ timeUs }) => timeUs), 2_199_999];

function rendered(...times: number[]): HTMLElement {
  const root = createRoot();
  mountComposition(root, composition, urls, TRUSTED);
  for (const timeUs of times) renderState(root, evaluateComposition(composition, timeUs));
  return root;
}

function sceneElement(root: Element, id: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[${SCENE_ATTRIBUTE}="${id}"]`);
  if (element === null) throw new Error(`No scene ${id}.`);
  return element;
}

const filterOf = (element: HTMLElement): string => element.style.getPropertyValue('filter');

describe('the CSS filter of effects (D71)', () => {
  it('is one function per effect, in their order', () => {
    const effects: EffectState[] = [
      { id: 'a', kind: 'blur', radius: 2.5 },
      { id: 'b', kind: 'brightness', amount: 1.25 },
      { id: 'c', kind: 'contrast', amount: 0.5 },
      { id: 'd', kind: 'saturate', amount: 2 },
      { id: 'e', kind: 'grayscale', amount: 1 },
      { id: 'f', kind: 'invert', amount: 0.25 },
      { id: 'g', kind: 'hue-rotate', angle: -90 },
      {
        id: 'h',
        kind: 'drop-shadow',
        color: '#102030',
        opacity: 0.5,
        offset: { x: -4, y: 6.5 },
        blur: 8,
      },
      {
        id: 'i',
        kind: 'drop-shadow',
        color: '#ffffff',
        opacity: 1,
        offset: { x: 0, y: 0 },
        blur: 0,
      },
    ];
    expect(cssFilter(effects, undefined)).toBe(
      'blur(2.5px) brightness(1.25) contrast(0.5) saturate(2) grayscale(1) invert(0.25) ' +
        'hue-rotate(-90deg) drop-shadow(rgba(16, 32, 48, 0.5) -4px 6.5px 8px) ' +
        'drop-shadow(rgb(255, 255, 255) 0px 0px 0px)',
    );
  });

  it('puts the blur of a transition last, after the effects', () => {
    expect(cssFilter([{ id: 'a', kind: 'grayscale', amount: 1 }], 3)).toBe(
      'grayscale(1) blur(3px)',
    );
    expect(cssFilter([], 0)).toBe('blur(0px)');
  });

  it('is nothing at all without an effect or a transition blur, not a neutral filter', () => {
    expect(cssFilter([], undefined)).toBeNull();
  });
});

describe('effects in the rendered tree (D71)', () => {
  it('writes the filter of a node, a group, and a scene', () => {
    const root = rendered(600_000);
    expect(filterOf(elementOf(root, 'effects-blur'))).toBe('blur(0px)');
    expect(filterOf(elementOf(root, 'effects-video'))).toBe('grayscale(1) contrast(1.4)');
    expect(filterOf(elementOf(root, 'effects-hue'))).toBe('hue-rotate(90deg) invert(0.25)');
    expect(filterOf(elementOf(root, 'effects-group-image'))).toBe('saturate(2)');
    expect(filterOf(elementOf(root, 'effects-group'))).toMatch(/^brightness\(/);
    expect(filterOf(sceneElement(root, 'scene-effects'))).toBe('saturate(1.2)');
  });

  it('writes the blur of a scene transition after the effects of the scene', () => {
    const root = rendered(1_000_000);
    expect(filterOf(sceneElement(root, 'scene-effects'))).toBe('saturate(1.2) blur(6px)');
    expect(filterOf(sceneElement(root, 'scene-dissolve'))).toBe('contrast(0.92) blur(6px)');
    expect(sceneElement(root, 'scene-dissolve').style.getPropertyValue('opacity')).toBe('0.5');
  });

  it('writes the blur of a clip transition on both of its nodes', () => {
    const root = rendered(1_300_000);
    expect(filterOf(elementOf(root, 'dissolve-image'))).toBe('blur(5px)');
    expect(filterOf(elementOf(root, 'dissolve-text'))).toBe('blur(5px)');
  });

  it('writes no filter where there is no effect and no transition blur', () => {
    const root = rendered(1_600_000);
    expect(filterOf(elementOf(root, 'dissolve-text'))).toBe('');
    expect(filterOf(elementOf(root, 'dissolve-background'))).toBe('');
    const plain = createRoot();
    mountComposition(plain, reference, referenceUrls, TRUSTED);
    renderState(plain, evaluateComposition(reference, 5_000_000));
    for (const element of plain.querySelectorAll<HTMLElement>('*')) {
      expect(filterOf(element), element.outerHTML.slice(0, 80)).toBe('');
    }
  });

  it('leaves the same tree whatever was rendered before', () => {
    for (const timeUs of TIMES) {
      const direct = rendered(timeUs).innerHTML;
      expect(rendered(...shuffled(TIMES, timeUs), timeUs).innerHTML, String(timeUs)).toBe(direct);
    }
  });
});
