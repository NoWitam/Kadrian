/**
 * `brotliDecode`: the Brotli format of RFC 7932 (D84.1), written from the RFC.
 * Meta-blocks (compressed, uncompressed, and metadata), simple and complex
 * prefix codes, block switches, the four literal context modes, distance codes
 * with their postfix and direct codes, the window bits of the stream header
 * (10 to 24; the large window of later Brotli versions is not RFC 7932 and is
 * refused), and the static dictionary with its 121 transforms.
 *
 * The caller names the length the stream must produce, and the output is one
 * buffer of that length (D84.4), so no ring buffer is needed: a distance past
 * the smaller of the window and the bytes written is a reference to the
 * dictionary, as RFC 7932 states it. A stream that would write one byte more,
 * that ends before the length, or that leaves bytes after its end, is
 * `font-invalid`. The WOFF2 container asks only for the first bytes of its
 * stream (D84.3) and stops there; the rest is not decoded.
 *
 * Every loop advances the input or the output, every prefix code is built
 * from at most 704 lengths of at most 15 bits, and a code that names no symbol
 * cannot be built, so the work is linear in the input and the output. Pure and
 * synchronous: integer arithmetic and typed arrays only, nothing kept between
 * calls; the dictionary is expanded inside a call that needs it (D20, D24).
 */
import { DICTIONARY_LENGTH, DICTIONARY_ZLIB } from './brotli-dictionary.js';
import { checkLimit, invalid } from './font-decode.js';
import { inflateStream } from './inflate.js';

type Refuse = (offence: string) => never;

/**
 * Decompresses a Brotli stream (RFC 7932) that must produce exactly `length`
 * bytes, and returns them in a new buffer of that length. Throws
 * `FontDecodeError` `font-invalid` for a malformed stream, the large window,
 * a stream that produces fewer or more bytes than `length`, or bytes after
 * its end; and `font-unmeasurable` for a `length` past 64 MiB (D84.4), before
 * anything is allocated.
 */
export function brotliDecode(stream: Uint8Array, length: number): Uint8Array {
  return brotliStream(stream, length, 'its Brotli stream', false);
}

/**
 * `brotliDecode`, with the name of the stream its refusals give. With `prefix`
 * the stream need only produce its first `length` bytes: decoding stops there,
 * and what follows is neither decoded nor checked (D84.3).
 */
export function brotliStream(
  stream: Uint8Array,
  length: number,
  what: string,
  prefix: boolean,
): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError(
      `The length a Brotli stream must produce, ${String(length)}, is not a whole number of bytes.`,
    );
  }
  checkLimit(length, what);
  const refuse: Refuse = (offence) => invalid(`${what} ${offence}`);
  const output: Output = {
    bytes: new Uint8Array(length),
    written: 0,
    prefix,
    full: false,
    refuse,
  };
  if (prefix && length === 0) return output.bytes;

  const bits = new BitReader(stream, refuse);
  const windowBits = readWindowBits(bits, refuse);
  const state: StreamState = {
    bits,
    output,
    refuse,
    // RFC 7932, 9.1: the window is 2^WBITS - 16 bytes.
    window: 2 ** windowBits - 16,
    // RFC 7932, 4: the last four distances, last first.
    distances: [4, 11, 15, 16],
    dictionary: null,
    codeLengthCode: buildCode(CODE_LENGTH_CODE_LENGTHS),
  };

  for (;;) {
    if (isFull(output)) return output.bytes;
    // RFC 7932, 9.2: the meta-block header.
    const last = bits.read(1) === 1;
    if (last && bits.read(1) === 1) break; // ISLASTEMPTY
    const nibbles = bits.read(2);
    if (nibbles === 3) {
      skipMetadata(state);
      if (last) break;
      continue;
    }
    let size = 0;
    const count = nibbles + 4;
    for (let index = 0; index < count; index += 1) {
      const nibble = bits.read(4);
      if (index === count - 1 && count > 4 && nibble === 0) {
        refuse('has a meta-block length with a needless last nibble of zero');
      }
      size += nibble * 16 ** index;
    }
    size += 1;
    if (!prefix && output.written + size > length) {
      refuse(`produces more than the ${String(length)} bytes declared`);
    }
    if (!last && bits.read(1) === 1) {
      copyUncompressed(state, size);
    } else {
      decodeCompressed(state, size);
    }
    if (last) break;
  }
  if (isFull(output)) return output.bytes;

  bits.align('after its last meta-block');
  if (!prefix && bits.offset() < stream.length) refuse('leaves bytes after its end');
  if (output.written !== length) {
    refuse(
      `ends after ${String(output.written)} bytes, before the ${String(length)} bytes declared`,
    );
  }
  return output.bytes;
}

// --- the stream -------------------------------------------------------------

/** The buffer the stream fills; `full` once a prefix has all its bytes. */
interface Output {
  readonly bytes: Uint8Array;
  written: number;
  readonly prefix: boolean;
  full: boolean;
  readonly refuse: Refuse;
}

