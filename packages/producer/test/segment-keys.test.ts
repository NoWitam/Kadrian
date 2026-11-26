/**
 * The keys of segments (D92.1) and the grid of spans they are computed on
 * (D92.2), without a browser or FFmpeg: keys stable over runs, a key of the
 * byte layout the module documents, a change of what a frame draws or of a pin
 * that changes the keys of the segments that show it and of no other, a scene
 * moved in time that keeps its keys, every field of the fixture documents that
 * reaches the key or is listed with its reason, the refusals, the fonts read
 * through a resolver, and the time of a film of ten minutes (D92, question 3).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

import { evaluateComposition, fontMetrics, type FontMetrics } from '@kadrion/runtime';
import { frameToTimeUs, validateComposition, type ValidatedComposition } from '@kadrion/schema';
import {
  captionsComposition,
  captionsMotionComposition,
  clearComposition,
  clipTransitionsComposition,
  compositingComposition,
  cornersComposition,
  customHtmlComposition,
  easingComposition,
  effectsComposition,
  effectsSvgComposition,
  elementsComposition,
  focusComposition,
  framedTextComposition,
  generateNumeralFontAsset,
  generateProportionalFontAsset,
  generateReferenceAssets,
  lifetimeComposition,
  motionComposition,
  nestedComposition,
  numberComposition,
  referenceComposition,
  repeatsComposition,
  scenesComposition,
  shapesComposition,
  speedComposition,
  svgComposition,
  templateComposition,
  textComposition,
  transitionsComposition,
  videoComposition,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { OUTPUT_PLACEHOLDER } from '../src/encode.js';
import {
  CHROMIUM_ARGS,
  CHROMIUM_REVISION,
  CHROMIUM_VERSION,
  PINNED_IMAGE,
  PLAYWRIGHT_CORE_VERSION,
} from '../src/environment.js';
import {
  FFMPEG_ARCHIVE_SHA256,
  FFMPEG_ASSET,
  FFMPEG_CONFIGURATION,
  FFMPEG_RELEASE,
  FFMPEG_SHA256,
  FFMPEG_VERSION,
  FFPROBE_SHA256,
} from '../src/ffmpeg.js';
import { canonicalJson, sha256 } from '../src/manifest.js';
import { loadRuntimeBuild } from '../src/runtime.js';
import {
  frameRecord,
  keyDocument,
  measuredFontMetrics,
  pinnedKeyPins,
  SEGMENT_KEY_VERSION,
  segmentKeys,
  segmentKeysWith,
  type SegmentKey,
  type SegmentKeyPins,
  type SegmentKeysGrid,
  type SegmentKeysSettings,
} from '../src/segment-keys.js';
import { gridSegments, gridSpans, segmentGrid, spanSegments } from '../src/segments.js';

/** The metrics of every font of the fixtures, by asset ID: what a host reads once. */
const FONTS: ReadonlyMap<string, FontMetrics> = new Map(
  [
    ...generateReferenceAssets().filter(({ id }) => id === 'asset-font'),
    generateProportionalFontAsset(),
    generateNumeralFontAsset(),
  ].map(({ id, bytes }) => [id, fontMetrics(bytes)]),
);

const RUNTIME = loadRuntimeBuild().contentHash;

function keysOf(
  document: unknown,
  grid: SegmentKeysGrid = {},
  settings: Partial<SegmentKeysSettings> = {},
): readonly SegmentKey[] {
  return segmentKeys(document, grid, { preset: '720p', fonts: FONTS, ...settings }).segments;
}

function valid(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(JSON.stringify(result.errors.slice(0, 3)));
  return result.composition;
}

type Path = readonly (string | number)[];

/**
 * A fixture of 640 × 360 on a canvas of 1280 × 720, which the preset `720p`
 * renders (D29.5): no video job renders a canvas whose short side is below 720.
 */
function at720(document: unknown): unknown {
  return edited(document, [['width'], 1280], [['height'], 720]);
}

/** A copy of `document` with each value at its path replaced. */
function edited(document: unknown, ...changes: readonly (readonly [Path, unknown])[]): unknown {
  const copy = structuredClone(document);
  for (const [path, value] of changes) {
    let at = copy as Record<string | number, unknown>;
    for (const step of path.slice(0, -1)) at = at[step] as Record<string | number, unknown>;
    at[path.at(-1) ?? ''] = value;
  }
  return copy;
}

function valueAt(document: unknown, path: Path): unknown {
  let at = document;
  for (const step of path) at = (at as Record<string | number, unknown>)[step];
  return at;
}

