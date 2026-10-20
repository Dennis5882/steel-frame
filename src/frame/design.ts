/* 다층 강골조 부재 검토 실행 (순수) — 요소력 → 설계 부재 → GB 50017/50011 검토 (codes/cnFrameSteel.ts).
   - 보: 분할된 요소를 원래 보 하나로 합침 (Gen 「指定构件 自动」과 같은 취지). 가새 꼭짓점이 있는 보는 GB 50011 8.4.2-3 에 따라
     그 점을 횡지지점으로 보고 l1 = L/2, βb = 表C.0.1 항5.
   - 기둥: μ = 附录 E.0.1 (无侧移, 가새 방향·예제 설정) 또는 E.0.2 (有侧移, 가새 없는 방향), K = Σ(Ib/lb)/Σ(Ic/lc), 고정 기초 K2 = 10. 강축이 받는 보 방향은 colStrongAxis.
   - 가새: 양단 μ = 1 (부재 길이). */
import { checkMember, memberStatic, type ComboCheck, type HSection, type MemberInput, type MemberStatic, type Station, muNoSway, muSway } from '../codes/cnFrameSteel'
import { genSectionRecord, sectionProps } from '../domain/sections'
import { elementLength } from './geometry'
import type { ElementForces } from './results'
import type { FrameElement, FrameModel, FrameRole, FrameSpec } from './types'

export function hSection(name: string): HSection {
  const p = sectionProps(name, 'CN')
  if (p.kind !== 'H') throw new Error(`H section required: ${name}`)
  const r = (genSectionRecord(name, 'CN') as { r1?: number } | undefined)?.r1 ?? 0
  return { name, d: p.d, bf: p.bf, tw: p.tw, tf: p.tf, r, A: p.A, Ix: p.Ix, Iy: p.Iy, Wx: p.Sx, Wy: p.Sy, ix: p.rx, iy: p.ry, rolled: p.rolled }
}

export interface DesignMember {
  id: number; role: FrameRole; section: string; story: number; elements: number[]
  L: number; muX: number; muY: number; K?: { x: [number, number]; y: [number, number] }
}

/** 설계 부재 구성 + 기둥 μ. colStrongAxis = 기둥 강축 휨이 일어나는 골조 방향 (Gen 기본 국부축: 'X') */
export function designMembers(spec: FrameSpec, model: FrameModel, colStrongAxis: 'X' | 'Y' = 'X'): DesignMember[] {
  const byMember = new Map<number, FrameElement[]>()
  for (const e of model.elements) (byMember.get(e.member) ?? byMember.set(e.member, []).get(e.member)!).push(e)
  const memberLen = (els: FrameElement[]) => els.reduce((a, e) => a + elementLength(model, e), 0)

  /* 절점에 모이는 보(부재 단위)·기둥 강성 */
  /* 보 강성을 골조 방향 성분으로: 축 방향 보는 그 방향 1, 삼각 패널 대각선 보는 방향 코사인² (cos²θ + sin²θ = 1) 로 X·Y 에 나눔 */
  const beamAt = new Map<number, { X: number; Y: number }[]>()
  const nodeOf = new Map(model.nodes.map((n) => [n.id, n]))
  for (const els of byMember.values()) {
    if (els[0].role !== 'beam') continue
    const L = memberLen(els), sec = hSection(els[0].section), k = sec.Ix / (L * 1000)
    const ends = [els[0].n1, els[els.length - 1].n2]
    const a = nodeOf.get(ends[0])!, b = nodeOf.get(ends[1])!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1
    const share = els[0].axis ? { X: els[0].axis === 'X' ? k : 0, Y: els[0].axis === 'Y' ? k : 0 } : { X: k * dx * dx / l2, Y: k * dy * dy / l2 }
    for (const nd of ends) (beamAt.get(nd) ?? beamAt.set(nd, []).get(nd)!).push(share)
  }
  const colsAt = new Map<number, FrameElement[]>()
  for (const e of model.elements) if (e.role === 'column') for (const nd of [e.n1, e.n2]) (colsAt.get(nd) ?? colsAt.set(nd, []).get(nd)!).push(e)
  const supports = new Set(model.supports)
  const K = (node: number, axis: 'X' | 'Y', strong: boolean) => {
    if (supports.has(node)) return 10
    const kb = (beamAt.get(node) ?? []).reduce((a, b) => a + b[axis], 0)
    const kc = (colsAt.get(node) ?? []).reduce((a, c) => { const s = hSection(c.section); return a + (strong ? s.Ix : s.Iy) / (elementLength(model, c) * 1000) }, 0)
    return kc > 0 ? kb / kc : 0
  }

  const out: DesignMember[] = []
  for (const [id, els] of byMember) {
    const e0 = els[0], L = memberLen(els)
    const m: DesignMember = { id, role: e0.role, section: e0.section, story: e0.story, elements: els.map((e) => e.id), L, muX: 1, muY: 1 }
    if (e0.role === 'column') {
      const top = e0.n2, bot = e0.n1, weakAxis = colStrongAxis === 'X' ? 'Y' : 'X'
      const kx: [number, number] = [K(top, colStrongAxis, true), K(bot, colStrongAxis, true)]
      const ky: [number, number] = [K(top, weakAxis, false), K(bot, weakAxis, false)]
      m.K = { x: kx, y: ky }
      m.muX = spec.design.braced[colStrongAxis] ? muNoSway(...kx) : muSway(...kx)
      m.muY = spec.design.braced[weakAxis] ? muNoSway(...ky) : muSway(...ky)
    }
    out.push(m)
  }
  return out
}

