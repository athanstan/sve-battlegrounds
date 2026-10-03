import { RECONNECT_WINDOW_SECONDS } from '@sve/protocol';
import type { Seat } from '@sve/rules';
import type { Connection } from '../net/match-session';
import type { Presence } from '../net/presence';

export interface TableNotice {
  readonly tone: 'info' | 'warn';
  readonly text: string;
  /** The table is gone for this browser: the only way on is back to the lobby. */
  readonly leave: boolean;
}

interface Situation {
  readonly connection: Connection;
  readonly presence: Presence | null;
  /** The viewer's own seat, or null for a spectator. */
  readonly seat: Seat | null;
  readonly names: Readonly<Record<Seat, string>>;
  readonly finished: boolean;
}

/**
 * The one line the table may need to say about its own state, in order of importance: this
 * browser's connection, then whether the other side is still there. Null when all is well.
 */
export function tableNotice({
  connection,
  presence,
  seat,
  names,
  finished,
}: Situation): TableNotice | null {
  if (connection === 'closed') {
    return finished
      ? null
      : { tone: 'warn', text: 'You are no longer connected to this table.', leave: true };
  }
  if (connection === 'dropped') {
    return {
      tone: 'warn',
      text: 'Connection lost. Trying to get you back to the table…',
      leave: false,
    };
  }
  if (!presence || finished) return null;

  if (presence.status === 'playing') {
    const gone = ([0, 1] as const).filter(
      (s) => s !== seat && presence.seats[s].occupied && !presence.seats[s].connected,
    );
    if (gone.length > 0) {
      const who = gone.map((s) => names[s]).join(' and ');
      return {
        tone: 'warn',
        text: `${who} disconnected. They have ${RECONNECT_WINDOW_SECONDS} seconds to return.`,
        leave: false,
      };
    }
  }
  return null;
}
