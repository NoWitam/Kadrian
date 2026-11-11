/**
 * The sound of the Player (D53) with a recording double of Web Audio: what is
 * scheduled where, the clock it gives the picture, and the facts it reads.
 * That the browser's graph then sounds like the Producer's mix is measured in
 * pinned Chromium (`tests/pinned/audio-player.pinned.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { audioLayout, audioPlan, type AudioLayout } from '@kadrion/runtime';
import { stretchSound } from '@kadrion/runtime/stretch';
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { referenceComposition } from '@kadrion/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';

import {
  checkSoundRanges,
  decodeSound,
  scheduleSounds,
  soundFacts,
  StretchCache,
  type SoundContext,
} from '../src/audio.js';
import {
  createPlayer,
  type Player,
  type PlayerAsset,
  type PlayerAssetResolver,
  type PlayerScheduler,
} from '../src/index.js';
import { createHarness, sleep } from './harness.js';
import { headerPng } from './media.js';

const R = 48_000;

interface Automation {
  readonly kind: 'set' | 'ramp';
  readonly value: number;
  readonly time: number;
}

interface FakeNode {
  readonly kind: 'source' | 'gain' | 'destination';
  readonly connections: FakeNode[];
  readonly automation: Automation[];
  gainValue: number;
  buffer: unknown;
  started: [number, number, number] | null;
  stopped: boolean;
  disconnected: boolean;
  channelCount: number;
  channelCountMode: string;
  channelInterpretation: string;
}

function fakeNode(kind: FakeNode['kind']): FakeNode & Record<string, unknown> {
  const node = {
    kind,
    connections: [] as FakeNode[],
    automation: [] as Automation[],
    gainValue: 1,
    buffer: null as unknown,
    started: null as [number, number, number] | null,
    stopped: false,
    disconnected: false,
    channelCount: 2,
    channelCountMode: 'max',
    channelInterpretation: 'speakers',
    connect(target: FakeNode) {
      node.connections.push(target);
      return target;
    },
    disconnect() {
      node.disconnected = true;
    },
    start(when: number, offset: number, duration: number) {
      node.started = [when, offset, duration];
    },
    stop() {
      node.stopped = true;
    },
    gain: {
      set value(value: number) {
        node.gainValue = value;
      },
      get value() {
        return node.gainValue;
      },
      setValueAtTime(value: number, time: number) {
        node.automation.push({ kind: 'set', value, time });
      },
      linearRampToValueAtTime(value: number, time: number) {
        node.automation.push({ kind: 'ramp', value, time });
      },
    },
  };
  return node;
}

/** A buffer of `length` samples at 48 kHz. */
function buffer(length: number, numberOfChannels = 2): AudioBuffer {
  return { length, numberOfChannels, sampleRate: R, duration: length / R } as AudioBuffer;
}

/** A context whose clock the test moves, and which records every node it made. */
function fakeContext(
  options: {
    sampleRate?: number;
    state?: string;
    decoded?: (bytes: ArrayBuffer) => AudioBuffer;
  } = {},
) {
  const nodes: (FakeNode & Record<string, unknown>)[] = [];
  const destination = fakeNode('destination');
  const context = {
    sampleRate: options.sampleRate ?? R,
    currentTime: 0,
    outputLatency: 0,
    state: options.state ?? 'running',
    resumed: 0,
    destination,
    resume() {
      context.resumed += 1;
      context.state = 'running';
      return Promise.resolve();
    },
    decodeAudioData(bytes: ArrayBuffer) {
      return Promise.resolve((options.decoded ?? (() => buffer(10 * R)))(bytes));
    },
    createBufferSource() {
      const node = fakeNode('source');
      nodes.push(node);
      return node;
    },
    createGain() {
      const node = fakeNode('gain');
      nodes.push(node);
      return node;
    },
    createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      return {
        length,
        numberOfChannels,
        sampleRate,
        duration: length / sampleRate,
        channels,
        copyToChannel(source: Float32Array, channel: number) {
          channels[channel]?.set(source);
        },
      };
    },
  };
  const sources = () => nodes.filter(({ kind }) => kind === 'source');
  return { context, nodes, sources, destination };
}

