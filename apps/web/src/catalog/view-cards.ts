import type { CardDefId, CardRef, MatchView } from '@sve/rules';

/**
 * Every card definition a view needs drawn. Events and views carry card ids and definition ids
 * only (definitions travel separately so one player never learns the other's deck list), so the
 * browser asks for exactly these.
 */
export function definitionsIn(view: MatchView): CardDefId[] {
  const refs: (CardRef | null | undefined)[] = [];
  for (const seat of view.seats) {
    refs.push(seat.leader.card);
    refs.push(...(seat.hand.cards ?? []));
    refs.push(...seat.field.map((entry) => entry.card));
    refs.push(...seat.ex, ...seat.cemetery);
    refs.push(...seat.banished.map((entry) => entry.card));
    refs.push(...seat.evolveZone.map((link) => link.card));
    refs.push(...seat.raceZone.map((link) => link.card));
    refs.push(...(seat.evolveDeck.cards ?? []), ...seat.evolveDeck.revealed);
  }
  refs.push(...view.resolution.map((entry) => entry.card));
  if (view.prompt?.kind === 'selectCards') refs.push(...view.prompt.previews);
  return [...new Set(refs.flatMap((ref) => (ref ? [ref.def] : [])))];
}
