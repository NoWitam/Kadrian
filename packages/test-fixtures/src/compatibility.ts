/**
 * @kadrion/test-fixtures/compatibility — the compatibility corpus (D43.6): the
 * saved documents that must keep loading, and the hand-written document of the
 * current version each must load as.
 *
 * It is an entry point of its own on purpose. The main entry is loaded by many
 * suites and, unbundled, by the playground in a browser; neither should fetch
 * and resolve a corpus that only the compatibility tests read. The main entry
 * imports nothing from here, and this module imports nothing from the main
 * entry: the corpus holds its own copies of the fixtures it began with, so work
 * on those fixtures cannot change it.
 *
 * Pure data without `@kadrion/*` dependencies (D12). Documents are exported as
 * `unknown`, and deeply frozen because all consumers share the module instance.
 */
import manifest from './compatibility/manifest.json' with { type: 'json' };
import extremesV01 from './compatibility/v0-1/extremes.json' with { type: 'json' };
import minimalV01 from './compatibility/v0-1/minimal.json' with { type: 'json' };
import pairV01 from './compatibility/v0-1/pair.json' with { type: 'json' };
import referenceV01 from './compatibility/v0-1/reference.json' with { type: 'json' };
import extremesV02 from './compatibility/v0-2/extremes.json' with { type: 'json' };
import lifetimeV02 from './compatibility/v0-2/lifetime.json' with { type: 'json' };
import minimalV02 from './compatibility/v0-2/minimal.json' with { type: 'json' };
import pairV02 from './compatibility/v0-2/pair.json' with { type: 'json' };
import referenceV02 from './compatibility/v0-2/reference.json' with { type: 'json' };
import extremesV03 from './compatibility/v0-3/extremes.json' with { type: 'json' };
import lifetimeV03 from './compatibility/v0-3/lifetime.json' with { type: 'json' };
import minimalV03 from './compatibility/v0-3/minimal.json' with { type: 'json' };
import pairV03 from './compatibility/v0-3/pair.json' with { type: 'json' };
import referenceV03 from './compatibility/v0-3/reference.json' with { type: 'json' };
import videoV03 from './compatibility/v0-3/video.json' with { type: 'json' };
import audioV04 from './compatibility/v0-4/audio.json' with { type: 'json' };
import extremesV04 from './compatibility/v0-4/extremes.json' with { type: 'json' };
import lifetimeV04 from './compatibility/v0-4/lifetime.json' with { type: 'json' };
import minimalV04 from './compatibility/v0-4/minimal.json' with { type: 'json' };
import pairV04 from './compatibility/v0-4/pair.json' with { type: 'json' };
import referenceV04 from './compatibility/v0-4/reference.json' with { type: 'json' };
import videoV04 from './compatibility/v0-4/video.json' with { type: 'json' };
import audioV05 from './compatibility/v0-5/audio.json' with { type: 'json' };
import extremesV05 from './compatibility/v0-5/extremes.json' with { type: 'json' };
import lifetimeV05 from './compatibility/v0-5/lifetime.json' with { type: 'json' };
import minimalV05 from './compatibility/v0-5/minimal.json' with { type: 'json' };
import pairV05 from './compatibility/v0-5/pair.json' with { type: 'json' };
import referenceV05 from './compatibility/v0-5/reference.json' with { type: 'json' };
import scenesV05 from './compatibility/v0-5/scenes.json' with { type: 'json' };
import videoV05 from './compatibility/v0-5/video.json' with { type: 'json' };
import audioV06 from './compatibility/v0-6/audio.json' with { type: 'json' };
import extremesV06 from './compatibility/v0-6/extremes.json' with { type: 'json' };
import lifetimeV06 from './compatibility/v0-6/lifetime.json' with { type: 'json' };
import minimalV06 from './compatibility/v0-6/minimal.json' with { type: 'json' };
import pairV06 from './compatibility/v0-6/pair.json' with { type: 'json' };
import referenceV06 from './compatibility/v0-6/reference.json' with { type: 'json' };
import scenesV06 from './compatibility/v0-6/scenes.json' with { type: 'json' };
import transitionsV06 from './compatibility/v0-6/transitions.json' with { type: 'json' };
import videoV06 from './compatibility/v0-6/video.json' with { type: 'json' };
import audioV07 from './compatibility/v0-7/audio.json' with { type: 'json' };
import captionsV07 from './compatibility/v0-7/captions.json' with { type: 'json' };
import extremesV07 from './compatibility/v0-7/extremes.json' with { type: 'json' };
import lifetimeV07 from './compatibility/v0-7/lifetime.json' with { type: 'json' };
import minimalV07 from './compatibility/v0-7/minimal.json' with { type: 'json' };
import pairV07 from './compatibility/v0-7/pair.json' with { type: 'json' };
import referenceV07 from './compatibility/v0-7/reference.json' with { type: 'json' };
import scenesV07 from './compatibility/v0-7/scenes.json' with { type: 'json' };
import transitionsV07 from './compatibility/v0-7/transitions.json' with { type: 'json' };
import videoV07 from './compatibility/v0-7/video.json' with { type: 'json' };
import audioV08 from './compatibility/v0-8/audio.json' with { type: 'json' };
import captionsV08 from './compatibility/v0-8/captions.json' with { type: 'json' };
import extremesV08 from './compatibility/v0-8/extremes.json' with { type: 'json' };
import inputsV08 from './compatibility/v0-8/inputs.json' with { type: 'json' };
import lifetimeV08 from './compatibility/v0-8/lifetime.json' with { type: 'json' };
import minimalV08 from './compatibility/v0-8/minimal.json' with { type: 'json' };
import pairV08 from './compatibility/v0-8/pair.json' with { type: 'json' };
import referenceV08 from './compatibility/v0-8/reference.json' with { type: 'json' };
import scenesV08 from './compatibility/v0-8/scenes.json' with { type: 'json' };
import templateV08 from './compatibility/v0-8/template.json' with { type: 'json' };
import transitionsV08 from './compatibility/v0-8/transitions.json' with { type: 'json' };
import videoV08 from './compatibility/v0-8/video.json' with { type: 'json' };
import audioV09 from './compatibility/v0-9/audio.json' with { type: 'json' };
import captionsV09 from './compatibility/v0-9/captions.json' with { type: 'json' };
import extremesV09 from './compatibility/v0-9/extremes.json' with { type: 'json' };
import inputsV09 from './compatibility/v0-9/inputs.json' with { type: 'json' };
import lifetimeV09 from './compatibility/v0-9/lifetime.json' with { type: 'json' };
import minimalV09 from './compatibility/v0-9/minimal.json' with { type: 'json' };
import pairV09 from './compatibility/v0-9/pair.json' with { type: 'json' };
import referenceV09 from './compatibility/v0-9/reference.json' with { type: 'json' };
import repeatsV09 from './compatibility/v0-9/repeats.json' with { type: 'json' };
import scenesV09 from './compatibility/v0-9/scenes.json' with { type: 'json' };
import templateV09 from './compatibility/v0-9/template.json' with { type: 'json' };
import transitionsV09 from './compatibility/v0-9/transitions.json' with { type: 'json' };
import videoV09 from './compatibility/v0-9/video.json' with { type: 'json' };
import audioV010 from './compatibility/v0-10/audio.json' with { type: 'json' };
import captionsV010 from './compatibility/v0-10/captions.json' with { type: 'json' };
import extremesV010 from './compatibility/v0-10/extremes.json' with { type: 'json' };
import focusV010 from './compatibility/v0-10/focus.json' with { type: 'json' };
import inputsV010 from './compatibility/v0-10/inputs.json' with { type: 'json' };
import lifetimeV010 from './compatibility/v0-10/lifetime.json' with { type: 'json' };
import minimalV010 from './compatibility/v0-10/minimal.json' with { type: 'json' };
import pairV010 from './compatibility/v0-10/pair.json' with { type: 'json' };
import referenceV010 from './compatibility/v0-10/reference.json' with { type: 'json' };
import repeatsV010 from './compatibility/v0-10/repeats.json' with { type: 'json' };
import scenesV010 from './compatibility/v0-10/scenes.json' with { type: 'json' };
import templateV010 from './compatibility/v0-10/template.json' with { type: 'json' };
import transitionsV010 from './compatibility/v0-10/transitions.json' with { type: 'json' };
import videoV010 from './compatibility/v0-10/video.json' with { type: 'json' };
import audioV011 from './compatibility/v0-11/audio.json' with { type: 'json' };
import captionsV011 from './compatibility/v0-11/captions.json' with { type: 'json' };
import extremesV011 from './compatibility/v0-11/extremes.json' with { type: 'json' };
import focusV011 from './compatibility/v0-11/focus.json' with { type: 'json' };
import inputsV011 from './compatibility/v0-11/inputs.json' with { type: 'json' };
import lifetimeV011 from './compatibility/v0-11/lifetime.json' with { type: 'json' };
import minimalV011 from './compatibility/v0-11/minimal.json' with { type: 'json' };
import pairV011 from './compatibility/v0-11/pair.json' with { type: 'json' };
import referenceV011 from './compatibility/v0-11/reference.json' with { type: 'json' };
import repeatsV011 from './compatibility/v0-11/repeats.json' with { type: 'json' };
import scenesV011 from './compatibility/v0-11/scenes.json' with { type: 'json' };
import templateV011 from './compatibility/v0-11/template.json' with { type: 'json' };
import transitionsV011 from './compatibility/v0-11/transitions.json' with { type: 'json' };
import videoV011 from './compatibility/v0-11/video.json' with { type: 'json' };
import audioV012 from './compatibility/v0-12/audio.json' with { type: 'json' };
import captionsV012 from './compatibility/v0-12/captions.json' with { type: 'json' };
import easingV012 from './compatibility/v0-12/easing.json' with { type: 'json' };
import extremesV012 from './compatibility/v0-12/extremes.json' with { type: 'json' };
import focusV012 from './compatibility/v0-12/focus.json' with { type: 'json' };
import inputsV012 from './compatibility/v0-12/inputs.json' with { type: 'json' };
import lifetimeV012 from './compatibility/v0-12/lifetime.json' with { type: 'json' };
import minimalV012 from './compatibility/v0-12/minimal.json' with { type: 'json' };
import pairV012 from './compatibility/v0-12/pair.json' with { type: 'json' };
import referenceV012 from './compatibility/v0-12/reference.json' with { type: 'json' };
import repeatsV012 from './compatibility/v0-12/repeats.json' with { type: 'json' };
import scenesV012 from './compatibility/v0-12/scenes.json' with { type: 'json' };
import templateV012 from './compatibility/v0-12/template.json' with { type: 'json' };
import transitionsV012 from './compatibility/v0-12/transitions.json' with { type: 'json' };
import videoV012 from './compatibility/v0-12/video.json' with { type: 'json' };
import audioV013 from './compatibility/v0-13/audio.json' with { type: 'json' };
import captionsV013 from './compatibility/v0-13/captions.json' with { type: 'json' };
import easingV013 from './compatibility/v0-13/easing.json' with { type: 'json' };
import extremesV013 from './compatibility/v0-13/extremes.json' with { type: 'json' };
import focusV013 from './compatibility/v0-13/focus.json' with { type: 'json' };
import inputsV013 from './compatibility/v0-13/inputs.json' with { type: 'json' };
import lifetimeV013 from './compatibility/v0-13/lifetime.json' with { type: 'json' };
import minimalV013 from './compatibility/v0-13/minimal.json' with { type: 'json' };
import motionV013 from './compatibility/v0-13/motion.json' with { type: 'json' };
import pairV013 from './compatibility/v0-13/pair.json' with { type: 'json' };
import referenceV013 from './compatibility/v0-13/reference.json' with { type: 'json' };
import repeatsV013 from './compatibility/v0-13/repeats.json' with { type: 'json' };
import scenesV013 from './compatibility/v0-13/scenes.json' with { type: 'json' };
import templateV013 from './compatibility/v0-13/template.json' with { type: 'json' };
import transitionsV013 from './compatibility/v0-13/transitions.json' with { type: 'json' };
import videoV013 from './compatibility/v0-13/video.json' with { type: 'json' };
import audioV014 from './compatibility/v0-14/audio.json' with { type: 'json' };
import captionsV014 from './compatibility/v0-14/captions.json' with { type: 'json' };
import easingV014 from './compatibility/v0-14/easing.json' with { type: 'json' };
import extremesV014 from './compatibility/v0-14/extremes.json' with { type: 'json' };
import focusV014 from './compatibility/v0-14/focus.json' with { type: 'json' };
import inputsV014 from './compatibility/v0-14/inputs.json' with { type: 'json' };
import lifetimeV014 from './compatibility/v0-14/lifetime.json' with { type: 'json' };
import minimalV014 from './compatibility/v0-14/minimal.json' with { type: 'json' };
import motionV014 from './compatibility/v0-14/motion.json' with { type: 'json' };
import pairV014 from './compatibility/v0-14/pair.json' with { type: 'json' };
import referenceV014 from './compatibility/v0-14/reference.json' with { type: 'json' };
import repeatsV014 from './compatibility/v0-14/repeats.json' with { type: 'json' };
import scenesV014 from './compatibility/v0-14/scenes.json' with { type: 'json' };
import templateV014 from './compatibility/v0-14/template.json' with { type: 'json' };
import textV014 from './compatibility/v0-14/text.json' with { type: 'json' };
import transitionsV014 from './compatibility/v0-14/transitions.json' with { type: 'json' };
import videoV014 from './compatibility/v0-14/video.json' with { type: 'json' };
import audioV015 from './compatibility/v0-15/audio.json' with { type: 'json' };
import captionsV015 from './compatibility/v0-15/captions.json' with { type: 'json' };
import captionsMotionV015 from './compatibility/v0-15/captions-motion.json' with { type: 'json' };
import easingV015 from './compatibility/v0-15/easing.json' with { type: 'json' };
import extremesV015 from './compatibility/v0-15/extremes.json' with { type: 'json' };
import focusV015 from './compatibility/v0-15/focus.json' with { type: 'json' };
import inputsV015 from './compatibility/v0-15/inputs.json' with { type: 'json' };
import lifetimeV015 from './compatibility/v0-15/lifetime.json' with { type: 'json' };
import minimalV015 from './compatibility/v0-15/minimal.json' with { type: 'json' };
import motionV015 from './compatibility/v0-15/motion.json' with { type: 'json' };
import pairV015 from './compatibility/v0-15/pair.json' with { type: 'json' };
import referenceV015 from './compatibility/v0-15/reference.json' with { type: 'json' };
import repeatsV015 from './compatibility/v0-15/repeats.json' with { type: 'json' };
import scenesV015 from './compatibility/v0-15/scenes.json' with { type: 'json' };
import templateV015 from './compatibility/v0-15/template.json' with { type: 'json' };
import textV015 from './compatibility/v0-15/text.json' with { type: 'json' };
import transitionsV015 from './compatibility/v0-15/transitions.json' with { type: 'json' };
import videoV015 from './compatibility/v0-15/video.json' with { type: 'json' };
import audioV016 from './compatibility/v0-16/audio.json' with { type: 'json' };
import captionsV016 from './compatibility/v0-16/captions.json' with { type: 'json' };
import captionsMotionV016 from './compatibility/v0-16/captions-motion.json' with { type: 'json' };
import easingV016 from './compatibility/v0-16/easing.json' with { type: 'json' };
import effectsV016 from './compatibility/v0-16/effects.json' with { type: 'json' };
import extremesV016 from './compatibility/v0-16/extremes.json' with { type: 'json' };
import focusV016 from './compatibility/v0-16/focus.json' with { type: 'json' };
import inputsV016 from './compatibility/v0-16/inputs.json' with { type: 'json' };
import lifetimeV016 from './compatibility/v0-16/lifetime.json' with { type: 'json' };
import minimalV016 from './compatibility/v0-16/minimal.json' with { type: 'json' };
import motionV016 from './compatibility/v0-16/motion.json' with { type: 'json' };
import pairV016 from './compatibility/v0-16/pair.json' with { type: 'json' };
import referenceV016 from './compatibility/v0-16/reference.json' with { type: 'json' };
import repeatsV016 from './compatibility/v0-16/repeats.json' with { type: 'json' };
import scenesV016 from './compatibility/v0-16/scenes.json' with { type: 'json' };
import templateV016 from './compatibility/v0-16/template.json' with { type: 'json' };
import textV016 from './compatibility/v0-16/text.json' with { type: 'json' };
import transitionsV016 from './compatibility/v0-16/transitions.json' with { type: 'json' };
import videoV016 from './compatibility/v0-16/video.json' with { type: 'json' };
import audioV017 from './compatibility/v0-17/audio.json' with { type: 'json' };
import captionsMotionV017 from './compatibility/v0-17/captions-motion.json' with { type: 'json' };
import captionsV017 from './compatibility/v0-17/captions.json' with { type: 'json' };
import easingV017 from './compatibility/v0-17/easing.json' with { type: 'json' };
import effectsSvgV017 from './compatibility/v0-17/effects-svg.json' with { type: 'json' };
import effectsV017 from './compatibility/v0-17/effects.json' with { type: 'json' };
import extremesV017 from './compatibility/v0-17/extremes.json' with { type: 'json' };
import focusV017 from './compatibility/v0-17/focus.json' with { type: 'json' };
import inputsV017 from './compatibility/v0-17/inputs.json' with { type: 'json' };
import lifetimeV017 from './compatibility/v0-17/lifetime.json' with { type: 'json' };
import minimalV017 from './compatibility/v0-17/minimal.json' with { type: 'json' };
import motionV017 from './compatibility/v0-17/motion.json' with { type: 'json' };
import pairV017 from './compatibility/v0-17/pair.json' with { type: 'json' };
import referenceV017 from './compatibility/v0-17/reference.json' with { type: 'json' };
import repeatsV017 from './compatibility/v0-17/repeats.json' with { type: 'json' };
import scenesV017 from './compatibility/v0-17/scenes.json' with { type: 'json' };
import templateV017 from './compatibility/v0-17/template.json' with { type: 'json' };
import textV017 from './compatibility/v0-17/text.json' with { type: 'json' };
import transitionsV017 from './compatibility/v0-17/transitions.json' with { type: 'json' };
import videoV017 from './compatibility/v0-17/video.json' with { type: 'json' };
import audioV018 from './compatibility/v0-18/audio.json' with { type: 'json' };
import captionsMotionV018 from './compatibility/v0-18/captions-motion.json' with { type: 'json' };
import captionsV018 from './compatibility/v0-18/captions.json' with { type: 'json' };
import easingV018 from './compatibility/v0-18/easing.json' with { type: 'json' };
import effectsSvgV018 from './compatibility/v0-18/effects-svg.json' with { type: 'json' };
import effectsV018 from './compatibility/v0-18/effects.json' with { type: 'json' };
import extremesV018 from './compatibility/v0-18/extremes.json' with { type: 'json' };
import focusV018 from './compatibility/v0-18/focus.json' with { type: 'json' };
import inputsV018 from './compatibility/v0-18/inputs.json' with { type: 'json' };
import lifetimeV018 from './compatibility/v0-18/lifetime.json' with { type: 'json' };
import minimalV018 from './compatibility/v0-18/minimal.json' with { type: 'json' };
import motionV018 from './compatibility/v0-18/motion.json' with { type: 'json' };
import pairV018 from './compatibility/v0-18/pair.json' with { type: 'json' };
import referenceV018 from './compatibility/v0-18/reference.json' with { type: 'json' };
import repeatsV018 from './compatibility/v0-18/repeats.json' with { type: 'json' };
import scenesV018 from './compatibility/v0-18/scenes.json' with { type: 'json' };
import shapesV018 from './compatibility/v0-18/shapes.json' with { type: 'json' };
import templateV018 from './compatibility/v0-18/template.json' with { type: 'json' };
import textV018 from './compatibility/v0-18/text.json' with { type: 'json' };
import transitionsV018 from './compatibility/v0-18/transitions.json' with { type: 'json' };
import videoV018 from './compatibility/v0-18/video.json' with { type: 'json' };
import audioV019 from './compatibility/v0-19/audio.json' with { type: 'json' };
import captionsMotionV019 from './compatibility/v0-19/captions-motion.json' with { type: 'json' };
import captionsV019 from './compatibility/v0-19/captions.json' with { type: 'json' };
import easingV019 from './compatibility/v0-19/easing.json' with { type: 'json' };
import effectsSvgV019 from './compatibility/v0-19/effects-svg.json' with { type: 'json' };
import effectsV019 from './compatibility/v0-19/effects.json' with { type: 'json' };
import extremesV019 from './compatibility/v0-19/extremes.json' with { type: 'json' };
import focusV019 from './compatibility/v0-19/focus.json' with { type: 'json' };
import inputsV019 from './compatibility/v0-19/inputs.json' with { type: 'json' };
import lifetimeV019 from './compatibility/v0-19/lifetime.json' with { type: 'json' };
import minimalV019 from './compatibility/v0-19/minimal.json' with { type: 'json' };
import motionV019 from './compatibility/v0-19/motion.json' with { type: 'json' };
import pairV019 from './compatibility/v0-19/pair.json' with { type: 'json' };
import referenceV019 from './compatibility/v0-19/reference.json' with { type: 'json' };
import repeatsV019 from './compatibility/v0-19/repeats.json' with { type: 'json' };
import scenesV019 from './compatibility/v0-19/scenes.json' with { type: 'json' };
import shapesV019 from './compatibility/v0-19/shapes.json' with { type: 'json' };
import svgV019 from './compatibility/v0-19/svg.json' with { type: 'json' };
import templateV019 from './compatibility/v0-19/template.json' with { type: 'json' };
import textV019 from './compatibility/v0-19/text.json' with { type: 'json' };
import transitionsV019 from './compatibility/v0-19/transitions.json' with { type: 'json' };
import videoV019 from './compatibility/v0-19/video.json' with { type: 'json' };
import audioV020 from './compatibility/v0-20/audio.json' with { type: 'json' };
import captionsMotionV020 from './compatibility/v0-20/captions-motion.json' with { type: 'json' };
import captionsV020 from './compatibility/v0-20/captions.json' with { type: 'json' };
import compositingV020 from './compatibility/v0-20/compositing.json' with { type: 'json' };
import easingV020 from './compatibility/v0-20/easing.json' with { type: 'json' };
import effectsSvgV020 from './compatibility/v0-20/effects-svg.json' with { type: 'json' };
import effectsV020 from './compatibility/v0-20/effects.json' with { type: 'json' };
import extremesV020 from './compatibility/v0-20/extremes.json' with { type: 'json' };
import focusV020 from './compatibility/v0-20/focus.json' with { type: 'json' };
import inputsV020 from './compatibility/v0-20/inputs.json' with { type: 'json' };
import lifetimeV020 from './compatibility/v0-20/lifetime.json' with { type: 'json' };
import minimalV020 from './compatibility/v0-20/minimal.json' with { type: 'json' };
import motionV020 from './compatibility/v0-20/motion.json' with { type: 'json' };
import pairV020 from './compatibility/v0-20/pair.json' with { type: 'json' };
import referenceV020 from './compatibility/v0-20/reference.json' with { type: 'json' };
import repeatsV020 from './compatibility/v0-20/repeats.json' with { type: 'json' };
import scenesV020 from './compatibility/v0-20/scenes.json' with { type: 'json' };
import shapesV020 from './compatibility/v0-20/shapes.json' with { type: 'json' };
import svgV020 from './compatibility/v0-20/svg.json' with { type: 'json' };
import templateV020 from './compatibility/v0-20/template.json' with { type: 'json' };
import textV020 from './compatibility/v0-20/text.json' with { type: 'json' };
import transitionsV020 from './compatibility/v0-20/transitions.json' with { type: 'json' };
import videoV020 from './compatibility/v0-20/video.json' with { type: 'json' };
import audioV021 from './compatibility/v0-21/audio.json' with { type: 'json' };
import captionsMotionV021 from './compatibility/v0-21/captions-motion.json' with { type: 'json' };
import captionsV021 from './compatibility/v0-21/captions.json' with { type: 'json' };
import compositingV021 from './compatibility/v0-21/compositing.json' with { type: 'json' };
import easingV021 from './compatibility/v0-21/easing.json' with { type: 'json' };
import effectsSvgV021 from './compatibility/v0-21/effects-svg.json' with { type: 'json' };
import effectsV021 from './compatibility/v0-21/effects.json' with { type: 'json' };
import extremesV021 from './compatibility/v0-21/extremes.json' with { type: 'json' };
import focusV021 from './compatibility/v0-21/focus.json' with { type: 'json' };
import inputsV021 from './compatibility/v0-21/inputs.json' with { type: 'json' };
import lifetimeV021 from './compatibility/v0-21/lifetime.json' with { type: 'json' };
import minimalV021 from './compatibility/v0-21/minimal.json' with { type: 'json' };
import motionV021 from './compatibility/v0-21/motion.json' with { type: 'json' };
import nestedV021 from './compatibility/v0-21/nested.json' with { type: 'json' };
import pairV021 from './compatibility/v0-21/pair.json' with { type: 'json' };
import referenceV021 from './compatibility/v0-21/reference.json' with { type: 'json' };
import repeatsV021 from './compatibility/v0-21/repeats.json' with { type: 'json' };
import scenesV021 from './compatibility/v0-21/scenes.json' with { type: 'json' };
import shapesV021 from './compatibility/v0-21/shapes.json' with { type: 'json' };
import svgV021 from './compatibility/v0-21/svg.json' with { type: 'json' };
import templateV021 from './compatibility/v0-21/template.json' with { type: 'json' };
import textV021 from './compatibility/v0-21/text.json' with { type: 'json' };
import transitionsV021 from './compatibility/v0-21/transitions.json' with { type: 'json' };
import videoV021 from './compatibility/v0-21/video.json' with { type: 'json' };
import audioV022 from './compatibility/v0-22/audio.json' with { type: 'json' };
import captionsMotionV022 from './compatibility/v0-22/captions-motion.json' with { type: 'json' };
import captionsV022 from './compatibility/v0-22/captions.json' with { type: 'json' };
import compositingV022 from './compatibility/v0-22/compositing.json' with { type: 'json' };
import easingV022 from './compatibility/v0-22/easing.json' with { type: 'json' };
import effectsSvgV022 from './compatibility/v0-22/effects-svg.json' with { type: 'json' };
import effectsV022 from './compatibility/v0-22/effects.json' with { type: 'json' };
import elementsV022 from './compatibility/v0-22/elements.json' with { type: 'json' };
import extremesV022 from './compatibility/v0-22/extremes.json' with { type: 'json' };
import focusV022 from './compatibility/v0-22/focus.json' with { type: 'json' };
import inputsV022 from './compatibility/v0-22/inputs.json' with { type: 'json' };
import lifetimeV022 from './compatibility/v0-22/lifetime.json' with { type: 'json' };
import minimalV022 from './compatibility/v0-22/minimal.json' with { type: 'json' };
import motionV022 from './compatibility/v0-22/motion.json' with { type: 'json' };
import nestedV022 from './compatibility/v0-22/nested.json' with { type: 'json' };
import pairV022 from './compatibility/v0-22/pair.json' with { type: 'json' };
import referenceV022 from './compatibility/v0-22/reference.json' with { type: 'json' };
import repeatsV022 from './compatibility/v0-22/repeats.json' with { type: 'json' };
import scenesV022 from './compatibility/v0-22/scenes.json' with { type: 'json' };
import shapesV022 from './compatibility/v0-22/shapes.json' with { type: 'json' };
import svgV022 from './compatibility/v0-22/svg.json' with { type: 'json' };
import templateV022 from './compatibility/v0-22/template.json' with { type: 'json' };
import textV022 from './compatibility/v0-22/text.json' with { type: 'json' };
import transitionsV022 from './compatibility/v0-22/transitions.json' with { type: 'json' };
import videoV022 from './compatibility/v0-22/video.json' with { type: 'json' };
import audioV023 from './compatibility/v0-23/audio.json' with { type: 'json' };
import captionsMotionV023 from './compatibility/v0-23/captions-motion.json' with { type: 'json' };
import captionsV023 from './compatibility/v0-23/captions.json' with { type: 'json' };
import compositingV023 from './compatibility/v0-23/compositing.json' with { type: 'json' };
import customHtmlV023 from './compatibility/v0-23/custom-html.json' with { type: 'json' };
import easingV023 from './compatibility/v0-23/easing.json' with { type: 'json' };
import effectsSvgV023 from './compatibility/v0-23/effects-svg.json' with { type: 'json' };
import effectsV023 from './compatibility/v0-23/effects.json' with { type: 'json' };
import elementsV023 from './compatibility/v0-23/elements.json' with { type: 'json' };
import extremesV023 from './compatibility/v0-23/extremes.json' with { type: 'json' };
import focusV023 from './compatibility/v0-23/focus.json' with { type: 'json' };
import inputsV023 from './compatibility/v0-23/inputs.json' with { type: 'json' };
import lifetimeV023 from './compatibility/v0-23/lifetime.json' with { type: 'json' };
import minimalV023 from './compatibility/v0-23/minimal.json' with { type: 'json' };
import motionV023 from './compatibility/v0-23/motion.json' with { type: 'json' };
import nestedV023 from './compatibility/v0-23/nested.json' with { type: 'json' };
import pairV023 from './compatibility/v0-23/pair.json' with { type: 'json' };
import referenceV023 from './compatibility/v0-23/reference.json' with { type: 'json' };
import repeatsV023 from './compatibility/v0-23/repeats.json' with { type: 'json' };
import scenesV023 from './compatibility/v0-23/scenes.json' with { type: 'json' };
import shapesV023 from './compatibility/v0-23/shapes.json' with { type: 'json' };
import svgV023 from './compatibility/v0-23/svg.json' with { type: 'json' };
import templateV023 from './compatibility/v0-23/template.json' with { type: 'json' };
import textV023 from './compatibility/v0-23/text.json' with { type: 'json' };
import transitionsV023 from './compatibility/v0-23/transitions.json' with { type: 'json' };
import videoV023 from './compatibility/v0-23/video.json' with { type: 'json' };
import audioV024 from './compatibility/v0-24/audio.json' with { type: 'json' };
import captionsMotionV024 from './compatibility/v0-24/captions-motion.json' with { type: 'json' };
import captionsV024 from './compatibility/v0-24/captions.json' with { type: 'json' };
import compositingV024 from './compatibility/v0-24/compositing.json' with { type: 'json' };
import customHtmlV024 from './compatibility/v0-24/custom-html.json' with { type: 'json' };
import easingV024 from './compatibility/v0-24/easing.json' with { type: 'json' };
import effectsSvgV024 from './compatibility/v0-24/effects-svg.json' with { type: 'json' };
import effectsV024 from './compatibility/v0-24/effects.json' with { type: 'json' };
import elementsV024 from './compatibility/v0-24/elements.json' with { type: 'json' };
import extremesV024 from './compatibility/v0-24/extremes.json' with { type: 'json' };
import focusV024 from './compatibility/v0-24/focus.json' with { type: 'json' };
import inputsV024 from './compatibility/v0-24/inputs.json' with { type: 'json' };
import lifetimeV024 from './compatibility/v0-24/lifetime.json' with { type: 'json' };
import minimalV024 from './compatibility/v0-24/minimal.json' with { type: 'json' };
import motionV024 from './compatibility/v0-24/motion.json' with { type: 'json' };
import nestedV024 from './compatibility/v0-24/nested.json' with { type: 'json' };
import pairV024 from './compatibility/v0-24/pair.json' with { type: 'json' };
import referenceV024 from './compatibility/v0-24/reference.json' with { type: 'json' };
import repeatsV024 from './compatibility/v0-24/repeats.json' with { type: 'json' };
import scenesV024 from './compatibility/v0-24/scenes.json' with { type: 'json' };
import shapesV024 from './compatibility/v0-24/shapes.json' with { type: 'json' };
import speedV024 from './compatibility/v0-24/speed.json' with { type: 'json' };
import svgV024 from './compatibility/v0-24/svg.json' with { type: 'json' };
import templateV024 from './compatibility/v0-24/template.json' with { type: 'json' };
import textV024 from './compatibility/v0-24/text.json' with { type: 'json' };
import transitionsV024 from './compatibility/v0-24/transitions.json' with { type: 'json' };
import videoV024 from './compatibility/v0-24/video.json' with { type: 'json' };

