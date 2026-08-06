/* ============================================================
   Price-alert creation dialog.
   Local alerts watch the browser engine; server alerts require an
   authenticated account plus verified live/delayed provider data.
   ============================================================ */
import { useId, useRef, useState, type FormEvent } from 'react';
import { LogoChip } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/cloud/AuthProvider';
import { enablePushNotifications } from '@/cloud/push';
import { fmtQuoteValue } from '@/data/format';
import { useQuote } from '@/data/store';
import { useRuntimeConfig } from '@/live/runtimeConfig';
import { trackClientEvent } from '@/telemetry/client';
import { createPriceAlert } from './alertsStore.js';
import './alerts.css';

export default function AlertDialog({
  symbol,
  onClose,
}: {
  symbol: string;
  onClose: () => void;
}) {
  const quote = useQuote(symbol);
  const { user, accessToken } = useAuth();
  const { config } = useRuntimeConfig();
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [remote, setRemote] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const hintId = useId();
  const errorId = useId();
  const [priceStr, setPriceStr] = useState(() => {
    const price = quote?.price ?? 0;
    return (Math.round(price * 100) / 100).toString();
  });

  if (!quote) return null;

  const target = Number(priceStr);
  const valid = Number.isFinite(target) && target > 0;
  const providerVerified = quote.provenance.mode === 'live' || quote.provenance.mode === 'delayed';
  const remoteAvailable = Boolean(
    user && accessToken && config?.capabilities.durableAlerts && providerVerified,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      if (remote && pushEnabled) {
        if (!accessToken || !config?.vapidPublicKey) {
          throw new Error('브라우저 푸시 전달 키가 설정되지 않았습니다.');
        }
        await enablePushNotifications(accessToken, config.vapidPublicKey);
      }
      const id = await createPriceAlert(symbol, condition, target, {
        remote,
        emailEnabled: remote && emailEnabled,
        pushEnabled: remote && pushEnabled,
      });
      if (!id) throw new Error(remote ? '서버 알림을 만들 수 없습니다. 로그인과 데이터 상태를 확인하세요.' : '로컬 알림을 만들지 못했습니다.');
      trackClientEvent('alert.created', {
        mode: remote ? 'server' : 'browser',
        symbol,
        condition,
        email: remote && emailEnabled,
        push: remote && pushEnabled,
      });
      onClose();
    } catch (cause) {
      trackClientEvent('alert.create_failed', {
        mode: remote ? 'server' : 'browser',
        symbol,
        reason: cause instanceof Error ? cause.name : 'unknown',
      });
      setError(cause instanceof Error ? cause.message : '알림을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      describedBy={hintId}
      className="al-dialog"
      initialFocusRef={inputRef}
    >
      <div className="al-dlg-head">
        <LogoChip symbol={quote.symbol} bg={quote.logoBg} text={quote.logoText} size={34} />
        <div>
          <h2 id={titleId} className="al-dlg-title">가격 알림 만들기</h2>
          <div className="al-dlg-sub">
            {quote.nameKo ?? quote.name} · {quote.symbol}
          </div>
        </div>
      </div>

      <div className="al-dlg-price num">
        현재가 {fmtQuoteValue(quote, quote.price)} · {quote.provenance.sourceLabel}
      </div>

      <form onSubmit={(event) => void submit(event)}>
        <div className="al-dlg-form">
          <label className="sr-only" htmlFor={`${titleId}-condition`}>알림 조건</label>
          <select
            id={`${titleId}-condition`}
            value={condition}
            onChange={(event) => setCondition(event.target.value as 'above' | 'below')}
          >
            <option value="above">이상 (≥)</option>
            <option value="below">이하 (≤)</option>
          </select>
          <label className="sr-only" htmlFor={`${titleId}-target`}>목표 값</label>
          <input
            ref={inputRef}
            id={`${titleId}-target`}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={priceStr}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            aria-invalid={!valid}
            onChange={(event) => {
              setPriceStr(event.target.value);
              setError('');
            }}
          />
        </div>

        <fieldset className="al-mode-fieldset">
          <legend>감시 방식</legend>
          <label className="al-mode-option">
            <input type="radio" name={`${titleId}-mode`} checked={!remote} onChange={() => setRemote(false)} />
            <span><strong>이 브라우저에서 감시</strong><small>무료 로컬 모드 · 탭이 열려 있을 때만 작동</small></span>
          </label>
          <label className={`al-mode-option${remoteAvailable ? '' : ' disabled'}`}>
            <input
              type="radio"
              name={`${titleId}-mode`}
              checked={remote}
              disabled={!remoteAvailable}
              onChange={() => setRemote(true)}
            />
            <span>
              <strong>서버에서 지속 감시</strong>
              <small>{remoteAvailable ? 'Cron이 검증된 공급자 시세로 감시' : !user ? '로그인이 필요합니다' : !providerVerified ? '실시간 또는 지연 공급자 시세가 필요합니다' : '서버 알림 설정이 필요합니다'}</small>
            </span>
          </label>
        </fieldset>

        {remote && (
          <fieldset className="al-delivery-fieldset">
            <legend>전달 채널</legend>
            <label>
              <input
                type="checkbox"
                checked={emailEnabled}
                disabled={!config?.capabilities.emailDelivery}
                onChange={(event) => setEmailEnabled(event.target.checked)}
              />
              이메일 {config?.capabilities.emailDelivery ? '' : '(서버 설정 필요)'}
            </label>
            <label>
              <input
                type="checkbox"
                checked={pushEnabled}
                disabled={!config?.capabilities.pushDelivery}
                onChange={(event) => setPushEnabled(event.target.checked)}
              />
              브라우저 푸시 {config?.capabilities.pushDelivery ? '' : '(서버 설정 필요)'}
            </label>
          </fieldset>
        )}

        <p id={hintId} className="al-dlg-hint">
          생성 시 현재가를 기준선으로 저장하고, 가격이 반대편에서 목표 값을 실제로 교차할 때 한 번만 발화합니다. 합성·폴백 시세는 서버 알림을 발화시키지 않습니다.
        </p>
        {error && <p id={errorId} className="al-dlg-error" role="alert">{error}</p>}

        <div className="al-dlg-actions">
          <button type="button" className="ui-btn ghost" onClick={onClose}>취소</button>
          <button type="submit" className="ui-btn primary" disabled={!valid || busy}>
            {busy ? '생성 중…' : remote ? '서버 알림 만들기' : '로컬 알림 만들기'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
