/**
 * Builds the DOM tree of a document (D22.3). Only static properties of the
 * document are written here; `renderState` writes the evaluated ones, every
 * property an animation can reach included, animated or not (D68): the
 * colour of a background, a text, and captions, the size, crop, and
 * corner radius of an image or a video, and the box, path, fill, and stroke of
 * a shape (D73).
 */
import {
  captionPages,
  captionsInPieces,
  EvaluationError,
  frameLayout,
  textLayout,
  textLines,
  type FontMetrics,
  type TextRun,
} from '@kadrion/runtime';
import {
  instanceDefinition,
  type CaptionsNode,
  type Effect,
  type FragmentUnit,
  type GroupNode,
  type InstanceNode,
  type SceneNode,
  type TextNode,
  type ValidatedComposition,
} from '@kadrion/schema';

import { checkAssetUrls, type AssetUrls } from './assets.js';
import {
  cssColor,
  cssNumber,
  cssObjectPosition,
  cssPixels,
  cssTranslucent,
  fontFamily,
} from './css.js';
import { unsupportedNode } from './errors.js';
import { FONT_METRICS_ATTRIBUTE, keptFontMetrics, type FontMetricsMap } from './fonts.js';
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
/**
 * The canvas of the definition of an instance (D76): the only child of the
 * instance's box, as large as the definition's canvas, fitted to the box. It
 * holds the definition's nodes and carries the ID of the definition.
 */
export const INSTANCE_CONTENT_ATTRIBUTE = 'data-kadrion-instance-content';
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
/**
 * A line measured from the font (D83.5): a line of a text with a frame, an
 * element of its own placed in the frame where `frameLayout` puts it, or a
 * line of captions broken by width; it holds the line's index in the lines of
 * `frameLayout` (for captions, of every page in order).
 */
export const TEXT_LINE_ATTRIBUTE = 'data-kadrion-text-line';
/** The custom property on a captions box that holds its highlight colour (D57). */
export const HIGHLIGHT_PROPERTY = '--kadrion-caption-highlight';
/**
 * The custom properties on a captions box that hold the outline and the shadow
 * of the highlight (D83.8), written only when the highlight has them;
 * `renderState` writes them on the word being spoken.
 */
export const HIGHLIGHT_STROKE_WIDTH_PROPERTY = '--kadrion-caption-highlight-stroke-width';
export const HIGHLIGHT_STROKE_COLOR_PROPERTY = '--kadrion-caption-highlight-stroke-color';
export const HIGHLIGHT_SHADOW_PROPERTY = '--kadrion-caption-highlight-shadow';

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
 * A line measured from the font (D83.2): the browser wraps nothing, and draws
 * it with neither kerning nor ligatures, so that the width it draws is the sum
 * of the advances the runtime measured.
 */
const MEASURED: Styles = Object.freeze({
  'white-space': 'pre',
  'font-kerning': 'none',
  'font-variant-ligatures': 'none',
});

/**
 * The metrics of the font of a measured node (D83.7): a text with a frame, or
 * captions broken by width. Without them the node cannot be drawn: the
 * `EvaluationError` `font-metrics-missing`, as the evaluation throws it.
 */
