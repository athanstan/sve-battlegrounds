import type { CardKind, Keyword } from '../model/cards';

/** Whose cards an instruction talks about, from the controller's point of view. */
export type Who = 'you' | 'opponent' | 'any';

export interface CardFilter {
  readonly kind?: readonly CardKind[];
  readonly trait?: string;
  readonly universe?: string;
  readonly token?: boolean;
  readonly name?: string;
  readonly costAtMost?: number;
  readonly costIs?: number;
  readonly other?: true;
  readonly evolved?: boolean;
  readonly faceUp?: boolean;
  readonly pixie?: true;
}

export interface Place {
  readonly zone:
    'field' | 'ex' | 'hand' | 'cemetery' | 'deck' | 'evolveDeck' | 'evolveDeckRevealed';
  readonly who: Who;
}

export type Value =
  | number
  | { readonly count: Place; readonly filter?: CardFilter; readonly times?: number }
  | { readonly var: string }
  | { readonly forEvery: number; readonly of: Value; readonly each: number }
  | { readonly half: Value };

export type Condition =
  | { readonly atLeast: number; readonly value: Value }
  | { readonly atMost: number; readonly value: Value }
  | { readonly combo: number }
  | { readonly exists: Place; readonly filter?: CardFilter }
  | { readonly all: readonly Condition[] }
  | { readonly any: readonly Condition[] }
  | { readonly not: Condition };

export type CountSpec = number | { readonly upTo: number } | 'any';

export type Instr =
  | {
      readonly op: 'select';
      readonly as: string;
      readonly from: readonly Place[];
      readonly filter?: CardFilter;
      readonly count: CountSpec;
      readonly target?: true;
    }
  | {
      readonly op: 'search';
      readonly as: string;
      readonly filter?: CardFilter;
      readonly count: number;
      readonly reveal: boolean;
      readonly then: 'hand' | 'field' | 'ex';
    }
  | {
      readonly op: 'lookTop';
      readonly n: number;
      readonly pick: {
        readonly filter?: CardFilter;
        readonly upTo: number;
        readonly reveal: boolean;
        readonly then: 'hand';
      };
      readonly rest: 'bottom';
    }
  | { readonly op: 'draw'; readonly n: Value; readonly who?: Who }
  | { readonly op: 'buryTop'; readonly n: Value }
  | {
      readonly op: 'discard';
      readonly who: Who;
      readonly n: number;
      readonly filter?: CardFilter;
      readonly as?: string;
    }
  | {
      readonly op: 'move';
      readonly cards: string;
      readonly to: 'hand' | 'field' | 'ex' | 'cemetery' | 'banished';
      readonly costDeltaThisTurn?: number;
    }
  | { readonly op: 'token'; readonly name: string; readonly n: number; readonly to: 'field' | 'ex' }
  | {
      readonly op: 'damage';
      readonly to: string | { readonly each: Place; readonly filter?: CardFilter };
      readonly amount: Value;
      readonly divided?: true;
    }
  | {
      readonly op: 'buff';
      readonly cards: string | { readonly each: Place; readonly filter?: CardFilter };
      readonly attack: number;
      readonly defense: number;
      readonly until?: 'endOfTurn' | 'endOfYourTurn' | 'startOfYourNextTurn';
    }
  | {
      readonly op: 'grant';
      readonly cards: string | { readonly each: Place; readonly filter?: CardFilter };
      readonly keywords: readonly Keyword[];
      readonly until?: 'endOfTurn' | 'endOfYourTurn' | 'startOfYourNextTurn';
    }
  | { readonly op: 'destroy'; readonly cards: string }
  | { readonly op: 'banish'; readonly cards: string }
  | { readonly op: 'returnToHand'; readonly cards: string }
  | { readonly op: 'engage'; readonly cards: string }
  | { readonly op: 'leaderDefense'; readonly who: Who; readonly delta: number }
  | { readonly op: 'recoverPlayPoints'; readonly n: number }
  | { readonly op: 'gainEvolutionPoints'; readonly n: number }
  | { readonly op: 'evolveSelf' }
  | { readonly op: 'turnCarrots'; readonly faceUp: boolean; readonly upTo: number }
  | {
      readonly op: 'if';
      readonly cond: Condition;
      readonly then: readonly Instr[];
      readonly else?: readonly Instr[];
    }
  | {
      readonly op: 'chooseOne';
      readonly options: readonly { readonly label: string; readonly effect: readonly Instr[] }[];
    }
  | {
      readonly op: 'optional';
      readonly label: string;
      readonly cost: readonly Instr[];
      readonly then: readonly Instr[];
    }
  | {
      readonly op: 'later';
      readonly at: 'startOfTurn' | 'startOfMainPhase' | 'startOfEndPhase';
      readonly effect: readonly Instr[];
    }
  | { readonly op: 'win' }
  | { readonly op: 'lose' };

export type Cost =
  | { readonly playPoints: number }
  | { readonly engage: true }
  | { readonly burySelf: true }
  | { readonly discard: { readonly n: number; readonly filter?: CardFilter } }
  | { readonly list: readonly Cost[] };

export type Trigger =
  | 'fanfare'
  | 'lastWords'
  | 'onEvolve'
  | 'onSuperEvolve'
  | 'onRace'
  | 'strike'
  | {
      readonly at: 'startOfTurn' | 'startOfMainPhase' | 'startOfEndPhase';
      readonly whose: 'yours' | 'opponents' | 'each';
    }
  | { readonly youPlaySpell: { readonly nth?: number } }
  | { readonly followerOnYourFieldEvolves: true }
  | { readonly tokenEntersYourField: CardFilter }
  | { readonly enemyDamagedByYouLeavesField: CardFilter };

export interface ActivatedAbility {
  readonly kind: 'activated';
  readonly key: string;
  readonly cost: Cost;
  readonly quick?: true;
  readonly condition?: Condition;
  readonly effect: readonly Instr[];
  /** Evolve, Serve, or an advanced activated ability (8.3.2). */
  readonly evolveEquivalent?: 'evolve' | 'serve';
  readonly label: string;
}

export interface TriggeredAbility {
  readonly kind: 'triggered';
  readonly key: string;
  readonly on: Trigger;
  readonly perTurn?: number;
  readonly effect: readonly Instr[];
}

export interface StaticAbility {
  readonly kind: 'static';
  readonly key: string;
  readonly validIn: readonly ('field' | 'ex' | 'hand')[];
  readonly activeIs?: 'controller';
  readonly grant?: {
    readonly filter: CardFilter;
    readonly keywords?: readonly Keyword[];
    readonly attack?: number;
    readonly defense?: number;
  };
  readonly costDelta?: {
    readonly filter: CardFilter;
    readonly amount: number;
    readonly nthSpell?: number;
  };
  readonly playRestriction?: Condition;
  readonly notFromEx?: true;
  readonly costIf?: { readonly cond: Condition; readonly amount: number };
}

export interface SpellAbility {
  readonly kind: 'spell';
  readonly key: string;
  readonly effect: readonly Instr[];
}

export type Ability = ActivatedAbility | TriggeredAbility | StaticAbility | SpellAbility;

export interface CardScript {
  readonly name: string;
  readonly textHash: string;
  readonly abilities: readonly Ability[];
  readonly alsoNamed?: readonly string[];
}

export const scriptKey = (name: string, textHash: string): string => `${name}#${textHash}`;
