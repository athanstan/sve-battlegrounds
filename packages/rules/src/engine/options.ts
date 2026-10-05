import { opponentOf, type CardId, type Seat } from '../model/ids';
import {
  definitionOf,
  effectiveDefinition,
  isBoxed,
  type MainOption,
  type MatchState,
} from '../state/state';
import { playCost } from './move';
import { hasShownKeyword } from './derived';
import { parseServeCost } from '../abilities/generic';
import { evolvePlayCost, hasRestriction, playRestricted } from '../abilities/statics';
import { evaluateCondition } from '../abilities/values';
import type { Instr, SpellAbility } from '../abilities/spec';
import {
  additionalCostOf,
  canPayCost,
  canPayExtraCost,
  costBuriesSelf,
  costEngages,
  costPlayPoints,
} from '../abilities/costs';
import { gather } from '../abilities/filters';
import { locate } from '../state/zones';
import { correspondingCarrot, correspondingEvolve } from './evolve';

const inHandOrEx = (state: MatchState, seat: Seat, id: CardId): 'hand' | 'ex' | null => {
  if (state.seats[seat].hand.includes(id)) return 'hand';
  if (state.seats[seat].ex.includes(id)) return 'ex';
  return null;
};

function playEffect(state: MatchState, card: CardId): readonly Instr[] {
  const def = definitionOf(state, card);
  const script = state.scripts[def.id];
  if (!script) return [];
  if (def.kind === 'spell') {
    const spell = script.abilities.find((ability) => ability.kind === 'spell');
    return spell?.kind === 'spell' ? spell.effect : [];
  }
  const fanfare = script.abilities.find(
    (ability) => ability.kind === 'triggered' && ability.on === 'fanfare',
  );
  return fanfare?.kind === 'triggered' ? fanfare.effect : [];
}

/** 10.6.2.3: a required target that cannot be filled makes the card unplayable. */
function requiredTargetsAvailable(state: MatchState, seat: Seat, card: CardId): boolean {
  for (const instr of playEffect(state, card)) {
    if (instr.op !== 'select' || !instr.target || typeof instr.count !== 'number') continue;
    const candidates = gather(state, seat, instr.from, instr.filter, card).filter((id) => {
      const loc = locate(state, id);
      return !(loc?.zone === 'field' && loc.seat !== seat && hasShownKeyword(state, id, 'aura'));
    });
    if (candidates.length < instr.count) return false;
  }
  return true;
}

function extraCostOf(state: MatchState, card: CardId): SpellAbility['extraCost'] | undefined {
  const def = definitionOf(state, card);
  if (def.kind !== 'spell') return undefined;
  const script = state.scripts[def.id];
  const spell = script?.abilities.find((ability) => ability.kind === 'spell');
  return spell?.kind === 'spell' ? spell.extraCost : undefined;
}

export function legalPlayOptions(state: MatchState, seat: Seat): readonly MainOption[] {
  const options: MainOption[] = [];
  const { playPoints } = state.seats[seat].resources;
  const fieldFull = state.seats[seat].field.length >= state.seats[seat].limits.field;
  for (const id of [...state.seats[seat].hand, ...state.seats[seat].ex]) {
    const from = inHandOrEx(state, seat, id);
    if (!from) continue;
    const def = definitionOf(state, id);
    if (def.kind === 'leader') continue;
    const script = state.scripts[def.id];
    const notFromEx = script?.abilities.some(
      (ability) => ability.kind === 'static' && ability.notFromEx,
    );
    if (from === 'ex' && notFromEx) continue;
    const full = playCost(state, id);
    const extra = extraCostOf(state, id);
    const reduced =
      extra && canPayExtraCost(state, seat, id, extra) ? Math.max(0, full - extra.reduceBy) : full;
    // 10.6.2.2: a card whose additional cost cannot be paid is not offered at all.
    const additional = additionalCostOf(state, id);
    if (additional && !canPayCost(state, seat, id, additional)) continue;
    const addPoints = additional ? costPlayPoints(additional) : 0;
    if (reduced + addPoints > playPoints) continue;
    if (playRestricted(state, seat, id)) continue;
    if ((def.kind === 'follower' || def.kind === 'amulet') && fieldFull) continue;
    if (!requiredTargetsAvailable(state, seat, id)) continue;
    options.push({
      type: 'play',
      card: id,
      cost: (full + addPoints <= playPoints ? full : reduced) + addPoints,
      from,
    });
  }
  return options;
}

