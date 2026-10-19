/* 대만 횡하중 식 (순수 함수).
   지진 — 建築物耐震設計規範及解說(113.03.01) 2.2·2.6·2.9, 표 2-5(a), (2-7)(2-9) 경험주기.
     V = I/(1.4αy)·(SaD/Fu)m·W (αy = 1.0: 鋼結構設計技術規範 LRFD 2.2 의 E 정의), V* 하한 I·Fu/(4.2αy)·(SaD/Fu)m
     Ra = 1+(R−1)/1.5, Fu (2-12), (SaD/Fu)m (2-2 수정), T = 0.085hn^¾ (鋼 모멘트골조) / 0.050hn^¾ (그 밖의 구조)
   풍 — 建築物耐風設計規範及解說(2014) 2.6 q = 0.06·K·(I·V10)² kgf/m², 표 2.2 α·zg, 2.7 G = 1.88, 표 2.4·2.5·2.17 Cp·GCpi
   원문 KB: E:/MIDAS PROGRAM/COde/TW/knowledge/{seismic-design-code,wind-load-2014}. 식 구현은 story 프로젝트 tw.ts(원문 대조 완료)를 따름. */

const KGF = 0.00980665 // kgf/m² → kN/m²
const ALPHA_Y = 1.0

/** 표2-5(a) 설계 수평 스펙트럼 계수 */
export function saD(T: number, S: number, T0: number): number {
  if (!(S > 0) || !(T0 > 0)) return 0
  if (T <= 0.2 * T0) return S * (0.4 + (3 * T) / T0)
  if (T <= T0) return S
  if (T <= 2.5 * T0) return (S * T0) / T
  return 0.4 * S
}

/** (2-12) 구조계 지진력 감소계수 Fu */
export function fu(T: number, Ra: number, T0: number): number {
  const r = Math.sqrt(2 * Ra - 1)
  if (T >= T0) return Ra
  if (T >= 0.6 * T0) return r + ((Ra - r) * (T - 0.6 * T0)) / (0.4 * T0)
  if (T >= 0.2 * T0) return r
  return r + ((r - 1) * (T - 0.2 * T0)) / (0.2 * T0)
}

/** (2-2) (SaD/Fu)m */
export function mod(x: number): number {
  if (x <= 0.3) return x
  if (x < 0.8) return 0.52 * x + 0.144
  return 0.7 * x
}

/** 2.6 경험주기 — hn = 기면~지붕면 높이 (m) */
export function period(kind: 'moment' | 'braced', hn: number): number {
  return (kind === 'moment' ? 0.085 : 0.05) * Math.pow(Math.max(hn, 0.1), 0.75)
}

export interface SeismicCoef {
  /** 설계 V/W = max(V, V*, V_M) */
  c: number; cV: number
  /** 2.16.1 변위각 검토 하중 I·Fu/4.2·(SaD/Fu)m (2.10.1 일반 공학 V* 와 같은 식) */
  cStar: number
  /** 2.10.1 하한 (대북분지 /3.5), 2.10.2 하한 V_M */
  cMin: number; cM: number
  SaD: number; Fu: number; Ra: number; m: number; gov: 'V' | 'V*' | 'VM'
}

/** V/W 계수 — 2.2 V, 2.10.1 V*, 2.10.2 V_M 중 큰 값. basin = 臺北盆地 (2-11 Ra, 2-13b V*) */
export function seismicCoef(o: { SDS: number; SD1: number; SMS?: number; SM1?: number; basin?: boolean; I: number; R: number; T: number }): SeismicCoef {
  const T0D = o.SDS > 0 ? o.SD1 / o.SDS : 0
  const Ra = 1 + (o.R - 1) / (o.basin ? 2.0 : 1.5) // (2-10)·(2-11)
  const Sa = saD(o.T, o.SDS, T0D)
  const F = fu(o.T, Ra, T0D)
  const m = mod(Sa / F)
  const cV = (o.I / (1.4 * ALPHA_Y)) * m
  const cStar = (o.I * F * m) / (4.2 * ALPHA_Y)
  const cMin = (o.I * F * m) / ((o.basin ? 3.5 : 4.2) * ALPHA_Y) // (2-13a)·(2-13b)
  /* (2-13c) V_M = I/(1.4αy)·(SaM/FuM)m·W, FuM = (2-12) 에 Ra 대신 R, SaM 표2-5(b) */
  let cM = 0
  if (o.SMS && o.SM1) {
    const T0M = o.SM1 / o.SMS
    cM = (o.I / (1.4 * ALPHA_Y)) * mod(saD(o.T, o.SMS, T0M) / fu(o.T, o.R, T0M))
  }
  const c = Math.max(cV, cMin, cM)
  return { c, cV, cStar, cMin, cM, SaD: Sa, Fu: F, Ra, m, gov: c === cM && cM > cV ? 'VM' : c === cMin && cMin > cV ? 'V*' : 'V' }
}

