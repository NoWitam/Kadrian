/**
 * Video and audio read by path (D64) on real files of a temporary directory:
 * the verification of a file, the limits checked against its size, the check
 * that a file is still the one verified, and the files FFmpeg is given. The
 * pinned test of both deliveries is `tests/pinned/media-path.pinned.test.ts`.
 */
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AssetRequest } from '@kadrion/renderer-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { checkAssetLimits } from '../src/job.js';
import {
  assetSize,
  checkUnchanged,
  isPathAsset,
  resolveProducerAsset,
  type PathAsset,
  type ProducerAsset,
  type ProducerAssetResolver,
} from '../src/media-path.js';
import { mediaFiles } from '../src/video.js';

const BYTES = new Uint8Array(Array.from({ length: 4096 }, (_, at) => at % 251));
const HASH = `sha256:${createHash('sha256').update(BYTES).digest('hex')}`;
const sha256 = (bytes: Uint8Array): Promise<string> =>
  Promise.resolve(`sha256:${createHash('sha256').update(bytes).digest('hex')}`);

const directories: string[] = [];

function directory(): string {
  const made = mkdtempSync(join(tmpdir(), 'kadrion-media-path-'));
  directories.push(made);
  return made;
}

afterEach(() => {
  for (const made of directories.splice(0)) rmSync(made, { recursive: true, force: true });
});

function file(bytes: Uint8Array = BYTES): string {
  const path = join(directory(), 'source.mp4');
  writeFileSync(path, bytes);
  return path;
}

const VIDEO: AssetRequest = { id: 'asset-video', type: 'video', contentHash: HASH };
const AUDIO: AssetRequest = { id: 'asset-audio', type: 'audio', contentHash: HASH };

function resolve(
  request: AssetRequest,
  answer: unknown,
  maxAssetBytes?: number,
): Promise<ProducerAsset> {
  return resolveProducerAsset(
    request,
    (() => answer) as ProducerAssetResolver,
    sha256,
    maxAssetBytes,
  );
}

async function verified(path: string, request: AssetRequest = VIDEO): Promise<PathAsset> {
  const asset = await resolve(request, { path, mediaType: `${request.type}/mp4` });
  if (!isPathAsset(asset)) throw new Error('not read by path');
  return asset;
}

describe('the verification of a file (D64.1)', () => {
  it('verifies a video or an audio file by streaming it and keeps its real path and size', async () => {
    const path = file();
    const video = await verified(path);
    expect(video).toMatchObject({
      id: 'asset-video',
      type: 'video',
      mediaType: 'video/mp4',
      contentHash: HASH,
      path,
      size: BYTES.length,
    });
    expect('bytes' in video).toBe(false);
    expect(assetSize(video)).toBe(BYTES.length);
    await expect(verified(path, AUDIO)).resolves.toMatchObject({ type: 'audio', path });
  });

  it('asks the resolver once with a frozen request', async () => {
    const path = file();
    const asked: AssetRequest[] = [];
    await resolveProducerAsset(
      VIDEO,
      (request) => {
        asked.push(request);
        return { path, mediaType: 'video/mp4' };
      },
      sha256,
      undefined,
    );
    expect(asked).toEqual([VIDEO]);
    expect(Object.isFrozen(asked[0])).toBe(true);
  });

  it('resolves a symbolic link once and reads the file it names from then on', async () => {
    const path = file();
    const link = join(directory(), 'link.mp4');
    symlinkSync(path, link);
    await expect(verified(link)).resolves.toMatchObject({ path });
  });

  it('still takes bytes as before, for every type of asset', async () => {
    const asset = await resolve(VIDEO, { bytes: BYTES, mediaType: 'video/mp4' });
    expect(isPathAsset(asset)).toBe(false);
    expect(assetSize(asset)).toBe(BYTES.length);
  });

  it.each([
    ['an image', { ...VIDEO, type: 'image' as const }, { mediaType: 'image/png' }, 'asset-invalid'],
    ['a font', { ...VIDEO, type: 'font' as const }, { mediaType: 'font/ttf' }, 'asset-invalid'],
    ['bytes and a path at once', VIDEO, { bytes: BYTES, mediaType: 'video/mp4' }, 'asset-invalid'],
    ['a media type of another type', VIDEO, { mediaType: 'audio/mp4' }, 'asset-invalid'],
    ['no media type', VIDEO, {}, 'asset-invalid'],
  ])('refuses %s with %s', async (_, request, extra, code) => {
    await expect(resolve(request, { path: file(), ...extra })).rejects.toMatchObject({ code });
  });

  it.each([
    ['a relative path', 'source.mp4', 'asset-invalid'],
    ['a path that is not a string', 7, 'asset-invalid'],
    ['a path with a NUL byte', '/tmp/a\0b', 'asset-invalid'],
    ['a file that does not exist', '/nonexistent/kadrion/source.mp4', 'asset-missing'],
  ])('refuses %s with %s', async (_, path, code) => {
    await expect(resolve(VIDEO, { path, mediaType: 'video/mp4' })).rejects.toMatchObject({ code });
  });

  it('refuses a directory with asset-invalid', async () => {
    const made = join(directory(), 'folder');
    mkdirSync(made);
    await expect(resolve(VIDEO, { path: made, mediaType: 'video/mp4' })).rejects.toMatchObject({
      code: 'asset-invalid',
    });
  });

  it('refuses other bytes with asset-hash-mismatch', async () => {
    const path = file(BYTES.map((byte) => byte ^ 1));
    await expect(verified(path)).rejects.toMatchObject({ code: 'asset-hash-mismatch' });
  });

  it('refuses a file larger than maxAssetBytes before reading it', async () => {
    const path = file();
    await expect(
      resolve(VIDEO, { path, mediaType: 'video/mp4' }, BYTES.length - 1),
    ).rejects.toMatchObject({
      code: 'limit-exceeded',
      message: expect.stringContaining('asset-video') as unknown,
    });
    await expect(
      resolve(VIDEO, { path, mediaType: 'video/mp4' }, BYTES.length),
    ).resolves.toMatchObject({ size: BYTES.length });
  });

  it('a failing resolver is asset-missing, as for bytes', async () => {
    await expect(
      resolveProducerAsset(
        VIDEO,
        () => {
          throw new Error('storage offline');
        },
        sha256,
        undefined,
      ),
    ).rejects.toMatchObject({ code: 'asset-missing' });
  });
});