interface StreamState {
  readonly bits: BitReader;
  readonly output: Output;
  readonly refuse: Refuse;
  readonly window: number;
  /** The last four distances of the stream, last first (RFC 7932, 4). */
  readonly distances: number[];
  /** Expanded when the stream first refers to it. */
  dictionary: Uint8Array | null;
  /** The fixed code of the lengths of the code-length code (RFC 7932, 3.5). */
  readonly codeLengthCode: PrefixCode;
}

/** Read through a call: `room` sets it, which TypeScript's narrowing does not see. */
function isFull(output: Output): boolean {
  return output.full;
}

/**
 * Makes room for `count` more bytes and returns how many may be written: all
 * of them, or, for a prefix, what is left of it, after which it is full and
 * decoding stops.
 */
function room(output: Output, count: number): number {
  const left = output.bytes.length - output.written;
  if (output.prefix && count >= left) {
    output.full = true;
    return left;
  }
  if (count > left) {
    output.refuse(`produces more than the ${String(output.bytes.length)} bytes declared`);
  }
  return count;
}

/** RFC 7932, 9.1: WBITS from 10 to 24; the large window is refused. */
function readWindowBits(bits: BitReader, refuse: Refuse): number {
  if (bits.read(1) === 0) return 16;
  const large = bits.read(3);
  if (large !== 0) return 17 + large;
  const small = bits.read(3);
  if (small === 1) {
    refuse('asks for the large window of later Brotli versions, which RFC 7932 does not define');
  }
  return small === 0 ? 17 : 8 + small;
}

/** RFC 7932, 9.2: a metadata meta-block, whose bytes are skipped. */
function skipMetadata(state: StreamState): void {
  const { bits, refuse } = state;
  if (bits.read(1) !== 0) refuse('has a metadata meta-block whose reserved bit is set');
  const count = bits.read(2);
  let size = 0;
  for (let index = 0; index < count; index += 1) {
    const byte = bits.read(8);
    if (index === count - 1 && count > 1 && byte === 0) {
      refuse('has a metadata length with a needless last byte of zero');
    }
    size += byte * 256 ** index;
  }
  if (count > 0) size += 1;
  bits.align('before its metadata');
  bits.skipBytes(size);
}

/** RFC 7932, 9.2: an uncompressed meta-block, copied as it is. */
function copyUncompressed(state: StreamState, size: number): void {
  const { bits, output } = state;
  bits.align('before an uncompressed meta-block');
  const start = bits.skipBytes(size);
  const count = room(output, size);
  output.bytes.set(bits.input.subarray(start, start + count), output.written);
  output.written += count;
}

// --- bits -------------------------------------------------------------------

/** Bits read from the least significant end of each byte (RFC 7932, 2). */
class BitReader {
  readonly input: Uint8Array;
  private readonly refuse: Refuse;
  /** The next byte to buffer; past the end, zero bytes are buffered. */
  private next = 0;
  /** Buffered bits, the next one in bit 0. */
  private value = 0;
  private count = 0;
  /** The bits consumed, which may not pass the end of the input. */
  private consumed = 0;

  constructor(input: Uint8Array, refuse: Refuse) {
    this.input = input;
    this.refuse = refuse;
  }

  /** At least the next 25 bits, the next one in bit 0, zeros past the end. */
  peek(): number {
    while (this.count <= 24) {
      this.value |= (this.input[this.next] ?? 0) << this.count;
      this.next += 1;
      this.count += 8;
    }
    return this.value;
  }

  drop(count: number): void {
    this.value >>>= count;
    this.count -= count;
    this.consumed += count;
    if (this.consumed > this.input.length * 8) this.refuse('ends early');
  }

  /** The next `count` bits, at most 24, as a number whose bit 0 came first. */
  read(count: number): number {
    if (count === 0) return 0;
    const value = this.peek() & ((1 << count) - 1);
    this.drop(count);
    return value;
  }

  /** Drops the rest of the byte being read, whose bits must be 0. */
  align(where: string): void {
    if (this.read((8 - (this.consumed % 8)) % 8) !== 0) {
      this.refuse(`has a padding bit set ${where}`);
    }
  }

  /** After `align`: the offset of the next byte. */
  offset(): number {
    return Math.ceil(this.consumed / 8);
  }

  /** After `align`: passes over `count` whole bytes and returns the offset of the first. */
  skipBytes(count: number): number {
    const start = this.offset();
    if (start + count > this.input.length) this.refuse('ends early');
    this.next = start + count;
    this.value = 0;
    this.count = 0;
    this.consumed = this.next * 8;
    return start;
  }
}

// --- prefix codes -----------------------------------------------------------

/**
 * A complete canonical prefix code (RFC 7932, 3.1 and 3.2) as a table read
 * with the next `rootBits` bits. An entry is `symbol * 32 + length`; an entry
 * whose low five bits are past 15 points to a second-level table at
 * `entry >> 5`, read with `(entry & 31) - 16` more bits.
 */