const asContext = (value: unknown): SoundContext => value as SoundContext;

/** The chain of nodes from a source to the destination. */
function chainOf(source: FakeNode): FakeNode[] {
  const chain: FakeNode[] = [];
  let at: FakeNode | undefined = source;
  while (at !== undefined && at.kind !== 'destination') {
    chain.push(at);
    at = at.connections[0];
  }
  return chain;
}

function validated(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
}

/** The reference composition with its one clip replaced by `clips`. */
function withClips(clips: readonly Record<string, unknown>[]): ValidatedComposition {
  return validated({ ...(structuredClone(referenceComposition) as object), clips });
}

const CLIP = {
  id: 'clip-a',
  type: 'audio',
  assetId: 'asset-audio',
  startUs: 1_000_000,
  durationUs: 2_000_000,
  sourceStartUs: 500_000,
  sourceStartRemainder: 0,
  speed: { num: 1, den: 1 },
  reverse: false,
  volume: 0.5,
  fadeInUs: 500_000,
  fadeOutUs: 1_000_000,
};

function layoutOf(document: ValidatedComposition): AudioLayout {
  return audioLayout(audioPlan(document));
}

describe('scheduleSounds (D53)', () => {
  it('starts every sound at its sample, from its source sample, for the samples it is heard', () => {
    const { context, sources } = fakeContext();
    const layout = layoutOf(withClips([CLIP]));
    scheduleSounds(asContext(context), layout, new Map([['asset-audio', buffer(10 * R)]]), 0, 2);
    const [source] = sources();
    // Sample 48 000 is heard 1 s after `when`; source sample 24 000 is 0.5 s in.
    expect(source?.started).toEqual([3, 0.5, 2]);
  });

  it('gives the volume, the fades as automation on the grid, and no node it does not need', () => {
    const { context, sources } = fakeContext();
    const layout = layoutOf(withClips([CLIP]));
    scheduleSounds(asContext(context), layout, new Map([['asset-audio', buffer(10 * R)]]), 0, 2);
    const [source] = sources();
    const [, volume, fadeIn, fadeOut] = chainOf(source as FakeNode);
    expect(volume?.gainValue).toBe(0.5);
    expect(fadeIn?.automation).toEqual([
      { kind: 'set', value: 0, time: 3 },
      { kind: 'ramp', value: 1, time: 3.5 },
    ]);
    expect(fadeOut?.automation).toEqual([
      { kind: 'set', value: 1, time: 3 },
      { kind: 'set', value: 1, time: 4 },
      { kind: 'ramp', value: 0, time: 5 },
    ]);
    // A stereo source at volume 1 without fades goes straight to the destination.
    const plain = fakeContext();
    const flat = layoutOf(withClips([{ ...CLIP, volume: 1, fadeInUs: 0, fadeOutUs: 0 }]));
    scheduleSounds(
      asContext(plain.context),
      flat,
      new Map([['asset-audio', buffer(10 * R)]]),
      0,
      0,
    );
    expect(plain.sources()[0]?.connections).toEqual([plain.destination]);
  });

  it('hears a mono source at √½ on both channels, as the upmix of the Producer (D52.5)', () => {
    const { context, sources } = fakeContext();
    const flat = layoutOf(withClips([{ ...CLIP, volume: 1, fadeInUs: 0, fadeOutUs: 0 }]));
    scheduleSounds(asContext(context), flat, new Map([['asset-audio', buffer(10 * R, 1)]]), 0, 0);
    const [, upmix] = chainOf(sources()[0] as FakeNode);
    expect(upmix?.gainValue).toBe(Math.SQRT1_2);
    expect([upmix?.channelCount, upmix?.channelCountMode, upmix?.channelInterpretation]).toEqual([
      2,
      'explicit',
      'speakers',
    ]);
  });

  it('starts in the middle of a sound and of its fades, and leaves out what has ended', () => {
    const { context, sources } = fakeContext();
    const layout = layoutOf(
      withClips([
        CLIP,
        { ...CLIP, id: 'clip-b', startUs: 0, durationUs: 500_000, fadeInUs: 0, fadeOutUs: 0 },
      ]),
    );
    // From 1.25 s: clip-b has ended, clip-a is 0.25 s in, half-way through its fade-in.
    scheduleSounds(
      asContext(context),
      layout,
      new Map([['asset-audio', buffer(10 * R)]]),
      60_000,
      10,
    );
    expect(sources()).toHaveLength(1);
    const [source] = sources();
    expect(source?.started).toEqual([10, 0.75, 1.75]);
    const [, , fadeIn, fadeOut] = chainOf(source as FakeNode);
    expect(fadeIn?.automation).toEqual([
      { kind: 'set', value: 0.5, time: 10 },
      { kind: 'ramp', value: 1, time: 10.25 },
    ]);
    expect(fadeOut?.automation).toEqual([
      { kind: 'set', value: 1, time: 10 },
      { kind: 'set', value: 1, time: 10.75 },
      { kind: 'ramp', value: 0, time: 11.75 },
    ]);
  });

  it('hears nothing at or after toSample: one pass of a play range (D61.2)', () => {
    const { context, sources } = fakeContext();
    const layout = layoutOf(
      withClips([CLIP, { ...CLIP, id: 'clip-b', startUs: 2_000_000, fadeInUs: 0, fadeOutUs: 0 }]),
    );
    // To 2 s: clip-a stops 1 s in, clip-b starts there and is not heard at all.
    scheduleSounds(
      asContext(context),
      layout,
      new Map([['asset-audio', buffer(10 * R)]]),
      60_000,
      10,
      96_000,
    );
    expect(sources().map(({ started }) => started)).toEqual([[10, 0.75, 0.75]]);
  });

  it('stops and disconnects every sound once', () => {
    const { context, sources, nodes } = fakeContext();
    const scheduled = scheduleSounds(
      asContext(context),
      layoutOf(withClips([CLIP])),
      new Map([['asset-audio', buffer(10 * R)]]),
      0,
      0,
    );
    scheduled.stop();
    scheduled.stop();
    expect(sources().every(({ stopped }) => stopped)).toBe(true);
    expect(nodes.every(({ disconnected }) => disconnected)).toBe(true);
  });
});

