/**
 * The worker of D87.2. It converts the planes of one frame by the conversion
 * of D51.4 and the turn of D81 (`convert.ts`), adds an alpha of 255, and
 * returns an `ImageBitmap` of exactly those bytes: no colour conversion, no
 * resize, no premultiplication. The build bundles it with what it imports into
 * `dist/worker/kadrion-convert-worker.js`, a module with no import, because a
 * worker does not see the import map of the page that starts it.
 *
 * A message `{ id, job }` is answered `{ id, bitmap }`, the bitmap
 * transferred, or `{ id, error }`; a message `{ id }` without a job is
 * answered `{ id }`, so the Player knows the worker started.
 */
import { shownRgba, type ConvertJob } from './convert.js';

/** The answer of the worker to one message. */
export type ConvertAnswer =
  | { readonly id: number }
  | { readonly id: number; readonly bitmap: ImageBitmap }
  | { readonly id: number; readonly error: string };

/** The part of a dedicated worker's scope this module uses. */
interface WorkerScope {
  onmessage: ((event: MessageEvent<{ id: number; job?: ConvertJob }>) => void) | null;
  postMessage(message: ConvertAnswer, transfer?: Transferable[]): void;
  createImageBitmap(image: ImageData, options: ImageBitmapOptions): Promise<ImageBitmap>;
}

/** The answer to one message, with what it transfers. */
export async function answer(
  message: { id: number; job?: ConvertJob },
  createImageBitmap: WorkerScope['createImageBitmap'],
): Promise<[ConvertAnswer, Transferable[]]> {
  const { id, job } = message;
  if (job === undefined) return [{ id }, []];
  try {
    const { width, height, rgba } = shownRgba(job);
    const bitmap = await createImageBitmap(new ImageData(rgba, width, height), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    return [{ id, bitmap }, [bitmap]];
  } catch (reason) {
    return [{ id, error: reason instanceof Error ? reason.message : String(reason) }, []];
  }
}

const scope = globalThis as unknown as Partial<WorkerScope>;
// Only in a worker: a window has `document`, and importing this module in a test does nothing.
if (!('document' in globalThis) && typeof scope.postMessage === 'function') {
  const worker = scope as WorkerScope;
  worker.onmessage = (event) => {
    void answer(event.data, (image, options) => worker.createImageBitmap(image, options)).then(
      ([reply, transfer]) => {
        worker.postMessage(reply, transfer);
      },
    );
  };
}