export function legalActivateOptions(state: MatchState, seat: Seat): readonly MainOption[] {
  const options: MainOption[] = [];
  const { playPoints } = state.seats[seat].resources;
  const cards = [
    ...state.seats[seat].field.map((card) => ({
      id: card.id,
      onField: true,
      placement: card.placement,
      boxed: isBoxed(card, state.turn),
    })),
    ...state.seats[seat].cemetery.map((id) => ({
      id,
      onField: false,
      placement: undefined,
      boxed: false,
    })),
  ];
  for (const card of cards) {
    if (card.boxed) continue;
    const def = effectiveDefinition(state, card.id);
    const script = state.scripts[def.id] ?? state.scripts[definitionOf(state, card.id).id];
    if (!script) continue;
    for (const ability of script.abilities) {
      if (ability.kind !== 'activated' || ability.evolveEquivalent) continue;
      const from = ability.from ?? 'field';
      if (from === 'field' && !card.onField) continue;
      if (from === 'cemetery' && card.onField) continue;
      if (ability.condition && !evaluateCondition(state, seat, ability.condition, {}, card.id)) {
        continue;
      }
      if (
        ability.perTurn !== undefined &&
        (state.seats[seat].flags.pendingCounts[ability.key] ?? 0) >= ability.perTurn
      ) {
        continue;
      }
      const cost = costPlayPoints(ability.cost);
      if (!canPayCost(state, seat, card.id, ability.cost)) continue;
      if (cost > playPoints) continue;
      if (costEngages(ability.cost) && card.placement !== 'reserved') continue;
      if (costBuriesSelf(ability.cost) && !card.onField) continue;
      options.push({
        type: 'activate',
        card: card.id,
        ability: ability.key,
        cost,
        label: ability.label,
      });
    }
  }
  return options;
}

function remainedSinceTurnStart(state: MatchState, seat: Seat, id: CardId): boolean {
  const card = state.seats[seat].field.find((entry) => entry.id === id);
  if (!card) return false;
  if (card.enteredTurn < state.turn) return true;
  // Evolved this turn still counts as having remained (8.4.2.1).
  return state.seats[seat].evolveZone.some((link) => link.linkedTo === id);
}

export function legalAttackOptions(state: MatchState, seat: Seat): readonly MainOption[] {
  const options: MainOption[] = [];
  const enemy = opponentOf(seat);
  for (const attacker of state.seats[seat].field) {
    const def = effectiveDefinition(state, attacker.id);
    if (def.kind !== 'follower' && !attacker.maneuvered) continue;
    if (attacker.placement !== 'reserved') continue;
    if (
      hasRestriction(state, attacker.id, (r) => r.cantAttack === true || r.cantAttack === 'enemies')
    ) {
      continue;
    }
    const storm = hasShownKeyword(state, attacker.id, 'storm');
    const rush = hasShownKeyword(state, attacker.id, 'rush');
    const assail = hasShownKeyword(state, attacker.id, 'assail');
    const remained = remainedSinceTurnStart(state, seat, attacker.id);
    if (!remained && !storm && !rush) continue;
    const noLeaders = hasRestriction(state, attacker.id, (r) => r.cantAttack === 'leaders');
    const noFollowers = hasRestriction(state, attacker.id, (r) => r.cantAttack === 'followers');

    const wards = state.seats[enemy].field.filter(
      (card) => card.placement === 'engaged' && hasShownKeyword(state, card.id, 'ward'),
    );
    const targets: (CardId | 'leader')[] = [];
    if (wards.length > 0) {
      for (const ward of wards) {
        if (hasRestriction(state, ward.id, (r) => r.cantBeAttacked === true)) continue;
        targets.push(ward.id);
      }
    } else {
      if (!noFollowers) {
        for (const foe of state.seats[enemy].field) {
          const foeDef = effectiveDefinition(state, foe.id);
          if (foeDef.kind !== 'follower' && !foe.maneuvered) continue;
          if (hasShownKeyword(state, foe.id, 'intimidate')) continue;
          if (hasRestriction(state, foe.id, (r) => r.cantBeAttacked === true)) continue;
          const engaged = foe.placement === 'engaged' || assail;
          if (!engaged) continue;
          if (!remained && rush && !storm && foe.placement !== 'engaged' && !assail) continue;
          targets.push(foe.id);
        }
      }
      if ((remained || storm) && !noLeaders) targets.push('leader');
    }
    for (const target of targets) {
      options.push({ type: 'attack', attacker: attacker.id, target });
    }
  }
  return options;
}

