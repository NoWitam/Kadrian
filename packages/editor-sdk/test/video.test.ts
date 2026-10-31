/**
 * The commands of video and fit (D50.6) and the check of sampled source ranges
 * against the media facts a host supplies (D49.6). The facts are given here
 * by hand: the video of `everyType` lasts 3 s.
 */
import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createCommandBus,
  describeDocument,
  type Command,
  type MediaFactsLookup,
} from '../src/index.js';

import { codeOf, errorOf, everyType, VIDEO_ASSET, VIDEO_NODE } from './support.js';

const CLIP_HASH = `sha256:${'e'.repeat(64)}`;
const FACTS: MediaFactsLookup = (contentHash) =>
  contentHash === VIDEO_ASSET.contentHash
    ? { type: 'video', durationUs: 3_000_000 }
    : contentHash === CLIP_HASH
      ? { type: 'video', durationUs: 500_000 }
      : null;
const withFacts = { mediaFacts: FACTS };

function withClip() {
  return applyCommand(everyType(), {
    type: 'AddAsset',
    asset: { id: 'asset-clip', type: 'video', contentHash: CLIP_HASH },
    index: 0,
  }).document;
}

function videoField(document: unknown, field: string): unknown {
  const nodes = (document as { scenes: { nodes: Record<string, unknown>[] }[] }).scenes[0]?.nodes;
  return nodes?.find((node) => node['id'] === VIDEO_NODE.id)?.[field];
}

describe('SetNodeFit (D50.6)', () => {
  it.each([
    ['an image', 'node-image', 'fill'],
    ['a video', 'node-video', 'contain'],
  ])('sets the fit of %s, with the inverse that restores it', (_, nodeId, before) => {
    const result = applyCommand(everyType(), { type: 'SetNodeFit', nodeId, fit: 'cover' });
    expect(result.inverse).toEqual({ type: 'SetNodeFit', nodeId, fit: before });
    const restored = applyCommand(result.document, result.inverse as Command).document;
    expect(JSON.stringify(restored)).toBe(JSON.stringify(everyType()));
  });

  it('changes nothing, and writes no inverse, for the fit the node has', () => {
    const document = everyType();
    const result = applyCommand(document, {
      type: 'SetNodeFit',
      nodeId: 'node-video',
      fit: 'contain',
    });
    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it('refuses a fit the schema does not list, and a node without a fit', () => {
    expect(
      codeOf(() =>
        applyCommand(everyType(), {
          type: 'SetNodeFit',
          nodeId: 'node-image',
          fit: 'none',
        } as never),
      ),
    ).toBe('invalid-argument');
    expect(
      codeOf(() =>
        applyCommand(everyType(), { type: 'SetNodeFit', nodeId: 'node-title', fit: 'cover' }),
      ),
    ).toBe('unsupported-node');
  });
});

describe('SetVideoSource and the sampled source range (D49.6)', () => {
  it('sets the source start when the range stays inside the source', () => {
    const result = applyCommand(
      everyType(),
      { type: 'SetVideoSource', nodeId: 'node-video', sourceStartUs: 2_000_000 },
      withFacts,
    );
    expect(videoField(result.document, 'sourceStartUs')).toBe(2_000_000);
    expect(result.inverse).toEqual({
      type: 'SetVideoSource',
      nodeId: 'node-video',
      sourceStartUs: 0,
    });
  });

  it('refuses a range that ends past the source, naming the node and the range', () => {
    // The node lasts 1 s, so a start of 2 000 001 µs samples up to 3 000 001 µs.
    const error = errorOf(() =>
      applyCommand(
        everyType(),
        { type: 'SetVideoSource', nodeId: 'node-video', sourceStartUs: 2_000_001 },
        withFacts,
      ),
    );
    expect(error.code).toBe('source-range-exceeded');
    expect(error.details).toEqual([
      'node-video: samples 2000001 to 3000001 µs of a source of 3000000 µs',
    ]);
  });

  it('refuses any change of the range without facts for its video', () => {
    const error = errorOf(() =>
      applyCommand(everyType(), { type: 'SetVideoSource', nodeId: 'node-video', sourceStartUs: 1 }),
    );
    expect(error.code).toBe('media-facts-missing');
    expect(error.details).toEqual(['node-video']);
  });

  it('needs no facts for an edit that leaves every range as it was', () => {
    const document = everyType();
    for (const command of [
      { type: 'SetNodePosition', nodeId: 'node-video', position: { x: 1, y: 2 } },
      { type: 'SetNodeSize', nodeId: 'node-video', width: 64, height: 36 },
      { type: 'SetNodeFit', nodeId: 'node-video', fit: 'fill' },
      { type: 'SetNodeOpacity', nodeId: 'node-video', opacity: 0.5 },
    ] as const) {
      expect(() => applyCommand(document, command)).not.toThrow();
    }
  });

  it('checks a lifetime against the source, cut to the composition', () => {
    const document = everyType();
    // 9 s to 12 s samples 0 to 1 s: the end of the composition, 10 s, cuts it.
    const late = {
      type: 'SetNodeLifetime',
      nodeId: 'node-video',
      startUs: 9_000_000,
      durationUs: 3_000_000,
    } as const;
    expect(videoField(applyCommand(document, late, withFacts).document, 'startUs')).toBe(9_000_000);
    const long = {
      type: 'SetNodeLifetime',
      nodeId: 'node-video',
      startUs: 0,
      durationUs: 3_000_001,
    } as const;
    expect(codeOf(() => applyCommand(document, long, withFacts))).toBe('source-range-exceeded');
    // A lifetime that starts at the end of the composition samples nothing and needs no facts.
    const after = {
      type: 'SetNodeLifetime',
      nodeId: 'node-video',
      startUs: 10_000_000,
      durationUs: 9_000_000,
    } as const;
    expect(() => applyCommand(document, after)).not.toThrow();
  });

  it('checks a video node that a command adds, also as a copy', () => {
    const document = everyType();
    const node = { ...VIDEO_NODE, id: 'node-video-2' };
    const add = { type: 'AddNode', parentId: 'scene-main', index: 0, node } as const;
    expect(codeOf(() => applyCommand(document, add))).toBe('media-facts-missing');
    expect(applyCommand(document, add, withFacts).createdIds).toEqual(['node-video-2']);
    const copy = {
      type: 'DuplicateNode',
      nodeId: 'node-video',
      newNodeId: 'node-video-copy',
    } as const;
    expect(codeOf(() => applyCommand(document, copy))).toBe('media-facts-missing');
    expect(applyCommand(document, copy, withFacts).createdIds).toEqual(['node-video-copy']);
  });
});

describe('SetVideoAsset (D50.6)', () => {
  it('points a video at another video, checked against the facts of the new one', () => {
    const document = withClip();
    // The clip lasts 0.5 s, the node 1 s.
    const command = { type: 'SetVideoAsset', nodeId: 'node-video', assetId: 'asset-clip' } as const;
    expect(codeOf(() => applyCommand(document, command, withFacts))).toBe('source-range-exceeded');
    const shorter = applyCommand(
      document,
      { type: 'SetNodeLifetime', nodeId: 'node-video', startUs: 0, durationUs: 500_000 },
      withFacts,
    ).document;
    const result = applyCommand(shorter, command, withFacts);
    expect(videoField(result.document, 'assetId')).toBe('asset-clip');
    expect(result.inverse).toEqual({ ...command, assetId: 'asset-video' });
  });

  it('refuses another asset type, an unknown asset, and a node that is no video', () => {
    const document = withClip();
    const set = (nodeId: string, assetId: string): string =>
      codeOf(() => applyCommand(document, { type: 'SetVideoAsset', nodeId, assetId }, withFacts));
    expect(set('node-video', 'asset-image')).toBe('asset-type-mismatch');
    expect(set('node-video', 'asset-none')).toBe('unknown-asset');
    expect(set('node-image', 'asset-clip')).toBe('unsupported-node');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetImageAsset',
          nodeId: 'node-video',
          assetId: 'asset-image',
        }),
      ),
    ).toBe('unsupported-node');
  });
});

