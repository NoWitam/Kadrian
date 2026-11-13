/**
 * Generates `packages/runtime/src/brotli-dictionary.ts`, the static dictionary
 * of Brotli (RFC 7932, section 8 and appendix A) that `brotliDecode` needs
 * (D84.1, PR-71). It is run by hand, never by the build or the tests:
 *
 *   node --experimental-strip-types packages/runtime/scripts/brotli-dictionary.ts
 *
 * The dictionary is derived from the Brotli of Node itself, so no file is
 * downloaded: for every word length from 4 to 24 and every index of a word of
 * that length, a stream whose only command copies that word from the
 * dictionary with the identity transform is decoded by
 * `zlib.brotliDecompressSync`. The words, in the order of their lengths and
 * indices, are the dictionary. The module stores it as the base64 text of its
 * zlib stream (RFC 1950), with its length, its SHA-256, and the licence
 * record of D84.8 in its header. The tests derive it again and compare.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, deflateSync } from 'node:zlib';

/** NDBITS of RFC 7932, section 8: the bits of a word index, by word length (0 to 24). */
export const DICTIONARY_WORD_BITS = [
  0, 0, 0, 0, 10, 10, 11, 11, 10, 10, 10, 10, 10, 9, 9, 8, 7, 7, 8, 7, 7, 6, 6, 5, 5,
] as const;

export const SHORTEST_WORD = 4;
export const LONGEST_WORD = 24;

/** The base copy lengths and their extra bits of copy codes 0 to 23 (RFC 7932, section 5). */
const COPY_BASE = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 22, 30, 38, 54, 70, 102, 134, 198, 326, 582, 1094, 2118,
] as const;
const COPY_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 24,
] as const;

/** Bits written from the least significant end of each byte, as RFC 7932 reads them. */
export class BitWriter {
  private readonly bytes: number[] = [];
  private bitCount = 0;

  /** Writes the `count` low bits of `value`, its bit 0 first. */
  bits(value: number, count: number): this {
    for (let bit = 0; bit < count; bit += 1) {
      const index = this.bitCount >> 3;
      if (index === this.bytes.length) this.bytes.push(0);
      if (Math.floor(value / 2 ** bit) % 2 === 1) {
        this.bytes[index] = (this.bytes[index] ?? 0) | (1 << (this.bitCount & 7));
      }
      this.bitCount += 1;
    }
    return this;
  }

  /** Writes a prefix code of RFC 7932 bit by bit, its first bit first. */
  code(code: number, length: number): this {
    for (let bit = length - 1; bit >= 0; bit -= 1) this.bits((code >> bit) & 1, 1);
    return this;
  }

  /** Pads the last byte with zero bits. */
  align(): this {
    this.bitCount = this.bytes.length * 8;
    return this;
  }

