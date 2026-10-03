import {
  asCardDefId,
  type CardCatalog,
  type CardClass,
  type CardDefinition,
  type CardKind,
  type DeckList,
  type Keyword,
  type SpecialType,
} from '@sve/rules';
import { amatazText, amatazEvolvedText } from './forestcraft/amataz';
import {
  ariaFairyPrincessEvolvedText,
  ariaFairyPrincessText,
} from './forestcraft/aria-fairy-princess';
import { ariaLadyEvolvedText, ariaLadyText } from './forestcraft/aria-lady';
import { ccEvolvedText, ccText } from './forestcraft/cc';
import { cynthiaEvolvedText, cynthiaText } from './forestcraft/cynthia';
import { fairyCircleText } from './forestcraft/fairy-circle';
import { fairyWhispererEvolvedText, fairyWhispererText } from './forestcraft/fairy-whisperer';
import { feyboltArcherEvolvedText, feyboltArcherText } from './forestcraft/feybolt-archer';
import { lizaText } from './forestcraft/liza';
import { naturesGuidanceText } from './forestcraft/natures-guidance';
import { piercyeEvolvedText, piercyeText } from './forestcraft/piercye';
import { pixieOfTheForestText } from './forestcraft/pixie-of-the-forest';
import { spinariaEvolvedText, spinariaText } from './forestcraft/spinaria';
import { titaniaEvolvedText, titaniaText } from './forestcraft/titania';
import { waterFairyText } from './forestcraft/water-fairy';
import { carrotText, miracleCarrotText, victoryCarrotText } from './umamusume/carrots';
import { chevalGrandEvolvedText, chevalGrandText } from './umamusume/cheval-grand';
import { daiwaScarletText } from './umamusume/daiwa-scarlet';
import {
  grassWonderText,
  mejiroMcQueenText,
  niceNatureText,
  silenceSuzukaText,
  specialWeekText,
  symboliRudolfText,
  tokaiTeioText,
} from './umamusume/fillers';
import { goldShipText } from './umamusume/gold-ship';
import { hishiMiracleText } from './umamusume/hishi-miracle';
import { progenitorsText } from './umamusume/progenitors';
import { sevenMoreCentimetersText } from './umamusume/seven-more-centimeters';
import { trialInitiationText } from './umamusume/trial-initiation';
import { vodkaText } from './umamusume/vodka';

export interface FixtureCard {
  readonly id: string;
  readonly name: string;
  readonly kind: CardKind;
  readonly special: SpecialType | null;
  readonly cardClass: CardClass;
  readonly universe: string | null;
  readonly traits: readonly string[];
  readonly cost: number;
  readonly attack: number | null;
  readonly defense: number | null;
  readonly keywords: readonly Keyword[];
  readonly text: string;
  readonly count: number;
}

export interface FixtureDeck {
  readonly id: string;
  readonly name: string;
  readonly cards: readonly FixtureCard[];
}

const card = (
  id: string,
  name: string,
  kind: CardKind,
  extras: Partial<FixtureCard> & Pick<FixtureCard, 'text' | 'count' | 'cost'>,
): FixtureCard => ({
  id,
  name,
  kind,
  special: extras.special ?? null,
  cardClass: extras.cardClass ?? 'forestcraft',
  universe: extras.universe ?? null,
  traits: extras.traits ?? [],
  cost: extras.cost,
  attack: extras.attack ?? (kind === 'follower' ? 1 : null),
  defense: extras.defense ?? (kind === 'follower' ? 1 : null),
  keywords: extras.keywords ?? [],
  text: extras.text,
  count: extras.count,
});

