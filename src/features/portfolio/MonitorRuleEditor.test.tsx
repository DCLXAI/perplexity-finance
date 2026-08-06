// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonitorRule, MonitorRuleMutationResponse, MonitorRulesResponse } from '@/shared/api';
import MonitorRuleEditor from './MonitorRuleEditor.js';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/live/apiClient', () => ({ apiFetch: apiFetchMock }));

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function emptyRulesResponse(): MonitorRulesResponse {
  return { requestId: 'r', rules: [], generatedAt: '2026-08-05T00:00:00.000Z' };
}

function rulesResponse(rules: readonly MonitorRule[]): MonitorRulesResponse {
  return { requestId: 'r', rules, generatedAt: '2026-08-05T00:00:00.000Z' };
}

function thesisRule(overrides: Partial<MonitorRule> = {}): MonitorRule {
  return {
    id: 'rule-1',
    portfolioId: 'pf-1',
    thesisId: 'thesis-OLD',
    symbol: 'AMD',
    kind: 'thesis_invalidation',
    spec: { condition: 'price_below', symbol: 'AMD', value: 100 },
    enabled: true,
    state: 'armed',
    lastOutcome: null,
    lastEvaluatedAt: null,
    lastObservation: {},
    lastError: null,
    latchedAt: null,
    minIntervalHours: 24,
    nextEvaluationAt: '2026-08-06T00:00:00.000Z',
    ruleVersion: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function mutationResponse(rule: MonitorRule): MonitorRuleMutationResponse {
  return { requestId: 'r', rule };
}

function bodyOf(callIndex: number): Record<string, unknown> {
  const call = apiFetchMock.mock.calls[callIndex] as [string, RequestInit];
  return JSON.parse(call[1].body as string) as Record<string, unknown>;
}
function methodOf(callIndex: number): string | undefined {
  const call = apiFetchMock.mock.calls[callIndex] as [string, RequestInit];
  return call[1].method as string | undefined;
}

beforeEach(() => {
  apiFetchMock.mockReset();
});
afterEach(() => cleanup());

describe('MonitorRuleEditor', () => {
  it('creates a thesis_invalidation rule without a top-level symbol and with the full spec', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce(emptyRulesResponse());
    apiFetchMock.mockResolvedValueOnce(mutationResponse(thesisRule({ thesisId: 'thesis-1' })));

    render(
      <MonitorRuleEditor
        portfolioId="pf-1"
        thesisId="thesis-1"
        symbol="AMD"
        allowedKinds={['thesis_invalidation']}
        accessToken="token"
      />,
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const valueInput = screen.getByLabelText('기준 가격 · USD');
    await user.clear(valueInput);
    await user.type(valueInput, '100');
    await user.click(screen.getByRole('button', { name: '규칙 추가' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(methodOf(1)).toBe('POST');
    const body = bodyOf(1);
    expect(body.symbol).toBeUndefined();
    expect('symbol' in body).toBe(false);
    expect(body).toMatchObject({
      portfolioId: 'pf-1',
      thesisId: 'thesis-1',
      kind: 'thesis_invalidation',
      spec: { condition: 'price_below', symbol: 'AMD', value: 100 },
      enabled: true,
      minIntervalHours: 24,
    });
  });

  it('creates a risk_threshold rule without a top-level symbol', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce(emptyRulesResponse());
    apiFetchMock.mockResolvedValueOnce(mutationResponse(thesisRule({
      id: 'rule-2',
      thesisId: null,
      symbol: null,
      kind: 'risk_threshold',
      spec: { metric: 'annualizedVolatilityPct', comparison: 'above', value: 25 },
    })));

    render(
      <MonitorRuleEditor
        portfolioId="pf-1"
        allowedKinds={['risk_threshold', 'stress_scenario']}
        accessToken="token"
      />,
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const valueInput = screen.getByLabelText('임계값');
    await user.clear(valueInput);
    await user.type(valueInput, '25');
    await user.click(screen.getByRole('button', { name: '규칙 추가' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    const body = bodyOf(1);
    expect('symbol' in body).toBe(false);
    expect(body).toMatchObject({
      portfolioId: 'pf-1',
      thesisId: null,
      kind: 'risk_threshold',
      spec: { metric: 'annualizedVolatilityPct', comparison: 'above', value: 25 },
      enabled: true,
      minIntervalHours: 24,
    });
  });

  it('PATCHes the full rule body on edit and preserves the rule\'s own thesisId, not the mounted prop', async () => {
    const user = userEvent.setup();
    const existing = thesisRule();
    apiFetchMock.mockResolvedValueOnce(rulesResponse([existing]));
    apiFetchMock.mockResolvedValueOnce(mutationResponse({ ...existing, spec: { ...existing.spec, value: 90 } }));

    render(
      <MonitorRuleEditor
        portfolioId="pf-1"
        thesisId="thesis-1"
        symbol="AMD"
        allowedKinds={['thesis_invalidation']}
        accessToken="token"
      />,
    );

    await screen.findByText(/AMD/);
    await user.click(screen.getByRole('button', { name: '수정' }));
    const valueInput = await screen.findByLabelText('기준 가격 · USD');
    expect((valueInput as HTMLInputElement).value).toBe('100');
    await user.clear(valueInput);
    await user.type(valueInput, '90');
    await user.click(screen.getByRole('button', { name: '규칙 저장' }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    expect(methodOf(1)).toBe('PATCH');
    const body = bodyOf(1);
    expect('symbol' in body).toBe(false);
    expect(body).toMatchObject({
      ruleId: 'rule-1',
      portfolioId: 'pf-1',
      thesisId: 'thesis-OLD',
      kind: 'thesis_invalidation',
      spec: { condition: 'price_below', symbol: 'AMD', value: 90 },
      enabled: true,
      minIntervalHours: 24,
    });
  });

  it('renders a validation error and does not submit when a required numeric field is blank', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce(emptyRulesResponse());

    render(
      <MonitorRuleEditor portfolioId="pf-1" allowedKinds={['risk_threshold']} accessToken="token" />,
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: '규칙 추가' }));

    expect((await screen.findByRole('alert')).textContent).toBe('임계값을 입력하세요.');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('disables submit while a create request is in flight and does not retry', async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce(emptyRulesResponse());
    const request = deferred<MonitorRuleMutationResponse>();
    apiFetchMock.mockImplementationOnce(() => request.promise);

    render(
      <MonitorRuleEditor portfolioId="pf-1" allowedKinds={['risk_threshold']} accessToken="token" />,
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const valueInput = screen.getByLabelText('임계값');
    await user.clear(valueInput);
    await user.type(valueInput, '25');
    const submitButton = screen.getByRole('button', { name: '규칙 추가' });
    expect((submitButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(submitButton);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(submitButton);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      request.resolve(mutationResponse(thesisRule({ id: 'rule-2', kind: 'risk_threshold', symbol: null, thesisId: null, spec: { metric: 'annualizedVolatilityPct', comparison: 'above', value: 25 } })));
      await request.promise;
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('never blocks an ancestor form (no `required` on its own inputs)', async () => {
    apiFetchMock.mockResolvedValueOnce(emptyRulesResponse());

    const { container } = render(
      <form>
        <input required defaultValue="AMD" aria-label="host-symbol" />
        <input required defaultValue="host title" aria-label="host-title" />
        <textarea required defaultValue="host thesis" aria-label="host-thesis" />
        <MonitorRuleEditor
          portfolioId="pf-1"
          thesisId="thesis-1"
          symbol="AMD"
          allowedKinds={['thesis_invalidation']}
          accessToken="token"
        />
      </form>,
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    // The editor's own 조건 값 input is left blank -- if it (or any other editor field) still
    // carried `required`, the whole ancestor form would report invalid here.
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form!.checkValidity()).toBe(true);
  });
});
