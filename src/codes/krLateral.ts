/* 한국 KDS — 지진·풍·적설 식 (순수 함수). 원문 KB: COde/KR/knowledge/
   - KDS 41 17 00 (2022): 3.2 S = Z × 2.0, 4.2 설계응답스펙트럼·표 4.2-1/4.2-2 Fa·Fv, 5.2 내진설계범주, 7.2.2 Cs, 7.2.4 Ta, 표 7.2-1 Cu, 7.2.5 k
   - KDS 41 12 00 (2022): 5.5 속도압, 5.6.2 강체 G_D, 5.6.4 지붕 G_pe, 표 5.7-1 외압계수, 표 5.7-4 내압계수, 4.3·4.4·4.5 적설
   지진구역·Z 는 KDS 17 10 00 (2024) 표 4.2-1·4.2-2 (KB 추가 2026-10-16 — 이전엔 통상값으로 썼던 0.11·0.07 과 일치), S = Z × I(2,400년 2.0). */

/* ── 지진 ── */
export const ZONE_Z: Record<'1' | '2', number> = { 1: 0.11, 2: 0.07 }
/** KDS 17 10 00 (2024) 표 4.2-1 지진구역 — 특·광역시·특별자치시, 도, 강원은 시·군별 (남부 7 = I, 북부 11 = II). 표 4.2-2 Z = 0.11 / 0.07 */
export const REGIONS_KR: readonly { key: string; zone: '1' | '2' }[] = [
  ...['서울', '인천', '대전', '부산', '대구', '울산', '광주', '세종', '경기', '충북', '충남', '경북', '경남', '전북', '전남'].map((key) => ({ key, zone: '1' as const })),
  ...['영월', '정선', '삼척', '강릉', '동해', '원주', '태백'].map((c) => ({ key: `강원 ${c}`, zone: '1' as const })),
  ...['홍천', '철원', '화천', '횡성', '평창', '양구', '인제', '고성', '양양', '춘천', '속초'].map((c) => ({ key: `강원 ${c}`, zone: '2' as const })),
  { key: '제주', zone: '2' },
]
export const regionZoneKR = (key: string | undefined) => REGIONS_KR.find((r) => r.key === key)?.zone
/** KDS 41 17 00 3.2: S = Z × I(2,400년 2.0) — 국가지진위험지도 값은 이 값의 80% 이상 */
export const sMinKR = (zone: '1' | '2') => 0.8 * ZONE_Z[zone] * 2.0
export type SiteKR = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'
export const SITES_KR: SiteKR[] = ['S1', 'S2', 'S3', 'S4', 'S5']
const FA: Record<SiteKR, number[]> = { S1: [1.12, 1.12, 1.12], S2: [1.4, 1.4, 1.3], S3: [1.7, 1.5, 1.3], S4: [1.6, 1.4, 1.2], S5: [1.8, 1.3, 1.3] }
const FV: Record<SiteKR, number[]> = { S1: [0.84, 0.84, 0.84], S2: [1.5, 1.4, 1.3], S3: [1.7, 1.6, 1.5], S4: [2.2, 2.0, 1.8], S5: [3.0, 2.7, 2.4] }
/** 표 4.2-1·4.2-2 — S ≤ 0.1 / 0.2 / 0.3 열 직선보간, 범위 밖은 끝값 */
const interpS = (row: number[], S: number) => (S <= 0.1 ? row[0] : S >= 0.3 ? row[2] : S <= 0.2 ? row[0] + (row[1] - row[0]) * (S - 0.1) / 0.1 : row[1] + (row[2] - row[1]) * (S - 0.2) / 0.1)

export interface SpectrumKR { S: number; Fa: number; Fv: number; SDS: number; SD1: number; T0: number; Ts: number; TL: number }
/** 4.2.2 SDS = S·2.5·Fa·2/3, SD1 = S·Fv·2/3 */
export function spectrumKR(S: number, site: SiteKR): SpectrumKR {
  if (!(S > 0 && S < 1) || !FA[site]) throw new Error('KDS 41 17 00: invalid S or site class (S1–S5)')
  const Fa = interpS(FA[site], S), Fv = interpS(FV[site], S)
  const SDS = S * 2.5 * Fa * 2 / 3, SD1 = S * Fv * 2 / 3
  return { S, Fa, Fv, SDS, SD1, T0: 0.2 * SD1 / SDS, Ts: SD1 / SDS, TL: 5 }
}

