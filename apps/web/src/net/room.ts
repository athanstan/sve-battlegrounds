import type { Room } from '@colyseus/sdk';
import type { MatchServerMessages } from '@sve/protocol';

/**
 * The slice of a Colyseus room that a match session uses.
 *
 * A session depends on this, not on the SDK, so its behaviour can be tested with a plain fake and
 * the SDK's loose typing stays in one place (`fromSdkRoom`).
 */
export interface RoomLike {
  readonly roomId: string;
  readonly reconnectionToken: string;
  readonly state: unknown;
  onMessage<K extends keyof MatchServerMessages>(
    type: K,
    handler: (payload: MatchServerMessages[K]) => void,
  ): void;
  onStateChange(handler: (state: unknown) => void): void;
  /** The socket died unexpectedly; the SDK is trying to get it back. */
  onDrop(handler: () => void): void;
  onReconnect(handler: () => void): void;
  onLeave(handler: (code: number) => void): void;
  send(type: string, payload?: unknown): void;
  leave(): Promise<unknown>;
}

export function fromSdkRoom(room: Room): RoomLike {
  return {
    get roomId() {
      return room.roomId;
    },
    get reconnectionToken() {
      return room.reconnectionToken;
    },
    get state() {
      return room.state as unknown;
    },
    onMessage: (type, handler) => void room.onMessage(type, handler as (payload: unknown) => void),
    onStateChange: (handler) => void room.onStateChange((state: unknown) => handler(state)),
    onDrop: (handler) => void room.onDrop(() => handler()),
    onReconnect: (handler) => void room.onReconnect(() => handler()),
    onLeave: (handler) => void room.onLeave((code: number) => handler(code)),
    send: (type, payload) => room.send(type, payload),
    // A deliberate leave: the player is walking away, not dropping.
    leave: () => room.leave(true),
  };
}
