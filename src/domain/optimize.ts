/* 단면 자동 최적화 (순수 함수) — 현재 해석 결과로 역할별 최경량 통과 단면을 고른다.
   방법:
   - 후보 = CNS2020 카탈로그(catalog.ts), 단면적(= 단위중량) 오름차순.
   - 강도: 그 역할 부재 전부를 후보 단면으로 바꿔 같은 부재력으로 LRFD 검토(design.ts) → 최대비 ≤ 목표. 미지원 세장 H형강 휨은 제외.
   - 2차부재(퍼린·거트·스트럿·풍주·가새)는 핀 단순보·트러스라 부재력이 자기 단면과 거의 무관 → 한 번에 확정.
   - 골조(기둥·지붕보)는 부재력이 강성비에 따라 재분배되므로 근사 → 액션이 재전송·재해석으로 반복 검증.
     사용성은 현재 해석값을 강성비로 환산해 추정:
       횡변위(X) ∝ 1/k, k = 문형 라멘 횡강성 (고정 주각 24EIc/h³·(12ρ+1)/(12ρ+4), ρ = (Ir/Lr)/(4Ic/h) — Chopra 1.3 /
                                                핀 주각 6EIc/h³·2ρ'/(1+2ρ'), ρ' = (Ir/Lr)/(Ic/h))
       지붕보 처짐 ∝ (5/384 − α/96)/Ir, α = 단부 고정도 ks/(ks + 2EIr/Lr), ks = 4EIc/h(고정)·3EIc/h(핀)
     → 강도 통과 기둥 × 지붕보 조합 중 추정 사용성 ≤ 목표이고 골조 강재량이 최소인 쌍.
   - 가새: 종방향 변위(Y) ∝ 1/A 로 추정해 함께 제한.
   - 퍼린: 활하중 처짐 L/360 직접 계산. */
import type { Results } from '../actions/results'
import { profileOf } from '../codes'
import { CN_CATALOG } from './cnCatalog'
import { KR_CATALOG } from './krCatalog'
import { CATALOG } from './catalog'
import { purlinDefl, purlinLimitDiv, runDesign, type DesignResult, type ServiceCheck } from './design'
import { cnGirtDeflRatio, cnPostDeflRatio } from './cnDesign'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { genSectionRecord, sectionProps } from './sections'
import { blockedMembers } from './validity'
import { runConnections } from './connections'
import { ROLES, type ElementRole, type FactoryModel, type FactorySpec } from './types'

/** 목표 강도비·추정 사용성비 — 1.0 미만으로 두어 재해석 후 재분배·추정 오차 여유 */
export const OPT_TARGET = 0.95

export type Sections = FactorySpec['sections']

export interface OptRow {
  role: ElementRole
  before: string
  after: string
  /** 후보 단면의 추정 최대 강도비 (현재 부재력 기준) */
  ratio: number
  /** 지배: strength = 강도비, service = 사용성, none = 통과 단면 없음(현행 유지) */
  governs: 'strength' | 'service' | 'none'
  /** 역할 강재량 (t) */
  tBefore: number
  tAfter: number
}

export interface OptProposal {
  sections: Sections
  rows: OptRow[]
  changed: boolean
}

/** 반복 1회 기록 — 액션이 쌓는다 */
/** 반복 기록 — weight = 부재 강재량, plateT = 접합 판재, connMax·connNg = 그 반복 결과로 산정한 접합부 */
export interface OptIter { it: number; sections: Sections; weight: number; plateT: number; maxRatio: number; svcMax: number; ng: number; connMax: number; connNg: number; invalid?: number }

/** 최종안 선택 (TW·CN 공통) — 유효 = 부재·사용성 NG 0 이고 접합부 NG 0. 유효안 중 (부재 + 접합 판재) 최경량.
    유효안이 없으면 NG 합(부재·사용성 + 접합) 최소 → 최대비 최소, valid = false 로 알린다. */
export function pickBest(iters: OptIter[]): { best: OptIter; valid: boolean } {
  const valid = iters.filter((x) => x.ng === 0 && x.connNg === 0 && !(x.invalid ?? 0))
  const total = (x: OptIter) => x.weight + x.plateT
  if (valid.length) return { best: valid.reduce((a, x) => (total(x) < total(a) ? x : a)), valid: true }
  const bad = (x: OptIter) => x.ng + x.connNg + (x.invalid ?? 0)
  return { best: iters.reduce((a, x) => (bad(x) < bad(a) || (bad(x) === bad(a) && Math.max(x.maxRatio, x.connMax) < Math.max(a.maxRatio, a.connMax)) ? x : a)), valid: false }
}

export interface OptSummary {
  before: Sections
  after: Sections
  iters: OptIter[]
  rows: OptRow[]
  weightBefore: number
  weightAfter: number
  /** 마지막 제안이 현재 단면과 같아 수렴 */
  converged: boolean
  /** 최종 단면이 강도·사용성·접합부 모두 OK (TW·CN 공통) */
  ok: boolean
}