const ON_CURVE: FixtureCard[] = [
  card('ld-liza', 'Liza, Queen of the Forest', 'leader', {
    cost: 0,
    attack: null,
    defense: null,
    text: lizaText,
    count: 1,
  }),
  card('fc', 'Fairy Circle', 'spell', { cost: 1, text: fairyCircleText, count: 3 }),
  card('ng', "Nature's Guidance", 'spell', { cost: 1, text: naturesGuidanceText, count: 2 }),
  card('wf', 'Water Fairy', 'follower', {
    cost: 1,
    attack: 1,
    defense: 1,
    traits: ['Pixie'],
    keywords: ['fanfare'],
    text: waterFairyText,
    count: 3,
  }),
  card('pix', 'Pixie of the Forest', 'follower', {
    cost: 2,
    attack: 2,
    defense: 2,
    traits: ['Pixie'],
    text: pixieOfTheForestText,
    count: 3,
  }),
  card('fa', 'Feybolt Archer', 'follower', {
    cost: 2,
    attack: 2,
    defense: 1,
    traits: ['Pixie', 'Hunter'],
    keywords: ['fanfare'],
    text: feyboltArcherText,
    count: 3,
  }),
  card('fw', 'Fairy Whisperer', 'follower', {
    cost: 3,
    attack: 2,
    defense: 3,
    traits: ['Pixie'],
    keywords: ['fanfare'],
    text: fairyWhispererText,
    count: 3,
  }),
  card('sp', 'Spinaria, Keeper of Secrets', 'follower', {
    cost: 2,
    attack: 2,
    defense: 2,
    keywords: ['fanfare'],
    text: spinariaText,
    count: 3,
  }),
  card('pr', 'Piercye, Queen of Frost', 'follower', {
    cost: 3,
    attack: 3,
    defense: 3,
    keywords: ['fanfare'],
    text: piercyeText,
    count: 3,
  }),
  card('am', 'Amataz, Truehero', 'follower', {
    cost: 4,
    attack: 4,
    defense: 4,
    keywords: ['fanfare'],
    text: amatazText,
    count: 3,
  }),
  card('cc', 'C.C.', 'follower', {
    cost: 4,
    attack: 3,
    defense: 5,
    keywords: ['fanfare'],
    text: ccText,
    count: 3,
  }),
  card('ti', 'Titania, Queen of Fairies', 'follower', {
    cost: 5,
    attack: 4,
    defense: 5,
    traits: ['Pixie'],
    text: titaniaText,
    count: 3,
  }),
  card('cy', "Cynthia, the Queen's Blade", 'follower', {
    cost: 5,
    attack: 5,
    defense: 7,
    text: cynthiaText,
    count: 2,
  }),
  card('ar', 'Aria, Fairy Princess', 'follower', {
    cost: 6,
    attack: 5,
    defense: 5,
    traits: ['Pixie', 'Princess'],
    keywords: ['ward', 'fanfare'],
    text: ariaFairyPrincessText,
    count: 3,
  }),
  card('al', 'Aria, Lady of the Woods', 'follower', {
    cost: 2,
    attack: 2,
    defense: 2,
    traits: ['Pixie'],
    keywords: ['fanfare'],
    text: ariaLadyText,
    count: 3,
  }),
  card('fa-e', 'Feybolt Archer', 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 4,
    defense: 3,
    traits: ['Pixie', 'Hunter'],
    keywords: ['onEvolve'],
    text: feyboltArcherEvolvedText,
    count: 1,
  }),
  card('fw-e', 'Fairy Whisperer', 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 4,
    defense: 5,
    traits: ['Pixie'],
    keywords: ['onEvolve'],
    text: fairyWhispererEvolvedText,
    count: 1,
  }),
  card('sp-e', 'Spinaria, Keeper of Secrets', 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 4,
    defense: 4,
    keywords: ['lastWords'],
    text: spinariaEvolvedText,
    count: 1,
  }),
  card('pr-e', 'Piercye, Queen of Frost', 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 5,
    defense: 5,
    keywords: ['aura'],
    text: piercyeEvolvedText,
    count: 1,
  }),
  card('am-e', 'Amataz, Truehero', 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 6,
    defense: 6,
    keywords: ['onEvolve'],
    text: amatazEvolvedText,
    count: 1,
  }),
  card('cc-e', 'C.C.', 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 5,
    defense: 7,
    keywords: ['onEvolve'],
    text: ccEvolvedText,
    count: 1,
  }),
  card('ti-e', 'Titania, Queen of Fairies', 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 6,
    defense: 7,
    traits: ['Pixie'],
    text: titaniaEvolvedText,
    count: 1,
  }),
  card('cy-e', "Cynthia, the Queen's Blade", 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 7,
    defense: 9,
    keywords: ['onEvolve'],
    text: cynthiaEvolvedText,
    count: 1,
  }),
  card('ar-e', 'Aria, Fairy Princess', 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 7,
    defense: 7,
    traits: ['Pixie', 'Princess'],
    keywords: ['ward', 'onEvolve'],
    text: ariaFairyPrincessEvolvedText,
    count: 1,
  }),
  card('al-e', 'Aria, Lady of the Woods', 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 4,
    defense: 4,
    traits: ['Pixie'],
    keywords: ['onEvolve', 'onSuperEvolve'],
    text: ariaLadyEvolvedText,
    count: 1,
  }),
];

