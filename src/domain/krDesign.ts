/* 한국 KDS 부재·사용성 검토 — 결과 형식은 TW·CN 과 공유, 강도식·길이·한계는 여기와 codes/krSteel.ts.
   KDS 14 31 15 4.3 유효길이법: 가상하중(중력 조합, krLoads) + 횡이동 K(4.3-2) + B1·B2(4.5) — M_u = B·M (B = max(B1, B2), 비횡이동/횡이동 분리 없이 보수적).
   길이 가정 (TW 와 같은 골조 구성): 기둥 면내 K·처마높이 / 면외·L_b = 거트 간격, 지붕보 면내 경사길이 / 면외·L_b = 퍼린 간격,
   퍼린·거트 강축 = 베이, 약축·L_b = 베이/(새그로드+1) (약축 모멘트 ×1/(n+1)²), 스트럿 = 베이, 풍주 강축 = 높이·약축 = 거트 간격, 가새 KL = 대각선/2.
   사용성 — KDS 에 수치 한계 없음(14 31 55 4.1.3·4.1.4): 프로젝트 기준으로 표시. 지진 층간변위만 KDS 41 17 00 7.2.8·표 8.2-1 규정값. */
import { cbKR, krB1, krB2, krCapacity, krCheck, krKSway, SLENDER_KR, type KrCapacity } from '../codes/krSteel'
import { krCfCapacity, krCfCheck } from '../codes/krColdFormed'
import { ccDims, effSx } from '../codes/twColdFormed'
import { fyKR } from '../codes/kr'
import type { Results } from '../actions/results'
import type { CCSummary, DesignResult, MemberCheck, ServiceCheck } from './design'
import type { LoadInfo } from './loads'
import { portalGeometry } from './portal'
import { roofDeflection } from './roofDeflection'
import { sectionProps } from './sections'
import { validateDesignResults } from './resultValidation'
import { krCCLoads } from './krSecondary'
import { type ElementRole, type FactoryModel, type FactorySpec } from './types'
import { sagCount, support } from './validity'

/** 프로젝트 기준 처짐 한계 (스팬/값) — 지붕보·퍼린, 지붕활하중 또는 적설 */
export const KR_DEFL = { rafter: 240, purlin: 240 }
/** 풍 횡변위 프로젝트 기준 H/150 — 재현기간 50년 풍하중 = 0.65W (KDS 41 12 00 5.1.3(2)) */
export const KR_WIND_DRIFT = { factor: 0.65, limit: 1 / 150 }

/** 조합 이름의 주 횡력 방향 — 첫 'WX…'·'±EX'·'+NX' (지진 직교 0.3 성분은 뒤에 옴) */
const comboDir = (c: string): 'X' | 'Y' | null => (c.match(/(?:W|E|N)([XY])/)?.[1] as 'X' | 'Y' | undefined) ?? null

/** 부재별 유효길이 (mm) — 강축 KLx·약축 KLy·횡비틀림 L_b. 앱 검토와 Gen KDS 대조(live-kr --gen-check LENG)가 같은 값을 쓴다.
    14 31 15 4.3.4(5)① 기초 G — 핀 10, 고정 1. 기둥 상단 G = (Ic/Lc)/(Ir/Lr) */
export function krLengths(spec: FactorySpec, model: FactoryModel): Map<number, { KLx: number; KLy: number; Lb: number; K: number; L: number }> {
  const G = portalGeometry(spec), nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const col = sectionProps(spec.sections.column, spec.code), raf = sectionProps(spec.sections.rafter, spec.code)
  const Kat = new Map(G.eaveXs.map((x) => [x, krKSway((col.Ix / G.zAt(x)) / (raf.Ix / G.rafterLen), spec.baseFixity === 'fixed' ? 1 : 10)]))
  const Lsec = spec.baySpacing / (sagCount(spec) + 1)
  const mm = (m: number) => m * 1000
  const out = new Map<number, { KLx: number; KLy: number; Lb: number; K: number; L: number }>()
  for (const e of model.elements) {
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!
    const Lel = e.designLength ?? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const K = e.role === 'column' && !e.lean ? Kat.get(a.x)! : 1
    const flyL = support(spec, 'flyBraces') === 'none' ? (e.role === 'rafter' ? G.slopeLen : G.zAt(a.x)) : Lel
    const crossL = support(spec, 'braceCrossing') === 'none' ? Lel : Lel / 2
    const l = e.role === 'column' ? { KLx: mm(K * G.zAt(a.x)), KLy: mm(flyL), Lb: mm(flyL) }
      : e.role === 'rafter' ? { KLx: mm(G.slopeLen), KLy: mm(flyL), Lb: mm(flyL) }
      : e.role === 'purlin' || e.role === 'girt' ? { KLx: mm(Lel), KLy: mm(Math.min(Lel, Lsec)), Lb: mm(Math.min(Lel, Lsec)) }
      : e.role === 'post' ? { KLx: mm(G.zAt(a.x)), KLy: mm(flyL), Lb: mm(flyL) }
      : e.role === 'brace' ? { KLx: mm(crossL), KLy: mm(crossL), Lb: mm(crossL) }
      : { KLx: mm(Lel), KLy: mm(Lel), Lb: mm(Lel) }
    out.set(e.id, { ...l, K, L: mm(Lel) })
  }
  return out
}

