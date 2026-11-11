/**
 * Clips at another speed, frozen, and reversed in pinned Chromium (D82): the
 * frames of the speed composition — six videos at 1/4×, 1/2×, 3/2×, 4×,
 * reversed, and frozen — are the Producer's and the Player's to the pixel, and
 * meet their golden frames in the pinned environment; its sound — a clip at
 * half speed, a reversed clip at 3/2×, and the sound of the video at 3/2× —
 * is the Producer's intermediate, with the `stretch` of each mapped sound in
 * the manifest, and the Player's graph in an `OfflineAudioContext` equals it
 * within 1e-4 from the start and from the middle (D53.5, D82.6). Skipped
 * without `KADRION_FFMPEG` and `KADRION_FFPROBE`; required where the run is
 * pinned.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  AUDIO_FILE_NAME,
  launchChromium,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  renderAudio,
  renderFrames,
  type AudioManifest,
  type LaunchedChromium,
} from '@kadrion/producer';
import type { AssetResolver } from '@kadrion/renderer-dom';
import { audioLayout, audioPlan } from '@kadrion/runtime';
import { validateComposition } from '@kadrion/schema';
import {
  generateReferenceAssets,
  speedComposition,
  speedGoldenTimestamps,
  VIDEO_SOUND_FIXTURE,
} from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  closeConformanceHost,
  openConformanceHost,
  seekAndCapture,
  type ConformanceHost,
} from './conformance-host.js';
import {
  decodePng,
  difference,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  pixelReport,
  samePixels,
  writeReport,
} from './support.js';
import { makeVideoSoundFixture } from './video-fixture.ts';

const ffmpegPath = process.env.KADRION_FFMPEG;
const ffprobePath = process.env.KADRION_FFPROBE;
const available = ffmpegPath !== undefined && ffprobePath !== undefined;
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;
const FFMPEG = { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' };
const SPEED_MANIFEST = join(GOLDEN_DIRECTORY, 'speed.golden-frames.json');
const DIRECTORY = join(OUTPUT_DIRECTORY, 'speed', 'audio');
const TEXT = JSON.stringify(speedComposition);
const TIMES = speedGoldenTimestamps.map(({ timeUs }) => timeUs);

const generated = Object.fromEntries(
  generateReferenceAssets().map(({ id, mediaType, bytes }) => [id, { mediaType, bytes }]),
);

/** The samples of a WAV of 32-bit floats, found by its `data` chunk. */
function wavFloats(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === 'data') return new Float32Array(bytes.slice(offset + 8, offset + 8 + size).buffer);
    offset += 8 + size + (size % 2);
  }
  throw new Error('The WAV has no data chunk.');
}

/**
 * Run in the conformance host (D33.2): the Player's graph for the document,
 * scheduled from output sample `fromSample` at time 0 of an offline context at
 * 48 kHz, through the built packages the host serves; the rendered samples,
 * interleaved.
 */
const PLAYED = `(async () => {
  const { text, sources, fromSample } = INPUT;
  const player = await import('@kadrion/player');
  const runtime = await import('@kadrion/runtime');
  const schema = await import('@kadrion/schema');
  const layout = runtime.audioLayout(runtime.audioPlan(schema.validateComposition(JSON.parse(text)).composition));
  const context = new OfflineAudioContext(2, layout.totalSamples - fromSample, 48000);
  const buffers = new Map();
  for (const [id, base64] of sources) {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    buffers.set(id, await player.decodeSound(context, id, bytes.buffer));
  }
  player.scheduleSounds(context, layout, buffers, fromSample, 0);
  const rendered = await context.startRendering();
  const left = rendered.getChannelData(0);
  const right = rendered.getChannelData(1);
  const samples = [];
  for (let index = 0; index < rendered.length; index += 1) samples.push(left[index], right[index]);
  return samples;
})()`;

describe('the pinned FFmpeg for the speed composition (D82)', () => {
  it('is given wherever the run is pinned', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info('The speed tests are skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set.');
    }
  });
});