/** 표 2.2-1 중요도 → 내진등급·IE. 표 8.2-1 허용층간변위 */
export type ImportanceKR = 'S' | '1' | '2' | '3'
export const SEISMIC_GRADE: Record<ImportanceKR, { grade: '특' | 'I' | 'II'; IE: number; drift: number }> = {
  S: { grade: '특', IE: 1.5, drift: 0.010 }, 1: { grade: 'I', IE: 1.2, drift: 0.015 }, 2: { grade: 'II', IE: 1.0, drift: 0.020 }, 3: { grade: 'II', IE: 1.0, drift: 0.020 },
}

/** 5.2 내진설계범주 — 표 5.2-1·5.2-2 중 높은 것 */
export function sdcKR(SDS: number, SD1: number, imp: ImportanceKR): 'A' | 'B' | 'C' | 'D' {
  const sp = imp === 'S'
  const a = SDS >= 0.5 ? 'D' : SDS >= 0.33 ? (sp ? 'D' : 'C') : SDS >= 0.17 ? (sp ? 'C' : 'B') : 'A'
  const b = SD1 >= 0.2 ? 'D' : SD1 >= 0.14 ? (sp ? 'D' : 'C') : SD1 >= 0.07 ? (sp ? 'C' : 'B') : 'A'
  return (a > b ? a : b) as 'A' | 'B' | 'C' | 'D'
}

/** 표 6.2-1 '강구조기준의 일반규정만을 만족하는 철골구조시스템' — R 3, Ω0 3, Cd 3 (범주 D 높이 60 m) */
export const STEEL_GENERAL = { R: 3, Om: 3, Cd: 3, limD: 60 } as const
/** 표 6.2-1 지진력저항시스템 — 일반규정만(8) R 3·Ω0 3·Cd 3 / 보통모멘트골조(3-c) 3.5·3·3 / 보통중심가새골조(2-d) 3.25·2·3.25.
    R > 3 이면 KDS 14 31 60 내진상세 적용 (41 17 00 10.1). 세 계통 모두 범주 D 높이 제한 없음(일반규정만 60 m) */
export const SYSTEMS_KR = {
  general: { R: 3, Om: 3, Cd: 3, row: '8' },
  OMF: { R: 3.5, Om: 3, Cd: 3, row: '3-c' },
  OCBF: { R: 3.25, Om: 2, Cd: 3.25, row: '2-d' },
} as const
export type SystemKR = keyof typeof SYSTEMS_KR

/** 7.2.4 근사고유주기 Ta = Ct·hn^x — 철골모멘트골조 0.0724·0.8, 기타골조(가새 방향) 0.0488·0.75 */
export function periodKR(kind: 'moment' | 'braced', hn: number): number {
  return kind === 'moment' ? 0.0724 * hn ** 0.8 : 0.0488 * hn ** 0.75
}

/** 7.2.2 Cs = SDS/(R/IE) ≤ SD1/((R/IE)T) (T ≤ TL) ≥ max(0.044·SDS·IE, 0.01) */
export function csKR(T: number, s: Pick<SpectrumKR, 'SDS' | 'SD1' | 'TL'>, R: number, IE: number): { c: number; cV: number; cMax: number; cMin: number; gov: string } {
  const RI = R / IE
  const cV = s.SDS / RI
  const cMax = T <= s.TL ? s.SD1 / (RI * T) : s.SD1 * s.TL / (RI * T * T)
  const cMin = Math.max(0.044 * s.SDS * IE, 0.01)
  const c = Math.max(Math.min(cV, cMax), cMin)
  return { c, cV, cMax, cMin, gov: c === cMin && cMin > Math.min(cV, cMax) ? '7.2-5' : cMax < cV ? '7.2-3' : '7.2-2' }
}

