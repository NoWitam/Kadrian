/**
 * The video of the second reference composition (D50.8), made by the pinned
 * FFmpeg with the committed arguments of `@kadrion/test-fixtures` and accepted
 * only with the committed SHA-256: the bytes never enter Git, so every run
 * makes them again and proves they are the same. Self-contained, because
 * `update-goldens.ts` imports it under `--experimental-strip-types`.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  GREEN_SCREEN_FIXTURE,
  greenScreenFixtureArguments,
  rotatedVideoFixtureArguments,
  VIDEO_FIXTURE,
  VIDEO_SOUND_FIXTURE,
  videoFixtureArguments,
  videoSoundFixtureArguments,
} from '@kadrion/test-fixtures';

const run = promisify(execFile);

/** The bytes of the fixture video, made by the FFmpeg at `ffmpegPath` and checked. */
export function makeVideoFixture(ffmpegPath: string): Promise<Uint8Array> {
  return made(ffmpegPath, videoFixtureArguments, VIDEO_FIXTURE.contentHash);
}

/** The bytes of the fixture video with sound (D52.7), made and checked the same way. */
export function makeVideoSoundFixture(ffmpegPath: string): Promise<Uint8Array> {
  return made(ffmpegPath, videoSoundFixtureArguments, VIDEO_SOUND_FIXTURE.contentHash);
}

/** The bytes of the green-screen video of the SVG effects (D72), made and checked the same way. */
export function makeGreenScreenFixture(ffmpegPath: string): Promise<Uint8Array> {
  return made(ffmpegPath, greenScreenFixtureArguments, GREEN_SCREEN_FIXTURE.contentHash);
}

/**
 * The fixture video turned or tilted by its container (D81): the bytes of
 * `makeVideoFixture` copied with a display matrix, made and checked the same way.
 */
export function makeRotatedVideoFixture(
  ffmpegPath: string,
  video: Uint8Array,
  fixture: { readonly display: readonly string[]; readonly contentHash: string },
): Promise<Uint8Array> {
  return made(
    ffmpegPath,
    (output, directory) => {
      const input = join(directory, 'upright.mp4');
      writeFileSync(input, video);
      return rotatedVideoFixtureArguments(fixture.display, input, output);
    },
    fixture.contentHash,
  );
}

async function made(
  ffmpegPath: string,
  recipe: (output: string, directory: string) => readonly string[],
  contentHash: string,
): Promise<Uint8Array> {
  const directory = mkdtempSync(join(tmpdir(), 'kadrion-video-fixture-'));
  try {
    const output = join(directory, 'video.mp4');
    await run(ffmpegPath, [...recipe(output, directory)]);
    const bytes = new Uint8Array(readFileSync(output));
    const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (actual !== contentHash) {
      throw new Error(
        `The fixture video has ${actual}, not ${contentHash}: is this the pinned FFmpeg?`,
      );
    }
    return bytes;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * Every frame of the video as the pinned FFmpeg decodes it with the arguments
 * of the Producer (D50.5): packed RGB of the coded size, in presentation
 * order. With `autorotate`, FFmpeg turns the picture itself, as it shows a
 * file by default, before its conversion to RGB: what a turned video looks
 * like to FFmpeg (D81), which the Producer does not use.
 */
export async function decodedFixtureFrames(
  ffmpegPath: string,
  bytes: Uint8Array,
  autorotate = false,
): Promise<Uint8Array[]> {
  const directory = mkdtempSync(join(tmpdir(), 'kadrion-video-fixture-'));
  try {
    const input = join(directory, 'video.mp4');
    writeFileSync(input, bytes);
    const { stdout } = await run(
      ffmpegPath,
      [
        ...['-nostdin', '-v', 'error', '-threads', '1'],
        ...(autorotate ? [] : ['-noautorotate']),
        ...['-i', input, '-map', '0:v:0'],
        ...['-fps_mode', 'passthrough', '-sws_flags', 'bitexact+accurate_rnd+full_chroma_int'],
        ...['-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
      ],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
    );
    // A turn keeps the number of pixels, so every frame has the bytes of the coded size.
    const size = VIDEO_FIXTURE.width * VIDEO_FIXTURE.height * 3;
    return Array.from(
      { length: stdout.length / size },
      (_, at) => new Uint8Array(stdout.subarray(at * size, (at + 1) * size)),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