  /** Appends whole bytes after a byte boundary. */
  raw(bytes: Uint8Array): this {
    this.align();
    for (const byte of bytes) this.bytes.push(byte);
    this.bitCount = this.bytes.length * 8;
    return this;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** The copy code of a copy length, with its extra bits. */
export function copyCode(length: number): { readonly code: number; readonly extra: number } {
  for (let code = COPY_BASE.length - 1; code >= 0; code -= 1) {
    const base = COPY_BASE[code] ?? 0;
    if (length >= base) return { code, extra: length - base };
  }
  throw new RangeError(`No copy code holds the length ${String(length)}.`);
}

/**
 * The distance code and the extra bits of a distance, with NPOSTFIX and
 * NDIRECT 0 (RFC 7932, section 4).
 */
export function distanceCode(distance: number): {
  readonly code: number;
  readonly extra: number;
  readonly bits: number;
} {
  for (let x = 0; x < 48; x += 1) {
    const bits = 1 + (x >> 1);
    const offset = ((2 + (x & 1)) << bits) - 4;
    if (distance - 1 >= offset && distance - 1 < offset + 2 ** bits) {
      return { code: 16 + x, extra: distance - 1 - offset, bits };
    }
  }
  throw new RangeError(`No distance code holds the distance ${String(distance)}.`);
}

/**
 * A stream whose one meta-block holds one command: no literal, then a copy of
 * `length` bytes from the distance `distance`, which past the bytes written
 * so far refers to the dictionary (RFC 7932, sections 8 and 9). Every prefix
 * code is a simple code of one symbol, so it costs no bit.
 */
export function oneCopyStream(length: number, distance: number, output = length): Uint8Array {
  const copy = copyCode(length);
  const cell = copy.code < 8 ? 2 : 3; // insert code 0; copy codes 0 to 7, or 8 to 15
  const command = cell * 64 + (copy.code & 7);
  const reach = distanceCode(distance);
  const writer = new BitWriter()
    .bits(0, 1) // WBITS 16
    .bits(1, 1) // ISLAST
    .bits(0, 1) // ISLASTEMPTY
    .bits(0, 2) // MNIBBLES 4
    .bits(output - 1, 16) // MLEN - 1
    .bits(0, 3) // NBLTYPESL, NBLTYPESI, NBLTYPESD: 1 each
    .bits(0, 2) // NPOSTFIX
    .bits(0, 4) // NDIRECT
    .bits(0, 2) // the context mode of the one literal block type
    .bits(0, 2) // NTREESL, NTREESD: 1 each
    .bits(1, 2) // literals: a simple code
    .bits(0, 2) // of one symbol
    .bits(0, 8)
    .bits(1, 2) // insert and copy lengths: a simple code
    .bits(0, 2) // of one symbol
    .bits(command, 10)
    .bits(1, 2) // distances: a simple code
    .bits(0, 2) // of one symbol
    .bits(reach.code, 6)
    .bits(copy.extra, COPY_EXTRA[copy.code] ?? 0)
    .bits(reach.extra, reach.bits);
  return writer.align().toBytes();
}

/** The offset of the first word of each length in the dictionary (RFC 7932, section 8). */
export function wordOffsets(): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (let length = 0; length <= LONGEST_WORD + 1; length += 1) {
    offsets.push(offset);
    const bits = DICTIONARY_WORD_BITS[length] ?? 0;
    if (length >= SHORTEST_WORD && bits > 0) offset += length * 2 ** bits;
  }
  return offsets;
}

/** The dictionary, word by word, as Node's Brotli yields it. */
export function deriveDictionary(): Uint8Array {
  const offsets = wordOffsets();
  const dictionary = new Uint8Array(offsets[LONGEST_WORD + 1] ?? 0);
  for (let length = SHORTEST_WORD; length <= LONGEST_WORD; length += 1) {
    const words = 2 ** (DICTIONARY_WORD_BITS[length] ?? 0);
    for (let index = 0; index < words; index += 1) {
      // Nothing is written before the copy, so its word id is `distance - 1`.
      const word = brotliDecompressSync(oneCopyStream(length, index + 1));
      if (word.length !== length) {
        throw new Error(
          `Node's Brotli gave ${String(word.length)} bytes for the word ${String(index)} of length ${String(length)}.`,
        );
      }
      dictionary.set(word, (offsets[length] ?? 0) + index * length);
    }
  }
  return dictionary;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The source text of the generated module. */
export function dictionaryModule(dictionary: Uint8Array): string {
  const deflated = Buffer.from(deflateSync(dictionary, { level: 9 })).toString('base64');
  return `/**
 * The static dictionary of Brotli (RFC 7932, section 8 and appendix A), which
 * \`brotliDecode\` expands with \`inflate\` when a stream first refers to it,
 * once per call (D84.1, D84.8). Generated by
 * \`packages/runtime/scripts/brotli-dictionary.ts\`, which derives it from the
 * Brotli of Node; do not edit. \`DICTIONARY_ZLIB\` is the base64 text of the
 * zlib stream (RFC 1950) of the ${String(dictionary.length)} bytes of the dictionary.
 *
 * Source: the Brotli project of Google, https://github.com/google/brotli,
 * reproduced in RFC 7932, appendix A. Licence record (D37, D84.8):
 *
 * Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
export const DICTIONARY_LENGTH = ${String(dictionary.length)};

export const DICTIONARY_SHA256 = '${sha256(dictionary)}';

export const DICTIONARY_ZLIB =
  '${deflated}';
`;
}

function main(): void {
  const dictionary = deriveDictionary();
  const target = fileURLToPath(new URL('../src/brotli-dictionary.ts', import.meta.url));
  const source = dictionaryModule(dictionary);
  writeFileSync(target, source);
  process.stdout.write(
    `${target}: ${String(dictionary.length)} bytes, sha256:${sha256(dictionary)}, ${String(source.length)} characters\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
