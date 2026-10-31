/**
 * YUV to RGB exactly as the Producer's decode (D51.4). The pinned FFmpeg
 * converts every decoded frame with `-sws_flags
 * bitexact+accurate_rnd+full_chroma_int` to packed RGB (D50.5); H.264
 * decoding itself is bit-exact, so a browser decoder gives the same 4:2:0
 * planes, and this module repeats libswscale's conversion of them in integer
 * arithmetic: its bicubic chroma filters (B = 0, C = 0.6) built and
 * normalised the way `initFilter` builds them, the horizontal pass to 15 bits,
 * the vertical pass and the matrix of `yuv2rgb_full_X`, and its coefficients
 * for limited and full range. The result is the Producer's RGB byte for byte,
 * independent of how a browser converts colour. Only what the Producer meets
 * in an accepted file is ported: 8-bit 4:2:0 at the source size, the BT.601
 * and BT.709 matrices, no interlacing. Pure: no DOM.
 */

/** A matrix of D51.4: libswscale's `ff_yuv2rgb_coeffs` rows `{ crv, cbu, cgu, cgv }`. */
export type YuvMatrix = 'bt601' | 'bt709';

const COEFFICIENTS: Readonly<Record<YuvMatrix, readonly [number, number, number, number]>> = {
  bt601: [104597, 132201, 25675, 53279],
  bt709: [117489, 138438, 13975, 34925],
};

/** One filter of libswscale: `size` taps per output sample, starting at `positions[i]`. */
interface Filter {
  readonly size: number;
  readonly positions: Int32Array;
  readonly coefficients: Int32Array;
}

const ABS = (value: bigint): bigint => (value < 0n ? -value : value);

/** C's integer division of `bigint`s, which truncates toward zero as `/` does. */
const ROUNDED_DIV = (a: bigint, b: bigint): bigint => (a >= 0n ? a + (b >> 1n) : a - (b >> 1n)) / b;

/**
 * libswscale's `initFilter` for the bicubic scaler, as the Producer's decode
 * builds it for one chroma dimension (`srcW` samples to `dstW`), with the
 * chroma positions of an unspecified siting (`srcPos` = `dstPos` = 128) and
 * `one` the sum of the normalised taps (1 << 14 horizontally, 1 << 12
 * vertically). Bit-exact mode zeroes every tap past the reduced size, so the
 * alignment of a SIMD build does not change a coefficient.
 */
