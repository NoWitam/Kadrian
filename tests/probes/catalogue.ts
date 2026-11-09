/**
 * The candidate primitives of phase five (PR-45, D65), each a small change of
 * the render page's DOM: CSS declarations on the element of one node, SVG
 * definitions that those declarations refer to, an underlay or an overlay
 * beside it, or a shape of its own. Nothing here enters a package: the probes
 * measure what the pinned Chromium does with a feature before any schema field
 * maps to it.
 */

/** The nodes of the probe composition, and the shape the probes add themselves. */
export type Subject = 'image' | 'text' | 'video' | 'shape';

export const VISUAL: readonly Subject[] = ['image', 'text', 'video'];

export interface Probe {
  /** A stable ID of the row; the record is keyed by `id` and subject. */
  readonly id: string;
  /** The family of the probe, as the classification of D65 names it. */
  readonly group:
    | 'baseline'
    | 'transform'
    | 'transform-list'
    | 'picture'
    | 'css-filter'
    | 'css-filter-neutral'
    | 'svg-filter'
    | 'blend'
    | 'mask'
    | 'clip'
    | 'backdrop'
    | 'text'
    | 'fragments'
    | 'shape'
    | 'gradient';
  readonly subjects: readonly Subject[];
  /** Declarations written on the subject's element. */
  readonly css?: Readonly<Record<string, string>>;
  /**
   * The part of the subject's `transform` after its translation to the
   * position, written in place of the renderer's `scale(…)`: the transform
   * list of D68 with its pivot and rotation, at the subject's own position.
   */
  readonly transformList?: string;
  /** SVG markup of `<defs>` content that `css` refers to by `url(#…)`. */
  readonly defs?: string;
  /** Whether a striped, multicoloured underlay is put below the subject (blend modes). */
  readonly underlay?: boolean;
  /** Declarations of an overlay over the right half of the subject (backdrop filters). */
  readonly overlay?: Readonly<Record<string, string>>;
  /** The inner markup of the probe's own SVG shape (subject `shape`). */
  readonly shape?: string;
  /**
   * The text split into one element per letter (code point here: the fixture
   * text is ASCII), each with the declarations of its index, cycled.
   */
  readonly fragments?: readonly Readonly<Record<string, string>>[];
}

const filter = (id: string, value: string): Probe => ({
  id: `css-filter/${id}`,
  group: 'css-filter',
  subjects: VISUAL,
  css: { filter: value },
});

const neutral = (id: string, value: string): Probe => ({
  id: `css-filter-neutral/${id}`,
  group: 'css-filter-neutral',
  subjects: VISUAL,
  css: { filter: value },
});

const svgFilter = (id: string, primitives: string, space = 'sRGB'): Probe => ({
  id: `svg-filter/${id}`,
  group: 'svg-filter',
  subjects: VISUAL,
  css: { filter: 'url(#kadrion-probe-filter)' },
  defs: `<filter id="kadrion-probe-filter" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="${space}">${primitives}</filter>`,
});

const blend = (mode: string): Probe => ({
  id: `blend/${mode}`,
  group: 'blend',
  subjects: VISUAL,
  css: { 'mix-blend-mode': mode },
  underlay: true,
});

/** A path of 1000 units, so that dashes and offsets are fractions of its length without measuring. */
const STAR_PATH =
  'M 300 20 L 366 210 L 570 210 L 405 330 L 470 520 L 300 400 L 130 520 L 195 330 L 30 210 L 234 210 Z';

const stroked = (offset: string, cap: 'round' | 'butt' = 'round'): Probe => ({
  id: `shape/trim-${offset}${cap === 'round' ? '' : `-${cap}`}`,
  group: 'shape',
  subjects: ['shape'],
  shape: `<path d="${STAR_PATH}" pathLength="1000" fill="none" stroke="#f79009" stroke-width="18" stroke-linejoin="round" stroke-linecap="${cap}" stroke-dasharray="1000 1000" stroke-dashoffset="${offset}"/>`,
});

