/* 단면 최적화 (순수) — 종류별(기둥·보·가새) 한 단면 체계에서, 현재 부재력으로 각 종류의 가장 가벼운 GB-YB05 압연 H 를 고른다.
   조건: 모든 부재 강도·안정 비 ≤ OPT_TARGET, 구조 규정(세장비·판폭두께비) ≤ 1. 계산길이 μ 는 후보 단면으로 다시 계산
   (보 → 기둥 K 반영 순서: 보 → 기둥 → 가새). 부재력 재분배·층간변위는 Gen 재해석으로 확인한다(actions/frame.ts optimizeFrame).
   후보 계열: 기둥·가새 HW·HM(양축 강성), 보 HN·HM·HW. */
import { hSection, designMembers, memberFails, runFrameDesign, type FrameDesign } from './design'
import { buildFrame, elementLength } from './geometry'
import { frameSectionNames } from './sections'
import type { ElementForces } from './results'
import type { StoryItem } from './story'
import type { FrameModel, FrameRole, FrameSpec } from './types'

export const OPT_TARGET = 0.95
export const OPT_MAX_ITER = 5
export type FrameSections = FrameSpec['sections']
export const OPT_ORDER: FrameRole[] = ['beam', 'column', 'brace']

export interface FrameOptIter { it: number; sections: FrameSections; weight: number; maxRatio: number; ng: number; driftOk: boolean }
export interface FrameOptRow { role: FrameRole; before: string; after: string; ratio: number | null; tBefore: number; tAfter: number }
export interface FrameOptSummary {
  rows: FrameOptRow[]; iters: FrameOptIter[]; weightBefore: number; weightAfter: number
  /** converged = 제안이 현재와 같음, cycle = 이미 거친 조합, max_iter, none_valid = 통과 상태 없음(가장 나은 것 유지) */
  end: 'converged' | 'cycle' | 'max_iter' | 'none_valid'
}

const FAMILY: Record<FrameRole, RegExp> = { column: /^H[WM] /, beam: /^H[NMW] /, brace: /^H[WM] / }
/** 종류별 후보 — 면적 오름차순 */
export function candidatesFor(role: FrameRole): string[] {
  return frameSectionNames().filter((n) => FAMILY[role].test(n)).map((n) => ({ n, A: hSection(n).A })).sort((a, b) => a.A - b.A).map((x) => x.n)
}

/** 강재 중량 (t) — 요소 길이 × 단면적 × 7.85 t/m³ */
export function frameWeight(model: FrameModel, sections?: FrameSections): number {
  return model.elements.reduce((a, e) => a + hSection(sections ? sections[e.role] : e.section).A * 1e-6 * elementLength(model, e) * 7.85, 0)
}
export const roleWeight = (model: FrameModel, role: FrameRole, section: string) =>
  model.elements.filter((e) => e.role === role).reduce((a, e) => a + hSection(section).A * 1e-6 * elementLength(model, e) * 7.85, 0)

export const sectionsKey = (s: FrameSections) => OPT_ORDER.map((r) => s[r]).join('|')

export interface Proposal { sections: FrameSections; ratio: Record<FrameRole, number | null>; fits: Record<FrameRole, boolean> }

/** 형상은 단면과 무관 — 같은 모델에서 종류별 단면만 바꾼다 (요소 번호 동일 → 부재력 그대로 사용) */
export const withSections = (model: FrameModel, sections: FrameSections): FrameModel => ({ ...model, elements: model.elements.map((e) => ({ ...e, section: sections[e.role] })) })

/** 현재 부재력으로 종류별 최경량 단면 제안. minArea = 종류별 하한(층간변위 초과 뒤 기둥·가새를 키울 때) */
export function proposeSections(spec: FrameSpec, forces: ElementForces, combos: { name: string; seismic: boolean }[], colStrongAxis: 'X' | 'Y',
  minArea: Partial<Record<FrameRole, number>> = {}): Proposal {
  const base = buildFrame(spec)
  const sections = { ...spec.sections }
  const ratio = { column: null, beam: null, brace: null } as Proposal['ratio'], fits = { column: true, beam: true, brace: true }
  for (const role of OPT_ORDER) {
    if (!base.elements.some((e) => e.role === role)) continue
    let best: { name: string; score: number; ratio: number } | null = null
    let found = false
    for (const name of candidatesFor(role)) {
      if (hSection(name).A < (minArea[role] ?? 0)) continue
      const trial: FrameSpec = { ...spec, sections: { ...sections, [role]: name } }
      const members = designMembers(trial, withSections(base, trial.sections), colStrongAxis).filter((m) => m.role === role)
      const d = runFrameDesign(trial, members, forces, combos)
      const r = Math.max(...d.members.map((m) => m.ratio)), det = Math.max(...d.members.map((m) => m.detailRatio))
      const score = Math.max(r / OPT_TARGET, det)
      if (score <= 1) { sections[role] = name; ratio[role] = r; found = true; break }
      if (!best || score < best.score) best = { name, score, ratio: r }
    }
    if (!found && best) { sections[role] = best.name; ratio[role] = best.ratio; fits[role] = false }
  }
  return { sections, ratio, fits }
}

