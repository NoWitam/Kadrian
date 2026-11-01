/**
 * The video of the second reference composition (D50.8). Unlike the other
 * assets it is not generated in TypeScript: an H.264 stream can only be made
 * by an encoder, so the bytes come from the pinned FFmpeg (D29.1), run with
 * the fixed arguments below, and the SHA-256 they must have is committed with
 * them (roadmap of phase three, "generated media stay out of Git"). The file
 * itself is never committed. `tests/pinned/video-fixture.ts` makes it, and every
 * consumer checks the hash before it uses the bytes.
 */

/** What the recipe makes and what its bytes must be. */
export const VIDEO_FIXTURE = Object.freeze({
  id: 'asset-video',
  mediaType: 'video/mp4',
  contentHash: 'sha256:2defeadc24e956a808f058058c9ae10e4fad87d05b33be9b9d5ea6da2b45d1e0',
  /** The media facts of the stream, as the pinned ffprobe reads them (D49.6). */
  width: 320,
  height: 180,
  frames: 75,
  timeBase: Object.freeze({ num: 1, den: 12_800 }),
  /** Every frame lasts 512 ticks, 40 ms: 25 frames per second, from presentation time 0. */
  frameTicks: 512,
  sourceDurationUs: 3_000_000,
});

/**
 * The arguments of the pinned `ffmpeg` that make the video at `output`: three
 * seconds of `testsrc2` at 320x180 and 25 fps, H.264 with B-frames, one
 * thread, x264 without assembly, and every bit-exact flag, so that the bytes do not depend on the
 * machine (D29.4).
 */
export function videoFixtureArguments(output: string): readonly string[] {
  return [
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=25:duration=3',
    '-map',
    '0:v:0',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-g',
    '25',
    '-bf',
    '2',
    '-threads',
    '1',
    // x264's assembly differs between CPUs (AVX-512 or not): C only, so every
    // machine makes the same bytes.
    '-x264-params',
    'asm=0',
    '-pix_fmt',
    'yuv420p',
    '-map_metadata',
    '-1',
    '-fflags',
    '+bitexact',
    '-flags:v',
    '+bitexact',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ];
}

/**
 * A video with sound (D52.7): the picture of `VIDEO_FIXTURE` and three seconds
 * of a 440 Hz sine at 48 kHz in AAC, stereo, made by the pinned FFmpeg like
 * the video above. FFmpeg's own assembly differs between CPUs too, so this
 * recipe turns it off for every codec (`-cpuflags 0`) as well as x264's;
 * without that flag the AAC bytes differ on a CPU with AVX-512.
 */
export const VIDEO_SOUND_FIXTURE = Object.freeze({
  id: 'asset-video-sound',
  mediaType: 'video/mp4',
  contentHash: 'sha256:95f5bd4d2f95207842f32a517f6289437d4e41688505c096d1297eca9e430239',
  width: 320,
  height: 180,
  frames: 75,
  sourceDurationUs: 3_000_000,
  /** The tone of the sound, in hertz, and its sample rate. */
  toneHz: 440,
  sampleRate: 48_000,
});

/** The arguments of the pinned `ffmpeg` that make the video with sound at `output`. */
export function videoSoundFixtureArguments(output: string): readonly string[] {
  return [
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-cpuflags',
    '0',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=25:duration=3',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000:duration=3',
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-g',
    '25',
    '-bf',
    '2',
    '-threads',
    '1',
    '-x264-params',
    'asm=0',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-map_metadata',
    '-1',
    '-fflags',
    '+bitexact',
    '-flags:v',
    '+bitexact',
    '-flags:a',
    '+bitexact',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ];
}