/** 7.2.5 분포계수 k — T ≤ 0.5 s: 1, ≥ 2.5 s: 2, 사이 직선보간 */
export const distK = (T: number) => (T <= 0.5 ? 1 : T >= 2.5 ? 2 : 1 + (T - 0.5) / 2)

/* ── 풍 (KDS 41 12 00 5장) ── */
export type ExposureKR = 'A' | 'B' | 'C' | 'D'
/** 표 5.5-2·5.5-3 */
export const ROUGH: Record<ExposureKR, { zb: number; Zg: number; a: number; c: number; low: number }> = {
  A: { zb: 20, Zg: 550, a: 0.33, c: 0.22, low: 0.58 }, B: { zb: 15, Zg: 450, a: 0.22, c: 0.45, low: 0.81 },
  C: { zb: 10, Zg: 350, a: 0.15, c: 0.71, low: 1.0 }, D: { zb: 5, Zg: 250, a: 0.10, c: 0.98, low: 1.13 },
}
/** 표 5.5-2 풍속고도분포계수 K_zr */
export function kzrKR(z: number, cat: ExposureKR): number {
  const r = ROUGH[cat]
  if (!r || !(z > 0)) throw new Error('KDS wind: exposure A–D and z > 0')
  return z <= r.zb ? r.low : r.c * Math.min(z, r.Zg) ** r.a
}
/** 표 5.7-1 주 — 높이방향 압력분포계수 k_z (풍상벽) */
export function kzKR(z: number, H: number, cat: ExposureKR): number {
  const r = ROUGH[cat]
  if (H <= r.zb) return 1.0
  if (z <= r.zb) return (r.zb / H) ** (2 * r.a)
  if (z < 0.8 * H) return (z / H) ** (2 * r.a)
  return 0.8 ** (2 * r.a)
}
/** (5.5-3.a) 난류강도 I_z — z < z_b 는 z_b 값 */
export function turbulenceKR(z: number, cat: ExposureKR): number {
  const r = ROUGH[cat]
  return 0.1 * (Math.max(z, r.zb) / r.Zg) ** (-r.a - 0.05)
}
/** 표 5.5-5 중요도계수 I_W (초고층 제외) */
export const IW_KR: Record<ImportanceKR, number> = { S: 1.0, 1: 1.0, 2: 0.95, 3: 0.90 }

/** 5.5 V_H = V0·K_D·K_zr·K_zt·I_W, q_H = ½ρV_H² (ρ 1.225) → kN/m² */
export function velocityKR(o: { V0: number; KD: number; Kzt: number; Iw: number; H: number; cat: ExposureKR }): { VH: number; qH: number; Kzr: number } {
  const Kzr = kzrKR(o.H, o.cat)
  const VH = o.V0 * o.KD * Kzr * o.Kzt * o.Iw
  return { VH, qH: 0.5 * 1.225 * VH * VH / 1000, Kzr }
}

/** 5.6.2 강체건축구조물 풍방향가스트영향계수 G_D = 1 + 4γ_D√B_D (n_D > 1 Hz). B = 풍직각 폭 */
export function gustKR(H: number, B: number, cat: ExposureKR): number {
  const r = ROUGH[cat]
  const IH = turbulenceKR(H, cat)
  const gam = (3 + 3 * r.a) / (2 + r.a) * IH // (5.6-1.c)
  const LH = H > 30 ? 100 * Math.sqrt(H / 30) : 100 // (5.6-1.e)
  const k = H >= B ? 0.33 : -0.33
  const BD = 1 - 1 / Math.cbrt(1 + 5.1 * (LH / Math.sqrt(H * B)) ** 1.3 * (B / H) ** k) // (5.6-1.d)
  return 1 + 4 * gam * Math.sqrt(BD) // (5.6-2)
}

/** 5.6.4 지붕 외압가스트영향계수 G_pe. l = 지붕 경간, b = 분담폭, parallel = 지붕보가 풍향과 평행.
    n_R0·H/V_H < 1.3 (5.6-4) 이면 공진 포함 (5.6-6), 아니면 (5.6-5). */
