/**
 * `kadrion render-frames` (D28.8), `kadrion export` (D29.10), and the jobs of a
 * segmented render and stills (D47) with injected
 * Producer functions: arguments, the asset map and its relative paths, the
 * files written, where FFmpeg comes from, and the exit codes; `kadrion
 * check-custom-html` (D93) with an injected check and browser; and `kadrion
 * inspect` (D79.6) with an injected verdict. That the default functions render
 * and encode, and inspect real files, is `tests/pinned`'s business.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkCustomHtmlSource } from '@kadrion/editor-sdk';
import {
  ProducerError,
  segmentKeys,
  type AudioRequest,
  type CustomHtmlCheck,
  type CustomHtmlCheckRequest,
  type LaunchedChromium,
  type AudioResult,
  type ExportRequest,
  type ExportResult,
  type JoinRequest,
  type JoinResult,
  type RenderRequest,
  type RenderResult,
  type SegmentKeysGrid,
  type SegmentKeysSettings,
  type SegmentsRequest,
  type SegmentsResult,
  type StillRequest,
  type StillResult,
} from '@kadrion/producer';
import type { VideoInspection } from '@kadrion/player';
import {
  cornersComposition,
  customHtmlComposition,
  generateProportionalFontAsset,
  generateReferenceAssets,
  referenceComposition,
} from '@kadrion/test-fixtures';
import { afterAll, describe, expect, it } from 'vitest';

import {
  AUDIO_MANIFEST_NAME,
  EXIT_CANCELLED,
  EXIT_LIMIT_EXCEEDED,
  EXIT_OK,
  EXIT_PRODUCER_ERROR,
  EXIT_USAGE,
  frameFileName,
  JOB_COMMANDS,
  parseAssetMap,
  parseTimes,
  runCli,
  segmentsManifestName,
  stillFileNames,
  USAGE,
} from '../src/index.js';

/** Every line of a job's standard output parses as JSON (D48.1). */
function lines(out: readonly string[]): unknown[] {
  return out.map((line) => JSON.parse(line) as unknown);
}

const done = (manifest: string | null) => ({ event: 'done', manifest });
const file = (name: string) => ({ event: 'file', file: name });

/**
 * A scratch directory under the system's temporary directory, removed after
 * the file's tests: what a test leaves there slows every later scan of it,
 * such as the frame watch of the pinned export test.
 */
const scratchDirectories: string[] = [];
function scratchDirectory(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirectories.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of scratchDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) },
  };
}

/** A directory with the reference composition, its generated assets, and an asset map. */
function workspace(): { dir: string; args: string[] } {
  const dir = scratchDirectory('kadrion-cli-');
  writeFileSync(join(dir, 'composition.json'), JSON.stringify(referenceComposition));
  const map: Record<string, { path: string; mediaType: string }> = {};
  for (const asset of generateReferenceAssets()) {
    writeFileSync(join(dir, `${asset.id}.bin`), asset.bytes);
    map[asset.id] = { path: `${asset.id}.bin`, mediaType: asset.mediaType };
  }
  writeFileSync(join(dir, 'assets.json'), JSON.stringify(map));
  return {
    dir,
    args: [
      'render-frames',
      '--composition',
      join(dir, 'composition.json'),
      '--assets',
      join(dir, 'assets.json'),
      '--out',
      join(dir, 'out'),
      '--times',
      '0,2500000',
    ],
  };
}

/** Resolves every asset like the Producer and returns one fake PNG per time. */
function fakeRender(seen: RenderRequest[]) {
  return async (request: RenderRequest): Promise<RenderResult> => {
    seen.push(request);
    for (const id of ['asset-image', 'asset-audio', 'asset-font']) {
      await request.resolveAsset({ id, type: 'image', contentHash: 'sha256:x' });
    }
    const frames = request.timesUs.map((timeUs) => ({
      index: Math.round((timeUs * 30) / 1_000_000),
      timeUs,
      png: Uint8Array.of(137, 80, 78, 71),
    }));
    return {
      frames,
      manifest: {
        runtime: { contentHash: 'sha256:runtime' },
        frames: frames.map(({ index, timeUs }) => ({
          index,
          timeUs,
          sha256: `sha256:${String(index)}`,
        })),
      } as unknown as RenderResult['manifest'],
    };
  };
}

describe('kadrion render-frames (D28.8)', () => {
  it('passes the document and the times through, and resolves assets from paths relative to the map', async () => {
    const { dir, args } = workspace();
    const seen: RenderRequest[] = [];
    const { out, io: streams } = io();
    await expect(runCli(args, streams, { render: fakeRender(seen) })).resolves.toBe(EXIT_OK);
    expect(seen[0]?.document).toEqual(referenceComposition);
    expect(seen[0]?.timesUs).toEqual([0, 2_500_000]);
    const font = await seen[0]?.resolveAsset({ id: 'asset-font', type: 'font', contentHash: 'x' });
    expect(font?.mediaType).toBe('font/ttf');
    expect(
      Buffer.from(font !== null && font !== undefined && 'bytes' in font ? font.bytes : []).equals(
        Buffer.from(generateReferenceAssets()[2]?.bytes ?? []),
      ),
    ).toBe(true);
    await expect(
      seen[0]?.resolveAsset({ id: 'asset-other', type: 'image', contentHash: 'x' }),
    ).resolves.toBeNull();
    expect(readdirSync(join(dir, 'out')).sort()).toEqual([
      'frame-000000.png',
      'frame-000075.png',
      'render-manifest.json',
    ]);
    const manifest = JSON.parse(readFileSync(join(dir, 'out', 'render-manifest.json'), 'utf8')) as {
      runtime: { contentHash: string };
    };
    expect(manifest.runtime.contentHash).toBe('sha256:runtime');
    expect(lines(out)).toEqual([
      file('frame-000000.png'),
      file('frame-000075.png'),
      file('render-manifest.json'),
      done('render-manifest.json'),
    ]);
  });

  it('exits 1 with the code of a ProducerError', async () => {
    const { args } = workspace();
    const { err, io: streams } = io();
    const failing = () => Promise.reject(new ProducerError('asset-hash-mismatch', 'wrong bytes'));
    await expect(runCli(args, streams, { render: failing })).resolves.toBe(EXIT_PRODUCER_ERROR);
    expect(err).toEqual(['error asset-hash-mismatch: wrong bytes']);
  });

  it.each([
    ['no command', []],
    ['another command', ['render']],
    ['a missing option', ['render-frames', '--times', '0']],
    ['an unknown option', ['render-frames', '--golden']],
    ['a positional argument', ['render-frames', 'extra']],
  ])('exits 2 for %s and prints the usage', async (_, args) => {
    const { err, io: streams } = io();
    await expect(runCli(args, streams, { render: never, exportMp4: never })).resolves.toBe(
      EXIT_USAGE,
    );
    expect(err).toContain(USAGE);
  });

  it('exits 2 for unreadable files and malformed times, before rendering', async () => {
    const { args } = workspace();
    const withValue = (option: string, value: string) => {
      const copy = [...args];
      copy[copy.indexOf(option) + 1] = value;
      return copy;
    };
    for (const variant of [
      withValue('--composition', 'missing.json'),
      withValue('--assets', 'missing.json'),
      withValue('--times', '0,,1'),
      withValue('--times', '2.5'),
    ]) {
      await expect(runCli(variant, io().io, { render: never })).resolves.toBe(EXIT_USAGE);
    }
  });
});

/** The export's arguments for the workspace of `workspace()`. */
function exportArgs(dir: string, ...extra: string[]): string[] {
  return [
    'export',
    '--composition',
    join(dir, 'composition.json'),
    '--assets',
    join(dir, 'assets.json'),
    '--out',
    join(dir, 'out'),
    '--preset',
    '720p',
    ...extra,
  ];
}

/** Resolves the audio like the Producer and writes a fake MP4 where it was asked to. */
function fakeExport(seen: ExportRequest[]) {
  return async (request: ExportRequest): Promise<ExportResult> => {
    seen.push(request);
    await request.resolveAsset({ id: 'asset-audio', type: 'audio', contentHash: 'x' });
    writeFileSync(request.outputPath, 'mp4');
    return {
      outputPath: request.outputPath,
      stats: { framesWritten: 300, maxFramesInFlight: 2 },
      manifest: {
        runtime: { contentHash: 'sha256:runtime' },
        frames: new Array(300).fill({}),
        preset: { name: 'mp4-720p' },
        ffmpeg: { version: 'n8.1.3-20260921' },
      } as unknown as ExportResult['manifest'],
    };
  };
}

const never = () => Promise.reject(new Error('must not run'));