/** The indices of the segments whose keys differ between two lists of one grid. */
function changed(before: readonly SegmentKey[], after: readonly SegmentKey[]): number[] {
  expect(after.map(({ firstFrame, frameCount }) => [firstFrame, frameCount])).toEqual(
    before.map(({ firstFrame, frameCount }) => [firstFrame, frameCount]),
  );
  return before.flatMap((segment, at) => (segment.key === after[at]?.key ? [] : [segment.index]));
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (reason) {
    return (reason as { code?: string }).code;
  }
  return undefined;
}

async function codeOfAsync(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (reason) {
    return (reason as { code?: string }).code;
  }
  return undefined;
}

/*
 * The scenes fixture at 30 fps on segments of 15 frames: scene-intro holds
 * frames 0 to 29 (segments 0 and 1), scene-middle 30 to 74 (2, 3, 4), and
 * scene-outro 75 to 95 (5 and 6, the last of 6 frames).
 */
const SCENES = { segmentFrames: 15 } as const;
const INTRO = [0, 1];
const MIDDLE = [2, 3, 4];
const OUTRO = [5, 6];

describe('segmentKeys (D92.1)', () => {
  it('is stable over runs and covers the grid with the index, span, and frames of each segment', () => {
    const first = keysOf(scenesComposition, {}, SCENES);
    expect(keysOf(scenesComposition, {}, SCENES)).toEqual(first);
    expect(
      first.map(({ index, span, firstFrame, frameCount }) => [index, span, firstFrame, frameCount]),
    ).toEqual([
      [0, 0, 0, 15],
      [1, 0, 15, 15],
      [2, 0, 30, 15],
      [3, 0, 45, 15],
      [4, 0, 60, 15],
      [5, 0, 75, 15],
      [6, 0, 90, 6],
    ]);
    for (const { key } of first) expect(key).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(new Set(first.map(({ key }) => key)).size).toBe(first.length);
    const result = segmentKeys(scenesComposition, {}, { preset: '720p', fonts: FONTS });
    expect(result.keyVersion).toBe(SEGMENT_KEY_VERSION);
    expect(SEGMENT_KEY_VERSION).toBe(1);
  });

  it('hashes the canonical JSON of the layout its module documents, written out by hand', () => {
    const composition = valid(scenesComposition);
    const [segment] = keysOf(scenesComposition, {}, { segmentFrames: 40 });
    const document = keyDocument(composition);
    const frames = Array.from({ length: 40 }, (_, frame) =>
      frameRecord(document, evaluateComposition(composition, frameToTimeUs(frame, 30), FONTS)),
    );
    const input = {
      browser: {
        args: CHROMIUM_ARGS,
        capture: 'fast',
        chromiumRevision: CHROMIUM_REVISION,
        chromiumVersion: CHROMIUM_VERSION,
        clear: 'white',
        deviceScaleFactor: 1,
        image: PINNED_IMAGE,
        locale: 'en-US',
        playwrightCore: PLAYWRIGHT_CORE_VERSION,
        timezone: 'UTC',
      },
      canvas: { fps: 30, height: 1920, width: 1080 },
      ffmpeg: {
        archiveSha256: FFMPEG_ARCHIVE_SHA256,
        asset: FFMPEG_ASSET,
        configuration: FFMPEG_CONFIGURATION,
        ffmpegSha256: FFMPEG_SHA256,
        ffprobeSha256: FFPROBE_SHA256,
        release: FFMPEG_RELEASE,
        segmentArgs: expect.any(Array) as unknown,
        version: FFMPEG_VERSION,
      },
      frames,
      keyVersion: 1,
      preset: {
        name: 'mp4-720p',
        width: 720,
        height: 1280,
        sourceWidth: 1080,
        sourceHeight: 1920,
        fps: 30,
        deviceScaleFactor: 1,
        videoGraph:
          '[0:v]scale=720:1280:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p[v]',
      },
      runtime: RUNTIME,
      segmentFrames: 40,
    };
    const args = [
      ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
      ...['-f', 'image2pipe', '-c:v', 'png', '-framerate', '30', '-i', 'pipe:0'],
      ...['-filter_complex_threads', '1', '-filter_complex', input.preset.videoGraph],
      ...['-map', '[v]', '-fps_mode', 'passthrough'],
      ...['-c:v', 'libx264', '-preset', 'medium', '-crf', '18'],
      ...['-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-threads', '1'],
      ...['-color_primaries', 'bt709', '-color_trc', 'bt709'],
      ...['-colorspace', 'bt709', '-color_range', 'tv'],
      ...['-video_track_timescale', '15360'],
      ...['-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact'],
      ...['-flags:v', '+bitexact'],
      ...['-f', 'mp4', '-y', OUTPUT_PLACEHOLDER],
      ...['-map', '0:v', '-c:v', 'copy', '-f', 'framehash', '-hash', 'sha256', 'pipe:1'],
    ];
    const written = { ...input, ffmpeg: { ...input.ffmpeg, segmentArgs: args } };
    expect(segment?.key).toBe(sha256(canonicalJson(written)));

    // The record of frame 0: the state without its time, the two nodes of the
    // intro, the intro without its nodes, sounds, and duration, and its font.
    const state = evaluateComposition(composition, 0, FONTS);
    const intro = composition.scenes[0];
    expect(frames[0]).toEqual({
      assets: [
        {
          contentHash: composition.assets.find(({ id }) => id === 'asset-font')?.contentHash,
          id: 'asset-font',
          type: 'font',
        },
      ],
      definitions: [],
      nodes: intro?.nodes,
      scenes: [{ id: 'scene-intro', transitions: [], effects: [], sceneTransitions: [] }],
      state: { scenes: state.scenes },
    });
    expect(Object.keys(frames[0] as object)).not.toContain('timeUs');
  });

  it('changes the keys of the segments that show a changed node, and of no other', () => {
    const base = keysOf(scenesComposition, {}, SCENES);
    const keys = (document: unknown) => keysOf(document, {}, SCENES);
    // The text of a shown node.
    expect(
      changed(base, keys(edited(scenesComposition, [['scenes', 0, 'nodes', 1, 'text'], 'Hi']))),
    ).toEqual(INTRO);
    // A frame's state: the position of the outro's title.
    expect(
      changed(
        base,
        keys(edited(scenesComposition, [['scenes', 2, 'nodes', 1, 'position', 'x'], 91])),
      ),
    ).toEqual(OUTRO);
    // The html and the parameters of Custom HTML.
    const html = valueAt(scenesComposition, ['scenes', 1, 'nodes', 2, 'html']) as string;
    expect(
      changed(
        base,
        keys(edited(scenesComposition, [['scenes', 1, 'nodes', 2, 'html'], `${html} `])),
      ),
    ).toEqual(MIDDLE);
    expect(
      changed(
        base,
        keys(
          edited(scenesComposition, [
            ['scenes', 1, 'nodes', 2, 'parameters'],
            [{ key: 'accent', type: 'color', value: '#ffffff' }],
          ]),
        ),
      ),
    ).toEqual(MIDDLE);
    // The asset of a shown image: its content hash, which the document names.
    const image = (valueAt(scenesComposition, ['assets']) as { id: string }[]).findIndex(
      ({ id }) => id === 'asset-image',
    );
    expect(
      changed(
        base,
        keys(
          edited(scenesComposition, [['assets', image, 'contentHash'], `sha256:${'1'.repeat(64)}`]),
        ),
      ),
    ).toEqual(MIDDLE);
    // The font of the two titles.
    const font = (valueAt(scenesComposition, ['assets']) as { id: string }[]).findIndex(
      ({ id }) => id === 'asset-font',
    );
    expect(
      changed(
        base,
        keys(
          edited(scenesComposition, [['assets', font, 'contentHash'], `sha256:${'2'.repeat(64)}`]),
        ),
      ),
    ).toEqual([...INTRO, ...OUTRO]);
    // A sound is the audio pass's, which renders without a browser (D47.4).
    expect(
      changed(base, keys(edited(scenesComposition, [['scenes', 1, 'clips', 0, 'volume'], 0.5]))),
    ).toEqual([]);
    expect(changed(base, keys(edited(scenesComposition, [['clips', 0, 'volume'], 0.25])))).toEqual(
      [],
    );
    // The document's own clear: every video job draws over white (D89.2).
    expect(changed(base, keys(edited(scenesComposition, [['clear'], 'transparent'])))).toEqual([]);
  });

  it('changes the keys of every segment that shows a changed gradient', () => {
    const shapes = at720(shapesComposition);
    const base = keysOf(shapes, {}, { segmentFrames: 15 });
    const after = keysOf(
      edited(shapes, [['scenes', 0, 'nodes', 1, 'fill', 'stops', 1, 'color'], '#ee46bd']),
      {},
      { segmentFrames: 15 },
    );
    expect(valueAt(shapesComposition, ['scenes', 0, 'nodes', 1, 'id'])).toBe('shape-rect');
    expect(changed(base, after)).toEqual(base.map(({ index }) => index));
  });

  it('changes the keys of the scenes of a changed scene transition only', () => {
    // Scenes a, b, c, d, e of 30, 30, 30, 30, 36 frames, each transition 12 frames over the next scene.
    const transitions = at720(transitionsComposition);
    const base = keysOf(transitions, {}, { segmentFrames: 6 });
    const after = keysOf(
      edited(transitions, [['transitions', 3, 'effect', 'direction'], 'down']),
      {},
      { segmentFrames: 6 },
    );
    const composition = valid(transitions);
    const shows = (segment: SegmentKey, ids: readonly string[]) =>
      Array.from({ length: segment.frameCount }, (_, offset) =>
        evaluateComposition(composition, frameToTimeUs(segment.firstFrame + offset, 30)),
      ).some((state) => state.scenes.some(({ id }) => ids.includes(id)));
    const expected = base.filter((segment) => shows(segment, ['scene-d', 'scene-e']));
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(base.length);
    expect(changed(base, after)).toEqual(expected.map(({ index }) => index));
  });

  it('changes every key with a pin, the preset, or the runtime build', () => {
    const composition = valid(scenesComposition);
    const pins = pinnedKeyPins(RUNTIME);
    const settings = { preset: '720p', fonts: FONTS, segmentFrames: 15 };
    const base = segmentKeysWith(composition, {}, settings, pins).segments;
    expect(base).toEqual(keysOf(scenesComposition, {}, SCENES));
    const variants: SegmentKeyPins[] = [
      { ...pins, runtime: `sha256:${'3'.repeat(64)}` },
      ...Object.keys(pins.browser).map((name) => ({
        ...pins,
        browser: {
          ...pins.browser,
          [name]:
            name === 'args'
              ? [...CHROMIUM_ARGS, '--x']
              : name === 'deviceScaleFactor'
                ? 2
                : 'other',
        },
      })),
      ...Object.keys(pins.ffmpeg).map((name) => ({
        ...pins,
        ffmpeg: { ...pins.ffmpeg, [name]: 'other' },
      })),
    ];
    expect(variants).toHaveLength(1 + 10 + 7);
    for (const variant of variants) {
      const after = segmentKeysWith(composition, {}, settings, variant).segments;
      expect(changed(base, after)).toEqual(base.map(({ index }) => index));
    }
    const other = segmentKeysWith(composition, {}, { ...settings, preset: '1080p' }, pins).segments;
    expect(changed(base, other)).toEqual(base.map(({ index }) => index));
    expect(
      segmentKeys(scenesComposition, {}, { ...settings, runtime: { contentHash: 'sha256:x' } })
        .segments[0]?.key,
    ).not.toBe(base[0]?.key);
  });

  it('keeps the keys of a scene that a longer scene before it moved in time, on spans at the scenes', () => {
    const before = keysOf(scenesComposition, { spans: [0, 1_000_000, 2_500_000] }, SCENES);
    // The intro 6 frames longer: the middle starts at frame 36 instead of 30.
    const longer = edited(
      scenesComposition,
      [['durationUs'], 3_400_000],
      [['scenes', 0, 'durationUs'], 1_200_000],
    );
    const after = keysOf(longer, { spans: [0, 1_200_000, 2_700_000] }, SCENES);
    expect(
      before.map(({ span, firstFrame, frameCount }) => [span, firstFrame, frameCount]),
    ).toEqual([
      [0, 0, 15],
      [0, 15, 15],
      [1, 30, 15],
      [1, 45, 15],
      [1, 60, 15],
      [2, 75, 15],
      [2, 90, 6],
    ]);
    expect(after.map(({ span, firstFrame, frameCount }) => [span, firstFrame, frameCount])).toEqual(
      [
        [0, 0, 15],
        [0, 15, 15],
        [0, 30, 6],
        [1, 36, 15],
        [1, 51, 15],
        [1, 66, 15],
        [2, 81, 15],
        [2, 96, 6],
      ],
    );
    // The intro's first two segments and every segment of the moved scenes keep their keys.
    const keys = (list: readonly SegmentKey[]) => list.map(({ key }) => key);
    expect(keys(after.slice(0, 2))).toEqual(keys(before.slice(0, 2)));
    expect(keys(after.slice(3))).toEqual(keys(before.slice(2)));
    expect(keys(before)).not.toContain(after[2]?.key);
    // Without spans the boundaries stay where they were, and every key after the intro changes.
    const moved = keysOf(longer, {}, SCENES);
    expect(keys(moved.slice(2)).filter((key) => keys(before).includes(key))).toEqual([]);
  });

  it('lists the Custom HTML nodes active in each segment (D92, question 9)', () => {
    const keys = keysOf(scenesComposition, { spans: [0, 1_000_000, 2_500_000] }, SCENES);
    expect(keys.map(({ customHtmlNodeIds }) => customHtmlNodeIds)).toEqual([
      [],
      [],
      ['middle-html'],
      ['middle-html'],
      ['middle-html'],
      [],
      [],
    ]);
    // html-script starts at 1 s: the first segment of 30 frames shows html-css alone.
    const custom = keysOf(at720(customHtmlComposition), {}, { segmentFrames: 30 });
    expect(custom[0]?.customHtmlNodeIds).toEqual(['html-css']);
    expect(custom[1]?.customHtmlNodeIds).toEqual(['html-css', 'html-script']);
  });

  it('refuses a measured node without the metrics of its font (D83.7)', () => {
    expect(codeOf(() => keysOf(at720(framedTextComposition), {}, { fonts: new Map() }))).toBe(
      'font-metrics-missing',
    );
    expect(keysOf(at720(framedTextComposition))).not.toHaveLength(0);
    expect(keysOf(at720(numberComposition))).not.toHaveLength(0);
  });

  it('refuses what a render job refuses, before evaluating a frame', () => {
    expect(codeOf(() => keysOf({ schemaVersion: '0.31' }))).toBe('invalid-document');
    expect(codeOf(() => keysOf(at720(templateComposition)))).toBe('invalid-document');
    expect(codeOf(() => keysOf(shapesComposition))).toBe('preset-unsupported');
    expect(codeOf(() => keysOf(scenesComposition, {}, { preset: '4k' }))).toBe(
      'preset-unsupported',
    );
    expect(codeOf(() => keysOf(scenesComposition, {}, { segmentFrames: 0 }))).toBe(
      'segment-length-invalid',
    );
    expect(codeOf(() => keysOf(scenesComposition, { minSegmentFrames: 61 }))).toBe(
      'segment-length-invalid',
    );
    expect(codeOf(() => keysOf(scenesComposition, { range: { fromUs: 1, toUs: 2_000_000 } }))).toBe(
      'range-invalid',
    );
    expect(codeOf(() => keysOf(scenesComposition, {}, { limits: { maxFrames: 95 } }))).toBe(
      'limit-exceeded',
    );
    expect(keysOf(scenesComposition, {}, { limits: { maxFrames: 96 } })).toHaveLength(2);
  });
});

