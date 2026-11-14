/**
 * `inflate`: the zlib format of RFC 1950 around the deflate format of RFC 1951
 * (D84.1), written from the RFCs. Stored, fixed, and dynamic blocks; the
 * header's check bits; no preset dictionary; the Adler-32 at the end, which
 * must match.
 *
 * The caller names the exact length the stream must produce, and the output
 * is one buffer of that length (D84.4): a stream that would write one byte
 * more, that ends before the length, or that leaves bytes after its Adler-32,
 * is `font-invalid`. The prefix codes follow zlib's rules, so a stream zlib
 * refuses for its codes is refused here too: an over-subscribed code, an
 * incomplete one (except a single code of one bit for literals and lengths or
 * for distances), a block without the end-of-block code, more than 286
 * literal and length codes or 30 distance codes.
 *
 * Every loop advances the input or the output, and a code is decoded in at
 * most 15 bits, so the work is linear in the input and the output. Pure and
 * synchronous: integer arithmetic and typed arrays only, nothing kept between
 * calls (D20, D24).
 */
import { checkLimit, invalid } from './font-decode.js';

const MAX_BITS = 15;
const LITERAL_LENGTH_CODES = 286;
const DISTANCE_CODES = 30;
const END_OF_BLOCK = 256;

/** The base lengths of codes 257 to 285 (RFC 1951, 3.2.5). */
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
] as const;
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
] as const;
/** The base distances of codes 0 to 29 (RFC 1951, 3.2.5). */
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
] as const;
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
] as const;
/** The order in which a dynamic block lists the lengths of the code-length code (RFC 1951, 3.2.7). */
const CODE_LENGTH_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
] as const;

/**
 * Decompresses a zlib stream (RFC 1950, RFC 1951) that must produce exactly
 * `length` bytes, and returns them in a new buffer of that length. Throws
 * `FontMetricsError` `font-invalid` for a malformed stream, a preset
 * dictionary, a bad Adler-32, a stream that produces fewer or more bytes than
 * `length`, or bytes after its end; and `font-unmeasurable` for a `length`
 * past 64 MiB (D84.4), before anything is allocated.
 */
export function inflate(stream: Uint8Array, length: number): Uint8Array {
  return inflateStream(stream, length, 'its zlib stream');
}

/** `inflate`, with the name of the stream its refusals give: `its zlib stream of the hmtx table`. */
export function inflateStream(stream: Uint8Array, length: number, what: string): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError(
      `The length a zlib stream must produce, ${String(length)}, is not a whole number of bytes.`,
    );
  }
  checkLimit(length, what);
  const refuse = (offence: string): never => invalid(`${what} ${offence}`);

  // RFC 1950, 2.2: CMF and FLG.
  if (stream.length < 2) refuse('ends before its header');
  const cmf = stream[0] ?? 0;
  const flg = stream[1] ?? 0;
  if ((cmf & 0x0f) !== 8) refuse(`names the compression method ${String(cmf & 0x0f)}, not deflate`);
  if (cmf >> 4 > 7) refuse(`names a window of 2^${String((cmf >> 4) + 8)} bytes, past 32 KiB`);
  if ((cmf * 256 + flg) % 31 !== 0) refuse('has a header that fails its check bits');
  if ((flg & 0x20) !== 0) refuse('asks for a preset dictionary');

  const bits = new BitReader(stream, 2, refuse);
  const output = new Uint8Array(length);
  let written = 0;
  let last = false;
  while (!last) {
    last = bits.read(1) === 1;
    const type = bits.read(2);
    if (type === 0) {
      // A stored block (RFC 1951, 3.2.4).
      const start = bits.alignToByte();
      if (start + 4 > stream.length) refuse('ends inside a stored block');
      const size = (stream[start] ?? 0) | ((stream[start + 1] ?? 0) << 8);
      const check = (stream[start + 2] ?? 0) | ((stream[start + 3] ?? 0) << 8);
      if ((size ^ 0xffff) !== check) refuse('has a stored block whose length fails its complement');
      if (start + 4 + size > stream.length) refuse('ends inside a stored block');
      if (written + size > length)
        refuse(`produces more than the ${String(length)} bytes declared`);
      output.set(stream.subarray(start + 4, start + 4 + size), written);
      written += size;
      bits.skipTo(start + 4 + size);
    } else if (type === 1 || type === 2) {
      const codes = type === 1 ? fixedCodes(refuse) : dynamicCodes(bits, refuse);
      written = inflateBlock(bits, codes, output, written, refuse);
    } else {
      refuse('has a block of the reserved type 3');
    }
  }

  // RFC 1950: the Adler-32 of the output, most significant byte first, then nothing.
  const end = bits.alignToByte();
  if (end + 4 > stream.length) refuse('ends before its Adler-32');
  if (end + 4 < stream.length) refuse('leaves bytes after its Adler-32');
  if (written !== length) {
    refuse(`ends after ${String(written)} bytes, before the ${String(length)} bytes declared`);
  }
  const stored =
    (((stream[end] ?? 0) << 24) |
      ((stream[end + 1] ?? 0) << 16) |
      ((stream[end + 2] ?? 0) << 8) |
      (stream[end + 3] ?? 0)) >>>
    0;
  if (adler32(output) !== stored) refuse('fails its Adler-32');
  return output;
}

