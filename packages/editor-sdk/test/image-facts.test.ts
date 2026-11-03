/**
 * The facts of an image at the bus (D62): its size, which the bus reads as
 * plain data, reports through `mediaFactsOf` and `describeDocument`, and
 * checks nothing with, since an image has no source range.
 */
import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createCommandBus,
  describeDocument,
  type MediaFactsLookup,
} from '../src/index.js';

import { codeOf, everyType, VIDEO_ASSET, VIDEO_NODE } from './support.js';

/** The hash of the image asset of `everyType`. */
function imageHash(): string {
  const document = everyType() as unknown as {
    assets: { id: string; contentHash: string }[];
  };
  return document.assets.find(({ id }) => id === 'asset-image')?.contentHash ?? '';
}

describe('image facts (D62)', () => {
  it('reports the size of an image it has facts for, and only valid sizes', () => {
    const hash = imageHash();
    const facts: MediaFactsLookup = (contentHash) =>
      contentHash === hash ? { type: 'image', width: 640, height: 480 } : null;
    expect(createCommandBus(everyType(), { mediaFacts: facts }).mediaFactsOf(hash)).toEqual({
      type: 'image',
      width: 640,
      height: 480,
    });
    for (const odd of [
      { type: 'image', width: 0, height: 480 },
      { type: 'image', width: 640.5, height: 480 },
      { type: 'image', width: 640 },
      { type: 'image', durationUs: 1 },
    ]) {
      const bus = createCommandBus(everyType(), { mediaFacts: () => odd as never });
      expect(bus.mediaFactsOf(hash)).toBeNull();
    }
  });

  it('lets describeDocument state the size of an image it has facts for', () => {
    const hash = imageHash();
    const facts: MediaFactsLookup = (contentHash) =>
      contentHash === hash ? { type: 'image', width: 640, height: 480 } : null;
    const assets = describeDocument(everyType(), facts).assets as Record<string, unknown>[];
    expect(assets.find(({ id }) => id === 'asset-image')).toMatchObject({
      width: 640,
      height: 480,
    });
    const without = describeDocument(everyType()).assets as Record<string, unknown>[];
    expect(without.find(({ id }) => id === 'asset-image')).not.toHaveProperty('width');
  });

  it('never takes image facts for the duration of a video', () => {
    const facts: MediaFactsLookup = (contentHash) =>
      contentHash === VIDEO_ASSET.contentHash ? { type: 'image', width: 1, height: 1 } : null;
    expect(
      codeOf(() =>
        applyCommand(
          everyType(),
          { type: 'SetVideoSource', nodeId: VIDEO_NODE.id, sourceStartUs: 1 },
          { mediaFacts: facts },
        ),
      ),
    ).toBe('media-facts-missing');
  });
});
