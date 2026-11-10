/**
 * The document types are derived from the JSON Schema (D17). These assertions
 * pin the result against hand-written expectations, so a bug in `Infer` or an
 * unintended schema change fails `tsc -b`; the runtime part is a no-op.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type {
  AnimationKeyframe,
  Asset,
  AudioClip,
  BackgroundNode,
  CaptionHighlight,
  CaptionPageAnimation,
  CaptionStyle,
  CaptionsNode,
  CaptionWord,
  Composition,
  CustomHtmlNode,
  Easing,
  Effect,
  GroupNode,
  ImageNode,
  NodeAnimation,
  PathCommand,
  SafeArea,
  Scene,
  SceneNode,
  ShapeFill,
  ShapeGeometry,
  ShapeNode,
  Template,
  TemplateBinding,
  TemplateCondition,
  TemplateField,
  TemplateFieldValue,
  TemplateInput,
  TemplateRepeat,
  FragmentTrack,
  TextAnimation,
  TextNode,
  TextStyle,
  ValidatedComposition,
  ValidationResult,
  VideoNode,
  ClipTransition,
  SceneTransition,
  TransitionDirection,
  Mask,
  Matte,
  BlendMode,
} from '../src/index.js';

interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** How a segment moves (D67). */
type ExpectedEasing =
  | { readonly kind: 'linear' }
  | { readonly kind: 'hold' }
  | { readonly kind: 'ease-in' }
  | { readonly kind: 'ease-out' }
  | { readonly kind: 'ease-in-out' }
  | {
      readonly kind: 'cubic-bezier';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    }
  | { readonly kind: 'steps'; readonly count: number; readonly position: 'start' | 'end' };

interface ExpectedAnimation<Property extends string, Value> {
  readonly id: string;
  readonly property: Property;
  readonly keyframes: readonly {
    readonly timeUs: number;
    readonly value: Value;
    readonly easing: ExpectedEasing;
  }[];
}

type ExpectedVec2 = { readonly x: number; readonly y: number };

interface ExpectedAmountEffect<Kind extends string> {
  readonly id: string;
  readonly kind: Kind;
  readonly amount: number;
  readonly animations: readonly ExpectedAnimation<'amount', number>[];
}

/** What masks a node: nothing, a shape, or an image, each in a box of the node (D75). */
type ExpectedMask =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'shape';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly geometry: ExpectedGeometry;
      readonly inverted: boolean;
      readonly feather: number;
      readonly animations: readonly (
        ExpectedAnimation<'geometry', ExpectedGeometry> | ExpectedAnimation<'feather', number>
      )[];
    }
  | {
      readonly kind: 'image';
      readonly assetId: string;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly mode: 'alpha' | 'luminance';
      readonly inverted: boolean;
      readonly feather: number;
      readonly animations: readonly ExpectedAnimation<'feather', number>[];
    };

/** Which sibling shape, if any, mattes a node (D75). */
type ExpectedMatte =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'node';
      readonly nodeId: string;
      readonly mode: 'alpha' | 'alpha-inverted' | 'luminance' | 'luminance-inverted';
    };

type ExpectedBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/** One effect of a CSS or an SVG filter, its parameters animated in its own list (D71, D72). */
type ExpectedEffect =
  | {
      readonly id: string;
      readonly kind: 'blur';
      readonly radius: number;
      readonly animations: readonly ExpectedAnimation<'radius', number>[];
    }
  | ExpectedAmountEffect<'brightness'>
  | ExpectedAmountEffect<'contrast'>
  | ExpectedAmountEffect<'saturate'>
  | ExpectedAmountEffect<'grayscale'>
  | ExpectedAmountEffect<'invert'>
  | ExpectedAmountEffect<'sepia'>
  | {
      readonly id: string;
      readonly kind: 'hue-rotate';
      readonly angle: number;
      readonly animations: readonly ExpectedAnimation<'angle', number>[];
    }
  | {
      readonly id: string;
      readonly kind: 'drop-shadow';
      readonly color: string;
      readonly opacity: number;
      readonly offset: ExpectedVec2;
      readonly blur: number;
      readonly animations: readonly (
        | ExpectedAnimation<'color', string>
        | ExpectedAnimation<'opacity', number>
        | ExpectedAnimation<'offset', ExpectedVec2>
        | ExpectedAnimation<'blur', number>
      )[];
    }
  | {
      readonly id: string;
      readonly kind: 'curves';
      readonly red: readonly number[];
      readonly green: readonly number[];
      readonly blue: readonly number[];
      readonly amount: number;
      readonly animations: readonly ExpectedAnimation<'amount', number>[];
    }
  | {
      readonly id: string;
      readonly kind: 'color-grade';
      readonly lift: number;
      readonly gamma: number;
      readonly gain: number;
      readonly temperature: number;
      readonly tint: number;
      readonly animations: readonly (
        | ExpectedAnimation<'lift', number>
        | ExpectedAnimation<'gamma', number>
        | ExpectedAnimation<'gain', number>
        | ExpectedAnimation<'temperature', number>
        | ExpectedAnimation<'tint', number>
      )[];
    }
  | {
      readonly id: string;
      readonly kind: 'glow';
      readonly color: string;
      readonly opacity: number;
      readonly radius: number;
      readonly animations: readonly (
        | ExpectedAnimation<'color', string>
        | ExpectedAnimation<'opacity', number>
        | ExpectedAnimation<'radius', number>
      )[];
    }
  | {
      readonly id: string;
      readonly kind: 'vignette';
      readonly amount: number;
      readonly size: number;
      readonly animations: readonly (
        ExpectedAnimation<'amount', number> | ExpectedAnimation<'size', number>
      )[];
    }
  | {
      readonly id: string;
      readonly kind: 'chroma-key';
      readonly key: 'green' | 'blue';
      readonly tolerance: number;
      readonly softness: number;
      readonly spill: number;
      readonly animations: readonly (
        | ExpectedAnimation<'tolerance', number>
        | ExpectedAnimation<'softness', number>
        | ExpectedAnimation<'spill', number>
      )[];
    };