const uma = (
  id: string,
  name: string,
  kind: CardKind,
  extras: Partial<FixtureCard> & Pick<FixtureCard, 'text' | 'count' | 'cost'>,
): FixtureCard =>
  card(id, name, kind, {
    cardClass: extras.cardClass ?? 'runecraft',
    universe: 'Umamusume',
    traits: extras.traits ?? ['Umamusume'],
    ...extras,
  });

const DAIWA_VODKA: FixtureCard[] = [
  uma('ld-rudolf', 'Symboli Rudolf', 'leader', {
    cardClass: 'runecraft',
    cost: 0,
    attack: null,
    defense: null,
    text: symboliRudolfText,
    count: 1,
  }),
  uma('trial', 'Trial Initiation', 'spell', {
    cardClass: 'swordcraft',
    cost: 1,
    traits: ['Umamusume', 'BNW'],
    text: trialInitiationText,
    count: 3,
  }),
  uma('7mc', '7 More Centimeters', 'spell', {
    cardClass: 'abysscraft',
    cost: 5,
    text: sevenMoreCentimetersText,
    count: 3,
  }),
  uma('cheval', 'Cheval Grand', 'follower', {
    cost: 2,
    attack: 2,
    defense: 2,
    keywords: ['fanfare'],
    text: chevalGrandText,
    count: 3,
  }),
  uma('hishi', 'Hishi Miracle', 'follower', {
    cardClass: 'abysscraft',
    cost: 2,
    attack: 2,
    defense: 2,
    keywords: ['fanfare'],
    text: hishiMiracleText,
    count: 3,
  }),
  uma('vodka', 'Vodka', 'follower', { cost: 3, attack: 3, defense: 3, text: vodkaText, count: 3 }),
  uma('daiwa', 'Daiwa Scarlet', 'follower', {
    cost: 4,
    attack: 3,
    defense: 4,
    keywords: ['fanfare'],
    text: daiwaScarletText,
    count: 3,
  }),
  uma('gold', 'Gold Ship', 'follower', {
    cost: 5,
    attack: 5,
    defense: 4,
    keywords: ['storm'],
    text: goldShipText,
    count: 3,
  }),
  uma('suzuka', 'Silence Suzuka', 'follower', {
    cost: 2,
    attack: 2,
    defense: 1,
    keywords: ['rush'],
    text: silenceSuzukaText,
    count: 3,
  }),
  uma('week', 'Special Week', 'follower', {
    cardClass: 'swordcraft',
    cost: 3,
    attack: 3,
    defense: 3,
    traits: ['Umamusume', 'BNW'],
    text: specialWeekText,
    count: 3,
  }),
  uma('teio', 'Tokai Teio', 'follower', {
    cardClass: 'swordcraft',
    cost: 4,
    attack: 4,
    defense: 3,
    traits: ['Umamusume', 'BNW'],
    text: tokaiTeioText,
    count: 3,
  }),
  uma('grass', 'Grass Wonder', 'follower', {
    cardClass: 'havencraft',
    cost: 3,
    attack: 2,
    defense: 4,
    keywords: ['ward'],
    text: grassWonderText,
    count: 3,
  }),
  uma('nice', 'Nice Nature', 'follower', {
    cardClass: 'abysscraft',
    cost: 2,
    attack: 2,
    defense: 3,
    text: niceNatureText,
    count: 3,
  }),
  uma('prog', 'Progenitors', 'follower', {
    cost: 1,
    attack: 1,
    defense: 1,
    keywords: ['fanfare'],
    text: progenitorsText,
    count: 3,
  }),
  uma('mcqueen', 'Mejiro McQueen', 'follower', {
    cost: 4,
    attack: 4,
    defense: 5,
    keywords: ['ward'],
    text: mejiroMcQueenText,
    count: 1,
  }),
  uma('carrot', 'Carrot', 'spell', { special: 'evolved', cost: 0, text: carrotText, count: 3 }),
  uma('mcarrot', 'Miracle Carrot', 'spell', {
    special: 'evolved',
    cost: 0,
    text: miracleCarrotText,
    count: 3,
  }),
  uma('vcarrot', 'Victory Carrot', 'spell', {
    special: 'evolved',
    cost: 0,
    text: victoryCarrotText,
    count: 3,
  }),
  uma('cheval-e', 'Cheval Grand', 'follower', {
    special: 'evolved',
    cost: 0,
    attack: 3,
    defense: 3,
    keywords: ['onEvolve'],
    text: chevalGrandEvolvedText,
    count: 1,
  }),
];

