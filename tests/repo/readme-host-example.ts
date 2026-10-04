/**
 * The host example of the README (section 2, "Save and load"), as a module, so
 * that `readme-host-example.test.ts` runs the very code the README prints: the
 * test compares everything below this comment with the README's block.
 */
import {
  createCommandBus,
  type BusListener,
  type CommandBus,
  type ListenerErrorHandler,
} from '@kadrion/editor-sdk';
import {
  parseComposition,
  serializeComposition,
  type ParseCompositionResult,
} from '@kadrion/schema/migrate';

/** What a host keeps for the document that is open. */
interface Session {
  readonly bus: CommandBus;
  readonly unsubscribe: () => void;
}

export interface Host {
  open(text: string): ParseCompositionResult;
  save(): string | null;
  bus(): CommandBus | null;
}

export function createHost(onChange: BusListener, onListenerError: ListenerErrorHandler): Host {
  let session: Session | null = null;
  return {
    open(text) {
      const loaded = parseComposition(text);
      // Refused: the open document, its history, and its listener stay as they are.
      if (!loaded.ok) return loaded;
      // A new bus, and so a fresh history, for the loaded document (D32). It is
      // built and subscribed before it is published in one assignment.
      const bus = createCommandBus(loaded.composition, { onListenerError });
      const unsubscribe = bus.subscribe(onChange);
      session?.unsubscribe();
      session = { bus, unsubscribe };
      // loaded.versions.length > 1: it was migrated; store it as a new version (D02).
      return loaded;
    },
    save() {
      if (session === null) return null;
      const saved = serializeComposition(session.bus.getDocument());
      return saved.ok ? saved.text : null;
    },
    bus: () => session?.bus ?? null,
  };
}
