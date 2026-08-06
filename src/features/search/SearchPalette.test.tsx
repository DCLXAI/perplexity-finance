// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { engine } from '@/data/engine';
import SearchPalette from './SearchPalette.js';

beforeEach(() => {
  engine.stop();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  engine.stop();
});

describe('SearchPalette combobox', () => {
  it('exposes listbox semantics and supports arrow/Escape keyboard control', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <SearchPalette onClose={onClose} />
      </MemoryRouter>,
    );

    const input = screen.getByRole('combobox', { name: /자산 검색/ });
    await waitFor(() => expect(document.activeElement).toBe(input));
    await user.clear(input);
    await user.type(input, 'A');

    const options = await screen.findAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    expect(input.getAttribute('aria-expanded')).toBe('true');

    const initialActive = input.getAttribute('aria-activedescendant');
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(input.getAttribute('aria-activedescendant')).not.toBe(initialActive),
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
