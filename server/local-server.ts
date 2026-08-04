import { createServer, type IncomingMessage } from 'node:http';
import { apiHandler } from '../routes/registry.js';

const PORT = Number(process.env.API_PORT ?? 5603);

async function body(request: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (['GET', 'HEAD'].includes(request.method ?? 'GET')) return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error('Local body exceeds 1MB');
    chunks.push(buffer);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `localhost:${PORT}`}`);
    const handler = apiHandler(url.pathname);
    if (!handler) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'API route not found' } }));
      return;
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const bytes = await body(request);
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
      ...(bytes ? { body: bytes, duplex: 'half' } : {}),
    };
    const result = await handler(new Request(url, init));
    response.statusCode = result.status;
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      error: {
        code: 'LOCAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    }));
  }
});

server.listen(PORT, '127.0.0.1', () => process.stdout.write(`[api] http://127.0.0.1:${PORT}\n`));
function shutdown(): void {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
