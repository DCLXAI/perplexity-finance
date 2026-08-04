/* ============================================================
   Routes. Every feature page is lazy-loaded and wrapped in an
   error boundary so one broken module never takes down the app.
   ============================================================ */
import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Link, Route, Routes, useLocation } from 'react-router';
import AppShell from '@/components/layout/AppShell';

const MarketPage = lazy(() => import('@/features/market/MarketPage'));
const CryptoPage = lazy(() => import('@/features/crypto/CryptoPage'));
const EarningsPage = lazy(() => import('@/features/earnings/EarningsPage'));
const PredictionsPage = lazy(() => import('@/features/predictions/PredictionsPage'));
const ScreenerPage = lazy(() => import('@/features/screener/ScreenerPage'));
const PoliticiansPage = lazy(() => import('@/features/politicians/PoliticiansPage'));
const WatchlistPage = lazy(() => import('@/features/watchlist/WatchlistPage'));
const PortfolioPage = lazy(() => import('@/features/portfolio/PortfolioPage'));
const AppsPage = lazy(() => import('@/features/apps/AppsPage'));
const StockPage = lazy(() => import('@/features/stock/StockPage'));
const StatusPage = lazy(() => import('@/features/status/StatusPage'));
const OpsPage = lazy(() => import('@/features/ops/OpsPage'));
const NotFoundPage = lazy(() => import('@/features/not-found/NotFoundPage'));

interface RouteErrorState {
  error: Error | null;
  errorId: string;
}

function createErrorId(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PF-${Date.now().toString(36).toUpperCase()}-${random}`;
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, RouteErrorState> {
  state: RouteErrorState = { error: null, errorId: '' };

  static getDerivedStateFromError(error: Error): RouteErrorState {
    return { error, errorId: createErrorId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Production UI only exposes the opaque ID; details stay in developer logs.
    console.error(`[route-error:${this.state.errorId}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="page route-error" role="alert" aria-labelledby="route-error-title">
          <div className="route-error-icon" aria-hidden="true">⚠️</div>
          <h1 id="route-error-title" className="route-error-title">페이지를 불러오지 못했습니다</h1>
          <p className="route-error-copy">
            잠시 후 다시 시도하세요. 문제가 계속되면 오류 ID를 함께 전달해 주세요.
          </p>
          <code className="route-error-id">오류 ID: {this.state.errorId}</code>
          {import.meta.env.DEV && (
            <details className="route-error-details">
              <summary>개발 환경 오류 세부정보</summary>
              <pre>{this.state.error.stack ?? this.state.error.message}</pre>
            </details>
          )}
          <div className="route-error-actions">
            <button type="button" className="ui-btn primary" onClick={() => window.location.reload()}>
              다시 불러오기
            </button>
            <Link className="ui-btn" to="/">시장 홈으로</Link>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

function PageFallback() {
  return (
    <div className="page page-fallback" role="status" aria-live="polite" aria-label="페이지 불러오는 중">
      <div className="ui-skel page-fallback-head" />
      <div className="ui-skel page-fallback-body" />
      <span className="sr-only">페이지를 불러오고 있습니다.</span>
    </div>
  );
}

/* 경로별 key로 에러 경계를 새로 만들어 다른 페이지로 이동하면 복구한다. */
function RouteGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary key={pathname}>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

function wrap(node: ReactNode) {
  return <RouteGuard>{node}</RouteGuard>;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={wrap(<MarketPage />)} />
          <Route path="/crypto" element={wrap(<CryptoPage />)} />
          <Route path="/earnings" element={wrap(<EarningsPage />)} />
          <Route path="/predictions" element={wrap(<PredictionsPage />)} />
          <Route path="/screener" element={wrap(<ScreenerPage />)} />
          <Route path="/politicians" element={wrap(<PoliticiansPage />)} />
          <Route path="/watchlist" element={wrap(<WatchlistPage />)} />
          <Route path="/portfolio" element={wrap(<PortfolioPage />)} />
          <Route path="/apps" element={wrap(<AppsPage />)} />
          <Route path="/status" element={wrap(<StatusPage />)} />
          <Route path="/ops" element={wrap(<OpsPage />)} />
          <Route path="/stock/:symbol" element={wrap(<StockPage />)} />
          <Route path="*" element={wrap(<NotFoundPage />)} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
