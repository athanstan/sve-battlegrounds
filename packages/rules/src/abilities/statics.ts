import type { Keyword } from '../model/cards';
import { SEATS, type CardId, type Seat } from '../model/ids';
import { definitionOf, type FieldCard, type MatchState, type ShownStats } from '../state/state';
import type { StaticAbility } from './spec';
import { evaluateCondition } from './values';
import { matchesFilter } from './filters';

export function staticsInZone(
  state: MatchState,
  seat: Seat,
  zone: 'field' | 'ex' | 'hand',
): readonly { readonly source: CardId; readonly ability: StaticAbility }[] {
  const ids =
    zone === 'field'
      ? state.seats[seat].field.map((card) => card.id)
      : zone === 'ex'
        ? state.seats[seat].ex
        : state.seats[seat].hand;
  const out: { source: CardId; ability: StaticAbility }[] = [];
  for (const id of ids) {
    const def = definitionOf(state, id);
    const script = state.scripts[def.id];
    if (!script) continue;
    for (const ability of script.abilities) {
      if (ability.kind !== 'static') continue;
      if (!ability.validIn.includes(zone)) continue;
      if (ability.activeIs === 'controller' && state.active !== seat) continue;
      out.push({ source: id, ability });
    }
  }
  return out;
}

/** Every static currently in force, in the order their sources entered their zones (10.9.3). */
export function activeStatics(
  state: MatchState,
): readonly { readonly source: CardId; readonly seat: Seat; readonly ability: StaticAbility }[] {
  const out: { source: CardId; seat: Seat; ability: StaticAbility }[] = [];
  for (const seat of SEATS) {
    for (const zone of ['field', 'ex', 'hand'] as const) {
      for (const entry of staticsInZone(state, seat, zone)) {
        out.push({ ...entry, seat });
      }
    }
  }
  return out;
}

export function applyStaticGrants(
  state: MatchState,
  card: FieldCard,
  seat: Seat,
  base: ShownStats,
): ShownStats {
  const keywords = new Set<Keyword>(base.keywords);
  let attack = base.attack;
  let defense = base.defense;
  for (const entry of activeStatics(state)) {
    const grant = entry.ability.grant;
    if (!grant) continue;
    if (!matchesFilter(state, card.id, grant.filter, entry.source)) continue;
    // One-shot persistent effects only cover cards present when they resolved (10.9.2);
    // static grants here are "while on the field" and apply to later arrivals (10.9.3.1).
    void seat;
    if (grant.keywords) for (const keyword of grant.keywords) keywords.add(keyword);
    attack += grant.attack ?? 0;
    defense += grant.defense ?? 0;
  }
  if (keywords.has('drain')) {
    // 12.13.3: Drain does not stack; a Set already de-duplicates.
  }
  return { attack, defense, keywords: [...keywords] };
}

export function staticPlayCost(state: MatchState, card: CardId): number {
  const def = definitionOf(state, card);
  let cost = def.cost;
  const owner = state.cards[card]?.owner;
  if (owner === undefined) return Math.max(0, cost);

  for (const entry of activeStatics(state)) {
    if (entry.seat !== owner) continue;
    const { ability } = entry;
    if (ability.costIf && evaluateCondition(state, owner, ability.costIf.cond, {}, card)) {
      cost = ability.costIf.amount;
    }
  }
  for (const entry of activeStatics(state)) {
    if (entry.seat !== owner) continue;
    const delta = entry.ability.costDelta;
    if (!delta) continue;
    if (!matchesFilter(state, card, delta.filter, entry.source)) continue;
    if (delta.nthSpell !== undefined) {
      if (def.kind !== 'spell') continue;
      if (state.seats[owner].flags.spellsPlayed + 1 !== delta.nthSpell) continue;
    }
    cost += delta.amount;
  }
  const thisTurn = state.costDeltas[card] ?? [];
  cost += thisTurn.reduce((sum, entry) => sum + entry.amount, 0);
  return Math.max(0, cost);
}

export function playRestricted(state: MatchState, seat: Seat, card: CardId): boolean {
  const def = definitionOf(state, card);
  const script = state.scripts[def.id];
  if (!script) return false;
  for (const ability of script.abilities) {
    if (ability.kind !== 'static' || !ability.playRestriction) continue;
    if (!evaluateCondition(state, seat, ability.playRestriction, {}, card)) return true;
  }
  return false;
}
