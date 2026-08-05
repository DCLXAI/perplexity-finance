import { useEffect, useState } from 'react';
import { apiFetch } from '@/live/apiClient';
import type {
  MonitorRule,
  MonitorRuleKind,
  MonitorRuleMutationResponse,
  MonitorRulesResponse,
  ScenarioTargetType,
} from '@/shared/api';

interface MonitorRuleEditorProps {
  readonly portfolioId: string;
  readonly thesisId?: string;
  readonly symbol?: string;
  readonly allowedKinds: readonly MonitorRuleKind[];
  readonly accessToken?: string;
}

type ThesisCondition =
  | 'price_below'
  | 'price_above'
  | 'drawdown_from_entry_pct'
  | 'weight_above_pct'
  | 'no_verified_price_days';

type RiskMetricKey =
  | 'annualizedVolatilityPct'
  | 'historicalVar95Pct'
  | 'historicalCvar95Pct'
  | 'maxDrawdownPct'
  | 'concentrationHhi'
  | 'topHoldingPct';

interface ThesisDraft {
  readonly condition: ThesisCondition;
  readonly symbol: string;
  readonly value: string;
}
interface RiskDraft {
  readonly metric: RiskMetricKey;
  readonly comparison: 'above' | 'below';
  readonly value: string;
}
interface ShockDraft {
  readonly id: string;
  readonly targetType: ScenarioTargetType;
  readonly target: string;
  readonly changePct: string;
}
interface StressDraft {
  readonly shocks: readonly ShockDraft[];
  readonly maxProjectedLossPct: string;
}

const THESIS_CONDITIONS: readonly ThesisCondition[] = Object.freeze([
  'price_below',
  'price_above',
  'drawdown_from_entry_pct',
  'weight_above_pct',
  'no_verified_price_days',
]);
const RISK_METRICS: readonly RiskMetricKey[] = Object.freeze([
  'annualizedVolatilityPct',
  'historicalVar95Pct',
  'historicalCvar95Pct',
  'maxDrawdownPct',
  'concentrationHhi',
  'topHoldingPct',
]);

const KIND_LABEL: Readonly<Record<MonitorRuleKind, string>> = Object.freeze({
  thesis_invalidation: '논지 무효화 조건',
  risk_threshold: '리스크 임계치',
  stress_scenario: '스트레스 시나리오 손실',
});
const CONDITION_LABEL: Readonly<Record<ThesisCondition, string>> = Object.freeze({
  price_below: '가격이 아래로 하회',
  price_above: '가격이 위로 상회',
  drawdown_from_entry_pct: '진입가 대비 낙폭 초과',
  weight_above_pct: '포트폴리오 비중 초과',
  no_verified_price_days: '검증 시세 미확인 일수 초과',
});
const CONDITION_VALUE_LABEL: Readonly<Record<ThesisCondition, string>> = Object.freeze({
  price_below: '기준 가격 · USD',
  price_above: '기준 가격 · USD',
  drawdown_from_entry_pct: '낙폭 임계치 · %',
  weight_above_pct: '비중 임계치 · %',
  no_verified_price_days: '일수',
});
const RISK_METRIC_LABEL: Readonly<Record<RiskMetricKey, string>> = Object.freeze({
  annualizedVolatilityPct: '연환산 변동성 · %',
  historicalVar95Pct: '95% VaR · %',
  historicalCvar95Pct: '95% CVaR · %',
  maxDrawdownPct: '최대 낙폭 · %',
  concentrationHhi: '집중도 · HHI',
  topHoldingPct: '최대 종목 비중 · %',
});
const STATE_LABEL: Readonly<Record<MonitorRule['state'], string>> = Object.freeze({
  armed: '감시 중',
  latched: '경보 발동 · 재확인 필요',
});

function isThesisCondition(value: unknown): value is ThesisCondition {
  return typeof value === 'string' && (THESIS_CONDITIONS as readonly string[]).includes(value);
}
function isRiskMetric(value: unknown): value is RiskMetricKey {
  return typeof value === 'string' && (RISK_METRICS as readonly string[]).includes(value);
}
function isScenarioTargetType(value: unknown): value is ScenarioTargetType {
  return value === 'all' || value === 'symbol' || value === 'sector' || value === 'asset-kind';
}

