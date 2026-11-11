/**
 * The generated assets of the reference composition (D27.5): their bytes are
 * the ones `reference.json` pins, they are the same on every call, and each is
 * a well-formed file of its format, checked here without trusting the
 * generator's own helpers.
 */
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  AUDIO_SAMPLE_RATE,
  AUDIO_SECONDS,
  FONT_GLYPHS,
  captionsComposition,
  generateProportionalFont,
  generateReferenceAssets,
  PROPORTIONAL_FONT_ADVANCES,
  PROPORTIONAL_FONT_GLYPHS,
  IMAGE_SIZE,
  referenceComposition,
  transitionsComposition,
  clipTransitionsComposition,
  videoComposition,
} from '../src/index.js';

interface Reference {
  readonly assets: readonly { id: string; type: string; contentHash: string }[];
  readonly scenes: readonly { nodes: readonly Node[] }[];
}
interface Node {
  readonly type: string;
  readonly text?: string;
  readonly children?: readonly Node[];
}

const reference = referenceComposition as Reference;
const sha256 = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const assetBytes = (id: string): Uint8Array => {
  const found = generateReferenceAssets().find((asset) => asset.id === id);
  if (found === undefined) throw new Error(`no asset ${id}`);
  return found.bytes;
};
const view = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

describe('the generated reference assets (D27.5)', () => {
  it('are exactly the assets of the document, with the media type of their type', () => {
    const generated = generateReferenceAssets().map(({ id, mediaType }) => [id, mediaType]);
    expect(generated).toEqual([
      ['asset-image', 'image/png'],
      ['asset-audio', 'audio/wav'],
      ['asset-font', 'font/ttf'],
    ]);
    expect(reference.assets.map(({ id, type }) => [id, type])).toEqual([
      ['asset-image', 'image'],
      ['asset-audio', 'audio'],
      ['asset-font', 'font'],
    ]);
  });

  it.each(reference.assets)('hash to the contentHash of $id (D14)', ({ id, contentHash }) => {
    expect(sha256(assetBytes(id))).toBe(contentHash);
  });

  it('are the same bytes on every call, in fresh copies', () => {
    const first = generateReferenceAssets();
    const second = generateReferenceAssets();
    first.forEach((asset, index) => {
      const other = second[index]?.bytes ?? new Uint8Array(0);
      // Byte comparison through Buffer: `toEqual` walks a megabyte element by element.
      expect(Buffer.from(asset.bytes).equals(other)).toBe(true);
      expect(asset.bytes.buffer).not.toBe(other.buffer);
    });
    const [image] = first;
    image?.bytes.fill(0);
    expect(sha256(assetBytes('asset-image'))).toBe(reference.assets[0]?.contentHash);
  });
});

describe('asset-image', () => {
  const png = assetBytes('asset-image');

  it('is a PNG whose chunks carry valid CRCs: IHDR 128 x 128 truecolour, IDAT, IEND', () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks: { type: string; data: Uint8Array }[] = [];
    for (let offset = 8; offset < png.length;) {
      const length = view(png).getUint32(offset);
      const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
      const data = png.subarray(offset + 8, offset + 8 + length);
      const crc = view(png).getUint32(offset + 8 + length);
      // zlib's crc32 is an independent implementation of the same checksum.
      const body = png.subarray(offset + 4, offset + 8 + length);
      expect(crc, type).toBe(crc32(body));
      chunks.push({ type, data });
      offset += 12 + length;
    }
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const header = view(chunks[0]?.data ?? new Uint8Array(13));
    expect([header.getUint32(0), header.getUint32(4)]).toEqual([IMAGE_SIZE, IMAGE_SIZE]);
    expect([...(chunks[0]?.data.subarray(8) ?? [])]).toEqual([8, 2, 0, 0, 0]);
    // Inflating checks the stored blocks and the Adler-32 of the stream.
    const raw = inflateSync(chunks[1]?.data ?? new Uint8Array(0));
    expect(raw.length).toBe(IMAGE_SIZE * (1 + IMAGE_SIZE * 3));
    for (let row = 0; row < IMAGE_SIZE; row += 1) expect(raw[row * (1 + IMAGE_SIZE * 3)]).toBe(0);
  });
});