function metricsOf(
  fonts: FontMetricsMap,
  node: { readonly id: string; readonly fontAssetId: string },
): FontMetrics {
  const metrics = fonts.get(node.fontAssetId);
  if (metrics === undefined) {
    throw new EvaluationError(
      'font-metrics-missing',
      `The node "${node.id}" is measured, and its font "${node.fontAssetId}" has no metrics (D83.7).`,
    );
  }
  return metrics;
}

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
function captionsElement(
  document: Document,
  node: CaptionsNode,
  address: Styles,
  fonts: FontMetricsMap,
): HTMLElement {
  const { style } = node;
  const pieces = captionsInPieces(style);
  const { highlight } = style;
  // Broken by width, every line is measured and placed where `frameLayout` puts it (D83.5, D83.6).
  const metrics = style.lineBreak === 'width' ? metricsOf(fonts, node) : undefined;
  const placed = metrics === undefined ? [] : frameLayout(node, metrics).lines;
  let lineAt = 0;
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
    ...highlightStyle(highlight),
  });
  captionPages(node.words, style, node.width, metrics).forEach((page, pageIndex) => {
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
      const x = placed[lineAt]?.x ?? 0;
      const lineAttributes = metrics === undefined ? {} : { [TEXT_LINE_ATTRIBUTE]: String(lineAt) };
      lineAt += 1;
      const lineElement = create(
        document,
        'div',
        lineAttributes,
        metrics === undefined
          ? {}
          : { ...MEASURED, 'text-align': 'left', 'margin-left': cssPixels(x) },
      );
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
 * The outline and the shadow of the highlight (D83.8) as custom properties of
 * the captions box, which `renderState` writes on the word being spoken. A
 * highlight of `none` writes nothing, so a captions node of 0.24 is the element
 * it was.
 */
function highlightStyle(highlight: CaptionsNode['style']['highlight']): Styles {
  const out: Record<string, string> = {};
  const lit = textStyle(highlight);
  const width = lit['-webkit-text-stroke-width'];
  const color = lit['-webkit-text-stroke-color'];
  const shadow = lit['text-shadow'];
  if (width !== undefined && color !== undefined) {
    out[HIGHLIGHT_STROKE_WIDTH_PROPERTY] = width;
    out[HIGHLIGHT_STROKE_COLOR_PROPERTY] = color;
  }
  if (shadow !== undefined) out[HIGHLIGHT_SHADOW_PROPERTY] = shadow;
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
  textLayout(text).lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) parent.append(document.createTextNode('\n'));
    lineFragments(document, parent, line.runs, units);
  });
}

/**
 * The fragments of one line of a text (D69): the line's own fragment when a
 * line animation needs one and the line has a word, then its runs, white
 * space as text and every word in the fragments of its units.
 */
