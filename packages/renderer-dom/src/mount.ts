/**
 * Builds the DOM tree of a document (D22.3). Only static properties of the
 * document are written here; `renderState` writes the evaluated ones, every
 * property an animation can reach included, animated or not (D68): the
 * colour of a background, a text, and captions, the size, crop, and
 * corner radius of an image or a video, and the box, path, fill, and stroke of
 * a shape (D73).
 */
import { captionPages, captionsInPieces, textLayout } from '@kadrion/runtime';
import type {
  CaptionsNode,
  Effect,
  FragmentUnit,
  GroupNode,
  SceneNode,
  TextNode,
  ValidatedComposition,
} from '@kadrion/schema';

import { checkAssetUrls, type AssetUrls } from './assets.js';
import { cssColor, cssObjectPosition, cssPixels, cssTranslucent, fontFamily } from './css.js';
import { unsupportedNode } from './errors.js';
import {
  CUSTOM_HTML_ATTRIBUTE,
  CUSTOM_HTML_DISABLED,
  mountOptions,
  type CustomHtmlPolicy,
  type MountOptions,
} from './policy.js';
import {
  cssMask,
  maskDefinitions,
  maskId,
  MATTE_ATTRIBUTE,
  MATTE_FRAME_ATTRIBUTE,
  matteId,
  matteIds,
} from './masks.js';
import { sandboxFrame } from './sandbox.js';
import { shapeContent } from './shapes.js';
import { effectFilters, isSvgEffect } from './svg-filters.js';

/** Attributes that address the elements of a mounted tree. They hold IDs, never state. */
export const STAGE_ATTRIBUTE = 'data-kadrion-composition';
export const SCENE_ATTRIBUTE = 'data-kadrion-scene';
export const NODE_ATTRIBUTE = 'data-kadrion-node';
/**
 * The frame of a clip transition around one of its sides (D66): a canvas-sized
 * box at the origin of the side's parent, holding the side alone. It carries
 * the ID of its node.
 */
export const CLIP_FRAME_ATTRIBUTE = 'data-kadrion-clip-frame';
/** The index of a page of captions, and of a word in the node's `words` (D57). */
export const CAPTION_PAGE_ATTRIBUTE = 'data-kadrion-caption-page';
export const CAPTION_WORD_ATTRIBUTE = 'data-kadrion-caption-word';
/**
 * The pieces of captions drawn in pieces (D70): the element of a line of a page
 * that its entrance and exit move, the box behind a line, and the box and the
 * underline of the word being spoken, shown on that word alone.
 */
export const CAPTION_LINE_ATTRIBUTE = 'data-kadrion-caption-line';
export const CAPTION_LINE_BOX_ATTRIBUTE = 'data-kadrion-caption-line-box';
export const CAPTION_WORD_BOX_ATTRIBUTE = 'data-kadrion-caption-word-box';
export const CAPTION_UNDERLINE_ATTRIBUTE = 'data-kadrion-caption-underline';
/**
 * A fragment of a text with text animations (D69): its unit, `line`, `word`, or
 * `letter`. The fragments of one unit are found in the order of the text.
 */
export const FRAGMENT_ATTRIBUTE = 'data-kadrion-fragment';
/** The box behind a text (D69), the first child of the text's element. */
export const TEXT_BOX_ATTRIBUTE = 'data-kadrion-text-box';
/** The custom property on a captions box that holds its highlight colour (D57). */
export const HIGHLIGHT_PROPERTY = '--kadrion-caption-highlight';

type Styles = Readonly<Record<string, string>>;

const PLACED: Styles = Object.freeze({ position: 'absolute', left: '0px', top: '0px' });
/**
 * The transform is written about the top-left corner of the node (D15); the
 * origin of D68 is part of the transform itself (`cssTransform`).
 */
const TRANSFORMED: Styles = Object.freeze({ ...PLACED, 'transform-origin': '0px 0px' });

function create(
  document: Document,
  tag: 'div' | 'img' | 'span',
  attributes: Styles,
  styles: Styles,
): HTMLElement {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  for (const [name, value] of Object.entries(styles)) element.style.setProperty(name, value);
  return element;
}

const JUSTIFY: Readonly<Record<CaptionsNode['style']['verticalAlign'], string>> = Object.freeze({
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
});

