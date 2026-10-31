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

import { VIDEO_FIXTURE, videoFixtureArguments } from '@kadrion/test-fixtures';

const run = promisify(execFile);

/** The bytes of the fixture video, made by the FFmpeg at `ffmpegPath` and checked. */
export async function makeVideoFixture(ffmpegPath: string): Promise<Uint8Array> {
  const directory = mkdtempSync(join(tmpdir(), 'kadrion-video-fixture-'));
  try {
    const output = join(directory, 'video.mp4');
    await run(ffmpegPath, [...videoFixtureArguments(output)]);
    const bytes = new Uint8Array(readFileSync(output));
    const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (actual !== VIDEO_FIXTURE.contentHash) {
      throw new Error(
        `The fixture video has ${actual}, not ${VIDEO_FIXTURE.contentHash}: is this the pinned FFmpeg?`,
      );
    }
    return bytes;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * Every frame of the video as the pinned FFmpeg decodes it with the arguments
 * of the Producer (D50.5): packed RGB, in presentation order.
 */
export async function decodedFixtureFrames(
  ffmpegPath: string,
  bytes: Uint8Array,
): Promise<Uint8Array[]> {
  const directory = mkdtempSync(join(tmpdir(), 'kadrion-video-fixture-'));
  try {
    const input = join(directory, 'video.mp4');
    writeFileSync(input, bytes);
    const { stdout } = await run(
      ffmpegPath,
      [
        ...['-nostdin', '-v', 'error', '-threads', '1', '-i', input, '-map', '0:v:0'],
        ...['-fps_mode', 'passthrough', '-sws_flags', 'bitexact+accurate_rnd+full_chroma_int'],
        ...['-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
      ],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
    );
    const size = VIDEO_FIXTURE.width * VIDEO_FIXTURE.height * 3;
    return Array.from(
      { length: stdout.length / size },
      (_, at) => new Uint8Array(stdout.subarray(at * size, (at + 1) * size)),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
