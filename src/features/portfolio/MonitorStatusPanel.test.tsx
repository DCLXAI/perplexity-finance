// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonitorRuleStatus, MonitorStatusResponse } from '@/shared/api';
import MonitorStatusPanel from './MonitorStatusPanel.js';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/live/apiClient', () => ({ apiFetch: apiFetchMock }));

beforeEach(() => {
  apiFetchMock.mockReset();
});
afterEach(() => cleanup());

describe('MonitorStatusPanel', () => {
  it('surfaces the stored reason for a deferred outcome instead of just a status badge', async () => {
    const status: MonitorRuleStatus = {
      ruleId: 'rule-1',
      kind: 'risk_threshold',
      symbol: null,
      state: 'armed',
      lastOutcome: 'deferred',
      lastEvaluatedAt: '2026-08-05T00:00:00.000Z',
      lastObservation: {
        asOfISO: '2026-08-05T00:00:00.000Z',
        outcome: 'deferred',
        observedValue: null,
        threshold: null,
        reason: '리스크 지표 상태가 insufficient-data입니다.',
      },
      lastError: null,
      nextEvaluationAt: '2026-08-06T00:00:00.000Z',
      recentBreaches: [],
    };
    const response: MonitorStatusResponse = { requestId: 'r', statuses: [status], generatedAt: '2026-08-05T00:00:00.000Z' };
    apiFetchMock.mockResolvedValueOnce(response);

    render(<MonitorStatusPanel portfolioId="pf-1" accessToken="token" />);

    expect(await screen.findByText('리스크 지표 상태가 insufficient-data입니다.')).toBeTruthy();
    expect(screen.getByText('판정 보류 이유')).toBeTruthy();
    expect(screen.getByText('판정 보류')).toBeTruthy();
  });

  it('surfaces lastError for an error outcome instead of leaving the reason blank', async () => {
    const status: MonitorRuleStatus = {
      ruleId: 'rule-2',
      kind: 'thesis_invalidation',
      symbol: 'AAPL',
      state: 'armed',
      lastOutcome: 'error',
      lastEvaluatedAt: '2026-08-05T00:00:00.000Z',
      lastObservation: {},
      lastError: '포트폴리오 관측치를 만들지 못했습니다.',
      nextEvaluationAt: '2026-08-06T00:00:00.000Z',
      recentBreaches: [],
    };
    const response: MonitorStatusResponse = { requestId: 'r', statuses: [status], generatedAt: '2026-08-05T00:00:00.000Z' };
    apiFetchMock.mockResolvedValueOnce(response);

    render(<MonitorStatusPanel portfolioId="pf-1" accessToken="token" />);

    expect(await screen.findByText('포트폴리오 관측치를 만들지 못했습니다.')).toBeTruthy();
    expect(screen.getByText('평가 오류 이유')).toBeTruthy();
    expect(screen.getByText('평가 오류')).toBeTruthy();
  });

  it('shows the login-required note without an access token and never calls the API', () => {
    render(<MonitorStatusPanel portfolioId="pf-1" />);

    expect(screen.getByText('데모에서는 감시 상태를 확인할 수 없습니다.')).toBeTruthy();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
