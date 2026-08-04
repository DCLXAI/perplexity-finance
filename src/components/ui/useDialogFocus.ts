/* ============================================================
   Shared modal focus management: initial focus, Escape close,
   Tab trapping, scroll locking, app-root isolation and focus restore.
   ============================================================ */
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let bodyLockCount = 0;
let previousBodyOverflow = '';
let rootIsolationCount = 0;
let priorRootAriaHidden: string | null = null;
let priorRootInert = false;

function lockBodyScroll(): () => void {
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyLockCount += 1;
  return () => {
    bodyLockCount = Math.max(0, bodyLockCount - 1);
    if (bodyLockCount === 0) document.body.style.overflow = previousBodyOverflow;
  };
}

function isolateAppRoot(): () => void {
  const root = document.getElementById('root');
  if (!root) return () => undefined;
  const inertRoot = root as HTMLElement & { inert: boolean };
  if (rootIsolationCount === 0) {
    priorRootAriaHidden = root.getAttribute('aria-hidden');
    priorRootInert = Boolean(inertRoot.inert);
    inertRoot.inert = true;
    root.setAttribute('aria-hidden', 'true');
  }
  rootIsolationCount += 1;
  return () => {
    rootIsolationCount = Math.max(0, rootIsolationCount - 1);
    if (rootIsolationCount !== 0) return;
    inertRoot.inert = priorRootInert;
    if (priorRootAriaHidden === null) root.removeAttribute('aria-hidden');
    else root.setAttribute('aria-hidden', priorRootAriaHidden);
  };
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    const style = window.getComputedStyle(element);
    return !element.hasAttribute('hidden') && style.display !== 'none' && style.visibility !== 'hidden';
  });
}

export function useDialogFocus<T extends HTMLElement = HTMLElement>({
  onClose,
  initialFocusRef,
}: {
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
}): RefObject<T | null> {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    priorFocus?.blur();
    const unlock = lockBodyScroll();
    const restoreRoot = isolateAppRoot();
    const focusFrame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
      target.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = focusableElements(dialog);
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown, true);
      unlock();
      restoreRoot();
      requestAnimationFrame(() => {
        if (priorFocus?.isConnected) priorFocus.focus();
      });
    };
  }, [initialFocusRef]);

  return dialogRef;
}