function lineFragments(
  document: Document,
  parent: HTMLElement,
  runs: readonly TextRun[],
  units: ReadonlySet<FragmentUnit>,
): void {
  const fragment = (unit: FragmentUnit): HTMLElement =>
    create(document, 'span', { [FRAGMENT_ATTRIBUTE]: unit }, { display: 'inline-block' });
  let lineParent = parent;
  if (units.has('line') && runs.some((run) => 'letters' in run)) {
    lineParent = fragment('line');
    parent.append(lineParent);
  }
  for (const run of runs) {
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
}

/** The declarations of the font of a text (D22.6): its family, size, and line height of 1.25. */
function textFont(node: TextNode): Styles {
  return {
    'font-family': fontFamily(node.fontAssetId),
    'font-size': cssPixels(node.fontSize),
    'line-height': '1.25',
    'font-weight': '400',
    'font-style': 'normal',
  };
}

/**
 * A text without a frame (D22.6, D69): one element as large as its lines,
 * which break at its line feeds only; `align` other than `left` places each
 * line within the widest one (D83.4). Nothing is measured, so the element is
 * the one of 0.24 for a text left-aligned.
 */
function textElement(document: Document, node: TextNode, address: Styles): HTMLElement {
  const { style } = node;
  const text = create(document, 'div', address, {
    ...TRANSFORMED,
    'white-space': 'pre',
    ...textFont(node),
    ...textStyle(style),
    ...(style.align === 'left' ? {} : { 'text-align': style.align }),
  });
  if (style.box.kind === 'solid') text.append(textBox(document, style.box));
  // Text nodes, never markup: the document's text is not parsed.
  if (node.textAnimations.length === 0) text.append(document.createTextNode(node.text));
  else {
    const units = new Set(node.textAnimations.map((animation) => animation.unit));
    fragmentContent(document, text, node.text, units);
  }
  return text;
}

/**
 * A text with a frame (D83.3 to D83.6): an element as large as the frame, the
 * box of the node, so that its origin is a fraction of the frame; in it the
 * lines of the runtime's wrap, each an element of its own measured from the
 * font (`MEASURED`) and placed where `frameLayout` puts it, so that a line or
 * a block that overflows does so on the side its alignment leaves free and
 * nothing is clipped. The text's box lies behind the block of lines, as wide
 * as its widest line (D83.3).
 */
function framedTextElement(
  document: Document,
  node: TextNode,
  frame: { readonly width: number; readonly height: number },
  address: Styles,
  fonts: FontMetricsMap,
): HTMLElement {
  const { style } = node;
  const metrics = metricsOf(fonts, node);
  const text = create(document, 'div', address, {
    ...TRANSFORMED,
    width: cssPixels(frame.width),
    height: cssPixels(frame.height),
    ...textFont(node),
    ...textStyle(style),
  });
  const layout = frameLayout(node, metrics);
  const lines = textLines(node.text, node.fontSize, frame.width, metrics);
  if (style.box.kind === 'solid') {
    const { padding } = style.box;
    const left = Math.min(...layout.lines.map((line) => line.x));
    const top = layout.lines[0]?.y ?? 0;
    const widest = Math.max(0, ...layout.lines.map((line) => line.width));
    const box = textBox(document, style.box);
    for (const property of ['right', 'bottom']) box.style.removeProperty(property);
    box.style.setProperty('left', cssPixels(left - padding));
    box.style.setProperty('top', cssPixels(top - padding));
    box.style.setProperty('width', cssPixels(widest + 2 * padding));
    box.style.setProperty('height', cssPixels(layout.height + 2 * padding));
    text.append(box);
  }
  const units = new Set(node.textAnimations.map((animation) => animation.unit));
  layout.lines.forEach((placed, index) => {
    const line = create(
      document,
      'div',
      { [TEXT_LINE_ATTRIBUTE]: String(index) },
      { ...PLACED, left: cssPixels(placed.x), top: cssPixels(placed.y), ...MEASURED },
    );
    // Text nodes, never markup: the document's text is not parsed.
    if (node.textAnimations.length === 0) line.append(document.createTextNode(placed.text));
    else lineFragments(document, line, lines[index]?.runs ?? [], units);
    text.append(line);
  });
  return text;
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
  composition: ValidatedComposition,
  fonts: FontMetricsMap,
): HTMLElement {
  const element = nodeElement(
    document,
    node,
    canvas,
    assetUrls,
    customHtml,
    sides,
    mattes,
    composition,
    fonts,
  );
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
  composition: ValidatedComposition,
  fonts: FontMetricsMap,
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
          placedNode(
            document,
            child,
            canvas,
            assetUrls,
            customHtml,
            sides,
            mattes,
            composition,
            fonts,
          ),
        ),
      );
      return group;
    }
    case 'instance':
      return instanceElement(
        document,
        node,
        address,
        assetUrls,
        customHtml,
        mattes,
        composition,
        fonts,
      );
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
    case 'text':
      return node.frame.kind === 'none'
        ? textElement(document, node, address)
        : framedTextElement(document, node, node.frame, address, fonts);
    case 'captions':
      return captionsElement(document, node, address, fonts);
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
      placeholder.append(sandboxFrame(document, node, assetUrls));
      return placeholder;
    }
    default:
      return unsupportedNode(node);
  }
}

/**
 * The transform that fits the canvas of a definition into the box of its
 * instance (D76), as `fit` says, about the top-left corner of the canvas:
 * `fill` stretches it, `contain` and `cover` scale it by the smaller or the
 * larger factor and centre it. `null` when the canvas is the box.
 */