interface PrefixCode {
  readonly table: Int32Array;
  readonly rootBits: number;
}

const ROOT_BITS = 8;
const MAX_CODE_LENGTH = 15;

/** The code of one symbol, which takes no bit (RFC 7932, 3.4). */
function singleCode(symbol: number): PrefixCode {
  return { table: Int32Array.of(symbol * 32), rootBits: 0 };
}

/**
 * The table of a complete canonical code of the given lengths (0 for a symbol
 * without a code). Codes are given out in order of length, then of symbol;
 * the bits of a code are read from its first bit, so the table is indexed by
 * the code reversed.
 */
function buildCode(lengths: ArrayLike<number>): PrefixCode {
  const counts = new Int32Array(MAX_CODE_LENGTH + 1);
  let longest = 0;
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol] ?? 0;
    counts[length] = (counts[length] ?? 0) + 1;
    if (length > longest) longest = length;
  }
  counts[0] = 0;
  const next = new Int32Array(MAX_CODE_LENGTH + 1);
  let code = 0;
  for (let length = 1; length <= MAX_CODE_LENGTH; length += 1) {
    code = (code + (counts[length - 1] ?? 0)) * 2;
    next[length] = code;
  }

  const rootBits = Math.min(longest, ROOT_BITS);
  const rootSize = 1 << rootBits;
  const reversed = new Int32Array(lengths.length);
  const deepest = new Int8Array(rootSize);
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol] ?? 0;
    if (length === 0) continue;
    const value = next[length] ?? 0;
    next[length] = value + 1;
    let flipped = 0;
    for (let bit = 0; bit < length; bit += 1) flipped |= ((value >> bit) & 1) << (length - 1 - bit);
    reversed[symbol] = flipped;
    if (length > rootBits) {
      const root = flipped & (rootSize - 1);
      deepest[root] = Math.max(deepest[root] ?? 0, length);
    }
  }

  const offsets = new Int32Array(rootSize);
  let size = rootSize;
  for (let root = 0; root < rootSize; root += 1) {
    const length = deepest[root] ?? 0;
    if (length > 0) {
      offsets[root] = size;
      size += 1 << (length - rootBits);
    }
  }
  const table = new Int32Array(size);
  for (let root = 0; root < rootSize; root += 1) {
    const length = deepest[root] ?? 0;
    if (length > 0) table[root] = (offsets[root] ?? 0) * 32 + 16 + length - rootBits;
  }
  for (let symbol = 0; symbol < lengths.length; symbol += 1) {
    const length = lengths[symbol] ?? 0;
    if (length === 0) continue;
    const flipped = reversed[symbol] ?? 0;
    const entry = symbol * 32 + length;
    if (length <= rootBits) {
      for (let index = flipped; index < rootSize; index += 1 << length) table[index] = entry;
    } else {
      const root = flipped & (rootSize - 1);
      const base = offsets[root] ?? 0;
      const span = 1 << ((deepest[root] ?? 0) - rootBits);
      for (let index = flipped >> rootBits; index < span; index += 1 << (length - rootBits)) {
        table[base + index] = entry;
      }
    }
  }
  return { table, rootBits };
}

/** Reads one symbol of a code. */
function decodeSymbol(bits: BitReader, code: PrefixCode): number {
  const peeked = bits.peek();
  let entry = code.table[peeked & ((1 << code.rootBits) - 1)] ?? 0;
  let length = entry & 31;
  if (length > MAX_CODE_LENGTH) {
    const extra = length - 16;
    entry = code.table[(entry >> 5) + ((peeked >>> code.rootBits) & ((1 << extra) - 1))] ?? 0;
    length = entry & 31;
  }
  bits.drop(length);
  return entry >> 5;
}