describe('the grid of spans (D92.2)', () => {
  const composition = valid(scenesComposition);

  it('refuses spans that are not increasing frame times inside the grid, from its start', () => {
    const grid = segmentGrid(composition, 15, { range: { fromUs: 500_000, toUs: 3_000_000 } });
    for (const spans of [
      [],
      [0],
      [500_000, 500_000],
      [500_000, 1_000_000, 900_000],
      [500_000, 1_000_001],
      [500_000, 3_000_000],
      [500_000, 3_100_000],
      [500_000, 1.5],
      [500_000, Number.NaN],
    ]) {
      expect(
        codeOf(() => gridSpans(composition, grid, spans)),
        JSON.stringify(spans),
      ).toBe('range-invalid');
    }
    expect(gridSpans(composition, grid, [500_000, 2_966_666])).toEqual([
      { fromUs: 500_000, firstFrame: 15 },
      { fromUs: 2_966_666, firstFrame: 89 },
    ]);
    expect(gridSpans(composition, grid, undefined)).toEqual([{ fromUs: 500_000, firstFrame: 15 }]);
    expect(codeOf(() => keysOf(scenesComposition, { spans: [0, 33_333] }))).toBeUndefined();
    expect(codeOf(() => keysOf(scenesComposition, { spans: [33_333] }))).toBe('range-invalid');
  });

  it('lays the grid of D80.1 inside each span and counts the segments of the whole grid', () => {
    const grid = segmentGrid(composition, 10, { minSegmentFrames: 4 });
    // Spans of 23, 2, and 71 frames: 10 + 13 (a last 3 merged), 2 alone, 10 × 6 + 11.
    const spans = gridSpans(composition, grid, [0, 766_666, 833_333]);
    expect(
      spanSegments(grid, spans).map((s) => [s.index, s.span, s.firstFrame, s.frameCount]),
    ).toEqual([
      [0, 0, 0, 10],
      [1, 0, 10, 13],
      [2, 1, 23, 2],
      [3, 2, 25, 10],
      [4, 2, 35, 10],
      [5, 2, 45, 10],
      [6, 2, 55, 10],
      [7, 2, 65, 10],
      [8, 2, 75, 10],
      [9, 2, 85, 11],
    ]);
    // One span is the grid of D80 and of D47.1.
    expect(spanSegments(grid, gridSpans(composition, grid, undefined))).toEqual(
      gridSegments(grid).map((segment) => ({ ...segment, span: 0 })),
    );
  });

  it('keeps 2 000 seeded grids of spans contiguous, covering, and within their bounds', () => {
    let seed = 92;
    const next = (below: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % below;
    };
    for (let run = 0; run < 2_000; run += 1) {
      const segmentFrames = 1 + next(40);
      const minSegmentFrames = 1 + next(segmentFrames);
      const grid = segmentGrid(composition, segmentFrames, { minSegmentFrames });
      const starts = [...new Set([0, ...Array.from({ length: next(6) }, () => next(96))])].sort(
        (a, b) => a - b,
      );
      const spans = gridSpans(
        composition,
        grid,
        starts.map((frame) => frameToTimeUs(frame, 30)),
      );
      const segments = spanSegments(grid, spans);
      let frame = 0;
      for (const [index, segment] of segments.entries()) {
        expect(segment.index).toBe(index);
        expect(segment.firstFrame).toBe(frame);
        const span = spans[segment.span];
        const end = spans[segment.span + 1]?.firstFrame ?? 96;
        expect(segment.firstFrame).toBeGreaterThanOrEqual(span?.firstFrame ?? -1);
        expect(segment.firstFrame + segment.frameCount).toBeLessThanOrEqual(end);
        expect(segment.frameCount).toBeLessThan(segmentFrames + minSegmentFrames);
        const alone = end - (span?.firstFrame ?? 0) < minSegmentFrames;
        if (!alone) expect(segment.frameCount).toBeGreaterThanOrEqual(minSegmentFrames);
        frame += segment.frameCount;
      }
      expect(frame).toBe(96);
    }
  });
});