/** Four insets in per mille (D68). */
interface ExpectedCrop {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

type ExpectedTransformAnimation =
  | ExpectedAnimation<'opacity', number>
  | ExpectedAnimation<'position', Vec2>
  | ExpectedAnimation<'scale', Vec2>
  | ExpectedAnimation<'rotation', number>
  | ExpectedAnimation<'origin', Vec2>;

type ExpectedColorAnimation = ExpectedAnimation<'color', string>;

type ExpectedPictureAnimation =
  | ExpectedTransformAnimation
  | ExpectedAnimation<'size', { readonly width: number; readonly height: number }>
  | ExpectedAnimation<'crop', ExpectedCrop>
  | ExpectedAnimation<'cornerRadius', number>;

type ExpectedPoint = { readonly x: number; readonly y: number };

type ExpectedPathCommand =
  | { readonly kind: 'move'; readonly x: number; readonly y: number }
  | { readonly kind: 'line'; readonly x: number; readonly y: number }
  | {
      readonly kind: 'cubic';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'quadratic';
      readonly x1: number;
      readonly y1: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'arc';
      readonly rx: number;
      readonly ry: number;
      readonly rotation: number;
      readonly largeArc: boolean;
      readonly sweep: boolean;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: 'close' };

/** The geometry of a shape (D73). */
type ExpectedGeometry =
  | { readonly kind: 'rect'; readonly cornerRadius: number }
  | { readonly kind: 'ellipse' }
  | { readonly kind: 'polygon'; readonly points: readonly ExpectedPoint[] }
  | {
      readonly kind: 'path';
      readonly fillRule: 'nonzero' | 'evenodd';
      readonly commands: readonly ExpectedPathCommand[];
    };

interface ExpectedStop {
  readonly offset: number;
  readonly color: string;
  readonly opacity: number;
}

/** The fill of a shape (D73). */
type ExpectedFill =
  | { readonly kind: 'none' }
  | { readonly kind: 'solid'; readonly color: string }
  | {
      readonly kind: 'linear-gradient';
      readonly start: ExpectedPoint;
      readonly end: ExpectedPoint;
      readonly stops: readonly ExpectedStop[];
    }
  | {
      readonly kind: 'radial-gradient';
      readonly center: ExpectedPoint;
      readonly radius: number;
      readonly stops: readonly ExpectedStop[];
    };

type ExpectedShapeAnimation =
  | ExpectedTransformAnimation
  | ExpectedAnimation<'size', { readonly width: number; readonly height: number }>
  | ExpectedAnimation<'fill', string>
  | ExpectedAnimation<'stroke/color', string>
  | ExpectedAnimation<'stroke/width', number>
  | ExpectedAnimation<'trim/start', number>
  | ExpectedAnimation<'trim/end', number>
  | ExpectedAnimation<'geometry', ExpectedGeometry>;

type ExpectedNodeAnimation =
  ExpectedPictureAnimation | ExpectedColorAnimation | ExpectedShapeAnimation;

/** The lifetime every node has since schema 0.2 (D42.1). */
interface ExpectedLifetime {
  readonly startUs: number;
  readonly durationUs: number;
}

interface ExpectedTransform<A = ExpectedTransformAnimation> extends ExpectedLifetime {
  readonly position: Vec2;
  readonly scale: Vec2;
  readonly rotation: number;
  readonly origin: Vec2;
  readonly opacity: number;
  readonly animations: readonly A[];
}

interface ExpectedBackgroundNode extends ExpectedLifetime {
  readonly id: string;
  readonly type: 'background';
  readonly color: string;
  readonly animations: readonly ExpectedColorAnimation[];
}

interface ExpectedImageNode extends ExpectedTransform<ExpectedPictureAnimation> {
  readonly id: string;
  readonly type: 'image';
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  readonly fit: 'fill' | 'contain' | 'cover';
  readonly focus: { readonly x: number; readonly y: number };
  readonly crop: ExpectedCrop;
  readonly cornerRadius: number;
  readonly effects: readonly ExpectedEffect[];
  readonly mask: ExpectedMask;
  readonly matte: ExpectedMatte;
  readonly blendMode: ExpectedBlendMode;
}

interface ExpectedVideoNode extends ExpectedTransform<ExpectedPictureAnimation> {
  readonly id: string;
  readonly type: 'video';
  readonly assetId: string;
  readonly sourceStartUs: number;
  readonly width: number;
  readonly height: number;
  readonly fit: 'fill' | 'contain' | 'cover';
  readonly focus: { readonly x: number; readonly y: number };
  readonly crop: ExpectedCrop;
  readonly cornerRadius: number;
  readonly volume: number;
  readonly effects: readonly ExpectedEffect[];
  readonly mask: ExpectedMask;
  readonly matte: ExpectedMatte;
  readonly blendMode: ExpectedBlendMode;
}

/** The style of a text (D69). */
interface ExpectedTextStyle {
  readonly stroke:
    | { readonly kind: 'none' }
    | { readonly kind: 'outside'; readonly color: string; readonly width: number };
  readonly shadow:
    | { readonly kind: 'none' }
    | {
        readonly kind: 'drop';
        readonly color: string;
        readonly opacity: number;
        readonly offset: Vec2;
        readonly blur: number;
      };
  readonly box:
    | { readonly kind: 'none' }
    | {
        readonly kind: 'solid';
        readonly color: string;
        readonly opacity: number;
        readonly padding: number;
        readonly cornerRadius: number;
      };
}

/** A track of a text animation: an animation without an ID (D69). */
type ExpectedTrack<Property extends string, Value> = Omit<ExpectedAnimation<Property, Value>, 'id'>;

type ExpectedFragmentTrack =
  | ExpectedTrack<'opacity', number>
  | ExpectedTrack<'offset', Vec2>
  | ExpectedTrack<'scale', Vec2>
  | ExpectedTrack<'rotation', number>
  | ExpectedTrack<'color', string>;

/** An animation of the fragments of a text (D69). */
interface ExpectedTextAnimation {
  readonly id: string;
  readonly unit: 'letter' | 'word' | 'line';
  readonly phase:
    | { readonly kind: 'in' }
    | { readonly kind: 'out' }
    | { readonly kind: 'accent'; readonly startUs: number };
  readonly staggerUs: number;
  readonly order:
    | { readonly kind: 'forward' }
    | { readonly kind: 'backward' }
    | { readonly kind: 'center' }
    | { readonly kind: 'edges' }
    | { readonly kind: 'random'; readonly seed: number };
  readonly tracks: readonly ExpectedFragmentTrack[];
}

interface ExpectedTextNode extends ExpectedTransform<
  ExpectedTransformAnimation | ExpectedColorAnimation
> {
  readonly id: string;
  readonly type: 'text';
  readonly text: string;
  readonly fontAssetId: string;
  readonly fontSize: number;
  readonly color: string;
  readonly style: ExpectedTextStyle;
  readonly textAnimations: readonly ExpectedTextAnimation[];
  readonly effects: readonly ExpectedEffect[];
  readonly mask: ExpectedMask;
  readonly matte: ExpectedMatte;
  readonly blendMode: ExpectedBlendMode;
}

interface ExpectedCustomHtmlNode extends ExpectedTransform {
  readonly id: string;
  readonly type: 'custom-html';
  readonly width: number;
  readonly height: number;
  readonly html: string;
}

/** A vector shape (D73). */
interface ExpectedShapeNode extends ExpectedTransform<ExpectedShapeAnimation> {
  readonly id: string;
  readonly type: 'shape';
  readonly width: number;
  readonly height: number;
  readonly geometry: ExpectedGeometry;
  readonly fill: ExpectedFill;
  readonly stroke: {
    readonly color: string;
    readonly width: number;
    readonly dash: readonly number[];
    readonly cap: 'butt' | 'round' | 'square';
    readonly join: 'miter' | 'round' | 'bevel';
  };
  readonly trim: { readonly start: number; readonly end: number };
  readonly effects: readonly ExpectedEffect[];
  readonly mask: ExpectedMask;
  readonly matte: ExpectedMatte;
  readonly blendMode: ExpectedBlendMode;
}

interface ExpectedGroupNode extends ExpectedTransform {
  readonly id: string;
  readonly type: 'group';
  readonly children: readonly (
    ExpectedImageNode | ExpectedTextNode | ExpectedVideoNode | ExpectedShapeNode
  )[];
  readonly effects: readonly ExpectedEffect[];
  readonly mask: ExpectedMask;
  readonly matte: ExpectedMatte;
  readonly blendMode: ExpectedBlendMode;
}

interface ExpectedCaptionWord {
  readonly text: string;
  readonly startUs: number;
  readonly durationUs: number;
}

/** What the word being spoken shows (D70). */
interface ExpectedCaptionHighlight {
  readonly color: string;
  readonly scale: number;
  readonly tracks: readonly ExpectedFragmentTrack[];
  readonly underline:
    | { readonly kind: 'none' }
    | {
        readonly kind: 'solid';
        readonly color: string;
        readonly thickness: number;
        readonly offset: number;
      };
  readonly box: ExpectedTextStyle['box'];
}

/** How every page enters or leaves (D70). */
type ExpectedPageAnimation =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'animate';
      readonly unit: 'word' | 'line';
      readonly staggerUs: number;
      readonly order: ExpectedTextAnimation['order'];
      readonly tracks: readonly ExpectedFragmentTrack[];
    };

