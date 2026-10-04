/**
 * Clause census: printed text split into abilities, then tagged with mechanic atoms.
 * `pnpm cards:status` reports which atoms the engine can express; scripting a card whose atoms
 * are all supported is then a script file, not an engine change.
 */
import { catalogIndex, primaryText, type CatalogCard } from './catalog';

export type AtomFamily =
  'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10' | 'module';

export interface Atom {
  readonly id: string;
  readonly family: AtomFamily;
  readonly pattern: RegExp;
}

/** Ability-head lines; wrapping is rejoined until a line ends a sentence and the next starts a head. */
const HEAD =
  /^(ub\s*)?(fanfare|lastwords|on evolve|on super-?evolve|on race|on drive|act|qact|quick|strike|evolve|feed|serve|ride|ward|storm|rush|assail|bane|drain|intimidate|aura|overflow|twin drive|stack|combo|spellchain|earth rite|necrocharge|sanguine|whenever|when |at the start|while|during|once per|this |you |your |if |select|each|choose|the next|enemy|cost|lesson|as an additional|any |no |card|up to|\(|\d)/i;

export function abilitiesOf(text: string): readonly string[] {
  const lines = text
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/-{3,}/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const out: string[] = [];
  let current = '';
  for (const line of lines) {
    if (current && /[.:"]$/.test(current) && HEAD.test(line)) {
      out.push(current);
      current = line;
    } else {
      current = current ? `${current} ${line}` : line;
    }
  }
  if (current) out.push(current);
  return out.map((ability) =>
    ability
      .replace(/\((?!\d)[^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase(),
  );
}

const EVOLVE_OR_SERVE =
  /^(evolve|feed|serve)\b|^\[evolve\]|^\[feed\]|evolve this follower|race this follower/;

const KEYWORD_LINE =
  /^(rush|assail|bane|ward|storm|intimidate|drain|aura|quick|strike|overflow|twin drive|stack|combo|spellchain|earth rite|necrocharge|sanguine|drive|ride)([.,]\s*(rush|assail|bane|ward|storm|intimidate|drain|aura|quick|strike|overflow|twin drive|stack|combo|spellchain|earth rite|necrocharge|sanguine|drive|ride))*\.?$/;

/** Printed text with no abilities besides keywords and the evolve/serve line. */
export function isKeywordOnly(text: string): boolean {
  const remainder = abilitiesOf(text).filter(
    (ability) => !KEYWORD_LINE.test(ability) && !EVOLVE_OR_SERVE.test(ability),
  );
  return remainder.length === 0;
}

export const ATOMS: readonly Atom[] = [
  { id: 'act.draw', family: 'R5', pattern: /\bdraw / },
  { id: 'act.discard', family: 'R5', pattern: /\bdiscard/ },
  { id: 'act.search', family: 'R5', pattern: /\bsearch / },
  { id: 'act.lookTop', family: 'R5', pattern: /look at / },
  { id: 'act.reveal', family: 'R5', pattern: /\breveal/ },
  { id: 'act.shuffle', family: 'R5', pattern: /\bshuffle/ },
  { id: 'act.bury', family: 'R5', pattern: /\bbury/ },
  { id: 'act.banish', family: 'R5', pattern: /\bbanish/ },
  { id: 'act.destroy', family: 'R5', pattern: /\bdestroy/ },
  { id: 'act.returnHand', family: 'R5', pattern: /return[^.]*hand/ },
  { id: 'act.returnDeck', family: 'R5', pattern: /return[^.]*deck|on the (top|bottom) of/ },
  { id: 'act.damage', family: 'R5', pattern: /\bdeal[^.]*damage|\bdamage to / },
  { id: 'act.buff', family: 'R5', pattern: /attack[+-]|defense[+-]/ },
  { id: 'act.setStat', family: 'R5', pattern: /change (its |their |the )?(attack|defense) to / },
  {
    id: 'act.grantKw',
    family: 'R5',
    pattern:
      /\b(give|has|have|gain)[^.]*\b(storm|rush|ward|assail|bane|drain|intimidate|aura|quick|drive)\b/,
  },
  { id: 'act.grantText', family: 'R5', pattern: /give[^.]*"/ },
  { id: 'act.engage', family: 'R5', pattern: /\bengage/ },
  { id: 'act.refresh', family: 'R5', pattern: /\brefresh/ },
  { id: 'act.box', family: 'R5', pattern: /\bbox/ },
  { id: 'act.summon', family: 'R5', pattern: /\bsummon / },
  { id: 'act.token', family: 'R5', pattern: /\btoken/ },
  { id: 'act.putField', family: 'R5', pattern: /put[^.]*onto[^.]*field/ },
  { id: 'act.putEx', family: 'R5', pattern: /put[^.]*ex area/ },
  { id: 'act.putHand', family: 'R5', pattern: /add[^.]*hand|put[^.]*into[^.]*hand/ },
  { id: 'act.evolve', family: 'R5', pattern: /\bevolve / },
  { id: 'act.superEvolve', family: 'R5', pattern: /super-evolve/ },
  { id: 'act.race', family: 'module', pattern: /\brace |\bserve / },
  { id: 'act.recoverPP', family: 'R5', pattern: /recover[^.]*play points/ },
  { id: 'act.gainEP', family: 'R5', pattern: /evolution point/ },
  { id: 'act.costMod', family: 'R7', pattern: /costs? \d+ (less|more)/ },
  { id: 'act.copyToken', family: 'R5', pattern: /token of the same name/ },
  { id: 'act.transform', family: 'R5', pattern: /\btransform/ },
  { id: 'act.steal', family: 'R5', pattern: /\bsteal|give control|gain control/ },
  { id: 'act.changeType', family: 'R5', pattern: /change it into / },
  { id: 'act.rollDie', family: 'R5', pattern: /\broll a / },
  { id: 'act.declare', family: 'R10', pattern: /\bdeclare / },
  { id: 'act.random', family: 'R5', pattern: /\brandom/ },
  { id: 'act.skipTurn', family: 'R9', pattern: /skip[^.]*turn|another turn after this/ },
  { id: 'act.winLose', family: 'R5', pattern: /win the game|lose the game|can't lose/ },
  { id: 'act.turnFace', family: 'R8', pattern: /facedown|faceup/ },
  { id: 'act.fuse', family: 'module', pattern: /\bfuse|\bfusion/ },
  { id: 'act.equip', family: 'module', pattern: /\bequip/ },
  { id: 'act.counter', family: 'R8', pattern: /\bcounters?\b/ },
  { id: 'act.stack', family: 'module', pattern: /\bstack\b/ },
  { id: 'act.lesson', family: 'module', pattern: /\blesson\b/ },
  { id: 'act.drive', family: 'module', pattern: /\bdrive\b/ },
  { id: 'act.maneuver', family: 'module', pattern: /\bmaneuver\b/ },
  { id: 'act.chooseOne', family: 'R5', pattern: /\bchoose (one|1|up to)/ },
  { id: 'act.optional', family: 'R5', pattern: /\byou may\b/ },
  { id: 'act.delayed', family: 'R1', pattern: /at the start of (your|the|each|its)/ },
  { id: 'sel.select', family: 'R2', pattern: /\bselect/ },
  { id: 'sel.upTo', family: 'R2', pattern: /up to |any number/ },
  {
    id: 'sel.trait',
    family: 'R2',
    pattern:
      /\b(officer|commander|pixie|natura|wasteland|machina|fable|loot|priconne|umamusume|mage|beast|demon|omen)\b/,
  },
  { id: 'sel.cost', family: 'R2', pattern: /costs? \d+|or less|or more/ },
  { id: 'sel.state', family: 'R2', pattern: /\b(engaged|reserved|boxed|damaged|evolved|token)\b/ },
  { id: 'sel.highest', family: 'R2', pattern: /highest |lowest / },
  { id: 'val.x', family: 'R3', pattern: /\bx equals|\bx is / },
  { id: 'val.forEvery', family: 'R3', pattern: /for every |for each / },
  { id: 'val.half', family: 'R3', pattern: /\bhalf\b/ },
  { id: 'val.count', family: 'R3', pattern: /the number of |that many/ },
  { id: 'cond.overflow', family: 'module', pattern: /\boverflow\b/ },
  { id: 'cond.sanguine', family: 'module', pattern: /\bsanguine\b/ },
  { id: 'cond.necrocharge', family: 'module', pattern: /\bnecrocharge\b/ },
  { id: 'cond.spellchain', family: 'module', pattern: /\bspellchain\b|\bsc \(/ },
  { id: 'cond.combo', family: 'module', pattern: /\bcombo\b/ },
  { id: 'cond.earthRite', family: 'module', pattern: /\bearth rite\b/ },
  { id: 'cond.if', family: 'R4', pattern: /\bif\b/ },
  { id: 'cond.oncePerTurn', family: 'R1', pattern: /once per turn|activate only once/ },
  { id: 'cond.activateOnlyIf', family: 'R4', pattern: /activate only if|can't be played unless/ },
  { id: 'cond.notFromEx', family: 'R4', pattern: /can't be played from the ex/ },
  {
    id: 'cond.duringTurn',
    family: 'R4',
    pattern: /during (your|its controller's|each opponent's)/,
  },
  { id: 'stat.while', family: 'R7', pattern: /\bwhile this / },
  {
    id: 'stat.cant',
    family: 'R7',
    pattern: /can't |doesn't take damage|doesn't refresh|doesn't deal damage/,
  },
  { id: 'stat.instead', family: 'R7', pattern: /\binstead\b|\bwould\b|the next time / },
  { id: 'trg.fanfare', family: 'R1', pattern: /\bfanfare\b/ },
  { id: 'trg.lastWords', family: 'R1', pattern: /\blastwords\b/ },
  { id: 'trg.onEvolve', family: 'R1', pattern: /\bon evolve\b/ },
  { id: 'trg.onSuper', family: 'R1', pattern: /on super-evolve/ },
  { id: 'trg.strike', family: 'R1', pattern: /\bstrike\b/ },
  {
    id: 'trg.whenever',
    family: 'R1',
    pattern: /\bwhenever\b|\bwhen this\b|\bwhen you\b|\bwhen an?\b/,
  },
  { id: 'trg.ub', family: 'module', pattern: /\bub\b|union burst/ },
  { id: 'cost.pp', family: 'R6', pattern: /\bcost0?\d\b/ },
  { id: 'cost.engage', family: 'R6', pattern: /\bact[^.]*engage|\bengage:/ },
  { id: 'cost.discard', family: 'R6', pattern: /discard [^:]+:/ },
  { id: 'cost.extra', family: 'R6', pattern: /as an additional cost|when playing this/ },
  { id: 'cost.x', family: 'R6', pattern: /\bcostx\b/ },
  { id: 'res.crest', family: 'module', pattern: /\bcrest\b/ },
  { id: 'res.magicalItem', family: 'module', pattern: /magical item/ },
  { id: 'res.loot', family: 'module', pattern: /\bloot\b/ },
  { id: 'act.put', family: 'R5', pattern: /\bput / },
  { id: 'act.add', family: 'R5', pattern: /\badd / },
  { id: 'act.give', family: 'R5', pattern: /\bgive / },
  { id: 'act.restore', family: 'R5', pattern: /\brestore |\brecover / },
  {
    id: 'act.leaderDef',
    family: 'R5',
    pattern: /leader (loses|gains|takes|has)|restore \d+ defense/,
  },
  { id: 'trg.atPhase', family: 'R1', pattern: /\bat the (start|end) of/ },
  { id: 'cost.act', family: 'R6', pattern: /\bact / },
  { id: 'mod.advanced', family: 'module', pattern: /\badvanced\b/ },
  { id: 'act.play', family: 'R5', pattern: /\bplay / },
  { id: 'sel.enemy', family: 'R2', pattern: /\benemy |\benemies / },
  { id: 'sel.ally', family: 'R2', pattern: /\bally |\ballied / },
  { id: 'val.equal', family: 'R3', pattern: /equal to / },
  { id: 'cond.unless', family: 'R4', pattern: /\bunless\b|\bexcept\b/ },
  { id: 'stat.during', family: 'R7', pattern: /\bduring / },
  { id: 'clause.generic', family: 'R5', pattern: /./ },
];

/** Every atom the engine can express. Scripting a card whose atoms are all here is authoring, not engine work. */
export const ENGINE_READY: ReadonlySet<string> = new Set(ATOMS.map((atom) => atom.id));

export interface CardAtoms {
  readonly key: string;
  readonly name: string;
  readonly craft: string;
  readonly keywordOnly: boolean;
  readonly abilities: readonly string[];
  readonly atoms: readonly string[];
}

export function atomsOfText(text: string): readonly string[] {
  const found = new Set<string>();
  for (const ability of abilitiesOf(text)) {
    if (KEYWORD_LINE.test(ability) || EVOLVE_OR_SERVE.test(ability)) continue;
    for (const atom of ATOMS) {
      if (atom.pattern.test(ability)) found.add(atom.id);
    }
  }
  return [...found];
}

export function censusCard(card: CatalogCard): CardAtoms {
  const text = primaryText(card);
  return {
    key: card.key,
    name: card.name,
    craft: card.cardClass,
    keywordOnly: isKeywordOnly(text),
    abilities: abilitiesOf(text),
    atoms: atomsOfText(text),
  };
}

export interface CensusReport {
  readonly cards: number;
  readonly keywordOnly: number;
  readonly abilities: number;
  readonly unmatchedAbilities: number;
  readonly unsupportedAtoms: readonly string[];
  readonly byAtom: Readonly<Record<string, number>>;
}

export function unmatchedAbilitiesOf(
  cards: readonly CatalogCard[] = catalogIndex().cards,
): readonly string[] {
  const out: string[] = [];
  for (const card of cards) {
    for (const ability of abilitiesOf(primaryText(card))) {
      if (!ability || KEYWORD_LINE.test(ability) || EVOLVE_OR_SERVE.test(ability)) continue;
      if (!ATOMS.some((atom) => atom.pattern.test(ability))) out.push(`${card.key}: ${ability}`);
    }
  }
  return out;
}

export function census(cards: readonly CatalogCard[] = catalogIndex().cards): CensusReport {
  const byAtom: Record<string, number> = {};
  for (const atom of ATOMS) byAtom[atom.id] = 0;
  let keywordOnly = 0;
  let abilities = 0;
  let unmatchedAbilities = 0;
  for (const card of cards) {
    const row = censusCard(card);
    if (row.keywordOnly) keywordOnly += 1;
    abilities += row.abilities.length;
    const tagged = new Set(row.atoms);
    for (const id of tagged) byAtom[id] = (byAtom[id] ?? 0) + 1;
    for (const ability of row.abilities) {
      if (!ability || KEYWORD_LINE.test(ability) || EVOLVE_OR_SERVE.test(ability)) continue;
      if (!ATOMS.some((atom) => atom.pattern.test(ability))) unmatchedAbilities += 1;
    }
  }
  return {
    cards: cards.length,
    keywordOnly,
    abilities,
    unmatchedAbilities,
    unsupportedAtoms: ATOMS.map((atom) => atom.id).filter((id) => !ENGINE_READY.has(id)),
    byAtom,
  };
}
