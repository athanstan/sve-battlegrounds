import { defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { MATCH_ROOM } from '@sve/protocol';
import { createRoutes, type HttpDeps } from './http/routes';
import { createMatchRoom, type MatchRoomDeps } from './rooms/match-room';

export interface ServerDeps extends HttpDeps, MatchRoomDeps {
  /** The only browser origin allowed to call the HTTP API. */
  readonly webOrigin: string;
  /** Tests run several servers in one process and must not register signal handlers. */
  readonly gracefullyShutdown?: boolean;
}

/**
 * Compose the server: one room type, one HTTP router. Everything it needs comes in through
 * `deps`, so the same function builds the real server, the fixture-backed dev server and the
 * ones the integration tests boot.
 */
export function createServer(deps: ServerDeps) {
  // Browsers authenticate with a bearer token, not cookies, so CORS is about not advertising
  // the API to other sites rather than about protecting a session.
  matchMaker.controller.getCorsHeaders = () => ({ 'Access-Control-Allow-Origin': deps.webOrigin });

  return defineServer({
    greet: false,
    gracefullyShutdown: deps.gracefullyShutdown ?? true,
    rooms: {
      [MATCH_ROOM]: defineRoom(createMatchRoom(deps)),
    },
    routes: createRoutes(deps),
  });
}

export type GameServer = ReturnType<typeof createServer>;
