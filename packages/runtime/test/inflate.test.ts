/**
 * `inflate` (D84.1, PR-70): equal to `zlib.inflateSync` on seeded inputs
 * compressed by `zlib.deflateSync` at every level, strategy, window, and
 * memory level; hand-written streams of each block kind; every malformation
 * refused with `font-invalid`; seeded mutations that end either in the bytes
 * zlib gives or in `font-invalid`, never in another exception; and the
 * limit of D84.4 refused before anything is allocated.
 */
import { constants, deflateSync, inflateSync } from 'node:zlib';

import { generateProportionalFont } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { DECOMPRESSED_FONT_LIMIT, FontDecodeError, inflate } from '../src/woff.js';

import { seededRandom } from './support.js';
import { monospacedFont, mutate, sfntTables } from './woff-support.js';

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

// --- seeded inputs ----------------------------------------------------------

const WORDS = [
  'the',
  'frame',
  'of',
  'a',
  'text',
  'measured',
  'from',
  'font',
  'Kadrion',
  'advance',
  'glyph',
  'width',
  'caption',
  'line',
  'WOFF',
  'table',
  'cmap',
  'hmtx',
  'zlib',
  'inflate',
];

function seededInputs(seed: number): { readonly name: string; readonly bytes: Uint8Array }[] {
  const random = seededRandom(seed);
  const randomBytes = (length: number): Uint8Array =>
    Uint8Array.from({ length }, () => Math.floor(random() * 256));
  const text = Array.from({ length: 6_000 }, () => WORDS[Math.floor(random() * WORDS.length)]).join(
    ' ',
  );
  const runs: number[] = [];
  while (runs.length < 40_000) {
    const value = Math.floor(random() * 4) === 0 ? Math.floor(random() * 256) : 0;
    const length = 1 + Math.floor(random() * 300);
    for (let index = 0; index < length; index += 1) runs.push(value);
  }
  // Short random pieces repeated at random distances: matches near and far.
  const mixed: number[] = [];
  const piece = randomBytes(5_000);
  while (mixed.length < 70_000) {
    const start = Math.floor(random() * 4_000);
    for (const byte of piece.subarray(start, start + 3 + Math.floor(random() * 400)))
      mixed.push(byte);
    if (random() < 0.3) for (const byte of randomBytes(Math.floor(random() * 50))) mixed.push(byte);
  }
  return [
    { name: 'empty', bytes: new Uint8Array(0) },
    { name: 'one byte', bytes: randomBytes(1) },
    { name: 'random', bytes: randomBytes(70_000) },
    { name: 'text', bytes: new TextEncoder().encode(text) },
    { name: 'runs', bytes: Uint8Array.from(runs) },
    { name: 'mixed', bytes: Uint8Array.from(mixed) },
  ];
}

const STRATEGIES = {
  default: constants.Z_DEFAULT_STRATEGY,
  filtered: constants.Z_FILTERED,
  'huffman only': constants.Z_HUFFMAN_ONLY,
  rle: constants.Z_RLE,
  fixed: constants.Z_FIXED,
} as const;

describe('inflate equals zlib (D84.1)', () => {
  const inputs = seededInputs(0x84_70);

  for (const [strategyName, strategy] of Object.entries(STRATEGIES)) {
    it(`inflates every level with the strategy ${strategyName}`, () => {
      let streams = 0;
      for (const { name, bytes } of inputs) {
        for (let level = 0; level <= 9; level += 1) {
          for (const [windowBits, memLevel] of [
            [15, 8],
            [9, 1],
            [12, 9],
          ] as const) {
            const stream = bytesOf(deflateSync(bytes, { level, strategy, windowBits, memLevel }));
            const ours = inflate(stream, bytes.length);
            expect(ours.length, `${name} at level ${String(level)}`).toBe(bytes.length);
            expect(Buffer.from(ours).equals(inflateSync(stream)), name).toBe(true);
            expect(Buffer.from(ours).equals(Buffer.from(bytes)), name).toBe(true);
            streams += 1;
          }
        }
      }
      expect(streams).toBe(inputs.length * 10 * 3);
    });
  }

  it('inflates every table of the fixture fonts', () => {
    const fonts = [
      monospacedFont(),
      generateProportionalFont('format-4'),
      generateProportionalFont('format-12'),
      generateProportionalFont('both'),
    ];
    for (const font of fonts) {
      for (const table of sfntTables(font)) {
        const stream = bytesOf(deflateSync(table.data, { level: 9 }));
        expect(inflate(stream, table.data.length), table.tag).toEqual(table.data);
      }
    }
  });
});

