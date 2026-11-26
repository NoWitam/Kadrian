/**
 * The probe of the gate of D89.1: a canvas as large as the bound, covered by an
 * image of incompressible noise, under a blur, an SVG filter (D72), a mask
 * (D75), and a blend mode (D75), one per frame, each over a 1-pixel pattern
 * in every corner. A render surface that Chromium clamps to its texture size,
 * by clipping or by scaling it down, loses a pattern: a clipped surface leaves
 * its corner without the effect, and a scaled one greys the pattern. The image
 * is generated here, from a fixed seed, so no large file enters Git (D89.1);
 * the probe is recorded by the SHA-256 of what it renders. Nothing here is part
 * of a package.
 */
import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';

import { SCHEMA_VERSION } from '@kadrion/schema';

import type { Pixels } from './support.js';

/** The side of the square of the pattern in each corner, in pixels. */
export const PATTERN = 16;
/** The frame rate of the probe: frame k is at k × 100 000 µs. */
const FPS = 10;
const FRAME_US = 1_000_000 / FPS;
/** The id of the image asset of noise. */
export const NOISE_ASSET = 'probe-noise';

/** The five frames of the probe, in order. */
export const PROBE_FRAMES = ['noise', 'blur', 'filter', 'mask', 'blend'] as const;
export type ProbeFrame = (typeof PROBE_FRAMES)[number];

/** Whether pixel (x, y) of the canvas is white in the pattern: (x + y) even. */
function white(x: number, y: number): boolean {
  return (x + y) % 2 === 0;
}

/** The corners' squares of the pattern, as [x0, y0] of each. */
export function cornerSquares(
  width: number,
  height: number,
): readonly (readonly [number, number])[] {
  return [
    [0, 0],
    [width - PATTERN, 0],
    [0, height - PATTERN],
    [width - PATTERN, height - PATTERN],
  ];
}

/** The image of noise: its PNG, and the colour of each pixel. */
export interface Noise {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** The index into `palette` of each pixel, row by row. */
  readonly indices: Uint8Array;
  /** 256 colours as RGB: 0 is black, 1 is white, the others from the seed. */
  readonly palette: Uint8Array;
}

/**
 * A PNG of `width` × `height` of noise from a fixed seed (xorshift32): every
 * pixel one of 256 colours drawn from the seed, as a palette image stored
 * without compression, with the pattern in every corner. Its RGB does not
 * compress: no deflate of the rows of a capture finds the palette, so its
 * capture is as large as a PNG of the canvas is, at a third of the bytes of
 * an RGB image, which the page receives in one message of the protocol.
 */
