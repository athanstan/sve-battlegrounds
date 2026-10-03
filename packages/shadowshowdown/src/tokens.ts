import { DEFAULT_TOKENS, type CardDefinition } from '@sve/rules';

/** Lowest id with art per token name (9.1.2.3). Falls back to the engine's Appendix A prototypes. */
export function pickTokens(defs: readonly CardDefinition[]): ReadonlyMap<string, CardDefinition> {
  const ranked = defs
    .filter((def) => def.special === 'token')
    .slice()
    .sort((a, b) => {
      const art = Number(Boolean(b.artUrl)) - Number(Boolean(a.artUrl));
      if (art !== 0) return art;
      return a.id.localeCompare(b.id);
    });
  const byName = new Map<string, CardDefinition>(Object.entries(DEFAULT_TOKENS));
  for (const def of ranked) {
    if (!byName.has(def.name) || def.artUrl) byName.set(def.name, def);
  }
  return byName;
}
