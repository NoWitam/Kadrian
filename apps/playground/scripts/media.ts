/**
 * The media of the playground's showcases (D32.10): the video of the video
 * showcase, made by the pinned FFmpeg with the committed recipe of
 * `@kadrion/test-fixtures` (D50.8) and kept only with the SHA-256 committed
 * there, into `.kadrion-cache/playground-media/`, which Git ignores. The page
 * serves the directory under `/media/`, and the Player verifies the hash again.
 *
 *   node --run build && KADRION_FFMPEG=<pinned ffmpeg> node --run playground:media
 *
 * FFmpeg comes from `--ffmpeg <path>` or `KADRION_FFMPEG`, never from PATH:
 * another build makes other bytes, which this script refuses (D29.4).
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { VIDEO_FIXTURE, videoFixtureArguments } from '@kadrion/test-fixtures';

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** The directory the page serves under `/media/`; the same as `MEDIA_DIRECTORY` of serve.ts. */
export const MEDIA_OUTPUT = join(repoRoot, '.kadrion-cache', 'playground-media');

/** One medium of the page: its file under `/media/`, the recipe, and the hash it must have. */
export const PLAYGROUND_MEDIA: readonly {
  readonly file: string;
  readonly contentHash: string;
  readonly recipe: (output: string) => readonly string[];
}[] = [
  { file: 'video.mp4', contentHash: VIDEO_FIXTURE.contentHash, recipe: videoFixtureArguments },
];

const sha256 = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/**
 * Makes every medium that is missing or has other bytes into `directory`, and
 * returns the files it wrote. A file whose bytes do not have the committed hash
 * is removed, never served.
 */
export async function makePlaygroundMedia(
  ffmpegPath: string,
  directory: string = MEDIA_OUTPUT,
): Promise<string[]> {
  mkdirSync(directory, { recursive: true });
  const written: string[] = [];
  for (const medium of PLAYGROUND_MEDIA) {
    const target = join(directory, medium.file);
    let present: Uint8Array | null;
    try {
      present = new Uint8Array(readFileSync(target));
    } catch {
      present = null;
    }
    if (present !== null && sha256(present) === medium.contentHash) continue;
    const partial = `${target}.partial.mp4`;
    try {
      await run(ffmpegPath, [...medium.recipe(partial)]);
      const actual = sha256(new Uint8Array(readFileSync(partial)));
      if (actual !== medium.contentHash) {
        throw new Error(
          `${medium.file} has ${actual}, not ${medium.contentHash}: is ${ffmpegPath} the pinned FFmpeg?`,
        );
      }
      renameSync(partial, target);
      written.push(medium.file);
    } finally {
      rmSync(partial, { force: true });
    }
  }
  return written;
}

function ffmpegOf(argv: readonly string[]): string {
  const at = argv.indexOf('--ffmpeg');
  const given = at === -1 ? process.env.KADRION_FFMPEG : argv[at + 1];
  if (given === undefined || given === '') {
    throw new Error('No FFmpeg given: pass --ffmpeg <path> or set KADRION_FFMPEG (D29.1).');
  }
  return given;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  normalize(invokedPath).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
) {
  makePlaygroundMedia(ffmpegOf(process.argv.slice(2))).then(
    (written) => {
      console.log(
        written.length === 0
          ? `The playground's media are present in ${MEDIA_OUTPUT}.`
          : `Made ${written.join(', ')} in ${MEDIA_OUTPUT}.`,
      );
    },
    (reason: unknown) => {
      console.error(reason instanceof Error ? reason.message : String(reason));
      process.exitCode = 1;
    },
  );
}
