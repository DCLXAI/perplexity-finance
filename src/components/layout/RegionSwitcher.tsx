/* ============================================================
   Region switcher — swaps the `region` search parameter between the US
   and KR markets. Mounted only on region-scoped pages (Task 8), never in
   AppShell: crypto, portfolio, apps and status have no region to switch.

   The URL stays the single source of truth: the current value is read
   with `regionFromSearch(searchParams)` on every render. `rememberRegion`
   only runs inside the click handler, as a side effect — never during
   render — so a shared link always opens the region it names.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  REGIONS,
  REGION_LABELS,
  REGION_PARAM,
  regionFromSearch,
  rememberRegion,
  type MarketRegion,
} from '@/data/region.js';
import './region-switcher.css';

export function RegionSwitcher() {
  const [searchParams, setSearchParams] = useSearchParams();
  const region = regionFromSearch(searchParams);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => menuRef.current?.focus());
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (next: MarketRegion) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (next === region) return;
    // Side effect of the click, not of render: the landing default moves,
    // the URL (already updated below) is what this and every other tab reads.
    rememberRegion(next);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set(REGION_PARAM, next.toLowerCase());
      return params;
    });
  };

  const current = REGION_LABELS[region];

  return (
    <div className="region-switcher" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="region-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`시장 지역: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{current.flag}</span>
        {current.label}
        <span className="region-switcher-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="region-switcher-menu"
          role="menu"
          tabIndex={-1}
          aria-label="시장 지역 선택"
        >
          {REGIONS.map((option) => {
            const labels = REGION_LABELS[option];
            const active = option === region;
            return (
              <button
                key={option}
                type="button"
                role="menuitem"
                aria-current={active}
                className={`region-switcher-item${active ? ' active' : ''}`}
                onClick={() => choose(option)}
              >
                <span aria-hidden="true">{labels.flag}</span>
                {labels.label}
                {active && <span className="region-switcher-check" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
