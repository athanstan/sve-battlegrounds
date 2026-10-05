import type { CardClass, CardKind, Keyword } from '../model/cards';
import type { MoveCause } from '../state/zones-model';

/** Whose cards an instruction talks about, from the controller's point of view. */
export type Who = 'you' | 'opponent' | 'any';

/**
 * R2 selector AST. Existing scripts already author `CardFilter`; there is no separate
 * adapter type — this *is* the selector language.
 */
export interface CardFilter {
  readonly kind?: readonly CardKind[];
  readonly trait?: string;
  readonly traits?: readonly string[];
  readonly traitsAll?: readonly string[];
  readonly traitNot?: string;
  readonly universe?: string;
  readonly cardClass?: CardClass;
  readonly token?: boolean;
  readonly name?: string;
  readonly names?: readonly string[];
  readonly nameNot?: string;
  /** Printed name contains this text, ignoring case. */
  readonly nameIncludes?: string;
  readonly sameNameAs?: string;
  readonly among?: string;
  readonly costAtMost?: number;
  readonly costIs?: number;
  readonly costAtLeast?: number;
  readonly attackAtLeast?: number;
  readonly attackAtMost?: number;
  readonly defenseAtLeast?: number;
  readonly defenseAtMost?: number;
  readonly keyword?: Keyword;
  readonly hasCounter?: string;
  readonly engaged?: boolean;
  readonly damaged?: boolean;
  readonly other?: true;
  readonly self?: true;
  readonly evolved?: boolean;
  readonly faceUp?: boolean;
  readonly pixie?: true;
  readonly racing?: true;
  readonly reserved?: true;
  readonly boxed?: true;
  readonly crest?: true;
  readonly equipment?: true;
  readonly highest?: 'attack' | 'defense' | 'cost';
  readonly lowest?: 'attack' | 'defense' | 'cost';
}

export interface Place {
  readonly zone:
    | 'field'
    | 'ex'
    | 'hand'
    | 'cemetery'
    | 'deck'
    | 'evolveDeck'
    | 'evolveDeckRevealed'
    | 'evolveZone'
    | 'leader'
    | 'banished';
  readonly who: Who;
}

export type Attr = 'cost' | 'attack' | 'defense' | 'baseCost';

export type ResourceQuery =
  | 'playPoints'
  | 'maxPlayPoints'
  | 'evolutionPoints'
  | 'superEvolutionPoints'
  | 'hand'
  | 'deck'
  | 'ex'
  | 'cemetery'
  | 'banished';

export type Tally =
  | 'cardsPlayed'
  | 'spellsPlayed'
  | 'leaderLostDefense'
  | 'followersAttacked'
  | 'ubExecuted'
  | 'cardsPlayedExcludingSelf';

/** R3 arithmetic AST. Numbers in scripts are already `Value`. */
export type Value =
  | number
  | { readonly count: Place; readonly filter?: CardFilter; readonly times?: number }
  | { readonly var: string }
  | { readonly forEvery: number; readonly of: Value; readonly each: number }
  | { readonly half: Value }
  | { readonly sum: readonly Value[] }
  | { readonly attr: Attr; readonly of: string }
  | { readonly resource: ResourceQuery; readonly who?: Who }
  | { readonly tally: Tally }
  | { readonly counters: string; readonly on?: string }
  | { readonly minus: readonly [Value, Value] }
  | { readonly times: readonly [Value, Value] }
  | { readonly neg: Value }
  | { readonly min: readonly Value[] }
  | { readonly max: readonly Value[] }
  | { readonly result: string };

/** R4 boolean AST over values, selectors and class modules. */
export type Condition =
  | { readonly atLeast: number; readonly value: Value }
  | { readonly atMost: number; readonly value: Value }
  | { readonly combo: number }
  | { readonly exists: Place; readonly filter?: CardFilter }
  | { readonly all: readonly Condition[] }
  | { readonly any: readonly Condition[] }
  | { readonly not: Condition }
  | { readonly sameCost: string }
  | { readonly yourTurn: true }
  | { readonly matches: string; readonly filter: CardFilter }
  | { readonly overflow: true }
  | { readonly sanguine: true }
  | { readonly necrocharge: number }
  | { readonly spellchain: number }
  | { readonly earthRite: true }
  | { readonly stack: true }
  | { readonly lesson: number }
  | { readonly leaderClass: CardClass }
  | { readonly did: string }
  | { readonly equal: readonly [Value, Value] }
  | { readonly superEvolutionPointsAtMost: number }
  | { readonly die: { readonly atLeast?: number; readonly atMost?: number; readonly is?: number } }
  | { readonly playedFrom: string }
  | { readonly returnedFromField: CardFilter };

