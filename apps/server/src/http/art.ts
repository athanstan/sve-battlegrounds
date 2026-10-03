/**
 * Card art lives in a public bucket that sends no CORS headers, so a WebGL canvas cannot use it
 * directly. The server fetches it once, keeps it in memory, and serves it with the right headers.
 */

export interface ArtImage {
  readonly body: Uint8Array;
  readonly contentType: string;
}

export interface ArtSource {
  /** `null` when the file does not exist upstream. Throws when upstream is unreachable. */
  get(file: string): Promise<ArtImage | null>;
}

export interface ArtProxyOptions {
  /** Bucket folder holding the files, without a trailing slash. */
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** Most images kept in memory (a card is roughly 50-150 kB). */
  readonly maxEntries?: number;
}

/** Card ids look like `BP01-023EN.webp`. Anything else is not ours to forward upstream. */
export const ART_FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\.(?:webp|png|jpe?g)$/;

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_ENTRIES = 1_500;

export function createArtProxy(options: ArtProxyOptions): ArtSource {
  const {
    baseUrl,
    fetch: doFetch = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
  } = options;

  // A Map iterates in insertion order, which is all an LRU needs.
  const cache = new Map<string, ArtImage>();
  const inFlight = new Map<string, Promise<ArtImage | null>>();

  async function download(file: string): Promise<ArtImage | null> {
    const response = await doFetch(`${baseUrl}/${file}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    // The bucket answers 403 for keys that do not exist.
    if (response.status === 404 || response.status === 403) return null;
    if (!response.ok) throw new Error(`Card art bucket answered ${response.status} for ${file}`);

    const image: ArtImage = {
      body: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    };
    cache.set(file, image);
    if (cache.size > maxEntries) {
      for (const oldest of cache.keys()) {
        cache.delete(oldest);
        break;
      }
    }
    return image;
  }

  return {
    get(file) {
      const hit = cache.get(file);
      if (hit) {
        cache.delete(file);
        cache.set(file, hit);
        return Promise.resolve(hit);
      }
      let pending = inFlight.get(file);
      if (!pending) {
        pending = download(file).finally(() => inFlight.delete(file));
        inFlight.set(file, pending);
      }
      return pending;
    },
  };
}
