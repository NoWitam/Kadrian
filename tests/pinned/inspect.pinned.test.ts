/**
 * The verdict corpus of `inspectVideo` (D79.4): small videos the pinned FFmpeg
 * makes in the test, one for each case of the Player's rule (D79.2), each with
 * the verdict it must get. H.264 in MP4, fragmented MP4, MOV and MKV plays
 * directly, with the facts ffprobe reads; HEVC, VP9, AV1, 10-bit, 4:2:2,
 * interlaced, BT.2020 and rotated pictures, another container, more than two audio
 * channels and a file without video do not, each for its own reason. The
 * command `kadrion inspect --json` (D79.6) gives the same verdict for a file.
 * Skipped without `KADRION_FFMPEG` and `KADRION_FFPROBE`; required where the
 * run is pinned.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { runCli } from '@kadrion/cli';
import { inspectVideo, type VideoInspection, type VideoInspectionCode } from '@kadrion/player';
import { PINNED_IMAGE, PINNED_IMAGE_VARIABLE } from '@kadrion/producer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ffmpegPath = process.env.KADRION_FFMPEG;
const ffprobePath = process.env.KADRION_FFPROBE;
const available = ffmpegPath !== undefined && ffprobePath !== undefined;
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;
const run = promisify(execFile);

/** One second of 64x36 test picture at 25 fps, the same bytes on every machine. */
const PICTURE = ['-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=25:duration=1'];
const EXACT = ['-threads', '1', '-map_metadata', '-1', '-fflags', '+bitexact'];
const X264 = ['-c:v', 'libx264', '-bf', '2', '-g', '10', '-flags:v', '+bitexact'];

interface Case {
  readonly name: string;
  readonly file: string;
  /** The FFmpeg arguments after the input options, before the output path. */
  readonly made: readonly string[];
  /** Another file of the corpus the case is made from, instead of the test picture. */
  readonly from?: string;
  readonly playable: boolean;
  readonly codes: readonly VideoInspectionCode[];
  readonly container: VideoInspection['container'];
}

const COPY = ['-map', '0', '-c', 'copy'];

const CASES: readonly Case[] = [
  {
    name: 'H.264 in MP4',
    file: 'h264.mp4',
    made: [...PICTURE, ...X264, '-x264-params', 'asm=0', '-pix_fmt', 'yuv420p'],
    playable: true,
    codes: [],
    container: 'mp4',
  },
  {
    name: 'H.264 in fragmented MP4',
    file: 'fragmented.mp4',
    from: 'h264.mp4',
    made: [...COPY, '-movflags', 'frag_keyframe+empty_moov+default_base_moof'],
    playable: true,
    codes: [],
    container: 'mp4',
  },
  {
    name: 'H.264 in MOV',
    file: 'h264.mov',
    from: 'h264.mp4',
    made: COPY,
    playable: true,
    codes: [],
    container: 'mov',
  },
  {
    name: 'H.264 in MKV',
    file: 'h264.mkv',
    from: 'h264.mp4',
    made: COPY,
    playable: true,
    codes: [],
    container: 'mkv',
  },
  {
    name: 'H.264 in MKV with stereo AAC',
    file: 'sound.mkv',
    made: [
      ...PICTURE,
      ...['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1'],
      ...X264,
      ...['-x264-params', 'asm=0', '-pix_fmt', 'yuv420p', '-ac', '2', '-c:a', 'aac'],
    ],
    playable: true,
    codes: [],
    container: 'mkv',
  },
  {
    name: 'HEVC in MP4',
    file: 'hevc.mp4',
    made: [...PICTURE, '-c:v', 'libx265', '-x265-params', 'log-level=none', '-tag:v', 'hvc1'],
    playable: false,
    codes: ['codec'],
    container: 'mp4',
  },
  {
    name: 'VP9 in WebM (K3)',
    file: 'vp9.webm',
    made: [...PICTURE, '-c:v', 'libvpx-vp9'],
    playable: false,
    codes: ['codec'],
    container: 'webm',
  },
  {
    name: 'AV1 in MP4 (K3)',
    file: 'av1.mp4',
    made: [...PICTURE, '-c:v', 'libaom-av1', '-cpu-used', '8'],
    playable: false,
    codes: ['codec'],
    container: 'mp4',
  },
  {
    name: '10-bit H.264',
    file: 'ten-bit.mp4',
    made: [...PICTURE, ...X264, '-x264-params', 'asm=0', '-pix_fmt', 'yuv420p10le'],
    playable: false,
    codes: ['bit-depth'],
    container: 'mp4',
  },
  {
    name: '4:2:2 H.264',
    file: 'four-two-two.mp4',
    made: [...PICTURE, ...X264, '-x264-params', 'asm=0', '-pix_fmt', 'yuv422p'],
    playable: false,
    codes: ['chroma'],
    container: 'mp4',
  },
  {
    name: 'interlaced H.264',
    file: 'interlaced.mp4',
    made: [
      ...PICTURE,
      ...X264,
      ...['-flags', '+ildct+ilme', '-x264-params', 'asm=0:interlaced=1', '-pix_fmt', 'yuv420p'],
    ],
    playable: false,
    codes: ['interlaced'],
    container: 'mp4',
  },
  {
    name: 'BT.2020 H.264',
    file: 'bt2020.mp4',
    made: [
      ...PICTURE,
      ...X264,
      ...['-x264-params', 'asm=0', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt2020'],
      ...['-color_trc', 'smpte2084', '-colorspace', 'bt2020nc'],
    ],
    playable: false,
    codes: ['colour'],
    container: 'mp4',
  },
  {
    name: 'rotated H.264 (K2)',
    file: 'rotated.mp4',
    from: 'h264.mp4',
    made: COPY,
    playable: false,
    codes: ['rotation'],
    container: 'mp4',
  },
  {
    name: 'H.264 in MPEG-TS',
    file: 'h264.ts',
    from: 'h264.mp4',
    made: [...COPY, '-f', 'mpegts'],
    playable: false,
    // Annex B in the stream, with no decoder configuration record beside it.
    codes: ['container', 'codec'],
    container: 'other',
  },
  {
    name: 'H.264 with 5.1 audio',
    file: 'surround.mp4',
    made: [
      ...PICTURE,
      ...['-f', 'lavfi', '-i', 'anullsrc=channel_layout=5.1:sample_rate=48000'],
      ...X264,
      ...['-x264-params', 'asm=0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'],
    ],
    playable: false,
    codes: ['audio-channels'],
    container: 'mp4',
  },
  {
    name: 'audio without video',
    file: 'sound-only.mp4',
    made: [
      ...['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1'],
      ...['-c:a', 'aac', '-ac', '2'],
    ],
    playable: false,
    codes: ['no-video'],
    container: 'mp4',
  },
];

/** The input options of a case made from another file of the corpus. */
const INPUT_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  'rotated.mp4': ['-display_rotation', '90'],
};