/* 표2-4 工址放大係數 (선형 보간) — 地盤 1 堅實 / 2 普通 / 3 軟弱 */
const FA = { x: [0.5, 0.6, 0.7, 0.8, 0.9], 1: [1, 1, 1, 1, 1], 2: [1.1, 1.1, 1.0, 1.0, 1.0], 3: [1.2, 1.2, 1.1, 1.0, 1.0] }
const FV = { x: [0.3, 0.35, 0.4, 0.45, 0.5], 1: [1, 1, 1, 1, 1], 2: [1.5, 1.4, 1.3, 1.2, 1.1], 3: [1.8, 1.7, 1.6, 1.5, 1.4] }
const lin = (xs: number[], ys: number[], x: number) => {
  if (x <= xs[0]) return ys[0]
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
  const i = xs.findIndex((v) => v >= x)
  return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1])
}
export const Fa = (soil: 1 | 2 | 3, Ss: number) => lin(FA.x, FA[soil], Ss)
export const Fv = (soil: 1 | 2 | 3, S1: number) => lin(FV.x, FV[soil], S1)

/* ── 풍 ── */
const EXPO: Record<string, { a: number; zg: number }> = { A: { a: 0.32, zg: 500 }, B: { a: 0.25, zg: 400 }, C: { a: 0.15, zg: 300 } } // 표2.2

/** 2.6 풍속압 q(z) (kN/m²) — K(z) = 2.774 (z/zg)^(2α), z < 5m 는 5m */
export function windQ(z: number, o: { V10: number; I: number; exposure: string }): number {
  const e = EXPO[o.exposure] ?? EXPO.C
  const K = 2.774 * Math.pow(Math.max(z, 5) / e.zg, 2 * e.a)
  return 0.06 * K * Math.pow(o.I * o.V10, 2) * KGF
}

export const GUST = 1.88 // 2.7 보통 건물
/** 표2.17 내풍압계수 (±) */
export const gcpi = (enclosure: 'enclosed' | 'partial'): number => (enclosure === 'enclosed' ? 0.375 : 1.146)

/** 표2.4 풍하면 Cp (L/B: 0~1 −0.5, 2 −0.3, ≥4 −0.2, 사이 직선보간) — 음수(흡입) */
export function wallCpLeeward(LB: number): number {
  if (LB <= 1) return -0.5
  if (LB <= 2) return -0.5 + 0.2 * (LB - 1)
  if (LB <= 4) return -0.3 + (0.1 * (LB - 2)) / 2
  return -0.2
}
export const WALL_CP_WINDWARD = 0.8

/* 표2.5 풍향 ⟂ 지붕 용마루, 풍상면 Cp. 열: θ = 0,10,20,30,40,50(≥60 은 0.01θ). 행: h/L = 0.3,0.5,1.0,1.5.
   θ = 10~15 칸의 첫 행은 +0.2 와 −0.9 를 모두 검토(주 1): low = 흡입 쪽, high = 압력 쪽. */
const THETA = [0, 10, 20, 30, 40, 50]
const HL = [0.3, 0.5, 1.0, 1.5]
const CP_LOW = [
  [-0.7, -0.9, 0.2, 0.3, 0.4, 0.5],
  [-0.7, -0.9, -0.75, -0.2, 0.3, 0.5],
  [-0.7, -0.9, -0.75, -0.9, 0.35, 0.5],
  [-0.7, -0.9, -0.9, -0.9, -0.35, 0.2],
]
const CP_HIGH = CP_LOW.map((r, i) => (i === 0 ? [-0.7, 0.2, ...r.slice(2)] : r))

function lerp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1])
  return ys[ys.length - 1]
}
function interp2(table: number[][], theta: number, hl: number): number {
  const colVals = table.map((row) => lerp(THETA, row, theta)) // 각 h/L 행에서 θ 보간
  return lerp(HL, colVals, hl)
}

/** 표2.5 풍상면 지붕 Cp (low = 흡입 최대, high = 압력 최대) 와 풍하면 −0.7 (주 3: 직선보간) */
export function roofCp(o: { thetaDeg: number; hOverL: number }): { low: number; high: number; leeward: number } {
  return { low: interp2(CP_LOW, o.thetaDeg, o.hOverL), high: interp2(CP_HIGH, o.thetaDeg, o.hOverL), leeward: -0.7 }
}
