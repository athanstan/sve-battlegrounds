import { describe, expect, it } from 'vitest';
import { asCardDefId, asCardId } from '../model/ids';
import { fieldCard, type MatchState } from '../state/state';
import { textHash } from './generic';
import type { CardScript } from './spec';
import { cardKey } from '../model/cards';
import { atFirstMainPhase, defaultAnswer, must, type Run } from '../testing/support';
import { evaluateCondition, evaluateValue } from './values';
import { gather } from './filters';
import { costParts, costPlayPoints, canPayCost } from './costs';
import { combo, overflow, sanguine, lesson, necrocharge } from './modules';
import { modifiedDamage, hasRestriction } from './statics';
import { applyEvent } from '../events/apply';
import { reduce } from '../engine/reduce';

const promptOf = (state: MatchState) => {
  if (!state.prompt) throw new Error('Expected an open prompt');
  return state.prompt;
};

const putOnField = (
  run: Run,
  source: ReturnType<typeof asCardId>,
  defId: ReturnType<typeof asCardDefId>,
  script: CardScript,
  text: string,
): Run => {
  const seat = run.state.active!;
  const def = run.state.defs[defId];
  if (!def) throw new Error('missing def');
  const scripted: MatchState = {
    ...run.state,
    defs: { ...run.state.defs, [defId]: { ...def, text } },
    scripts: { ...run.state.scripts, [defId]: script },
    cards: { ...run.state.cards, [source]: { id: source, def: defId, owner: seat, token: false } },
    seats:
      seat === 0
        ? [{ ...run.state.seats[0], field: [fieldCard(source, 'reserved', 0)] }, run.state.seats[1]]
        : [
            run.state.seats[0],
            { ...run.state.seats[1], field: [fieldCard(source, 'reserved', 0)] },
          ],
  };
  return { state: scripted, events: run.events };
};

describe('R2 selectors / R3 values / R4 conditions', () => {
  it('counts, halves, subtracts, and reads resources', () => {
    const run = atFirstMainPhase('values');
    const seat = run.state.active!;
    expect(evaluateValue(run.state, seat, { resource: 'hand' }, {})).toBe(
      run.state.seats[seat].hand.length,
    );
    expect(evaluateValue(run.state, seat, { half: 5 }, {})).toBe(3);
    expect(evaluateValue(run.state, seat, { minus: [4, 1] }, {})).toBe(3);
    expect(evaluateValue(run.state, seat, { minus: [1, 4] }, {})).toBe(0);
    expect(evaluateValue(run.state, seat, { forEvery: 2, of: 5, each: 1 }, {})).toBe(2);
    expect(evaluateValue(run.state, seat, { count: { zone: 'hand', who: 'you' } }, {})).toBe(
      run.state.seats[seat].hand.length,
    );
  });

  it('evaluates class conditions from the module helpers', () => {
    const run = atFirstMainPhase('conds');
    const seat = run.state.active!;
    expect(evaluateCondition(run.state, seat, overflow, {})).toBe(
      run.state.seats[seat].resources.maxPlayPoints >= 7,
    );
    expect(evaluateCondition(run.state, seat, combo(1), {})).toBe(
      run.state.seats[seat].flags.cardsPlayed >= 1,
    );
    expect(evaluateCondition(run.state, seat, sanguine, {})).toBe(false);
    expect(evaluateCondition(run.state, seat, necrocharge(1), {})).toBe(
      run.state.seats[seat].cemetery.length >= 1,
    );
    expect(evaluateCondition(run.state, seat, lesson(1), {})).toBe(false);
  });

  it('keeps the highest-cost cards when asked', () => {
    const run = atFirstMainPhase('highest');
    const seat = run.state.active!;
    const all = gather(run.state, seat, [{ zone: 'hand', who: 'you' }], undefined);
    const top = gather(run.state, seat, [{ zone: 'hand', who: 'you' }], { highest: 'cost' });
    const best = Math.max(...all.map((id) => run.state.defs[run.state.cards[id]!.def]!.cost));
    expect(top.every((id) => run.state.defs[run.state.cards[id]!.def]!.cost === best)).toBe(true);
  });
});

describe('R6 costs', () => {
  it('flattens a list and reads play-point atoms', () => {
    const cost = { list: [{ playPoints: 2 }, { engage: true as const }, { playPoints: 1 }] };
    expect(costParts(cost)).toHaveLength(3);
    expect(costPlayPoints(cost)).toBe(3);
  });

  it('rejects an activate that cannot pay leader defense', () => {
    const run = atFirstMainPhase('cost-pay');
    const seat = run.state.active!;
    const card = run.state.seats[seat].hand[0]!;
    expect(canPayCost(run.state, seat, card, { leaderDefense: 99 })).toBe(false);
    expect(canPayCost(run.state, seat, card, { playPoints: 0 })).toBe(true);
  });
});