function bicubicFilter(xInc: number, srcW: number, dstW: number, one: number): Filter {
  const B = 0n;
  const C = BigInt(Math.trunc(0.6 * (1 << 24)));
  const ratio = Math.floor(srcW / dstW);
  const fone = 1n << BigInt(54 - Math.min(ratio > 0 ? Math.floor(Math.log2(ratio)) : 0, 8));
  const positions = new Int32Array(dstW);
  let filterSize: number;
  let filter: bigint[];
  if (Math.abs(xInc - 0x10000) < 10) {
    filterSize = 1;
    filter = new Array<bigint>(dstW).fill(fone);
    for (let i = 0; i < dstW; i += 1) positions[i] = i;
  } else {
    const sizeFactor = 4;
    filterSize =
      xInc <= 1 << 16 ? 1 + sizeFactor : 1 + Math.floor((sizeFactor * srcW + dstW - 1) / dstW);
    filterSize = Math.max(Math.min(filterSize, srcW - 2), 1);
    filter = new Array<bigint>(dstW * filterSize).fill(0n);
    const srcPos = 128n;
    const dstPos = 128n;
    let xDstInSrc = ((dstPos * BigInt(xInc)) >> 7n) - ((srcPos * 0x10000n) >> 7n);
    for (let i = 0; i < dstW; i += 1) {
      let xx = Number((xDstInSrc - BigInt(filterSize - 2) * (1n << 16n)) / (1n << 17n));
      positions[i] = xx;
      for (let j = 0; j < filterSize; j += 1) {
        let d = ABS(BigInt(xx) * (1n << 17n) - xDstInSrc) << 13n;
        if (xInc > 1 << 16) d = (d * BigInt(dstW)) / BigInt(srcW);
        let coeff: bigint;
        if (d >= 1n << 31n) {
          coeff = 0n;
        } else {
          const dd = (d * d) >> 30n;
          const ddd = (dd * d) >> 30n;
          coeff =
            d < 1n << 30n
              ? (12n * (1n << 24n) - 9n * B - 6n * C) * ddd +
                (-18n * (1n << 24n) + 12n * B + 6n * C) * dd +
                (6n * (1n << 24n) - 2n * B) * (1n << 30n)
              : (-B - 6n * C) * ddd +
                (6n * B + 30n * C) * dd +
                (-12n * B - 48n * C) * d +
                (8n * B + 24n * C) * (1n << 30n);
        }
        filter[i * filterSize + j] = coeff / ((1n << 54n) / fone);
        xx += 1;
      }
      xDstInSrc += 2n * BigInt(xInc);
    }
  }
  // Reduce: drop near-zero taps on the left (shifting the position) and count those on the right.
  const cutOff = 0.002 * Number(fone);
  let minFilterSize = 0;
  for (let i = dstW - 1; i >= 0; i -= 1) {
    let min = filterSize;
    let sum = 0n;
    for (let j = 0; j < filterSize; j += 1) {
      sum += ABS(filter[i * filterSize] ?? 0n);
      if (Number(sum) > cutOff) break;
      if (i < dstW - 1 && (positions[i] ?? 0) >= (positions[i + 1] ?? 0)) break;
      for (let k = 1; k < filterSize; k += 1) {
        filter[i * filterSize + k - 1] = filter[i * filterSize + k] ?? 0n;
      }
      filter[i * filterSize + filterSize - 1] = 0n;
      positions[i] = (positions[i] ?? 0) + 1;
    }
    sum = 0n;
    for (let j = filterSize - 1; j > 0; j -= 1) {
      sum += ABS(filter[i * filterSize + j] ?? 0n);
      if (Number(sum) > cutOff) break;
      min -= 1;
    }
    if (min > minFilterSize) minFilterSize = min;
  }
  const size = minFilterSize;
  const taps = new Array<bigint>(dstW * size).fill(0n);
  for (let i = 0; i < dstW; i += 1) {
    for (let j = 0; j < size; j += 1) {
      taps[i * size + j] = j < filterSize ? (filter[i * filterSize + j] ?? 0n) : 0n;
    }
  }
  // Borders: fold the taps that fall outside the source onto its first and last sample.
  for (let i = 0; i < dstW; i += 1) {
    let position = positions[i] ?? 0;
    if (position < 0) {
      for (let j = 1; j < size; j += 1) {
        const left = Math.max(j + position, 0);
        taps[i * size + left] = (taps[i * size + left] ?? 0n) + (taps[i * size + j] ?? 0n);
        taps[i * size + j] = 0n;
      }
      position = 0;
    }
    if (position + size > srcW) {
      const shift = position + Math.min(size - srcW, 0);
      let acc = 0n;
      for (let j = size - 1; j >= 0; j -= 1) {
        if (position + j >= srcW) {
          acc += taps[i * size + j] ?? 0n;
          taps[i * size + j] = 0n;
        }
      }
      for (let j = size - 1; j >= 0; j -= 1) {
        taps[i * size + j] = j < shift ? 0n : (taps[i * size + j - shift] ?? 0n);
      }
      position -= shift;
      taps[i * size + srcW - 1 - position] = (taps[i * size + srcW - 1 - position] ?? 0n) + acc;
    }
    positions[i] = position;
  }
  // Normalise to `one`, carrying the rounding error from tap to tap.
  const coefficients = new Int32Array(dstW * size);
  const total = BigInt(one);
  for (let i = 0; i < dstW; i += 1) {
    let sum = 0n;
    for (let j = 0; j < size; j += 1) sum += taps[i * size + j] ?? 0n;
    sum = (sum + total / 2n) / total;
    if (sum === 0n) sum = 1n;
    let error = 0n;
    for (let j = 0; j < size; j += 1) {
      const value = (taps[i * size + j] ?? 0n) + error;
      const rounded = ROUNDED_DIV(value, sum);
      coefficients[i * size + j] = Number(rounded);
      error = value - rounded * sum;
    }
  }
  return { size, positions, coefficients };
}

/** libswscale's `roundToInt16`. */
function roundToInt16(value: bigint): number {
  const rounded = Number((value + (1n << 15n)) >> 16n);
  return rounded < -0x7fff ? -0x8000 : rounded > 0x7fff ? 0x7fff : rounded;
}

/** The integer coefficients of `ff_yuv2rgb_c_init_tables` for a matrix and a range. */
function matrixOf(matrix: YuvMatrix, fullRange: boolean) {
  const [vr, ub, ug, vg] = COEFFICIENTS[matrix];
  let cy = 1n << 16n;
  let oy = 0n;
  let crv = BigInt(vr);
  let cbu = BigInt(ub);
  let cgu = -BigInt(ug);
  let cgv = -BigInt(vg);
  if (!fullRange) {
    cy = (cy * 255n) / 219n;
    oy = 16n << 16n;
  } else {
    crv = (crv * 224n) / 255n;
    cbu = (cbu * 224n) / 255n;
    cgu = (cgu * 224n) / 255n;
    cgv = (cgv * 224n) / 255n;
  }
  return {
    yCoeff: roundToInt16(cy * (1n << 13n)),
    yOffset: roundToInt16(oy * (1n << 9n)),
    v2r: roundToInt16(crv * (1n << 13n)),
    v2g: roundToInt16(cgv * (1n << 13n)),
    u2g: roundToInt16(cgu * (1n << 13n)),
    u2b: roundToInt16(cbu * (1n << 13n)),
  };
}

