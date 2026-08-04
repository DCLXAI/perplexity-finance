// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PredictionsResponse } from '@/shared/api';
import PredictionsPage from './PredictionsPage.js';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/live/apiClient', () => ({ apiFetch: apiFetchMock }));

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function response(question: string): PredictionsResponse {
  return {
    requestId: question,
    generatedAt: '2026-07-12T00:00:00.000Z',
    fallback: false,
    providers: [],
    markets: [{
      id: question,
      question,
      outcomes: [
        { label: 'Yes', probability: 70 },
        { label: 'No', probability: 30 },
      ],
      volumeUsd: 1_000,
      provider: 'polymarket',
      providerTimestamp: '2026-07-12T00:00:00.000Z',
    }],
  };
}

beforeEach(() => {
  apiFetchMock.mockReset();
});
afterEach(() => cleanup());

describe('PredictionsPage request lifecycle', () => {
  it('keeps the StrictMode replacement request loading when the aborted request settles late', async () => {
    const requests: Deferred<PredictionsResponse>[] = [];
    const signals: AbortSignal[] = [];
    apiFetchMock.mockImplementation((_path: string, options: RequestInit) => {
      const request = deferred<PredictionsResponse>();
      requests.push(request);
      signals.push(options.signal as AbortSignal);
      return request.promise;
    });

    const { container } = render(
      <StrictMode>
        <PredictionsPage />
      </StrictMode>,
    );

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    const loadingMessage = container.querySelector('.pd-empty')?.textContent;
    expect(loadingMessage).toBeTruthy();

    await act(async () => {
      requests[0].resolve(response('stale market'));
      await requests[0].promise;
    });

    expect(container.querySelector('.pd-empty')?.textContent).toBe(loadingMessage);
    expect(screen.queryByText('stale market')).toBeNull();
    expect(signals[1].aborted).toBe(false);

    await act(async () => {
      requests[1].resolve(response('replacement market'));
      await requests[1].promise;
    });

    expect(await screen.findByText('replacement market')).toBeTruthy();
    expect(container.querySelector('.pd-empty')).toBeNull();
  });
});
