/* Header alert popover for local and durable server alerts. */
import { useEffect, useId, useRef, useState } from 'react';
import { LogoChip } from '@/components/ui';
import { engine } from '@/data/engine';
import { fmtQuoteValue } from '@/data/format';
import { markAllSeen, removeAlert, useAlerts, type PriceAlert } from './alertsStore.js';
import './alerts.css';

function statusLabel(alert: PriceAlert): string {
  if (alert.state === 'disabled') return '비활성';
  if (alert.triggeredAt) return '교차됨';
  return alert.remoteManaged ? '서버 대기' : '로컬 대기';
}

function deliveryLabel(alert: PriceAlert): string | null {
  if (!alert.deliveries?.length) return null;
  return alert.deliveries
    .map((delivery) => `${delivery.channel === 'email' ? '이메일' : '푸시'} ${delivery.status}`)
    .join(' · ');
}

export default function AlertsButton() {
  const alerts = useAlerts();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();
  const titleId = useId();
  const unseen = alerts.filter((alert) => !alert.seen).length;
  const remoteCount = alerts.filter((alert) => alert.remoteManaged).length;

  useEffect(() => {
    if (!open) return;
    markAllSeen();
    const focusFrame = requestAnimationFrame(() => panelRef.current?.focus());
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="al-btn-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="hdr-action al-trigger"
        aria-label={`가격 알림${unseen > 0 ? `, 새 알림 ${unseen}개` : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">📈</span>
        <span className="al-btn-label">가격 알림</span>
        {unseen > 0 && <span className="al-badge num">{unseen}</span>}
      </button>

      {open && (
        <section
          ref={panelRef}
          id={panelId}
          className="al-panel"
          role="region"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <div className="al-panel-head">
            <h2 id={titleId} className="al-panel-title">가격 알림</h2>
            <span className="muted text-xs num">전체 {alerts.length} · 서버 {remoteCount}</span>
            <button
              type="button"
              className="al-panel-close"
              aria-label="가격 알림 목록 닫기"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              ✕
            </button>
          </div>

          <div className="al-list">
            {alerts.length === 0 ? (
              <div className="al-empty">
                등록된 알림이 없습니다.
                <br />
                종목 페이지의 <strong>알림</strong> 버튼으로 추가하세요.
              </div>
            ) : (
              [...alerts]
                .sort((a, b) => (b.triggeredAt ?? Date.parse(b.createdISO)) - (a.triggeredAt ?? Date.parse(a.createdISO)))
                .map((alert) => {
                  const quote = engine.getQuote(alert.symbol);
                  const delivery = deliveryLabel(alert);
                  return (
                    <div key={alert.id} className={alert.triggeredAt ? 'al-row hit' : 'al-row'}>
                      <LogoChip bg={quote?.logoBg} text={quote?.logoText} size={24} />
                      <div className="al-row-main">
                        <div className="al-row-titleline">
                          <div className="al-row-name">{quote?.nameKo ?? quote?.name ?? alert.symbol}</div>
                          <span className={`al-scope ${alert.remoteManaged ? 'remote' : 'local'}`}>
                            {alert.remoteManaged ? '서버' : '로컬'}
                          </span>
                        </div>
                        <div className="al-row-cond num">
                          {quote ? fmtQuoteValue(quote, alert.target) : alert.target.toString()}{' '}
                          {alert.condition === 'above' ? '이상' : '이하'}
                          {quote ? ` · 현재 ${fmtQuoteValue(quote, quote.price)}` : ''}
                        </div>
                        {delivery && <div className="al-row-delivery">{delivery}</div>}
                      </div>
                      <span className={alert.triggeredAt ? 'al-row-status hit' : 'al-row-status wait'}>
                        {statusLabel(alert)}
                      </span>
                      <button
                        type="button"
                        className="al-x"
                        aria-label={`${quote?.nameKo ?? quote?.name ?? alert.symbol} 알림 삭제`}
                        onClick={() => removeAlert(alert.id)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
            )}
          </div>

          <div className="al-panel-foot">
            서버 알림은 로그인 후 Cron으로 지속 감시합니다. 로컬 알림은 이 브라우저 탭이 열려 있을 때만 작동합니다.
          </div>
        </section>
      )}
    </div>
  );
}
