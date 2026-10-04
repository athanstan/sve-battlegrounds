import { definitionOf, type MatchState } from '../state/state';
import type { CardId, Seat } from '../model/ids';
import type { Transcript } from './transcript';
import {
  moveCards,
  payEvolutionPoints,
  payPlayPoints,
  paySuperEvolutionPoints,
  updateFieldCard,
} from './move';
import { parseServeCost } from '../abilities/generic';
import { evolvePlayCost } from '../abilities/statics';

export function correspondingEvolve(
  state: MatchState,
  seat: Seat,
  fieldCard: CardId,
): CardId | undefined {
  const fieldNames = new Set(namesOf(state, fieldCard));
  return state.seats[seat].evolveDeck.find((id) => {
    const def = definitionOf(state, id);
    if (fieldNames.has(def.name)) return true;
    const script = state.scripts[def.id];
    return script?.alsoNamed?.some((name) => fieldNames.has(name)) ?? false;
  });
}

export function namesOf(state: MatchState, card: CardId): readonly string[] {
  const def = definitionOf(state, card);
  const aliases = state.scripts[def.id]?.alsoNamed ?? [];
  return aliases.length === 0 ? [def.name] : [def.name, ...aliases];
}

export function correspondingCarrot(state: MatchState, seat: Seat): CardId | undefined {
  return state.seats[seat].evolveDeck.find((id) => {
    const names = namesOf(state, id);
    return names.includes('Carrot') || names.some((name) => name.includes('Carrot'));
  });
}

export function evolveFollower(
  t: Transcript,
  seat: Seat,
  fieldCard: CardId,
  args: {
    readonly superEvolve: boolean;
    readonly useEvolutionPoint: boolean;
    readonly free?: boolean;
  },
): boolean {
  const evolveCard = correspondingEvolve(t.state, seat, fieldCard);
  if (!evolveCard) return false;
  if (t.state.seats[seat].evolveZone.some((link) => link.linkedTo === fieldCard)) return false;
  const cost = args.free ? 0 : (evolvePlayCost(t.state, fieldCard) ?? 0);
  if (!args.free) {
    const pp = args.useEvolutionPoint ? Math.max(0, cost - 1) : cost;
    payPlayPoints(t, seat, pp);
    if (args.useEvolutionPoint) payEvolutionPoints(t, seat, 1);
    if (args.superEvolve) paySuperEvolutionPoints(t, seat, 1);
  } else if (args.superEvolve) {
    paySuperEvolutionPoints(t, seat, 1);
  }
  moveCards(t, {
    owner: seat,
    cards: [evolveCard],
    from: { zone: 'evolveDeck', seat },
    to: { zone: 'evolveZone', seat },
    cause: 'evolve',
    linkedTo: fieldCard,
    superEvolved: args.superEvolve,
  });
  if (args.superEvolve) {
    updateFieldCard(t, fieldCard, (card) => ({
      ...card,
      modifiers: [...card.modifiers, { attack: 1, defense: 1, until: null }],
    }));
  }
  t.emit({
    type: 'followerEvolved',
    seat,
    fieldCard,
    evolveCard,
    superEvolved: args.superEvolve,
  });
  return true;
}

export function serveFollower(
  t: Transcript,
  seat: Seat,
  fieldCard: CardId,
  args: { readonly useEvolutionPoint: boolean },
): boolean {
  const carrot = correspondingCarrot(t.state, seat);
  if (!carrot) return false;
  if (t.state.seats[seat].raceZone.some((link) => link.linkedTo === fieldCard)) return false;
  const printed = definitionOf(t.state, fieldCard);
  const cost = parseServeCost(printed.text) ?? 0;
  const pp = args.useEvolutionPoint ? Math.max(0, cost - 1) : cost;
  payPlayPoints(t, seat, pp);
  if (args.useEvolutionPoint) payEvolutionPoints(t, seat, 1);
  moveCards(t, {
    owner: seat,
    cards: [carrot],
    from: { zone: 'evolveDeck', seat },
    to: { zone: 'raceZone', seat },
    cause: 'serve',
    linkedTo: fieldCard,
  });
  const times =
    (t.state.seats[seat].field.find((card) => card.id === fieldCard)?.racedTimes ?? 0) + 1;
  t.emit({ type: 'followerRaced', seat, fieldCard, carrot, times });
  return true;
}
