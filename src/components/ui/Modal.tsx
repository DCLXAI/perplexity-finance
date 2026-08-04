/* ============================================================
   Accessible modal primitive — portal, focus trap, Escape close,
   background isolation, body scroll lock and focus restoration.
   ============================================================ */
import { createPortal } from 'react-dom';
import type { ReactNode, RefObject } from 'react';
import { useDialogFocus } from './useDialogFocus.js';

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  labelledBy?: string;
  describedBy?: string;
  ariaLabel?: string;
  className?: string;
  backdropClassName?: string;
  initialFocusRef?: RefObject<HTMLElement>;
}

export default function Modal({
  children,
  onClose,
  labelledBy,
  describedBy,
  ariaLabel,
  className = '',
  backdropClassName = '',
  initialFocusRef,
}: ModalProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>({ onClose, initialFocusRef });
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`ui-modal-backdrop ${backdropClassName}`.trim()}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`ui-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
