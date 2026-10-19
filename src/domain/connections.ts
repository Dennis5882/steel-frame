import { factoryOnly } from './additions'
/* 접합부 자동 산정·검토 (M4) — 모든 프레임·조합 중 지배값으로 유형별 1개 상세를 정한다.
   - base : 기둥 주각 베이스플레이트 + 앵커볼트 (고정 주각 = 모멘트 전달, 핀 = 축력·전단만). 지압 10.9, 앵커 표10.3-2, 판 두께 AISC DG1
   - knee : 기둥-지붕보 단부판 모멘트 접합 (4E 확장형, 양 플랜지 대칭 8본) — F10T 표10.3-2/3, 판 두께 AISC DG4 항복선, 패널존 7.3
   - apex : 마루 지붕보 이음 (같은 4E 상세)
   - brace: 가새 단부 F10T 1면 전단 볼트 + 거셋 지압 (10.3.9: φ = 0.75, 2.4·d·t·Fu)
   판·용접 재질: 스펙 재료(fy·fu), 용접봉 E70 (F_EXX 490 MPa) — 가정.
   내진 특별 규정 (대만 LRFD 13장, 프로필에 seismicCombos 가 있을 때):
   - 처마(梁柱接頭): 部分韌性 抗彎矩構架 13.7.2 → 13.6.1 — 소요 휨강도 Mu = 지붕보 Mp (1a(1), 패널존 한계 1a(2) 는 보수적으로 미적용),
     소요 전단 = (1.2D + 0.5L) 전단 + 2Mp/Lh, 단 (13.3-1) E′ 조합 전단 이하. 소요 소성 회전각 = min(0.01, 1.1(R−1)θE) (13.7.2-3a) — 공급 회전각은 시험 근거 필요(13.6.1-3b)
   - 주각: 13.4.5 — 증폭 지진력 E′ 조합 포함 (원문은 축압·축인장 검토, 앵커 파괴 방지 취지로 휨·전단까지 포함 — 보수적 해석)
   - 가새 접합: 13.8.4 — E′ 조합 포함 */
import { anchorRod, concreteBearing, ellipse, f10t, filletPerMm, pickPlate } from '../codes/twConnection'
import { profileOf } from '../codes'
import { runCnConnections } from './cnConnections'
import { runKrConnections } from './krConnections'
import { validateDesignResults } from './resultValidation'
import { ROLES } from './types'
import type { Results } from '../actions/results'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import type { FactoryModel, FactorySpec } from './types'

const FEXX = 490 // MPa, E70 용접봉 (가정)

export interface ConnCheck {
  /** 사전 키 접미사 — i18n `cn_<item>` */
  item: string
  demand: number
  capacity: number
  unit: string
  ratio: number
  clause: string
}
export type PlatePart = 'plate' | 'stiffener' | 'doubler' | 'gusset' | 'shearKey'
export interface ConnectionParts {
  /** All dimensions in mm; count is per physical connection. */
  plates: { part: PlatePart; width: number; length: number; thickness: number; count: number; estimated: boolean }[]
  fasteners: { kind: 'bolt' | 'anchor'; diameter: number; count: number }[]
  /** Physical weld length in mm per connection; only supplied where detailed. */
  welds?: { type: 'fillet' | 'cjp'; length: number; count: number }[]
}
export interface ConnResult {
  type: 'base' | 'knee' | 'apex' | 'brace'
  /** 지배 요소·조합 */
  elem: number
  combo: string
  dims: Record<string, string | number>
  checks: ConnCheck[]
  ratio: number
  notes: string[]
  /** Numeric takeoff data. Optional for reports saved before v0.12. */
  parts?: ConnectionParts
}

const chk = (item: string, demand: number, capacity: number, unit: string, clause: string): ConnCheck =>
  ({ item, demand, capacity, unit, ratio: capacity > 0 ? demand / capacity : 99, clause })
const worst = (cs: ConnCheck[]) => Math.max(0, ...cs.map((c) => c.ratio))

interface EndForce { elem: number; combo: string; P: number; M: number; V: number; Vw: number }