/** `av_clip_uintp2(value, 30)` on a 32-bit integer. */
function clip30(value: number): number {
  return value & ~((1 << 30) - 1) ? (~value >> 31) & ((1 << 30) - 1) : value;
}

/** The planes of one 8-bit 4:2:0 frame, with their strides. */
export interface YuvPlanes {
  readonly width: number;
  readonly height: number;
  readonly y: Uint8Array;
  readonly yStride: number;
  readonly u: Uint8Array;
  readonly uStride: number;
  readonly v: Uint8Array;
  readonly vStride: number;
}

const FILTERS = new Map<string, { horizontal: Filter; vertical: Filter }>();

function filtersFor(width: number, height: number): { horizontal: Filter; vertical: Filter } {
  const key = `${String(width)}x${String(height)}`;
  const found = FILTERS.get(key);
  if (found !== undefined) return found;
  const chromaWidth = (width + 1) >> 1;
  const chromaHeight = (height + 1) >> 1;
  const xInc = Math.floor((chromaWidth * 65536 + (width >> 1)) / width);
  const yInc = Math.floor((chromaHeight * 65536 + (height >> 1)) / height);
  const filters = {
    horizontal: bicubicFilter(xInc, chromaWidth, width, 1 << 14),
    vertical: bicubicFilter(yInc, chromaHeight, height, 1 << 12),
  };
  if (FILTERS.size > 8) FILTERS.clear();
  FILTERS.set(key, filters);
  return filters;
}

/** Converts one 8-bit 4:2:0 frame to packed RGB, as the Producer's decode does (D51.4). */
export function yuv420ToRgb(planes: YuvPlanes, matrix: YuvMatrix, fullRange: boolean): Uint8Array {
  const { width, height } = planes;
  const chromaHeight = (height + 1) >> 1;
  const { horizontal, vertical } = filtersFor(width, height);
  const { yCoeff, yOffset, v2r, v2g, u2g, u2b } = matrixOf(matrix, fullRange);
  // The horizontal chroma pass, every chroma row to the full width in 15 bits (hScale8To15).
  const hu = new Int32Array(chromaHeight * width);
  const hv = new Int32Array(chromaHeight * width);
  for (let row = 0; row < chromaHeight; row += 1) {
    const uRow = row * planes.uStride;
    const vRow = row * planes.vStride;
    for (let x = 0; x < width; x += 1) {
      const start = horizontal.positions[x] ?? 0;
      let su = 0;
      let sv = 0;
      for (let tap = 0; tap < horizontal.size; tap += 1) {
        const coefficient = horizontal.coefficients[x * horizontal.size + tap] ?? 0;
        su += (planes.u[uRow + start + tap] ?? 0) * coefficient;
        sv += (planes.v[vRow + start + tap] ?? 0) * coefficient;
      }
      hu[row * width + x] = Math.min(su >> 7, 32767);
      hv[row * width + x] = Math.min(sv >> 7, 32767);
    }
  }
  // The vertical pass and the matrix (yuv2rgb_full_X and yuv2rgb_write_full).
  const rgb = new Uint8Array(width * height * 3);
  const base = (1 << 9) - (128 << 19);
  for (let y = 0; y < height; y += 1) {
    const first = vertical.positions[y] ?? 0;
    for (let x = 0; x < width; x += 1) {
      let Y = ((1 << 9) + ((planes.y[y * planes.yStride + x] ?? 0) << 7) * 4096) >> 10;
      let U = base;
      let V = base;
      for (let tap = 0; tap < vertical.size; tap += 1) {
        const coefficient = vertical.coefficients[y * vertical.size + tap] ?? 0;
        const at = (first + tap) * width + x;
        U += (hu[at] ?? 0) * coefficient;
        V += (hv[at] ?? 0) * coefficient;
      }
      U >>= 10;
      V >>= 10;
      Y = (Math.imul(Y - yOffset, yCoeff) + (1 << 21)) | 0;
      let R = (Y + Math.imul(V, v2r)) | 0;
      let G = (Y + Math.imul(V, v2g) + Math.imul(U, u2g)) | 0;
      let B = (Y + Math.imul(U, u2b)) | 0;
      if ((R | G | B) & 0xc0000000) {
        R = clip30(R);
        G = clip30(G);
        B = clip30(B);
      }
      const out = (y * width + x) * 3;
      rgb[out] = R >> 22;
      rgb[out + 1] = G >> 22;
      rgb[out + 2] = B >> 22;
    }
  }
  return rgb;
}
