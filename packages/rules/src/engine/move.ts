import type { CardDefinition } from '../model/cards';
import type { CardId, Seat } from '../model/ids';
import { asCardId } from '../model/ids';
import { type FieldCard, type MatchState } from '../state/state';
import type { ZoneRef } from '../state/zones-model';
import type { MoveCause } from '../state/zones-model';
import { locate } from '../state/zones';
import type { Transcript } from './transcript';
import { fieldOf } from './derived';
import { staticPlayCost } from '../abilities/statics';
import { shuffle } from '../rng';

export function moveCards(
  t: Transcript,
  args: {
    readonly owner: Seat;
    readonly cards: readonly CardId[];
    readonly from: ZoneRef;
    readonly to: ZoneRef;
    readonly cause: MoveCause;
    readonly faceDown?: boolean;
    readonly placement?: 'reserved' | 'engaged';
    readonly enteredTurn?: number;
    readonly linkedTo?: CardId;
    readonly superEvolved?: boolean;
    readonly position?: 'top' | 'bottom';
  },
): void {
  if (args.cards.length === 0) return;
  t.emit({
    type: 'cardsMoved',
    owner: args.owner,
    cards: args.cards,
    from: args.from,
    to: args.to,
    cause: args.cause,
    ...(args.faceDown !== undefined ? { faceDown: args.faceDown } : {}),
    ...(args.placement !== undefined ? { placement: args.placement } : {}),
    ...(args.enteredTurn !== undefined ? { enteredTurn: args.enteredTurn } : {}),
    ...(args.linkedTo !== undefined ? { linkedTo: args.linkedTo } : {}),
    ...(args.superEvolved !== undefined ? { superEvolved: args.superEvolved } : {}),
    ...(args.position !== undefined ? { position: args.position } : {}),
  });
}

export function zoneOf(state: MatchState, id: CardId): ZoneRef {
  const found = locate(state, id);
  if (!found) throw new Error(`Card ${id} is not in any zone`);
  return found.zone === 'resolution' ? { zone: 'resolution' } : found;
}

export function playCost(state: MatchState, card: CardId): number {
  return staticPlayCost(state, card);
}

export function canAfford(state: MatchState, seat: Seat, cost: number): boolean {
  return state.seats[seat].resources.playPoints >= cost;
}

export function payPlayPoints(t: Transcript, seat: Seat, amount: number): void {
  if (amount <= 0) return;
  const current = t.state.seats[seat].resources.playPoints;
  const next = Math.max(0, current - amount);
  if (next === current) return;
  t.emit({ type: 'resourceChanged', seat, resource: 'playPoints', value: next });
}

export function payEvolutionPoints(t: Transcript, seat: Seat, amount: number): void {
  if (amount <= 0) return;
  const current = t.state.seats[seat].resources.evolutionPoints;
  const next = Math.max(0, current - amount);
  if (next === current) return;
  t.emit({ type: 'resourceChanged', seat, resource: 'evolutionPoints', value: next });
}

export function paySuperEvolutionPoints(t: Transcript, seat: Seat, amount: number): void {
  if (amount <= 0) return;
  const current = t.state.seats[seat].resources.superEvolutionPoints;
  const next = Math.max(0, current - amount);
  if (next === current) return;
  t.emit({ type: 'resourceChanged', seat, resource: 'superEvolutionPoints', value: next });
}

export function mintTokenId(state: MatchState, seat: Seat, offset = 0): CardId {
  return asCardId(`${seat}:T${state.nextTokenSeq + offset}`);
}

export function tokenPrototype(state: MatchState, name: string): CardDefinition | undefined {
  return state.tokens[name];
}

export function createTokens(
  t: Transcript,
  seat: Seat,
  name: string,
  n: number,
  zone: 'field' | 'ex',
): CardId[] {
  if (n <= 0) return [];
  const proto = tokenPrototype(t.state, name);
  if (!proto) return [];
  const limit = zone === 'field' ? t.state.seats[seat].limits.field : t.state.seats[seat].limits.ex;
  const used = zone === 'field' ? t.state.seats[seat].field.length : t.state.seats[seat].ex.length;
  const room = Math.max(0, limit - used); // 4.4.4.2: only what fits is created
  const count = Math.min(n, room);
  if (count <= 0) return [];
  const cards = Array.from({ length: count }, (_, i) => ({
    id: mintTokenId(t.state, seat, i),
    def: proto.id,
  }));
  t.emit({
    type: 'tokenCreated',
    seat,
    cards,
    zone,
    ...(zone === 'field' ? { enteredTurn: t.state.turn } : {}),
  });
  return cards.map((card) => card.id);
}

export function updateFieldCard(
  t: Transcript,
  id: CardId,
  patch: (card: FieldCard) => FieldCard,
): boolean {
  const found = fieldOf(t.state, id);
  if (!found) return false;
  const field = patch(found.card);
  t.emit({ type: 'fieldCardUpdated', seat: found.seat, card: id, field });
  return true;
}

export function shuffleDeck(t: Transcript, seat: Seat): void {
  const order = t.random((rng) => shuffle(t.state.seats[seat].deck, rng));
  t.emit({ type: 'deckShuffled', seat, order });
}

export function dealDamage(
  t: Transcript,
  args: {
    readonly source: CardId | null;
    readonly target: CardId | 'leader';
    readonly targetSeat: Seat;
    readonly amount: number;
    readonly combat: boolean;
  },
): void {
  if (args.amount <= 0) return; // 1.3.2.2: 0 damage is not dealt
  t.emit({
    type: 'damageDealt',
    source: args.source,
    target: args.target,
    targetSeat: args.targetSeat,
    amount: args.amount,
    combat: args.combat,
  });
}
