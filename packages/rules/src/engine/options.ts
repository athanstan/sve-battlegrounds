import { opponentOf, type CardId, type Seat } from '../model/ids';
import {
  definitionOf,
  effectiveDefinition,
  type MainOption,
  type MatchState,
} from '../state/state';
import { playCost } from './move';
import { hasShownKeyword } from './derived';
import { parseEvolveCost, parseServeCost } from '../abilities/generic';
import { playRestricted } from '../abilities/statics';
import { evaluateCondition } from '../abilities/values';
import type { Cost, Instr } from '../abilities/spec';
import { gather } from '../abilities/filters';
import { locate } from '../state/zones';

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
    const cost = playCost(state, id);
    if (cost > playPoints) continue;
    if (playRestricted(state, seat, id)) continue;
    if ((def.kind === 'follower' || def.kind === 'amulet') && fieldFull) continue;
    if (!requiredTargetsAvailable(state, seat, id)) continue;
    options.push({ type: 'play', card: id, cost, from });
  }
  return options;
}

function costPlayPoints(cost: Cost): number {
  if ('playPoints' in cost) return cost.playPoints;
  if ('list' in cost) return cost.list.reduce((sum, part) => sum + costPlayPoints(part), 0);
  return 0;
}

export function legalActivateOptions(state: MatchState, seat: Seat): readonly MainOption[] {
  const options: MainOption[] = [];
  const { playPoints } = state.seats[seat].resources;
  for (const card of state.seats[seat].field) {
    const def = effectiveDefinition(state, card.id);
    const script = state.scripts[def.id] ?? state.scripts[definitionOf(state, card.id).id];
    if (!script) continue;
    for (const ability of script.abilities) {
      if (ability.kind !== 'activated' || ability.evolveEquivalent) continue;
      if (ability.condition && !evaluateCondition(state, seat, ability.condition, {}, card.id)) {
        continue;
      }
      const cost = costPlayPoints(ability.cost);
      if (cost > playPoints) continue;
      if ('engage' in ability.cost && card.placement !== 'reserved') continue;
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
    if (def.kind !== 'follower') continue;
    if (attacker.placement !== 'reserved') continue;
    const storm = hasShownKeyword(state, attacker.id, 'storm');
    const rush = hasShownKeyword(state, attacker.id, 'rush');
    const assail = hasShownKeyword(state, attacker.id, 'assail');
    const remained = remainedSinceTurnStart(state, seat, attacker.id);
    if (!remained && !storm && !rush) continue;

    const wards = state.seats[enemy].field.filter(
      (card) => card.placement === 'engaged' && hasShownKeyword(state, card.id, 'ward'),
    );
    const targets: (CardId | 'leader')[] = [];
    if (wards.length > 0) {
      for (const ward of wards) targets.push(ward.id);
    } else {
      for (const foe of state.seats[enemy].field) {
        const foeDef = effectiveDefinition(state, foe.id);
        if (foeDef.kind !== 'follower') continue;
        if (hasShownKeyword(state, foe.id, 'intimidate')) continue;
        const engaged = foe.placement === 'engaged' || assail;
        if (!engaged) continue;
        if (!remained && rush && !storm && foe.placement !== 'engaged' && !assail) continue;
        targets.push(foe.id);
      }
      if (remained || storm) targets.push('leader');
    }
    for (const target of targets) {
      options.push({ type: 'attack', attacker: attacker.id, target });
    }
  }
  return options;
}

function correspondingEvolve(state: MatchState, seat: Seat, fieldCard: CardId): CardId | undefined {
  const name = effectiveDefinition(state, fieldCard).name;
  return state.seats[seat].evolveDeck.find((id) => definitionOf(state, id).name === name);
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
    const def = definitionOf(state, card.id);
    const cost = parseEvolveCost(def.text);
    if (cost === null) continue;
    if (!correspondingEvolve(state, seat, card.id)) continue;
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
  const carrots = state.seats[seat].evolveDeck.filter((id) => {
    const def = definitionOf(state, id);
    const script = state.scripts[def.id];
    return (script?.alsoNamed?.includes('Carrot') ?? false) || def.name.includes('Carrot');
  });
  if (carrots.length === 0) return [];
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
