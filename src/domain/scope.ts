import { activeOpening, additionErrors, hasAdditions } from './additions'
/* 적용범위 게이트 (평가 보고서 P0-4, 기획서 14장) — 자동설계가 맞는 건물인지 Gen 전송 전에 판정한다.
   block: 이 앱의 모델·하중으로는 표현할 수 없음 → [실행] 막음 (전문가 모드 = Gen NX 에서 직접 모델링)
   warn : 모델은 만들지만 가정이 흔들림 → 실행 가능, 결과 상태·계산서에 남김
   기본 범위: 단층 공장·일정 횡단면·경량 지붕/벽. 추가 구조는 확인된 입력에 한해 예비검토한다.
   CN 의 세부 범위는 validateCnSpec(GB 표 적용 한계) 을 그대로 쓴다. */
import { validateCnSpec } from './cnLoads'
import { validateKrSpec } from './krLoads'
import { isPartialKR } from '../codes/krLateral'
import { portalGeometry } from './portal'
import { frameSpans, type FactorySpec } from './types'

export type ScopeKey =
  | 'additionInput' | 'additionReview' | 'craneAssumed' | 'crane' | 'mezzanine' | 'multiSpan' | 'opening' | 'openingCN'
  | 'span' | 'eave' | 'eaveHigh' | 'slope' | 'bayRatio' | 'baySpacing' | 'length' | 'hnR' | 'cn' | 'monoTW' | 'multi' | 'multiTW' | 'kr' | 'multiKR'
export interface ScopeIssue { key: ScopeKey; level: 'block' | 'warn'; args: (string | number)[] }
export interface ScopeResult { issues: ScopeIssue[]; blocked: boolean }

/** 스펙에 없는 건물 특성 — 편집 카드 '적용범위' 체크 */
export interface ScopeFeatures { crane: boolean; mezzanine: boolean; multiSpan: boolean; opening: boolean }
export const NO_FEATURES: ScopeFeatures = { crane: false, mezzanine: false, multiSpan: false, opening: false }

const r2 = (x: number) => +x.toFixed(2)
/** 치수 한계 (block) — 입력 위저드도 같은 값으로 해당 칸에서 바로 막는다 (components/planFields) */
export const LIMITS = { span: 60, eave: 18, slope: 1 } as const

export function checkScope(spec: FactorySpec, f: ScopeFeatures = spec.features ?? NO_FEATURES): ScopeResult {
  const out: ScopeIssue[] = []
  const block = (key: ScopeKey, ...args: (string | number)[]) => out.push({ key, level: 'block', args })
  const warn = (key: ScopeKey, ...args: (string | number)[]) => out.push({ key, level: 'warn', args })
  const G = portalGeometry(spec)

  /* 추가 구조: 입력/출처 확인 전에는 생성 차단, 확인 후에도 전문가 검토 사유를 유지한다.
     크레인은 외곽 라멘 기둥에만 반력을 전달하며 내부 흔들림 기둥에는 재하하지 않는다. */
  if (f.crane && !spec.additions?.crane) block('additionInput')
  if (f.mezzanine && !spec.additions?.platform) block('additionInput')
  if (additionErrors({...spec, features:f}).length) block('additionInput')
  if (hasAdditions({...spec, features:f})) warn('additionReview')
  if (f.crane && spec.additions?.crane && !spec.additions.crane.manufacturer?.trim()) warn('craneAssumed')
  if (f.multiSpan && spec.frame !== 'multi') block('multiSpan') // 다경간 형식을 고르면 지원
  /* 큰 개구부: TW 는 부분 밀폐(GCpi ±0.55)로 근사 가능 — 개구부 골조는 별도. CN 은 폐쇄형만 */
  if (f.opening && !activeOpening({...spec,features:f})) {
    if (spec.code === 'CN') block('openingCN')
    else warn('opening', (spec.code === 'KR' ? !!spec.korea && isPartialKR(spec.korea.cpi) : spec.wind.enclosure === 'partial') ? 1 : 0)
  }

  /* 치수 한계 */
  /* 스팬 한계는 경간마다 (다경간은 경간 폭 목록) */
  const wMax = Math.max(...frameSpans(spec))
  if (!(spec.span > 0 && wMax <= LIMITS.span)) block('span', wMax)
  if (!(spec.eaveHeight > 0 && spec.eaveHeight <= LIMITS.eave)) block('eave', spec.eaveHeight)
  if (!(spec.roofSlope > 0 && spec.roofSlope <= LIMITS.slope)) block('slope', spec.roofSlope)
  /* 편경사: 높은 쪽 처마도 한계 안. TW 는 풍압계수 해석(表2.5 를 지붕 전체에 풍상/풍하, ASCE 7 단경사 주석 준용)·외장재 구역 근사 → 경고 */
  /* 다경간: 내부 기둥 상단 핀·골 거터 상세는 검토 범위 밖(경고). TW 주골조 풍압은 면 단위 해석(경고). CN 골 적설은 GB 51022 표 4.3.2 항 3 (1.4·2.0) 반영 */
  if (spec.frame === 'multi') {
    warn('multi')
    if (spec.code === 'TW') warn('multiTW')
    /* KR: 표 5.7-1 에 다경간 표 없음 — θ ≥ 10° 는 첫 풍상면만 풍상 표·나머지 풍하 표, 불균형 적설(4.5.3) 처마 쪽 면 0.5S_f 가정 */
    if (spec.code === 'KR') warn('multiKR')
  }
  if (spec.frame === 'mono') {
    if (spec.eaveHeight <= LIMITS.eave && G.ridgeZ > LIMITS.eave) block('eaveHigh', r2(G.ridgeZ))
    if (spec.code === 'TW') warn('monoTW')
  }
  const spans = G.spans
  const ratio = Math.max(...spans) / Math.min(...spans)
  if (ratio > 1.5) warn('bayRatio', r2(Math.min(...spans)), r2(Math.max(...spans)))
  if (Math.max(...spans) > 9) warn('baySpacing', r2(Math.max(...spans)))
  if (spec.code === 'TW' && G.length > 90) warn('length', r2(G.length))
  /* TW 표1-3 R(Rx 3.2·Ry 2.0)은 h ≤ 12 m 조건 — 넘으면 구조계 R 재확인 */
  const hn = G.hMean
  if (spec.code === 'TW' && hn > 12) warn('hnR', r2(hn))

  /* KR: 접합부·외장재 풍하중·냉간성형·내진상세(OMF·OCBF) 구현 — 남은 범위 밖(콘크리트 정착 등)은 결과별 메모로 */
  if (spec.code === 'KR') {
    try { validateKrSpec(spec) } catch (e) { block('kr', e instanceof Error ? e.message : String(e)) }
  }
  /* CN: GB 표 적용 한계 (validateCnSpec 메시지 그대로) */
  if (spec.code === 'CN') {
    try { validateCnSpec(spec) } catch (e) { block('cn', e instanceof Error ? e.message : String(e)) }
  }
  /* 같은 사유 중복 제거 (CN 은 스팬·처마·경사가 validateCnSpec 에도 걸림 → 일반 항목만 남김) */
  const dim = out.some((y) => y.key === 'span' || y.key === 'eave' || y.key === 'slope')
  const unique = out.filter((v,i)=>out.findIndex((x)=>x.key===v.key && x.level===v.level)===i)
  const issues = unique.filter((x) => !((x.key === 'cn' || x.key === 'kr') && dim))
  return { issues, blocked: issues.some((x) => x.level === 'block') }
}
