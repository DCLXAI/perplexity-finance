/* ============================================================
   Region switching — the market tab in the global tab bar. An earlier
   in-page switcher on MarketPage did the same job; once the tab itself
   worked, two controls for one piece of state on one screen was one
   too many, so this is now the single control.

   The URL stays the single source of truth: the current value is read
   with `regionFromSearch(searchParams)` on every render. `rememberRegion`
   only runs inside the click handler, as a side effect — never during
   render — so a shared link always opens the region it names.
   ============================================================ */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router';
import {
  REGIONS,
  REGION_LABELS,
  regionFromSearch,
  rememberRegion,
  type MarketRegion,
} from '@/data/region.js';
import './region-switcher.css';

/**
 * Open/close, dismissal and focus behaviour for a region menu, shared by the in-page switcher
 * and the tab-bar market tab. Both must agree on the current region and on what choosing one
 * does, so the logic lives in one place rather than being reimplemented per trigger.
 */
function useRegionMenu() {
  const [searchParams] = useSearchParams();
  const region = regionFromSearch(searchParams);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => menuRef.current?.focus());
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The tab-bar menu is portalled out of the wrapper (see `RegionTab`), so it is not a
      // descendant of it — check the menu too, or the first pointerdown on an option would
      // close the menu and unmount the button before its click could fire.
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
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

  /**
   * `commit` is how a trigger applies the choice. The in-page switcher rewrites the parameter
   * in place; the tab bar navigates home instead, so each passes its own. Both go through here
   * to close the menu, restore focus, and move the landing default — as a side effect of the
   * click, never of render, so a shared link always opens the region it names.
   */
  const chooseWith = (commit: (next: MarketRegion) => void) => (next: MarketRegion) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (next === region) return;
    rememberRegion(next);
    commit(next);
  };

  return { region, open, setOpen, wrapRef, triggerRef, menuRef, chooseWith };
}

/** The menu body itself — identical options and semantics wherever it is anchored. */
function RegionMenu({
  region,
  menuRef,
  choose,
  className,
}: {
  readonly region: MarketRegion;
  readonly menuRef: React.RefObject<HTMLDivElement | null>;
  readonly choose: (next: MarketRegion) => void;
  readonly className: string;
}) {
  return (
    <div ref={menuRef} className={className} role="menu" tabIndex={-1} aria-label="시장 지역 선택">
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
  );
}

/**
 * The market tab in the global tab bar. The label navigates to the region-scoped home; the
 * caret beside it opens the same menu the in-page switcher uses. The caret was previously a
 * decorative `▾` that promised a dropdown and did nothing.
 *
 * Choosing a region here also navigates home, because picking a market from the global nav
 * means "show me that market" — staying on, say, the watchlist while silently rewriting the
 * parameter would leave the choice invisible.
 */
export function RegionTab({
  isActive,
  onNavigate,
}: {
  readonly isActive: boolean;
  readonly onNavigate: (region: MarketRegion) => void;
}) {
  const { region, open, setOpen, wrapRef, triggerRef, menuRef, chooseWith } = useRegionMenu();
  const current = REGION_LABELS[region];
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });

  // `.tabbar-tabs` scrolls horizontally, and a scroll container clips its absolutely-positioned
  // descendants — the menu rendered inside it lost everything below the tab bar's own height.
  // Portalling to `document.body` and pinning to the trigger's viewport box is what escapes it.
  const openMenu = () => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (box) setAnchor({ top: box.bottom, left: box.left });
    setOpen((value) => !value);
  };

  return (
    <div className="region-tab" ref={wrapRef}>
      <button
        type="button"
        className={`tabbar-tab region-tab-label${isActive ? ' active' : ''}`}
        onClick={() => onNavigate(region)}
      >
        <span aria-hidden="true">{current.flag}</span>
        {current.label}
      </button>
      <button
        ref={triggerRef}
        type="button"
        className="region-tab-caret"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`시장 지역 변경 (현재 ${current.label})`}
        onClick={openMenu}
      >
        <span aria-hidden="true">▾</span>
      </button>

      {open &&
        createPortal(
          <div className="region-tab-menu-anchor" style={{ top: anchor.top, left: anchor.left }}>
            <RegionMenu
              region={region}
              menuRef={menuRef}
              choose={chooseWith(onNavigate)}
              className="region-switcher-menu"
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
