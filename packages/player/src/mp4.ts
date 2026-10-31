/**
 * The container reader of the Player (D51.3): the first video track of an
 * ISO base media file (MP4, MOV), read from verified bytes, giving what the
 * browser decoder needs (codec string, decoder configuration, every sample's
 * place, decode time, presentation time, and whether it is a sync sample) and
 * the media facts of D49.6 (size, time base, presentation timestamps, the
 * duration of the last frame). The facts are those the pinned ffprobe reads
 * for the same bytes; a file this reader cannot read exactly that way is
 * refused with `video-unsupported`, never read approximately. Pure: no DOM.
 */
import type { TimeBase } from '@kadrion/schema';

import { avcColour, type AvcColour, type ColourDescription } from './avc.js';
import { PlayerError } from './errors.js';

/** Random access to verified bytes: a `Blob` in a browser, an array in tests. */
export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** One sample of the track, in decode order. */
export interface Mp4Sample {
  readonly offset: number;
  readonly size: number;
  /** The presentation time in the media's time base, as the edit list shifts it. */
  readonly pts: number;
  readonly sync: boolean;
}

/** The first video track of a file. */
export interface Mp4VideoTrack {
  /** The WebCodecs codec string, for example `avc1.64000c`. */
  readonly codec: string;
  /** The decoder configuration record (`avcC`), the WebCodecs `description`. */
  readonly description: Uint8Array;
  /** How the Producer's decode converts its frames to RGB (D51.4). */
  readonly colour: AvcColour;
  readonly width: number;
  readonly height: number;
  readonly timeBase: TimeBase;
  /** Every sample in decode order. */
  readonly samples: readonly Mp4Sample[];
  /** For presentation index `i`, the decode index of its sample. */
  readonly presentation: readonly number[];
  /** The presentation timestamps in presentation order, strictly ascending (D49.5). */
  readonly timestamps: readonly number[];
  /** The duration of the last frame in presentation order, in ticks (D50.3). */
  readonly lastDuration: number;
}

/** The largest `moov` box the reader accepts: the index of a very long file. */
const MOOV_LIMIT = 64 * 1024 * 1024;

function unsupported(message: string): PlayerError {
  return new PlayerError('video-unsupported', message);
}

interface Box {
  readonly type: string;
  /** Where the payload starts and ends, relative to the buffer it was read from. */
  readonly start: number;
  readonly end: number;
}

function typeAt(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(
    bytes[at] as number,
    bytes[at + 1] as number,
    bytes[at + 2] as number,
    bytes[at + 3] as number,
  );
}

/** The child boxes of `bytes[start, end)`; a box that does not fit is a malformed file. */
function children(bytes: Uint8Array, start: number, end: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: Box[] = [];
  let at = start;
  while (at < end) {
    if (at + 8 > end) throw unsupported('A box header is cut off.');
    let size = view.getUint32(at);
    const type = typeAt(bytes, at + 4);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) throw unsupported('A box header is cut off.');
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) throw unsupported(`The box "${type}" does not fit.`);
    boxes.push({ type, start: at + header, end: at + size });
    at += size;
  }
  return boxes;
}

function only(boxes: readonly Box[], type: string, where: string): Box {
  const found = boxes.filter((box) => box.type === type);
  if (found.length !== 1 || found[0] === undefined) {
    throw unsupported(`${where} needs exactly one "${type}" box, not ${String(found.length)}.`);
  }
  return found[0];
}

/** A reader of one full box's payload, bounded by its end. */
class Reader {
  private readonly view: DataView;
  private readonly bytes: Uint8Array;
  private readonly box: Box;
  private readonly name: string;
  at: number;

  constructor(bytes: Uint8Array, box: Box, name: string) {
    this.bytes = bytes;
    this.box = box;
    this.name = name;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.at = box.start;
  }

  private need(count: number): void {
    if (this.at + count > this.box.end) throw unsupported(`The box "${this.name}" is cut off.`);
  }

  u8(): number {
    this.need(1);
    return this.bytes[this.at++] as number;
  }

  u16(): number {
    this.need(2);
    const value = this.view.getUint16(this.at);
    this.at += 2;
    return value;
  }

  u32(): number {
    this.need(4);
    const value = this.view.getUint32(this.at);
    this.at += 4;
    return value;
  }

  i32(): number {
    this.need(4);
    const value = this.view.getInt32(this.at);
    this.at += 4;
    return value;
  }

