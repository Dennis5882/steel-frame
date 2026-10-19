/* 한국 KDS 접합부 자동 산정·검토 — 결과 형식(ConnResult)·검토 항목 키는 TW·CN 과 공유, 강도식은 codes/krConnection.ts.
   - base : 주각 베이스플레이트 + 앵커볼트. 지압 4.1.8, 앵커 강재 4.1.9(→ 4.1.3.3), 판 두께 AISC DG1 (KDS 본문 식 없음), 웨브 필릿 4.1.2
   - knee : 기둥-지붕보 4E 확장 단부판 (F10T 8본). 볼트 4.1.3.3·4.1.3.4, 판 두께 AISC DG4 '두꺼운 판'(볼트 강도로 항복선 — 지레작용 없음,
            4.1.3.3(2) 의 지레작용 고려를 판 두께로 만족), 기둥 쪽 패널존 4.1.10.6·플랜지 국부휨 4.1.10.1(기둥 끝 50%)·웨브 국부항복 4.1.10.2
   - apex : 마루 이음 (같은 4E 상세, 기둥 검토 없음)
   - brace: 가새(강관) — 슬롯 강관 + 거셋 필릿용접(l = 1.3D → U = 1.0, 14 31 10 표 4.1-1 사례 5) + 거셋 F10T 1면 마찰접합,
            볼트 전단·지압 4.1.3.5, 거셋 인장 항복·파단 4.1.4.1
   내진상세 (KDS 14 31 60, R > 3 계통을 고른 경우 — 41 17 00 10.1):
   - X 보통모멘트골조 4.5: 처마 접합 소요 휨강도 1.1·Ry·Mp(지붕보), 전단 = 중력 전단 + 2(1.1RyMp)/Lh (증폭지진 조합 전단 이하, 4.5.1.1-1),
     연속판 4.5.4 — 기둥 tcf < 0.54√(bf·tbf·Fyb/Fyc) 또는 < bf/6 이면 두께 ≥ tbf/2 (한쪽 접합)
   - 주각 4.1.5: 전단 ≥ min(2RyFyZx/H, 증폭 조합), 모멘트 ≥ min(1.1RyFyZ, 증폭 조합)
   - Y 보통중심가새골조 4.7.3: 볼트 미끄럼 = 증폭 안 한 조합, 그 밖 한계상태 = min(RyFyAg, 증폭지진 조합)
   콘크리트 정착(KDS 14 20 54: 콘크리트 파괴·뽑힘·측면파열)은 기초 설계 범위 → 메모 'krFoundation' (전문가 검토). */
import { fyKR, KR } from '../codes/kr'
import {
  anchorKR, areaKR, boltKR, bearingKR, concreteBearingKR, fexxKR, filletKR, flangeBendKR, holeKR, minFilletKR, panelKR, pickPlateKR, slipKR, webYieldKR,
} from '../codes/krConnection'
import { ryKR } from '../codes/krSteel'
import type { Results } from '../actions/results'
import type { ConnCheck, ConnResult, ConnectionParts } from './connections'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { sectionProps } from './sections'
import type { FactoryModel, FactorySpec } from './types'

const chk = (item: string, demand: number, capacity: number, unit: string, clause: string): ConnCheck =>
  ({ item, demand, capacity, unit, ratio: capacity > 0 ? demand / capacity : 99, clause })
const worst = (cs: ConnCheck[]) => Math.max(0, ...cs.map((c) => c.ratio))
interface EndForce { elem: number; combo: string; P: number; M: number; V: number; Vw: number }

function endForces(res: Results, elem: number, part: 0 | 4, keep: (c: string) => boolean): EndForce[] {
  const out: EndForce[] = []
  for (const [combo, pts] of res.beam.get(elem) ?? []) {
    if (!keep(combo)) continue
    const p = pts[part]
    if (p) out.push({ elem, combo, P: p.P, M: Math.abs(p.My), V: Math.abs(p.Vz), Vw: Math.abs(p.Vy) })
  }
  return out
}

/** 판 두께 선정 — 소요 두께는 기준 Fy 로 계산 → 고른 두께의 Fy(표 3.3-1)로 보정해 다시 고름 */
function platePick(material: string, tReqAtFy: number, fy0: number) {
  let tp = pickPlateKR(tReqAtFy), tNeed = tReqAtFy
  for (let i = 0; i < 4; i++) {
    tNeed = tReqAtFy * Math.sqrt(fy0 / fyKR(material, tp))
    const next = pickPlateKR(tNeed)
    if (next === tp) break
    tp = next
  }
  return { tp, tNeed }
}

