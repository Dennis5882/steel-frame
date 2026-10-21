// 출처: StruXureAI src/utils/drawingScale.ts (2026-10-21 복사). 바꾼 것: 입력을 dxf-parser 객체 대신 dxfRead.ts CadEntity 로 받는다.
//   판정 규칙·상수는 그대로다. 규칙을 고치면 StruXureAI 에도 반영할지 기록한다.
// ── 도면 축척 자동 캘리브레이션 ────────────────────────────────
// 문제: 도면이 실제 치수의 N배로 그려져 있고 치수는 DIMLFAC(치수 선형축척)로
//       참값을 표시하는 경우가 있다. 실제 사례(1#2#结构图.dwg): 기하가 참값의 2배.
//       → 이걸 모르면 절점 좌표·스팬·단면이 전부 N배인 모델이 MIDAS로 넘어간다.
//
// 원리: 치수문자는 자기가 재는 구간의 '중점'에 놓인다. 따라서 한 치수체인에서
//       인접한 두 치수문자 사이의 실제 거리는 참값 기준 (v1+v2)/2 여야 한다.
//         k = 실제거리 / ((v1+v2)/2)  =  기하 ÷ 참값
//       k=1이면 도면이 1:1(mm), k=2면 2배로 그려진 것.
//
// ⚠️ 한 파일에 축척이 다른 도면이 섞여 있을 수 있다(1#2#: 대부분 2×, y≈-165k에 1× 한 장).
//    → 반드시 활성 영역(크롭)으로 범위를 좁혀서 판정할 것.
import type { CadEntity } from './dxfRead'

export interface ScaleDetection {
  factor: number;      // 기하 ÷ 참값 (2 = 도면이 2배로 그려짐 → 월드 mm는 ÷2)
  confidence: number;  // 0~1 — factor에 동의한 치수체인 비율
  chains: number;      // 판정에 쓴 치수체인 수
  agree: number;       // 그중 factor에 동의한 수
  pairs: number;       // 총 인접쌍 수(근거 규모)
}

export interface ScaleBox { minX: number; minY: number; maxX: number; maxY: number }

// 도면에서 실제로 쓰이는 축척. 이 목록 밖 값은 '측정 잡음'으로 보고 보정하지 않는다.
const NICE = [1, 2, 2.5, 4, 5, 10];
const SNAP_TOL = 0.03;   // 3% 안이면 그 값으로 스냅
const AGREE_TOL = 0.03;  // 체인이 factor에 '동의'한다고 볼 오차
const MIN_PAIRS = 6;     // 근거 규모(인접쌍) 최소치 — 체인 수보다 이게 실질 근거다
const MIN_CONF = 0.6;

const median = (a: number[]): number => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };

interface NumText { v: number; x: number; y: number }

/** 치수문자 후보 = 순수 숫자 TEXT/MTEXT (100~30000 = 건축 치수 범위) */
const collectNumTexts = (entities: CadEntity[], box?: ScaleBox): NumText[] => {
  const out: NumText[] = [];
  for (const e of entities) {
    if (e.type !== 'TEXT') continue;
    const p = e.p;
    if (box && (p.x < box.minX || p.x > box.maxX || p.y < box.minY || p.y > box.maxY)) continue;
    const s = e.text.trim();
    if (!/^\d{2,5}$/.test(s)) continue;
    const v = +s;
    if (v < 100 || v > 30000) continue;
    out.push({ v, x: p.x, y: p.y });
  }
  return out;
};

