import {
  asCardDefId,
  cardKey,
  type CardClass,
  type CardDefId,
  type CardDefinition,
  type Keyword,
} from '@sve/rules';

/**
 * Placeholder cards for local development, shaped like what the real catalog will return.
 * The names are invented and the numbers are only plausible: nothing here is balance data.
 */

type Row = readonly [
  name: string,
  cost: number,
  attack: number,
  defense: number,
  ...keywords: Keyword[],
];

const SWORDCRAFT: readonly Row[] = [
  ['Ashen Squire', 1, 1, 2],
  ['Banner Bearer', 2, 2, 2],
  ['Gatehouse Sentry', 2, 1, 3, 'ward'],
  ['Duelist of the Vale', 3, 3, 2],
  ['Lancer Recruit', 3, 2, 2, 'rush'],
  ['Oathbound Knight', 4, 4, 3],
  ['Shieldwall Veteran', 4, 3, 5, 'ward'],
  ['Crimson Marshal', 5, 4, 5],
  ['Sky Cavalier', 5, 5, 3, 'storm'],
  ['Order Champion', 6, 6, 5],
  ['Siege Captain', 7, 7, 6],
  ['Warlord Aurelian', 8, 8, 8],
];

const FORESTCRAFT: readonly Row[] = [
  ['Moss Fawn', 1, 1, 1],
  ['Thornback Boar', 2, 2, 3],
  ['Glade Warden', 2, 1, 4, 'ward'],
  ['Whisper Archer', 3, 3, 2],
  ['Vine Stalker', 3, 2, 3, 'rush'],
  ['Elder Treant', 4, 3, 6],
  ['Wild Hunter', 4, 4, 3],
  ['Rootbound Beast', 5, 5, 5],
  ['Canopy Drake', 5, 4, 4, 'storm'],
  ['Grove Matriarch', 6, 5, 7],
  ['Briar Titan', 7, 8, 7],
  ['Sylvan Sovereign', 8, 9, 9],
];

const NEUTRAL: readonly Row[] = [
  ['Wandering Mercenary', 1, 2, 1],
  ['Torch Bearer', 2, 2, 2],
  ['Roadside Medic', 2, 1, 3],
  ['Market Guard', 3, 2, 4, 'ward'],
  ['Stray Hound', 3, 3, 1, 'rush'],
  ['Cave Troll', 5, 5, 6],
  ['Iron Golem', 6, 6, 6],
  ['Mountain Giant', 7, 8, 8],
];

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const keywordText = (keywords: readonly Keyword[]): string =>
  keywords.map((keyword) => keyword[0]?.toUpperCase() + keyword.slice(1)).join('. ');

function follower(row: Row, cardClass: CardClass): CardDefinition {
  const [name, cost, attack, defense, ...keywords] = row;
  return {
    id: asCardDefId(`fx-${slug(name)}`),
    key: cardKey(name),
    name,
    kind: 'follower',
    special: null,
    cardClass,
    universe: null,
    traits: [],
    cost,
    attack,
    defense,
    keywords,
    text: keywordText(keywords),
    artUrl: null,
  };
}

/** The evolved side of a follower: same name, no cost, +2/+2. */
function evolved(base: CardDefinition): CardDefinition {
  return {
    ...base,
    id: asCardDefId(`${base.id}-evolved`),
    key: cardKey(base.name, 'evolved'),
    special: 'evolved',
    cost: 0,
    attack: (base.attack ?? 0) + 2,
    defense: (base.defense ?? 0) + 2,
  };
}

function leader(cardClass: CardClass, name: string): CardDefinition {
  return {
    id: asCardDefId(`fx-leader-${cardClass}`),
    key: cardKey(name),
    name,
    kind: 'leader',
    special: null,
    cardClass,
    universe: null,
    traits: [],
    cost: 0,
    attack: null,
    defense: null,
    keywords: [],
    text: '',
    artUrl: null,
  };
}

const swordcraft = SWORDCRAFT.map((row) => follower(row, 'swordcraft'));
const forestcraft = FORESTCRAFT.map((row) => follower(row, 'forestcraft'));
const neutral = NEUTRAL.map((row) => follower(row, 'neutral'));

const SWORDCRAFT_LEADER = leader('swordcraft', 'Aurelia, Vanguard');
const FORESTCRAFT_LEADER = leader('forestcraft', 'Sylas, Wayfinder');
const LEADERS = [SWORDCRAFT_LEADER, FORESTCRAFT_LEADER];

const ALL: readonly CardDefinition[] = [
  ...LEADERS,
  ...[...swordcraft, ...forestcraft, ...neutral].flatMap((card) => [card, evolved(card)]),
];

const byId = new Map<CardDefId, CardDefinition>(ALL.map((card) => [card.id, card]));

export const fixtureDefinitions: readonly CardDefinition[] = ALL;

export const fixtureCatalog = (id: CardDefId): CardDefinition | undefined => byId.get(id);

export const fixtureLeaders = {
  swordcraft: SWORDCRAFT_LEADER.id,
  forestcraft: FORESTCRAFT_LEADER.id,
};

/** Followers a class deck draws from: its own twelve plus the shared eight. */
export const fixturePools = {
  swordcraft: [...swordcraft, ...neutral],
  forestcraft: [...forestcraft, ...neutral],
} as const;

/** The evolved id belonging to a base follower. */
export const evolvedIdOf = (base: CardDefinition): CardDefId => asCardDefId(`${base.id}-evolved`);
