/* 검토 상태 등급 — '전체 OK' 하나로 뭉치지 않고, 통과의 근거가 어떤지 구분한다 (평가 보고서 P0-3).
   fail       : 강도비 > 1 (NG)
   expert     : 계산은 통과했지만 앱이 다루지 않는 상세가 남음 → 전문가 검토 필요
                (TW 처마 접합 회전 능력 시험 근거 13.6.1 / CN 기초·접합·가새 상세)
   prelim     : 냉간성형 검토 범위가 제한된 예비 검토
                (TW 원문 4~8장 반영 후에도 약축·편심 비틀림·웨브 지압·접합 상세 미지원, CN 은 GB/T 50018 보수 근사)
   reinforced : 무보강이면 NG, 스티프너·더블러 플레이트를 넣어 통과
   pass       : 구현된 계산 항목 통과
   한 항목에 여러 사유가 겹치면 위 순서의 앞쪽이 등급이 되고, 사유는 모두 남긴다. */
import type { ConnResult } from './connections'
import type { DesignResult, MemberCheck } from './design'
import type { ScopeResult } from './scope'
import type { ElementRole } from './types'
import type { DesignIssue } from './validity'

export type Grade = 'fail' | 'expert' | 'prelim' | 'reinforced' | 'pass'
export const GRADES: Grade[] = ['fail', 'expert', 'prelim', 'reinforced', 'pass']
const worse = (a: Grade, b: Grade): Grade => (GRADES.indexOf(a) <= GRADES.indexOf(b) ? a : b)
export const worstOf = (gs: Grade[]): Grade => gs.reduce(worse, 'pass')

export type Reason = 'addition' | 'ng' | 'coldFormed' | 'stiffener' | 'doubler' | 'rotTest' | 'gbDetail' | 'applicability' | 'restraint'
const REASON_GRADE: Record<Reason, Grade> = { addition:'expert', ng: 'fail', rotTest: 'expert', gbDetail: 'expert', coldFormed: 'prelim', stiffener: 'reinforced', doubler: 'reinforced', applicability: 'fail', restraint: 'expert' }
export interface Graded { grade: Grade; reasons: Reason[] }
const graded = (reasons: Reason[]): Graded => ({ grade: worstOf(reasons.map((r) => REASON_GRADE[r])), reasons })

/** Lipped C: TW/CN CC names and KR KS21 LC names share remaining detail limits. */
export const isColdFormed = (section: string) => /^(CC\s|LC-)/.test(section.trim())

export function memberGrade(m: Pick<MemberCheck, 'ratio' | 'section'> & { issues?: DesignIssue[] }): Graded {
  const r: Reason[] = []
  if (m.ratio > 1) r.push('ng')
  if (isColdFormed(m.section)) r.push('coldFormed')
  if (m.issues?.some((i) => i.level === 'blocked')) r.push('applicability')
  if (m.issues?.some((i) => i.level === 'review' && i.key==='restraint')) r.push('restraint')
  if (m.issues?.some((i) => i.key==='addition')) r.push('addition')
  return graded(r)
}

/** 역할 등급 = 그 역할 부재 전체 중 가장 나쁜 것 */
export function roleGrade(d: DesignResult, role: ElementRole): Graded {
  const ms = d.members.filter((m) => m.role === role)
  const reasons = [...new Set(ms.flatMap((m) => memberGrade(m).reasons))]
  return graded(reasons)
}

export function connGrade(c: ConnResult): Graded {
  const r: Reason[] = []
  if (c.ratio > 1) r.push('ng')
  if (c.notes.includes('rotTest')) r.push('rotTest')
  if (c.notes.some((n) => n.startsWith('gb') || n === 'krFoundation')) r.push('gbDetail')
  if (c.dims.stiffener || c.notes.includes('stiffeners')) r.push('stiffener')
  if (c.notes.some((n) => n.startsWith('doubler'))) r.push('doubler')
  return graded(r)
}

export interface StatusSummary {
  overall: Grade
  /** 부재 수 — 등급별 */
  members: Record<Grade, number>
  /** 사용성 항목 NG 수 / 전체 */
  service: { ng: number; total: number }
  /** 접합 — 등급별 */
  conns: Record<Grade, number>
  /** 적용범위 경고 수 (block 은 전송 전에 막힘) */
  scopeWarn: number
}

const zero = (): Record<Grade, number> => ({ fail: 0, expert: 0, prelim: 0, reinforced: 0, pass: 0 })

export function summarizeStatus(d: DesignResult | null, cs: ConnResult[] | null, scope?: ScopeResult): StatusSummary {
  const members = zero(), conns = zero()
  for (const m of d?.members ?? []) members[memberGrade(m).grade]++
  for (const c of cs ?? []) conns[connGrade(c).grade]++
  const svcNg = (d?.service ?? []).filter((s) => s.ratio > 1).length
  const present = GRADES.filter((g) => members[g] + conns[g] > 0)
  const scopeWarn = scope?.issues.filter((i) => i.level === 'warn').length ?? 0
  return {
    overall: worstOf([svcNg ? 'fail' : 'pass', scopeWarn ? 'expert' : 'pass', ...present]),
    members, conns, service: { ng: svcNg, total: d?.service.length ?? 0 }, scopeWarn,
  }
}
