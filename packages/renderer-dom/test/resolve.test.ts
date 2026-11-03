/**
 * The resolver loop of D14 (D27.3), shared by the Player and the Producer. The
 * Player's tests prove it through the Player; these prove it on its own, with a
 * digest the test lends.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { resolveAssets, type AssetRequest, type AssetResolver } from '../src/index.js';
import { derived } from './support.js';

const sha256 = (bytes: Uint8Array): Promise<string> =>
  Promise.resolve(`sha256:${createHash('sha256').update(bytes).digest('hex')}`);

const given: Readonly<Record<string, { bytes: Uint8Array; mediaType: string } | undefined>> = {
  // A media type whose header Kadrion does not read, so these bytes need not be an image (D62.1).
  'asset-image': { bytes: Uint8Array.of(1, 2, 3), mediaType: 'image/gif' },
  'asset-audio': { bytes: Uint8Array.of(4, 5), mediaType: 'audio/wav' },
  'asset-font': { bytes: Uint8Array.of(6), mediaType: 'font/ttf' },
};

/** The reference composition pinned to `given`. */
const pinned = derived((draft) => {
  for (const asset of draft.assets) {
    const bytes = given[asset.id]?.bytes ?? new Uint8Array(0);
    asset.contentHash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }
});

function resolverOf(map: typeof given, asked: AssetRequest[] = []): AssetResolver {
  return (request) => {
    asked.push(request);
    return map[request.id] ?? null;
  };
}

describe('resolveAssets (D14, D27.3)', () => {
  it('asks once per asset, in order, with a frozen request, and returns verified copies', async () => {
    const asked: AssetRequest[] = [];
    const verified = await resolveAssets(pinned, resolverOf(given, asked), sha256);
    expect(asked).toEqual(
      pinned.assets.map(({ id, type, contentHash }) => ({ id, type, contentHash })),
    );
    expect(asked.every((request) => Object.isFrozen(request))).toBe(true);
    expect(verified.map(({ id, mediaType, bytes }) => [id, mediaType, [...bytes]])).toEqual([
      ['asset-image', 'image/gif', [1, 2, 3]],
      ['asset-audio', 'audio/wav', [4, 5]],
      ['asset-font', 'font/ttf', [6]],
    ]);
    expect(verified[0]?.bytes).not.toBe(given['asset-image']?.bytes);
  });

  it('keeps the bytes it verified, whatever the caller does later', async () => {
    const bytes = Uint8Array.of(1, 2, 3);
    const resolver: AssetResolver = (request) => {
      if (request.id !== 'asset-image') return given[request.id] ?? null;
      // The caller changes the bytes right after handing them over.
      setTimeout(() => {
        bytes[0] = 9;
      }, 0);
      return { bytes, mediaType: 'image/gif' };
    };
    const verified = await resolveAssets(pinned, resolver, sha256);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(bytes[0]).toBe(9);
    expect([...(verified[0]?.bytes ?? [])]).toEqual([1, 2, 3]);
  });

  it.each([
    ['a missing asset', resolverOf({ ...given, 'asset-audio': undefined }), 'asset-missing'],
    [
      'a resolver that throws',
      () => {
        throw new Error('down');
      },
      'asset-missing',
    ],
    ['a resolver that rejects', () => Promise.reject(new Error('down')), 'asset-missing'],
    [
      'bytes of another hash',
      resolverOf({ ...given, 'asset-font': { bytes: Uint8Array.of(7), mediaType: 'font/ttf' } }),
      'asset-hash-mismatch',
    ],
    [
      'no media type',
      resolverOf({ ...given, 'asset-font': { bytes: Uint8Array.of(6), mediaType: 'font' } }),
      'asset-invalid',
    ],
    [
      'a font served as an image',
      resolverOf({ ...given, 'asset-font': { bytes: Uint8Array.of(6), mediaType: 'image/png' } }),
      'asset-invalid',
    ],
    [
      'an image served as HTML',
      resolverOf({
        ...given,
        'asset-image': { bytes: Uint8Array.of(1, 2, 3), mediaType: 'text/html' },
      }),
      'asset-invalid',
    ],
    [
      'something that is not bytes',
      (() => ({ bytes: [1, 2, 3], mediaType: 'image/png' })) as unknown as AssetResolver,
      'asset-invalid',
    ],
    [
      'a PNG image whose bytes are not a PNG file (D62.1)',
      resolverOf({
        ...given,
        'asset-image': { bytes: Uint8Array.of(1, 2, 3), mediaType: 'image/png' },
      }),
      'image-invalid',
    ],
  ])('refuses %s with a typed error', async (_, resolver, code) => {
    await expect(resolveAssets(pinned, resolver, sha256)).rejects.toMatchObject({
      name: 'RenderError',
      code,
    });
  });

  it('names the image whose header it cannot read, and reads only PNG, JPEG, and WebP (D62.1)', async () => {
    const cut = resolverOf({
      ...given,
      'asset-image': { bytes: Uint8Array.of(1, 2, 3), mediaType: 'image/jpeg' },
    });
    await expect(resolveAssets(pinned, cut, sha256)).rejects.toThrow(/"asset-image"/);
    // Another media type is passed on unread, as before.
    await expect(resolveAssets(pinned, resolverOf(given), sha256)).resolves.toHaveLength(3);
  });

  it('stops at the first failing asset and asks for nothing after it', async () => {
    const asked: AssetRequest[] = [];
    await resolveAssets(
      pinned,
      resolverOf({ ...given, 'asset-image': undefined }, asked),
      sha256,
    ).catch(() => undefined);
    expect(asked.map(({ id }) => id)).toEqual(['asset-image']);
  });
});
