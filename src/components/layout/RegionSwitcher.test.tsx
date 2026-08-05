// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { RegionSwitcher } from './RegionSwitcher.js';

function mount(initial = '/') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <RegionSwitcher />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('RegionSwitcher', () => {
  it('shows the US label by default', () => {
    mount();
    expect(screen.getByRole('button', { name: /미국 시장/ })).toBeTruthy();
  });

  it('reflects the region in the URL', () => {
    mount('/?region=kr');
    expect(screen.getByRole('button', { name: /한국 시장/ })).toBeTruthy();
  });

  it('offers both regions when opened', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /미국 시장/ }));
    expect(screen.getByRole('menuitem', { name: /한국 시장/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /미국 시장/ })).toBeTruthy();
  });
});