interface ExpectedCaptionStyle {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly color: string;
  readonly highlight: ExpectedCaptionHighlight;
  readonly align: 'left' | 'center' | 'right';
  readonly verticalAlign: 'top' | 'middle' | 'bottom';
  readonly maxLineLength: number;
  readonly maxLines: number;
  readonly stroke: ExpectedTextStyle['stroke'];
  readonly shadow: ExpectedTextStyle['shadow'];
  readonly box: ExpectedTextStyle['box'];
  readonly pageIn: ExpectedPageAnimation;
  readonly pageOut: ExpectedPageAnimation;
}

interface ExpectedCaptionsNode extends ExpectedTransform<
  ExpectedTransformAnimation | ExpectedColorAnimation
> {
  readonly id: string;
  readonly type: 'captions';
  readonly fontAssetId: string;
  readonly width: number;
  readonly height: number;
  readonly style: ExpectedCaptionStyle;
  readonly words: readonly ExpectedCaptionWord[];
  readonly effects: readonly ExpectedEffect[];
  readonly mask: ExpectedMask;
  readonly matte: ExpectedMatte;
  readonly blendMode: ExpectedBlendMode;
}

type ExpectedSceneNode =
  | ExpectedBackgroundNode
  | ExpectedGroupNode
  | ExpectedImageNode
  | ExpectedTextNode
  | ExpectedCustomHtmlNode
  | ExpectedVideoNode
  | ExpectedCaptionsNode
  | ExpectedShapeNode;