const svcRatio = (sv: ServiceCheck[], key: ServiceCheck['key']) => sv.find((s) => s.key === key)?.ratio ?? 0

/** 역할별 부재 총길이 (m) */
function roleLengths(model: FactoryModel): Record<ElementRole, number> {
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const L = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<ElementRole, number>
  for (const e of model.elements) {
    if (e.addition) continue
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!
    L[e.role] += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  return L
}

/** 역할별 강재 중량 (t) — 단면적 × 길이 × γ */
export function roleTons(spec: FactorySpec, model: FactoryModel, sections: Sections = spec.sections): Record<ElementRole, number> {
  const L = roleLengths(model)
  const gamma = profileOf(spec.code).materials[spec.material].gamma
  const out = Object.fromEntries(ROLES.map((r) => [r, (gamma * sectionProps(sections[r], spec.code).A * 1e-6 * L[r]) / 9.80665])) as Record<ElementRole, number>
  const nodes = new Map(model.nodes.map((n) => [n.id,n]))
  for (const e of model.elements.filter((e) => e.addition)) {
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!
    out[e.role] += gamma * sectionProps(e.section, spec.code).A * 1e-6 * Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z) / 9.80665
  }
  return out
}

export const steelWeight = (spec: FactorySpec, model: FactoryModel, sections: Sections = spec.sections): number =>
  Object.values(roleTons(spec, model, sections)).reduce((a, b) => a + b, 0)

/** 문형 라멘 횡강성(상대값)·지붕보 처짐 계수(상대값) */
export function frameStiff(spec: FactorySpec, col: string, raf: string) {
  const G = portalGeometry(spec)
  const h = spec.eaveHeight, Lr = G.rafterLen
  const Ic = sectionProps(col, spec.code).Ix, Ir = sectionProps(raf, spec.code).Ix
  const fixed = spec.baseFixity === 'fixed'
  let k: number
  if (fixed) { const rho = Ir / Lr / ((4 * Ic) / h); k = ((24 * Ic) / h ** 3) * ((12 * rho + 1) / (12 * rho + 4)) }
  else { const rho = Ir / Lr / (Ic / h); k = ((6 * Ic) / h ** 3) * ((2 * rho) / (1 + 2 * rho)) }
  const ks = ((fixed ? 4 : 3) * Ic) / h
  const alpha = ks / (ks + (2 * Ir) / Lr)
  return { k, defl: (5 / 384 - alpha / 96) / Ir }
}

/** 반복 제어 — 재해석에서 NG 가 난 단면은 다시 고르지 않는다(진동 방지).
    floors: 역할별 하한 단면적(mm²) — 이 면적 이하 후보 제외 (강도 NG 단면)
    bans:   골조 쌍 금지 — 기둥·지붕보가 모두 금지 쌍 이하 면적이면 제외 (사용성 NG 쌍)
    amp:    역할별 부재력 증폭 학습값 = 재해석 실제 강도비 / 제안 시 추정 강도비 (≥ 1) → 더 가벼운 후보의 목표를 target/amp 로 낮춤 */
export interface OptControl {
  target?: number
  amp?: Partial<Record<ElementRole, number>>
  floors?: Partial<Record<ElementRole, number>>
  bans?: { column: string; rafter: string }[]
}