/**
 * An entry of the compatibility corpus (D43.6): a saved document that must keep
 * loading, and the document of the current version it must load as.
 */
export interface CompatibilityEntry {
  readonly id: string;
  /** The schema version the input names. */
  readonly schemaVersion: string;
  /** The saved document: a frozen input, which never changes once committed. */
  readonly input: unknown;
  readonly inputFile: string;
  /** SHA-256 of the bytes of the input file. */
  readonly inputSha256: string;
  /** The versions loading must report, the input's own first. */
  readonly versions: readonly string[];
  /** What the input must load as: written by hand, never by a migration. */
  readonly expected: unknown;
  readonly expectedFile: string;
  /** SHA-256 of the bytes of the expected file. */
  readonly expectedSha256: string;
  /** `sha256(canonicalJson(expected))`: independent of white space and key order (D28.7). */
  readonly expectedCompositionHash: string;
}

/** The corpus documents by the path the manifest names them with. */
const FILES: Readonly<Record<string, unknown>> = {
  'compatibility/v0-1/extremes.json': extremesV01,
  'compatibility/v0-1/minimal.json': minimalV01,
  'compatibility/v0-1/pair.json': pairV01,
  'compatibility/v0-1/reference.json': referenceV01,
  'compatibility/v0-2/extremes.json': extremesV02,
  'compatibility/v0-2/lifetime.json': lifetimeV02,
  'compatibility/v0-2/minimal.json': minimalV02,
  'compatibility/v0-2/pair.json': pairV02,
  'compatibility/v0-2/reference.json': referenceV02,
  'compatibility/v0-3/extremes.json': extremesV03,
  'compatibility/v0-3/lifetime.json': lifetimeV03,
  'compatibility/v0-3/minimal.json': minimalV03,
  'compatibility/v0-3/pair.json': pairV03,
  'compatibility/v0-3/reference.json': referenceV03,
  'compatibility/v0-3/video.json': videoV03,
  'compatibility/v0-4/audio.json': audioV04,
  'compatibility/v0-4/extremes.json': extremesV04,
  'compatibility/v0-4/lifetime.json': lifetimeV04,
  'compatibility/v0-4/minimal.json': minimalV04,
  'compatibility/v0-4/pair.json': pairV04,
  'compatibility/v0-4/reference.json': referenceV04,
  'compatibility/v0-4/video.json': videoV04,
  'compatibility/v0-5/audio.json': audioV05,
  'compatibility/v0-5/extremes.json': extremesV05,
  'compatibility/v0-5/lifetime.json': lifetimeV05,
  'compatibility/v0-5/minimal.json': minimalV05,
  'compatibility/v0-5/pair.json': pairV05,
  'compatibility/v0-5/reference.json': referenceV05,
  'compatibility/v0-5/scenes.json': scenesV05,
  'compatibility/v0-5/video.json': videoV05,
  'compatibility/v0-6/audio.json': audioV06,
  'compatibility/v0-6/extremes.json': extremesV06,
  'compatibility/v0-6/lifetime.json': lifetimeV06,
  'compatibility/v0-6/minimal.json': minimalV06,
  'compatibility/v0-6/pair.json': pairV06,
  'compatibility/v0-6/reference.json': referenceV06,
  'compatibility/v0-6/scenes.json': scenesV06,
  'compatibility/v0-6/transitions.json': transitionsV06,
  'compatibility/v0-6/video.json': videoV06,
  'compatibility/v0-7/audio.json': audioV07,
  'compatibility/v0-7/captions.json': captionsV07,
  'compatibility/v0-7/extremes.json': extremesV07,
  'compatibility/v0-7/lifetime.json': lifetimeV07,
  'compatibility/v0-7/minimal.json': minimalV07,
  'compatibility/v0-7/pair.json': pairV07,
  'compatibility/v0-7/reference.json': referenceV07,
  'compatibility/v0-7/scenes.json': scenesV07,
  'compatibility/v0-7/transitions.json': transitionsV07,
  'compatibility/v0-7/video.json': videoV07,
  'compatibility/v0-8/audio.json': audioV08,
  'compatibility/v0-8/captions.json': captionsV08,
  'compatibility/v0-8/extremes.json': extremesV08,
  'compatibility/v0-8/inputs.json': inputsV08,
  'compatibility/v0-8/lifetime.json': lifetimeV08,
  'compatibility/v0-8/minimal.json': minimalV08,
  'compatibility/v0-8/pair.json': pairV08,
  'compatibility/v0-8/reference.json': referenceV08,
  'compatibility/v0-8/scenes.json': scenesV08,
  'compatibility/v0-8/template.json': templateV08,
  'compatibility/v0-8/transitions.json': transitionsV08,
  'compatibility/v0-8/video.json': videoV08,
  'compatibility/v0-9/audio.json': audioV09,
  'compatibility/v0-9/captions.json': captionsV09,
  'compatibility/v0-9/extremes.json': extremesV09,
  'compatibility/v0-9/inputs.json': inputsV09,
  'compatibility/v0-9/lifetime.json': lifetimeV09,
  'compatibility/v0-9/minimal.json': minimalV09,
  'compatibility/v0-9/pair.json': pairV09,
  'compatibility/v0-9/reference.json': referenceV09,
  'compatibility/v0-9/repeats.json': repeatsV09,
  'compatibility/v0-9/scenes.json': scenesV09,
  'compatibility/v0-9/template.json': templateV09,
  'compatibility/v0-9/transitions.json': transitionsV09,
  'compatibility/v0-9/video.json': videoV09,
  'compatibility/v0-10/audio.json': audioV010,
  'compatibility/v0-10/captions.json': captionsV010,
  'compatibility/v0-10/extremes.json': extremesV010,
  'compatibility/v0-10/focus.json': focusV010,
  'compatibility/v0-10/inputs.json': inputsV010,
  'compatibility/v0-10/lifetime.json': lifetimeV010,
  'compatibility/v0-10/minimal.json': minimalV010,
  'compatibility/v0-10/pair.json': pairV010,
  'compatibility/v0-10/reference.json': referenceV010,
  'compatibility/v0-10/repeats.json': repeatsV010,
  'compatibility/v0-10/scenes.json': scenesV010,
  'compatibility/v0-10/template.json': templateV010,
  'compatibility/v0-10/transitions.json': transitionsV010,
  'compatibility/v0-10/video.json': videoV010,
  'compatibility/v0-11/audio.json': audioV011,
  'compatibility/v0-11/captions.json': captionsV011,
  'compatibility/v0-11/extremes.json': extremesV011,
  'compatibility/v0-11/focus.json': focusV011,
  'compatibility/v0-11/inputs.json': inputsV011,
  'compatibility/v0-11/lifetime.json': lifetimeV011,
  'compatibility/v0-11/minimal.json': minimalV011,
  'compatibility/v0-11/pair.json': pairV011,
  'compatibility/v0-11/reference.json': referenceV011,
  'compatibility/v0-11/repeats.json': repeatsV011,
  'compatibility/v0-11/scenes.json': scenesV011,
  'compatibility/v0-11/template.json': templateV011,
  'compatibility/v0-11/transitions.json': transitionsV011,
  'compatibility/v0-11/video.json': videoV011,
  'compatibility/v0-12/audio.json': audioV012,
  'compatibility/v0-12/captions.json': captionsV012,
  'compatibility/v0-12/easing.json': easingV012,
  'compatibility/v0-12/extremes.json': extremesV012,
  'compatibility/v0-12/focus.json': focusV012,
  'compatibility/v0-12/inputs.json': inputsV012,
  'compatibility/v0-12/lifetime.json': lifetimeV012,
  'compatibility/v0-12/minimal.json': minimalV012,
  'compatibility/v0-12/pair.json': pairV012,
  'compatibility/v0-12/reference.json': referenceV012,
  'compatibility/v0-12/repeats.json': repeatsV012,
  'compatibility/v0-12/scenes.json': scenesV012,
  'compatibility/v0-12/template.json': templateV012,
  'compatibility/v0-12/transitions.json': transitionsV012,
  'compatibility/v0-12/video.json': videoV012,
  'compatibility/v0-13/audio.json': audioV013,
  'compatibility/v0-13/captions.json': captionsV013,
  'compatibility/v0-13/easing.json': easingV013,
  'compatibility/v0-13/extremes.json': extremesV013,
  'compatibility/v0-13/focus.json': focusV013,
  'compatibility/v0-13/inputs.json': inputsV013,
  'compatibility/v0-13/lifetime.json': lifetimeV013,
  'compatibility/v0-13/minimal.json': minimalV013,
  'compatibility/v0-13/motion.json': motionV013,
  'compatibility/v0-13/pair.json': pairV013,
  'compatibility/v0-13/reference.json': referenceV013,
  'compatibility/v0-13/repeats.json': repeatsV013,
  'compatibility/v0-13/scenes.json': scenesV013,
  'compatibility/v0-13/template.json': templateV013,
  'compatibility/v0-13/transitions.json': transitionsV013,
  'compatibility/v0-13/video.json': videoV013,
  'compatibility/v0-14/audio.json': audioV014,
  'compatibility/v0-14/captions.json': captionsV014,
  'compatibility/v0-14/easing.json': easingV014,
  'compatibility/v0-14/extremes.json': extremesV014,
  'compatibility/v0-14/focus.json': focusV014,
  'compatibility/v0-14/inputs.json': inputsV014,
  'compatibility/v0-14/lifetime.json': lifetimeV014,
  'compatibility/v0-14/minimal.json': minimalV014,
  'compatibility/v0-14/motion.json': motionV014,
  'compatibility/v0-14/pair.json': pairV014,
  'compatibility/v0-14/reference.json': referenceV014,
  'compatibility/v0-14/repeats.json': repeatsV014,
  'compatibility/v0-14/scenes.json': scenesV014,
  'compatibility/v0-14/template.json': templateV014,
  'compatibility/v0-14/text.json': textV014,
  'compatibility/v0-14/transitions.json': transitionsV014,
  'compatibility/v0-14/video.json': videoV014,
  'compatibility/v0-15/audio.json': audioV015,
  'compatibility/v0-15/captions.json': captionsV015,
  'compatibility/v0-15/captions-motion.json': captionsMotionV015,
  'compatibility/v0-15/easing.json': easingV015,
  'compatibility/v0-15/extremes.json': extremesV015,
  'compatibility/v0-15/focus.json': focusV015,
  'compatibility/v0-15/inputs.json': inputsV015,
  'compatibility/v0-15/lifetime.json': lifetimeV015,
  'compatibility/v0-15/minimal.json': minimalV015,
  'compatibility/v0-15/motion.json': motionV015,
  'compatibility/v0-15/pair.json': pairV015,
  'compatibility/v0-15/reference.json': referenceV015,
  'compatibility/v0-15/repeats.json': repeatsV015,
  'compatibility/v0-15/scenes.json': scenesV015,
  'compatibility/v0-15/template.json': templateV015,
  'compatibility/v0-15/text.json': textV015,
  'compatibility/v0-15/transitions.json': transitionsV015,
  'compatibility/v0-15/video.json': videoV015,
  'compatibility/v0-16/audio.json': audioV016,
  'compatibility/v0-16/captions.json': captionsV016,
  'compatibility/v0-16/captions-motion.json': captionsMotionV016,
  'compatibility/v0-16/easing.json': easingV016,
  'compatibility/v0-16/effects.json': effectsV016,
  'compatibility/v0-16/extremes.json': extremesV016,
  'compatibility/v0-16/focus.json': focusV016,
  'compatibility/v0-16/inputs.json': inputsV016,
  'compatibility/v0-16/lifetime.json': lifetimeV016,
  'compatibility/v0-16/minimal.json': minimalV016,
  'compatibility/v0-16/motion.json': motionV016,
  'compatibility/v0-16/pair.json': pairV016,
  'compatibility/v0-16/reference.json': referenceV016,
  'compatibility/v0-16/repeats.json': repeatsV016,
  'compatibility/v0-16/scenes.json': scenesV016,
  'compatibility/v0-16/template.json': templateV016,
  'compatibility/v0-16/text.json': textV016,
  'compatibility/v0-16/transitions.json': transitionsV016,
  'compatibility/v0-16/video.json': videoV016,
  'compatibility/v0-17/audio.json': audioV017,
  'compatibility/v0-17/captions-motion.json': captionsMotionV017,
  'compatibility/v0-17/captions.json': captionsV017,
  'compatibility/v0-17/easing.json': easingV017,
  'compatibility/v0-17/effects-svg.json': effectsSvgV017,
  'compatibility/v0-17/effects.json': effectsV017,
  'compatibility/v0-17/extremes.json': extremesV017,
  'compatibility/v0-17/focus.json': focusV017,
  'compatibility/v0-17/inputs.json': inputsV017,
  'compatibility/v0-17/lifetime.json': lifetimeV017,
  'compatibility/v0-17/minimal.json': minimalV017,
  'compatibility/v0-17/motion.json': motionV017,
  'compatibility/v0-17/pair.json': pairV017,
  'compatibility/v0-17/reference.json': referenceV017,
  'compatibility/v0-17/repeats.json': repeatsV017,
  'compatibility/v0-17/scenes.json': scenesV017,
  'compatibility/v0-17/template.json': templateV017,
  'compatibility/v0-17/text.json': textV017,
  'compatibility/v0-17/transitions.json': transitionsV017,
  'compatibility/v0-17/video.json': videoV017,
  'compatibility/v0-18/audio.json': audioV018,
  'compatibility/v0-18/captions-motion.json': captionsMotionV018,
  'compatibility/v0-18/captions.json': captionsV018,
  'compatibility/v0-18/easing.json': easingV018,
  'compatibility/v0-18/effects-svg.json': effectsSvgV018,
  'compatibility/v0-18/effects.json': effectsV018,
  'compatibility/v0-18/extremes.json': extremesV018,
  'compatibility/v0-18/focus.json': focusV018,
  'compatibility/v0-18/inputs.json': inputsV018,
  'compatibility/v0-18/lifetime.json': lifetimeV018,
  'compatibility/v0-18/minimal.json': minimalV018,
  'compatibility/v0-18/motion.json': motionV018,
  'compatibility/v0-18/pair.json': pairV018,
  'compatibility/v0-18/reference.json': referenceV018,
  'compatibility/v0-18/repeats.json': repeatsV018,
  'compatibility/v0-18/scenes.json': scenesV018,
  'compatibility/v0-18/shapes.json': shapesV018,
  'compatibility/v0-18/template.json': templateV018,
  'compatibility/v0-18/text.json': textV018,
  'compatibility/v0-18/transitions.json': transitionsV018,
  'compatibility/v0-18/video.json': videoV018,
  'compatibility/v0-19/audio.json': audioV019,
  'compatibility/v0-19/captions-motion.json': captionsMotionV019,
  'compatibility/v0-19/captions.json': captionsV019,
  'compatibility/v0-19/easing.json': easingV019,
  'compatibility/v0-19/effects-svg.json': effectsSvgV019,
  'compatibility/v0-19/effects.json': effectsV019,
  'compatibility/v0-19/extremes.json': extremesV019,
  'compatibility/v0-19/focus.json': focusV019,
  'compatibility/v0-19/inputs.json': inputsV019,
  'compatibility/v0-19/lifetime.json': lifetimeV019,
  'compatibility/v0-19/minimal.json': minimalV019,
  'compatibility/v0-19/motion.json': motionV019,
  'compatibility/v0-19/pair.json': pairV019,
  'compatibility/v0-19/reference.json': referenceV019,
  'compatibility/v0-19/repeats.json': repeatsV019,
  'compatibility/v0-19/scenes.json': scenesV019,
  'compatibility/v0-19/shapes.json': shapesV019,
  'compatibility/v0-19/svg.json': svgV019,
  'compatibility/v0-19/template.json': templateV019,
  'compatibility/v0-19/text.json': textV019,
  'compatibility/v0-19/transitions.json': transitionsV019,
  'compatibility/v0-19/video.json': videoV019,
  'compatibility/v0-20/audio.json': audioV020,
  'compatibility/v0-20/captions-motion.json': captionsMotionV020,
  'compatibility/v0-20/captions.json': captionsV020,
  'compatibility/v0-20/compositing.json': compositingV020,
  'compatibility/v0-20/easing.json': easingV020,
  'compatibility/v0-20/effects-svg.json': effectsSvgV020,
  'compatibility/v0-20/effects.json': effectsV020,
  'compatibility/v0-20/extremes.json': extremesV020,
  'compatibility/v0-20/focus.json': focusV020,
  'compatibility/v0-20/inputs.json': inputsV020,
  'compatibility/v0-20/lifetime.json': lifetimeV020,
  'compatibility/v0-20/minimal.json': minimalV020,
  'compatibility/v0-20/motion.json': motionV020,
  'compatibility/v0-20/pair.json': pairV020,
  'compatibility/v0-20/reference.json': referenceV020,
  'compatibility/v0-20/repeats.json': repeatsV020,
  'compatibility/v0-20/scenes.json': scenesV020,
  'compatibility/v0-20/shapes.json': shapesV020,
  'compatibility/v0-20/svg.json': svgV020,
  'compatibility/v0-20/template.json': templateV020,
  'compatibility/v0-20/text.json': textV020,
  'compatibility/v0-20/transitions.json': transitionsV020,
  'compatibility/v0-20/video.json': videoV020,
  'compatibility/v0-21/audio.json': audioV021,
  'compatibility/v0-21/captions-motion.json': captionsMotionV021,
  'compatibility/v0-21/captions.json': captionsV021,
  'compatibility/v0-21/compositing.json': compositingV021,
  'compatibility/v0-21/easing.json': easingV021,
  'compatibility/v0-21/effects-svg.json': effectsSvgV021,
  'compatibility/v0-21/effects.json': effectsV021,
  'compatibility/v0-21/extremes.json': extremesV021,
  'compatibility/v0-21/focus.json': focusV021,
  'compatibility/v0-21/inputs.json': inputsV021,
  'compatibility/v0-21/lifetime.json': lifetimeV021,
  'compatibility/v0-21/minimal.json': minimalV021,
  'compatibility/v0-21/motion.json': motionV021,
  'compatibility/v0-21/nested.json': nestedV021,
  'compatibility/v0-21/pair.json': pairV021,
  'compatibility/v0-21/reference.json': referenceV021,
  'compatibility/v0-21/repeats.json': repeatsV021,
  'compatibility/v0-21/scenes.json': scenesV021,
  'compatibility/v0-21/shapes.json': shapesV021,
  'compatibility/v0-21/svg.json': svgV021,
  'compatibility/v0-21/template.json': templateV021,
  'compatibility/v0-21/text.json': textV021,
  'compatibility/v0-21/transitions.json': transitionsV021,
  'compatibility/v0-21/video.json': videoV021,
  'compatibility/v0-22/audio.json': audioV022,
  'compatibility/v0-22/captions-motion.json': captionsMotionV022,
  'compatibility/v0-22/captions.json': captionsV022,
  'compatibility/v0-22/compositing.json': compositingV022,
  'compatibility/v0-22/easing.json': easingV022,
  'compatibility/v0-22/effects-svg.json': effectsSvgV022,
  'compatibility/v0-22/effects.json': effectsV022,
  'compatibility/v0-22/elements.json': elementsV022,
  'compatibility/v0-22/extremes.json': extremesV022,
  'compatibility/v0-22/focus.json': focusV022,
  'compatibility/v0-22/inputs.json': inputsV022,
  'compatibility/v0-22/lifetime.json': lifetimeV022,
  'compatibility/v0-22/minimal.json': minimalV022,
  'compatibility/v0-22/motion.json': motionV022,
  'compatibility/v0-22/nested.json': nestedV022,
  'compatibility/v0-22/pair.json': pairV022,
  'compatibility/v0-22/reference.json': referenceV022,
  'compatibility/v0-22/repeats.json': repeatsV022,
  'compatibility/v0-22/scenes.json': scenesV022,
  'compatibility/v0-22/shapes.json': shapesV022,
  'compatibility/v0-22/svg.json': svgV022,
  'compatibility/v0-22/template.json': templateV022,
  'compatibility/v0-22/text.json': textV022,
  'compatibility/v0-22/transitions.json': transitionsV022,
  'compatibility/v0-22/video.json': videoV022,
  'compatibility/v0-23/audio.json': audioV023,
  'compatibility/v0-23/captions-motion.json': captionsMotionV023,
  'compatibility/v0-23/captions.json': captionsV023,
  'compatibility/v0-23/compositing.json': compositingV023,
  'compatibility/v0-23/custom-html.json': customHtmlV023,
  'compatibility/v0-23/easing.json': easingV023,
  'compatibility/v0-23/effects-svg.json': effectsSvgV023,
  'compatibility/v0-23/effects.json': effectsV023,
  'compatibility/v0-23/elements.json': elementsV023,
  'compatibility/v0-23/extremes.json': extremesV023,
  'compatibility/v0-23/focus.json': focusV023,
  'compatibility/v0-23/inputs.json': inputsV023,
  'compatibility/v0-23/lifetime.json': lifetimeV023,
  'compatibility/v0-23/minimal.json': minimalV023,
  'compatibility/v0-23/motion.json': motionV023,
  'compatibility/v0-23/nested.json': nestedV023,
  'compatibility/v0-23/pair.json': pairV023,
  'compatibility/v0-23/reference.json': referenceV023,
  'compatibility/v0-23/repeats.json': repeatsV023,
  'compatibility/v0-23/scenes.json': scenesV023,
  'compatibility/v0-23/shapes.json': shapesV023,
  'compatibility/v0-23/svg.json': svgV023,
  'compatibility/v0-23/template.json': templateV023,
  'compatibility/v0-23/text.json': textV023,
  'compatibility/v0-23/transitions.json': transitionsV023,
  'compatibility/v0-23/video.json': videoV023,
  'compatibility/v0-24/audio.json': audioV024,
  'compatibility/v0-24/captions-motion.json': captionsMotionV024,
  'compatibility/v0-24/captions.json': captionsV024,
  'compatibility/v0-24/compositing.json': compositingV024,
  'compatibility/v0-24/custom-html.json': customHtmlV024,
  'compatibility/v0-24/easing.json': easingV024,
  'compatibility/v0-24/effects-svg.json': effectsSvgV024,
  'compatibility/v0-24/effects.json': effectsV024,
  'compatibility/v0-24/elements.json': elementsV024,
  'compatibility/v0-24/extremes.json': extremesV024,
  'compatibility/v0-24/focus.json': focusV024,
  'compatibility/v0-24/inputs.json': inputsV024,
  'compatibility/v0-24/lifetime.json': lifetimeV024,
  'compatibility/v0-24/minimal.json': minimalV024,
  'compatibility/v0-24/motion.json': motionV024,
  'compatibility/v0-24/nested.json': nestedV024,
  'compatibility/v0-24/pair.json': pairV024,
  'compatibility/v0-24/reference.json': referenceV024,
  'compatibility/v0-24/repeats.json': repeatsV024,
  'compatibility/v0-24/scenes.json': scenesV024,
  'compatibility/v0-24/shapes.json': shapesV024,
  'compatibility/v0-24/speed.json': speedV024,
  'compatibility/v0-24/svg.json': svgV024,
  'compatibility/v0-24/template.json': templateV024,
  'compatibility/v0-24/text.json': textV024,
  'compatibility/v0-24/transitions.json': transitionsV024,
  'compatibility/v0-24/video.json': videoV024,
};

function fileOf(path: string): unknown {
  if (!Object.hasOwn(FILES, path)) {
    throw new Error(`The compatibility manifest names ${path}, which this module does not import.`);
  }
  return FILES[path];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * The compatibility corpus: every entry of `compatibility/manifest.json` with
 * its two documents. A repository test checks the manifest against the files on
 * disk, their bytes, and this list (D43.6).
 */
export const compatibilityCorpus: readonly CompatibilityEntry[] = deepFreeze(
  manifest.entries.map((entry) => ({
    id: entry.id,
    schemaVersion: entry.schemaVersion,
    input: fileOf(entry.input),
    inputFile: entry.input,
    inputSha256: entry.inputSha256,
    versions: entry.versions,
    expected: fileOf(entry.expected),
    expectedFile: entry.expected,
    expectedSha256: entry.expectedSha256,
    expectedCompositionHash: entry.expectedCompositionHash,
  })),
);