export function runKrDesign(spec: FactorySpec, model: FactoryModel, info: LoadInfo, res: Results, roles?: readonly ElementRole[]): DesignResult {
  validateDesignResults(spec, model, info, res, roles)
  const G = portalGeometry(spec), nodes = new Map(model.nodes.map((n) => [n.id, n]))
  const lengths = krLengths(spec, model)
  const mm = (m: number) => m * 1000
  const members: MemberCheck[] = [], service: ServiceCheck[] = []
  /* 퍼린·거트 외장재설계용 풍하중 (KDS 41 12 00 5.4·5.8) — krSecondary */
  const cc = krCCLoads(spec, model, info)
  /* 증폭지진 조합(amplified)은 일반 부재 검토에서 제외 — 기둥 축력(14 31 60 4.1.3)·접합부만 */
  const basic = (c: string) => (info.comboKind?.[c] ?? 'basic') === 'basic'
  const amplified = (c: string) => info.comboKind?.[c] === 'amplified'
  const k = spec.korea!
  let b2Max = 1
  for (const e of model.elements) {
    if (roles && !roles.includes(e.role)) continue
    const a = nodes.get(e.n1)!, b = nodes.get(e.n2)!, sp = sectionProps(e.section, spec.code)
    const Lel = e.designLength ?? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const lens = lengths.get(e.id)!
    const material = e.role === 'purlin' || e.role === 'girt' ? spec.secondaryMaterial ?? spec.material : spec.material
    const Fy = fyKR(material, Math.max(sp.tf, sp.tw))
    const frame = e.role === 'column' || e.role === 'rafter'
    const myScale = e.role === 'purlin' || e.role === 'girt' ? 1 / (sagCount(spec) + 1) ** 2 : 1
    let best: MemberCheck | null = null
    let maxComp = 0
    /* 냉간성형 립 C형강 퍼린·거트 — KDS 41 30 30 (해석 부재력 + 외장재 풍압). 압축 플랜지 구속: 퍼린 중력 방향 휨이면 외장재가 구속 */
    if ((e.role === 'purlin' || e.role === 'girt') && sp.kind === 'CC') {
      const cf = krCfCapacity(e.section, sp, Fy, { Lx: lens.KLx, Ly: lens.KLy, Lt: lens.Lb, Lb: lens.Lb, Lm: lens.Lb }, 1)
      const considerCF = (combo: string, part: number, f: MemberCheck['forces'], braced: boolean) => {
        const r = krCfCheck(cf, f, braced)
        if (best && r.ratio <= best.ratio) return
        best = {
          id: e.id, role: e.role, section: e.section, ratio: r.ratio, combo, part, eq: r.eq, forces: f,
          cap: { phiPnc: cf.phiPnc, phiPnt: cf.phiPnt, phiMnx: braced ? cf.phiMnxBraced : cf.phiMnxLTB, phiMny: cf.phiMny, phiVn: cf.phiVn,
            mxMode: braced ? 'CF' : `CF-${cf.mode}`, compact: 'noncompact', KLr: cf.KLr, lambdaC: Math.sqrt(Fy / Math.max(cf.Fn, 1e-9)) },
          B: 1, Cb: 1, lengths: lens, slender: { value: 0, limit: 0 }, notes: cf.notes,
          issues: cf.applicable ? [] : [{ key: 'coldFormedRange', level: 'blocked', detail: 'KDS 41 30 30 table 1.6-1' }],
        }
      }
      const beam = res.beam.get(e.id)
      const grav = beam ? [...beam.entries()].find(([c]) => basic(c) && !/[EWN][XY]/.test(c)) : undefined
      const sag = grav ? Math.sign(grav[1][2]?.My ?? 0) || 1 : 1
      for (const [combo, pts] of beam ?? []) {
        if (!basic(combo)) continue
        const braced = e.role === 'purlin' && Math.sign(pts[2]?.My ?? 0) === sag
        pts.forEach((p, i) => { maxComp = Math.max(maxComp, -p.P); considerCF(combo, i, { P: p.P, Mx: Math.abs(p.My), My: Math.abs(p.Mz) * myScale, V: Math.abs(p.Vz) }, braced) })
      }
      for (const d of cc.get(e.id)?.demands ?? []) considerCF(d.combo, 2, d.f, d.braced)
      if (!best) throw new Error(`KDS: missing analysis forces for element ${e.id}`)
      const m = best as MemberCheck
      m.strengthRatio = m.ratio
      m.strengthGoverning = { combo: m.combo, eq: m.eq, part: m.part, B: m.B, Cb: m.Cb }
      m.slender = maxComp > 1e-3
        ? { value: Math.max(lens.KLx / sp.rx, lens.KLy / sp.ry), limit: SLENDER_KR.compression }
        : { value: Math.max(lens.KLx, lens.KLy) / Math.min(sp.rx, sp.ry), limit: SLENDER_KR.tension }
      if (m.slender.value / m.slender.limit > m.ratio) { m.ratio = m.slender.value / m.slender.limit; m.eq = 'KL/r' }
      members.push(m)
      continue
    }
    const consider = (combo: string, part: number, f: MemberCheck['forces'], cap: KrCapacity, B: number, Cb: number) => {
      const r = krCheck(cap, f, B)
      if (best && r.ratio <= best.ratio) return
      best = {
        id: e.id, role: e.role, section: e.section, ratio: r.ratio, combo, part, eq: r.eq, forces: f,
        cap: { phiPnc: cap.phiPnc, phiPnt: cap.phiPnt, phiMnx: cap.phiMnx, phiMny: cap.phiMny, phiVn: cap.phiVn, mxMode: cap.mxMode, compact: cap.compact, KLr: cap.KLr, lambdaC: cap.lambdaC },
        B, Cb, lengths: lens, slender: { value: 0, limit: 0 }, notes: cap.notes,
      }
    }
    if (e.role === 'brace') {
      const cap = krCapacity(sp, Fy, lens, 1)
      for (const [combo, P] of res.truss.get(e.id) ?? []) { if (!basic(combo)) continue; if (P < 0) maxComp = Math.max(maxComp, -P); consider(combo, -1, { P, Mx: 0, My: 0, V: 0 }, cap, 1, 1) }
    } else {
      for (const [combo, pts] of res.beam.get(e.id) ?? []) {
        if (!basic(combo)) continue
        const Cb = cbKR(pts.map((p) => p.My))
        const Pc = Math.max(0, ...pts.map((p) => -p.P))
        maxComp = Math.max(maxComp, Pc)
        const cap = krCapacity(sp, Fy, lens, Cb)
        let B = krB1(Pc, sp.Ix, Math.min(lens.KLx, mm(Lel)))
        if (frame) {
          const sw = res.sway.get(combo), d = comboDir(combo)
          /* R_M — 모멘트골조 방향(X) 0.85 (P_mf = P_story 로 보수적), 가새골조 방향(Y) 1.0 */
          const b2 = (dir: 'X' | 'Y') => (sw ? krB2(sw[dir].sumPu, sw[dir].drift, sw[dir].sumH, spec.eaveHeight, dir === 'X' ? 0.85 : 1) : 1)
          const B2 = d ? b2(d) : Math.max(b2('X'), b2('Y'))
          b2Max = Math.max(b2Max, B2)
          B = Math.max(B, B2)
        }
        pts.forEach((p, i) => consider(combo, i, { P: p.P, Mx: Math.abs(p.My), My: Math.abs(p.Mz) * myScale, V: Math.abs(p.Vz) }, cap, B, Cb))
      }
      /* 외장재 풍압: 정압 = 외장재 쪽 플랜지 압축(구속, L_b ≈ 0), 부압 = 자유 플랜지 압축(L_b = 새그로드 간격, C_b 1.0) */
      const ccl = cc.get(e.id)
      if (ccl) {
        const capBraced = krCapacity(sp, Fy, { ...lens, Lb: 1 }, 1), capFree = krCapacity(sp, Fy, lens, 1)
        for (const d of ccl.demands) consider(d.combo, 2, d.f, d.braced ? capBraced : capFree, 1, 1)
      }
    }
    if (!best) throw new Error(`KDS: missing analysis forces for element ${e.id}`)
    const m = best as MemberCheck
    m.strengthRatio = m.ratio
    m.strengthGoverning = { combo: m.combo, eq: m.eq, part: m.part, B: m.B, Cb: m.Cb }
    /* 4.1.1·4.2.2 세장비 (가급적) — 압축 KL/r 200, 인장 L/r 300 */
    m.slender = maxComp > 1e-3
      ? { value: Math.max(lens.KLx / sp.rx, lens.KLy / sp.ry), limit: SLENDER_KR.compression }
      : { value: Math.max(lens.KLx, lens.KLy) / Math.min(sp.rx, sp.ry), limit: SLENDER_KR.tension }
    if (m.slender.value / m.slender.limit > m.ratio) { m.ratio = m.slender.value / m.slender.limit; m.eq = 'KL/r' }
    /* 14 31 60 4.1.3 기둥 — 내진상세 계통이고 증폭 안 한 조합으로 Pu/φPn > 0.4 이면 증폭지진 조합 축력으로 검토 (축력만) */
    if (e.role === 'column' && (k.systemX === 'OMF' || k.systemY === 'OCBF')) {
      const cap = krCapacity(sp, Fy, lens, 1), Pb = maxComp
      if (Pb / cap.phiPnc > 0.4) {
        let Pa = 0, ca = ''
        for (const [combo, pts] of res.beam.get(e.id) ?? []) if (amplified(combo)) for (const p of pts) if (-p.P > Pa) { Pa = -p.P; ca = combo }
        if (Pa / cap.phiPnc > m.ratio) { m.ratio = Pa / cap.phiPnc; m.eq = 'KDS 14 31 60 4.1.3'; m.combo = ca; m.forces = { P: -Pa, Mx: 0, My: 0, V: 0 } }
      }
    }
    /* 14 31 60 4.7 보통중심가새골조 — 가새는 내진 조밀단면(표 4.1-1 주 c): 원형강관 D/t ≤ 0.044E/Fy */
    if (e.role === 'brace' && k.systemY === 'OCBF' && sp.kind === 'P') {
      const r = (sp.d / sp.tw) / (0.044 * 210000 / Fy)
      if (r > m.ratio) { m.ratio = r; m.eq = 'KDS 14 31 60 4.7 D/t' }
    }
    /* 웨브 세장(미구현) H 는 NG 로 */
    if (m.notes.some((n) => n.startsWith('web slender'))) m.ratio = Math.max(m.ratio, 9.99)
    members.push(m)
  }
  /* 14 31 15 4.3.1 유효길이법 적용 조건 B2 ≤ 1.5 — 넘으면 골조 부재에 표시 (직접해석법 필요) */
  if (b2Max > 1.5) for (const m of members) if (m.role === 'column' || m.role === 'rafter') {
    m.notes = [...m.notes, `B2 ${b2Max.toFixed(2)} > 1.5 (KDS 14 31 15 4.3.1)`]
    m.issues = [...m.issues ?? [], { key: 'effectiveLength', level: 'blocked', detail: `B2=${b2Max.toFixed(3)} > 1.5; KDS 14 31 15 4.3.1` }]
  }

  if (!roles) {
    const eaves = model.nodes.filter(G.isEaveNode)
    const disp = (lc: string, id: number) => {
      const v = res.disp.get(lc)?.get(id)
      if (!v || ![v.dx, v.dy, v.dz].every(Number.isFinite)) throw new Error(`KDS: missing/invalid service displacement ${lc}, node ${id}`)
      return v
    }
    const push = (key: ServiceCheck['key'], value: number, limit: number, lc: string, clause: string) => service.push({ key, value, limit, ratio: value / limit, case: lc, clause })
    const kr = info.kr!
    for (const [d, comp, wk, ek] of [['X', 'dx', 'windDriftX', 'seisDriftX'], ['Y', 'dy', 'windDriftY', 'seisDriftY']] as const) {
      let max = 0, at = ''
      for (const w of info.wind.variants) for (const n of eaves) {
        const v = Math.abs(w.parts.reduce((s, p) => s + p.f * disp(p.lc, n.id)[comp], 0))
        if (v > max) { max = v; at = w.tag }
      }
      push(wk, KR_WIND_DRIFT.factor * max / spec.eaveHeight, KR_WIND_DRIFT.limit, `0.65 × ${at}`, 'Project criterion H/150 at 50-yr wind 0.65W (KDS 41 12 00 5.1.3(2))')
      /* 7.2.8 δ = Cd·δ_xe/I_E (우발비틀림 ± 포함), P-Δ: θ = P·Δ/(V·h·Cd) > 0.1 이면 a_d = 1/(1 − θ) */
      let dxe = 0
      for (const n of eaves) for (const sg of [1, -1]) dxe = Math.max(dxe, Math.abs(disp(`E${d}`, n.id)[comp] + sg * disp(`ET${d}`, n.id)[comp]))
      const s = info.seismic[d]
      const Cd = kr.sys[d].Cd
      const delta = Cd * dxe / kr.IE
      const thetaPD = s.V > 0 ? info.seismic.W * delta / (s.V * spec.eaveHeight * Cd) : 0
      const ad = thetaPD > 0.1 ? 1 / (1 - thetaPD) : 1
      push(ek, ad * delta / spec.eaveHeight, kr.driftLimit, `Cd·(E${d}±ET${d})/I_E${ad > 1 ? ` × ${ad.toFixed(3)}` : ''}`, `KDS 41 17 00 7.2.8 · table 8.2-1 (${kr.driftLimit}h, θ = ${thetaPD.toFixed(3)})`)
    }
    /* 지붕보 처짐 — 마루(또는 경간 중앙) − 같은 y 처마 평균, 지붕활하중·적설 케이스 중 최대 */
    service.push({ key: 'rafterDefl', ...roofDeflection(spec, model, res, [...res.disp.keys()].filter((x) => x === 'LR' || /^SN/.test(x)), KR_DEFL.rafter), clause: `Project criterion L/${KR_DEFL.rafter} (KDS 14 31 55 4.1.3)` })
    const dp = krPurlinDefl(spec, info, spec.sections.purlin)
    push('purlinDefl', dp, spec.baySpacing / KR_DEFL.purlin, 'max(LR, SN)', `Project criterion L/${KR_DEFL.purlin} (KDS 14 31 55 4.1.3)`)
  }
  const byRole: DesignResult['byRole'] = {}
  for (const m of members) if (!byRole[m.role] || m.ratio > byRole[m.role]!.ratio) byRole[m.role] = m
  const sums = new Map<string, CCSummary>()
  if (!roles) for (const [id, c] of cc) {
    const role = model.elements[id - 1].role, key = `${role}-${c.zone}`, old = sums.get(key)
    if (old) { old.count++; old.A = Math.min(old.A, c.A); old.pPos = Math.max(old.pPos, c.pPos); old.pNeg = Math.min(old.pNeg, c.pNeg) }
    else sums.set(key, { role, zone: c.zone, A: c.A, pPos: c.pPos, pNeg: c.pNeg, count: 1 })
  }
  return { members, byRole, service, maxRatio: Math.max(0, ...members.map((m) => m.ratio)), ng: members.filter((m) => m.ratio > 1).length + service.filter((s) => s.ratio > 1).length, cc: [...sums.values()] }
}

/** 퍼린 처짐 (m) — 단순보 5wL⁴/384EI, w = max(지붕활하중, 적설) × 퍼린 간격 × cosθ */
export function krPurlinDefl(spec: FactorySpec, info: LoadInfo, section: string): number {
  const G = portalGeometry(spec)
  const w = Math.max(info.roofLive, info.snow ?? 0) * G.sRoof * Math.cos(G.theta)
  const sp = sectionProps(section, spec.code)
  /* 냉간성형: 4.10.1 유효 단면2차모멘트 — 응력 Fy 유효폭으로 (사용성 응력보다 낮은 I → 보수적) */
  const I = sp.kind === 'CC' ? effSx(ccDims(section), 275, 210000).Ie : sp.Ix
  return 5 * w * spec.baySpacing ** 4 / (384 * 210000e3 * I * 1e-12)
}
