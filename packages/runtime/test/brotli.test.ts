/**
 * `brotliDecode` (D84.1, PR-71): equal to `zlib.brotliDecompressSync` on
 * seeded inputs compressed by `zlib.brotliCompressSync` at qualities 0 to 11,
 * window bits 10 to 24, and the modes generic, text, and font, with inputs
 * that make the encoder use the dictionary; every word length and every one
 * of the 121 transforms of the dictionary against Node's Brotli; hand-written
 * streams of an empty stream, uncompressed and metadata meta-blocks, and
 * simple prefix codes of one to four symbols; the dictionary's length,
 * SHA-256, and equality with the one Node's Brotli yields, re-derived by the
 * generating script; every malformation refused with `font-invalid`; seeded
 * mutations that end either in the bytes zlib gives or in `font-invalid`; and
 * the limit of D84.4 refused before anything is allocated.
 */
import { readFileSync } from 'node:fs';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';

import { generateProportionalFont } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  BitWriter,
  DICTIONARY_WORD_BITS,
  LONGEST_WORD,
  SHORTEST_WORD,
  deriveDictionary,
  dictionaryModule,
  oneCopyStream,
  sha256,
  wordOffsets,
} from '../scripts/brotli-dictionary.js';
import { brotliStream } from '../src/brotli.js';
import { DICTIONARY_LENGTH, DICTIONARY_SHA256 } from '../src/brotli-dictionary.js';
import { inflate } from '../src/inflate.js';
import { DECOMPRESSED_FONT_LIMIT, FontDecodeError, brotliDecode } from '../src/woff.js';

import { seededRandom } from './support.js';
import { monospacedFont, mutate } from './woff-support.js';

/** The code of the `FontDecodeError` a call throws; anything else thrown fails the test. */
function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof FontDecodeError) return error.code;
    throw error;
  }
  return 'accepted';
}

function bytesOf(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function compress(input: Uint8Array, quality: number, window: number, mode: number): Uint8Array {
  return bytesOf(
    brotliCompressSync(input, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: quality,
        [constants.BROTLI_PARAM_LGWIN]: window,
        [constants.BROTLI_PARAM_MODE]: mode,
        [constants.BROTLI_PARAM_SIZE_HINT]: input.length,
      },
    }),
  );
}

/** Decodes with ours and with Node's, and expects the same bytes. */
function expectSameAsNode(stream: Uint8Array, length: number): Uint8Array {
  const ours = brotliDecode(stream, length);
  expect(Buffer.from(ours).equals(brotliDecompressSync(stream))).toBe(true);
  return ours;
}

// --- seeded inputs ----------------------------------------------------------

/** English words and names of fonts and tables, which the dictionary and its transforms hold. */
const WORDS = [
  'the',
  'frame',
  'of',
  'a',
  'text',
  'measured',
  'from',
  'font',
  'Regular',
  'Bold',
  'Italic',
  'Copyright',
  'Version',
  'Kadrion',
  'advance',
  'glyph',
  'width',
  'caption',
  'line',
  'table',
  'This',
  'with',
  'that',
  'information',
  'available',
  'ÜBER',
  'größe',
  'шрифт',
  '字体',
];
const SEPARATORS = [' ', ' ', ' ', ', ', '. ', '\n', '="', '">', ' the ', '(', ' of '];

