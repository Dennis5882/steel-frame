/* ════════════════════════════════════════════════════════════
   설계기준 프로필 — 국가/기준별로 달라지는 것을 한 객체로.
   UI 언어와는 독립(예: 한국어 UI + 대만 기준). 기준 의존 로직(재료·하중조합·풍/지진·설계검토)은
   직접 호출하지 말고 이 인터페이스(profileOf())를 거친다.
   기준 추가 = src/codes/<id>.ts + index.ts PROFILES 한 줄 + CodeId 유니온.
════════════════════════════════════════════════════════════ */
import type { Dict } from '../i18n'

export type CodeId = 'TW' | 'CN' | 'KR'

export interface SteelMaterial {
  /** 항복강도 Fy, 인장강도 Fu (MPa) */
  fy: number
  fu: number
  /** 탄성계수 (MPa), 푸아송비, 단위중량 (kN/m³) */
  E: number
  nu: number
  gamma: number
  /** Gen NX db/MATL PARAM 의 STANDARD·DB (Gen DB 에는 등급 접미사 B/A 가 없음) */
  gen: { standard: string; db: string }
}

export type LoadCaseType = 'D' | 'L' | 'W' | 'E' | 'S'

/** 조합 용도 — basic: 일반 강도 검토 / amplified: 내진 특별 규정의 증폭 지진력 E′ 조합 / gravity: 용량 설계용 중력 조합 */
export type ComboKind = 'basic' | 'amplified' | 'gravity'

/** terms: [하중케이스 종류, 계수]. 풍·지진은 ± 방향 별도 조합으로 전개 */
export interface Combo {
  /** 조문 번호 (예: '2.2-3') */
  ref: string
  terms: [LoadCaseType, number][]
}

export interface CodeProfile {
  id: CodeId
  labelKey: keyof Dict
  /** Standard the app's member/connection checks follow (status card, report). Defaults to labelKey. */
  checkLabelKey?: keyof Dict
  /** Start-screen design-code dropdown only (zh-CN shows the full standard title). Defaults to labelKey. */
  selectLabelKey?: keyof Dict
  /** Full basis with editions for the model tab and report header. Defaults to labelKey. */
  basisLabelKey?: keyof Dict
  /** 설계법 */
  method: 'LRFD' | 'ASD' | 'LSD'
  /** 재료 카탈로그 (이름 → 물성) */
  materials: Record<string, SteelMaterial>
  defaultMaterial: string
  /** Gen NX 연동: 단면 DB 이름(db/SECT SECT_I.DB_NAME), 강재 설계 코드(db/DSTL DGNCODE) */
  gen: { sectionDb: string; designCode?: string; shapeOf(sectionName: string): string; sectionDbOf?(sectionName: string): string }
  /** 횡하중 식 (지진·풍). 기준별 구현은 <id>Lateral.ts */
  lateral: {
    period(kind: 'moment' | 'braced', hn: number): number
    /** c = max(V, V*) 계수, cStar = 2.10.1 V* 계수 (2.16.1 변위각 검토용 하중 수준) */
    seismicCoef(o: { SDS: number; SD1: number; SMS?: number; SM1?: number; basin?: boolean; I: number; R: number; T: number }): { c: number; cV: number; cStar: number; cMin: number; cM: number; SaD: number; Fu: number; Ra: number; m: number; gov: string }
    /** 풍속압 q(z) (kN/m²) */
    windQ(z: number, o: { V10: number; I: number; exposure: string }): number
    gust: number
    gcpi(enclosure: 'enclosed' | 'partial'): number
    wallCp: { windward: number; leeward(LB: number): number }
    roofCp(o: { thetaDeg: number; hOverL: number }): { low: number; high: number; leeward: number }
  }
  /** 지붕 활하중 (kN/m², 수평투영 면적 기준). slope = rise/run, tribArea = 부재의 부담 수평투영면적 (m²) */
  roofLive(opt: { slope: number; tribArea: number }): number
  /** 강도설계 하중조합. heavyLive = 차고·공중이용·활하중 > 0.5 tf/m² 여부(L 계수 1.0) */
  combos(opt: { heavyLive: boolean }): Combo[]
  /** 내진 특별 규정 조합 — amplified 의 'E' 계수에 omega(Fu) 를 곱해 E′ 로 만든다 (대만 LRFD 13.3: E′ = 1.4·Fu·E, Fu ≤ 2.5) */
  seismicCombos?: {
    omega(Fu: number): number
    combos(opt: { heavyLive: boolean }): (Combo & { kind: Exclude<ComboKind, 'basic'> })[]
  }
  /** 강재 두께별 Fy (MPa) — 없으면 materials.fy */
  fyAt?(material: string, tMm: number): number
  /** 원문 대조 전 값이 포함됐는지 — UI 에 '미검증' 표시 */
  unverified?: boolean
}