/**
 * The paths of a document's fields that no frame's record holds, each with the
 * reason the renderer does not read it beside the state (D92, Verification).
 */
const NOT_IN_A_RECORD: readonly (readonly [RegExp, string])[] = [
  [
    /^schemaVersion$/,
    'every document a job renders is of the version this build reads; the runtime build names it',
  ],
  [/^(width|height|fps)$/, 'the canvas, which the key holds as canvas and preset'],
  [/^durationUs$/, 'the frame grid: each frame time, at which every state is evaluated'],
  [/^safeArea\./, 'no runtime and no renderer reads it; the editor places captions by it (D70)'],
  [/^clear$/, 'every video job draws over white (D89.2), which the key holds as browser.clear'],
  [
    /^clips\[/,
    'sounds: the audio pass renders them without a browser and has no key (D47.4, D92.4)',
  ],
  [/^scenes\[\d+\]\.clips\[/, 'sounds of a scene: the audio pass (D47.4, D92.4)'],
  [
    /^scenes\[\d+\]\.durationUs$/,
    'places the scenes: each state names the scenes it shows and their times (question 4)',
  ],
];

/** Every leaf of a JSON value, with its path and the objects and arrays above it. */
function leaves(
  value: unknown,
  path = '',
  above: readonly unknown[] = [],
  found: { path: string; above: readonly unknown[] }[] = [],
): { path: string; above: readonly unknown[] }[] {
  if (Array.isArray(value)) {
    value.forEach((item, at) => leaves(item, `${path}[${String(at)}]`, [...above, value], found));
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      leaves(item, path === '' ? key : `${path}.${key}`, [...above, value], found);
    }
  } else {
    found.push({ path, above });
  }
  return found;
}

/** Every object and array a record holds, by identity. */
function held(value: unknown, found: Set<unknown>): void {
  if (typeof value !== 'object' || value === null || found.has(value)) return;
  found.add(value);
  for (const item of Object.values(value)) held(item, found);
}

describe('every field of the fixture documents reaches the key, or is listed with its reason', () => {
  const fixtures = {
    reference: referenceComposition,
    scenes: scenesComposition,
    transitions: transitionsComposition,
    clipTransitions: clipTransitionsComposition,
    captions: captionsComposition,
    captionsMotion: captionsMotionComposition,
    clear: clearComposition,
    compositing: compositingComposition,
    corners: cornersComposition,
    customHtml: customHtmlComposition,
    easing: easingComposition,
    effects: effectsComposition,
    effectsSvg: effectsSvgComposition,
    elements: elementsComposition,
    focus: focusComposition,
    framedText: framedTextComposition,
    lifetime: lifetimeComposition,
    motion: motionComposition,
    nested: nestedComposition,
    number: numberComposition,
    shapes: shapesComposition,
    speed: speedComposition,
    svg: svgComposition,
    text: textComposition,
    video: videoComposition,
  };

  it('leaves out only the templates, which no job renders', () => {
    expect(codeOf(() => keysOf(at720(repeatsComposition)))).toBe('invalid-document');
  });

  it.each(Object.entries(fixtures))('%s', (_, fixture) => {
    const composition = valid(fixture);
    const document = keyDocument(composition);
    // The records of every frame, on segments of 30 frames; a fixture of 640 × 360
    // has no preset, and the records do not depend on one.
    const segments = gridSegments(segmentGrid(composition, 30));
    const inRecords = new Set<unknown>();
    const scenesOf = new Map<unknown, Set<number>>();
    const namedAssets = new Set<string>();
    const sceneFields = new Set<string>();
    for (const segment of segments) {
      for (let offset = 0; offset < segment.frameCount; offset += 1) {
        const state = evaluateComposition(
          composition,
          frameToTimeUs(segment.firstFrame + offset, composition.fps),
          FONTS,
        );
        const record = frameRecord(document, state) as {
          assets: { id: string }[];
          nodes: unknown[];
          scenes: Record<string, unknown>[];
        };
        held(record, inRecords);
        for (const { id } of record.assets) namedAssets.add(id);
        for (const scene of record.scenes) {
          for (const key of Object.keys(scene)) sceneFields.add(`${String(scene.id)}.${key}`);
        }
        // A node's object is in the record of every frame whose state shows its scene, and no other.
        for (const node of record.nodes) {
          const shown = scenesOf.get(node) ?? new Set<number>();
          shown.add(segment.index);
          scenesOf.set(node, shown);
        }
        const ids = new Set(state.scenes.map(({ id }) => id));
        for (const scene of composition.scenes) {
          for (const node of scene.nodes) {
            expect(record.nodes.includes(node)).toBe(ids.has(scene.id));
          }
        }
      }
    }
    const unread: string[] = [];
    for (const { path, above } of leaves(composition)) {
      if (above.some((object) => inRecords.has(object) && object !== composition)) continue;
      const scene = /^scenes\[(\d+)\]\.([a-zA-Z]+)$/.exec(path);
      if (scene !== null) {
        const id = composition.scenes[Number(scene[1])]?.id;
        if (sceneFields.has(`${String(id)}.${String(scene[2])}`)) continue;
      }
      const asset = /^assets\[(\d+)\]\.(id|type|contentHash)$/.exec(path);
      if (asset !== null) {
        const id = composition.assets[Number(asset[1])]?.id ?? '';
        if (namedAssets.has(id)) continue;
        // An asset no drawn object names: a sound of a clip, never in a record.
        const silent = structuredClone(fixture) as {
          clips: unknown[];
          scenes: { clips: unknown[] }[];
        };
        silent.clips = [];
        for (const one of silent.scenes) one.clips = [];
        const drawn = JSON.stringify(silent);
        expect(drawn.split(`"${id}"`).length - 1, `${path} is named by a drawn object`).toBe(1);
        continue;
      }
      if (NOT_IN_A_RECORD.some(([pattern]) => pattern.test(path))) continue;
      unread.push(path);
    }
    expect(unread).toEqual([]);
  });
});

describe('measuredFontMetrics', () => {
  const [, , font] = generateReferenceAssets();
  const proportional = generateProportionalFontAsset();
  const hashes = new Map(
    (valueAt(framedTextComposition, ['assets']) as { id: string; contentHash: string }[]).map(
      ({ id, contentHash }) => [id, contentHash],
    ),
  );

  it('reads the fonts of the measured nodes and nothing else, verified by their hashes', async () => {
    const asked: string[] = [];
    const fonts = await measuredFontMetrics(framedTextComposition, ({ id }) => {
      asked.push(id);
      return { bytes: proportional.bytes, mediaType: 'font/ttf' };
    });
    expect(asked).toEqual(['asset-font-proportional']);
    expect(hashes.get('asset-font-proportional')).toBe(sha256(proportional.bytes));
    expect(fonts).toEqual(new Map([['asset-font-proportional', fontMetrics(proportional.bytes)]]));
    expect(keysOf(at720(framedTextComposition), {}, { fonts })).toEqual(
      keysOf(at720(framedTextComposition)),
    );
    const none: string[] = [];
    await expect(
      measuredFontMetrics(scenesComposition, ({ id }) => {
        none.push(id);
        return null;
      }),
    ).resolves.toEqual(new Map());
    expect(none).toEqual([]);
  });

  it('refuses a font that is missing, changed, too large, or unmeasurable', async () => {
    const bytes = { bytes: proportional.bytes, mediaType: 'font/ttf' };
    expect(await codeOfAsync(() => measuredFontMetrics(framedTextComposition, () => null))).toBe(
      'asset-missing',
    );
    expect(
      await codeOfAsync(() =>
        measuredFontMetrics(framedTextComposition, () => ({
          bytes: font?.bytes ?? new Uint8Array(),
          mediaType: 'font/ttf',
        })),
      ),
    ).toBe('asset-hash-mismatch');
    expect(
      await codeOfAsync(() =>
        measuredFontMetrics(framedTextComposition, () => bytes, { maxAssetBytes: 10 }),
      ),
    ).toBe('limit-exceeded');
    expect(
      await codeOfAsync(() =>
        measuredFontMetrics(framedTextComposition, () => bytes, { maxTotalAssetBytes: 10 }),
      ),
    ).toBe('limit-exceeded');
    expect(await codeOfAsync(() => measuredFontMetrics({}, () => bytes))).toBe('invalid-document');
    const junk = new TextEncoder().encode('not a font');
    const junkDocument = edited(framedTextComposition, [
      ['assets', 0, 'contentHash'],
      sha256(junk),
    ]);
    expect(valueAt(framedTextComposition, ['assets', 0, 'id'])).toBe('asset-font-proportional');
    expect(
      await codeOfAsync(() =>
        measuredFontMetrics(junkDocument, () => ({ bytes: junk, mediaType: 'font/ttf' })),
      ),
    ).toBe('font-unmeasurable');
  });
});

/**
 * A film of ten minutes at 30 fps, 18 000 states: the reference scene sixty
 * times, every ID of each copy prefixed with its number (D92, question 3).
 */
function tenMinutes(): unknown {
  const reference = structuredClone(referenceComposition) as {
    durationUs: number;
    scenes: Record<string, unknown>[];
  };
  const [scene] = reference.scenes;
  const prefixed = (value: unknown, prefix: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => prefixed(item, prefix));
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'id' && typeof item === 'string' ? `${prefix}${item}` : prefixed(item, prefix),
      ]),
    );
  };
  reference.scenes = Array.from(
    { length: 60 },
    (_, at) => prefixed(scene, `s${String(at)}-`) as Record<string, unknown>,
  );
  reference.durationUs = 600_000_000;
  return reference;
}

