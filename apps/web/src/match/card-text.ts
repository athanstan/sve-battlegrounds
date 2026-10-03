import type { Keyword } from '@sve/rules';

/**
 * Card text as the inspector shows it. The database keeps inline icons as their alt text
 * (`[cost01]`, `[fanfare]`, `[evolve]`), so a printed line reads "[evolve] [cost01]: Evolve this
 * follower." Here each line becomes a list of runs the view can style.
 */

export type TextRun =
  | { readonly kind: 'text'; readonly text: string }
  /** A play-point cost icon: `[cost03]` -> 3. */
  | { readonly kind: 'cost'; readonly amount: number }
  /** Any other bracketed icon, by its name: `[fanfare]` -> "Fanfare". */
  | { readonly kind: 'tag'; readonly label: string };

const TOKEN = /\[([^\]\n]{1,24})\]/g;

const titleCase = (raw: string): string =>
  raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

function runsOf(line: string): TextRun[] {
  const runs: TextRun[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const name = match[1] ?? '';
    if (match.index > last) runs.push({ kind: 'text', text: line.slice(last, match.index) });
    const cost = /^cost(\d+)$/i.exec(name);
    runs.push(
      cost?.[1] !== undefined
        ? { kind: 'cost', amount: Number(cost[1]) }
        : { kind: 'tag', label: titleCase(name) },
    );
    last = match.index + match[0].length;
  }
  if (last < line.length) runs.push({ kind: 'text', text: line.slice(last) });
  return runs;
}

/** One entry per printed line; blank lines are dropped. */
export function textLines(text: string): TextRun[][] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(runsOf);
}

/** "lastWords" -> "Last Words". */
export const keywordLabel = (keyword: Keyword): string => titleCase(keyword);
