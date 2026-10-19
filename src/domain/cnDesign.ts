/* GB-only member and service checks. Generic result shape is shared with TW,
   while all resistance factors, equations, lengths and limits live here.
   Portal-frame rules from GB 51022-2015: 3.3 deformation limits, 3.4.2 slenderness, A.0.6 leaning-column η. */
import { cnCapacity, cnCheck, cnK } from '../codes/cnSteel'
import { cnStrength } from '../codes/cn'
import { DRIFT_CN, GIRT_DEFL_CN, POST_DEFL_CN, BETA_FRAME_CN, ccWallCN, edgeACN, effAreaCN, isSeismicCN, leanEtaCN, mwLongCN, slenderLimitCN } from '../codes/cnPortal'
import type { Results } from '../actions/results'
import { purlinDefl, type DesignResult, type MemberCheck, type ServiceCheck, type CCSummary } from './design'
import type { FactorySpec, FactoryModel, ElementRole } from './types'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { roofDeflection } from './roofDeflection'
import { sagCount, support } from './validity'
import { sectionProps } from './sections'
import { ccQCN, cnCCLoads } from './cnSecondary'
import { validateDesignResults } from './resultValidation'

const E_CN = 206000e3 // kPa
const RE = { strength: .85, stability: .9 } // GB 51022 표 3.1.5

/** 거트 수평 처짐비 (처짐 / (L/100)) — 표 3.3.2, 외장재 풍압(β 1.5, 표 4.2.2-3 최악 구역 5) 단순보, 강축 */
export function cnGirtDeflRatio(spec: FactorySpec, info: LoadInfo, section: string): number {
  const G = portalGeometry(spec), L = Math.max(...G.spans), trib = Math.max(...G.eaveXs.map((x) => G.gWallAt(x)))
  const mu = ccWallCN('5', effAreaCN(L, trib)), w = ccQCN(spec, info.wind.hRef) * Math.max(-mu.neg, mu.pos) * trib
  return 5 * w * L ** 4 / (384 * E_CN * sectionProps(section, spec.code).Ix * 1e-12) / (L * GIRT_DEFL_CN)
}
/** 풍주 수평 처짐비 (처짐 / (h/250)) — 표 3.3.2, 주골조 박공벽 μw 최대(표 4.2.2-2 1E·1·4E·4·5, β 1.1) × 풍주 간격, 단순보(보수적) */
export function cnPostDeflRatio(spec: FactorySpec, info: LoadInfo, section: string): number {
  const G = portalGeometry(spec)
  if (!G.postXs.length) return 0
  const endW = info.cn?.endZone ?? 2 * edgeACN(Math.min(spec.span, G.length), info.wind.hRef)
  const I = sectionProps(section, spec.code).Ix * 1e-12, q = BETA_FRAME_CN * info.wind.qh
  return Math.max(...G.postXs.map((x) => {
    const end = x <= endW || x >= spec.span - endW
    const mu = Math.max(...(['+i', '-i'] as const).flatMap((i) => (end ? ['1E', '4E', '5'] as const : ['1', '4', '5'] as const).map((z) => Math.abs(mwLongCN(i, z)))))
    const h = G.zAt(x), w = q * mu * spec.postSpacing
    return 5 * w * h ** 4 / (384 * E_CN * I) / (h * POST_DEFL_CN)
  }))
}

