/**
 * The frames of a decoder's output, read one at a time (D50.5): a frame is
 * whole whatever the sizes of the chunks, a writer that runs ahead is held back
 * instead of piling up, and the end, an end inside a frame, and a failure each
 * settle the read that waits. The pinned FFmpeg itself is exercised in
 * `tests/pinned`.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { ProducerError } from '../src/errors.js';
import { frameQueue } from '../src/ffmpeg.js';

const FRAME = 6_000;

/** Frame `index`: every byte tells which frame it is of and where in it. */
function frame(index: number): Buffer {
  const bytes = Buffer.alloc(FRAME);
  for (let at = 0; at < FRAME; at += 1) bytes[at] = (index * 31 + at) % 251;
  return bytes;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('frameQueue', () => {
  it('reads whole frames in order whatever the chunks they arrive in', async () => {
    const stream = new PassThrough();
    const frames = frameQueue(stream, FRAME);
    const all = Buffer.concat([frame(0), frame(1), frame(2)]);
    // Chunks that end inside a frame, at its end, and hold more than one.
    for (const [from, to] of [
      [0, 1],
      [1, 4_000],
      [4_000, FRAME],
      [FRAME, FRAME * 2 + 17],
      [FRAME * 2 + 17, FRAME * 3],
    ] as const) {
      stream.write(all.subarray(from, to));
    }
    stream.end();
    frames.end();
    expect(Buffer.from((await frames.next()) ?? [])).toEqual(frame(0));
    expect(Buffer.from((await frames.next()) ?? [])).toEqual(frame(1));
    expect(Buffer.from((await frames.next()) ?? [])).toEqual(frame(2));
    expect(await frames.next()).toBeNull();
    expect(await frames.next()).toBeNull();
  });

  it('settles a read that waits when the bytes of its frame arrive', async () => {
    const stream = new PassThrough();
    const frames = frameQueue(stream, FRAME);
    let read: Uint8Array | null | undefined;
    const pending = frames.next().then((value) => (read = value));
    stream.write(frame(4).subarray(0, FRAME - 1));
    await tick();
    expect(read).toBeUndefined();
    stream.write(frame(4).subarray(FRAME - 1));
    await pending;
    expect(Buffer.from(read ?? [])).toEqual(frame(4));
  });

  it('holds a writer that runs ahead back instead of taking its frames in', async () => {
    const stream = new PassThrough();
    const frames = frameQueue(stream, FRAME);
    expect(Buffer.from((await readAfter(stream, frames, frame(0))) ?? [])).toEqual(frame(0));
    // Nobody reads: the stream accepts frames only up to its high-water mark.
    let accepted = 0;
    while (stream.write(frame(accepted + 1)) && accepted < 10_000) accepted += 1;
    await tick();
    expect(accepted).toBeLessThan(64);
    expect(stream.readableLength).toBeLessThanOrEqual(stream.readableHighWaterMark + FRAME);
    expect(Buffer.from((await frames.next()) ?? [])).toEqual(frame(1));
    expect(Buffer.from((await frames.next()) ?? [])).toEqual(frame(2));
  });

  it('refuses a second read while one waits', async () => {
    const stream = new PassThrough();
    const frames = frameQueue(stream, FRAME);
    const first = frames.next();
    await expect(frames.next()).rejects.toMatchObject({ code: 'page-error' });
    stream.end();
    frames.end();
    expect(await first).toBeNull();
  });

  it('rejects when the stream ends inside a frame', async () => {
    const stream = new PassThrough();
    const frames = frameQueue(stream, FRAME);
    stream.write(frame(0));
    stream.write(frame(1).subarray(0, 100));
    stream.end();
    expect(Buffer.from((await frames.next()) ?? [])).toEqual(frame(0));
    const torn = frames.next();
    await tick();
    frames.end();
    await expect(torn).rejects.toMatchObject({ code: 'video-undecodable' });
    await expect(frames.next()).rejects.toMatchObject({ code: 'video-undecodable' });
  });

  it('rejects a read that waits, and every later one, with the first failure', async () => {
    const stream = new PassThrough();
    const frames = frameQueue(stream, FRAME);
    const pending = frames.next();
    frames.fail(new ProducerError('cancelled', 'The video decoder was closed.'));
    frames.fail(new ProducerError('video-undecodable', 'later'));
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    stream.write(frame(0));
    await expect(frames.next()).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('copies each frame once: a read frame is not a view of the next', async () => {
    const stream = new PassThrough();
    const frames = frameQueue(stream, FRAME);
    stream.write(Buffer.concat([frame(0), frame(1)]));
    const first = await frames.next();
    const second = await frames.next();
    expect(first?.length).toBe(FRAME);
    expect(Buffer.from(first ?? [])).toEqual(frame(0));
    expect(Buffer.from(second ?? [])).toEqual(frame(1));
  });
});

async function readAfter(
  stream: PassThrough,
  frames: { next(): Promise<Uint8Array | null> },
  bytes: Buffer,
): Promise<Uint8Array | null> {
  stream.write(bytes);
  return frames.next();
}
