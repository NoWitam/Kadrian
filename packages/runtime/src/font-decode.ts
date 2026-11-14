/**
 * The error, the refusals, and the limit shared by `fontMetrics`, the
 * decoders, and the containers of fonts measured by Kadrion (D83.1, D84.4,
 * D84.6). Nothing here holds state: the limit is a number and every refusal is
 * thrown at once.
 */
import type { FontMetricsErrorCode } from './text-frame.js';

/**
 * Thrown by `fontMetrics`, and by `inflate`, `woffTables`, `brotliDecode`,
 * and `woff2Tables` of `@kadrion/runtime/woff`, for bytes they cannot read
 * (D83.1, D84.6). Check `code` instead of `instanceof`, which fails across
 * realms.
 */
export class FontMetricsError extends RangeError {
  readonly code: FontMetricsErrorCode;

  constructor(code: FontMetricsErrorCode, message: string) {
    super(message);
    this.name = 'FontMetricsError';
    this.code = code;
  }
}

/**
 * 64 MiB: the most bytes a font may decompress to (D84.4). It is checked on
 * the declared lengths before any buffer is allocated.
 */
export const DECOMPRESSED_FONT_LIMIT = 67_108_864;

/** Refuses a damaged container or stream (D84.6). */
export function invalid(reason: string): never {
  throw new FontMetricsError('font-invalid', `The font is invalid: ${reason} (D84).`);
}

/** Refuses a well-formed file Kadrion does not measure (D84.6). */
export function unmeasurable(reason: string): never {
  throw new FontMetricsError(
    'font-unmeasurable',
    `The font cannot be measured: ${reason}. A measured text needs an sfnt, WOFF, or WOFF2 font with TrueType or CFF outlines (D83.1, D84).`,
  );
}

/** Refuses a declared length past the limit, before anything is allocated (D84.4). */
export function checkLimit(length: number, what: string): void {
  if (length > DECOMPRESSED_FONT_LIMIT) {
    unmeasurable(
      `${what} would decompress to ${String(length)} bytes, past the limit of ${String(DECOMPRESSED_FONT_LIMIT)} bytes (64 MiB)`,
    );
  }
}
