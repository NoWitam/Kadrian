/**
 * The envelope of a sound with a volume curve on its pipe (D85.5): the gains
 * of `volumeEnvelope` for the samples heard, each written twice as raw 32-bit
 * little-endian float stereo (both channels equal, so no rematrix scales it),
 * computed in chunks as the pipe drains, so that it is held neither in memory
 * nor on disk whole; the SHA-256 of its bytes is computed as they are read.
 */
import { createHash } from 'node:crypto';

import { volumeEnvelope, type VolumeSampleKey } from '@kadrion/runtime/volume';

import { interleave } from './stretch.js';

/** The samples of one chunk of an envelope: 32 KiB of stereo floats. */
export const ENVELOPE_CHUNK_SAMPLES = 4_096;

/** An envelope read chunk by chunk, and the SHA-256 of all of its bytes. */
export interface EnvelopeStream {
  /** The chunks, in order, for the pipe of the process. */
  readonly chunks: Iterator<Uint8Array>;
  /**
   * `sha256:` and the hex digest of the whole envelope (D14): computes the
   * chunks the process did not read, then the digest. Called once, after the
   * process ended.
   */
  sha256(): string;
}

/** The envelope of the samples `0` to `count − 1` of a sound whose placed keyframes are `keys`. */
export function envelopeStream(keys: readonly VolumeSampleKey[], count: number): EnvelopeStream {
  const hash = createHash('sha256');
  let from = 0;
  const chunks: Iterator<Uint8Array> = {
    next(): IteratorResult<Uint8Array> {
      if (from >= count) return { done: true, value: undefined };
      const gains = volumeEnvelope(
        { volumeKeys: keys },
        from,
        Math.min(ENVELOPE_CHUNK_SAMPLES, count - from),
      );
      from += gains.length;
      const bytes = interleave([gains, gains]);
      hash.update(bytes);
      return { done: false, value: bytes };
    },
  };
  return {
    chunks,
    sha256: () => {
      while (chunks.next().done !== true);
      return `sha256:${hash.digest('hex')}`;
    },
  };
}