// --- hand-written streams ---------------------------------------------------

/** Bits written from the least significant end of each byte (RFC 1951, 3.1.1). */
class BitWriter {
  private readonly bytes: number[] = [];
  private accumulator = 0;
  private count = 0;

  bits(value: number, count: number): this {
    for (let index = 0; index < count; index += 1) {
      this.accumulator |= ((value >>> index) & 1) << this.count;
      this.count += 1;
      if (this.count === 8) this.flush();
    }
    return this;
  }

  /** A prefix code, its most significant bit first (RFC 1951, 3.1.1). */
  code(code: number, length: number): this {
    for (let index = length - 1; index >= 0; index -= 1) this.bits((code >>> index) & 1, 1);
    return this;
  }

  raw(...bytes: number[]): this {
    this.align();
    this.bytes.push(...bytes);
    return this;
  }

  align(): this {
    if (this.count > 0) this.flush();
    return this;
  }

  done(): number[] {
    this.align();
    return this.bytes;
  }

  private flush(): void {
    this.bytes.push(this.accumulator);
    this.accumulator = 0;
    this.count = 0;
  }
}

/** The Adler-32 of RFC 1950, written plainly, apart from the one under test. */
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return (b * 65536 + a) >>> 0;
}

/** A zlib stream: the header `78 01`, the deflate data, and the Adler-32 of `output`. */
function zlibStream(
  deflate: readonly number[],
  output: Uint8Array,
  header = [0x78, 0x01],
): Uint8Array {
  const check = adler32(output);
  return Uint8Array.from([
    ...header,
    ...deflate,
    check >>> 24,
    (check >>> 16) & 0xff,
    (check >>> 8) & 0xff,
    check & 0xff,
  ]);
}

/** The canonical codes of the given lengths (RFC 1951, 3.2.2). */
function canonical(lengths: readonly number[]): number[] {
  const counts = new Array<number>(16).fill(0);
  for (const length of lengths) if (length > 0) counts[length] = (counts[length] ?? 0) + 1;
  const next = new Array<number>(16).fill(0);
  let code = 0;
  for (let bits = 1; bits <= 15; bits += 1) {
    code = (code + (counts[bits - 1] ?? 0)) << 1;
    next[bits] = code;
  }
  return lengths.map((length) => {
    if (length === 0) return -1;
    const assigned = next[length] ?? 0;
    next[length] = assigned + 1;
    return assigned;
  });
}

/** The fixed code of a literal or length symbol (RFC 1951, 3.2.6). */
function fixedLiteral(writer: BitWriter, symbol: number): void {
  if (symbol < 144) writer.code(0x30 + symbol, 8);
  else if (symbol < 256) writer.code(0x190 + symbol - 144, 9);
  else if (symbol < 280) writer.code(symbol - 256, 7);
  else writer.code(0xc0 + symbol - 280, 8);
}

const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface DynamicBlock {
  readonly literalLengths: readonly number[];
  readonly distanceLengths: readonly number[];
  /** The code-length symbols with their extra bits, instead of the plain lengths. */
  readonly codeLengthSymbols?: readonly (readonly [symbol: number, extra?: number])[];
  /** The lengths of the code-length code by symbol, instead of 0 to 15 at four bits. */
  readonly codeLengthLengths?: readonly number[];
  readonly hlit?: number;
  readonly hdist?: number;
}