/** The lengths of the fixed code of RFC 7932, 3.5, for code lengths 0 to 5. */
const CODE_LENGTH_CODE_LENGTHS = [2, 4, 3, 2, 2, 4] as const;
/** The order in which a complex code lists the lengths of its code-length code (RFC 7932, 3.5). */
const CODE_LENGTH_ORDER = [1, 2, 3, 4, 0, 5, 17, 6, 16, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
const REPEAT_PREVIOUS = 16;

/** Reads a simple or a complex prefix code over `alphabet` symbols (RFC 7932, 3.4 and 3.5). */
function readPrefixCode(state: StreamState, alphabet: number, name: string): PrefixCode {
  const { bits, refuse } = state;
  const skip = bits.read(2);
  if (skip === 1) return readSimpleCode(bits, alphabet, name, refuse);

  // The code-length code: its lengths, in their order, each in the fixed code.
  const codeLengthLengths = new Uint8Array(18);
  let space = 32;
  let used = 0;
  let only = 0;
  for (let index = skip; index < CODE_LENGTH_ORDER.length; index += 1) {
    const length = decodeSymbol(bits, state.codeLengthCode);
    const symbol = CODE_LENGTH_ORDER[index] ?? 0;
    codeLengthLengths[symbol] = length;
    if (length !== 0) {
      space -= 32 >> length;
      used += 1;
      only = symbol;
      if (space <= 0) break;
    }
  }
  if (used !== 1 && space !== 0) {
    refuse(`has a ${name} code whose code-length code is incomplete or over-subscribed`);
  }
  const codeLengthCode = used === 1 ? singleCode(only) : buildCode(codeLengthLengths);

  // The lengths of the symbols, with the repeat codes 16 and 17.
  const lengths = new Uint8Array(alphabet);
  let symbol = 0;
  let previous = 8;
  let repeat = 0;
  let repeatLength = 0;
  space = 32_768;
  while (symbol < alphabet && space > 0) {
    const code = decodeSymbol(bits, codeLengthCode);
    if (code < REPEAT_PREVIOUS) {
      repeat = 0;
      lengths[symbol] = code;
      symbol += 1;
      if (code !== 0) {
        previous = code;
        space -= 32_768 >> code;
      }
      continue;
    }
    const extraBits = code === REPEAT_PREVIOUS ? 2 : 3;
    const length = code === REPEAT_PREVIOUS ? previous : 0;
    if (repeatLength !== length) {
      repeat = 0;
      repeatLength = length;
    }
    const before = repeat;
    if (repeat > 0) repeat = (repeat - 2) << extraBits;
    repeat += bits.read(extraBits) + 3;
    const added = repeat - before;
    if (symbol + added > alphabet) refuse(`repeats a ${name} code length past its alphabet`);
    lengths.fill(length, symbol, symbol + added);
    symbol += added;
    if (length !== 0) space -= added * (32_768 >> length);
  }
  if (space !== 0) refuse(`has a ${name} code that is incomplete or over-subscribed`);
  return buildCode(lengths);
}

/** RFC 7932, 3.4: one to four symbols with lengths their number implies. */
function readSimpleCode(
  bits: BitReader,
  alphabet: number,
  name: string,
  refuse: Refuse,
): PrefixCode {
  const count = bits.read(2) + 1;
  const width = 32 - Math.clz32(alphabet - 1);
  const symbols: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const symbol = bits.read(width);
    if (symbol >= alphabet)
      refuse(`has a ${name} code with the symbol ${String(symbol)}, past its alphabet`);
    if (symbols.includes(symbol)) refuse(`has a ${name} code that lists a symbol twice`);
    symbols.push(symbol);
  }
  if (count === 1) return singleCode(symbols[0] ?? 0);
  let shape: readonly number[] = [1, 1];
  if (count === 3) shape = [1, 2, 2];
  if (count === 4) shape = bits.read(1) === 1 ? [1, 2, 3, 3] : [2, 2, 2, 2];
  const lengths = new Uint8Array(alphabet);
  symbols.forEach((symbol, index) => {
    lengths[symbol] = shape[index] ?? 0;
  });
  return buildCode(lengths);
}

/** RFC 7932, 9.2: a number from 0 to 255 in 1 to 11 bits. */
function readVarUint8(bits: BitReader): number {
  if (bits.read(1) === 0) return 0;
  const width = bits.read(3);
  return width === 0 ? 1 : (1 << width) + bits.read(width);
}

// --- block switches ---------------------------------------------------------

/** The base block counts and their extra bits (RFC 7932, 6). */
const BLOCK_COUNT_BASE = [
  1, 5, 9, 13, 17, 25, 33, 41, 49, 65, 81, 97, 113, 145, 177, 209, 241, 305, 369, 497, 753, 1265,
  2289, 4337, 8433, 16625,
] as const;
const BLOCK_COUNT_EXTRA = [
  2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 7, 8, 9, 10, 11, 12, 13, 24,
] as const;

/** The block types of one category (literals, commands, or distances) in a meta-block (RFC 7932, 6). */
interface BlockCategory {
  readonly types: number;
  readonly typeCode: PrefixCode | null;
  readonly countCode: PrefixCode | null;
  /** The current block type and the one before it. */
  type: number;
  previous: number;
  /** What is left of the current block. */
  left: number;
}

function readCategory(state: StreamState): BlockCategory {
  const types = readVarUint8(state.bits) + 1;
  if (types < 2) {
    // RFC 7932, 6: a category of one block type has one block of 2^24.
    return { types, typeCode: null, countCode: null, type: 0, previous: 1, left: 16_777_216 };
  }
  const typeCode = readPrefixCode(state, types + 2, 'block type');
  const countCode = readPrefixCode(state, 26, 'block count');
  const left = readBlockCount(state.bits, countCode);
  return { types, typeCode, countCode, type: 0, previous: 1, left };
}

function readBlockCount(bits: BitReader, code: PrefixCode): number {
  const symbol = decodeSymbol(bits, code);
  return (BLOCK_COUNT_BASE[symbol] ?? 0) + bits.read(BLOCK_COUNT_EXTRA[symbol] ?? 0);
}

