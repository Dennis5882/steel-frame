/* 부재 일람·물량 (순수 함수) — 역할·단면별 개수, 총길이, 강재 중량 (단위중량 = 재료 γ × 단면적) */
import { profileOf } from '../codes'
import { sectionProps } from './sections'
import { ROLES, type ElementRole, type FactoryModel, type FactorySpec } from './types'

export interface ScheduleRow { addition?: import('./additionTypes').AdditionUsage; role: ElementRole; section: string; count: number; length: number; kgPerM: number; weight: number }

export function memberSchedule(spec: FactorySpec, model: FactoryModel): { rows: ScheduleRow[]; total: number } {
  const gamma = profileOf(spec.code).materials[spec.material].gamma // kN/m³
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const map = new Map<string, ScheduleRow>()
  const counted = new Set<string>()
  for (const e of model.elements) {
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const key = `${e.role}|${e.section}|${e.addition ?? ''}`
    let r = map.get(key)
    if (!r) {
      const kgPerM = (gamma * sectionProps(e.section, spec.code).A * 1e-6 * 1000) / 9.80665 // kN/m → kg/m
      r = { addition:e.addition, role: e.role, section: e.section, count: 0, length: 0, kgPerM, weight: 0 }
      map.set(key, r)
    }
    const physical = `${key}|${e.physicalKey ?? e.id}`
    if (!counted.has(physical)) { r.count++; counted.add(physical) }
    r.length += L
  }
  const rows = [...map.values()].map((r) => ({ ...r, weight: (r.kgPerM * r.length) / 1000 })) // t
    .sort((x, y) => ROLES.indexOf(x.role) - ROLES.indexOf(y.role))
  return { rows, total: rows.reduce((s, r) => s + r.weight, 0) }
}