function ruleId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `monitor-${Date.now()}-${Math.random()}`;
}
function defaultIntervalHours(kind: MonitorRuleKind): number {
  return kind === 'stress_scenario' ? 168 : 24;
}
function defaultThesisDraft(symbol?: string): ThesisDraft {
  return { condition: 'price_below', symbol: symbol?.trim().toUpperCase() ?? '', value: '' };
}
function defaultRiskDraft(): RiskDraft {
  return { metric: 'annualizedVolatilityPct', comparison: 'above', value: '' };
}
function defaultStressDraft(): StressDraft {
  return { shocks: [{ id: ruleId(), targetType: 'all', target: '*', changePct: '-15' }], maxProjectedLossPct: '10' };
}

function describeRule(rule: MonitorRule): string {
  const spec = rule.spec;
  if (rule.kind === 'thesis_invalidation') {
    const condition = isThesisCondition(spec.condition) ? spec.condition : null;
    const symbol = typeof spec.symbol === 'string' ? spec.symbol : rule.symbol ?? '심볼 미지정';
    const value = typeof spec.value === 'number' ? spec.value : null;
    return `${symbol} · ${condition ? CONDITION_LABEL[condition] : '조건 미지정'}${value !== null ? ` ${value}` : ''}`;
  }
  if (rule.kind === 'risk_threshold') {
    const metric = isRiskMetric(spec.metric) ? spec.metric : null;
    const comparison = spec.comparison === 'below' ? '미만' : '초과';
    const value = typeof spec.value === 'number' ? spec.value : null;
    return `${metric ? RISK_METRIC_LABEL[metric] : '지표 미지정'} ${value ?? '?'} ${comparison}`;
  }
  const shockCount = Array.isArray(spec.shocks) ? spec.shocks.length : 0;
  const maxLoss = typeof spec.maxProjectedLossPct === 'number' ? spec.maxProjectedLossPct : null;
  return `충격 시나리오 ${shockCount}건 · 예상 손실 ${maxLoss ?? '?'}% 초과 시`;
}

