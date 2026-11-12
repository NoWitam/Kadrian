/**
 * The showcases of the playground (D32.1): data only. Each one names the JSON
 * the page loads, where that JSON lives in the repository, the node the grip
 * drags, an example call of a tool of the AI catalogue (D46), and, for a
 * template, the values the page instantiates it with (D58, D59). The feature
 * labels are text for a reader; nothing branches on them. `tests/repo/showcases.test.ts` keeps every
 * entry valid, so a schema change forces the showcases to follow (D32.8).
 */

/** A tool call as a model would send it: the name and the arguments (D31.1). */
export interface ShowcaseToolCall {
  readonly name: string;
  readonly arguments: unknown;
}

export interface Showcase {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** What the showcase demonstrates, as labels for a reader (proofs, decisions). */
  readonly features: readonly string[];
  /** The URL of the built JSON the page fetches and shows. */
  readonly url: string;
  /** The repository path of the source of that JSON. */
  readonly sourceFile: string;
  /** A top-level node with a position and no position animation, or null (D32.4). */
  readonly dragNodeId: string | null;
  /** A call of a tool of `TOOL_CATALOGUE` that changes this document (D32.5, D46). */
  readonly toolCall: ShowcaseToolCall;
  /**
   * For a template: values to instantiate it with, other than its defaults,
   * which the page offers next to the preview of the defaults (D58.4). Null
   * for a document that is not a template.
   */
  readonly templateValues: unknown;
}