/* ── 베이스플레이트 (AISC DG1 — 판 두께·편심 지압 해, KDS 본문 식 없음) ── */
function baseFor(spec: FactorySpec, forces: EndForce[], anchorD: number, nSide: number) {
  const mat = KR.materials[spec.material], col = sectionProps(spec.sections.column, spec.code)
  const fixed = spec.baseFixity === 'fixed'
  const edge = Math.max(50, Math.ceil(1.75 * anchorD)) // 표 4.1-2 수동 가스절단 연단 (> M30 은 1.75d)
  const N = col.d + 2 * 100
  const B = Math.max(col.bf + 2 * 100, (nSide - 1) * Math.max(3 * anchorD, 100) + 2 * edge)
  const A1 = B * N, A2 = (B + 300) * (N + 300) // 기초대: 판 + 150 mm 사방 (가정)
  const fpMax = concreteBearingKR(spec.fc, A1, A2), qMax = fpMax * B
  const f = N / 2 - edge, nTot = 2 * nSide
  let best: { r: number; checks: ConnCheck[]; F: EndForce } | null = null
  let tMax = 0
  for (const F of forces) {
    const M = fixed ? F.M * 1e6 : 0, Pc = -F.P * 1e3
    let T = 0, fp = 0, brg = 0, Y = N
    const m = (N - 0.95 * col.d) / 2, n = (B - 0.8 * col.bf) / 2
    let small = false
    if (Pc > 0) {
      const e = M / Pc, eCrit = N / 2 - Pc / (2 * qMax)
      if (e <= eCrit) { Y = N - 2 * e; fp = Pc / (Y * B); brg = fp / fpMax; small = true }
      else {
        const need = (2 * Pc * (e + f)) / qMax, have = (f + N / 2) ** 2
        brg = need / have
        if (brg <= 1) { Y = f + N / 2 - Math.sqrt(have - need); T = qMax * Y - Pc; fp = fpMax } else { Y = 0; fp = fpMax }
      }
    } else { T = -Pc / 2 + M / (2 * f); Y = 0 }
    const Tb = T / 1e3 / nSide, Vb = Math.hypot(F.V, F.Vw) / nTot
    const a = anchorKR(anchorD, spec.anchorFu, Vb)
    const tBrg = Y <= 0 ? 0 : Y >= m ? 1.5 * (small ? Math.max(m, n) : m) * Math.sqrt(fp / mat.fy) : 2.11 * Math.sqrt((fp * Y * (m - Y / 2)) / mat.fy)
    const x = f - col.d / 2 + col.tf / 2
    const tTen = T > 0 ? 2.11 * Math.sqrt((T * x) / (B * mat.fy)) : 0
    const checks = [
      chk('bearing', brg, 1, '—', 'KDS 14 31 25 4.1.8'),
      chk('anchorT', Tb, a.phiRt, 'kN', 'KDS 14 31 25 4.1.9 · 4.1-8'),
      chk('anchorV', Vb, a.phiRv, 'kN', 'KDS 14 31 25 4.1.9 · table 4.1-9'),
    ]
    tMax = Math.max(tMax, tBrg, tTen)
    const r = worst(checks)
    if (!best || r > best.r) best = { r, checks, F }
  }
  if (!best) return null
  const { tp, tNeed } = platePick(spec.material, tMax, mat.fy)
  best.checks.push(chk('plateT', tNeed, tp, 'mm', 'AISC DG1 3.3·3.4 (KDS 14 31 25 4.1.1.1(5))'))
  /* 기둥-판: 플랜지 완전용입(모재 강도), 웨브 양면 필릿 — 전단. 유효길이 = 줄 길이 − 2s */
  const Vmax = Math.max(...forces.map((F) => Math.hypot(F.V, F.Vw)))
  const lw = col.d - 2 * col.tf, FEXX = fexxKR(mat.fu)
  let w = Math.max(6, minFilletKR(Math.min(col.tw, tp)))
  while (2 * filletKR(w, lw, FEXX) < Vmax && w < col.tw + 6) w++
  best.checks.push(chk('weldWeb', Vmax, 2 * filletKR(w, lw, FEXX), 'kN', 'KDS 14 31 25 4.1.2 · table 4.1-8'))
  return {
    ratio: worst(best.checks), F: best.F, checks: best.checks,
    dims: { plate: `PL ${B}×${N}×${tp}`, anchors: `${nTot}-M${anchorD} (Fu ${spec.anchorFu} MPa)`, anchorLayout: `${nSide} / side, ${edge} mm edge`, weld: `web fillet ${w} mm, flanges CJP`, pedestal: `${B + 300}×${N + 300}`, fc: `${spec.fc} MPa` },
    parts: { plates: [{ part: 'plate', width: B, length: N, thickness: tp, count: 1, estimated: false }], fasteners: [{ kind: 'anchor', diameter: anchorD, count: nTot }] } satisfies ConnectionParts,
  }
}