export const FIXTURE_DECKS: readonly FixtureDeck[] = [
  { id: '940', name: 'On Curve All Day', cards: ON_CURVE },
  { id: '909', name: 'daiwa vodka 2026', cards: DAIWA_VODKA },
];

export function definitionOf(card: FixtureCard): CardDefinition {
  return {
    id: asCardDefId(card.id),
    name: card.name,
    kind: card.kind,
    special: card.special,
    cardClass: card.cardClass,
    universe: card.universe,
    traits: card.traits,
    cost: card.cost,
    attack: card.attack,
    defense: card.defense,
    keywords: card.keywords,
    text: card.text,
    artUrl: null,
  };
}

export function fixtureCatalog(): CardCatalog {
  const byId = new Map(
    FIXTURE_DECKS.flatMap((deck) => deck.cards).map((card) => [card.id, definitionOf(card)]),
  );
  return (id) => byId.get(id);
}

export function deckListOf(deckId: string): DeckList {
  const deck = FIXTURE_DECKS.find((entry) => entry.id === deckId);
  if (!deck) throw new Error(`Unknown fixture deck ${deckId}`);
  const leader = deck.cards.find((card) => card.kind === 'leader');
  if (!leader) throw new Error(`Deck ${deckId} has no leader`);
  return {
    leader: asCardDefId(leader.id),
    main: deck.cards
      .filter((card) => card.kind !== 'leader' && card.special !== 'evolved')
      .map((card) => ({ card: asCardDefId(card.id), count: card.count })),
    evolve: deck.cards
      .filter((card) => card.special === 'evolved')
      .map((card) => ({ card: asCardDefId(card.id), count: card.count })),
  };
}

export function fixtureDump() {
  return {
    generatedAt: 'committed-fixture',
    note: 'Replace by running `pnpm dump:decks` against the shadowrates database. Coverage tests also read the in-repo fixture decks in src/fixture-data.ts.',
    decks: FIXTURE_DECKS.map((deck) => ({
      id: deck.id,
      name: deck.name,
      cards: deck.cards.map((card) => ({
        id: card.id,
        name: card.name,
        kind: card.kind,
        special: card.special,
        cardClass: card.cardClass,
        universe: card.universe,
        traits: [...card.traits],
        cost: card.cost,
        attack: card.attack,
        defense: card.defense,
        keywords: [...card.keywords],
        text: card.text,
        count: card.count,
      })),
    })),
  };
}

export function uniqueFixtureCards(): FixtureCard[] {
  const seen = new Set<string>();
  const out: FixtureCard[] = [];
  for (const deck of FIXTURE_DECKS) {
    for (const card of deck.cards) {
      const key = `${card.name}\n${card.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(card);
    }
  }
  return out;
}
