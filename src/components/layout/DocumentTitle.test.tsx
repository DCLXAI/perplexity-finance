// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { engine } from '@/data/engine';
import DocumentTitle from './DocumentTitle.js';

afterEach(() => {
  cleanup();
  engine.stop();
});

describe('DocumentTitle', () => {
  it('sets route-specific title and description', async () => {
    engine.stop();
    render(
      <MemoryRouter initialEntries={['/stock/AMD']}>
        <DocumentTitle />
      </MemoryRouter>,
    );

    await waitFor(() => expect(document.title).toContain('(AMD) | Perplexity 금융'));
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    expect(description?.content).toContain('출처가 표시된 시세');
  });

  it('labels unknown routes as not found', async () => {
    render(
      <MemoryRouter initialEntries={['/missing']}>
        <DocumentTitle />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.title).toBe('페이지를 찾을 수 없음 | Perplexity 금융'));
  });
});