describe('the pinned FFmpeg for the verdict corpus (D79.4)', () => {
  it('is given wherever the run is pinned, and its absence is stated elsewhere', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info(
        'The verdict corpus is skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set.',
      );
    }
  });
});

describe.skipIf(!available)('the verdict corpus of inspectVideo (D79.2, D79.4)', () => {
  let directory: string;
  const verdicts = new Map<string, VideoInspection>();

  const path = (file: string): string => join(directory, file);

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'kadrion-inspect-corpus-'));
    for (const entry of CASES) {
      const input =
        entry.from === undefined
          ? []
          : [...(INPUT_OPTIONS[entry.file] ?? []), '-i', path(entry.from)];
      await run(ffmpegPath ?? '', [
        ...['-nostdin', '-v', 'error', '-y', ...input, ...entry.made, ...EXACT, path(entry.file)],
      ]);
      verdicts.set(entry.file, await inspectVideo(new Uint8Array(readFileSync(path(entry.file)))));
    }
  }, 120_000);

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it.each(CASES)('gives $name the verdict it must get', (entry) => {
    const verdict = verdicts.get(entry.file);
    expect(verdict?.playable, entry.file).toBe(entry.playable);
    expect(verdict?.reasons.map(({ code }) => code)).toEqual(entry.codes);
    expect(verdict?.container).toBe(entry.container);
    for (const reason of verdict?.reasons ?? []) expect(reason.message).not.toBe('');
  });

  it.each(CASES.filter((entry) => entry.playable))(
    "states for $name the facts the Producer's ffprobe reads (D50.5)",
    async (entry) => {
      const { stdout } = await run(ffprobePath ?? '', [
        ...['-v', 'error', '-select_streams', 'v:0', '-count_packets'],
        ...['-show_entries', 'stream=width,height,time_base,nb_read_packets,r_frame_rate'],
        ...['-of', 'json', path(entry.file)],
      ]);
      const stream = (
        JSON.parse(stdout) as {
          streams: {
            width: number;
            height: number;
            time_base: string;
            nb_read_packets: string;
            r_frame_rate: string;
          }[];
        }
      ).streams[0];
      const [num, den] = (stream?.time_base ?? '').split('/').map(Number);
      const [rateNum, rateDen] = (stream?.r_frame_rate ?? '').split('/').map(Number);
      const video = verdicts.get(entry.file)?.video;
      expect(video).toMatchObject({
        codec: 'avc',
        width: stream?.width,
        height: stream?.height,
        rotation: 0,
        flipped: false,
        frames: Number(stream?.nb_read_packets),
        timeBase: { num, den },
        frameRate: { num: rateNum, den: rateDen },
        durationUs: 1_000_000,
      });
    },
  );

  it('states the audio of a file beside the picture', () => {
    expect(verdicts.get('sound.mkv')?.audio).toEqual({
      codec: 'aac',
      channels: 2,
      sampleRate: 48_000,
    });
    expect(verdicts.get('surround.mp4')?.audio?.channels).toBe(6);
    expect(verdicts.get('h264.mp4')?.audio).toBeNull();
  });

  it('gives the same verdict through `kadrion inspect --json` (D79.6)', async () => {
    for (const file of ['h264.mkv', 'hevc.mp4', 'rotated.mp4']) {
      const out: string[] = [];
      const code = await runCli(['inspect', '--json', path(file)], {
        out: (line) => out.push(line),
        err: () => undefined,
      });
      expect(code, file).toBe(0);
      expect(JSON.parse(out.join('\n'))).toEqual(
        JSON.parse(JSON.stringify(verdicts.get(file))) as unknown,
      );
    }
  });
});
