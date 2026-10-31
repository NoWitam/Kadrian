/**
 * @kadrion/editor-session — the host facade (D44).
 *
 * `createEditorSession` joins one document, the command bus over it
 * (`@kadrion/editor-sdk`), and a Player (`@kadrion/player`) that shows it: every
 * change committed on the bus reaches the preview through `Player.update`, at
 * the time it shows, and the host hears about documents, history, playback, and
 * preview errors through one table of events. It holds no domain rule.
 */
export { createEditorSession } from './session.js';
export type {
  EditorSession,
  EditorSessionOptions,
  SessionEvent,
  SessionHistory,
  SessionListener,
  SessionListenerErrorHandler,
} from './session.js';
