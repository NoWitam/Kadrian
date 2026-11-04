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
      'One text per animated property: opacity with three keyframes, a position offset that moves right and then down, and a scale from 0.5 to 2.5. Linear interpolation only (D18).',
    features: ['D16', 'D18', 'D19'],
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
];
