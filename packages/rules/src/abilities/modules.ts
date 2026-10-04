import type { CardClass } from '../model/cards';
import type { CardFilter, Condition, Cost, Trigger } from './spec';

/**
 * Class and universe modules built on R1–R9. Scripts name the mechanic; the engine evaluates
 * the shared condition, cost, or trigger AST rather than special-casing each craft.
 */

export const overflow: Condition = { overflow: true };
export const sanguine: Condition = { sanguine: true };
export const earthRite: Condition = { earthRite: true };
export const stack: Condition = { stack: true };

export const combo = (n: number): Condition => ({ combo: n });
export const necrocharge = (n: number): Condition => ({ necrocharge: n });
export const spellchain = (n: number): Condition => ({ spellchain: n });
export const lesson = (n: number): Condition => ({ lesson: n });
export const leaderClass = (cardClass: CardClass): Condition => ({ leaderClass: cardClass });

export const lessonCost = (n: number): Cost => ({ lesson: n });
export const earthRiteCost: Cost = { earthRite: true };
export const necrochargeCost = (n: number): Cost => ({ necrocharge: n });
export const spellchainCost = (n: number): Cost => ({ spellchain: n });
export const fuseCost = (n: number, filter?: CardFilter): Cost =>
  filter ? { fuse: { n, filter } } : { fuse: { n } };

export const onRace: Trigger = 'onRace';
export const onDrive: Trigger = { whenever: { type: 'drive' } };
export const onUnionBurst: Trigger = { whenever: { type: 'ubExecuted' } };
export const onFuse: Trigger = { whenever: { type: 'fused' } };
export const onServe = onRace;
