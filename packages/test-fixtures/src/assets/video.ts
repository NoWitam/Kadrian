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

/**
 * A green screen (D72): two seconds at 320x180 and 25 fps of a flat studio
 * green, `#00b140`, with the 128x96 picture of `testsrc2` moving across it
 * from x 40 by 50 pixels a second, made by the pinned FFmpeg like the video
 * above, every assembly off (`-cpuflags 0`) and the scaling bit-exact. The
 * chroma key of the SVG effects composition keys it.
 */
export const GREEN_SCREEN_FIXTURE = Object.freeze({
  id: 'asset-video-green',
  mediaType: 'video/mp4',
  contentHash: 'sha256:958229c517ad183021bbb60f90078b14a17d3727e04fc5a0463f06fb21a98f07',
  width: 320,
  height: 180,
  frames: 50,
  sourceDurationUs: 2_000_000,
});

/** The arguments of the pinned `ffmpeg` that make the green screen at `output`. */
export function greenScreenFixtureArguments(output: string): readonly string[] {
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
    'color=c=0x00b140:size=320x180:rate=25:duration=2',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=128x96:rate=25:duration=2',
    '-filter_complex',
    "[0:v][1:v]overlay=x='40+50*t':y=42:shortest=1:format=yuv420,format=yuv420p[v]",
    '-sws_flags',
    'bitexact+accurate_rnd+full_chroma_int',
    '-map',
    '[v]',
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
    '-filter_complex_threads',
    '1',
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
 * The fixture video turned by its container (D81): the stream of
 * `VIDEO_FIXTURE`, copied without decoding into MP4 by the pinned FFmpeg with
 * a display matrix, as a phone writes one into `tkhd`. One for each quarter
 * turn, with and without a mirror; `rotation` is clockwise and `flipped` a
 * mirror left to right after it, as `inspectVideo` states them, and `width`
 * and `height` are the size as shown. FFmpeg's `-display_rotation` turns
 * counter-clockwise, so a clockwise 90° is its 270. The bytes are made by
 * `rotatedVideoFixtureArguments` and never committed, like the video itself.
 */
export const ROTATED_VIDEO_FIXTURES = Object.freeze(
  (
    [
      [
        'rotated-90',
        90,
        false,
        ['-display_rotation', '270'],
        '0f625bfaf4abbf96b4912d37792a95a69652b276cefcabfe5d432f077e0b65dc',
      ],
      [
        'rotated-180',
        180,
        false,
        ['-display_rotation', '180'],
        'd5f042340c8313be560f95ed9f560e6e460541dbf9a06b446fb6c251f3384791',
      ],
      [
        'rotated-270',
        270,
        false,
        ['-display_rotation', '90'],
        '5808649b79525456405ea6ce5cc622851b735749a127b177b26350303cb1c90f',
      ],
      [
        'mirrored',
        0,
        true,
        ['-display_hflip'],
        '520fd591d0818eb33f47c842fea920909827488c18b2ed53e5722f0430d6005d',
      ],
      [
        'rotated-90-mirrored',
        90,
        true,
        ['-display_rotation', '90', '-display_vflip'],
        '9c915720373dc00132b03cfcc3a68f5fa869e0a343ed7e61419d87bd695db051',
      ],
      [
        'rotated-180-mirrored',
        180,
        true,
        ['-display_vflip'],
        '2af20ec33a08b2fa125f508bfc6f3fbbc8201177259519438fcba546bdef28cf',
      ],
      [
        'rotated-270-mirrored',
        270,
        true,
        ['-display_rotation', '90', '-display_hflip'],
        'bc13580eff39de9f7c4e6120a90667a77a2886a5d84e6e56c95cc1653fb0b2f9',
      ],
    ] as const
  ).map(([name, rotation, flipped, display, hash]) =>
    Object.freeze({
      name,
      mediaType: 'video/mp4',
      contentHash: `sha256:${hash}`,
      rotation,
      flipped,
      /** The input options of the pinned FFmpeg that write the display matrix. */
      display: Object.freeze([...display]),
      width: rotation % 180 === 0 ? VIDEO_FIXTURE.width : VIDEO_FIXTURE.height,
      height: rotation % 180 === 0 ? VIDEO_FIXTURE.height : VIDEO_FIXTURE.width,
      frames: VIDEO_FIXTURE.frames,
      sourceDurationUs: VIDEO_FIXTURE.sourceDurationUs,
    }),
  ),
);

/**
 * The fixture video tilted by 45° (D81): a display matrix that is no quarter
 * turn, which both hosts refuse. Made like the turned videos above.
 */
export const TILTED_VIDEO_FIXTURE = Object.freeze({
  name: 'tilted-45',
  mediaType: 'video/mp4',
  contentHash: 'sha256:1c19cde7bf05682aa4995b97ad10cfad355b6a88ed80f75625fb3489c64a2208',
  display: Object.freeze(['-display_rotation', '45']),
});

/**
 * The arguments of the pinned `ffmpeg` that copy the fixture video at `input`
 * into `output` with the display matrix of `display` (D81).
 */
export function rotatedVideoFixtureArguments(
  display: readonly string[],
  input: string,
  output: string,
): readonly string[] {
  return [
    '-nostdin',
    '-v',
    'error',
    '-y',
    ...display,
    '-i',
    input,
    '-map',
    '0:v:0',
    '-c',
    'copy',
    '-map_metadata',
    '-1',
    '-fflags',
    '+bitexact',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ];
}
