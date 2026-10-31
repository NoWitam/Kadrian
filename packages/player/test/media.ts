/**
 * Test media for the Player's video path (D51): a writer of minimal MP4 files
 * with one H.264 track, whose samples are opaque bytes, and a stand-in for
 * WebCodecs that "decodes" a sample into a flat 4:2:0 frame whose luma is the
 * sample's first byte. Real H.264 and the real decoder are the pinned test's
 * (`tests/pinned/player-video.pinned.test.ts`). Nothing here is part of the package.
 */

/** One sample in decode order. */
export interface TestSample {
  readonly data: Uint8Array;
  readonly duration: number;
  /** The composition offset (`ctts`); 0 when absent. */
  readonly offset?: number;
  readonly sync: boolean;
}

export interface TestVui {
  readonly fullRange: boolean;
  readonly primaries?: number;
  readonly transfer?: number;
  readonly matrix?: number;
}

export interface TestSps {
  /** 66 (Baseline) by default; 100 (High) writes the chroma format and the depth. */
  readonly profile?: number;
  readonly chromaFormat?: number;
  readonly bitDepth?: number;
  readonly progressive?: boolean;
  readonly vui?: TestVui | null;
}

export interface TestMp4 {
  readonly width?: number;
  readonly height?: number;
  readonly timescale?: number;
  readonly samples: readonly TestSample[];
  readonly entry?: string;
  readonly sps?: TestSps;
  /** `null` for no edit list; a media time for one edit. */
  readonly editMediaTime?: number | null;
  readonly colr?: { primaries: number; transfer: number; matrix: number; fullRange: boolean };
  readonly fragmented?: boolean;
  readonly withoutMoov?: boolean;
}

class BitWriter {
  private readonly bits: number[] = [];

  bit(value: number): this {
    this.bits.push(value & 1);
    return this;
  }

  write(value: number, count: number): this {
    for (let n = count - 1; n >= 0; n -= 1) this.bit(Math.floor(value / 2 ** n) % 2);
    return this;
  }

  ue(value: number): this {
    const coded = value + 1;
    const length = Math.floor(Math.log2(coded));
    this.write(0, length);
    return this.write(coded, length + 1);
  }

  bytes(): Uint8Array {
    this.bit(1);
    while (this.bits.length % 8 !== 0) this.bit(0);
    const out = new Uint8Array(this.bits.length / 8);
    for (let at = 0; at < out.length; at += 1) {
      let byte = 0;
      for (let n = 0; n < 8; n += 1) byte = byte * 2 + (this.bits[at * 8 + n] ?? 0);
      out[at] = byte;
    }
    return out;
  }
}

/** A sequence parameter set NAL unit (header byte included). */
export function testSps(width: number, height: number, options: TestSps = {}): Uint8Array {
  const profile = options.profile ?? 66;
  const bits = new BitWriter().write(profile, 8).write(0, 8).write(30, 8).ue(0);
  if (profile === 100) {
    bits.ue(options.chromaFormat ?? 1);
    bits.ue((options.bitDepth ?? 8) - 8).ue((options.bitDepth ?? 8) - 8);
    bits.bit(0).bit(0);
  }
  bits.ue(0).ue(0).ue(0).ue(1).bit(0);
  bits.ue(Math.ceil(width / 16) - 1).ue(Math.ceil(height / 16) - 1);
  const progressive = options.progressive ?? true;
  bits.bit(progressive ? 1 : 0);
  if (!progressive) bits.bit(0);
  bits.bit(1).bit(0);
  const vui = options.vui ?? null;
  if (vui === null) {
    bits.bit(0);
  } else {
    bits
      .bit(1)
      .bit(0)
      .bit(0)
      .bit(1)
      .write(5, 3)
      .bit(vui.fullRange ? 1 : 0);
    const described = vui.matrix !== undefined;
    bits.bit(described ? 1 : 0);
    if (described) {
      bits
        .write(vui.primaries ?? 2, 8)
        .write(vui.transfer ?? 2, 8)
        .write(vui.matrix ?? 2, 8);
    }
    bits.bit(0).bit(0).bit(0).bit(0).bit(0).bit(0);
  }
  const payload = bits.bytes();
  return new Uint8Array([0x67, ...payload]);
}