/** A line or a word of captions drawn in pieces (D70): a box that the pieces under it are placed in. */
const PIECE: Styles = Object.freeze({ display: 'inline-block', position: 'relative' });

/**
 * The box of a captions node (D57): every page the runtime's `captionPages`
 * makes, each hidden until `renderState` shows it, with its lines and, in
 * them, one element per word, the words joined by one space. The lines are
 * the runtime's, so the browser wraps nothing (`white-space: pre`); a page's
 * lines lie in the box as `verticalAlign` says, each line as `align` says. The
 * outline and the shadow of the style are written on the box, as on a text
 * (D70).
 *
 * A node drawn in pieces (D70) holds the words of each line in an
 * `inline-block` element of their own, which the style's box lies behind and
 * a page's entrance and exit move, and makes every word an `inline-block`
 * element that holds, under its glyphs, the box and the underline of the
 * highlight, hidden until the word is spoken. Their values are written by
 * `renderState`.
 */
function captionsElement(document: Document, node: CaptionsNode, address: Styles): HTMLElement {
  const { style } = node;
  const pieces = captionsInPieces(style);
  const { highlight } = style;
  const box = create(document, 'div', address, {
    ...TRANSFORMED,
    width: cssPixels(node.width),
    height: cssPixels(node.height),
    'font-family': fontFamily(node.fontAssetId),
    'font-size': cssPixels(style.fontSize),
    'line-height': cssPixels(style.lineHeight),
    'font-weight': '400',
    'font-style': 'normal',
    'white-space': 'pre',
    'text-align': style.align,
    [HIGHLIGHT_PROPERTY]: cssColor(highlight.color),
    ...textStyle(style),
  });
  captionPages(node.words, style).forEach((page, pageIndex) => {
    const pageElement = create(
      document,
      'div',
      { [CAPTION_PAGE_ATTRIBUTE]: String(pageIndex) },
      {
        ...PLACED,
        width: '100%',
        height: '100%',
        display: 'none',
        'flex-direction': 'column',
        'justify-content': JUSTIFY[style.verticalAlign],
      },
    );
    for (const line of page.lines) {
      const lineElement = create(document, 'div', {}, {});
      let wordsParent = lineElement;
      if (pieces) {
        wordsParent = create(document, 'span', { [CAPTION_LINE_ATTRIBUTE]: '' }, PIECE);
        if (style.box.kind === 'solid') {
          wordsParent.append(textBox(document, style.box, CAPTION_LINE_BOX_ATTRIBUTE));
        }
        lineElement.append(wordsParent);
      }
      line.words.forEach((wordIndex, at) => {
        if (at > 0) wordsParent.append(document.createTextNode(' '));
        const word = create(
          document,
          'span',
          { [CAPTION_WORD_ATTRIBUTE]: String(wordIndex) },
          pieces ? PIECE : {},
        );
        if (pieces) word.append(...highlightPieces(document, highlight));
        // A text node, never markup: the document's words are not parsed.
        word.append(document.createTextNode(node.words[wordIndex]?.text ?? ''));
        wordsParent.append(word);
      });
      pageElement.append(lineElement);
    }
    box.append(pageElement);
  });
  return box;
}

/**
 * The box and the underline of the highlight (D70), hidden until the word is
 * spoken, both under the glyphs of the word (`z-index: -1` inside the stacking
 * context of the transformed word) and the underline over the box. The
 * underline is as wide as the word, `thickness` tall, its bottom edge `offset`
 * below the bottom of the word's line box.
 */
function highlightPieces(
  document: Document,
  highlight: CaptionsNode['style']['highlight'],
): HTMLElement[] {
  const pieces: HTMLElement[] = [];
  if (highlight.box.kind === 'solid') {
    const wordBox = textBox(document, highlight.box, CAPTION_WORD_BOX_ATTRIBUTE);
    wordBox.style.setProperty('display', 'none');
    pieces.push(wordBox);
  }
  if (highlight.underline.kind === 'solid') {
    const { color, thickness, offset } = highlight.underline;
    pieces.push(
      create(
        document,
        'span',
        { [CAPTION_UNDERLINE_ATTRIBUTE]: '' },
        {
          position: 'absolute',
          left: '0px',
          right: '0px',
          bottom: cssPixels(-offset),
          height: cssPixels(thickness),
          'z-index': '-1',
          'background-color': cssColor(color),
          display: 'none',
        },
      ),
    );
  }
  return pieces;
}

