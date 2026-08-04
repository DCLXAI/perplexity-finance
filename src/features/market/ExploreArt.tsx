/* ============================================================
   둘러보기 카드용 인라인 SVG 라인아트 (흰색 스트로크, 0.5 투명도)
   ============================================================ */
import type { ReactNode } from 'react';
import type { ExploreCard } from '@/data/types';

type ArtId = ExploreCard['art'];

function Dot({ x, y, r = 2.4 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill="#fff" fillOpacity={0.55} stroke="none" />;
}

const SCENES: Record<ArtId, ReactNode> = {
  /* 반도체 클린룸 / 노광 장비 */
  fab: (
    <>
      <line x1="10" y1="128" x2="250" y2="128" />
      <rect x="28" y="62" width="74" height="66" rx="3" />
      <rect x="42" y="44" width="46" height="18" rx="2" />
      <circle cx="65" cy="95" r="13" />
      <circle cx="65" cy="95" r="5" />
      <line x1="102" y1="86" x2="128" y2="86" />
      <rect x="128" y="70" width="52" height="58" rx="3" />
      <line x1="136" y1="82" x2="172" y2="82" />
      <line x1="136" y1="94" x2="172" y2="94" />
      <line x1="20" y1="24" x2="240" y2="24" />
      <line x1="150" y1="24" x2="150" y2="40" />
      <rect x="142" y="40" width="16" height="14" rx="2" />
      <line x1="210" y1="24" x2="210" y2="52" />
      <rect x="200" y="52" width="20" height="16" rx="2" />
      <rect x="196" y="96" width="34" height="32" rx="2" />
    </>
  ),
  /* 정유 타워 + 파이프 */
  refinery: (
    <>
      <line x1="8" y1="130" x2="252" y2="130" />
      <rect x="36" y="34" width="20" height="96" rx="8" />
      <line x1="36" y1="58" x2="56" y2="58" />
      <line x1="36" y1="82" x2="56" y2="82" />
      <line x1="36" y1="106" x2="56" y2="106" />
      <rect x="78" y="62" width="14" height="68" rx="6" />
      <line x1="56" y1="46" x2="130" y2="46" />
      <line x1="130" y1="46" x2="130" y2="130" />
      <line x1="92" y1="90" x2="170" y2="90" />
      <line x1="170" y1="90" x2="170" y2="130" />
      <path d="M148 130 v-14 a18 18 0 0 1 36 0 v14" />
      <path d="M194 130 v-11 a15 15 0 0 1 30 0 v11" />
      <line x1="236" y1="108" x2="236" y2="40" />
      <path d="M236 40 q-6 -10 0 -18 q6 8 0 18" />
    </>
  ),
  /* IMF — 페디먼트 신전 */
  imf: (
    <>
      <line x1="14" y1="128" x2="246" y2="128" />
      <path d="M46 58 L130 28 L214 58 Z" />
      <circle cx="130" cy="46" r="7" />
      <line x1="52" y1="66" x2="208" y2="66" />
      <line x1="62" y1="74" x2="62" y2="112" />
      <line x1="89" y1="74" x2="89" y2="112" />
      <line x1="116" y1="74" x2="116" y2="112" />
      <line x1="143" y1="74" x2="143" y2="112" />
      <line x1="170" y1="74" x2="170" y2="112" />
      <line x1="197" y1="74" x2="197" y2="112" />
      <line x1="54" y1="118" x2="206" y2="118" />
      <line x1="46" y1="123" x2="214" y2="123" />
    </>
  ),
  /* 반도체 칩 + 회로 배선 */
  chips: (
    <>
      <rect x="104" y="56" width="52" height="42" rx="4" />
      <rect x="114" y="66" width="32" height="22" rx="2" />
      <path d="M104 64 H74 V40 H44" />
      <Dot x={44} y={40} />
      <path d="M104 78 H62" />
      <Dot x={62} y={78} />
      <path d="M104 90 H78 V116 H50" />
      <Dot x={50} y={116} />
      <path d="M156 64 H188 V36 H218" />
      <Dot x={218} y={36} />
      <path d="M156 78 H200" />
      <Dot x={200} y={78} />
      <path d="M156 90 H186 V118 H214" />
      <Dot x={214} y={118} />
      <path d="M120 56 V30" />
      <Dot x={120} y={30} />
      <path d="M140 56 V38" />
      <Dot x={140} y={38} />
      <path d="M120 98 V124" />
      <Dot x={120} y={124} />
      <path d="M140 98 V116" />
      <Dot x={140} y={116} />
    </>
  ),
  /* 대형 은행 — 고전 양식 파사드 */
  bank: (
    <>
      <line x1="10" y1="130" x2="250" y2="130" />
      <path d="M46 34 L130 18 L214 34" />
      <rect x="52" y="34" width="156" height="14" rx="2" />
      <line x1="66" y1="48" x2="66" y2="106" />
      <line x1="98" y1="48" x2="98" y2="106" />
      <line x1="130" y1="48" x2="130" y2="66" />
      <line x1="162" y1="48" x2="162" y2="106" />
      <line x1="194" y1="48" x2="194" y2="106" />
      <rect x="112" y="70" width="36" height="36" />
      <line x1="130" y1="70" x2="130" y2="106" />
      <line x1="56" y1="112" x2="204" y2="112" />
      <line x1="48" y1="121" x2="212" y2="121" />
    </>
  ),
  /* 펌프잭 + 원거리 시추탑 */
  oil: (
    <>
      <line x1="8" y1="128" x2="252" y2="128" />
      <line x1="96" y1="58" x2="72" y2="128" />
      <line x1="96" y1="58" x2="120" y2="128" />
      <line x1="82" y1="100" x2="110" y2="100" />
      <line x1="52" y1="50" x2="148" y2="62" />
      <path d="M52 50 l-12 4 l2 14 l12 -6 Z" />
      <circle cx="158" cy="92" r="13" />
      <line x1="148" y1="62" x2="158" y2="92" />
      <line x1="158" y1="105" x2="158" y2="128" />
      <line x1="44" y1="68" x2="44" y2="120" />
      <rect x="36" y="112" width="16" height="16" />
      <path d="M210 128 L222 78 L234 128" />
      <line x1="214" y1="112" x2="230" y2="112" />
      <line x1="217" y1="96" x2="227" y2="96" />
    </>
  ),
  /* 주택 지붕들 */
  housing: (
    <>
      <line x1="6" y1="130" x2="254" y2="130" />
      <rect x="26" y="86" width="52" height="44" />
      <path d="M20 86 L52 62 L84 86" />
      <rect x="44" y="104" width="16" height="26" />
      <rect x="32" y="94" width="10" height="10" />
      <rect x="104" y="72" width="64" height="58" />
      <path d="M98 72 L136 44 L174 72" />
      <rect x="152" y="40" width="10" height="16" />
      <rect x="114" y="84" width="14" height="14" />
      <rect x="140" y="84" width="14" height="14" />
      <rect x="128" y="106" width="18" height="24" />
      <rect x="192" y="92" width="46" height="38" />
      <path d="M186 92 L215 70 L244 92" />
      <rect x="206" y="104" width="14" height="26" />
    </>
  ),
  /* 골드바 피라미드 */
  gold: (
    <>
      <line x1="30" y1="122" x2="230" y2="122" />
      <path d="M40 122 l7 -16 h44 l7 16 Z" />
      <path d="M104 122 l7 -16 h44 l7 16 Z" />
      <path d="M168 122 l7 -16 h44 l7 16 Z" />
      <path d="M74 106 l7 -16 h44 l7 16 Z" />
      <path d="M138 106 l7 -16 h44 l7 16 Z" />
      <path d="M106 90 l7 -16 h44 l7 16 Z" />
      <path d="M56 48 v12 M50 54 h12" />
      <path d="M198 38 v12 M192 44 h12" />
      <path d="M140 28 v8 M136 32 h8" />
    </>
  ),
  /* 위성 궤도 */
  satellite: (
    <>
      <circle cx="60" cy="128" r="52" />
      <path d="M22 108 q22 -10 44 0" />
      <path d="M10 70 Q130 10 250 70" />
      <path d="M24 100 Q130 48 236 100" />
      <rect x="160" y="30" width="18" height="14" rx="2" />
      <line x1="146" y1="37" x2="160" y2="37" />
      <rect x="128" y="31" width="18" height="12" />
      <line x1="178" y1="37" x2="192" y2="37" />
      <rect x="192" y="31" width="18" height="12" />
      <line x1="169" y1="30" x2="169" y2="20" />
      <Dot x={169} y={18} />
      <Dot x={30} y={26} r={1.6} />
      <Dot x={220} y={16} r={1.6} />
      <Dot x={240} y={52} r={1.6} />
    </>
  ),
  /* 송전탑 + 전력선 */
  grid: (
    <>
      <line x1="6" y1="130" x2="254" y2="130" />
      <line x1="58" y1="130" x2="70" y2="38" />
      <line x1="82" y1="130" x2="70" y2="38" />
      <line x1="50" y1="58" x2="90" y2="58" />
      <line x1="54" y1="78" x2="86" y2="78" />
      <line x1="62" y1="104" x2="78" y2="78" />
      <line x1="78" y1="104" x2="62" y2="78" />
      <line x1="178" y1="130" x2="190" y2="38" />
      <line x1="202" y1="130" x2="190" y2="38" />
      <line x1="170" y1="58" x2="210" y2="58" />
      <line x1="174" y1="78" x2="206" y2="78" />
      <line x1="182" y1="104" x2="198" y2="78" />
      <line x1="198" y1="104" x2="182" y2="78" />
      <path d="M50 58 Q120 88 170 58" />
      <path d="M90 58 Q150 88 210 58" />
      <path d="M54 78 Q130 106 174 78" />
    </>
  ),
};

export default function ExploreArt({ art }: { art: ArtId }) {
  return (
    <svg
      className="mkt-art"
      viewBox="0 0 260 150"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="#fff"
        strokeOpacity={0.5}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {SCENES[art]}
      </g>
    </svg>
  );
}