/** A decoded buffer that holds `channels` from source sample 0. */
function samplesBuffer(channels: readonly Float32Array[]): AudioBuffer {
  const length = channels[0]?.length ?? 0;
  return {
    length,
    numberOfChannels: channels.length,
    sampleRate: R,
    duration: length / R,
    getChannelData: (channel: number) => channels[channel] as Float32Array,
  } as unknown as AudioBuffer;
}

/** Two channels of a 440 Hz and a 660 Hz tone, `seconds` long, at 48 kHz. */
function tones(seconds: number): Float32Array[] {
  return [440, 660].map((hz) =>
    Float32Array.from({ length: seconds * R }, (_, index) =>
      Math.sin((2 * Math.PI * hz * index) / R),
    ),
  );
}

describe('sounds at another speed or reversed (D82.6)', () => {
  const MAPPED = {
    ...CLIP,
    startUs: 1_000_000,
    durationUs: 500_000,
    sourceStartUs: 250_000,
    speed: { num: 1, den: 2 },
    fadeInUs: 0,
    fadeOutUs: 0,
  };
  const source = tones(2);

  function computedOf(node: FakeNode): Float32Array[] {
    return (node.buffer as { channels: Float32Array[] }).channels;
  }

  it('plays the samples stretchSound computes, from offset 0 of a buffer of their own', () => {
    const layout = layoutOf(withClips([MAPPED]));
    const [sound] = layout.sounds;
    const map = sound?.entry.map;
    if (sound === undefined || map === undefined) throw new Error('The clip is mapped.');
    const { context, sources } = fakeContext();
    scheduleSounds(
      asContext(context),
      layout,
      new Map([['asset-audio', samplesBuffer(source)]]),
      0,
      2,
    );
    const [node] = sources();
    if (node === undefined) throw new Error('No source.');
    expect(node.started).toEqual([3, 0, 0.5]);
    const expected = stretchSound({
      map,
      source: { channels: source, startSample: 0 },
      startSample: sound.startSample,
      sampleCount: sound.sampleCount,
    });
    expect(computedOf(node)).toEqual(expected);
  });

  it('computes from the sample a play starts at, the same samples as the whole', () => {
    const layout = layoutOf(withClips([{ ...MAPPED, speed: { num: 3, den: 2 }, reverse: true }]));
    const whole = fakeContext();
    scheduleSounds(
      asContext(whole.context),
      layout,
      new Map([['asset-audio', samplesBuffer(source)]]),
      0,
      0,
    );
    const seek = fakeContext();
    // From 1.25 s, a quarter of a second into the clip.
    scheduleSounds(
      asContext(seek.context),
      layout,
      new Map([['asset-audio', samplesBuffer(source)]]),
      60_000,
      0,
    );
    const [first] = whole.sources();
    const [second] = seek.sources();
    if (first === undefined || second === undefined) throw new Error('No source.');
    expect(second.started).toEqual([0, 0, 0.25]);
    expect(computedOf(second)).toEqual(
      computedOf(first).map((channel) => channel.subarray(12_000)),
    );
  });

  it('keeps what it computed, by source and map, and reads a later range from it', () => {
    const layout = layoutOf(withClips([MAPPED]));
    const map = layout.sounds[0]?.entry.map;
    if (map === undefined) throw new Error('The clip is mapped.');
    const decoded = samplesBuffer(source);
    const cache = new StretchCache();
    const all = cache.samples(decoded, map, 48_000, 24_000);
    const later = cache.samples(decoded, map, 60_000, 6_000);
    expect(later[0]?.buffer).toBe(all[0]?.buffer);
    expect(later).toEqual(all.map((channel) => channel.subarray(12_000, 18_000)));
    // Another buffer of the same asset is computed again.
    const other = cache.samples(samplesBuffer(tones(2)), map, 60_000, 6_000);
    expect(other[0]?.buffer).not.toBe(all[0]?.buffer);
    expect(other).toEqual(later);
  });

  it('checks the range a mapped sound hears against the buffer, as the Producer does', () => {
    // Reversed at 3/2 from 1 s for 0.5 s: it hears F(0) = 250 000 to F(499 999) = 999 998 µs.
    const layout = layoutOf(withClips([{ ...MAPPED, speed: { num: 3, den: 2 }, reverse: true }]));
    expect(() => {
      checkSoundRanges(layout, new Map([['asset-audio', buffer(48_000)]]));
    }).not.toThrow();
    expect(() => {
      checkSoundRanges(layout, new Map([['asset-audio', buffer(47_999)]]));
    }).toThrow(
      expect.objectContaining({
        code: 'source-range-exceeded',
        details: [
          'clip-a: 250000 to 999999 µs of "asset-audio", which holds 47999 samples at 48 kHz',
        ],
      }),
    );
  });
});