export const SHOWCASES: readonly Showcase[] = [
  {
    id: 'reference',
    title: 'Reference composition',
    description:
      'The spike reference: 1080x1920, 30 fps, 10 s. Background, image, two texts, a group, opacity/position/scale keyframes, a sandboxed Custom HTML progress bar (shown when "Run Custom HTML" is on, D36), and an audio clip. Drag the title or undo/redo (P3).',
    features: ['P1', 'P3', 'P4', 'D16', 'D23', 'D30'],
    url: '/pkg/test-fixtures/compositions/reference.json',
    sourceFile: 'packages/test-fixtures/src/compositions/reference.json',
    dragNodeId: 'node-title',
    toolCall: {
      name: 'set_node_position',
      arguments: { nodeId: 'node-title', position: { x: 190, y: 360 } },
    },
    templateValues: null,
  },
  {
    id: 'keyframes',
    title: 'Keyframes',
    description:
      'One text per animated property: opacity with three keyframes, a position offset that moves right and then down, and a scale from 0.5 to 2.5. Every segment has the easing linear (D18, D67).',
    features: ['D16', 'D18', 'D19', 'D67'],
    url: '/app/showcases/keyframes.json',
    sourceFile: 'apps/playground/src/showcases/keyframes.json',
    dragNodeId: 'node-heading',
    toolCall: {
      name: 'set_node_position',
      arguments: { nodeId: 'node-heading', position: { x: 300.5, y: 140 } },
    },
    templateValues: null,
  },
  {
    id: 'group',
    title: 'Group transform',
    description:
      "A group scales and fades in; its children — an image and a caption with its own position animation — follow the group's transform. Children positions are relative to the group.",
    features: ['D15', 'D16', 'D22'],
    url: '/app/showcases/group.json',
    sourceFile: 'apps/playground/src/showcases/group.json',
    dragNodeId: 'node-title',
    toolCall: {
      name: 'set_node_position',
      arguments: { nodeId: 'node-card-caption', position: { x: 40, y: 760 } },
    },
    templateValues: null,
  },
  {
    id: 'custom-html',
    title: 'Sandboxed Custom HTML',
    description:
      'A dial drawn by a Custom HTML element. It keeps no clock: it draws the time the host sends over the versioned message protocol and acknowledges it, so seeking backwards works (D23). It runs in an allow-scripts-only sandbox, and only when "Run Custom HTML" is on: the page runs no Custom HTML by default (D36).',
    features: ['D05', 'D23', 'D36'],
    url: '/app/showcases/custom-html.json',
    sourceFile: 'apps/playground/src/showcases/custom-html.json',
    dragNodeId: 'node-dial',
    toolCall: {
      name: 'set_node_position',
      arguments: { nodeId: 'node-dial', position: { x: 90, y: 900 } },
    },
    templateValues: null,
  },
  {
    id: 'landscape',
    title: 'Landscape at 24 fps',
    description:
      'Canvas size and frame rate are data: 1920x1080 at 24 fps, 5 s, with an image sliding in, a fading title, and an audio clip (muxed by the Producer, silent in the preview).',
    features: ['D07', 'D13', 'D15'],
    url: '/app/showcases/landscape.json',
    sourceFile: 'apps/playground/src/showcases/landscape.json',
    dragNodeId: 'node-title',
    toolCall: {
      name: 'set_node_position',
      arguments: { nodeId: 'node-subtitle', position: { x: 860, y: 760 } },
    },
    templateValues: null,
  },
  {
    id: 'video',
    title: 'Video and fit',
    description:
      'Three clips of the same H.264 video: fill stretches it to its box, contain shows all of it, and cover fills the box and crops it around its focus point, here near the top, from half a second into the source. The Player decodes it in this window and shows the frame the Producer renders (D51). The video is made by the pinned FFmpeg from the recipe of the test fixtures: run "node --run playground:media" once, or the Player reports asset-missing.',
    features: ['D49', 'D50', 'D51', 'D63'],
    url: '/app/showcases/video.json',
    sourceFile: 'apps/playground/src/showcases/video.json',
    dragNodeId: 'video-contain',
    toolCall: {
      name: 'set_node_fit',
      arguments: { nodeId: 'video-contain', fit: 'cover' },
    },
    templateValues: null,
  },
  {
    id: 'audio',
    title: 'Audio clips with fades',
    description:
      "Two clips of the generated tone, one after the other: the first at full volume, the second at half volume from five seconds into the source, each with a linear fade-in and fade-out of one second. The image fades with them so the fades can be seen too. Press Play to hear it; the Player schedules the sound on the page's audio context, and that clock drives the picture (D52, D53).",
    features: ['D52', 'D53', 'D61'],
    url: '/app/showcases/audio.json',
    sourceFile: 'apps/playground/src/showcases/audio.json',
    dragNodeId: 'audio-title',
    toolCall: {
      name: 'set_clip_fades',
      arguments: { clipId: 'clip-second', fadeInUs: 2_000_000, fadeOutUs: 500_000 },
    },
    templateValues: null,
  },
  {
    id: 'scenes',
    title: 'Scenes and transitions',
    description:
      'Four scenes in sequence, each with its own local time. Between them a crossfade, a fade through white, and a slide; inside the last scene a crossfade between two of its clips. A transition overlaps the scenes on either side, so the composition lasts the sum of the scenes minus the transitions (D54, D56).',
    features: ['D49', 'D54', 'D55', 'D56'],
    url: '/app/showcases/scenes.json',
    sourceFile: 'apps/playground/src/showcases/scenes.json',
    dragNodeId: 'intro-title',
    toolCall: {
      name: 'set_transition_effect',
      arguments: { transitionId: 'transition-slide', effect: { kind: 'wipe', direction: 'up' } },
    },
    templateValues: null,
  },
  {
    id: 'captions',
    title: 'Captions',
    description:
      'A captions node with timed words: the runtime breaks them into lines and pages and highlights the word being spoken, so the Player and the Producer show the same page at every frame (D57).',
    features: ['D57'],
    url: '/app/showcases/captions.json',
    sourceFile: 'apps/playground/src/showcases/captions.json',
    dragNodeId: 'captions',
    toolCall: {
      name: 'set_caption_word',
      arguments: {
        nodeId: 'captions',
        index: 0,
        word: { text: 'Kadrion', startUs: 0, durationUs: 540_000 },
      },
    },
    templateValues: null,
  },
  {
    id: 'template',
    title: 'Template with inputs',
    description:
      'A template: a title, a colour, an intro shown on a condition, and a scene repeated for every person of a list. The preview shows it with its defaults; "Instantiate with these values" opens the document the values make, with another title and colour and three people; set show-intro to false to drop the intro (D58, D59).',
    features: ['D58', 'D59'],
    url: '/app/showcases/template.json',
    sourceFile: 'apps/playground/src/showcases/template.json',
    dragNodeId: 'intro-title',
    toolCall: {
      name: 'set_template_input',
      arguments: {
        inputId: 'title',
        input: {
          id: 'title',
          type: 'text',
          minLength: 1,
          maxLength: 24,
          default: 'Kadrion scenes',
        },
      },
    },
    templateValues: {
      title: 'Dora',
      brand: '#7a5af8',
      'show-intro': true,
      people: [
        { name: 'Dean', accent: '#12b76a' },
        { name: 'Kim', accent: '#f79009' },
        { name: 'Dina', accent: '#7a5af8' },
      ],
    },
  },
  {
    id: 'clip-transitions',
    title: 'Clip transitions',
    description:
      'Five clips of one layer, each a group, overlap by 0.4 s: a push eased in and out, a zoom from half size on a curve that overshoots, an iris opening from the centre, and a blur dissolve. The frame of a clip transition is the canvas, so the clips move across the whole frame (D66, D67).',
    features: ['D56', 'D66', 'D67'],
    url: '/app/showcases/clip-transitions.json',
    sourceFile: 'apps/playground/src/showcases/clip-transitions.json',
    dragNodeId: null,
    toolCall: {
      name: 'set_transition_easing',
      arguments: { transitionId: 'transition-zoom', easing: { kind: 'ease-in-out' } },
    },
    templateValues: null,
  },
  {
    id: 'motion',
    title: 'Easing, rotation, and crop',
    description:
      'An image turns once about its centre, eased in and out; another pops in on a curve that overshoots, holds, falls back in four steps, and grows again; a third is cropped towards its middle while its corners round. A text is turned about its bottom-left corner (D67, D68).',
    features: ['D67', 'D68'],
    url: '/app/showcases/motion.json',
    sourceFile: 'apps/playground/src/showcases/motion.json',
    dragNodeId: 'motion-title',
    toolCall: {
      name: 'set_keyframe_easing',
      arguments: { animationId: 'anim-pop-scale', timeUs: 0, easing: { kind: 'ease-out' } },
    },
    templateValues: null,
  },
  {
    id: 'text-motion',
    title: 'Text styles and text in fragments',
    description:
      'A title with an outline rises letter by letter; a line on a box with a shadow grows word by word from its middle; a glowing line turns its letters in a seeded random order at 2 s. The last line has no text animation: the tool call animates it letter by letter (D69).',
    features: ['D65', 'D69'],
    url: '/app/showcases/text-motion.json',
    sourceFile: 'apps/playground/src/showcases/text-motion.json',
    dragNodeId: 'text-plain',
    toolCall: {
      name: 'add_text_animation',
      arguments: {
        nodeId: 'text-plain',
        index: 0,
        animation: {
          id: 'text-plain-in',
          unit: 'letter',
          phase: { kind: 'in' },
          staggerUs: 50_000,
          order: { kind: 'forward' },
          tracks: [
            {
              property: 'opacity',
              keyframes: [
                { timeUs: 0, value: 0, easing: { kind: 'ease-out' } },
                { timeUs: 300_000, value: 1, easing: { kind: 'linear' } },
              ],
            },
          ],
        },
      },
    },
    templateValues: null,
  },
  {
    id: 'animated-captions',
    title: 'Animated captions and the safe area',
    description:
      'Captions inside the safe area of the composition, drawn here as a dashed frame: every page enters word by word and leaves line by line, and the word being spoken grows, bounces, and sits on a box (D70).',
    features: ['D57', 'D70'],
    url: '/app/showcases/animated-captions.json',
    sourceFile: 'apps/playground/src/showcases/animated-captions.json',
    dragNodeId: 'captions-pop',
    toolCall: {
      name: 'set_caption_highlight',
      arguments: {
        nodeId: 'captions-pop',
        highlight: {
          color: '#f04438',
          scale: 1.3,
          tracks: [],
          underline: { kind: 'solid', color: '#f04438', thickness: 4, offset: 2 },
          box: { kind: 'none' },
          stroke: { kind: 'outside', color: '#000000', width: 3 },
          shadow: { kind: 'none' },
        },
      },
    },
    templateValues: null,
  },
  {
    id: 'effects',
    title: 'Effects',
    description:
      'The same image without effects and with eight: a blur that clears, a drop shadow, a hue that turns, grayscale with contrast, and sepia are CSS filters; curves, a colour grade from cold to warm, and a vignette are SVG filters, as is the glow of the text. The scene itself is saturated (D71, D72).',
    features: ['D65', 'D71', 'D72'],
    url: '/app/showcases/effects.json',
    sourceFile: 'apps/playground/src/showcases/effects.json',
    dragNodeId: 'image-plain',
    toolCall: {
      name: 'add_effect',
      arguments: {
        ownerId: 'image-plain',
        index: 0,
        effect: { id: 'effect-plain-blur', kind: 'blur', radius: 6, animations: [] },
      },
    },
    templateValues: null,
  },
  {
    id: 'shapes',
    title: 'Vector shapes and an SVG asset',
    description:
      'A rounded rectangle with a gradient and a dashed outline that grows, an ellipse with a radial gradient, a star that turns and changes colour, a wave whose stroke draws itself on, and a path that morphs. Bottom right, an SVG asset shown by an image node; the page accepts its bytes only after the sanitiser of D74 does (D73, D74).',
    features: ['D73', 'D74'],
    url: '/app/showcases/shapes.json',
    sourceFile: 'apps/playground/src/showcases/shapes.json',
    dragNodeId: 'shape-sun',
    toolCall: {
      name: 'set_shape_fill',
      arguments: { nodeId: 'shape-sun', fill: { kind: 'solid', color: '#fec84b' } },
    },
    templateValues: null,
  },
  {
    id: 'compositing',
    title: 'Blend modes, masks, and a track matte',
    description:
      'A title blends with the bar below it by difference; an image is masked by an ellipse whose edge softens and sharpens; a gradient is masked by the brightness of an image; and an image shows only through a turning star, a sibling shape used as its track matte (D75).',
    features: ['D65', 'D75'],
    url: '/app/showcases/compositing.json',
    sourceFile: 'apps/playground/src/showcases/compositing.json',
    dragNodeId: 'compositing-circle',
    toolCall: {
      name: 'set_blend_mode',
      arguments: { nodeId: 'compositing-title', blendMode: 'screen' },
    },
    templateValues: null,
  },
  {
    id: 'elements',
    title: 'Nested compositions and Elements',
    description:
      'A badge built once as a definition and placed three times: from its start, from one second into it while it turns, and again after the first ends. A lower third is an Element, a definition with a template: two instances give its title, colour, and dot other values (D76, D77).',
    features: ['D65', 'D76', 'D77'],
    url: '/app/showcases/elements.json',
    sourceFile: 'apps/playground/src/showcases/elements.json',
    dragNodeId: 'third-dina',
    toolCall: {
      name: 'set_instance_input',
      arguments: {
        instanceId: 'third-dina',
        input: { inputId: 'title', type: 'text', value: 'Dean' },
      },
    },
    templateValues: null,
  },
  {
    id: 'custom-html-clock',
    title: 'Custom HTML with the managed clock',
    description:
      'A Custom HTML element written as an AI would write it: plain CSS @keyframes and no script. The managed clock drives the animations from the time of the scene, so seeking works, and the colour and size come from its parameters. It runs only when "Run Custom HTML" is on (D36, D78).',
    features: ['D23', 'D36', 'D78'],
    url: '/app/showcases/custom-html-clock.json',
    sourceFile: 'apps/playground/src/showcases/custom-html-clock.json',
    dragNodeId: 'html-clock',
    toolCall: {
      name: 'set_custom_html',
      arguments: {
        nodeId: 'html-clock',
        html: '<style>html,body{margin:0;height:100%;background:#1d2939}#dot{width:80px;height:80px;border-radius:50%;background:var(--accent);animation:move 2s ease-in-out infinite alternate}@keyframes move{to{transform:translateX(800px)}}</style><div id="dot"></div>',
        fontAssetIds: [],
        parameters: [{ key: 'accent', type: 'color', value: '#12b76a' }],
      },
    },
    templateValues: null,
  },
  {
    id: 'speed',
    title: 'Speed, freeze frames, and reverse',
    description:
      'The fixture video four times: at x0.5 and at x1/3, slower than it was recorded; at x2 for 1.5 s and then held on its last frame, a freeze frame of x0; and at x0.75 backwards. The sound plays at x1.5 with its pitch kept and then backwards. The tool call slows the first clip to x0.25 (D82).',
    features: ['D49', 'D82'],
    url: '/app/showcases/speed.json',
    sourceFile: 'apps/playground/src/showcases/speed.json',
    dragNodeId: 'video-slow',
    toolCall: {
      name: 'set_clip_speed',
      arguments: { clipId: 'video-slow', speed: 'x0.25' },
    },
    templateValues: null,
  },
  {
    id: 'framed-text',
    title: 'Text frames and alignment',
    description:
      'Texts in frames of a fixed size, their lines measured from the proportional font and wrapped to its width: aligned left and top, in the centre and the middle, and right and bottom; lines that enter one by one; a word wider than its frame that stands alone and overflows; and captions broken by width whose spoken word has an outline and a shadow. The tool call gives the first text a wider frame, and its lines wrap again (D83).',
    features: ['D69', 'D70', 'D83'],
    url: '/app/showcases/framed-text.json',
    sourceFile: 'apps/playground/src/showcases/framed-text.json',
    dragNodeId: 'text-left',
    toolCall: {
      name: 'set_node_size',
      arguments: { nodeId: 'text-left', width: 400, height: 260 },
    },
    templateValues: null,
  },
];