describe('kadrion export (D29.10)', () => {
  it('passes the document, the preset, the output path, and the flags through, and writes the manifest', async () => {
    const { dir } = workspace();
    const seen: ExportRequest[] = [];
    const { out, io: streams } = io();
    const args = exportArgs(dir, '--ffmpeg', '/opt/f/ffmpeg', '--ffprobe', '/opt/f/ffprobe');
    await expect(
      runCli(args, streams, { exportMp4: fakeExport(seen), render: never, env: {} }),
    ).resolves.toBe(EXIT_OK);
    expect(seen[0]?.document).toEqual(referenceComposition);
    expect(seen[0]?.preset).toBe('720p');
    expect(seen[0]?.outputPath).toBe(join(dir, 'out', 'video-720p.mp4'));
    expect(seen[0]?.ffmpeg).toEqual({ ffmpegPath: '/opt/f/ffmpeg', ffprobePath: '/opt/f/ffprobe' });
    const audio = await seen[0]?.resolveAsset({
      id: 'asset-audio',
      type: 'audio',
      contentHash: 'x',
    });
    // Video and audio are handed over by path, never read into memory (D64.1).
    expect(audio).toEqual({ path: join(dir, 'asset-audio.bin'), mediaType: 'audio/wav' });
    expect(readdirSync(join(dir, 'out')).sort()).toEqual([
      'video-720p.mp4',
      'video-720p.render-manifest.json',
    ]);
    expect(lines(out)).toEqual([
      file('video-720p.mp4'),
      file('video-720p.render-manifest.json'),
      done('video-720p.render-manifest.json'),
    ]);
  });

  it('takes the executables from KADRION_FFMPEG and KADRION_FFPROBE, and the flags first', async () => {
    const { dir } = workspace();
    const seen: ExportRequest[] = [];
    const env = {
      KADRION_FFMPEG: '/env/ffmpeg',
      KADRION_FFPROBE: '/env/ffprobe',
      PATH: '/usr/bin',
    };
    await runCli(exportArgs(dir), io().io, { exportMp4: fakeExport(seen), env });
    await runCli(exportArgs(dir, '--ffprobe', '/flag/ffprobe'), io().io, {
      exportMp4: fakeExport(seen),
      env,
    });
    expect(seen.map(({ ffmpeg }) => ffmpeg)).toEqual([
      { ffmpegPath: '/env/ffmpeg', ffprobePath: '/env/ffprobe' },
      { ffmpegPath: '/env/ffmpeg', ffprobePath: '/flag/ffprobe' },
    ]);
  });

  it('exits 1 with ffmpeg-missing, before exporting, when neither flag nor variable names FFmpeg', async () => {
    const { dir } = workspace();
    const { err, io: streams } = io();
    await expect(
      runCli(exportArgs(dir, '--ffmpeg', '/opt/f/ffmpeg'), streams, {
        exportMp4: never,
        env: { PATH: '/usr/bin:/usr/local/bin' },
      }),
    ).resolves.toBe(EXIT_PRODUCER_ERROR);
    expect(err.join('\n')).toMatch(/^error ffmpeg-missing: .*PATH is never searched/);
  });

  it('exits 1 with the code of a ProducerError of the export', async () => {
    const { dir } = workspace();
    const { err, io: streams } = io();
    const failing = () =>
      Promise.reject(new ProducerError('encode-failed', 'FFmpeg exited with 1'));
    await expect(
      runCli(exportArgs(dir), streams, {
        exportMp4: failing,
        env: { KADRION_FFMPEG: '/f', KADRION_FFPROBE: '/p' },
      }),
    ).resolves.toBe(EXIT_PRODUCER_ERROR);
    expect(err).toEqual(['error encode-failed: FFmpeg exited with 1']);
  });

  it.each([
    ['a missing preset', ['export', '--composition', 'c', '--assets', 'a', '--out', 'o']],
    [
      'a preset that could name a path',
      ['export', '--composition', 'c', '--assets', 'a', '--out', 'o', '--preset', '../x'],
    ],
    ['an unknown option', ['export', '--frames']],
  ])('exits 2 for %s', async (_, args) => {
    const { err, io: streams } = io();
    await expect(runCli(args, streams, { exportMp4: never, env: {} })).resolves.toBe(EXIT_USAGE);
    expect(err).toContain(USAGE);
  });
});

/** The arguments of a command that reads the workspace's document and assets. */
function documentArgs(command: string, dir: string, ...extra: string[]): string[] {
  return [
    command,
    '--composition',
    join(dir, 'composition.json'),
    '--assets',
    join(dir, 'assets.json'),
    '--out',
    join(dir, 'out'),
    ...extra,
  ];
}

const FFMPEG_ENV = { KADRION_FFMPEG: '/env/ffmpeg', KADRION_FFPROBE: '/env/ffprobe' };

/** Writes the segment files a range asks for and returns their manifest. */
function fakeRange(seen: SegmentsRequest[]) {
  return (request: SegmentsRequest): Promise<SegmentsResult> => {
    seen.push(request);
    const segments = [2, 3, 4].map((index) => ({
      index,
      firstFrame: index * 60,
      frameCount: 60,
      file: `segment-00000${String(index)}.mp4`,
      sha256: `sha256:${String(index)}`,
    }));
    for (const { file } of segments) writeFileSync(join(request.outputDirectory, file), 'mp4');
    return Promise.resolve({
      stats: { framesWritten: 180, maxFramesInFlight: 2 },
      manifest: {
        kind: 'segments',
        runtime: { contentHash: 'sha256:runtime' },
        preset: { name: 'mp4-720p' },
        segments,
      } as unknown as SegmentsResult['manifest'],
    });
  };
}

function fakeAudio(seen: AudioRequest[], silent = false) {
  return (request: AudioRequest): Promise<AudioResult> => {
    seen.push(request);
    if (!silent) writeFileSync(join(request.outputDirectory, 'audio.wav'), 'wav');
    return Promise.resolve({
      manifest: {
        kind: 'audio',
        compositionHash: 'sha256:doc',
        audio: silent
          ? null
          : { rangeSampleCount: 96_000, sha256: 'sha256:wav', file: 'audio.wav' },
      } as unknown as AudioResult['manifest'],
    });
  };
}

describe('kadrion render-range (D47.3)', () => {
  it('passes the range, the segment length, and the directory through, and writes the manifest last', async () => {
    const { dir } = workspace();
    const seen: SegmentsRequest[] = [];
    const { out, io: streams } = io();
    const args = documentArgs(
      'render-range',
      dir,
      ...['--preset', '720p', '--from-us', '4000000', '--to-us', '10000000'],
      ...['--segment-frames', '60'],
    );
    await expect(
      runCli(args, streams, { renderRange: fakeRange(seen), env: FFMPEG_ENV }),
    ).resolves.toBe(EXIT_OK);
    expect(seen[0]).toMatchObject({
      preset: '720p',
      range: { fromUs: 4_000_000, toUs: 10_000_000 },
      segmentFrames: 60,
      outputDirectory: join(dir, 'out'),
      ffmpeg: { ffmpegPath: '/env/ffmpeg', ffprobePath: '/env/ffprobe' },
    });
    expect(seen[0]?.document).toEqual(referenceComposition);
    expect(readdirSync(join(dir, 'out')).sort()).toEqual([
      'segment-000002.mp4',
      'segment-000003.mp4',
      'segment-000004.mp4',
      'segments-000002-000004.manifest.json',
    ]);
    expect(lines(out)).toEqual([
      file('segment-000002.mp4'),
      file('segment-000003.mp4'),
      file('segment-000004.mp4'),
      file('segments-000002-000004.manifest.json'),
      done('segments-000002-000004.manifest.json'),
    ]);
  });

  it('renders the whole composition without a range', async () => {
    const { dir } = workspace();
    const seen: SegmentsRequest[] = [];
    await runCli(documentArgs('render-range', dir, '--preset', '1080p'), io().io, {
      renderRange: fakeRange(seen),
      env: FFMPEG_ENV,
    });
    expect(seen[0]?.range).toBeUndefined();
    expect(seen[0]?.segmentFrames).toBeUndefined();
    // No grid flag, no grid: the composition's grid of D47.1 (D80.2).
    expect(seen[0] !== undefined && 'grid' in seen[0]).toBe(false);
  });

  it('passes a grid anchored on a span and its shortest last segment through (D80)', async () => {
    const { dir } = workspace();
    const seen: SegmentsRequest[] = [];
    const grid = ['--grid-from-us', '233333', '--grid-to-us', '2466666'];
    for (const extra of [
      [...grid, '--min-segment-frames', '15', '--from-us', '233333', '--to-us', '1233333'],
      [...grid],
      ['--min-segment-frames', '30'],
    ]) {
      await runCli(
        documentArgs('render-range', dir, '--preset', '720p', '--segment-frames', '30', ...extra),
        io().io,
        { renderRange: fakeRange(seen), env: FFMPEG_ENV },
      );
    }
    expect(seen.map(({ grid: given, range }) => ({ grid: given, range }))).toEqual([
      {
        grid: { range: { fromUs: 233_333, toUs: 2_466_666 }, minSegmentFrames: 15 },
        range: { fromUs: 233_333, toUs: 1_233_333 },
      },
      { grid: { range: { fromUs: 233_333, toUs: 2_466_666 } }, range: undefined },
      { grid: { minSegmentFrames: 30 }, range: undefined },
    ]);
  });

  it.each([
    ['one end of the range only', ['--preset', '720p', '--from-us', '0']],
    [
      'a range end that is not an integer',
      ['--preset', '720p', '--from-us', '0', '--to-us', '2e6'],
    ],
    ['a segment length that is not an integer', ['--preset', '720p', '--segment-frames', '-1']],
    ['a preset that could name a path', ['--preset', '../x']],
    ['one end of the grid only', ['--preset', '720p', '--grid-from-us', '0']],
    [
      'a shortest segment that is not an integer',
      ['--preset', '720p', '--min-segment-frames', '1.5'],
    ],
  ])('exits 2 for %s, before rendering', async (_, extra) => {
    const { dir } = workspace();
    const { err, io: streams } = io();
    await expect(
      runCli(documentArgs('render-range', dir, ...extra), streams, {
        renderRange: never,
        env: FFMPEG_ENV,
      }),
    ).resolves.toBe(EXIT_USAGE);
    expect(err).toContain(USAGE);
  });

  it('exits 1 with range-invalid from the Producer', async () => {
    const { dir } = workspace();
    const { err, io: streams } = io();
    const refused = () =>
      Promise.reject(new ProducerError('range-invalid', 'fromUs is frame 30, not a boundary'));
    await expect(
      runCli(
        documentArgs(
          'render-range',
          dir,
          '--preset',
          '720p',
          '--from-us',
          '1000000',
          '--to-us',
          '4000000',
        ),
        streams,
        { renderRange: refused, env: FFMPEG_ENV },
      ),
    ).resolves.toBe(EXIT_PRODUCER_ERROR);
    expect(err).toEqual(['error range-invalid: fromUs is frame 30, not a boundary']);
  });
});