/** 요소 끝(지점 0 = I, 4 = J) 의 조합별 부재력 — keep 으로 조합 거르기 */
function endForces(res: Results, elem: number, part: 0 | 4, keep: (combo: string) => boolean = () => true): EndForce[] {
  const out: EndForce[] = []
  for (const [combo, pts] of res.beam.get(elem) ?? []) {
    if (!keep(combo)) continue
    const p = pts[part]
    if (p) out.push({ elem, combo, P: p.P, M: Math.abs(p.My), V: Math.abs(p.Vz), Vw: Math.abs(p.Vy) })
  }
  return out
}

/** 판 두께 선정 — 소요 두께는 재료 Fy 기준으로 계산됨 → 고른 두께의 Fy(두께별)로 √(Fy/Fy(t)) 보정해 다시 고름 */
function platePick(spec: FactorySpec, tReqAtFy: number) {
  const prof = profileOf(spec.code)
  const fy0 = prof.materials[spec.material].fy
  let tp = pickPlate(tReqAtFy), tNeed = tReqAtFy
  for (let i = 0; i < 3; i++) {
    const fyT = prof.fyAt?.(spec.material, tp) ?? fy0
    tNeed = tReqAtFy * Math.sqrt(fy0 / fyT)
    const next = pickPlate(tNeed)
    if (next === tp) break
    tp = next
  }
  return { tp, tNeed }
}

