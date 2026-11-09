/**
 * `node --run goldens:update` (D26.5): renders the golden timestamps of the
 * reference composition, of the video composition (D50.8), of the
 * transitions composition (D56), of the clip transitions composition (D66),
 * of the captions composition (D57), of the focus composition (D63), of the
 * easing composition (D67), of the motion composition (D68), of the text
 * composition (D69), of the animated captions composition (D70), and of the
 * effects composition (D71), of the SVG effects composition (D72), and of the composition of shapes (D73) with the Producer and writes the golden frames and their manifests into
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
  captionsMotionComposition,
  captionsMotionGoldenTimestamps,
  clipTransitionsComposition,
  clipTransitionsGoldenTimestamps,
  easingComposition,
  easingGoldenTimestamps,
  effectsComposition,
  effectsGoldenTimestamps,
  effectsSvgComposition,
  effectsSvgGoldenTimestamps,
  focusComposition,
  focusGoldenTimestamps,
  GREEN_SCREEN_FIXTURE,
  motionComposition,
  motionGoldenTimestamps,
  shapesComposition,
  shapesGoldenTimestamps,
  textComposition,
  textGoldenTimestamps,
  transitionsComposition,
  transitionsGoldenTimestamps,
  VIDEO_FIXTURE,
  videoComposition,
  videoGoldenTimestamps,
} from '@kadrion/test-fixtures';

import { makeGreenScreenFixture, makeVideoFixture } from './video-fixture.ts';

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

    // The motion composition: rotation, origin, crop, and corner radius (D68).
    const motionResult = await renderFrames({
      document: motionComposition,
      resolveAsset: ({ id }) =>
        id === VIDEO_FIXTURE.id
          ? { bytes: video, mediaType: VIDEO_FIXTURE.mediaType }
          : (assets[id] ?? null),
      timesUs: motionGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
      ffmpeg: { ffmpegPath, ffprobePath },
    });
    const motionFrames = motionResult.frames.map(({ index, timeUs, png }) => {
      const file = `motion-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'motion.golden-frames.json'),
      `${JSON.stringify({ render: motionResult.manifest, environment, frames: motionFrames }, null, 2)}\n`,
    );
    for (const frame of motionFrames) console.log(`${frame.file} ${frame.sha256}`);

    // The text composition: a stroke, a shadow, a box, and fragments of every unit and order (D69).
    const textResult = await renderFrames({
      document: textComposition,
      resolveAsset: ({ id }) => assets[id] ?? null,
      timesUs: textGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
    });
    const textFrames = textResult.frames.map(({ index, timeUs, png }) => {
      const file = `text-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'text.golden-frames.json'),
      `${JSON.stringify({ render: textResult.manifest, environment, frames: textFrames }, null, 2)}
`,
    );
    for (const frame of textFrames) console.log(`${frame.file} ${frame.sha256}`);

    // The animated captions composition: entrances, a highlight that moves, and an exit (D70).
    const captionsMotionResult = await renderFrames({
      document: captionsMotionComposition,
      resolveAsset: ({ id }) => assets[id] ?? null,
      timesUs: captionsMotionGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
    });
    const captionsMotionFrames = captionsMotionResult.frames.map(({ index, timeUs, png }) => {
      const file = `captions-motion-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'captions-motion.golden-frames.json'),
      `${JSON.stringify({ render: captionsMotionResult.manifest, environment, frames: captionsMotionFrames }, null, 2)}\n`,
    );
    for (const frame of captionsMotionFrames) console.log(`${frame.file} ${frame.sha256}`);

    // The effects composition: every kind over an image, a text, and a video, and the blur dissolve (D71).
    const effectsResult = await renderFrames({
      document: effectsComposition,
      resolveAsset: ({ id }) =>
        id === VIDEO_FIXTURE.id
          ? { bytes: video, mediaType: VIDEO_FIXTURE.mediaType }
          : (assets[id] ?? null),
      timesUs: effectsGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
      ffmpeg: { ffmpegPath, ffprobePath },
    });
    const effectsFrames = effectsResult.frames.map(({ index, timeUs, png }) => {
      const file = `effects-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'effects.golden-frames.json'),
      `${JSON.stringify({ render: effectsResult.manifest, environment, frames: effectsFrames }, null, 2)}\n`,
    );
    for (const frame of effectsFrames) console.log(`${frame.file} ${frame.sha256}`);

    // The SVG effects composition: every kind over an image, a text, and a video, and a key (D72).
    const green = await makeGreenScreenFixture(ffmpegPath);
    const effectsSvgResult = await renderFrames({
      document: effectsSvgComposition,
      resolveAsset: ({ id }) => {
        if (id === VIDEO_FIXTURE.id) return { bytes: video, mediaType: VIDEO_FIXTURE.mediaType };
        if (id === GREEN_SCREEN_FIXTURE.id) {
          return { bytes: green, mediaType: GREEN_SCREEN_FIXTURE.mediaType };
        }
        return assets[id] ?? null;
      },
      timesUs: effectsSvgGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
      ffmpeg: { ffmpegPath, ffprobePath },
    });
    const effectsSvgFrames = effectsSvgResult.frames.map(({ index, timeUs, png }) => {
      const file = `effects-svg-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'effects-svg.golden-frames.json'),
      `${JSON.stringify({ render: effectsSvgResult.manifest, environment, frames: effectsSvgFrames }, null, 2)}\n`,
    );
    for (const frame of effectsSvgFrames) console.log(`${frame.file} ${frame.sha256}`);

    // The composition of shapes: geometries, gradients, strokes, trims, and a morph (D73).
    const shapesResult = await renderFrames({
      document: shapesComposition,
      resolveAsset: ({ id }) => assets[id] ?? null,
      timesUs: shapesGoldenTimestamps.map(({ timeUs }) => timeUs),
      chromium,
    });
    const shapesFrames = shapesResult.frames.map(({ index, timeUs, png }) => {
      const file = `shapes-${String(timeUs)}.png`;
      writeFileSync(join(directory, file), png);
      return { file, timeUs, index, sha256: sha256(png) };
    });
    writeFileSync(
      join(directory, 'shapes.golden-frames.json'),
      `${JSON.stringify({ render: shapesResult.manifest, environment, frames: shapesFrames }, null, 2)}\n`,
    );
    for (const frame of shapesFrames) console.log(`${frame.file} ${frame.sha256}`);
  }
} finally {
  await chromium.browser.close();
}
