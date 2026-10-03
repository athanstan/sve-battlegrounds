export type GatewayErrorCode =
  /** The token is missing, expired or revoked. */
  | 'unauthorized'
  /** shadowshowdown.com could not be reached, timed out, or answered 5xx. */
  | 'unavailable'
  /** It answered, but not in the shape the contract promises. */
  | 'badResponse';

export class GatewayError extends Error {
  constructor(
    readonly code: GatewayErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GatewayError';
  }
}
