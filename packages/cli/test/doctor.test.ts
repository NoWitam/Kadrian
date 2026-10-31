/**
 * `kadrion doctor` and `kadrion fetch-ffmpeg` (D45) with injected hosts: every
 * check of the doctor, its report and exit codes, where the FFmpeg paths come
 * from, and the fetch step's output, refusals, and exit codes. That the default
 * hosts launch the pinned Chromium and verify the pinned FFmpeg is the release
 * smoke test's and `tests/pinned`'s business.
 */
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CHROMIUM_REVISION,
  CHROMIUM_VERSION,
  FFMPEG_SHA256,
  FFPROBE_SHA256,
  FFMPEG_RELEASE,
  PINNED_IMAGE,
  PLAYWRIGHT_CORE_VERSION,
  ProducerError,
} from '@kadrion/producer';
import { describe, expect, it } from 'vitest';

import {
  DOCTOR_CHECKS,
  EXIT_NOT_REFERENCE,
  EXIT_OK,
  EXIT_PRODUCER_ERROR,
  EXIT_USAGE,
  fetchFfmpeg,
  FfmpegInstallError,
  runCli,
  runDoctor,
  type DoctorHost,
  type DoctorReport,
} from '../src/index.js';

/** A host that is the reference environment in every respect. */
function referenceHost(overrides: Partial<DoctorHost> = {}): DoctorHost {
  return {
    platform: 'linux',
    arch: 'x64',
    env: { KADRION_PINNED_IMAGE: PINNED_IMAGE },
    playwright: () => ({
      version: PLAYWRIGHT_CORE_VERSION,
      revision: CHROMIUM_REVISION,
      browserVersion: CHROMIUM_VERSION,
    }),
    chromium: () => Promise.resolve(CHROMIUM_VERSION),
    verifyFfmpeg: () =>
      Promise.resolve({ ffmpegSha256: FFMPEG_SHA256, ffprobeSha256: FFPROBE_SHA256 }),
    networkInterfaces: () => ['lo'],
    runtimeHash: () => 'sha256:runtime',
    ...overrides,
  };
}

const PATHS = { ffmpegPath: '/opt/ffmpeg', ffprobePath: '/opt/ffprobe' };

function failed(report: DoctorReport): string[] {
  return report.checks.filter((check) => !check.ok).map((check) => check.id);
}

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) },
  };
}

describe('the doctor (D45)', () => {
  it('reports every check in order, and the reference environment as reference', async () => {
    const report = await runDoctor(PATHS, referenceHost());
    expect(report.reportVersion).toBe(1);
    expect(report.checks.map((check) => check.id)).toEqual([...DOCTOR_CHECKS]);
    expect(report.reference).toBe(true);
    expect(report.checks.find((check) => check.id === 'runtime')?.detail).toBe('sha256:runtime');
  });

  it.each<[string, Partial<DoctorHost>, Partial<typeof PATHS>]>([
    ['platform', { arch: 'arm64' }, PATHS],
    ['platform', { platform: 'darwin' }, PATHS],
    ['image', { env: {} }, PATHS],
    ['image', { env: { KADRION_PINNED_IMAGE: `${PINNED_IMAGE.slice(0, -1)}0` } }, PATHS],
    [
      'playwright',
      {
        playwright: () => ({
          version: '1.62.0',
          revision: CHROMIUM_REVISION,
          browserVersion: CHROMIUM_VERSION,
        }),
      },
      PATHS,
    ],
    ['chromium', { chromium: () => Promise.resolve('152.0.0.0') }, PATHS],
    [
      'chromium',
      { chromium: () => Promise.reject(new ProducerError('chromium-missing', 'not installed')) },
      PATHS,
    ],
    ['ffmpeg', {}, {}],
    ['ffmpeg', {}, { ffmpegPath: '/opt/ffmpeg' }],
    [
      'ffmpeg',
      { verifyFfmpeg: () => Promise.reject(new ProducerError('ffmpeg-mismatch', 'other build')) },
      PATHS,
    ],
    ['network', { networkInterfaces: () => ['eth0', 'lo'] }, PATHS],
    [
      'runtime',
      {
        runtimeHash: () => {
          throw new ProducerError('runtime-hash-mismatch', 'other bytes');
        },
      },
      PATHS,
    ],
  ])('fails only %s, and keeps checking the rest', async (id, overrides, paths) => {
    const report = await runDoctor(paths, referenceHost(overrides));
    expect(failed(report)).toEqual([id]);
    expect(report.reference).toBe(false);
    expect(report.checks).toHaveLength(DOCTOR_CHECKS.length);
  });

  it('names the code of a typed failure', async () => {
    const report = await runDoctor(
      PATHS,
      referenceHost({
        chromium: () => Promise.reject(new ProducerError('chromium-missing', 'not installed')),
      }),
    );
    expect(report.checks.find((check) => check.id === 'chromium')?.detail).toBe(
      'chromium-missing: not installed',
    );
  });
});

