/**
 * The metrics of the fonts of measured nodes (D83.7): the load step reads them
 * from the bytes it holds, with the runtime's `fontMetrics`, after the fonts are
 * registered and before anything is mounted, so that the Player and the
 * Producer read them with the same code of the runtime build. The mount keeps
 * them on the stage, the DOM being the only memory between calls (D20), and
 * every evaluation of the page reads them back from there.
 */
import { fontMetrics, measuredFontIds, type FontMetrics } from '@kadrion/runtime';
import type { ValidatedComposition } from '@kadrion/schema';

import { RenderError } from './errors.js';

/** The attribute of the stage that holds the metrics of the measured fonts, when there are any. */
export const FONT_METRICS_ATTRIBUTE = 'data-kadrion-font-metrics';

/** The metrics of fonts by the ID of their asset (D83.7). */
export type FontMetricsMap = ReadonlyMap<string, FontMetrics>;

/**
 * Reads the metrics of every font a measured node of `composition` uses from
 * its bytes (D83.1, D83.7), in the order of first use. Bytes `fontMetrics`
 * cannot read are the `RenderError` of the code it refused them with
 * (D84.6): `font-invalid` for a damaged WOFF or WOFF2 file, and
 * `font-unmeasurable` for anything else. A document without a measured node
 * reads nothing.
 */
export function measureFonts(
  composition: ValidatedComposition,
  bytes: ReadonlyMap<string, ArrayBuffer>,
): FontMetricsMap {
  const fonts = new Map<string, FontMetrics>();
  for (const id of measuredFontIds(composition)) {
    const data = bytes.get(id);
    if (data === undefined) {
      // Unreachable: the URLs were checked against the document first.
      throw new RenderError('asset-url-missing', `The font "${id}" has no bytes.`);
    }
    try {
      fonts.set(id, fontMetrics(new Uint8Array(data)));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      // The code of the runtime's refusal, read by value: `instanceof` fails across realms.
      const code =
        reason instanceof Error && (reason as { code?: unknown }).code === 'font-invalid'
          ? 'font-invalid'
          : 'font-unmeasurable';
      throw new RenderError(code, `The font "${id}" cannot be measured: ${message}`);
    }
  }
  return fonts;
}

/** The metrics as the stage keeps them: per font, its units per em, its `.notdef` advance, and pairs of a code point and its advance. */
type Kept = Readonly<
  Record<
    string,
    { readonly unitsPerEm: number; readonly notdefAdvance: number; readonly advances: number[] }
  >
>;

/** The text of the attribute that keeps `fonts` on the stage, or `null` for no fonts. */
export function keptFontMetrics(fonts: FontMetricsMap): string | null {
  if (fonts.size === 0) return null;
  const kept: Record<string, Kept[string]> = {};
  for (const [id, metrics] of fonts) {
    kept[id] = {
      unitsPerEm: metrics.unitsPerEm,
      notdefAdvance: metrics.notdefAdvance,
      advances: [...metrics.advances].flat(),
    };
  }
  return JSON.stringify(kept);
}

/**
 * The metrics that the mount kept on the stage of `root`, or none: a root
 * that holds no stage, or a stage of a document without measured nodes.
 */
export function readFontMetrics(root: Element): FontMetricsMap {
  const fonts = new Map<string, FontMetrics>();
  const text = root.firstElementChild?.getAttribute(FONT_METRICS_ATTRIBUTE) ?? null;
  if (text === null) return fonts;
  const kept = JSON.parse(text) as Kept;
  for (const [id, { unitsPerEm, notdefAdvance, advances }] of Object.entries(kept)) {
    const pairs = new Map<number, number>();
    for (let at = 0; at + 1 < advances.length; at += 2) {
      pairs.set(advances[at] ?? 0, advances[at + 1] ?? 0);
    }
    fonts.set(id, { unitsPerEm, notdefAdvance, advances: pairs });
  }
  return fonts;
}