/** Writes the header of a dynamic block and returns the codes of its literals and distances. */
function dynamicHeader(
  writer: BitWriter,
  block: DynamicBlock,
  last = true,
): { literal: number[]; distance: number[] } {
  const codeLengthLengths =
    block.codeLengthLengths ?? Array.from({ length: 19 }, (_, symbol) => (symbol < 16 ? 4 : 0));
  writer.bits(last ? 1 : 0, 1).bits(2, 2);
  writer.bits(block.hlit ?? block.literalLengths.length - 257, 5);
  writer.bits(block.hdist ?? block.distanceLengths.length - 1, 5);
  writer.bits(15, 4);
  for (const symbol of ORDER) writer.bits(codeLengthLengths[symbol] ?? 0, 3);
  const codeLengthCodes = canonical(codeLengthLengths);
  const symbols =
    block.codeLengthSymbols ??
    [...block.literalLengths, ...block.distanceLengths].map((length) => [length] as const);
  for (const [symbol, extra] of symbols) {
    writer.code(codeLengthCodes[symbol] ?? 0, codeLengthLengths[symbol] ?? 0);
    if (symbol === 16) writer.bits(extra ?? 0, 2);
    if (symbol === 17) writer.bits(extra ?? 0, 3);
    if (symbol === 18) writer.bits(extra ?? 0, 7);
  }
  return { literal: canonical(block.literalLengths), distance: canonical(block.distanceLengths) };
}

const TEXT = new TextEncoder().encode(`abcabcabc${'c'.repeat(10)}`);

/** `abc`, a copy of 6 at distance 3, then 10 at distance 1, in fixed codes. */
function fixedStream(): Uint8Array {
  const writer = new BitWriter().bits(1, 1).bits(1, 2);
  for (const byte of [0x61, 0x62, 0x63]) fixedLiteral(writer, byte);
  fixedLiteral(writer, 260); // length 6
  writer.code(2, 5); // distance 3
  fixedLiteral(writer, 264); // length 10
  writer.code(0, 5); // distance 1
  fixedLiteral(writer, 256);
  return zlibStream(writer.done(), TEXT);
}

/** Literals 0 to 255 at nine bits and the end of block at one: a complete code, no distance. */
const NINE_BIT_LITERALS = [...new Array<number>(256).fill(9), 1];

function dynamicStream(data: Uint8Array): Uint8Array {
  const writer = new BitWriter();
  const { literal } = dynamicHeader(writer, {
    literalLengths: NINE_BIT_LITERALS,
    distanceLengths: [1],
  });
  for (const byte of data) writer.code(literal[byte] ?? 0, 9);
  writer.code(literal[256] ?? 0, 1);
  return zlibStream(writer.done(), data);
}

