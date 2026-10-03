import type { ChatAuthor, ChatChannel, ChatLine } from '@sve/protocol';

/**
 * In-match chat. A side channel: it has its own log and never touches the rules log.
 *
 * Two channels keep the table honest. Players speak on `table`, which everyone reads.
 * Spectators speak on `spectators`, which players never see, so someone who can watch a hand
 * (a casting setup, an opened-hands match) cannot talk a player through it.
 */

export type ChatRole = 'player' | 'spectator';

/** Which channel a role writes to, and which channels it may read. */
export const channelFor = (role: ChatRole): ChatChannel =>
  role === 'player' ? 'table' : 'spectators';

export const channelsReadBy = (role: ChatRole): readonly ChatChannel[] =>
  role === 'player' ? ['table'] : ['table', 'spectators'];

/**
 * Plain text only. Whitespace runs (including newlines) collapse to one space, then control
 * and invisible formatting characters are removed - that class includes the bidirectional
 * overrides that can make one message render as another. The joiners emoji sequences need are
 * kept. React escapes the rest at the other end.
 */
export function sanitizeChat(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, (char) => (char === '\u200d' || char === '\u200c' ? char : ''))
    .trim();
}

export interface ChatOptions {
  readonly capacity?: number;
  /** Messages a user may send back to back before being throttled. */
  readonly burst?: number;
  /** Time to earn one more message once the burst is spent. */
  readonly refillMs?: number;
  readonly now?: () => number;
}

export type PostResult =
  | { readonly ok: true; readonly line: ChatLine }
  | { readonly ok: false; readonly reason: 'empty' | 'rateLimited' };

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class ChatLog {
  readonly #capacity: number;
  readonly #burst: number;
  readonly #refillMs: number;
  readonly #now: () => number;
  readonly #lines: ChatLine[] = [];
  readonly #buckets = new Map<string, Bucket>();
  #nextId = 1;

  constructor(options: ChatOptions = {}) {
    this.#capacity = options.capacity ?? 100;
    this.#burst = options.burst ?? 5;
    this.#refillMs = options.refillMs ?? 1_000;
    this.#now = options.now ?? Date.now;
  }

  post(author: ChatAuthor, channel: ChatChannel, rawText: string): PostResult {
    const text = sanitizeChat(rawText);
    if (text === '') return { ok: false, reason: 'empty' };
    if (!this.#spend(author.userId)) return { ok: false, reason: 'rateLimited' };

    const line: ChatLine = { id: this.#nextId++, channel, author, text, at: this.#now() };
    this.#lines.push(line);
    if (this.#lines.length > this.#capacity) this.#lines.shift();
    return { ok: true, line };
  }

  /** What a viewer who may read these channels has missed. */
  history(readable: readonly ChatChannel[]): ChatLine[] {
    return this.#lines.filter((line) => readable.includes(line.channel));
  }

  #spend(userId: string): boolean {
    const now = this.#now();
    const bucket = this.#buckets.get(userId) ?? { tokens: this.#burst, updatedAt: now };
    const earned = Math.floor((now - bucket.updatedAt) / this.#refillMs);
    if (earned > 0) {
      bucket.tokens = Math.min(this.#burst, bucket.tokens + earned);
      bucket.updatedAt += earned * this.#refillMs;
    }
    this.#buckets.set(userId, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}
