/**
 * `node --run goldens:update` (D26.5): renders the golden timestamps of the
 * reference composition, of the video composition (D50.8), of the
 * transitions composition (D56), of the clip transitions composition (D66),
 * of the captions composition (D57), of the focus composition (D63), and of
 * the easing composition (D67) with the Producer and writes the golden frames and their manifests into
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
  captionsComposition,
  captionsGoldenTimestamps,
  clipTransitionsComposition,
  clipTransitionsGoldenTimestamps,
  easingComposition,
  easingGoldenTimestamps,
  focusComposition,
  focusGoldenTimestamps,
  transitionsComposition,
  transitionsGoldenTimestamps,
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

    // The transitions composition: the middle of each effect and of the clip crossfade (D56).
    const transitionsResult = await renderFrames({
      document: transitionsComposition,
      resolveAsset: ({ id }) => assets[id] ?? null,
      timesUs: transitionsGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
    });
    const transitionFrames = transitionsResult.frames.map(({ index, timeUs, png }) => {
      const file = `transitions-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'transitions.golden-frames.json'),
      `${JSON.stringify({ render: transitionsResult.manifest, environment, frames: transitionFrames }, null, 2)}\n`,
    );
    for (const frame of transitionFrames) console.log(`${frame.file} ${frame.sha256}`);

    // The clip transitions composition: the middle of each kind between clips and scenes (D66).
    const clipTransitionsResult = await renderFrames({
      document: clipTransitionsComposition,
      resolveAsset: ({ id }) => assets[id] ?? null,
      timesUs: clipTransitionsGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
    });
    const clipTransitionFrames = clipTransitionsResult.frames.map(({ index, timeUs, png }) => {
      const file = `clip-transitions-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'clip-transitions.golden-frames.json'),
      `${JSON.stringify({ render: clipTransitionsResult.manifest, environment, frames: clipTransitionFrames }, null, 2)}\n`,
    );
    for (const frame of clipTransitionFrames) console.log(`${frame.file} ${frame.sha256}`);

    // The easing composition: eased motion of every kind, an eased slide, and an eased growth (D67).
    const easingResult = await renderFrames({
      document: easingComposition,
      resolveAsset: ({ id }) => assets[id] ?? null,
      timesUs: easingGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
    });
    const easingFrames = easingResult.frames.map(({ index, timeUs, png }) => {
      const file = `easing-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'easing.golden-frames.json'),
      `${JSON.stringify({ render: easingResult.manifest, environment, frames: easingFrames }, null, 2)}\n`,
    );
    for (const frame of easingFrames) console.log(`${frame.file} ${frame.sha256}`);

    // The captions composition: before the first word, words of both pages, and a pause (D57).
    const captionsResult = await renderFrames({
      document: captionsComposition,
      resolveAsset: ({ id }) => assets[id] ?? null,
      timesUs: captionsGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
    });
    const captionFrames = captionsResult.frames.map(({ index, timeUs, png }) => {
      const file = `captions-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'captions.golden-frames.json'),
      `${JSON.stringify({ render: captionsResult.manifest, environment, frames: captionFrames }, null, 2)}\n`,
    );
    for (const frame of captionFrames) console.log(`${frame.file} ${frame.sha256}`);

    // The focus composition: images and videos placed off their centre (D63).
    const focusResult = await renderFrames({
      document: focusComposition,
      resolveAsset: ({ id }) =>
        id === VIDEO_FIXTURE.id
          ? { bytes: video, mediaType: VIDEO_FIXTURE.mediaType }
          : (assets[id] ?? null),
      timesUs: focusGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
      ffmpeg: { ffmpegPath, ffprobePath },
    });
    const focusFrames = focusResult.frames.map(({ index, timeUs, png }) => {
      const file = `focus-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'focus.golden-frames.json'),
      `${JSON.stringify({ render: focusResult.manifest, environment, frames: focusFrames }, null, 2)}\n`,
    );
    for (const frame of focusFrames) console.log(`${frame.file} ${frame.sha256}`);
  }
} finally {
  await chromium.browser.close();
}
