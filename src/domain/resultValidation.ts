/* Analysis data must be complete before a design check can claim a result.
   Pure validation shared by TW/CN, including callers using saved results. */
import type { Results } from '../actions/results'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import type { ElementRole, FactoryModel, FactorySpec } from './types'

/** 결과 문제 종류 — 화면 문구는 job.failText 가 현재 언어로(rv_*). 표 이름·요소·조합은 언어와 무관한 식별자 */
export type ResultIssue = 'missing' | 'duplicate' | 'unexpected' | 'invalid'
export class ResultValidationError extends Error {
  constructor(readonly table: string, readonly issue: ResultIssue, readonly where = '') {
    super(`${table} ${issue}${where ? ` ${where}` : ''}`); this.name = 'ResultValidationError'
  }
}

export function requireResult(ok: unknown, table: string, issue: ResultIssue, where = ''): asserts ok {
  if (!ok) throw new ResultValidationError(table, issue, where)
}

/** Reject blank/missing numeric cells as well as NaN/Infinity. Zero is valid. */
export function resultNumber(value: unknown, table: string, where = ''): number {
  requireResult((typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '', table, 'invalid', where)
  const n = Number(value)
  requireResult(Number.isFinite(n), table, 'invalid', where)
  return n
}

export function serviceNodes(spec: FactorySpec, model: FactoryModel) {
  const G = portalGeometry(spec)
  const eaves = model.nodes.filter(G.isEaveNode)
  const ridge = model.nodes.filter(G.isDeflNode)
  const internal = model.nodes.filter((n) => G.leanXs.some((x) => Math.abs(n.x - x) < 1e-7) && Math.abs(n.z - G.zAt(n.x)) < 1e-7)
  return { eaves, tops: [...eaves, ...internal], nodes: [...new Map((model.additions ? model.nodes : [...eaves, ...ridge, ...internal]).map((n) => [n.id, n])).values()] }
}

/* 전체 검증을 통과한 결과 객체 → 그때의 모델 형태(조합 + 요소 ID·역할). 같은 결과·같은 형태면 다시 훑지 않는다 —
   단면 최적화는 후보 단면마다 runDesign 을 부르므로(수백 번) 매번 전체 표를 검증하면 반복마다 낭비.
   결과는 회수 뒤 바꾸지 않는다(새 해석 = 새 객체). 후보 모델은 단면만 달라 형태가 같다. */
const validated = new WeakMap<Results, string>()
const shapeKey = (model: FactoryModel, combos: string[]) => `${combos.join('|')}#${model.elements.map((e) => `${e.id}:${e.role}`).join(',')}`

export function validateDesignResults(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results, roles?: readonly ElementRole[]): void {
  const combos = Object.keys(info.comboKind ?? {})
  const key = shapeKey(model, combos)
  if (validated.get(res) === key) return // 전체 검증(모든 역할·사용성)이 부분 검증을 포함
  requireResult(combos.length > 0 && combos.length === res.combos.length && new Set(res.combos).size === combos.length && combos.every((c) => res.combos.includes(c)), 'COMBINATIONS', 'missing')
  for (const e of model.elements) {
    if (roles && !roles.includes(e.role)) continue
    for (const c of combos) {
      if (e.role === 'brace') {
        requireResult(Number.isFinite(res.truss.get(e.id)?.get(c)), 'TRUSSFORCE', 'missing', `${e.id} · ${c}`)
      } else {
        const ps = res.beam.get(e.id)?.get(c)
        requireResult(ps?.length === 5, 'BEAMFORCE', 'missing', `${e.id} · ${c}`)
        for (let i = 0; i < 5; i++) requireResult(ps[i] && ['P', 'Vy', 'Vz', 'My', 'Mz'].every((k) => Number.isFinite(ps[i][k as keyof typeof ps[number]])), 'BEAMFORCE', 'invalid', `${e.id} · ${c} · ${i}`)
      }
    }
  }
  for (const c of combos) for (const d of ['X', 'Y'] as const) {
    const v = res.sway.get(c)?.[d]
    requireResult(v && [v.sumPu, v.drift, v.sumH].every((n) => Number.isFinite(n) && n >= 0), 'SWAY', 'invalid', `${c} · ${d}`)
  }
  if (roles) return // Candidate sections use the already checked service result.
  const { nodes } = serviceNodes(spec, model)
  requireResult(nodes.length > 0, 'DISPLACEMENT', 'missing')
  const cases = new Set([...(info.additions?.serviceCases ?? []), 'LR', 'EX', 'EY', ...(spec.code !== 'CN' ? ['ETX', 'ETY'] : ['D']), ...info.wind.variants.flatMap((w) => w.parts.map((p) => p.lc))])
  // Snow cases are defined by the model's combinations, never by returned data.
  for (const c of combos) for (const s of c.match(/S(?:N|V|H)\d*/g) ?? []) cases.add(s)
  for (const c of cases) for (const n of nodes) {
    const v = res.disp.get(c)?.get(n.id)
    requireResult(v && [v.dx, v.dy, v.dz].every(Number.isFinite), 'DISPLACEMENT', 'missing', `${c} · ${n.id}`)
  }
  validated.set(res, key)
}