describe('asset-audio', () => {
  const wav = assetBytes('asset-audio');

  it('is 10 s of 48 kHz mono 16-bit PCM', () => {
    const data = view(wav);
    const text = (offset: number): string =>
      String.fromCharCode(...wav.subarray(offset, offset + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(data.getUint32(4, true)).toBe(wav.length - 8);
    expect(data.getUint16(20, true)).toBe(1);
    expect(data.getUint16(22, true)).toBe(1);
    expect(data.getUint32(24, true)).toBe(AUDIO_SAMPLE_RATE);
    expect(data.getUint16(34, true)).toBe(16);
    expect(data.getUint32(40, true)).toBe(AUDIO_SAMPLE_RATE * AUDIO_SECONDS * 2);
    expect(wav.length).toBe(44 + AUDIO_SAMPLE_RATE * AUDIO_SECONDS * 2);
  });

  it('is a triangle of period 100 samples between -8000 and 8000', () => {
    const data = view(wav);
    const sample = (index: number): number => data.getInt16(44 + index * 2, true);
    expect([sample(0), sample(25), sample(50), sample(75), sample(100)]).toEqual([
      -8000, 0, 8000, 0, -8000,
    ]);
  });
});

describe('asset-font', () => {
  const font = assetBytes('asset-font');
  const data = view(font);
  const numTables = data.getUint16(4);
  const tables = new Map<string, { offset: number; length: number; checksum: number }>();
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    tables.set(String.fromCharCode(...font.subarray(record, record + 4)), {
      checksum: data.getUint32(record + 4),
      offset: data.getUint32(record + 8),
      length: data.getUint32(record + 12),
    });
  }
  const sum = (offset: number, length: number): number => {
    let total = 0;
    for (let at = offset; at < offset + length; at += 4) {
      const word = [0, 1, 2, 3].reduce((acc, step) => acc * 256 + (font[at + step] ?? 0), 0);
      total = (total + word) % 2 ** 32;
    }
    return total;
  };

  it('is a TrueType font with the ten tables of a minimal font, sorted, with valid checksums', () => {
    expect(data.getUint32(0)).toBe(0x00010000);
    expect([...tables.keys()]).toEqual([
      'OS/2',
      'cmap',
      'glyf',
      'head',
      'hhea',
      'hmtx',
      'loca',
      'maxp',
      'name',
      'post',
    ]);
    for (const [tag, { offset, length, checksum }] of tables) {
      if (tag === 'head') continue;
      expect(sum(offset, length), tag).toBe(checksum);
    }
    const head = tables.get('head');
    expect(data.getUint32((head?.offset ?? 0) + 12)).toBe(0x5f0f3cf5);
    // With checkSumAdjustment in place, the whole font sums to the magic of the format.
    expect(sum(0, font.length)).toBe(0xb1b0afba);
  });

  /** The glyph index of a character through the format 4 subtable of cmap. */
  const glyphOf = (character: string): number => {
    const cmap = tables.get('cmap')?.offset ?? 0;
    const subtable = cmap + data.getUint32(cmap + 8);
    const segments = data.getUint16(subtable + 6) / 2;
    const code = character.charCodeAt(0);
    for (let index = 0; index < segments; index += 1) {
      const end = data.getUint16(subtable + 14 + index * 2);
      const start = data.getUint16(subtable + 16 + segments * 2 + index * 2);
      const delta = data.getUint16(subtable + 16 + segments * 4 + index * 2);
      if (code >= start && code <= end) return code === 0xffff ? 0 : (code + delta) % 65536;
    }
    return 0;
  };

  it('maps every character of its glyph set to its own glyph', () => {
    const characters = Object.keys(FONT_GLYPHS);
    const glyphs = characters.map(glyphOf);
    expect(glyphs.every((glyph) => glyph > 0)).toBe(true);
    expect(new Set(glyphs).size).toBe(characters.length);
    expect(glyphOf('Z')).toBe(0);
  });

  it('covers every character of every text node, so that no text falls back (D27)', () => {
    const texts: string[] = [];
    const visit = (node: Node): void => {
      if (node.type === 'text' && node.text !== undefined) texts.push(node.text);
      node.children?.forEach(visit);
    };
    reference.scenes.forEach((scene) => {
      scene.nodes.forEach(visit);
    });
    expect(texts).toEqual(['Deterministic by design', 'Kadrion']);
    for (const character of texts.join(''))
      expect(FONT_GLYPHS, character).toHaveProperty([character]);
  });

  it.each([
    ['video', videoComposition],
    ['transitions', transitionsComposition],
    ['clip transitions', clipTransitionsComposition],
  ])('covers every character of the %s composition too', (_, composition) => {
    const texts: string[] = [];
    const visit = (node: Node): void => {
      if (node.type === 'text' && node.text !== undefined) texts.push(node.text);
      node.children?.forEach(visit);
    };
    (composition as Reference).scenes.forEach((scene) => {
      scene.nodes.forEach(visit);
    });
    for (const character of texts.join(''))
      expect(FONT_GLYPHS, character).toHaveProperty([character]);
  });
});

describe('the proportional font (D83, PR-65)', () => {
  /** The tables of a font, by tag, and the sum of its words as the checksums of sfnt count. */
  const tablesOf = (font: Uint8Array): Map<string, { offset: number; length: number }> => {
    const data = view(font);
    const tables = new Map<string, { offset: number; length: number }>();
    for (let index = 0; index < data.getUint16(4); index += 1) {
      const record = 12 + index * 16;
      const offset = data.getUint32(record + 8);
      const length = data.getUint32(record + 12);
      const words = font.subarray(offset, offset + Math.ceil(length / 4) * 4);
      let sum = 0;
      for (let at = 0; at < words.length; at += 4)
        sum = (sum + view(words).getUint32(at)) % 2 ** 32;
      const tag = String.fromCharCode(...font.subarray(record, record + 4));
      if (tag !== 'head') expect(sum, tag).toBe(data.getUint32(record + 4));
      tables.set(tag, { offset, length });
    }
    return tables;
  };

  it.each(['both', 'format-4', 'format-12'] as const)(
    'is a TrueType font with valid checksums, the same bytes on every call (%s)',
    (cmap) => {
      const font = generateProportionalFont(cmap);
      expect(generateProportionalFont(cmap)).toEqual(font);
      expect(view(font).getUint32(0)).toBe(0x00010000);
      expect([...tablesOf(font).keys()]).toEqual([
        'OS/2',
        'cmap',
        'glyf',
        'head',
        'hhea',
        'hmtx',
        'loca',
        'maxp',
        'name',
        'post',
      ]);
    },
  );

  it('has an advance of its own for every glyph, and pins its bytes', () => {
    expect(Object.keys(PROPORTIONAL_FONT_ADVANCES).sort()).toEqual(
      Object.keys(PROPORTIONAL_FONT_GLYPHS).sort(),
    );
    expect(new Set(Object.values(PROPORTIONAL_FONT_ADVANCES)).size).toBeGreaterThan(4);
    // The variants differ in cmap only: the same glyphs, advances, and outlines.
    const both = tablesOf(generateProportionalFont('both'));
    const bmp = tablesOf(generateProportionalFont('format-4'));
    for (const tag of ['glyf', 'hmtx', 'loca'])
      expect(bmp.get(tag)?.length).toBe(both.get(tag)?.length);
    expect(sha256(generateProportionalFont())).toBe(
      'sha256:47d9d04524cbaba241f318aab4a4ac2b16dc23748145c8c902cfb654e3c11048',
    );
  });
});

describe('the captions composition (D57)', () => {
  it('uses only characters of the glyph set in its words, and the font of the reference', () => {
    const document = captionsComposition as {
      assets: { id: string; contentHash: string }[];
      scenes: { nodes: { type: string; words?: { text: string }[] }[] }[];
    };
    const words = document.scenes
      .flatMap((scene) => scene.nodes)
      .flatMap((node) => (node.type === 'captions' ? (node.words ?? []) : []))
      .map(({ text }) => text);
    expect(words).toHaveLength(10);
    for (const character of words.join(' '))
      expect(FONT_GLYPHS, character).toHaveProperty([character]);
    const font = (referenceComposition as typeof document).assets.find(
      ({ id }) => id === 'asset-font',
    );
    expect(document.assets).toEqual([font]);
  });
});

/** Bitwise CRC-32 written independently of the generator (ISO 3309). */
function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
