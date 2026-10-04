import { textHash, type CardDefinition, type CardScript } from '@sve/rules';
import { SCRIPT_MODULES } from './scripts.generated';

function isCardScript(value: unknown): value is CardScript {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CardScript).key === 'string' &&
    typeof (value as CardScript).textHash === 'string' &&
    Array.isArray((value as CardScript).abilities)
  );
}

/** Every script of every `<craft>/<card>.ts` file (see `pnpm gen:scripts`). */
export const ALL_SCRIPTS: readonly CardScript[] = SCRIPT_MODULES.flatMap((module) =>
  Object.values(module).filter(isCardScript),
);

const BY_KEY = new Map(ALL_SCRIPTS.map((script) => [script.key, script]));

function hashesOf(script: CardScript): ReadonlySet<string> {
  return new Set([script.textHash, ...(script.alsoHashes ?? [])]);
}

/**
 * A matching key with the same printed-text hash is scripted. A matching key with a
 * different hash is treated as unscripted (text drift).
 */
export function scriptFor(def: CardDefinition): CardScript | null {
  const script = BY_KEY.get(def.key);
  if (!script) return null;
  if (!hashesOf(script).has(textHash(def.text))) return null;
  return script;
}

export function scriptDrift(def: CardDefinition): CardScript | null {
  const script = BY_KEY.get(def.key);
  if (!script) return null;
  if (hashesOf(script).has(textHash(def.text))) return null;
  return script;
}
