import { textHash, type Ability, type CardScript } from '@sve/rules';

export const EVOLVE_1 = '[evolve] [cost01]: Evolve this follower.';
export const FEED_1 = '[feed] [cost01]: Race this follower.';

export function printed(...lines: string[]): string {
  return lines.filter((line) => line.length > 0).join('\n');
}

export function defineCard(spec: {
  readonly name: string;
  readonly text: string;
  readonly abilities: readonly Ability[];
  readonly alsoNamed?: readonly string[];
}): CardScript {
  return {
    name: spec.name,
    textHash: textHash(spec.text),
    abilities: spec.abilities,
    ...(spec.alsoNamed ? { alsoNamed: spec.alsoNamed } : {}),
  };
}