describe('kadrion render-audio (D47.4)', () => {
  it('writes the audio and its manifest, for a range or the whole composition', async () => {
    const { dir } = workspace();
    const seen: AudioRequest[] = [];
    const { out, io: streams } = io();
    await expect(
      runCli(
        documentArgs('render-audio', dir, '--from-us', '2000000', '--to-us', '4000000'),
        streams,
        { renderAudio: fakeAudio(seen), env: FFMPEG_ENV },
      ),
    ).resolves.toBe(EXIT_OK);
    expect(seen[0]?.range).toEqual({ fromUs: 2_000_000, toUs: 4_000_000 });
    expect(readdirSync(join(dir, 'out')).sort()).toEqual(['audio.manifest.json', 'audio.wav']);
    expect(lines(out)).toEqual([
      file('audio.wav'),
      file('audio.manifest.json'),
      done('audio.manifest.json'),
    ]);
  });

  it('says so when the composition has no audio clip', async () => {
    const { dir } = workspace();
    const { out, io: streams } = io();
    await runCli(documentArgs('render-audio', dir), streams, {
      renderAudio: fakeAudio([], true),
      env: FFMPEG_ENV,
    });
    expect(lines(out)).toEqual([file('audio.manifest.json'), done('audio.manifest.json')]);
    expect(readdirSync(join(dir, 'out'))).toEqual(['audio.manifest.json']);
  });

  it('exits 1 with ffmpeg-missing without flags or variables', async () => {
    const { dir } = workspace();
    const { err, io: streams } = io();
    await expect(
      runCli(documentArgs('render-audio', dir), streams, { renderAudio: never, env: {} }),
    ).resolves.toBe(EXIT_PRODUCER_ERROR);
    expect(err.join('\n')).toMatch(/^error ffmpeg-missing/);
  });
});

describe('kadrion join (D47.5)', () => {
  function parts(): { dir: string; a: string; b: string; audio: string } {
    const dir = scratchDirectory('kadrion-join-');
    const [a, b, audio] = ['a', 'b', 'audio'].map((name) => join(dir, name));
    for (const directory of [a, b, audio]) mkdirSync(directory ?? '');
    const segments = (indices: number[]) => ({
      kind: 'segments',
      preset: { name: 'mp4-1080p' },
      segments: indices.map((index) => ({ index })),
    });
    writeFileSync(join(a ?? '', segmentsManifestName(0, 1)), JSON.stringify(segments([0, 1])));
    writeFileSync(join(b ?? '', segmentsManifestName(2, 4)), JSON.stringify(segments([2, 3, 4])));
    writeFileSync(join(b ?? '', 'notes.json'), '{}');
    writeFileSync(join(audio ?? '', AUDIO_MANIFEST_NAME), JSON.stringify({ kind: 'audio' }));
    return { dir, a: a ?? '', b: b ?? '', audio: audio ?? '' };
  }

  function fakeJoin(seen: JoinRequest[]) {
    return (request: JoinRequest): Promise<JoinResult> => {
      seen.push(request);
      writeFileSync(request.outputPath, 'mp4');
      return Promise.resolve({
        outputPath: request.outputPath,
        manifest: {
          runtime: { contentHash: 'sha256:runtime' },
          frames: new Array(300).fill({}),
          segments: new Array(5).fill({}),
          preset: { name: 'mp4-1080p' },
        } as unknown as JoinResult['manifest'],
      });
    };
  }

  it('reads every segments manifest and the audio manifest of the --in directories, and writes what export writes', async () => {
    const { dir, a, b, audio } = parts();
    const seen: JoinRequest[] = [];
    const { out, io: streams } = io();
    await expect(
      runCli(['join', '--in', b, '--in', audio, '--in', a, '--out', join(dir, 'out')], streams, {
        join: fakeJoin(seen),
        env: FFMPEG_ENV,
      }),
    ).resolves.toBe(EXIT_OK);
    expect(seen[0]?.segments.map(({ directory }) => directory)).toEqual([b, a]);
    expect(seen[0]?.audio.directory).toBe(audio);
    expect(seen[0]?.outputPath).toBe(join(dir, 'out', 'video-1080p.mp4'));
    expect(readdirSync(join(dir, 'out')).sort()).toEqual([
      'video-1080p.mp4',
      'video-1080p.render-manifest.json',
    ]);
    expect(lines(out)).toEqual([
      file('video-1080p.mp4'),
      file('video-1080p.render-manifest.json'),
      done('video-1080p.render-manifest.json'),
    ]);
  });

  it.each([
    ['no audio manifest', (p: ReturnType<typeof parts>) => [p.a, p.b]],
    ['two audio manifests', (p: ReturnType<typeof parts>) => [p.a, p.b, p.audio, p.audio]],
    ['no segments manifest', (p: ReturnType<typeof parts>) => [p.audio]],
  ])('exits 1 with join-invalid for %s', async (_, pick) => {
    const given = parts();
    const { err, io: streams } = io();
    const args = pick(given).flatMap((directory) => ['--in', directory]);
    await expect(
      runCli(['join', ...args, '--out', join(given.dir, 'out')], streams, {
        join: never,
        env: FFMPEG_ENV,
      }),
    ).resolves.toBe(EXIT_PRODUCER_ERROR);
    expect(err.join('\n')).toMatch(/^error join-invalid/);
  });

  it('exits 2 without --in, or with a directory it cannot read', async () => {
    const { dir } = parts();
    for (const args of [
      ['join', '--out', dir],
      ['join', '--in', join(dir, 'missing'), '--out', dir],
    ]) {
      await expect(runCli(args, io().io, { join: never, env: FFMPEG_ENV })).resolves.toBe(
        EXIT_USAGE,
      );
    }
  });
});