/* ── 4E 단부판 (AISC DG4 두꺼운 판 — 볼트 강도 Mnp 로 항복선 판 두께, 지레작용 없음) ── */
function endPlateFor(spec: FactorySpec, forces: EndForce[], boltD: number, beamName: string, colName: string | null, omf: boolean) {
  const mat = KR.materials[spec.material], bm = sectionProps(beamName, spec.code)
  const bp = bm.bf + 50, g = Math.min(100, bm.bf - 50)
  let pf = Math.max(50, boltD + 25)
  const s = 0.5 * Math.sqrt(bp * g)
  if (pf > s) pf = s
  const h0 = bm.d - bm.tf / 2 + pf, h1 = bm.d - 1.5 * bm.tf - pf
  const Y = (bp / 2) * (h1 * (1 / pf + 1 / s) + h0 * (1 / pf) - 0.5) + (2 / g) * (h1 * (pf + s))
  /* 볼트 공칭 인장 Pt = Fnt·Ab, Mnp = 2Pt(h0 + h1), 두꺼운 판 t ≥ √(1.11·φn·Mnp/(φb·Fy·Y)) — φn 0.75, φb 0.9 */
  const Pt = 750 * areaKR(boltD), Mnp = 2 * Pt * (h0 + h1)
  const tThick = Math.sqrt((1.11 * 0.75 * Mnp) / (0.9 * mat.fy * Y))
  const col = colName ? sectionProps(colName, spec.code) : null
  const FyC = col ? fyKR(spec.material, Math.max(col.tf, col.tw)) : mat.fy, FyB = fyKR(spec.material, Math.max(bm.tf, bm.tw))
  let best: { r: number; checks: ConnCheck[]; F: EndForce } | null = null
  for (const F of forces) {
    const Mu = F.M * 1e6
    const Vb = F.V / 8
    const b = boltKR(boltD, Vb)
    const Tb = Mu / (2 * (h0 + h1)) / 1e3 + Math.max(0, F.P) / 8
    const checks = [
      chk('boltT', Tb, b.phiRt, 'kN', 'KDS 14 31 25 4.1.3.3 · 4.1-8'),
      chk('boltV', Vb, b.phiRv, 'kN', 'KDS 14 31 25 table 4.1-9'),
    ]
    if (col) {
      const Ff = (F.M * 1e3) / (bm.d - bm.tf) // 보 플랜지 힘 kN
      const Pc = (FyC * col.A) / 1e3, Pr = Math.abs(F.P)
      checks.push(chk('panel', Ff, panelKR(FyC, col.d, col.tw, Pr, Pc), 'kN', 'KDS 14 31 25 4.1.10.6'))
      checks.push(chk('flangeBend', Ff, flangeBendKR(col.tf, FyC, true), 'kN', 'KDS 14 31 25 4.1.10.1 (column top, 50%)'))
      const k = (col.d - col.h) / 2
      checks.push(chk('webYield', Ff, webYieldKR(k, bm.tf, col.tw, FyC, bm.d <= col.d), 'kN', 'KDS 14 31 25 4.1.10.2'))
    }
    const r = worst(checks)
    if (!best || r > best.r) best = { r, checks, F }
  }
  if (!best) return null
  const MuMax = Math.max(...forces.map((F) => F.M)) * 1e6
  const tYield = Math.sqrt((1.11 * MuMax) / (0.9 * mat.fy * Y))
  const { tp, tNeed } = platePick(spec.material, Math.max(tThick, tYield), mat.fy)
  best.checks.push(chk('plateT', tNeed, tp, 'mm', 'AISC DG4 4E thick plate (KDS 14 31 25 4.1.1.1(5), 4.1.3.3(2) prying)'))
  const Vmax = Math.max(...forces.map((F) => F.V))
  const lw = bm.d - 2 * bm.tf, FEXX = fexxKR(mat.fu)
  let w = Math.max(6, minFilletKR(Math.min(bm.tw, tp)))
  while (2 * filletKR(w, lw, FEXX) < Vmax && w < bm.tw + 6) w++
  best.checks.push(chk('weldWeb', Vmax, 2 * filletKR(w, lw, FEXX), 'kN', 'KDS 14 31 25 4.1.2 · table 4.1-8'))
  const notes: string[] = []
  const L = Math.round(h0 + pf + bm.tf / 2)
  const parts: ConnectionParts = { plates: [{ part: 'plate', width: Math.round(bp), length: L, thickness: tp, count: col ? 1 : 2, estimated: false }], fasteners: [{ kind: 'bolt', diameter: boltD, count: 8 }] }
  let stiff = ''
  if (col) {
    const panel = best.checks.find((c) => c.item === 'panel')!
    if (panel.ratio > 1) {
      /* 더블러 — 부족분 / (φ·0.6·Fy·dc) (4.1.10.8 → 14 31 10 4.3) */
      const td = pickPlateKR(((panel.demand - panel.capacity) * 1e3) / (0.9 * 0.6 * FyC * col.d))
      notes.push(`doubler ${td} mm`)
      parts.plates.push({ part: 'doubler', width: col.h, length: bm.d, thickness: td, count: 1, estimated: true })
      panel.capacity += (0.9 * 0.6 * FyC * col.d * td) / 1e3
      panel.ratio = panel.demand / panel.capacity
    }
    /* 수평 스티프너(연속판) — 국부휨·웨브항복 부족분 또는 OMF 4.5.4 조건. 최소 치수 4.1.10.7(4): bs + tw/2 ≥ bp/3, ts ≥ tbf/2·bp/15 */
    const fb = best.checks.find((c) => c.item === 'flangeBend')!, wy = best.checks.find((c) => c.item === 'webYield')!
    const omfNeed = omf && (col.tf < 0.54 * Math.sqrt((bm.bf * bm.tf * FyB) / FyC) || col.tf < bm.bf / 6)
    if (fb.ratio > 1 || wy.ratio > 1 || omfNeed) {
      const lack = Math.max(fb.demand - fb.capacity, wy.demand - wy.capacity, 0)
      const AsReq = (lack * 1e3) / (0.9 * FyC)
      const bs = Math.max(Math.ceil(bp / 3 - col.tw / 2), Math.floor((col.bf - col.tw) / 2 - 10))
      const ts = pickPlateKR(Math.max(bm.tf / 2, bp / 15, AsReq / (2 * bs)))
      stiff = `2-PL ${bs}×${ts}`
      best.checks.push(chk('stiffener', AsReq, 2 * bs * ts, 'mm²', omfNeed ? 'KDS 14 31 60 4.5.4 · 14 31 25 4.1.10.7' : 'KDS 14 31 25 4.1.10.7'))
      notes.push('stiffeners')
      parts.plates.push({ part: 'stiffener', width: bs, length: col.h, thickness: ts, count: 2, estimated: true })
    }
  }
  const governing = best.checks.filter((c) => !(stiff && (c.item === 'flangeBend' || c.item === 'webYield')))
  return {
    ratio: worst(governing), F: best.F, checks: best.checks, notes, parts,
    dims: { plate: `PL ${Math.round(bp)}×${L}×${tp}`, bolts: `8-M${boltD} F10T`, gauge: `${Math.round(g)} mm`, pitch: `${Math.round(pf)} mm`, weld: `web fillet ${w} mm, flanges CJP`, ...(stiff ? { stiffener: stiff } : {}) },
  }
}