export default function MonitorRuleEditor({ portfolioId, thesisId, symbol, allowedKinds, accessToken }: MonitorRuleEditorProps) {
  const [rules, setRules] = useState<readonly MonitorRule[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [kind, setKind] = useState<MonitorRuleKind>(allowedKinds[0]);
  const [enabled, setEnabled] = useState(true);
  const [minIntervalHours, setMinIntervalHours] = useState(String(defaultIntervalHours(allowedKinds[0])));
  const [thesisDraft, setThesisDraft] = useState<ThesisDraft>(() => defaultThesisDraft(symbol));
  const [riskDraft, setRiskDraft] = useState<RiskDraft>(defaultRiskDraft);
  const [stressDraft, setStressDraft] = useState<StressDraft>(defaultStressDraft);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!accessToken) {
      setRules([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingList(true);
    setListError('');
    apiFetch<MonitorRulesResponse>(`/api/portfolio/monitor-rules?portfolioId=${encodeURIComponent(portfolioId)}`, {}, accessToken)
      .then((response) => { if (!cancelled) setRules(response.rules); })
      .catch((cause: unknown) => {
        if (!cancelled) setListError(cause instanceof Error ? cause.message : '감시 규칙을 불러오지 못했습니다.');
      })
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [accessToken, portfolioId]);

  const resetForm = () => {
    setEditingRuleId(null);
    setKind(allowedKinds[0]);
    setEnabled(true);
    setMinIntervalHours(String(defaultIntervalHours(allowedKinds[0])));
    setThesisDraft(defaultThesisDraft(symbol));
    setRiskDraft(defaultRiskDraft());
    setStressDraft(defaultStressDraft());
    setFormError('');
  };

  const changeKind = (nextKind: MonitorRuleKind) => {
    setKind(nextKind);
    if (!editingRuleId) setMinIntervalHours(String(defaultIntervalHours(nextKind)));
  };

  const loadForEdit = (rule: MonitorRule) => {
    setEditingRuleId(rule.id);
    setKind(rule.kind);
    setEnabled(rule.enabled);
    setMinIntervalHours(String(rule.minIntervalHours));
    setFormError('');
    const spec = rule.spec;
    if (rule.kind === 'thesis_invalidation') {
      setThesisDraft({
        condition: isThesisCondition(spec.condition) ? spec.condition : 'price_below',
        symbol: typeof spec.symbol === 'string' ? spec.symbol : rule.symbol ?? '',
        value: typeof spec.value === 'number' ? String(spec.value) : '',
      });
    } else if (rule.kind === 'risk_threshold') {
      setRiskDraft({
        metric: isRiskMetric(spec.metric) ? spec.metric : 'annualizedVolatilityPct',
        comparison: spec.comparison === 'below' ? 'below' : 'above',
        value: typeof spec.value === 'number' ? String(spec.value) : '',
      });
    } else {
      const rawShocks = Array.isArray(spec.shocks) ? spec.shocks : [];
      const shocks = rawShocks.map((entry) => {
        const record = entry as Record<string, unknown>;
        return {
          id: ruleId(),
          targetType: isScenarioTargetType(record.targetType) ? record.targetType : 'all',
          target: typeof record.target === 'string' ? record.target : '*',
          changePct: typeof record.changePct === 'number' ? String(record.changePct) : '0',
        };
      });
      setStressDraft({
        shocks: shocks.length > 0 ? shocks : defaultStressDraft().shocks,
        maxProjectedLossPct: typeof spec.maxProjectedLossPct === 'number' ? String(spec.maxProjectedLossPct) : '',
      });
    }
  };

  const updateShock = (shockId: string, patch: Partial<Pick<ShockDraft, 'targetType' | 'target' | 'changePct'>>) => {
    setStressDraft((current) => ({
      ...current,
      shocks: current.shocks.map((shock) => shock.id === shockId ? { ...shock, ...patch } : shock),
    }));
  };
  const addShock = () => {
    setStressDraft((current) => current.shocks.length >= 20 ? current : {
      ...current,
      shocks: [...current.shocks, { id: ruleId(), targetType: 'all', target: '*', changePct: '-15' }],
    });
  };
  const removeShock = (shockId: string) => {
    setStressDraft((current) => current.shocks.length <= 1 ? current : {
      ...current,
      shocks: current.shocks.filter((shock) => shock.id !== shockId),
    });
  };

  const removeRule = async (rule: MonitorRule) => {
    if (!accessToken) return;
    if (!window.confirm('이 감시 규칙을 삭제할까요? 삭제하면 더 이상 평가되지 않고 알림도 보내지 않습니다.')) return;
    setBusy(true);
    setListError('');
    try {
      await apiFetch('/api/portfolio/monitor-rules', {
        method: 'DELETE',
        body: JSON.stringify({ ruleId: rule.id }),
      }, accessToken);
      setRules((current) => current.filter((entry) => entry.id !== rule.id));
      if (editingRuleId === rule.id) resetForm();
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : '감시 규칙을 삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!accessToken) return;
    setFormError('');
    let spec: Record<string, unknown>;
    if (kind === 'thesis_invalidation') {
      const draftSymbol = thesisDraft.symbol.trim().toUpperCase();
      const value = Number(thesisDraft.value);
      if (!draftSymbol || draftSymbol.length > 20 || !/^[A-Za-z0-9.:-]+$/.test(draftSymbol)) {
        setFormError('심볼 형식을 확인하세요 (영문·숫자·.:- 조합, 최대 20자).');
        return;
      }
      if (!Number.isFinite(value)) {
        setFormError('조건 값을 입력하세요.');
        return;
      }
      if ((thesisDraft.condition === 'price_below' || thesisDraft.condition === 'price_above') && value <= 0) {
        setFormError('기준 가격은 0보다 커야 합니다.');
        return;
      }
      if ((thesisDraft.condition === 'drawdown_from_entry_pct' || thesisDraft.condition === 'weight_above_pct') && (value < 0 || value > 1000)) {
        setFormError('비율 임계치는 0~1000 사이여야 합니다.');
        return;
      }
      if (thesisDraft.condition === 'no_verified_price_days' && (!Number.isInteger(value) || value < 1 || value > 365)) {
        setFormError('일수는 1~365 사이 정수여야 합니다.');
        return;
      }
      spec = { condition: thesisDraft.condition, symbol: draftSymbol, value };
    } else if (kind === 'risk_threshold') {
      const value = Number(riskDraft.value);
      if (!Number.isFinite(value) || value < -1000 || value > 1000) {
        setFormError('임계값은 -1000~1000 사이여야 합니다.');
        return;
      }
      spec = { metric: riskDraft.metric, comparison: riskDraft.comparison, value };
    } else {
      if (stressDraft.shocks.length === 0 || stressDraft.shocks.length > 20) {
        setFormError('충격 시나리오는 1~20개여야 합니다.');
        return;
      }
      const shocks: Record<string, unknown>[] = [];
      for (const shock of stressDraft.shocks) {
        const target = shock.target.trim();
        const changePct = Number(shock.changePct);
        if (!target || target.length > 40 || !Number.isFinite(changePct) || changePct < -100 || changePct > 1000) {
          setFormError('충격 시나리오의 대상과 변화율을 확인하세요.');
          return;
        }
        shocks.push({ targetType: shock.targetType, target, changePct });
      }
      const maxProjectedLossPct = Number(stressDraft.maxProjectedLossPct);
      if (!Number.isFinite(maxProjectedLossPct) || maxProjectedLossPct < 0 || maxProjectedLossPct > 1000) {
        setFormError('최대 허용 손실은 0~1000 사이여야 합니다.');
        return;
      }
      spec = { shocks, maxProjectedLossPct };
    }
    const parsedInterval = Number(minIntervalHours);
    if (!Number.isInteger(parsedInterval) || parsedInterval < 1 || parsedInterval > 8760) {
      setFormError('최소 재평가 간격은 1~8760시간 사이 정수여야 합니다.');
      return;
    }
    setBusy(true);
    try {
      const body = {
        portfolioId,
        thesisId: thesisId ?? null,
        kind,
        spec,
        enabled,
        minIntervalHours: parsedInterval,
        ...(editingRuleId ? { ruleId: editingRuleId } : {}),
      };
      const response = await apiFetch<MonitorRuleMutationResponse>('/api/portfolio/monitor-rules', {
        method: editingRuleId ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      }, accessToken);
      setRules((current) => [response.rule, ...current.filter((entry) => entry.id !== response.rule.id)]);
      resetForm();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '감시 규칙을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) {
    return (
      <fieldset className="pf-monitor-editor">
        <legend>감시 규칙</legend>
        <div className="pf-workflow-demo" role="note">
          <strong>로그인하면 감시 규칙을 설정할 수 있습니다.</strong>
          <span>규칙이 위반으로 전환되면 정기 점검에서 한 번만 알림을 보냅니다. 자동으로 주문을 실행하지 않습니다.</span>
        </div>
      </fieldset>
    );
  }

  const normalizedSymbol = symbol?.trim().toUpperCase();
  const visibleRules = rules.filter((rule) => allowedKinds.includes(rule.kind) && (!normalizedSymbol || rule.symbol === normalizedSymbol));
  const isThesisOnly = allowedKinds.length === 1 && allowedKinds[0] === 'thesis_invalidation';

  return (
    <fieldset className="pf-monitor-editor" aria-busy={busy}>
      <legend>감시 규칙</legend>
      <p className="pf-monitor-copy">
        {isThesisOnly
          ? '위 무효화 조건은 사람이 읽는 기록입니다. 아래 규칙을 등록해야 실제로 조건을 감시하고 위반 시 한 번만 알림을 보냅니다.'
          : '리스크 지표와 스트레스 시나리오 예상 손실을 감시합니다. 임계치를 넘으면 다음 정기 점검 때 알림만 전송되며 자동으로 주문을 실행하지 않습니다.'}
      </p>

      {listError && <p className="pf-form-error" role="alert">{listError}</p>}
      {loadingList && visibleRules.length === 0 && <p className="pf-empty">감시 규칙을 불러오고 있습니다.</p>}

      {visibleRules.length > 0 && (
        <ul className="pf-monitor-rule-list">
          {visibleRules.map((rule) => (
            <li key={rule.id}>
              <div>
                <strong>{describeRule(rule)}</strong>
                <div className="pf-monitor-badges">
                  <span className={`pf-monitor-state ${rule.state}`}>{STATE_LABEL[rule.state]}</span>
                  <span className={`pf-monitor-enabled ${rule.enabled ? 'on' : 'off'}`}>{rule.enabled ? '사용 중' : '사용 안 함'}</span>
                </div>
              </div>
              <div className="pf-monitor-rule-actions">
                <button type="button" className="ui-btn ghost" disabled={busy} onClick={() => loadForEdit(rule)}>수정</button>
                <button type="button" className="ui-btn ghost" disabled={busy} onClick={() => void removeRule(rule)}>삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!loadingList && visibleRules.length === 0 && !listError && (
        <p className="pf-empty">등록된 감시 규칙이 없습니다. 아래에서 추가하세요.</p>
      )}

      <div className="pf-monitor-form">
        {allowedKinds.length > 1 && (
          <label>
            <span>규칙 종류</span>
            <select
              value={kind}
              disabled={Boolean(editingRuleId)}
              onChange={(event) => changeKind(event.target.value as MonitorRuleKind)}
            >
              {allowedKinds.map((candidate) => <option key={candidate} value={candidate}>{KIND_LABEL[candidate]}</option>)}
            </select>
          </label>
        )}

        {kind === 'thesis_invalidation' && (
          <div className="pf-monitor-field-grid">
            <label>
              <span>심볼</span>
              <input
                required
                maxLength={20}
                value={thesisDraft.symbol}
                onChange={(event) => setThesisDraft((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))}
              />
            </label>
            <label>
              <span>조건</span>
              <select
                value={thesisDraft.condition}
                onChange={(event) => setThesisDraft((current) => ({ ...current, condition: event.target.value as ThesisCondition }))}
              >
                {THESIS_CONDITIONS.map((condition) => <option key={condition} value={condition}>{CONDITION_LABEL[condition]}</option>)}
              </select>
            </label>
            <label>
              <span>{CONDITION_VALUE_LABEL[thesisDraft.condition]}</span>
              <input
                type="number"
                required
                step="any"
                value={thesisDraft.value}
                onChange={(event) => setThesisDraft((current) => ({ ...current, value: event.target.value }))}
              />
            </label>
          </div>
        )}

        {kind === 'risk_threshold' && (
          <div className="pf-monitor-field-grid">
            <label>
              <span>지표</span>
              <select
                value={riskDraft.metric}
                onChange={(event) => setRiskDraft((current) => ({ ...current, metric: event.target.value as RiskMetricKey }))}
              >
                {RISK_METRICS.map((metric) => <option key={metric} value={metric}>{RISK_METRIC_LABEL[metric]}</option>)}
              </select>
            </label>
            <label>
              <span>비교</span>
              <select
                value={riskDraft.comparison}
                onChange={(event) => setRiskDraft((current) => ({ ...current, comparison: event.target.value as 'above' | 'below' }))}
              >
                <option value="above">초과</option>
                <option value="below">미만</option>
              </select>
            </label>
            <label>
              <span>임계값</span>
              <input
                type="number"
                required
                step="any"
                value={riskDraft.value}
                onChange={(event) => setRiskDraft((current) => ({ ...current, value: event.target.value }))}
              />
            </label>
          </div>
        )}

        {kind === 'stress_scenario' && (
          <div className="pf-monitor-shock-editor">
            {stressDraft.shocks.map((shock) => (
              <div className="pf-monitor-shock-row" key={shock.id}>
                <select
                  value={shock.targetType}
                  onChange={(event) => {
                    const targetType = event.target.value as ScenarioTargetType;
                    updateShock(shock.id, { targetType, target: targetType === 'all' ? '*' : shock.target === '*' ? '' : shock.target });
                  }}
                >
                  <option value="all">전체</option>
                  <option value="symbol">개별 심볼</option>
                  <option value="sector">섹터</option>
                  <option value="asset-kind">자산 종류</option>
                </select>
                <input
                  disabled={shock.targetType === 'all'}
                  maxLength={40}
                  placeholder="예: AAPL"
                  value={shock.target}
                  onChange={(event) => updateShock(shock.id, { target: event.target.value })}
                />
                <input
                  type="number"
                  required
                  step="0.1"
                  value={shock.changePct}
                  onChange={(event) => updateShock(shock.id, { changePct: event.target.value })}
                />
                <span aria-hidden="true">%</span>
                <button type="button" className="ui-btn ghost" disabled={stressDraft.shocks.length === 1} onClick={() => removeShock(shock.id)}>삭제</button>
              </div>
            ))}
            <button type="button" className="ui-btn ghost pf-monitor-add-shock" disabled={stressDraft.shocks.length >= 20} onClick={addShock}>+ 충격 추가</button>
            <label>
              <span>최대 허용 손실 · %</span>
              <input
                type="number"
                min="0"
                max="1000"
                required
                step="0.1"
                value={stressDraft.maxProjectedLossPct}
                onChange={(event) => setStressDraft((current) => ({ ...current, maxProjectedLossPct: event.target.value }))}
              />
            </label>
          </div>
        )}

        <div className="pf-monitor-settings-row">
          <label className="pf-monitor-checkbox">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>규칙 사용</span>
          </label>
          <label>
            <span>최소 재평가 간격 · 시간</span>
            <input type="number" min="1" max="8760" required value={minIntervalHours} onChange={(event) => setMinIntervalHours(event.target.value)} />
          </label>
        </div>

        {formError && <p className="pf-form-error" role="alert">{formError}</p>}
        <div className="pf-monitor-form-actions">
          {editingRuleId && <button type="button" className="ui-btn ghost" disabled={busy} onClick={resetForm}>새 규칙으로 전환</button>}
          <button type="button" className="ui-btn primary" disabled={busy} onClick={() => void submit()}>
            {busy ? '저장 중…' : editingRuleId ? '규칙 저장' : '규칙 추가'}
          </button>
        </div>
      </div>
    </fieldset>
  );
}
