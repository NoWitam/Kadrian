/**
 * When the media of a rendered frame are ready (D25.3): every image under the
 * root that has a source, the frame of every active video and the image of every
 * mask included (D50.4, D75), has been decoded, and the document's font set has settled. The renderer
 * waits on the browser's own promises and never on a clock; a host bounds the
 * whole frame with its own timeout. Font loading itself is open question Q5.
 */
import { RenderError } from './errors.js';

interface Decodable {
  decode?: () => Promise<void>;
}

interface WithFonts {
  readonly fonts?: { readonly ready: Promise<unknown> };
}

/** Resolves once every image under `root` is decoded and `document.fonts.ready` has settled. */
export function awaitMediaReady(root: Element): Promise<void> {
  // The executor runs synchronously; a check that throws in it rejects the promise.
  return new Promise<void>((resolve, reject) => {
    // Typed as optional on purpose: jsdom, for one, has no font set.
    const document = root.ownerDocument as unknown as WithFonts;
    const fonts = document.fonts;
    if (fonts === undefined) {
      throw new RenderError('readiness-unsupported', 'The document has no font set to wait for.');
    }
    // An image without a source is a video that is not active (D50.4): nothing to decode.
    const decodes = [...root.querySelectorAll('img[src]')].map((image) => {
      const decode = (image as Decodable).decode;
      if (typeof decode !== 'function') {
        throw new RenderError(
          'readiness-unsupported',
          'Images of this document cannot be decoded.',
        );
      }
      const nodeId = image.getAttribute('data-kadrion-node') ?? '';
      return decode.call(image).catch(() => {
        throw new RenderError(
          'asset-decode-failed',
          `The image of "${nodeId}" could not be decoded.`,
        );
      });
    });
    // The image of a mask is an SVG `<image>`, which decodes nothing itself: a
    // picture of the same source is decoded in its place (D75).
    const masks = [...root.querySelectorAll('mask image[href]')].map((image) => {
      const picture = image.ownerDocument.createElement('img');
      const decode = (picture as Decodable).decode;
      if (typeof decode !== 'function') {
        throw new RenderError(
          'readiness-unsupported',
          'Images of this document cannot be decoded.',
        );
      }
      picture.src = image.getAttribute('href') ?? '';
      return decode.call(picture).catch(() => {
        throw new RenderError('asset-decode-failed', 'The image of a mask could not be decoded.');
      });
    });
    Promise.all([...decodes, ...masks, fonts.ready]).then(() => {
      resolve();
    }, reject);
  });
}
