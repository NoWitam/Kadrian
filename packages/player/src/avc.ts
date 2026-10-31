/**
 * The colour facts of an H.264 stream (D51.4): what the Producer's decode
 * reads to convert YUV to RGB. The sequence parameter set in the `avcC` record
 * gives the chroma format, the bit depth, whether frames are progressive, and
 * the VUI's range and colour description; an MP4 `colr` box (`nclx`) must
 * agree with it. A browser decoder reports an unspecified
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

/** The colour description of an `nclx` box, or of the VUI. */
export interface ColourDescription {
  readonly primaries: number;
  readonly transfer: number;
  readonly matrix: number;
  readonly fullRange: boolean | null;
}

function unsupported(message: string): PlayerError {
  return new PlayerError('video-unsupported', message);
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
 * one and BT.709 for BT.709, limited range unless the VUI states full. A
 * `colr` box must agree with the VUI. Anything else is `video-unsupported`,
 * never converted approximately.
 */
export function avcColour(avcC: Uint8Array, colr: ColourDescription | null): AvcColour {
  const sps = readSps(firstSps(avcC));
  if (sps.chromaFormat !== 1 || sps.bitDepth !== 8) {
    throw unsupported(
      `The Player converts 8-bit 4:2:0 video, not chroma format ${String(sps.chromaFormat)} at ${String(sps.bitDepth)} bits.`,
    );
  }
  if (!sps.progressive) throw unsupported('The Player does not convert interlaced video.');
  const vui = sps.vui;
  const plain = (d: ColourDescription | null): boolean =>
    d === null || (d.matrix === 2 && d.primaries === 2 && d.transfer === 2);
  // A `colr` box must say what the bitstream says, or nothing: which of the two
  // FFmpeg follows when only one speaks is not something the Player guesses.
  if (colr !== null) {
    const same =
      plain(colr) === plain(vui) &&
      (plain(colr) ||
        (colr.matrix === vui?.matrix &&
          colr.primaries === vui.primaries &&
          colr.transfer === vui.transfer));
    const sameRange = colr.fullRange === null || colr.fullRange === (vui?.fullRange ?? false);
    if (!same || !sameRange) {
      throw unsupported('The "colr" box and the sequence parameter set describe other colours.');
    }
  }
  const matrixCode = vui?.matrix ?? 2;
  const primaries = vui?.primaries ?? 2;
  const transfer = vui?.transfer ?? 2;
  const fullRange = vui?.fullRange ?? false;
  if (!PLAIN_PRIMARIES.has(primaries) || !PLAIN_TRANSFERS.has(transfer)) {
    throw unsupported(
      `The Player does not convert primaries ${String(primaries)} with transfer ${String(transfer)}.`,
    );
  }
  if (matrixCode === 1) return { matrix: 'bt709', fullRange };
  if (matrixCode === 2 || matrixCode === 5 || matrixCode === 6)
    return { matrix: 'bt601', fullRange };
  throw unsupported(`The Player does not convert matrix ${String(matrixCode)}.`);
}