/** The bytes of a four-character box type. */
function ascii(text: string): number[] {
  return Array.from({ length: text.length }, (_, at) => text.charCodeAt(at));
}

function u32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function u16(value: number): number[] {
  return [(value >>> 8) & 255, value & 255];
}

function box(type: string, ...parts: (Uint8Array | number[])[]): Uint8Array {
  const body = parts.flatMap((part) => [...part]);
  return new Uint8Array([...u32(body.length + 8), ...ascii(type), ...body]);
}

function fullBox(type: string, version: number, ...parts: (Uint8Array | number[])[]): Uint8Array {
  return box(type, [version, 0, 0, 0], ...parts);
}

/** A minimal MP4: `ftyp`, `moov` with one video track, `mdat` with the samples in one chunk. */
export function testMp4(options: TestMp4): Uint8Array {
  const width = options.width ?? 32;
  const height = options.height ?? 16;
  const timescale = options.timescale ?? 1000;
  const { samples } = options;
  const sps = testSps(width, height, options.sps);
  const avcC = box('avcC', [1, sps[1] ?? 66, 0, 30, 0xff, 0xe1], u16(sps.length), sps, [0]);
  const colr =
    options.colr === undefined
      ? []
      : [
          box(
            'colr',
            ascii('nclx'),
            u16(options.colr.primaries),
            u16(options.colr.transfer),
            u16(options.colr.matrix),
            [options.colr.fullRange ? 0x80 : 0],
          ),
        ];
  const entry = box(
    options.entry ?? 'avc1',
    new Array<number>(6).fill(0),
    u16(1),
    new Array<number>(16).fill(0),
    u16(width),
    u16(height),
    u32(0x00480000),
    u32(0x00480000),
    u32(0),
    u16(1),
    new Array<number>(32).fill(0),
    u16(24),
    u16(0xffff),
    avcC,
    ...colr,
  );
  const stsd = fullBox('stsd', 0, u32(1), entry);
  const stts = fullBox(
    'stts',
    0,
    u32(samples.length),
    ...samples.map((s) => [...u32(1), ...u32(s.duration)]),
  );
  const ctts = samples.some((s) => (s.offset ?? 0) !== 0)
    ? [
        fullBox(
          'ctts',
          0,
          u32(samples.length),
          ...samples.map((s) => [...u32(1), ...u32(s.offset ?? 0)]),
        ),
      ]
    : [];
  const syncs = samples.flatMap((s, at) => (s.sync ? [at + 1] : []));
  const stss =
    syncs.length === samples.length
      ? []
      : [fullBox('stss', 0, u32(syncs.length), ...syncs.map(u32))];
  const stsz = fullBox(
    'stsz',
    0,
    u32(0),
    u32(samples.length),
    ...samples.map((s) => u32(s.data.length)),
  );
  const stsc = fullBox('stsc', 0, u32(1), u32(1), u32(samples.length), u32(1));
  const build = (chunkOffset: number): Uint8Array => {
    const stco = fullBox('stco', 0, u32(1), u32(chunkOffset));
    const stbl = box('stbl', stsd, stts, ...ctts, ...stss, stsz, stsc, stco);
    const minf = box('minf', box('vmhd', [0, 0, 0, 1], new Array<number>(8).fill(0)), stbl);
    const hdlr = fullBox('hdlr', 0, u32(0), ascii('vide'), new Array<number>(13).fill(0));
    const mdhd = fullBox('mdhd', 0, u32(0), u32(0), u32(timescale), u32(0), u16(0x55c4), u16(0));
    const mdia = box('mdia', mdhd, hdlr, minf);
    const edit =
      options.editMediaTime === undefined || options.editMediaTime === null
        ? []
        : [
            box(
              'edts',
              fullBox('elst', 0, u32(1), u32(1000), u32(options.editMediaTime), u16(1), u16(0)),
            ),
          ];
    const trak = box('trak', ...edit, mdia);
    const mvhd = fullBox(
      'mvhd',
      0,
      u32(0),
      u32(0),
      u32(1000),
      u32(0),
      new Array<number>(80).fill(0),
    );
    return box('moov', mvhd, trak);
  };
  const ftyp = box('ftyp', ascii('isom'), u32(512));
  const head = ftyp.length + build(0).length + 8;
  const moov = build(head);
  const mdat = box('mdat', ...samples.map((s) => s.data));
  const parts = [ftyp, ...(options.withoutMoov === true ? [] : [moov]), mdat];
  if (options.fragmented === true) parts.push(box('moof', [0]));
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** What the stand-in decoder was asked, in order. */
export interface DecodeLog {
  configured: VideoDecoderConfig[];
  decoded: { timestamp: number; type: string; first: number }[];
}

/**
 * Installs a WebCodecs stand-in on a window: `VideoDecoder` outputs, for each
 * chunk, a 4:2:0 frame of the configured size whose luma is the chunk's first
 * byte and whose chroma is 128, with the chunk's timestamp.
 */
export function installCodecs(view: object, options: { supported?: boolean } = {}): DecodeLog {
  const log: DecodeLog = { configured: [], decoded: [] };
  class Chunk {
    readonly type: string;
    readonly timestamp: number;
    readonly data: Uint8Array;
    constructor(init: { type: string; timestamp: number; data: Uint8Array }) {
      this.type = init.type;
      this.timestamp = init.timestamp;
      this.data = new Uint8Array(init.data);
    }
  }
  class Decoder {
    state = 'unconfigured';
    private config: VideoDecoderConfig | null = null;
    private readonly pending: Promise<void>[] = [];
    private readonly output: (frame: unknown) => void;
    constructor(init: { output: (frame: unknown) => void }) {
      this.output = init.output;
    }
    static isConfigSupported(config: VideoDecoderConfig): Promise<{ supported: boolean }> {
      return Promise.resolve({ supported: options.supported ?? config.codec.startsWith('avc1.') });
    }
    configure(config: VideoDecoderConfig): void {
      this.config = config;
      this.state = 'configured';
      log.configured.push(config);
    }
    decode(chunk: Chunk): void {
      const width = this.config?.codedWidth ?? 0;
      const height = this.config?.codedHeight ?? 0;
      log.decoded.push({ timestamp: chunk.timestamp, type: chunk.type, first: chunk.data[0] ?? 0 });
      const luma = chunk.data[0] ?? 0;
      this.pending.push(
        Promise.resolve().then(() => {
          const chromaWidth = (width + 1) >> 1;
          const chromaHeight = (height + 1) >> 1;
          this.output({
            format: 'I420',
            timestamp: chunk.timestamp,
            visibleRect: { x: 0, y: 0, width, height },
            allocationSize: () => width * height + 2 * chromaWidth * chromaHeight,
            copyTo: (buffer: Uint8Array) => {
              buffer.fill(luma, 0, width * height);
              buffer.fill(128, width * height);
              return Promise.resolve([
                { offset: 0, stride: width },
                { offset: width * height, stride: chromaWidth },
                { offset: width * height + chromaWidth * chromaHeight, stride: chromaWidth },
              ]);
            },
            close: () => undefined,
          });
        }),
      );
    }
    async flush(): Promise<void> {
      await Promise.all(this.pending);
    }
    close(): void {
      this.state = 'closed';
    }
  }
  Object.defineProperty(view, 'VideoDecoder', { configurable: true, value: Decoder });
  Object.defineProperty(view, 'EncodedVideoChunk', { configurable: true, value: Chunk });
  return log;
}
