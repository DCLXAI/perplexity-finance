import { useId, useRef, useState, type FormEvent } from 'react';
import Modal from '../../components/ui/Modal.js';
import type { PortfolioGoal } from '../../shared/api.js';

export interface GoalPlanInput {
  readonly name: string;
  readonly targetAmount: number;
  readonly targetDate: string;
  readonly expectedAnnualReturnPct: number;
  readonly contributionAmount: number;
  readonly contributionDay: number;
}

interface GoalPlanDialogProps {
  readonly goal: PortfolioGoal | null;
  readonly busy?: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (input: GoalPlanInput) => Promise<void>;
}

function defaultTargetDate(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + 5);
  return date.toISOString().slice(0, 10);
}

export function GoalPlanDialog({ goal, busy = false, onClose, onSubmit }: GoalPlanDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(goal?.name ?? '장기 투자 목표');
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmount) : '100000');
  const [targetDate, setTargetDate] = useState(goal?.targetDate.slice(0, 10) ?? defaultTargetDate());
  const [expectedReturn, setExpectedReturn] = useState(goal ? String(goal.expectedAnnualReturnPct) : '7');
  const [contributionAmount, setContributionAmount] = useState(goal ? String(goal.contributionAmount) : '1000');
  const [contributionDay, setContributionDay] = useState(goal ? String(goal.contributionDay) : '1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const minimumTargetDate = new Date().toISOString().slice(0, 10);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedTarget = Number(targetAmount);
    const parsedReturn = Number(expectedReturn);
    const parsedContribution = Number(contributionAmount);
    const parsedDay = Number(contributionDay);
    const parsedTargetDate = new Date(`${targetDate}T00:00:00.000Z`);
    if (
      !name.trim()
      || name.trim().length > 80
      || !Number.isFinite(parsedTarget)
      || parsedTarget <= 0
      || parsedTarget > Number.MAX_SAFE_INTEGER / 100
      || Math.abs(parsedTarget * 100 - Math.round(parsedTarget * 100)) >= 1e-7
      || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)
      || Number.isNaN(parsedTargetDate.getTime())
      || parsedTargetDate.toISOString().slice(0, 10) !== targetDate
      || targetDate < minimumTargetDate
      || !Number.isFinite(parsedReturn)
      || parsedReturn < -50
      || parsedReturn > 50
      || !Number.isFinite(parsedContribution)
      || parsedContribution <= 0
      || parsedContribution > Number.MAX_SAFE_INTEGER / 100
      || Math.abs(parsedContribution * 100 - Math.round(parsedContribution * 100)) >= 1e-7
      || !Number.isInteger(parsedDay)
      || parsedDay < 1
      || parsedDay > 28
    ) {
      setError('목표명, 목표 금액·날짜, 예상 수익률과 월 적립 조건을 확인해 주세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        name: name.trim(),
        targetAmount: parsedTarget,
        targetDate,
        expectedAnnualReturnPct: parsedReturn,
        contributionAmount: parsedContribution,
        contributionDay: parsedDay,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '투자 목표를 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = busy || submitting;
  const close = () => {
    if (!disabled) onClose();
  };
  return (
    <Modal
      onClose={close}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="gc-dialog"
      initialFocusRef={firstRef}
    >
      <form onSubmit={submit}>
        <header className="gc-dialog-head">
          <div>
            <span>P8 GOAL PLAN</span>
            <h2 id={titleId}>{goal ? '투자 목표 수정' : '투자 목표 만들기'}</h2>
            <p id={descriptionId}>목표 금액과 기간, 월 적립 계획을 저장해 예상 경로를 계산합니다.</p>
          </div>
          <button type="button" className="gc-close" disabled={disabled} onClick={close} aria-label="투자 목표 창 닫기">×</button>
        </header>

        <div className="gc-form-grid">
          <label className="gc-field gc-field-wide">
            <span>목표명</span>
            <input ref={firstRef} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="gc-field">
            <span>목표 금액 · USD</span>
            <input type="number" required min="0.01" step="0.01" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} />
          </label>
          <label className="gc-field">
            <span>목표 날짜</span>
            <input type="date" required min={minimumTargetDate} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </label>
          <label className="gc-field">
            <span>연 예상 수익률 · %</span>
            <input type="number" required min="-50" max="50" step="0.01" value={expectedReturn} onChange={(event) => setExpectedReturn(event.target.value)} />
          </label>
          <label className="gc-field">
            <span>월 적립금 · USD</span>
            <input type="number" required min="0.01" step="0.01" value={contributionAmount} onChange={(event) => setContributionAmount(event.target.value)} />
          </label>
          <label className="gc-field">
            <span>매월 적립일 · 1–28일</span>
            <input type="number" required min="1" max="28" step="1" value={contributionDay} onChange={(event) => setContributionDay(event.target.value)} />
          </label>
        </div>

        <p className="gc-form-note">예상 수익률은 계산 가정이며 실제 수익이나 목표 달성을 보장하지 않습니다.</p>
        {error && <p className="gc-error" role="alert">{error}</p>}
        <footer className="gc-dialog-actions">
          <button type="button" className="ui-btn" disabled={disabled} onClick={close}>취소</button>
          <button type="submit" className="ui-btn primary" disabled={disabled}>{disabled ? '저장 중…' : '목표 저장'}</button>
        </footer>
      </form>
    </Modal>
  );
}