function fitTransform(
  fit: InstanceNode['fit'],
  box: { readonly width: number; readonly height: number },
  canvas: { readonly width: number; readonly height: number },
): string | null {
  let x = box.width / canvas.width;
  let y = box.height / canvas.height;
  if (fit !== 'fill') {
    const factor = fit === 'contain' ? Math.min(x, y) : Math.max(x, y);
    x = factor;
    y = factor;
  }
  if (x === 1 && y === 1) return null;
  const left = (box.width - canvas.width * x) / 2;
  const top = (box.height - canvas.height * y) / 2;
  const scale = `scale(${cssNumber(x)}, ${cssNumber(y)})`;
  return left === 0 && top === 0
    ? scale
    : `translate(${cssPixels(left)}, ${cssPixels(top)}) ${scale}`;
}

/**
 * The element of an instance (D76): its box, which carries its transform,
 * effects, mask, and blend mode like any node and cuts what it holds to
 * itself, and inside it the canvas of its definition, fitted to the box, with
 * the definition's nodes by their paths (D76.3). The canvas is isolated when a
 * node of it blends, as a scene is (D75), so the instance is one layer.
 */
function instanceElement(
  document: Document,
  node: InstanceNode,
  address: Styles,
  assetUrls: AssetUrls,
  customHtml: CustomHtmlPolicy,
  mattes: ReadonlySet<string>,
  composition: ValidatedComposition,
  fonts: FontMetricsMap,
): HTMLElement {
  const box = create(document, 'div', address, {
    ...TRANSFORMED,
    width: cssPixels(node.width),
    height: cssPixels(node.height),
    overflow: 'hidden',
  });
  const definition = instanceDefinition(composition, node);
  // Validation guarantees the definition (D76).
  if (definition === null) return box;
  const canvas = { width: cssPixels(definition.width), height: cssPixels(definition.height) };
  const fitted = fitTransform(node.fit, node, definition);
  const content = create(
    document,
    'div',
    { [INSTANCE_CONTENT_ATTRIBUTE]: definition.id },
    {
      ...PLACED,
      ...canvas,
      ...(fitted === null ? {} : { 'transform-origin': '0px 0px', transform: fitted }),
      ...(blends(definition.nodes) ? { isolation: 'isolate' } : {}),
    },
  );
  const sides = new Set(
    definition.transitions.flatMap(({ fromNodeId, toNodeId }) => [fromNodeId, toNodeId]),
  );
  content.append(
    ...definition.nodes.map((child) =>
      placedNode(document, child, canvas, assetUrls, customHtml, sides, mattes, composition, fonts),
    ),
  );
  box.append(content);
  return box;
}

/** The IDs of the effects drawn by SVG filters, in document order, inside instances by their paths (D72, D76). */
function svgEffectIds(composition: ValidatedComposition): string[] {
  const ids: string[] = [];
  const collect = (holder: { readonly effects?: readonly Effect[] }): void => {
    for (const effect of holder.effects ?? []) if (isSvgEffect(effect)) ids.push(effect.id);
  };
  const visit = (node: SceneNode | GroupNode['children'][number]): void => {
    if ('effects' in node) collect(node);
    if (node.type === 'group') node.children.forEach(visit);
    if (node.type === 'instance') instanceDefinition(composition, node)?.nodes.forEach(visit);
  };
  for (const scene of composition.scenes) {
    collect(scene);
    scene.nodes.forEach(visit);
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
  mountMeasured(root, composition, assetUrls, options, new Map());
}

/**
 * `mountComposition` with the metrics of the fonts of the document's measured
 * nodes (D83.7), which the load step read: a text with a frame and captions
 * broken by width are drawn as the lines the runtime measured with them, and
 * the stage keeps them for every evaluation of the page (`readFontMetrics`). A
 * measured node whose font has no metrics is the `EvaluationError`
 * `font-metrics-missing`, before the DOM is touched.
 */
export function mountMeasured(
  root: Element,
  composition: ValidatedComposition,
  assetUrls: AssetUrls,
  options: MountOptions,
  fonts: FontMetricsMap,
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
  const kept = keptFontMetrics(fonts);
  if (kept !== null) stage.setAttribute(FONT_METRICS_ATTRIBUTE, kept);
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
        placedNode(document, node, canvas, urls, customHtml, sides, mattes, composition, fonts),
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
