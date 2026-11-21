/**
 * The pool of conversion workers (D87.2): `min(4, max(1, cores − 2))`
 * dedicated workers, started when the first stream starts and ended with the
 * Player. A job goes to the worker with the fewest jobs in hand; the number of
 * workers changes how fast frames arrive, never a pixel. Where a worker
 * cannot be created, or fails to start, the pool says so once and the Player
 * keeps the path of D51 (`video-workers-unavailable`).
 */
import type { ConvertJob } from './convert.js';
import type { ConvertAnswer } from './convert-worker.js';

/** The part of a `Worker` the pool uses, so tests can give their own. */
export interface ConvertWorker {
  onmessage: ((event: MessageEvent<ConvertAnswer>) => void) | null;
  onerror: ((event: Event) => void) | null;
  postMessage(message: { id: number; job?: ConvertJob }, transfer: Transferable[]): void;
  terminate(): void;
}

/** The most workers a pool has (D87.2). */
export const MOST_WORKERS = 4;

/** The workers of a pool on a machine of `cores` logical processors (D87.2). */
export function poolSize(cores: number | undefined): number {
  const known = cores !== undefined && Number.isInteger(cores) && cores > 0 ? cores : 1;
  return Math.min(MOST_WORKERS, Math.max(1, known - 2));
}

/** A job of a pool that was closed, or of a worker that failed. */
export class PoolClosed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PoolClosed';
  }
}

interface Pending {
  readonly resolve: (bitmap: ImageBitmap) => void;
  readonly reject: (reason: Error) => void;
}

interface Member {
  readonly worker: ConvertWorker;
  readonly pending: Map<number, Pending>;
}

/** The workers of a Player and the jobs each has in hand. */
export class ConversionPool {
  private readonly members: Member[];
  private next = 1;
  private closed = false;
  private failure: Error | null = null;
  private readonly started: Promise<boolean>;

  constructor(workers: readonly ConvertWorker[]) {
    if (workers.length === 0) throw new RangeError('A pool needs at least one worker.');
    this.members = workers.map((worker) => ({ worker, pending: new Map() }));
    for (const member of this.members) {
      member.worker.onmessage = (event) => {
        this.answered(member, event.data);
      };
      member.worker.onerror = () => {
        this.fail(new PoolClosed('A conversion worker failed.'));
      };
    }
    // Each worker answers a message without a job once it runs; one that
    // cannot load its module answers with an error event instead.
    this.started = Promise.all(this.members.map((member) => this.send(member, undefined, []))).then(
      () => true,
      () => false,
    );
  }

  /** Whether every worker started; `false` once one failed or the pool was closed. */
  start(): Promise<boolean> {
    return this.started;
  }

  /** The number of workers. */
  get size(): number {
    return this.members.length;
  }

  /** Whether the pool refuses jobs: it was closed, or a worker failed. */
  get failed(): boolean {
    return this.failure !== null;
  }

  /** The jobs every worker has in hand, in the order of the workers. */
  get load(): number[] {
    return this.members.map(({ pending }) => pending.size);
  }

  /**
   * Converts one frame in the worker with the fewest jobs in hand; the planes
   * are transferred, so `job.data` is empty afterwards.
   */
  convert(job: ConvertJob): Promise<ImageBitmap> {
    let chosen = this.members[0] as Member;
    for (const member of this.members) {
      if (member.pending.size < chosen.pending.size) chosen = member;
    }
    return this.send(chosen, job, [job.data.buffer]);
  }

  /** Ends every worker; jobs in hand are refused. */
  close(): void {
    if (this.closed) return;
    this.fail(new PoolClosed('The pool was closed.'));
    this.closed = true;
    for (const { worker } of this.members) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
  }

  private send(
    member: Member,
    job: ConvertJob | undefined,
    transfer: Transferable[],
  ): Promise<ImageBitmap> {
    if (this.failure !== null) return Promise.reject(this.failure);
    const id = this.next;
    this.next += 1;
    const answer = new Promise<ImageBitmap>((resolve, reject) => {
      member.pending.set(id, { resolve, reject });
    });
    try {
      member.worker.postMessage(job === undefined ? { id } : { id, job }, transfer);
    } catch (reason) {
      member.pending.delete(id);
      return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
    }
    return answer;
  }

  private answered(member: Member, reply: ConvertAnswer): void {
    const pending = member.pending.get(reply.id);
    if (pending === undefined) {
      if ('bitmap' in reply) reply.bitmap.close();
      return;
    }
    member.pending.delete(reply.id);
    if ('error' in reply) pending.reject(new Error(reply.error));
    else if ('bitmap' in reply) pending.resolve(reply.bitmap);
    else pending.resolve(undefined as unknown as ImageBitmap);
  }

  private fail(reason: Error): void {
    this.failure ??= reason;
    for (const { pending } of this.members) {
      for (const { reject } of pending.values()) reject(this.failure);
      pending.clear();
    }
  }
}

/** Where the build writes the worker's bundle, next to the Player's modules. */
export const WORKER_MODULE = './worker/kadrion-convert-worker.js';

/** The part of a window the pool needs to make its workers. */
export interface WorkerWindow {
  readonly Worker?: new (url: URL, options: WorkerOptions) => ConvertWorker;
  readonly navigator?: { readonly hardwareConcurrency?: number };
}

/**
 * The pool of a window's workers, each a module worker of `url`, or `null`
 * where the window makes no worker (none at all, or a policy that refuses
 * one at once). A worker that a policy refuses later fails its start.
 */
export function createConversionPool(
  view: WorkerWindow,
  url: URL = new URL(WORKER_MODULE, import.meta.url),
): ConversionPool | null {
  const { Worker } = view;
  if (Worker === undefined) return null;
  const workers: ConvertWorker[] = [];
  try {
    for (let at = 0; at < poolSize(view.navigator?.hardwareConcurrency); at += 1) {
      workers.push(new Worker(url, { type: 'module', name: 'kadrion-convert' }));
    }
  } catch {
    for (const worker of workers) worker.terminate();
    return null;
  }
  return new ConversionPool(workers);
}