/* ── 베이스플레이트 ── */
function baseFor(spec: FactorySpec, forces: EndForce[], anchorD: number, nSide: number) {
  const mat = profileOf(spec.code).materials[spec.material]
  const col = sectionProps(spec.sections.column, spec.code)
  const fixed = spec.baseFixity === 'fixed'
  const edge = 50 // 앵커 연단 (mm)
  const N = col.d + 2 * 100
  const B = Math.max(col.bf + 2 * 100, (nSide - 1) * Math.max(3 * anchorD, 100) + 2 * 60)
  const A1 = B * N, A2 = (B + 300) * (N + 300) // 기초대: 판 + 150 mm 사방 (가정)
  const fpMax = concreteBearing(spec.fc, A1, A2) // MPa
  const qMax = fpMax * B // N/mm
  const f = N / 2 - edge
  const nTot = 2 * nSide
  const a = anchorRod(anchorD, spec.anchorFu)
  let best: { r: number; checks: ConnCheck[]; F: EndForce } | null = null
  let tMax = 0
  for (const F of forces) {
    const M = fixed ? F.M * 1e6 : 0 // N·mm
    const Pc = -F.P * 1e3 // 압축 + (N)
    /* DG1 (LRFD): 편심 e ≤ e_crit 이면 지압만, 크면 앵커 인장 T 와 지압 길이 Y.
       큰 편심의 지압 판정 = 해 존재 조건 2Pu(e+f)/q_max ≤ (f + N/2)² 의 비율 */
    let T = 0, fp = 0, brg = 0, Y = N
    const m = (N - 0.95 * col.d) / 2, n = (B - 0.8 * col.bf) / 2
    if (Pc > 0) {
      const e = M / Pc, eCrit = N / 2 - Pc / (2 * qMax)
      if (e <= eCrit) { Y = N - 2 * e; fp = Pc / (Y * B); brg = fp / fpMax }
      else {
        const need = (2 * Pc * (e + f)) / qMax, have = (f + N / 2) ** 2
        brg = need / have
        if (brg <= 1) { Y = f + N / 2 - Math.sqrt(have - need); T = qMax * Y - Pc; fp = fpMax } else { Y = 0; fp = fpMax }
      }
    } else {
      T = -Pc / 2 + M / (2 * f) // 순인장: 양쪽 앵커군 + 모멘트
      Y = 0
    }
    const Tb = T / 1e3 / nSide // kN / 앵커
    const Vb = Math.hypot(F.V, F.Vw) / nTot
    /* 판 두께 — DG1 3.3.2 / 3.4.3: 지압측 Y ≥ m 이면 1.5·m·√(fp/Fy), Y < m 이면 2.11·√(fp·Y·(m − Y/2)/Fy);
       작은 편심은 n 방향도 검토. 인장측 2.11·√(T·x/(B·Fy)) */
    const tBrg = Y <= 0 ? 0
      : Y >= m ? 1.5 * (Pc > 0 && M / Pc <= N / 2 - Pc / (2 * qMax) ? Math.max(m, n) : m) * Math.sqrt(fp / mat.fy)
      : 2.11 * Math.sqrt((fp * Y * (m - Y / 2)) / mat.fy)
    const x = f - col.d / 2 + col.tf / 2
    const tTen = T > 0 ? 2.11 * Math.sqrt((T * x) / (B * mat.fy)) : 0
    const tReq = Math.max(tBrg, tTen)
    const checks = [
      chk('bearing', brg, 1, '—', 'LRFD 10.9'),
      chk('anchorT', Tb, a.phiRt, 'kN', 'LRFD 表10.3-2'),
      chk('anchorV', Vb, a.phiRv, 'kN', 'LRFD 表10.3-2'),
      chk('anchorTV', ellipse(Tb, a.phiRt, Vb, a.phiRv), 1, '—', 'LRFD 解說 C10.3-4'),
    ]
    tMax = Math.max(tMax, tReq)
    const r = worst(checks)
    if (!best || r > best.r) best = { r, checks, F }
  }
  if (!best) return null
  const { tp, tNeed } = platePick(spec, tMax)
  best.checks.push(chk('plateT', tNeed, tp, 'mm', 'AISC DG1 3.3·3.4'))
  /* 기둥-판 용접: 플랜지 완전용입(CJP, 모재 강도), 웨브 양면 필릿 — 전단 */
  const Vmax = Math.max(...forces.map((F) => Math.hypot(F.V, F.Vw)))
  const lw = 2 * (col.d - 2 * col.tf)
  const w = Math.max(6, Math.ceil(Vmax / (lw * filletPerMm(1, FEXX))))
  best.checks.push(chk('weldWeb', Vmax, lw * filletPerMm(w, FEXX), 'kN', 'LRFD 表10.2-5'))
  return {
    ratio: worst(best.checks), F: best.F, checks: best.checks,
    dims: { plate: `PL ${B}×${N}×${tp}`, anchors: `${nTot}-M${anchorD} (Fu ${spec.anchorFu} MPa)`, anchorLayout: `${nSide} / side, ${edge} mm edge`, weld: `web fillet ${w} mm, flanges CJP`, pedestal: `${B + 300}×${N + 300}`, fc: `${spec.fc} MPa` },
    parts: { plates: [{ part: 'plate', width: B, length: N, thickness: tp, count: 1, estimated: false }], fasteners: [{ kind: 'anchor', diameter: anchorD, count: nTot }] } satisfies ConnectionParts,
  }
}

