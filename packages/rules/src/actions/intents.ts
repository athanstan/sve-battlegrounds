import type { CardId, Seat } from '../model/ids';

/**
 * Answers to prompts that need a free choice. Each variant belongs to exactly one prompt kind;
 * quoting the wrong one is rejected rather than coerced.
 */
export type Choice =
  | { readonly kind: 'turnOrder'; readonly goFirst: boolean }
  | { readonly kind: 'mulligan'; readonly redraw: boolean }
  | { readonly kind: 'discard'; readonly cards: readonly CardId[] }
  | { readonly kind: 'selectCards'; readonly cards: readonly CardId[] }
  | { readonly kind: 'mode'; readonly id: string }
  | { readonly kind: 'confirm'; readonly yes: boolean }
  | { readonly kind: 'allocate'; readonly amounts: readonly number[] }
  | { readonly kind: 'orderPending'; readonly id: number }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'name'; readonly value: string }
  | { readonly kind: 'order'; readonly cards: readonly CardId[] };

/**
 * Everything a client may ask for. Clients never send board mutations: there is no
 * "move card" or "set defense", only a request the rules may or may not allow.
 *
 * Every answer quotes the id of the prompt it answers, so a stale or duplicated click can
 * never answer a later prompt.
 */
export type Intent =
  | { readonly type: 'choose'; readonly promptId: number; readonly choice: Choice }
  /** The hourglass: ends the main phase (7.3.3) or a Quick window. */
  | { readonly type: 'pass'; readonly promptId: number }
  /** Engage any number of Ward followers at the end phase (7.4.3). May be empty. */
  | { readonly type: 'engageWards'; readonly promptId: number; readonly cards: readonly CardId[] }
  | {
      readonly type: 'play';
      readonly promptId: number;
      readonly card: CardId;
    }
  | {
      readonly type: 'activate';
      readonly promptId: number;
      readonly card: CardId;
      readonly ability: string;
    }
  | {
      readonly type: 'attack';
      readonly promptId: number;
      readonly attacker: CardId;
      readonly target: CardId | 'leader';
    }
  | {
      readonly type: 'evolve';
      readonly promptId: number;
      readonly card: CardId;
      readonly superEvolve: boolean;
      readonly useEvolutionPoint: boolean;
    }
  /** Always legal, never prompted, immediate (1.2.3). */
  | { readonly type: 'concede' };

export type IntentType = Intent['type'];

export interface Action {
  readonly seat: Seat;
  readonly intent: Intent;
}

export type RejectionReason =
  | 'gameOver'
  | 'noPromptOpen'
  | 'notYourPrompt'
  | 'stalePrompt'
  /** Wrong intent type or choice kind for the open prompt, or a selection that is not legal. */
  | 'invalidAnswer';