  u64(): number {
    this.need(8);
    const value = this.view.getBigUint64(this.at);
    this.at += 8;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw unsupported(`The box "${this.name}" holds a value past 2^53.`);
    }
    return Number(value);
  }

  i64(): number {
    this.need(8);
    const value = this.view.getBigInt64(this.at);
    this.at += 8;
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw unsupported(`The box "${this.name}" holds a value past 2^53.`);
    }
    return Number(value);
  }

  skip(count: number): void {
    this.need(count);
    this.at += count;
  }

  /** Version and flags of a full box. */
  full(): { version: number; flags: number } {
    const word = this.u32();
    return { version: word >>> 24, flags: word & 0xffffff };
  }
}

/** Reads the top-level boxes from the source and returns the bytes of the one `moov`. */
async function readMoov(source: ByteSource): Promise<Uint8Array> {
  let at = 0;
  let moov: { offset: number; size: number } | null = null;
  while (at < source.size) {
    const head = await source.read(at, Math.min(16, source.size - at));
    if (head.length < 8) throw unsupported('A top-level box header is cut off.');
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    let size = view.getUint32(0);
    const type = typeAt(head, 4);
    let header = 8;
    if (size === 1) {
      if (head.length < 16) throw unsupported('A top-level box header is cut off.');
      size = Number(view.getBigUint64(8));
      header = 16;
    } else if (size === 0) {
      size = source.size - at;
    }
    if (size < header || at + size > source.size) {
      throw unsupported(`The top-level box "${type}" does not fit in the file.`);
    }
    if (type === 'moof') throw unsupported('A fragmented file is not read by the Player.');
    if (type === 'moov') {
      if (moov !== null) throw unsupported('The file has two "moov" boxes.');
      moov = { offset: at + header, size: size - header };
    }
    at += size;
  }
  if (moov === null) throw unsupported('The file has no "moov" box: it is not an MP4 file.');
  if (moov.size > MOOV_LIMIT) throw unsupported('The "moov" box is larger than 64 MiB.');
  return source.read(moov.offset, moov.size);
}

function handlerOf(bytes: Uint8Array, mdia: readonly Box[]): string {
  const reader = new Reader(bytes, only(mdia, 'hdlr', 'A media box'), 'hdlr');
  reader.full();
  reader.skip(4);
  return typeAt(bytes, reader.at);
}

/** `avc1.PPCCLL` from the configuration record (RFC 6381). */
function avcCodec(avcC: Uint8Array): string {
  if (avcC.length < 7 || avcC[0] !== 1) throw unsupported('The "avcC" record is malformed.');
  const hex = (byte: number | undefined): string => (byte ?? 0).toString(16).padStart(2, '0');
  return `avc1.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`;
}

interface Edit {
  readonly segmentDuration: number;
  readonly mediaTime: number;
  readonly rateInteger: number;
  readonly rateFraction: number;
}

function editsOf(bytes: Uint8Array, trak: readonly Box[]): Edit[] {
  const edts = trak.filter((box) => box.type === 'edts');
  if (edts.length === 0) return [];
  const [container] = edts;
  if (edts.length > 1 || container === undefined) throw unsupported('A track has two edit lists.');
  const elst = only(children(bytes, container.start, container.end), 'elst', 'An edit box');
  const reader = new Reader(bytes, elst, 'elst');
  const { version } = reader.full();
  const count = reader.u32();
  const edits: Edit[] = [];
  for (let at = 0; at < count; at += 1) {
    const segmentDuration = version === 1 ? reader.u64() : reader.u32();
    const mediaTime = version === 1 ? reader.i64() : reader.i32();
    edits.push({
      segmentDuration,
      mediaTime,
      rateInteger: reader.u16(),
      rateFraction: reader.u16(),
    });
  }
  return edits;
}

/**
 * Reads the first video track of the file (D51.3). Only H.264 in an `avc1`
 * sample entry, without fragments, with at most one edit that starts at or
 * before the first presentation time (an empty edit before it is allowed), and
 * with strictly ascending presentation times is accepted: those are the files
 * whose timestamps the reader computes exactly as the pinned ffprobe does.
 */
