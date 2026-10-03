import type { CardCatalog, CardDefinition } from '@sve/rules';

export interface CatalogCacheOptions {
  /** Fetches the whole catalog from the source of truth. */
  readonly load: () => Promise<readonly CardDefinition[]>;
  /** How long a loaded catalog is served before it is refreshed. */
  readonly ttlMs: number;
  /** Injected for tests. */
  readonly now?: () => number;
}

/**
 * The catalog is shared by every match, so keep one copy and refresh it in one flight.
 * A failed refresh keeps serving the stale copy: an upstream blip must not stop new matches.
 */
export function createCatalogCache(options: CatalogCacheOptions): () => Promise<CardCatalog> {
  const { load, ttlMs, now = Date.now } = options;
  let cached: { catalog: CardCatalog; loadedAt: number } | null = null;
  let refreshing: Promise<CardCatalog> | null = null;

  async function refresh(): Promise<CardCatalog> {
    const cards = await load();
    const byId = new Map<string, CardDefinition>(cards.map((card) => [card.id, card]));
    const catalog: CardCatalog = (id) => byId.get(id);
    cached = { catalog, loadedAt: now() };
    return catalog;
  }

  return () => {
    if (cached && now() - cached.loadedAt < ttlMs) return Promise.resolve(cached.catalog);
    refreshing ??= refresh()
      .catch((error: unknown) => {
        if (cached) return cached.catalog;
        throw error;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };
}