/**
 * The declarations of a text's style (D69): an outline drawn outside every
 * glyph — a stroke of twice the width under the fill, so that its inner half is
 * covered — and a shadow. A style of `none` writes nothing, so a text of 0.13
 * is the element it was. Each value is written as the CSS Object Model
 * serialises it: `paint-order: stroke fill` reads back as `stroke`.
 */
function textStyle(style: Pick<TextNode['style'], 'stroke' | 'shadow'>): Styles {
  const out: Record<string, string> = {};
  if (style.stroke.kind === 'outside') {
    out['-webkit-text-stroke-width'] = cssPixels(2 * style.stroke.width);
    out['-webkit-text-stroke-color'] = cssColor(style.stroke.color);
    out['paint-order'] = 'stroke';
  }
  if (style.shadow.kind === 'drop') {
    const { color, opacity, offset, blur } = style.shadow;
    out['text-shadow'] =
      `${cssTranslucent(color, opacity)} ${cssPixels(offset.x)} ${cssPixels(offset.y)} ${cssPixels(blur)}`;
  }
  return out;
}

/**
 * The box behind a text (D69): an element of its own, the first child of the
 * text's element — and so the box behind a line of captions, and behind the
 * word being spoken (D70) — reaching `padding` beyond the box of the lines on every side
 * and painted under the glyphs (`z-index: -1` inside the stacking context of
 * the transformed text), so that it moves nothing and the node's box stays the
 * box of its lines.
 */
function textBox(
  document: Document,
  box: Extract<TextNode['style']['box'], { kind: 'solid' }>,
  attribute: string = TEXT_BOX_ATTRIBUTE,
) {
  const inset = cssPixels(-box.padding);
  return create(
    document,
    'span',
    { [attribute]: '' },
    {
      position: 'absolute',
      left: inset,
      top: inset,
      right: inset,
      bottom: inset,
      'z-index': '-1',
      'background-color': cssTranslucent(box.color, box.opacity),
      'border-radius': cssPixels(box.cornerRadius),
    },
  );
}

/**
 * The content of a text with text animations (D65.3, D69), in fragments of
 * every unit its animations use, nested line, word, letter: one
 * `inline-block` element per fragment, white space and line feeds as text
 * between them. A line holds the fragments of its words, a word those of its
 * letters; a unit no animation uses has no element, and its text stands in
 * the element of the next larger unit. Nothing else is written: the values of
 * a fragment are written by `renderState`.
 */
function fragmentContent(
  document: Document,
  parent: HTMLElement,
  text: string,
  units: ReadonlySet<FragmentUnit>,
): void {
  const fragment = (unit: FragmentUnit): HTMLElement =>
    create(document, 'span', { [FRAGMENT_ATTRIBUTE]: unit }, { display: 'inline-block' });
  textLayout(text).lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) parent.append(document.createTextNode('\n'));
    let lineParent = parent;
    if (units.has('line') && line.runs.some((run) => 'letters' in run)) {
      lineParent = fragment('line');
      parent.append(lineParent);
    }
    for (const run of line.runs) {
      if ('space' in run) {
        lineParent.append(document.createTextNode(run.space));
        continue;
      }
      let wordParent = lineParent;
      if (units.has('word')) {
        wordParent = fragment('word');
        lineParent.append(wordParent);
      }
      if (units.has('letter')) {
        for (const letter of run.letters) {
          const element = fragment('letter');
          element.append(document.createTextNode(letter));
          wordParent.append(element);
        }
      } else {
        wordParent.append(document.createTextNode(run.letters.join('')));
      }
    }
  });
}

/**
 * The element of a node, inside the frame of its clip transitions when it is
 * a side of one (D66). The frame is written nothing at mount: unstyled, it
 * neither clips nor paints, so the node renders as it would without it.
 */
