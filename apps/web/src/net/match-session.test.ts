import { MatchMessage, type MatchServerMessages } from '@sve/protocol';
import { reduce, seatViewer, projectEvent, type ClientEnvelope } from '@sve/rules';
import { newMatch, viewOf } from '@sve/playmat/testing';
import { describe, expect, it, vi } from 'vitest';
import { MatchSession, type SessionHooks } from './match-session';
import type { RoomLike } from './room';

/** A room that records what the session sends and lets a test speak for the server. */
class FakeRoom implements RoomLike {
  readonly roomId = 'room-1';
  reconnectionToken = 'resume-1';
  state: unknown = null;
  readonly sent: { type: string; payload: unknown }[] = [];
  #handlers = new Map<string, (payload: never) => void>();
  #lifecycle: Record<string, (arg?: unknown) => void> = {};

  onMessage<K extends keyof MatchServerMessages>(
    type: K,
    handler: (payload: MatchServerMessages[K]) => void,
  ) {
    this.#handlers.set(type, handler);
  }
  onStateChange(handler: (state: unknown) => void) {
    this.#lifecycle.state = handler;
  }
  onDrop(handler: () => void) {
    this.#lifecycle.drop = handler;
  }
  onReconnect(handler: () => void) {
    this.#lifecycle.reconnect = handler;
  }
  onLeave(handler: (code: number) => void) {
    this.#lifecycle.leave = (code) => handler(code as number);
  }
  send(type: string, payload?: unknown) {
    this.sent.push({ type, payload });
  }
  leave = vi.fn(() => Promise.resolve(1000));

  // ---- the server's side
  serve<K extends keyof MatchServerMessages>(type: K, payload: MatchServerMessages[K]) {
    this.#handlers.get(type)?.(payload as never);
  }
  emit(name: 'state' | 'drop' | 'reconnect' | 'leave', arg?: unknown) {
    this.#lifecycle[name]?.(arg);
  }
}

const hooks = (): SessionHooks & { tokens: string[]; ended: number } => {
  const record = {
    tokens: [] as string[],
    ended: 0,
    onResumeToken: (token: string) => void record.tokens.push(token),
    onEnded: () => void (record.ended += 1),
  };
  return record;
};

/** The first prompt of a real match, as player 0's view and the prompt it holds. */
function firstTurn() {
  const created = newMatch('session');
  const view = viewOf(created.state, 0);
  const viewer = seatViewer(0);
  const chooser = created.state.prompt?.seat ?? 0;
  const prompt = created.state.prompt;
  if (!prompt) throw new Error('match should open on a prompt');
  const result = reduce(created.state, {
    seat: chooser,
    intent: { type: 'choose', promptId: prompt.id, choice: { kind: 'turnOrder', goFirst: true } },
  });
  if (!result.ok) throw new Error(result.reason);
  const events: ClientEnvelope[] = result.events.flatMap((event, index) => {
    const projected = projectEvent(event, viewer, result.state);
    return projected ? [{ seq: created.state.seq + index + 1, event: projected }] : [];
  });
  return { created, view, after: result.state, events, prompt };
}

