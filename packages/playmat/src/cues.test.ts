import { reduce, seatViewer, projectEvent, type ClientEvent } from '@sve/rules';
import { describe, expect, it } from 'vitest';
import { cuesFor, cuesFromEvents } from './cues';
import { newMatch } from './testing/views';

/** Every event the engine emits while two players are walked through a few turns. */
function eventsOfARealMatch(): ClientEvent[] {
  const created = newMatch('cues');
  let state = created.state;
  const viewer = seatViewer(0);
  const seen: ClientEvent[] = created.events.flatMap(
    (event) => projectEvent(event, viewer, state) ?? [],
  );
  for (let step = 0; step < 60 && state.prompt && !state.outcome; step++) {
    const prompt = state.prompt;
    const intent =
      prompt.kind === 'turnOrder'
        ? ({
            type: 'choose',
            promptId: prompt.id,
            choice: { kind: 'turnOrder', goFirst: true },
          } as const)
        : prompt.kind === 'mulligan'
          ? ({
              type: 'choose',
              promptId: prompt.id,
              choice: { kind: 'mulligan', redraw: false },
            } as const)
          : prompt.kind === 'main'
            ? ({ type: 'pass', promptId: prompt.id } as const)
            : prompt.kind === 'engageWards'
              ? ({ type: 'engageWards', promptId: prompt.id, cards: [] } as const)
              : prompt.kind === 'discard'
                ? ({
                    type: 'choose',
                    promptId: prompt.id,
                    choice: { kind: 'discard', cards: prompt.candidates.slice(0, prompt.count) },
                  } as const)
                : ({ type: 'pass', promptId: prompt.id } as const);
    const result = reduce(state, { seat: prompt.seat, intent });
    if (!result.ok) throw new Error(result.reason);
    for (const event of result.events) {
      const shown = projectEvent(event, viewer, result.state);
      if (shown) seen.push(shown);
    }
    state = result.state;
  }
  return seen;
}

describe('cues', () => {
  const events = eventsOfARealMatch();

  it('has an answer for every event a real match produces', () => {
    expect(events.length).toBeGreaterThan(20);
    for (const event of events) expect(() => cuesFor(event)).not.toThrow();
  });

  it('turns the events that need a flourish into cues, and leaves cards to the layout diff', () => {
    const kinds = new Set(cuesFromEvents(events).map((cue) => cue.kind));
    expect(kinds).toContain('turn');
    expect(kinds).toContain('shuffle');
    expect(kinds).toContain('resource');
    expect(cuesFromEvents(events.filter((event) => event.type === 'cardsDrawn'))).toEqual([]);
  });

  it('names the seat a cue belongs to', () => {
    expect(cuesFor({ type: 'drewFromEmptyDeck', seat: 1 })).toEqual([
      { kind: 'emptyDeck', seat: 1 },
    ]);
  });
});
