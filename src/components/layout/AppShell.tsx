/* ============================================================
   App shell — sticky header, route tabs, title/focus management.
   ============================================================ */
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router';
import { SNAPSHOT } from '@/data/universe';
import AccountButton from '@/cloud/AccountButton';
import { useAuth } from '@/cloud/AuthProvider';
import DataStatusButton from '@/live/DataStatusButton';
import { useMarketRuntimeStatus } from '@/live/marketRuntime';
import { REGION_LABELS, REGION_PARAM, regionFromSearch } from '@/data/region';
import { useTheme } from '@/data/store';
import AlertsButton from '@/features/alerts/AlertsButton';
import ToastHost from '@/features/alerts/ToastHost';
import DocumentTitle from './DocumentTitle.js';
import './layout.css';

const SearchPalette = lazy(() => import('@/features/search/SearchPalette'));

interface Tab {
  readonly to: string;
  readonly label: string;
  readonly flag?: string;
  /** Korea has no per-trade disclosure feed and no domestic prediction market: hide under KR. */
  readonly usOnly?: boolean;
}

const TABS: readonly Tab[] = [
  { to: '/', label: '미국 시장', flag: '🇺🇸' },
  { to: '/crypto', label: '암호화폐' },
  { to: '/earnings', label: '수익' },
  { to: '/predictions', label: '예측', usOnly: true },
  { to: '/screener', label: '스크리너' },
  { to: '/politicians', label: '정치인', usOnly: true },
  { to: '/watchlist', label: '관심목록' },
  { to: '/portfolio', label: '포트폴리오' },
  { to: '/apps', label: '앱 갤러리' },
  { to: '/status', label: '시스템 상태' },
];

/**
 * Keep the region parameter on nav links so moving between tabs doesn't silently fall back to
 * US. Merges into any query string `to` already carries rather than concatenating blindly — a
 * second bare `?` would make `URLSearchParams` swallow the region into the previous value's tail.
 */
export function withRegion(to: string, region: string | null): string {
  if (!region) return to;
  const [path, search = ''] = to.split('?');
  const params = new URLSearchParams(search);
  params.set(REGION_PARAM, region);
  return `${path}?${params.toString()}`;
}

function SentimentBars({ score }: { score: number }) {
  const bars = 10;
  const lit = Math.round((score / 100) * bars);
  return (
    <span className="sentiment-bars" role="img" aria-label={`모의 시장 심리 점수 ${score}점`}>
      {Array.from({ length: bars }, (_, i) => {
        const height = 4 + (i / (bars - 1)) * 8;
        const on = i < lit;
        const className = on ? (i >= 6 ? 'on high' : i >= 3 ? 'on mid' : 'on') : '';
        return <i key={i} className={className} style={{ height }} aria-hidden="true" />;
      })}
    </span>
  );
}

export default function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const region = regionFromSearch(searchParams);
  // Same convention RailWidgets.tsx's MoversCard uses: only stamp `?region=` when it isn't the
  // default US, so plain US browsing (including a URL that explicitly carries `?region=us` after
  // switching back from KR) stays free of `?region=us` cruft on every link — including the
  // region-agnostic tabs (crypto, portfolio, apps, status) that have no region to switch and must
  // not carry a parameter that would do nothing there. `region` itself (not the raw search param)
  // already decided tab visibility above, so this stays the one value every nav link agrees with.
  const regionParam = region === 'KR' ? 'kr' : null;
  const marketStatus = useMarketRuntimeStatus();
  const { isOps } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  const priorPathRef = useRef(location.pathname);
  const visibleTabs = TABS.filter((tab) => !tab.usOnly || region === 'US');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      if (searchOpen) {
        setSearchOpen(false);
        return;
      }
      // Do not stack the search dialog over another active modal surface.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setSearchOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  useEffect(() => {
    if (priorPathRef.current !== location.pathname) {
      priorPathRef.current = location.pathname;
      requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    }
  }, [location.pathname]);

  return (
    <>
      <DocumentTitle />
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          // HashRouter owns location.hash, so a native fragment jump would replace the route.
          event.preventDefault();
          mainRef.current?.focus({ preventScroll: true });
          mainRef.current?.scrollIntoView({ block: 'start' });
        }}
      >
        본문으로 건너뛰기
      </a>

      <header className="app-header">
        <Link className="hdr-brand" to="/" aria-label={`Synapsu ${REGION_LABELS[region].label} 홈`}>
          {/* Synapse motif: a signal crossing a cleft between two nodes. */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              <path d="M3 12 h4 M17 12 h4 M10.5 6.5 L7 3 M10.5 17.5 L7 21" />
              <circle cx="8.4" cy="12" r="2.4" />
              <circle cx="15.6" cy="12" r="2.4" />
              <path d="M10.9 10.4 L13.1 10.4 M10.9 13.6 L13.1 13.6" />
            </g>
          </svg>
          <span className="hdr-brand-name">Synapsu</span>
          <span className={`hdr-data-badge ${marketStatus.phase}`}>{marketStatus.label}</span>
        </Link>

        <button type="button" className="hdr-search" onClick={() => setSearchOpen(true)} aria-label="자산 검색 열기">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="hdr-search-long">주식, 암호화폐 등을 검색하세요...</span>
          <span className="hdr-search-short">검색</span>
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>

        <div className="hdr-actions">
          <button
            type="button"
            className="hdr-action hdr-theme"
            onClick={toggle}
            title="테마 전환"
            aria-label={theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
          >
            <span aria-hidden="true">{theme === 'light' ? '🌙' : '☀️'}</span>
          </button>
          <DataStatusButton />
          <AccountButton />
          <AlertsButton />
        </div>
      </header>

      <nav className="app-tabbar" aria-label="주요 금융 화면">
        <div className="tabbar-tabs">
          {visibleTabs.map((tab) => {
            // Tab 0 points at the region-scoped market home, so its label/flag follow the
            // active region — otherwise a KR link would sit under a "미국 시장 🇺🇸" tab.
            const isHome = tab.to === '/';
            const homeLabels = REGION_LABELS[region];
            return (
              <NavLink
                key={tab.to}
                to={withRegion(tab.to, regionParam)}
                end={isHome}
                className={({ isActive }) =>
                  `tabbar-tab${isActive || (isHome && location.pathname.startsWith('/stock')) ? ' active' : ''}`
                }
              >
                {isHome ? (
                  <span aria-hidden="true">{homeLabels.flag}</span>
                ) : (
                  tab.flag && <span aria-hidden="true">{tab.flag}</span>
                )}
                {isHome ? homeLabels.label : tab.label}
                {isHome && <span className="tabbar-caret" aria-hidden="true">▾</span>}
              </NavLink>
            );
          })}
          {isOps && (
            <NavLink to="/ops" className={({ isActive }) => `tabbar-tab${isActive ? ' active' : ''}`}>
              운영
            </NavLink>
          )}
        </div>
        <div className="tabbar-status" aria-label="데이터 기준">
          <span className="tabbar-sentiment">
            <SentimentBars score={SNAPSHOT.sentimentScore} /> {SNAPSHOT.sentimentLabel}
          </span>
          <span>{marketStatus.label} · {marketStatus.asOfISO ? `공급자 ${new Date(marketStatus.asOfISO).toLocaleString('ko-KR')}` : `로컬 기준 ${region === 'KR' ? SNAPSHOT.krAsOfLabelKo : SNAPSHOT.closeLabelKo}`}</span>
        </div>
      </nav>

      <main id="main-content" ref={mainRef} className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
      <ToastHost />

      {searchOpen && (
        <Suspense fallback={null}>
          <SearchPalette onClose={() => setSearchOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
