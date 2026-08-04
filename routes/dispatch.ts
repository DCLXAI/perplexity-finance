import { json } from '../server/http/function.js';
import { apiHandler } from './registry.js';

function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(',', 1)[0]?.trim() || undefined;
}

export function normalizeApiRequest(request: Request): Request {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(request.url)) return request;

  const forwardedProtocol = firstHeaderValue(request.headers.get('x-forwarded-proto'));
  const protocol = forwardedProtocol === 'http' ? 'http' : 'https';
  const host = firstHeaderValue(request.headers.get('x-forwarded-host'))
    ?? firstHeaderValue(request.headers.get('host'))
    ?? 'localhost';
  let url: URL;
  try {
    url = new URL(request.url, `${protocol}://${host}`);
  } catch {
    url = new URL(request.url, `${protocol}://localhost`);
  }

  const method = request.method.toUpperCase();
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: request.headers,
  };
  if (!['GET', 'HEAD'].includes(method) && request.body) {
    init.body = request.body;
    init.duplex = 'half';
  }
  return new Request(url, init);
}

export async function dispatchApiRequest(request: Request): Promise<Response> {
  const normalized = normalizeApiRequest(request);
  const route = apiHandler(new URL(normalized.url).pathname);
  if (!route) {
    return json({ error: { code: 'NOT_FOUND', message: 'API route not found' } }, { status: 404 });
  }
  return route(normalized);
}
