// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import Modal from './Modal.js';

afterEach(() => cleanup());

function Harness() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div id="root">
      <button type="button" onClick={() => setOpen(true)}>열기</button>
      {open && (
        <Modal onClose={() => setOpen(false)} ariaLabel="테스트 대화상자" initialFocusRef={inputRef}>
          <input ref={inputRef} aria-label="첫 입력" />
          <button type="button">마지막 작업</button>
        </Modal>
      )}
    </div>
  );
}

describe('Modal focus management', () => {
  it('focuses the requested control, traps Tab and restores the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: '열기' });
    await user.click(opener);

    const first = screen.getByRole('textbox', { name: '첫 입력' });
    const last = screen.getByRole('button', { name: '마지막 작업' });
    await waitFor(() => expect(document.activeElement).toBe(first));
    const root = document.getElementById('root');
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(Boolean((root as HTMLElement & { inert?: boolean } | null)?.inert)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(root?.hasAttribute('aria-hidden')).toBe(false);
    expect(Boolean((root as HTMLElement & { inert?: boolean } | null)?.inert)).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });
});