function placedNode(
  document: Document,
  node: SceneNode | GroupNode['children'][number],
  canvas: Styles,
  assetUrls: AssetUrls,
  customHtml: CustomHtmlPolicy,
  sides: ReadonlySet<string>,
  mattes: ReadonlySet<string>,
): HTMLElement {
  const element = nodeElement(document, node, canvas, assetUrls, customHtml, sides, mattes);
  // A node's own mask lies on its element, after its effects (D65.6, D75).
  if ('mask' in node && node.mask.kind !== 'none') {
    element.style.setProperty('mask', cssMask(maskId(node.id)));
  }
  // A matte is never drawn by itself; `renderState` hides it (D75).
  if (mattes.has(node.id)) element.setAttribute(MATTE_ATTRIBUTE, '');
  let placed = element;
  if (sides.has(node.id)) {
    placed = create(document, 'div', { [CLIP_FRAME_ATTRIBUTE]: node.id }, { ...PLACED, ...canvas });
    placed.append(element);
  }
  // A matte lies in the space of the parent, on a frame around the node (D75).
  if ('matte' in node && node.matte.kind === 'node') {
    const frame = create(
      document,
      'div',
      { [MATTE_FRAME_ATTRIBUTE]: node.id },
      { ...PLACED, ...canvas, mask: cssMask(matteId(node.id)) },
    );
    frame.append(placed);
    placed = frame;
  }
  // The blend mode comes last, on the outermost element of the node (D65.6, D75).
  if ('blendMode' in node && node.blendMode !== 'normal') {
    placed.style.setProperty('mix-blend-mode', node.blendMode);
  }
  return placed;
}

/** Whether a node of a list blends with what lies below it, so that their parent is isolated (D75). */
function blends(nodes: readonly (SceneNode | GroupNode['children'][number])[]): boolean {
  return nodes.some((node) => 'blendMode' in node && node.blendMode !== 'normal');
}

function nodeElement(
  document: Document,
  node: SceneNode | GroupNode['children'][number],
  canvas: Styles,
  assetUrls: AssetUrls,
  customHtml: CustomHtmlPolicy,
  sides: ReadonlySet<string>,
  mattes: ReadonlySet<string>,
): HTMLElement {
  const address = { [NODE_ATTRIBUTE]: node.id };
  switch (node.type) {
    case 'background':
      return create(document, 'div', address, { ...PLACED, ...canvas });
    case 'group': {
      // A group's box is the canvas, the box its origin is a point of (D68); it
      // neither clips nor paints.
      // A group with a child that blends is composited on its own (D75).
      const group = create(document, 'div', address, {
        ...TRANSFORMED,
        ...canvas,
        ...(blends(node.children) ? { isolation: 'isolate' } : {}),
      });
      group.append(
        ...node.children.map((child) =>
          placedNode(document, child, canvas, assetUrls, customHtml, sides, mattes),
        ),
      );
      return group;
    }
    case 'image':
      return create(
        document,
        'img',
        { ...address, src: assetUrls[node.assetId] ?? '', alt: '' },
        {
          ...TRANSFORMED,
          display: 'block',
          'object-fit': node.fit,
          'object-position': cssObjectPosition(node.focus),
        },
      );
    case 'video':
      // An image without a source until a frame is supplied (D50.4): the host
      // gives the pixels of the source frame for every frame it renders, and
      // `applyVideoFrames` writes them. Nothing of the video's bytes is mounted.
      return create(
        document,
        'img',
        { ...address, alt: '' },
        {
          ...TRANSFORMED,
          display: 'block',
          'object-fit': node.fit,
          'object-position': cssObjectPosition(node.focus),
        },
      );
    case 'text': {
      const text = create(document, 'div', address, {
        ...TRANSFORMED,
        'white-space': 'pre',
        'font-family': fontFamily(node.fontAssetId),
        'font-size': cssPixels(node.fontSize),
        'line-height': '1.25',
        'font-weight': '400',
        'font-style': 'normal',
        ...textStyle(node.style),
      });
      if (node.style.box.kind === 'solid') text.append(textBox(document, node.style.box));
      // Text nodes, never markup: the document's text is not parsed.
      if (node.textAnimations.length === 0) text.append(document.createTextNode(node.text));
      else {
        const units = new Set(node.textAnimations.map((animation) => animation.unit));
        fragmentContent(document, text, node.text, units);
      }
      return text;
    }
    case 'captions':
      return captionsElement(document, node, address);
    case 'shape': {
      // The box, sized by `renderState` (D73), holds the shape's own SVG.
      const box = create(document, 'div', address, TRANSFORMED);
      box.append(shapeContent(document, node));
      return box;
    }
    case 'custom-html': {
      // A sized placeholder that carries the transform. Only a trusted element
      // gets the sandboxed frame inside it, the only place the document's HTML
      // goes (D05, D23). A disabled one stays an empty, marked box of the same
      // geometry: its HTML is not read at all (D36).
      const styles = {
        ...TRANSFORMED,
        width: cssPixels(node.width),
        height: cssPixels(node.height),
      };
      if (customHtml.mode === 'disabled') {
        return create(
          document,
          'div',
          { ...address, [CUSTOM_HTML_ATTRIBUTE]: CUSTOM_HTML_DISABLED },
          styles,
        );
      }
      const placeholder = create(document, 'div', address, styles);
      placeholder.append(sandboxFrame(document, node));
      return placeholder;
    }
    default:
      return unsupportedNode(node);
  }
}