export function roofGustKR(o: { H: number; VH: number; cat: ExposureKR; l: number; b: number; parallel: boolean; nR0: number; zeta: number }): { Gpe: number; resonant: boolean; Bpe: number; Rpe: number; rpe: number } {
  const IH = turbulenceKR(o.H, o.cat)
  const rpe = 2.2 * IH ** 2 + 0.19
  const lH = o.l / o.H, bH = o.b / o.H
  const Bpe = o.parallel ? 0.36 / (lH ** 0.34 * bH ** 0.09) : 0.50 * bH ** 0.03 / lH ** 0.49
  const nStar = o.nR0 * o.H / o.VH
  if (!(nStar < 1.3)) return { Gpe: 1 + 4 * rpe * Math.sqrt(Bpe), resonant: false, Bpe, Rpe: 0, rpe }
  const gpe = Math.sqrt(2 * Math.log(600 * o.nR0) + 1.2)
  const Rpe = o.parallel ? 0.004 / (nStar ** 2.8 * lH ** 1.5 * bH ** 0.55 * o.zeta) : 0.01 * bH ** 0.04 / (nStar ** 3.4 * lH ** 0.80 * o.zeta)
  return { Gpe: 1 + gpe * rpe * Math.sqrt(Bpe + Rpe), resonant: true, Bpe, Rpe, rpe }
}

/** 표 5.7-1 ① 벽면 — 풍상 0.8k_z (+0.05 D/B > 1), 풍하 −0.5 / −0.35, 측벽 거리별 −0.7·−0.5·−0.3 (x = 풍상벽 끝단에서) */
export const wallCpeKR = {
  windward: (kz: number, DB: number) => 0.8 * kz + (DB > 1 ? 0.05 : 0),
  leeward: (DB: number) => (DB <= 1 ? -0.5 : -0.35),
  side: (x: number, H: number) => (x <= H ? -0.7 : x < 3 * H ? -0.5 : -0.3),
}

/** 두 값 계수 (부압 쪽, 정압 쪽). 주 3) 풍상측 지붕은 두 조건 모두 검토 */
export type CpPair = [number, number]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpPair = (a: CpPair, b: CpPair, t: number): CpPair => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
/** 표 열 xs 위 직선보간 (범위 밖은 끝값) */
function interpCols<T>(xs: number[], ys: T[], x: number, f: (a: T, b: T, t: number) => T): T {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return f(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1]))
  return ys[ys.length - 1]
}

/** 표 5.7-1 주 면적감소계수 k_a — ≤ 10 m² 1.0, 25 m² 0.9, ≥ 100 m² 0.8 */
export const areaKa = (A: number) => interpCols([10, 25, 100], [1.0, 0.9, 0.8], A, lerp)

/** 표 5.7-1 ② 평지붕·θ < 10° 용마루 직각·모든 경사 용마루 방향 — 풍상 끝단에서 거리 x 의 계수 (H/D ≤ 0.5 / ≥ 1.0 보간).
    '*' 값(보간용)은 표 그대로 사용. H/D ≥ 1 은 D ≤ H 라 1H 이후 구역이 없음 → 1H~2H 값을 끝값으로 */
export function flatRoofCpeKR(x: number, H: number, HD: number, ka = 1): CpPair {
  const low: CpPair[] = [[-0.9, -0.4], [-0.9, -0.4], [-0.5, 0.0], [-0.3, 0.1], [-0.2, 0.2]]
  const high: CpPair[] = [[-1.3 * ka, -0.6], [-0.7, -0.3], [-0.7, -0.3], [-0.7, -0.3], [-0.7, -0.3]]
  const zone = x <= 0.5 * H ? 0 : x <= H ? 1 : x <= 2 * H ? 2 : x <= 3 * H ? 3 : 4
  return HD <= 0.5 ? low[zone] : HD >= 1 ? high[zone] : lerpPair(low[zone], high[zone], (HD - 0.5) / 0.5)
}

