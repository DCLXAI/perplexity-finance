/* ============================================================
   토스트 호스트 — 우상단 스택, AppShell 에서 마운트
   ============================================================ */
import { useToasts } from './alertsStore.js';
import './alerts.css';

export default function ToastHost() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="al-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="al-toast">
          <div className="al-toast-title">{t.title}</div>
          <div className="al-toast-body">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