describe('decoding and the facts of a sound (D53)', () => {
  it('states the decoded length in whole microseconds, rounded down', () => {
    expect(soundFacts(buffer(R + 1))).toEqual({ type: 'audio', durationUs: 1_000_020 });
  });

  it('refuses bytes the browser cannot decode, no sample, and more than two channels', async () => {
    const failing = {
      sampleRate: R,
      decodeAudioData: () => Promise.reject(new Error('EncodingError')),
    };
    await expect(decodeSound(failing, 'a', new ArrayBuffer(4))).rejects.toMatchObject({
      code: 'audio-invalid',
    });
    const empty = { sampleRate: R, decodeAudioData: () => Promise.resolve(buffer(0)) };
    await expect(decodeSound(empty, 'a', new ArrayBuffer(4))).rejects.toMatchObject({
      code: 'audio-invalid',
    });
    const surround = { sampleRate: R, decodeAudioData: () => Promise.resolve(buffer(R, 6)) };
    await expect(decodeSound(surround, 'a', new ArrayBuffer(4))).rejects.toMatchObject({
      code: 'audio-unsupported',
    });
  });

  it('gives the decoder its own copy of the bytes', async () => {
    const given = new ArrayBuffer(4);
    let seen: ArrayBuffer | null = null;
    const context = {
      sampleRate: R,
      decodeAudioData: (bytes: ArrayBuffer) => {
        seen = bytes;
        return Promise.resolve(buffer(R));
      },
    };
    await decodeSound(context, 'a', given);
    expect(seen).not.toBe(given);
  });

  it('refuses a sound that reads past the end of its source, naming it (D49.6)', () => {
    const layout = layoutOf(withClips([CLIP]));
    // clip-a reads source samples 24 000 to 120 000.
    expect(() => {
      checkSoundRanges(layout, new Map([['asset-audio', buffer(120_000)]]));
    }).not.toThrow();
    expect(() => {
      checkSoundRanges(layout, new Map([['asset-audio', buffer(119_999)]]));
    }).toThrow(
      expect.objectContaining({
        code: 'source-range-exceeded',
        details: ['clip-a: samples 24000 to 120000 of "asset-audio", which holds 119999 at 48 kHz'],
      }),
    );
  });
});