/** Bits read from the least significant end of each byte (RFC 1951, 3.1.1). */
class BitReader {
  private readonly input: Uint8Array;
  private readonly refuse: (offence: string) => never;
  private position: number;
  private buffer = 0;
  private count = 0;

  constructor(input: Uint8Array, start: number, refuse: (offence: string) => never) {
    this.input = input;
    this.position = start;
    this.refuse = refuse;
  }

  /** The next `need` bits, at most 16, as a number whose bit 0 came first. */
  read(need: number): number {
    let value = this.buffer;
    let count = this.count;
    while (count < need) {
      if (this.position >= this.input.length) this.refuse('ends early');
      value |= (this.input[this.position] ?? 0) << count;
      this.position += 1;
      count += 8;
    }
    // Fewer than 8 bits stay buffered, all of the byte last read.
    this.buffer = value >>> need;
    this.count = count - need;
    return value & ((1 << need) - 1);
  }

  /** Drops the rest of the byte being read and returns the offset of the next one. */
  alignToByte(): number {
    this.buffer = 0;
    this.count = 0;
    return this.position;
  }

  /** Continues at a byte boundary after bytes read directly. */
  skipTo(position: number): void {
    this.position = position;
  }
}

/** A canonical prefix code (RFC 1951, 3.2.2): how many codes of each length, and the symbols in code order. */
interface PrefixCode {
  readonly counts: Uint16Array;
  readonly symbols: Uint16Array;
}

interface BlockCodes {
  readonly literals: PrefixCode;
  readonly distances: PrefixCode;
}

/**
 * Builds the canonical code of the given lengths, with zlib's rules: an
 * over-subscribed code is refused; an incomplete one is refused unless it is
 * a single code of one bit and not the code-length code. A code without any
 * length is accepted, and refused when a symbol of it is read.
 */
function prefixCode(
  lengths: Uint8Array,
  codeLengthCode: boolean,
  name: string,
  refuse: (offence: string) => never,
): PrefixCode {
  const counts = new Uint16Array(MAX_BITS + 1);
  let longest = 0;
  for (const length of lengths) {
    counts[length] = (counts[length] ?? 0) + 1;
    if (length > longest) longest = length;
  }
  counts[0] = 0;
  const symbols = new Uint16Array(lengths.length);
  if (longest === 0) return { counts, symbols };
  let left = 1;
  for (let length = 1; length <= MAX_BITS; length += 1) {
    left = left * 2 - (counts[length] ?? 0);
    if (left < 0) refuse(`has an over-subscribed ${name} code`);
  }
  if (left > 0 && (codeLengthCode || longest !== 1)) refuse(`has an incomplete ${name} code`);
  const offsets = new Uint16Array(MAX_BITS + 2);
  for (let length = 1; length <= MAX_BITS; length += 1) {
    offsets[length + 1] = (offsets[length] ?? 0) + (counts[length] ?? 0);
  }
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol] ?? 0;
    if (length !== 0) {
      const at = offsets[length] ?? 0;
      symbols[at] = symbol;
      offsets[length] = at + 1;
    }
  }
  return { counts, symbols };
}

/** Reads one symbol, one bit at a time, at most 15 bits (RFC 1951, 3.2.2). */
function decodeSymbol(
  bits: BitReader,
  code: PrefixCode,
  name: string,
  refuse: (offence: string) => never,
): number {
  let value = 0;
  let first = 0;
  let index = 0;
  for (let length = 1; length <= MAX_BITS; length += 1) {
    value |= bits.read(1);
    const count = code.counts[length] ?? 0;
    if (value - count < first) return code.symbols[index + (value - first)] ?? 0;
    index += count;
    first = (first + count) * 2;
    value *= 2;
  }
  return refuse(`has a ${name} code that names no symbol`);
}