export const PROBES: readonly Probe[] = [
  { id: 'baseline/none', group: 'baseline', subjects: [...VISUAL, 'shape'] },

  // Rotation and origin (PR-48). The renderer writes `transform`; the individual
  // `rotate` property composes after it, about `transform-origin`.
  { id: 'transform/rotate-15', group: 'transform', subjects: VISUAL, css: { rotate: '15deg' } },
  {
    id: 'transform/rotate-33.3',
    group: 'transform',
    subjects: VISUAL,
    css: { rotate: '33.3deg' },
  },
  {
    id: 'transform/rotate-neg-90',
    group: 'transform',
    subjects: VISUAL,
    css: { rotate: '-90deg' },
  },
  { id: 'transform/rotate-720', group: 'transform', subjects: VISUAL, css: { rotate: '720deg' } },
  {
    id: 'transform/origin-center-rotate-45',
    group: 'transform',
    subjects: VISUAL,
    css: { 'transform-origin': '50% 50%', rotate: '45deg' },
  },
  {
    id: 'transform/origin-250-750-rotate-12.5',
    group: 'transform',
    subjects: VISUAL,
    css: { 'transform-origin': '25% 75%', rotate: '12.5deg' },
  },
  {
    id: 'transform/origin-center-scale-1.37',
    group: 'transform',
    subjects: VISUAL,
    css: { 'transform-origin': '50% 50%', scale: '1.37' },
  },
  {
    id: 'transform/corner-radius-48',
    group: 'transform',
    subjects: VISUAL,
    css: { 'border-radius': '48px', overflow: 'hidden' },
  },

  // The transform list that the renderer writes for a rotation about an origin
  // (PR-48, D68): translate to the position, to the origin, rotate, scale, and
  // back from the origin, in per cent of the box, with transform-origin 0 0.
  ...(
    [
      [
        'pivot-500-500-rotate-45',
        'translate(50%, 50%) rotate(45deg) scale(1, 1) translate(-50%, -50%)',
      ],
      [
        'pivot-250-750-rotate-12.5-scale-1.37',
        'translate(25%, 75%) rotate(12.5deg) scale(1.37, 1.37) translate(-25%, -75%)',
      ],
      [
        'pivot-0-1000-rotate-neg-8',
        'translate(0%, 100%) rotate(-8deg) scale(1, 1) translate(0%, -100%)',
      ],
      ['rotate-33.3', 'rotate(33.3deg) scale(1, 1)'],
      ['rotate-720', 'rotate(720deg) scale(1, 1)'],
      // At rest: a pivot without rotation or scale, and a rotation of 0, must be no change.
      ['pivot-500-500-neutral', 'translate(50%, 50%) scale(1, 1) translate(-50%, -50%)'],
      ['rotate-0-neutral', 'rotate(0deg) scale(1, 1)'],
    ] as const
  ).map(([id, list]): Probe => ({
    id: `transform-list/${id}`,
    group: 'transform-list',
    subjects: VISUAL,
    transformList: list,
  })),

  // The picture of an image or a video (PR-48, D68): the crop as the view box
  // of the picture, before object-fit and object-position, the corner radius
  // without overflow, and a fractional size while animated.
  ...(
    [
      ['view-box-neutral', { 'object-view-box': 'inset(0% 0% 0% 0%)' }],
      ['view-box-crop', { 'object-view-box': 'inset(10% 25% 5% 0%)' }],
      ['view-box-fractional', { 'object-view-box': 'inset(12.5% 0.1% 33.3% 7.25%)' }],
      [
        'view-box-cover-focus',
        {
          'object-fit': 'cover',
          'object-position': '30% 70%',
          'object-view-box': 'inset(0% 25% 0% 25%)',
        },
      ],
      ['view-box-contain', { 'object-fit': 'contain', 'object-view-box': 'inset(20% 0% 0% 10%)' }],
      ['border-radius-0-neutral', { 'border-radius': '0px' }],
      ['border-radius-48', { 'border-radius': '48px' }],
      ['border-radius-12.5', { 'border-radius': '12.5px' }],
      [
        'border-radius-crop',
        { 'border-radius': '400px', 'object-view-box': 'inset(0% 25% 0% 25%)' },
      ],
      ['size-fractional', { width: '333.3px', height: '187.5px' }],
    ] as const
  ).map(([id, css]): Probe => ({
    id: `picture/${id}`,
    group: 'picture',
    subjects: ['image', 'video'],
    css,
  })),

  // CSS filters (PR-51a), each at a working value.
  filter('blur-4', 'blur(4px)'),
  filter('blur-12.5', 'blur(12.5px)'),
  filter('brightness-1.4', 'brightness(1.4)'),
  filter('brightness-0.6', 'brightness(0.6)'),
  filter('contrast-1.5', 'contrast(1.5)'),
  filter('contrast-0.5', 'contrast(0.5)'),
  filter('saturate-0.3', 'saturate(0.3)'),
  filter('saturate-2', 'saturate(2)'),
  filter('hue-rotate-90', 'hue-rotate(90deg)'),
  filter('hue-rotate-33.3', 'hue-rotate(33.3deg)'),
  filter('grayscale-1', 'grayscale(1)'),
  filter('grayscale-0.5', 'grayscale(0.5)'),
  filter('invert-1', 'invert(1)'),
  filter('invert-0.35', 'invert(0.35)'),
  filter('sepia-0.8', 'sepia(0.8)'),
  filter('opacity-0.5', 'opacity(0.5)'),
  filter('drop-shadow', 'drop-shadow(8px 8px 6px rgba(0, 0, 0, 0.6))'),
  filter('chain', 'brightness(1.2) contrast(1.3) saturate(0.7) blur(2px)'),

  // The same filters at their neutral values: an effect at rest must be no effect.
  neutral('blur-0', 'blur(0px)'),
  neutral('brightness-1', 'brightness(1)'),
  neutral('contrast-1', 'contrast(1)'),
  neutral('saturate-1', 'saturate(1)'),
  neutral('hue-rotate-0', 'hue-rotate(0deg)'),
  neutral('grayscale-0', 'grayscale(0)'),
  neutral('invert-0', 'invert(0)'),
  neutral('sepia-0', 'sepia(0)'),
  neutral('opacity-1', 'opacity(1)'),
  neutral('drop-shadow-0', 'drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))'),

  // SVG filters (PR-51b), in sRGB and, where colour arithmetic matters, linearRGB.
  svgFilter('gaussian-blur-4', '<feGaussianBlur stdDeviation="4"/>'),
  svgFilter('gaussian-blur-4-linear', '<feGaussianBlur stdDeviation="4"/>', 'linearRGB'),
  svgFilter('color-matrix-saturate-0.3', '<feColorMatrix type="saturate" values="0.3"/>'),
  svgFilter(
    'color-matrix-lift-gain',
    '<feColorMatrix type="matrix" values="1.15 0 0 0 0.04  0 1.05 0 0 0.02  0 0 0.9 0 0  0 0 0 1 0"/>',
  ),
  svgFilter(
    'color-matrix-lift-gain-linear',
    '<feColorMatrix type="matrix" values="1.15 0 0 0 0.04  0 1.05 0 0 0.02  0 0 0.9 0 0  0 0 0 1 0"/>',
    'linearRGB',
  ),
  svgFilter(
    'component-transfer-curves',
    '<feComponentTransfer><feFuncR type="table" tableValues="0 0.2 0.6 0.9 1"/><feFuncG type="table" tableValues="0 0.3 0.7 1"/><feFuncB type="gamma" amplitude="1" exponent="1.4" offset="0"/></feComponentTransfer>',
  ),
  svgFilter('morphology-dilate-2', '<feMorphology operator="dilate" radius="2"/>'),
  svgFilter('morphology-erode-2', '<feMorphology operator="erode" radius="2"/>'),
  svgFilter(
    'glow',
    '<feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b"/><feFlood flood-color="#f79009" flood-opacity="0.9"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>',
  ),
  svgFilter(
    'chroma-key-channel-difference',
    '<feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  1 -2 1 0 1" result="k"/><feComponentTransfer in="k"><feFuncA type="linear" slope="3" intercept="-0.5"/></feComponentTransfer>',
  ),
  svgFilter('identity', '<feColorMatrix type="identity"/>'),
  // The primitives the kinds of D72 add to the ones above: an arithmetic mix
  // (the amount of curves), a gamma on the colour of a matrix (color-grade),
  // light from a point over a flat surface in the units of the box (vignette),
  // and the matte and spill of a key by channel difference (chroma-key).
  svgFilter(
    'curves-amount-arithmetic',
    '<feComponentTransfer result="c"><feFuncR type="table" tableValues="0 0.2 0.6 0.9 1"/><feFuncG type="table" tableValues="1 0"/><feFuncB type="table" tableValues="0.1 0.4 0.9"/></feComponentTransfer><feComposite in="c" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.4" k3="0.6" k4="0"/>',
  ),
  svgFilter(
    'color-grade-matrix-gamma',
    '<feColorMatrix type="matrix" values="1.25 0 0 0 0.1  0 1.0 0 0 0.1  0 0 0.75 0 0.1  0 0 0 1 0"/><feComponentTransfer><feFuncR type="gamma" amplitude="1" exponent="0.7142857142857143" offset="0"/><feFuncG type="gamma" amplitude="1" exponent="0.7142857142857143" offset="0"/><feFuncB type="gamma" amplitude="1" exponent="0.7142857142857143" offset="0"/></feComponentTransfer>',
  ),
  {
    id: 'svg-filter/vignette-point-light',
    group: 'svg-filter',
    subjects: VISUAL,
    css: { filter: 'url(#kadrion-probe-filter)' },
    defs: '<filter id="kadrion-probe-filter" filterUnits="userSpaceOnUse" x="-4000000" y="-4000000" width="8000000" height="8000000" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB"><feFlood flood-color="#ffffff" result="outside"/><feFlood flood-color="#ffffff" x="0" y="0" width="1" height="1" result="flat"/><feDiffuseLighting in="flat" surfaceScale="0" diffuseConstant="1" lighting-color="#ffffff" result="light"><fePointLight x="0.5" y="0.5" z="0.4"/></feDiffuseLighting><feComponentTransfer in="light" result="shade"><feFuncR type="gamma" amplitude="0.8" exponent="4" offset="0.2"/><feFuncG type="gamma" amplitude="0.8" exponent="4" offset="0.2"/><feFuncB type="gamma" amplitude="0.8" exponent="4" offset="0.2"/></feComponentTransfer><feMerge result="mask"><feMergeNode in="outside"/><feMergeNode in="shade"/></feMerge><feComposite in="SourceGraphic" in2="mask" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/></filter>',
  },
  svgFilter(
    'chroma-key-matte-spill',
    '<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.5 1 -0.5 0 0" result="d"/><feComponentTransfer in="d" result="matte"><feFuncA type="linear" slope="-5" intercept="1.5"/></feComponentTransfer><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1  0.25 -0.5 0.25 0 1  0 0 0 0 1  0 0 0 0 1" result="factor"/><feComposite in="SourceGraphic" in2="factor" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="despilled"/><feComposite in="despilled" in2="matte" operator="in"/>',
  ),

  // Blend modes (PR-54) over a striped underlay.
  ...[
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'hard-light',
    'soft-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity',
  ].map(blend),

  // Masks (PR-54): CSS gradients in alpha and luminance mode, and an SVG mask.
  {
    id: 'mask/alpha-linear',
    group: 'mask',
    subjects: VISUAL,
    css: { 'mask-image': 'linear-gradient(to right, #000000 20%, rgba(0, 0, 0, 0) 80%)' },
  },
  {
    id: 'mask/alpha-radial-feather',
    group: 'mask',
    subjects: VISUAL,
    css: {
      'mask-image': 'radial-gradient(circle at 50% 50%, #000000 30%, rgba(0, 0, 0, 0) 60%)',
    },
  },
  {
    id: 'mask/luminance-linear',
    group: 'mask',
    subjects: VISUAL,
    css: {
      'mask-image': 'linear-gradient(to bottom, #ffffff, #000000)',
      'mask-mode': 'luminance',
    },
  },
  {
    id: 'mask/svg-luminance',
    group: 'mask',
    subjects: VISUAL,
    css: { mask: 'url(#kadrion-probe-mask)' },
    defs: '<mask id="kadrion-probe-mask" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="#404040"/><circle cx="0.5" cy="0.5" r="0.35" fill="#ffffff"/></mask>',
  },

  // Clipping (PR-46 wipes and iris, PR-54 shape masks).
  {
    id: 'clip/path-star',
    group: 'clip',
    subjects: VISUAL,
    css: {
      'clip-path':
        "path('M 100 0 L 122 70 L 195 70 L 136 112 L 158 182 L 100 140 L 42 182 L 64 112 L 5 70 L 78 70 Z')",
    },
  },
  {
    id: 'clip/circle-iris',
    group: 'clip',
    subjects: VISUAL,
    css: { 'clip-path': 'circle(37.5% at 40% 55%)' },
  },
  {
    id: 'clip/inset-round',
    group: 'clip',
    subjects: VISUAL,
    css: { 'clip-path': 'inset(10% 15% 12.5% 5% round 24px)' },
  },
  {
    id: 'clip/polygon',
    group: 'clip',
    subjects: VISUAL,
    css: { 'clip-path': 'polygon(0% 0%, 100% 10%, 85% 100%, 10% 85%)' },
  },

  // An adjustment layer (PR-51a): a backdrop filter over the right half.
  {
    id: 'backdrop/blur-6',
    group: 'backdrop',
    subjects: VISUAL,
    overlay: { 'backdrop-filter': 'blur(6px)' },
  },
  {
    id: 'backdrop/grayscale-1',
    group: 'backdrop',
    subjects: VISUAL,
    overlay: { 'backdrop-filter': 'grayscale(1)' },
  },

  // Text styles (PR-49): stroke, its paint order, and shadows on HTML text.
  {
    id: 'text/stroke-4',
    group: 'text',
    subjects: ['text'],
    css: { '-webkit-text-stroke': '4px #f04438' },
  },
  {
    id: 'text/stroke-6-paint-order',
    group: 'text',
    subjects: ['text'],
    css: { '-webkit-text-stroke': '6px #f04438', 'paint-order': 'stroke fill' },
  },
  {
    id: 'text/shadow-hard',
    group: 'text',
    subjects: ['text'],
    css: { 'text-shadow': '6px 6px 0px #000000' },
  },
  {
    id: 'text/shadow-soft',
    group: 'text',
    subjects: ['text'],
    css: { 'text-shadow': '4px 4px 8px rgba(0, 0, 0, 0.7)' },
  },

  // Text in fragments (PR-49): split at rest, and in mid-stagger.
  {
    id: 'fragments/letters-inline-at-rest',
    group: 'fragments',
    subjects: ['text'],
    fragments: [{}],
  },
  {
    id: 'fragments/letters-inline-block-at-rest',
    group: 'fragments',
    subjects: ['text'],
    fragments: [{ display: 'inline-block' }],
  },
  {
    id: 'fragments/letters-staggered',
    group: 'fragments',
    subjects: ['text'],
    fragments: [
      { display: 'inline-block', opacity: '1' },
      { display: 'inline-block', opacity: '0.8', translate: '0px -12.5px', rotate: '-4deg' },
      { display: 'inline-block', opacity: '0.6', translate: '0px -25px', rotate: '-8deg' },
      { display: 'inline-block', opacity: '0.4', translate: '0px -37.5px', rotate: '-12deg' },
      { display: 'inline-block', opacity: '0.2', translate: '0px -50px', scale: '0.8' },
      { display: 'inline-block', opacity: '0' },
    ],
  },

  // Shapes (PR-52): a stroke drawn on by `pathLength`, and gradient fills (question 9).
  stroked('0'),
  stroked('250'),
  stroked('731.5'),
  stroked('1000'),
  stroked('1000', 'butt'),
  stroked('250', 'butt'),
  {
    id: 'gradient/svg-linear',
    group: 'gradient',
    subjects: ['shape'],
    shape: `<defs><linearGradient id="kadrion-probe-linear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a5af8"/><stop offset="0.5" stop-color="#ee46bc"/><stop offset="1" stop-color="#fdb022"/></linearGradient></defs><path d="${STAR_PATH}" fill="url(#kadrion-probe-linear)"/>`,
  },
  {
    id: 'gradient/svg-radial',
    group: 'gradient',
    subjects: ['shape'],
    shape: `<defs><radialGradient id="kadrion-probe-radial" cx="0.4" cy="0.45" r="0.6"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#155eef"/></radialGradient></defs><rect x="20" y="20" width="560" height="360" rx="40" fill="url(#kadrion-probe-radial)"/>`,
  },
  // The primitives of D73 beyond trims and box gradients: absolute curves and
  // arcs under the even-odd rule, dash patterns over a path length with each
  // cap and join, and gradients in the pixels of the shape with stop opacity.
  {
    id: 'shape/path-curves-arcs-evenodd',
    group: 'shape',
    subjects: ['shape'],
    shape: `<path fill-rule="evenodd" d="M 40 200 C 120 20 220 20 300 200 Q 400 380 500 200 A 60 60 0 0 1 500 360 L 40 360 Z M 120 240 L 220 240 L 220 320 L 120 320 Z" fill="#2e90fa" stroke="#ffffff" stroke-width="6" stroke-linecap="butt" stroke-linejoin="bevel" stroke-miterlimit="4"/>`,
  },
  ...(
    [
      ['butt', 'miter', '60 30', '0'],
      ['square', 'miter', '10 10 40 10', '-120'],
      ['round', 'round', '250 100 10 640', '-37.5'],
    ] as const
  ).map(([cap, join, dashes, offset]): Probe => ({
    id: `shape/dash-${cap}-${join}`,
    group: 'shape',
    subjects: ['shape'],
    shape: `<path d="${STAR_PATH}" pathLength="1000" fill="none" stroke="#f79009" stroke-width="14" stroke-linecap="${cap}" stroke-linejoin="${join}" stroke-miterlimit="4" stroke-dasharray="${dashes}" stroke-dashoffset="${offset}"/>`,
  })),
  {
    id: 'gradient/svg-user-space',
    group: 'gradient',
    subjects: ['shape'],
    shape: `<defs><linearGradient id="kadrion-probe-user" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="400"><stop offset="0" stop-color="#7a5af8" stop-opacity="1"/><stop offset="0.5" stop-color="#ee46bc" stop-opacity="1"/><stop offset="1" stop-color="#fdb022" stop-opacity="0.6"/></linearGradient><radialGradient id="kadrion-probe-user-radial" gradientUnits="userSpaceOnUse" cx="300" cy="200" r="160"><stop offset="0" stop-color="#ffffff" stop-opacity="0.8"/><stop offset="1" stop-color="#155eef" stop-opacity="1"/></radialGradient></defs><path d="${STAR_PATH}" fill="url(#kadrion-probe-user)"/><path d="M 380 200 A 80 80 0 0 1 220 200 A 80 80 0 0 1 380 200 Z" fill="url(#kadrion-probe-user-radial)"/>`,
  },
  {
    id: 'gradient/css-linear',
    group: 'gradient',
    subjects: ['image', 'text', 'video'],
    underlay: true,
    css: { opacity: '0' },
  },
];