describe('kadrion render-still (D47.7)', () => {
  function fakeStill(seen: StillRequest[]) {
    return (request: StillRequest): Promise<StillResult> => {
      seen.push(request);
      const format = request.format as StillResult['format'];
      return Promise.resolve({
        format,
        mediaType: `image/${format}`,
        bytes: Uint8Array.of(1, 2, 3),
        manifest: {
          runtime: { contentHash: 'sha256:runtime' },
          frames: [{ index: 75, timeUs: request.timeUs, sha256: 'sha256:png' }],
          output: { sha256: 'sha256:still' },
        } as unknown as StillResult['manifest'],
      });
    };
  }

  it('writes a PNG without FFmpeg, and the manifest next to it', async () => {
    const { dir } = workspace();
    const seen: StillRequest[] = [];
    const { out, io: streams } = io();
    await expect(
      runCli(
        documentArgs('render-still', dir, '--time-us', '2500000', '--format', 'png'),
        streams,
        {
          renderStill: fakeStill(seen),
          env: {},
        },
      ),
    ).resolves.toBe(EXIT_OK);
    expect(seen[0]).toMatchObject({ timeUs: 2_500_000, format: 'png' });
    expect(seen[0]?.ffmpeg).toBeUndefined();
    expect(readdirSync(join(dir, 'out')).sort()).toEqual([
      'still-000075.manifest.json',
      'still-000075.png',
    ]);
    expect(readFileSync(join(dir, 'out', 'still-000075.png'))).toEqual(Buffer.from([1, 2, 3]));
    expect(lines(out)).toEqual([
      file('still-000075.png'),
      file('still-000075.manifest.json'),
      done('still-000075.manifest.json'),
    ]);
  });

  it('needs the pinned FFmpeg for jpeg and webp, and names the files by their format', async () => {
    const { dir } = workspace();
    const seen: StillRequest[] = [];
    await expect(
      runCli(documentArgs('render-still', dir, '--time-us', '0', '--format', 'jpeg'), io().io, {
        renderStill: never,
        env: {},
      }),
    ).resolves.toBe(EXIT_PRODUCER_ERROR);
    await runCli(documentArgs('render-still', dir, '--time-us', '0', '--format', 'webp'), io().io, {
      renderStill: fakeStill(seen),
      env: FFMPEG_ENV,
    });
    expect(seen[0]?.ffmpeg).toEqual({ ffmpegPath: '/env/ffmpeg', ffprobePath: '/env/ffprobe' });
    expect(stillFileNames(75, 'jpeg')).toEqual({
      image: 'still-000075.jpg',
      manifest: 'still-000075.manifest.json',
    });
    expect(stillFileNames(0, 'webp').image).toBe('still-000000.webp');
  });

  it.each([
    ['no time', ['--format', 'png']],
    ['a time that is not an integer', ['--time-us', '1.5', '--format', 'png']],
    ['no format', ['--time-us', '0']],
    ['a format that could name a path', ['--time-us', '0', '--format', '../png']],
  ])('exits 2 for %s', async (_, extra) => {
    const { dir } = workspace();
    await expect(
      runCli(documentArgs('render-still', dir, ...extra), io().io, {
        renderStill: never,
        env: FFMPEG_ENV,
      }),
    ).resolves.toBe(EXIT_USAGE);
  });
});

describe('the parts of the CLI', () => {
  it('parses integer times in order', () => {
    expect(parseTimes('9900000,0')).toEqual([9_900_000, 0]);
    for (const text of ['', '-1', '1e6', ' 0', '0x10']) expect(() => parseTimes(text)).toThrow();
  });

  it('accepts an asset map of { path, mediaType } entries only', () => {
    expect([...parseAssetMap('{"a":{"path":"a.png","mediaType":"image/png"}}')]).toEqual([
      ['a', { path: 'a.png', mediaType: 'image/png' }],
    ]);
    for (const text of [
      '[]',
      'null',
      '{"a":{"path":"a.png"}}',
      '{"a":{"path":"","mediaType":"x"}}',
      '{"a":{"path":"a","mediaType":"x","extra":1}}',
      'nope',
    ]) {
      expect(() => parseAssetMap(text), text).toThrow();
    }
  });

  it('names frames with six digits', () => {
    expect([frameFileName(0), frameFileName(297)]).toEqual([
      'frame-000000.png',
      'frame-000297.png',
    ]);
  });
});