/** Starts the next block of a category: its type, then its count (RFC 7932, 6). */
function switchBlock(state: StreamState, category: BlockCategory): void {
  if (category.typeCode === null || category.countCode === null) {
    state.refuse('runs past the block of a category with one block type');
  }
  const symbol = decodeSymbol(state.bits, category.typeCode);
  category.left = readBlockCount(state.bits, category.countCode);
  let type = symbol === 0 ? category.previous : symbol === 1 ? category.type + 1 : symbol - 2;
  if (type >= category.types) type -= category.types;
  category.previous = category.type;
  category.type = type;
}

// --- context maps -----------------------------------------------------------

interface ContextMap {
  readonly map: Uint8Array;
  readonly trees: number;
}

/** RFC 7932, 7.3: the prefix code of each context, run-length coded and move-to-front transformed. */
function readContextMap(state: StreamState, size: number): ContextMap {
  const { bits, refuse } = state;
  const trees = readVarUint8(bits) + 1;
  const map = new Uint8Array(size);
  if (trees < 2) return { map, trees };
  const runLengthMax = bits.read(1) === 1 ? bits.read(4) + 1 : 0;
  const code = readPrefixCode(state, trees + runLengthMax, 'context map');
  let index = 0;
  while (index < size) {
    const symbol = decodeSymbol(bits, code);
    if (symbol === 0) {
      index += 1;
    } else if (symbol <= runLengthMax) {
      const zeros = (1 << symbol) + bits.read(symbol);
      if (index + zeros > size) refuse('repeats a context map entry past its contexts');
      index += zeros;
    } else {
      map[index] = symbol - runLengthMax;
      index += 1;
    }
  }
  if (bits.read(1) === 1) {
    // The inverse move-to-front transform (RFC 7932, 7.3).
    const order = Uint8Array.from({ length: 256 }, (_, value) => value);
    for (let at = 0; at < size; at += 1) {
      const position = map[at] ?? 0;
      const value = order[position] ?? 0;
      map[at] = value;
      if (position > 0) {
        order.copyWithin(1, 0, position);
        order[0] = value;
      }
    }
  }
  return { map, trees };
}

// --- literal contexts -------------------------------------------------------

/** Lut0 of RFC 7932, 7.1, for the last byte below 128 in the UTF8 mode. */
const UTF8_LAST = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8,
  12, 16, 12, 12, 20, 12, 16, 24, 28, 12, 12, 32, 12, 36, 12, 44, 44, 44, 44, 44, 44, 44, 44, 44,
  44, 32, 32, 24, 40, 28, 12, 12, 48, 52, 52, 52, 48, 52, 52, 52, 48, 52, 52, 52, 52, 52, 48, 52,
  52, 52, 52, 52, 48, 52, 52, 52, 52, 52, 24, 12, 28, 12, 12, 12, 56, 60, 60, 60, 56, 60, 60, 60,
  56, 60, 60, 60, 60, 60, 56, 60, 60, 60, 60, 60, 56, 60, 60, 60, 60, 60, 24, 12, 28, 12, 0,
] as const;
/** Lut1 of RFC 7932, 7.1, for the byte before the last below 128 in the UTF8 mode. */
const UTF8_BEFORE_LAST = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 0,
] as const;

const LSB6 = 0;
const MSB6 = 1;
const UTF8 = 2;

/** Lut2 of RFC 7932, 7.1: the class of a byte in the signed mode. */
function signedClass(byte: number): number {
  if (byte === 0) return 0;
  if (byte < 16) return 1;
  if (byte < 64) return 2;
  if (byte < 128) return 3;
  if (byte < 192) return 4;
  if (byte < 240) return 5;
  return byte < 255 ? 6 : 7;
}

/** The context of a literal from the last two bytes (RFC 7932, 7.1). */
function literalContext(mode: number, last: number, beforeLast: number): number {
  if (mode === LSB6) return last & 0x3f;
  if (mode === MSB6) return last >> 2;
  if (mode === UTF8) {
    const high = last < 128 ? (UTF8_LAST[last] ?? 0) : last < 192 ? last & 1 : 2 + (last & 1);
    const low = beforeLast < 128 ? (UTF8_BEFORE_LAST[beforeLast] ?? 0) : beforeLast < 224 ? 0 : 2;
    return high | low;
  }
  return (signedClass(last) << 3) | signedClass(beforeLast);
}

// --- commands ---------------------------------------------------------------

/** The base insert lengths and their extra bits (RFC 7932, 5). */
const INSERT_BASE = [
  0, 1, 2, 3, 4, 5, 6, 8, 10, 14, 18, 26, 34, 50, 66, 98, 130, 194, 322, 578, 1090, 2114, 6210,
  22594,
] as const;
const INSERT_EXTRA = [
  0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 12, 14, 24,
] as const;
/** The base copy lengths and their extra bits (RFC 7932, 5). */
const COPY_BASE = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 22, 30, 38, 54, 70, 102, 134, 198, 326, 582, 1094, 2118,
] as const;
const COPY_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 24,
] as const;
/** The first insert and copy codes of each cell of 64 commands (RFC 7932, 5). */
const CELL_INSERT = [0, 0, 0, 0, 8, 8, 0, 16, 8, 16, 16] as const;
const CELL_COPY = [0, 8, 0, 8, 0, 8, 16, 0, 16, 8, 16] as const;
/** The change of a short distance code from 4 to 9 and from 10 to 15 (RFC 7932, 4). */
const SHORT_DELTA = [-1, 1, -2, 2, -3, 3] as const;