// The Player itself, against its real page in jsdom.

const buildDirectory = new URL('../../renderer-dom/dist/runtime-build/', import.meta.url);
const runtime = {
  bytes: new Uint8Array(readFileSync(fileURLToPath(new URL('kadrion-runtime.js', buildDirectory)))),
  contentHash: (
    JSON.parse(
      readFileSync(fileURLToPath(new URL('kadrion-runtime.json', buildDirectory)), 'utf8'),
    ) as { contentHash: string }
  ).contentHash,
};

const bytesOf: Readonly<Record<string, PlayerAsset>> = {
  'asset-image': {
    bytes: headerPng(1),
    mediaType: 'image/png',
  },
  'asset-font': { bytes: new Uint8Array([0, 1, 0, 0]), mediaType: 'font/ttf' },
  'asset-audio': { bytes: new Uint8Array([82, 73, 70, 70]), mediaType: 'audio/wav' },
};

async function hashOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return `sha256:${Buffer.from(digest).toString('hex')}`;
}

/** The reference composition pinned to the test bytes. */
async function pinned(change: (copy: Record<string, unknown>) => void = () => undefined) {
  const copy = structuredClone(referenceComposition) as {
    assets: { id: string; contentHash: string }[];
  };
  for (const asset of copy.assets) {
    const given = bytesOf[asset.id];
    if (given !== undefined) asset.contentHash = await hashOf(given.bytes);
  }
  change(copy);
  return copy;
}

const resolve: PlayerAssetResolver = (request) => bytesOf[request.id] ?? null;

function manualScheduler() {
  let now = 0;
  let callbacks = new Map<number, () => void>();
  let next = 1;
  const scheduler: PlayerScheduler = {
    now: () => now,
    requestFrame: (callback) => {
      callbacks.set(next, callback);
      return next++;
    },
    cancelFrame: (handle) => {
      callbacks.delete(handle);
    },
  };
  return {
    scheduler,
    frames: () => callbacks.size,
    advance(milliseconds: number) {
      now += milliseconds;
      const due = callbacks;
      callbacks = new Map();
      for (const callback of due.values()) callback();
    },
  };
}

let players: Player[] = [];
afterEach(() => {
  for (const player of players) player.destroy();
  players = [];
});

async function started(options: Partial<Parameters<typeof createPlayer>[1]> = {}) {
  const harness = createHarness();
  const player = await createPlayer(harness.container, { runtime, ...options });
  players.push(player);
  return { harness, player };
}

const seeks = (harness: ReturnType<typeof createHarness>): number[] =>
  harness.log
    .filter((delivery) => (delivery.data as { type?: string }).type === 'kadrion-player:seek')
    .map((delivery) => (delivery.data as { timeUs: number }).timeUs);

