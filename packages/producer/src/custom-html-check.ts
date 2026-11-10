/**
 * The render check of `check_custom_html` (D78): one Custom HTML element of a
 * document, rendered alone at sampled times of its lifetime twice — the second
 * time in the reverse order — in the pinned Chromium of the Producer, frames
 * compared byte for byte. A frame that differs between the two renders shows
 * state the element keeps from frame to frame, or reads from a clock the
 * managed clock does not drive; a time it does not answer, or a document it
 * navigates to, ends a render and is reported as such. It renders through
 * `renderFrames`, so the element meets exactly the page, the shell, and the
 * time contract of every render (D23, D28).
 */
import {
  frameCount,
  frameToTimeUs,
  validateComposition,
  type CustomHtmlNode,
  type ValidatedComposition,
} from '@kadrion/schema';

import type { LaunchedChromium } from './environment.js';
import { ProducerError } from './errors.js';
import type { ProducerAssetResolver } from './media-path.js';
import { renderFrames, type RenderResult, type RenderTimeouts } from './render.js';
import type { RuntimeBuild } from './runtime.js';

/** The ID of the background of the document of the element alone. */
const CHECK_BACKGROUND = 'check-background';

/** How many times of the element's lifetime the check renders, unless a request says otherwise. */
export const CUSTOM_HTML_CHECK_SAMPLES = 5;

export interface CustomHtmlCheckRequest extends RenderTimeouts {
  readonly document: unknown;
  /** The ID of a Custom HTML node of the document: of a scene, a group, or a definition. */
  readonly nodeId: string;
  /** Bytes for the element's fonts (D14). */
  readonly resolveAsset: ProducerAssetResolver;
  /** How many times to sample, from 1 to the number of frames of the element; 5 by default. */
  readonly samples?: number;
  readonly chromium?: LaunchedChromium;
  readonly runtime?: RuntimeBuild;
}

/** One problem a render showed (D78). */
export interface CustomHtmlCheckProblem {
  readonly code: 'no-acknowledgement' | 'navigated' | 'frames-differ' | 'render-failed';
  /** The time of the element, from its start, it concerns; `null` when it concerns no one time. */
  readonly timeUs: number | null;
  readonly message: string;
}

/** What the render check found (D78). */
export interface CustomHtmlCheck {
  /** The times of the element it rendered, from its start, in the order of the first render. */
  readonly timesUs: readonly number[];
  readonly problems: readonly CustomHtmlCheckProblem[];
}

/** What the check renders with; a test passes a fake (not exported by the package). */
export type CheckRender = (request: Parameters<typeof renderFrames>[0]) => Promise<RenderResult>;

type AnyNode =
  | ValidatedComposition['scenes'][number]['nodes'][number]
  | Extract<
      ValidatedComposition['scenes'][number]['nodes'][number],
      { type: 'group' }
    >['children'][number];

/** The node `nodeId` among `nodes` and the children of their groups, or `null`. */
function findNode(nodes: readonly AnyNode[], nodeId: string): AnyNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.type === 'group') {
      const found = findNode(node.children, nodeId);
      if (found !== null) return found;
    }
  }
  return null;
}

/** The Custom HTML node `nodeId` of a scene, a group, or a definition of the document. */
function nodeOf(composition: ValidatedComposition, nodeId: string): CustomHtmlNode {
  for (const nodes of [
    ...composition.scenes.map((scene) => scene.nodes),
    ...composition.definitions.map((definition) => definition.nodes),
  ]) {
    const node = findNode(nodes, nodeId);
    if (node === null) continue;
    if (node.type !== 'custom-html') {
      throw new ProducerError(
        'invalid-document',
        `Node "${nodeId}" is a ${node.type} node, not Custom HTML.`,
      );
    }
    return node;
  }
  throw new ProducerError('invalid-document', `No Custom HTML node has the ID "${nodeId}".`);
}

/**
 * A document of the element alone: the canvas and the frame rate of its
 * document, one scene as long as the element, which starts at 0 at the
 * top-left corner, unscaled, unrotated, opaque, and unanimated, over a mid
 * grey background, so that white and black content both show, and its fonts
 * as the only assets. The managed clock counts from the node's start (D78), so
 * the element sees the times it sees in its document.
 */
export function customHtmlCheckDocument(
  composition: ValidatedComposition,
  node: CustomHtmlNode,
): unknown {
  const fonts = new Set(node.fontAssetIds);
  return {
    schemaVersion: composition.schemaVersion,
    width: composition.width,
    height: composition.height,
    safeArea: { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 },
    fps: composition.fps,
    durationUs: node.durationUs,
    assets: composition.assets.filter((asset) => fonts.has(asset.id)),
    scenes: [
      {
        id: 'check',
        durationUs: node.durationUs,
        nodes: [
          {
            id: node.id === CHECK_BACKGROUND ? `${CHECK_BACKGROUND}-1` : CHECK_BACKGROUND,
            type: 'background',
            startUs: 0,
            durationUs: node.durationUs,
            color: '#808080',
            animations: [],
          },
          {
            ...node,
            startUs: 0,
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            origin: { x: 0, y: 0 },
            opacity: 1,
            animations: [],
          },
        ],
        clips: [],
        transitions: [],
        effects: [],
      },
    ],
    clips: [],
    transitions: [],
    definitions: [],
    template: { inputs: [], bindings: [], conditions: [], repeats: [] },
  };
}

