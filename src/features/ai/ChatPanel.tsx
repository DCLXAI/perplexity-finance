import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import Modal from '@/components/ui/Modal';
import { clsx } from '@/data/format';
import type { AiAnswerResponse } from '@/shared/api';

export interface ChatMsg {
  readonly id: number;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly status: 'pending' | 'streaming' | 'done' | 'error';
  readonly meta?: AiAnswerResponse;
  readonly error?: string;
}

function renderRich(text: string): ReactNode[] {
  return text.split('\n').map((line, index) => {
    if (line.trim() === '') return <div key={index} className="ai-msg-gap" />;
    const bullet = line.startsWith('· ') || line.startsWith('- ');
    const content = bullet ? line.slice(2) : line;
    const segments = content.split('**');
    const nodes = segments.map((segment, segmentIndex) => segmentIndex % 2 === 1
      ? <strong key={segmentIndex}>{segment}</strong>
      : <span key={segmentIndex}>{segment}</span>);
    return bullet ? (
      <div key={index} className="ai-msg-bullet">
        <span className="ai-msg-dot">·</span>
        <span className="ai-msg-bullet-text">{nodes}</span>
      </div>
    ) : <div key={index} className="ai-msg-line">{nodes}</div>;
  });
}

const UserMsg = memo(function UserMsg({ text }: { text: string }) {
  return <div className="ai-msg-user">{text}</div>;
});

function ResponseMeta({ response, error }: { response?: AiAnswerResponse; error?: string }) {
  if (!response) return null;
  const generated = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(response.generatedAt));
  return (
    <div className="ai-response-meta">
      <div className="ai-meta-line">
        <span className={`ai-mode-chip ${response.mode}`}>{response.mode === 'openai' ? 'AI 도구 응답' : '로컬 폴백'}</span>
        <span>{response.model}</span>
        <span className="num">{generated}</span>
      </div>
      {response.toolsUsed.length > 0 && (
        <div className="ai-tools-used">도구: {response.toolsUsed.join(' · ')}</div>
      )}
      {response.sources.length > 0 && (
        <details className="ai-sources">
          <summary>출처 {response.sources.length}개</summary>
          <ul>
            {response.sources.map((source, index) => (
              <li key={`${source.title}-${source.asOfISO}-${index}`}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                ) : <strong>{source.title}</strong>}
                <span>{source.detail}</span>
                <time dateTime={source.asOfISO}>{new Date(source.asOfISO).toLocaleString('ko-KR')}</time>
              </li>
            ))}
          </ul>
        </details>
      )}
      {response.usage && (
        <div className="ai-token-usage num">토큰 {response.usage.totalTokens.toLocaleString()} · 요청 {response.requestId}</div>
      )}
      {response.evidenceHash && (
        <div className="ai-token-usage num">근거 해시 {response.evidenceHash.slice(0, 16)}</div>
      )}
      {error && <div className="ai-fallback-note">서버 요청 실패 후 로컬 폴백: {error}</div>}
      <div className="ai-disclaimer">정보 제공용이며 투자 조언이 아닙니다.</div>
    </div>
  );
}

const AssistantMsg = memo(function AssistantMsg({
  msg,
  onDone,
  onGrow,
}: {
  msg: ChatMsg;
  onDone: (id: number) => void;
  onGrow: () => void;
}) {
  const [shown, setShown] = useState(() => msg.status === 'done' ? msg.text.length : 0);

  useEffect(() => {
    if (msg.status !== 'streaming') return;
    setShown(0);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(msg.text.length);
      onDone(msg.id);
      return;
    }
    const interval = window.setInterval(() => {
      setShown((current) => Math.min(msg.text.length, current + 4));
    }, 12);
    return () => window.clearInterval(interval);
  }, [msg.id, msg.status, msg.text, onDone]);

  useEffect(() => {
    onGrow();
    if (msg.status === 'streaming' && shown >= msg.text.length && msg.text.length > 0) onDone(msg.id);
  }, [msg.id, msg.status, msg.text.length, onDone, onGrow, shown]);

  if (msg.status === 'pending') {
    return <div className="ai-msg-assistant"><div className="ai-thinking">공급자 데이터와 금융 도구를 확인하는 중…</div></div>;
  }

  const visible = msg.status === 'done' ? msg.text : msg.text.slice(0, shown);
  return (
    <div className="ai-msg-assistant">
      <div className="ai-msg-body num">
        {renderRich(visible)}
        {msg.status === 'streaming' && <span className="ai-cursor">▍</span>}
      </div>
      {msg.status === 'done' && <ResponseMeta response={msg.meta} error={msg.error} />}
    </div>
  );
});

export default function ChatPanel({
  messages,
  onAsk,
  onClose,
  onDone,
}: {
  messages: ChatMsg[];
  onAsk: (question: string) => void;
  onClose: () => void;
  onDone: (id: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant' && message.meta)?.meta, [messages]);

  const scrollBottom = useCallback(() => {
    const element = listRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, []);

  const scrollBottomIfPinned = useCallback(() => {
    const element = listRef.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 80) {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  useEffect(() => scrollBottom(), [messages.length, scrollBottom]);
  const busy = messages.some((message) => message.role === 'assistant' && (message.status === 'pending' || message.status === 'streaming'));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || busy) return;
    setDraft('');
    onAsk(question);
  };

  return (
    <Modal
      onClose={onClose}
      ariaLabel="금융 AI 도우미"
      className="ai-panel"
      backdropClassName="ai-panel-backdrop"
      initialFocusRef={inputRef}
    >
      <div className="ai-panel-head">
        <span className="ai-panel-spark" aria-hidden="true">✦</span>
        <span className="ai-panel-title">금융 AI 도우미</span>
        <span className="ai-panel-model">{latest?.model ?? '도구 연결 대기'}</span>
        <button type="button" className="ai-panel-close" onClick={onClose} aria-label="패널 닫기">✕</button>
      </div>

      <div className="ai-panel-list" ref={listRef} role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((message) => message.role === 'user'
          ? <UserMsg key={message.id} text={message.text} />
          : <AssistantMsg key={message.id} msg={message} onDone={onDone} onGrow={scrollBottomIfPinned} />)}
      </div>

      <form className="ai-panel-form" onSubmit={submit}>
        <input
          ref={inputRef}
          className="ai-panel-input"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={busy ? '응답 생성 중…' : '추가 질문을 입력하세요'}
          aria-label="추가 질문 입력"
        />
        <button type="submit" className={clsx('ai-send', draft.trim() && !busy && 'ready')} disabled={busy || !draft.trim()} aria-label="질문 보내기">➤</button>
      </form>
    </Modal>
  );
}
