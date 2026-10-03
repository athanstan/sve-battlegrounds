import { advance, atMainPhase, newState, spectatorViewOf, viewOf } from '@sve/playmat/testing';
import { asCardDefId, asCardId, type MatchView, type Prompt } from '@sve/rules';
import { describe, expect, it } from 'vitest';
import { promptUi, waitingLabel } from './prompt-model';

const names = { 0: 'Alice', 1: 'Bob' } as const;

/** The same view with a different open prompt, for the prompts a short match cannot reach. */
const withPrompt = (view: MatchView, prompt: Prompt): MatchView => ({
  ...view,
  prompt,
  waitingOn: { id: prompt.id, seat: prompt.seat, kind: prompt.kind },
});

describe('promptUi', () => {
  it('asks the seat that chooses turn order, and only that seat', () => {
    const state = newState('prompts');
    const chooser = state.prompt?.seat ?? 0;
    const asked = promptUi(viewOf(state, chooser));
    expect(asked).toMatchObject({ kind: 'choice', title: 'You choose who goes first' });
    expect(asked?.kind === 'choice' && asked.options.map((o) => o.label)).toEqual([
      'Go first',
      'Go second',
    ]);

    expect(promptUi(viewOf(state, chooser === 0 ? 1 : 0))).toBeNull();
    expect(promptUi(spectatorViewOf(state))).toBeNull();
  });

  it('turns each choice into the intent that answers the prompt it was asked by', () => {
    const state = newState('prompts');
    const chooser = state.prompt?.seat ?? 0;
    const asked = promptUi(viewOf(state, chooser));
    if (asked?.kind !== 'choice') throw new Error('expected a choice');
    expect(asked.options.map((o) => o.intent)).toEqual([
      { type: 'choose', promptId: state.prompt?.id, choice: { kind: 'turnOrder', goFirst: true } },
      { type: 'choose', promptId: state.prompt?.id, choice: { kind: 'turnOrder', goFirst: false } },
    ]);
  });

  it('offers the mulligan as keep or redraw', () => {
    const state = advance(newState('prompts'), (s) => s.prompt?.kind === 'mulligan');
    const seat = state.prompt?.seat ?? 0;
    const asked = promptUi(viewOf(state, seat));
    expect(asked?.kind === 'choice' && asked.options.map((o) => o.label)).toEqual([
      'Keep',
      'Redraw',
    ]);
  });

  it('shows no bar for the main phase, only the hourglass', () => {
    const state = atMainPhase('prompts', 1);
    const seat = state.prompt?.seat ?? 0;
    expect(promptUi(viewOf(state, seat))).toEqual({ kind: 'pass', promptId: state.prompt?.id });
  });

  it('has the player pick cards on the mat for a discard, and only lets them confirm the right number', () => {
    const base = viewOf(atMainPhase('prompts', 2), 0);
    const candidates = [asCardId('0:m1'), asCardId('0:m2'), asCardId('0:m3')];
    const asked = promptUi(
      withPrompt(base, { kind: 'discard', id: 41, seat: 0, count: 2, candidates }),
    );
    if (asked?.kind !== 'pick') throw new Error('expected a pick');

    expect(asked.title).toBe('Discard 2 cards to get down to the hand limit');
    expect(asked.spec).toEqual({ candidates, min: 2, max: 2 });
    expect([0, 1, 2].map((n) => asked.canConfirm(n))).toEqual([false, false, true]);
    expect([0, 1, 2].map((n) => asked.confirmLabel(n))).toEqual([
      'Pick 2 more',
      'Pick 1 more',
      'Discard',
    ]);
    expect(asked.intent([candidates[0] as never, candidates[2] as never])).toEqual({
      type: 'choose',
      promptId: 41,
      choice: { kind: 'discard', cards: [candidates[0], candidates[2]] },
    });
  });

  it('turns a Quick window into a Respond bar with Pass', () => {
    const base = viewOf(atMainPhase('prompts', 2), 0);
    const asked = promptUi(withPrompt(base, { kind: 'quickWindow', id: 9, seat: 0, options: [] }));
    expect(asked?.kind).toBe('choice');
    expect(asked?.kind === 'choice' && asked.title).toBe('Respond?');
    expect(asked?.kind === 'choice' && asked.options.at(-1)?.intent).toEqual({
      type: 'pass',
      promptId: 9,
    });
  });

  it('opens a browser for a deck search', () => {
    const base = viewOf(atMainPhase('prompts', 2), 0);
    const card = { id: asCardId('0:m1'), def: asCardDefId('fx') };
    const asked = promptUi(
      withPrompt(base, {
        kind: 'selectCards',
        id: 12,
        seat: 0,
        label: 'Search your deck',
        candidates: [card.id],
        previews: [card],
        min: 0,
        max: 1,
        where: 'browser',
      }),
    );
    expect(asked?.kind).toBe('browser');
  });

  it('lets a player engage any number of Wards, including none', () => {
    const base = viewOf(atMainPhase('prompts', 2), 0);
    const candidates = [asCardId('0:m1'), asCardId('0:m2')];
    const asked = promptUi(withPrompt(base, { kind: 'engageWards', id: 7, seat: 0, candidates }));
    if (asked?.kind !== 'pick') throw new Error('expected a pick');

    expect(asked.spec).toEqual({ candidates, min: 0, max: 2 });
    expect(asked.canConfirm(0)).toBe(true);
    expect([0, 1, 2].map((n) => asked.confirmLabel(n))).toEqual(['Skip', 'Engage 1', 'Engage 2']);
    expect(asked.intent([])).toEqual({ type: 'engageWards', promptId: 7, cards: [] });
  });
});

describe('waitingLabel', () => {
  it('says who the match is waiting on, to everyone but the one being asked', () => {
    const state = newState('prompts');
    const chooser = state.prompt?.seat ?? 0;
    const other = chooser === 0 ? 1 : 0;
    expect(waitingLabel(viewOf(state, other), names)).toBe(
      `${names[chooser]} is choosing who goes first`,
    );
    expect(waitingLabel(spectatorViewOf(state), names)).toBe(
      `${names[chooser]} is choosing who goes first`,
    );
    expect(waitingLabel(viewOf(state, chooser), names)).toBeNull();
  });

  it('has nothing to say during a turn: the leader’s ring already shows whose it is', () => {
    const state = atMainPhase('prompts', 1);
    const other = state.prompt?.seat === 0 ? 1 : 0;
    expect(waitingLabel(viewOf(state, other), names)).toBeNull();
  });

  it('is silent when nothing is being waited on', () => {
    const view = viewOf(newState('prompts'), 0);
    expect(waitingLabel({ ...view, waitingOn: null, prompt: null }, names)).toBeNull();
  });
});