describe('hand-written streams (D84.1)', () => {
  it('reads stored blocks, an empty one among them', () => {
    const data = new TextEncoder().encode('hello, stored');
    const deflate = new BitWriter()
      .bits(0, 1)
      .bits(0, 2)
      .raw(5, 0, 0xfa, 0xff, ...data.subarray(0, 5))
      .bits(0, 1)
      .bits(0, 2)
      .raw(0, 0, 0xff, 0xff)
      .bits(1, 1)
      .bits(0, 2)
      .raw(8, 0, 0xf7, 0xff, ...data.subarray(5))
      .done();
    const stream = zlibStream(deflate, data);
    expect(inflate(stream, data.length)).toEqual(data);
    expect(Buffer.from(inflateSync(stream)).equals(Buffer.from(data))).toBe(true);
  });

  it('reads a fixed block with overlapping copies', () => {
    const stream = fixedStream();
    expect(inflate(stream, TEXT.length)).toEqual(TEXT);
    expect(Buffer.from(inflateSync(stream)).equals(Buffer.from(TEXT))).toBe(true);
  });

  it('reads a dynamic block written with repeat codes', () => {
    // Code-length symbols 0, 1, 2, and 18 at two bits; literals a at one bit, b and the end at two.
    const codeLengthLengths = new Array<number>(19).fill(0);
    for (const symbol of [0, 1, 2, 18]) codeLengthLengths[symbol] = 2;
    const literalLengths = new Array<number>(257).fill(0);
    literalLengths[0x61] = 1;
    literalLengths[0x62] = 2;
    literalLengths[256] = 2;
    const writer = new BitWriter();
    const { literal } = dynamicHeader(writer, {
      literalLengths,
      distanceLengths: [0],
      codeLengthLengths,
      codeLengthSymbols: [[18, 86], [1], [2], [18, 127], [18, 8], [2], [0]],
    });
    const data = new TextEncoder().encode('abaab');
    for (const byte of data) writer.code(literal[byte] ?? 0, literalLengths[byte] ?? 0);
    writer.code(literal[256] ?? 0, 2);
    const stream = zlibStream(writer.done(), data);
    expect(inflate(stream, data.length)).toEqual(data);
    expect(Buffer.from(inflateSync(stream)).equals(Buffer.from(data))).toBe(true);
  });

  it('reads a dynamic block whose distance code is a single code of one bit, as zlib does', () => {
    const data = seededInputs(7)[2]?.bytes.subarray(0, 500) ?? new Uint8Array(0);
    const stream = dynamicStream(data);
    expect(inflate(stream, data.length)).toEqual(data);
    expect(Buffer.from(inflateSync(stream)).equals(Buffer.from(data))).toBe(true);
  });

  it('reads an empty stream and every window size of the header', () => {
    for (let windowBits = 9; windowBits <= 15; windowBits += 1) {
      const stream = bytesOf(deflateSync(new Uint8Array(0), { windowBits }));
      expect(inflate(stream, 0)).toEqual(new Uint8Array(0));
    }
  });
});

// --- malformations ----------------------------------------------------------

/** A zlib header `cmf`, `flg` with its check bits set. */
function header(cmf: number, flags: number): number[] {
  const base = flags & 0xe0;
  const check = (31 - ((cmf * 256 + base) % 31)) % 31;
  return [cmf, base | check];
}

function fixedOf(build: (writer: BitWriter) => void, output: Uint8Array): Uint8Array {
  const writer = new BitWriter().bits(1, 1).bits(1, 2);
  build(writer);
  return zlibStream(writer.done(), output);
}

