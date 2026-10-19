/* 부재 무게 (순수 함수) — 지진력 분배용 절점 무게. 표준단면은 sections.ts의 국가별 Gen DB 면적을 사용한다. */
import { profileOf } from '../codes'
import { sectionArea } from './sections'
import type { FactoryModel, FactorySpec } from './types'

/** 절점별 고정하중 무게 (kN): 부재 자중(γ·A·L/2씩 양 끝) + 요소 선하중(마감) 총량/2씩 */
export function nodeWeights(spec: FactorySpec, model: FactoryModel, elemDeadLine: (elemId: number) => number): Map<number, number> {
  const gamma = profileOf(spec.code).materials[spec.material].gamma // kN/m³
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const w = new Map<number, number>()
  const add = (id: number, v: number) => w.set(id, (w.get(id) ?? 0) + v)
  for (const e of model.elements) {
    if (e.addition) continue // Their self-weight is already in the addition source ledger.
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const total = ((e.loadOnly ? 0 : gamma * sectionArea(e.section, spec.code) * 1e-6) + elemDeadLine(e.id)) * len
    add(e.n1, total / 2)
    add(e.n2, total / 2)
  }
  for (const v of model.additions?.seismicWeights ?? []) add(v.node, v.weight)
  return w
}