/** 표 5.7-1 ② θ ≥ 10° 용마루 직각 풍상지붕면 (H/D ≤ 0.25 / 0.5 / ≥ 1.0 × θ 10~45) */
export function windwardRoofCpeKR(thetaDeg: number, HD: number): CpPair {
  const th = [10, 15, 20, 25, 30, 35, 45]
  const s45 = 0.8 * Math.sin(Math.max(45, thetaDeg) * Math.PI / 180)
  const rows: CpPair[][] = [
    [[-0.7, -0.3], [-0.5, 0.0], [-0.3, 0.2], [-0.2, 0.3], [-0.2, 0.4], [0.0, 0.5], [0.0, s45]],
    [[-0.9, -0.4], [-0.7, -0.3], [-0.4, 0.0], [-0.3, 0.2], [-0.2, 0.3], [-0.2, 0.4], [0.0, s45]],
    [[-1.3, -0.6], [-1.0, -0.5], [-0.7, -0.3], [-0.5, 0.0], [-0.3, 0.2], [-0.2, 0.3], [0.0, s45]],
  ]
  const byRow = rows.map((r) => interpCols(th, r, thetaDeg, lerpPair))
  return interpCols([0.25, 0.5, 1.0], byRow, HD, lerpPair)
}

/** 표 5.7-1 ② θ ≥ 10° 용마루 직각 풍하지붕면 (≥ 25° 는 B/D 에 따라) */
export function leewardRoofCpeKR(thetaDeg: number, HD: number, BD: number): number {
  const c25 = BD < 3 ? -0.6 : BD <= 8 ? -0.06 * (7 + BD) : -0.9
  const rows = [[-0.3, -0.5, -0.6, c25], [-0.5, -0.5, -0.6, c25], [-0.7, -0.6, -0.6, c25]]
  const byRow = rows.map((r) => interpCols([10, 15, 20, 25], r, thetaDeg, lerp))
  return interpCols([0.25, 0.5, 1.0], byRow, HD, lerp)
}

/** 표 5.7-4 내압계수 C_pi (두 값) */
export const CPI_KR = {
  oneWall: [0.7, -0.4], twoOpposite: [0.2, -0.4], twoAdjacent: [0.2, -0.3], allLeaky: [0.0, -0.6],
  wallsLeaky: [0.0, -0.4], sealed: [0.0, -0.2], dominant1: [0.55, -0.55], dominant2: [0.7, -0.7],
} as const
export type CpiKR = keyof typeof CPI_KR
export const CPI_KEYS = Object.keys(CPI_KR) as CpiKR[]
/** 부분밀폐형(탁월 개구부) 여부 — 5.13 풍하중 조합은 밀폐형만 */
export const isPartialKR = (k: CpiKR) => k === 'dominant1' || k === 'dominant2'

/* ── 적설 (KDS 41 12 00 4장) ── */
/** 그림 4.4-1 지붕경사도계수 C_s — 실선(미끄러지기 쉽지 않은 표면). 난방(C_t = 1.0): 30° → 70° 감소, 비난방: 45° → 70° */
export function slopeCsKR(thetaDeg: number, Ct: number): number {
  const a = Ct > 1 ? 45 : 30
  return thetaDeg <= a ? 1 : thetaDeg >= 70 ? 0 : 1 - (thetaDeg - a) / (70 - a)
}
/** 4.3 S_f = C_b·C_e·C_t·I_s·S_g (C_b 0.7). 4.3.5 θ ≤ 15° 최소값. 표 4.3-3 I_s */
export const IS_KR: Record<ImportanceKR, number> = { S: 1.2, 1: 1.1, 2: 1.0, 3: 0.8 }
export function flatSnowKR(o: { Sg: number; Ce: number; Ct: number; Is: number; thetaDeg: number }): { Sf: number; min: number } {
  const Sf = 0.7 * o.Ce * o.Ct * o.Is * o.Sg
  /* 4.3.5 (2) S_g ≤ 1.0: I_s·S_g 이상, 그 값이 지붕활하중(1.0)보다 작으면 1.0. (3) S_g > 1.0: 1.0·I_s 이상 */
  const min = o.thetaDeg > 15 ? 0 : o.Sg <= 1.0 ? Math.max(o.Is * o.Sg, 1.0) : 1.0 * o.Is
  return { Sf: Math.max(Sf, min), min }
}
