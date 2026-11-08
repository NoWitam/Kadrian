/**
 * Generates `packages/runtime/src/grapheme-table.ts`, the table of the
 * properties that the segmentation of extended grapheme clusters reads
 * (UAX #29), pinned to one Unicode version (D69.2). It is run by hand, never by
 * the build or the tests:
 *
 *   node --experimental-strip-types tests/unicode/grapheme-table.ts <ucd-dir>
 *
 * where `<ucd-dir>` holds `GraphemeBreakProperty.txt`, `emoji-data.txt`, and
 * `DerivedCoreProperties.txt` of that version, as published by the Unicode
 * Consortium (also in github.com/unicode-org/unicodetools, under
 * `unicodetools/data/ucd/<version>`). The script refuses files of another
 * version and any combination of properties the runtime does not expect, so a
 * later version cannot slip in unnoticed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const UNICODE_VERSION = '17.0.0';

/**
 * The classes of the table, in the order of their numbers. Each is one
 * combination of Grapheme_Cluster_Break, Extended_Pictographic, and
 * Indic_Conjunct_Break that occurs in the data; the runtime's segmentation
 * (`packages/runtime/src/graphemes.ts`) names them by the same numbers.
 */
export const CLASSES = [
  'Other',
  'CR',
  'LF',
  'Control',
  'Extend',
  'ZWJ',
  'Regional_Indicator',
  'Prepend',
  'SpacingMark',
  'L',
  'V',
  'T',
  'LV',
  'LVT',
  'Extended_Pictographic',
  'InCB_Consonant',
  'Extend_InCB_Extend',
  'Extend_InCB_Linker',
] as const;

const MAX_CODE_POINT = 0x10ffff;

/** The ranges and values of one property file, checked to be of the pinned version. */
function ranges(path: string, header: string, property?: string): [number, number, string][] {
  const text = readFileSync(path, 'utf8');
  if (!text.includes(header)) {
    throw new Error(`${path} is not of Unicode ${UNICODE_VERSION}: no line "${header}".`);
  }
  const out: [number, number, string][] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (line === '') continue;
    const fields = line.split(';').map((field) => field.trim());
    const [codePoints, first, second] = fields;
    if (codePoints === undefined || first === undefined) continue;
    let value = first;
    if (property !== undefined) {
      if (first !== property) continue;
      value = second ?? 'Yes';
    }
    const [from, to] = codePoints.split('..').map((hex) => Number.parseInt(hex, 16));
    if (from === undefined) continue;
    out.push([from, to ?? from, value]);
  }
  return out;
}

export function buildClasses(directory: string): Uint8Array {
  const gcb = new Array<string>(MAX_CODE_POINT + 1).fill('Other');
  for (const [from, to, value] of ranges(
    join(directory, 'GraphemeBreakProperty.txt'),
    `GraphemeBreakProperty-${UNICODE_VERSION}.txt`,
  )) {
    for (let c = from; c <= to; c += 1) gcb[c] = value;
  }
  const pictographic = new Uint8Array(MAX_CODE_POINT + 1);
  for (const [from, to] of ranges(
    join(directory, 'emoji-data.txt'),
    `Version: ${UNICODE_VERSION.replace(/\.0$/, '')}`,
    'Extended_Pictographic',
  )) {
    for (let c = from; c <= to; c += 1) pictographic[c] = 1;
  }
  const incb = new Array<string>(MAX_CODE_POINT + 1).fill('None');
  for (const [from, to, value] of ranges(
    join(directory, 'DerivedCoreProperties.txt'),
    `DerivedCoreProperties-${UNICODE_VERSION}.txt`,
    'InCB',
  )) {
    for (let c = from; c <= to; c += 1) incb[c] = value;
  }

  const classes = new Uint8Array(MAX_CODE_POINT + 1);
  for (let c = 0; c <= MAX_CODE_POINT; c += 1) {
    const g = gcb[c] ?? 'Other';
    const p = pictographic[c] === 1;
    const i = incb[c] ?? 'None';
    let name: string;
    if (p) {
      if (g !== 'Other' || i !== 'None') throw unexpected(c, g, p, i);
      name = 'Extended_Pictographic';
    } else if (i === 'Consonant') {
      if (g !== 'Other') throw unexpected(c, g, p, i);
      name = 'InCB_Consonant';
    } else if (i === 'Linker') {
      if (g !== 'Extend') throw unexpected(c, g, p, i);
      name = 'Extend_InCB_Linker';
    } else if (i === 'Extend') {
      if (g === 'ZWJ') name = 'ZWJ';
      else if (g === 'Extend') name = 'Extend_InCB_Extend';
      else throw unexpected(c, g, p, i);
    } else {
      if (g === 'ZWJ') throw unexpected(c, g, p, i);
      name = g;
    }
    const index = (CLASSES as readonly string[]).indexOf(name);
    if (index < 0) throw unexpected(c, g, p, i);
    classes[c] = index;
  }
  return classes;
}

function unexpected(c: number, g: string, p: boolean, i: string): Error {
  const at = c.toString(16).toUpperCase().padStart(4, '0');
  return new Error(
    `U+${at} has Grapheme_Cluster_Break=${g}, Extended_Pictographic=${p ? 'Yes' : 'No'}, InCB=${i}, a combination the runtime does not know.`,
  );
}

/**
 * The table as text: one entry per run of code points of one class, the length
 * of the run in base 36 (lower case) followed by the class as one upper-case
 * letter (`A` is class 0).
 * The runs cover U+0000 to U+10FFFF without a gap.
 */
export function encode(classes: Uint8Array): string {
  const parts: string[] = [];
  let start = 0;
  for (let c = 1; c <= MAX_CODE_POINT + 1; c += 1) {
    if (c === MAX_CODE_POINT + 1 || classes[c] !== classes[start]) {
      parts.push(`${(c - start).toString(36)}${String.fromCharCode(65 + (classes[start] ?? 0))}`);
      start = c;
    }
  }
  return parts.join('');
}

function main(): void {
  const directory = process.argv[2];
  if (directory === undefined) {
    throw new Error('Usage: grapheme-table.ts <directory of the Unicode data files>');
  }
  const table = encode(buildClasses(directory));
  const target = fileURLToPath(
    new URL('../../packages/runtime/src/grapheme-table.ts', import.meta.url),
  );
  const names = CLASSES.map((name, index) => ` *   ${String.fromCharCode(65 + index)} ${name}`);
  const source = `/**
 * The properties of every code point that the segmentation of extended
 * grapheme clusters reads (UAX #29), from the data files of Unicode
 * ${UNICODE_VERSION} (D69.2). Generated by \`tests/unicode/grapheme-table.ts\`; do
 * not edit. Each run of code points of one class is its length in base 36
 * (lower case) followed by its class as one upper-case letter, from U+0000 to U+10FFFF without a gap:
 *
${names.join('\n')}
 */
export const UNICODE_VERSION = '${UNICODE_VERSION}';

export const GRAPHEME_TABLE =
  '${table}';
`;
  writeFileSync(target, source);
  process.stdout.write(`${target}: ${String(table.length)} characters of table\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