export type CountSpec = number | { readonly upTo: number } | 'any';

/** One group taken from a look-at-the-top pile. */
export interface LookPick {
  readonly filter?: CardFilter;
  readonly upTo?: number;
  readonly n?: number;
  readonly reveal: boolean;
  readonly then: 'hand' | 'field' | 'ex' | 'top';
  readonly costDeltaThisTurn?: number;
}

export type Instr =
  | {
      readonly op: 'select';
      readonly as: string;
      readonly from: readonly Place[];
      readonly filter?: CardFilter;
      readonly count: CountSpec;
      readonly target?: true;
      /** Printed costs of the chosen cards may not add up to more than this. */
      readonly costAtMostTotal?: number;
    }
  | {
      readonly op: 'search';
      readonly as: string;
      readonly filter?: CardFilter;
      readonly count: number;
      readonly reveal: boolean;
      readonly then: 'hand' | 'field' | 'ex';
      readonly costDeltaThisTurn?: number;
    }
  | {
      readonly op: 'lookTop';
      readonly n: number;
      /**
       * One group of cards to take from the looked-at pile. `picks` is several groups in order
       * ("up to 1 Mage follower and up to 1 Mage spell"). `n` takes that many (doing as much as
       * possible); `upTo` is optional.
       */
      readonly pick?: LookPick;
      readonly picks?: readonly LookPick[];
      readonly rest: 'bottom' | 'top' | 'bury';
    }
  | { readonly op: 'draw'; readonly n: Value; readonly who?: Who }
  | { readonly op: 'buryTop'; readonly n: Value; readonly who?: Who; readonly as?: string }
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
      /** How long `costDeltaThisTurn` lasts. Omitted means this turn. `null` stays until the card moves. */
      readonly costUntil?: 'endOfTurn' | 'endOfYourTurn' | 'startOfYourNextTurn' | null;
      /** `ex` and `field` go to the card's owner instead of the ability's controller. */
      readonly whose?: 'owner';
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
      readonly attack: Value;
      readonly defense: Value;
      readonly until?: 'endOfTurn' | 'endOfYourTurn' | 'startOfYourNextTurn';
    }
  | {
      readonly op: 'grant';
      readonly cards: string | { readonly each: Place; readonly filter?: CardFilter };
      readonly keywords: readonly Keyword[];
      readonly until?: 'endOfTurn' | 'endOfYourTurn' | 'startOfYourNextTurn';
    }
  | {
      readonly op: 'destroy';
      readonly cards: string | { readonly each: Place; readonly filter?: CardFilter };
    }
  | { readonly op: 'banish'; readonly cards: string }
  | { readonly op: 'returnToHand'; readonly cards: string }
  | { readonly op: 'engage'; readonly cards: string }
  | { readonly op: 'box'; readonly cards: string }
  | { readonly op: 'payPlayPoints'; readonly n: Value }
  | { readonly op: 'leaderDefense'; readonly who: Who; readonly delta: number }
  | { readonly op: 'recoverPlayPoints'; readonly n: number }
  | { readonly op: 'gainEvolutionPoints'; readonly n: number }
  | { readonly op: 'evolveSelf' }
  | {
      readonly op: 'turnCarrots';
      readonly faceUp: boolean;
      readonly upTo: number;
      readonly cards?: string;
    }
  | {
      readonly op: 'if';
      readonly cond: Condition;
      readonly then: readonly Instr[];
      readonly else?: readonly Instr[];
    }
  | {
      readonly op: 'chooseOne';
      readonly options: readonly {
        readonly label: string;
        readonly cost?: readonly Instr[];
        readonly effect: readonly Instr[];
      }[];
    }
  | {
      readonly op: 'chooseUpTo';
      readonly n: number;
      readonly options: readonly {
        readonly label: string;
        readonly cost?: readonly Instr[];
        readonly effect: readonly Instr[];
      }[];
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
  | { readonly op: 'lose' }
  | { readonly op: 'shuffle'; readonly who?: Who }
  | {
      readonly op: 'returnToDeck';
      readonly cards: string;
      readonly position: 'top' | 'bottom';
    }
  | { readonly op: 'transform'; readonly cards: string; readonly into: string }
  | { readonly op: 'steal'; readonly cards: string }
  | { readonly op: 'changeType'; readonly cards: string; readonly kind: CardKind }
  | {
      readonly op: 'setStat';
      readonly cards: string;
      readonly stat: 'attack' | 'defense';
      readonly to: Value;
    }
  | { readonly op: 'setLeaderDefense'; readonly who: Who; readonly to: Value }
  | {
      readonly op: 'placeCounters';
      readonly cards: string;
      readonly name: string;
      readonly n: Value;
      readonly cap?: number;
    }
  | {
      readonly op: 'removeCounters';
      readonly cards: string;
      readonly name: string;
      readonly n: Value;
      readonly as?: string;
    }
  | {
      readonly op: 'turnFace';
      readonly cards?: string;
      readonly faceUp: boolean;
      readonly upTo?: number;
    }
  | { readonly op: 'skipRefresh'; readonly cards: string }
  | { readonly op: 'copyToken'; readonly cards: string; readonly to: 'field' | 'ex' }
  | {
      readonly op: 'declareNumber';
      readonly as: string;
      readonly min?: number;
      readonly max?: number;
    }
  | { readonly op: 'declareName'; readonly as: string }
  | { readonly op: 'rollDie'; readonly as: string; readonly sides?: number }
  | { readonly op: 'pickRandom'; readonly cards: string; readonly n: number; readonly as: string }
  | { readonly op: 'extraTurn' }
  | { readonly op: 'skipTurn'; readonly who?: Who }
  | { readonly op: 'cantLose'; readonly until?: 'endOfTurn' | 'whileSource' }
  | { readonly op: 'refresh'; readonly cards: string }
  | { readonly op: 'maneuver'; readonly cards: string }
  | { readonly op: 'equip'; readonly cards: string; readonly name: string }
  | { readonly op: 'fuse'; readonly n: number; readonly filter?: CardFilter }
  | { readonly op: 'changeMaxPlayPoints'; readonly who?: Who; readonly delta: number }
  | { readonly op: 'chooseNumber'; readonly as: string; readonly min: number; readonly max: number }
  | { readonly op: 'orderCards'; readonly cards: string; readonly as: string }
  | { readonly op: 'superEvolve' }
  | { readonly op: 'ungrant'; readonly cards: string; readonly keywords: readonly Keyword[] }
  | { readonly op: 'reveal'; readonly cards: string }
  /**
   * "The next card you play costs N less." `amount` is added to the cost, so a discount is
   * negative. It is spent by the first matching card played; `thisTurn` also lets it lapse at the
   * end of the turn. Cards it makes affordable show as playable as soon as it is offered.
   */
  | {
      readonly op: 'nextPlayCost';
      readonly amount: number;
      readonly filter?: CardFilter;
      readonly thisTurn?: true;
    }
  | {
      readonly op: 'forEach';
      readonly cards: string;
      readonly as: string;
      readonly effect: readonly Instr[];
    }
  | {
      readonly op: 'bind';
      readonly as: string;
      readonly value: number | string | readonly string[];
    }
  | {
      readonly op: 'grantAbility';
      readonly cards: string;
      readonly ability: Ability;
      readonly until?: 'endOfTurn' | 'endOfYourTurn' | 'startOfYourNextTurn';
    };

export type Cost =
  | { readonly playPoints: number }
  | { readonly engage: true }
  | { readonly burySelf: true }
  | { readonly discard: { readonly n: number; readonly filter?: CardFilter } }
  /**
   * Show cards from your hand. They stay in hand; the opponent sees them. Played cards pick them
   * while paying (so only matching cards can be picked), and the card cannot be played without
   * enough of them.
   */
  | { readonly reveal: { readonly n: number; readonly filter?: CardFilter } }
  | { readonly list: readonly Cost[] }
  | { readonly banish: { readonly n: number; readonly filter?: CardFilter; readonly from?: Place } }
  | { readonly bury: { readonly n: number; readonly filter?: CardFilter; readonly from?: Place } }
  | { readonly counters: { readonly name: string; readonly n: number; readonly from?: 'self' } }
  | { readonly leaderDefense: number }
  | { readonly lesson: number }
  | { readonly earthRite: true }
  | { readonly necrocharge: number }
  | { readonly spellchain: number }
  | { readonly fuse: { readonly n: number; readonly filter?: CardFilter } }
  | { readonly x: { readonly min?: number; readonly max?: number } }
  | { readonly engageOther: CardFilter };

export interface EventPattern {
  readonly type:
    | 'played'
    | 'moved'
    | 'damaged'
    | 'destroyed'
    | 'evolved'
    | 'attacked'
    | 'engaged'
    | 'statGained'
    | 'ubExecuted'
    | 'drive'
    | 'fused'
    | 'leaderDefense'
    | 'drew'
    | 'timing'
    | 'state';
  readonly filter?: CardFilter;
  readonly from?: Place;
  readonly to?: Place;
  readonly who?: Who;
  readonly cause?: MoveCause;
  /** The card whose ability discarded or moved these, when the event records one. */
  readonly by?: CardFilter;
  readonly self?: boolean;
  readonly at?: 'startOfTurn' | 'startOfMainPhase' | 'startOfEndPhase';
  readonly whose?: 'yours' | 'opponents' | 'each';
}

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
  | {
      readonly enemyDamagedByYouLeavesField: CardFilter;
      readonly fromSource?: CardFilter;
    }
  | { readonly gainsAttackOrDefense: true }
  | { readonly whenever: EventPattern };

export interface ActivatedAbility {
  readonly kind: 'activated';
  readonly key: string;
  readonly cost: Cost;
  readonly quick?: true;
  readonly condition?: Condition;
  readonly effect: readonly Instr[];
  /** Evolve, Serve, or an advanced activated ability (8.3.2). */
  readonly evolveEquivalent?: 'evolve' | 'serve';
  readonly perTurn?: number;
  readonly label: string;
  /** Where this ability can be activated. Omitted means on the field. */
  readonly from?: 'field' | 'cemetery';
}

export interface TriggeredAbility {
  readonly kind: 'triggered';
  readonly key: string;
  readonly on: Trigger;
  readonly perTurn?: number;
  readonly condition?: Condition;
  readonly effect: readonly Instr[];
}

export interface StaticAbility {
  readonly kind: 'static';
  readonly key: string;
  readonly validIn: readonly ('field' | 'ex' | 'hand')[];
  readonly activeIs?: 'controller';
  readonly activeIf?: Condition;
  readonly grant?: {
    readonly filter: CardFilter;
    readonly keywords?: readonly Keyword[];
    readonly attack?: number;
    readonly defense?: number;
  };
  readonly costDelta?: {
    readonly filter: CardFilter;
    readonly amount: Value;
    readonly nthSpell?: number;
    readonly if?: Condition;
  };
  /** Evolve is legal only while this is true. */
  readonly evolveIf?: Condition;
  readonly playRestriction?: Condition;
  readonly notFromEx?: true;
  readonly costIf?: { readonly cond: Condition; readonly amount: number };
  readonly evolveCostDelta?: Value;
  readonly restriction?: Restriction;
  readonly replacement?: Replacement;
  readonly damageDealtDelta?: number;
  readonly damageTakenDelta?: number;
}

export interface Restriction {
  readonly cantAttack?: 'leaders' | 'followers' | 'enemies' | true;
  readonly cantBeAttacked?: true;
  readonly cantBeDestroyed?: 'abilities' | true;
  readonly cantBeBanished?: 'abilities' | true;
  readonly cantTakeDamage?: 'ability' | 'combat' | true;
  readonly cantDealDamage?: true;
  readonly cantDraw?: true;
  readonly cantRefresh?: true;
  readonly cantLose?: true;
  readonly cantWin?: true;
}

export interface Replacement {
  readonly would: 'takeDamage' | 'dealDamage' | 'draw' | 'destroy';
  readonly instead: 'prevent' | 'modify';
  readonly amount?: Value;
  /** `modify` becomes "no higher than `amount`" instead of replacing the damage. */
  readonly cap?: true;
  readonly next?: true;
  readonly until?: 'endOfTurn' | 'endOfYourTurn' | 'startOfYourNextTurn';
}

export interface SpellAbility {
  readonly kind: 'spell';
  readonly key: string;
  readonly effect: readonly Instr[];
  /**
   * Optional extra cost paid while playing (10.6.2.2). Discarded or banished ids land in
   * `__extraDiscarded`. Paying it reduces the play-point cost by `reduceBy`.
   */
  readonly extraCost?: {
    readonly label: string;
    readonly discard?: { readonly n: number; readonly filter?: CardFilter };
    readonly banish?: { readonly n: number; readonly filter?: CardFilter; readonly from: Place };
    readonly reduceBy: number;
  };
  /**
   * "As an additional cost to play this card…" (10.6.2.2). Compulsory: the card is not offered
   * unless it can be paid, and cards to reveal or discard are picked while playing it. Play
   * points, Leader defense and the like are paid with the play points.
   */
  readonly additionalCost?: Cost;
  /** Paid instead of the printed play-point cost. */
  readonly alternateCost?: Cost;
}

export type Ability = ActivatedAbility | TriggeredAbility | StaticAbility | SpellAbility;

export interface CardScript {
  /** Same as `CardDefinition.key` for the printing this script belongs to. */
  readonly key: string;
  readonly name: string;
  readonly textHash: string;
  readonly abilities: readonly Ability[];
  readonly alsoNamed?: readonly string[];
  /** Extra printed-text hashes for reprints that share a key but differ in markup. */
  readonly alsoHashes?: readonly string[];
  /** Overrides a missing `CardDefinition.copyLimit` (evolved Carrot spells). */
  readonly copyLimit?: number;
}

export const scriptKey = (script: Pick<CardScript, 'key'>): string => script.key;
