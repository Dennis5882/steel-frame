/* 한국 — KDS 41 30 10 건축물 강구조 설계기준 (2022) → KDS 14 31 10/15 (2024, LRFD).
   하중: KDS 41 12 00 (2022) 1.7.1 강도설계 하중조합, 3.6 지붕활하중 저감 / 지진: KDS 41 17 00 (2022).
   재료: KDS 41 30 10 표 3.3-1 (판두께별 Fy), 표 3.4-1 E = 210,000 MPa.
   Gen NX 연동명(wg_api_framework.dll 문자열, 라이브 확인 전): 재료 STANDARD 'KS22(S)' + 강종명(SS275 …), 단면 DB 'KS21'.
   강재 설계 코드는 구 db/DSTL 이 아니라 DESIGN/STEEL/DSTL {DGNCODE 'KDS 41 30 : 2022'} (MIDAS API 매뉴얼 25장) — 모델 생성 때 보내지 않고
   라이브 대조(scripts/live-kr.ts --gen-check)에서만 설정한다. */
export const KR_GEN_DESIGN_CODE = 'KDS 41 30 : 2022'
import type { CodeProfile } from './types'
import { csKR, kzrKR, periodKR, spectrumKR, type ExposureKR } from './krLateral'

/** 표 3.3-1 — 판두께 구간별 Fy (MPa): ≤16 / ≤40 / ≤75 / ≤100 */
const FY_TABLE: Record<string, number[]> = {
  SS275: [275, 265, 245, 245],
  /* KDS 41 30 30 표 3.2-1 KS D 3530 일반 구조용 경량 형강 SSC275 (판두께 1.6~6.0 mm) */
  SSC275: [275, 275, 275, 275], SM275: [275, 265, 255, 245], SM355: [355, 345, 335, 325], SN275: [275, 275, 255, 255], SN355: [355, 355, 335, 335],
}
export function fyKR(material: string, t: number): number {
  const row = FY_TABLE[material]
  if (!row) throw new Error(`KDS 41 30 10: unsupported steel ${material}`)
  if (!(t > 0 && t <= 100)) throw new Error('KDS 41 30 10 3.3.1: plate thickness must be 0 < t ≤ 100 mm')
  return t <= 16 ? row[0] : t <= 40 ? row[1] : t <= 75 ? row[2] : row[3]
}

/** 3.6.1 지붕활하중 저감 L_r = L0·R1·R2 (0.6 ≤ L_r ≤ 1.0), L0 = 1.0 (표 3.2-1 점유·사용하지 않는 지붕) */
export function roofLiveKR(slope: number, tribArea: number): number {
  const R1 = tribArea <= 20 ? 1 : tribArea >= 60 ? 0.6 : 1.2 - 0.01 * tribArea
  const R2 = slope <= 1 / 3 ? 1 : slope >= 1 ? 0.6 : 1.2 - 0.6 * slope
  return Math.min(1.0, Math.max(0.6, 1.0 * R1 * R2))
}

