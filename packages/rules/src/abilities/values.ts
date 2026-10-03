import type { Condition, Value } from './spec';
import type { MatchState } from '../state/state';
import type { CardId, Seat } from '../model/ids';
import { gather } from './filters';

export function evaluateValue(
  state: MatchState,
  controller: Seat,
  value: Value,
  vars: Readonly<Record<string, unknown>>,
  self?: CardId,
): number {
  if (typeof value === 'number') return value;
  if ('var' in value) {
    const stored = vars[value.var];
    if (typeof stored === 'number') return stored;
    if (Array.isArray(stored)) return stored.length;
    return 0;
  }
  if ('count' in value) {
    const n = gather(state, controller, [value.count], value.filter, self).length;
    return n * (value.times ?? 1);
  }
  if ('forEvery' in value) {
    const total = evaluateValue(state, controller, value.of, vars, self);
    return Math.floor(total / value.forEvery) * value.each;
  }
  if ('half' in value) {
    return Math.ceil(evaluateValue(state, controller, value.half, vars, self) / 2);
  }
  return 0;
}

export function evaluateCondition(
  state: MatchState,
  controller: Seat,
  cond: Condition,
  vars: Readonly<Record<string, unknown>>,
  self?: CardId,
): boolean {
  if ('atLeast' in cond) {
    return evaluateValue(state, controller, cond.value, vars, self) >= cond.atLeast;
  }
  if ('atMost' in cond) {
    return evaluateValue(state, controller, cond.value, vars, self) <= cond.atMost;
  }
  if ('combo' in cond) {
    return state.seats[controller].flags.cardsPlayed >= cond.combo;
  }
  if ('exists' in cond) {
    return gather(state, controller, [cond.exists], cond.filter, self).length > 0;
  }
  if ('all' in cond) {
    return cond.all.every((part) => evaluateCondition(state, controller, part, vars, self));
  }
  if ('any' in cond) {
    return cond.any.some((part) => evaluateCondition(state, controller, part, vars, self));
  }
  if ('not' in cond) {
    return !evaluateCondition(state, controller, cond.not, vars, self);
  }
  return false;
}
