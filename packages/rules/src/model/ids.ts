declare const brand: unique symbol;

/** Nominal typing for string ids so a card *instance* can never be passed where a *definition* is expected. */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

/** One physical card in one match (a copy). Stable for the whole match; never reused. */
export type CardId = Brand<string, 'CardId'>;

/** A card definition from the catalog (e.g. a printed card). Many instances share one. */
export type CardDefId = Brand<string, 'CardDefId'>;

/**
 * A table seat. Seats are positional and carry no turn-order meaning:
 * who goes first is decided during setup (6.2.1.6).
 */
export type Seat = 0 | 1;

export const SEATS = [0, 1] as const satisfies readonly Seat[];

export const opponentOf = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export const asCardId = (raw: string): CardId => raw as CardId;
export const asCardDefId = (raw: string): CardDefId => raw as CardDefId;

/** A reference to a card whose identity the viewer is allowed to know. */
export interface CardRef {
  readonly id: CardId;
  readonly def: CardDefId;
}

export function assertNever(value: never, message = 'Unreachable'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}
