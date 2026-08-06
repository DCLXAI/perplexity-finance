// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Skeleton } from './index.js';

afterEach(() => {
  cleanup();
});

describe('Skeleton', () => {
  it('is announced as busy so a screen reader does not read placeholder geometry', () => {
    render(<Skeleton />);
    const node = screen.getByRole('status');
    expect(node.getAttribute('aria-busy')).toBe('true');
    expect(node.textContent).toBe('');
  });

  it('takes its geometry from props', () => {
    render(<Skeleton width="120px" height="20px" />);
    const node = screen.getByRole('status');
    expect(node.style.width).toBe('120px');
    expect(node.style.height).toBe('20px');
  });
});