describe('kadrion doctor (D45)', () => {
  it('prints the report as JSON and exits 0 in the reference environment', async () => {
    const { out, io: cliIo } = io();
    const code = await runCli(['doctor'], cliIo, {
      env: { KADRION_FFMPEG: '/env/ffmpeg', KADRION_FFPROBE: '/env/ffprobe' },
      doctor: (ffmpeg) => {
        expect(ffmpeg).toEqual({ ffmpegPath: '/env/ffmpeg', ffprobePath: '/env/ffprobe' });
        return runDoctor(ffmpeg, referenceHost());
      },
    });
    expect(code).toBe(EXIT_OK);
    expect((JSON.parse(out.join('\n')) as DoctorReport).reference).toBe(true);
  });

  it('exits 3 with the report anywhere else, and takes the flags before the variables', async () => {
    const { out, io: cliIo } = io();
    const code = await runCli(['doctor', '--ffmpeg', '/flag/ffmpeg'], cliIo, {
      env: { KADRION_FFMPEG: '/env/ffmpeg', KADRION_FFPROBE: '/env/ffprobe' },
      doctor: (ffmpeg) => {
        expect(ffmpeg).toEqual({ ffmpegPath: '/flag/ffmpeg', ffprobePath: '/env/ffprobe' });
        return runDoctor(ffmpeg, referenceHost({ networkInterfaces: () => ['eth0', 'lo'] }));
      },
    });
    expect(code).toBe(EXIT_NOT_REFERENCE);
    expect(failed(JSON.parse(out.join('\n')) as DoctorReport)).toEqual(['network']);
  });

  it('exits 2 for an unknown flag', async () => {
    const { io: cliIo } = io();
    expect(
      await runCli(['doctor', '--image', 'x'], cliIo, {
        doctor: () => Promise.reject(new Error('never')),
      }),
    ).toBe(EXIT_USAGE);
  });
});

describe('kadrion fetch-ffmpeg (D45)', () => {
  it('prints the two installed paths with their pins, and the progress on standard error', async () => {
    const { out, err, io: cliIo } = io();
    const code = await runCli(['fetch-ffmpeg', '--dir', 'cache'], cliIo, {
      fetchFfmpeg: (options) => {
        expect(options.dir).toBe('cache');
        options.log('Downloading');
        return Promise.resolve({
          ffmpeg: `/abs/cache/${FFMPEG_RELEASE}/bin/ffmpeg`,
          ffprobe: `/abs/cache/${FFMPEG_RELEASE}/bin/ffprobe`,
          reused: false,
          decompressor: 'xz',
        });
      },
    });
    expect(code).toBe(EXIT_OK);
    expect(out).toEqual([
      `ffmpeg /abs/cache/${FFMPEG_RELEASE}/bin/ffmpeg ${FFMPEG_SHA256}`,
      `ffprobe /abs/cache/${FFMPEG_RELEASE}/bin/ffprobe ${FFPROBE_SHA256}`,
    ]);
    expect(err).toEqual(['Downloading']);
  });

  it('exits 1 with the code of a refused build', async () => {
    const { out, err, io: cliIo } = io();
    const code = await runCli(['fetch-ffmpeg', '--dir', 'cache'], cliIo, {
      fetchFfmpeg: () =>
        Promise.reject(new FfmpegInstallError('archive-hash-mismatch', 'other bytes')),
    });
    expect(code).toBe(EXIT_PRODUCER_ERROR);
    expect(out).toEqual([]);
    expect(err).toEqual(['error archive-hash-mismatch: other bytes']);
  });

  it('exits 2 without --dir', async () => {
    const { io: cliIo } = io();
    for (const args of [['fetch-ffmpeg'], ['fetch-ffmpeg', '--dir', '']]) {
      expect(
        await runCli(args, cliIo, { fetchFfmpeg: () => Promise.reject(new Error('never')) }),
      ).toBe(EXIT_USAGE);
    }
  });

  it('refuses downloaded bytes without the pinned hash and installs nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kadrion-fetch-'));
    const lines: string[] = [];
    await expect(
      fetchFfmpeg({
        dir,
        log: (line) => lines.push(line),
        download: () => Promise.resolve(new TextEncoder().encode('not the archive')),
      }),
    ).rejects.toMatchObject({ code: 'archive-hash-mismatch' });
    expect(readdirSync(dir)).toEqual([]);
    expect(lines[0]).toMatch(/^Downloading https:\/\//);
  });
});