interface ExpectedAsset {
  readonly id: string;
  readonly type: 'image' | 'audio' | 'font' | 'video' | 'svg';
  readonly contentHash: string;
}

interface ExpectedAudioClip {
  readonly id: string;
  readonly type: 'audio';
  readonly assetId: string;
  readonly startUs: number;
  readonly durationUs: number;
  readonly sourceStartUs: number;
  readonly volume: number;
  readonly fadeInUs: number;
  readonly fadeOutUs: number;
}

type ExpectedDirection = 'left' | 'right' | 'up' | 'down';

type ExpectedSceneTransitionEffect =
  | { readonly kind: 'crossfade' }
  | { readonly kind: 'fade-through-color'; readonly color: string }
  | { readonly kind: 'slide'; readonly direction: ExpectedDirection }
  | { readonly kind: 'wipe'; readonly direction: ExpectedDirection }
  | { readonly kind: 'push'; readonly direction: ExpectedDirection }
  | { readonly kind: 'zoom'; readonly fromScale: number }
  | { readonly kind: 'iris'; readonly center: { readonly x: number; readonly y: number } }
  | { readonly kind: 'blur-dissolve'; readonly radius: number };

interface ExpectedSceneTransition {
  readonly id: string;
  readonly fromSceneId: string;
  readonly toSceneId: string;
  readonly durationUs: number;
  readonly effect: ExpectedSceneTransitionEffect;
  readonly easing: ExpectedEasing;
}

interface ExpectedClipTransition {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly durationUs: number;
  readonly effect: ExpectedSceneTransitionEffect;
  readonly easing: ExpectedEasing;
}

interface ExpectedScene {
  readonly id: string;
  readonly durationUs: number;
  readonly nodes: readonly ExpectedSceneNode[];
  readonly clips: readonly ExpectedAudioClip[];
  readonly transitions: readonly ExpectedClipTransition[];
  readonly effects: readonly ExpectedEffect[];
}

type ExpectedField =
  | {
      readonly key: string;
      readonly type: 'text';
      readonly minLength: number;
      readonly maxLength: number;
    }
  | {
      readonly key: string;
      readonly type: 'number';
      readonly minimum: number;
      readonly maximum: number;
    }
  | { readonly key: string; readonly type: 'boolean' }
  | { readonly key: string; readonly type: 'color' }
  | { readonly key: string; readonly type: 'image' }
  | { readonly key: string; readonly type: 'video' }
  | { readonly key: string; readonly type: 'audio' };

type ExpectedFieldValue =
  | { readonly key: string; readonly type: 'text'; readonly value: string }
  | { readonly key: string; readonly type: 'number'; readonly value: number }
  | { readonly key: string; readonly type: 'boolean'; readonly value: boolean }
  | { readonly key: string; readonly type: 'color'; readonly value: string }
  | { readonly key: string; readonly type: 'image'; readonly value: string }
  | { readonly key: string; readonly type: 'video'; readonly value: string }
  | { readonly key: string; readonly type: 'audio'; readonly value: string };

type ExpectedInput =
  | {
      readonly id: string;
      readonly type: 'text';
      readonly minLength: number;
      readonly maxLength: number;
      readonly default: string;
    }
  | {
      readonly id: string;
      readonly type: 'number';
      readonly minimum: number;
      readonly maximum: number;
      readonly default: number;
    }
  | { readonly id: string; readonly type: 'boolean'; readonly default: boolean }
  | { readonly id: string; readonly type: 'color'; readonly default: string }
  | { readonly id: string; readonly type: 'image'; readonly default: string }
  | { readonly id: string; readonly type: 'video'; readonly default: string }
  | { readonly id: string; readonly type: 'audio'; readonly default: string }
  | {
      readonly id: string;
      readonly type: 'list';
      readonly minItems: number;
      readonly maxItems: number;
      readonly fields: readonly ExpectedField[];
      readonly default: readonly (readonly ExpectedFieldValue[])[];
    };

