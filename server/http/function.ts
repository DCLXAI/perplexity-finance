import { createHash, timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { loadConfig } from '../config.js';
import { logger, requestIdFromHeader, runWithLogContext } from '../observability/logger.js';
import { metrics } from '../observability/metrics.js';
import type { ApiErrorPayload } from '../../src/shared/api.js';

export type FetchHandler = (request: Request) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function errorPayload(code: string, message: string, requestId: string): ApiErrorPayload {
  return { error: { code, message, requestId } };
}

export function json(body: unknown, init: ResponseInit = {}, requestId?: string): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  if (requestId) headers.set('X-Request-Id', requestId);
  return new Response(JSON.stringify(body), { ...init, headers });
}

export async function readJson<T>(request: Request, maxBytes = 32_768): Promise<T> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type은 application/json이어야 합니다.');
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > maxBytes) {
    throw new ApiError(413, 'BODY_TOO_LARGE', '요청 본문이 너무 큽니다.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiError(413, 'BODY_TOO_LARGE', '요청 본문이 너무 큽니다.');
  }
  if (!text) throw new ApiError(400, 'EMPTY_BODY', '요청 본문이 필요합니다.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'JSON 요청 형식이 올바르지 않습니다.');
  }
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get('idempotency-key')?.trim();
  if (!value || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', '8~128자의 유효한 Idempotency-Key 헤더가 필요합니다.');
  }
  return value;
}

export function bearerToken(request: Request): string | undefined {
  const auth = request.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7).trim() || undefined : undefined;
}

export function secureSecretEqual(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const left = createHash('sha256').update(actual).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export function assertSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return;
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError(403, 'CROSS_SITE_REJECTED', '교차 사이트 변경 요청은 허용되지 않습니다.');
  }
  const origin = request.headers.get('origin');
  if (!origin) return;
  const config = loadConfig();
  const requestOrigin = new URL(request.url).origin;
  const allowed = new Set([...config.allowedOrigins, requestOrigin]);
  if (!allowed.has(origin)) {
    throw new ApiError(403, 'ORIGIN_REJECTED', '허용되지 않은 출처의 요청입니다.');
  }
}

function requireSecret(
  request: Request,
  expected: string | undefined,
  missingCode: string,
  invalidCode: string,
  label: string,
): void {
  if (!expected) throw new ApiError(503, missingCode, `${label}가 설정되지 않았습니다.`);
  if (!secureSecretEqual(bearerToken(request), expected)) {
    throw new ApiError(401, invalidCode, `${label} 인증이 유효하지 않습니다.`);
  }
}

export function requireCronSecret(request: Request): void {
  requireSecret(request, loadConfig().cronSecret, 'CRON_NOT_CONFIGURED', 'INVALID_CRON_SECRET', 'CRON_SECRET');
}
export function requireMetricsSecret(request: Request): void {
  requireSecret(request, loadConfig().metricsSecret, 'METRICS_NOT_CONFIGURED', 'INVALID_METRICS_SECRET', 'METRICS_SECRET');
}
export function requireOpsSecret(request: Request): void {
  requireSecret(request, loadConfig().opsSecret, 'OPS_NOT_CONFIGURED', 'INVALID_OPS_SECRET', 'OPS_SECRET');
}

function hardenedHeaders(response: Response, requestId: string, duration: number): Headers {
  const headers = new Headers(response.headers);
  headers.set('X-Request-Id', requestId);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.append('Server-Timing', `app;dur=${duration}`);
  return headers;
}

export function withFunction(
  route: string,
  methods: readonly string[],
  handler: (request: Request, requestId: string) => Promise<Response>,
): FetchHandler {
  const allowed = Object.freeze(methods.map((method) => method.toUpperCase()));
  return async (request) => {
    const requestId = requestIdFromHeader(request.headers.get('x-request-id') ?? undefined);
    const start = performance.now();
    logger.configure(loadConfig().logLevel);
    return runWithLogContext({ requestId, route }, async () => {
      logger.info('request.start', { method: request.method });
      let response: Response;
      try {
        if (!allowed.includes(request.method.toUpperCase())) {
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청 방식입니다.', { Allow: allowed.join(', ') });
        }
        assertSameOrigin(request);
        response = await handler(request, requestId);
        metrics.increment('http_requests_total', { route, result: 'success', status: response.status });
      } catch (error) {
        if (error instanceof ApiError) {
          response = json(errorPayload(error.code, error.message, requestId), {
            status: error.status,
            headers: error.headers,
          }, requestId);
          logger.warn('request.rejected', { code: error.code, status: error.status });
        } else if (error instanceof ZodError) {
          response = json(errorPayload('INVALID_REQUEST', '요청 형식이 올바르지 않습니다.', requestId), { status: 400 }, requestId);
          logger.warn('request.validation_failed', { issues: error.issues.length });
        } else {
          response = json(errorPayload('INTERNAL_ERROR', '요청을 처리하지 못했습니다.', requestId), { status: 500 }, requestId);
          logger.error('request.failed', error);
        }
        metrics.increment('http_requests_total', { route, result: 'error', status: response.status });
      }

      const duration = Math.round((performance.now() - start) * 100) / 100;
      metrics.observeMs('http_request_duration_ms', duration, { route });
      const headers = hardenedHeaders(response, requestId, duration);
      logger.info('request.done', { status: response.status, durationMs: duration });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
  };
}
