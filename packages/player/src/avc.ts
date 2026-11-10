/**
 * The colour facts of an H.264 stream (D51.4): what the Producer's decode
 * reads to convert YUV to RGB. The sequence parameter set in the `avcC` record
 * gives the chroma format, the bit depth, whether frames are progressive, and
 * the VUI's range and colour description; what the container states (an MP4
 * or QuickTime `colr` box, Matroska's `Colour`, as Mediabunny reads it, D79)
 * must agree with it. A browser decoder reports an unspecified
 * matrix as BT.709, while FFmpeg converts it as BT.601, so the Player reads
 * the facts from the bitstream itself rather than from the decoded frame.
 * Pure: no DOM.
 */
import { PlayerError } from './errors.js';
import type { YuvMatrix } from './yuv.js';

/** How the Producer converts a stream's frames: the matrix and the range (D51.4). */
export interface AvcColour {
  readonly matrix: YuvMatrix;
  readonly fullRange: boolean;
}

/** The colour description of the VUI. */
export interface ColourDescription {
  readonly primaries: number;
  readonly transfer: number;
  readonly matrix: number;
  readonly fullRange: boolean | null;
}

/**
 * What a container states about colour, as code points of H.273 (D79.3);
 * `null` where it states nothing.
 */
export interface ContainerColour {
  readonly primaries: number | null;
  readonly transfer: number | null;
  readonly matrix: number | null;
  readonly fullRange: boolean | null;
}

/** Why the Player does not convert a stream's frames as the Producer does (D79.4). */
export type AvcRefusal = 'bit-depth' | 'chroma' | 'interlaced' | 'colour';

/** A stream the Player does not convert, with the reason of D79.4. */
export class AvcUnsupported extends PlayerError {
  readonly reason: AvcRefusal | null;

  constructor(reason: AvcRefusal | null, message: string) {
    super('video-unsupported', message);
    this.reason = reason;
  }
}

/** A sequence parameter set that cannot be read. */
function unsupported(message: string): AvcUnsupported {
  return new AvcUnsupported(null, message);
}

/** The RBSP of a NAL unit: its payload without emulation-prevention bytes. */
function rbsp(nal: Uint8Array): Uint8Array {
  const out: number[] = [];
  let zeros = 0;
  for (let at = 1; at < nal.length; at += 1) {
    const byte = nal[at] as number;
    if (zeros >= 2 && byte === 3) {
      zeros = 0;
      continue;
    }
    zeros = byte === 0 ? zeros + 1 : 0;
    out.push(byte);
  }
  return new Uint8Array(out);
}

class Bits {
  private at = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  bit(): number {
    const byte = this.bytes[this.at >> 3];
    if (byte === undefined) throw unsupported('The sequence parameter set is cut off.');
    const value = (byte >> (7 - (this.at & 7))) & 1;
    this.at += 1;
    return value;
  }

  bits(count: number): number {
    let value = 0;
    for (let n = 0; n < count; n += 1) value = value * 2 + this.bit();
    return value;
  }

  ue(): number {
    let zeros = 0;
    while (this.bit() === 0) {
      zeros += 1;
      if (zeros > 31) throw unsupported('The sequence parameter set is malformed.');
    }
    return 2 ** zeros - 1 + this.bits(zeros);
  }

  se(): number {
    const value = this.ue();
    return value % 2 === 1 ? (value + 1) / 2 : -value / 2;
  }
}

const HIGH_PROFILES = new Set([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]);

function skipScalingList(bits: Bits, size: number): void {
  let last = 8;
  let next = 8;
  for (let at = 0; at < size; at += 1) {
    if (next !== 0) next = (last + bits.se() + 256) % 256;
    last = next === 0 ? last : next;
  }
}

/** The first sequence parameter set of an `avcC` record. */
function firstSps(avcC: Uint8Array): Uint8Array {
  if (avcC.length < 8 || avcC[0] !== 1) throw unsupported('The "avcC" record is malformed.');
  const count = (avcC[5] as number) & 0x1f;
  if (count < 1) throw unsupported('The "avcC" record has no sequence parameter set.');
  const length = ((avcC[6] as number) << 8) | (avcC[7] as number);
  if (8 + length > avcC.length || length < 4) throw unsupported('The "avcC" record is cut off.');
  return avcC.subarray(8, 8 + length);
}

interface SpsFacts {
  readonly chromaFormat: number;
  readonly bitDepth: number;
  readonly progressive: boolean;
  readonly vui: ColourDescription | null;
}