/** The fixed codes of a block of type 1 (RFC 1951, 3.2.6), built for each block: no module state (D20). */
function fixedCodes(refuse: (offence: string) => never): BlockCodes {
  const literals = new Uint8Array(288);
  literals.fill(8, 0, 144);
  literals.fill(9, 144, 256);
  literals.fill(7, 256, 280);
  literals.fill(8, 280, 288);
  const distances = new Uint8Array(32).fill(5);
  return {
    literals: prefixCode(literals, false, 'literal and length', refuse),
    distances: prefixCode(distances, false, 'distance', refuse),
  };
}

/** The codes a block of type 2 sends before its data (RFC 1951, 3.2.7). */
function dynamicCodes(bits: BitReader, refuse: (offence: string) => never): BlockCodes {
  const literalCount = bits.read(5) + 257;
  const distanceCount = bits.read(5) + 1;
  const codeLengthCount = bits.read(4) + 4;
  if (literalCount > LITERAL_LENGTH_CODES) {
    refuse(`lists ${String(literalCount)} literal and length codes, past 286`);
  }
  if (distanceCount > DISTANCE_CODES)
    refuse(`lists ${String(distanceCount)} distance codes, past 30`);

  const codeLengthLengths = new Uint8Array(19);
  for (let index = 0; index < codeLengthCount; index += 1) {
    codeLengthLengths[CODE_LENGTH_ORDER[index] ?? 0] = bits.read(3);
  }
  const codeLengths = prefixCode(codeLengthLengths, true, 'code-length', refuse);

  const total = literalCount + distanceCount;
  const lengths = new Uint8Array(total);
  let index = 0;
  while (index < total) {
    const symbol = decodeSymbol(bits, codeLengths, 'code-length', refuse);
    if (symbol < 16) {
      lengths[index] = symbol;
      index += 1;
      continue;
    }
    let value = 0;
    let repeat: number;
    if (symbol === 16) {
      if (index === 0) refuse('repeats a code length before the first one');
      value = lengths[index - 1] ?? 0;
      repeat = 3 + bits.read(2);
    } else if (symbol === 17) {
      repeat = 3 + bits.read(3);
    } else {
      repeat = 11 + bits.read(7);
    }
    if (index + repeat > total) refuse('repeats a code length past the codes it lists');
    lengths.fill(value, index, index + repeat);
    index += repeat;
  }
  if (lengths[END_OF_BLOCK] === 0) refuse('has a block without an end-of-block code');
  return {
    literals: prefixCode(lengths.subarray(0, literalCount), false, 'literal and length', refuse),
    distances: prefixCode(lengths.subarray(literalCount), false, 'distance', refuse),
  };
}

/** Decodes the data of a fixed or dynamic block into `output` and returns how many bytes it holds. */
function inflateBlock(
  bits: BitReader,
  codes: BlockCodes,
  output: Uint8Array,
  start: number,
  refuse: (offence: string) => never,
): number {
  const limit = output.length;
  let written = start;
  for (;;) {
    const symbol = decodeSymbol(bits, codes.literals, 'literal and length', refuse);
    if (symbol < 256) {
      if (written >= limit) refuse(`produces more than the ${String(limit)} bytes declared`);
      output[written] = symbol;
      written += 1;
      continue;
    }
    if (symbol === END_OF_BLOCK) return written;
    const lengthCode = symbol - 257;
    if (lengthCode >= LENGTH_BASE.length) refuse(`uses the invalid length code ${String(symbol)}`);
    const size = (LENGTH_BASE[lengthCode] ?? 0) + bits.read(LENGTH_EXTRA[lengthCode] ?? 0);
    const distanceCode = decodeSymbol(bits, codes.distances, 'distance', refuse);
    if (distanceCode >= DISTANCE_CODES) {
      refuse(`uses the invalid distance code ${String(distanceCode)}`);
    }
    const distance =
      (DISTANCE_BASE[distanceCode] ?? 0) + bits.read(DISTANCE_EXTRA[distanceCode] ?? 0);
    if (distance > written) refuse('refers to a distance before the start of its output');
    if (written + size > limit) refuse(`produces more than the ${String(limit)} bytes declared`);
    // Byte by byte: a copy may overlap the bytes it writes.
    for (let index = 0; index < size; index += 1) {
      output[written] = output[written - distance] ?? 0;
      written += 1;
    }
  }
}

/** The Adler-32 of RFC 1950, 8.2. */
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  let index = 0;
  while (index < bytes.length) {
    // 5 552 bytes is the most that keeps `b` below 2^32 before the modulo.
    const end = Math.min(index + 5552, bytes.length);
    for (; index < end; index += 1) {
      a += bytes[index] ?? 0;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return (b * 65536 + a) >>> 0;
}