export function runCnDesign(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results, roles?: readonly ElementRole[]): DesignResult {
  validateDesignResults(spec, model, info, res, roles)
  const G = portalGeometry(spec), nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const col = sectionProps(spec.sections.column, spec.code), raf = sectionProps(spec.sections.rafter, spec.code)
  /* 기둥 열마다 높이 = 그 열 처마 높이 (편경사 좌우 다름) */
  const Kat = new Map(G.eaveXs.map((x) => [x, cnK((col.Ix / G.zAt(x)) / (raf.Ix / G.rafterLen), spec.baseFixity === 'fixed')]))
  /* 부록 A.0.6 — 흔들림 기둥이 있으면 조합별 η = √(1 + Σ(N/h)흔들림 / (1.1·Σ(P/H)강접)), 기초 쪽 기둥 요소 축력 */
  const baseCols = model.elements.filter((e) => e.role === 'column' && (nodes.get(e.n1)!.z === 0 || nodes.get(e.n2)!.z === 0))
  const etaCache = new Map<string, number>()
  const etaOf = (combo: string) => {
    if (!G.leanXs.length) return 1
    let v = etaCache.get(combo)
    if (v === undefined) {
      let lean = 0, rigid = 0
      for (const e of baseCols) {
        const pts = res.beam.get(e.id)?.get(combo) ?? [], N = Math.max(0, ...pts.map((p) => -p.P)), x = nodes.get(e.n1)!.x
        if (e.lean) lean += N / G.zAt(x); else rigid += N / G.zAt(x)
      }
      v = leanEtaCN(lean, rigid); etaCache.set(combo, v)
    }
    return v
  }
  const cc = cnCCLoads(spec, model, info), members: MemberCheck[] = [], service: ServiceCheck[] = []
  for (const e of model.elements) {
    if (roles && !roles.includes(e.role)) continue
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!, sp = sectionProps(e.section, spec.code)
    const L = 1000 * (e.designLength ?? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
    const secL = Math.min(L, 1000 * spec.baySpacing / (sagCount(spec) + 1))
    const flyL = support(spec, 'flyBraces') === 'none' ? 1000 * (e.role === 'rafter' ? G.slopeLen : G.zAt(a.x)) : L
    const lensOf = (combo: string) => e.role === 'column' ? { KLx: (e.lean ? 1 : Kat.get(a.x)! * etaOf(combo)) * G.zAt(a.x) * 1000, KLy: flyL, Lb: flyL } // 흔들림 기둥 K = 1
      : e.role === 'rafter' ? { KLx: G.slopeLen * 1000, KLy: flyL, Lb: flyL }
      : e.role === 'purlin' || e.role === 'girt' ? { KLx: L, KLy: secL, Lb: secL }
      : e.role === 'post' ? { KLx: G.zAt(a.x) * 1000, KLy: flyL, Lb: flyL } : { KLx: L, KLy: L, Lb: L }
    const material = e.role === 'purlin' || e.role === 'girt' ? spec.secondaryMaterial ?? 'Q235B' : spec.material
    let best: MemberCheck | undefined
    let compression = false, maxSlender = 0
    const consider = (combo: string, part: number, forces: MemberCheck['forces']) => {
      const lens = lensOf(combo)
      if (forces.P < -1e-6) { compression = true; maxSlender = Math.max(maxSlender, lens.KLx / sp.rx, lens.KLy / sp.ry) }
      const cap = cnCapacity(sp, material, lens, Math.max(0, -forces.P))
      const sw = res.sway.get(combo)
      let sway = 1
      if ((e.role === 'column' || e.role === 'rafter') && sw) for (const d of ['X', 'Y'] as const) {
        const s = sw[d], theta = s.sumH > 1e-8 ? s.sumPu * s.drift / (s.sumH * spec.eaveHeight) : 0
        sway = Math.max(sway, theta >= 1 ? 99 : 1 / (1 - theta))
      }
      const chk = cnCheck(cap, forces, sway, isSeismicCN(combo) ? RE : undefined)
      if (!best || chk.ratio > best.ratio) best = { id: e.id, role: e.role, section: e.section, ratio: chk.ratio, combo, part, eq: chk.eq, forces, cap, B: chk.B, Cb: 1, lengths: lens, slender: { value: 0, limit: 0 }, notes: cap.notes }
    }
    if (e.role === 'brace') for (const [combo, P] of res.truss.get(e.id) ?? []) consider(combo, -1, { P, Mx: 0, My: 0, V: 0 })
    else for (const [combo, pts] of res.beam.get(e.id) ?? []) for (const [part, p] of pts.entries()) consider(combo, part, { P: p.P, Mx: Math.abs(p.My), My: Math.abs(p.Mz) * (e.role === 'purlin' || e.role === 'girt' ? 1 / (sagCount(spec) + 1) ** 2 : 1), V: Math.abs(p.Vz) })
    for (const d of cc.get(e.id)?.demands ?? []) consider(d.combo, 2, d.f)
    if (!best) throw new Error(`GB: missing analysis forces for element ${e.id}`)
    const m = best as MemberCheck
    /* GB 51022 표 3.4.2: 압축 — 주요 부재(기둥·지붕보·풍주) 180, 기타·가새 220 / 인장 가새 400. 가새는 교차점 지지 미인정(전 길이) */
    const primary = e.role === 'column' || e.role === 'rafter' || e.role === 'post'
    const L0 = lensOf('')
    m.slender = { value: compression ? maxSlender : Math.max(L0.KLx / sp.rx, L0.KLy / sp.ry), limit: slenderLimitCN(primary, compression) }
    if (m.slender.value / m.slender.limit > m.ratio) { m.ratio = m.slender.value / m.slender.limit; m.eq = 'GB 51022 3.4.2' }
    /* 3.4.3 지진 조합이 지배하면 내진 구조 조치 — H 플랜지 b/t ≤ 13εk, 웨브 hw/tw ≤ 160, 기둥 λ ≤ 150 */
    if (isSeismicCN(m.combo) && sp.kind === 'H' && (primary || e.role === 'strut')) {
      const eps = Math.sqrt(235 / cnStrength(material, Math.max(sp.tw, sp.tf)).fy)
      const r = Math.max((sp.bf - sp.tw) / 2 / sp.tf / (13 * eps), sp.h / sp.tw / 160, e.role === 'column' ? maxSlender / 150 : 0)
      if (r > m.ratio) { m.ratio = r; m.eq = 'GB 51022 3.4.3' }
    }
    members.push(m)
  }
  if (!roles) {
    const eaves = model.nodes.filter(G.isEaveNode)
    const disp = (lc: string, id: number) => {
      const v = res.disp.get(lc)?.get(id)
      if (!v || ![v.dx, v.dy, v.dz].every(Number.isFinite)) throw new Error(`GB: missing/invalid service displacement ${lc}, node ${id}`)
      return v
    }
    const push = (key: ServiceCheck['key'], value: number, limit: number, lc: string, clause: string) => service.push({ key, value, limit, ratio: value / limit, case: lc, clause })
    /* 표 3.3.1 기둥 상단 변위 h/60 (무크레인·경량 강판 벽) — 풍·다우지진 모두, h = 그 기둥 높이 */
    for (const [d, comp, wk, ek] of [['X', 'dx', 'windDriftX', 'seisDriftX'], ['Y', 'dy', 'windDriftY', 'seisDriftY']] as const) {
      let max = 0, at = ''
      for (const w of info.wind.variants) for (const n of eaves) { const v = Math.abs(disp(w.tag, n.id)[comp]) / n.z; if (v > max) { max = v; at = w.tag } }
      push(wk, max, DRIFT_CN, at, 'GB 51022 3.3.1: no crane, light steel cladding h/60')
      if (!res.disp.get(`E${d}`)) throw new Error(`GB: missing service displacement E${d}`)
      push(ek, Math.max(0, ...eaves.map((n) => Math.abs(disp(`E${d}`, n.id)[comp]) / n.z)), DRIFT_CN, `E${d}`, 'GB 51022 3.3.1: frequent earthquake h/60')
    }
    /* 표 3.3.2 지붕보 L/180 — L = 그 경간 전체(주 2), 처짐 = 마루(편坡는 경간 중앙) − 양쪽 기둥 상단 평균 */
    service.push({ key: 'rafterDefl', ...roofDeflection(spec, model, res, [...res.disp.keys()].filter((x) => x === 'LR' || /^(SN|SV|SH)/.test(x)), 180, true), clause: 'GB 51022 3.3.2: rafter, profiled roof L/180 (full span)' })
    push('purlinDefl', purlinDefl(spec, info, spec.sections.purlin), spec.baySpacing / 150, 'D+max(LR,S peak)', 'GB 51022 3.3.2: purlin, profiled roof L/150')
    const gL = Math.max(...G.spans)
    push('girtDefl', cnGirtDeflRatio(spec, info, spec.sections.girt) * gL * GIRT_DEFL_CN, gL * GIRT_DEFL_CN, 'W (C&C, β 1.5)', 'GB 51022 3.3.2: girt, profiled wall L/100')
    if (G.postXs.length) {
      const hp = Math.max(...G.postXs.map((x) => G.zAt(x)))
      push('postDefl', cnPostDeflRatio(spec, info, spec.sections.post) * hp * POST_DEFL_CN, hp * POST_DEFL_CN, 'W (gable wall)', 'GB 51022 3.3.2: wind post L/250 (simply supported)')
    }
  }
  const byRole: DesignResult['byRole'] = {}
  for (const m of members) if (!byRole[m.role] || m.ratio > byRole[m.role]!.ratio) byRole[m.role] = m
  const sums = new Map<string, CCSummary>()
  if (!roles) for (const [id, c] of cc) { const role = model.elements.find((e) => e.id === id)!.role, key = `${role}-${c.zone}`, old = sums.get(key); if (old) old.count++; else sums.set(key, { role, zone: c.zone, A: c.A, pPos: c.pPos, pNeg: c.pNeg, count: 1 }) }
  /* 8.4.2 隅撑 축력 N = A·f/(60·cosθ) — 피지지 플랜지 단면적, θ = 隅撑과 퍼린 축 사이 45° 가정, 쌍이면 각 N/2 */
  const knee = (name: string) => { const p = sectionProps(name, spec.code), Af = p.bf * p.tf; return Af * cnStrength(spec.material, p.tf).f / (60 * Math.cos(Math.PI / 4)) / 1000 }
  const kneeBrace = { column: knee(spec.sections.column), rafter: knee(spec.sections.rafter) }
  return { kneeBrace, members, byRole, service, maxRatio: Math.max(0, ...members.map((m) => m.ratio)), ng: members.filter((m) => m.ratio > 1).length + service.filter((s) => s.ratio > 1).length, cc: [...sums.values()] }
}