function readSps(nal: Uint8Array): SpsFacts {
  if (((nal[0] as number) & 0x1f) !== 7) throw unsupported('The "avcC" record holds no SPS.');
  const bits = new Bits(rbsp(nal));
  const profile = bits.bits(8);
  bits.bits(16);
  bits.ue();
  let chromaFormat = 1;
  let bitDepth = 8;
  if (HIGH_PROFILES.has(profile)) {
    chromaFormat = bits.ue();
    if (chromaFormat === 3) bits.bit();
    bitDepth = bits.ue() + 8;
    if (bits.ue() + 8 !== bitDepth) throw unsupported('Luma and chroma have different depths.');
    bits.bit();
    if (bits.bit() === 1) {
      for (let list = 0; list < (chromaFormat === 3 ? 12 : 8); list += 1) {
        if (bits.bit() === 1) skipScalingList(bits, list < 6 ? 16 : 64);
      }
    }
  }
  bits.ue();
  const pocType = bits.ue();
  if (pocType === 0) {
    bits.ue();
  } else if (pocType === 1) {
    bits.bit();
    bits.se();
    bits.se();
    for (let cycle = bits.ue(); cycle > 0; cycle -= 1) bits.se();
  }
  bits.ue();
  bits.bit();
  bits.ue();
  bits.ue();
  const progressive = bits.bit() === 1;
  if (!progressive) bits.bit();
  bits.bit();
  if (bits.bit() === 1) {
    bits.ue();
    bits.ue();
    bits.ue();
    bits.ue();
  }
  let vui: ColourDescription | null = null;
  if (bits.bit() === 1) {
    if (bits.bit() === 1 && bits.bits(8) === 255) bits.bits(32);
    if (bits.bit() === 1) bits.bit();
    if (bits.bit() === 1) {
      bits.bits(3);
      const fullRange = bits.bit() === 1;
      vui =
        bits.bit() === 1
          ? { primaries: bits.bits(8), transfer: bits.bits(8), matrix: bits.bits(8), fullRange }
          : { primaries: 2, transfer: 2, matrix: 2, fullRange };
    }
  }
  return { chromaFormat, bitDepth, progressive, vui };
}

/** Primaries and transfers whose frames the Producer's decode converts by the matrix alone. */
const PLAIN_PRIMARIES = new Set([1, 2, 5, 6]);
const PLAIN_TRANSFERS = new Set([1, 2, 4, 5, 6]);

/**
 * How the Producer converts the frames of this stream (D51.4): 8-bit 4:2:0,
 * progressive, the BT.601 matrix for an unspecified, BT.470 BG, or SMPTE 170M
 * one and BT.709 for BT.709, limited range unless the VUI states full. What
 * the container states must agree with the VUI, field by field (D79.3).
 * Anything else is `video-unsupported` with its reason, never converted
 * approximately.
 */
export function avcColour(avcC: Uint8Array, container: ContainerColour | null): AvcColour {
  const sps = readSps(firstSps(avcC));
  if (sps.bitDepth !== 8) {
    throw new AvcUnsupported(
      'bit-depth',
      `The Player converts 8-bit video, not ${String(sps.bitDepth)}-bit.`,
    );
  }
  if (sps.chromaFormat !== 1) {
    throw new AvcUnsupported(
      'chroma',
      `The Player converts 4:2:0 video, not chroma format ${String(sps.chromaFormat)}.`,
    );
  }
  if (!sps.progressive) {
    throw new AvcUnsupported('interlaced', 'The Player does not convert interlaced video.');
  }
  const vui = sps.vui;
  const matrixCode = vui?.matrix ?? 2;
  const primaries = vui?.primaries ?? 2;
  const transfer = vui?.transfer ?? 2;
  const fullRange = vui?.fullRange ?? false;
  // What the container states must be what the bitstream says: which of the two
  // FFmpeg follows when only one speaks is not something the Player guesses.
  if (container !== null) {
    const stated: [string, number | null, number][] = [
      ['primaries', container.primaries, primaries],
      ['transfer', container.transfer, transfer],
      ['matrix', container.matrix, matrixCode],
    ];
    for (const [name, said, bitstream] of stated) {
      if (said !== null && said !== 2 && said !== bitstream) {
        throw new AvcUnsupported(
          'colour',
          `The container states ${name} ${String(said)}, the sequence parameter set ${String(bitstream)}.`,
        );
      }
    }
    if (container.fullRange !== null && container.fullRange !== fullRange) {
      throw new AvcUnsupported(
        'colour',
        'The container and the sequence parameter set state other ranges.',
      );
    }
  }
  if (!PLAIN_PRIMARIES.has(primaries) || !PLAIN_TRANSFERS.has(transfer)) {
    throw new AvcUnsupported(
      'colour',
      `The Player does not convert primaries ${String(primaries)} with transfer ${String(transfer)}.`,
    );
  }
  if (matrixCode === 1) return { matrix: 'bt709', fullRange };
  if (matrixCode === 2 || matrixCode === 5 || matrixCode === 6)
    return { matrix: 'bt601', fullRange };
  throw new AvcUnsupported('colour', `The Player does not convert matrix ${String(matrixCode)}.`);
}

/**
 * Whether a sample holds an IDR slice (D79.5): the NAL units of its
 * length-prefixed data, the length size taken from the `avcC` record. A
 * container's key flag is not enough: decoding from a recovery point that is
 * not an IDR picture could give other pixels than the Producer's decode from
 * the start.
 */
export function holdsIdr(avcC: Uint8Array, sample: Uint8Array): boolean {
  const lengthSize = ((avcC[4] ?? 3) & 3) + 1;
  let at = 0;
  while (at + lengthSize <= sample.length) {
    let length = 0;
    for (let byte = 0; byte < lengthSize; byte += 1) {
      length = length * 256 + (sample[at + byte] as number);
    }
    at += lengthSize;
    if (length === 0 || at + length > sample.length) return false;
    if (((sample[at] as number) & 0x1f) === 5) return true;
    at += length;
  }
  return false;
}
