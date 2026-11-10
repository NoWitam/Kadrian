/**
 * The static part of `check_custom_html` (D78): what in the html of a Custom
 * HTML element cannot work in the sandbox or cannot be deterministic, found by
 * reading the text, never by running it. The sandbox enforces isolation
 * whatever this finds (D23); a finding tells an author why a frame will time
 * out, end the render, or differ between two renders, before it does.
 *
 * It reads patterns, not a parsed document, so it can report a word in a
 * comment or a string, and it cannot see code assembled at run time; the
 * render check of the host finds what a render shows.
 */
import { MAX_CUSTOM_HTML_LENGTH } from './commands.js';

/** The kinds of a finding (D78). */
export type CustomHtmlFindingCode =
  'too-large' | 'network' | 'timer' | 'wall-clock' | 'storage' | 'navigation';

/** One thing the html does that the sandbox refuses or the managed clock does not drive (D78). */
export interface CustomHtmlFinding {
  readonly code: CustomHtmlFindingCode;
  /** The offset of the match in the html, in UTF-16 code units; 0 for `too-large`. */
  readonly at: number;
  /** The text that matched, at most 40 code units of it. */
  readonly match: string;
  readonly message: string;
}

interface Rule {
  readonly code: CustomHtmlFindingCode;
  readonly pattern: RegExp;
  readonly message: string;
}

const NETWORK =
  'The sandbox has no network: nothing is loaded, fetched, or sent, and a request fails. Put CSS and scripts inline, and use font assets for fonts.';
const TIMER =
  'A timer runs on the wall clock, not on the time of the composition, so the frame depends on how long the render took. Derive the state from the time instead: CSS animations, requestAnimationFrame, Date.now, and performance.now follow it.';
const WALL_CLOCK =
  'This reads the wall clock, which the managed clock does not drive, so the frame depends on when it was rendered.';
const STORAGE =
  'The element has an opaque origin: storage and cookies throw, and nothing outlives one render.';
const NAVIGATION =
  'The element may not load another document: a navigation, a reload, or a form ends the render with custom-html-navigated.';

const RULES: readonly Rule[] = [
  { code: 'network', pattern: /\bfetch\s*\(/g, message: NETWORK },
  {
    code: 'network',
    pattern: /\b(?:XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection|importScripts)\b/g,
    message: NETWORK,
  },
  {
    code: 'network',
    pattern: /\bsendBeacon\b|\bimport\s*\(|\bnew\s+(?:Shared)?Worker\b/g,
    message: NETWORK,
  },
  {
    code: 'network',
    pattern: /<(?:link|img|iframe|object|embed|video|audio|source|track|image)\b/gi,
    message: NETWORK,
  },
  { code: 'network', pattern: /<script\b[^>]*\bsrc\s*=/gi, message: NETWORK },
  { code: 'network', pattern: /@import\b/gi, message: NETWORK },
  { code: 'network', pattern: /\burl\(\s*['"]?(?!data:|#)[^)\s'"]/gi, message: NETWORK },
  { code: 'timer', pattern: /\b(?:setTimeout|setInterval|requestIdleCallback)\b/g, message: TIMER },
  {
    code: 'wall-clock',
    pattern: /\bdocument\.timeline\b|\.timeStamp\b|\btimeOrigin\b|\bTemporal\b/g,
    message: WALL_CLOCK,
  },
  {
    code: 'storage',
    pattern: /\b(?:localStorage|sessionStorage|indexedDB|caches)\b|\bdocument\.cookie\b/g,
    message: STORAGE,
  },
  {
    code: 'navigation',
    pattern:
      /\blocation\s*\.\s*(?:href|assign|replace|reload)\b|\blocation\s*=|\bwindow\.open\b|http-equiv\s*=\s*['"]?refresh|<form\b|<a\b[^>]*\bhref\s*=/gi,
    message: NAVIGATION,
  },
];

/**
 * What the html of a Custom HTML element does that the sandbox refuses or the
 * managed clock does not drive (D78), in the order of the text and then of
 * the code; empty when nothing is found. It is pure and never throws.
 */
export function checkCustomHtmlSource(html: string): readonly CustomHtmlFinding[] {
  const findings: CustomHtmlFinding[] = [];
  if (html.length > MAX_CUSTOM_HTML_LENGTH) {
    findings.push({
      code: 'too-large',
      at: 0,
      match: '',
      message: `The html is ${String(html.length)} UTF-16 code units long; set_custom_html takes at most ${String(MAX_CUSTOM_HTML_LENGTH)}.`,
    });
  }
  for (const rule of RULES) {
    for (const found of html.matchAll(rule.pattern)) {
      findings.push({
        code: rule.code,
        at: found.index,
        match: found[0].slice(0, 40),
        message: rule.message,
      });
    }
  }
  findings.sort((a, b) => a.at - b.at || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return Object.freeze(findings.map((finding) => Object.freeze(finding)));
}
