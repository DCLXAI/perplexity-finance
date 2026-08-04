// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_ALLOCATION_POLICY, buildDemoPortfolioSummary } from './demo.js';
import RebalancePanel from './RebalancePanel.js';

describe('RebalancePanel', () => {
  it('renders target drift suggestions and opens the accessible editor', async () => {
    const user = userEvent.setup();
    render(
      <RebalancePanel
        summary={buildDemoPortfolioSummary()}
        policy={DEMO_ALLOCATION_POLICY}
        demo
        onPolicySaved={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '목표배분과 자동 리밸런싱' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '리밸런싱 주문 제안' })).toBeTruthy();
    expect(screen.getByText('NVDA')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '목표 수정' }));
    expect(screen.getByRole('dialog', { name: '목표배분 설정' })).toBeTruthy();
    expect(screen.getByText(/합계 100\.00%/)).toBeTruthy();
  });
});