/** The IDs of the effects drawn by SVG filters, in document order (D72). */
function svgEffectIds(composition: ValidatedComposition): string[] {
  const ids: string[] = [];
  const collect = (holder: { readonly effects?: readonly Effect[] }): void => {
    for (const effect of holder.effects ?? []) if (isSvgEffect(effect)) ids.push(effect.id);
  };
  for (const scene of composition.scenes) {
    collect(scene);
    for (const node of scene.nodes) {
      if ('effects' in node) collect(node);
      if (node.type === 'group') for (const child of node.children) collect(child);
    }
  }
  return ids;
}

/**
 * Replaces the content of `root` with the tree of `composition` (D22.3). The
 * host's Custom HTML policy is required and checked first (D36), then the asset
 * URLs; any problem throws a `RenderError` before the DOM is touched. Every
 * element is created through `root.ownerDocument`, so the renderer works in
 * whichever realm owns `root`. Nothing is kept between calls: the tree itself
 * is the only state, and `renderState` finds it again.
 */
export function mountComposition(
  root: Element,
  composition: ValidatedComposition,
  assetUrls: AssetUrls,
  options: MountOptions,
): void {
  const { customHtml } = mountOptions(options);
  const urls = checkAssetUrls(composition, assetUrls);
  const document = root.ownerDocument;
  const canvas = { width: cssPixels(composition.width), height: cssPixels(composition.height) };
  // A disabled mount says so once on the stage too, so that every element of the
  // tree must agree with it (D36); a trusted stage is exactly the stage of D22.3.
  const stage = create(
    document,
    'div',
    customHtml.mode === 'disabled'
      ? { [STAGE_ATTRIBUTE]: '', [CUSTOM_HTML_ATTRIBUTE]: CUSTOM_HTML_DISABLED }
      : { [STAGE_ATTRIBUTE]: '' },
    { position: 'relative', ...canvas, overflow: 'hidden' },
  );
  const mattes = matteIds(composition);
  for (const scene of composition.scenes) {
    // A scene with a node that blends is composited on its own (D75).
    const sceneElement = create(
      document,
      'div',
      { [SCENE_ATTRIBUTE]: scene.id },
      { ...PLACED, ...canvas, ...(blends(scene.nodes) ? { isolation: 'isolate' } : {}) },
    );
    // Every side of a clip transition gets its frame, whatever the effect (D66).
    const sides = new Set(
      scene.transitions.flatMap(({ fromNodeId, toNodeId }) => [fromNodeId, toNodeId]),
    );
    sceneElement.append(
      ...scene.nodes.map((node) =>
        placedNode(document, node, canvas, urls, customHtml, sides, mattes),
      ),
    );
    stage.append(sceneElement);
  }
  // The filters of the effects drawn by SVG filters, after the scenes (D72).
  const filters = effectFilters(document, svgEffectIds(composition));
  if (filters !== null) stage.append(filters);
  // The masks and mattes, after the filters (D75).
  const masks = maskDefinitions(document, composition, urls);
  if (masks !== null) stage.append(masks);
  root.replaceChildren(stage);
}