describe('the option audio (D53)', () => {
  it('refuses a context at another rate than 48 kHz, and anything that is not a context', async () => {
    const at44 = fakeContext({ sampleRate: 44_100 }).context as unknown as AudioContext;
    await expect(started({ audio: { context: at44 } })).rejects.toMatchObject({
      code: 'invalid-options',
    });
    await expect(started({ audio: { context: {} as AudioContext } })).rejects.toMatchObject({
      code: 'invalid-options',
    });
  });

  it('decodes the sounds of a document at load, and refuses a clip past its source', async () => {
    const decoded: number[] = [];
    const fake = fakeContext({
      decoded: (bytes) => {
        decoded.push(bytes.byteLength);
        return buffer(R);
      },
    });
    const { player } = await started({
      audio: { context: fake.context as unknown as AudioContext },
    });
    // The reference clip hears 10 s of a source that decodes to 1 s here.
    await expect(player.load(await pinned(), resolve)).rejects.toMatchObject({
      code: 'source-range-exceeded',
    });
    expect(decoded).toEqual([4]);
  });
});

describe('playing with sound: the audio clock drives the picture (D53)', () => {
  async function playing(state = 'running') {
    const clock = manualScheduler();
    const fake = fakeContext({ state, decoded: () => buffer(20 * R) });
    const { harness, player } = await started({
      scheduler: clock.scheduler,
      audio: { context: fake.context as unknown as AudioContext },
    });
    await player.load(await pinned(), resolve);
    return { clock, fake, harness, player };
  }

  it('schedules the plan from the time shown, and shows the time that is heard', async () => {
    const { clock, fake, harness, player } = await playing();
    await player.seek(1_000_000);
    fake.context.currentTime = 7;
    player.play();
    const [source] = fake.sources();
    // From sample 48 000, a little ahead of the context's time; the clip reads its source from 1 s.
    expect(source?.started?.[0]).toBeCloseTo(7.05, 12);
    expect(source?.started?.slice(1)).toEqual([1, 9]);
    // The scheduler's time does not move the picture; the context's does.
    clock.advance(1_000);
    expect(player.getState().timeUs).toBe(1_000_000);
    fake.context.currentTime = 7.05 + 0.5;
    fake.context.outputLatency = 0.1;
    clock.advance(1);
    await harness.settle();
    await sleep(5);
    // 0.4 s heard: frame 42 of 30 fps, at 1.4 s.
    expect(seeks(harness).at(-1)).toBe(1_400_000);
  });

  it('stops the sound on pause, and starts it again from the time sought while playing', async () => {
    const { fake, player } = await playing();
    player.play();
    expect(fake.sources()).toHaveLength(1);
    const seek = player.seek(5_000_000);
    expect(fake.sources()[0]?.stopped).toBe(true);
    expect(fake.sources()).toHaveLength(2);
    expect(fake.sources()[1]?.started?.slice(1)).toEqual([5, 5]);
    await seek;
    player.pause();
    expect(fake.sources()[1]?.stopped).toBe(true);
    expect(player.getState().status).toBe('ready');
  });

  it('resumes a suspended context first, and only then schedules the sound', async () => {
    const { fake, player } = await playing('suspended');
    player.play();
    expect(fake.context.resumed).toBe(1);
    expect(fake.sources()).toHaveLength(0);
    await Promise.resolve();
    expect(fake.sources()).toHaveLength(1);
  });

  it('is waiting until a suspended context runs, then playing (D61.3)', async () => {
    const { player } = await playing('suspended');
    player.play();
    expect(player.getState().status).toBe('waiting');
    await Promise.resolve();
    await Promise.resolve();
    expect(player.getState().status).toBe('playing');
  });

  it('loops a range with its sound: each pass heard right after the one before, from the same samples (D61.2)', async () => {
    const { clock, fake, harness, player } = await playing();
    player.setPlayRange({ startUs: 1_000_000, endUs: 2_000_000, loop: true });
    fake.context.currentTime = 3;
    player.play();
    // The pass heard and the one after it, each the range's second of the clip's source.
    expect(fake.sources().map(({ started }) => started)).toEqual([
      [3.05, 1, 1],
      [4.05, 1, 1],
    ]);
    // Half a second into the second pass: the picture is at 1.5 s, and the third pass is
    // scheduled.
    fake.context.currentTime = 4.55;
    clock.advance(1);
    await harness.settle();
    await sleep(5);
    expect(seeks(harness).at(-1)).toBe(1_500_000);
    expect(fake.sources().map(({ started }) => started?.[0])).toEqual([3.05, 4.05, 5.05]);
    // In the third pass, then the fourth: the passes two behind are stopped, the next scheduled.
    fake.context.currentTime = 5.3;
    clock.advance(1);
    await harness.settle();
    await sleep(5);
    fake.context.currentTime = 6.3;
    clock.advance(1);
    await harness.settle();
    await sleep(5);
    expect(seeks(harness).at(-1)).toBe(1_233_333);
    const [first, second, third] = fake.sources();
    expect([first?.stopped, second?.stopped, third?.stopped]).toEqual([true, true, false]);
    expect(fake.sources().map(({ started }) => started?.[0])).toEqual([
      3.05, 4.05, 5.05, 6.05, 7.05,
    ]);
    player.pause();
    expect(fake.sources().every(({ stopped }) => stopped)).toBe(true);
  });

  it('plays a range to its end with the sound cut there, then ends (D61.1)', async () => {
    const { clock, fake, harness, player } = await playing();
    player.setPlayRange({ startUs: 1_000_000, endUs: 2_000_000, loop: false });
    fake.context.currentTime = 3;
    player.play();
    expect(fake.sources().map(({ started }) => started)).toEqual([[3.05, 1, 1]]);
    fake.context.currentTime = 4.2;
    clock.advance(1);
    await harness.settle();
    await sleep(5);
    expect(player.getState()).toMatchObject({ status: 'ended', timeUs: 1_966_666 });
    // The sound of the last frame plays to the range's end; the next play stops it.
    expect(fake.sources()[0]?.stopped).toBe(false);
    player.play();
    expect(fake.sources()[0]?.stopped).toBe(true);
  });

  it('plays the picture alone without the option audio', async () => {
    const clock = manualScheduler();
    const { harness, player } = await started({ scheduler: clock.scheduler });
    await player.load(await pinned(), resolve);
    player.play();
    clock.advance(100);
    clock.advance(1);
    await harness.settle();
    await sleep(5);
    expect(seeks(harness).at(-1)).toBe(100_000);
  });
});