describe('malformed streams are font-invalid (D84.1, D84.4, D84.6)', () => {
  const text = new TextEncoder().encode('The frame of a text, measured from the font. '.repeat(40));
  const valid = bytesOf(deflateSync(text, { level: 9 }));

  const cases: [string, Uint8Array, number][] = [
    ['an empty stream', new Uint8Array(0), 0],
    ['one byte', Uint8Array.of(0x78), 0],
    [
      'a method other than deflate',
      Uint8Array.from([...header(0x79, 0), ...valid.subarray(2)]),
      text.length,
    ],
    [
      'a window past 32 KiB',
      Uint8Array.from([...header(0x88, 0), ...valid.subarray(2)]),
      text.length,
    ],
    [
      'a header that fails its check bits',
      Uint8Array.from([0x78, 0x02, ...valid.subarray(2)]),
      text.length,
    ],
    [
      'a preset dictionary',
      Uint8Array.from([...header(0x78, 0x20), 0, 0, 0, 1, ...valid.subarray(2)]),
      text.length,
    ],
    [
      'a bad Adler-32',
      Uint8Array.from([...valid.subarray(0, -1), (valid.at(-1) ?? 0) ^ 1]),
      text.length,
    ],
    ['a byte after the Adler-32', Uint8Array.from([...valid, 0]), text.length],
    ['an output longer than asked', valid, text.length - 1],
    ['an output shorter than asked', valid, text.length + 1],
    [
      'a block of type 3',
      zlibStream(new BitWriter().bits(1, 1).bits(3, 2).done(), new Uint8Array(0)),
      0,
    ],
    [
      'a stored length that fails its complement',
      zlibStream(
        new BitWriter().bits(1, 1).bits(0, 2).raw(1, 0, 0xff, 0xff, 0x61).done(),
        Uint8Array.of(0x61),
      ),
      1,
    ],
    [
      'a stored block that runs past the output',
      zlibStream(
        new BitWriter().bits(1, 1).bits(0, 2).raw(2, 0, 0xfd, 0xff, 0x61, 0x62).done(),
        Uint8Array.of(0x61),
      ),
      1,
    ],
    [
      'a distance before the start of the output',
      fixedOf(
        (writer) => {
          fixedLiteral(writer, 0x61);
          fixedLiteral(writer, 257);
          writer.code(1, 5); // distance 2
          fixedLiteral(writer, 256);
        },
        Uint8Array.of(0x61, 0x61, 0x61, 0x61),
      ),
      4,
    ],
    [
      'the length code 286',
      fixedOf(
        (writer) => {
          fixedLiteral(writer, 0x61);
          fixedLiteral(writer, 286);
          writer.code(0, 5);
          fixedLiteral(writer, 256);
        },
        Uint8Array.of(0x61, 0x61, 0x61, 0x61),
      ),
      4,
    ],
    [
      'the distance code 30',
      fixedOf(
        (writer) => {
          fixedLiteral(writer, 0x61);
          fixedLiteral(writer, 257);
          writer.code(30, 5);
          fixedLiteral(writer, 256);
        },
        Uint8Array.of(0x61, 0x61, 0x61, 0x61),
      ),
      4,
    ],
    [
      'the distance code 31',
      fixedOf(
        (writer) => {
          fixedLiteral(writer, 0x61);
          fixedLiteral(writer, 257);
          writer.code(31, 5);
          fixedLiteral(writer, 256);
        },
        Uint8Array.of(0x61, 0x61, 0x61, 0x61),
      ),
      4,
    ],
    [
      'a literal past the output',
      fixedOf((writer) => {
        fixedLiteral(writer, 0x61);
        fixedLiteral(writer, 0x61);
        fixedLiteral(writer, 256);
      }, Uint8Array.of(0x61)),
      1,
    ],
  ];

  const dynamic = (block: DynamicBlock): Uint8Array => {
    const writer = new BitWriter();
    dynamicHeader(writer, block);
    return zlibStream(writer.done(), new Uint8Array(0));
  };
  cases.push(
    [
      '287 literal and length codes',
      dynamic({ literalLengths: NINE_BIT_LITERALS, distanceLengths: [1], hlit: 30 }),
      0,
    ],
    [
      '31 distance codes',
      dynamic({ literalLengths: NINE_BIT_LITERALS, distanceLengths: [1], hdist: 30 }),
      0,
    ],
    [
      'an over-subscribed code-length code',
      dynamic({
        literalLengths: NINE_BIT_LITERALS,
        distanceLengths: [1],
        codeLengthLengths: new Array<number>(19).fill(1),
      }),
      0,
    ],
    [
      'an incomplete code-length code',
      dynamic({
        literalLengths: NINE_BIT_LITERALS,
        distanceLengths: [1],
        codeLengthLengths: Array.from({ length: 19 }, (_, symbol) => (symbol < 15 ? 4 : 0)),
      }),
      0,
    ],
    [
      'a code-length code of a single one-bit code',
      dynamic({
        literalLengths: NINE_BIT_LITERALS,
        distanceLengths: [1],
        codeLengthLengths: Array.from({ length: 19 }, (_, symbol) => (symbol === 9 ? 1 : 0)),
      }),
      0,
    ],
    [
      'a repeat before the first code length',
      dynamic({
        literalLengths: NINE_BIT_LITERALS,
        distanceLengths: [1],
        codeLengthSymbols: [[16, 0]],
        codeLengthLengths: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 4],
      }),
      0,
    ],
    [
      'a repeat past the codes listed',
      dynamic({
        literalLengths: NINE_BIT_LITERALS,
        distanceLengths: [1],
        codeLengthSymbols: [
          [18, 127],
          [18, 127],
          [18, 0],
        ],
        codeLengthLengths: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0, 4],
      }),
      0,
    ],
    [
      'no end-of-block code',
      dynamic({ literalLengths: [...new Array<number>(256).fill(8), 0], distanceLengths: [1] }),
      0,
    ],
    [
      'an incomplete literal and length code',
      dynamic({ literalLengths: [...new Array<number>(256).fill(9), 2], distanceLengths: [1] }),
      0,
    ],
    [
      'an over-subscribed distance code',
      dynamic({ literalLengths: NINE_BIT_LITERALS, distanceLengths: [1, 1, 1] }),
      0,
    ],
  );

  it.each(cases)('refuses %s', (_name, stream, length) => {
    expect(refusal(() => inflate(stream, length))).toBe('font-invalid');
  });

  it('refuses every truncation of a stream', () => {
    for (const stream of [valid, fixedStream(), dynamicStream(text.subarray(0, 60))]) {
      const length = inflateSync(stream).length;
      for (let end = 0; end < stream.length; end += 1) {
        expect(
          refusal(() => inflate(stream.subarray(0, end), length)),
          String(end),
        ).toBe('font-invalid');
      }
    }
  });

  it('names the stream and the offence', () => {
    expect(() => inflate(valid, text.length + 1)).toThrow(
      `The font is invalid: its zlib stream ends after ${String(text.length)} bytes, before the ${String(text.length + 1)} bytes declared (D84).`,
    );
  });
});

