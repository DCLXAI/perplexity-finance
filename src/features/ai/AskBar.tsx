/* P2 financial assistant: server Responses API tools with explicit local fallback. */
import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/cloud/AuthProvider';
import { clsx } from '@/data/format';
import { apiFetch } from '@/live/apiClient';
import { useRuntimeConfig } from '@/live/runtimeConfig';
import type { AiAnswerResponse } from '@/shared/api';
import { trackClientEvent } from '@/telemetry/client';
import { generateAnswer } from './answers.js';
import ChatPanel, { type ChatMsg } from './ChatPanel.js';
import './ai.css';

let nextId = 1;

export default function AskBar({ placeholder = '시장 데이터에 대해 질문하세요' }: { placeholder?: string }) {
  const [value, setValue] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const messagesRef = useRef<ChatMsg[]>([]);
  const { accessToken } = useAuth();
  const { config } = useRuntimeConfig();

  const commit = useCallback((updater: (current: ChatMsg[]) => ChatMsg[]) => {
    setMessages((current) => {
      const next = updater(current);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const ask = useCallback(async (question: string) => {
    const text = question.trim();
    const current = messagesRef.current;
    if (!text || current.some((message) => message.role === 'assistant' && (message.status === 'pending' || message.status === 'streaming'))) return;

    const userMessage: ChatMsg = { id: nextId++, role: 'user', text, status: 'done' };
    const assistantId = nextId++;
    const assistantMessage: ChatMsg = { id: assistantId, role: 'assistant', text: '', status: 'pending' };
    const prior = current.filter((message) => message.text).slice(-10);
    commit((previous) => [...previous, userMessage, assistantMessage]);
    setPanelOpen(true);

    try {
      const response = await apiFetch<AiAnswerResponse>(
        '/api/ai/answer',
        {
          method: 'POST',
          body: JSON.stringify({
            messages: [...prior, userMessage].map((message) => ({ role: message.role, text: message.text })),
          }),
        },
        accessToken,
      );
      trackClientEvent('ai.answer', {
        mode: response.mode,
        model: response.model,
        tools: response.toolsUsed.length,
        sources: response.sources.length,
      });
      commit((previous) => previous.map((message) => message.id === assistantId ? {
        ...message,
        text: response.text,
        status: 'streaming',
        meta: response,
      } : message));
    } catch (cause) {
      trackClientEvent('ai.answer_failed', {
        reason: cause instanceof Error ? cause.name : 'unknown',
      });
      const fallback: AiAnswerResponse = {
        requestId: `browser-${Date.now()}`,
        text: generateAnswer(text),
        model: 'local-rule-engine',
        mode: 'local-fallback',
        toolsUsed: Object.freeze([]),
        sources: Object.freeze([]),
        generatedAt: new Date().toISOString(),
      };
      commit((previous) => previous.map((message) => message.id === assistantId ? {
        ...message,
        text: fallback.text,
        status: 'streaming',
        meta: fallback,
        error: cause instanceof Error ? cause.message : String(cause),
      } : message));
    }
  }, [accessToken, commit]);

  const markDone = useCallback((id: number) => {
    commit((previous) => previous.map((message) => message.id === id ? { ...message, status: 'done' } : message));
  }, [commit]);

  const submitBar = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    void ask(value);
    setValue('');
  };

  const hasText = value.trim() !== '';
  const busy = messages.some((message) => message.role === 'assistant' && (message.status === 'pending' || message.status === 'streaming'));
  const assistantLabel = config?.capabilities.aiTools ? 'OpenAI 금융 도구 · 출처 표시' : '서버 로컬 폴백 · API 키 미설정';

  return (
    <>
      <form className="ai-askbar" onSubmit={submitBar}>
        <input
          className="ai-input"
          value={value}
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          placeholder={busy ? '응답을 생성하고 있습니다…' : placeholder}
          aria-label="금융 도우미에 질문하기"
          autoComplete="off"
        />
        <div className="ai-bar-row">
          <span className="ai-local-label">{assistantLabel}</span>
          <button
            type="submit"
            className={clsx('ai-send', hasText && !busy && 'ready')}
            aria-label="질문 보내기"
            disabled={busy || !hasText}
          >
            {hasText && !busy ? '➤' : (
              <span className="ai-wave" aria-hidden="true"><i /><i /><i /></span>
            )}
          </button>
        </div>
      </form>

      {panelOpen && (
        <ChatPanel
          messages={messages}
          onAsk={(question) => void ask(question)}
          onClose={() => setPanelOpen(false)}
          onDone={markDone}
        />
      )}
    </>
  );
}
