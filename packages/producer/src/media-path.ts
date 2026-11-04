/**
 * Video and audio read by path (D64). A worker's media can be long: the host
 * mounts its storage read-only, and the resolver may name a file instead of
 * handing over its bytes. The Producer then never holds the bytes and writes
 * no copy: it streams the file once to verify its SHA-256 against the asset's
 * `contentHash`, records what the file system states of it (device, inode,
 * size, and the modification and change times in nanoseconds), and gives
 * FFmpeg that same path. Every read of FFmpeg is followed by a check that the
 * file is still the one verified (`asset-changed`), before anything it read is
 * used, so a file changed between verification and decode is refused, never
 * rendered.
 *
 * Images and fonts are never read by path: they are small and enter the page as
 * bytes (D64.2). This module only reads files.
 */
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

import {
  mediaTypeFits,
  resolveOneAsset,
  type AssetRequest,
  type ResolvedAsset,
  type Sha256,
  type VerifiedAsset,
} from '@kadrion/renderer-dom';

import { ProducerError } from './errors.js';

/** A file of the host's for a video or an audio asset, and its media type (D64.1). */
export interface ResolvedPath {
  /** An absolute path to a regular file, which the Producer reads and never writes. */
  readonly path: string;
  readonly mediaType: string;
}

/**
 * The Producer's resolver (D14, D64.1): bytes for any asset, a path for a video
 * or an audio asset, or `null` when the host has none.
 */
export type ProducerAssetResolver = (
  asset: AssetRequest,
) => ResolvedAsset | ResolvedPath | null | Promise<ResolvedAsset | ResolvedPath | null>;

/** What the file system states of a file; equal stamps mean the file was not changed. */
export interface FileStamp {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

/** A verified asset read by path: the file whose SHA-256 is its `contentHash`. */
export interface PathAsset {
  readonly id: string;
  readonly type: 'video' | 'audio';
  readonly mediaType: string;
  readonly contentHash: string;
  /** The real path of the file, symbolic links resolved once at verification. */
  readonly path: string;
  readonly size: number;
  readonly stamp: FileStamp;
}

/** An asset as the Producer holds it: verified bytes, or a verified file (D64). */
export type ProducerAsset = VerifiedAsset | PathAsset;

/** Whether an asset was delivered by path. */
export function isPathAsset(asset: ProducerAsset): asset is PathAsset {
  return 'path' in asset;
}

/** Whether an asset was delivered as bytes. */
export function isBytesAsset(asset: ProducerAsset): asset is VerifiedAsset {
  return !isPathAsset(asset);
}

/** The size of an asset in bytes, however it was delivered. */
export function assetSize(asset: ProducerAsset): number {
  return isPathAsset(asset) ? asset.size : asset.bytes.byteLength;
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function invalid(message: string): ProducerError {
  return new ProducerError('asset-invalid', message);
}

async function stampOf(path: string): Promise<FileStamp> {
  const facts = await stat(path, { bigint: true });
  if (!facts.isFile()) throw invalid(`${path} is not a regular file.`);
  return {
    dev: facts.dev,
    ino: facts.ino,
    size: facts.size,
    mtimeNs: facts.mtimeNs,
    ctimeNs: facts.ctimeNs,
  };
}

function sameStamp(a: FileStamp, b: FileStamp): boolean {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}

/** The SHA-256 of a file in the format of D14, read as a stream, and how many bytes were read. */
function hashFile(path: string): Promise<{ readonly hash: string; readonly bytes: bigint }> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    let bytes = 0n;
    createReadStream(path)
      .on('data', (chunk) => {
        const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        bytes += BigInt(data.length);
        hash.update(data);
      })
      .on('error', reject)
      .on('end', () => {
        resolve({ hash: `sha256:${hash.digest('hex')}`, bytes });
      });
  });
}

/** Whether a resolver's answer names a file rather than bytes. */
function namesPath(given: unknown): given is Partial<Record<string, unknown>> {
  return typeof given === 'object' && given !== null && 'path' in given;
}

/**
 * Verifies the file a resolver named for `asset` (D64.1): a video or an audio
 * asset, a media type of its type, an absolute path to a regular file, at most
 * `maxAssetBytes` (checked before it is read), whose SHA-256 is its
 * `contentHash`, and which did not change while it was read.
 */
