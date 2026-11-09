/**
 * Media types of asset bytes (D25.4, D27.3). The document carries none (D14),
 * so the host names one; it must fit the asset's type, so that two hosts cannot
 * turn the same verified bytes into different `data:` URLs of another kind.
 */
import type { Asset } from '@kadrion/schema';

/** The shape of a media type in the page messages (D25.4). */
export const MEDIA_TYPE = /^[a-z]+\/[a-z0-9.+-]+$/;

/** The one media type of an SVG asset (D74.1). */
export const SVG_MEDIA_TYPE = 'image/svg+xml';

/**
 * Whether `mediaType` is well formed and of the top-level type of `type`:
 * `image/…`, `audio/…`, `font/…`, `video/…`; an `svg` asset is exactly
 * `image/svg+xml` (D74.1).
 */
export function mediaTypeFits(type: Asset['type'], mediaType: string): boolean {
  if (type === 'svg') return mediaType === SVG_MEDIA_TYPE;
  return MEDIA_TYPE.test(mediaType) && mediaType.startsWith(`${type}/`);
}
