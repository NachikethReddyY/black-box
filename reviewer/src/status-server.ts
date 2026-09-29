import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { ReviewConfig } from './types.js';
import { ReviewStore } from './store.js';

export interface StatusServerHandle {
  readonly server: Server;
  readonly port: number;
  close(): Promise<void>;
}

export async function listenStatusServer(config: ReviewConfig, token: string, port = 0): Promise<StatusServerHandle> {
  if (!token) throw new Error('REVIEWER_STATUS_TOKEN is required for the local status service');
  const store = new ReviewStore(config);
  const server = createServer((request, response) => handleRequest(request, response, store, token));
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => { server.off('listening', onListening); reject(error); };
    const onListening = (): void => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    store.close();
    throw new Error('status server did not expose a TCP address');
  }
  return {
    server,
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      store.close();
    },
  };
}

function handleRequest(request: IncomingMessage, response: ServerResponse, store: ReviewStore, token: string): void {
  if (request.method !== 'GET') { send(response, 405, { error: 'method_not_allowed' }); return; }
  if (request.url === '/healthz') { send(response, 200, { ok: true }); return; }
  if (request.url !== '/status') { send(response, 404, { error: 'not_found' }); return; }
  const authorization = request.headers.authorization ?? '';
  if (!safeTokenEquals(authorization, `Bearer ${token}`)) { send(response, 401, { error: 'unauthorized' }); return; }
  send(response, 200, { integrity: store.integrityCheck(), reviews: store.listReviews() });
}

function safeTokenEquals(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function send(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(body);
}
