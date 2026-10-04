import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { textHash } from '@sve/rules';
import { describe, expect, it } from 'vitest';
import { catalogCard, catalogIndex } from './catalog';
import { CRAFT_DIRS } from './crafts';
import { ALL_SCRIPTS } from './registry';
import { SCRIPT_FILES, SCRIPT_MODULES } from './scripts.generated';

const SRC = import.meta.dirname;

function filesOnDisk(): string[] {
  return CRAFT_DIRS.flatMap((craft) => {
    try {
      return readdirSync(join(SRC, craft))
        .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
        .sort()
        .map((name) => `${craft}/${name.slice(0, -3)}`);
    } catch {
      return [];
    }
  });
}

const slugOf = (key: string) => key.replace(/[@#].*$/, '');

describe('script layout', () => {
  it('indexes every script file (run `pnpm gen:scripts` after adding one)', () => {
    expect([...SCRIPT_FILES]).toEqual(filesOnDisk());
    expect(SCRIPT_MODULES).toHaveLength(SCRIPT_FILES.length);
  });

  it('keeps nothing in a folder that is not a craft', () => {
    const folders = readdirSync(SRC, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(folders.filter((name) => !(CRAFT_DIRS as readonly string[]).includes(name))).toEqual([]);
  });

  it('files each script under its card craft, named after the card', () => {
    SCRIPT_FILES.forEach((file, i) => {
      const [craft, name] = file.split('/') as [string, string];
      const scripts = Object.values(SCRIPT_MODULES[i] ?? {}).filter(
        (value): value is { key: string } =>
          typeof value === 'object' && value !== null && 'key' in value,
      );
      expect(scripts.length, `${file} exports no script`).toBeGreaterThan(0);
      for (const script of scripts) {
        const card = catalogCard(script.key);
        expect(slugOf(script.key), `${file} holds ${script.key}`).toBe(name);
        expect(card?.cardClass, `${script.key} is filed under ${craft}`).toBe(craft);
      }
    });
  });

  it('exports only scripts from a script file', () => {
    SCRIPT_FILES.forEach((file, i) => {
      const exported = Object.values(SCRIPT_MODULES[i] ?? {});
      const scripts = ALL_SCRIPTS.filter((script) => exported.includes(script));
      expect(scripts.length, file).toBe(exported.length);
    });
  });
});

describe('catalog identity', () => {
  it('pins the names that are shared by different kinds of card', () => {
    // Same key, different kind: told apart only by the text hash. Grows only on purpose.
    const clashes = catalogIndex()
      .cards.filter((card) => card.printings.some((printing) => printing.facts?.kind !== undefined))
      .map((card) => card.key)
      .sort();
    expect(clashes).toEqual(['rulenye-echoing-scream@token']);
  });

  it('covers every printing of a scripted card, or says which ones are not reviewed', () => {
    const unreviewed = ALL_SCRIPTS.flatMap((script) => {
      const card = catalogCard(script.key);
      if (!card) return [];
      const covered = new Set([script.textHash, ...(script.alsoHashes ?? [])]);
      return card.printings
        .filter((printing) => !covered.has(textHash(printing.text)))
        .map((printing) => `${script.key} #${printing.id} (${printing.originalCardId})`);
    });
    // A printing worded differently is served unscripted. Review it, then add
    // `{ allPrintings: true }` to the script (see scriptOf).
    expect(unreviewed).toEqual([]);
  });
});
