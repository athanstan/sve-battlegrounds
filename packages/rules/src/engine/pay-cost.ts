import type { CardId, Seat } from '../model/ids';
import { definitionOf } from '../state/state';
import { costParts } from '../abilities/costs';
import type { Cost } from '../abilities/spec';
import { gather, matchesFilter } from '../abilities/filters';
import { discard, engage } from './verbs';
import { moveCards, payPlayPoints, updateFieldCard, zoneOf } from './move';
import type { Transcript } from './transcript';

/**
 * Pay the parts of a cost that need no decision. Cards a cost makes the player *pick* (discard,
 * reveal) are taken first-come here, which is only right for an activated ability with nothing to
 * choose; playing a card asks the player instead (see `frames/play.ts`).
 */
export function payAbilityCost(t: Transcript, seat: Seat, card: CardId, cost: Cost): void {
  for (const part of costParts(cost)) {
    if ('playPoints' in part) payPlayPoints(t, seat, part.playPoints);
    if ('engage' in part) engage(t, seat, [card]);
    if ('burySelf' in part) {
      const from = zoneOf(t.state, card);
      const owner = t.state.cards[card]?.owner ?? seat;
      moveCards(t, {
        owner,
        cards: [card],
        from,
        to: { zone: 'cemetery', seat: owner },
        cause: 'bury',
      });
    }
    if ('leaderDefense' in part) {
      t.emit({
        type: 'leaderDefenseChanged',
        seat,
        defense: Math.max(0, t.state.seats[seat].leader.defense - part.leaderDefense),
      });
    }
    if ('discard' in part) {
      const candidates = t.state.seats[seat].hand.filter((id) =>
        matchesFilter(t.state, id, part.discard.filter, card),
      );
      const picked = candidates.slice(0, part.discard.n);
      if (picked.length > 0) discard(t, seat, picked, card);
    }
    if ('reveal' in part) {
      const picked = t.state.seats[seat].hand
        .filter((id) => id !== card && matchesFilter(t.state, id, part.reveal.filter, card))
        .slice(0, part.reveal.n);
      if (picked.length > 0) t.emit({ type: 'cardsRevealed', seat, cards: picked });
    }
    if ('lesson' in part) {
      const items = t.state.seats[seat].ex.filter((id) => {
        const def = definitionOf(t.state, id);
        return (
          def.name.toLowerCase().includes('magical item') || def.traits.includes('Magical Item')
        );
      });
      for (const id of items.slice(0, part.lesson)) {
        moveCards(t, {
          owner: seat,
          cards: [id],
          from: { zone: 'ex', seat },
          to: { zone: 'banished', seat },
          cause: 'banish',
        });
      }
    }
    if ('counters' in part) {
      updateFieldCard(t, card, (field) => {
        const have = field.counters[part.counters.name] ?? 0;
        return {
          ...field,
          counters: {
            ...field.counters,
            [part.counters.name]: Math.max(0, have - part.counters.n),
          },
        };
      });
    }
    if ('banish' in part) {
      const from = part.banish.from ?? { zone: 'field' as const, who: 'you' as const };
      const picked = gather(t.state, seat, [from], part.banish.filter, card).slice(
        0,
        part.banish.n,
      );
      for (const id of picked) {
        const loc = zoneOf(t.state, id);
        const owner = t.state.cards[id]?.owner ?? seat;
        moveCards(t, {
          owner,
          cards: [id],
          from: loc,
          to: { zone: 'banished', seat: owner },
          cause: 'banish',
        });
      }
    }
    if ('bury' in part) {
      const zone = part.bury.from?.zone ?? 'field';
      const pool =
        zone === 'hand'
          ? t.state.seats[seat].hand
          : zone === 'ex'
            ? t.state.seats[seat].ex
            : t.state.seats[seat].field.map((entry) => entry.id);
      const picked = pool
        .filter((id) => id !== card && matchesFilter(t.state, id, part.bury.filter, card))
        .slice(0, part.bury.n);
      for (const id of picked) {
        const from = zoneOf(t.state, id);
        const owner = t.state.cards[id]?.owner ?? seat;
        moveCards(t, {
          owner,
          cards: [id],
          from,
          to: { zone: 'cemetery', seat: owner },
          cause: 'bury',
        });
      }
    }
    if ('fuse' in part) {
      const picked = t.state.seats[seat].hand
        .filter((id) => id !== card && matchesFilter(t.state, id, part.fuse.filter, card))
        .slice(0, part.fuse.n);
      if (picked.length > 0) {
        moveCards(t, {
          owner: seat,
          cards: picked,
          from: { zone: 'hand', seat },
          to: { zone: 'cemetery', seat },
          cause: 'bury',
        });
      }
    }
    if ('engageOther' in part) {
      const other = t.state.seats[seat].field
        .filter(
          (entry) =>
            entry.id !== card &&
            entry.placement === 'reserved' &&
            matchesFilter(t.state, entry.id, part.engageOther, card),
        )
        .map((entry) => entry.id)
        .slice(0, 1);
      if (other.length > 0) engage(t, seat, other);
    }
  }
}
