/**
 * `describeDocument` (D46.3): a read-only description of a document for a
 * model that cannot see the canvas — IDs, types, lifetimes, parents, layers,
 * stored fields, assets, and clips — that shares nothing with the document
 * and is the same for the same document.
 */
import { describe, expect, it } from 'vitest';

import { createCommandBus, describeDocument } from '../src/index.js';

import { json, reference } from './support.js';

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe('describeDocument (D46.3)', () => {
  it('lists the scene, its nodes bottom to top with parent and layer, and the group children', () => {
    const description = describeDocument(reference());
    expect(description).toMatchObject({
      schemaVersion: '0.4',
      width: 1080,
      height: 1920,
      fps: 30,
      durationUs: 10_000_000,
    });
    const [scene] = description.scenes;
    expect(scene?.id).toBe('scene-main');
    expect(
      scene?.nodes.map(({ id, type, parentId, layer }) => [id, type, parentId, layer]),
    ).toEqual([
      ['node-background', 'background', 'scene-main', 0],
      ['node-group', 'group', 'scene-main', 1],
      ['node-title', 'text', 'scene-main', 2],
      ['node-custom-html', 'custom-html', 'scene-main', 3],
    ]);
    const group = scene?.nodes[1];
    expect(group?.children?.map(({ id, parentId, layer }) => [id, parentId, layer])).toEqual([
      ['node-image', 'node-group', 0],
      ['node-caption', 'node-group', 1],
    ]);
    expect(scene?.nodes[0]?.children).toBeUndefined();
  });

  it('carries lifetimes and stored fields, animations included, and leaves out html', () => {
    const [scene] = describeDocument(reference()).scenes;
    const title = scene?.nodes[2];
    expect(title).toMatchObject({ startUs: 0, durationUs: 10_000_000 });
    expect(Object.keys(title?.fields ?? {})).toEqual([
      'position',
      'scale',
      'opacity',
      'animations',
      'text',
      'fontAssetId',
      'fontSize',
      'color',
    ]);
    expect(title?.fields['animations']).toEqual([
      {
        id: 'anim-title-opacity',
        property: 'opacity',
        interpolation: 'linear',
        keyframes: [
          { timeUs: 0, value: 0.25 },
          { timeUs: 7_500_000, value: 1 },
        ],
      },
    ]);
    const html = scene?.nodes[3];
    expect(html?.fields).not.toHaveProperty('html');
    expect(html?.fields).toMatchObject({ width: 900, height: 40 });
  });

  it('lists the assets and clips as the document stores them', () => {
    const document = reference();
    const description = describeDocument(document);
    expect(description.assets).toEqual(document.assets);
    expect(description.clips).toEqual(document.clips);
  });

  it('is deep-frozen, shares no object with the document, and is the same every time', () => {
    const document = reference();
    const description = describeDocument(document);
    expect(isDeepFrozen(description)).toBe(true);
    expect(description.assets).not.toBe(document.assets);
    expect(description.assets[0]).not.toBe(document.assets[0]);
    expect(json(describeDocument(document))).toBe(json(description));
  });

  it('describes the document a bus holds after an edit', () => {
    const bus = createCommandBus(reference());
    bus.dispatch({ type: 'ReorderNode', nodeId: 'node-title', index: 1 });
    const [scene] = describeDocument(bus.getDocument()).scenes;
    expect(scene?.nodes.map(({ id, layer }) => [id, layer])).toEqual([
      ['node-background', 0],
      ['node-title', 1],
      ['node-group', 2],
      ['node-custom-html', 3],
    ]);
  });
});