describe.skipIf(!available)('clips at another speed, frozen, and reversed (D82)', () => {
  let chromium: LaunchedChromium;
  let video: Uint8Array;
  let host: ConformanceHost;

  const resolveAsset: AssetResolver = ({ id }) =>
    id === VIDEO_SOUND_FIXTURE.id
      ? { bytes: video, mediaType: VIDEO_SOUND_FIXTURE.mediaType }
      : (generated[id] ?? null);

  const assets = (): { id: string; mediaType: string; bytes: Uint8Array }[] => [
    { id: VIDEO_SOUND_FIXTURE.id, mediaType: VIDEO_SOUND_FIXTURE.mediaType, bytes: video },
    ...Object.entries(generated)
      .filter(([id]) => id === 'asset-audio')
      .map(([id, { mediaType, bytes }]) => ({ id, mediaType, bytes })),
  ];

  beforeAll(async () => {
    chromium = await launchChromium();
    video = await makeVideoSoundFixture(FFMPEG.ffmpegPath);
    host = await openConformanceHost(chromium, TEXT, assets());
  }, 300_000);

  afterAll(async () => {
    await closeConformanceHost(host);
    await chromium.browser.close();
  });

  it('shows the Producer frames in the Player to the pixel, forwards and back (D82.4, D82.5)', async () => {
    const { frames } = await renderFrames({
      document: speedComposition,
      resolveAsset,
      timesUs: TIMES,
      chromium,
      ffmpeg: FFMPEG,
    });
    const report: { timeUs: number; differingPixels: number }[] = [];
    // Forwards, then backwards, so the reversed clip decodes both ways in both hosts.
    for (const timeUs of [...TIMES, ...[...TIMES].reverse()]) {
      const produced = frames.find((frame) => frame.timeUs === timeUs)?.png;
      if (produced === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
      const shown = await seekAndCapture(host, timeUs, null);
      const found = difference(decodePng(produced), decodePng(shown.png));
      report.push({ timeUs, differingPixels: found.differingPixels });
      expect(
        samePixels(produced, shown.png),
        pixelReport(`the speed composition at ${String(timeUs)}`, produced, shown.png),
      ).toBe(true);
    }
    writeReport('speed/parity.json', report);
  }, 300_000);

  it('meets the golden frames of the speed composition in the pinned environment only (D26.5)', async () => {
    const environment = pinnedRun(chromium);
    const { frames } = await renderFrames({
      document: speedComposition,
      resolveAsset,
      timesUs: TIMES,
      chromium,
      ffmpeg: FFMPEG,
    });
    const goldens = existsSync(SPEED_MANIFEST)
      ? (JSON.parse(readFileSync(SPEED_MANIFEST, 'utf8')) as {
          environment: { pinned: boolean };
          frames: { file: string; timeUs: number }[];
        })
      : null;
    const report = frames.map(({ timeUs, png }) => {
      const file = goldens?.frames.find((frame) => frame.timeUs === timeUs)?.file;
      return {
        timeUs,
        difference:
          file === undefined
            ? null
            : difference(decodePng(readFileSync(join(GOLDEN_DIRECTORY, file))), decodePng(png)),
      };
    });
    rmSync(join(OUTPUT_DIRECTORY, 'speed', 'golden-comparison.json'), { force: true });
    writeReport('speed/golden-comparison.json', { environment, goldens: goldens !== null, report });
    if (!environment.pinned) {
      console.info('Not the pinned environment: the speed golden frames are not asserted.');
      return;
    }
    expect(
      goldens,
      'Run "node --run goldens:update" in the pinned container first.',
    ).not.toBeNull();
    expect(goldens?.environment.pinned).toBe(true);
    expect(report).toHaveLength(TIMES.length);
    for (const { timeUs, difference: found } of report) {
      expect(found?.differingPixels, String(timeUs)).toBe(0);
    }
  }, 300_000);

  describe('the sound (D82.6)', () => {
    let manifest: AudioManifest;
    let mixed: Float32Array;

    beforeAll(async () => {
      rmSync(DIRECTORY, { recursive: true, force: true });
      mkdirSync(DIRECTORY, { recursive: true });
      ({ manifest } = await renderAudio({
        document: speedComposition,
        resolveAsset,
        outputDirectory: DIRECTORY,
        ffmpeg: FFMPEG,
      }));
      mixed = wavFloats(new Uint8Array(readFileSync(join(DIRECTORY, AUDIO_FILE_NAME))));
    }, 300_000);

    it('records the stretch of every mapped sound, and hears no frozen video', () => {
      const sounds = manifest.audio?.sounds ?? [];
      expect(sounds.map(({ id }) => id).sort()).toEqual([
        'clip-half',
        'clip-reversed',
        'node-three-halves',
      ]);
      const stretchOf = (id: string): unknown => sounds.find((sound) => sound.id === id)?.stretch;
      expect(stretchOf('clip-half')).toMatchObject({ speed: { num: 1, den: 2 }, reverse: false });
      expect(stretchOf('clip-reversed')).toMatchObject({
        speed: { num: 3, den: 2 },
        reverse: true,
      });
      expect(stretchOf('node-three-halves')).toMatchObject({
        speed: { num: 3, den: 2 },
        reverse: false,
      });
      // The manifest states each sound as its document does; the computed samples are its stretch.
      const validated = validateComposition(speedComposition);
      if (!validated.ok) throw new Error('The speed composition is not valid.');
      const layout = audioLayout(audioPlan(validated.composition));
      for (const sound of sounds) {
        expect(sound.sourceStartSample).toBe(
          layout.sounds.find(({ entry }) => entry.id === sound.id)?.sourceStartSample,
        );
        expect((sound.stretch as { sha256: string } | undefined)?.sha256).toMatch(
          /^sha256:[0-9a-f]{64}$/,
        );
      }
      expect(mixed).toHaveLength(96_000 * 2);
    });

    it("equals the Player's graph from the start and from the middle, within float automation", async () => {
      const report: Record<string, unknown> = {};
      for (const from of [0, 48_000, 60_001]) {
        const input = JSON.stringify({
          text: TEXT,
          sources: assets().map(({ id, bytes }) => [id, Buffer.from(bytes).toString('base64')]),
          fromSample: from,
        });
        const samples: number[] = await host.page.evaluate(PLAYED.replace('INPUT', input));
        expect(samples).toHaveLength((96_000 - from) * 2);
        let worst = { at: -1, difference: 0 };
        for (let index = 0; index < samples.length; index += 1) {
          const found = Math.abs(
            (samples[index] ?? Number.NaN) - (mixed[from * 2 + index] ?? Number.NaN),
          );
          if (!(found <= worst.difference)) worst = { at: index, difference: found };
        }
        report[`from-${String(from)}`] = worst;
      }
      writeReport('speed/audio-player-report.json', report);
      for (const [from, { difference: found }] of Object.entries(report) as [
        string,
        { difference: number },
      ][]) {
        expect(found, from).toBeLessThan(1e-4);
      }
    }, 300_000);
  });
});