function evolveAllowed(state: MatchState, seat: Seat, card: CardId): boolean {
  const def = definitionOf(state, card);
  const script = state.scripts[def.id];
  if (!script) return true;
  for (const ability of script.abilities) {
    if (ability.kind !== 'static' || !ability.evolveIf) continue;
    if (!evaluateCondition(state, seat, ability.evolveIf, {}, card)) return false;
  }
  return true;
}

export function legalEvolveOptions(state: MatchState, seat: Seat): readonly MainOption[] {
  if (state.seats[seat].flags.evolvedThisTurn) return [];
  const options: MainOption[] = [];
  const { playPoints, evolutionPoints, superEvolutionPoints, turnsPassed } =
    state.seats[seat].resources;
  const first = state.first;
  const superReady =
    first !== null &&
    ((seat === first && turnsPassed >= 7) || (seat !== first && turnsPassed >= 6));

  for (const card of state.seats[seat].field) {
    const cost = evolvePlayCost(state, card.id);
    if (cost === null) continue;
    if (!correspondingEvolve(state, seat, card.id)) continue;
    if (!evolveAllowed(state, seat, card.id)) continue;
    const canPp = playPoints >= cost;
    const canEp = evolutionPoints >= 1 && playPoints >= Math.max(0, cost - 1);
    if (canPp) {
      options.push({
        type: 'evolve',
        card: card.id,
        cost,
        superEvolve: false,
        useEvolutionPoint: false,
      });
    }
    if (canEp && cost >= 1) {
      options.push({
        type: 'evolve',
        card: card.id,
        cost: Math.max(0, cost - 1),
        superEvolve: false,
        useEvolutionPoint: true,
      });
    }
    if (superReady && superEvolutionPoints >= 1) {
      if (canPp) {
        options.push({
          type: 'evolve',
          card: card.id,
          cost,
          superEvolve: true,
          useEvolutionPoint: false,
        });
      }
      if (canEp && cost >= 1) {
        options.push({
          type: 'evolve',
          card: card.id,
          cost: Math.max(0, cost - 1),
          superEvolve: true,
          useEvolutionPoint: true,
        });
      }
    }
  }
  return options;
}

export function legalServeOptions(state: MatchState, seat: Seat): readonly MainOption[] {
  if (state.seats[seat].flags.evolvedThisTurn) return [];
  const options: MainOption[] = [];
  const { playPoints, evolutionPoints } = state.seats[seat].resources;
  if (!correspondingCarrot(state, seat)) return [];
  for (const card of state.seats[seat].field) {
    const def = definitionOf(state, card.id);
    const cost = parseServeCost(def.text);
    if (cost === null) continue;
    if (state.seats[seat].raceZone.some((link) => link.linkedTo === card.id)) continue;
    const canPp = playPoints >= cost;
    const canEp = evolutionPoints >= 1 && playPoints >= Math.max(0, cost - 1);
    if (canPp) {
      options.push({
        type: 'activate',
        card: card.id,
        ability: 'serve',
        cost,
        label: 'Race',
      });
    }
    if (canEp && cost >= 1) {
      options.push({
        type: 'activate',
        card: card.id,
        ability: 'serve-ep',
        cost: Math.max(0, cost - 1),
        label: 'Race (EP)',
      });
    }
  }
  return options;
}

/** Legal actions the active player may take during the main phase (7.3.3). */
export function legalMainOptions(state: MatchState, seat: Seat): readonly MainOption[] {
  return [
    ...legalPlayOptions(state, seat),
    ...legalActivateOptions(state, seat),
    ...legalEvolveOptions(state, seat),
    ...legalServeOptions(state, seat),
    ...legalAttackOptions(state, seat),
  ];
}

export function legalQuickOptions(state: MatchState, seat: Seat): readonly MainOption[] {
  return legalPlayOptions(state, seat).filter((option) => {
    if (option.type !== 'play') return false;
    const def = definitionOf(state, option.card);
    return def.keywords.includes('quick');
  });
}
