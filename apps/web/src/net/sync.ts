import type { EventsMessage, SnapshotMessage } from '@sve/protocol';
import { foldView, type MatchView } from '@sve/rules';
import type { Frame } from './frame';

/**
 * Keeping a view in step with the server's log.
 *
 * The server sends a snapshot on join, reconnect and resync. Everything else is a run of events
 * that names the log position it starts from. A run is applied only if it starts exactly where
 * this client is; any other start means something was missed, and the only safe move is to ask
 * for a fresh snapshot.
 *
 * The one exception is the opening of a match: those events start at seq 0 and begin with
 * `matchCreated`, which `foldView` can apply to an empty client. Treating that as a gap would
 * hide the turn-order prompt until a resync round-trip finished.
 *
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
  if (message.fromSeq !== state.seq) {
    return { state: { ...state, resyncing: true }, frame: null, resync: true };
  }

  let view: MatchView | null = state.view;
  const events = message.events.map((envelope) => envelope.event);
  try {
    for (const event of events) view = foldView(view, event);
  } catch {
    // An event this client cannot apply to its view means the two have diverged.
    return { state: { ...state, resyncing: true }, frame: null, resync: true };
  }

  if (view === null) {
    return { state: { ...state, resyncing: true }, frame: null, resync: true };
  }

  return {
    state: { view, seq: message.toSeq, resyncing: false },
    // First picture of a match: land it, do not animate from nothing.
    frame: { view, events, kind: state.view === null ? 'snapshot' : 'delta' },
    resync: false,
  };
}