type ExpectedBinding =
  | {
      readonly id: string;
      readonly kind: 'property';
      readonly nodeId: string;
      readonly property: 'text' | 'color';
      readonly inputId: string;
    }
  | { readonly id: string; readonly kind: 'placeholders'; readonly nodeId: string }
  | {
      readonly id: string;
      readonly kind: 'asset';
      readonly assetId: string;
      readonly inputId: string;
    }
  | {
      readonly id: string;
      readonly kind: 'item-property';
      readonly nodeId: string;
      readonly property: 'text' | 'color';
      readonly inputId: string;
      readonly key: string;
    }
  | {
      readonly id: string;
      readonly kind: 'item-asset';
      readonly assetId: string;
      readonly inputId: string;
      readonly key: string;
    };

interface ExpectedTest<T extends string> {
  readonly id: string;
  readonly test: T;
  readonly targetId: string;
  readonly inputId: string;
}

type ExpectedCondition =
  | ExpectedTest<'empty'>
  | ExpectedTest<'not-empty'>
  | ExpectedTest<'true'>
  | ExpectedTest<'false'>
  | {
      readonly id: string;
      readonly test: 'equal-text';
      readonly targetId: string;
      readonly inputId: string;
      readonly value: string;
    }
  | {
      readonly id: string;
      readonly test: 'equal-number';
      readonly targetId: string;
      readonly inputId: string;
      readonly value: number;
    };

type ExpectedRepeat =
  | {
      readonly id: string;
      readonly duration: 'target';
      readonly targetId: string;
      readonly inputId: string;
    }
  | {
      readonly id: string;
      readonly duration: 'field';
      readonly targetId: string;
      readonly inputId: string;
      readonly key: string;
    };

interface ExpectedTemplate {
  readonly inputs: readonly ExpectedInput[];
  readonly bindings: readonly ExpectedBinding[];
  readonly conditions: readonly ExpectedCondition[];
  readonly repeats: readonly ExpectedRepeat[];
}

interface ExpectedComposition {
  readonly schemaVersion: '0.20';
  readonly width: number;
  readonly height: number;
  readonly safeArea: {
    readonly fromTop: number;
    readonly fromRight: number;
    readonly fromBottom: number;
    readonly fromLeft: number;
  };
  readonly fps: number;
  readonly durationUs: number;
  readonly assets: readonly ExpectedAsset[];
  readonly scenes: readonly ExpectedScene[];
  readonly clips: readonly ExpectedAudioClip[];
  readonly transitions: readonly ExpectedSceneTransition[];
  readonly template: ExpectedTemplate;
}

