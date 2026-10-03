/** `text`, or `fallback` when it is empty. Presence fields arrive as '' rather than missing. */
export const orElse = (text: string, fallback: string): string => (text === '' ? fallback : text);