describe('the job limits of a file (D48.4, D64.1)', () => {
  it('counts the size of a file like the size of bytes', async () => {
    const asset = await verified(file());
    const bytes = await resolve(AUDIO, { bytes: BYTES, mediaType: 'audio/wav' });
    expect(() => {
      checkAssetLimits({ maxTotalAssetBytes: 2 * BYTES.length }, [asset, bytes]);
    }).not.toThrow();
    expect(() => {
      checkAssetLimits({ maxTotalAssetBytes: 2 * BYTES.length - 1 }, [asset, bytes]);
    }).toThrow(expect.objectContaining({ code: 'limit-exceeded' }) as Error);
  });
});

describe('a file changed after its verification (D64.3)', () => {
  it('passes while the file is the one verified', async () => {
    const asset = await verified(file());
    await expect(checkUnchanged([asset])).resolves.toBeUndefined();
  });

  it('refuses a file rewritten in place with the same size and times', async () => {
    const path = file();
    const asset = await verified(path);
    const at = new Date(Number(asset.stamp.mtimeNs / 1_000_000n));
    writeFileSync(
      path,
      BYTES.map((byte) => byte ^ 1),
    );
    // Putting the modification time back does not hide a write: the change time moved.
    utimesSync(path, at, at);
    await expect(checkUnchanged([asset])).rejects.toMatchObject({ code: 'asset-changed' });
  });

  it('refuses a file that grew, was replaced, or was removed', async () => {
    const grown = file();
    const a = await verified(grown);
    appendFileSync(grown, 'x');
    await expect(checkUnchanged([a])).rejects.toMatchObject({ code: 'asset-changed' });

    const replaced = file();
    const b = await verified(replaced);
    const other = join(directory(), 'other.mp4');
    writeFileSync(other, BYTES);
    renameSync(other, replaced);
    await expect(checkUnchanged([b])).rejects.toMatchObject({ code: 'asset-changed' });

    const removed = file();
    const c = await verified(removed);
    rmSync(removed);
    await expect(checkUnchanged([c])).rejects.toMatchObject({ code: 'asset-changed' });
  });
});

describe('the files FFmpeg is given (D50.5, D52.5, D64)', () => {
  it('gives the file read by path itself, writes no copy, and removes nothing of the host', async () => {
    const path = file();
    const asset = await verified(path);
    const media = await mediaFiles([asset], 'video');
    expect([...media.files]).toEqual([['asset-video', path]]);
    await media.check();
    await media.remove();
    expect(existsSync(path)).toBe(true);
  });

  it('writes a private copy of bytes beside a file read by path, and removes only the copy', async () => {
    const path = file();
    const asset = await verified(path);
    const bytes = await resolve(AUDIO, { bytes: BYTES, mediaType: 'audio/wav' });
    const media = await mediaFiles([asset, bytes], 'sound');
    const copy = media.files.get('asset-audio') ?? '';
    expect(copy).not.toBe('');
    expect(copy.startsWith(tmpdir())).toBe(true);
    expect(media.files.get('asset-video')).toBe(path);
    await media.remove();
    expect(existsSync(copy)).toBe(false);
    expect(existsSync(path)).toBe(true);
  });
});