describe('MatchSession', () => {
  it('remembers how to resume the seat as soon as it joins, and after every reconnect', () => {
    const room = new FakeRoom();
    const h = hooks();
    new MatchSession(room, h);
    expect(h.tokens).toEqual(['resume-1']);

    room.reconnectionToken = 'resume-2';
    room.emit('drop');
    room.emit('reconnect');
    expect(h.tokens).toEqual(['resume-1', 'resume-2']);
  });

  it('shows the turn-order prompt from the opening events, without waiting for a snapshot', () => {
    const created = newMatch('session-open');
    const viewer = seatViewer(0);
    const events: ClientEnvelope[] = created.events.flatMap((event, index) => {
      const projected = projectEvent(event, viewer, created.state);
      return projected ? [{ seq: index + 1, event: projected }] : [];
    });
    const room = new FakeRoom();
    const session = new MatchSession(room, hooks());
    room.serve(MatchMessage.events, { fromSeq: 0, toSeq: created.state.seq, events });

    expect(room.sent).toEqual([]);
    expect(session.getState().view?.waitingOn?.kind).toBe('turnOrder');
    expect(session.getState().view).toEqual(viewOf(created.state, 0));
  });

  it('shows a snapshot as a replacement and a following run of events as a move', () => {
    const { created, view, after, events } = firstTurn();
    const room = new FakeRoom();
    const session = new MatchSession(room, hooks());

    room.serve(MatchMessage.snapshot, { seq: created.state.seq, view });
    expect(session.getState().frame?.kind).toBe('snapshot');
    expect(session.getState().view).toEqual(view);

    room.serve(MatchMessage.events, { fromSeq: created.state.seq, toSeq: after.seq, events });
    expect(session.getState().frame?.kind).toBe('delta');
    expect(session.getState().view).toEqual(viewOf(after, 0));
    expect(room.sent).toEqual([]);
  });

  it('asks the server for a fresh snapshot when it has missed something', () => {
    const { created, view, after, events } = firstTurn();
    const room = new FakeRoom();
    const session = new MatchSession(room, hooks());
    room.serve(MatchMessage.snapshot, { seq: created.state.seq, view });

    room.serve(MatchMessage.events, {
      fromSeq: created.state.seq + 5,
      toSeq: after.seq + 5,
      events,
    });
    expect(room.sent).toEqual([{ type: MatchMessage.resync, payload: undefined }]);
    expect(session.getState().view).toEqual(view);
  });

  it('shows who is at the table from the synchronised state', () => {
    const room = new FakeRoom();
    const session = new MatchSession(room, hooks());
    room.emit('state', {
      status: 'playing',
      title: "Alice's match",
      spectators: 2,
      seats: [
        {
          occupied: true,
          userId: 'alice',
          displayName: 'Alice',
          avatarUrl: '',
          deckName: 'Sword',
          connected: true,
        },
        {
          occupied: true,
          userId: 'bob',
          displayName: 'Bob',
          avatarUrl: '',
          deckName: 'Forest',
          connected: false,
        },
      ],
    });
    expect(session.getState().presence).toMatchObject({
      status: 'playing',
      spectators: 2,
      seats: [
        { displayName: 'Alice', connected: true },
        { displayName: 'Bob', connected: false },
      ],
    });
  });

  describe('answering', () => {
    function seated() {
      const { created, view, after, events, prompt } = firstTurn();
      const room = new FakeRoom();
      const session = new MatchSession(room, hooks());
      room.serve(MatchMessage.snapshot, {
        seq: created.state.seq,
        view: viewOf(created.state, prompt.seat),
      });
      const answer = {
        type: 'choose',
        promptId: prompt.id,
        choice: { kind: 'turnOrder', goFirst: true },
      } as const;
      return { room, session, answer, prompt, created, after, events, view };
    }

    it('sends an answer once, however often the button is pressed', () => {
      const { room, session, answer, prompt } = seated();
      session.send(answer);
      session.send(answer);
      expect(room.sent.filter((m) => m.type === MatchMessage.intent)).toHaveLength(1);
      expect(session.getState().answering).toBe(prompt.id);
    });

    it('is settled when the question moves on', () => {
      const { room, session, answer, created, after, prompt } = seated();
      session.send(answer);
      const next = viewOf(after, prompt.seat);
      room.serve(MatchMessage.snapshot, { seq: after.seq, view: next });
      expect(created.state.prompt?.id).not.toBe(after.prompt?.id);
      expect(session.getState().answering).toBeNull();
    });

    it('is settled, and explained, when the server turns the answer down', () => {
      const { room, session, answer, prompt } = seated();
      session.send(answer);
      room.serve(MatchMessage.rejected, { code: 'stalePrompt', promptId: prompt.id });
      expect(session.getState().answering).toBeNull();
      expect(session.getState().notice).toBe('That question has already been answered.');

      session.dismissNotice();
      expect(session.getState().notice).toBeNull();
    });

    it('does not let an old refusal cancel a newer answer', () => {
      const { room, session, answer, prompt } = seated();
      session.send(answer);
      room.serve(MatchMessage.rejected, { code: 'stalePrompt', promptId: prompt.id + 99 });
      expect(session.getState().answering).toBe(prompt.id);
    });

    it('sends nothing while the connection is down', () => {
      const { room, session, answer } = seated();
      room.emit('drop');
      session.send(answer);
      session.say('hello?');
      expect(room.sent).toEqual([]);

      room.emit('reconnect');
      session.send(answer);
      expect(room.sent).toHaveLength(1);
    });

    it('lets a player concede at any time', () => {
      const { room, session } = seated();
      session.send({ type: 'concede' });
      session.send({ type: 'concede' });
      expect(room.sent.filter((m) => m.type === MatchMessage.intent)).toHaveLength(2);
    });
  });

  describe('chat', () => {
    it('starts from the history, then adds lines as they arrive', () => {
      const room = new FakeRoom();
      const session = new MatchSession(room, hooks());
      const line = (id: number, text: string) => ({
        id,
        channel: 'table' as const,
        author: { userId: 'bob', displayName: 'Bob', seat: 1 as const },
        text,
        at: id,
      });
      room.serve(MatchMessage.chatHistory, { lines: [line(1, 'gl')] });
      room.serve(MatchMessage.chatMessage, line(2, 'hf'));
      expect(session.getState().chat.map((l) => l.text)).toEqual(['gl', 'hf']);
    });

    it('trims what it sends and ignores empty lines', () => {
      const room = new FakeRoom();
      const session = new MatchSession(room, hooks());
      session.say('   ');
      session.say('  hello  ');
      expect(room.sent).toEqual([{ type: MatchMessage.chatSend, payload: { text: 'hello' } }]);
    });
  });

  it('records why the connection ended, and walks out on request', async () => {
    const room = new FakeRoom();
    const h = hooks();
    const session = new MatchSession(room, h);

    await session.leave();
    expect(h.ended).toBe(1);
    expect(room.leave).toHaveBeenCalled();

    room.emit('leave', 1000);
    expect(session.getState()).toMatchObject({ connection: 'closed', closedWith: 1000 });
  });

  it('notifies subscribers of every change, and only while they are subscribed', () => {
    const room = new FakeRoom();
    const session = new MatchSession(room, hooks());
    const listener = vi.fn();
    const stop = session.subscribe(listener);
    room.emit('drop');
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    room.emit('reconnect');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
