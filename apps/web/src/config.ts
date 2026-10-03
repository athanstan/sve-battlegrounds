/** Where the game server is. One place, so no other file builds a URL by hand. */
const sameHost = `${location.protocol}//${location.hostname}:2567`;

export const SERVER_URL = (import.meta.env.VITE_SERVER_URL ?? sameHost).replace(/\/+$/, '');
