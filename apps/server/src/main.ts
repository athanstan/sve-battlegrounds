import { loadConfig } from './config';
import { integrationFor } from './integration';
import { createServer } from './server';

const config = loadConfig();
const integration = await integrationFor(config);
const server = createServer({ ...integration, webOrigin: config.webOrigin });

await server.listen(config.port);
const source = {
  http: 'shadowshowdown.com',
  postgres: 'shadowrates database',
  fixture: 'fixture accounts',
}[config.shadowShowdown.mode];
console.warn(`SVE Battlegrounds server on :${config.port} (${config.env}, ${source})`);

// Return the database connections before the process goes (Colyseus handles the sockets).
process.once('SIGTERM', () => void integration.close());
process.once('SIGINT', () => void integration.close());
