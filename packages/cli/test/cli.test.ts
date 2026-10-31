/**
 * `kadrion render-frames` (D28.8), `kadrion export` (D29.10), and the jobs of a
 * segmented render and stills (D47) with injected
 * Producer functions: arguments, the asset map and its relative paths, the
 * files written, where FFmpeg comes from, and the exit codes. That the default
 * functions render and encode is `tests/pinned`'s business.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
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
    expect(audio?.mediaType).toBe('audio/wav');
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
      ...['--max-frames', '300', '--max-assets', '3'],
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