/* ── 4E 단부판 (기둥-보 / 마루 이음) ── */
function endPlateFor(spec: FactorySpec, forces: EndForce[], boltD: number, beamName: string, colName: string | null) {
  const mat = profileOf(spec.code).materials[spec.material]
  const bm = sectionProps(beamName, spec.code)
  const bp = bm.bf + 50, g = Math.min(100, bm.bf - 50)
  let pf = Math.max(50, boltD + 25) // 볼트 중심 ~ 플랜지면
  const s = 0.5 * Math.sqrt(bp * g)
  if (pf > s) pf = s
  const h0 = bm.d - bm.tf / 2 + pf, h1 = bm.d - 1.5 * bm.tf - pf
  /* DG4 4E 항복선 계수 Y (확장형, 무보강) */
  const Y = (bp / 2) * (h1 * (1 / pf + 1 / s) + h0 * (1 / pf) - 0.5) + (2 / g) * (h1 * (pf + s))
  const col = colName ? sectionProps(colName, spec.code) : null
  let best: { r: number; checks: ConnCheck[]; F: EndForce } | null = null
  let tMax = 0
  for (const F of forces) {
    const Mu = F.M * 1e6 // N·mm
    const Tb = Mu / (2 * (h0 + h1)) / 1e3 + Math.max(0, F.P) / 8 // kN / 볼트 (인장측 4본 — 2(h0+h1) 지레)
    const Vb = F.V / 8
    const b = f10t(boltD, Vb)
    const tReq = Math.sqrt((1.11 * Mu) / (0.9 * mat.fy * Y))
    const checks = [
      chk('boltT', Tb, b.phiRt, 'kN', 'LRFD 表10.3-2·10.3-3'),
      chk('boltV', Vb, b.phiRv, 'kN', 'LRFD 表10.3-2'),
    ]
    if (col) {
      /* 패널존 전단 — 보 플랜지 힘 Ff = Mu/(d − tf), φVn = 0.9·0.6·Fy·dc·twc (7.3) */
      const Ff = F.M * 1e3 / (bm.d - bm.tf) // kN
      checks.push(chk('panel', Ff, (0.9 * 0.6 * mat.fy * col.d * col.tw) / 1e3, 'kN', 'LRFD 7.3.2'))
      /* 기둥 플랜지 국부휨 φ·6.25·Fy·tf² (AISC J10.1) — 초과 시 수평 스티프너 */
      checks.push(chk('flangeBend', Ff, (0.9 * 6.25 * mat.fy * col.tf ** 2) / 1e3, 'kN', 'AISC J10.1'))
    }
    tMax = Math.max(tMax, tReq)
    const r = worst(checks)
    if (!best || r > best.r) best = { r, checks, F }
  }
  if (!best) return null
  const { tp, tNeed } = platePick(spec, tMax)
  best.checks.push(chk('plateT', tNeed, tp, 'mm', 'AISC DG4 (4E)'))
  const Vmax = Math.max(...forces.map((F) => F.V))
  const lw = 2 * (bm.d - 2 * bm.tf)
  const w = Math.max(6, Math.ceil(Vmax / (lw * filletPerMm(1, FEXX))))
  best.checks.push(chk('weldWeb', Vmax, lw * filletPerMm(w, FEXX), 'kN', 'LRFD 表10.2-5'))
  const notes: string[] = []
  const parts: ConnectionParts = { plates: [{ part: 'plate', width: Math.round(bp), length: Math.round(h0 + pf + bm.tf / 2), thickness: tp, count: col ? 1 : 2, estimated: false }], fasteners: [{ kind: 'bolt', diameter: boltD, count: 8 }] }
  const panel = best.checks.find((c) => c.item === 'panel')
  if (panel && panel.ratio > 1) {
    /* 더블러: 부족분 / (0.9·0.6·Fy·dc) */
    const td = Math.ceil(((panel.demand - panel.capacity) * 1e3) / (0.9 * 0.6 * mat.fy * col!.d))
    notes.push(`doubler ${pickPlate(td)} mm`)
    parts.plates.push({ part: 'doubler', width: col!.h, length: bm.d, thickness: pickPlate(td), count: 1, estimated: true })
    panel.capacity += (0.9 * 0.6 * mat.fy * col!.d * pickPlate(td)) / 1e3
    panel.ratio = panel.demand / panel.capacity
  }
  /* 기둥 플랜지 국부휨 초과 → 보 플랜지 높이에 수평 스티프너 1쌍: 소요 단면적 (Ff − φRn)/(0.9·Fy), 폭 (bf − tw)/2 − 10 */
  const fb = best.checks.find((c) => c.item === 'flangeBend')
  let stiff = ''
  if (fb && fb.ratio > 1 && col) {
    const AsReq = ((fb.demand - fb.capacity) * 1e3) / (0.9 * mat.fy) // mm²
    const bs = Math.floor((col.bf - col.tw) / 2 - 10)
    const ts = pickPlate(Math.max(bm.tf, AsReq / (2 * bs)))
    stiff = `2-PL ${bs}×${ts}`
    best.checks.push(chk('stiffener', AsReq, 2 * bs * ts, 'mm²', 'AISC J10.7'))
    notes.push('stiffeners')
    parts.plates.push({ part: 'stiffener', width: bs, length: col.h, thickness: ts, count: 2, estimated: true })
  }
  const governing = best.checks.filter((c) => !(stiff && c.item === 'flangeBend'))
  return {
    ratio: worst(governing), F: best.F, checks: best.checks, notes, parts,
    dims: { plate: `PL ${Math.round(bp)}×${Math.round(h0 + pf + bm.tf / 2)}×${tp}`, bolts: `8-M${boltD} F10T`, gauge: `${Math.round(g)} mm`, pitch: `${Math.round(pf)} mm`, weld: `web fillet ${w} mm, flanges CJP`, ...(stiff ? { stiffener: stiff } : {}) },
  }
}