/** `samples` frame times spread over `frames` frames: the first, the last, and evenly between. */
export function sampledTimes(frames: number, fps: number, samples: number): number[] {
  const count = Math.min(samples, frames);
  const indices = new Set<number>();
  for (let at = 0; at < count; at += 1) {
    indices.add(count === 1 ? 0 : Math.round((at * (frames - 1)) / (count - 1)));
  }
  return [...indices].sort((a, b) => a - b).map((frame) => frameToTimeUs(frame, fps));
}

function problemOf(reason: unknown): CustomHtmlCheckProblem {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (reason instanceof ProducerError && reason.code === 'custom-html-timeout') {
    return { code: 'no-acknowledgement', timeUs: null, message };
  }
  if (reason instanceof ProducerError && reason.code === 'custom-html-navigated') {
    return { code: 'navigated', timeUs: null, message };
  }
  return { code: 'render-failed', timeUs: null, message };
}

/** `checkCustomHtml` on the given render. */
export async function checkCustomHtmlWith(
  request: CustomHtmlCheckRequest,
  render: CheckRender,
): Promise<CustomHtmlCheck> {
  // A template is checked too: the document of the element alone has no template.
  const result = validateComposition(request.document);
  if (!result.ok) {
    const details = result.errors.map(({ path, message }) => `${path}: ${message}`).join('; ');
    throw new ProducerError('invalid-document', `The document is not valid: ${details}`);
  }
  const composition = result.composition;
  const node = nodeOf(composition, request.nodeId);
  const samples = request.samples ?? CUSTOM_HTML_CHECK_SAMPLES;
  if (!Number.isSafeInteger(samples) || samples < 1) {
    throw new ProducerError(
      'invalid-document',
      `samples must be a whole number from 1, got ${String(samples)}.`,
    );
  }
  const document = customHtmlCheckDocument(composition, node);
  const timesUs = sampledTimes(
    frameCount(node.durationUs, composition.fps),
    composition.fps,
    samples,
  );
  const pass = async (
    order: readonly number[],
  ): Promise<Map<number, Uint8Array> | CustomHtmlCheckProblem> => {
    try {
      const { frames } = await render({
        document,
        resolveAsset: request.resolveAsset,
        timesUs: order,
        ...(request.chromium === undefined ? {} : { chromium: request.chromium }),
        ...(request.runtime === undefined ? {} : { runtime: request.runtime }),
        ...(request.ackTimeoutMs === undefined ? {} : { ackTimeoutMs: request.ackTimeoutMs }),
        ...(request.pageTimeoutMs === undefined ? {} : { pageTimeoutMs: request.pageTimeoutMs }),
        ...(request.presentationTimeoutMs === undefined
          ? {}
          : { presentationTimeoutMs: request.presentationTimeoutMs }),
      });
      return new Map(frames.map(({ timeUs, png }) => [timeUs, png]));
    } catch (reason) {
      return problemOf(reason);
    }
  };
  const forward = await pass(timesUs);
  if (!(forward instanceof Map)) return Object.freeze({ timesUs, problems: [forward] });
  const backward = await pass([...timesUs].reverse());
  if (!(backward instanceof Map)) return Object.freeze({ timesUs, problems: [backward] });
  const problems: CustomHtmlCheckProblem[] = [];
  for (const timeUs of timesUs) {
    const a = forward.get(timeUs);
    const b = backward.get(timeUs);
    if (a === undefined || b === undefined || !Buffer.from(a).equals(Buffer.from(b))) {
      problems.push({
        code: 'frames-differ',
        timeUs,
        message: `The frame at ${String(timeUs)} µs of the element differs between a render forward and one backward: it keeps state from frame to frame, or reads a clock the managed clock does not drive.`,
      });
    }
  }
  return Object.freeze({ timesUs, problems });
}

/**
 * Renders one Custom HTML element of `document` alone at sampled times of its
 * lifetime, forward and then backward, and reports a time it did not answer, a
 * navigation, and every frame that differs between the two renders (D78).
 * An invalid document or a node that is not Custom HTML rejects with
 * `invalid-document`; a failed render is a problem of the report.
 */
export function checkCustomHtml(request: CustomHtmlCheckRequest): Promise<CustomHtmlCheck> {
  return checkCustomHtmlWith(request, renderFrames);
}
