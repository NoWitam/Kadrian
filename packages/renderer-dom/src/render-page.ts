/**
 * The render page that both hosts load (D25.2): the policy, the root of D22,
 * and the scripts — the runtime build and a host's page agent — inline and
 * unchanged. It lives here and not in a host, so that the Player and the
 * Producer cannot load different pages (D12).
 */
import { RenderError } from './errors.js';

/**
 * No network; images, and the fonts of Custom HTML, as `data:` URLs only; inline
 * script and style for the runtime and Custom HTML. An element's document
 * inherits this policy, so its fonts need `font-src data:` here too (D23.6, D78).
 */
export const RENDER_PAGE_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** The ID of the element that is the root of D22 in the render page. */
export const RENDER_ROOT_ID = 'kadrion-root';

/** The only sandbox token of the frame that holds the render page (D25.2). */
export const RENDER_PAGE_SANDBOX = 'allow-scripts';

/**
 * The styles of the frame that holds the render page, besides its width and
 * height in pixels (D25.2, D28.1). Both hosts embed the page with them, so that
 * no border or layout of a host shifts the frame. The frame states the colour
 * scheme the page states, `normal`, since Chromium paints an opaque backdrop
 * behind a frame whose colour scheme differs from its document's: a host page
 * of dark scheme then shows through a transparent clear (D89.2).
 */
export const RENDER_PAGE_FRAME_STYLE: Readonly<Record<string, string>> = Object.freeze({
  display: 'block',
  'border-style': 'none',
  'color-scheme': 'normal',
});

/** Sequences that end a script element early or switch its parser state. */
const UNSAFE_IN_SCRIPT = /<\/script|<script|<!--/i;

/**
 * The complete render page with the given scripts, in order. A script that the
 * HTML parser would not keep as one script element is refused.
 */
export function renderPageDocument(scripts: readonly string[]): string {
  scripts.forEach((script, index) => {
    const found = UNSAFE_IN_SCRIPT.exec(script);
    if (found !== null) {
      throw new RenderError(
        'unsafe-script',
        `Script ${String(index)} contains ${JSON.stringify(found[0])}, which would end or reinterpret its script element.`,
      );
    }
  });
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${RENDER_PAGE_POLICY}">`,
    // The clear colour is the page's own (D42.5): a pixel that no active node covers is
    // opaque white in every host, never whatever lies behind the frame, unless the
    // document's clear is transparent, which `frame` writes on the root (D89.2). The
    // root's colour scheme is the frame's, for every document (D89.2).
    '<style>html,body{margin:0;padding:0;overflow:hidden}html{background-color:#ffffff;color-scheme:normal}</style>',
    `</head><body><div id="${RENDER_ROOT_ID}"></div>`,
    ...scripts.map((script) => `<script>${script}</script>`),
    '</body></html>',
  ].join('');
}