export function runKrConnections(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results): ConnResult[] {
  const k = spec.korea!, mat = KR.materials[spec.material]
  const omf = k.systemX === 'OMF', ocbf = k.systemY === 'OCBF'
  const kind = (c: string) => info.comboKind?.[c] ?? 'basic'
  const basic = (c: string) => kind(c) === 'basic', amp = (c: string) => kind(c) === 'amplified'
  const nodes = new Map(model.nodes.map((n) => [n.id, n])), at = (id: number) => nodes.get(id)!
  const G = portalGeometry(spec)
  const col = sectionProps(spec.sections.column, spec.code), raf = sectionProps(spec.sections.rafter, spec.code)
  const Ry = ryKR(spec.material)
  const out: ConnResult[] = []

  /* 주각 — 기초 절점 기둥 I 단. 내진상세 계통이면 4.1.5 (증폭 조합, 상한 min(1.1RyFyZ, 2RyFyZx/H)) */
  const baseEls = model.elements.filter((e) => e.role === 'column' && at(e.n1).z === 0)
  const baseF = baseEls.flatMap((e) => endForces(res, e.id, 0, basic))
  if (omf || ocbf) {
    const FyC = fyKR(spec.material, Math.max(col.tf, col.tw))
    const Mcap = (1.1 * Ry * FyC * col.Zx) / 1e6, Vcap = (2 * Ry * FyC * col.Zx) / 1e6 / spec.eaveHeight
    for (const F of baseEls.flatMap((e) => endForces(res, e.id, 0, amp))) baseF.push({ ...F, M: Math.min(F.M, Mcap), V: Math.min(F.V, Vcap), Vw: Math.min(F.Vw, Vcap), combo: `${F.combo} (14 31 60 4.1.5)` })
  }
  for (const d of [24, 30, 36, 42]) {
    let done = false
    for (const nSide of [2, 3, 4]) {
      const r = baseFor(spec, baseF, d, nSide)
      if (r && (r.ratio <= 1 || (d === 42 && nSide === 4))) {
        out.push({ type: 'base', elem: r.F.elem, combo: r.F.combo, dims: r.dims, checks: r.checks, ratio: r.ratio, parts: r.parts, notes: [...(spec.baseFixity === 'fixed' ? [] : ['pinned']), 'krFoundation'] })
        done = true
        break
      }
    }
    if (done) break
  }

  /* 처마 — OMF 면 소요 휨강도 1.1RyMp, 전단 Vg + 2(1.1RyMp)/Lh ≤ 증폭 조합 전단 (14 31 60 4.5.1) */
  const kneeEls = model.elements.filter((e) => e.role === 'rafter' && (G.isEaveNode(at(e.n1)) || G.isEaveNode(at(e.n2))))
  const kneePart = (e: (typeof kneeEls)[number]) => (G.isEaveNode(at(e.n1)) ? 0 : 4) as 0 | 4
  const kneeF = kneeEls.flatMap((e) => endForces(res, e.id, kneePart(e), basic))
  const kneeDims: Record<string, string> = {}
  if (omf && kneeEls.length) {
    const Mp = (raf.Zx * fyKR(spec.material, Math.max(raf.tf, raf.tw))) / 1e6, Mu = 1.1 * Ry * Mp
    const Lh = G.rafterLen - col.d / 1000
    const Vg = Math.max(0, ...kneeF.filter((f) => !/[EW]/.test(f.combo)).map((f) => f.V))
    const Vamp = Math.max(0, ...kneeEls.flatMap((e) => endForces(res, e.id, kneePart(e), amp)).map((f) => f.V))
    const Vu = Vamp > 0 ? Math.min(Vg + (2 * Mu) / Lh, Vamp) : Vg + (2 * Mu) / Lh
    kneeF.push({ elem: kneeEls[0].id, combo: 'OMF 1.1RyMp (14 31 60 4.5.1)', P: 0, M: Mu, V: Vu, Vw: 0 })
    kneeDims.Mu = `1.1·Ry·Mp = ${Mu.toFixed(1)} kN·m (Ry ${Ry}), Vu = ${Vu.toFixed(1)} kN`
  }
  const apexF = model.elements.filter((e) => e.role === 'rafter' && (G.isRidgeNode(at(e.n2)) || G.isRidgeNode(at(e.n1))))
    .flatMap((e) => endForces(res, e.id, G.isRidgeNode(at(e.n2)) ? 4 : 0, basic))
  for (const [type, forces, colName] of [['knee', kneeF, spec.sections.column], ...(G.ridges.length ? [['apex', apexF, null]] as const : [])] as const) {
    for (const d of [20, 22, 24, 27, 30]) {
      const r = endPlateFor(spec, forces, d, spec.sections.rafter, colName, omf && type === 'knee')
      if (r && (r.ratio <= 1 || d === 30)) {
        const knee = type === 'knee'
        out.push({ type, elem: r.F.elem, combo: r.F.combo, dims: knee ? { ...r.dims, ...kneeDims } : r.dims, checks: r.checks, ratio: r.ratio, parts: r.parts, notes: r.notes })
        break
      }
    }
  }

  /* 가새 — 미끄럼은 기본 조합, 그 밖은 기본 조합 최대 또는 OCBF min(RyFyAg, 증폭 조합) */
  let Nb = 0, nE = 0, nC = ''
  for (const [id, m] of res.truss) for (const [c, P] of m) if (basic(c) && Math.abs(P) > Nb) { Nb = Math.abs(P); nE = id; nC = c }
  if (nE) {
    const br = sectionProps(spec.sections.brace, spec.code)
    let Ns = Nb, sCombo = nC
    if (ocbf) {
      let Na = 0
      for (const m of res.truss.values()) for (const [c, P] of m) if (amp(c)) Na = Math.max(Na, Math.abs(P))
      const RyFyAg = (Ry * fyKR(spec.material, br.tw) * br.A) / 1e3
      Ns = Math.max(Nb, Math.min(RyFyAg, Na || RyFyAg)); sCombo = Na && Na < RyFyAg ? 'OCBF Ω0E (14 31 60 4.7.3)' : 'OCBF RyFyAg (14 31 60 4.7.3)'
    }
    const d = 20, hole = holeKR(d), slip = slipKR(d), bolt = boltKR(d)
    let tg = 9, n = 2
    const pitch = 3 * d, edge = 34 // 표 4.1-2 M20 수동 가스절단
    for (;;) {
      n = Math.max(2, Math.ceil(Nb / slip), Math.ceil(Ns / Math.min(bolt.phiRv, bearingKR(Math.min(edge - hole / 2, pitch - hole), d, tg, mat.fu))))
      const wg = Math.max(200, Math.ceil(2 * br.d / 10) * 10)
      const yieldG = (0.9 * fyKR(spec.material, tg) * wg * tg) / 1e3, rupG = (0.75 * mat.fu * Math.min(wg - hole, 0.85 * wg) * tg) / 1e3
      if ((Ns <= yieldG && Ns <= rupG) || tg >= 25) break
      tg = pickPlateKR(tg + 1)
    }
    const wg = Math.max(200, Math.ceil(2 * br.d / 10) * 10), brgEach = bearingKR(Math.min(edge - hole / 2, pitch - hole), d, tg, mat.fu)
    /* 슬롯 강관 — 거셋 필릿 4줄, 길이 1.3D → U = 1.0 (14 31 10 표 4.1-1 사례 5), 강관 순단면 = Ag − 2·t·tg(슬롯) */
    const lw = Math.ceil(1.3 * br.d), FEXX = fexxKR(mat.fu)
    let ws = Math.max(minFilletKR(Math.min(br.tw, tg)), 5)
    while (4 * filletKR(ws, lw, FEXX) < Ns && ws < br.tw + 2) ws++
    const An = br.A - 2 * br.tw * (tg + 2)
    const checks = [
      chk('boltSlip', Nb / n, slip, 'kN', 'KDS 14 31 25 4.1-12 (μ 0.5, φ 1.0)'),
      chk('boltV', Ns / n, bolt.phiRv, 'kN', 'KDS 14 31 25 table 4.1-9'),
      chk('bearingPl', Ns / n, brgEach, 'kN', 'KDS 14 31 25 4.1-9'),
      chk('gussetY', Ns, (0.9 * fyKR(spec.material, tg) * wg * tg) / 1e3, 'kN', 'KDS 14 31 25 4.1-16'),
      chk('gussetR', Ns, (0.75 * mat.fu * Math.min(wg - hole, 0.85 * wg) * tg) / 1e3, 'kN', 'KDS 14 31 25 4.1-17'),
      chk('weldBrace', Ns, 4 * filletKR(ws, lw, FEXX), 'kN', 'KDS 14 31 25 4.1.2 · table 4.1-8'),
      chk('netSection', Ns, (0.75 * mat.fu * An) / 1e3, 'kN', 'KDS 14 31 10 4.1 (U = 1.0, l ≥ 1.3D)'),
    ]
    out.push({
      type: 'brace', elem: nE, combo: ocbf ? sCombo : nC,
      dims: { bolts: `${n}-M${d} F10T slip-critical`, gusset: `PL ${wg}×${tg}`, pitch: `${pitch} mm, edge ${edge} mm`, weld: `slotted tube 4 × fillet ${ws} mm × ${lw} mm` },
      checks, ratio: worst(checks), notes: [],
      parts: { plates: [{ part: 'gusset', width: wg, length: wg, thickness: tg, count: 1, estimated: true }], fasteners: [{ kind: 'bolt', diameter: d, count: n }] },
    })
  }
  return out
}