export function noiseImage(width: number, height: number, seed = 0x6b616472): Noise {
  let state = seed >>> 0;
  const next = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  const palette = new Uint8Array(256 * 3);
  palette.set([0, 0, 0, 255, 255, 255], 0);
  for (let at = 6; at < palette.length; at += 1) palette[at] = next() & 0xff;
  const indices = new Uint8Array(width * height);
  for (let at = 0; at < indices.length; at += 4) {
    const value = next();
    indices[at] = value & 0xff;
    if (at + 1 < indices.length) indices[at + 1] = (value >>> 8) & 0xff;
    if (at + 2 < indices.length) indices[at + 2] = (value >>> 16) & 0xff;
    if (at + 3 < indices.length) indices[at + 3] = (value >>> 24) & 0xff;
  }
  for (const [x0, y0] of cornerSquares(width, height)) {
    for (let y = y0; y < y0 + PATTERN; y += 1) {
      for (let x = x0; x < x0 + PATTERN; x += 1) indices[y * width + x] = white(x, y) ? 1 : 0;
    }
  }
  const stride = width + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw.set(indices.subarray(y * width, (y + 1) * width), y * stride + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 3, 0, 0, 0], 8);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('PLTE', palette),
    chunk('IDAT', deflateSync(raw, { level: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { png, width, height, indices, palette };
}

/** How many pixels of `image` differ in RGB from the noise. */
export function differingFromNoise(image: Pixels, noise: Noise): number {
  if (image.width !== noise.width || image.height !== noise.height) return -1;
  const channels = image.data.length / (image.width * image.height);
  let differing = 0;
  for (let pixel = 0; pixel < noise.indices.length; pixel += 1) {
    const colour = (noise.indices[pixel] ?? 0) * 3;
    const at = pixel * channels;
    if (
      image.data[at] !== noise.palette[colour] ||
      image.data[at + 1] !== noise.palette[colour + 1] ||
      image.data[at + 2] !== noise.palette[colour + 2]
    ) {
      differing += 1;
    }
  }
  return differing;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(data, crc32(Buffer.from(type, 'ascii'))) >>> 0, 0);
  return Buffer.concat([head, data, tail]);
}

export function sha256Of(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

const TRANSFORM = {
  scale: { x: 1, y: 1 },
  rotation: 0,
  origin: { x: 0, y: 0 },
  flip: { x: false, y: false },
  corners: {
    topLeft: { x: 0, y: 0 },
    topRight: { x: 0, y: 0 },
    bottomRight: { x: 0, y: 0 },
    bottomLeft: { x: 0, y: 0 },
  },
  opacity: 1,
  animations: [],
} as const;

const NO_COMPOSITING = {
  mask: { kind: 'none' },
  matte: { kind: 'none' },
  blendMode: 'normal',
} as const;

function lifetime(frame: ProbeFrame): { startUs: number; durationUs: number } {
  return { startUs: PROBE_FRAMES.indexOf(frame) * FRAME_US, durationUs: FRAME_US };
}

function noise(id: string, frame: ProbeFrame, width: number, height: number, extra = {}) {
  return {
    id,
    type: 'image',
    ...lifetime(frame),
    position: { x: 0, y: 0 },
    ...TRANSFORM,
    assetId: NOISE_ASSET,
    width,
    height,
    fit: 'fill',
    focus: { x: 500, y: 500 },
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
    cornerRadius: 0,
    effects: [],
    ...NO_COMPOSITING,
    ...extra,
  };
}

/** A rectangle 64 pixels beyond every edge of the canvas. */
function beyond(id: string, frame: ProbeFrame, width: number, height: number, extra: object) {
  return {
    id,
    type: 'shape',
    ...lifetime(frame),
    position: { x: -64, y: -64 },
    ...TRANSFORM,
    width: width + 128,
    height: height + 128,
    geometry: { kind: 'rect', cornerRadius: 0 },
    fill: { kind: 'solid', color: '#000000' },
    stroke: { color: '#ffffff', width: 0, dash: [], cap: 'round', join: 'round' },
    trim: { start: 0, end: 1000 },
    effects: [],
    ...NO_COMPOSITING,
    ...extra,
  };
}

/** The probe of a canvas of `width` × `height`, whose noise has the hash `noiseHash`. */
export function canvasProbe(width: number, height: number, noiseHash: string): unknown {
  const durationUs = PROBE_FRAMES.length * FRAME_US;
  return {
    schemaVersion: SCHEMA_VERSION,
    width,
    height,
    safeArea: { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 },
    clear: 'white',
    fps: FPS,
    durationUs,
    assets: [{ id: NOISE_ASSET, type: 'image', contentHash: noiseHash }],
    scenes: [
      {
        id: 'probe-scene',
        durationUs,
        nodes: [
          noise('probe-noise-plain', 'noise', width, height),
          noise('probe-blur-under', 'blur', width, height),
          // Black at half opacity, blurred: the blur's surface is larger than the canvas.
          beyond('probe-blur', 'blur', width, height, {
            opacity: 0.5,
            effects: [{ id: 'probe-blur-e0', kind: 'blur', radius: 8, animations: [] }],
          }),
          noise('probe-filter', 'filter', width, height, {
            effects: [
              {
                id: 'probe-filter-e0',
                kind: 'curves',
                red: [1, 0],
                green: [0, 1],
                blue: [0, 1],
                amount: 1,
                animations: [],
              },
            ],
          }),
          noise('probe-mask', 'mask', width, height, {
            mask: {
              kind: 'shape',
              x: 0,
              y: 0,
              width,
              height,
              geometry: { kind: 'rect', cornerRadius: 0 },
              inverted: false,
              feather: 0,
              animations: [],
            },
          }),
          noise('probe-blend-under', 'blend', width, height),
          // White of blend mode `difference`: the pattern inverted.
          beyond('probe-blend', 'blend', width, height, {
            fill: { kind: 'solid', color: '#ffffff' },
            blendMode: 'difference',
          }),
        ],
        clips: [],
        transitions: [],
        effects: [],
      },
    ],
    clips: [],
    transitions: [],
    definitions: [],
    template: { inputs: [], bindings: [], conditions: [], repeats: [] },
  };
}

/** The frame time of a frame of the probe. */
export function probeTimeUs(frame: ProbeFrame): number {
  return PROBE_FRAMES.indexOf(frame) * FRAME_US;
}

type Rgb = readonly [number, number, number];

/**
 * What a white and a black pixel of the pattern become in each frame; `null`
 * for the blur's white, which is half of white, 127 or 128, the same in every
 * corner.
 */
const EXPECTED: Readonly<Record<ProbeFrame, { white: Rgb | null; black: Rgb }>> = {
  noise: { white: [255, 255, 255], black: [0, 0, 0] },
  blur: { white: null, black: [0, 0, 0] },
  filter: { white: [0, 255, 255], black: [255, 0, 0] },
  mask: { white: [255, 255, 255], black: [0, 0, 0] },
  blend: { white: [0, 0, 0], black: [255, 255, 255] },
};

/**
 * The problems of one frame's patterns, at most `limit`; empty when every
 * pixel of every corner's square is what the frame makes of the pattern.
 */
export function patternProblems(image: Pixels, frame: ProbeFrame, limit = 20): string[] {
  const problems: string[] = [];
  const channels = image.data.length / (image.width * image.height);
  const expected = EXPECTED[frame];
  let half: Rgb | null = null;
  for (const [x0, y0] of cornerSquares(image.width, image.height)) {
    for (let y = y0; y < y0 + PATTERN; y += 1) {
      for (let x = x0; x < x0 + PATTERN; x += 1) {
        const at = (y * image.width + x) * channels;
        const found: Rgb = [
          image.data[at] ?? -1,
          image.data[at + 1] ?? -1,
          image.data[at + 2] ?? -1,
        ];
        let wanted = white(x, y) ? expected.white : expected.black;
        if (wanted === null) {
          // The blur's white: one grey, 127 or 128, in every corner.
          half ??=
            found[0] >= 127 && found[0] <= 128 ? [found[0], found[0], found[0]] : [127, 127, 127];
          wanted = half;
        }
        if (found.some((value, index) => value !== wanted[index])) {
          if (problems.length < limit) {
            problems.push(
              `${frame} (${String(x)}, ${String(y)}) is ${found.join(',')}, not ${wanted.join(',')}`,
            );
          }
        }
      }
    }
  }
  return problems;
}
