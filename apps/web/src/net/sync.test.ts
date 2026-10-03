import type { EventsMessage } from '@sve/protocol';
import {
  projectEvent,
  reduce,
  seatViewer,
  type ClientEnvelope,
  type MatchState,
  type MatchView,
} from '@sve/rules';
import { newMatch, viewOf } from '@sve/playmat/testing';
import { describe, expect, it } from 'vitest';
import { INITIAL_SYNC, applyEvents, applySnapshot } from './sync';

/** A real match, cut into the same messages the server sends player 0. */
function transcript() {
  const created = newMatch('sync');
  const viewer = seatViewer(0);
  const envelopes = (
    events: typeof created.events,
    after: MatchState,
    firstSeq: number,
  ): ClientEnvelope[] =>
    events.flatMap((event, index) => {
      const projected = projectEvent(event, viewer, after);
      return projected ? [{ seq: firstSeq + index + 1, event: projected }] : [];
    });

  const messages: EventsMessage[] = [
    { fromSeq: 0, toSeq: created.state.seq, events: envelopes(created.events, created.state, 0) },
  ];
  const views: MatchView[] = [viewOf(created.state, 0)];

  let state = created.state;
  for (let step = 0; step < 12 && state.prompt && !state.outcome; step++) {
    const { prompt } = state;
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
          : ({ type: 'pass', promptId: prompt.id } as const);
    const before = state;
    const result = reduce(state, { seat: prompt.seat, intent });
    if (!result.ok) break;
    state = result.state;
    messages.push({
      fromSeq: before.seq,
      toSeq: state.seq,
      events: envelopes(result.events, state, before.seq),
    });
    views.push(viewOf(state, 0));
  }
  return { messages, views };
}

describe('keeping a view in step', () => {
  const { messages, views } = transcript();

  it('starts from a snapshot and shows it as a replacement, not a move', () => {
    const view = views.at(-1);
    if (!view) throw new Error('no views');
    const step = applySnapshot({ seq: 7, view });
    expect(step.state).toEqual({ view, seq: 7, resyncing: false });
    expect(step.frame).toEqual({ view, events: [], kind: 'snapshot' });
    expect(step.resync).toBe(false);
  });

  it('folds a whole match of event runs into exactly the view the server would have projected', () => {
    // The first run is a match being created, which a late joiner receives as a snapshot instead.
    const [created, ...rest] = messages;
    if (!created) throw new Error('no messages');
    let sync = applyEvents(INITIAL_SYNC, { ...created, fromSeq: 0 });
    // A client that has no view yet cannot apply anything: it must ask for one.
    expect(sync.resync).toBe(true);

    sync = applySnapshot({ seq: created.toSeq, view: views[0]! });
    let state = sync.state;
    for (const [index, message] of rest.entries()) {
      const step = applyEvents(state, message);
      expect(step.resync).toBe(false);
      expect(step.frame?.kind).toBe('delta');
      state = step.state;
      expect(state.view).toEqual(views[index + 1]);
      expect(state.seq).toBe(message.toSeq);
    }
  });

  it('asks for a snapshot when a run does not start where the client is, and waits for it', () => {
    const [created, first, second] = messages;
    if (!created || !first || !second) throw new Error('transcript too short');
    const base = applySnapshot({ seq: created.toSeq, view: views[0]! }).state;

    // `second` skips over `first`: the client missed something.
    const gap = applyEvents(base, second);
    expect(gap.resync).toBe(true);
    expect(gap.frame).toBeNull();
    expect(gap.state.view).toBe(base.view);

    // While the snapshot is on its way nothing else is applied, and nothing is asked twice.
    const waiting = applyEvents(gap.state, first);
    expect(waiting).toEqual({ state: gap.state, frame: null, resync: false });

    // The snapshot ends the wait.
    const healed = applySnapshot({ seq: second.toSeq, view: views[2]! });
    expect(healed.state.resyncing).toBe(false);
    expect(healed.state.view).toBe(views[2]);
  });

  it('treats a repeated run as a gap too, rather than applying it twice', () => {
    const [created, first] = messages;
    if (!created || !first) throw new Error('transcript too short');
    const base = applySnapshot({ seq: created.toSeq, view: views[0]! }).state;
    const once = applyEvents(base, first).state;
    expect(applyEvents(once, first).resync).toBe(true);
  });
});
