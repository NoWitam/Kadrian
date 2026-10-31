/**
 * `kadrion render-frames` (D28.8), `kadrion export` (D29.10), and the jobs of a
 * segmented render and stills (D47) with injected
 * Producer functions: arguments, the asset map and its relative paths, the
 * files written, where FFmpeg comes from, and the exit codes. That the default
 * functions render and encode is `tests/pinned`'s business.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ProducerError,
  type AudioRequest,
  type AudioResult,
  type ExportRequest,
  type ExportResult,
  type JoinRequest,
  type JoinResult,
  type RenderRequest,
  type RenderResult,
  type SegmentsRequest,
  type SegmentsResult,
  type StillRequest,
  type StillResult,
} from '@kadrion/producer';
import { generateReferenceAssets, referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  AUDIO_MANIFEST_NAME,
  EXIT_OK,
  EXIT_PRODUCER_ERROR,
  EXIT_USAGE,
  frameFileName,
  parseAssetMap,
  parseTimes,
  runCli,
  segmentsManifestName,
  stillFileNames,
  USAGE,
} from '../src/index.js';

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
  const dir = mkdtempSync(join(tmpdir(), 'kadrion-cli-'));
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
      Buffer.from(font?.bytes ?? []).equals(Buffer.from(generateReferenceAssets()[2]?.bytes ?? [])),
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
    expect(out).toContain('frame-000075.png 2500000 sha256:75');
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
    expect(audio?.mediaType).toBe('audio/wav');
    expect(readdirSync(join(dir, 'out')).sort()).toEqual([
      'video-720p.mp4',
      'video-720p.render-manifest.json',
    ]);
    expect(out).toEqual([
      'video-720p.mp4 300 frames mp4-720p ffmpeg n8.1.3-20260921',
      'video-720p.render-manifest.json runtime sha256:runtime',
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
    expect(out).toEqual([
      'segment-000002.mp4 120 60 sha256:2',
      'segment-000003.mp4 180 60 sha256:3',
      'segment-000004.mp4 240 60 sha256:4',
      'segments-000002-000004.manifest.json runtime sha256:runtime',
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
  });

  it.each([
    ['one end of the range only', ['--preset', '720p', '--from-us', '0']],
    [
      'a range end that is not an integer',
      ['--preset', '720p', '--from-us', '0', '--to-us', '2e6'],
    ],
    ['a segment length that is not an integer', ['--preset', '720p', '--segment-frames', '-1']],
    ['a preset that could name a path', ['--preset', '../x']],
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
    expect(out).toEqual(['audio.wav 96000 samples sha256:wav', 'audio.manifest.json sha256:doc']);
  });

  it('says so when the composition has no audio clip', async () => {
    const { dir } = workspace();
    const { out, io: streams } = io();
    await runCli(documentArgs('render-audio', dir), streams, {
      renderAudio: fakeAudio([], true),
      env: FFMPEG_ENV,
    });
    expect(out[0]).toBe('no audio clip: audio.manifest.json only');
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
    const dir = mkdtempSync(join(tmpdir(), 'kadrion-join-'));
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
    expect(out).toEqual([
      'video-1080p.mp4 300 frames 5 segments mp4-1080p',
      'video-1080p.render-manifest.json runtime sha256:runtime',
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
    expect(out).toEqual([
      'still-000075.png 2500000 sha256:still',
      'still-000075.manifest.json runtime sha256:runtime',
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