export async function readMp4VideoTrack(source: ByteSource): Promise<Mp4VideoTrack> {
  const moov = await readMoov(source);
  const top = children(moov, 0, moov.length);
  const mvhd = new Reader(moov, only(top, 'mvhd', 'The "moov" box'), 'mvhd');
  const mvhdVersion = mvhd.full().version;
  mvhd.skip(mvhdVersion === 1 ? 16 : 8);
  const movieTimescale = mvhd.u32();
  const trak = top
    .filter((box) => box.type === 'trak')
    .map((box) => children(moov, box.start, box.end))
    .find((boxes) => {
      const mdia = only(boxes, 'mdia', 'A track');
      return handlerOf(moov, children(moov, mdia.start, mdia.end)) === 'vide';
    });
  if (trak === undefined) throw unsupported('The file has no video track.');
  const mdiaBox = only(trak, 'mdia', 'A track');
  const mdia = children(moov, mdiaBox.start, mdiaBox.end);
  const mdhd = new Reader(moov, only(mdia, 'mdhd', 'A media box'), 'mdhd');
  const mdhdVersion = mdhd.full().version;
  mdhd.skip(mdhdVersion === 1 ? 16 : 8);
  const timescale = mdhd.u32();
  if (timescale === 0 || movieTimescale === 0) throw unsupported('A time scale is zero.');
  const minfBox = only(mdia, 'minf', 'A media box');
  const minf = children(moov, minfBox.start, minfBox.end);
  const stblBox = only(minf, 'stbl', 'A media information box');
  const stbl = children(moov, stblBox.start, stblBox.end);

  // The sample description: exactly one entry, H.264 with its configuration.
  const stsd = new Reader(moov, only(stbl, 'stsd', 'A sample table'), 'stsd');
  stsd.full();
  if (stsd.u32() !== 1) throw unsupported('The video track has more than one sample description.');
  const entry = children(moov, stsd.at, only(stbl, 'stsd', 'A sample table').end)[0];
  if (entry === undefined) throw unsupported('The video track has no sample description.');
  if (entry.type !== 'avc1') {
    throw unsupported(`The Player decodes H.264 in an "avc1" entry, not "${entry.type}".`);
  }
  const visual = new Reader(moov, entry, 'avc1');
  visual.skip(24);
  const width = visual.u16();
  const height = visual.u16();
  if (width === 0 || height === 0) throw unsupported('The video track has no size.');
  const entryChildren = children(moov, entry.start + 78, entry.end);
  const avcCBox = only(entryChildren, 'avcC', 'An "avc1" entry');
  const description = moov.slice(avcCBox.start, avcCBox.end);
  const codec = avcCodec(description);
  const colrBoxes = entryChildren.filter((box) => box.type === 'colr');
  let colr: ColourDescription | null = null;
  for (const box of colrBoxes) {
    const reader = new Reader(moov, box, 'colr');
    const kind = typeAt(moov, reader.at);
    reader.skip(4);
    if (kind !== 'nclx' && kind !== 'nclc') continue;
    if (colr !== null) throw unsupported('The video track has two colour descriptions.');
    const primaries = reader.u16();
    const transfer = reader.u16();
    const matrix = reader.u16();
    colr = {
      primaries,
      transfer,
      matrix,
      fullRange: kind === 'nclx' ? (reader.u8() & 0x80) !== 0 : null,
    };
  }
  const colour = avcColour(description, colr);

  // Decode times (stts), composition offsets (ctts), sizes (stsz), places (stsc, stco/co64).
  const stts = new Reader(moov, only(stbl, 'stts', 'A sample table'), 'stts');
  stts.full();
  const deltas: number[] = [];
  for (let entries = stts.u32(); entries > 0; entries -= 1) {
    const count = stts.u32();
    const delta = stts.u32();
    for (let at = 0; at < count; at += 1) deltas.push(delta);
  }
  const sampleCount = deltas.length;
  if (sampleCount === 0) throw unsupported('The video track has no sample.');

  const offsets = new Array<number>(sampleCount).fill(0);
  const cttsBox = stbl.filter((box) => box.type === 'ctts');
  if (cttsBox.length > 1) throw unsupported('A sample table has two "ctts" boxes.');
  const composition = new Array<number>(sampleCount).fill(0);
  if (cttsBox[0] !== undefined) {
    const ctts = new Reader(moov, cttsBox[0], 'ctts');
    const { version } = ctts.full();
    let index = 0;
    for (let entries = ctts.u32(); entries > 0; entries -= 1) {
      const count = ctts.u32();
      const offset = version === 1 ? ctts.i32() : ctts.u32();
      for (let at = 0; at < count; at += 1) {
        if (index >= sampleCount) throw unsupported('"ctts" describes more samples than "stts".');
        composition[index++] = offset;
      }
    }
    if (index !== sampleCount) throw unsupported('"ctts" describes fewer samples than "stts".');
  }

  const stsz = new Reader(moov, only(stbl, 'stsz', 'A sample table'), 'stsz');
  stsz.full();
  const fixedSize = stsz.u32();
  if (stsz.u32() !== sampleCount) throw unsupported('"stsz" and "stts" count different samples.');
  const sizes = Array.from({ length: sampleCount }, () =>
    fixedSize === 0 ? stsz.u32() : fixedSize,
  );

  const chunkBoxes = stbl.filter((box) => box.type === 'stco' || box.type === 'co64');
  if (chunkBoxes.length !== 1 || chunkBoxes[0] === undefined) {
    throw unsupported('A sample table needs exactly one "stco" or "co64" box.');
  }
  const chunkBox = chunkBoxes[0];
  const chunks = new Reader(moov, chunkBox, chunkBox.type);
  chunks.full();
  const chunkOffsets = Array.from({ length: chunks.u32() }, () =>
    chunkBox.type === 'co64' ? chunks.u64() : chunks.u32(),
  );
  const stsc = new Reader(moov, only(stbl, 'stsc', 'A sample table'), 'stsc');
  stsc.full();
  const runs = Array.from({ length: stsc.u32() }, () => {
    const firstChunk = stsc.u32();
    const perChunk = stsc.u32();
    if (stsc.u32() !== 1) throw unsupported('A sample refers to another sample description.');
    return { firstChunk, perChunk };
  });
  let sample = 0;
  for (const [at, run] of runs.entries()) {
    const lastChunk = (runs[at + 1]?.firstChunk ?? chunkOffsets.length + 1) - 1;
    if (run.firstChunk < 1 || lastChunk > chunkOffsets.length || run.firstChunk > lastChunk + 1) {
      throw unsupported('"stsc" refers to chunks that "stco" does not have.');
    }
    for (let chunk = run.firstChunk; chunk <= lastChunk; chunk += 1) {
      let offset = chunkOffsets[chunk - 1] ?? 0;
      for (let index = 0; index < run.perChunk && sample < sampleCount; index += 1) {
        offsets[sample] = offset;
        offset += sizes[sample] ?? 0;
        sample += 1;
      }
    }
  }
  if (sample !== sampleCount) throw unsupported('"stsc" places a different number of samples.');
  for (const [at, offset] of offsets.entries()) {
    if (offset + (sizes[at] ?? 0) > source.size) throw unsupported('A sample lies past the file.');
  }

  const stssBox = stbl.filter((box) => box.type === 'stss');
  const sync = new Array<boolean>(sampleCount).fill(stssBox.length === 0);
  if (stssBox[0] !== undefined) {
    const stss = new Reader(moov, stssBox[0], 'stss');
    stss.full();
    for (let entries = stss.u32(); entries > 0; entries -= 1) {
      const number = stss.u32();
      if (number < 1 || number > sampleCount) throw unsupported('"stss" names no sample.');
      sync[number - 1] = true;
    }
  }
  if (sync[0] !== true) throw unsupported('The first sample is not a sync sample.');

  // Presentation times: decode time plus composition offset, shifted by the edit list.
  const pts: number[] = [];
  let dts = 0;
  for (let at = 0; at < sampleCount; at += 1) {
    pts.push(dts + (composition[at] ?? 0));
    dts += deltas[at] ?? 0;
    if (!Number.isSafeInteger(dts)) throw unsupported('A decode time is past 2^53.');
  }
  const first = Math.min(...pts);
  const edits = editsOf(moov, trak);
  const leading = edits[0]?.mediaTime === -1 ? 1 : 0;
  const edit = edits[leading];
  if (edits.length > leading + 1) throw unsupported('The video track has more than one edit.');
  let shift = 0;
  if (edit !== undefined) {
    if (edit.mediaTime < 0 || edit.rateInteger !== 1 || edit.rateFraction !== 0) {
      throw unsupported('The edit of the video track is not a plain shift.');
    }
    if (edit.mediaTime > first) {
      throw unsupported('The edit of the video track cuts frames from its start.');
    }
    shift = edit.mediaTime;
  }
  const presentation = [...pts.keys()].sort((a, b) => (pts[a] ?? 0) - (pts[b] ?? 0));
  const timestamps = presentation.map((index) => (pts[index] ?? 0) - shift);
  for (let at = 1; at < timestamps.length; at += 1) {
    if ((timestamps[at] ?? 0) <= (timestamps[at - 1] ?? 0)) {
      throw unsupported('Two frames of the video track have the same presentation time.');
    }
  }
  const lastSample = presentation.at(-1) ?? 0;
  const before = timestamps.at(-2);
  const lastDuration =
    (deltas[lastSample] ?? 0) > 0
      ? (deltas[lastSample] ?? 0)
      : before === undefined
        ? 0
        : (timestamps.at(-1) ?? 0) - before;
  if (lastDuration <= 0) throw unsupported('The last frame of the video track has no duration.');
  return {
    codec,
    description,
    colour,
    width,
    height,
    timeBase: { num: 1, den: timescale },
    samples: pts.map((value, at) => ({
      offset: offsets[at] ?? 0,
      size: sizes[at] ?? 0,
      pts: value - shift,
      sync: sync[at] ?? false,
    })),
    presentation,
    timestamps,
    lastDuration,
  };
}