const LITERALS = 256;
const COMMANDS = 704;

/** RFC 7932, 9.2 and 9.3: a compressed meta-block of `size` bytes. */
function decodeCompressed(state: StreamState, size: number): void {
  const { bits, output, refuse } = state;
  const literalBlocks = readCategory(state);
  const commandBlocks = readCategory(state);
  const distanceBlocks = readCategory(state);
  const postfixBits = bits.read(2);
  const direct = bits.read(4) << postfixBits;
  const modes = new Uint8Array(literalBlocks.types);
  for (let type = 0; type < modes.length; type += 1) modes[type] = bits.read(2);
  const literalMap = readContextMap(state, literalBlocks.types * 64);
  const distanceMap = readContextMap(state, distanceBlocks.types * 4);
  const literalCodes = Array.from({ length: literalMap.trees }, () =>
    readPrefixCode(state, LITERALS, 'literal'),
  );
  const commandCodes = Array.from({ length: commandBlocks.types }, () =>
    readPrefixCode(state, COMMANDS, 'insert-and-copy'),
  );
  const distanceAlphabet = 16 + direct + (48 << postfixBits);
  const distanceCodes = Array.from({ length: distanceMap.trees }, () =>
    readPrefixCode(state, distanceAlphabet, 'distance'),
  );

  const bytes = output.bytes;
  const distances = state.distances;
  let left = size;
  while (left > 0) {
    if (commandBlocks.left === 0) switchBlock(state, commandBlocks);
    commandBlocks.left -= 1;
    const command = decodeSymbol(bits, commandCodes[commandBlocks.type] ?? singleCode(0));
    const cell = command >> 6;
    const insertCode = (CELL_INSERT[cell] ?? 0) + ((command >> 3) & 7);
    const copyCode = (CELL_COPY[cell] ?? 0) + (command & 7);
    const insert = (INSERT_BASE[insertCode] ?? 0) + bits.read(INSERT_EXTRA[insertCode] ?? 0);
    const copy = (COPY_BASE[copyCode] ?? 0) + bits.read(COPY_EXTRA[copyCode] ?? 0);
    if (insert > left) refuse('inserts more literals than its meta-block holds');

    const literals = room(output, insert);
    for (let index = 0; index < literals; index += 1) {
      if (literalBlocks.left === 0) switchBlock(state, literalBlocks);
      literalBlocks.left -= 1;
      const at = output.written;
      const context = literalContext(
        modes[literalBlocks.type] ?? 0,
        at > 0 ? (bytes[at - 1] ?? 0) : 0,
        at > 1 ? (bytes[at - 2] ?? 0) : 0,
      );
      const tree = literalMap.map[literalBlocks.type * 64 + context] ?? 0;
      bytes[at] = decodeSymbol(bits, literalCodes[tree] ?? singleCode(0));
      output.written = at + 1;
    }
    if (isFull(output)) return;
    left -= insert;
    if (left === 0) return;

    // The distance: the last one for the first two cells, else a distance code (RFC 7932, 4).
    let distance = distances[0] ?? 0;
    let push = false;
    if (cell >= 2) {
      if (distanceBlocks.left === 0) switchBlock(state, distanceBlocks);
      distanceBlocks.left -= 1;
      const context = copy > 4 ? 3 : copy - 2;
      const tree = distanceMap.map[distanceBlocks.type * 4 + context] ?? 0;
      const code = decodeSymbol(bits, distanceCodes[tree] ?? singleCode(0));
      push = code !== 0;
      if (code < 16) {
        const past = code < 4 ? code : code < 10 ? 0 : 1;
        const delta = code < 4 ? 0 : (SHORT_DELTA[(code - 4) % 6] ?? 0);
        distance = (distances[past] ?? 0) + delta;
        if (distance <= 0) refuse('refers to a distance of zero or less');
      } else if (code < 16 + direct) {
        distance = code - 15;
      } else {
        const x = code - direct - 16;
        const extraBits = 1 + (x >> (postfixBits + 1));
        const offset = ((2 + ((x >> postfixBits) & 1)) << extraBits) - 4;
        distance =
          (offset + bits.read(extraBits)) * 2 ** postfixBits +
          (x & ((1 << postfixBits) - 1)) +
          direct +
          1;
      }
    }

    const reach = Math.min(output.written, state.window);
    if (distance > reach) {
      // A word of the dictionary (RFC 7932, 8); its distance is not remembered.
      left -= copyWord(state, copy, distance - reach - 1, left);
      if (isFull(output)) return;
    } else {
      if (copy > left) refuse('copies more bytes than its meta-block holds');
      if (push) {
        distances.unshift(distance);
        distances.length = 4;
      }
      const count = room(output, copy);
      let at = output.written;
      // Byte by byte: a copy may overlap the bytes it writes.
      for (let index = 0; index < count; index += 1) {
        bytes[at] = bytes[at - distance] ?? 0;
        at += 1;
      }
      output.written = at;
      if (isFull(output)) return;
      left -= copy;
    }
  }
}