describe('prepareAudio (D53)', () => {
  it('decodes one asset and states its facts, once per content hash', async () => {
    let count = 0;
    const fake = fakeContext({
      decoded: () => {
        count += 1;
        return buffer(3 * R);
      },
    });
    const { player } = await started({
      audio: { context: fake.context as unknown as AudioContext },
    });
    const asset = {
      id: 'asset-audio',
      type: 'audio',
      contentHash: await hashOf(bytesOf['asset-audio']?.bytes ?? new Uint8Array()),
    } as const;
    await expect(player.prepareAudio(asset, resolve)).resolves.toEqual({
      type: 'audio',
      durationUs: 3_000_000,
    });
    await player.prepareAudio(asset, () => null);
    expect(count).toBe(1);
  });

  it('is audio-unsupported in a window without Web Audio, and refuses what is not a sound', async () => {
    const { player } = await started();
    const asset = {
      id: 'asset-audio',
      type: 'audio',
      contentHash: `sha256:${'a'.repeat(64)}`,
    } as const;
    await expect(player.prepareAudio(asset, resolve)).rejects.toMatchObject({
      code: 'audio-unsupported',
    });
    await expect(player.prepareAudio({ ...asset, type: 'image' }, resolve)).rejects.toMatchObject({
      code: 'invalid-options',
    });
  });

  it('verifies the bytes before it decodes them', async () => {
    const fake = fakeContext();
    const { player } = await started({
      audio: { context: fake.context as unknown as AudioContext },
    });
    const asset = {
      id: 'asset-audio',
      type: 'audio',
      contentHash: `sha256:${'a'.repeat(64)}`,
    } as const;
    await expect(player.prepareAudio(asset, resolve)).rejects.toMatchObject({
      code: 'asset-hash-mismatch',
    });
  });
});
