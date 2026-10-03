import type { EventsMessage, SnapshotMessage } from '@sve/protocol';
import { foldView, type MatchView } from '@sve/rules';
import type { Frame } from './frame';

/**
 * Keeping a view in step with the server's log.
 *
 * The server sends the whole view once (`snapshot`), then runs of events that each name the log
 * position they start from. A run is applied only if it starts exactly where this client is; any
 * other start means something was missed, and the only safe move is to ask for a fresh snapshot.
 * Pure functions, so the rule is tested without a socket.
 */

export interface SyncState {
  readonly view: MatchView | null;
  /** Log position the view reflects. */
  readonly seq: number;
  /** A resync has been asked for and its snapshot has not arrived: events are ignored meanwhile. */
  readonly resyncing: boolean;
}

export const INITIAL_SYNC: SyncState = { view: null, seq: 0, resyncing: false };

export interface SyncStep {
  readonly state: SyncState;
  /** What to show, when this step changed the picture. */
  readonly frame: Frame | null;
  /** The caller should ask the server for a snapshot. */
  readonly resync: boolean;
}

export function applySnapshot(message: SnapshotMessage): SyncStep {
  return {
    state: { view: message.view, seq: message.seq, resyncing: false },
    frame: { view: message.view, events: [], kind: 'snapshot' },
    resync: false,
  };
}

export function applyEvents(state: SyncState, message: EventsMessage): SyncStep {
  if (state.resyncing) return { state, frame: null, resync: false };
  if (state.view === null || message.fromSeq !== state.seq) {
    return { state: { ...state, resyncing: true }, frame: null, resync: true };
  }

  let view: MatchView = state.view;
  const events = message.events.map((envelope) => envelope.event);
  try {
    for (const event of events) view = foldView(view, event);
  } catch {
    // An event this client cannot apply to its view means the two have diverged.
    return { state: { ...state, resyncing: true }, frame: null, resync: true };
  }

  return {
    state: { view, seq: message.toSeq, resyncing: false },
    frame: { view, events, kind: 'delta' },
    resync: false,
  };
}