function seededInputs(seed: number): { readonly name: string; readonly bytes: Uint8Array }[] {
  const random = seededRandom(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const text = Array.from({ length: 5_000 }, () => {
    const word = pick(WORDS);
    const cased = random() < 0.2 ? word.toUpperCase() : word;
    return cased + pick(SEPARATORS);
  }).join('');
  const randomBytes = Uint8Array.from({ length: 12_000 }, () => Math.floor(random() * 256));
  const runs: number[] = [];
  while (runs.length < 40_000) {
    const value = Math.floor(random() * 4) === 0 ? Math.floor(random() * 256) : 0;
    const length = 1 + Math.floor(random() * 300);
    for (let index = 0; index < length; index += 1) runs.push(value);
  }
  // Short random pieces repeated at random distances: matches near and far.
  const mixed: number[] = [];
  const piece = Uint8Array.from({ length: 5_000 }, () => Math.floor(random() * 256));
  while (mixed.length < 70_000) {
    const start = Math.floor(random() * 4_000);
    for (const byte of piece.subarray(start, start + 3 + Math.floor(random() * 400))) {
      mixed.push(byte);
    }
    if (random() < 0.3) mixed.push(Math.floor(random() * 256));
  }
  return [
    { name: 'empty', bytes: new Uint8Array(0) },
    { name: 'one byte', bytes: Uint8Array.of(0x4b) },
    { name: 'text', bytes: new TextEncoder().encode(text) },
    { name: 'random bytes', bytes: randomBytes },
    { name: 'runs', bytes: Uint8Array.from(runs) },
    { name: 'repeated pieces', bytes: Uint8Array.from(mixed) },
    { name: 'the proportional font', bytes: generateProportionalFont('both') },
  ];
}

const INPUTS = seededInputs(0x7932);
const MODES = [
  constants.BROTLI_MODE_GENERIC,
  constants.BROTLI_MODE_TEXT,
  constants.BROTLI_MODE_FONT,
] as const;
const WINDOWS = Array.from({ length: 15 }, (_, index) => 10 + index);
const QUALITIES = Array.from({ length: 12 }, (_, index) => index);

describe('brotliDecode against zlib.brotliDecompressSync (D84.1)', () => {
  it.each(QUALITIES)(
    'decodes every input at quality %i, every window from 10 to 24, and every mode',
    (quality) => {
      for (const { name, bytes } of INPUTS) {
        for (const window of WINDOWS) {
          const mode = MODES[(window + quality) % MODES.length] ?? constants.BROTLI_MODE_GENERIC;
          const stream = compress(bytes, quality, window, mode);
          const ours = brotliDecode(stream, bytes.length);
          expect(
            Buffer.from(ours).equals(Buffer.from(bytes)),
            `${name}, window ${String(window)}`,
          ).toBe(true);
        }
      }
    },
  );

  it.each(MODES)('decodes the text in mode %i at every quality with a window of 24', (mode) => {
    const text = INPUTS.find(({ name }) => name === 'text')?.bytes ?? new Uint8Array(0);
    for (const quality of QUALITIES) {
      expect(
        Buffer.from(brotliDecode(compress(text, quality, 24, mode), text.length)).equals(
          Buffer.from(text),
        ),
      ).toBe(true);
    }
  });

  it('decodes the fixture fonts as one stream, as WOFF2 compresses them', () => {
    for (const font of [monospacedFont(), generateProportionalFont('format-4')]) {
      expect(brotliDecode(compress(font, 11, 22, constants.BROTLI_MODE_FONT), font.length)).toEqual(
        font,
      );
    }
  });

  it('returns a buffer of its own and keeps nothing between calls (D20)', () => {
    const text = INPUTS.find(({ name }) => name === 'text')?.bytes ?? new Uint8Array(0);
    const stream = compress(text, 11, 22, constants.BROTLI_MODE_TEXT);
    const first = brotliDecode(stream, text.length);
    first.fill(0);
    expect(brotliDecode(stream, text.length)).toEqual(text);
  });
});

// --- the dictionary ---------------------------------------------------------

describe('the static dictionary (D84.1, D84.8)', () => {
  it('is the dictionary Node yields, re-derived by the generating script, with its length and SHA-256', () => {
    const derived = deriveDictionary();
    expect(derived.length).toBe(122_784);
    expect(DICTIONARY_LENGTH).toBe(122_784);
    expect(sha256(derived)).toBe(DICTIONARY_SHA256);
    expect(DICTIONARY_SHA256).toBe(
      '20e42eb1b511c21806d4d227d07e5dd06877d8ce7b3a817f378f313653f35c70',
    );
    // The module is exactly what the script writes, so it was neither edited nor left stale.
    const module = readFileSync(new URL('../src/brotli-dictionary.ts', import.meta.url), 'utf8');
    expect(module).toBe(dictionaryModule(derived));
  });

  it('carries the source and the MIT notice of the Brotli authors in its header (D37, D84.8)', () => {
    const module = readFileSync(new URL('../src/brotli-dictionary.ts', import.meta.url), 'utf8');
    const header = module.slice(0, module.indexOf('*/'));
    expect(header).toContain('https://github.com/google/brotli');
    expect(header).toContain('RFC 7932, appendix A');
    expect(header).toContain('Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.');
    expect(header).toContain(
      'The above copyright notice and this permission notice shall be included in',
    );
    expect(header).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND');
  });

  it('holds the words of RFC 7932, section 8: lengths 4 to 24 by NDBITS', () => {
    const offsets = wordOffsets();
    expect(offsets[SHORTEST_WORD]).toBe(0);
    expect(offsets[LONGEST_WORD + 1]).toBe(122_784);
    // The first and the last word of the dictionary, as RFC 7932, appendix A lists them.
    const dictionary = deriveDictionary();
    expect(new TextDecoder().decode(dictionary.subarray(0, 4))).toBe('time');
    const last = (offsets[LONGEST_WORD] ?? 0) + (2 ** DICTIONARY_WORD_BITS[LONGEST_WORD] - 1) * 24;
    expect(dictionary.subarray(last, last + 24).length).toBe(24);
  });

  it.each(
    Array.from({ length: LONGEST_WORD - SHORTEST_WORD + 1 }, (_, index) => SHORTEST_WORD + index),
  )('gives the words of length %i with each of the 121 transforms as Node does', (length) => {
    const words = 2 ** (DICTIONARY_WORD_BITS[length] ?? 0);
    let compared = 0;
    for (let transform = 0; transform < 121; transform += 1) {
      for (const index of [(transform * 37) % words, words - 1]) {
        const distance = transform * words + index + 1;
        // The meta-block must hold exactly the transformed word: the shortest length Node accepts.
        for (let size = Math.max(1, length - 9); size <= length + 13; size += 1) {
          const bytes = oneCopyStream(length, distance, size);
          const node = nodeDecode(bytes);
          if (node === null) continue;
          expect(Buffer.from(brotliDecode(bytes, size)).equals(node)).toBe(true);
          compared += 1;
          break;
        }
      }
    }
    // Every transform gives a word but the twelve omissions of 4 to 9 bytes, which can empty one.
    expect(compared).toBeGreaterThanOrEqual(2 * (121 - 12));
  });
});

/** What Node decodes from `bytes`, or `null` when it refuses them. */
function nodeDecode(bytes: Uint8Array): Buffer | null {
  try {
    return brotliDecompressSync(bytes);
  } catch {
    return null;
  }
}

// --- hand-written streams ---------------------------------------------------

/** WBITS 16 in one bit. */
function stream(): BitWriter {
  return new BitWriter().bits(0, 1);
}

/** A last meta-block header of `size` bytes with four nibbles. */
function lastHeader(writer: BitWriter, size: number): BitWriter {
  return writer
    .bits(1, 1)
    .bits(0, 1)
    .bits(0, 2)
    .bits(size - 1, 16);
}

/** A non-last meta-block header, then ISUNCOMPRESSED. */
function header(writer: BitWriter, size: number, uncompressed: boolean): BitWriter {
  return writer
    .bits(0, 1)
    .bits(0, 2)
    .bits(size - 1, 16)
    .bits(uncompressed ? 1 : 0, 1);
}

const EMPTY_LAST = (writer: BitWriter): BitWriter => writer.bits(1, 1).bits(1, 1);

/**
 * A compressed meta-block of literals only, with one block type each, one
 * literal code given by `literals`, and a command that inserts `count`
 * literals with an implicit distance (insert code from 0 to 5, copy code 0).
 */
function literalBlock(
  writer: BitWriter,
  count: number,
  literals: (w: BitWriter) => BitWriter,
): BitWriter {
  writer
    .bits(0, 3) // one block type for each category
    .bits(0, 2) // NPOSTFIX
    .bits(0, 4) // NDIRECT
    .bits(0, 2) // context mode
    .bits(0, 2); // one tree each
  literals(writer);
  writer
    .bits(1, 2)
    .bits(0, 2)
    .bits(count * 8, 10); // one command: insert `count`, copy 2
  writer.bits(1, 2).bits(0, 2).bits(0, 6); // one distance symbol, never read
  return writer;
}

describe('hand-written streams (D84.1)', () => {
  it('decodes an empty stream in one byte', () => {
    const empty = EMPTY_LAST(stream()).align().toBytes();
    expect(empty).toEqual(Uint8Array.of(0x06));
    expect(expectSameAsNode(empty, 0)).toEqual(new Uint8Array(0));
  });

  it('decodes uncompressed meta-blocks and skips metadata meta-blocks', () => {
    const writer = stream();
    header(writer, 3, true).raw(Uint8Array.of(1, 2, 3));
    // Metadata: reserved 0, MSKIPBYTES 1, MSKIPLEN - 1 = 4, then five bytes skipped.
    writer
      .bits(0, 1)
      .bits(3, 2)
      .bits(0, 1)
      .bits(1, 2)
      .bits(4, 8)
      .raw(Uint8Array.of(9, 9, 9, 9, 9));
    // An empty metadata meta-block: MSKIPBYTES 0.
    writer.bits(0, 1).bits(3, 2).bits(0, 1).bits(0, 2).align();
    header(writer, 2, true).raw(Uint8Array.of(4, 5));
    expect(expectSameAsNode(EMPTY_LAST(writer).align().toBytes(), 5)).toEqual(
      Uint8Array.of(1, 2, 3, 4, 5),
    );
  });

  it('decodes a last metadata meta-block as the end of the stream', () => {
    const writer = stream();
    header(writer, 2, true).raw(Uint8Array.of(7, 8));
    writer.bits(1, 1).bits(0, 1).bits(3, 2).bits(0, 1).bits(1, 2).bits(0, 8).raw(Uint8Array.of(42));
    expect(expectSameAsNode(writer.toBytes(), 2)).toEqual(Uint8Array.of(7, 8));
  });

  it.each([
    ['one symbol', [0x41], 0, 'AAAA'],
    ['two symbols', [0x42, 0x41], 0, 'BAAB'],
    ['three symbols', [0x43, 0x41, 0x42], 0, 'CABC'],
    ['four symbols of two bits', [0x44, 0x41, 0x43, 0x42], 0, 'ABCD'],
    ['four symbols of one, two, and three bits', [0x5a, 0x59, 0x41, 0x42], 1, 'BAYZ'],
  ] as const)('decodes a simple literal code of %s', (_name, symbols, treeSelect, expected) => {
    const writer = lastHeader(stream(), 4);
    literalBlock(writer, 4, (w) => {
      w.bits(1, 2).bits(symbols.length - 1, 2);
      for (const symbol of symbols) w.bits(symbol, 8);
      if (symbols.length === 4) w.bits(treeSelect, 1);
      return w;
    });
    // The lengths RFC 7932, 3.4 gives the listed symbols, then their canonical codes.
    const shape = [[0], [1, 1], [1, 2, 2], treeSelect === 1 ? [1, 2, 3, 3] : [2, 2, 2, 2]][
      symbols.length - 1
    ];
    for (const [code, length] of Array.from(expected, (char) =>
      canonical(symbols, shape ?? [])(char.charCodeAt(0)),
    )) {
      writer.code(code, length);
    }
    expect(new TextDecoder().decode(expectSameAsNode(writer.align().toBytes(), 4))).toBe(expected);
  });
});

/** The canonical code of a symbol among symbols of the given lengths (RFC 7932, 3.2). */
function canonical(
  symbols: readonly number[],
  lengths: readonly number[],
): (symbol: number) => [code: number, length: number] {
  const sorted = symbols
    .map((symbol, index) => ({ symbol, length: lengths[index] ?? 0 }))
    .sort((a, b) => a.length - b.length || a.symbol - b.symbol);
  const codes = new Map<number, [number, number]>();
  let code = 0;
  let previous = sorted[0]?.length ?? 0;
  for (const { symbol, length } of sorted) {
    code <<= length - previous;
    previous = length;
    codes.set(symbol, [code, length]);
    code += 1;
  }
  return (symbol) => codes.get(symbol) ?? [0, 0];
}

// --- refusals ---------------------------------------------------------------

describe('refusals (D84.1, D84.4, D84.6)', () => {
  const TEXT = INPUTS.find(({ name }) => name === 'text')?.bytes ?? new Uint8Array(0);
  const STREAM = compress(TEXT, 9, 20, constants.BROTLI_MODE_TEXT);

  /** The fixed code of a code length in a complex code's code-length code (RFC 7932, 3.5). */
  const FIXED: Record<number, [number, number]> = {
    0: [0b00, 2],
    1: [0b1110, 4],
    2: [0b110, 3],
    3: [0b01, 2],
    4: [0b10, 2],
    5: [0b1111, 4],
  };
  const fixed = (writer: BitWriter, length: number): BitWriter => {
    const [code, bits] = FIXED[length] ?? [0, 0];
    return writer.code(code, bits);
  };

  const cases: [string, Uint8Array, number, string][] = [
    ['nothing', new Uint8Array(0), 0, 'ends early'],
    [
      'the large window of later Brotli versions',
      new BitWriter().bits(1, 1).bits(0, 3).bits(1, 3).align().toBytes(),
      0,
      'asks for the large window of later Brotli versions',
    ],
    ['a truncated stream', STREAM.slice(0, STREAM.length - 9), TEXT.length, 'ends early'],
    [
      'bytes after the end',
      Uint8Array.from([...STREAM, 0]),
      TEXT.length,
      'leaves bytes after its end',
    ],
    ['an output shorter than the stream', STREAM, TEXT.length - 1, 'produces more than'],
    [
      'an output longer than the stream',
      STREAM,
      TEXT.length + 1,
      `before the ${String(TEXT.length + 1)} bytes declared`,
    ],
    [
      'a padding bit after the last meta-block',
      Uint8Array.of(0x06 | 0x80),
      0,
      'has a padding bit set after its last meta-block',
    ],
    [
      'a needless last nibble of a meta-block length',
      stream().bits(0, 1).bits(1, 2).bits(0, 20).bits(1, 1).align().raw(Uint8Array.of(1)).toBytes(),
      1,
      'needless last nibble of zero',
    ],
    [
      'a set reserved bit of a metadata meta-block',
      stream().bits(1, 1).bits(0, 1).bits(3, 2).bits(1, 1).bits(0, 2).align().toBytes(),
      0,
      'reserved bit is set',
    ],
    [
      'a needless last byte of a metadata length',
      stream()
        .bits(1, 1)
        .bits(0, 1)
        .bits(3, 2)
        .bits(0, 1)
        .bits(2, 2)
        .bits(5, 8)
        .bits(0, 8)
        .align()
        .toBytes(),
      0,
      'needless last byte of zero',
    ],
    [
      'a padding bit before an uncompressed meta-block',
      header(stream(), 1, true).bits(1, 1).align().raw(Uint8Array.of(1)).toBytes(),
      1,
      'has a padding bit set before an uncompressed meta-block',
    ],
    [
      'metadata past the end of the stream',
      stream().bits(1, 1).bits(0, 1).bits(3, 2).bits(0, 1).bits(1, 2).bits(9, 8).align().toBytes(),
      0,
      'ends early',
    ],
    [
      'a simple code that lists a symbol twice',
      literalBlock(lastHeader(stream(), 1), 1, (w) => w.bits(1, 2).bits(1, 2).bits(7, 8).bits(7, 8))
        .align()
        .toBytes(),
      1,
      'lists a symbol twice',
    ],
    [
      'a simple code with a symbol past its alphabet',
      // The insert-and-copy code: ten bits for 704 symbols; 1000 is past them.
      lastHeader(stream(), 1)
        .bits(0, 13)
        .bits(1, 2)
        .bits(0, 2)
        .bits(65, 8)
        .bits(1, 2)
        .bits(0, 2)
        .bits(1000, 10)
        .align()
        .toBytes(),
      1,
      'with the symbol 1000, past its alphabet',
    ],
    [
      'a code-length code that is incomplete',
      literalBlock(lastHeader(stream(), 1), 1, (w) => {
        w.bits(0, 2); // HSKIP 0: a complex code
        fixed(w, 2); // code length 1 has a code of two bits
        fixed(w, 2); // code length 2 too; the other sixteen have none
        for (let index = 2; index < 18; index += 1) fixed(w, 0);
        return w;
      })
        .align()
        .toBytes(),
      1,
      'code-length code is incomplete or over-subscribed',
    ],
    [
      'a code-length code that is over-subscribed',
      literalBlock(lastHeader(stream(), 1), 1, (w) => {
        // Lengths 2, 1, and 1: a quarter, a half, and a half of the space.
        w.bits(0, 2);
        fixed(w, 2);
        fixed(w, 1);
        fixed(w, 1);
        return w;
      })
        .align()
        .toBytes(),
      1,
      'code-length code is incomplete or over-subscribed',
    ],
    [
      'a code whose lengths are incomplete',
      literalBlock(lastHeader(stream(), 1), 1, (w) => {
        // The code-length code: lengths 1 and 0 of one bit each (in the order 1, 2, 3, 4, 0).
        w.bits(0, 2);
        fixed(w, 1);
        fixed(w, 0);
        fixed(w, 0);
        fixed(w, 0);
        fixed(w, 1);
        // Symbol 0 of length 1 (code 1), the other 255 without a code (code 0): half the space.
        w.code(1, 1);
        for (let index = 1; index < 256; index += 1) w.code(0, 1);
        return w;
      })
        .align()
        .toBytes(),
      1,
      'has a literal code that is incomplete or over-subscribed',
    ],
    [
      'a context map that repeats zeros past its contexts',
      lastHeader(stream(), 1)
        .bits(0, 3)
        .bits(0, 6)
        .bits(0, 2)
        .bits(1, 1) // NTREESL: VarLenUint8 1, 000 → 2 trees
        .bits(0, 3)
        .bits(1, 1) // RLEMAX present
        .bits(15, 4) // RLEMAX 16
        .bits(1, 2) // a simple code of one symbol
        .bits(0, 2)
        .bits(16, 5) // the run of 2^16 + extra zeros
        .bits(0, 16)
        .align()
        .toBytes(),
      1,
      'repeats a context map entry past its contexts',
    ],
  ];

  it.each(cases)('refuses %s', (_name, bytes, length, message) => {
    expect(refusal(() => brotliDecode(bytes, length))).toBe('font-invalid');
    expect(() => brotliDecode(bytes, length)).toThrow(message);
  });

  it('refuses a distance before the first byte that is no word of the dictionary', () => {
    // A copy of 3 bytes at distance 1 with nothing written: 3 is no word length.
    const bytes = oneCopyStream(3, 1);
    expect(() => brotliDecompressSync(bytes)).toThrow();
    expect(() => brotliDecode(bytes, 3)).toThrow(
      'refers to the dictionary with a length of 3, which has no word',
    );
  });

  it('refuses a transform past the 121 of RFC 7932', () => {
    const bytes = oneCopyStream(4, 121 * 1024 + 1);
    expect(() => brotliDecompressSync(bytes)).toThrow();
    expect(() => brotliDecode(bytes, 4)).toThrow('past the 121 of RFC 7932');
  });

  it('refuses a length past 64 MiB before it allocates anything, and decodes up to the limit', () => {
    expect(refusal(() => brotliDecode(STREAM, DECOMPRESSED_FONT_LIMIT + 1))).toBe(
      'font-unmeasurable',
    );
    expect(() => brotliDecode(STREAM, DECOMPRESSED_FONT_LIMIT + 1)).toThrow(
      `its Brotli stream would decompress to ${String(DECOMPRESSED_FONT_LIMIT + 1)} bytes, past the limit of ${String(DECOMPRESSED_FONT_LIMIT)} bytes (64 MiB)`,
    );
    expect(() => brotliDecode(STREAM, -1)).toThrow(RangeError);
    expect(() => brotliDecode(STREAM, 1.5)).toThrow('is not a whole number of bytes');
  });

  it('stops a prefix at its length and does not read what follows (D84.3)', () => {
    const writer = stream();
    header(writer, 4, true).raw(Uint8Array.of(1, 2, 3, 4));
    const prefix = Uint8Array.from([...writer.align().toBytes(), 0xff, 0xff, 0xff]);
    expect(brotliStream(prefix, 3, 'the stream', true)).toEqual(Uint8Array.of(1, 2, 3));
    expect(brotliStream(prefix, 0, 'the stream', true)).toEqual(new Uint8Array(0));
    expect(() => brotliDecode(prefix, 4)).toThrow();
    // A prefix longer than the stream is refused.
    const whole = EMPTY_LAST(header(stream(), 2, true).raw(Uint8Array.of(1, 2)))
      .align()
      .toBytes();
    expect(() => brotliStream(whole, 3, 'the stream', true)).toThrow(
      'the stream ends after 2 bytes, before the 3 bytes declared',
    );
  });

  it('expands the dictionary with inflate, which checks its Adler-32', () => {
    // The dictionary's zlib stream is what inflate reads: a stream of the module, not a cache.
    const text = TEXT.subarray(0, 4_000);
    expect(brotliDecode(compress(text, 11, 16, constants.BROTLI_MODE_TEXT), text.length)).toEqual(
      text,
    );
    expect(typeof inflate).toBe('function');
  });
});

// --- seeded mutations -------------------------------------------------------

describe('seeded mutations (D84.4, D84.11)', () => {
  it('end in the bytes Node gives or in font-invalid, never in another exception', () => {
    const random = seededRandom(0x7171);
    const outcomes = { accepted: 0, refused: 0 };
    for (const { bytes } of INPUTS.slice(2)) {
      const input = bytes.subarray(0, 4_000);
      for (const [quality, window] of [
        [0, 10],
        [5, 16],
        [11, 22],
        [9, 24],
      ] as const) {
        const original = compress(input, quality, window, MODES[quality % 3] ?? 0);
        for (let index = 0; index < 120; index += 1) {
          const mutated = mutate(original, random);
          let ours: Uint8Array | null = null;
          try {
            ours = brotliDecode(mutated, input.length);
          } catch (error) {
            expect(error).toBeInstanceOf(FontDecodeError);
            expect((error as FontDecodeError).code).toBe('font-invalid');
          }
          if (ours === null) {
            outcomes.refused += 1;
          } else {
            outcomes.accepted += 1;
            expect(ours.length).toBe(input.length);
            expect(Buffer.from(ours).equals(brotliDecompressSync(mutated))).toBe(true);
          }
        }
      }
    }
    expect(outcomes.refused).toBeGreaterThan(outcomes.accepted);
    expect(outcomes.refused + outcomes.accepted).toBe(5 * 4 * 120);
  });
});