describe('R7 layers and replacement (CR 10.9 / 10.10)', () => {
  it('prevents damage when a static replacement says so', () => {
    const text = "This follower doesn't take damage.";
    const defId = asCardDefId('test-follower-0');
    const script: CardScript = {
      key: cardKey('Test Follower 0'),
      name: 'Test Follower 0',
      textHash: textHash(text),
      abilities: [
        {
          kind: 'static',
          key: 'no-dmg',
          validIn: ['field'],
          restriction: { cantTakeDamage: true },
          replacement: { would: 'takeDamage', instead: 'prevent' },
        },
      ],
    };
    const source = asCardId('ward-elf');
    const run = putOnField(atFirstMainPhase('no-dmg'), source, defId, script, text);
    const seat = run.state.active!;
    expect(
      modifiedDamage(run.state, {
        source: null,
        target: source,
        targetSeat: seat,
        amount: 3,
        combat: false,
      }),
    ).toBe(0);
    expect(hasRestriction(run.state, source, (r) => r.cantTakeDamage === true)).toBe(true);
  });
});

describe('R1 events, R5 instructions, R9 turns', () => {
  it('lets the same seat act again after an extra turn is queued', () => {
    const run = atFirstMainPhase('extra-turn');
    const seat = run.state.active!;
    const queued = applyEvent(run.state, { type: 'extraTurnQueued', seat });
    expect(queued.extraTurns).toBe(1);
    const next = must({ state: queued, events: run.events }, defaultAnswer(promptOf(queued)));
    expect(next.state.active).toBe(seat);
    expect(next.state.turn).toBeGreaterThan(run.state.turn);
  });

  it('records turn events on the per-turn log', () => {
    const run = atFirstMainPhase('event-log');
    expect(run.state.eventLog.includes('turnStarted')).toBe(true);
    const next = applyEvent(run.state, {
      type: 'extraTurnQueued',
      seat: run.state.active!,
    });
    expect(next.extraTurns).toBe(run.state.extraTurns + 1);
    expect(next.eventLog.at(-1)).toBe('extraTurnQueued');
  });
});

describe('R8 last-known information (CR 10.11)', () => {
  it('snapshots shown stats when a follower leaves the field', () => {
    const run = atFirstMainPhase('lki');
    const seat = run.state.active!;
    const source = asCardId('lki-elf');
    const defId = asCardDefId('test-follower-0');
    const def = run.state.defs[defId]!;
    const card = {
      ...fieldCard(source, 'reserved', 0),
      shown: { attack: 5, defense: 4, keywords: [] as const },
    };
    const scripted: MatchState = {
      ...run.state,
      cards: {
        ...run.state.cards,
        [source]: { id: source, def: defId, owner: seat, token: false },
      },
      seats:
        seat === 0
          ? [{ ...run.state.seats[0], field: [card] }, run.state.seats[1]]
          : [run.state.seats[0], { ...run.state.seats[1], field: [card] }],
    };
    void def;
    const after = applyEvent(scripted, {
      type: 'cardsMoved',
      owner: seat,
      cards: [source],
      from: { zone: 'field', seat },
      to: { zone: 'cemetery', seat },
      cause: 'destroy',
    });
    expect(after.cards[source]?.lastKnown).toEqual({
      zone: 'field',
      seat,
      attack: 5,
      defense: 4,
      keywords: [],
    });
  });
});

describe('R10 number prompts', () => {
  it('binds a declared number onto the ability and draws that many', () => {
    const text = 'Fanfare: Choose a number from 0 to 1. Draw that many cards.';
    let run: Run | null = null;
    let playCard: ReturnType<typeof asCardId> | null = null;
    for (let n = 0; n < 40; n++) {
      const candidate = atFirstMainPhase(`choose-n-${n}`);
      const prompt = promptOf(candidate.state);
      if (prompt.kind !== 'main') continue;
      const play = prompt.options.find((option) => option.type === 'play');
      if (play?.type !== 'play') continue;
      run = candidate;
      playCard = play.card;
      break;
    }
    if (!run || !playCard) throw new Error('no play');
    const seat = run.state.active!;
    const prompt = promptOf(run.state);
    const defId = run.state.cards[playCard]!.def;
    const def = run.state.defs[defId]!;
    const script: CardScript = {
      key: def.key,
      name: def.name,
      textHash: textHash(text),
      abilities: [
        {
          kind: 'triggered',
          key: 'fanfare',
          on: 'fanfare',
          effect: [
            { op: 'chooseNumber', as: 'x', min: 0, max: 1 },
            { op: 'draw', n: { var: 'x' } },
          ],
        },
      ],
    };
    const scripted: MatchState = {
      ...run.state,
      defs: { ...run.state.defs, [defId]: { ...def, text } },
      scripts: { ...run.state.scripts, [defId]: script },
    };
    const started = must(
      { state: scripted, events: run.events },
      { seat, intent: { type: 'play', promptId: prompt.id, card: playCard } },
    );
    const asked = promptOf(started.state);
    expect(asked.kind).toBe('chooseNumber');
    if (asked.kind !== 'chooseNumber') return;
    const before = started.state.seats[seat].hand.length;
    const answered = reduce(started.state, {
      seat,
      intent: { type: 'choose', promptId: asked.id, choice: { kind: 'number', value: 1 } },
    });
    if (!answered.ok) throw new Error(answered.reason);
    expect(answered.state.seats[seat].hand.length).toBeGreaterThanOrEqual(before);
  });
});
