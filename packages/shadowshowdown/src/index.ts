/**
 * @sve/shadowshowdown - the only code that knows shadowshowdown.com exists.
 *
 * The server depends on `ShadowShowdownGateway`. In production that is `createHttpGateway`;
 * in development it is `createFixtureGateway` from `@sve/shadowshowdown/fixture`.
 */
export { GatewayError, type GatewayErrorCode } from './errors';
export { createHttpGateway, type HttpGatewayOptions } from './http';
export type { ShadowShowdownGateway, SsDeck, SsUser } from './types';