export const KR: CodeProfile = {
  id: 'KR',
  labelKey: 'code_KR',
  method: 'LRFD',
  materials: {
    SS275: { fy: 275, fu: 410, E: 210000, nu: 0.3, gamma: 77, gen: { standard: 'KS22(S)', db: 'SS275' } },
    SM275: { fy: 275, fu: 410, E: 210000, nu: 0.3, gamma: 77, gen: { standard: 'KS22(S)', db: 'SM275' } },
    SM355: { fy: 355, fu: 490, E: 210000, nu: 0.3, gamma: 77, gen: { standard: 'KS22(S)', db: 'SM355' } },
    SN275: { fy: 275, fu: 410, E: 210000, nu: 0.3, gamma: 77, gen: { standard: 'KS22(S)', db: 'SN275' } },
    SN355: { fy: 355, fu: 490, E: 210000, nu: 0.3, gamma: 77, gen: { standard: 'KS22(S)', db: 'SN355' } },
    /* 냉간성형 퍼린·거트 (Gen KS22(S) 'SSC275' 라이브 수용 2026-10-16) */
    SSC275: { fy: 275, fu: 410, E: 210000, nu: 0.3, gamma: 77, gen: { standard: 'KS22(S)', db: 'SSC275' } },
  },
  defaultMaterial: 'SS275',
  fyAt: fyKR,
  gen: {
    sectionDb: 'KS21',
    /* KS21.sdb 접두 → SHAPE: H·LH = H, P = P, B = B */
    /* 립 C형강 'LC-150x65x20x3.2' → SHAPE 'CC' (라이브 수용 2026-10-16) */
    shapeOf: (name) => { if (name.startsWith('LC-')) return 'CC'; const p = name.split(' ')[0]; return p === 'LH' ? 'H' : p },
  },
  /* 공통 인터페이스용 어댑터 — KR 하중은 domain/krLoads.ts 가 krLateral 식을 직접 쓴다 */
  lateral: {
    period: periodKR,
    seismicCoef: ({ SDS, SD1, I, R, T }) => { const c = csKR(T, { SDS, SD1, TL: 5 }, R, I); return { c: c.c, cV: c.cV, cStar: c.c, cMin: c.cMin, cM: 0, SaD: SDS, Fu: 1, Ra: R, m: 1, gov: `KDS 41 17 00 ${c.gov}` } },
    windQ: (z, o) => { const VH = o.V10 * kzrKR(z, o.exposure as ExposureKR) * o.I; return 0.5 * 1.225 * VH * VH / 1000 },
    gust: 1, gcpi: () => 0,
    wallCp: { windward: 0.8, leeward: (LB) => (LB <= 1 ? -0.5 : -0.35) },
    roofCp: () => ({ low: -0.9, high: -0.4, leeward: -0.5 }),
  },
  roofLive: ({ slope, tribArea }) => roofLiveKR(slope, tribArea),
  /* 1.7.1 — 지붕만 있는 공장: L(바닥 활하중) 없음, 'L' = 지붕활하중 L_r. 'L_r 또는 S' 는 따로 조합 (a: L_r, b: S).
     (1.7-2) 1.2D + 0.5(L_r 또는 S) 는 (1.7-3) 1.2D + 1.6(L_r 또는 S) 에 포함되어 생략, (1.7-3) 1.2D + 1.6(L_r 또는 S) + 0.5W, (1.7-4) 1.2D + 1.0W + 0.5(L_r 또는 S),
     (1.7-5) 1.2D + 1.0E + 0.2S, (1.7-6) 0.9D + 1.0W, (1.7-7) 0.9D + 1.0E. (1.7-3) 의 1.0L 은 바닥 활하중이라 없음 */
  combos: () => [
    { ref: '1.7-1', terms: [['D', 1.4]] },
    { ref: '1.7-3a', terms: [['D', 1.2], ['L', 1.6]] },
    { ref: '1.7-3b', terms: [['D', 1.2], ['S', 1.6]] },
    { ref: '1.7-3c', terms: [['D', 1.2], ['L', 1.6], ['W', 0.5]] },
    { ref: '1.7-3d', terms: [['D', 1.2], ['S', 1.6], ['W', 0.5]] },
    { ref: '1.7-4a', terms: [['D', 1.2], ['W', 1.0], ['L', 0.5]] },
    { ref: '1.7-4b', terms: [['D', 1.2], ['W', 1.0], ['S', 0.5]] },
    { ref: '1.7-5', terms: [['D', 1.2], ['E', 1.0], ['S', 0.2]] },
    { ref: '1.7-6', terms: [['D', 0.9], ['W', 1.0]] },
    { ref: '1.7-7', terms: [['D', 0.9], ['E', 1.0]] },
  ],
}

/** 시험·표시용 — 스펙트럼 재노출 */
export { spectrumKR }
