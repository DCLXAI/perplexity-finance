/* ============================================================
   앱 갤러리 — 금융 미니앱 카드 그리드 + 카테고리 필터
   ============================================================ */
import { useMemo, useState } from 'react';
import { APP_GALLERY } from '@/data/content';
import { Card, ChipTabs } from '@/components/ui';
import './apps.css';

const ALL = '전체';

export default function AppsPage() {
  const [cat, setCat] = useState(ALL);

  const tabs = useMemo(() => {
    const cats = Array.from(new Set(APP_GALLERY.map((a) => a.category)));
    return [ALL, ...cats].map((c) => ({ key: c, label: c }));
  }, []);

  const apps = cat === ALL ? APP_GALLERY : APP_GALLERY.filter((a) => a.category === cat);

  return (
    <div className="page ap-page fade-in-up">
      <div className="ap-head">
        <h1 className="ap-title">앱 갤러리</h1>
        <div className="ap-sub muted">금융 워크플로를 제안하는 제품 콘셉트 카드 · 기능 미연결</div>
      </div>

      <ChipTabs items={tabs} value={cat} onChange={setCat} className="ap-tabs" />

      <div className="ap-grid">
        {apps.map((app) => (
          <Card key={app.id} className="ap-card">
            <div className="ap-icon" aria-hidden>
              {app.icon}
            </div>
            <div className="ap-name">{app.nameKo}</div>
            <div className="ap-desc">{app.description}</div>
            <div className="ap-foot">
              <span className="ap-cat">{app.category}</span>
              <span className="ap-open ap-soon" aria-label="준비 중">
                준비 중
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
