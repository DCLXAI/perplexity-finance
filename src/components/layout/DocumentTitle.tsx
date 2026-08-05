/* ============================================================
   Route-aware document metadata and a polite route announcer.
   ============================================================ */
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { engine } from '@/data/engine';

interface RouteMetadata {
  readonly title: string;
  readonly description: string;
}

const METADATA: Readonly<Record<string, RouteMetadata>> = {
  '/': {
    title: '미국 시장',
    description: '출처·시각·검증 상태를 함께 제공하는 미국 주식 시장 대시보드입니다.',
  },
  '/crypto': {
    title: '암호화폐',
    description: '공급자 provenance와 명시적 폴백을 구분하는 암호화폐 시장 대시보드입니다.',
  },
  '/earnings': {
    title: '실적 일정',
    description: '제품 데모용 정적 기업 실적 일정과 예시 컨센서스를 제공합니다.',
  },
  '/predictions': {
    title: '예측시장 시뮬레이션',
    description: '실제 거래가 아닌 예측시장 형식의 로컬 시뮬레이션입니다.',
  },
  '/screener': {
    title: '주식 스크리너',
    description: '미국 주식 표본을 필터링하고 정렬하는 로컬 스크리너입니다.',
  },
  '/politicians': {
    title: '정치인 거래 예시',
    description: '실제 공시 피드가 아닌 제품 UI 검증용 정적 정치인 거래 예시입니다.',
  },
  '/watchlist': {
    title: '관심목록',
    description: '브라우저에 안전하게 저장되고 여러 탭에서 동기화되는 관심 종목 목록입니다.',
  },
  '/portfolio': {
    title: '포트폴리오 인텔리전스',
    description: '불변 거래 원장, 검증 시세, FIFO 손익, 리스크와 투자 논지를 연결합니다.',
  },
  '/apps': {
    title: '앱 갤러리',
    description: '향후 금융 도구 확장을 보여주는 제품 데모 갤러리입니다.',
  },
  '/status': {
    title: '시스템 상태',
    description: '시장 공급자, 배포 준비 조건과 런타임 기능 상태를 확인합니다.',
  },
  '/ops': {
    title: '운영 제어 콘솔',
    description: '운영자 전용 공급자 복원력, 데이터 품질, 백로그와 배포 승인 콘솔입니다.',
  },
};

function metadataForPath(pathname: string): RouteMetadata {
  const exact = METADATA[pathname];
  if (exact) return exact;

  if (pathname.startsWith('/stock/')) {
    const encoded = pathname.slice('/stock/'.length);
    let symbol = encoded;
    try {
      symbol = decodeURIComponent(encoded).toUpperCase();
    } catch {
      // Keep the encoded fallback for malformed URLs.
    }
    const quote = engine.getQuote(symbol);
    if (quote) {
      const name = quote.nameKo ?? quote.name;
      return {
        title: `${name} (${quote.symbol})`,
        description: `${name}의 출처가 표시된 시세, 히스토리 차트와 종목 정보를 보여줍니다.`,
      };
    }
    return {
      title: '자산을 찾을 수 없음',
      description: '요청한 자산 심볼이 로컬 표본 데이터에 없습니다.',
    };
  }

  return {
    title: '페이지를 찾을 수 없음',
    description: '요청한 경로가 존재하지 않습니다.',
  };
}

function upsertMetaDescription(content: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.append(meta);
  }
  meta.content = content;
}

export default function DocumentTitle() {
  const { pathname } = useLocation();
  const metadata = metadataForPath(pathname);

  useEffect(() => {
    document.title = `${metadata.title} | Synapsu`;
    upsertMetaDescription(metadata.description);
  }, [metadata.description, metadata.title]);

  return (
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {metadata.title} 페이지
    </span>
  );
}