// --- the dictionary ---------------------------------------------------------

/** NDBITS of RFC 7932, 8: the bits of a word index, by word length (0 to 24). */
const WORD_BITS = [
  0, 0, 0, 0, 10, 10, 11, 11, 10, 10, 10, 10, 10, 9, 9, 8, 7, 7, 8, 7, 7, 6, 6, 5, 5,
] as const;

/** Transform types of RFC 7932, appendix B: 0 identity, 1 to 9 omit the last 1 to 9, 12 to 20 omit the first 1 to 9. */
const UPPERCASE_FIRST = 10;
const UPPERCASE_ALL = 11;

/**
 * The 121 transforms of RFC 7932, appendix B: prefix, type, suffix. The
 * prefix and the suffix are strings of bytes, one character per byte.
 */
const TRANSFORMS: readonly (readonly [string, number, string])[] = [
  ['', 0, ''],
  ['', 0, ' '],
  [' ', 0, ' '],
  ['', 12, ''],
  ['', UPPERCASE_FIRST, ' '],
  ['', 0, ' the '],
  [' ', 0, ''],
  ['s ', 0, ' '],
  ['', 0, ' of '],
  ['', UPPERCASE_FIRST, ''],
  ['', 0, ' and '],
  ['', 13, ''],
  ['', 1, ''],
  [', ', 0, ' '],
  ['', 0, ', '],
  [' ', UPPERCASE_FIRST, ' '],
  ['', 0, ' in '],
  ['', 0, ' to '],
  ['e ', 0, ' '],
  ['', 0, '"'],
  ['', 0, '.'],
  ['', 0, '">'],
  ['', 0, '\n'],
  ['', 3, ''],
  ['', 0, ']'],
  ['', 0, ' for '],
  ['', 14, ''],
  ['', 2, ''],
  ['', 0, ' a '],
  ['', 0, ' that '],
  [' ', UPPERCASE_FIRST, ''],
  ['', 0, '. '],
  ['.', 0, ''],
  [' ', 0, ', '],
  ['', 15, ''],
  ['', 0, ' with '],
  ['', 0, "'"],
  // A template literal: the import check of tests/repo takes this word in quotes for an import.
  ['', 0, ` from `],
  ['', 0, ' by '],
  ['', 16, ''],
  ['', 17, ''],
  [' the ', 0, ''],
  ['', 4, ''],
  ['', 0, '. The '],
  ['', UPPERCASE_ALL, ''],
  ['', 0, ' on '],
  ['', 0, ' as '],
  ['', 0, ' is '],
  ['', 7, ''],
  ['', 1, 'ing '],
  ['', 0, '\n\t'],
  ['', 0, ':'],
  [' ', 0, '. '],
  ['', 0, 'ed '],
  ['', 20, ''],
  ['', 18, ''],
  ['', 6, ''],
  ['', 0, '('],
  ['', UPPERCASE_FIRST, ', '],
  ['', 8, ''],
  ['', 0, ' at '],
  ['', 0, 'ly '],
  [' the ', 0, ' of '],
  ['', 5, ''],
  ['', 9, ''],
  [' ', UPPERCASE_FIRST, ', '],
  ['', UPPERCASE_FIRST, '"'],
  ['.', 0, '('],
  ['', UPPERCASE_ALL, ' '],
  ['', UPPERCASE_FIRST, '">'],
  ['', 0, '="'],
  [' ', 0, '.'],
  ['.com/', 0, ''],
  [' the ', 0, ' of the '],
  ['', UPPERCASE_FIRST, "'"],
  ['', 0, '. This '],
  ['', 0, ','],
  ['.', 0, ' '],
  ['', UPPERCASE_FIRST, '('],
  ['', UPPERCASE_FIRST, '.'],
  ['', 0, ' not '],
  [' ', 0, '="'],
  ['', 0, 'er '],
  [' ', UPPERCASE_ALL, ' '],
  ['', 0, 'al '],
  [' ', UPPERCASE_ALL, ''],
  ['', 0, "='"],
  ['', UPPERCASE_ALL, '"'],
  ['', UPPERCASE_FIRST, '. '],
  [' ', 0, '('],
  ['', 0, 'ful '],
  [' ', UPPERCASE_FIRST, '. '],
  ['', 0, 'ive '],
  ['', 0, 'less '],
  ['', UPPERCASE_ALL, "'"],
  ['', 0, 'est '],
  [' ', UPPERCASE_FIRST, '.'],
  ['', UPPERCASE_ALL, '">'],
  [' ', 0, "='"],
  ['', UPPERCASE_FIRST, ','],
  ['', 0, 'ize '],
  ['', UPPERCASE_ALL, '.'],
  ['Â ', 0, ''],
  [' ', 0, ','],
  ['', UPPERCASE_FIRST, '="'],
  ['', UPPERCASE_ALL, '="'],
  ['', 0, 'ous '],
  ['', UPPERCASE_ALL, ', '],
  ['', UPPERCASE_FIRST, "='"],
  [' ', UPPERCASE_FIRST, ','],
  [' ', UPPERCASE_ALL, '="'],
  [' ', UPPERCASE_ALL, ', '],
  ['', UPPERCASE_ALL, ','],
  ['', UPPERCASE_ALL, '('],
  ['', UPPERCASE_ALL, '. '],
  [' ', UPPERCASE_ALL, '.'],
  ['', UPPERCASE_ALL, "='"],
  [' ', UPPERCASE_ALL, '. '],
  [' ', UPPERCASE_FIRST, '="'],
  [' ', UPPERCASE_ALL, "='"],
  [' ', UPPERCASE_FIRST, "='"],
];