/** 한 회 결과 기록 — 화면·스크립트 공용 */
export function optIter(it: number, spec: FrameSpec, model: FrameModel, review: StoryItem[], design: FrameDesign): FrameOptIter {
  return {
    it, sections: { ...spec.sections }, weight: frameWeight(model),
    maxRatio: Math.max(...design.members.map((m) => Math.max(m.ratio, m.detailRatio))),
    ng: design.members.filter(memberFails).length,
    driftOk: !review.some((i) => i.key === 'drift' && i.status === 'ng'),
  }
}

/** 최종 상태 — 통과(NG 0, 층간변위 OK) 중 가장 가벼운 것. 없으면 NG 가 가장 적고 최대비가 작은 것 */
export function pickBest(iters: FrameOptIter[]): { best: FrameOptIter; valid: boolean } {
  const ok = iters.filter((i) => i.ng === 0 && i.driftOk)
  if (ok.length) return { best: ok.reduce((a, b) => (b.weight < a.weight - 1e-9 ? b : a)), valid: true }
  return { best: iters.reduce((a, b) => (b.ng < a.ng || (b.ng === a.ng && b.maxRatio < a.maxRatio) ? b : a)), valid: false }
}

export function optSummary(model: FrameModel, iters: FrameOptIter[], final: FrameOptIter, finalRatio: Record<FrameRole, number | null>, end: FrameOptSummary['end']): FrameOptSummary {
  const first = iters[0]
  const roles = (['column', 'beam', 'brace'] as const).filter((r) => model.elements.some((e) => e.role === r))
  return {
    rows: roles.map((role) => ({ role, before: first.sections[role], after: final.sections[role], ratio: finalRatio[role], tBefore: roleWeight(model, role, first.sections[role]), tAfter: roleWeight(model, role, final.sections[role]) })),
    iters, weightBefore: first.weight, weightAfter: final.weight, end,
  }
}

export interface OptState { spec: FrameSpec; forces: ElementForces; combos: { name: string; seismic: boolean }[]; colStrongAxis: 'X' | 'Y' }
/** 최적화 반복 (화면 actions/frame.ts 와 scripts/live-frame.ts --opt 공용). evaluate = 그 단면으로 Gen 재생성·해석·검토 후 상태 기록.
    반환 best 가 마지막 evaluate 상태와 다르면 호출자가 best 단면으로 한 번 더 evaluate 한다 */
export async function optimizeLoop(o: {
  start: FrameOptIter; state(): OptState; evaluate(sections: FrameSections, it: number): Promise<FrameOptIter>
  onPropose?(it: number, p: Proposal): void; beforeIter?(it: number): void
}): Promise<{ iters: FrameOptIter[]; best: FrameOptIter; valid: boolean; end: 'converged' | 'cycle' | 'max_iter' }> {
  const iters = [o.start]
  const seen = new Set([sectionsKey(o.start.sections)])
  const minArea: Partial<Record<FrameRole, number>> = {}
  let end: 'converged' | 'cycle' | 'max_iter' = 'max_iter'
  for (let it = 1; it <= OPT_MAX_ITER; it++) {
    o.beforeIter?.(it)
    const cur = o.state(), last = iters[iters.length - 1]
    /* 층간변위 초과 → 기둥·가새는 지금보다 큰 단면만 */
    if (!last.driftOk) for (const r of ['column', 'brace'] as const) minArea[r] = Math.max(minArea[r] ?? 0, hSection(cur.spec.sections[r]).A + 1)
    const prop = proposeSections(cur.spec, cur.forces, cur.combos, cur.colStrongAxis, minArea)
    const key = sectionsKey(prop.sections)
    if (key === sectionsKey(cur.spec.sections)) { end = 'converged'; break }
    if (seen.has(key)) { end = 'cycle'; break }
    seen.add(key)
    o.onPropose?.(it, prop)
    iters.push(await o.evaluate(prop.sections, it))
  }
  const { best, valid } = pickBest(iters)
  return { iters, best, valid, end }
}