/** 같은 행(가로체인)/열(세로체인)로 묶어 각 체인의 k 중앙값을 낸다. */
const chainFactors = (nums: NumText[]): { k: number; pairs: number }[] => {
  const chains: { k: number; pairs: number }[] = [];
  const build = (key: (n: NumText) => number, pos: (n: NumText) => number) => {
    const groups = new Map<number, NumText[]>();
    for (const n of nums) {
      const g = Math.round(key(n) / 30); // ±30 단위 = 같은 치수줄
      const arr = groups.get(g);
      if (arr) arr.push(n); else groups.set(g, [n]);
    }
    for (const g of groups.values()) {
      if (g.length < 4) continue;
      g.sort((a, b) => pos(a) - pos(b));
      const ks: number[] = [];
      for (let i = 1; i < g.length; i++) {
        const d = Math.abs(pos(g[i]) - pos(g[i - 1]));
        const exp = (g[i - 1].v + g[i].v) / 2;
        if (exp < 100 || d < 50) continue;
        const k = d / exp;
        if (k < 0.3 || k > 12) continue; // 체인이 아님(다른 도면의 숫자) → 버림
        ks.push(k);
      }
      if (ks.length < 3) continue;
      const m = median(ks);
      // 체인 내부 일관성: 중앙값에 80% 이상 동의해야 진짜 치수체인
      if (ks.filter((k) => Math.abs(k / m - 1) < AGREE_TOL).length / ks.length < 0.8) continue;
      chains.push({ k: m, pairs: ks.length });
    }
  };
  build((n) => n.y, (n) => n.x); // 가로 치수체인
  build((n) => n.x, (n) => n.y); // 세로 치수체인
  return chains;
};

export interface ScaleAnalysis extends ScaleDetection {
  raw: number;              // 스냅 전 가중 중앙값
  reject?: 'few-chains' | 'not-nice' | 'low-confidence'; // 왜 보정하지 않는가
  hist: [string, number][]; // k 분포(0.05 단위) — UI 근거 표시/진단용
}

/** 진단까지 포함한 전체 분석. UI 근거 표시와 테스트에 쓴다. */
export const analyzeDrawingScale = (entities: CadEntity[], box?: ScaleBox): ScaleAnalysis | null => {
  const chains = chainFactors(collectNumTexts(entities, box));
  const histMap: Record<string, number> = {};
  for (const c of chains) { const k = (Math.round(c.k * 20) / 20).toFixed(2); histMap[k] = (histMap[k] || 0) + 1; }
  const hist = Object.entries(histMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const pairs = chains.reduce((s, c) => s + c.pairs, 0);
  const base = { chains: chains.length, pairs, hist };
  if (!chains.length || pairs < MIN_PAIRS) return { ...base, factor: 1, confidence: 0, agree: 0, raw: 0, reject: 'few-chains' };

  // 큰 체인일수록 신뢰 → 쌍 개수로 가중한 중앙값
  const weighted: number[] = [];
  for (const c of chains) for (let i = 0; i < Math.min(c.pairs, 50); i++) weighted.push(c.k);
  const raw = median(weighted);

  const snapped = NICE.find((n) => Math.abs(raw / n - 1) < SNAP_TOL);
  if (!snapped) return { ...base, factor: 1, confidence: 0, agree: 0, raw, reject: 'not-nice' };

  // 신뢰도는 '체인 수'가 아니라 '쌍 수'로 가중한다.
  // 우연히 한 줄에 늘어선 숫자들도 체인 1표를 갖지만 쌍은 3~4개뿐인 반면,
  // 진짜 치수체인은 수십 쌍이다. 체인 수로 세면 잡음 롱테일이 진짜 근거를 희석한다.
  const ok = chains.filter((c) => Math.abs(c.k / snapped - 1) < AGREE_TOL);
  const agree = ok.length;
  const confidence = +(ok.reduce((s, c) => s + c.pairs, 0) / pairs).toFixed(2);
  const out: ScaleAnalysis = { ...base, factor: snapped, confidence, agree, raw };
  if (confidence < MIN_CONF) out.reject = 'low-confidence'; // 축척이 섞여 있음 → 함부로 보정하면 위험
  return out;
};

/**
 * 치수문자 체인으로 '기하 ÷ 참값' 배율을 추정한다.
 * 근거가 약하거나(체인 부족/불일치) 흔한 축척이 아니면 null → 호출측은 보정하지 않는다.
 */
export const detectDrawingScale = (entities: CadEntity[], box?: ScaleBox): ScaleDetection | null => {
  const a = analyzeDrawingScale(entities, box);
  if (!a || a.reject) return null;
  const { factor, confidence, chains, agree, pairs } = a;
  return { factor, confidence, chains, agree, pairs };
};