/** The dictionary, expanded from its zlib stream for the call that needs it (D84.1). */
function dictionaryOf(state: StreamState): Uint8Array {
  state.dictionary ??= inflateStream(
    base64Bytes(DICTIONARY_ZLIB),
    DICTIONARY_LENGTH,
    'the zlib stream of the Brotli dictionary',
  );
  return state.dictionary;
}

/**
 * Writes the word `id` of the given length, transformed (RFC 7932, 8), and
 * returns how many bytes it counts in the meta-block.
 */
function copyWord(state: StreamState, length: number, id: number, left: number): number {
  const { output, refuse } = state;
  const wordBits = WORD_BITS[length] ?? 0;
  if (length > 24 || wordBits === 0) {
    refuse(`refers to the dictionary with a length of ${String(length)}, which has no word`);
  }
  const transform =
    TRANSFORMS[Math.floor(id / 2 ** wordBits)] ??
    refuse('refers to a transform of the dictionary past the 121 of RFC 7932');
  let start = 0;
  for (let shorter = 4; shorter < length; shorter += 1) {
    start += shorter * 2 ** (WORD_BITS[shorter] ?? 0);
  }
  start += (id % 2 ** wordBits) * length;
  const [prefix, type, suffix] = transform;
  const word = Array.from(dictionaryOf(state).subarray(start, start + length));
  if (type >= 1 && type <= 9) word.length = Math.max(0, word.length - type);
  if (type >= 12) word.splice(0, Math.min(word.length, type - 11));
  if (type === UPPERCASE_FIRST && word.length > 0) uppercase(word, 0);
  if (type === UPPERCASE_ALL) for (let at = 0; at < word.length;) at += uppercase(word, at);
  const piece = [
    ...Array.from(prefix, (char) => char.charCodeAt(0)),
    ...word,
    ...Array.from(suffix, (char) => char.charCodeAt(0)),
  ];
  if (piece.length > left) refuse('copies more bytes than its meta-block holds');
  const count = room(output, piece.length);
  output.bytes.set(piece.slice(0, count), output.written);
  output.written += count;
  return piece.length;
}

/** The uppercasing of RFC 7932, 8: one UTF-8 sequence at `at`; returns its length. */
function uppercase(word: number[], at: number): number {
  const byte = word[at] ?? 0;
  if (byte < 192) {
    if (byte >= 97 && byte <= 122) word[at] = byte ^ 32;
    return 1;
  }
  if (byte < 224) {
    if (at + 1 < word.length) word[at + 1] = (word[at + 1] ?? 0) ^ 32;
    return 2;
  }
  if (at + 2 < word.length) word[at + 2] = (word[at + 2] ?? 0) ^ 5;
  return 3;
}

/** Decodes base64 (RFC 4648, 4) without a platform API (D24). */
function base64Bytes(text: string): Uint8Array {
  const valueOf = (code: number): number => {
    if (code >= 65 && code <= 90) return code - 65; // A-Z
    if (code >= 97 && code <= 122) return code - 71; // a-z
    if (code >= 48 && code <= 57) return code + 4; // 0-9
    return code === 43 ? 62 : 63; // + and /
  };
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 61) end -= 1; // =
  const bytes = new Uint8Array(Math.floor((end * 3) / 4));
  let buffer = 0;
  let count = 0;
  let at = 0;
  for (let index = 0; index < end; index += 1) {
    buffer = (buffer << 6) | valueOf(text.charCodeAt(index));
    count += 6;
    if (count >= 8) {
      count -= 8;
      bytes[at] = (buffer >> count) & 0xff;
      at += 1;
      buffer &= (1 << count) - 1;
    }
  }
  return bytes;
}
