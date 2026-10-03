import type { CardCatalog, CardDefId, CardDefinition } from '@sve/rules';

/**
 * The card definitions this browser has learned so far, fetched on demand.
 *
 * A card's face cannot be drawn until its definition arrives, so the table shows a plain card
 * for a moment and redraws when `snapshot()` returns a new catalog. Ids that fail to load are
 * tried again the next time they are asked for, not in a loop.
 */
export class CatalogStore {
  readonly #known = new Map<CardDefId, CardDefinition>();
  readonly #asked = new Set<CardDefId>();
  readonly #listeners = new Set<() => void>();
  readonly #fetch: (ids: readonly CardDefId[]) => Promise<readonly CardDefinition[]>;
  #snapshot: CardCatalog;

  constructor(fetchCards: (ids: readonly CardDefId[]) => Promise<readonly CardDefinition[]>) {
    this.#fetch = fetchCards;
    this.#snapshot = this.#catalogNow();
  }

  /** Fetch whichever of `ids` are neither known nor already on their way. */
  ensure(ids: readonly CardDefId[]): void {
    const wanted = ids.filter((id) => !this.#known.has(id) && !this.#asked.has(id));
    if (wanted.length === 0) return;
    for (const id of wanted) this.#asked.add(id);

    void this.#fetch(wanted).then(
      (definitions) => {
        for (const definition of definitions) this.#known.set(definition.id, definition);
        // Ids the server did not know stay "asked": asking again would get the same answer.
        this.#changed();
      },
      () => {
        for (const id of wanted) this.#asked.delete(id);
      },
    );
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /**
   * What is known right now, as a lookup function. A different function comes back each time new
   * definitions arrive, which is what lets `useSyncExternalStore` notice and the mat repaint.
   */
  snapshot = (): CardCatalog => this.#snapshot;

  #catalogNow(): CardCatalog {
    return (id) => this.#known.get(id);
  }

  #changed(): void {
    this.#snapshot = this.#catalogNow();
    for (const listener of this.#listeners) listener();
  }
}
