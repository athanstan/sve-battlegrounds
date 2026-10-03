/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the game server listens. Defaults to port 2567 on the page's own host. */
  readonly VITE_SERVER_URL?: string;
}
