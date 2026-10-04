import type { Instr } from '../abilities/spec';
import type { CardDefId, CardId, Seat } from '../model/ids';

/**
 * A paused procedure sitting on `MatchState.work`. Frames are data: reconnect and replay
 * resume them from the event log. Only `tickWork` / `answerWork` interpret them.
 */
export type WorkFrame =
  PlayCardFrame | ResolveAbilityFrame | AttackFrame | QuickWindowFrame | ConfirmationFrame;

export interface PlayCardFrame {
  readonly kind: 'playCard';
  readonly seat: Seat;
  readonly card: CardId;
  readonly from: 'hand' | 'ex';
  readonly stage:
    | 'specify'
    | 'modes'
    | 'additionalCost'
    | 'extraCost'
    | 'targets'
    | 'allocate'
    | 'pay'
    | 'check'
    | 'resolve'
    | 'done';
  readonly abilityKey: string | null;
  readonly vars: Readonly<Record<string, unknown>>;
  readonly chosenModes: readonly number[];
  readonly paidWithEvolutionPoint: boolean;
}

export interface ResolveAbilityFrame {
  readonly kind: 'resolveAbility';
  readonly seat: Seat;
  readonly source: CardId;
  readonly sourceDef: CardDefId;
  readonly abilityKey: string;
  readonly pc: number;
  readonly vars: Readonly<Record<string, unknown>>;
  readonly pendingId: number | null;
  /**
   * Continuation after `if` / `chooseOne` / `optional`. When set, `pc` indexes this list
   * instead of the ability's printed effect.
   */
  readonly queue: readonly Instr[] | null;
}

export interface AttackFrame {
  readonly kind: 'attack';
  readonly seat: Seat;
  readonly attacker: CardId;
  readonly target: CardId | 'leader';
  readonly stage: 'declare' | 'quick' | 'damage' | 'end';
}

export interface QuickWindowFrame {
  readonly kind: 'quickWindow';
  readonly seat: Seat;
  readonly cause: 'attack' | 'endPhase';
}

export interface ConfirmationFrame {
  readonly kind: 'confirmation';
  readonly round: number;
}

export const pushable = (frame: WorkFrame): WorkFrame => frame;
