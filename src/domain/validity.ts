import type { DesignResult, MemberCheck } from './design'
import type { FactorySpec } from './types'

export interface DesignIssue { key: 'addition' | 'effectiveLength' | 'coldFormedRange' | 'sectionRange' | 'restraint'; level: 'blocked' | 'review'; detail: string }
export const blockedMembers = (d: DesignResult | null | undefined) => d?.members.filter((m) => m.issues?.some((i) => i.level === 'blocked')).length ?? 0
export const support = (s: FactorySpec, key: 'flyBraces' | 'sagRods' | 'braceCrossing') => s.restraints?.[key] ?? 'assumed'
export const sagCount = (s: FactorySpec) => support(s, 'sagRods') === 'none' ? 0 : s.sagRods
export const restraintKeys = (s: FactorySpec) => s.code === 'CN' ? ['flyBraces', 'sagRods'] as const : ['flyBraces', 'sagRods', 'braceCrossing'] as const

export function withRestraintIssues(spec: FactorySpec, d: DesignResult): DesignResult {
  for (const m of d.members) {
    const keys = m.role === 'column' || m.role === 'rafter' || m.role === 'post' ? ['flyBraces'] as const
      : m.role === 'purlin' || m.role === 'girt' ? (spec.sagRods ? ['sagRods'] as const : [])
      : m.role === 'brace' && spec.code !== 'CN' ? ['braceCrossing'] as const : []
    for (const k of keys) if (support(spec, k) === 'assumed') {
      const issue: DesignIssue = { key: 'restraint', level: 'review', detail: k }
      m.issues = [...m.issues ?? [], issue]
    }
  }
  return d
}
export const issueNotes = (m: MemberCheck) => [...m.notes, ...(m.issues ?? []).map((i) => `${i.key}: ${i.detail}`)]