describe('types derived from the JSON Schema', () => {
  it('equal the hand-written expectations', () => {
    expectTypeOf<Composition>().toEqualTypeOf<ExpectedComposition>();
    expectTypeOf<Asset>().toEqualTypeOf<ExpectedAsset>();
    expectTypeOf<Scene>().toEqualTypeOf<ExpectedScene>();
    expectTypeOf<SceneNode>().toEqualTypeOf<ExpectedSceneNode>();
    expectTypeOf<BackgroundNode>().toEqualTypeOf<ExpectedBackgroundNode>();
    expectTypeOf<GroupNode>().toEqualTypeOf<ExpectedGroupNode>();
    expectTypeOf<ImageNode>().toEqualTypeOf<ExpectedImageNode>();
    expectTypeOf<TextNode>().toEqualTypeOf<ExpectedTextNode>();
    expectTypeOf<TextStyle>().toEqualTypeOf<ExpectedTextStyle>();
    expectTypeOf<TextAnimation>().toEqualTypeOf<ExpectedTextAnimation>();
    expectTypeOf<FragmentTrack>().toEqualTypeOf<ExpectedFragmentTrack>();
    expectTypeOf<CustomHtmlNode>().toEqualTypeOf<ExpectedCustomHtmlNode>();
    expectTypeOf<VideoNode>().toEqualTypeOf<ExpectedVideoNode>();
    expectTypeOf<CaptionsNode>().toEqualTypeOf<ExpectedCaptionsNode>();
    expectTypeOf<CaptionWord>().toEqualTypeOf<ExpectedCaptionWord>();
    expectTypeOf<CaptionStyle>().toEqualTypeOf<ExpectedCaptionStyle>();
    expectTypeOf<CaptionHighlight>().toEqualTypeOf<ExpectedCaptionHighlight>();
    expectTypeOf<CaptionPageAnimation>().toEqualTypeOf<ExpectedPageAnimation>();
    expectTypeOf<SafeArea>().toEqualTypeOf<ExpectedComposition['safeArea']>();
    expectTypeOf<NodeAnimation>().toEqualTypeOf<ExpectedNodeAnimation>();
    expectTypeOf<Easing>().toEqualTypeOf<ExpectedEasing>();
    expectTypeOf<AnimationKeyframe>().toEqualTypeOf<ExpectedNodeAnimation['keyframes'][number]>();
    expectTypeOf<AudioClip>().toEqualTypeOf<ExpectedAudioClip>();
    expectTypeOf<SceneTransition>().toEqualTypeOf<ExpectedSceneTransition>();
    expectTypeOf<ClipTransition>().toEqualTypeOf<ExpectedClipTransition>();
    expectTypeOf<TransitionDirection>().toEqualTypeOf<ExpectedDirection>();
    expectTypeOf<Template>().toEqualTypeOf<ExpectedTemplate>();
    expectTypeOf<TemplateInput>().toEqualTypeOf<ExpectedInput>();
    expectTypeOf<TemplateField>().toEqualTypeOf<ExpectedField>();
    expectTypeOf<TemplateFieldValue>().toEqualTypeOf<ExpectedFieldValue>();
    expectTypeOf<TemplateBinding>().toEqualTypeOf<ExpectedBinding>();
    expectTypeOf<TemplateCondition>().toEqualTypeOf<ExpectedCondition>();
    expectTypeOf<TemplateRepeat>().toEqualTypeOf<ExpectedRepeat>();
    expectTypeOf<Effect>().toEqualTypeOf<ExpectedEffect>();
    expectTypeOf<ShapeNode>().toEqualTypeOf<ExpectedShapeNode>();
    expectTypeOf<ShapeGeometry>().toEqualTypeOf<ExpectedGeometry>();
    expectTypeOf<PathCommand>().toEqualTypeOf<ExpectedPathCommand>();
    expectTypeOf<ShapeFill>().toEqualTypeOf<ExpectedFill>();
    expectTypeOf<Mask>().toEqualTypeOf<ExpectedMask>();
    expectTypeOf<Matte>().toEqualTypeOf<ExpectedMatte>();
    expectTypeOf<BlendMode>().toEqualTypeOf<ExpectedBlendMode>();
  });

  it('narrow by their discriminators', () => {
    expectTypeOf<Extract<SceneNode, { type: 'text' }>>().toEqualTypeOf<TextNode>();
    expectTypeOf<
      Extract<NodeAnimation, { property: 'opacity' }>['keyframes'][number]['value']
    >().toBeNumber();
  });

  it('are neither any nor never', () => {
    expectTypeOf<Composition>().not.toBeAny();
    expectTypeOf<Composition>().not.toBeNever();
    expectTypeOf<SceneNode>().not.toBeNever();
    expectTypeOf<ValidatedComposition>().not.toBeAny();
    expectTypeOf<ValidatedComposition>().not.toBeNever();
  });
});

describe('the brand of a validated composition (specification Q17)', () => {
  it('is what validateComposition returns', () => {
    type Accepted = Extract<ValidationResult, { ok: true }>['composition'];
    expectTypeOf<Accepted>().toEqualTypeOf<ValidatedComposition>();
  });

  it('can be read as a plain composition, but a plain composition is not validated', () => {
    expectTypeOf<ValidatedComposition>().toExtend<Composition>();
    expectTypeOf<Composition>().not.toExtend<ValidatedComposition>();
  });

  it('does not survive an edited copy, which has to be validated again', () => {
    // What a command does to a document: a spread copy with one field replaced.
    // `no-misused-spread` flags the spread of a branded value, which is a welcome
    // second warning for real code; here the spread is the subject of the test.
    const editedCopy = (composition: ValidatedComposition) => ({
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...composition,
      durationUs: 1,
    });
    expectTypeOf(editedCopy).returns.toExtend<Composition>();
    expectTypeOf(editedCopy).returns.not.toExtend<ValidatedComposition>();
  });

  it('fails closed under Readonly and Object.freeze', () => {
    expectTypeOf<Readonly<ValidatedComposition>>().not.toExtend<ValidatedComposition>();
  });
});
