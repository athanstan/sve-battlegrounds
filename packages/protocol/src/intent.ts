import { asCardId, type Intent, type IntentType } from '@sve/rules';
import { z } from 'zod';

/**
 * Wire schema for `Intent`. Everything a client sends is untrusted: it is parsed here and then
 * judged again by the rules. Parsing only guarantees shape; legality is the engine's call.
 */

const promptId = z.number().int().nonnegative();

/** Card ids are opaque server-minted strings. The bound only stops absurd payloads. */
const cardId = z.string().min(1).max(32).transform(asCardId);

/** No zone holds more than a few dozen cards; this keeps a hostile client from sending thousands. */
const cardIds = z.array(cardId).max(64);

const leaderOrCard = z.union([z.literal('leader'), cardId]);

const choiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('turnOrder'), goFirst: z.boolean() }),
  z.object({ kind: z.literal('mulligan'), redraw: z.boolean() }),
  z.object({ kind: z.literal('discard'), cards: cardIds }),
  z.object({ kind: z.literal('selectCards'), cards: cardIds }),
  z.object({ kind: z.literal('mode'), id: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('confirm'), yes: z.boolean() }),
  z.object({
    kind: z.literal('allocate'),
    amounts: z.array(z.number().int().nonnegative()).max(32),
  }),
  z.object({ kind: z.literal('orderPending'), id: z.number().int().nonnegative() }),
]);

export const intentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choose'), promptId, choice: choiceSchema }),
  z.object({ type: z.literal('pass'), promptId }),
  z.object({ type: z.literal('engageWards'), promptId, cards: cardIds }),
  z.object({ type: z.literal('play'), promptId, card: cardId }),
  z.object({
    type: z.literal('activate'),
    promptId,
    card: cardId,
    ability: z.string().min(1).max(64),
  }),
  z.object({ type: z.literal('attack'), promptId, attacker: cardId, target: leaderOrCard }),
  z.object({
    type: z.literal('evolve'),
    promptId,
    card: cardId,
    superEvolve: z.boolean(),
    useEvolutionPoint: z.boolean(),
  }),
  z.object({ type: z.literal('concede') }),
]);

/**
 * Compile-time proof that the schema and the engine's `Intent` stay in step: whatever the schema
 * lets through is an `Intent`, and no `Intent` type is missing from the schema. Adding an intent
 * to the engine without teaching the wire about it fails the build here.
 */
type Parsed = z.output<typeof intentSchema>;
export const schemaProducesIntents = (parsed: Parsed): Intent => parsed;
export const everyIntentIsSendable: [Exclude<IntentType, Parsed['type']>] extends [never]
  ? true
  : false = true;