async function verifiedPath(
  asset: AssetRequest,
  given: Partial<Record<string, unknown>>,
  maxAssetBytes: number | undefined,
): Promise<PathAsset> {
  const { id, type, contentHash } = asset;
  const { path, mediaType } = given;
  if ('bytes' in given) {
    throw invalid(`The asset "${id}" names both bytes and a path; a resolver gives one (D64.1).`);
  }
  if (type !== 'video' && type !== 'audio') {
    throw invalid(
      `The asset "${id}" is of type ${type}, and only video and audio assets may be read by path (D64.2).`,
    );
  }
  if (typeof mediaType !== 'string' || !mediaTypeFits(type, mediaType)) {
    throw invalid(`The asset "${id}" needs a media type of the form ${type}/….`);
  }
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
    throw invalid(`The path of the asset "${id}" must be an absolute path (D64.1).`);
  }
  let real: string;
  let before: FileStamp;
  try {
    real = await realpath(path);
    before = await stampOf(real);
  } catch (reason) {
    if (reason instanceof ProducerError) {
      throw invalid(`The asset "${id}": ${reason.message}`);
    }
    throw new ProducerError(
      'asset-missing',
      `The file of the asset "${id}" cannot be read: ${messageOf(reason)}`,
    );
  }
  if (maxAssetBytes !== undefined && Number.isSafeInteger(maxAssetBytes) && maxAssetBytes >= 0) {
    if (before.size > BigInt(maxAssetBytes)) {
      throw new ProducerError(
        'limit-exceeded',
        `The asset "${id}": An asset (bytes) is ${String(before.size)}, more than the limit of ${String(maxAssetBytes)}.`,
      );
    }
  }
  let read: { readonly hash: string; readonly bytes: bigint };
  try {
    read = await hashFile(real);
  } catch (reason) {
    throw new ProducerError(
      'asset-missing',
      `The file of the asset "${id}" cannot be read: ${messageOf(reason)}`,
    );
  }
  const after = await stampOf(real).catch(() => null);
  if (after === null || !sameStamp(before, after) || read.bytes !== before.size) {
    throw new ProducerError(
      'asset-changed',
      `The file of the asset "${id}" changed while it was verified (D64.3).`,
    );
  }
  if (read.hash !== contentHash) {
    throw new ProducerError(
      'asset-hash-mismatch',
      `The bytes of "${id}" have ${read.hash}, not ${contentHash}.`,
    );
  }
  return {
    id,
    type,
    mediaType,
    contentHash,
    path: real,
    size: Number(before.size),
    stamp: before,
  };
}

/**
 * Asks the resolver for one asset, once, with a frozen request (D14): a file is
 * verified here, and bytes are verified by `resolveOneAsset` of
 * `@kadrion/renderer-dom` exactly as before (D27.3). Errors of bytes are
 * `RenderError`s, which the caller translates.
 */
export async function resolveProducerAsset(
  asset: AssetRequest,
  resolveAsset: ProducerAssetResolver,
  sha256: Sha256,
  maxAssetBytes: number | undefined,
): Promise<ProducerAsset> {
  const { id, type, contentHash } = asset;
  let given: unknown;
  try {
    given = await resolveAsset(Object.freeze({ id, type, contentHash }));
  } catch (reason) {
    throw new ProducerError(
      'asset-missing',
      `The resolver failed for "${id}": ${messageOf(reason)}`,
    );
  }
  if (namesPath(given)) return verifiedPath(asset, given, maxAssetBytes);
  // The answer is handed on as it is; `resolveOneAsset` asks for it once.
  return resolveOneAsset(asset, () => given as ResolvedAsset | null, sha256);
}

/**
 * Checks that every file read by path is still the file that was verified
 * (D64.3): the same device, inode, size, and modification and change times.
 * The Producer calls it after each read of FFmpeg and before what it read is
 * used: a probe, a decoded frame, and the audio pass.
 */
export async function checkUnchanged(assets: readonly ProducerAsset[]): Promise<void> {
  for (const asset of assets) {
    if (!isPathAsset(asset)) continue;
    const now = await stampOf(asset.path).catch(() => null);
    if (now === null || !sameStamp(now, asset.stamp)) {
      throw new ProducerError(
        'asset-changed',
        `The file of the asset "${asset.id}" changed after it was verified (D64.3).`,
      );
    }
  }
}