export interface MemberDesign extends DesignMember {
  st: MemberStatic
  /** 하중조합 중 최대 */
  worst: ComboCheck
  ratio: number
  /** 구조 규정 (세장비·판폭두께비) 최대 비 */
  detailRatio: number
}

/** 한계 초과 (강도·안정 또는 구조 규정) — 화면·최적화·계산서·스크립트 공통 판정 */
export const memberFails = (m: Pick<MemberDesign, 'ratio' | 'detailRatio'>) => m.ratio > 1 || m.detailRatio > 1

export interface FrameDesign {
  members: MemberDesign[]
  byRole: Record<FrameRole, MemberDesign | null>
  /** 조합 이름 → 지진 여부 */
  combos: { name: string; seismic: boolean }[]
}

/** 부재 위치력: 보는 요소들을 이어 붙임 (요소 사이 중복점 제거) */
function stationsOf(m: DesignMember, forces: ElementForces, load: string): Station[] | null {
  const out: Station[] = []
  for (const [i, id] of m.elements.entries()) {
    const s = forces.get(id)?.get(load)
    if (!s) return null
    out.push(...(i === 0 ? s : s.slice(1)))
  }
  return out
}

export function runFrameDesign(spec: FrameSpec, members: DesignMember[], forces: ElementForces, combos: { name: string; seismic: boolean }[]): FrameDesign {
  /* Gen 이 RS 조합을 max/min 두 하중명으로 줄 수 있어, 요소력에 실제로 있는 하중명을 조합 이름 접두로 매칭 */
  const loadsSeen = new Set<string>()
  for (const m of forces.values()) for (const k of m.keys()) loadsSeen.add(k)
  const loadList = [...loadsSeen]
  const comboOf = (load: string) => combos.find((c) => load === c.name || load.startsWith(c.name + '(') || load.startsWith(c.name + ' '))

  const results: MemberDesign[] = []
  for (const m of members) {
    const section = hSection(m.section)
    const midSupport = m.role === 'beam' && m.elements.length > 1
    const input: MemberInput = {
      role: m.role, section, grade: spec.material, L: m.L, muX: m.muX, muY: m.muY,
      l1: midSupport ? m.L / 2 : m.L, midLateralSupport: midSupport,
      netArea: spec.design.netAreaRatio, seismicGrade: spec.design.seismicGrade,
    }
    const st = memberStatic(input)
    let worst: ComboCheck | null = null
    for (const load of loadList) {
      const c = comboOf(load)
      if (!c) continue
      const s = stationsOf(m, forces, load)
      if (!s) continue
      const r = checkMember(input, st, load, c.seismic, s)
      if (!worst || r.ratio > worst.ratio) worst = r
    }
    if (!worst) throw new Error(`no forces for member ${m.id} (${m.role})`)
    const detailRatio = Math.max(0, ...st.detailing.map((d) => d.ratio), ...worst.items.filter((i) => i.key === 'web' && i.clause.startsWith('GB/T 50011')).map((i) => i.ratio))
    results.push({ ...m, st, worst, ratio: worst.ratio, detailRatio })
  }
  const byRole = { column: null, beam: null, brace: null } as FrameDesign['byRole']
  for (const r of results) if (!byRole[r.role] || r.ratio > byRole[r.role]!.ratio) byRole[r.role] = r
  return { members: results, byRole, combos }
}