describe('the limit of D84.4', () => {
  it('refuses a length past 64 MiB as font-unmeasurable, before reading the stream', () => {
    expect(DECOMPRESSED_FONT_LIMIT).toBe(64 * 1024 * 1024);
    expect(refusal(() => inflate(new Uint8Array(0), DECOMPRESSED_FONT_LIMIT + 1))).toBe(
      'font-unmeasurable',
    );
    expect(() => inflate(new Uint8Array(0), DECOMPRESSED_FONT_LIMIT + 1)).toThrow('64 MiB');
    // At the limit the stream is read, and this one is empty.
    expect(refusal(() => inflate(new Uint8Array(0), DECOMPRESSED_FONT_LIMIT))).toBe('font-invalid');
  });

  it('refuses a length that is not a whole number of bytes as a programming error', () => {
    for (const length of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => inflate(new Uint8Array(0), length)).toThrow(RangeError);
      expect(() => inflate(new Uint8Array(0), length)).not.toThrow(FontDecodeError);
    }
  });
});

// --- seeded mutations -------------------------------------------------------

describe('seeded mutations (D84.4, D84.11)', () => {
  it('end in the bytes zlib gives or in font-invalid, never in another exception', () => {
    const random = seededRandom(0x7070);
    const inputs = seededInputs(0x84);
    const outcomes = { accepted: 0, refused: 0 };
    for (const { bytes } of inputs.slice(1)) {
      for (const [level, strategy] of [
        [1, constants.Z_DEFAULT_STRATEGY],
        [9, constants.Z_DEFAULT_STRATEGY],
        [6, constants.Z_FIXED],
        [0, constants.Z_DEFAULT_STRATEGY],
      ] as const) {
        const stream = bytesOf(deflateSync(bytes.subarray(0, 3_000), { level, strategy }));
        const length = Math.min(bytes.length, 3_000);
        for (let index = 0; index < 150; index += 1) {
          const mutated = mutate(stream, random);
          let ours: Uint8Array | null = null;
          try {
            ours = inflate(mutated, length);
          } catch (error) {
            expect(error).toBeInstanceOf(FontDecodeError);
            expect((error as FontDecodeError).code).toBe('font-invalid');
          }
          if (ours === null) {
            outcomes.refused += 1;
          } else {
            outcomes.accepted += 1;
            expect(ours.length).toBe(length);
            expect(Buffer.from(ours).equals(inflateSync(mutated))).toBe(true);
          }
        }
      }
    }
    expect(outcomes.refused).toBeGreaterThan(outcomes.accepted);
    expect(outcomes.refused + outcomes.accepted).toBe(5 * 4 * 150);
  });
});
