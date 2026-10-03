/**
 * The shadowrates database as a gateway. Imported from `@sve/shadowshowdown/postgres` so that
 * browsers and tests of the other gateways never pull in the `pg` driver.
 */
export {
  createPostgresGateway,
  devTokenFor,
  type PostgresGateway,
  type PostgresGatewayOptions,
  type SqlClient,
} from './gateway';
export { createReadOnlyPool, type ReadOnlyPool } from './pool';
export { plainText, toCardDefinition, type CardRow } from './rows';