export function proposeSections(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results, design: DesignResult, ctl: OptControl = {}): OptProposal {
  const target = ctl.target ?? OPT_TARGET
  const cur = spec.sections
  const present = ROLES.filter((r) => model.elements.some((e) => e.role === r))
  const L = roleLengths(model)
  const gamma = profileOf(spec.code).materials[spec.material].gamma
  const tons = (r: ElementRole, sec: string) => (gamma * sectionProps(sec, spec.code).A * 1e-6 * L[r]) / 9.80665
  const byArea = (r: ElementRole) => [...(spec.code === 'CN' ? CN_CATALOG : spec.code === 'KR' ? KR_CATALOG : CATALOG)[r]]
    .filter((s) => !genSectionRecord(s, spec.code)?.excluded)
    .filter((s) => sectionProps(s, spec.code).A > (ctl.floors?.[r] ?? 0) + 1e-6)
    .sort((a, b) => sectionProps(a, spec.code).A - sectionProps(b, spec.code).A)
  const A = (s: string) => sectionProps(s, spec.code).A
  /* 증폭은 현재(해석된) 단면보다 가벼운 후보에만 — 무거운 후보는 부재력이 줄어드는 쪽이고, 현재 부재력에 이미 재분배가 들어 있다 */
  const tgt = (r: ElementRole, sec: string) => (A(sec) < A(cur[r]) - 1e-6 ? target / Math.max(1, ctl.amp?.[r] ?? 1) : target)
  const banned = (c: string, r: string) => (ctl.bans ?? []).some((b) => A(c) <= A(b.column) + 1e-6 && A(r) <= A(b.rafter) + 1e-6)

  /** 역할 r 을 sec 로 바꿨을 때 강도 최대비 (세장 H 는 Infinity) */
  const strength = (r: ElementRole, sec: string, base: Sections = cur): number => {
    const sections = { ...base, [r]: sec }
    const m: FactoryModel = { ...model, elements: model.elements.map((e) => (!e.addition && e.role === r ? { ...e, section: sec } : e)) }
    const d = runDesign({ ...spec, sections }, m, info, res, [r])
    if (blockedMembers(d)) return Infinity
    if (sectionProps(sec, spec.code).kind === 'H' && d.members.some((x) => x.cap.compact === 'slender')) return Infinity
    /* 기둥: 13.4.1 축력(면제 아닐 때) 포함 */
    return r === 'column' && d.col13 && !d.col13.exempt ? Math.max(d.maxRatio, d.col13.ratio) : d.maxRatio
  }

  const sections: Sections = { ...cur }
  const rows: OptRow[] = []
  const push = (r: ElementRole, after: string, ratio: number, governs: OptRow['governs']) => {
    sections[r] = after
    rows.push({ role: r, before: cur[r], after, ratio, governs, tBefore: tons(r, cur[r]), tAfter: tons(r, after) })
  }

  /* ── 2차부재: 강도(+ 퍼린 처짐, 가새 종방향 변위) 통과 최경량 ── */
  const sv = design.service
  const driftY = Math.max(svcRatio(sv, 'windDriftY'), svcRatio(sv, 'seisDriftY'))
  const braceA0 = sectionProps(cur.brace, spec.code).A
  for (const r of present.filter((x) => x !== 'column' && x !== 'rafter')) {
    let pick: string | null = null, ratio = 0, governs: OptRow['governs'] = 'strength'
    for (const sec of byArea(r)) {
      const s = strength(r, sec)
      if (s > tgt(r, sec)) continue
      if (r === 'purlin' && purlinDefl(spec, info, sec) / (spec.baySpacing / purlinLimitDiv(spec.code)) > target) { governs = 'service'; continue }
      if (r === 'brace' && (driftY * braceA0) / sectionProps(sec, spec.code).A > target) { governs = 'service'; continue }
      if (spec.code === 'CN' && ((r === 'girt' && cnGirtDeflRatio(spec, info, sec) > target) || (r === 'post' && cnPostDeflRatio(spec, info, sec) > target))) { governs = 'service'; continue }
      pick = sec; ratio = s
      break
    }
    if (pick) push(r, pick, ratio, governs)
    else push(r, cur[r], strength(r, cur[r]), 'none')
  }

  /* ── 골조: 강도 통과 목록 × 추정 사용성 → 최소 강재량 쌍 ── */
  if (present.includes('column') && present.includes('rafter')) {
    const passC = byArea('column').map((s) => ({ s, r: strength('column', s) })).filter((x) => x.r <= tgt('column', x.s))
    const passR = byArea('rafter').map((s) => ({ s, r: strength('rafter', s) })).filter((x) => x.r <= tgt('rafter', x.s))
    const f0 = frameStiff(spec, cur.column, cur.rafter)
    const driftX = Math.max(svcRatio(sv, 'windDriftX'), svcRatio(sv, 'seisDriftX'))
    const defl = svcRatio(sv, 'rafterDefl')
    let best: { c: (typeof passC)[0]; r: (typeof passR)[0]; t: number } | null = null
    let svcLimited = false
    for (const c of passC) for (const r of passR) {
      if (banned(c.s, r.s)) continue
      const t = tons('column', c.s) + tons('rafter', r.s)
      if (best && t >= best.t) continue
      const f = frameStiff(spec, c.s, r.s)
      if ((driftX * f0.k) / f.k > target || (defl * f.defl) / f0.defl > target) { svcLimited = true; continue }
      // Check the available connection layout while choosing the frame pair.
      // A stronger beam alone does not ensure an eight-bolt end plate can pass.
      const candidate = { ...spec, sections: { ...sections, column: c.s, rafter: r.s } }
      const candidateModel = { ...model, elements: model.elements.map((e) => ({ ...e, section: e.addition ? e.section : candidate.sections[e.role] })) }
      if (runConnections(candidate, candidateModel, info, res).some((x) => x.type !== 'brace' && x.ratio > 1)) continue
      best = { c, r, t }
    }
    if (best) {
      /* 서로 K(정렬도)에 영향 → 짝 단면 기준으로 강도비 재평가해 표시 */
      const gov = (x: number) => (svcLimited && x < target * 0.9 ? 'service' : 'strength')
      const rc = strength('column', best.c.s, { ...cur, rafter: best.r.s }), rr = strength('rafter', best.r.s, { ...cur, column: best.c.s })
      push('column', best.c.s, rc, gov(rc))
      push('rafter', best.r.s, rr, gov(rr))
    } else {
      push('column', cur.column, strength('column', cur.column), 'none')
      push('rafter', cur.rafter, strength('rafter', cur.rafter), 'none')
    }
  }

  rows.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role))
  return { sections, rows, changed: ROLES.some((r) => sections[r] !== cur[r]) }
}