/** A manual timer: the wall time of a job fires when the test says so. */
function manualTimer() {
  const timers: { fire: () => void; ms: number; cancelled: boolean }[] = [];
  return {
    timers,
    startTimer: (fire: () => void, ms: number) => {
      const timer = { fire, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
}

/** A range job that reports progress, then waits for its signal and fails as the Producer does. */
function waitingRange(seen: SegmentsRequest[], started: () => void = () => undefined) {
  return (request: SegmentsRequest): Promise<SegmentsResult> => {
    seen.push(request);
    request.onProgress?.({ event: 'start', frames: 60, segments: 1 });
    request.onProgress?.({ event: 'frame', frame: 0, done: 1, frames: 60 });
    started();
    return new Promise((_, reject) => {
      const stop = () => {
        const reason: unknown = request.signal?.reason;
        reject(
          reason instanceof ProducerError ? reason : new ProducerError('cancelled', 'cancelled'),
        );
      };
      if (request.signal?.aborted === true) stop();
      request.signal?.addEventListener('abort', stop);
    });
  };
}

const RANGE = ['--preset', '1080p'];

describe('the job contract of the CLI (D48)', () => {
  it('passes the progress of the Producer through as JSON lines, before the files and the end', async () => {
    const { dir } = workspace();
    const { out, io: streams } = io();
    const range = (request: SegmentsRequest): Promise<SegmentsResult> => {
      request.onProgress?.({ event: 'start', frames: 180, segments: 3 });
      request.onProgress?.({ event: 'frame', frame: 120, done: 1, frames: 180 });
      request.onProgress?.({ event: 'segment', segment: 2, done: 1, segments: 3 });
      return fakeRange([])(request);
    };
    await expect(
      runCli(documentArgs('render-range', dir, ...RANGE), streams, {
        renderRange: range,
        env: FFMPEG_ENV,
      }),
    ).resolves.toBe(EXIT_OK);
    expect(lines(out).slice(0, 4)).toEqual([
      { event: 'start', frames: 180, segments: 3 },
      { event: 'frame', frame: 120, done: 1, frames: 180 },
      { event: 'segment', segment: 2, done: 1, segments: 3 },
      file('segment-000002.mp4'),
    ]);
    expect(lines(out).at(-1)).toEqual(done('segments-000002-000004.manifest.json'));
  });

  it.each([
    ['a render error', 'encode-failed', EXIT_PRODUCER_ERROR],
    ['an exceeded limit', 'limit-exceeded', EXIT_LIMIT_EXCEEDED],
    ['a cancelled job', 'cancelled', EXIT_CANCELLED],
  ] as const)(
    'ends %s with one error line on stdout, the message on stderr, and its exit code',
    async (_, code, exitCode) => {
      const { dir } = workspace();
      const { out, err, io: streams } = io();
      const failing = () => Promise.reject(new ProducerError(code, 'it failed'));
      await expect(
        runCli(documentArgs('render-range', dir, ...RANGE), streams, {
          renderRange: failing,
          env: FFMPEG_ENV,
        }),
      ).resolves.toBe(exitCode);
      expect(lines(out)).toEqual([{ event: 'error', code, exitCode }]);
      expect(err).toEqual([`error ${code}: it failed`]);
    },
  );

  it('ends a usage error with an error line of code usage, and keeps the usage on stderr', async () => {
    const { out, err, io: streams } = io();
    await expect(runCli(['render-range', '--nope'], streams, {})).resolves.toBe(EXIT_USAGE);
    expect(lines(out)).toEqual([{ event: 'error', code: 'usage', exitCode: EXIT_USAGE }]);
    expect(err).toContain(USAGE);
  });

  it('keeps the plain output of doctor and fetch-ffmpeg, which are not jobs', async () => {
    const { out, io: streams } = io();
    await expect(runCli(['doctor', '--nope'], streams, {})).resolves.toBe(EXIT_USAGE);
    expect(out).toEqual([]);
    expect(JOB_COMMANDS).not.toContain('doctor');
    expect(JOB_COMMANDS).not.toContain('fetch-ffmpeg');
  });

  it('passes the limits of the flags to the Producer, and refuses a limit that is not an integer', async () => {
    const { dir } = workspace();
    const seen: SegmentsRequest[] = [];
    const limits = [
      ...['--max-document-bytes', '100000', '--max-duration-us', '10000000'],
      ...['--max-frames', '300', '--max-assets', '3', '--max-canvas-pixels', '2073600'],
      ...['--max-asset-bytes', '5000000', '--max-total-asset-bytes', '9000000'],
    ];
    await runCli(documentArgs('render-range', dir, ...RANGE, ...limits), io().io, {
      renderRange: fakeRange(seen),
      env: FFMPEG_ENV,
    });
    expect(seen[0]?.limits).toEqual({
      maxDocumentBytes: 100_000,
      maxDurationUs: 10_000_000,
      maxFrames: 300,
      maxAssets: 3,
      maxCanvasPixels: 2_073_600,
      maxAssetBytes: 5_000_000,
      maxTotalAssetBytes: 9_000_000,
    });
    await runCli(documentArgs('render-range', dir, ...RANGE), io().io, {
      renderRange: fakeRange(seen),
      env: FFMPEG_ENV,
    });
    expect(seen[1]?.limits).toBeUndefined();
    for (const bad of [
      ['--max-frames', '-1'],
      ['--max-frames', '1.5'],
      ['--max-wall-ms', 'soon'],
      ['--max-wall-ms'],
    ]) {
      await expect(
        runCli(documentArgs('render-range', dir, ...RANGE, ...bad), io().io, {
          renderRange: never,
          env: FFMPEG_ENV,
        }),
      ).resolves.toBe(EXIT_USAGE);
    }
  });

  it('gives the join a wall time but no document limits, since it reads no document', async () => {
    await expect(
      runCli(['join', '--in', 'a', '--out', 'b', '--max-frames', '10'], io().io, {
        join: never,
        env: FFMPEG_ENV,
      }),
    ).resolves.toBe(EXIT_USAGE);
  });

  it('cancels the job at the wall time with limit-exceeded, and stops the timer of a job that ended', async () => {
    const { dir } = workspace();
    const timer = manualTimer();
    const { out, err, io: streams } = io();
    const pending = runCli(
      documentArgs('render-range', dir, ...RANGE, '--max-wall-ms=60000'),
      streams,
      {
        renderRange: waitingRange([], () => timer.timers[0]?.fire()),
        env: FFMPEG_ENV,
        startTimer: timer.startTimer,
      },
    );
    await expect(pending).resolves.toBe(EXIT_LIMIT_EXCEEDED);
    expect(timer.timers[0]?.ms).toBe(60_000);
    expect(lines(out).at(-1)).toEqual({
      event: 'error',
      code: 'limit-exceeded',
      exitCode: EXIT_LIMIT_EXCEEDED,
    });
    expect(err[0]).toMatch(/wall time of 60000 ms/);

    const quick = manualTimer();
    await runCli(documentArgs('render-range', dir, ...RANGE, '--max-wall-ms', '5'), io().io, {
      renderRange: fakeRange([]),
      env: FFMPEG_ENV,
      startTimer: quick.startTimer,
    });
    expect(quick.timers[0]?.cancelled).toBe(true);
  });

  it('passes the host signal to the Producer and ends a cancelled job with exit code 5', async () => {
    const { dir } = workspace();
    const controller = new AbortController();
    const seen: SegmentsRequest[] = [];
    const { out, io: streams } = io();
    const pending = runCli(documentArgs('render-range', dir, ...RANGE), streams, {
      renderRange: waitingRange(seen, () => {
        controller.abort();
      }),
      env: FFMPEG_ENV,
      signal: controller.signal,
    });
    await expect(pending).resolves.toBe(EXIT_CANCELLED);
    expect(seen[0]?.signal?.aborted).toBe(true);
    expect(lines(out)).toEqual([
      { event: 'start', frames: 60, segments: 1 },
      { event: 'frame', frame: 0, done: 1, frames: 60 },
      { event: 'error', code: 'cancelled', exitCode: EXIT_CANCELLED },
    ]);
    // No manifest under a final name: the job did not finish.
    expect(readdirSync(join(dir, 'out'))).toEqual([]);
  });

  it('starts nothing for a signal that aborted before the job', async () => {
    const { dir } = workspace();
    const controller = new AbortController();
    controller.abort();
    await expect(
      runCli(documentArgs('render-range', dir, ...RANGE), io().io, {
        renderRange: never,
        env: FFMPEG_ENV,
        signal: controller.signal,
      }),
    ).resolves.toBe(EXIT_CANCELLED);
  });

  it('passes the signal and the limits to every job that renders', async () => {
    const { dir } = workspace();
    const controller = new AbortController();
    const signals: (AbortSignal | undefined)[] = [];
    const hosts = {
      env: FFMPEG_ENV,
      signal: controller.signal,
      render: (request: RenderRequest) => {
        signals.push(request.signal);
        return fakeRender([])(request);
      },
      exportMp4: (request: ExportRequest) => {
        signals.push(request.signal);
        return fakeExport([])(request);
      },
      renderAudio: (request: AudioRequest) => {
        signals.push(request.signal);
        return fakeAudio([])(request);
      },
    };
    const [, ...frames] = workspace().args;
    await runCli(['render-frames', ...frames], io().io, hosts);
    await runCli(exportArgs(dir), io().io, hosts);
    await runCli(documentArgs('render-audio', dir), io().io, hosts);
    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal === controller.signal)).toBe(true);
  });
});

describe('kadrion estimate (D48.5)', () => {
  function estimateArgs(dir: string, ...extra: string[]): string[] {
    return [
      'estimate',
      '--composition',
      join(dir, 'composition.json'),
      '--assets',
      join(dir, 'assets.json'),
      '--preset',
      '1080p',
      ...extra,
    ];
  }

  /** Reports ten frames 50 ms apart after 2 s of setup, on a fake clock. */
  function timedRange(seen: SegmentsRequest[], clock: { now: number }) {
    return (request: SegmentsRequest): Promise<SegmentsResult> => {
      seen.push(request);
      clock.now += 2_000;
      request.onProgress?.({ event: 'start', frames: 10, segments: 1 });
      for (let done = 1; done <= 10; done += 1) {
        request.onProgress?.({ event: 'frame', frame: 139 + done, done, frames: 10 });
        clock.now += 50;
      }
      clock.now -= 50;
      request.onProgress?.({ event: 'segment', segment: 14, done: 1, segments: 1 });
      writeFileSync(join(request.outputDirectory, 'segment-000014.mp4'), 'mp4');
      return Promise.resolve({} as SegmentsResult);
    };
  }

  it('renders the middle segment into a temporary directory and reports the time per frame', async () => {
    const { dir } = workspace();
    const seen: SegmentsRequest[] = [];
    const clock = { now: 1_000 };
    const { out, io: streams } = io();
    await expect(
      runCli(estimateArgs(dir, '--budget-ms', '20000'), streams, {
        renderRange: timedRange(seen, clock),
        env: FFMPEG_ENV,
        now: () => clock.now,
      }),
    ).resolves.toBe(EXIT_OK);
    expect(seen[0]).toMatchObject({
      preset: '1080p',
      range: { fromUs: 4_666_666, toUs: 5_000_000 },
      segmentFrames: 10,
    });
    // The measurement leaves nothing behind.
    expect(existsSync(seen[0]?.outputDirectory ?? '')).toBe(false);
    expect(lines(out).slice(-2)).toEqual([
      {
        event: 'estimate',
        samples: 10,
        setupMs: 2_000,
        msPerFrame: 50,
        segmentFrames: 60,
        msPerSegment: 3_000,
        segments: 5,
        // (20 000 − 2 000) / 3 000
        segmentsInBudget: 6,
      },
      done(null),
    ]);
  });

  it('takes the samples and the segment length of the host, and reports no budget without one', async () => {
    const { dir } = workspace();
    const seen: SegmentsRequest[] = [];
    const clock = { now: 0 };
    const { out, io: streams } = io();
    await runCli(estimateArgs(dir, '--samples', '10', '--segment-frames', '30'), streams, {
      renderRange: timedRange(seen, clock),
      env: FFMPEG_ENV,
      now: () => clock.now,
    });
    expect(lines(out).at(-2)).toMatchObject({
      segmentFrames: 30,
      msPerSegment: 1_500,
      segments: 10,
      segmentsInBudget: null,
    });
  });

  it('counts the segments of a grid anchored on a span, and samples the same frames (D80.5)', async () => {
    const { dir } = workspace();
    const seen: SegmentsRequest[] = [];
    const clock = { now: 0 };
    const { out, io: streams } = io();
    const span = ['--grid-from-us', '233333', '--grid-to-us', '2466666'];
    await runCli(
      estimateArgs(dir, '--segment-frames', '30', ...span, '--min-segment-frames', '15'),
      streams,
      { renderRange: timedRange(seen, clock), env: FFMPEG_ENV, now: () => clock.now },
    );
    // Frames 7 to 73 in segments of 30 from frame 7: the last 7 frames merged.
    expect(lines(out).at(-2)).toMatchObject({ segmentFrames: 30, segments: 2 });
    expect(seen[0]).toMatchObject({
      range: { fromUs: 4_666_666, toUs: 5_000_000 },
      segmentFrames: 10,
    });
    expect(seen[0] !== undefined && 'grid' in seen[0]).toBe(false);
  });

  it('refuses one sample with range-invalid before rendering', async () => {
    const { dir } = workspace();
    await expect(
      runCli(estimateArgs(dir, '--samples', '1'), io().io, {
        renderRange: never,
        env: FFMPEG_ENV,
      }),
    ).resolves.toBe(EXIT_PRODUCER_ERROR);
  });
});

describe('kadrion segment-keys (D92.1)', () => {
  function keysArgs(dir: string, ...extra: string[]): string[] {
    return [
      'segment-keys',
      '--composition',
      join(dir, 'composition.json'),
      '--assets',
      join(dir, 'assets.json'),
      '--preset',
      '1080p',
      ...extra,
    ];
  }

  it('prints the keys of the Producer in one line before its done, and writes nothing', async () => {
    const { dir } = workspace();
    const { out, err, io: streams } = io();
    await expect(runCli(keysArgs(dir), streams)).resolves.toBe(EXIT_OK);
    const expected = segmentKeys(referenceComposition, {}, { preset: '1080p', fonts: new Map() });
    expect(lines(out)).toEqual([
      { event: 'segment-keys', keyVersion: 1, segments: expected.segments },
      done(null),
    ]);
    expect(expected.segments).toHaveLength(5);
    expect(expected.segments[0]?.customHtmlNodeIds).toEqual(['node-custom-html']);
    expect(err).toEqual([]);
    expect(readdirSync(dir).sort()).toEqual([
      'asset-audio.bin',
      'asset-font.bin',
      'asset-image.bin',
      'assets.json',
      'composition.json',
    ]);
    expect(JOB_COMMANDS).toContain('segment-keys');
  });

  it('reads the fonts of the measured nodes and no other asset', async () => {
    const dir = scratchDirectory('kadrion-cli-keys-');
    // The fixture of corners on a canvas of 1280 × 720, which the preset 720p renders.
    const document = { ...(cornersComposition as object), width: 1280, height: 720 };
    writeFileSync(join(dir, 'composition.json'), JSON.stringify(document));
    const font = generateProportionalFontAsset();
    writeFileSync(join(dir, 'font.ttf'), font.bytes);
    // The image is no file at all: a command that read it would fail.
    writeFileSync(
      join(dir, 'assets.json'),
      JSON.stringify({
        'asset-image': { path: 'missing.png', mediaType: 'image/png' },
        [font.id]: { path: 'font.ttf', mediaType: 'font/ttf' },
      }),
    );
    const { out, io: streams } = io();
    const args = keysArgs(dir).map((arg) => (arg === '1080p' ? '720p' : arg));
    await expect(runCli(args, streams)).resolves.toBe(EXIT_OK);
    const [line] = lines(out) as { event: string; segments: unknown[] }[];
    expect(line?.event).toBe('segment-keys');
    expect(line?.segments).toHaveLength(1);
    // Without the font, the font is missing.
    writeFileSync(join(dir, 'assets.json'), JSON.stringify({}));
    const missing = io();
    await expect(runCli(args, missing.io)).resolves.toBe(EXIT_PRODUCER_ERROR);
    expect(lines(missing.out)).toEqual([
      { event: 'error', code: 'asset-missing', exitCode: EXIT_PRODUCER_ERROR },
    ]);
  });

  it('passes the segment length, the grid, its spans, and the limits through', async () => {
    const { dir } = workspace();
    const seen: { grid: SegmentKeysGrid; settings: SegmentKeysSettings }[] = [];
    const { out, io: streams } = io();
    const flags = [
      ...['--segment-frames', '30', '--min-segment-frames', '15'],
      ...['--grid-from-us', '233333', '--grid-to-us', '2466666'],
      ...['--spans-us', '233333,1000000', '--max-frames', '300'],
    ];
    await expect(
      runCli(keysArgs(dir, ...flags), streams, {
        segmentKeys: (_, grid, settings) => {
          seen.push({ grid, settings });
          return { keyVersion: 1, segments: [] };
        },
      }),
    ).resolves.toBe(EXIT_OK);
    expect(seen[0]?.grid).toEqual({
      range: { fromUs: 233_333, toUs: 2_466_666 },
      minSegmentFrames: 15,
      spans: [233_333, 1_000_000],
    });
    expect(seen[0]?.settings).toEqual({
      preset: '1080p',
      segmentFrames: 30,
      fonts: new Map(),
      limits: { maxFrames: 300 },
    });
    expect(lines(out)).toEqual([
      { event: 'segment-keys', keyVersion: 1, segments: [] },
      done(null),
    ]);
    // Without the flags, the grid of D47.1 and the settings alone.
    await runCli(keysArgs(dir), io().io, {
      segmentKeys: (_, grid, settings) => {
        seen.push({ grid, settings });
        return { keyVersion: 1, segments: [] };
      },
    });
    expect(seen[1]).toEqual({ grid: {}, settings: { preset: '1080p', fonts: new Map() } });
  });

  it('refuses a usage error with exit 2 and a refusal of the Producer with its exit code', async () => {
    const { dir } = workspace();
    const never = () => {
      throw new Error('not reached');
    };
    for (const args of [
      ['segment-keys', '--composition', join(dir, 'composition.json')],
      keysArgs(dir, '--spans-us', '0,x'),
      keysArgs(dir, '--spans-us', ''),
      keysArgs(dir, '--grid-from-us', '0'),
      keysArgs(dir, '--out', dir),
      keysArgs(dir, '--preset', '1080p/'),
    ]) {
      const { out, io: streams } = io();
      await expect(runCli(args, streams, { segmentKeys: never })).resolves.toBe(EXIT_USAGE);
      expect(lines(out)).toEqual([{ event: 'error', code: 'usage', exitCode: EXIT_USAGE }]);
    }
    for (const [extra, code, exitCode] of [
      [['--spans-us', '33333'], 'range-invalid', EXIT_PRODUCER_ERROR],
      [['--spans-us', '0,5000000,4000000'], 'range-invalid', EXIT_PRODUCER_ERROR],
      [['--max-frames', '299'], 'limit-exceeded', EXIT_LIMIT_EXCEEDED],
      [['--preset', '4k'], 'preset-unsupported', EXIT_PRODUCER_ERROR],
    ] as const) {
      const { out, io: streams } = io();
      await expect(runCli(keysArgs(dir, ...extra), streams)).resolves.toBe(exitCode);
      expect(lines(out)).toEqual([{ event: 'error', code, exitCode }]);
    }
    const controller = new AbortController();
    controller.abort();
    const { out, io: streams } = io();
    await expect(
      runCli(keysArgs(dir), streams, { segmentKeys: never, signal: controller.signal }),
    ).resolves.toBe(EXIT_CANCELLED);
    expect(lines(out)).toEqual([{ event: 'error', code: 'cancelled', exitCode: EXIT_CANCELLED }]);
  });
});

describe('kadrion inspect (D79.6, D91.1)', () => {
  /** A verdict as `inspectVideo` gives it, for the plumbing of the command. */
  const verdict: VideoInspection = {
    playable: false,
    reasons: [{ code: 'codec', message: 'The Player decodes H.264, not hevc.' }],
    container: 'mp4',
    format: 'MP4',
    video: {
      codec: 'hevc',
      codecString: 'hvc1.1.6.L93.B0',
      width: 64,
      height: 36,
      rotation: 0,
      flipped: false,
      frames: 25,
      durationUs: 1_000_000,
      timeBase: { num: 1, den: 12_800 },
      frameRate: { num: 25, den: 1 },
    },
    audio: { codec: 'aac', channels: 2, sampleRate: 48_000 },
  };

  function videoFile(bytes: Uint8Array): string {
    const dir = scratchDirectory('kadrion-inspect-');
    writeFileSync(join(dir, 'video.mp4'), bytes);
    return join(dir, 'video.mp4');
  }

  it('prints the verdict of the file as JSON with --json, read as a Blob, and exits 0 whatever it is', async () => {
    const path = videoFile(new Uint8Array([1, 2, 3, 4]));
    const seen: number[] = [];
    const { out, err, io: streams } = io();
    const code = await runCli(['inspect', '--json', path], streams, {
      inspect: async (blob) => {
        seen.push(blob.size);
        return Promise.resolve(verdict);
      },
    });
    expect(code).toBe(EXIT_OK);
    expect(seen).toEqual([4]);
    expect(JSON.parse(out.join('\n'))).toEqual(verdict);
    expect(err).toEqual([]);
    expect(JOB_COMMANDS).not.toContain('inspect');
  });

  it('prints the verdict as text without --json', async () => {
    const path = videoFile(new Uint8Array([1]));
    const { out, io: streams } = io();
    await runCli(['inspect', path], streams, { inspect: () => Promise.resolve(verdict) });
    expect(out).toEqual([
      `${path}: not as it is`,
      '  codec: The Player decodes H.264, not hevc.',
      '  container: mp4 (MP4)',
      '  video: hvc1.1.6.L93.B0 64x36, 25 frames, 1000000 µs, 25/1 fps',
      '  audio: aac, 2 channels, 48000 Hz',
    ]);
  });

  it('gives the verdict of the Player itself by default', async () => {
    const path = videoFile(new Uint8Array([1, 2, 3, 4, 5]));
    const { out, io: streams } = io();
    await expect(runCli(['inspect', '--json', path], streams, {})).resolves.toBe(EXIT_OK);
    expect(JSON.parse(out.join('\n'))).toMatchObject({
      playable: false,
      reasons: [{ code: 'unreadable' }],
      container: null,
    });
  });

  it.each([
    ['no file', ['inspect', '--json']],
    ['two files', ['inspect', 'a.mp4', 'b.mp4']],
    ['an unknown flag', ['inspect', '--nope', 'a.mp4']],
  ])('refuses %s with the usage', async (_, argv) => {
    const { out, err, io: streams } = io();
    await expect(runCli(argv, streams, {})).resolves.toBe(EXIT_USAGE);
    expect(out).toEqual([]);
    expect(err).toContain(USAGE);
  });

  function compositionFile(document: unknown, text = JSON.stringify(document, null, 2)): string {
    const dir = scratchDirectory('kadrion-inspect-');
    writeFileSync(join(dir, 'composition.json'), `\n  ${text}`);
    return join(dir, 'composition.json');
  }

  it('lists the first instant at which the animated corners of a node turn concave (D91.1)', async () => {
    const path = compositionFile(cornersComposition);
    const { out, err, io: streams } = io();
    const code = await runCli(['inspect', path], streams, {
      inspect: () => Promise.reject(new Error('A composition is no video.')),
    });
    expect(code).toBe(EXIT_OK);
    expect(err).toEqual([]);
    expect(out).toEqual([
      `${path}: a composition of schema 0.31, 1 warning`,
      '  corners-not-convex corners-animated at 566666 µs: The corners of "corners-animated" do not form a convex quadrilateral at 566666 µs (scene time 566666 µs): it draws nothing then (D91.1).',
    ]);
    const json = io();
    await expect(runCli(['inspect', '--json', path], json.io, {})).resolves.toBe(EXIT_OK);
    expect(JSON.parse(json.out.join('\n'))).toEqual({
      kind: 'composition',
      warnings: [
        {
          code: 'corners-not-convex',
          nodeId: 'corners-animated',
          holderId: 'scene-corners',
          timeUs: 566_666,
          message:
            'The corners of "corners-animated" do not form a convex quadrilateral at 566666 µs (scene time 566666 µs): it draws nothing then (D91.1).',
        },
      ],
    });
  });

  it('lists no warning for a composition without corners', async () => {
    const path = compositionFile(referenceComposition);
    const { out, io: streams } = io();
    await expect(runCli(['inspect', path], streams, {})).resolves.toBe(EXIT_OK);
    expect(out).toEqual([`${path}: a composition of schema 0.31, 0 warnings`]);
  });

  it.each([
    ['no JSON', '{', /^error invalid-json: /],
    ['no valid composition', '{"schemaVersion":"0.31"}', /^error invalid-document: /],
  ])('exits 1 for a composition that is %s', async (_, text, first) => {
    const path = compositionFile(null, text);
    const { out, err, io: streams } = io();
    await expect(runCli(['inspect', path], streams, {})).resolves.toBe(EXIT_PRODUCER_ERROR);
    expect(out).toEqual([]);
    expect(err[0]).toMatch(first);
  });

  it('exits 1 for a file that cannot be opened', async () => {
    const { out, err, io: streams } = io();
    const missing = join(scratchDirectory('kadrion-inspect-'), 'missing.mp4');
    await expect(runCli(['inspect', missing], streams, {})).resolves.toBe(EXIT_PRODUCER_ERROR);
    expect(out).toEqual([]);
    expect(err[0]).toMatch(/^error file-unreadable: /);
  });
});

describe('kadrion check-custom-html (D93)', () => {
  /** The Custom HTML fixture, its font, and an asset map, in a scratch directory. */
  function checkWorkspace(document: unknown = customHtmlComposition): string {
    const dir = scratchDirectory('kadrion-cli-check-');
    writeFileSync(join(dir, 'composition.json'), JSON.stringify(document));
    const map: Record<string, { path: string; mediaType: string }> = {};
    for (const asset of generateReferenceAssets()) {
      writeFileSync(join(dir, `${asset.id}.bin`), asset.bytes);
      map[asset.id] = { path: `${asset.id}.bin`, mediaType: asset.mediaType };
    }
    writeFileSync(join(dir, 'assets.json'), JSON.stringify(map));
    return dir;
  }

  function checkArgs(dir: string, ...extra: string[]): string[] {
    return [
      'check-custom-html',
      '--composition',
      join(dir, 'composition.json'),
      '--assets',
      join(dir, 'assets.json'),
      '--node-id',
      'html-script',
      ...extra,
    ];
  }

  /** The fixture with the html of `nodeId` replaced. */
  function withHtml(nodeId: string, html: string): unknown {
    const draft = structuredClone(customHtmlComposition) as {
      scenes: { nodes: { id: string; html?: string }[] }[];
    };
    const node = draft.scenes[0]?.nodes.find(({ id }) => id === nodeId);
    if (node === undefined) throw new Error(`No node ${nodeId}.`);
    node.html = html;
    return draft;
  }

  function htmlOf(nodeId: string): string {
    const draft = customHtmlComposition as {
      scenes: { nodes: { id: string; html?: string }[] }[];
    };
    const html = draft.scenes[0]?.nodes.find(({ id }) => id === nodeId)?.html;
    if (html === undefined) throw new Error(`No Custom HTML node ${nodeId}.`);
    return html;
  }

  /** A browser that only counts how often it was closed. */
  function fakeBrowser() {
    const browser = { closed: 0 };
    const chromium = {
      browser: {
        close: () => {
          browser.closed += 1;
          return Promise.resolve();
        },
      },
      reportedVersion: 'fake',
    } as unknown as LaunchedChromium;
    return { browser, launchChromium: () => Promise.resolve(chromium), chromium };
  }

  /** A render check that records its request and finds `problems`. */
  function fakeCheck(
    seen: CustomHtmlCheckRequest[],
    problems: CustomHtmlCheck['problems'] = [],
  ): (request: CustomHtmlCheckRequest) => Promise<CustomHtmlCheck> {
    return (request) => {
      seen.push(request);
      return Promise.resolve({ timesUs: [0, 2_233_333, 4_500_000], problems });
    };
  }

  const never = (): never => {
    throw new Error('not reached');
  };

  it('prints the findings, the render check, and ok in one line before its done', async () => {
    const dir = checkWorkspace();
    const seen: CustomHtmlCheckRequest[] = [];
    const fake = fakeBrowser();
    const { out, err, io: streams } = io();
    await expect(
      runCli(checkArgs(dir), streams, {
        checkCustomHtml: fakeCheck(seen),
        launchChromium: fake.launchChromium,
      }),
    ).resolves.toBe(EXIT_OK);
    expect(checkCustomHtmlSource(htmlOf('html-script'))).toEqual([]);
    expect(lines(out)).toEqual([
      {
        event: 'check',
        nodeId: 'html-script',
        findings: [],
        render: { timesUs: [0, 2_233_333, 4_500_000], problems: [] },
        ok: true,
      },
      done(null),
    ]);
    expect(err).toEqual([]);
    // The command lends the browser it launched, and closes it.
    expect(seen).toHaveLength(1);
    const [request] = seen;
    expect(request?.chromium).toBe(fake.chromium);
    expect(request?.nodeId).toBe('html-script');
    expect(request?.samples).toBe(5);
    expect(request?.document).toEqual(customHtmlComposition);
    expect(fake.browser.closed).toBeGreaterThan(0);
    // The fonts of the element, read before the browser opened; nothing else.
    const font = generateReferenceAssets().find(({ id }) => id === 'asset-font');
    const resolved = await request?.resolveAsset({
      id: 'asset-font',
      type: 'font',
      contentHash: 'sha256:any',
    });
    expect(resolved).toEqual({ bytes: font?.bytes, mediaType: font?.mediaType });
    expect(
      await request?.resolveAsset({ id: 'asset-image', type: 'image', contentHash: 'sha256:x' }),
    ).toBeNull();
    // It writes no file.
    expect(readdirSync(dir).sort()).toEqual([
      'asset-audio.bin',
      'asset-font.bin',
      'asset-image.bin',
      'assets.json',
      'composition.json',
    ]);
    expect(JOB_COMMANDS).toContain('check-custom-html');
    expect(USAGE).toContain(
      'kadrion check-custom-html --composition <file> --assets <file> --node-id <id> [--samples <n>]',
    );
  });

  it('exits 0 with ok false for findings of the html alone, and for problems of the render alone', async () => {
    const html = '<div></div><script>setTimeout(function () {}, 10)</script>';
    const dir = checkWorkspace(withHtml('html-script', html));
    const findings = checkCustomHtmlSource(html);
    expect(findings.map(({ code }) => code)).toEqual(['timer']);
    const { out, io: streams } = io();
    await expect(
      runCli(checkArgs(dir), streams, {
        checkCustomHtml: fakeCheck([]),
        launchChromium: fakeBrowser().launchChromium,
      }),
    ).resolves.toBe(EXIT_OK);
    expect(lines(out)).toEqual([
      {
        event: 'check',
        nodeId: 'html-script',
        findings,
        render: { timesUs: [0, 2_233_333, 4_500_000], problems: [] },
        ok: false,
      },
      done(null),
    ]);

    const differ = {
      code: 'frames-differ',
      timeUs: 2_233_333,
      message: 'The frame differs.',
    } as const;
    const rendered = io();
    await expect(
      runCli(checkArgs(checkWorkspace()), rendered.io, {
        checkCustomHtml: fakeCheck([], [differ]),
        launchChromium: fakeBrowser().launchChromium,
      }),
    ).resolves.toBe(EXIT_OK);
    expect(lines(rendered.out)).toEqual([
      {
        event: 'check',
        nodeId: 'html-script',
        findings: [],
        render: { timesUs: [0, 2_233_333, 4_500_000], problems: [differ] },
        ok: false,
      },
      done(null),
    ]);
  });

  it('passes --samples through, and checks the node it names', async () => {
    const seen: CustomHtmlCheckRequest[] = [];
    const hosts = {
      checkCustomHtml: fakeCheck(seen),
      launchChromium: fakeBrowser().launchChromium,
    };
    await expect(
      runCli(checkArgs(checkWorkspace(), '--samples', '3'), io().io, hosts),
    ).resolves.toBe(EXIT_OK);
    expect(seen[0]?.samples).toBe(3);

    // The Custom HTML node of another document: the reference composition.
    const { out, io: streams } = io();
    const args = checkArgs(checkWorkspace(referenceComposition)).map((arg) =>
      arg === 'html-script' ? 'node-custom-html' : arg,
    );
    await expect(runCli(args, streams, hosts)).resolves.toBe(EXIT_OK);
    expect(seen[1]?.nodeId).toBe('node-custom-html');
    expect(seen[1]?.samples).toBe(5);
    expect((lines(out)[0] as { nodeId: string }).nodeId).toBe('node-custom-html');
  });

  it('refuses a usage error with exit 2, before reading or launching anything', async () => {
    const dir = checkWorkspace();
    for (const args of [
      checkArgs(dir).slice(0, 5),
      checkArgs(dir).map((arg) => (arg === 'html-script' ? '' : arg)),
      checkArgs(dir, '--samples', '0'),
      checkArgs(dir, '--samples', 'x'),
      checkArgs(dir, '--out', dir),
      checkArgs(dir, '--max-frames', '-1'),
      checkArgs(dir, 'extra'),
    ]) {
      const { out, io: streams } = io();
      await expect(
        runCli(args, streams, { checkCustomHtml: never, launchChromium: never }),
      ).resolves.toBe(EXIT_USAGE);
      expect(lines(out)).toEqual([{ event: 'error', code: 'usage', exitCode: EXIT_USAGE }]);
    }
  });

  it('refuses an invalid document, an unknown node, and a node that is not Custom HTML with exit 1', async () => {
    for (const [document, nodeId, message] of [
      [{ schemaVersion: '0.1' }, 'html-script', /not valid/],
      [customHtmlComposition, 'html-missing', /No Custom HTML node has the ID "html-missing"/],
      [customHtmlComposition, 'html-background', /is a background node, not Custom HTML/],
    ] as const) {
      const dir = checkWorkspace(document);
      const args = checkArgs(dir).map((arg) => (arg === 'html-script' ? nodeId : arg));
      const { out, err, io: streams } = io();
      await expect(
        runCli(args, streams, { checkCustomHtml: never, launchChromium: never }),
      ).resolves.toBe(EXIT_PRODUCER_ERROR);
      expect(lines(out)).toEqual([
        { event: 'error', code: 'invalid-document', exitCode: EXIT_PRODUCER_ERROR },
      ]);
      expect(err[0]).toMatch(message);
    }
  });

  it('refuses a font the asset file lacks or misstates, and a browser other than the pinned one, with exit 1', async () => {
    const missing = checkWorkspace();
    writeFileSync(join(missing, 'assets.json'), JSON.stringify({}));
    const changed = checkWorkspace();
    writeFileSync(join(changed, 'asset-font.bin'), Uint8Array.of(1, 2, 3));
    for (const [dir, code] of [
      [missing, 'asset-missing'],
      [changed, 'asset-hash-mismatch'],
    ] as const) {
      const { out, io: streams } = io();
      await expect(
        runCli(checkArgs(dir), streams, { checkCustomHtml: never, launchChromium: never }),
      ).resolves.toBe(EXIT_PRODUCER_ERROR);
      expect(lines(out)).toEqual([{ event: 'error', code, exitCode: EXIT_PRODUCER_ERROR }]);
    }
    const { out, io: streams } = io();
    await expect(
      runCli(checkArgs(checkWorkspace()), streams, {
        checkCustomHtml: never,
        launchChromium: () =>
          Promise.reject(new ProducerError('chromium-mismatch', 'Not the pinned browser.')),
      }),
    ).resolves.toBe(EXIT_PRODUCER_ERROR);
    expect(lines(out)).toEqual([
      { event: 'error', code: 'chromium-mismatch', exitCode: EXIT_PRODUCER_ERROR },
    ]);
  });

  it('checks the limits before the browser opens, each sampled time counted twice', async () => {
    const dir = checkWorkspace();
    const font = generateReferenceAssets().find(({ id }) => id === 'asset-font');
    const fontBytes = font?.bytes.byteLength ?? 0;
    for (const extra of [
      ['--max-frames', '9'],
      ['--samples', '2', '--max-frames', '3'],
      ['--max-duration-us', '9999999'],
      ['--max-assets', '0'],
      ['--max-canvas-pixels', '100'],
      ['--max-asset-bytes', String(fontBytes - 1)],
      ['--max-total-asset-bytes', String(fontBytes - 1)],
      ['--max-document-bytes', '10'],
      ['--max-frames', '9007199254740993'],
    ]) {
      const { out, io: streams } = io();
      await expect(
        runCli(checkArgs(dir, ...extra), streams, {
          checkCustomHtml: never,
          launchChromium: never,
        }),
      ).resolves.toBe(EXIT_LIMIT_EXCEEDED);
      expect(lines(out), extra.join(' ')).toEqual([
        { event: 'error', code: 'limit-exceeded', exitCode: EXIT_LIMIT_EXCEEDED },
      ]);
    }
    const { out, io: streams } = io();
    await expect(
      runCli(
        checkArgs(dir, '--max-frames', '10', '--max-asset-bytes', String(fontBytes)),
        streams,
        { checkCustomHtml: fakeCheck([]), launchChromium: fakeBrowser().launchChromium },
      ),
    ).resolves.toBe(EXIT_OK);
    expect(lines(out).at(-1)).toEqual(done(null));
  });

  it('ends as cancelled, or on its wall time, and closes the browser, whatever the check returned', async () => {
    const dir = checkWorkspace();
    const aborted = new AbortController();
    aborted.abort();
    const before = io();
    await expect(
      runCli(checkArgs(dir), before.io, {
        checkCustomHtml: never,
        launchChromium: never,
        signal: aborted.signal,
      }),
    ).resolves.toBe(EXIT_CANCELLED);
    expect(lines(before.out)).toEqual([
      { event: 'error', code: 'cancelled', exitCode: EXIT_CANCELLED },
    ]);

    /** A check whose render fails once the browser closes, as the real one does. */
    const failsWhenClosed = (fake: ReturnType<typeof fakeBrowser>, started: () => void) => () => {
      started();
      return new Promise<CustomHtmlCheck>((resolve) => {
        const wait = (): void => {
          if (fake.browser.closed > 0) {
            resolve({
              timesUs: [0],
              problems: [{ code: 'render-failed', timeUs: null, message: 'closed' }],
            });
          } else setTimeout(wait, 1);
        };
        wait();
      });
    };
    const controller = new AbortController();
    const cancelled = fakeBrowser();
    const during = io();
    await expect(
      runCli(checkArgs(dir), during.io, {
        checkCustomHtml: failsWhenClosed(cancelled, () => {
          controller.abort();
        }),
        launchChromium: cancelled.launchChromium,
        signal: controller.signal,
      }),
    ).resolves.toBe(EXIT_CANCELLED);
    expect(lines(during.out)).toEqual([
      { event: 'error', code: 'cancelled', exitCode: EXIT_CANCELLED },
    ]);
    expect(cancelled.browser.closed).toBeGreaterThan(0);

    const timer = manualTimer();
    const walled = fakeBrowser();
    const wall = io();
    await expect(
      runCli(checkArgs(dir, '--max-wall-ms', '60000'), wall.io, {
        checkCustomHtml: failsWhenClosed(walled, () => timer.timers[0]?.fire()),
        launchChromium: walled.launchChromium,
        startTimer: timer.startTimer,
      }),
    ).resolves.toBe(EXIT_LIMIT_EXCEEDED);
    expect(lines(wall.out)).toEqual([
      { event: 'error', code: 'limit-exceeded', exitCode: EXIT_LIMIT_EXCEEDED },
    ]);
    expect(wall.err[0]).toMatch(/wall time of 60000 ms/);
  });
});
