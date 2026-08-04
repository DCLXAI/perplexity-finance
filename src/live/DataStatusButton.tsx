import { useEffect, useId, useRef, useState } from 'react';
import { useMarketRuntimeStatus, refreshMarketData } from './marketRuntime.js';
import { useRuntimeConfig } from './runtimeConfig.js';
import './data-status.css';

function formatTime(value?: string): string {
  if (!value) return '아직 없음';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export default function DataStatusButton() {
  const status = useMarketRuntimeStatus();
  const { config, loading: configLoading, refresh: refreshConfig } = useRuntimeConfig();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    const pointer = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', pointer);
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', pointer);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      refreshConfig();
      await refreshMarketData();
    } finally {
      setRefreshing(false);
    }
  };

  const tone = status.phase === 'ready' ? 'ready' : status.phase === 'degraded' ? 'degraded' : 'idle';
  const marketProviderConfigured = Boolean(
    config?.capabilities.alpaca
    || config?.capabilities.secondaryEquity
    || config?.capabilities.secondaryCrypto,
  );

  return (
    <div className="data-status-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`hdr-action data-status-trigger ${tone}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`데이터 상태: ${status.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="data-status-dot" aria-hidden="true" />
        <span className="data-status-label">{status.label}</span>
      </button>

      {open && (
        <section
          ref={panelRef}
          id={panelId}
          className="data-status-panel"
          role="region"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <div className="data-status-head">
            <div>
              <h2 id={titleId}>데이터 연결 상태</h2>
              <p>화면에 표시되는 값의 공급자·시각·품질을 확인합니다.</p>
            </div>
            <button
              type="button"
              className="data-status-close"
              aria-label="데이터 상태 닫기"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              ✕
            </button>
          </div>

          <dl className="data-status-meta">
            <div><dt>현재 모드</dt><dd>{status.label}</dd></div>
            <div><dt>공급자 기준</dt><dd className="num">{formatTime(status.asOfISO)}</dd></div>
            <div><dt>마지막 성공</dt><dd className="num">{formatTime(status.lastSuccessAt)}</dd></div>
            <div><dt>추적 자산</dt><dd className="num">{status.activeSymbols.length}개</dd></div>
          </dl>

          <div className="data-status-providers">
            {status.providers.length ? status.providers.map((provider) => (
              <div key={provider.provider} className="data-provider-row">
                <span className={`data-provider-light ${provider.status}`} aria-hidden="true" />
                <div>
                  <strong>{provider.provider}</strong>
                  <span>{provider.message}</span>
                </div>
                <small>{provider.mode}</small>
              </div>
            )) : (
              <p className="data-status-empty">공급자 응답 전입니다. 현재는 P1 로컬 데이터가 유지됩니다.</p>
            )}
          </div>

          {status.warnings.length > 0 && (
            <ul className="data-status-warnings">
              {status.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
          {status.error && <p className="data-status-error" role="status">{status.error}</p>}

          <div className="data-capabilities">
            <span>시장 공급자</span><b>{marketProviderConfigured ? `${config?.providerMode ?? '연결'} 모드` : '폴백'}</b>
            <span>클라우드</span><b>{config?.capabilities.cloudAccount ? '설정됨' : '미설정'}</b>
            <span>AI 도구</span><b>{config?.capabilities.aiTools ? '설정됨' : '로컬 답변'}</b>
            <span>분산 캐시</span><b>{config?.capabilities.distributedCache ? '설정됨' : '인메모리'}</b>
            <span>릴리스</span><b>{config ? `v${config.version} · ${config.releaseChannel}` : '확인 중'}</b>
          </div>

          <button type="button" className="ui-btn data-status-refresh" disabled={refreshing || configLoading} onClick={() => void refresh()}>
            {refreshing ? '새로고침 중…' : '지금 새로고침'}
          </button>
        </section>
      )}
    </div>
  );
}
