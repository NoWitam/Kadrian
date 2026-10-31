/**
 * `node --run goldens:update` (D26.5): renders the golden timestamps of the
 * reference composition and of the video composition (D50.8) with the
 * Producer and writes the golden frames and their manifests into
 * `packages/test-fixtures/src/golden-frames/`. The video needs the pinned
 * FFmpeg of `KADRION_FFMPEG` and `KADRION_FFPROBE`. It refuses
 * to write anything unless the environment is the pinned container (D26.2)
 * without a network (D28.9);
 * the diff of the images is reviewed like code. Self-contained, because it
 * runs with `--experimental-strip-types`, which resolves no `.js` to `.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  environmentManifest,
  goldenRefusal,
  launchChromium,
  renderFrames,
  sha256,
} from '@kadrion/producer';
import {
  generateReferenceAssets,
  goldenTimestamps,
  referenceComposition,
  VIDEO_FIXTURE,
  videoComposition,
  videoGoldenTimestamps,
} from '@kadrion/test-fixtures';

import { makeVideoFixture } from './video-fixture.ts';

const directory = fileURLToPath(
  new URL('../../packages/test-fixtures/src/golden-frames/', import.meta.url),
);
const assets = Object.fromEntries(generateReferenceAssets().map((asset) => [asset.id, asset]));

const chromium = await launchChromium();
try {
  const environment = environmentManifest(chromium.reportedVersion, { width: 1080, height: 1920 });
  const refusal = goldenRefusal(environment);
  const ffmpegPath = process.env.KADRION_FFMPEG;
  const ffprobePath = process.env.KADRION_FFPROBE;
  if (refusal !== null) {
    console.error(`Refusing to write golden frames: ${refusal}.`);
    process.exitCode = 1;
  } else if (ffmpegPath === undefined || ffprobePath === undefined) {
    console.error(
      'Refusing to write golden frames: KADRION_FFMPEG and KADRION_FFPROBE are not set.',
    );
    process.exitCode = 1;
  } else {
    const result = await renderFrames({
      document: referenceComposition,
      resolveAsset: ({ id }) => assets[id] ?? null,
      timesUs: goldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
    });
    mkdirSync(directory, { recursive: true });
    const frames = result.frames.map(({ index, timeUs, png }) => {
      const file = `reference-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    const manifest = { render: result.manifest, environment, frames };
    writeFileSync(
      join(directory, 'reference.golden-frames.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    for (const frame of frames) console.log(`${frame.file} ${frame.sha256}`);

    // The second reference composition: video nodes, decoded by the pinned FFmpeg (D50.8).
    const video = await makeVideoFixture(ffmpegPath);
    const videoResult = await renderFrames({
      document: videoComposition,
      resolveAsset: ({ id }) =>
        id === VIDEO_FIXTURE.id
          ? { bytes: video, mediaType: VIDEO_FIXTURE.mediaType }
          : (assets[id] ?? null),
      timesUs: videoGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
      ffmpeg: { ffmpegPath, ffprobePath },
    });
    const videoFrames = videoResult.frames.map(({ index, timeUs, png }) => {
      const file = `video-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'video.golden-frames.json'),
      `${JSON.stringify({ render: videoResult.manifest, environment, frames: videoFrames }, null, 2)}\n`,
    );
    for (const frame of videoFrames) console.log(`${frame.file} ${frame.sha256}`);
  }
} finally {
  await chromium.browser.close();
}