export function runConnections(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results): ConnResult[] {
  validateDesignResults(spec, model, info, res, ROLES)
  model = factoryOnly(model, false)
  if (spec.code === 'CN') return runCnConnections(spec, model, res)
  if (spec.code === 'KR') return runKrConnections(spec, model, info, res)
  const kind = (c: string) => info.comboKind?.[c] ?? 'basic'
  const basic = (c: string) => kind(c) === 'basic'
  const withAmp = (c: string) => kind(c) !== 'gravity'
  const seis13 = Object.values(info.comboKind ?? {}).includes('amplified')
  const nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const out: ConnResult[] = []
  const at = (id: number) => nodes.get(id)!

  /* 주각: 기초 절점에서 시작하는 기둥 요소의 I 단 */
  const baseF = model.elements.filter((e) => e.role === 'column' && at(e.n1).z === 0).flatMap((e) => endForces(res, e.id, 0, withAmp)) // 13.4.5
  /* 처마: 처마 절점에 닿는 지붕보 끝 (I 단이 처마면 I, 아니면 J) */
  const G = portalGeometry(spec)
  const kneeEls = model.elements.filter((e) => e.role === 'rafter' && (G.isEaveNode(at(e.n1)) || G.isEaveNode(at(e.n2))))
  const kneePart = (e: (typeof kneeEls)[number]) => (G.isEaveNode(at(e.n1)) ? 0 : 4) as 0 | 4
  const kneeF = kneeEls.flatMap((e) => endForces(res, e.id, kneePart(e), basic))
  /* 13.6.1 용량 설계 힘 — 지붕보 Mp, 전단 Vg + 2Mp/Lh ≤ V(13.3-1) */
  const kneeNotes: string[] = []
  const kneeDims: Record<string, string> = {}
  if (seis13 && kneeEls.length) {
    const mat = profileOf(spec.code).materials[spec.material]
    const raf = sectionProps(spec.sections.rafter, spec.code), col = sectionProps(spec.sections.column, spec.code)
    const Mp = (raf.Zx * (profileOf(spec.code).fyAt?.(spec.material, Math.max(raf.tf, raf.tw)) ?? mat.fy)) / 1e6 // kN·m
    const Lh = G.rafterLen - col.d / 1000 // 처마~처마 기둥면 사이 지붕보 길이 (m)
    const grav = kneeEls.flatMap((e) => endForces(res, e.id, kneePart(e), (c) => kind(c) === 'gravity'))
    const amp1 = kneeEls.flatMap((e) => endForces(res, e.id, kneePart(e), (c) => kind(c) === 'amplified' && c.includes('13.3-1')))
    const Vg = Math.max(0, ...grav.map((f) => f.V)), V13 = Math.max(0, ...amp1.map((f) => f.V))
    const Vu = V13 > 0 ? Math.min(Vg + (2 * Mp) / Lh, V13) : Vg + (2 * Mp) / Lh
    const Pg = grav.length ? grav.reduce((a, f) => (f.P > a.P ? f : a)).P : 0
    kneeF.push({ elem: kneeEls[0].id, combo: '13.6.1 Mp', P: Pg, M: Mp, V: Vu, Vw: 0 })
    /* 13.7.2-3a 소요 소성 회전각: min(0.01, 1.1(R − 1)θE), θE = 설계 지진 EX 처마 변위각 */
    const ex = res.disp.get('EX')
    const eave = model.nodes.filter(G.isEaveNode)
    const thetaE = ex ? Math.max(0, ...eave.map((n) => Math.abs(ex.get(n.id)?.dx ?? 0))) / spec.eaveHeight : 0
    const thetaP = Math.min(0.01, 1.1 * (info.seismic.X.R - 1) * thetaE)
    kneeDims.Mu = `Mp = ${Mp.toFixed(1)} kN·m, Vu = ${Vu.toFixed(1)} kN (13.6.1)`
    kneeDims.thetaP = `θp,req = ${thetaP.toFixed(4)} rad (13.7.2-3a, θE = ${thetaE.toFixed(5)})`
    kneeNotes.push('rotTest')
  }
  /* 마루: 마루 절점에 닿는 지붕보 끝 */
  const apexF = model.elements.filter((e) => e.role === 'rafter' && (G.isRidgeNode(at(e.n2)) || G.isRidgeNode(at(e.n1))))
    .flatMap((e) => endForces(res, e.id, G.isRidgeNode(at(e.n2)) ? 4 : 0, basic))

  /* 주각: 앵커 지름·개수 최소 조합 */
  for (const d of [24, 30, 36, 42]) {
    let done = false
    for (const nSide of [2, 3, 4]) {
      const r = baseFor(spec, baseF, d, nSide)
      if (r && (r.ratio <= 1 || (d === 42 && nSide === 4))) {
        out.push({ type: 'base', elem: r.F.elem, combo: r.F.combo, dims: r.dims, checks: r.checks, ratio: r.ratio, parts: r.parts, notes: spec.baseFixity === 'fixed' ? [] : ['pinned'] })
        done = true
        break
      }
    }
    if (done) break
  }
  /* 마루 접합은 마루가 있는 형식만 (편경사 없음) */
  for (const [type, forces, colName] of [['knee', kneeF, spec.sections.column], ...(G.ridges.length ? [['apex', apexF, null]] as const : [])] as const) {
    for (const d of [20, 22, 24, 27, 30]) {
      const r = endPlateFor(spec, forces, d, spec.sections.rafter, colName)
      if (r && (r.ratio <= 1 || d === 30)) {
        const knee = type === 'knee'
        out.push({ type, elem: r.F.elem, combo: r.F.combo, dims: knee ? { ...r.dims, ...kneeDims } : r.dims, checks: r.checks, ratio: r.ratio, parts: r.parts, notes: knee ? [...r.notes, ...kneeNotes] : r.notes })
        break
      }
    }
  }

  /* 가새 단부: 최대 축력 → F10T 1면 전단 볼트 수, 거셋 지압 */
  let Nmax = 0, nE = 0, nC = ''
  for (const [id, m] of res.truss) for (const [c, P] of m) if (withAmp(c) && Math.abs(P) > Nmax) { Nmax = Math.abs(P); nE = id; nC = c } // 13.8.4
  if (nE) {
    const mat = profileOf(spec.code).materials[spec.material]
    const d = 20, tg = 9
    const bolt = f10t(d)
    const bearing = (0.75 * 2.4 * d * tg * mat.fu) / 1e3 // kN / 볼트
    const per = Math.min(bolt.phiRv, bearing)
    const n = Math.max(2, Math.ceil(Nmax / per))
    const checks = [chk('boltV', Nmax / n, bolt.phiRv, 'kN', 'LRFD 表10.3-2'), chk('bearingPl', Nmax / n, bearing, 'kN', 'LRFD 10.3.9')]
    out.push({ type: 'brace', elem: nE, combo: nC, dims: { bolts: `${n}-M${d} F10T`, gusset: `PL ${tg}` }, checks, ratio: worst(checks), notes: [], parts: { plates: [{ part: 'gusset', width: 200, length: 200, thickness: tg, count: 1, estimated: true }], fasteners: [{ kind: 'bolt', diameter: d, count: n }] } })
  }
  return out
}
