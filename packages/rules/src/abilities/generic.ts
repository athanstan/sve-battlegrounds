/**
 * Evolve and Serve costs are printed on every follower, scripted or not:
 * `[evolve] [cost01]: Evolve this follower.` and `[feed] [cost01]: Race this follower.`
 */

export function parseEvolveCost(text: string): number | null {
  const match =
    /\[evolve\][\s\S]*?\[cost0?(\d+)\]/i.exec(text) ?? /evolve\s*cost0?(\d+)/i.exec(text);
  if (!match) return null;
  return Number(match[1]);
}

export function parseServeCost(text: string): number | null {
  const match = /\[feed\][\s\S]*?\[cost0?(\d+)\]/i.exec(text) ?? /feed\s*cost0?(\d+)/i.exec(text);
  if (!match) return null;
  return Number(match[1]);
}

/** Stable hash of normalized printed text, so a reprint with changed wording is a new script. */
export function textHash(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
