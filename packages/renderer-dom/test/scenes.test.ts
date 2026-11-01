/**
 * Scenes in sequence in the rendered tree (D54.3): every scene is mounted, a
 * scene the state does not evaluate gets `visibility: hidden` and an evaluated
 * one declares nothing, and a Custom HTML element receives the time of its
 * scene. Like the lifetime of a node (D42.4), a render keeps no memory.
 */
import { evaluateComposition } from '@kadrion/runtime';
import { scenesComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { mountComposition, renderState, synchronizeCustomHtml } from '../src/index.js';
import { elementDouble, hostDouble, REQUEST_ID } from './elements.js';
import {
  createRoot,
  createWindow,
  describeRoot,
  referenceUrls,
  shuffled,
  TRUSTED,
  validated,
} from './support.js';

const sequence = validated(scenesComposition);
const SCENES = ['scene-intro', 'scene-middle', 'scene-outro'];
const urls = {
  'asset-image': referenceUrls['asset-image'] ?? '',
  'asset-font': referenceUrls['asset-font'] ?? '',
};

function mounted(root: HTMLElement = createRoot()): HTMLElement {
  mountComposition(root, sequence, urls, TRUSTED);
  return root;
}

function sceneElement(root: Element, id: string): HTMLElement {
  const element = root.querySelector(`[data-kadrion-scene="${id}"]`);
  if (element === null) throw new Error(`No scene "${id}".`);
  return element as HTMLElement;
}

function hiddenScenes(root: Element): string[] {
  return SCENES.filter(
    (id) => sceneElement(root, id).style.getPropertyValue('visibility') === 'hidden',
  );
}

describe('the scenes of the rendered tree (D54.3)', () => {
  it('mounts every scene in document order', () => {
    const stage = mounted().firstElementChild;
    expect(
      [...(stage?.children ?? [])].map((child) => child.getAttribute('data-kadrion-scene')),
    ).toEqual(SCENES);
  });

  it.each([
    [0, ['scene-middle', 'scene-outro']],
    [999_999, ['scene-middle', 'scene-outro']],
    [1_000_000, ['scene-intro', 'scene-outro']],
    [2_499_999, ['scene-intro', 'scene-outro']],
    [2_500_000, ['scene-intro', 'scene-middle']],
    [3_199_999, ['scene-intro', 'scene-middle']],
  ])('at %i hides exactly %j', (timeUs, hidden) => {
    const root = mounted();
    renderState(root, evaluateComposition(sequence, timeUs));
    expect(hiddenScenes(root)).toEqual(hidden);
    const shown = SCENES.find((id) => !hidden.includes(id)) ?? '';
    expect(sceneElement(root, shown).getAttribute('style') ?? '').not.toContain('visibility');
  });

  it('yields the tree of a fresh mount in any order of renders', () => {
    const times = [0, 999_999, 1_000_000, 1_750_000, 2_500_000, 3_199_999];
    const fresh = new Map(
      times.map((timeUs) => {
        const root = mounted();
        renderState(root, evaluateComposition(sequence, timeUs));
        return [timeUs, JSON.stringify(describeRoot(root))];
      }),
    );
    const root = mounted();
    for (const timeUs of [...shuffled(times, 20_261_101), ...times.reverse()]) {
      renderState(root, evaluateComposition(sequence, timeUs));
      expect(JSON.stringify(describeRoot(root)), String(timeUs)).toBe(fresh.get(timeUs));
    }
  });

  it('refuses a state whose scenes the tree does not hold, and writes nothing', () => {
    const root = mounted();
    renderState(root, evaluateComposition(sequence, 0));
    const before = JSON.stringify(describeRoot(root));
    const state = evaluateComposition(sequence, 1_000_000);
    const renamed = {
      ...state,
      scenes: state.scenes.map((scene) => ({ ...scene, id: 'scene-other' })),
    };
    expect(() => {
      renderState(root, renamed);
    }).toThrow(expect.objectContaining({ name: 'RenderError', code: 'state-mismatch' }));
    expect(JSON.stringify(describeRoot(root))).toBe(before);
  });
});

describe('a Custom HTML element in a later scene (D23, D54.3)', () => {
  it('receives the time of its scene, not of the composition', async () => {
    const window = createWindow();
    const root = mounted(createRoot(window));
    const element = elementDouble(window, root, 'middle-html');
    const host = hostDouble(window);
    const state = evaluateComposition(sequence, 1_500_000);
    renderState(root, state);
    const pending = synchronizeCustomHtml(root, state, host.host);
    const message = {
      type: 'kadrion:time',
      version: 1,
      instanceId: 'middle-html',
      requestId: REQUEST_ID,
      timeUs: 500_000,
    };
    expect(element.posted).toEqual([{ message, targetOrigin: '*' }]);
    element.answer({ ...message, type: 'kadrion:time-ack' });
    await expect(pending).resolves.toBeUndefined();
  });

  it('receives nothing while its scene is not evaluated', async () => {
    const window = createWindow();
    const root = mounted(createRoot(window));
    const element = elementDouble(window, root, 'middle-html');
    const host = hostDouble(window);
    const state = evaluateComposition(sequence, 2_600_000);
    renderState(root, state);
    await expect(synchronizeCustomHtml(root, state, host.host)).resolves.toBeUndefined();
    expect(element.posted).toEqual([]);
  });
});
