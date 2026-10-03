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
import { parseEvolveCost, parseServeCost } from '../abilities/generic';

export function correspondingEvolve(
  state: MatchState,
  seat: Seat,
  fieldCard: CardId,
): CardId | undefined {
  const name = definitionOf(state, fieldCard).name;
  return state.seats[seat].evolveDeck.find((id) => definitionOf(state, id).name === name);
}

export function correspondingCarrot(state: MatchState, seat: Seat): CardId | undefined {
  return state.seats[seat].evolveDeck.find((id) => {
    const def = definitionOf(state, id);
    const script = state.scripts[def.id];
    return (script?.alsoNamed?.includes('Carrot') ?? false) || def.name.includes('Carrot');
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
  const printed = definitionOf(t.state, fieldCard);
  const cost = args.free ? 0 : (parseEvolveCost(printed.text) ?? 0);
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
