import { useId, useRef, useState, type FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import { useRuntimeConfig } from '@/live/runtimeConfig';
import { disablePushNotifications, enablePushNotifications, pushSupported } from './push.js';
import { useAuth } from './AuthProvider.js';
import './cloud.css';

export default function AccountButton() {
  const { configured, loading, user, accessToken, signInWithEmail, signOut } = useAuth();
  const { config } = useRuntimeConfig();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      await signInWithEmail(email.trim());
      setMessage('로그인 링크를 이메일로 보냈습니다. 같은 브라우저에서 링크를 여세요.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인 링크를 보내지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const togglePush = async (enable: boolean) => {
    if (!accessToken) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (enable) {
        if (!config?.vapidPublicKey) throw new Error('서버의 Web Push 키가 설정되지 않았습니다.');
        await enablePushNotifications(accessToken, config.vapidPublicKey);
        setMessage('이 브라우저의 가격 알림 푸시를 활성화했습니다.');
      } else {
        await disablePushNotifications(accessToken);
        setMessage('이 브라우저의 가격 알림 푸시를 해제했습니다.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '푸시 설정을 변경하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const label = loading ? '계정 확인 중' : user ? '클라우드 계정' : '로그인';

  return (
    <>
      <button
        type="button"
        className="hdr-action cloud-account-trigger"
        disabled={!configured || loading}
        aria-label={configured ? label : '클라우드 계정 미설정'}
        title={configured ? label : 'VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정하세요'}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">{user ? '☁️' : '👤'}</span>
        <span className="cloud-account-label">{user ? '동기화됨' : '로그인'}</span>
      </button>

      {open && (
        <Modal
          onClose={() => setOpen(false)}
          labelledBy={titleId}
          className="cloud-account-dialog"
          initialFocusRef={user ? undefined : emailRef}
        >
          <div className="cloud-account-head">
            <div>
              <h2 id={titleId}>클라우드 계정</h2>
              <p>관심목록과 서버 가격 알림을 여러 기기에서 동기화합니다.</p>
            </div>
            <button type="button" className="ui-btn ghost" onClick={() => setOpen(false)} aria-label="계정 창 닫기">✕</button>
          </div>

          {user ? (
            <div className="cloud-account-body">
              <div className="cloud-account-email">{user.email ?? '인증된 사용자'}</div>
              <div className="cloud-capability-grid">
                <span>관심목록</span><strong>Supabase 동기화</strong>
                <span>서버 알림</span><strong>{config?.capabilities.durableAlerts ? '활성' : '설정 필요'}</strong>
                <span>이메일 전달</span><strong>{config?.capabilities.emailDelivery ? '사용 가능' : '설정 필요'}</strong>
                <span>브라우저 푸시</span><strong>{config?.capabilities.pushDelivery ? '사용 가능' : '설정 필요'}</strong>
              </div>
              {config?.capabilities.pushDelivery && pushSupported() && (
                <div className="cloud-account-actions">
                  <button type="button" className="ui-btn" disabled={busy} onClick={() => void togglePush(true)}>이 기기 푸시 켜기</button>
                  <button type="button" className="ui-btn ghost" disabled={busy} onClick={() => void togglePush(false)}>푸시 해제</button>
                </div>
              )}
              <button
                type="button"
                className="ui-btn cloud-signout"
                disabled={busy}
                onClick={() => void signOut().then(() => setOpen(false)).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))}
              >
                로그아웃
              </button>
            </div>
          ) : (
            <form className="cloud-login-form" onSubmit={submit}>
              <label htmlFor={`${titleId}-email`}>이메일</label>
              <input
                ref={emailRef}
                id={`${titleId}-email`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
              <button type="submit" className="ui-btn primary" disabled={busy || !email.trim()}>
                {busy ? '전송 중…' : '매직 링크 받기'}
              </button>
            </form>
          )}

          {message && <p className="cloud-message" role="status">{message}</p>}
          {error && <p className="cloud-error" role="alert">{error}</p>}
        </Modal>
      )}
    </>
  );
}