describe('the time of the keys of a film of ten minutes (D92, question 3)', () => {
  // 18 000 states and their records: a few seconds on a worker, far more on a
  // loaded runner, so the test has a timeout of its own instead of the default.
  it('computes 300 keys of 18 000 frames and records the time', { timeout: 300_000 }, () => {
    const document = tenMinutes();
    const runtime = { contentHash: RUNTIME };
    const started = performance.now();
    const keys = segmentKeys(document, {}, { preset: '1080p', fonts: FONTS, runtime });
    const ms = performance.now() - started;
    expect(keys.segments).toHaveLength(300);
    expect(keys.segments.reduce((total, { frameCount }) => total + frameCount, 0)).toBe(18_000);
    // The copies draw the same pictures, but their nodes have other IDs.
    expect(new Set(keys.segments.map(({ key }) => key)).size).toBe(300);
    const out = fileURLToPath(new URL('../../../.kadrion-out/segment-keys/', import.meta.url));
    mkdirSync(out, { recursive: true });
    writeFileSync(
      `${out}time.json`,
      `${JSON.stringify(
        {
          frames: 18_000,
          segments: keys.segments.length,
          ms: Math.round(ms),
          node: process.version,
          cpu: cpus()[0]?.model ?? null,
          pinnedImage: process.env.KADRION_PINNED_IMAGE ?? null,
        },
        null,
        2,
      )}\n`,
    );
  });
});
