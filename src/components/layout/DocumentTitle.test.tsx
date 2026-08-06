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

    await waitFor(() => expect(document.title).toContain('(AMD) | Synapsu'));
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    expect(description?.content).toContain('출처가 표시된 시세');
  });

  it('labels unknown routes as not found', async () => {
    render(
      <MemoryRouter initialEntries={['/missing']}>
        <DocumentTitle />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.title).toBe('페이지를 찾을 수 없음 | Synapsu'));
  });
});

function mountAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <DocumentTitle />
    </MemoryRouter>,
  );
}

function metaDescription(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '';
}

/**
 * Regression guard: `metadataForPath` used to key off `pathname` alone, so `/` was hardcoded to
 * "미국 시장" and `/screener`'s description to "미국 주식 표본". Under `?region=kr` that put a US
 * label on the browser tab, in the meta description, and in the `aria-live` route announcement
 * a screen reader reads aloud — the last being the reason this is a correctness bug and not
 * cosmetics.
 */
describe('DocumentTitle region scoping', () => {
  it('names the Korean market on the region-scoped home', async () => {
    const { container } = mountAt('/?region=kr');
    await waitFor(() => expect(document.title).toBe('한국 시장 | Synapsu'));
    expect(document.title).not.toContain('미국');
    expect(metaDescription()).toContain('한국 주식 시장 대시보드');
    // The announcer is what a screen reader speaks on navigation.
    expect(container.textContent).toBe('한국 시장 페이지');
  });

  it('leaves the default home on the US labels', async () => {
    mountAt('/');
    await waitFor(() => expect(document.title).toBe('미국 시장 | Synapsu'));
    expect(metaDescription()).toContain('미국 주식 시장 대시보드');
  });

  it('scopes the screener description to the listed region', async () => {
    mountAt('/screener?region=kr');
    await waitFor(() => expect(document.title).toBe('주식 스크리너 | Synapsu'));
    expect(metaDescription()).toContain('한국 주식 표본');
    expect(metaDescription()).not.toContain('미국');

    cleanup();
    mountAt('/screener');
    await waitFor(() => expect(metaDescription()).toContain('미국 주식 표본'));
  });

  it('ignores the region on a page that is not region-scoped', async () => {
    mountAt('/crypto?region=kr');
    await waitFor(() => expect(document.title).toBe('암호화폐 | Synapsu'));
  });

  it('falls back to US labels for a garbage region rather than throwing', async () => {
    mountAt('/?region=not-a-region');
    await waitFor(() => expect(document.title).toBe('미국 시장 | Synapsu'));
  });
});
