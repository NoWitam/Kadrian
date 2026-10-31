export type ProducerErrorCode =
  /** The document is not a valid composition (D19). */
  | 'invalid-document'
  /** A requested time is not a frame time of the composition (D13.2, D28.4). */
  | 'frame-out-of-range'
  /** The resolver has no bytes for an asset, or failed (D14, D27.3). */
  | 'asset-missing'
  /** The bytes of an asset do not have its content hash (D14, D27.3). */
  | 'asset-hash-mismatch'
  /** The resolver returned something that is not bytes with a media type (D27.3). */
  | 'asset-invalid'
  /** The runtime build does not have the hash of its manifest (D28.2). */
  | 'runtime-hash-mismatch'
  /** The runtime build is not UTF-8, or would not stay one script element (D25.2). */
  | 'runtime-unsafe'
  /** The pinned Chromium is not installed or does not start (D26.3). */
  | 'chromium-missing'
  /** Playwright or the browser is not the pinned build (D26.3). */
  | 'chromium-mismatch'
  /** The page found no URL for an image or font asset (D22.5). */
  | 'asset-url-missing'
  /** Bytes were passed for an ID that is not an asset of the document (D22.5). */
  | 'asset-url-unknown'
  /** Asset bytes or their media type are not usable (D22.5, D27.1). */
  | 'asset-url-invalid'
  /** The bytes of a font asset are not a font the browser can load (D27.1). */
  | 'font-load-failed'
  /** An image could not be decoded (D25.3). */
  | 'asset-decode-failed'
  /** The page cannot wait for images or fonts (D25.3). */
  | 'readiness-unsupported'
  /** A Custom HTML element did not acknowledge the time (D23.4). */
  | 'custom-html-timeout'
  /** A Custom HTML element loaded another document than its shell; the render ends (D23.9). */
  | 'custom-html-navigated'
  /** The render page did not answer within the Producer's timeout (D28.6). */
  | 'page-timeout'
  /** A frame of the page did not present within the Producer's timeout (D28.5). */
  | 'presentation-timeout'
  /** The page tried to load something; a render loads nothing (D28.1). */
  | 'network-request'
  /** The FFmpeg or FFprobe executable is not given as an absolute path, or does not exist (D29.1). */
  | 'ffmpeg-missing'
  /** An executable is not the pinned build: checksum, version, configuration, encoders, or platform (D29.1). */
  | 'ffmpeg-mismatch'
  /** FFmpeg failed, stalled, received other bytes than were rendered, or wrote another stream (D29.3). */
  | 'encode-failed'
  /** The audio of the document cannot be muxed as D29.6 requires. */
  | 'audio-invalid'
  /** The preset does not fit the composition: no upscaling, and even integer dimensions only (D29.5). */
  | 'preset-unsupported'
  /** The segment length of the settings is not a whole number of frames in range (D47.1). */
  | 'segment-length-invalid'
  /** A range is empty, outside the composition, or not on the frame or segment grid (D47.2). */
  | 'range-invalid'
  /** The parts given to a join do not make one render: a gap, an overlap, a foreign hash, a changed file (D47.5). */
  | 'join-invalid'
  /** A still frame was asked for in a format other than png, jpeg, or webp (D47.7). */
  | 'still-format-unsupported'
  /** A limit the host gave the job is exceeded: document, duration, frames, assets, or wall time (D48.4). */
  | 'limit-exceeded'
  /** A video asset has no video stream the pinned FFmpeg can decode in presentation order (D50.5). */
  | 'video-undecodable'
  /** A video node samples source time at or after the end of its video (D49.6, D50.5). */
  | 'source-range-exceeded'
  /** The page refused the frames of the video nodes it was given (D50.4). */
  | 'video-frames-invalid'
  /** The job was cancelled by its signal; nothing stays under a final name (D48.2). */
  | 'cancelled'
  /** Anything else the page reported. */
  | 'page-error';

/**
 * A typed failure of the Producer (D28.6), raised before the first frame of a
 * render is delivered. Check `code` instead of `instanceof`.
 */
export class ProducerError extends Error {
  readonly code: ProducerErrorCode;

  constructor(code: ProducerErrorCode, message: string) {
    super(message);
    this.name = 'ProducerError';
    this.code = code;
  }
}

const PAGE_CODES: readonly ProducerErrorCode[] = [
  'invalid-document',
  'asset-missing',
  'asset-hash-mismatch',
  'asset-invalid',
  'asset-url-missing',
  'asset-url-unknown',
  'asset-url-invalid',
  'font-load-failed',
  'asset-decode-failed',
  'readiness-unsupported',
  'custom-html-timeout',
  'custom-html-navigated',
  'video-frames-invalid',
];

/** A `RenderError` code or a code the page reported, as the Producer's; anything else is `page-error`. */
export function producerCode(code: unknown): ProducerErrorCode {
  return PAGE_CODES.find((known) => known === code) ?? 'page-error';
}

/** Any failure as a `ProducerError`, keeping the code of one that already is. */
export function asProducerError(reason: unknown): ProducerError {
  if (reason instanceof ProducerError) return reason;
  const code = (reason as { code?: unknown } | null)?.code;
  const message = reason instanceof Error ? reason.message : String(reason);
  return new ProducerError(producerCode(code), message);
}