describe('media facts at the bus (D49.6)', () => {
  it('checks every dispatch, transaction, undo, and redo against the facts it was given', () => {
    const bus = createCommandBus(everyType(), withFacts);
    bus.dispatch({ type: 'SetVideoSource', nodeId: 'node-video', sourceStartUs: 2_000_000 });
    expect(() =>
      bus.dispatchTransaction([
        { type: 'SetNodeLifetime', nodeId: 'node-video', startUs: 0, durationUs: 500_000 },
        { type: 'SetVideoSource', nodeId: 'node-video', sourceStartUs: 2_500_000 },
      ]),
    ).not.toThrow();
    bus.undo();
    expect(videoField(bus.getDocument(), 'sourceStartUs')).toBe(2_000_000);
    bus.redo();
    expect(videoField(bus.getDocument(), 'sourceStartUs')).toBe(2_500_000);
  });

  it('answers mediaFactsOf from the lookup it was given, and null without one', () => {
    expect(createCommandBus(everyType(), withFacts).mediaFactsOf(VIDEO_ASSET.contentHash)).toEqual({
      type: 'video',
      durationUs: 3_000_000,
    });
    expect(createCommandBus(everyType()).mediaFactsOf(VIDEO_ASSET.contentHash)).toBeNull();
  });

  it('treats an answer that is no facts as none', () => {
    const odd = { mediaFacts: () => ({ type: 'video', durationUs: 1.5 }) as never };
    expect(
      codeOf(() =>
        applyCommand(
          everyType(),
          { type: 'SetVideoSource', nodeId: 'node-video', sourceStartUs: 1 },
          odd,
        ),
      ),
    ).toBe('media-facts-missing');
  });

  it('refuses a lookup that is no function', () => {
    expect(codeOf(() => createCommandBus(everyType(), { mediaFacts: 3 } as never))).toBe(
      'invalid-argument',
    );
  });

  it('lets describeDocument state the source duration of a video it has facts for', () => {
    const assets = describeDocument(everyType(), FACTS).assets as Record<string, unknown>[];
    expect(assets.find(({ id }) => id === 'asset-video')).toEqual({
      ...VIDEO_ASSET,
      sourceDurationUs: 3_000_000,
    });
    expect(assets.find(({ id }) => id === 'asset-image')).not.toHaveProperty('sourceDurationUs');
    const without = describeDocument(everyType()).assets as Record<string, unknown>[];
    expect(without.find(({ id }) => id === 'asset-video')).toEqual(VIDEO_ASSET);
  });
});
