import { Link, useLocation } from 'react-router';

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <section className="page not-found fade-in-up" aria-labelledby="not-found-title">
      <div className="not-found-code num" aria-hidden="true">404</div>
      <h1 id="not-found-title" className="not-found-title">페이지를 찾을 수 없습니다</h1>
      <p className="not-found-copy">
        요청한 경로 <code>{pathname}</code>가 존재하지 않거나 이동되었습니다.
      </p>
      <div className="not-found-actions">
        <Link className="ui-btn primary" to="/">미국 시장으로</Link>
        <Link className="ui-btn" to="/watchlist">관심목록 보기</Link>
      </div>
    </section>
  );
}
