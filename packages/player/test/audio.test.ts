/**
 * The sound of the Player (D53) with a recording double of Web Audio: what is
 * scheduled where, the clock it gives the picture, and the facts it reads.
 * That the browser's graph then sounds like the Producer's mix is measured in
 * pinned Chromium (`tests/pinned/audio-player.pinned.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { audioLayout, audioPlan, type AudioLayout } from '@kadrion/runtime';
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { referenceComposition } from '@kadrion/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';

import {
  checkSoundRanges,
  decodeSound,
  scheduleSounds,
  soundFacts,
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
    bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
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
